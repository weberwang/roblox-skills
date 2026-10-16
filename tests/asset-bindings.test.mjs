import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { checkAssets, validateAssetRegister } from "../roblox-game-workflow-control/scripts/runtime/assets.mjs";
import { assess } from "../roblox-game-workflow-control/scripts/runtime/contract.mjs";
import { fixture, inProject } from "./helpers.mjs";

const NODE_PATH = "game.Workspace.Rock";

/** 创建实际本地资源证据与当前候选消费关系，测试不连接 Studio。 */
function assetFixture(root) {
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  for (const file of ["source.txt", "license.txt", "asset.txt", "readback.txt"]) {
    writeFileSync(join(root, "evidence", file), `本地测试证据：${file}\n`);
  }
  const asset = {
    id: "asset-rock",
    type: "mesh",
    owner: "art-owner",
    revision: 1,
    status: "ready",
    source: { kind: "official-page", uri: "https://www.roblox.com/", evidenceRef: "evidence/source.txt" },
    license: { status: "approved", evidenceRef: "evidence/license.txt" },
    assetId: "123456",
    instancePath: null,
    consumers: [{ workItemId: "work-1", candidate: "candidate-2", revision: 1, state: "active", nodePath: NODE_PATH }],
    evidenceRefs: ["evidence/asset.txt"],
  };
  const register = { version: 1, assets: [asset] };
  writeFileSync(join(root, "docs/asset-register.json"), `${JSON.stringify(register, null, 2)}\n`);
  const item = {
    id: "work-1",
    candidate: "candidate-2",
    scope: { instances: ["game.Workspace"] },
    assetBindings: [{ resourceId: asset.id, revision: 1, nodePath: NODE_PATH, evidenceId: "asset-readback" }],
  };
  const evidence = {
    id: "asset-readback",
    type: "readback",
    datamodel: "Edit",
    workItemId: item.id,
    candidate: item.candidate,
    assetBindings: [{ resourceId: asset.id, revision: 1, nodePath: NODE_PATH, assetId: asset.assetId, instancePath: asset.instancePath }],
  };
  return { item, asset, register, usable: new Map([[evidence.id, evidence]]) };
}

/** 在测试中运行工作项资源门，并返回可直接断言的错误与阻断项。 */
function assessAssets(item, usable, repo) {
  const errors = [];
  const blockers = [];
  checkAssets(item, usable, { repo, errors, blockers, require: (condition, message) => { if (!condition) errors.push(message); } });
  return { valid: errors.length === 0, ready: errors.length === 0 && blockers.length === 0, errors, blockers };
}

/** 构造完整本地可验收工作项，供集成门的合法与畸形输入回归测试复用。 */
function integratedAssetWorkItem(root) {
  const item = fixture(root);
  item.scope.instances = [NODE_PATH];
  item.implementation.units[0].instances = [NODE_PATH];
  item.implementation.studioWriter = "测试 Studio 写入者";
  item.requiredEvidence.push("readback");
  item.implementation.verification.push({ id: "asset-readback", description: "回读被消费资源身份", evidenceType: "readback" });
  writeFileSync(join(root, "evidence/asset-readback.txt"), "Studio Edit 回读记录。\n");
  const { asset } = assetFixture(root);
  asset.consumers[0].workItemId = item.id;
  asset.consumers[0].candidate = item.candidate;
  writeFileSync(join(root, "docs/asset-register.json"), JSON.stringify({ version: 1, assets: [asset] }));
  const binding = { resourceId: asset.id, revision: asset.revision, nodePath: NODE_PATH, evidenceId: "asset-readback" };
  const observed = { resourceId: asset.id, revision: asset.revision, nodePath: NODE_PATH, assetId: asset.assetId, instancePath: asset.instancePath };
  item.assetBindings = [binding];
  item.evidence.push({ id: "asset-readback", checkId: "asset-readback", workItemId: item.id, candidate: item.candidate,
    observedAt: "2026-10-16T00:00:00Z", type: "readback", result: "PASS", summary: "回读测试资源身份",
    path: "evidence/asset-readback.txt", studioId: item.target.studioId, placeId: 0, universeId: 0, datamodel: "Edit", assetBindings: [observed] });
  item.acceptanceResults[0].evidenceIds.push("asset-readback");
  return item;
}

test("当前 active 消费者通过最新资源版本与精确 readback 绑定", () => inProject((root) => {
  const { item, usable } = assetFixture(root);
  const result = assessAssets(item, usable, root);
  assert.deepEqual(result, { valid: true, ready: true, errors: [], blockers: [] });
}));

test("完整工作项验收读取总表并要求当前候选的 Edit 回读", () => inProject((root) => {
  const item = integratedAssetWorkItem(root);
  const accepted = assess(item, root);
  assert.equal(accepted.ready, true, JSON.stringify(accepted));
  item.evidence.find((entry) => entry.id === "asset-readback").datamodel = "Server";
  const runtimeReadback = assess(item, root);
  assert.equal(runtimeReadback.ready, false);
  assert.ok(runtimeReadback.blockers.some((entry) => entry.includes("readback")));
}));

test("畸形 nodePath 类型只产生工作项校验错误，不抛异常", () => inProject((root) => {
  for (const [index, malformedPath] of [123, null, {}].entries()) {
    const scenarioRoot = join(root, `malformed-${index}`);
    mkdirSync(scenarioRoot, { recursive: true });
    const item = integratedAssetWorkItem(scenarioRoot);
    item.assetBindings[0].nodePath = malformedPath;
    let result;
    assert.doesNotThrow(() => { result = assess(item, scenarioRoot); });
    assert.equal(result.valid, false);
  }
}));

test("无资源工作项允许缺少资源总表，也不受无关计划资源影响", () => inProject((root) => {
  const item = { id: "empty-work", candidate: "candidate-1", scope: { instances: [] }, assetBindings: [] };
  assert.equal(assessAssets(item, new Map(), root).ready, true);

  mkdirSync(join(root, "docs"), { recursive: true });
  const unrelated = {
    id: "future-asset", type: "mesh", owner: "artist", revision: 1, status: "planned",
    source: { kind: "", uri: "", evidenceRef: "" }, license: { status: "pending", evidenceRef: "" },
    assetId: null, instancePath: null, consumers: [], evidenceRefs: [],
  };
  writeFileSync(join(root, "docs/asset-register.json"), JSON.stringify({ version: 1, assets: [unrelated] }));
  assert.equal(assessAssets(item, new Map(), root).ready, true);
}));

test("程序化资源可无 Asset ID，但必须回读同一实例路径", () => inProject((root) => {
  const { item, asset, usable } = assetFixture(root);
  asset.assetId = null;
  asset.instancePath = NODE_PATH;
  usable.get("asset-readback").assetBindings[0].assetId = null;
  usable.get("asset-readback").assetBindings[0].instancePath = NODE_PATH;
  writeFileSync(join(root, "docs/asset-register.json"), JSON.stringify({ version: 1, assets: [asset] }));
  assert.equal(assessAssets(item, usable, root).ready, true);
}));

test("退役资源、拒绝许可、版本漂移和旧候选 active 消费均阻断", () => inProject((root) => {
  const scenarios = [
    ["退役资源", ({ asset }) => { asset.status = "retired"; asset.license.status = "rejected"; }],
    ["拒绝许可", ({ asset }) => { asset.license.status = "rejected"; }],
    ["版本漂移", ({ asset }) => { asset.revision = 2; }],
    ["旧候选仍 active", ({ asset }) => { asset.consumers[0].candidate = "candidate-1"; }],
  ];
  for (const [label, mutate] of scenarios) {
    const scenarioRoot = join(root, label.replaceAll(" ", "-"));
    mkdirSync(scenarioRoot, { recursive: true });
    const fixture = assetFixture(scenarioRoot);
    mutate(fixture);
    writeFileSync(join(scenarioRoot, "docs/asset-register.json"), JSON.stringify(fixture.register));
    assert.equal(assessAssets(fixture.item, fixture.usable, scenarioRoot).ready, false, label);
  }
}));

test("遗漏绑定、错误证据与越出实例范围均不能完成工作项验收", () => inProject((root) => {
  const missing = assetFixture(join(root, "missing"));
  missing.item.assetBindings = [];
  assert.equal(assessAssets(missing.item, missing.usable, join(root, "missing")).ready, false);

  const wrongEvidence = assetFixture(join(root, "wrong-evidence"));
  wrongEvidence.usable.get("asset-readback").assetBindings[0].assetId = "999999";
  assert.equal(assessAssets(wrongEvidence.item, wrongEvidence.usable, join(root, "wrong-evidence")).ready, false);

  const runtimeEvidence = assetFixture(join(root, "runtime-evidence"));
  runtimeEvidence.usable.get("asset-readback").datamodel = "Server";
  assert.equal(assessAssets(runtimeEvidence.item, runtimeEvidence.usable, join(root, "runtime-evidence")).ready, false);

  const outOfScope = assetFixture(join(root, "out-of-scope"));
  outOfScope.item.scope.instances = ["game.ReplicatedStorage"];
  assert.equal(assessAssets(outOfScope.item, outOfScope.usable, join(root, "out-of-scope")).ready, false);
}));

test("退役历史消费者不阻断当前无消费工作项，历史重复按版本与候选区分", () => inProject((root) => {
  mkdirSync(join(root, "docs"), { recursive: true });
  const historical = {
    id: "old-rock", type: "mesh", owner: "art-owner", revision: 2, status: "retired",
    source: { kind: "legacy", uri: "legacy", evidenceRef: "" }, license: { status: "rejected", evidenceRef: "" },
    assetId: null, instancePath: null,
    consumers: [
      { workItemId: "removed-work", candidate: "candidate-1", revision: 1, state: "historical", nodePath: NODE_PATH },
      { workItemId: "removed-work", candidate: "candidate-2", revision: 1, state: "historical", nodePath: NODE_PATH },
    ],
    evidenceRefs: [],
  };
  writeFileSync(join(root, "docs/asset-register.json"), JSON.stringify({ version: 1, assets: [historical] }));
  const item = { id: "current-work", candidate: "candidate-1", scope: { instances: [] }, assetBindings: [] };
  assert.equal(assessAssets(item, new Map(), root).ready, true);

  historical.consumers.push({ ...historical.consumers[0] });
  const report = validateAssetRegister({ version: 1, assets: [historical] }, root);
  assert.ok(report.errors.some((entry) => entry.includes("重复引用")));
}));

test("绑定资源总表不存在时阻断，有重复资源 ID 时即使无关也报错", () => inProject((root) => {
  const item = { id: "work-1", candidate: "candidate-2", scope: { instances: ["game.Workspace"] }, assetBindings: [
    { resourceId: "missing", revision: 1, nodePath: NODE_PATH, evidenceId: "readback" },
  ] };
  assert.equal(assessAssets(item, new Map(), root).ready, false);

  const { item: unbound, asset } = assetFixture(root);
  unbound.assetBindings = [];
  const duplicate = { ...asset, consumers: [] };
  writeFileSync(join(root, "docs/asset-register.json"), JSON.stringify({ version: 1, assets: [asset, duplicate] }));
  const result = assessAssets(unbound, new Map(), root);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes("资源 ID 重复")));
}));
