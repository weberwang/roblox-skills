import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { assessLocal } from "../roblox-game-workflow-control/scripts/runtime/contract.mjs";
import { assessProject, checkProjectDependencies, createProject } from "../roblox-game-workflow-control/scripts/runtime/project.mjs";
import { fixture, inProject } from "./helpers.mjs";

/** 为项目检查创建完整的本地工作项事实和可定位证据文件。 */
function makeItem(root, id, type, dependencies = [], state = "complete") {
  const item = fixture(root, type);
  item.id = id;
  item.candidate = `${id}-candidate`;
  item.state = state;
  item.dependsOn = dependencies.map((dependency) => ({ ...dependency }));
  for (const evidence of item.evidence) {
    evidence.workItemId = id;
    evidence.candidate = item.candidate;
  }
  return item;
}

/** 按清单约定写入工作项和项目记录，测试目录每次由 inProject 全新创建。 */
function saveProject(root, items, integrationWorkItemId, multiPlace = { enabled: false }) {
  mkdirSync(join(root, ".workflow-control", "work-items"), { recursive: true });
  const manifest = createProject("test-game");
  manifest.workItems = items.map(({ id, candidate }) => ({ id, candidate }));
  manifest.integrationWorkItemId = integrationWorkItemId;
  manifest.multiPlace = multiPlace;
  for (const item of items) writeFileSync(join(root, ".workflow-control", "work-items", `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`);
  writeFileSync(join(root, ".workflow-control", "project.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** 调用单项项目依赖门，隔离记录错误和未完成阻断。 */
function checkDependencies(item, root, localAssessment = assessLocal) {
  const errors = [];
  const blockers = [];
  checkProjectDependencies(item, { repo: root, errors, blockers, require: (condition, message) => { if (!condition) errors.push(message); } }, localAssessment);
  return { errors, blockers };
}

/** 准备一个有基础成员、生产成员和集成汇合点的 DAG。 */
function validDAG(root) {
  const foundation = makeItem(root, "foundation", "FOUNDATION");
  const gameplay = makeItem(root, "gameplay", "PROJECT", [{ workItemId: foundation.id, candidate: foundation.candidate }]);
  const unrelated = makeItem(root, "unrelated", "PROJECT", [], "planned");
  unrelated.phase = "production";
  const integration = makeItem(root, "integration", "INTEGRATION", [foundation, gameplay, unrelated].map(({ id, candidate }) => ({ workItemId: id, candidate })));
  saveProject(root, [foundation, gameplay, unrelated, integration], integration.id);
  return { foundation, gameplay, unrelated, integration };
}

test("创建空项目清单不虚构工作项或多 Place 配置", () => {
  assert.deepEqual(createProject("test-game"), {
    version: 1, projectId: "test-game", workItems: [], integrationWorkItemId: "", multiPlace: { enabled: false },
  });
  assert.throws(() => createProject("../escape"), /projectId/);
});

test("合法DAG要求传递前置完成，但无关未完成项不阻断单项检查", () => inProject((root) => {
  const { gameplay, unrelated } = validDAG(root);
  const report = checkDependencies(gameplay, root);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blockers, []);
  assert.equal(assessProject(root, assessLocal).ready, false);
  assert.ok(assessProject(root, assessLocal).blockers.some((message) => message.includes(unrelated.id)));
}));

test("未登记依赖、依赖环和候选漂移都会阻断图检查", () => inProject((root) => {
  const { foundation, gameplay, integration } = validDAG(root);
  gameplay.dependsOn = [{ workItemId: "missing", candidate: "missing-candidate" }];
  writeFileSync(join(root, ".workflow-control", "work-items", `${gameplay.id}.json`), JSON.stringify(gameplay));
  assert.ok(checkDependencies(gameplay, root).errors.some((message) => message.includes("未登记")));

  gameplay.dependsOn = [{ workItemId: foundation.id, candidate: foundation.candidate }];
  foundation.dependsOn = [{ workItemId: gameplay.id, candidate: gameplay.candidate }];
  integration.dependsOn = [foundation, gameplay].map(({ id, candidate }) => ({ workItemId: id, candidate }));
  writeFileSync(join(root, ".workflow-control", "work-items", `${gameplay.id}.json`), JSON.stringify(gameplay));
  writeFileSync(join(root, ".workflow-control", "work-items", `${foundation.id}.json`), JSON.stringify(foundation));
  writeFileSync(join(root, ".workflow-control", "work-items", `${integration.id}.json`), JSON.stringify(integration));
  assert.ok(checkDependencies(gameplay, root).errors.some((message) => message.includes("成环")));

  foundation.dependsOn = [];
  foundation.candidate = "new-candidate";
  writeFileSync(join(root, ".workflow-control", "work-items", `${foundation.id}.json`), JSON.stringify(foundation));
  assert.ok(checkDependencies(gameplay, root).blockers.some((message) => message.includes("候选")));
  const gameplayResult = assessProject(root, () => ({ valid: true, ready: true, errors: [], blockers: [] })).items
    .find((entry) => entry.id === gameplay.id);
  assert.equal(gameplayResult.ready, false);
  assert.ok(gameplayResult.blockers.some((message) => message.includes("候选")));
}));

test("未完成或本地验收失败的传递前置会阻断下游工作项", () => inProject((root) => {
  const { foundation, gameplay } = validDAG(root);
  foundation.state = "validating";
  writeFileSync(join(root, ".workflow-control", "work-items", `${foundation.id}.json`), JSON.stringify(foundation));
  const result = checkDependencies(gameplay, root, (item) => ({ valid: true, ready: item.id !== "foundation", errors: [], blockers: [] }));
  assert.ok(result.blockers.some((message) => message.includes("尚未完成")));
  assert.ok(result.blockers.some((message) => message.includes("未通过本地验收")));
  const aggregate = assessProject(root, (item) => ({ valid: true, ready: item.id !== "foundation", errors: [], blockers: [] }));
  const gameplayResult = aggregate.items.find((entry) => entry.id === gameplay.id);
  assert.equal(gameplayResult.ready, false);
  assert.ok(gameplayResult.blockers.some((message) => message.includes(foundation.id)));
}));

test("全局聚合要求集成覆盖所有成员且每个发布项经过集成", () => inProject((root) => {
  const foundation = makeItem(root, "foundation", "FOUNDATION");
  const gameplay = makeItem(root, "gameplay", "PROJECT");
  const release = makeItem(root, "release", "RELEASE", [{ workItemId: foundation.id, candidate: foundation.candidate }]);
  const integration = makeItem(root, "integration", "INTEGRATION", [foundation].map(({ id, candidate }) => ({ workItemId: id, candidate })));
  saveProject(root, [foundation, gameplay, integration, release], integration.id);
  const report = assessProject(root, () => ({ valid: true, ready: true, errors: [], blockers: [] }));
  assert.ok(report.errors.some((message) => message.includes("未依赖非发布成员") && message.includes("gameplay")));
  assert.ok(report.errors.some((message) => message.includes("必须传递依赖集成")));
  assert.equal(report.ready, false);
}));

test("全局聚合发现工作项目录中的未登记文件，单项检查仍只看自身依赖链", () => inProject((root) => {
  const { gameplay } = validDAG(root);
  const orphan = makeItem(root, "orphan", "PROJECT");
  writeFileSync(join(root, ".workflow-control", "work-items", `${orphan.id}.json`), JSON.stringify(orphan));
  assert.equal(checkDependencies(gameplay, root).blockers.length, 0);
  const report = assessProject(root, assessLocal);
  assert.ok(report.errors.some((message) => message.includes("未登记") && message.includes("orphan.json")));
  assert.ok(report.items.every((item) => item.errors.some((message) => message.includes("orphan.json"))));
}));

/** 生成显式跨 Place 验证证据；普通本地评估仍会核对文件、候选和运行上下文。 */
function addTransitionEvidence(root, integration, placeIds) {
  const path = "evidence/multi-place.txt";
  writeFileSync(join(root, path), "仅本地契约测试使用的运行记录。\n");
  integration.target.placeId = placeIds[0];
  integration.target.universeId = 9000;
  integration.evidence.push({ id: "multi-place", workItemId: integration.id, candidate: integration.candidate,
    observedAt: "2026-10-16T00:00:00Z", type: "play", result: "PASS", summary: "测试用跨 Place 证据结构",
    path, studioId: integration.target.studioId, placeId: placeIds[0], universeId: 9000, datamodel: "Client",
    multiPlace: { transitionId: "hub-to-arena", placeIds: [...placeIds] },
  });
}

test("多 Place 关闭时没有额外 Place 门，启用后覆盖身份、依赖和真实运行证据", () => inProject((root) => {
  const hub = makeItem(root, "hub", "PROJECT");
  const arena = makeItem(root, "arena", "PROJECT");
  const integration = makeItem(root, "integration", "INTEGRATION", [hub, arena].map(({ id, candidate }) => ({ workItemId: id, candidate })));
  for (const item of [hub, arena, integration]) item.phase = item.id === integration.id ? "integration" : "production";
  hub.target.placeId = 100; hub.target.universeId = 9000;
  arena.target.placeId = 200; arena.target.universeId = 9000;
  addTransitionEvidence(root, integration, [100, 200]);
  mkdirSync(join(root, "contracts"), { recursive: true });
  writeFileSync(join(root, "contracts", "transition.md"), "转场数据契约。\n");
  const multiPlace = { enabled: true,
    places: [
      { id: "hub-place", placeId: 100, universeId: 9000, workItemIds: [hub.id, integration.id] },
      { id: "arena-place", placeId: 200, universeId: 9000, workItemIds: [arena.id] },
    ],
    transitions: [{ id: "hub-to-arena", from: "hub-place", to: "arena-place", contractRef: "contracts/transition.md", verificationWorkItemId: integration.id }],
    sharedData: [],
  };
  saveProject(root, [hub, arena, integration], integration.id, multiPlace);
  assert.equal(assessProject(root, assessLocal).ready, true);

  multiPlace.transitions[0].to = "hub-place";
  writeFileSync(join(root, ".workflow-control", "project.json"), JSON.stringify({ ...createProject("test-game"),
    workItems: [hub, arena, integration].map(({ id, candidate }) => ({ id, candidate })),
    integrationWorkItemId: integration.id, multiPlace,
  }));
  assert.ok(assessProject(root, assessLocal).errors.some((message) => message.includes("两个有效且不同的 Place")));
}));

test("启用多 Place 时缺少关系运行证据或验证集成前置会阻断聚合", () => inProject((root) => {
  const hub = makeItem(root, "hub", "PROJECT");
  const arena = makeItem(root, "arena", "PROJECT");
  const integration = makeItem(root, "integration", "INTEGRATION", [{ workItemId: hub.id, candidate: hub.candidate }]);
  for (const item of [hub, arena]) item.phase = "production";
  hub.target.placeId = 100; hub.target.universeId = 9000;
  arena.target.placeId = 200; arena.target.universeId = 9000;
  integration.target.placeId = 100; integration.target.universeId = 9000;
  mkdirSync(join(root, "contracts"), { recursive: true });
  writeFileSync(join(root, "contracts", "transition.md"), "转场数据契约。\n");
  saveProject(root, [hub, arena, integration], integration.id, {
    enabled: true,
    places: [
      { id: "hub-place", placeId: 100, universeId: 9000, workItemIds: [hub.id, integration.id] },
      { id: "arena-place", placeId: 200, universeId: 9000, workItemIds: [arena.id] },
    ],
    transitions: [{ id: "hub-to-arena", from: "hub-place", to: "arena-place", contractRef: "contracts/transition.md", verificationWorkItemId: integration.id }],
    sharedData: [],
  });
  const report = assessProject(root, assessLocal);
  assert.ok(report.errors.some((message) => message.includes("未依赖 Place arena-place 的生产工作项")));
  assert.ok(report.blockers.some((message) => message.includes("缺少当前候选运行证据")));
  const integrationResult = report.items.find((entry) => entry.id === integration.id);
  assert.equal(integrationResult.ready, false);
  assert.ok(integrationResult.blockers.some((message) => message.includes("缺少当前候选运行证据")));
}));

test("多 Place 中畸形的工作项列表和成员记录返回错误，不抛出运行时异常", () => {
  for (const workItemIds of [null, { bad: true }, [null, {}]]) inProject((root) => {
    const hub = makeItem(root, "hub", "PROJECT");
    const arena = makeItem(root, "arena", "PROJECT");
    const integration = makeItem(root, "integration", "INTEGRATION", [hub, arena].map(({ id, candidate }) => ({ workItemId: id, candidate })));
    for (const item of [hub, arena]) item.phase = "production";
    hub.target.placeId = 100; hub.target.universeId = 9000;
    arena.target.placeId = 200; arena.target.universeId = 9000;
    integration.target.placeId = 100; integration.target.universeId = 9000;
    mkdirSync(join(root, "contracts"), { recursive: true });
    writeFileSync(join(root, "contracts", "transition.md"), "转场数据契约。\n");
    const multiPlace = {
      enabled: true,
      places: [
        { id: "hub-place", placeId: 100, universeId: 9000, workItemIds },
        { id: "arena-place", placeId: 200, universeId: 9000, workItemIds: [arena.id] },
      ],
      transitions: [{ id: "hub-to-arena", from: "hub-place", to: "arena-place", contractRef: "contracts/transition.md", verificationWorkItemId: integration.id }],
      sharedData: [],
    };
    saveProject(root, [hub, arena, integration], integration.id, multiPlace);
    let report;
    assert.doesNotThrow(() => { report = assessProject(root, assessLocal); });
    assert.equal(report.ready, false);
    assert.ok(report.errors.length > 0);
  });

  inProject((root) => {
    const integration = makeItem(root, "integration", "INTEGRATION");
    const multiPlace = { enabled: true, places: [null, {}], transitions: [], sharedData: [] };
    saveProject(root, [integration], integration.id, multiPlace);
    assert.doesNotThrow(() => assessProject(root, assessLocal));
  });
});

/** 为项目级全表检查准备 ready 资源及其本地来源、许可和证据文件。 */
function writeAssetRegister(root, consumer) {
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  for (const name of ["asset-source.txt", "asset-license.txt", "asset-check.txt"]) {
    writeFileSync(join(root, "evidence", name), "资源验证夹具。\n");
  }
  const register = { version: 1, assets: [{
    id: "rock-model", type: "model", owner: "art-owner", revision: 1, status: "ready",
    source: { kind: "created", uri: "local://rock-model", evidenceRef: "evidence/asset-source.txt" },
    license: { status: "approved", evidenceRef: "evidence/asset-license.txt" },
    assetId: "123456", instancePath: null, consumers: [consumer], evidenceRefs: ["evidence/asset-check.txt"],
  }] };
  writeFileSync(join(root, "docs", "asset-register.json"), `${JSON.stringify(register, null, 2)}\n`);
}

test("全局资源检查拒绝没有项目成员或工作项文件的 active 消费者", () => inProject((root) => {
  const integration = makeItem(root, "integration", "INTEGRATION");
  saveProject(root, [integration], integration.id);
  writeAssetRegister(root, { workItemId: "ghost-work", candidate: "ghost-candidate", revision: 1,
    state: "active", nodePath: "game.Workspace.Rock" });
  const report = assessProject(root, assessLocal);
  assert.equal(report.ready, false);
  assert.ok(report.errors.some((message) => message.includes("active 消费工作项未登记") && message.includes("ghost-work")));
  assert.ok(report.items.every((item) => item.errors.some((message) => message.includes("ghost-work"))));
}));

test("全局资源检查要求 active 消费候选同时匹配项目清单和当前工作项", () => inProject((root) => {
  const scene = makeItem(root, "scene", "PROJECT");
  const integration = makeItem(root, "integration", "INTEGRATION", [{ workItemId: scene.id, candidate: scene.candidate }]);
  const manifest = saveProject(root, [scene, integration], integration.id);
  writeAssetRegister(root, { workItemId: scene.id, candidate: "old-candidate", revision: 1,
    state: "active", nodePath: "game.Workspace.Rock" });
  const report = assessProject(root, assessLocal);
  assert.equal(report.ready, false);
  assert.ok(report.blockers.some((message) => message.includes("active 消费候选与工作项") && message.includes(scene.id)));
  assert.equal(report.items.find((item) => item.id === scene.id).ready, false);

  manifest.workItems.find((item) => item.id === scene.id).candidate = "registry-candidate";
  writeFileSync(join(root, ".workflow-control", "project.json"), JSON.stringify(manifest));
  writeAssetRegister(root, { workItemId: scene.id, candidate: "registry-candidate", revision: 1,
    state: "active", nodePath: "game.Workspace.Rock" });
  const driftedRecord = assessProject(root, assessLocal);
  assert.ok(driftedRecord.blockers.some((message) => message.includes("active 消费候选与工作项") && message.includes(scene.id)));
}));

test("历史资源消费者可引用已归档工作项和旧候选", () => inProject((root) => {
  const integration = makeItem(root, "integration", "INTEGRATION");
  saveProject(root, [integration], integration.id);
  writeAssetRegister(root, { workItemId: "archived-work", candidate: "old-candidate", revision: 1,
    state: "historical", nodePath: "game.Workspace.Rock" });
  const report = assessProject(root, assessLocal);
  assert.equal(report.ready, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blockers, []);
}));
