import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { assess } from "../roblox-game-workflow-control/scripts/runtime/contract.mjs";
import { fixture, inProject } from "./helpers.mjs";

/** 为可见工作项建立真实路径齐全的覆盖记录；测试数据不连接 Studio。 */
function configureCoverage(root, item, cases, options = {}) {
  const contractPath = join(root, item.visualContractRef);
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  const viewports = options.viewports ?? contract.viewports;
  const inputs = options.inputs ?? [...new Set(cases.map((testCase) => testCase.input))];
  const locales = options.locales ?? [...new Set(cases.map((testCase) => testCase.locale))];
  contract.orientations = [...new Set(viewports.map((viewport) => viewport.orientation))];
  contract.viewports = viewports;
  contract.inputs = inputs;
  contract.locales = locales;
  if (options.validationMode !== undefined) contract.visualValidation = { mode: options.validationMode };
  contract.coverage = { revision: 1, userMessageRef: "test-fixture-only", cases };
  writeFileSync(contractPath, JSON.stringify(contract));

  const firstPlay = item.evidence.find((entry) => entry.type === "play");
  const visualEvidence = item.evidence.find((entry) => entry.type === "visual");
  const userMessageRef = "test-fixture-only";
  item.visualReview.evidenceId = visualEvidence.id;
  item.visualReview.userMessageRef = userMessageRef;
  for (const result of Object.values(item.visualReview.qualityResults)) result.userMessageRef = userMessageRef;
  const evidenceIds = new Map();
  for (const [index, testCase] of cases.entries()) {
    const evidenceId = index === 0 ? firstPlay.id : `play-${testCase.id}`;
    const viewport = viewports.find((value) => value.id === testCase.viewportId);
    const play = index === 0 ? firstPlay : {
      ...firstPlay, id: evidenceId, checkId: undefined, path: `evidence/${evidenceId}.txt`,
    };
    play.datamodel = options.datamodel ?? "Client";
    play.coverage = {
      revision: 1, caseId: testCase.id, viewportId: testCase.viewportId,
      width: viewport.width, height: viewport.height, input: testCase.input,
      locale: testCase.locale, scenario: testCase.scenario,
    };
    if (index > 0) {
      writeFileSync(join(root, play.path), "测试夹具，不表示真实游戏运行结果。\n");
      item.evidence.push(play);
    }
    evidenceIds.set(testCase.id, evidenceId);
  }
  const required = new Set(options.requiredScenarios ?? [...new Set(cases.map((testCase) => testCase.scenario))]);
  item.visualReview.scenarios = ["normal-play", "repeated-feedback", "event-peak", "overlap-peak"].map((id) => {
    const matchingCase = cases.find((testCase) => testCase.scenario === id);
    const applies = required.has(id);
    const evidenceId = matchingCase ? evidenceIds.get(matchingCase.id) : undefined;
    return {
      id,
      required: applies,
      reason: "仅用于验证覆盖合同的本地夹具",
      technical: {
        result: applies && matchingCase ? "PASS" : applies ? "NOT_RUN" : "NOT_APPLICABLE",
        evidenceIds: applies && evidenceId ? [evidenceId] : [],
      },
      visual: {
        result: applies ? "PASS" : "NOT_APPLICABLE",
        evidenceIds: applies ? [visualEvidence.id] : [],
        userMessageRef: applies ? userMessageRef : "",
        reason: applies ? "仅用于验证人工结论契约的本地夹具" : "仅测试夹具声明不适用",
      },
    };
  });
  return { contractPath, contract, evidenceIds };
}

/** 构造默认桌面目标用例，供重复的否定场景测试复用。 */
function singleCase(root, options = {}) {
  const item = fixture(root, "SCENE");
  const result = configureCoverage(root, item, [
    { id: "desktop-normal", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
  ], options);
  return { item, ...result };
}

test("批准的单用例与非笛卡积多用例都能精确通过", () => inProject((root) => {
  const single = singleCase(root);
  assert.equal(assess(single.item, root).ready, true);

  const item = fixture(root, "SCENE");
  configureCoverage(root, item, [
    { id: "desktop-normal", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
    { id: "phone-feedback", viewportId: "phone", input: "touch", locale: "ja-JP", scenario: "repeated-feedback" },
  ], {
    viewports: [
      { id: "desktop", width: 1280, height: 720, orientation: "landscape" },
      { id: "phone", width: 390, height: 844, orientation: "portrait" },
    ],
    inputs: ["keyboard-mouse", "touch"], locales: ["zh-CN", "ja-JP"],
    requiredScenarios: ["normal-play", "repeated-feedback"],
  });
  assert.equal(assess(item, root).ready, true);
}));

test("每个声明方向都需要有效视口与用例，方向尺寸一致且允许正方形", () => inProject((root) => {
  const missingPortrait = singleCase(root);
  missingPortrait.contract.orientations = ["landscape", "portrait"];
  writeFileSync(missingPortrait.contractPath, JSON.stringify(missingPortrait.contract));
  assert.equal(assess(missingPortrait.item, root).ready, false);

  for (const viewport of [
    { id: "wide-as-portrait", width: 1280, height: 720, orientation: "portrait" },
    { id: "tall-as-landscape", width: 720, height: 1280, orientation: "landscape" },
  ]) {
    const item = fixture(root, "SCENE");
    configureCoverage(root, item, [
      { id: "normal", viewportId: viewport.id, input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
    ], { viewports: [viewport] });
    assert.equal(assess(item, root).ready, false, viewport.id);
  }

  for (const orientation of ["landscape", "portrait"]) {
    const item = fixture(root, "SCENE");
    configureCoverage(root, item, [
      { id: "square-normal", viewportId: "square", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
    ], { viewports: [{ id: "square", width: 800, height: 800, orientation }] });
    assert.equal(assess(item, root).ready, true, orientation);
  }
}));

test("缺少用例、泛用 Play 或显式未知用例不能通过", () => inProject((root) => {
  const missingContract = singleCase(root);
  delete missingContract.contract.coverage;
  writeFileSync(missingContract.contractPath, JSON.stringify(missingContract.contract));
  assert.equal(assess(missingContract.item, root).ready, false);

  const missing = singleCase(root);
  delete missing.item.evidence.find((entry) => entry.type === "play").coverage;
  assert.equal(assess(missing.item, root).ready, false);

  const genericItem = fixture(root, "SCENE");
  configureCoverage(root, genericItem, [
    { id: "desktop-normal", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
    { id: "desktop-feedback", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "repeated-feedback" },
  ], { requiredScenarios: ["normal-play", "repeated-feedback"] });
  genericItem.evidence = genericItem.evidence.filter((entry) => entry.id === "play" || entry.type !== "play");
  delete genericItem.evidence.find((entry) => entry.type === "play").coverage;
  genericItem.visualReview.scenarios.find((scenario) => scenario.id === "repeated-feedback").technical.evidenceIds = ["play"];
  assert.equal(assess(genericItem, root).ready, false);

  const unknown = singleCase(root);
  unknown.item.evidence.find((entry) => entry.type === "play").coverage.caseId = "unapproved-case";
  assert.equal(assess(unknown.item, root).ready, false);
}));

test("旧修订、视口尺寸或情景维度错误会使 Play 覆盖失效", () => inProject((root) => {
  for (const mutate of [
    (coverage) => { coverage.revision = 0; },
    (coverage) => { coverage.width = 390; },
    (coverage) => { coverage.viewportId = "phone"; },
    (coverage) => { coverage.input = "touch"; },
    (coverage) => { coverage.locale = "en-US"; },
    (coverage) => { coverage.scenario = "event-peak"; },
  ]) {
    const { item } = singleCase(root);
    mutate(item.evidence.find((entry) => entry.type === "play").coverage);
    assert.equal(assess(item, root).ready, false);
  }
  const stale = singleCase(root);
  stale.contract.coverage.revision = 2;
  writeFileSync(stale.contractPath, JSON.stringify(stale.contract));
  assert.equal(assess(stale.item, root).ready, false);
}));

test("Server 证据不能证明 Client 视口，单份 Play 不能复用于多个情景", () => inProject((root) => {
  const server = singleCase(root, { datamodel: "Server" });
  assert.equal(assess(server.item, root).ready, false);

  const item = fixture(root, "SCENE");
  configureCoverage(root, item, [
    { id: "desktop-normal", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
    { id: "desktop-feedback", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "repeated-feedback" },
  ], { requiredScenarios: ["normal-play", "repeated-feedback"] });
  item.visualReview.scenarios.find((scenario) => scenario.id === "repeated-feedback").technical.evidenceIds = ["play"];
  assert.equal(assess(item, root).ready, false);
}));

test("重复 case id、不适用情景用例或未覆盖的声明维度都会阻断", () => inProject((root) => {
  const duplicate = fixture(root, "SCENE");
  configureCoverage(root, duplicate, [
    { id: "desktop-normal", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
    { id: "desktop-other", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
  ]);
  const duplicateContract = JSON.parse(readFileSync(join(root, duplicate.visualContractRef), "utf8"));
  duplicateContract.coverage.cases[1].id = "desktop-normal";
  writeFileSync(join(root, duplicate.visualContractRef), JSON.stringify(duplicateContract));
  assert.equal(assess(duplicate, root).ready, false);

  const notApplicable = singleCase(root);
  notApplicable.contract.coverage.cases.push({ id: "event", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "event-peak" });
  writeFileSync(notApplicable.contractPath, JSON.stringify(notApplicable.contract));
  assert.equal(assess(notApplicable.item, root).ready, false);

  for (const dimension of ["viewport", "input", "locale"]) {
    const missingDimension = singleCase(root);
    if (dimension === "viewport") {
      missingDimension.contract.orientations.push("portrait");
      missingDimension.contract.viewports.push({ id: "phone", width: 390, height: 844, orientation: "portrait" });
    } else if (dimension === "input") missingDimension.contract.inputs.push("gamepad");
    else missingDimension.contract.locales.push("en-US");
    writeFileSync(missingDimension.contractPath, JSON.stringify(missingDimension.contract));
    assert.equal(assess(missingDimension.item, root).ready, dimension !== "viewport", `usability:${dimension}`);

    if (dimension !== "viewport") {
      const exact = singleCase(root, { validationMode: "exact" });
      if (dimension === "input") exact.contract.inputs.push("gamepad");
      else exact.contract.locales.push("en-US");
      writeFileSync(exact.contractPath, JSON.stringify(exact.contract));
      assert.equal(assess(exact.item, root).ready, false, `exact:${dimension}`);
    }
  }
}));

test("usability接受代表用例，exact 要求所有视口、输入、语言和情景组合", () => inProject((root) => {
  const usability = fixture(root, "SCENE");
  configureCoverage(root, usability, [
    { id: "desktop-normal", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
  ], {
    viewports: [
      { id: "desktop", width: 1280, height: 720, orientation: "landscape" },
      { id: "compact", width: 960, height: 540, orientation: "landscape" },
    ],
    inputs: ["keyboard-mouse", "gamepad"], locales: ["zh-CN", "en-US"],
  });
  assert.equal(assess(usability, root).ready, true);

  const exact = fixture(root, "SCENE");
  const viewports = [
    { id: "desktop", width: 1280, height: 720, orientation: "landscape" },
    { id: "compact", width: 960, height: 540, orientation: "landscape" },
  ];
  const inputs = ["keyboard-mouse", "gamepad"];
  const locales = ["zh-CN", "en-US"];
  const cases = [];
  for (const viewport of viewports) for (const input of inputs) for (const locale of locales) {
    cases.push({
      id: `${viewport.id}-${input}-${locale}`, viewportId: viewport.id, input, locale, scenario: "normal-play",
    });
  }
  configureCoverage(root, exact, cases, { viewports, inputs, locales, validationMode: "exact" });
  assert.equal(assess(exact, root).ready, true);

  const partial = fixture(root, "SCENE");
  configureCoverage(root, partial, cases.slice(0, -1), { viewports, inputs, locales, validationMode: "exact" });
  assert.equal(assess(partial, root).ready, false);
}));
