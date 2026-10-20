#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assess, assessLocal, EVIDENCE_TYPES, TYPES, RECORD_VERSION } from "./runtime/contract.mjs";
import { projectPath, readJson, replaceJson, writeNewJson } from "./runtime/io.mjs";
import { assessProject, createProject } from "./runtime/project.mjs";
import { createStageReview } from "./runtime/stages.mjs";
import { advanceStage, completeCurrentStage, stageStatus } from "./runtime/stage-operations.mjs";
import { createVisualReview } from "./runtime/visual-review.mjs";
import { checkVisualDelivery } from "./runtime/visible.mjs";
import { checkEvidence } from "./runtime/evidence.mjs";
import { checkAssets } from "./runtime/assets.mjs";

/** 创建未配置工作项；不虚构 Studio 目标、实施结果、验收或用户批准。 */
export function createWorkItem(id, objective, type = "PROJECT") {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id ?? "")) throw new Error("--id 必须为 1–64 位小写字母、数字或连字符");
  if (!objective?.trim()) throw new Error("初始化必须提供 --objective");
  if (!TYPES.includes(type)) throw new Error("未知工作项类型");
  const visible = ["SCENE", "DISPLAY_LAYER"].includes(type);
  const item = {
    version: RECORD_VERSION, id, objective, type, phase: visible ? "production" : type === "RELEASE" ? "release" : "scope",
    state: "planned", candidate: "candidate-1", ...(visible ? { stage: "V0" } : {}),
    ...(type === "DISPLAY_LAYER" ? { hostSceneId: "" } : {}),
    target: { studioId: "", placeId: null, universeId: null, sourceOfTruth: "studio" },
    scope: { files: [], instances: [] }, acceptance: [{ id: "goal", criterion: objective }], acceptanceResults: [],
    implementation: { owner: "", studioWriter: "", visualDependency: false, units: [], verification: [], stopConditions: [] },
    requiredEvidence: visible ? ["readback", "console", "play", "visual"] : ["static"],
    evidence: [], operations: [], decisionRefs: [], dependsOn: [], assetBindings: [],
    ...(visible ? { stagePolicy: "deliverables", stageReviews: [], visualContractRef: "", visualReview: createVisualReview("candidate-1") } : {}),
  };
  if (visible) item.stageReviews.push(createStageReview(item, "V0"));
  return item;
}

/** 显式解析有限参数；禁止拼写错误被当作默认值静默忽略。 */
function parse(args) {
  const [command, ...rest] = args;
  if (command === "--help" || command === "-h") return { command: "help" };
  if (!["init", "status", "check", "init-project", "status-project", "check-project", "stage-status", "stage-template", "complete-stage", "advance-stage", "evidence-summary"].includes(command)) throw new Error("未知命令，请运行 --help");
  const options = { command, repo: process.cwd() };
  const allowed = command === "init" ? ["repo", "id", "objective", "type"]
    : command === "init-project" ? ["repo", "project-id"]
      : command.endsWith("-project") ? ["repo"]
        : command === "complete-stage" ? ["repo", "id", "delivery"]
          : command === "stage-template" ? ["repo", "id", "output"] : ["repo", "id"];
  const seen = new Set();
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    if (!rest[i].startsWith("--") || !allowed.includes(key) || seen.has(key) || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error(`参数错误：${rest[i]}`);
    options[key] = rest[i + 1]; seen.add(key);
  }
  if (!command.endsWith("-project") && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.id ?? "")) throw new Error("必须指定合法 --id");
  return options;
}

/** V4 结束前复核技术及人工门，不把阶段记录完整当作运行成功。 */
function validateRuntimeExit(item, repo) {
  const errors = [];
  const blockers = [];
  const context = { repo, errors, blockers, evidenceTypes: EVIDENCE_TYPES,
    require: (condition, message) => { if (!condition) errors.push(message); } };
  const usable = checkEvidence(item, item.implementation?.verification ?? [], context);
  checkVisualDelivery(item, usable, context);
  checkAssets(item, usable, context);
  return { valid: !errors.length, ready: !errors.length && !blockers.length, errors, blockers };
}

/** 汇总保持只读，技术证据与用户视觉声明分别呈现，绝不生成早期阶段或人工 PASS。 */
function evidenceSummary(item) {
  return { id: item.id, candidate: item.candidate, stage: item.stage ?? null,
    notice: "仅汇总记录；不认证阶段执行、引擎结果或人工验收",
    technical: (Array.isArray(item.evidence) ? item.evidence : []).filter((entry) => entry?.type !== "visual")
      .map((entry) => ({ id: entry?.id, type: entry?.type, candidate: entry?.candidate, result: entry?.result, path: entry?.path })),
    resourceAcceptance: item.stageReviews?.find((review) => review.stage === "V3")?.resourceAcceptance ?? null,
    sampleProduction: item.stageReviews?.find((review) => review.stage === "V4")?.production ?? null,
    visual: item.visualReview ?? null };
}

/** 控制工具仅处理项目文件；check 只验证记录，不发起 Studio 或外部操作。 */
function main() {
  const options = parse(process.argv.slice(2));
  if (options.command === "help") {
    console.log("用法：workflow-control.mjs init|status|check --repo <项目> --id <工作项>\n初始化另需 --objective <目标>，可选 --type PROJECT|FOUNDATION|SCENE|DISPLAY_LAYER|INTEGRATION|RELEASE");
    console.log("项目编排：init-project --repo <项目> --project-id <项目ID>；status-project|check-project --repo <项目>");
    console.log("阶段：stage-status|advance-stage --repo <项目> --id <工作项>；stage-template 另需 --output <项目内JSON>；complete-stage 另需 --delivery <项目内JSON>；evidence-summary 只读汇总");
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
  const before = readFileSync(projectPath(options.repo, path), "utf8");
  const item = JSON.parse(before);
  if (item?.id !== options.id) throw new Error("工作项 id 与文件名不一致");
  if (options.command === "stage-status") {
    console.log(JSON.stringify(stageStatus(item, options.repo), null, 2));
    return;
  }
  if (options.command === "evidence-summary") {
    console.log(JSON.stringify(evidenceSummary(item), null, 2));
    return;
  }
  if (options.command === "stage-template") {
    if (!["SCENE", "DISPLAY_LAYER"].includes(item.type)) throw new Error("只有可见工作项有阶段交付");
    const review = item.stageReviews?.at(-1);
    if (!review || review.stage !== item.stage || review.status !== "active") throw new Error("当前阶段必须先有 active 记录");
    const fields = ["path", "section", "deliverables", "exitChecks", "presentedRef", "remainingIssues", "nextAction", "reuse", "evidenceIds", "userMessageRef"];
    if (review.stage === "V2") fields.push("decompositionRef");
    if (review.stage === "V3") fields.push("resourceAcceptance");
    if (review.stage === "V4") fields.push("production");
    const delivery = Object.fromEntries(fields.map((key) => [key, structuredClone(review[key])]));
    console.log(writeNewJson(options.repo, options.output, delivery));
    return;
  }
  if (["complete-stage", "advance-stage"].includes(options.command)) {
    const next = options.command === "advance-stage" ? advanceStage(item, options.repo)
      : completeCurrentStage(item, options.repo, readJson(options.repo, options.delivery), { validateExit: validateRuntimeExit });
    replaceJson(options.repo, path, before, next);
    console.log(JSON.stringify({ id: next.id, stage: next.stage, stageReview: next.stageReviews.at(-1),
      notice: "只更新当前阶段记录；不代表引擎或人工验收通过" }, null, 2));
    return;
  }
  const result = assess(item, options.repo);
  if (item.id !== options.id) { result.errors.push("工作项 id 与文件名不一致"); result.valid = false; result.ready = false; }
  console.log(JSON.stringify({ id: item.id, state: item.state, phase: item.phase, ...result }, null, 2));
  if (options.command === "check" && !result.ready) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
