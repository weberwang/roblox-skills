import { readJson } from "./io.mjs";
import { checkEvidence } from "./evidence.mjs";
import { readProjectImage } from "./image-file.mjs";
import { checkResourceOutputs, resourceOutputIdentity } from "./resource-outputs.mjs";

/** V3 初始槽位不预填生产结果或人工接受；资源和场景分别验收。 */
export function createResourceAcceptance(item) {
  return { mode: "manual", result: "NOT_RUN", workItemId: item.id, candidate: item.candidate,
    componentIds: [], outputs: [], evidenceIds: [], userMessageRef: "", reviewedAt: null };
}

/** 空字符串不能代表资源身份或用户对正式资源的真实判断。 */
function text(value) { return typeof value === "string" && !!value.trim(); }

/** 时间用于约束真实生产顺序，不接受未来或不带时区的记录。 */
function validTime(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
}

/** V3 只验收正式资源范围；正式实例装配和源回读由 V4 执行。 */
export function checkResourceAcceptance(item, review, context) {
  const { require, repo } = context;
  const acceptance = review.resourceAcceptance;
  if (!acceptance || typeof acceptance !== "object" || Array.isArray(acceptance)) {
    require(false, "V3 必须记录 resourceAcceptance");
    return;
  }
  require(acceptance.mode === "manual" && ["NOT_RUN", "PASS", "FAIL"].includes(acceptance.result), "V3 资源必须保留独立人工验收结果");
  require(acceptance.workItemId === item.id && acceptance.candidate === review.candidate, "资源验收必须绑定本工作项和 V3 候选");
  const ids = Array.isArray(acceptance.componentIds) ? acceptance.componentIds : [];
  const evidenceIds = Array.isArray(acceptance.evidenceIds) ? acceptance.evidenceIds : [];
  require(Array.isArray(acceptance.componentIds) && ids.every(text) && new Set(ids).size === ids.length, "资源验收 componentIds 必须唯一");
  require(Array.isArray(acceptance.evidenceIds) && evidenceIds.every(text) && new Set(evidenceIds).size === evidenceIds.length, "资源验收 evidenceIds 必须唯一");
  if (acceptance.result === "NOT_RUN") {
    require(!text(acceptance.userMessageRef) && acceptance.reviewedAt === null && evidenceIds?.length === 0, "待验资源不能预填人工结论或证据");
    if (review.status === "complete") require(false, "V3 退出前必须完成人工资源验收");
    return;
  }
  require(text(acceptance.userMessageRef) && validTime(acceptance.reviewedAt)
    && Date.parse(acceptance.reviewedAt) >= Date.parse(review.startedAt), "资源验收必须有当前资源的真实用户回复及阶段内时间");
  if (review.status === "complete") {
    require(acceptance.result === "PASS", "V3 资源未获接受，不能进入正式场景实施");
    require(Date.parse(acceptance.reviewedAt) <= Date.parse(review.completedAt), "V3 资源验收不能晚于阶段完成");
  }
  let components;
  let decomposition;
  try {
    const v2 = item.stageReviews.find((entry) => entry?.stage === "V2");
    decomposition = readJson(repo, v2?.decompositionRef);
    components = decomposition.components.map((entry) => entry.componentId);
  } catch (error) { require(false, `资源验收缺少有效 V2 组件范围：${error.message}`); return; }
  const earlierMessages = new Set([
    ...item.stageReviews.filter((entry) => ["V0", "V1", "V2"].includes(entry.stage)).map((entry) => entry.userMessageRef),
    ...decomposition.sourceImages.map((source) => source.frozenRef),
    decomposition.decompositionConfirmation?.userMessageRef, decomposition.layoutConfirmation?.userMessageRef,
  ].filter(text));
  require(!earlierMessages.has(acceptance.userMessageRef), "V3 资源接受不能复用方向、拆解或布局确认");
  require(Array.isArray(ids) && ids.length === components.length && components.every((id) => ids.includes(id)), "资源验收必须覆盖 V2 全部组件，包含已复用及原生来源");
  const outputs = checkResourceOutputs(repo, decomposition.components, acceptance.outputs, context);
  const selected = (Array.isArray(item.evidence) ? item.evidence : []).filter((entry) => evidenceIds?.includes(entry?.id));
  const errors = [];
  const blockers = [];
  const usable = checkEvidence({ ...item, evidence: selected }, [], { repo, errors, blockers, evidenceTypes: ["visual"],
    require: (condition, message) => { if (!condition) errors.push(message); } });
  // 通用门在此只检查资源预览，运行日志与场景截图不能代替资源范围确认。
  for (const message of [...errors, ...blockers]) require(false, `资源验收证据：${message}`);
  require(selected.length > 0 && selected.length === evidenceIds?.length, "资源验收必须引用实际资源预览证据");
  const covered = new Set();
  for (const entry of selected) {
    const resource = entry.resources;
    require(usable.has(entry.id) && entry.type === "visual" && resource?.stageReviewId === review.id
      && Array.isArray(resource?.componentIds) && resource.componentIds.length > 0
      && new Set(resource.componentIds).size === resource.componentIds.length
      && resource.componentIds.every((id) => components.includes(id)), "资源预览必须精确绑定 V3 记录与组件范围");
    const previewOutputs = Array.isArray(resource?.outputs) ? resource.outputs : [];
    require(Array.isArray(resource?.outputs) && previewOutputs.length === resource?.componentIds?.length
      && new Set(previewOutputs.map((output) => output?.componentId)).size === previewOutputs.length
      && previewOutputs.every((output) => resource.componentIds.includes(output?.componentId)
        && outputs.has(output?.componentId) && resourceOutputIdentity(output) === resourceOutputIdentity(outputs.get(output.componentId))),
    "资源预览必须绑定本次接受的正式产出来源与修订");
    require(validTime(entry.observedAt) && Date.parse(entry.observedAt) >= Date.parse(review.startedAt)
      && Date.parse(entry.observedAt) <= Date.parse(acceptance.reviewedAt), "资源预览必须先于人工确认且来自本阶段");
    try { readProjectImage(repo, entry.path); } catch (error) { require(false, `资源预览图片：${error.message}`); }
    for (const id of Array.isArray(resource?.componentIds) ? resource.componentIds : []) covered.add(id);
  }
  require(components.every((id) => covered.has(id)), "资源预览没有覆盖全部待验组件");
}
