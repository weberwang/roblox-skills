import { statSync } from "node:fs";
import { projectPath, readJson } from "./io.mjs";
import { checkCoverage } from "./coverage.mjs";

/** 美术结论来源于用户实际检查，不从布局参数或截图自动推断。 */
const QUALITY_DIMENSIONS = ["themeFit", "audienceFit", "gameplayReadability", "viewingComfort", "artCompletion"];
/** 动态情景明确列出适用性，静态界面不伪造峰值运行轨迹。 */
const SCENARIOS = ["normal-play", "repeated-feedback", "event-peak", "overlap-peak"];

/** 检查阶段产物、布局目标和人工显示确认，不解码或分析任何图片。 */
export function checkVisible(item, usable, context) {
  if (!["SCENE", "DISPLAY_LAYER"].includes(item.type)) return;
  const { require, blockers, repo } = context;
  require(["deliverables", "manual"].includes(item.stagePolicy), "stagePolicy 必须为 deliverables 或 manual");
  require(Array.isArray(item.stageReviews), "可见工作项必须声明 stageReviews");
  const seen = new Set();
  for (const review of Array.isArray(item.stageReviews) ? item.stageReviews : []) {
    if (!review || typeof review !== "object") { require(false, "阶段交付必须是对象"); continue; }
    require(["V0", "V1", "V2", "V3", "V4"].includes(review.stage) && !seen.has(review.stage), "阶段交付必须为唯一 V0–V4");
    seen.add(review.stage);
    require(review.workItemId === item.id, `阶段交付工作项不匹配：${review.stage}`);
    try {
      const file = statSync(projectPath(repo, review.path));
      require(file.isFile() && file.size > 0, `阶段产物为空：${review.stage}`);
    } catch (error) { require(false, `阶段产物 ${review.stage}：${error.message}`); }
    if (review.stage === "V4") require(review.candidate === item.candidate, "V4 交付必须绑定当前候选");
    if (item.stagePolicy === "manual" && !(typeof review.userMessageRef === "string" && review.userMessageRef.trim())) blockers.push(`等待 ${review.stage} 人工确认`);
  }
  for (const stage of ["V0", "V1", "V2", "V3", "V4"]) if (!seen.has(stage)) blockers.push(`缺少阶段交付：${stage}`);
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
  if (!review || review.status !== "accepted" || typeof review.userMessageRef !== "string" || !review.userMessageRef.trim()
      || review.candidate !== item.candidate || usable.get(review.evidenceId)?.type !== "visual") blockers.push("等待用户对当前视觉交付的真实确认，技术检查不能代替");
  for (const dimension of QUALITY_DIMENSIONS) {
    const result = review?.qualityResults?.[dimension];
    if (!result || result.status !== "PASS" || typeof result.reason !== "string" || !result.reason.trim()) blockers.push(`美术质量缺少人工通过结论：${dimension}`);
  }
  const scenarios = new Map();
  for (const scenario of Array.isArray(review?.scenarios) ? review.scenarios : []) {
    if (!scenario || typeof scenario !== "object") { require(false, "动态情景必须是对象"); continue; }
    require(SCENARIOS.includes(scenario.id) && !scenarios.has(scenario.id), "动态情景必须使用唯一的约定 id");
    require(typeof scenario.required === "boolean" && typeof scenario.reason === "string" && !!scenario.reason.trim(), "动态情景必须说明适用性和理由");
    if (scenario.required === true) {
      if (scenario.result !== "PASS" || !Array.isArray(scenario.evidenceIds) || !scenario.evidenceIds.length
          || !scenario.evidenceIds.every((id) => usable.get(id)?.type === "play")) blockers.push(`动态情景缺少实际 Play 证据：${scenario.id}`);
    } else {
      require(scenario.result === "NOT_APPLICABLE", "非适用情景必须标记 NOT_APPLICABLE");
      require(Array.isArray(scenario.evidenceIds) && scenario.evidenceIds.length === 0, `非适用情景不得引用 Play 证据：${scenario.id}`);
    }
    scenarios.set(scenario.id, scenario);
  }
  for (const id of SCENARIOS) if (!scenarios.has(id)) blockers.push(`未说明动态情景适用性：${id}`);
  require(scenarios.get("normal-play")?.required === true, "normal-play 情景始终必需");
  checkCoverage(item, visualContract, usable, context, scenarios);
}
