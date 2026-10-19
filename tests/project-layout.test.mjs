import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, parse, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { checkProjectLayout, initializeProjectLayout } from "../roblox-development-workflow/scripts/runtime/project-layout.mjs";
import { inProject } from "./helpers.mjs";

const cli = resolve("roblox-development-workflow/scripts/workflow-files.mjs");
const EXPECTED_DIRECTORIES = [
  "docs",
  ".tmp",
  "artifacts",
  "artifacts/candidates",
  "artifacts/approved",
  "assets",
  ".workflow-control",
  ".workflow-control/work-items",
  ".workflow-control/records",
  ".workflow-control/evidence",
  ".workflow-control/archive",
];

test("目录初始化创建约定路径、保留现有内容并保持幂等", () => inProject((root) => {
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "existing.txt"), "保留内容\n");

  const created = initializeProjectLayout({ repo: root });
  assert.deepEqual(created, EXPECTED_DIRECTORIES.filter((path) => path !== "assets"));
  for (const path of EXPECTED_DIRECTORIES) assert.equal(lstatSync(join(root, path)).isDirectory(), true, path);
  assert.equal(readFileSync(join(root, "assets", "existing.txt"), "utf8"), "保留内容\n");
  assert.deepEqual(initializeProjectLayout({ repo: root }), []);
}));

test("目录初始化在发现后续文件冲突时不创建任何目录", () => inProject((root) => {
  writeFileSync(join(root, "assets"), "现有文件\n");
  assert.throws(() => initializeProjectLayout({ repo: root }), /不是目录：assets/);
  assert.equal(existsSync(join(root, "docs")), false);
  assert.equal(readFileSync(join(root, "assets"), "utf8"), "现有文件\n");
}));

test("目录初始化在发现后续链接时拒绝写入且不跟随链接", () => inProject((root) => {
  const outside = join(root, "linked-target");
  mkdirSync(outside);
  symlinkSync(outside, join(root, ".workflow-control"), process.platform === "win32" ? "junction" : "dir");

  assert.throws(() => initializeProjectLayout({ repo: root }), /链接/);
  assert.equal(existsSync(join(root, "docs")), false);
  assert.deepEqual(readdirSync(outside), []);
}));

/** 注入 mkdirSync 中途失败，验证只回滚空目录且保留外部内容与原始错误。 */
test("mkdir 中途失败按逆序回滚空目录并保留非空目录、已有文件和错误", () => inProject((root) => {
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs", "preserved.txt"), "既有内容\n");

  const injector = join(root, "inject-mkdir-failure.cjs");
  const rollbackLog = join(root, "rollback-order.txt");
  const injectorSource = [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const { syncBuiltinESMExports } = require("node:module");',
    "const originalMkdirSync = fs.mkdirSync.bind(fs);",
    "const originalRmdirSync = fs.rmdirSync.bind(fs);",
    "const originalWriteFileSync = fs.writeFileSync.bind(fs);",
    "let mkdirCalls = 0;",
    "fs.mkdirSync = (target, ...args) => {",
    "  mkdirCalls += 1;",
    '  if (mkdirCalls === Number(process.env.WORKFLOW_LAYOUT_FAIL_MKDIR_AFTER || "4")) {',
    '    const preserved = path.join(process.env.WORKFLOW_LAYOUT_REPO, "artifacts", "candidates", "external.txt");',
    '    originalWriteFileSync(preserved, "external content\\n");',
    '    const error = new Error("injected mid-mkdir failure");',
    '    error.code = "EIO";',
    "    throw error;",
    "  }",
    "  return originalMkdirSync(target, ...args);",
    "};",
    "fs.rmdirSync = (target, ...args) => {",
    '  originalWriteFileSync(process.env.WORKFLOW_LAYOUT_ROLLBACK_LOG, `${target}\\n`, { flag: "a" });',
    "  return originalRmdirSync(target, ...args);",
    "};",
    "syncBuiltinESMExports();",
  ].join("\n");
  writeFileSync(injector, injectorSource);

  const result = spawnSync(process.execPath, ["--require", injector, cli, "init-layout", "--repo", root], {
    encoding: "utf8",
    env: {
      ...process.env,
      WORKFLOW_LAYOUT_FAIL_MKDIR_AFTER: "4",
      WORKFLOW_LAYOUT_REPO: root,
      WORKFLOW_LAYOUT_ROLLBACK_LOG: rollbackLog,
    },
  });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /injected mid-mkdir failure/);

  const rollbackOrder = readFileSync(rollbackLog, "utf8").trim().split(/\r?\n/)
    .map((path) => relative(root, path).replace(/\\/g, "/"));
  assert.deepEqual(rollbackOrder, ["artifacts/candidates", "artifacts", ".tmp"]);
  assert.equal(existsSync(join(root, ".tmp")), false);
  assert.equal(existsSync(join(root, "artifacts/approved")), false);
  assert.equal(existsSync(join(root, "assets")), false);
  assert.equal(existsSync(join(root, ".workflow-control")), false);
  assert.deepEqual(readdirSync(join(root, "artifacts")), ["candidates"]);
  assert.deepEqual(readdirSync(join(root, "artifacts/candidates")), ["external.txt"]);
  assert.equal(readFileSync(join(root, "artifacts/candidates/external.txt"), "utf8"), "external content\n");
  assert.equal(readFileSync(join(root, "docs/preserved.txt"), "utf8"), "既有内容\n");
}));

test("只读检查区分缺失目录与路径冲突，并保持项目内容不变", () => inProject((root) => {
  const missing = checkProjectLayout({ repo: root });
  assert.equal(missing.valid, true);
  assert.equal(missing.ready, false);
  assert.equal(missing.errors.length, 0);
  assert.deepEqual(missing.blockers, EXPECTED_DIRECTORIES.map((path) => `缺少约定目录：${path}`));
  assert.ok(missing.notices.some((entry) => entry.includes("不代表产物已确认")));
  assert.equal(existsSync(join(root, "docs")), false);

  initializeProjectLayout({ repo: root });
  writeFileSync(join(root, "assets", "keep.txt"), "只读检查不改此文件\n");
  const before = readFileSync(join(root, "assets", "keep.txt"), "utf8");
  const ready = checkProjectLayout({ repo: root });
  assert.equal(ready.valid, true);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.errors, []);
  assert.deepEqual(ready.blockers, []);
  assert.equal(readFileSync(join(root, "assets", "keep.txt"), "utf8"), before);

  rmdirSync(join(root, "artifacts", "approved"));
  writeFileSync(join(root, "artifacts", "approved"), "文件冲突\n");
  const conflict = checkProjectLayout({ repo: root });
  assert.equal(conflict.valid, false);
  assert.equal(conflict.ready, false);
  assert.ok(conflict.errors.some((entry) => entry.includes("artifacts/approved") && entry.includes("不是目录")));
  assert.equal(readFileSync(join(root, "assets", "keep.txt"), "utf8"), before);

  const linkedEvidence = join(root, ".workflow-control", "evidence");
  rmdirSync(linkedEvidence);
  symlinkSync(join(root, "assets"), linkedEvidence, process.platform === "win32" ? "junction" : "dir");
  const linked = checkProjectLayout({ repo: root });
  assert.equal(linked.valid, false);
  assert.ok(linked.errors.some((entry) => entry.includes("链接")));
}));

test("目录检查将项目根链接或根目录错误转换成报告", () => inProject((root) => {
  const linkedRoot = join(root, "linked-root");
  symlinkSync(root, linkedRoot, process.platform === "win32" ? "junction" : "dir");
  const result = checkProjectLayout({ repo: linkedRoot });
  assert.equal(result.valid, false);
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((entry) => entry.includes("链接")));

  const rootResult = checkProjectLayout({ repo: parse(root).root });
  assert.equal(rootResult.valid, false);
  assert.equal(rootResult.ready, false);
  assert.ok(rootResult.errors.some((entry) => entry.includes("文件系统根目录")));
}));

test("目录 CLI 输出检查报告并严格限制参数", () => inProject((root) => {
  const missing = spawnSync(process.execPath, [cli, "check-layout", "--repo", root], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).ready, false);

  const init = spawnSync(process.execPath, [cli, "init-layout", "--repo", root], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  assert.ok(init.stdout.includes(".workflow-control/work-items"));

  const check = spawnSync(process.execPath, [cli, "check-layout", "--repo", root], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).ready, true);

  const unknown = spawnSync(process.execPath, [cli, "check-layout", "--repo", root, "--include", "assets"], { encoding: "utf8" });
  assert.notEqual(unknown.status, 0);
  assert.ok(unknown.stderr.includes("未知参数"));

  const missingRepo = spawnSync(process.execPath, [cli, "init-layout"], { encoding: "utf8" });
  assert.notEqual(missingRepo.status, 0);
  assert.ok(missingRepo.stderr.includes("缺少参数：--repo"));
}));
