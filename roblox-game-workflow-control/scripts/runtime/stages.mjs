import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { checkEvidence, STUDIO_EVIDENCE_TYPES } from "./evidence.mjs";
import { projectPath } from "./io.mjs";

/** 可见工作项按固定顺序推进；每项交付物对应一个可核对的完成条件。 */
export const STAGES = Object.freeze(["V0", "V1", "V2", "V3", "V4"]);

/** 各阶段的固定交付清单，供生成记录、推进校验和 CLI 共用。 */
export const STAGE_DELIVERABLES = Object.freeze({
  V0: Object.freeze(["identity", "target", "scope", "host", "dependencies", "existingResources", "unknowns"]),
  V1: Object.freeze(["playerFlow", "states", "informationHierarchy", "layoutGoals", "visualReferences", "acceptanceScope"]),
  V2: Object.freeze(["instanceStructure", "componentResponsibilities", "dataInterfaces", "resourceConsumption", "ownership", "verificationPlan"]),
  V3: Object.freeze(["editComposition", "wiring", "sourceReadback", "viewableDelivery"]),
  V4: Object.freeze(["runtimeIntegration", "inputLifecycle", "console", "dynamicCoverage", "humanDisplay"]),
});

const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;

/** 检查时间是否是带时区且可解析的 ISO 时间。 */
function isIsoDate(value) {
  return typeof value === "string" && ISO_DATE.test(value) && Number.isFinite(Date.parse(value));
}

/** 空白文本不构成交付定位、完成依据或资源复用来源。 */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 创建带固定交付槽位的活动阶段记录；调用时刻即真实开始时间。 */
export function createStageReview(item, stage, now = new Date().toISOString()) {
  if (!item || typeof item.id !== "string" || !item.id.trim() || !hasText(item.candidate)) {
    throw new Error("创建阶段记录需要有效工作项 id 和 candidate");
  }
  if (!STAGES.includes(stage)) throw new Error(`未知阶段：${stage}`);
  if (!isIsoDate(now)) throw new Error("阶段 startedAt 必须是带时区的 ISO 时间");
  return {
    id: `${item.id}:${stage.toLowerCase()}`,
    stage,
    workItemId: item.id,
    candidate: item.candidate,
    status: "active",
    startedAt: now,
    completedAt: null,
    path: "",
    section: "",
    deliverables: STAGE_DELIVERABLES[stage].map((id) => ({ id, summary: "" })),
    exitChecks: STAGE_DELIVERABLES[stage].map((id) => ({ id, result: "NOT_RUN", basis: "" })),
    presentedRef: "",
    remainingIssues: [],
    nextAction: "",
    reuse: [],
    evidenceIds: [],
    userMessageRef: "",
    exitCheckHistory: [],
  };
}

/** 通过唯一 Markdown 标题定位阶段正文；仅支持 ATX 标题，避免模糊引用。 */
function markdownSectionExists(repo, path, section) {
  if (!hasText(path) || extname(path).toLowerCase() !== ".md") throw new Error("阶段交付 path 必须指向项目内 Markdown 文件");
  if (!hasText(section) || section.startsWith("#")) throw new Error("section 必须填写不带 # 的 Markdown 标题文本");
  const absolutePath = projectPath(repo, path);
  const file = statSync(absolutePath);
  if (!file.isFile() || file.size === 0) throw new Error("阶段 Markdown 交付文件为空");
  const lines = readFileSync(absolutePath, "utf8").split(/\r?\n/);
  const headings = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const match = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (match) headings.push({ level: match[1].length, title: match[2].trim(), line: index });
  }
  const matches = headings.filter((heading) => heading.title === section);
  if (matches.length !== 1) throw new Error(`阶段标题必须唯一且存在：${section}`);
  const heading = matches[0];
  const next = headings.find((candidate) => candidate.line > heading.line && candidate.level <= heading.level);
  const body = lines.slice(heading.line + 1, next?.line ?? lines.length).join("\n").trim();
  if (!body) throw new Error(`阶段标题下缺少可核对的交付正文：${section}`);
  return true;
}

/** 将契约错误和阻断分别写入现有评估上下文，不维护第二套状态。 */
function report(context, condition, message, blocked = false) {
  if (condition) return;
  if (blocked) context.blockers.push(message);
  else context.require(false, message);
}

/** 核验阶段记录是否为 V0 起的连续历史，并检查已完成阶段的交付与退出条件。 */
export function checkStages(item, context, { requireComplete = false } = {}) {
  if (!item || !["SCENE", "DISPLAY_LAYER"].includes(item.type)) return;
  const { repo } = context;
  report(context, Array.isArray(context.errors) && Array.isArray(context.blockers), "阶段检查需要 errors 与 blockers 数组");
  report(context, ["deliverables", "manual"].includes(item.stagePolicy), "可见工作项 stagePolicy 只能是 deliverables 或 manual");
  if (!Array.isArray(item.stageReviews) || item.stageReviews.length === 0) {
    report(context, false, "可见工作项必须从 V0 创建活动阶段记录");
    return;
  }
  const reviews = item.stageReviews;
  const ids = new Set();
  const sectionLocators = new Set();
  const now = Date.now();
  let previousCompletedAt = null;
  let activeSeen = false;
  for (let index = 0; index < reviews.length; index++) {
    const review = reviews[index];
    const expectedStage = STAGES[index];
    if (!review || typeof review !== "object" || Array.isArray(review)) {
      report(context, false, `阶段记录 ${index + 1} 必须是对象`);
      continue;
    }
    report(context, reviews.length <= STAGES.length && review.stage === expectedStage,
      `阶段必须从 V0 连续排列，位置 ${index + 1} 应为 ${expectedStage}`);
    if (!STAGES.includes(review.stage)) continue;
    report(context, hasText(review.id) && !ids.has(review.id), `阶段 id 必须稳定且唯一：${review.stage}`);
    if (hasText(review.id)) ids.add(review.id);
    report(context, review.workItemId === item.id, `阶段工作项身份不匹配：${review.stage}`);
    report(context, hasText(review.candidate), `阶段缺少候选身份：${review.stage}`);
    report(context, ["active", "complete"].includes(review.status), `阶段状态不合法：${review.stage}`);
    report(context, isIsoDate(review.startedAt), `阶段缺少真实 ISO 开始时间：${review.stage}`);
    if (isIsoDate(review.startedAt)) {
      report(context, Date.parse(review.startedAt) <= now, `阶段开始时间不能晚于当前时间：${review.stage}`);
      if (previousCompletedAt !== null) {
        report(context, Date.parse(review.startedAt) >= previousCompletedAt, `阶段开始时间早于前一阶段完成时间：${review.stage}`);
      }
    }
    if (review.status === "complete") {
      report(context, !activeSeen, `前置阶段未完成时不能登记后续完成：${review.stage}`);
      report(context, isIsoDate(review.completedAt), `已完成阶段缺少完成时间：${review.stage}`);
      if (isIsoDate(review.completedAt)) {
        const completed = Date.parse(review.completedAt);
        report(context, completed <= now, `阶段完成时间不能晚于当前时间：${review.stage}`);
        if (isIsoDate(review.startedAt)) report(context, completed >= Date.parse(review.startedAt), `阶段完成时间早于开始时间：${review.stage}`);
        previousCompletedAt = completed;
      }
      if (hasText(review.path) && hasText(review.section)) {
        try {
          const key = `${projectPath(repo, review.path).toLowerCase()}#${review.section}`;
          report(context, !sectionLocators.has(key), `多个阶段不能复用相同 path+section：${review.stage}`);
          sectionLocators.add(key);
        } catch { /* 路径有效性在完整阶段检查中给出具体错误。 */ }
      }
      checkCompletedReview(item, review, context, repo);
    } else {
      activeSeen = true;
      report(context, index === reviews.length - 1, `只有最后阶段可以处于 active：${review.stage}`);
      report(context, review.completedAt === null, `active 阶段 completedAt 必须为 null：${review.stage}`);
      if (review.path !== "" || review.section !== "") {
        report(context, hasText(review.path) && hasText(review.section), `阶段 path 与 section 必须同时填写：${review.stage}`);
      }
      checkInProgressShape(review, context);
    }
  }
  const last = reviews.at(-1);
  report(context, STAGES.includes(item.stage) && item.stage === last?.stage, "item.stage 必须与最后一条阶段记录一致");
  if (requireComplete) {
    report(context, reviews.length === STAGES.length && reviews.every((review) => review?.status === "complete") && item.stage === "V4",
      "要求完整阶段链时必须完成 V0–V4", true);
  }
}

/** 活动阶段允许空槽位，但若已填写，字段仍必须保持契约形状。 */
function checkInProgressShape(review, context) {
  const expected = STAGE_DELIVERABLES[review.stage];
  report(context, Array.isArray(review.deliverables), `阶段 deliverables 必须是数组：${review.stage}`);
  const deliverables = Array.isArray(review.deliverables) ? review.deliverables : [];
  report(context, deliverables.length === expected.length && expected.every((id) => deliverables.filter((entry) => entry?.id === id).length === 1),
    `阶段交付槽位必须与固定清单一致：${review.stage}`);
  for (const delivery of deliverables) report(context, typeof delivery?.summary === "string", `交付摘要必须为文本：${review.stage}/${delivery?.id}`);
  report(context, Array.isArray(review.exitChecks), `阶段 exitChecks 必须是数组：${review.stage}`);
  const exits = Array.isArray(review.exitChecks) ? review.exitChecks : [];
  report(context, exits.length === expected.length && expected.every((id) => exits.filter((entry) => entry?.id === id).length === 1),
    `阶段退出检查槽位必须与固定清单一致：${review.stage}`);
  for (const check of exits) {
    report(context, expected.includes(check?.id) && ["PASS", "FAIL", "NOT_RUN", "BLOCKED"].includes(check?.result),
      `阶段退出检查格式不合法：${review.stage}/${check?.id}`);
    report(context, typeof check?.basis === "string", `阶段退出依据必须为文本：${review.stage}/${check?.id}`);
    if (["FAIL", "BLOCKED"].includes(check?.result)) report(context, hasText(check.basis), `失败退出检查必须保留实际依据：${review.stage}/${check.id}`);
  }
  for (const key of ["path", "section", "presentedRef", "nextAction", "userMessageRef"]) {
    report(context, typeof review[key] === "string", `阶段 ${key} 必须为文本：${review.stage}`);
  }
  report(context, Array.isArray(review.remainingIssues), `阶段 remainingIssues 必须是数组：${review.stage}`);
  report(context, Array.isArray(review.reuse), `阶段 reuse 必须是数组：${review.stage}`);
  checkReuse(review, context);
  report(context, Array.isArray(review.evidenceIds) && review.evidenceIds.every(hasText), `阶段 evidenceIds 必须是文本数组：${review.stage}`);
  if (review.exitCheckHistory !== undefined) report(context, Array.isArray(review.exitCheckHistory), `阶段 exitCheckHistory 必须是数组：${review.stage}`);
}

/** 已完成阶段必须逐项有摘要、PASS 依据和可定位的实际展示记录。 */
function checkCompletedReview(item, review, context, repo) {
  checkInProgressShape(review, context);
  const expected = STAGE_DELIVERABLES[review.stage];
  const deliverables = Array.isArray(review.deliverables) ? review.deliverables : [];
  report(context, deliverables.length === expected.length && expected.every((id) => {
    const matches = deliverables.filter((entry) => entry?.id === id);
    return matches.length === 1 && hasText(matches[0].summary);
  }), `阶段每项交付都必须有实际摘要：${review.stage}`);
  const exits = Array.isArray(review.exitChecks) ? review.exitChecks : [];
  report(context, exits.length === expected.length && expected.every((id) => {
    const matches = exits.filter((entry) => entry?.id === id);
    return matches.length === 1 && matches[0].result === "PASS" && hasText(matches[0].basis);
  }), `阶段每项交付都必须有唯一 PASS 退出依据：${review.stage}`);
  report(context, hasText(review.path) && hasText(review.section), `已完成阶段必须定位 path 与 section：${review.stage}`);
  if (hasText(review.path) && hasText(review.section)) {
    try { markdownSectionExists(repo, review.path, review.section); }
    catch (error) { report(context, false, `阶段交付定位 ${review.stage}：${error.message}`); }
  }
  report(context, hasText(review.presentedRef), `已完成阶段必须记录真实展示/交付引用：${review.stage}`);
  report(context, Array.isArray(review.remainingIssues) && review.remainingIssues.length === 0, `阶段仍有未解决问题：${review.stage}`);
  report(context, hasText(review.nextAction), `已完成阶段必须记录下一步：${review.stage}`);
  report(context, Array.isArray(review.evidenceIds) && review.evidenceIds.every(hasText), `阶段 evidenceIds 必须是文本数组：${review.stage}`);
  if (review.exitCheckHistory !== undefined) report(context, Array.isArray(review.exitCheckHistory), `阶段 exitCheckHistory 必须是数组：${review.stage}`);
  checkReuse(review, context);
  if (item.stagePolicy === "manual") report(context, hasText(review.userMessageRef), `manual 阶段必须记录真实用户确认：${review.stage}`, true);
  if (["V3", "V4"].includes(review.stage)) {
    report(context, review.candidate === item.candidate, `${review.stage} 必须绑定当前候选`);
  }
  if (review.stage === "V3") checkEditReadback(item, review, context, repo);
}

/** 复用已有成果时必须指出来源、适用范围和本阶段仍要完成的内容。 */
function checkReuse(review, context) {
  for (const reused of Array.isArray(review.reuse) ? review.reuse : []) {
    report(context, hasText(reused?.sourceRef) && hasText(reused?.scope) && hasText(reused?.remaining),
      `成果复用必须说明来源、适用范围和当前阶段剩余内容：${review.stage}`);
  }
}

/** V3 的正式源回读必须是当前候选、目标身份匹配的 Edit 文件证据。 */
function checkEditReadback(item, review, context, repo) {
  const target = item.target;
  const validTarget = hasText(target?.studioId) && Number.isSafeInteger(target?.placeId) && target.placeId >= 0
    && Number.isSafeInteger(target?.universeId) && target.universeId >= 0;
  report(context, validTarget, "V3 Edit readback 前必须先绑定非空 Studio 与有效 Place/Universe 身份");
  if (!validTarget) return;

  const evidenceIds = new Set(Array.isArray(review.evidenceIds) ? review.evidenceIds : []);
  const selected = (Array.isArray(item.evidence) ? item.evidence : []).filter((entry) => evidenceIds.has(entry?.id) && entry?.type === "readback");
  const checks = (Array.isArray(item.implementation?.verification) ? item.implementation.verification : [])
    .filter((check) => check?.evidenceType === "readback");
  const errors = [];
  const blockers = [];
  const verification = checkEvidence({ ...item, evidence: selected }, checks, {
    repo,
    evidenceTypes: context.evidenceTypes ?? ["static", ...STUDIO_EVIDENCE_TYPES, "visual"],
    errors,
    blockers,
    require: (condition, message) => { if (!condition) errors.push(message); },
  });
  for (const message of errors) context.require(false, `V3 Edit readback：${message}`);
  for (const message of blockers) context.blockers.push(`V3 Edit readback：${message}`);
  const usable = [...verification.values()].filter((entry) => entry.candidate === item.candidate && entry.datamodel === "Edit");
  for (const entry of usable) {
    report(context, Date.parse(entry.observedAt) <= Date.now(), `V3 Edit readback 时间不能晚于当前时间：${entry.id}`);
  }
  report(context, usable.length > 0, "V3 必须引用通过完整证据校验的当前候选 Edit readback");
}
