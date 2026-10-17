import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { SKILLS } from "../scripts/catalog.mjs";
import { installSkills } from "../scripts/install-project-skills.mjs";
import { fixture, inProject } from "./helpers.mjs";

test("安装全部技能、引用和控制运行时，可从安装后的目录运行 CLI", () => inProject((root) => {
  assert.equal(installSkills(root).length, SKILLS.length);
  for (const skill of SKILLS) assert.ok(existsSync(join(root, ".agents/skills", skill, "SKILL.md")));
  const cli = join(root, ".agents/skills/roblox-game-workflow-control/scripts/workflow-control.mjs");
  const result = spawnSync(process.execPath, [cli, "init", "--repo", root, "--id", "installed", "--objective", "已安装工具可用"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const projectInit = spawnSync(process.execPath, [cli, "init-project", "--repo", root, "--project-id", "installed-project"], { encoding: "utf8" });
  assert.equal(projectInit.status, 0, projectInit.stderr);
  const projectCheck = spawnSync(process.execPath, [cli, "check-project", "--repo", root], { encoding: "utf8" });
  assert.equal(projectCheck.status, 1, projectCheck.stderr);
  assert.equal(JSON.parse(projectCheck.stdout).ready, false);
  const sceneInit = spawnSync(process.execPath, [cli, "init", "--repo", root, "--id", "installed-scene", "--type", "SCENE", "--objective", "已安装阶段工具冒烟"], { encoding: "utf8" });
  assert.equal(sceneInit.status, 0, sceneInit.stderr);
  const stageStatus = spawnSync(process.execPath, [cli, "stage-status", "--repo", root, "--id", "installed-scene"], { encoding: "utf8" });
  assert.equal(stageStatus.status, 0, stageStatus.stderr);
  assert.equal(JSON.parse(stageStatus.stdout).currentStage, "V0");
  assert.equal(JSON.parse(stageStatus.stdout).canAdvance, false);
  const sceneRecord = JSON.parse(readFileSync(join(root, ".workflow-control/work-items/installed-scene.json"), "utf8"));
  assert.equal(sceneRecord.stageReviews[0].status, "active");
  assert.ok(sceneRecord.visualReview.scenarios.every((scenario) => scenario.visual.result === "NOT_RUN"));
}));

test("先检查全部冲突，拒绝覆盖时不发生部分安装", () => inProject((root) => {
  const existing = join(root, ".agents/skills", SKILLS.at(-1));
  mkdirSync(existing, { recursive: true });
  writeFileSync(join(existing, "keep.txt"), "保留已有修改");
  assert.throws(() => installSkills(root), /拒绝覆盖/);
  assert.equal(readFileSync(join(existing, "keep.txt"), "utf8"), "保留已有修改");
  assert.equal(existsSync(join(root, ".agents/skills", SKILLS[0])), false);
}));

test("安装后的 V2 检查拒绝缺失标注图片及未填写的拆解模板", () => inProject((root) => {
  installSkills(root);
  const item = fixture(root, "SCENE");
  const cli = join(root, ".agents/skills/roblox-game-workflow-control/scripts/workflow-control.mjs");
  const recordDirectory = join(root, ".workflow-control/work-items");
  mkdirSync(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, `${item.id}.json`);
  writeFileSync(recordPath, JSON.stringify(item));
  // 使用已安装入口检查整个阶段链，确保打包后的依赖并非仅在仓库源码路径可用。
  const status = () => spawnSync(process.execPath, [cli, "stage-status", "--repo", root, "--id", item.id], { encoding: "utf8" });
  const valid = status();
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).valid, true, valid.stdout);
  const review = item.stageReviews.find((entry) => entry.stage === "V2");
  const contract = JSON.parse(readFileSync(join(root, review.decompositionRef), "utf8"));
  unlinkSync(join(root, contract.previews[0].path));
  const missing = JSON.parse(status().stdout);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((message) => /V2|拆解/.test(message)), missing.errors.join("\n"));
  review.decompositionRef = ".agents/skills/roblox-development-workflow/assets/templates/visual-decomposition.json";
  writeFileSync(recordPath, JSON.stringify(item));
  const blank = JSON.parse(status().stdout);
  assert.equal(blank.valid, false);
  assert.ok(blank.errors.some((message) => /V2|拆解/.test(message)), blank.errors.join("\n"));
}));

test("安装拒绝目录联接、普通文件和不存在项目", () => inProject((root) => {
  const other = join(root, "real");
  mkdirSync(other);
  symlinkSync(other, join(root, ".agents"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => installSkills(root), /链接/);
  assert.throws(() => installSkills(join(root, "missing")), /不存在|已存在/);
  const file = join(root, "file.txt");
  writeFileSync(file, "普通文件");
  assert.throws(() => installSkills(file), /普通文件/);
}));

test("安装器拒绝未知参数，不把参数错误当作目标目录", () => {
  const result = spawnSync(process.execPath, [resolve("scripts/install-project-skills.mjs"), "--force"], { encoding: "utf8" });
  assert.equal(result.status, 1);
});
