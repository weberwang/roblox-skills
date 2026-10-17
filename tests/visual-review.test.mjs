import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createVisualReview, checkVisualDelivery } from "../roblox-game-workflow-control/scripts/runtime/visual-review.mjs";
import { inProject } from "./helpers.mjs";

const qualityDimensions = ["themeFit", "audienceFit", "gameplayReadability", "viewingComfort", "artCompletion"];
const scenarioIds = ["normal-play", "repeated-feedback", "event-peak", "overlap-peak"];

/** 生成最小可见对象合同和当前候选证据，直接测试视觉校验器而不启动 Studio。 */
function makeVisibleCandidate(root, { viewports = [{ id: "desktop", width: 1280, height: 720, orientation: "landscape" }] } = {}) {
  const candidate = "candidate-1";
  const item = {
    id: "visible-test", type: "SCENE", candidate, visualContractRef: "visual-contract.json",
    evidence: [], visualReview: createVisualReview(candidate),
  };
  const cases = viewports.map((viewport, index) => ({
    id: `normal-${viewport.id}`, viewportId: viewport.id,
    input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play",
  }));
  const contract = {
    version: 1, workItemId: item.id,
    orientations: [...new Set(viewports.map((viewport) => viewport.orientation))],
    inputs: ["keyboard-mouse"], locales: ["zh-CN"], safeAreaPolicy: "按设备安全区留白",
    viewports,
    nodes: [{ id: "root", path: "game.StarterGui.Hud", parentId: null, role: "hud", layoutRef: "layout/Hud" }],
    coverage: { revision: 1, userMessageRef: "user-message:coverage", cases },
  };
  writeFileSync(join(root, item.visualContractRef), JSON.stringify(contract));
  const playEntries = cases.map((testCase, index) => {
    const viewport = viewports[index];
    return {
      id: `play-${viewport.id}`, type: "play", candidate, result: "PASS", datamodel: "Client",
      coverage: {
        revision: 1, caseId: testCase.id, viewportId: viewport.id,
        width: viewport.width, height: viewport.height, input: testCase.input,
        locale: testCase.locale, scenario: testCase.scenario,
      },
    };
  });
  const entries = [
    { id: "readback", type: "readback", candidate, result: "PASS" },
    { id: "console", type: "console", candidate, result: "PASS" },
    ...playEntries,
    { id: "visual", type: "visual", candidate, result: "PASS" },
  ];
  item.evidence.push(...entries);
  const usable = new Map(entries.map((entry) => [entry.id, entry]));
  item.visualReview.scenarios = scenarioIds.map((id) => ({
    id, required: id === "normal-play", reason: id === "normal-play" ? "基础流程" : "本对象不涉及该情景",
    technical: {
      result: id === "normal-play" ? "PASS" : "NOT_APPLICABLE",
      evidenceIds: id === "normal-play" ? playEntries.map((entry) => entry.id) : [],
    },
    visual: {
      result: id === "normal-play" ? "NOT_RUN" : "NOT_APPLICABLE",
      evidenceIds: [], userMessageRef: "",
      reason: id === "normal-play" ? "等待当前候选人工检查" : "本对象不涉及该情景",
    },
  }));
  item.visualReview.qualityResults = Object.fromEntries(qualityDimensions.map((dimension) => [dimension, {
    status: "NOT_RUN", reason: "等待当前候选人工判断", userMessageRef: "",
  }]));
  return { item, usable, contractPath: join(root, item.visualContractRef), contract };
}

/** 将人工确认写成独立于技术 Play 的本地测试数据。 */
function acceptVisualReview(item) {
  item.visualReview.status = "accepted";
  item.visualReview.evidenceId = "visual";
  item.visualReview.userMessageRef = "user-message:overall-review";
  for (const dimension of qualityDimensions) {
    item.visualReview.qualityResults[dimension] = {
      status: "PASS", reason: `人工检查 ${dimension}`, userMessageRef: `user-message:${dimension}`,
    };
  }
  const normal = item.visualReview.scenarios.find((scenario) => scenario.id === "normal-play");
  normal.visual = {
    result: "PASS", evidenceIds: ["visual"], userMessageRef: "user-message:normal-play",
    reason: "用户检查当前候选的正常游玩画面",
  };
}

/** 收集独立可见交付检查返回的结构错误与完成阻断。 */
function inspect(candidate, root) {
  const errors = [];
  const blockers = [];
  const context = {
    repo: root, errors, blockers,
    require: (condition, message) => { if (!condition) errors.push(message); },
  };
  checkVisualDelivery(candidate.item, candidate.usable, context);
  return { valid: errors.length === 0, ready: errors.length === 0 && blockers.length === 0, errors, blockers };
}

test("模板将技术和人工结论分开，并把未知情景保持待确认", () => {
  const review = createVisualReview("candidate-x");
  assert.equal(review.status, "pending");
  assert.equal(review.qualityResults.themeFit.status, "NOT_RUN");
  assert.equal(review.qualityResults.themeFit.userMessageRef, "");
  assert.equal(review.scenarios.find((scenario) => scenario.id === "normal-play").required, true);
  assert.equal(review.scenarios.find((scenario) => scenario.id === "repeated-feedback").required, null);
  for (const scenario of review.scenarios) {
    assert.equal(scenario.technical.result, "NOT_RUN");
    assert.equal(scenario.visual.result, "NOT_RUN");
    assert.deepEqual(scenario.technical.evidenceIds, []);
    assert.deepEqual(scenario.visual.evidenceIds, []);
  }
});

test("两种视口的技术 Play PASS 不会自动生成视觉 PASS", () => inProject((root) => {
  const candidate = makeVisibleCandidate(root, { viewports: [
    { id: "desktop", width: 1280, height: 720, orientation: "landscape" },
    { id: "phone", width: 390, height: 844, orientation: "portrait" },
  ] });
  candidate.item.visualReview.scenarios.find((scenario) => scenario.id === "normal-play").technical.evidenceIds = ["play-desktop", "play-phone"];
  const result = inspect(candidate, root);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.ready, false);
  assert.equal(candidate.item.visualReview.scenarios.find((scenario) => scenario.id === "normal-play").visual.result, "NOT_RUN");
  assert.ok(result.blockers.some((blocker) => blocker.includes("人工视觉判断")));
}));

test("视觉 PASS 必须引用当前视觉证据和该情景的真实用户判断", () => inProject((root) => {
  const candidate = makeVisibleCandidate(root);
  acceptVisualReview(candidate.item);
  assert.equal(inspect(candidate, root).ready, true);

  const borrowedPlay = makeVisibleCandidate(root);
  acceptVisualReview(borrowedPlay.item);
  borrowedPlay.item.visualReview.scenarios.find((scenario) => scenario.id === "normal-play").visual.evidenceIds = ["play-desktop"];
  assert.equal(inspect(borrowedPlay, root).valid, false);

  const missingMessage = makeVisibleCandidate(root);
  acceptVisualReview(missingMessage.item);
  missingMessage.item.visualReview.scenarios.find((scenario) => scenario.id === "normal-play").visual.userMessageRef = "";
  assert.equal(inspect(missingMessage, root).valid, false);

  const missingVisual = makeVisibleCandidate(root);
  acceptVisualReview(missingVisual.item);
  missingVisual.usable.delete("visual");
  const result = inspect(missingVisual, root);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("当前可用视觉证据")));
}));

test("旧的混合 result/evidenceIds 字段被拒绝，且不改写失败历史", () => inProject((root) => {
  const candidate = makeVisibleCandidate(root);
  const normal = candidate.item.visualReview.scenarios.find((scenario) => scenario.id === "normal-play");
  normal.technical.result = "FAIL";
  normal.technical.evidenceIds = ["play-desktop"];
  const failedPlay = candidate.item.evidence.find((entry) => entry.id === "play-desktop");
  failedPlay.result = "FAIL";
  candidate.usable.delete(failedPlay.id);
  normal.result = "PASS";
  normal.evidenceIds = ["play-desktop"];
  const result = inspect(candidate, root);
  assert.equal(result.valid, false);
  assert.equal(normal.technical.result, "FAIL");
  assert.ok(result.errors.some((error) => error.includes("混合字段")));
}));

test("无关目标文案变更不会使仍有效的人工确认失效", () => inProject((root) => {
  const candidate = makeVisibleCandidate(root);
  acceptVisualReview(candidate.item);
  const before = inspect(candidate, root);
  candidate.item.objective = "只更新了非视觉目标的说明文字";
  const after = inspect(candidate, root);
  assert.equal(before.ready, true);
  assert.deepEqual(after, before);
}));
