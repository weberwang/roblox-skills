import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeTestPng } from "./decomposition-fixture.mjs";

/** 在隔离目录构造 V3 资源预览与人工声明，仅测试绑定关系，不代表实际验收。 */
export function createResourceFixture(root, item, review) {
  const v2 = item.stageReviews.find((entry) => entry.stage === "V2");
  const contract = JSON.parse(readFileSync(join(root, v2.decompositionRef), "utf8"));
  const componentIds = contract.components.map((entry) => entry.componentId);
  const outputs = componentIds.map((componentId) => {
    const sourceRef = `fixtures/native-${componentId}.luau`;
    writeFileSync(join(root, sourceRef), "-- 测试专用原生组件源，不连接或装配场景。\nreturn {}\n");
    return { componentId, sourceRef };
  });
  const id = "resource-preview";
  const path = "fixtures/formal-resources.png";
  writeTestPng(root, path);
  item.evidence.push({ id, type: "visual", workItemId: item.id, candidate: item.candidate,
    studioId: item.target?.studioId, placeId: item.target?.placeId, universeId: item.target?.universeId,
    observedAt: new Date(Date.parse(review.startedAt) + 1).toISOString(), result: "PASS", summary: "仅本地测试资源图集预览", path,
    resources: { stageReviewId: review.id, componentIds, outputs: structuredClone(outputs) } });
  return { mode: "manual", result: "PASS", workItemId: item.id, candidate: item.candidate,
    componentIds, outputs, evidenceIds: [id], userMessageRef: "test-only-resource-acceptance",
    reviewedAt: new Date(Date.parse(review.startedAt) + 2).toISOString() };
}
