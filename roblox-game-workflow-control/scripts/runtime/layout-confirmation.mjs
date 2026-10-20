import { readProjectImage } from "./image-file.mjs";

const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;

/** 要求合同字段是非空文本，防止空白占位值充当确认依据。 */
function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空文本`);
}

/** 将缺失布局图片转换为可定位的合同错误，其余图片格式错误保留原始原因。 */
function readLayoutImage(repo, localPath) {
  try { return readProjectImage(repo, localPath); }
  catch (error) {
    if (error?.code === "ENOENT") throw new Error(`布局图片文件缺失或为空：${localPath}`);
    throw error;
  }
}

/** 校验带时区的真实时间，并将每个阶段事件限制在 V2 活动区间内。 */
function requireV2Time(value, field, review, { strictlyAfter = null } = {}) {
  if (typeof value !== "string" || !ISO_DATE.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} 必须是有效的带时区 ISO 时间`);
  }
  const timestamp = Date.parse(value);
  if (timestamp > Date.now()) throw new Error(`${field} 不能晚于当前时间`);
  if (ISO_DATE.test(review.startedAt ?? "") && timestamp < Date.parse(review.startedAt)) {
    throw new Error(`${field} 不能早于 V2 阶段开始时间`);
  }
  if (review.status === "complete" && ISO_DATE.test(review.completedAt ?? "") && timestamp > Date.parse(review.completedAt)) {
    throw new Error(`${field} 不能晚于 V2 阶段完成时间`);
  }
  if (strictlyAfter !== null && timestamp <= strictlyAfter) throw new Error(`${field} 必须晚于前置确认或布局生成时间`);
  return timestamp;
}

/** 核验确认记录均为当前 V2 工作项和候选的人工接受。 */
function validateConfirmationIdentity(confirmation, field, item, review) {
  if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) throw new Error(`${field} 必须是对象`);
  requireText(confirmation.id, `${field}.id`);
  if (confirmation.mode !== "manual" || confirmation.status !== "accepted") {
    throw new Error(`${field} 必须明确记录 manual accepted`);
  }
  if (confirmation.workItemId !== item.id || confirmation.candidate !== review.candidate) {
    throw new Error(`${field} 必须绑定当前 V2 工作项和候选`);
  }
  requireText(confirmation.userMessageRef, `${field}.userMessageRef`);
  return requireV2Time(confirmation.confirmedAt, `${field}.confirmedAt`, review);
}

/** V2 的两次确认必须使用新的回复，不能借用来源冻结或 V0/V1 阶段确认。 */
function validateIndependentConfirmationRefs(item, contract, decomposition, layoutConfirmation) {
  const priorRefs = new Set(contract.sourceImages.map((source) => source.frozenRef).filter((value) => typeof value === "string" && value.trim()));
  for (const review of item.stageReviews ?? []) {
    if (["V0", "V1"].includes(review?.stage) && typeof review.userMessageRef === "string" && review.userMessageRef.trim()) {
      priorRefs.add(review.userMessageRef);
    }
  }
  if (priorRefs.has(decomposition.userMessageRef)) {
    throw new Error("decompositionConfirmation.userMessageRef 不能复用 V1 来源冻结引用或 V0/V1 阶段确认");
  }
  if (priorRefs.has(layoutConfirmation.userMessageRef)) {
    throw new Error("layoutConfirmation.userMessageRef 不能复用 V1 来源冻结引用或 V0/V1 阶段确认");
  }
}

/** 将图片路径、来源身份和状态组合成可逐项核对的绑定键。 */
function previewBindingKey(binding) {
  return JSON.stringify([binding.path, binding.sourceImageId, binding.state]);
}

/** 确认必须覆盖所有当前拆解预览，且不能复用或改写其中任一绑定。 */
function validatePreviewBindings(repo, contract, sourcesById, confirmation) {
  const expected = [];
  const seenPaths = new Set();
  for (const [index, preview] of contract.previews.entries()) {
    const source = sourcesById.get(preview.sourceImageId);
    if (!source) throw new Error(`previews[${index}] 引用了不存在的来源图`);
    const image = readProjectImage(repo, preview.path);
    const fileKey = image.absolutePath.toLowerCase();
    if (seenPaths.has(fileKey)) throw new Error("每张 V2 拆解预览必须使用独立文件路径");
    seenPaths.add(fileKey);
    expected.push({ path: preview.path, sourceImageId: source.id, state: source.state });
  }
  const bindings = confirmation.previewBindings;
  if (!Array.isArray(bindings) || bindings.length !== expected.length) {
    throw new Error("decompositionConfirmation.previewBindings 必须逐张绑定当前全部拆解预览");
  }
  const expectedKeys = new Set(expected.map(previewBindingKey));
  const actualKeys = new Set();
  for (const [index, binding] of bindings.entries()) {
    requireText(binding?.path, `decompositionConfirmation.previewBindings[${index}].path`);
    requireText(binding?.sourceImageId, `decompositionConfirmation.previewBindings[${index}].sourceImageId`);
    requireText(binding?.state, `decompositionConfirmation.previewBindings[${index}].state`);
    const key = previewBindingKey(binding);
    if (actualKeys.has(key)) throw new Error("拆解确认不能重复绑定同一预览文件和状态");
    actualKeys.add(key);
    if (!expectedKeys.has(key)) throw new Error("拆解确认必须绑定当前合同中的预览文件、来源和状态");
  }
}

/** 验证 V2 拆解确认、逐状态布局图片及其独立人工确认的串行关系。 */
export function validateLayoutConfirmation(repo, item, review, contract, sourcesById, componentsById) {
  const decomposition = contract.decompositionConfirmation;
  const decompositionTime = validateConfirmationIdentity(decomposition, "decompositionConfirmation", item, review);
  validatePreviewBindings(repo, contract, sourcesById, decomposition);

  if (!Array.isArray(contract.layouts) || contract.layouts.length !== sourcesById.size || contract.layouts.length === 0) {
    throw new Error("layouts 必须为每个来源状态提供且仅提供一张布局图片");
  }
  const sourceByState = new Map([...sourcesById.values()].map((source) => [source.state, source]));
  const previewByPath = new Map(contract.previews.map((preview) => [preview.path, preview]));
  const sourcePaths = new Set([...sourcesById.values()].map((source) => source.absolutePath.toLowerCase()));
  const previewPaths = new Set(contract.previews.map((preview) => readProjectImage(repo, preview.path).absolutePath.toLowerCase()));
  const layoutIds = new Set();
  const layoutPaths = new Set();
  const layoutStates = new Set();
  const layoutPresentationRefs = new Set();
  const layoutById = new Map();
  let latestGeneration = decompositionTime;

  for (const [index, layout] of contract.layouts.entries()) {
    const field = `layouts[${index}]`;
    for (const key of ["id", "sourceImageId", "state", "previewPath", "path", "presentedRef"]) requireText(layout?.[key], `${field}.${key}`);
    if (layoutIds.has(layout.id)) throw new Error("布局图片 id 必须唯一");
    if (layoutStates.has(layout.state)) throw new Error("每个状态只能有一张独立布局图片");
    layoutIds.add(layout.id);
    layoutStates.add(layout.state);

    const source = sourcesById.get(layout.sourceImageId);
    if (!source || sourceByState.get(layout.state)?.id !== source.id) throw new Error(`${field} 必须绑定对应来源图片和状态`);
    const preview = previewByPath.get(layout.previewPath);
    if (!preview || preview.sourceImageId !== source.id) throw new Error(`${field}.previewPath 必须引用同一来源状态的拆解预览`);

    const expectedComponents = [...componentsById.values()].filter((component) => component.states.includes(layout.state)).map((component) => component.componentId);
    if (!Array.isArray(layout.componentIds) || layout.componentIds.length !== expectedComponents.length
        || new Set(layout.componentIds).size !== layout.componentIds.length
        || layout.componentIds.some((id) => !expectedComponents.includes(id))) {
      throw new Error(`${field}.componentIds 必须精确覆盖状态 ${layout.state} 的全部组件身份`);
    }

    const image = readLayoutImage(repo, layout.path);
    const fileKey = image.absolutePath.toLowerCase();
    if (sourcePaths.has(fileKey) || previewPaths.has(fileKey)) throw new Error(`${field}.path 不能冒用 V1 来源图或 V2 拆解预览`);
    if (layoutPaths.has(fileKey)) throw new Error("每个状态必须使用独立布局图片文件");
    if (layoutPresentationRefs.has(layout.presentedRef)) throw new Error("每张布局图片必须有独立的展示引用");
    layoutPaths.add(fileKey);
    layoutPresentationRefs.add(layout.presentedRef);
    const generatedAt = requireV2Time(layout.generatedAt, `${field}.generatedAt`, review, { strictlyAfter: decompositionTime });
    latestGeneration = Math.max(latestGeneration, generatedAt);
    layoutById.set(layout.id, layout);
  }

  if (layoutStates.size !== sourceByState.size || [...sourceByState.keys()].some((state) => !layoutStates.has(state))) {
    throw new Error("layouts 必须覆盖每个来源状态且不得增加其他状态");
  }

  const layoutConfirmation = contract.layoutConfirmation;
  const layoutConfirmationTime = validateConfirmationIdentity(layoutConfirmation, "layoutConfirmation", item, review);
  if (layoutConfirmation.id === decomposition.id) throw new Error("拆解确认与布局确认必须使用不同 id");
  if (layoutConfirmation.userMessageRef === decomposition.userMessageRef) throw new Error("拆解确认与布局确认必须引用两条独立用户回复");
  validateIndependentConfirmationRefs(item, contract, decomposition, layoutConfirmation);
  if (layoutConfirmation.decompositionConfirmationId !== decomposition.id) {
    throw new Error("layoutConfirmation 必须引用当前 decompositionConfirmation.id");
  }
  if (layoutConfirmationTime <= decompositionTime || layoutConfirmationTime <= latestGeneration) {
    throw new Error("布局确认必须晚于拆解确认和所有布局图片生成时间");
  }

  const bindings = layoutConfirmation.layoutBindings;
  if (!Array.isArray(bindings) || bindings.length !== layoutById.size) {
    throw new Error("layoutConfirmation.layoutBindings 必须逐张绑定当前全部布局图片");
  }
  const expectedBindings = new Set([...layoutById.values()].map((layout) => JSON.stringify([
    layout.id, layout.sourceImageId, layout.state, layout.previewPath, layout.path,
  ])));
  const actualBindings = new Set();
  for (const [index, binding] of bindings.entries()) {
    const field = `layoutConfirmation.layoutBindings[${index}]`;
    for (const key of ["layoutId", "sourceImageId", "state", "previewPath", "path"]) requireText(binding?.[key], `${field}.${key}`);
    const key = JSON.stringify([binding.layoutId, binding.sourceImageId, binding.state, binding.previewPath, binding.path]);
    if (actualBindings.has(key)) throw new Error("布局确认不能重复绑定同一布局图片");
    actualBindings.add(key);
    if (!expectedBindings.has(key)) throw new Error("布局确认必须绑定当前布局图片、来源和状态");
  }
  return true;
}
