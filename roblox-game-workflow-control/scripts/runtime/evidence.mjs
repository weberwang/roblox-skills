import { statSync } from "node:fs";
import { projectPath } from "./io.mjs";

/** 这些类别绑定实际 Studio/Place/Universe，不能只验证一个可复用会话 ID。 */
export const STUDIO_EVIDENCE_TYPES = ["readback", "console", "unit", "play", "multiplayer", "performance", "save", "release"];

/** 验证当前证据身份、上下文与计划覆盖，返回真正可用于当前候选的记录。 */
export function checkEvidence(item, checks, context) {
  const { require, blockers, repo } = context;
  const usable = new Map();
  const ids = new Set();
  require(Array.isArray(item.evidence), "evidence 必须为数组");
  for (const entry of Array.isArray(item.evidence) ? item.evidence : []) {
    if (!entry || typeof entry !== "object") { require(false, "证据条目必须是对象"); continue; }
    const before = context.errors.length;
    require(typeof entry.id === "string" && !!entry.id.trim() && !ids.has(entry.id), "证据 id 必须非空且唯一");
    ids.add(entry.id);
    require(context.evidenceTypes.includes(entry.type), `未知证据类别：${entry.id}`);
    require(entry.workItemId === item.id, `证据工作项身份不匹配：${entry.id}`);
    require(typeof entry.candidate === "string" && !!entry.candidate.trim(), `证据缺少候选：${entry.id}`);
    require(typeof entry.summary === "string" && !!entry.summary.trim(), `证据缺少结论：${entry.id}`);
    require(typeof entry.observedAt === "string" && /^\d{4}-\d\d-\d\dT/.test(entry.observedAt) && Number.isFinite(Date.parse(entry.observedAt)), `证据缺少有效 ISO 时间：${entry.id}`);
    require(["PASS", "FAIL", "NOT_RUN", "BLOCKED"].includes(entry.result), `证据结果不合法：${entry.id}`);
    if (entry.checkId !== undefined) {
      require(checks.some((check) => check.id === entry.checkId && check.evidenceType === entry.type), `证据与验证计划不匹配：${entry.id}`);
    }
    if (entry.result === "PASS") {
      try {
        const file = statSync(projectPath(repo, entry.path));
        if (!file.isFile() || file.size === 0) throw new Error("必须指向非空证据文件");
      } catch (error) { require(false, `证据文件 ${entry.id}：${error.message}`); }
    }
    const visualTarget = entry.type === "visual" && ["SCENE", "DISPLAY_LAYER"].includes(item.type);
    if (STUDIO_EVIDENCE_TYPES.includes(entry.type) || visualTarget) {
      require(typeof entry.studioId === "string" && !!entry.studioId.trim() && entry.studioId === item.target?.studioId, `Studio 证据目标不匹配：${entry.id}`);
      require(Number.isSafeInteger(entry.placeId) && entry.placeId >= 0 && entry.placeId === item.target?.placeId, `证据 Place 不匹配：${entry.id}`);
      require(Number.isSafeInteger(entry.universeId) && entry.universeId >= 0 && entry.universeId === item.target?.universeId, `证据 Universe 不匹配：${entry.id}`);
      if (!visualTarget) require(["Edit", "Client", "Server"].includes(entry.datamodel), `证据缺少有效 DataModel：${entry.id}`);
    }
    if (["play", "multiplayer", "performance"].includes(entry.type)) require(["Client", "Server"].includes(entry.datamodel), `运行证据必须来自 Client 或 Server：${entry.id}`);
    if (entry.type === "unit") require(entry.datamodel === "Server", `ModuleScript 单测证据必须来自 Server：${entry.id}`);
    if (["SCENE", "DISPLAY_LAYER"].includes(item.type) && entry.type === "console") require(["Client", "Server"].includes(entry.datamodel), `可见运行交付需要运行时 Console：${entry.id}`);
    if (["SCENE", "DISPLAY_LAYER"].includes(item.type) && entry.type === "readback") require(entry.datamodel === "Edit", `正式可见实现必须在 Edit 回读：${entry.id}`);
    if (entry.type === "multiplayer") {
      require(Number.isSafeInteger(entry.clientCount) && entry.clientCount >= 2, `多人证据至少需要两个实际客户端：${entry.id}`);
      require(["Server & Clients", "StudioTestService"].includes(entry.method), `多人证据必须说明真实多客户端测试方式：${entry.id}`);
    }
    if (entry.candidate === item.candidate) {
      if (["FAIL", "BLOCKED"].includes(entry.result)) blockers.push(`当前候选证据未通过：${entry.id}`);
      if (entry.result === "NOT_RUN" && ((Array.isArray(item.requiredEvidence) && item.requiredEvidence.includes(entry.type)) || checks.some((check) => check.id === entry.checkId))) blockers.push(`计划验证尚未执行：${entry.id}`);
      if (entry.result === "PASS" && before === context.errors.length) usable.set(entry.id, entry);
    }
  }
  for (const check of checks) {
    if (![...usable.values()].some((entry) => entry.checkId === check.id && entry.type === check.evidenceType)) blockers.push(`验证计划缺少当前候选证据：${check.id}`);
  }
  return usable;
}
