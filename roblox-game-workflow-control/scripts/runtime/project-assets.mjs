import { existsSync } from "node:fs";
import { projectPath, readJson } from "./io.mjs";
import { validateAssetRegister } from "./assets.mjs";

const ASSET_REGISTER_PATH = "docs/asset-register.json";

/** 检查全项目资源清单，并把 active 消费绑定到登记工作项的当前候选。 */
export function checkProjectAssetConsumers(repo, members, records) {
  const report = { errors: [], blockers: [], byWorkItem: new Map() };
  let path;
  try { path = projectPath(repo, ASSET_REGISTER_PATH); }
  catch (error) {
    report.errors.push(`资源总表路径无效：${error.message}`);
    return report;
  }
  if (!existsSync(path)) return report;

  let register;
  try { register = readJson(repo, ASSET_REGISTER_PATH); }
  catch (error) {
    report.errors.push(`资源总表无法读取：${error.message}`);
    return report;
  }
  const assetReport = validateAssetRegister(register, repo);
  report.errors.push(...assetReport.errors);
  report.blockers.push(...assetReport.blockers);
  if (!Array.isArray(register?.assets)) return report;

  for (const asset of register.assets) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset) || !Array.isArray(asset.consumers)) continue;
    for (const consumer of asset.consumers) {
      if (!consumer || typeof consumer !== "object" || Array.isArray(consumer) || consumer.state !== "active") continue;
      const id = consumer.workItemId;
      const member = members.get(id);
      if (!member) {
        report.errors.push(`资源 ${asset.id ?? "<未知>"} 的 active 消费工作项未登记在项目清单：${id ?? "<未知>"}`);
        continue;
      }
      const item = records.get(id);
      if (!item || item.id !== id) {
        const message = `资源 ${asset.id ?? "<未知>"} 的 active 消费工作项当前记录缺失或身份不符：${id}`;
        report.blockers.push(message);
        addWorkItemBlocker(report, id, message);
        continue;
      }
      if (consumer.candidate !== member.candidate || consumer.candidate !== item.candidate) {
        const message = `资源 ${asset.id ?? "<未知>"} 的 active 消费候选与工作项 ${id} 当前清单/记录候选不一致。`;
        report.blockers.push(message);
        addWorkItemBlocker(report, id, message);
      }
    }
  }
  return report;
}

/** 把资源消费问题附着到对应工作项，便于全局报告指出需要修复的成员。 */
function addWorkItemBlocker(report, id, message) {
  if (!report.byWorkItem.has(id)) report.byWorkItem.set(id, []);
  if (!report.byWorkItem.get(id).includes(message)) report.byWorkItem.get(id).push(message);
}
