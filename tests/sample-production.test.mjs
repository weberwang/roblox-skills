import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixture, inProject } from "./helpers.mjs";
import { createSampleFixture } from "./sample-fixture.mjs";
import { stageStatus, completeCurrentStage, advanceStage } from "../roblox-game-workflow-control/scripts/runtime/stage-operations.mjs";
import { createStageReview } from "../roblox-game-workflow-control/scripts/runtime/stages.mjs";

/** 从完整记录收窄到活动 V4，保留同一个真实检查入口所需的 V2 及证据。 */
function sampleItem(root) {
  const item = fixture(root, "SCENE");
  item.stageReviews = item.stageReviews.slice(0, 5);
  item.stage = "V4";
  const review = item.stageReviews.at(-1);
  review.status = "active";
  review.completedAt = null;
  return { item, review, sample: review.production.sampleAttempts[0] };
}

/** 为扩批设置晚于样板接受的实际时间，测试只声明记录而不执行生产。 */
function expansion(sample, offset = 10) {
  return { kind: "scene-assembly", scope: "仅本地记录测试：岸墙重复段", sampleId: sample.id,
    revision: sample.revision, candidate: sample.candidate,
    startedAt: new Date(Date.parse(sample.acceptance.reviewedAt) + offset).toISOString() };
}

/** 恢复尚未显示检查的声明，不把已有截图或技术结果自动视为接受。 */
function pending(sample) {
  Object.assign(sample.acceptance, { result: "NOT_RUN", evidenceIds: [], userMessageRef: "", reviewedAt: "" });
}

test("V4 模板仅创建生产空槽，缺样板不能退出但可继续修正", () => inProject((root) => {
  const { item, review } = sampleItem(root);
  assert.deepEqual(createStageReview(item, "V4").production, { sampleAttempts: [], expansions: [] });
  review.production.sampleAttempts = [];
  assert.equal(stageStatus(item, root).valid, true);
  review.status = "complete";
  review.completedAt = "2026-10-16T00:00:09Z";
  assert.match(stageStatus(item, root).errors.join(" "), /当前代表性样板显示接受/);
  delete review.production;
  assert.match(stageStatus(item, root).errors.join(" "), /production.sampleAttempts/);
}));

test("未接受样板可修复，生成成功、技术 PASS 和 ready 都不能授权扩批", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  const batch = expansion(sample);
  pending(sample);
  item.resourceStatus = "ready";
  review.deliverables.forEach((entry) => { entry.summary = "生成成功、三角预算达标、加载 PASS"; });
  assert.equal(stageStatus(item, root).valid, true);
  review.production.expansions.push(batch);
  assert.match(stageStatus(item, root).errors.join(" "), /不得批量场景装配或全场铺设/);
  review.production.expansions[0].kind = "full-scene-layout";
  assert.equal(stageStatus(item, root).valid, false);
}));

test("当前组合样板接受后允许扩展，并能通过相同完成接口完成 V4", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  review.production.expansions.push(expansion(sample));
  assert.equal(stageStatus(item, root).valid, true);
  const fields = ["path", "section", "deliverables", "exitChecks", "presentedRef", "remainingIssues", "nextAction", "reuse", "evidenceIds", "userMessageRef", "production"];
  const delivery = Object.fromEntries(fields.map((key) => [key, structuredClone(review[key])]));
  const completed = completeCurrentStage(item, root, delivery, { now: "2026-10-16T00:00:09Z", validateExit: () => true });
  assert.equal(completed.stageReviews.at(-1).status, "complete");
}));

test("旧候选、旧截图、错误机位和全局方向批准不能充当当前样板接受", () => {
  const mutations = [
    [({ item }) => { item.candidate = "candidate-next"; }, /当前 candidate/],
    [({ sample }) => { sample.acceptance.candidate = "candidate-old"; }, /精确绑定/],
    [({ item, sample }) => { item.evidence.find((entry) => entry.id === sample.evidenceIds[0]).candidate = "candidate-old"; }, /旧截图/],
    [({ item, sample }) => { item.evidence.find((entry) => entry.id === sample.evidenceIds[0]).observedAt = "2026-10-15T00:00:00Z"; }, /不能早于本轮/],
    [({ sample }) => { sample.acceptance.viewId = "wrong-view"; }, /精确绑定/],
    [({ sample }) => { sample.acceptance.scope = "global-direction"; }, /精确绑定/],
    [({ item, sample }) => { item.stageReviews[1].userMessageRef = "global-approved"; sample.acceptance.userMessageRef = "global-approved"; }, /方向批准/],
    [({ sample }) => { sample.acceptance.evidenceIds = ["readback"]; }, /技术 PASS 或 ready/],
  ];
  for (const [mutate, error] of mutations) inProject((root) => {
    const context = sampleItem(root);
    mutate(context);
    assert.match(stageStatus(context.item, root).errors.join(" "), error);
  });
});

test("样板七项组合检查未完成时不能接受，孤立组件不能漏掉 V2 计划", () => inProject((root) => {
  const { item, sample } = sampleItem(root);
  sample.checks.find((check) => check.id === "seams").result = "NOT_RUN";
  assert.match(stageStatus(item, root).errors.join(" "), /全部组合显示检查/);
  sample.componentIds = [];
  assert.match(stageStatus(item, root).errors.join(" "), /代表性组合组件/);
}));

test("修复追加真实新轮次和新证据后恢复生产，旧 FAIL 和原授权均保留", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  sample.acceptance.result = "FAIL";
  sample.checks[0].result = "FAIL";
  item.operations = [{ kind: "upload", userMessageRef: "test-existing-upload-authorization" }];
  const original = JSON.stringify(sample);
  const operations = JSON.stringify(item.operations);
  const repaired = createSampleFixture(root, item, review, { revision: 2, start: "2026-10-16T00:00:08.100Z" });
  review.production.sampleAttempts.push(repaired);
  review.production.expansions.push(expansion(repaired));
  const status = stageStatus(item, root);
  assert.equal(status.valid, true, status.errors.join(" "));
  assert.equal(JSON.stringify(sample), original);
  assert.equal(JSON.stringify(item.operations), operations);
  repaired.acceptance.userMessageRef = sample.acceptance.userMessageRef;
  assert.match(stageStatus(item, root).errors.join(" "), /旧确认/);
}));

test("修复不能复用旧截图路径，亦不能倒填接受追认提前扩批", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  const repaired = createSampleFixture(root, item, review, { revision: 2, start: "2026-10-16T00:00:08.100Z" });
  review.production.sampleAttempts.push(repaired);
  const oldEvidence = item.evidence.find((entry) => entry.id === sample.evidenceIds[0]);
  const newEvidence = item.evidence.find((entry) => entry.id === repaired.evidenceIds[0]);
  const newPath = newEvidence.path;
  newEvidence.path = oldEvidence.path;
  assert.match(stageStatus(item, root).errors.join(" "), /不得复用旧截图路径/);
  newEvidence.path = newPath;
  review.production.expansions.push({ ...expansion(repaired), startedAt: repaired.createdAt });
  assert.match(stageStatus(item, root).errors.join(" "), /不得批量场景装配或全场铺设/);
}));

test("新一轮样板未接受时不得继续依赖上一轮已接受结论扩批", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  const repaired = createSampleFixture(root, item, review, { revision: 2, start: "2026-10-16T00:00:08.100Z" });
  pending(repaired);
  review.production.sampleAttempts.push(repaired);
  review.production.expansions.push({ ...expansion(sample), startedAt: "2026-10-16T00:00:08.200Z" });
  assert.match(stageStatus(item, root).errors.join(" "), /不得批量场景装配或全场铺设/);
}));

test("明确授权自动检查与人工确认分开，范围不符或冒充人工均拒绝", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  const finalBefore = JSON.stringify(item.visualReview);
  const identity = { scope: "sample", sampleId: sample.id, candidate: sample.candidate, revision: sample.revision, viewId: sample.viewId };
  sample.acceptance.mode = "automatic";
  sample.acceptance.userMessageRef = "";
  sample.acceptance.authorization = { ...identity, userMessageRef: "test-explicit-auto-sample-check" };
  review.production.expansions.push(expansion(sample));
  assert.equal(stageStatus(item, root).valid, true);
  assert.equal(JSON.stringify(item.visualReview), finalBefore, "样板自动结果不能改写最终人工验收");
  sample.acceptance.authorization.revision = 0;
  assert.match(stageStatus(item, root).errors.join(" "), /精确范围/);
  sample.acceptance.authorization.revision = sample.revision;
  sample.acceptance.userMessageRef = "test-pretend-manual-confirmation";
  assert.match(stageStatus(item, root).errors.join(" "), /不能冒充人工确认/);
}));

test("方向批准也不能被包装为自动视觉授权", () => inProject((root) => {
  const { item, sample } = sampleItem(root);
  item.stageReviews[1].userMessageRef = "test-global-direction-only";
  Object.assign(sample.acceptance, { mode: "automatic", userMessageRef: "",
    authorization: { scope: "sample", sampleId: sample.id, candidate: sample.candidate, revision: sample.revision,
      viewId: sample.viewId, userMessageRef: "test-global-direction-only" } });
  assert.match(stageStatus(item, root).errors.join(" "), /精确范围/);
}));

test("V2 两次确认及 V3 资源接受不能冒充 V4 样板判断或自动授权", () => inProject((root) => {
  const { item, sample } = sampleItem(root);
  const v2 = item.stageReviews.find((entry) => entry.stage === "V2");
  const contract = JSON.parse(readFileSync(join(root, v2.decompositionRef), "utf8"));
  const references = [contract.decompositionConfirmation.userMessageRef, contract.layoutConfirmation.userMessageRef,
    item.stageReviews.find((entry) => entry.stage === "V3").resourceAcceptance.userMessageRef];
  const original = structuredClone(sample.acceptance);
  for (const reference of references) {
    sample.acceptance = { ...original, userMessageRef: reference };
    assert.equal(stageStatus(item, root).valid, false, reference);
    sample.acceptance = { ...original, mode: "automatic", userMessageRef: "", authorization: {
      scope: "sample", sampleId: sample.id, candidate: sample.candidate, revision: sample.revision,
      viewId: sample.viewId, userMessageRef: reference,
    } };
    assert.equal(stageStatus(item, root).valid, false, reference);
  }
}));

test("既有自动视觉授权可覆盖多轮，但各轮必须有自己的新检查证据和结论", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  const repaired = createSampleFixture(root, item, review, { revision: 2, start: "2026-10-16T00:00:08.100Z" });
  review.production.sampleAttempts.push(repaired);
  for (const entry of [sample, repaired]) {
    Object.assign(entry.acceptance, { mode: "automatic", userMessageRef: "", authorization: {
      scope: "sample", sampleId: entry.id, candidate: entry.candidate, revision: entry.revision,
      viewId: entry.viewId, userMessageRef: "test-existing-authorization-covering-both-samples" } });
  }
  review.production.expansions.push(expansion(repaired));
  assert.equal(stageStatus(item, root).valid, true);
  repaired.acceptance.evidenceIds = [...sample.evidenceIds];
  assert.match(stageStatus(item, root).errors.join(" "), /本轮组合 visual 证据/);
}));

test("自动检查授权不能反向冒充新一轮人工接受", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  const authorizationRef = "test-permission-only-not-human-acceptance";
  Object.assign(sample.acceptance, { mode: "automatic", userMessageRef: "", authorization: {
    scope: "sample", sampleId: sample.id, candidate: sample.candidate, revision: sample.revision,
    viewId: sample.viewId, userMessageRef: authorizationRef } });
  const repaired = createSampleFixture(root, item, review, { revision: 2, start: "2026-10-16T00:00:08.100Z" });
  repaired.acceptance.userMessageRef = authorizationRef;
  review.production.sampleAttempts.push(repaired);
  assert.match(stageStatus(item, root).errors.join(" "), /或自动授权/);
}));

test("完成 API 拒绝删除或改写旧样板结论与扩展历史", () => inProject((root) => {
  const { item, review, sample } = sampleItem(root);
  review.production.expansions.push(expansion(sample));
  const copy = structuredClone(review.production);
  copy.sampleAttempts = [];
  assert.throws(() => completeCurrentStage(item, root, { production: copy }), /不得删除或改写样板历史/);
  const modified = structuredClone(review.production);
  modified.sampleAttempts[0].acceptance.userMessageRef = "rewritten-history";
  assert.throws(() => completeCurrentStage(item, root, { production: modified }), /不得删除或改写样板历史/);
  const removed = structuredClone(review.production);
  removed.expansions = [];
  assert.throws(() => completeCurrentStage(item, root, { production: removed }), /不得删除或改写已有扩展历史/);
  sample.acceptance.result = "FAIL";
  review.production.expansions = [];
  const repaired = createSampleFixture(root, item, review, { revision: 2, start: "2026-10-16T00:00:08.100Z" });
  const droppedFailure = { sampleAttempts: [repaired], expansions: [] };
  assert.throws(() => completeCurrentStage(item, root, { production: droppedFailure }), /不得删除或改写样板历史/);
}));
