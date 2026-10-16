import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assess } from "../roblox-game-workflow-control/scripts/runtime/contract.mjs";
import { projectPath, writeNewJson } from "../roblox-game-workflow-control/scripts/runtime/io.mjs";
import { createWorkItem } from "../roblox-game-workflow-control/scripts/workflow-control.mjs";
import { fixture, inProject } from "./helpers.mjs";

const cli = resolve("roblox-game-workflow-control/scripts/workflow-control.mjs");

test("初始化不虚构目标、实施或证据，不能通过交付门", () => inProject((root) => {
  const result = assess(createWorkItem("new-game", "新建循环"), root);
  assert.equal(result.ready, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.blockers.some((value) => value.includes("PASS")));
}));

test("当前候选与实际证据齐全时记录检查通过", () => inProject((root) => {
  assert.deepEqual(assess(fixture(root), root), { valid: true, ready: true, errors: [], blockers: [] });
}));

test("过期候选和错误 Studio 不能支撑当前交付", () => inProject((root) => {
  const item = fixture(root, "SCENE");
  item.candidate = "candidate-2";
  assert.equal(assess(item, root).ready, false);
  item.candidate = "candidate-1";
  item.evidence.find((entry) => entry.type === "play").studioId = "other-studio";
  assert.equal(assess(item, root).valid, false);
}));

test("NOT_RUN、缺失、空文件、当前失败和伪造路径均阻断", () => inProject((root) => {
  for (const mode of ["NOT_RUN", "missing", "empty", "failure", "escape"]) {
    const item = fixture(root);
    if (mode === "NOT_RUN") item.evidence[0].result = "NOT_RUN";
    if (mode === "missing") item.evidence[0].path = "evidence/missing.txt";
    if (mode === "empty") writeFileSync(join(root, item.evidence[0].path), "");
    if (mode === "escape") item.evidence[0].path = "../outside.txt";
    if (mode === "failure") item.evidence.push({ ...item.evidence[0], id: "failed", result: "FAIL" });
    assert.equal(assess(item, root).ready, false, mode);
  }
}));

test("可见交付同时需要 V4、运行证据与真实人工确认字段", () => inProject((root) => {
  const item = fixture(root, "SCENE");
  assert.equal(assess(item, root).ready, true);
  item.visualReview.userMessageRef = "";
  assert.equal(assess(item, root).ready, false);
  item.visualReview.userMessageRef = "test-fixture-only";
  item.stage = "V3";
  assert.equal(assess(item, root).ready, false);
  item.stage = "V4";
  item.evidence = item.evidence.filter((entry) => entry.type !== "play");
  assert.equal(assess(item, root).ready, false);
}));

test("显示层不能省略宿主，也不能用单 Play 代替多人证据", () => inProject((root) => {
  const item = fixture(root, "DISPLAY_LAYER");
  item.hostSceneId = "";
  assert.equal(assess(item, root).valid, false);
  item.hostSceneId = "main-scene";
  item.requiredEvidence.push("multiplayer");
  assert.equal(assess(item, root).ready, false);
}));

test("未授权外部动作和没有真实发布证据的发布工作项不能完成", () => inProject((root) => {
  const item = fixture(root);
  item.operations.push({ kind: "upload", target: "测试资源", candidate: item.candidate, status: "planned" });
  assert.equal(assess(item, root).ready, false);
  assert.equal(assess(fixture(root, "RELEASE"), root).ready, false);
}));

test("实施单元不能扩大文件所有权，重复证据 ID 被拒绝", () => inProject((root) => {
  const item = fixture(root);
  item.implementation.units[0].files.push("server/secret.luau");
  assert.equal(assess(item, root).valid, false);
  item.implementation.units[0].files.pop();
  item.evidence.push({ ...item.evidence[0] });
  assert.equal(assess(item, root).valid, false);
}));

test("路径边界拒绝父级、盘符、根目录和目录联接", () => inProject((root) => {
  for (const path of ["../out", "C:\\outside", "/outside", "\\\\server\\share", "."]) {
    assert.throws(() => projectPath(root, path));
  }
  const link = join(root, "linked");
  symlinkSync(root, link, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => projectPath(root, "linked/evidence.json"), /链接/);
}));

test("初始化使用排他创建，不覆盖已有工作项", () => inProject((root) => {
  writeNewJson(root, "item.json", { original: true });
  assert.throws(() => writeNewJson(root, "item.json", { original: false }));
  assert.equal(JSON.parse(readFileSync(join(root, "item.json"))).original, true);
}));

test("CLI 支持 init/status/check；缺证据退出非零且检查不修改工作项", () => inProject((root) => {
  /** 使用当前 Node 解释器运行无网络的控制命令。 */
  const run = (...args) => spawnSync(process.execPath, [cli, ...args, "--repo", root, "--id", "demo"], { encoding: "utf8" });
  assert.equal(run("init", "--objective", "测试目标").status, 0);
  const file = join(root, ".workflow-control/work-items/demo.json");
  const before = readFileSync(file, "utf8");
  assert.equal(run("status").status, 0);
  assert.equal(run("check").status, 1);
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(run("init", "--objective", "不能覆盖").status, 1);
  assert.equal(existsSync(file), true);
  assert.equal(run("status", "--unexpected", "x").status, 1);
}));

test("非法对象返回结构错误，不伪装通过", () => inProject((root) => {
  for (const value of [null, [], "bad", {}]) assert.equal(assess(value, root).valid, false);
  const malformed = fixture(root);
  malformed.scope.files = 123;
  assert.equal(assess(malformed, root).valid, false);
}));

test("编辑模式证据不能替代运行和性能验证", () => inProject((root) => {
  for (const type of ["play", "multiplayer", "performance", "unit", "console"]) {
    const item = fixture(root, "SCENE");
    item.evidence.push({ ...item.evidence[0], id: `edit-${type}`, checkId: undefined, type, datamodel: "Edit" });
    assert.equal(assess(item, root).ready, false, type);
  }
}));

test("纯文件任务可明确不绑定 Studio，引擎证据仍需要真实目标", () => inProject((root) => {
  const item = fixture(root);
  item.target = { sourceOfTruth: "filesystem", studioId: "", placeId: null };
  assert.equal(assess(item, root).ready, true);
  item.requiredEvidence.push("play");
  assert.equal(assess(item, root).ready, false);
}));

test("发布证据必须与精确目标的已授权发布操作对应", () => inProject((root) => {
  const item = fixture(root, "RELEASE");
  const target = "test-universe/test-place/test-version";
  item.evidence.push({ ...item.evidence[0], id: "release", checkId: undefined, type: "release", target });
  assert.equal(assess(item, root).ready, false);
  item.operations.push({ kind: "publish", target: "wrong-place", candidate: item.candidate, userMessageRef: "test-fixture-only", status: "complete" });
  assert.equal(assess(item, root).ready, false);
  item.operations[0].target = target;
  assert.equal(assess(item, root).ready, true);
}));

test("运行中临时实例回读不能替代正式 Edit 实现回读", () => inProject((root) => {
  for (const datamodel of ["Client", "Server"]) {
    const item = fixture(root, "SCENE");
    item.evidence.find((entry) => entry.type === "readback").datamodel = datamodel;
    assert.equal(assess(item, root).ready, false, datamodel);
  }
}));

test("项目CLI排他初始化、只读报告，并以全局完成门决定退出码", () => inProject((root) => {
  /** 项目命令不接受工作项 ID，所有检查只读取临时工程。 */
  const run = (...args) => spawnSync(process.execPath, [cli, ...args, "--repo", root], { encoding: "utf8" });
  assert.equal(run("init-project", "--project-id", "test-project").status, 0);
  const path = join(root, ".workflow-control/project.json");
  const before = readFileSync(path, "utf8");
  assert.equal(JSON.parse(before).multiPlace.enabled, false);
  assert.equal(run("init-project", "--project-id", "test-project").status, 1);
  assert.equal(run("status-project").status, 0);
  assert.equal(run("check-project").status, 1);
  assert.equal(readFileSync(path, "utf8"), before);
  assert.equal(run("check-project", "--id", "ignored").status, 1);

  const production = fixture(root);
  production.state = "complete";
  const integration = fixture(root, "INTEGRATION");
  integration.id = "final-integration";
  integration.phase = "integration";
  integration.state = "complete";
  integration.dependsOn = [{ workItemId: production.id, candidate: production.candidate }];
  integration.evidence.forEach((entry) => { entry.workItemId = integration.id; });
  writeNewJson(root, `.workflow-control/work-items/${production.id}.json`, production);
  writeNewJson(root, `.workflow-control/work-items/${integration.id}.json`, integration);
  const project = JSON.parse(before);
  project.workItems = [production, integration].map(({ id, candidate }) => ({ id, candidate }));
  project.integrationWorkItemId = integration.id;
  writeFileSync(path, JSON.stringify(project));
  const complete = run("check-project");
  assert.equal(complete.status, 0, complete.stdout + complete.stderr);
  assert.equal(JSON.parse(complete.stdout).ready, true);
  production.state = "validating";
  writeFileSync(join(root, `.workflow-control/work-items/${production.id}.json`), JSON.stringify(production));
  assert.equal(run("check-project").status, 1);
}));
