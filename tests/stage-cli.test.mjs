import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { inProject } from "./helpers.mjs";
import { replaceJson } from "../roblox-game-workflow-control/scripts/runtime/io.mjs";

const cli = resolve("roblox-game-workflow-control/scripts/workflow-control.mjs");

/** 只在隔离工程调用真实 CLI，不连接 Studio 或代填真实用户判断。 */
function run(root, command, ...args) {
  return spawnSync(process.execPath, [cli, command, "--repo", root, "--id", "scene", ...args], { encoding: "utf8" });
}

/** 读取 CLI 实际保存的工作项，避免用内存模型冒充文件推进结果。 */
function load(root) { return JSON.parse(readFileSync(join(root, ".workflow-control/work-items/scene.json"), "utf8")); }

/** 填写当前阶段的测试交付；mock 用户来源只存在于测试目录。 */
function delivery(root, stage, userMessageRef = "") {
  mkdirSync(join(root, "docs"), { recursive: true });
  const path = `docs/${stage}.json`;
  const template = run(root, "stage-template", "--output", path);
  assert.equal(template.status, 0, template.stderr);
  const result = JSON.parse(readFileSync(join(root, path), "utf8"));
  result.path = "docs/stage-deliveries.md";
  result.section = stage;
  writeFileSync(join(root, result.path), `# ${stage}\n\n${stage} 的测试交付正文，仅测试记录结构。\n\n`, { flag: stage === "V0" ? "w" : "a" });
  result.deliverables.forEach((entry) => { entry.summary = `测试交付 ${entry.id}`; });
  result.exitChecks.forEach((entry) => { entry.result = "PASS"; entry.basis = `测试核对 ${entry.id}`; });
  result.presentedRef = `test-presentation-${stage}`;
  result.nextAction = "测试下一阶段";
  result.userMessageRef = userMessageRef;
  writeFileSync(join(root, path), JSON.stringify(result));
  return path;
}

test("CLI初始化两类可见工作项为active V0且人工结果均NOT_RUN", () => {
  for (const type of ["SCENE", "DISPLAY_LAYER"]) inProject((root) => {
    const initialized = run(root, "init", "--type", type, "--objective", "测试阶段初始化");
    assert.equal(initialized.status, 0, initialized.stderr);
    const item = load(root);
    assert.equal(item.stage, "V0");
    assert.deepEqual(item.stageReviews.map((review) => review.stage), ["V0"]);
    assert.equal(item.stageReviews[0].status, "active");
    assert.equal(item.stageReviews[0].completedAt, null);
    assert.ok(Object.values(item.visualReview.qualityResults).every((entry) => entry.status === "NOT_RUN"));
    assert.ok(item.visualReview.scenarios.every((entry) => entry.visual.result === "NOT_RUN"));
  });
});

test("CLI模板不改阶段，deliverables可逐阶段推进且拒绝直接指定V4", () => inProject((root) => {
  assert.equal(run(root, "init", "--type", "SCENE", "--objective", "测试逐步推进").status, 0);
  const original = JSON.stringify(load(root));
  assert.equal(run(root, "advance-stage").status, 1);
  assert.equal(run(root, "advance-stage", "--stage", "V4").status, 1);
  for (const stage of ["V0", "V1", "V2"]) {
    const before = JSON.stringify(load(root));
    const path = delivery(root, stage);
    assert.equal(JSON.stringify(load(root)), before);
    assert.equal(run(root, "complete-stage", "--delivery", path).status, 0);
    assert.equal(load(root).stageReviews.at(-1).status, "complete");
    assert.equal(run(root, "advance-stage").status, 0);
  }
  const item = load(root);
  assert.equal(item.stage, "V3");
  assert.deepEqual(item.stageReviews.map((review) => review.status), ["complete", "complete", "complete", "active"]);
  assert.notEqual(JSON.stringify(item), original);
  assert.equal(run(root, "advance-stage").status, 1);
}));

test("CLI manual缺确认时不保存完成，拒绝交付输入夹带stage或时间", () => inProject((root) => {
  run(root, "init", "--type", "SCENE", "--objective", "测试人工门");
  const itemPath = join(root, ".workflow-control/work-items/scene.json");
  const item = load(root);
  item.stagePolicy = "manual";
  writeFileSync(itemPath, JSON.stringify(item));
  const path = delivery(root, "V0");
  const before = readFileSync(itemPath, "utf8");
  assert.equal(run(root, "complete-stage", "--delivery", path).status, 1);
  assert.equal(readFileSync(itemPath, "utf8"), before);
  const input = JSON.parse(readFileSync(join(root, path), "utf8"));
  input.userMessageRef = "test-only-user-confirmation";
  input.stage = "V4";
  writeFileSync(join(root, path), JSON.stringify(input));
  assert.equal(run(root, "complete-stage", "--delivery", path).status, 1);
  delete input.stage;
  writeFileSync(join(root, path), JSON.stringify(input));
  assert.equal(run(root, "complete-stage", "--delivery", path).status, 0);
  assert.equal(run(root, "advance-stage").status, 0);
}));

test("证据汇总只读，不从技术PASS生成阶段完成或人工PASS", () => inProject((root) => {
  run(root, "init", "--type", "SCENE", "--objective", "测试安全汇总");
  const path = join(root, ".workflow-control/work-items/scene.json");
  const item = load(root);
  item.evidence = [{ id: "technical-play", type: "play", candidate: item.candidate, result: "PASS", path: "reports/play.txt" }];
  writeFileSync(path, JSON.stringify(item));
  const before = readFileSync(path, "utf8");
  const output = run(root, "evidence-summary");
  assert.equal(output.status, 0, output.stderr);
  const summary = JSON.parse(output.stdout);
  assert.equal(summary.technical[0].result, "PASS");
  assert.equal(summary.stage, "V0");
  assert.ok(summary.visual.scenarios.every((scenario) => scenario.visual.result === "NOT_RUN"));
  assert.equal(readFileSync(path, "utf8"), before);
}));

test("原子替换拒绝陈旧原文并保留文件，不残留锁或临时文件", () => inProject((root) => {
  const path = join(root, "record.json");
  writeFileSync(path, '{"revision":1}\n');
  assert.throws(() => replaceJson(root, "record.json", "stale", { revision: 2 }), /已变化/);
  assert.equal(readFileSync(path, "utf8"), '{"revision":1}\n');
  replaceJson(root, "record.json", readFileSync(path, "utf8"), { revision: 2 });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { revision: 2 });
  assert.deepEqual(readdirSync(root), ["record.json"]);
}));
