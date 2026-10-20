import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { checkFoundationBaseline } from "../roblox-game-workflow-control/scripts/runtime/baseline.mjs";
import { initializeProjectDocs } from "../roblox-development-workflow/scripts/runtime/project-artifacts.mjs";
import { writeTestPng } from "./decomposition-fixture.mjs";
import { inProject } from "./helpers.mjs";

/** 为基础工程基线检查创建最小诊断上下文。 */
function context(repo) {
  const errors = [];
  const blockers = [];
  return { repo, errors, blockers, require: (condition, message) => { if (!condition) errors.push(message); } };
}

/** 为运行时评估建立完整有效的人工冻结基线及本地文件证据。 */
function configureReadyBaseline(root) {
  initializeProjectDocs({ repo: root, projectId: "baseline-test", include: ["visual"] });
  mkdirSync(join(root, "evidence"), { recursive: true });
  const visualGeneratedAt = new Date(Date.now() - 5_000).toISOString();
  const visual = {
    version: 1, status: "ready",
    artBrief: {
      theme: "海岛探索", audience: "探索玩家", coreLoop: "探索与返回",
      viewingContext: "桌面端", readabilityGoal: "目标清晰", comfortConstraints: "避免频闪",
    },
    userMessageRef: "用户确认基线简报的消息",
    targets: ["HUD 与交互提示"], evidenceRefs: ["evidence/baseline-review.txt"],
    candidates: ["a", "b", "c"].map((id) => {
      const image = `evidence/${id}.png`;
      const generationRef = `evidence/${id}-generation.json`;
      writeTestPng(root, image);
      writeFileSync(join(root, generationRef), `${JSON.stringify({
        candidateId: id, image, tool: "test-generator", generatedAt: visualGeneratedAt,
      }, null, 2)}\n`);
      return { id, image, generationRef };
    }),
    selection: {
      mode: "manual", candidateId: "b", userMessageRef: "用户选择候选的消息",
      reviewedAt: new Date(Date.now() - 2_000).toISOString(),
      presentedCandidateIds: ["a", "b", "c"],
      qualityResults: Object.fromEntries(["themeFit", "audienceFit", "gameplayReadability", "viewingComfort", "artCompletion"]
        .map((dimension) => [dimension, { status: "PASS", reason: "人工评估通过", userMessageRef: "用户逐项评价消息" }])),
    },
    frozenAt: new Date(Date.now() - 1_000).toISOString(),
  };
  writeFileSync(join(root, "evidence/baseline-review.txt"), "候选审查记录\n");
  writeFileSync(join(root, "docs/visual-baseline.json"), `${JSON.stringify(visual, null, 2)}\n`);
}

test("纯工程基础包豁免全局视觉基线，视觉依赖基础包必须读取默认基线", () => inProject((root) => {
  const engineering = context(root);
  checkFoundationBaseline({
    type: "FOUNDATION", implementation: { visualDependency: false, units: [] },
    assetBindings: [{ resourceId: "audio-pack" }],
  }, engineering);
  assert.deepEqual(engineering.errors, []);
  assert.deepEqual(engineering.blockers, []);

  const visual = context(root);
  checkFoundationBaseline({
    type: "FOUNDATION", implementation: { visualDependency: true, units: [] }, assetBindings: [],
  }, visual);
  assert.ok(visual.errors.some((entry) => entry.includes("docs/visual-baseline.json")));
}));

test("非视觉资源绑定不触发基线，显式视觉依赖或合同引用会触发", () => inProject((root) => {
  const audioFoundation = context(root);
  checkFoundationBaseline({
    type: "FOUNDATION", implementation: { visualDependency: false, units: [] },
    assetBindings: [{ resourceId: "audio-pack" }],
  }, audioFoundation);
  assert.deepEqual(audioFoundation.errors, []);
  assert.deepEqual(audioFoundation.blockers, []);

  const generalProject = context(root);
  checkFoundationBaseline({
    type: "PROJECT", implementation: { visualDependency: false, units: [{ kind: "MODULE" }] },
    assetBindings: [{ resourceId: "shared-config" }],
  }, generalProject);
  assert.deepEqual(generalProject.errors, []);
  assert.deepEqual(generalProject.blockers, []);

  const explicitVisual = context(root);
  checkFoundationBaseline({
    type: "FOUNDATION", implementation: { visualDependency: true, units: [] }, assetBindings: [],
  }, explicitVisual);
  assert.ok(explicitVisual.errors.some((entry) => entry.includes("docs/visual-baseline.json")));

  const contractOnly = context(root);
  checkFoundationBaseline({
    type: "FOUNDATION", implementation: { visualDependency: false, units: [] }, assetBindings: [],
    visualContractRef: "evidence/visual-contract.json", baselineRef: "docs/missing-visual-baseline.json",
  }, contractOnly);
  assert.ok(contractOnly.errors.some((entry) => entry.includes("missing-visual-baseline.json")));

  configureReadyBaseline(root);
  const ready = context(root);
  checkFoundationBaseline({
    type: "FOUNDATION", implementation: { visualDependency: true, units: [] }, assetBindings: [],
  }, ready);
  assert.deepEqual(ready.errors, []);
  assert.deepEqual(ready.blockers, []);

  const misspelled = context(root);
  checkFoundationBaseline({
    type: "FOUNDATION", implementation: { visualDependency: "true", units: [] }, assetBindings: [],
  }, misspelled);
  assert.ok(misspelled.errors.some((entry) => entry.includes("visualDependency 必须为布尔值")));
}));

test("含场景单元的混合包不会因 MODULE 单元被误判为共享/模块包", () => inProject((root) => {
  for (const type of ["SCENE", "DISPLAY_LAYER", "INTEGRATION", "RELEASE"]) {
    const checked = context(root);
    checkFoundationBaseline({
      type, implementation: { visualDependency: true, units: [{ kind: "MODULE" }] }, assetBindings: [],
    }, checked);
    assert.deepEqual(checked.errors, [], type);
    assert.deepEqual(checked.blockers, [], type);
  }

  const mixedProject = context(root);
  checkFoundationBaseline({
    type: "PROJECT", implementation: { visualDependency: true, units: [{ kind: "MODULE" }, { kind: "SCENE" }] },
    assetBindings: [],
  }, mixedProject);
  assert.deepEqual(mixedProject.errors, []);
  assert.deepEqual(mixedProject.blockers, []);
}));
