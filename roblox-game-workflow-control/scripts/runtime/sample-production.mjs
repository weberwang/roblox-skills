import { readJson, projectPath } from "./io.mjs";
import { checkEvidence } from "./evidence.mjs";
import { readProjectImage } from "./image-file.mjs";

/** 组合样板必须逐项检查，技术加载结果不属于这些显示结论。 */
export const SAMPLE_CHECKS = Object.freeze(["proportion", "silhouette", "materialScale", "seams", "occlusion", "depth", "style"]);

/** V4 只增加阶段内生产记录，不创建第二套状态或预填视觉接受。 */
export function createSampleProduction() { return { sampleAttempts: [], expansions: [] }; }

/** 非空引用只证明记录存在；消息真实性和画面质量仍由实际检查负责。 */
function text(value) { return typeof value === "string" && !!value.trim(); }

/** 接受和扩批均使用真实带时区时间，拒绝未来记录。 */
function time(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
}

/** 核对非空、唯一的编号集合，允许记录额外样板组件但不能漏掉 V2 最小组合。 */
function covers(values, expected) {
  return Array.isArray(values) && values.length > 0 && values.every(text)
    && new Set(values).size === values.length && expected.every((id) => values.includes(id));
}

/** 样板身份必须精确到当前轮次和机位，不能借用旧候选或全局方向确认。 */
function sameSample(record, sample) {
  return record?.scope === "sample" && record.sampleId === sample.id && record.candidate === sample.candidate
    && record.revision === sample.revision && record.viewId === sample.viewId;
}

/** V4 中先核对代表性样板，再核对扩批先后关系；全程不读取或评判图片像素。 */
export function checkSampleProduction(item, review, context) {
  const { require, repo } = context;
  const production = review.production;
  if (!production || !Array.isArray(production.sampleAttempts) || !Array.isArray(production.expansions)) {
    require(false, "V4 必须记录 production.sampleAttempts 与 expansions");
    return;
  }
  let contract;
  try {
    const v2 = item.stageReviews.find((entry) => entry?.stage === "V2");
    contract = readJson(repo, v2?.decompositionRef);
    if (!contract.restoration?.samplePlan) throw new Error("缺少 V2 还原标准与样板计划");
  } catch (error) { require(false, `V4 样板计划：${error.message}`); return; }
  const plan = contract.restoration.samplePlan;
  const samples = new Map();
  const paths = new Set();
  const messages = new Set();
  // 自动授权可以覆盖多轮，但已知权限来源不能冒充任何一轮的人工接受回复。
  const automaticAuthorizations = new Set(production.sampleAttempts
    .filter((sample) => sample?.acceptance?.mode === "automatic")
    .map((sample) => sample.acceptance.authorization?.userMessageRef).filter(text));
  const sourceRefs = new Set([
    ...contract.sourceImages.map((source) => source.frozenRef),
    contract.decompositionConfirmation?.userMessageRef,
    contract.layoutConfirmation?.userMessageRef,
    item.stageReviews.find((entry) => entry?.stage === "V3")?.resourceAcceptance?.userMessageRef,
  ].filter(text));
  for (const stage of item.stageReviews.filter((entry) => ["V0", "V1", "V2"].includes(entry.stage))) {
    if (text(stage.userMessageRef)) sourceRefs.add(stage.userMessageRef);
  }
  let previous = null;
  for (const sample of production.sampleAttempts) {
    const before = context.errors.length;
    if (!sample || typeof sample !== "object") { require(false, "样板轮次必须是对象"); continue; }
    require(text(sample.id) && !samples.has(sample.id), "样板 id 必须非空且唯一");
    require(Number.isSafeInteger(sample.revision) && sample.revision > (previous?.revision ?? 0), "样板 revision 必须递增");
    require(text(sample.candidate), "样板必须声明实际 candidate");
    require(time(sample.createdAt) && Date.parse(sample.createdAt) >= Date.parse(review.startedAt)
      && (!previous || Date.parse(sample.createdAt) >= Date.parse(previous.createdAt)), "样板 createdAt 必须在 V4 内按真实时间排列");
    require(sample.viewId === plan.viewId, "样板必须使用 V2 目标机位");
    require(covers(sample.componentIds, plan.componentIds) && sample.componentIds.every((id) => contract.components.some((entry) => entry.componentId === id)), "样板缺少 V2 代表性组合组件或引用未知组件");
    require(covers(sample.requirementIds, plan.requirementIds) && sample.requirementIds.every((id) => contract.restoration.requirements.some((entry) => entry.id === id)), "样板缺少 V2 还原要求或引用未知要求");
    const checks = Array.isArray(sample.checks) ? sample.checks : [];
    require(checks.length === SAMPLE_CHECKS.length && SAMPLE_CHECKS.every((id) => checks.filter((entry) => entry?.id === id).length === 1)
      && checks.every((entry) => ["PASS", "FAIL", "NOT_RUN"].includes(entry.result) && text(entry.basis)), "样板必须分项记录比例、轮廓、材质尺度、接缝、遮挡、层次及风格检查");
    const evidence = checkSampleEvidence(item, review, sample, paths, context);
    const acceptance = sample.acceptance;
    require(["NOT_RUN", "PASS", "FAIL"].includes(acceptance?.result), "样板接受结果只能为 NOT_RUN/PASS/FAIL");
    require(["manual", "automatic"].includes(acceptance?.mode) && sameSample(acceptance, sample), "样板接受必须声明检查方式并精确绑定当前样板范围");
    if (["PASS", "FAIL"].includes(acceptance?.result)) {
      require(time(acceptance.reviewedAt) && Date.parse(acceptance.reviewedAt) >= Date.parse(sample.createdAt)
        && evidence.every((entry) => Date.parse(acceptance.reviewedAt) >= Date.parse(entry.observedAt)), "样板结论必须晚于当前样板及其截图");
      require(covers(acceptance.evidenceIds, sample.evidenceIds) && acceptance.evidenceIds.length === sample.evidenceIds.length && evidence.length > 0,
        "样板结论必须引用本轮组合 visual 证据，技术 PASS 或 ready 不能替代");
      if (acceptance.mode === "manual") {
        require(text(acceptance.userMessageRef) && !sourceRefs.has(acceptance.userMessageRef)
          && !messages.has(acceptance.userMessageRef) && !automaticAuthorizations.has(acceptance.userMessageRef), "样板人工确认必须引用专属当前轮次的真实用户回复，不能复用方向批准、旧确认或自动授权");
        require(acceptance.authorization === null, "人工确认不得混入自动视觉授权");
      } else {
        require(!text(acceptance.userMessageRef) && text(acceptance.authorization?.userMessageRef)
          && !sourceRefs.has(acceptance.authorization.userMessageRef)
          && !messages.has(acceptance.authorization.userMessageRef)
          && sameSample(acceptance.authorization, sample), "自动视觉检查必须有精确范围的用户授权，不能冒充人工确认");
      }
      if (text(acceptance.userMessageRef)) messages.add(acceptance.userMessageRef);
      if (acceptance.result === "PASS") require(checks.every((entry) => entry.result === "PASS"), "样板接受前必须完成全部组合显示检查");
    } else {
      require(!text(acceptance?.userMessageRef) && !text(acceptance?.reviewedAt)
        && Array.isArray(acceptance?.evidenceIds) && acceptance.evidenceIds.length === 0, "未检查样板不得预填接受证据或用户确认");
    }
    samples.set(sample.id, { sample, valid: before === context.errors.length });
    previous = sample;
  }
  for (const expansion of production.expansions) {
    if (!expansion || typeof expansion !== "object") { require(false, "扩展记录必须是对象"); continue; }
    require(["scene-assembly", "full-scene-layout"].includes(expansion.kind) && text(expansion.scope), "扩展必须区分批量场景装配与全场铺设并声明范围");
    require(time(expansion.startedAt), "扩展必须记录真实 startedAt");
    if (review.status === "complete") require(Date.parse(expansion.startedAt) <= Date.parse(review.completedAt), "V4 完成时间不能早于已登记扩展开工");
    const selected = samples.get(expansion.sampleId);
    // 后来的修复不能追认先前违规扩批；每次开工只能使用当时最新且已接受的样板。
    const latest = [...samples.values()].filter(({ sample }) => Date.parse(sample.createdAt) <= Date.parse(expansion.startedAt)).at(-1);
    require(selected && selected === latest && selected.valid && selected.sample.acceptance?.result === "PASS"
      && expansion.revision === selected.sample.revision && expansion.candidate === selected.sample.candidate
      && Date.parse(expansion.startedAt) >= Date.parse(selected.sample.acceptance.reviewedAt), "样板尚未接受或已失效，不得批量场景装配或全场铺设");
  }
  const latest = [...samples.values()].at(-1);
  if (latest) require(latest.sample.candidate === item.candidate, "最新样板必须绑定当前 candidate，旧候选不能恢复生产");
  if (review.status === "complete") {
    require(latest?.valid && latest.sample.candidate === item.candidate && latest.sample.acceptance?.result === "PASS", "V4 退出必须有当前代表性样板显示接受，生成成功/技术 PASS/资源 ready 不能替代");
    require(latest && Date.parse(latest.sample.acceptance?.reviewedAt) <= Date.parse(review.completedAt), "V4 退出时间不能早于样板接受");
  }
}

/** 复用通用证据身份检查，仅补充当前样板、视角及截图新鲜度关系。 */
function checkSampleEvidence(item, review, sample, paths, context) {
  const { require, repo } = context;
  require(Array.isArray(sample.evidenceIds) && new Set(sample.evidenceIds).size === sample.evidenceIds.length && sample.evidenceIds.every(text), "样板 evidenceIds 必须是唯一文本数组");
  const selected = (item.evidence ?? []).filter((entry) => sample.evidenceIds?.includes(entry.id));
  const errors = [];
  const blockers = [];
  const local = { repo, errors, blockers, evidenceTypes: ["visual"], require: (condition, message) => { if (!condition) errors.push(message); } };
  // 历史候选的真实失败与复验仍可保存，但不会成为当前扩展门的可用结论。
  checkEvidence({ ...item, candidate: sample.candidate, evidence: selected }, [], local);
  for (const message of [...errors, ...blockers]) require(false, `样板证据：${message}`);
  require(selected.length === sample.evidenceIds?.length, "样板 visual 证据引用缺失");
  for (const entry of selected) {
    require(entry.type === "visual" && entry.result === "PASS" && entry.candidate === sample.candidate
      && entry.sample?.stageReviewId === review.id && entry.sample?.sampleId === sample.id
      && entry.sample?.revision === sample.revision && entry.sample?.viewId === sample.viewId, "样板证据必须绑定本轮候选、版本和机位，不能借用技术证据或旧截图");
    require(time(entry.observedAt) && Date.parse(entry.observedAt) >= Date.parse(sample.createdAt), "样板截图不能早于本轮创建或晚于当前时间");
    try {
      readProjectImage(repo, entry.path);
      const path = projectPath(repo, entry.path).toLowerCase();
      require(!paths.has(path), "不同样板轮次不得复用旧截图路径");
      paths.add(path);
    } catch (error) { require(false, `样板截图：${error.message}`); }
  }
  return selected;
}
