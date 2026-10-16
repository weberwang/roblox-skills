import { projectPath, readJson } from "./io.mjs";

/** 决策文本不得由空白替代，真实来源仍由编排者对照用户消息核验。 */
function text(value) { return typeof value === "string" && !!value.trim(); }
/** 机器记录使用普通对象，不接受数组或 null 伪装对象。 */
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** 清单允许明确的空集合，但其中每个已填写条目必须有实际文字。 */
function strings(value) { return Array.isArray(value) && value.every(text); }

/** 校验一次拷问的事实、选项、回答和精确批准，不能由记录自行授予权限。 */
function checkRecord(record, item, context) {
  const { require, blockers, repo } = context;
  require(record.version === 1, "拷问记录 version 必须为 1");
  require(text(record.id) && /^[a-z0-9][a-z0-9-]{0,63}$/.test(record.id), "拷问记录必须有稳定的小写 id");
  require(record.workItemId === item.id, `拷问记录工作项不匹配：${record.id}`);
  require(Number.isSafeInteger(record.revision) && record.revision > 0, "拷问记录 revision 必须为正整数");
  require(["pending", "answered", "approved", "rejected", "superseded"].includes(record.status), `未知拷问状态：${record.id}`);
  require(text(record.trigger), "拷问记录必须说明无法由证据消除的触发原因");
  const subject = record.subject;
  require(object(subject) && text(subject.id) && text(subject.description), "拷问记录缺少精确 subject 身份与说明");
  require(object(subject) && strings(subject.files) && strings(subject.instances), "subject 必须声明 files 与 instances 数组");
  if (object(subject) && strings(subject.files)) {
    for (const path of subject.files) {
      try { projectPath(repo, path); } catch (error) { require(false, `决策文件范围：${error.message}`); }
      require(Array.isArray(item.scope?.files) && item.scope.files.includes(path), `决策文件超出当前工作项：${path}`);
    }
  }
  if (object(subject) && strings(subject.instances)) {
    for (const path of subject.instances) require(Array.isArray(item.scope?.instances) && item.scope.instances.includes(path), `决策实例超出当前工作项：${path}`);
  }
  require(Array.isArray(record.facts) && record.facts.every((fact) => object(fact) && text(fact.claim) && text(fact.source)), "事实必须分别记录 claim 与真实来源 source");
  require(strings(record.assumptions) && strings(record.unknowns), "拷问记录必须区分 assumptions 与 unknowns");
  require(Array.isArray(record.questions) && record.questions.length > 0, "拷问记录必须包含问题");
  const questionIds = new Set();
  let allAnswered = true;
  for (const question of Array.isArray(record.questions) ? record.questions : []) {
    if (!object(question)) { require(false, "拷问问题必须是对象"); allAnswered = false; continue; }
    require(text(question.id) && !questionIds.has(question.id) && text(question.prompt), "拷问问题必须有唯一 id 与非空 prompt");
    questionIds.add(question.id);
    require(Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 3, "每题需要二至三个有实际影响的互斥选项");
    const optionIds = new Set();
    for (const option of Array.isArray(question.options) ? question.options : []) {
      require(object(option) && text(option.id) && !optionIds.has(option.id) && text(option.label) && text(option.impact), "拷问选项必须有唯一 id、label 和 impact");
      if (object(option)) optionIds.add(option.id);
    }
    require(optionIds.has(question.recommendedOptionId), "推荐项必须指向实际选项，不能替代用户回答");
    const answer = question.answer;
    if (answer === null) { allAnswered = false; continue; }
    require(object(answer), "未回答的问题必须使用 answer=null");
    if (!object(answer)) { allAnswered = false; continue; }
    require(answer.optionId === null || optionIds.has(answer.optionId), "用户选择必须指向已列选项或用 null 表达自由回答");
    require(answer.freeText === null || text(answer.freeText), "自由回答必须为非空文字或 null");
    const answered = text(answer.userMessageRef) && (optionIds.has(answer.optionId) || text(answer.freeText));
    require(answered, "回答必须有实际选项/自由回答和真实 userMessageRef");
    if (!answered) allAnswered = false;
  }
  if (["answered", "approved"].includes(record.status) && !allAnswered) blockers.push(`拷问仍有未回答问题：${record.id}`);
  if (record.status === "approved") {
    if (!strings(record.unknowns) || record.unknowns.length) blockers.push(`拷问仍有阻断未知项：${record.id}`);
    const conclusion = record.conclusion;
    require(object(conclusion) && text(conclusion.summary) && text(conclusion.nextAction), "已批准决策缺少实际摘要和下一步");
    for (const field of ["scope", "nonGoals", "rejectedOptions", "acceptedRisks", "acceptance"]) require(object(conclusion) && strings(conclusion[field]), `决策摘要缺少 ${field} 清单`);
    require(object(conclusion) && Array.isArray(conclusion.scope) && conclusion.scope.length > 0 && Array.isArray(conclusion.acceptance) && conclusion.acceptance.length > 0, "批准摘要必须明确范围与验收证据要求");
    const approval = record.approval;
    if (!object(approval) || !text(approval.userMessageRef) || approval.revision !== record.revision
        || typeof approval.approvedAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(approval.approvedAt) || !Number.isFinite(Date.parse(approval.approvedAt))) {
      blockers.push(`拷问缺少当前修订的真实用户批准记录：${record.id}`);
    }
  } else if (record.status !== "superseded") blockers.push(`拷问未闭合：${record.id}/${record.status}`);
}

/** 决策引用是完成门的一部分；普通任务明确使用空数组，不创建无必要的拷问。 */
export function checkDecisions(item, context) {
  const { require, repo, blockers } = context;
  require(Array.isArray(item.decisionRefs), "decisionRefs 必须为数组，无需拷问时使用空数组");
  const records = new Map();
  const identities = new Set();
  const approvedSubjects = new Set();
  /** Windows 下用统一路径身份防止同一个引用以大小写或分隔符变体重复登记。 */
  const canonical = (path) => process.platform === "win32" ? path.toLowerCase() : path;
  for (const reference of Array.isArray(item.decisionRefs) ? item.decisionRefs : []) {
    try {
      if (!text(reference) || !reference.endsWith(".json")) throw new Error("决策引用必须为项目内 JSON 路径");
      const path = canonical(projectPath(repo, reference));
      require(!records.has(path), "同一拷问记录不能重复引用");
      const record = readJson(repo, reference);
      if (!object(record)) throw new Error("拷问记录必须是对象");
      const identity = `${record.id}@${record.revision}`;
      require(!identities.has(identity), "相同决策与修订不能登记两份记录");
      identities.add(identity);
      records.set(path, record);
      checkRecord(record, item, context);
      if (record.status === "approved" && text(record.subject?.id)) {
        require(!approvedSubjects.has(record.subject.id), `同一决策对象不能存在并列有效的批准记录：${record.subject.id}`);
        approvedSubjects.add(record.subject.id);
      }
    } catch (error) { require(false, `拷问记录：${error.message}`); }
  }
  for (const record of records.values()) {
    if (record.status !== "superseded") continue;
    try {
      const replacement = records.get(canonical(projectPath(repo, record.supersededBy)));
      if (!replacement || replacement.status !== "approved" || replacement.workItemId !== item.id
          || replacement.subject?.id !== record.subject?.id || replacement.revision <= record.revision) {
        blockers.push(`失效决策缺少同对象更高修订的已批准替代引用：${record.id}`);
      }
    } catch (error) { require(false, `决策替代引用：${error.message}`); }
  }
}
