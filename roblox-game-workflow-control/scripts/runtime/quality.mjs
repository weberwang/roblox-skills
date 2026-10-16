/** 将验收条目与当前 PASS 证据绑定，避免仅有目标文案就声称目标已满足。 */
export function checkAcceptance(item, usable, context) {
  const { require, blockers } = context;
  require(Array.isArray(item.acceptance) && item.acceptance.length > 0, "acceptance 必须包含验收条目");
  require(Array.isArray(item.acceptanceResults), "acceptanceResults 必须为数组");
  const goals = new Set();
  for (const goal of Array.isArray(item.acceptance) ? item.acceptance : []) {
    require(goal && typeof goal.id === "string" && !!goal.id.trim() && !goals.has(goal.id) && typeof goal.criterion === "string" && !!goal.criterion.trim(), "验收目标必须具有唯一 id 与非空 criterion");
    if (goal) goals.add(goal.id);
  }
  const results = new Map();
  for (const result of Array.isArray(item.acceptanceResults) ? item.acceptanceResults : []) {
    if (!result || typeof result !== "object") { require(false, "验收结果必须是对象"); continue; }
    require(goals.has(result.id) && !results.has(result.id), "验收结果必须对应唯一的目标 id");
    require(["PASS", "FAIL", "NOT_RUN", "BLOCKED"].includes(result.status), "验收结果状态不合法");
    require(Array.isArray(result.evidenceIds), "验收结果必须声明 evidenceIds");
    if (result.status !== "PASS" || !Array.isArray(result.evidenceIds) || !result.evidenceIds.length || !result.evidenceIds.every((id) => usable.has(id))) blockers.push(`验收目标尚无有效通过结论：${result.id}`);
    results.set(result.id, result);
  }
  for (const id of goals) if (!results.has(id)) blockers.push(`验收目标没有结果：${id}`);
  const independent = ["INTEGRATION", "RELEASE"].includes(item.type) || (Array.isArray(item.implementation?.units) && item.implementation.units.length > 1);
  if (independent || item.domainReview !== undefined) {
    const review = item.domainReview;
    const owners = [item.implementation?.owner, ...(Array.isArray(item.implementation?.units) ? item.implementation.units.map((unit) => unit?.owner) : [])];
    if (!review || review.status !== "PASS" || typeof review.reviewer !== "string" || !review.reviewer.trim()
        || typeof review.summary !== "string" || !review.summary.trim() || !Array.isArray(review.evidenceIds)
        || !review.evidenceIds.length || !review.evidenceIds.every((id) => usable.has(id))) blockers.push("领域审查缺少当前通过结论与证据");
    if (independent && owners.includes(review?.reviewer)) blockers.push("跨单元、集成与发布交付须由实现者之外的审查者核对");
  }
}
