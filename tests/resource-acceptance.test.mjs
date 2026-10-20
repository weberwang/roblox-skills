import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixture, inProject } from "./helpers.mjs";
import { completeCurrentStage, advanceStage, stageStatus } from "../roblox-game-workflow-control/scripts/runtime/stage-operations.mjs";

/** 将完整夹具恢复到资源验收阶段，测试不借用后续场景的装配证明。 */
function resourceItem(root) {
  const item = fixture(root, "SCENE");
  item.stage = "V3";
  item.stageReviews = item.stageReviews.slice(0, 4);
  const review = item.stageReviews.at(-1);
  review.status = "active";
  review.completedAt = null;
  item.evidence = item.evidence.filter((entry) => entry.resources);
  return { item, review, acceptance: review.resourceAcceptance };
}

/** 仅取实际交付字段，避免通过输入夹带阶段或伪造工具写入时间。 */
function deliveryOf(review) {
  return Object.fromEntries(["path", "section", "deliverables", "exitChecks", "presentedRef", "remainingIssues",
    "nextAction", "reuse", "evidenceIds", "userMessageRef", "resourceAcceptance"].map((key) => [key, structuredClone(review[key])]));
}

test("V3 接受资源后进入尚未装配的 V4，不要求提前提供 Edit 回读或样板", () => inProject((root) => {
  const { item, review } = resourceItem(root);
  const completed = completeCurrentStage(item, root, deliveryOf(review), { now: "2026-10-16T00:00:07Z" });
  const next = advanceStage(completed, root, { now: "2026-10-16T00:00:08Z" });
  assert.equal(next.stage, "V4");
  assert.deepEqual(next.stageReviews.at(-1).production, { sampleAttempts: [], expansions: [] });
  assert.equal(Object.hasOwn(review, "production"), false);
}));

test("deliverables 不能用 ready、技术 PASS 或 AUTO 绕过 V3 人工资源接受", () => {
  for (const mutate of [
    (acceptance) => { acceptance.result = "NOT_RUN"; acceptance.userMessageRef = ""; acceptance.evidenceIds = []; acceptance.reviewedAt = null; },
    (acceptance) => { acceptance.mode = "automatic"; },
    (acceptance) => { acceptance.result = "FAIL"; },
    (acceptance) => { acceptance.userMessageRef = ""; },
  ]) inProject((root) => {
    const { item, review, acceptance } = resourceItem(root);
    mutate(acceptance);
    assert.throws(() => completeCurrentStage(item, root, deliveryOf(review), { now: "2026-10-16T00:00:07Z" }), /资源|人工/);
  });
});

test("资源确认必须绑定当前组件、候选和本阶段预览，不能借用场景图片", () => {
  for (const mutate of [
    ({ acceptance }) => { acceptance.componentIds = []; },
    ({ acceptance }) => { acceptance.evidenceIds = {}; },
    ({ acceptance }) => { acceptance.outputs = []; },
    ({ acceptance }) => { acceptance.outputs[0].sourceRef = "missing.luau"; },
    ({ item }) => { item.evidence[0].resources.outputs = []; },
    ({ acceptance }) => { acceptance.candidate = "other"; },
    ({ acceptance }) => { acceptance.workItemId = "other"; },
    ({ item }) => { delete item.evidence[0].resources; },
    ({ item }) => { item.evidence[0].resources.componentIds = ["unknown"]; },
    ({ item }) => { item.evidence[0].resources.componentIds = {}; },
    ({ item }) => { item.evidence[0].observedAt = "2026-10-16T00:00:08Z"; },
    ({ item }) => { item.evidence[0].path = "missing.png"; },
  ]) inProject((root) => {
    const context = resourceItem(root);
    mutate(context);
    assert.equal(stageStatus(context.item, root).valid, false);
  });
});

test("V3 拒绝夹带场景组合历史，V4 拒绝夹带资源验收记录", () => inProject((root) => {
  const { item, review } = resourceItem(root);
  assert.throws(() => completeCurrentStage(item, root, { production: { sampleAttempts: [], expansions: [] } }), /只有 V4/);
  const completed = completeCurrentStage(item, root, deliveryOf(review), { now: "2026-10-16T00:00:07Z" });
  const next = advanceStage(completed, root, { now: "2026-10-16T00:00:08Z" });
  assert.throws(() => completeCurrentStage(next, root, { resourceAcceptance: review.resourceAcceptance }), /只有 V3/);
}));

test("V3 资源路由必须先登记正式修订与许可，图库不替代产出身份", () => inProject((root) => {
  const { item, acceptance } = resourceItem(root);
  const v2 = item.stageReviews.find((entry) => entry.stage === "V2");
  const contract = JSON.parse(readFileSync(join(root, v2.decompositionRef), "utf8"));
  contract.components[0].productionRoute = "MODEL_3D";
  writeFileSync(join(root, v2.decompositionRef), JSON.stringify(contract));
  acceptance.outputs = [{ componentId: "C1", resourceId: "model-1", revision: 1 }];
  item.evidence[0].resources.outputs = structuredClone(acceptance.outputs);
  assert.equal(stageStatus(item, root).valid, false, "缺资源总表时不能只靠图片接受");
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "fixtures/source.txt"), "仅本地测试来源和许可依据\n");
  const asset = { id: "model-1", type: "mesh", owner: "测试资源负责人", revision: 1, status: "ready",
    source: { kind: "generated", uri: "test:model-1", evidenceRef: "fixtures/source.txt" },
    license: { status: "approved", evidenceRef: "fixtures/source.txt" }, assetId: "123456", instancePath: null,
    consumers: [], evidenceRefs: ["fixtures/source.txt"] };
  /** 保持总表和测试中的资源变更同步，隔离 revision 与许可条件。 */
  const persist = () => writeFileSync(join(root, "docs/asset-register.json"), JSON.stringify({ version: 1, assets: [asset] }));
  persist();
  assert.equal(stageStatus(item, root).valid, true, "V3 不提前要求 V4 消费者和 Edit 回读");
  asset.revision = 2;
  persist();
  assert.equal(stageStatus(item, root).valid, false, "换版使旧资源接受失效");
  asset.revision = 1;
  asset.license.status = "rejected";
  persist();
  assert.equal(stageStatus(item, root).valid, false, "拒绝许可不能被图集接受绕过");
}));
