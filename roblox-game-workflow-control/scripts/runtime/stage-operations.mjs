import { checkStages, createStageReview, STAGES } from "./stages.mjs";

const DELIVERY_FIELDS = Object.freeze([
  "path", "section", "deliverables", "exitChecks", "presentedRef", "remainingIssues", "nextAction", "reuse", "evidenceIds", "userMessageRef", "decompositionRef", "production",
]);

/** 运行阶段校验并返回 CLI 可展示的局部状态，不把结构通过解释成引擎验收。 */
export function stageStatus(item, repo) {
  const errors = [];
  const blockers = [];
  if (!item || !["SCENE", "DISPLAY_LAYER"].includes(item.type)) {
    return { valid: false, canAdvance: false, currentStage: item?.stage ?? null,
      errors: ["阶段操作只适用于 SCENE 或 DISPLAY_LAYER 工作项"], blockers };
  }
  const context = { repo, errors, blockers, require: (condition, message) => { if (!condition) errors.push(message); } };
  try { checkStages(item, context); }
  catch (error) { errors.push(`阶段记录检查失败：${error.message}`); }
  const current = Array.isArray(item?.stageReviews) ? item.stageReviews.at(-1) : null;
  const currentStage = current?.stage ?? item?.stage ?? null;
  const canAdvance = errors.length === 0 && blockers.length === 0 && current?.status === "complete"
    && STAGES.includes(currentStage) && currentStage !== "V4";
  return { valid: errors.length === 0 && blockers.length === 0, canAdvance, currentStage, errors, blockers };
}

/** 完成唯一当前活动阶段；只接受交付字段并返回新对象，失败记录进入只追加历史。 */
export function completeCurrentStage(item, repo, delivery, { now = new Date().toISOString(), validateExit } = {}) {
  const before = stageStatus(item, repo);
  if (before.errors.length || before.blockers.length) throw stageError("当前阶段或其前置交付尚未通过检查", before);
  const reviews = item.stageReviews;
  const current = reviews.at(-1);
  if (current.status !== "active") throw new Error("只能完成最后一条 active 阶段记录");
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) throw new Error("阶段完成必须提供交付对象");
  const unknown = Object.keys(delivery).filter((key) => !DELIVERY_FIELDS.includes(key));
  if (unknown.length) throw new Error(`阶段完成输入只允许交付字段，拒绝：${unknown.join(", ")}`);
  if (Object.hasOwn(delivery, "decompositionRef") && current.stage !== "V2") {
    throw new Error("只有 V2 阶段可以提交 decompositionRef");
  }
  if (Object.hasOwn(delivery, "production") && current.stage !== "V3") throw new Error("只有 V3 阶段可以提交 production");
  if (current.stage === "V3" && Object.hasOwn(delivery, "production")) preserveProductionHistory(current.production, delivery.production);
  if (typeof now !== "string" || !Number.isFinite(Date.parse(now)) || Date.parse(now) > Date.now()) throw new Error("阶段 completedAt 必须是实际且不晚于当前的时间");

  const updated = structuredClone(item);
  const target = updated.stageReviews.at(-1);
  // 旧 FAIL/BLOCKED 是诊断记录，阶段复验只更新当前结论并保留原始失败条目。
  const earlierFailures = Array.isArray(target.exitChecks) ? target.exitChecks.filter((entry) => ["FAIL", "BLOCKED"].includes(entry?.result)) : [];
  target.exitCheckHistory = [...(Array.isArray(target.exitCheckHistory) ? target.exitCheckHistory : []), ...structuredClone(earlierFailures)];
  for (const field of DELIVERY_FIELDS) if (Object.hasOwn(delivery, field)) target[field] = structuredClone(delivery[field]);
  target.status = "complete";
  target.completedAt = now;

  const after = stageStatus(updated, repo);
  if (after.errors.length || after.blockers.length) throw stageError("阶段交付或退出条件不完整", after);
  if (target.stage === "V4") {
    if (typeof validateExit !== "function") throw new Error("完成 V4 必须注入完整运行与人工显示门 validateExit");
    const result = validateExit(updated, repo, target);
    if (result === false || (result && typeof result === "object" && (result.valid === false
      || result.ready === false || (Array.isArray(result.errors) && result.errors.length)
      || (Array.isArray(result.blockers) && result.blockers.length)))) {
      throw stageError("V4 运行或人工显示门未通过", result ?? {});
    }
  }
  return updated;
}

/** 已判断轮次与已开工扩展不可被完成输入删除或改写；待检查轮次可补充真实接受结论。 */
function preserveProductionHistory(before, after) {
  if (!after || !Array.isArray(after.sampleAttempts) || !Array.isArray(after.expansions)) throw new Error("V3 production 必须包含样板与扩展数组");
  const samples = before?.sampleAttempts ?? [];
  if (after.sampleAttempts.length < samples.length || samples.some((sample, index) => {
    const updated = after.sampleAttempts[index];
    if (["PASS", "FAIL"].includes(sample.acceptance?.result)) return JSON.stringify(sample) !== JSON.stringify(updated);
    return ["id", "revision", "candidate", "viewId", "createdAt"].some((key) => sample[key] !== updated?.[key]);
  })) throw new Error("不得删除或改写样板历史，修复须追加新轮次和新证据");
  const expansions = before?.expansions ?? [];
  if (after.expansions.length < expansions.length || expansions.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(after.expansions[index]))) {
    throw new Error("不得删除或改写已有扩展历史");
  }
}

/** 仅推进一阶段；调用者不能指定目标阶段，也不能批量生成阶段历史。 */
export function advanceStage(item, repo, { now = new Date().toISOString() } = {}) {
  const status = stageStatus(item, repo);
  if (status.errors.length || status.blockers.length) throw stageError("当前阶段链无效，不能推进", status);
  if (!status.canAdvance) throw new Error("只有已完整交付的当前阶段可以推进，V4 之后不能继续");
  const nextIndex = STAGES.indexOf(status.currentStage) + 1;
  const nextStage = STAGES[nextIndex];
  if (!nextStage) throw new Error("不存在后续阶段");
  const updated = structuredClone(item);
  updated.stage = nextStage;
  updated.stageReviews.push(createStageReview(updated, nextStage, now));
  const after = stageStatus(updated, repo);
  if (after.errors.length || after.blockers.length) throw stageError("新阶段记录未通过顺序检查", after);
  return updated;
}

/** 将评估错误明确返回调用方，保留错误与待办阻断的区别。 */
function stageError(message, result) {
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  const blockers = Array.isArray(result?.blockers) ? result.blockers : [];
  const details = [...errors, ...blockers];
  return new Error(details.length ? `${message}：${details.join("；")}` : message);
}
