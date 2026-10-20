import { statSync } from "node:fs";
import { readProjectImage } from "./image-file.mjs";
import { projectPath, readJson } from "./io.mjs";

/** 基础工程视觉基线的默认位置；工作项可用 baselineRef 显式指定项目内路径。 */
export const DEFAULT_VISUAL_BASELINE_REF = "docs/visual-baseline.json";

/** 基线人工评价必须逐项绑定到这五个实际质量维度。 */
export const BASELINE_QUALITY_DIMENSIONS = Object.freeze([
  "themeFit", "audienceFit", "gameplayReadability", "viewingComfort", "artCompletion",
]);

const BRIEF_FIELDS = Object.freeze([
  "theme", "audience", "coreLoop", "viewingContext", "readabilityGoal", "comfortConstraints",
]);

/** 检查视觉依赖的基础工程或纯共享/模块包，不把纯工程包强制纳入美术基线。 */
export function checkFoundationBaseline(item, context) {
  const implementation = item?.implementation;
  const hasVisualDependency = implementation?.visualDependency === true
    || isText(item?.visualContractRef);

  if (implementation && Object.hasOwn(implementation, "visualDependency")) {
    context.require(typeof implementation.visualDependency === "boolean",
      "implementation.visualDependency 必须为布尔值，避免拼写错误静默绕过视觉基线");
  }

  const units = implementation?.units;
  const pureSharedModulePackage = Array.isArray(units) && units.length > 0
    && units.every((unit) => ["SHARED", "MODULE"].includes(unit?.kind));
  const eligible = item?.type === "FOUNDATION" || (item?.type === "PROJECT" && pureSharedModulePackage);
  if (!eligible || !hasVisualDependency) return;

  const reference = item.baselineRef === undefined ? DEFAULT_VISUAL_BASELINE_REF : item.baselineRef;
  if (!isText(reference)) {
    context.require(false, "baselineRef 必须是项目内视觉基线路径");
    return;
  }

  let baseline;
  try {
    baseline = readJson(context.repo, reference);
  } catch (error) {
    context.require(false, `无法读取全局视觉基线 ${reference}：${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  validateVisualBaseline(baseline, context.repo, context, `全局视觉基线 ${reference}`);
}

/** 供工作项评估与 check-docs 共用，确保 ready 基线只有一套严格校验。 */
export function validateVisualBaseline(value, repo, context, label = "visual-baseline") {
  const { require, blockers } = context;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    require(false, `${label} 根必须为对象`);
    return;
  }

  require(value.version === 1 && ["unconfigured", "ready"].includes(value.status), `${label} version/status 无效`);
  const artBrief = value.artBrief;
  require(artBrief && typeof artBrief === "object" && !Array.isArray(artBrief), `${label}.artBrief 必须为对象`);
  if (artBrief && typeof artBrief === "object" && !Array.isArray(artBrief)) {
    for (const field of BRIEF_FIELDS) require(typeof artBrief[field] === "string", `${label}.artBrief.${field} 必须为字符串`);
  }
  require(typeof value.userMessageRef === "string", `${label}.userMessageRef 必须为字符串`);
  const targets = validateTextList(value.targets, `${label}.targets`, require);
  const evidenceRefs = validateTextList(value.evidenceRefs, `${label}.evidenceRefs`, require);
  evidenceRefs.forEach((reference, index) => validateProjectReference(repo, reference, `${label}.evidenceRefs[${index}]`, require));
  const candidates = value.candidates;
  require(Array.isArray(candidates), `${label}.candidates 必须为数组`);
  const candidateIds = new Set();
  const candidateFiles = new Set();
  for (const [index, candidate] of (Array.isArray(candidates) ? candidates : []).entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      require(false, `${label}.candidates[${index}] 必须为对象`);
      continue;
    }
    validateUniqueText(candidate.id, candidateIds, `${label}.candidates[${index}].id`, require);
    validateUniqueText(candidate.image, candidateFiles, `${label}.candidates[${index}].image`, require, normalizePath);
    validateUniqueText(candidate.generationRef, candidateFiles, `${label}.candidates[${index}].generationRef`, require, normalizePath);
    validateProjectReference(repo, candidate.image, `${label}.candidates[${index}].image`, require);
    validateProjectReference(repo, candidate.generationRef, `${label}.candidates[${index}].generationRef`, require);
  }

  const selection = value.selection;
  require(selection && typeof selection === "object" && !Array.isArray(selection), `${label}.selection 必须为对象`);
  const selectionObject = selection && typeof selection === "object" && !Array.isArray(selection) ? selection : {};
  require(typeof selectionObject.mode === "string", `${label}.selection.mode 必须为字符串`);
  require(typeof selectionObject.candidateId === "string", `${label}.selection.candidateId 必须为字符串`);
  require(typeof selectionObject.userMessageRef === "string", `${label}.selection.userMessageRef 必须为字符串`);
  require(typeof selectionObject.reviewedAt === "string", `${label}.selection.reviewedAt 必须为字符串`);
  require(Array.isArray(selectionObject.presentedCandidateIds), `${label}.selection.presentedCandidateIds 必须为数组`);
  const qualityResults = selectionObject.qualityResults;
  require(qualityResults && typeof qualityResults === "object" && !Array.isArray(qualityResults),
    `${label}.selection.qualityResults 必须为对象`);
  const qualityObject = qualityResults && typeof qualityResults === "object" && !Array.isArray(qualityResults) ? qualityResults : {};
  for (const dimension of BASELINE_QUALITY_DIMENSIONS) {
    const result = qualityObject[dimension];
    require(result && typeof result === "object" && !Array.isArray(result), `${label}.selection.qualityResults.${dimension} 必须为对象`);
    if (!result || typeof result !== "object" || Array.isArray(result)) continue;
    require(["PASS", "FAIL", "NOT_RUN"].includes(result.status), `${label}.${dimension}.status 必须为 PASS、FAIL 或 NOT_RUN`);
    require(typeof result.reason === "string", `${label}.${dimension}.reason 必须为字符串`);
    require(typeof result.userMessageRef === "string", `${label}.${dimension}.userMessageRef 必须为字符串`);
  }
  require(typeof value.frozenAt === "string", `${label}.frozenAt 必须为字符串`);

  if (value.status === "unconfigured") {
    blockers.push(`${label} 状态为 unconfigured，尚无已冻结的人工选择`);
    return;
  }
  if (value.status !== "ready") return;

  if (targets.length === 0 || evidenceRefs.length === 0) require(false, `ready ${label} 必须包含目标和 evidenceRefs`);
  require(isActualText(value.userMessageRef), `ready ${label}.userMessageRef 必须引用真实用户消息`);
  if (artBrief && typeof artBrief === "object" && !Array.isArray(artBrief)) {
    for (const field of BRIEF_FIELDS) require(isActualText(artBrief[field]), `ready ${label}.artBrief.${field} 必须填写实际内容`);
  }
  evidenceRefs.forEach((reference, index) => requireExistingFile(repo, reference, `${label}.evidenceRefs[${index}]`, require));

  require(Array.isArray(candidates) && candidates.length === 3, `ready ${label} 必须正好提供三个视觉候选`);
  // 用解析后的绝对路径去重，避免同一图片通过含 ./ 或大小写差异的引用重复提交。
  const decodedImagePaths = new Set();
  for (const [index, candidate] of (Array.isArray(candidates) ? candidates : []).entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    try {
      const image = readProjectImage(repo, candidate.image);
      const canonicalPath = normalizePath(image.absolutePath);
      require(!decodedImagePaths.has(canonicalPath), `${label}.candidates[${index}].image 必须指向与其他候选不同的图片文件`);
      decodedImagePaths.add(canonicalPath);
    }
    catch (error) { require(false, `${label}.candidates[${index}].image 不是有效的项目图片：${error.message}`); }
  }

  require(selectionObject.mode === "manual", `ready ${label}.selection.mode 必须为 manual`);
  require(isActualText(selectionObject.candidateId) && candidateIds.has(selectionObject.candidateId),
    `ready ${label}.selection.candidateId 必须引用三个候选之一`);
  require(isActualText(selectionObject.userMessageRef), `ready ${label}.selection.userMessageRef 必须引用真实用户消息`);
  const presentedIds = selectionObject.presentedCandidateIds;
  require(Array.isArray(presentedIds) && presentedIds.length === 3
    && presentedIds.every((id, index) => id === candidates?.[index]?.id),
  `ready ${label}.selection.presentedCandidateIds 必须按候选顺序精确列出三个已展示候选`);
  const reviewedAt = validZonedPastTimestamp(selectionObject.reviewedAt);
  const frozenAt = validZonedPastTimestamp(value.frozenAt);
  require(reviewedAt, `ready ${label}.selection.reviewedAt 必须是有效、带时区且不晚于当前时间的时间`);
  require(frozenAt, `ready ${label}.frozenAt 必须是有效、带时区且不晚于当前时间的时间`);
  if (reviewedAt && frozenAt) require(Date.parse(value.frozenAt) >= Date.parse(selectionObject.reviewedAt),
    `ready ${label}.frozenAt 不能早于 selection.reviewedAt`);

  for (const [index, candidate] of (Array.isArray(candidates) ? candidates : []).entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || !isActualText(candidate.generationRef)) continue;
    validateGenerationReceipt(repo, candidate, index, selectionObject.reviewedAt, reviewedAt, label, require);
  }

  for (const dimension of BASELINE_QUALITY_DIMENSIONS) {
    const result = qualityObject[dimension];
    if (!result || typeof result !== "object" || Array.isArray(result)) continue;
    require(isActualText(result.reason), `ready ${label}.${dimension}.reason 必须填写实际判断依据`);
    require(isActualText(result.userMessageRef), `ready ${label}.${dimension}.userMessageRef 必须引用真实用户判断`);
    if (result.status !== "PASS") blockers.push(`${label} 选择候选的 ${dimension} 尚未通过人工评价`);
  }
}

/** 列表始终检查数据形状与重复项；空列表只允许在尚未配置时出现。 */
function validateTextList(value, label, require) {
  if (!Array.isArray(value)) {
    require(false, `${label} 必须为数组`);
    return [];
  }
  const seen = new Set();
  for (const [index, entry] of value.entries()) {
    require(isActualText(entry), `${label}[${index}] 必须为非空且非占位文本`);
    if (isActualText(entry)) {
      require(!seen.has(entry), `${label} 包含重复值：${entry}`);
      seen.add(entry);
    }
  }
  return value;
}

/** 验证候选标识或文件引用非空，并按对应规则检查唯一性。 */
function validateUniqueText(value, seen, label, require, normalize = (entry) => entry) {
  require(isActualText(value), `${label} 必须为非空且非占位文本`);
  if (!isActualText(value)) return;
  const key = normalize(value);
  require(!seen.has(key), `${label} 必须与其他候选不同`);
  seen.add(key);
}

/** 项目证据只能指向项目内存在的非空普通文件，并拒绝链接路径。 */
function requireExistingFile(repo, reference, label, require) {
  if (!isActualText(reference)) {
    require(false, `${label} 必须指向项目内非空文件`);
    return;
  }
  try {
    const info = statSync(projectPath(repo, reference));
    require(info.isFile() && info.size > 0, `${label} 必须指向项目内已存在的非空文件`);
  } catch (error) {
    require(false, `${label} 路径无效或文件不可用：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** generationRef 必须是绑定候选图片的 JSON 生产记录，且生成时间早于人工评审。 */
function validateGenerationReceipt(repo, candidate, index, reviewedAtValue, reviewedAtValid, label, require) {
  let receipt;
  try { receipt = readJson(repo, candidate.generationRef); }
  catch (error) {
    require(false, `${label}.candidates[${index}].generationRef 必须是有效 JSON 生产记录：${error.message}`);
    return;
  }
  require(receipt && typeof receipt === "object" && !Array.isArray(receipt),
    `${label}.candidates[${index}].generationRef 根必须为对象`);
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return;
  require(receipt.candidateId === candidate.id, `${label}.candidates[${index}].generationRef.candidateId 必须绑定候选 id`);
  require(receipt.image === candidate.image, `${label}.candidates[${index}].generationRef.image 必须绑定候选图片`);
  require(isActualText(receipt.tool), `${label}.candidates[${index}].generationRef.tool 必须填写实际工具`);
  const generatedAtValid = validZonedPastTimestamp(receipt.generatedAt);
  require(generatedAtValid, `${label}.candidates[${index}].generationRef.generatedAt 必须是有效、带时区且不晚于当前的时间`);
  if (generatedAtValid && reviewedAtValid) require(Date.parse(receipt.generatedAt) <= Date.parse(reviewedAtValue),
    `${label}.candidates[${index}].generationRef.generatedAt 不能晚于 selection.reviewedAt`);
}

/** 未配置文件也先验证所有非空引用的项目边界，避免占位阶段藏入越界路径。 */
function validateProjectReference(repo, reference, label, require) {
  if (!isText(reference)) return;
  try {
    projectPath(repo, reference);
  } catch (error) {
    require(false, `${label} 路径无效：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 生成记录需要明确时区，避免把本地时间当作可比对的生成事实。 */
function validZonedPastTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i.test(value)
    && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
}

/** 把路径分隔符和大小写归一化后比较候选引用，兼容 Windows 路径语义。 */
function normalizePath(value) { return value.replaceAll("\\", "/").toLocaleLowerCase("en-US"); }

/** 排除空白、常见占位符和模板变量，防止伪造人工引用。 */
function isActualText(value) {
  if (!isText(value)) return false;
  const text = value.trim();
  return !/^(unknown|tbd|todo|待填写|未知|未配置|n\/a|null)$/i.test(text)
    && !/^<.*>$/.test(text) && !/\{\{.*\}\}/.test(text);
}

/** 判断字符串是否包含非空文本。 */
function isText(value) { return typeof value === "string" && value.trim().length > 0; }
