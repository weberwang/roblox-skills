import { readProjectImage } from "./image-file.mjs";
import { validateRestoration } from "./restoration.mjs";

const ROUTES = new Set(["IMAGE_ASSET", "ROBLOX_NATIVE", "REUSE", "MODEL_3D", "MATERIAL", "VFX"]);

/** 返回正的有限尺寸；拒绝 NaN、无穷值和零面积标注。 */
function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** 要求 JSON 对象字段是非空文本，避免模板占位被误判为交付。 */
function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空文本`);
}

/** 检查合同结构及其与 V1 阶段、V2 候选的绑定，并验证所有标注图片。 */
export function validateDecomposition(repo, item, review, contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) throw new Error("V2 拆解合同必须是 JSON 对象");
  if (contract.version !== 1 || contract.workItemId !== item.id || contract.candidate !== review.candidate) {
    throw new Error("V2 拆解合同版本、工作项或候选身份不匹配");
  }

  const v1 = item.stageReviews?.find((entry) => entry?.stage === "V1");
  if (!v1 || v1.status !== "complete" || !v1.id || !v1.candidate) throw new Error("拆解图来源必须绑定本工作项已完成的 V1 阶段");
  if (!Array.isArray(contract.sourceImages) || contract.sourceImages.length === 0) throw new Error("V2 至少需要一张 V1 冻结效果图");
  const sourcesById = new Map();
  const sourceByState = new Map();
  for (const [index, source] of contract.sourceImages.entries()) {
    for (const key of ["id", "stageReviewId", "candidate", "version", "path", "state", "frozenRef"]) requireText(source?.[key], `sourceImages[${index}].${key}`);
    if (source.stageReviewId !== v1.id || source.candidate !== v1.candidate) throw new Error(`sourceImages[${index}] 未绑定本工作项已完成的 V1 review`);
    if (!Number.isSafeInteger(source.width) || source.width < 1 || !Number.isSafeInteger(source.height) || source.height < 1) {
      throw new Error(`sourceImages[${index}] width/height 必须为正安全整数`);
    }
    if (sourcesById.has(source.id) || sourceByState.has(source.state)) throw new Error("V1 来源图片 id 与 state 必须唯一");
    const image = readProjectImage(repo, source.path);
    if (image.width !== source.width || image.height !== source.height) throw new Error(`来源图片尺寸与合同不匹配：${source.id}`);
    sourcesById.set(source.id, { ...source, absolutePath: image.absolutePath });
    sourceByState.set(source.state, source.id);
  }

  if (!Array.isArray(contract.components) || contract.components.length === 0) throw new Error("V2 拆解合同至少需要一个组件");
  const components = new Map();
  const elementIndexes = new Set();
  for (const [index, component] of contract.components.entries()) {
    for (const key of ["componentId", "purpose", "visualFeatures", "sourceRef", "consumerNodeId", "assembly", "layoutRef", "productionBoundary", "owner"]) {
      requireText(component?.[key], `components[${index}].${key}`);
    }
    if (!Number.isSafeInteger(component.elementIndex) || component.elementIndex < 1) throw new Error(`components[${index}].elementIndex 必须是正安全整数`);
    if (components.has(component.componentId) || elementIndexes.has(component.elementIndex)) throw new Error("componentId 与 elementIndex 必须稳定且唯一");
    if (component.parentId !== null && (typeof component.parentId !== "string" || !component.parentId.trim())) throw new Error(`${component.componentId}.parentId 必须是组件 id 或 null`);
    if (component.group !== null) requireText(component.group, `${component.componentId}.group`);
    if (!ROUTES.has(component.productionRoute)) throw new Error(`${component.componentId}.productionRoute 不在允许枚举中`);
    if (!Array.isArray(component.states) || component.states.length === 0 || component.states.some((state) => typeof state !== "string" || !state.trim())) {
      throw new Error(`${component.componentId}.states 必须是非空文本数组`);
    }
    if (new Set(component.states).size !== component.states.length) throw new Error(`${component.componentId}.states 不能重复`);
    for (const state of component.states) if (!sourceByState.has(state)) throw new Error(`${component.componentId} 使用了不存在的 V1 source state：${state}`);
    components.set(component.componentId, component);
    elementIndexes.add(component.elementIndex);
  }
  validateParentGraph(components);

  if (!Array.isArray(contract.previews) || contract.previews.length === 0) throw new Error("V2 拆解合同至少需要一张标注预览图");
  const previewsBySource = new Map();
  const sourceImagePaths = new Set([...sourcesById.values()].map((source) => source.absolutePath.toLowerCase()));
  for (const sourceId of sourcesById.keys()) previewsBySource.set(sourceId, []);
  for (const [index, preview] of contract.previews.entries()) {
    requireText(preview?.path, `previews[${index}].path`);
    requireText(preview?.presentedRef, `previews[${index}].presentedRef`);
    const source = sourcesById.get(preview.sourceImageId);
    if (!source) throw new Error(`previews[${index}] 引用了不存在的 sourceImageId`);
    const image = readProjectImage(repo, preview.path);
    if (sourceImagePaths.has(image.absolutePath.toLowerCase())) throw new Error(`预览输出不能覆盖任何 V1 原图：${preview.path}`);
    if (!Array.isArray(preview.annotations) || preview.annotations.length === 0) throw new Error(`previews[${index}].annotations 必须是非空数组`);
    const annotated = new Set();
    for (const [annotationIndex, annotation] of preview.annotations.entries()) {
      requireText(annotation?.componentId, `previews[${index}].annotations[${annotationIndex}].componentId`);
      requireText(annotation?.label, `previews[${index}].annotations[${annotationIndex}].label`);
      if (!components.has(annotation.componentId)) throw new Error(`标注引用未知 componentId：${annotation.componentId}`);
      if (!components.get(annotation.componentId).states.includes(source.state)) throw new Error(`${annotation.componentId} 未声明来源状态 ${source.state}`);
      if (annotated.has(annotation.componentId)) throw new Error(`同一预览图重复标注组件：${annotation.componentId}`);
      annotated.add(annotation.componentId);
      validateBounds(annotation.bounds, source, `previews[${index}].annotations[${annotationIndex}].bounds`);
    }
    previewsBySource.get(preview.sourceImageId).push({ preview, annotated });
  }
  for (const [sourceId, previews] of previewsBySource) if (previews.length === 0) throw new Error(`V1 来源图片缺少对应标注预览：${sourceId}`);
  for (const component of components.values()) {
    for (const state of component.states) {
      const sourceId = sourceByState.get(state);
      if (!previewsBySource.get(sourceId).some(({ annotated }) => annotated.has(component.componentId))) {
        throw new Error(`${component.componentId} 在状态 ${state} 的来源预览中缺少标注`);
      }
    }
  }

  if (contract.coverage?.allSignificantElementsMapped !== true || !Array.isArray(contract.coverage.exclusions)) {
    throw new Error("coverage 必须声明 allSignificantElementsMapped:true 并提供 exclusions 数组");
  }
  for (const [index, exclusion] of contract.coverage.exclusions.entries()) {
    requireText(exclusion?.description, `coverage.exclusions[${index}].description`);
    requireText(exclusion?.reason, `coverage.exclusions[${index}].reason`);
  }
  validateRestoration(contract);
  return true;
}

/** 验证父组件引用存在且无环，避免编号拆解图出现悬空层级。 */
function validateParentGraph(components) {
  for (const component of components.values()) {
    if (component.parentId !== null && !components.has(component.parentId)) throw new Error(`${component.componentId}.parentId 引用不存在的组件`);
  }
  const visiting = new Set();
  const visited = new Set();
  /** 深度优先检查每个父引用，visiting 集合只表示当前递归路径。 */
  const visit = (componentId) => {
    if (visiting.has(componentId)) throw new Error("拆解组件 parentId 存在循环");
    if (visited.has(componentId)) return;
    visiting.add(componentId);
    const parentId = components.get(componentId).parentId;
    if (parentId !== null) visit(parentId);
    visiting.delete(componentId);
    visited.add(componentId);
  };
  for (const componentId of components.keys()) visit(componentId);
}

/** 检查矩形标注完全位于其冻结来源图范围内。 */
function validateBounds(bounds, source, field) {
  if (!bounds || !["x", "y", "width", "height"].every((key) => Number.isFinite(bounds[key]))) throw new Error(`${field} 必须包含有限 x/y/width/height`);
  if (bounds.x < 0 || bounds.y < 0 || !isPositiveNumber(bounds.width) || !isPositiveNumber(bounds.height)
      || bounds.x + bounds.width > source.width || bounds.y + bounds.height > source.height) {
    throw new Error(`${field} 超出来源图边界`);
  }
}
