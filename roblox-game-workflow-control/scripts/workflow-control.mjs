#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assess, assessLocal, TYPES, RECORD_VERSION } from "./runtime/contract.mjs";
import { readJson, writeNewJson } from "./runtime/io.mjs";
import { assessProject, createProject } from "./runtime/project.mjs";

/** 创建未配置工作项；不虚构 Studio 目标、实施结果、验收或用户批准。 */
export function createWorkItem(id, objective, type = "PROJECT") {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id ?? "")) throw new Error("--id 必须为 1–64 位小写字母、数字或连字符");
  if (!objective?.trim()) throw new Error("初始化必须提供 --objective");
  if (!TYPES.includes(type)) throw new Error("未知工作项类型");
  const visible = ["SCENE", "DISPLAY_LAYER"].includes(type);
  return {
    version: RECORD_VERSION, id, objective, type, phase: visible ? "production" : type === "RELEASE" ? "release" : "scope",
    state: "planned", candidate: "candidate-1", ...(visible ? { stage: "V0" } : {}),
    ...(type === "DISPLAY_LAYER" ? { hostSceneId: "" } : {}),
    target: { studioId: "", placeId: null, universeId: null, sourceOfTruth: "studio" },
    scope: { files: [], instances: [] }, acceptance: [{ id: "goal", criterion: objective }], acceptanceResults: [],
    implementation: { owner: "", studioWriter: "", units: [], verification: [], stopConditions: [] },
    requiredEvidence: visible ? ["readback", "console", "play", "visual"] : ["static"],
    evidence: [], operations: [], decisionRefs: [], dependsOn: [], assetBindings: [],
    ...(visible ? { stagePolicy: "deliverables", stageReviews: [], visualContractRef: "",
      visualReview: { status: "pending", candidate: "candidate-1", evidenceId: "", userMessageRef: "", qualityResults: {}, scenarios: [] } } : {}),
  };
}

/** 显式解析有限参数；禁止拼写错误被当作默认值静默忽略。 */
function parse(args) {
  const [command, ...rest] = args;
  if (command === "--help" || command === "-h") return { command: "help" };
  if (!["init", "status", "check", "init-project", "status-project", "check-project"].includes(command)) throw new Error("命令只能是 init、status、check、init-project、status-project、check-project 或 --help");
  const options = { command, repo: process.cwd() };
  const allowed = command === "init" ? ["repo", "id", "objective", "type"]
    : command === "init-project" ? ["repo", "project-id"]
      : command.endsWith("-project") ? ["repo"] : ["repo", "id"];
  const seen = new Set();
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    if (!rest[i].startsWith("--") || !allowed.includes(key) || seen.has(key) || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error(`参数错误：${rest[i]}`);
    options[key] = rest[i + 1]; seen.add(key);
  }
  if (!command.endsWith("-project") && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.id ?? "")) throw new Error("必须指定合法 --id");
  return options;
}

/** 控制工具仅处理项目文件；check 只验证记录，不发起 Studio 或外部操作。 */
function main() {
  const options = parse(process.argv.slice(2));
  if (options.command === "help") {
    console.log("用法：workflow-control.mjs init|status|check --repo <项目> --id <工作项>\n初始化另需 --objective <目标>，可选 --type PROJECT|FOUNDATION|SCENE|DISPLAY_LAYER|INTEGRATION|RELEASE");
    console.log("项目编排：init-project --repo <项目> --project-id <项目ID>；status-project|check-project --repo <项目>");
    return;
  }
  if (options.command === "init-project") {
    console.log(writeNewJson(options.repo, ".workflow-control/project.json", createProject(options["project-id"])));
    return;
  }
  if (["status-project", "check-project"].includes(options.command)) {
    const result = assessProject(options.repo, assessLocal);
    console.log(JSON.stringify(result, null, 2));
    if (options.command === "check-project" && !result.ready) process.exitCode = 1;
    return;
  }
  const path = `.workflow-control/work-items/${options.id}.json`;
  if (options.command === "init") {
    console.log(writeNewJson(options.repo, path, createWorkItem(options.id, options.objective, options.type)));
    return;
  }
  const item = readJson(options.repo, path);
  const result = assess(item, options.repo);
  if (item.id !== options.id) { result.errors.push("工作项 id 与文件名不一致"); result.valid = false; result.ready = false; }
  console.log(JSON.stringify({ id: item.id, state: item.state, phase: item.phase, ...result }, null, 2));
  if (options.command === "check" && !result.ready) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
