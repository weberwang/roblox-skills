/** V2 还原合同必须覆盖的视觉维度，机器只核对记录结构与引用关系。 */
export const RESTORATION_ASPECTS = Object.freeze([
  "silhouette",
  "proportion",
  "placement",
  "depth",
  "palette",
  "material",
  "textureScale",
  "lighting",
  "surface",
  "signature",
]);

const TARGET_STATUSES = new Set(["specified", "measured", "unknown", "not-applicable"]);
const FLEXIBILITY_OPTIONS = new Set(["fixed", "gameplay-adjustable"]);

/** 校验 V2 还原标准的字段、覆盖和 ID 关系，不评判画面质量或文字真伪。 */
export function validateRestoration(contract) {
  const restoration = contract?.restoration;
  if (!restoration || typeof restoration !== "object" || Array.isArray(restoration)) {
    throw new Error("V2 拆解合同必须提供 restoration 还原标准对象");
  }

  const sources = new Map((Array.isArray(contract.sourceImages) ? contract.sourceImages : []).map((source) => [source?.id, source]));
  const components = new Map((Array.isArray(contract.components) ? contract.components : []).map((component) => [component?.componentId, component]));
  const views = validateViews(restoration.views, sources);
  const { requirements, aspectsById } = validateRequirements(restoration.requirements, sources, components);
  validateCoverage(requirements, aspectsById, sources, components);
  validateSamplePlan(restoration.samplePlan, views, requirements, aspectsById, components);
  return true;
}

/** 校验目标机位记录完整，且每张冻结来源图至少绑定一个目标视图。 */
function validateViews(rawViews, sources) {
  if (!Array.isArray(rawViews) || rawViews.length === 0) throw new Error("restoration.views 必须是非空数组");
  const views = new Map();
  const sourceViewCounts = new Map([...sources.keys()].map((sourceId) => [sourceId, 0]));
  for (const [index, view] of rawViews.entries()) {
    for (const field of ["id", "purpose", "camera", "fov", "viewport", "anchors"]) {
      requireText(view?.[field], `restoration.views[${index}].${field}`);
    }
    requireText(view?.sourceImageId, `restoration.views[${index}].sourceImageId`);
    if (views.has(view.id)) throw new Error(`restoration.views 的 id 必须唯一：${view.id}`);
    if (!sources.has(view.sourceImageId)) throw new Error(`restoration.views[${index}] 引用了不存在的 sourceImageId`);
    views.set(view.id, view);
    sourceViewCounts.set(view.sourceImageId, sourceViewCounts.get(view.sourceImageId) + 1);
  }
  for (const [sourceId, count] of sourceViewCounts) if (count === 0) throw new Error(`V1 来源图片缺少对应还原视图：${sourceId}`);
  return views;
}

/** 校验每条还原要求的可追溯字段、枚举值和组件、来源引用。 */
function validateRequirements(rawRequirements, sources, components) {
  if (!Array.isArray(rawRequirements) || rawRequirements.length === 0) throw new Error("restoration.requirements 必须是非空数组");
  const requirements = new Map();
  const aspectsById = new Map();
  for (const [index, requirement] of rawRequirements.entries()) {
    const prefix = `restoration.requirements[${index}]`;
    for (const field of ["id", "aspect", "sourceImageId", "productionMethod", "consumer", "verification", "flexibility", "adjustmentReason"]) {
      requireText(requirement?.[field], `${prefix}.${field}`);
    }
    if (requirements.has(requirement.id)) throw new Error(`restoration.requirements 的 id 必须唯一：${requirement.id}`);
    if (!RESTORATION_ASPECTS.includes(requirement.aspect)) throw new Error(`${prefix}.aspect 不在允许枚举中`);
    if (!sources.has(requirement.sourceImageId)) throw new Error(`${prefix}.sourceImageId 引用了不存在的冻结来源图`);
    if (!Array.isArray(requirement.componentIds) || requirement.componentIds.length === 0) throw new Error(`${prefix}.componentIds 必须是非空数组`);
    validateReferences(requirement.componentIds, components, `${prefix}.componentIds`, "componentId");
    if (!FLEXIBILITY_OPTIONS.has(requirement.flexibility)) throw new Error(`${prefix}.flexibility 不在允许枚举中`);
    validateTarget(requirement.target, prefix);
    requirements.set(requirement.id, requirement);
    aspectsById.set(requirement.id, requirement.aspect);
  }
  return { requirements, aspectsById };
}

/** 校验目标状态及其依据字段，保留 unknown 的显式记录而不解析自由文本。 */
function validateTarget(target, prefix) {
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new Error(`${prefix}.target 必须是对象`);
  if (!TARGET_STATUSES.has(target.status)) throw new Error(`${prefix}.target.status 不在允许枚举中`);
  requireText(target.value, `${prefix}.target.value`);
  requireText(target.basis, `${prefix}.target.basis`);
}

/** 校验全维度覆盖，并保证每个来源图和拆解组件都至少有一条还原要求。 */
function validateCoverage(requirements, aspectsById, sources, components) {
  const coveredAspects = new Set(aspectsById.values());
  for (const aspect of RESTORATION_ASPECTS) if (!coveredAspects.has(aspect)) throw new Error(`restoration.requirements 缺少视觉维度：${aspect}`);
  const sourcesWithRequirements = new Set([...requirements.values()].map((requirement) => requirement.sourceImageId));
  for (const sourceId of sources.keys()) if (!sourcesWithRequirements.has(sourceId)) throw new Error(`V1 来源图片缺少还原要求：${sourceId}`);
  const componentsWithRequirements = new Set([...requirements.values()].flatMap((requirement) => requirement.componentIds));
  for (const componentId of components.keys()) if (!componentsWithRequirements.has(componentId)) throw new Error(`拆解组件缺少还原要求：${componentId}`);
}

/** 校验 V3 样板计划引用当前还原要求，并覆盖完整视觉维度与所需组件。 */
function validateSamplePlan(samplePlan, views, requirements, aspectsById, components) {
  if (!samplePlan || typeof samplePlan !== "object" || Array.isArray(samplePlan)) throw new Error("restoration.samplePlan 必须是对象");
  requireText(samplePlan.viewId, "restoration.samplePlan.viewId");
  requireText(samplePlan.combination, "restoration.samplePlan.combination");
  if (!views.has(samplePlan.viewId)) throw new Error("restoration.samplePlan.viewId 引用了不存在的还原视图");
  if (!Array.isArray(samplePlan.componentIds) || samplePlan.componentIds.length === 0) throw new Error("restoration.samplePlan.componentIds 必须是非空数组");
  if (!Array.isArray(samplePlan.requirementIds) || samplePlan.requirementIds.length === 0) throw new Error("restoration.samplePlan.requirementIds 必须是非空数组");
  validateReferences(samplePlan.componentIds, components, "restoration.samplePlan.componentIds", "componentId");
  validateReferences(samplePlan.requirementIds, requirements, "restoration.samplePlan.requirementIds", "requirementId");

  const sampleComponents = new Set(samplePlan.componentIds);
  const sampleAspects = new Set();
  for (const requirementId of samplePlan.requirementIds) {
    sampleAspects.add(aspectsById.get(requirementId));
    const requirement = requirements.get(requirementId);
    for (const componentId of requirement.componentIds) {
      if (!sampleComponents.has(componentId)) throw new Error(`样板组件未覆盖要求 ${requirementId} 所需组件 ${componentId}`);
    }
  }
  for (const aspect of RESTORATION_ASPECTS) if (!sampleAspects.has(aspect)) throw new Error(`restoration.samplePlan 缺少视觉维度：${aspect}`);
}

/** 校验非空且无重复的 ID 数组，并确认每个目标都存在。 */
function validateReferences(values, known, field, referenceName) {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    requireText(value, `${field}[${index}]`);
    if (seen.has(value)) throw new Error(`${field} 不能重复：${value}`);
    if (!known.has(value)) throw new Error(`${field} 引用了不存在的 ${referenceName}：${value}`);
    seen.add(value);
  }
}

/** 要求记录字段为非空文本，避免空模板槽被当作明确计划。 */
function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空文本`);
}
