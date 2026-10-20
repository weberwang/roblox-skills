import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { addOptionalProjectDocs, checkProjectDocs, initializeProjectDocs } from "../roblox-development-workflow/scripts/runtime/project-artifacts.mjs";
import { writeTestPng } from "./decomposition-fixture.mjs";
import { fixture, inProject } from "./helpers.mjs";

const cli = resolve("roblox-development-workflow/scripts/workflow-files.mjs");

/** 只在测试夹具中写入各章节的实际语义正文，不把模板占位词替换成泛化套话。 */
function fillReadyMarkdown(content, sections) {
  const lines = content.replace("状态：unconfigured", "状态：ready").split(/\r?\n/);
  for (const [heading, paragraph] of Object.entries(sections)) {
    const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
    assert.notEqual(start, -1, `找不到测试章节：${heading}`);
    const next = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
    const end = next < 0 ? lines.length : next;
    lines.splice(start + 1, end - start - 1, "", paragraph, "");
  }
  return lines.join("\n");
}

/** 构造已获许可且引用真实项目内文件的 ready 资源记录。 */
function readyAsset() {
  return {
    id: "asset-rock",
    type: "mesh",
    owner: "art-owner",
    revision: 1,
    status: "ready",
    source: { kind: "official-page", uri: "https://www.roblox.com/", evidenceRef: "evidence/source.txt" },
    license: { status: "approved", evidenceRef: "evidence/license.txt" },
    assetId: "123456",
    instancePath: null,
    consumers: [{ workItemId: "work-1", candidate: "candidate-1", revision: 1, state: "active", nodePath: "game.Workspace.Rock" }],
    evidenceRefs: ["evidence/asset-check.txt"],
  };
}

test("初始化核心文档为空白真实档案，结构有效但未配置时不能 ready", () => inProject((root) => {
  const created = initializeProjectDocs({ repo: root, projectId: "demo-game" });
  assert.deepEqual(created, ["docs/project-profile.json", "docs/GDD.md", "docs/TDD.md", "docs/module-manifest.json"]);
  const result = checkProjectDocs({ repo: root });
  assert.equal(result.valid, true);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((entry) => entry.includes("unconfigured")));
  assert.ok(result.notices.some((entry) => entry.includes("不證明") || entry.includes("不证明")));
  assert.deepEqual(JSON.parse(readFileSync(join(root, "docs/module-manifest.json"), "utf8")), { version: 1, modules: [] });
}));

/** 拒绝仅有合法标题但没有正文的 ready 章节，包括一级标题与收尾井号写法。 */
test("Markdown ready 章节解析标题层级一致且不接受空正文", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo" });
  const headings = ["体验概述", "核心循环", "玩家目标与成长", "范围与非目标", "验收标准"];
  const markdown = [
    "# 游戏设计文档",
    "",
    "状态：ready",
    "",
    ...headings.flatMap((heading, index) => [`# ${heading} #`, ...(index === 0 ? ["### 仅有嵌套标题"] : []), ""]),
  ].join("\n");
  writeFileSync(join(root, "docs/GDD.md"), markdown);

  const result = checkProjectDocs({ repo: root });
  assert.equal(result.valid, false);
  for (const heading of headings) {
    assert.ok(result.errors.some((entry) => entry.includes(`“${heading}”章节没有实际正文`)), heading);
  }
}));

/** 确保模板里的“待记录”正文不能因状态字段改成 ready 而被误认为已完成。 */
test("Markdown ready 文档拒绝待记录等模板占位正文", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo" });
  const path = join(root, "docs/TDD.md");
  const template = readFileSync(path, "utf8");
  writeFileSync(path, template.replace("状态：unconfigured", "状态：ready"));

  const result = checkProjectDocs({ repo: root });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes("待填写、待记录或其他未落实的占位正文")));
}));

test("QA 模板的操作提示不能代替实际视觉验收范围", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo", include: ["qa"] });
  const path = join(root, "docs/qa-plan.md");
  const ready = fillReadyMarkdown(readFileSync(path, "utf8"), {
    "测试范围": "本轮验证新玩家完成采集、返回营地并升级设施的主流程。",
    "Studio 检查": "在 Studio 中检查资源计数、升级提示和服务器奖励校验。",
    "设备与输入覆盖": "覆盖 Windows 桌面键鼠及 iPad 触控输入。",
  });
  writeFileSync(path, ready);

  const result = checkProjectDocs({ repo: root });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes("“人工视觉验收”仍含")));
}));

/** 注入部分写入后的 ENOSPC，验证 init-docs 与 add-docs 均清理失败文件并可重试。 */
test("中途写入失败不留半文件，init-docs 与 add-docs 均可重试", () => inProject((root) => {
  const injector = join(root, "inject-enospc.cjs");
  const injectorSource = [
    'const fs = require("node:fs");',
    'const { syncBuiltinESMExports } = require("node:module");',
    "const originalWriteFileSync = fs.writeFileSync.bind(fs);",
    'let remaining = Number(process.env.WORKFLOW_FAIL_WRITE_AFTER || "1");',
    "fs.writeFileSync = (target, data, options) => {",
    "  if (typeof target === \"number\") {",
    "    remaining -= 1;",
    "    if (remaining === 0) {",
    "      const partial = typeof data === \"string\" ? data.slice(0, Math.max(1, Math.floor(data.length / 2))) : Buffer.from(data).subarray(0, Math.max(1, Math.floor(data.length / 2)));",
    "      originalWriteFileSync(target, partial, options);",
    '      const error = new Error("injected ENOSPC"); error.code = "ENOSPC"; throw error;',
    "    }",
    "  }",
    "  return originalWriteFileSync(target, data, options);",
    "};",
    "syncBuiltinESMExports();",
  ].join("\n");
  writeFileSync(injector, injectorSource);

  const initArgs = [cli, "init-docs", "--repo", root, "--project-id", "demo"];
  const initFailure = spawnSync(process.execPath, ["--require", injector, ...initArgs], {
    encoding: "utf8",
    env: { ...process.env, WORKFLOW_FAIL_WRITE_AFTER: "2" },
  });
  assert.equal(initFailure.status, 1, `${initFailure.stdout}\n${initFailure.stderr}`);
  assert.match(`${initFailure.stdout}\n${initFailure.stderr}`, /injected ENOSPC/);
  assert.equal(existsSync(join(root, "docs")), false);

  const initRetry = spawnSync(process.execPath, initArgs, { encoding: "utf8" });
  assert.equal(initRetry.status, 0, `${initRetry.stdout}\n${initRetry.stderr}`);
  assert.ok(existsSync(join(root, "docs/GDD.md")));

  const profilePath = join(root, "docs/project-profile.json");
  const profileBefore = readFileSync(profilePath, "utf8");
  const addArgs = [cli, "add-docs", "--repo", root, "--project-id", "demo", "--include", "qa,release"];
  const addFailure = spawnSync(process.execPath, ["--require", injector, ...addArgs], {
    encoding: "utf8",
    env: { ...process.env, WORKFLOW_FAIL_WRITE_AFTER: "1" },
  });
  assert.equal(addFailure.status, 1, `${addFailure.stdout}\n${addFailure.stderr}`);
  assert.match(`${addFailure.stdout}\n${addFailure.stderr}`, /injected ENOSPC/);
  assert.equal(existsSync(join(root, "docs/qa-plan.md")), false);
  assert.equal(existsSync(join(root, "docs/release-checklist.md")), false);
  assert.equal(readFileSync(profilePath, "utf8"), profileBefore);

  const addRetry = spawnSync(process.execPath, addArgs, { encoding: "utf8" });
  assert.equal(addRetry.status, 0, `${addRetry.stdout}\n${addRetry.stderr}`);
  assert.ok(existsSync(join(root, "docs/qa-plan.md")));
  assert.ok(existsSync(join(root, "docs/release-checklist.md")));
}));

test("预检所有目标后再写入，冲突时不留下部分初始化文档", () => inProject((root) => {
  const existing = join(root, "docs", "asset-register.json");
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(existing, "keep me\n");
  assert.throws(() => initializeProjectDocs({ repo: root, projectId: "demo", include: ["assets"] }), /拒绝覆盖/);
  assert.equal(existsSync(join(root, "docs/project-profile.json")), false);
  assert.equal(existsSync(join(root, "docs/GDD.md")), false);
  assert.equal(readFileSync(existing, "utf8"), "keep me\n");
}));

test("CLI 可从技能目录直接运行，拒绝覆盖开关并报告初始状态", () => inProject((root) => {
  const init = spawnSync(process.execPath, [cli, "init-docs", "--repo", root, "--project-id", "cli-demo", "--include", "visual,assets,qa,release"], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const check = spawnSync(process.execPath, [cli, "check-docs", "--repo", root, "--include", "visual,assets,qa,release"], { encoding: "utf8" });
  assert.equal(check.status, 1);
  const report = JSON.parse(check.stdout);
  assert.equal(report.valid, true);
  assert.equal(report.ready, false);
  assert.ok(existsSync(join(root, "docs/visual-baseline.json")));
  assert.ok(existsSync(join(root, "docs/asset-register.json")));
  assert.ok(existsSync(join(root, "docs/qa-plan.md")));
  assert.ok(existsSync(join(root, "docs/release-checklist.md")));
  const force = spawnSync(process.execPath, [cli, "init-docs", "--repo", root, "--project-id", "other", "--force"], { encoding: "utf8" });
  assert.equal(force.status, 1);
  assert.match(force.stderr, /未知参数/);
}));

test("核心初始化后可单独添加可选文档且不会重写核心", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo" });
  const profilePath = join(root, "docs/project-profile.json");
  const profileBefore = readFileSync(profilePath, "utf8");
  const added = spawnSync(process.execPath, [cli, "add-docs", "--repo", root, "--project-id", "demo", "--include", "assets,qa"], { encoding: "utf8" });
  assert.equal(added.status, 0, added.stderr);
  assert.ok(existsSync(join(root, "docs/asset-register.json")));
  assert.ok(existsSync(join(root, "docs/qa-plan.md")));
  assert.equal(readFileSync(profilePath, "utf8"), profileBefore);

  const collision = spawnSync(process.execPath, [cli, "add-docs", "--repo", root, "--project-id", "demo", "--include", "assets,release"], { encoding: "utf8" });
  assert.equal(collision.status, 1);
  assert.ok(!existsSync(join(root, "docs/release-checklist.md")));
  assert.equal(readFileSync(profilePath, "utf8"), profileBefore);
  assert.throws(() => addOptionalProjectDocs({ repo: root, projectId: "other", include: ["visual"] }), /项目档案无效/);
  assert.ok(!existsSync(join(root, "docs/visual-baseline.json")));
}));

test("ready 档案必须填写真实 Studio、设备、输入与项目内来源证据", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo" });
  const profilePath = join(root, "docs/project-profile.json");
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  profile.status = "ready";
  profile.studio = { experienceName: "unknown", universeId: null, placeId: null, instanceName: "", sourceOfTruth: "unknown", syncTool: "" };
  profile.devices = [];
  profile.inputs = [];
  profile.sourceData = [];
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  let result = checkProjectDocs({ repo: root });
  assert.equal(result.valid, false);
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((entry) => entry.includes("experienceName")));
  assert.ok(result.errors.some((entry) => entry.includes("sourceData")));

  profile.studio.universeId = "0";
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  result = checkProjectDocs({ repo: root });
  assert.ok(result.errors.some((entry) => entry.includes("universeId")));

  profile.studio = { experienceName: "Demo", universeId: 0, placeId: 0, instanceName: "Studio 1", sourceOfTruth: "studio", syncTool: "Rojo" };
  profile.devices = ["Windows desktop"];
  profile.inputs = ["keyboard and mouse"];
  profile.sourceData = [{ kind: "studio-readback", uri: "place-export", evidenceRef: "evidence/missing-readback.txt" }];
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  result = checkProjectDocs({ repo: root });
  assert.ok(result.errors.some((entry) => entry.includes("missing-readback.txt")));

  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(join(root, "evidence/source.txt"), "Studio 回读记录：UniverseId=0; PlaceId=0\n");
  profile.studio = { experienceName: "Demo", universeId: 0, placeId: 0, instanceName: "Studio 1", sourceOfTruth: "studio", syncTool: "Rojo" };
  profile.devices = ["Windows desktop"];
  profile.inputs = ["keyboard and mouse"];
  profile.sourceData = [{ kind: "studio-readback", uri: "place-export", evidenceRef: "evidence/source.txt" }];
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  for (const name of ["GDD.md", "TDD.md"]) {
    const path = join(root, "docs", name);
    const sections = name === "GDD.md" ? {
      "体验概述": "玩家在连续海岛群中进行短时探索，收集材料并扩建营地。",
      "核心循环": "玩家选择探索区域、收集资源、避开危险，随后返回营地解锁设施。",
      "玩家目标与成长": "完成区域目标可解锁新区域，营地设施则提供新的探索工具。",
      "范围与非目标": "当前版本包含单人探索、三类采集物与基础营地升级，不包含交易或跨服竞技。",
      "验收标准": "新玩家能完成一次采集，并在返回营地后看到资源计数和升级提示。",
    } : {
      "源数据与工程入口": "工程以 Rojo 同步目录为文件来源；Studio DataModel 回读快照记录在 evidence/source.txt。",
      "模块边界与所有权": "服务端模块分别负责存档、奖励与区域规则，依赖关系记载于 module-manifest.json。",
      "客户端与服务器职责": "服务端校验奖励和解锁条件；客户端只处理输入、界面与特效。",
      "Remote 与数据契约": "RemoteEvent 请求包含操作名和区域标识；服务端校验玩家权限并按玩家限频。",
      "生命周期与持久化": "PlayerAdded 时读取进度，PlayerRemoving 时保存；保存失败触发有限次数重试并记录错误。",
    };
    const configured = fillReadyMarkdown(readFileSync(path, "utf8"), sections);
    writeFileSync(path, configured);
  }
  const before = readFileSync(profilePath, "utf8");
  result = checkProjectDocs({ repo: root });
  assert.equal(result.valid, true);
  assert.equal(result.ready, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.blockers, []);
  assert.equal(readFileSync(profilePath, "utf8"), before);
}));

test("档案 projectId 必须保持字符串类型，check-docs 与 add-docs 都拒绝数值 ID", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "123" });
  const profilePath = join(root, "docs/project-profile.json");
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  profile.projectId = 123;
  writeFileSync(profilePath, JSON.stringify(profile, null, 2) + "\n");

  const checked = checkProjectDocs({ repo: root });
  assert.equal(checked.valid, false);
  assert.ok(checked.errors.some((entry) => entry.includes("project-profile.projectId")));
  assert.throws(() => addOptionalProjectDocs({ repo: root, projectId: "123", include: ["qa"] }), /核心项目档案无效/);
  assert.equal(existsSync(join(root, "docs/qa-plan.md")), false);
}));

test("模块清单检查唯一 ID、依赖闭环、路径边界和 game. 实例路径", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo" });
  const manifestPath = join(root, "docs/module-manifest.json");
  const manifest = {
    version: 1,
    modules: [
      { id: "core", owner: "server", responsibility: "基础状态", dependencies: ["gameplay"], files: ["src/core.luau"], instances: ["game.ServerScriptService.Core"] },
      { id: "gameplay", owner: "server", responsibility: "玩法规则", dependencies: ["core"], files: ["src/gameplay.luau"], instances: ["game.ServerScriptService.Gameplay"] },
    ],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  let result = checkProjectDocs({ repo: root });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes("依赖存在循环")));

  manifest.modules[0].dependencies = [];
  manifest.modules[0].files = ["../outside.luau"];
  manifest.modules[1].instances = ["Workspace.Gameplay"];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  result = checkProjectDocs({ repo: root });
  assert.ok(result.errors.some((entry) => entry.includes("路径无效")));
  assert.ok(result.errors.some((entry) => entry.includes("game.")));

  manifest.modules[1].instances = ["game.ServerScriptService.Gameplay"];
  manifest.modules[1].dependencies = ["missing"];
  manifest.modules.push({ ...manifest.modules[0], dependencies: [], files: [], instances: [] });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  result = checkProjectDocs({ repo: root });
  assert.ok(result.errors.some((entry) => entry.includes("不存在的模块")));
  assert.ok(result.errors.some((entry) => entry.includes("模块 ID 重复")));
}));

test("ready 资源拒绝 pending 许可、伪造证据、重复消费者和缺失资产身份", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo", include: ["assets"] });
  const registerPath = join(root, "docs/asset-register.json");
  const register = JSON.parse(readFileSync(registerPath, "utf8"));
  const asset = readyAsset();
  asset.license.status = "pending";
  register.assets = [asset];
  writeFileSync(registerPath, `${JSON.stringify(register, null, 2)}\n`);
  let result = checkProjectDocs({ repo: root, include: ["assets"] });
  assert.ok(result.errors.some((entry) => entry.includes("approved")));
  assert.ok(result.errors.some((entry) => entry.includes("source.evidenceRef")));

  mkdirSync(join(root, "evidence"), { recursive: true });
  for (const name of ["source.txt", "license.txt", "asset-check.txt"]) writeFileSync(join(root, "evidence", name), `真实本地证据：${name}\n`);
  asset.license.status = "approved";
  asset.consumers.push({ ...asset.consumers[0] });
  asset.assetId = null;
  asset.instancePath = null;
  writeFileSync(registerPath, `${JSON.stringify(register, null, 2)}\n`);
  result = checkProjectDocs({ repo: root, include: ["assets"] });
  assert.ok(result.errors.some((entry) => entry.includes("重复引用")));
  assert.ok(result.errors.some((entry) => entry.includes("Asset ID 或 game.")));

  asset.consumers.pop();
  asset.assetId = "123456";
  writeFileSync(registerPath, `${JSON.stringify(register, null, 2)}\n`);
  result = checkProjectDocs({ repo: root, include: ["assets"] });
  assert.equal(result.valid, true);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((entry) => entry.includes("unconfigured")));
}));

test("初始化与证据读取拒绝链接根目录和链接目标", () => inProject((root) => {
  fixture(root);
  const linkedRoot = join(root, "linked-root");
  symlinkSync(root, linkedRoot, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => initializeProjectDocs({ repo: linkedRoot, projectId: "demo" }), /链接/);

  initializeProjectDocs({ repo: root, projectId: "demo", include: ["assets"] });
  const linked = join(root, "docs", "linked-evidence.txt");
  symlinkSync(join(root, "docs", "GDD.md"), linked, "file");
  mkdirSync(join(root, "docs"), { recursive: true });
  const profilePath = join(root, "docs/project-profile.json");
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  profile.status = "ready";
  profile.studio = { experienceName: "Demo", universeId: 1, placeId: 2, instanceName: "Studio", sourceOfTruth: "filesystem", syncTool: "" };
  profile.devices = ["desktop"];
  profile.inputs = ["keyboard"];
  profile.sourceData = [{ kind: "source", uri: "source", evidenceRef: "docs/linked-evidence.txt" }];
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  const result = checkProjectDocs({ repo: root, include: ["assets"] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes("链接")));
}));

test("JSON null 根对象不能被当成读取失败而静默跳过", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo", include: ["assets", "visual"] });
  const profile = join(root, "docs/project-profile.json");
  const manifest = join(root, "docs/module-manifest.json");
  const assets = join(root, "docs/asset-register.json");
  const visual = join(root, "docs/visual-baseline.json");
  for (const [path, include] of [[profile, []], [manifest, []], [assets, ["assets"]], [visual, ["visual"]]]) {
    const before = readFileSync(path, "utf8");
    writeFileSync(path, "null\n");
    const result = checkProjectDocs({ repo: root, include });
    assert.equal(result.valid, false, path);
    writeFileSync(path, before);
  }
}));

test("默认自动检查已有可选文档，include 则要求所选文档存在", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo" });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs/asset-register.json"), "null\n");
  const discovered = checkProjectDocs({ repo: root });
  assert.equal(discovered.valid, false);
  assert.ok(discovered.errors.some((entry) => entry.includes("asset-register.json")));

  const required = checkProjectDocs({ repo: root, include: ["qa"] });
  assert.equal(required.valid, false);
  assert.ok(required.errors.some((entry) => entry.includes("qa-plan.md")));
}));

/** 验证 ready 视觉基线不能缺少实际简报、用户消息引用和本地证据。 */
test("ready 视觉基线必须有完整真实 brief、用户消息引用和证据", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo", include: ["visual"] });
  const visualPath = join(root, "docs/visual-baseline.json");
  const evidencePath = join(root, "evidence/visual-baseline.txt");
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(evidencePath, "用户确认的视觉基线证据。\n");

  const visual = JSON.parse(readFileSync(visualPath, "utf8"));
  visual.status = "ready";
  visual.targets = ["桌面端 HUD 的可读性目标"];
  visual.evidenceRefs = ["evidence/visual-baseline.txt"];
  writeFileSync(visualPath, `${JSON.stringify(visual, null, 2)}\n`);

  const incomplete = checkProjectDocs({ repo: root });
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.errors.some((entry) => entry.includes("artBrief.theme")));
  assert.ok(incomplete.errors.some((entry) => entry.includes("userMessageRef")));

  visual.artBrief = {
    theme: "清爽的海岛冒险",
    audience: "偏好短局探索的玩家",
    coreLoop: "探索、收集、返回营地",
    viewingContext: "桌面与平板近距离观看",
    readabilityGoal: "关键目标在常见屏幕上易于辨认",
    comfortConstraints: "避免频闪和大幅快速镜头移动",
  };
  visual.userMessageRef = "本任务中用户确认视觉简报的消息记录";
  const generatedAt = new Date(Date.now() - 5_000).toISOString();
  visual.candidates = ["a", "b", "c"].map((id) => {
    const image = `evidence/baseline-${id}.png`;
    const generationRef = `evidence/generation-${id}.json`;
    writeTestPng(root, image);
    writeFileSync(join(root, generationRef), `${JSON.stringify({
      candidateId: id, image, tool: "test-generator", generatedAt,
    }, null, 2)}\n`);
    return { id, image, generationRef };
  });
  const reviewedAt = new Date(Date.now() - 2_000).toISOString();
  visual.selection = {
    mode: "manual",
    candidateId: "b",
    presentedCandidateIds: ["a", "b", "c"],
    userMessageRef: "本任务中用户选择视觉候选的消息记录",
    reviewedAt,
    qualityResults: Object.fromEntries(["themeFit", "audienceFit", "gameplayReadability", "viewingComfort", "artCompletion"]
      .map((dimension) => [dimension, {
        status: "PASS", reason: "本地测试中的人工评价记录", userMessageRef: "本任务中用户评价候选的消息记录",
      }])),
  };
  visual.frozenAt = new Date(Date.parse(reviewedAt) + 1_000).toISOString();
  writeFileSync(visualPath, `${JSON.stringify(visual, null, 2)}\n`);

  const completed = checkProjectDocs({ repo: root });
  assert.equal(completed.valid, true);
  assert.equal(completed.ready, false);
  assert.ok(!completed.errors.some((entry) => entry.includes("visual-baseline")));
  assert.ok(!completed.blockers.some((entry) => entry.includes("visual-baseline")));
}));

/** ready 基线必须绑定三份不同生成物、人工候选选择和冻结时序。 */
test("ready 视觉基线拒绝重复候选、缺失生成记录和不合法冻结时间", () => inProject((root) => {
  initializeProjectDocs({ repo: root, projectId: "demo", include: ["visual"] });
  const visualPath = join(root, "docs/visual-baseline.json");
  const visual = JSON.parse(readFileSync(visualPath, "utf8"));
  visual.status = "ready";
  visual.artBrief = {
    theme: "海岛冒险", audience: "探索玩家", coreLoop: "探索与返回",
    viewingContext: "桌面端", readabilityGoal: "目标清晰", comfortConstraints: "避免频闪",
  };
  visual.userMessageRef = "用户确认的视觉简报消息";
  visual.targets = ["桌面 HUD 可读性"];
  visual.evidenceRefs = ["docs/GDD.md"];
  const generatedAt = new Date(Date.now() - 5_000).toISOString();
  visual.candidates = ["a", "b", "c"].map((id) => {
    const image = `docs/${id}.png`;
    const generationRef = `docs/${id}-generation.json`;
    writeTestPng(root, image);
    writeFileSync(join(root, generationRef), `${JSON.stringify({
      candidateId: id, image, tool: "test-generator", generatedAt,
    }, null, 2)}\n`);
    return { id, image, generationRef };
  });
  const reviewedAt = new Date(Date.now() - 2_000).toISOString();
  visual.selection = {
    mode: "manual", candidateId: "b", presentedCandidateIds: ["a", "b", "c"], userMessageRef: "用户选择消息", reviewedAt,
    qualityResults: Object.fromEntries(["themeFit", "audienceFit", "gameplayReadability", "viewingComfort", "artCompletion"]
      .map((dimension) => [dimension, { status: "PASS", reason: "人工检查完成", userMessageRef: "用户评价消息" }])),
  };
  visual.frozenAt = new Date(Date.now() - 1_000).toISOString();
  const saveVisual = () => writeFileSync(visualPath, `${JSON.stringify(visual, null, 2)}\n`);
  saveVisual();
  assert.equal(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes("visual-baseline")), false);

  const firstImage = join(root, visual.candidates[0].image);
  writeFileSync(firstImage, "损坏的图片内容\n");
  assert.ok(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes("不是有效的项目图片")));
  writeTestPng(root, visual.candidates[0].image);

  const thirdReceiptPath = join(root, visual.candidates[2].generationRef);
  const thirdReceipt = JSON.parse(readFileSync(thirdReceiptPath, "utf8"));
  thirdReceipt.image = visual.candidates[0].image;
  writeFileSync(thirdReceiptPath, `${JSON.stringify(thirdReceipt, null, 2)}\n`);
  assert.ok(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes("generationRef.image 必须绑定候选图片")));

  thirdReceipt.image = visual.candidates[2].image;
  thirdReceipt.generatedAt = visual.selection.reviewedAt;
  writeFileSync(thirdReceiptPath, `${JSON.stringify(thirdReceipt, null, 2)}\n`);
  visual.selection.presentedCandidateIds = ["a", "c", "b"];
  saveVisual();
  assert.ok(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes("presentedCandidateIds")));
  visual.selection.presentedCandidateIds = ["a", "b", "c"];

  thirdReceipt.generatedAt = new Date(Date.now() - 500).toISOString();
  writeFileSync(thirdReceiptPath, `${JSON.stringify(thirdReceipt, null, 2)}\n`);
  saveVisual();
  assert.ok(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes("不能晚于 selection.reviewedAt")));
  thirdReceipt.generatedAt = new Date(Date.now() - 5_000).toISOString().replace(/Z$/, "");
  writeFileSync(thirdReceiptPath, `${JSON.stringify(thirdReceipt, null, 2)}\n`);
  assert.ok(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes("带时区")));

  thirdReceipt.generatedAt = new Date(Date.parse(reviewedAt) - 1_000).toISOString();
  writeFileSync(thirdReceiptPath, `${JSON.stringify(thirdReceipt, null, 2)}\n`);
  const secondImage = visual.candidates[1].image;
  const secondReceiptPath = join(root, visual.candidates[1].generationRef);
  const secondReceipt = JSON.parse(readFileSync(secondReceiptPath, "utf8"));
  visual.candidates[1].image = "docs/./a.png";
  secondReceipt.image = visual.candidates[1].image;
  writeFileSync(secondReceiptPath, `${JSON.stringify(secondReceipt, null, 2)}\n`);
  saveVisual();
  assert.ok(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes("必须指向与其他候选不同的图片文件")));
  visual.candidates[1].image = secondImage;
  secondReceipt.image = secondImage;
  writeFileSync(secondReceiptPath, `${JSON.stringify(secondReceipt, null, 2)}\n`);
  saveVisual();

  const originalReviewedAt = visual.selection.reviewedAt;
  visual.selection.reviewedAt = new Date(Date.parse(originalReviewedAt)).toISOString().replace(/Z$/, "");
  saveVisual();
  assert.ok(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes("selection.reviewedAt 必须是有效、带时区")));
  visual.selection.reviewedAt = originalReviewedAt;

  const originalFrozenAt = visual.frozenAt;
  visual.frozenAt = new Date(Date.parse(originalReviewedAt) + 1_000).toISOString().replace(/Z$/, "");
  saveVisual();
  assert.ok(checkProjectDocs({ repo: root }).errors.some((entry) => entry.includes(".frozenAt 必须是有效、带时区")));
  visual.frozenAt = originalFrozenAt;

  visual.candidates[2].id = "b";
  visual.candidates[2].generationRef = "docs/missing-generation.json";
  visual.frozenAt = new Date(Date.parse(visual.selection.reviewedAt) - 1_000).toISOString();
  saveVisual();
  const rejected = checkProjectDocs({ repo: root });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.some((entry) => entry.includes("候选不同")));
  assert.ok(rejected.errors.some((entry) => entry.includes("generationRef")));
  assert.ok(rejected.errors.some((entry) => entry.includes("不能早于")));
}));
