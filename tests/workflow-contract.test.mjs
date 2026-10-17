import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { assess } from "../roblox-game-workflow-control/scripts/runtime/contract.mjs";
import { fixture, inProject } from "./helpers.mjs";

test("相同候选名不能跨工作项、Place 或 Universe 借用证据", () => inProject((root) => {
  for (const field of ["workItemId", "placeId", "universeId"]) {
    const item = fixture(root, "SCENE");
    item.evidence.find((entry) => entry.type === "play")[field] = field === "workItemId" ? "another-item" : 999;
    assert.equal(assess(item, root).ready, false, field);
  }
}));

test("每个验收目标必须有绑定当前证据的独立结论", () => inProject((root) => {
  const item = fixture(root);
  item.acceptance.push({ id: "second-goal", criterion: "另一个实际结果" });
  assert.equal(assess(item, root).ready, false);
  item.acceptanceResults.push({ id: "second-goal", status: "PASS", evidenceIds: ["missing"] });
  assert.equal(assess(item, root).ready, false);
  item.acceptanceResults[1].evidenceIds = ["static"];
  assert.equal(assess(item, root).ready, true);
}));

test("同类 PASS 不能掩盖另一项计划检查没有执行", () => inProject((root) => {
  const item = fixture(root);
  item.implementation.verification.push({ id: "second-check", description: "第二条静态检查", evidenceType: "static" });
  assert.equal(assess(item, root).ready, false);
  item.evidence.push({ ...item.evidence[0], id: "second", checkId: "second-check" });
  assert.equal(assess(item, root).ready, true);
  item.evidence[1].result = "NOT_RUN";
  assert.equal(assess(item, root).ready, false);
}));

test("空实施单元和循环依赖不能作为完成依据", () => inProject((root) => {
  const item = fixture(root);
  item.implementation.units[0].files = [];
  assert.equal(assess(item, root).ready, false);
  item.implementation.units[0].files = item.scope.files;
  item.implementation.units[0].dependsOn = ["main"];
  assert.equal(assess(item, root).ready, false);
}));

test("多单元或集成工作项的审查不能由实现者替代", () => inProject((root) => {
  const item = fixture(root, "INTEGRATION");
  assert.equal(assess(item, root).ready, true);
  item.domainReview.reviewer = item.implementation.owner;
  assert.equal(assess(item, root).ready, false);
}));

test("多人证据必须说明至少两个客户端与实际启动方式", () => inProject((root) => {
  const item = fixture(root, "SCENE");
  item.requiredEvidence.push("multiplayer");
  item.evidence.push({ ...item.evidence.find((entry) => entry.type === "play"), checkId: undefined, id: "multi", type: "multiplayer" });
  assert.equal(assess(item, root).ready, false);
  Object.assign(item.evidence.at(-1), { clientCount: 2, method: "Server & Clients" });
  assert.equal(assess(item, root).ready, true);
}));

test("阶段交付与可选逐阶段人工门不能只靠V4标签跳过", () => inProject((root) => {
  const item = fixture(root, "SCENE");
  item.stageReviews.pop();
  assert.equal(assess(item, root).ready, false);
  const complete = fixture(root, "SCENE");
  complete.stagePolicy = "manual";
  assert.equal(assess(complete, root).ready, false);
  complete.stageReviews.forEach((review) => { review.userMessageRef = "test-fixture-only"; });
  assert.equal(assess(complete, root).ready, true);
}));

test("视觉目标合同必须绑定当前对象，布局父级不能缺失或成环", () => inProject((root) => {
  const item = fixture(root, "SCENE");
  const path = join(root, item.visualContractRef);
  const contract = JSON.parse(readFileSync(path, "utf8"));
  contract.nodes[0].parentId = "root";
  writeFileSync(path, JSON.stringify(contract));
  assert.equal(assess(item, root).ready, false);
  contract.nodes[0].parentId = null; contract.workItemId = "other";
  writeFileSync(path, JSON.stringify(contract));
  assert.equal(assess(item, root).ready, false);
}));

test("人工美术结论与动态情景不能被静态证据替代", () => inProject((root) => {
  const item = fixture(root, "SCENE");
  item.visualReview.qualityResults.themeFit.status = "NOT_RUN";
  assert.equal(assess(item, root).ready, false);
  item.visualReview.qualityResults.themeFit.status = "PASS";
  item.visualReview.scenarios[0].technical.evidenceIds = ["readback"];
  assert.equal(assess(item, root).ready, false);
}));

test("已有技术证据不允许把planned工作项当作完成记录", () => inProject((root) => {
  const item = fixture(root);
  item.state = "planned";
  assert.equal(assess(item, root).ready, false);
}));

test("人工视觉证据也必须来自当前Studio和Place目标", () => inProject((root) => {
  for (const field of ["studioId", "placeId", "universeId"]) {
    const item = fixture(root, "SCENE");
    const entry = item.evidence.find((value) => value.type === "visual");
    entry[field] = field === "studioId" ? "wrong-studio" : 999;
    assert.equal(assess(item, root).ready, false, field);
    delete entry[field];
    assert.equal(assess(item, root).ready, false, `missing-${field}`);
  }
}));

test("不同所有者写同一文件或父子实例必须有串行交接依赖", () => inProject((root) => {
  const item = fixture(root);
  item.implementation.units.push({ ...item.implementation.units[0], id: "second", owner: "另一位实现者", dependsOn: [] });
  assert.equal(assess(item, root).ready, false);
  item.implementation.units[1].dependsOn = ["main"];
  assert.equal(assess(item, root).ready, true);
  item.scope.instances = ["game.Workspace.Map", "game.Workspace.Map.Tree"];
  item.implementation.studioWriter = "测试负责人";
  item.implementation.units[0].instances = [item.scope.instances[0]];
  item.implementation.units[1].instances = [item.scope.instances[1]];
  item.implementation.units[1].files = [];
  item.implementation.units[1].dependsOn = [];
  assert.equal(assess(item, root).ready, false);
}));

test("畸形嵌套证据字段返回错误而非中断检查", () => inProject((root) => {
  const item = fixture(root);
  item.acceptanceResults[0].evidenceIds = { length: 1, every: true };
  assert.equal(assess(item, root).ready, false);
}));
