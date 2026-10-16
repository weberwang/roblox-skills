import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import test from "node:test";
import { assess } from "../roblox-game-workflow-control/scripts/runtime/contract.mjs";
import { fixture, inProject } from "./helpers.mjs";

/** 构造明确标为测试来源的用户决策，不能作为真实项目的用户批准复用。 */
function decision(item, status = "approved", revision = 1) {
  return {
    version: 1, id: "core-loop", workItemId: item.id, revision, status,
    subject: { id: "first-loop", description: "测试用首轮规则选择", files: [...item.scope.files], instances: [] },
    trigger: "两个方向改变玩家循环，不能从代码确定产品选择", facts: [{ claim: "当前测试有两种候选", source: "测试夹具" }],
    assumptions: [], unknowns: [],
    questions: [{ id: "mode", prompt: "本轮采用哪种测试循环？", options: [
      { id: "co-op", label: "合作", impact: "共同目标与共享进度" },
      { id: "solo", label: "单人", impact: "独立目标与个人进度" },
    ], recommendedOptionId: "co-op", answer: status === "pending" ? null : { optionId: "co-op", freeText: null, userMessageRef: "test-answer-only" } }],
    conclusion: status === "approved" ? { summary: "采用已展示的合作测试范围", scope: ["仅本地测试记录"], nonGoals: ["不操作Studio"], rejectedOptions: ["本轮不做单人"], acceptedRisks: [], acceptance: ["只校验决策记录"], nextAction: "回到原工作项" } : null,
    approval: status === "approved" ? { userMessageRef: "test-summary-approval-only", approvedAt: "2026-10-16T00:00:00Z", revision } : null,
  };
}

/** 将测试决策写到隔离项目，再通过正式工作项入口评估。 */
function attach(root, item, record, name = "decision.json") {
  const local = `evidence/${name}`;
  writeFileSync(join(root, local), JSON.stringify(record));
  item.decisionRefs.push(local);
  return local;
}

test("普通任务明确不需要拷问，已有范围内不新增人工门", () => inProject((root) => {
  assert.equal(assess(fixture(root), root).ready, true);
  const item = fixture(root);
  delete item.decisionRefs;
  assert.equal(assess(item, root).ready, false);
}));

test("未回答、仅回答未批摘要和拒绝都阻断当前工作项", () => inProject((root) => {
  for (const status of ["pending", "answered", "rejected"]) {
    const item = fixture(root);
    attach(root, item, decision(item, status));
    assert.equal(assess(item, root).ready, false, status);
  }
}));

test("问题回答与完整摘要精确批准后可回到原工作项", () => inProject((root) => {
  const item = fixture(root);
  attach(root, item, decision(item));
  assert.equal(assess(item, root).ready, true);
}));

test("含糊回答或缺实际用户消息不能由推荐项代替", () => inProject((root) => {
  for (const mode of ["null", "no-user", "unknown-option", "no-answer"]) {
    const item = fixture(root);
    const record = decision(item);
    if (mode === "null") record.questions[0].answer = null;
    if (mode === "no-user") record.questions[0].answer.userMessageRef = "";
    if (mode === "unknown-option") record.questions[0].answer.optionId = "missing";
    if (mode === "no-answer") record.questions[0].answer.optionId = null;
    attach(root, item, record);
    assert.equal(assess(item, root).ready, false, mode);
  }
}));

test("用户自由回答可记录，但仍需明确结果与摘要批准", () => inProject((root) => {
  const item = fixture(root);
  const record = decision(item);
  record.questions[0].answer.optionId = null;
  record.questions[0].answer.freeText = "本轮仍用合作，仅保留首个目标";
  attach(root, item, record);
  assert.equal(assess(item, root).ready, true);
}));

test("跨工作项、越界对象、未知项与过期修订批准不能过门", () => inProject((root) => {
  for (const mode of ["work-item", "file", "instance", "unknown", "revision", "approval", "conclusion"]) {
    const item = fixture(root);
    const record = decision(item);
    if (mode === "work-item") record.workItemId = "other-item";
    if (mode === "file") record.subject.files = ["../outside.luau"];
    if (mode === "instance") record.subject.instances = ["game.Workspace.Outside"];
    if (mode === "unknown") record.unknowns = ["仍待决定的核心范围"];
    if (mode === "revision") record.approval.revision = 0;
    if (mode === "approval") record.approval = null;
    if (mode === "conclusion") record.conclusion.scope = [];
    attach(root, item, record);
    assert.equal(assess(item, root).ready, false, mode);
  }
}));

test("决策引用拒绝缺文件、目录穿越、重复与畸形JSON记录", () => inProject((root) => {
  for (const reference of ["evidence/missing.json", "../outside.json"]) {
    const item = fixture(root);
    item.decisionRefs = [reference];
    assert.equal(assess(item, root).ready, false);
  }
  const item = fixture(root);
  const reference = attach(root, item, decision(item));
  item.decisionRefs.push(reference);
  assert.equal(assess(item, root).ready, false);
  item.decisionRefs = [reference];
  writeFileSync(join(root, reference), "null");
  assert.equal(assess(item, root).ready, false);
}));

test("标记superseded不能绕过人工决定，必须显式接入有效替代记录", () => inProject((root) => {
  const item = fixture(root);
  const old = decision(item, "superseded");
  old.supersededBy = "evidence/replacement.json";
  attach(root, item, old);
  assert.equal(assess(item, root).ready, false);
  attach(root, item, decision(item, "approved", 2), "replacement.json");
  assert.equal(assess(item, root).ready, true);
}));

test("范围内实现候选变化不使已批准产品决策自动失效", () => inProject((root) => {
  const item = fixture(root);
  attach(root, item, decision(item));
  item.candidate = "implementation-2";
  item.evidence.forEach((entry) => { entry.candidate = item.candidate; });
  assert.equal(assess(item, root).ready, true);
}));

test("产品决策批准不能代替发布上传操作的精确授权", () => inProject((root) => {
  const item = fixture(root);
  attach(root, item, decision(item));
  item.operations.push({ kind: "upload", target: "test-asset", candidate: item.candidate, status: "complete" });
  assert.equal(assess(item, root).ready, false);
}));

test("相同决策对象不能用两份并列批准掩盖修订冲突", () => inProject((root) => {
  const item = fixture(root);
  attach(root, item, decision(item));
  attach(root, item, decision(item, "approved", 2), "parallel.json");
  assert.equal(assess(item, root).ready, false);
}));
