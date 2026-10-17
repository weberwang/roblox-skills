import { readJson } from "./io.mjs";
import { checkCoverage } from "./coverage.mjs";

/** 人工显示评价只记录用户检查的维度，不从运行参数推断质量。 */
export const QUALITY_DIMENSIONS = ["themeFit", "audienceFit", "gameplayReadability", "viewingComfort", "artCompletion"];
/** 动态情景需要分别记录技术覆盖和人工体验结论。 */
export const VISUAL_SCENARIOS = ["normal-play", "repeated-feedback", "event-peak", "overlap-peak"];

/** 创建不会预判人工结论或情景适用性的可见工作项模板。 */
export function createVisualReview(candidate) {
  return {
    status: "pending",
    candidate,
    evidenceId: "",
    userMessageRef: "",
    qualityResults: Object.fromEntries(QUALITY_DIMENSIONS.map((id) => [id, {
      status: "NOT_RUN", reason: "尚无当前候选的人工判断", userMessageRef: "",
    }])),
    scenarios: VISUAL_SCENARIOS.map((id) => ({
      id,
      required: id === "normal-play" ? true : null,
      reason: id === "normal-play" ? "基础游玩流程始终需要覆盖" : "待确认该情景是否适用于本对象",
      technical: { result: "NOT_RUN", evidenceIds: [] },
      visual: { result: "NOT_RUN", evidenceIds: [], userMessageRef: "", reason: "尚无当前候选的人工判断" },
    })),
  };
}

/** 校验可见交付合同、技术覆盖和独立的人工结论，不读取图片像素。 */
export function checkVisualDelivery(item, usable, context) {
  const { require, blockers, repo } = context;
  let visualContract;
  try {
    const contract = readJson(repo, item.visualContractRef);
    visualContract = contract;
    require(contract?.version === 1 && contract.workItemId === item.id, "视觉合同版本或工作项身份不匹配");
    require(Array.isArray(contract?.orientations) && contract.orientations.length > 0 && contract.orientations.every((value) => ["landscape", "portrait"].includes(value)), "视觉合同必须列出目标方向");
    require(Array.isArray(contract?.inputs) && contract.inputs.length > 0 && contract.inputs.every((value) => ["touch", "keyboard-mouse", "gamepad"].includes(value)), "视觉合同必须列出实际输入方式");
    require(Array.isArray(contract?.locales) && contract.locales.length > 0 && contract.locales.every((value) => typeof value === "string" && !!value.trim()), "视觉合同必须列出实际目标语言");
    require(typeof contract?.safeAreaPolicy === "string" && !!contract.safeAreaPolicy.trim(), "视觉合同缺少安全区策略");
    require(Array.isArray(contract?.viewports) && contract.viewports.length > 0, "视觉合同缺少代表性视口");
    const viewportIds = new Set();
    for (const viewport of Array.isArray(contract?.viewports) ? contract.viewports : []) {
      require(viewport && typeof viewport.id === "string" && !!viewport.id.trim() && !viewportIds.has(viewport.id)
        && Number.isSafeInteger(viewport.width) && viewport.width > 0 && Number.isSafeInteger(viewport.height) && viewport.height > 0
        && Array.isArray(contract.orientations) && contract.orientations.includes(viewport.orientation), "代表性视口 id、尺寸或方向不合法");
      viewportIds.add(viewport?.id);
    }
    require(Array.isArray(contract?.nodes) && contract.nodes.length > 0, "视觉合同必须列出语义节点");
    const nodes = new Map();
    for (const node of Array.isArray(contract?.nodes) ? contract.nodes : []) {
      if (!node || typeof node !== "object") { require(false, "视觉节点必须是对象"); continue; }
      require(typeof node.id === "string" && !!node.id.trim() && !nodes.has(node.id), "视觉节点必须有唯一 id");
      require(typeof node.path === "string" && node.path.startsWith("game."), "视觉节点必须指向真实 game. 路径");
      require(typeof node.role === "string" && !!node.role.trim() && typeof node.layoutRef === "string" && !!node.layoutRef.trim(), "视觉节点必须声明 role 与 layoutRef");
      require(node.parentId === null || (typeof node.parentId === "string" && !!node.parentId.trim()), "视觉节点 parentId 必须为节点 id 或 null");
      nodes.set(node.id, node);
    }
    for (const node of nodes.values()) {
      const ancestors = new Set([node.id]);
      let parent = node.parentId;
      while (typeof parent === "string") {
        require(nodes.has(parent) && !ancestors.has(parent), `视觉节点父级缺失或成环：${node.id}`);
        if (!nodes.has(parent) || ancestors.has(parent)) break;
        ancestors.add(parent); parent = nodes.get(parent).parentId;
      }
    }
  } catch (error) { require(false, `视觉合同：${error.message}`); }

  for (const type of ["readback", "console", "play", "visual"]) {
    if (![...usable.values()].some((entry) => entry.type === type)) blockers.push(`可见交付缺少证据：${type}`);
  }
  const review = item.visualReview;
  const reviewRef = text(review?.userMessageRef);
  const reviewEvidence = usable.get(review?.evidenceId);
  if (!review || !["pending", "accepted", "rejected"].includes(review.status)) require(false, "visualReview 状态不合法");
  require(typeof review?.candidate === "string" && review.candidate === item.candidate, "visualReview 必须绑定当前候选");
  if (review?.status === "accepted" || review?.status === "rejected") require(reviewRef, "已作出整体视觉判断时必须引用真实用户消息");
  if (["accepted", "rejected"].includes(review?.status) && reviewEvidence?.type !== "visual") {
    blockers.push("整体视觉判断缺少当前候选的可用视觉证据");
  }
  if (review?.status === "pending") blockers.push("等待用户对当前视觉交付的真实确认，技术检查不能代替");
  if (review?.status === "rejected") blockers.push("当前视觉交付被用户拒绝，不能报告验收通过");

  checkQualityResults(review, context);
  const scenarios = checkVisualScenarios(item, usable, context);
  checkCoverage(item, visualContract, usable, context, scenarios);
}

/** 只有绑定真实用户判断的 PASS/FAIL 才能结束具体质量维度。 */
function checkQualityResults(review, context) {
  const { require, blockers } = context;
  const results = review?.qualityResults;
  require(results && typeof results === "object" && !Array.isArray(results), "visualReview.qualityResults 必须是对象");
  for (const dimension of QUALITY_DIMENSIONS) {
    const result = results?.[dimension];
    require(result && ["PASS", "FAIL", "NOT_RUN"].includes(result.status), `人工美术质量结果不合法：${dimension}`);
    require(typeof result?.reason === "string" && !!result.reason.trim(), `人工美术质量结果缺少说明：${dimension}`);
    const messageRef = text(result?.userMessageRef);
    if (["PASS", "FAIL"].includes(result?.status)) require(messageRef, `人工美术质量 ${dimension} 必须引用真实用户判断`);
    if (result?.status === "NOT_RUN") {
      require(!messageRef, `未运行的人工美术质量 ${dimension} 不得伪造用户确认引用`);
      blockers.push(`等待当前候选人工美术质量判断：${dimension}`);
    }
    if (result?.status === "FAIL") blockers.push(`当前候选人工美术质量未通过：${dimension}`);
  }
}

/** 分别验证技术 Play 覆盖与用户对显示效果的结论。 */
function checkVisualScenarios(item, usable, context) {
  const { require, blockers } = context;
  const scenarios = new Map();
  const itemEvidence = new Map((Array.isArray(item.evidence) ? item.evidence : []).map((entry) => [entry?.id, entry]));
  for (const scenario of Array.isArray(item.visualReview?.scenarios) ? item.visualReview.scenarios : []) {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) { require(false, "动态情景必须是对象"); continue; }
    require(VISUAL_SCENARIOS.includes(scenario.id) && !scenarios.has(scenario.id), "动态情景必须使用唯一的约定 id");
    require([true, false, null].includes(scenario.required), `动态情景必须明确说明适用性：${scenario.id}`);
    require(typeof scenario.reason === "string" && !!scenario.reason.trim(), `动态情景必须说明适用性理由：${scenario.id}`);
    rejectLegacyScenarioFields(scenario, context);
    const technical = scenario.technical;
    const visual = scenario.visual;
    require(technical && typeof technical === "object" && !Array.isArray(technical), `缺少独立技术结论：${scenario.id}`);
    require(visual && typeof visual === "object" && !Array.isArray(visual), `缺少独立人工视觉结论：${scenario.id}`);
    validateTechnicalScenario(scenario, technical, itemEvidence, usable, context, item.candidate);
    validateVisualScenario(scenario, visual, itemEvidence, usable, context, item.candidate);
    scenarios.set(scenario.id, scenario);
  }
  for (const id of VISUAL_SCENARIOS) if (!scenarios.has(id)) blockers.push(`未说明动态情景适用性：${id}`);
  require(scenarios.get("normal-play")?.required === true, "normal-play 情景始终必需");
  return scenarios;
}

/** 旧字段曾把 Play 技术证据当作人工情景结论，必须直接拒绝。 */
function rejectLegacyScenarioFields(scenario, context) {
  context.require(!Object.hasOwn(scenario, "result") && !Object.hasOwn(scenario, "evidenceIds"),
    `动态情景不得使用混合字段 result/evidenceIds：${scenario.id}`);
}

/** 校验技术状态；PASS 必须随后由批准用例矩阵证明身份。 */
function validateTechnicalScenario(scenario, technical, itemEvidence, usable, context, candidate) {
  const { require, blockers } = context;
  require(["PASS", "FAIL", "NOT_RUN", "NOT_APPLICABLE"].includes(technical?.result), `技术情景结果不合法：${scenario.id}`);
  require(Array.isArray(technical?.evidenceIds), `技术情景必须声明 evidenceIds：${scenario.id}`);
  const evidenceIds = Array.isArray(technical?.evidenceIds) ? technical.evidenceIds : [];
  if (scenario.required === false) {
    require(technical?.result === "NOT_APPLICABLE" && evidenceIds.length === 0, `非适用情景技术结果必须为 NOT_APPLICABLE 且不引用证据：${scenario.id}`);
    return;
  }
  if (scenario.required !== true) {
    blockers.push(`等待确认技术情景适用性：${scenario.id}`);
    require(technical?.result === "NOT_RUN" && evidenceIds.length === 0, `未确认适用性的情景不得预填技术结论：${scenario.id}`);
    return;
  }
  if (technical?.result === "PASS") {
    if (!evidenceIds.length || !evidenceIds.every((id) => usable.get(id)?.type === "play")) blockers.push(`技术情景缺少当前候选的可用 Play：${scenario.id}`);
  } else if (technical?.result === "FAIL") {
    if (!evidenceIds.length || !evidenceIds.every((id) => itemEvidence.get(id)?.type === "play"
      && itemEvidence.get(id)?.candidate === candidate && itemEvidence.get(id)?.result === "FAIL")) {
      context.require(false, `失败技术情景必须保留实际 Play 证据：${scenario.id}`);
    }
    blockers.push(`当前候选技术情景未通过：${scenario.id}`);
  } else if (technical?.result === "NOT_RUN") {
    require(evidenceIds.length === 0, `未运行的技术情景不得引用证据：${scenario.id}`);
    blockers.push(`技术情景尚未运行：${scenario.id}`);
  } else {
    require(evidenceIds.length === 0, `必需技术情景不得标记 NOT_APPLICABLE：${scenario.id}`);
    blockers.push(`必需技术情景不得跳过：${scenario.id}`);
  }
}

/** 人工视觉 PASS/FAIL 必须有视觉证据和当前用户消息，Play 不能替代。 */
function validateVisualScenario(scenario, visual, itemEvidence, usable, context, candidate) {
  const { require, blockers } = context;
  require(["PASS", "FAIL", "NOT_RUN", "NOT_APPLICABLE"].includes(visual?.result), `人工视觉情景结果不合法：${scenario.id}`);
  require(Array.isArray(visual?.evidenceIds), `人工视觉情景必须声明 evidenceIds：${scenario.id}`);
  require(typeof visual?.reason === "string" && !!visual.reason.trim(), `人工视觉情景缺少说明：${scenario.id}`);
  const evidenceIds = Array.isArray(visual?.evidenceIds) ? visual.evidenceIds : [];
  const messageRef = text(visual?.userMessageRef);
  if (scenario.required === false) {
    require(visual?.result === "NOT_APPLICABLE" && evidenceIds.length === 0 && !messageRef,
      `非适用情景视觉结果必须为 NOT_APPLICABLE 且不引用证据或确认：${scenario.id}`);
    return;
  }
  if (scenario.required !== true) {
    blockers.push(`等待确认人工视觉情景适用性：${scenario.id}`);
    require(visual?.result === "NOT_RUN" && evidenceIds.length === 0 && !messageRef,
      `未确认适用性的情景不得预填人工视觉结论：${scenario.id}`);
    return;
  }
  if (["PASS", "FAIL"].includes(visual?.result)) {
    require(messageRef, `人工视觉情景 ${scenario.id} 必须引用真实用户判断`);
    require(evidenceIds.length > 0 && evidenceIds.every((id) => itemEvidence.get(id)?.type === "visual"
      && itemEvidence.get(id)?.candidate === candidate), `人工视觉情景 ${scenario.id} 必须引用当前候选视觉证据`);
    if (visual?.result === "PASS" && !evidenceIds.every((id) => usable.get(id)?.type === "visual")) {
      blockers.push(`人工视觉情景 PASS 缺少当前可用视觉证据：${scenario.id}`);
    }
    if (visual?.result === "FAIL") blockers.push(`当前候选人工视觉情景未通过：${scenario.id}`);
  } else if (visual?.result === "NOT_RUN") {
    require(evidenceIds.length === 0 && !messageRef, `未运行的人工视觉情景不得伪造证据或用户引用：${scenario.id}`);
    blockers.push(`等待当前候选人工视觉判断：${scenario.id}`);
  } else {
    require(evidenceIds.length === 0 && !messageRef, `必需人工视觉情景不得标记 NOT_APPLICABLE：${scenario.id}`);
    blockers.push(`必需人工视觉情景不得跳过：${scenario.id}`);
  }
}

/** 非空文本检查用于区分真实消息引用和模板占位符。 */
function text(value) { return typeof value === "string" && !!value.trim(); }
