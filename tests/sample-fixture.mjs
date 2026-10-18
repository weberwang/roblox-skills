import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeTestPng } from "./decomposition-fixture.mjs";
import { SAMPLE_CHECKS } from "../roblox-game-workflow-control/scripts/runtime/sample-production.mjs";

/** 创建只用于隔离测试的组合样板证据与人工声明，不代表实际游戏显示验收。 */
export function createSampleFixture(root, item, review, { revision = 1, candidate = item.candidate, start = review.startedAt } = {}) {
  const contract = JSON.parse(readFileSync(join(root, item.stageReviews.find((entry) => entry.stage === "V2").decompositionRef), "utf8"));
  const plan = contract.restoration.samplePlan;
  const sampleId = `test-sample-${revision}`;
  const evidenceId = `${sampleId}-visual`;
  const path = `fixtures/${sampleId}.png`;
  writeTestPng(root, path);
  const identity = { scope: "sample", sampleId, candidate, revision, viewId: plan.viewId };
  item.evidence.push({ id: evidenceId, type: "visual", workItemId: item.id, candidate,
    studioId: item.target.studioId, placeId: item.target.placeId, universeId: item.target.universeId,
    observedAt: new Date(Date.parse(start) + 2).toISOString(), result: "PASS", summary: "仅测试组合样板截图采集记录", path,
    sample: { stageReviewId: review.id, sampleId, revision, viewId: plan.viewId } });
  return { id: sampleId, revision, candidate, viewId: plan.viewId, componentIds: [...plan.componentIds], requirementIds: [...plan.requirementIds],
    createdAt: new Date(Date.parse(start) + 1).toISOString(), evidenceIds: [evidenceId],
    checks: SAMPLE_CHECKS.map((id) => ({ id, result: "PASS", basis: "仅本地记录测试声明，不评判画面" })),
    acceptance: { ...identity, result: "PASS", mode: "manual", evidenceIds: [evidenceId],
      userMessageRef: `test-only-current-sample-${revision}`, authorization: null, reviewedAt: new Date(Date.parse(start) + 3).toISOString() } };
}
