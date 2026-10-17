import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { inProject } from "./helpers.mjs";
import { advanceStage, completeCurrentStage, stageStatus } from "../roblox-game-workflow-control/scripts/runtime/stage-operations.mjs";
import { createStageReview, STAGE_DELIVERABLES, STAGES } from "../roblox-game-workflow-control/scripts/runtime/stages.mjs";
import { createDecompositionFixture } from "./decomposition-fixture.mjs";

const origin = Date.now() - 120_000;
/** 将固定偏移转换为测试用 ISO 时间，避免依赖执行时的耗时。 */
const stamp = (offset = 0) => new Date(origin + offset).toISOString();
const sectionTitles = Object.fromEntries(STAGES.map((stage) => [stage, `${stage} deliverable`]));

/** 构造只含阶段契约字段的可见工作项，不调用 Studio 或改变游戏项目。 */
function stageItem() {
  const item = {
    id: "scene-test", type: "SCENE", stage: "V0", stagePolicy: "deliverables", candidate: "candidate-1",
    target: { studioId: "studio-test", placeId: 0, universeId: 0 }, evidence: [], stageReviews: [],
  };
  item.stageReviews.push(createStageReview(item, "V0", stamp()));
  return item;
}

/** 写入每阶段独立标题，允许同一 Markdown 文件承载多阶段实际交付。 */
function writeStageDocument(root) {
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(join(root, "evidence", "stages.md"), STAGES.map((stage) => `## ${sectionTitles[stage]}\n\n${stage} 的实际交付正文。`).join("\n\n"));
  writeFileSync(join(root, "evidence", "readback.txt"), "Edit readback fixture\n");
  return "evidence/stages.md";
}

/** 生成具备逐项交付和退出依据的阶段完成记录，时间由测试夹具明确提供。 */
function completeRecord(item, stage, startOffset, endOffset, path, { root, candidate = item.candidate, userMessageRef = "", evidenceIds = [] } = {}) {
  const review = createStageReview(item, stage, stamp(startOffset));
  const record = {
    ...review,
    candidate,
    status: "complete",
    completedAt: stamp(endOffset),
    path,
    section: sectionTitles[stage],
    deliverables: STAGE_DELIVERABLES[stage].map((id) => ({ id, summary: `${id} 已实际交付。` })),
    exitChecks: STAGE_DELIVERABLES[stage].map((id) => ({ id, result: "PASS", basis: `已核对 ${id} 交付。` })),
    presentedRef: `测试展示 ${stage}`,
    remainingIssues: [],
    nextAction: stage === "V4" ? "回到工作项结算" : `开始 ${STAGES[STAGES.indexOf(stage) + 1]}`,
    reuse: [],
    evidenceIds,
    userMessageRef,
  };
  if (stage === "V2") record.decompositionRef = createDecompositionFixture(root, item, record).path;
  return record;
}

/** 将V3所需Edit证据绑定到当前工作项目标和候选。 */
function addReadback(item, observedOffset = 20_000) {
  const target = item.target ?? {};
  item.evidence.push({ id: "readback-v3", type: "readback", workItemId: item.id, candidate: item.candidate,
    result: "PASS", summary: "Edit 正式源回读", observedAt: stamp(observedOffset), path: "evidence/readback.txt",
    datamodel: "Edit", studioId: target.studioId, placeId: target.placeId, universeId: target.universeId });
}

/** 构造待完成V3和其阶段交付输入，便于单独攻击readback身份校验。 */
function v3Fixture(root) {
  const path = writeStageDocument(root);
  const item = stageItem();
  completedPrefix(item, 3, path, { root });
  item.stage = "V3";
  item.stageReviews.push(createStageReview(item, "V3", stamp(7_000)));
  const delivery = {
    path, section: sectionTitles.V3,
    deliverables: STAGE_DELIVERABLES.V3.map((id) => ({ id, summary: `${id} 已交付。` })),
    exitChecks: STAGE_DELIVERABLES.V3.map((id) => ({ id, result: "PASS", basis: `${id} 已核对。` })),
    presentedRef: "V3 实际展示", remainingIssues: [], nextAction: "进入 V4", reuse: [], evidenceIds: ["readback-v3"],
  };
  return { item, delivery };
}

/** 直接完成指定前缀，供顺序和候选保留场景使用。 */
function completedPrefix(item, count, path, { manual = false, root } = {}) {
  item.stageReviews = [];
  for (const [index, stage] of STAGES.slice(0, count).entries()) {
    const record = completeRecord(item, stage, index * 2_000, index * 2_000 + 1_000,
      path, { root, userMessageRef: manual ? `user-confirmed-${stage}` : "" });
    item.stageReviews.push(record);
    item.stage = stage;
  }
}

test("新阶段记录从V0开始并带实际active槽位", () => {
  const item = stageItem();
  assert.equal(item.stage, "V0");
  assert.equal(item.stageReviews.length, 1);
  assert.equal(item.stageReviews[0].status, "active");
  assert.equal(item.stageReviews[0].startedAt, stamp());
  assert.deepEqual(item.stageReviews[0].deliverables.map((entry) => entry.id), STAGE_DELIVERABLES.V0);
});

test("没有连续前置阶段时拒绝V1和旧式批量登记", () => inProject((root) => {
  const path = writeStageDocument(root);
  const item = stageItem();
  item.stage = "V1";
  item.stageReviews = [completeRecord(item, "V1", 0, 1, path)];
  const status = stageStatus(item, root);
  assert.equal(status.valid, false);
  assert.match(status.errors.join(" "), /连续排列/);

  item.stage = "V0";
  item.stageReviews = [{ stage: "V0", path }];
  assert.equal(stageStatus(item, root).valid, false);
}));

test("同一文档的不同唯一标题可承载不同阶段交付", () => inProject((root) => {
  const path = writeStageDocument(root);
  const item = stageItem();
  item.stageReviews = [completeRecord(item, "V0", 0, 1, path), completeRecord(item, "V1", 2, 3, path)];
  item.stage = "V1";
  const status = stageStatus(item, root);
  assert.equal(status.valid, true, status.errors.join("; "));
  assert.equal(status.canAdvance, true);

  item.stageReviews[1].section = sectionTitles.V0;
  assert.match(stageStatus(item, root).errors.join(" "), /不能复用相同 path\+section/);
}));

test("deliverables可连续逐阶段完成和推进且不需要用户批准", () => inProject((root) => {
  const path = writeStageDocument(root);
  const item = stageItem();
  let current = item;
  let clock = 0;
  for (const stage of STAGES) {
    const delivery = {
      path, section: sectionTitles[stage],
      deliverables: STAGE_DELIVERABLES[stage].map((id) => ({ id, summary: `${id} 的本阶段交付。` })),
      exitChecks: STAGE_DELIVERABLES[stage].map((id) => ({ id, result: "PASS", basis: `${id} 已核对。` })),
      presentedRef: `展示记录 ${stage}`, remainingIssues: [], nextAction: stage === "V4" ? "结算" : "继续下一阶段",
      reuse: [], evidenceIds: [],
    };
    if (stage === "V2") delivery.decompositionRef = createDecompositionFixture(root, current, current.stageReviews.at(-1)).path;
    if (stage === "V3") {
      addReadback(current, clock + 250);
      delivery.evidenceIds = ["readback-v3"];
    }
    if (stage === "V4") assert.throws(() => completeCurrentStage(current, root, delivery), /validateExit/);
    current = completeCurrentStage(current, root, delivery, {
      now: stamp(clock + 500),
      ...(stage === "V4" ? { validateExit: () => ({ valid: true }) } : {}),
    });
    assert.equal(current.stageReviews.at(-1).status, "complete");
    if (stage !== "V4") {
      current = advanceStage(current, root, { now: stamp(clock + 1_000) });
      assert.equal(current.stage, STAGES[STAGES.indexOf(stage) + 1]);
      assert.equal(current.stageReviews.at(-1).status, "active");
    }
    clock += 2_000;
  }
  assert.equal(current.state, undefined, "阶段完成不能自动改变工作项 state");
  assert.equal(current.stage, "V4");
  assert.equal(stageStatus(current, root).canAdvance, false);
  assert.throws(() => advanceStage(current, root), /V4/);
}));

test("manual策略没有真实用户引用时不能完成", () => inProject((root) => {
  const path = writeStageDocument(root);
  const item = stageItem();
  item.stagePolicy = "manual";
  const delivery = {
    path, section: sectionTitles.V0,
    deliverables: STAGE_DELIVERABLES.V0.map((id) => ({ id, summary: `${id} 已交付。` })),
    exitChecks: STAGE_DELIVERABLES.V0.map((id) => ({ id, result: "PASS", basis: `${id} 已核对。` })),
    presentedRef: "V0 实际展示", remainingIssues: [], nextAction: "进入 V1", reuse: [], evidenceIds: [], userMessageRef: "",
  };
  assert.throws(() => completeCurrentStage(item, root, delivery, { now: stamp(500) }), /真实用户确认/);
  assert.equal(item.stageReviews[0].status, "active", "失败不能改写原工作项");
}));

test("只有V2接受decompositionRef，其他阶段不能夹带该字段", () => inProject((root) => {
  const item = stageItem();
  assert.throws(() => completeCurrentStage(item, root, { decompositionRef: "fixtures/decomposition.json" }), /只有 V2 阶段/);
  assert.equal(item.stageReviews[0].status, "active");
}));

test("缺失或拼错stagePolicy会阻断阶段检查和推进", () => inProject((root) => {
  const item = stageItem();
  for (const policy of [undefined, "manaul"]) {
    if (policy === undefined) delete item.stagePolicy;
    else item.stagePolicy = policy;
    const status = stageStatus(item, root);
    assert.equal(status.valid, false);
    assert.match(status.errors.join(" "), /stagePolicy/);
    assert.throws(() => advanceStage(item, root), /无效/);
  }
}));

test("阶段操作拒绝伪带stageReviews的非可见工作项", () => inProject((root) => {
  const item = { id: "fake-project", type: "PROJECT", stage: "V0", stageReviews: [{ stage: "V0", status: "complete" }] };
  const status = stageStatus(item, root);
  assert.equal(status.valid, false);
  assert.equal(status.canAdvance, false);
  assert.match(status.errors.join(" "), /只适用于 SCENE 或 DISPLAY_LAYER/);
  assert.throws(() => advanceStage(item, root), /只适用于/);
  assert.throws(() => completeCurrentStage(item, root, {}), /只适用于/);
}));

test("V3没有当前候选Edit readback时不能完成", () => inProject((root) => {
  const path = writeStageDocument(root);
  const item = stageItem();
  completedPrefix(item, 3, path, { root });
  item.stage = "V3";
  item.stageReviews.push(createStageReview(item, "V3", stamp(7_000)));
  const delivery = {
    path, section: sectionTitles.V3,
    deliverables: STAGE_DELIVERABLES.V3.map((id) => ({ id, summary: `${id} 已交付。` })),
    exitChecks: STAGE_DELIVERABLES.V3.map((id) => ({ id, result: "PASS", basis: `${id} 已核对。` })),
    presentedRef: "V3 实际展示", remainingIssues: [], nextAction: "进入 V4", reuse: [], evidenceIds: [],
  };
  assert.throws(() => completeCurrentStage(item, root, delivery, { now: stamp(7_500) }), /Edit readback/);
}));

test("V3不能用undefined或null身份字段的readback绕过目标校验", () => inProject((root) => {
  const invalidTargets = [
    undefined,
    { studioId: "studio-test", placeId: null, universeId: null },
    { studioId: undefined, placeId: undefined, universeId: undefined },
  ];
  for (const target of invalidTargets) {
    const { item, delivery } = v3Fixture(root);
    item.target = target;
    addReadback(item, 7_250);
    assert.throws(() => completeCurrentStage(item, root, delivery, { now: stamp(7_500) }), /Studio 与有效 Place\/Universe/);
  }
}));

test("V3 readback复用证据校验拒绝畸形summary、时间和checkId", () => inProject((root) => {
  const { item, delivery } = v3Fixture(root);
  item.implementation = { verification: [{ id: "edit-readback", evidenceType: "readback" }] };
  addReadback(item, 7_250);
  Object.assign(item.evidence[0], { summary: "", observedAt: "not-an-iso-time", checkId: "missing-check" });
  assert.throws(() => completeCurrentStage(item, root, delivery, { now: stamp(7_500) }), /V3 Edit readback/);
}));

test("V3 readback拒绝晚于当前时刻的采集时间", () => inProject((root) => {
  const { item, delivery } = v3Fixture(root);
  item.implementation = { verification: [{ id: "edit-readback", evidenceType: "readback" }] };
  addReadback(item, 7_250);
  item.evidence[0].checkId = "edit-readback";
  item.evidence[0].observedAt = new Date(Date.now() + 60_000).toISOString();
  assert.throws(() => completeCurrentStage(item, root, delivery, { now: stamp(7_500) }), /不能晚于当前时间/);
}));

test("未来开始时间和倒序阶段时间无效", () => inProject((root) => {
  const path = writeStageDocument(root);
  const item = stageItem();
  item.stageReviews[0].startedAt = new Date(Date.now() + 60_000).toISOString();
  assert.match(stageStatus(item, root).errors.join(" "), /不能晚于当前时间/);

  completedPrefix(item, 2, path);
  item.stageReviews[1].startedAt = stamp(0);
  item.stageReviews[1].completedAt = stamp(500);
  assert.match(stageStatus(item, root).errors.join(" "), /早于前一阶段完成时间/);
}));

test("候选变化不撤销V0–V2阶段确认", () => inProject((root) => {
  const path = writeStageDocument(root);
  const item = stageItem();
  item.stagePolicy = "manual";
  completedPrefix(item, 1, path, { manual: true });
  item.candidate = "candidate-2";
  const status = stageStatus(item, root);
  assert.equal(status.valid, true, status.errors.join("; "));
  assert.equal(item.stageReviews[0].candidate, "candidate-1");
}));

test("完成复验追加旧失败记录而不覆盖", () => inProject((root) => {
  const path = writeStageDocument(root);
  const item = stageItem();
  const review = item.stageReviews[0];
  review.exitChecks[0] = { id: STAGE_DELIVERABLES.V0[0], result: "FAIL", basis: "初次核对发现字段缺失。" };
  const delivery = {
    path, section: sectionTitles.V0,
    deliverables: STAGE_DELIVERABLES.V0.map((id) => ({ id, summary: `${id} 已修复并交付。` })),
    exitChecks: STAGE_DELIVERABLES.V0.map((id) => ({ id, result: "PASS", basis: `${id} 复验通过。` })),
    presentedRef: "V0 复验展示", remainingIssues: [], nextAction: "进入 V1", reuse: [], evidenceIds: [],
  };
  const completed = completeCurrentStage(item, root, delivery, { now: stamp(500) });
  assert.deepEqual(completed.stageReviews[0].exitCheckHistory, [{ id: STAGE_DELIVERABLES.V0[0], result: "FAIL", basis: "初次核对发现字段缺失。" }]);
  assert.equal(completed.stageReviews[0].exitChecks[0].result, "PASS");
  assert.equal(item.stageReviews[0].exitChecks[0].result, "FAIL");
}));
