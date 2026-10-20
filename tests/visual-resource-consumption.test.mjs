import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assess } from "../roblox-game-workflow-control/scripts/runtime/contract.mjs";
import { fixture, inProject } from "./helpers.mjs";

/** 构造已接受模型 A 的完整场景，所有证据均限于临时文件和身份校验。 */
function acceptedScene(root) {
  const item = fixture(root, "SCENE");
  const nodePath = "game.StarterGui.Test";
  item.scope.instances = [nodePath, "game.SoundService.Music"];
  item.implementation.units[0].instances = [...item.scope.instances];
  item.implementation.studioWriter = "测试负责人";
  const v2 = item.stageReviews.find((review) => review.stage === "V2");
  const contract = JSON.parse(readFileSync(join(root, v2.decompositionRef), "utf8"));
  contract.components[0].productionRoute = "MODEL_3D";
  contract.components[0].consumerNodeId = "root";
  writeFileSync(join(root, v2.decompositionRef), JSON.stringify(contract));
  const v3 = item.stageReviews.find((review) => review.stage === "V3");
  const outputs = [{ componentId: "C1", resourceId: "model-a", revision: 1 }];
  v3.resourceAcceptance.outputs = structuredClone(outputs);
  item.evidence.find((entry) => entry.resources).resources.outputs = structuredClone(outputs);
  const source = { kind: "generated", uri: "test:resource", evidenceRef: "evidence/readback.txt" };
  const assets = ["model-a", "model-b", "audio"].map((id, index) => ({
    id, type: id === "audio" ? "audio" : "mesh", owner: "测试负责人", revision: 1, status: "ready",
    source, license: { status: "approved", evidenceRef: "evidence/readback.txt" }, assetId: String(100 + index),
    instancePath: null, consumers: [], evidenceRefs: ["evidence/readback.txt"],
  }));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs/asset-register.json"), JSON.stringify({ version: 1, assets }));
  const readback = item.evidence.find((entry) => entry.id === "readback");
  readback.assetBindings = [];
  /** 切换实际消费身份并同步技术回读，独立测试是否受 V3 接受范围限制。 */
  function consume(resourceId, path = nodePath) {
    for (const registered of assets) registered.consumers = registered.consumers.filter((consumer) =>
      item.assetBindings.some((binding) => binding.resourceId === registered.id && binding.nodePath === consumer.nodePath));
    const asset = assets.find((entry) => entry.id === resourceId);
    item.assetBindings.push({ resourceId, revision: 1, nodePath: path, evidenceId: "readback" });
    readback.assetBindings.push({ resourceId, revision: 1, nodePath: path, assetId: asset.assetId, instancePath: null });
    asset.consumers.push({ workItemId: item.id, candidate: item.candidate, revision: 1, state: "active", nodePath: path });
    writeFileSync(join(root, "docs/asset-register.json"), JSON.stringify({ version: 1, assets }));
  }
  return { item, consume };
}

test("V4 消费已接受资源通过，接受 A 却实际消费 B 被拒绝", () => inProject((root) => {
  const { item, consume } = acceptedScene(root);
  consume("model-a");
  assert.equal(assess(item, root).ready, true, JSON.stringify(assess(item, root)));
  item.assetBindings = [];
  item.evidence.find((entry) => entry.id === "readback").assetBindings = [];
  consume("model-b");
  const result = assess(item, root);
  assert.equal(result.ready, false);
  assert.match(result.errors.join(" "), /V3.*资源|未在 V3/);
}));

test("V4 附属音频绑定不受可见组件资源接受门误阻断", () => inProject((root) => {
  const { item, consume } = acceptedScene(root);
  consume("model-a");
  consume("audio", "game.SoundService.Music");
  assert.equal(assess(item, root).ready, true, JSON.stringify(assess(item, root)));
}));

test("V4 接受的组件必须明确对应正式消费节点且全部接入", () => inProject((root) => {
  const { item } = acceptedScene(root);
  assert.equal(assess(item, root).ready, false, "缺少已接受资源消费不得完成");
  const v2 = item.stageReviews.find((review) => review.stage === "V2");
  const contract = JSON.parse(readFileSync(join(root, v2.decompositionRef), "utf8"));
  contract.components[0].consumerNodeId = "unknown";
  writeFileSync(join(root, v2.decompositionRef), JSON.stringify(contract));
  assert.match(assess(item, root).errors.join(" "), /consumerNodeId/);
}));

test("CLI 完成 V4 时也核对接受与消费，拒绝后不保存阶段完成", () => inProject((root) => {
  const { item, consume } = acceptedScene(root);
  consume("model-b");
  const review = item.stageReviews.at(-1);
  review.status = "active";
  review.completedAt = null;
  mkdirSync(join(root, ".workflow-control/work-items"), { recursive: true });
  const recordPath = join(root, `.workflow-control/work-items/${item.id}.json`);
  writeFileSync(recordPath, JSON.stringify(item));
  const fields = ["path", "section", "deliverables", "exitChecks", "presentedRef", "remainingIssues", "nextAction", "reuse", "evidenceIds", "userMessageRef", "production"];
  writeFileSync(join(root, "delivery.json"), JSON.stringify(Object.fromEntries(fields.map((key) => [key, review[key]]))));
  const cli = resolve("roblox-game-workflow-control/scripts/workflow-control.mjs");
  const before = readFileSync(recordPath, "utf8");
  const result = spawnSync(process.execPath, [cli, "complete-stage", "--repo", root, "--id", item.id, "--delivery", "delivery.json"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /V3|资源/);
  assert.equal(readFileSync(recordPath, "utf8"), before);
}));
