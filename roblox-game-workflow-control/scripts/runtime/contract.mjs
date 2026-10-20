import { projectPath } from "./io.mjs";
import { checkImplementation } from "./implementation.mjs";
import { checkEvidence, STUDIO_EVIDENCE_TYPES } from "./evidence.mjs";
import { checkAcceptance } from "./quality.mjs";
import { checkVisible } from "./visible.mjs";
import { checkDecisions } from "./decisions.mjs";
import { checkAssets } from "./assets.mjs";
import { checkProjectDependencies } from "./project.mjs";
import { checkFoundationBaseline } from "./baseline.mjs";

/** 当前记录使用完整的目标、验收和阶段交付契约，不保留旧格式旁路。 */
export const RECORD_VERSION = 2;
/** 工作项类型对应独立交付对象，显示层不并入宿主场景。 */
export const TYPES = ["PROJECT", "FOUNDATION", "SCENE", "DISPLAY_LAYER", "INTEGRATION", "RELEASE"];
/** 项目六阶段只展示进度，不授予外部执行权限。 */
export const PHASES = ["scope", "baseline", "foundation", "production", "integration", "release"];
/** 状态只记录实际工作，不由检查命令自动推进。 */
export const STATES = ["planned", "implementing", "validating", "blocked", "complete"];
/** 证据类别区分本地、Studio 运行与人工视觉检查。 */
export const EVIDENCE_TYPES = ["static", "readback", "console", "unit", "play", "multiplayer", "performance", "visual", "save", "release"];
/** 所有受保护操作都只登记结果，本地工具不实际调用外部系统。 */
export const OPERATIONS = ["upload", "publish", "payment", "external-write", "device", "destructive-delete"];

/** 空白字符串不能用于目标、所有者、结论或真实用户消息引用。 */
function text(value) { return typeof value === "string" && value.trim().length > 0; }

/** 汇总结构、交付与证据门；结构完整不等于 Studio 行为经过实际验证。 */
export function assessLocal(item, repo) {
  const errors = [];
  const blockers = [];
  /** 聚合所有错误，让使用者一次修复互相独立的缺失项。 */
  const require = (condition, message) => { if (!condition) errors.push(message); };
  if (!item || typeof item !== "object" || Array.isArray(item)) return { valid: false, ready: false, errors: ["工作项必须是对象"], blockers };
  const context = { errors, blockers, require, repo, evidenceTypes: EVIDENCE_TYPES };
  require(item.version === RECORD_VERSION, `version 必须为 ${RECORD_VERSION}`);
  require(text(item.id) && /^[a-z0-9][a-z0-9-]{0,63}$/.test(item.id), "id 必须是 1–64 位小写字母、数字或连字符");
  require(text(item.objective), "objective 不得为空");
  require(TYPES.includes(item.type) && PHASES.includes(item.phase) && STATES.includes(item.state), "工作项 type、phase 或 state 不合法");
  require(text(item.candidate), "candidate 不得为空");
  const visible = ["SCENE", "DISPLAY_LAYER"].includes(item.type);
  require(item.target && ["studio", "filesystem"].includes(item.target.sourceOfTruth), "target.sourceOfTruth 必须是 studio 或 filesystem");
  require(Array.isArray(item.requiredEvidence) && item.requiredEvidence.length > 0 && item.requiredEvidence.every((type) => EVIDENCE_TYPES.includes(type)), "requiredEvidence 必须声明有效证据类别");
  const needsStudio = visible || item.type === "RELEASE" || item.target?.sourceOfTruth !== "filesystem"
    || (Array.isArray(item.requiredEvidence) && item.requiredEvidence.some((type) => STUDIO_EVIDENCE_TYPES.includes(type)))
    || (Array.isArray(item.evidence) && item.evidence.some((entry) => STUDIO_EVIDENCE_TYPES.includes(entry?.type)));
  if (needsStudio) {
    if (!text(item.target?.studioId)) blockers.push("本工作项需要绑定目标 Studio");
    if (![item.target?.placeId, item.target?.universeId].every((id) => Number.isSafeInteger(id) && id >= 0)) blockers.push("尚未回读真实 Place/Universe 身份，未发布工程可记录 0");
  }
  if (visible) {
    require(["V0", "V1", "V2", "V3", "V4"].includes(item.stage) && item.phase === "production", "可见工作项需要 production 阶段及 V0–V4 stage");
    if (item.type === "DISPLAY_LAYER") require(text(item.hostSceneId), "显示层必须记录 hostSceneId");
    if (item.stage !== "V4") blockers.push("可见工作项尚未完成 V4 运行交付");
  }
  require(item.scope && Array.isArray(item.scope.files) && Array.isArray(item.scope.instances), "scope 必须声明 files 与 instances 数组");
  if (Array.isArray(item.scope?.files) && Array.isArray(item.scope?.instances)) {
    if (!item.scope.files.length && !item.scope.instances.length) blockers.push("尚未声明文件或 Studio 实例所有权");
    for (const path of item.scope.files) {
      try { projectPath(repo, path); } catch (error) { require(false, `scope.files：${error.message}`); }
    }
    require(item.scope.instances.every((path) => text(path) && path.startsWith("game.")), "实例路径必须从 game. 开始");
  }
  const checks = checkImplementation(item, context);
  const usable = checkEvidence(item, checks, context);
  checkFoundationBaseline(item, context);
  for (const type of Array.isArray(item.requiredEvidence) ? item.requiredEvidence : []) {
    if (![...usable.values()].some((entry) => entry.type === type)) blockers.push(`缺少当前候选 PASS 证据：${type}`);
  }
  checkAcceptance(item, usable, context);
  checkVisible(item, usable, context);
  checkDecisions(item, context);
  checkAssets(item, usable, context);
  require(Array.isArray(item.operations), "operations 必须为数组");
  for (const operation of Array.isArray(item.operations) ? item.operations : []) {
    if (!operation || typeof operation !== "object") { require(false, "外部操作条目必须是对象"); continue; }
    require(OPERATIONS.includes(operation.kind) && text(operation.target), "操作必须声明有效 kind 和精确 target");
    if (!text(operation.userMessageRef) || operation.candidate !== item.candidate) blockers.push(`外部操作缺少当前对象授权：${operation.kind}/${operation.target}`);
    if (operation.status !== "complete") blockers.push(`外部操作尚未完成：${operation.kind}/${operation.target}`);
  }
  if (item.type === "RELEASE") {
    const releases = [...usable.values()].filter((entry) => entry.type === "release");
    if (!releases.length) blockers.push("发布工作项缺少真实发布结果证据");
    for (const release of releases) {
      const published = Array.isArray(item.operations) && item.operations.some((operation) => operation?.kind === "publish"
        && operation.status === "complete" && text(operation.userMessageRef) && operation.candidate === item.candidate
        && text(operation.target) && operation.target === release.target);
      if (!published) blockers.push("发布工作项缺少与发布证据目标一致的已授权发布结果");
    }
  }
  if (!["validating", "complete"].includes(item.state)) blockers.push("工作项尚未进入验证或完成状态");
  return { valid: errors.length === 0, ready: errors.length === 0 && blockers.length === 0, errors, blockers };
}

/** 独立检查本项及其项目依赖；局部门不递归加载项目，避免依赖环导致无限调用。 */
export function assess(item, repo) {
  const result = assessLocal(item, repo);
  if (!item || typeof item !== "object" || Array.isArray(item)) return result;
  const { errors, blockers } = result;
  checkProjectDependencies(item, { repo, errors, blockers,
    require: (condition, message) => { if (!condition) errors.push(message); } }, assessLocal);
  return { valid: errors.length === 0, ready: errors.length === 0 && blockers.length === 0, errors, blockers };
}
