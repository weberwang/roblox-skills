import { statSync } from "node:fs";
import { projectPath, readJson } from "./io.mjs";
import { validateAssetRegister } from "./assets.mjs";

/** 把产出引用规范化为稳定身份；资源总表仍是来源和许可的唯一登记处。 */
export function resourceOutputIdentity(output) {
  return JSON.stringify([output?.componentId, output?.resourceId ?? null, output?.revision ?? null,
    typeof output?.sourceRef === "string" ? output.sourceRef.replaceAll("\\", "/").toLowerCase() : null]);
}

/** 校验 V3 每组件的正式产出，不要求尚属 V4 的消费者、装配或 Edit 回读。 */
export function checkResourceOutputs(repo, components, outputs, context) {
  const { require, blockers } = context;
  const byComponent = new Map();
  if (!Array.isArray(outputs)) {
    require(false, "resourceAcceptance.outputs 必须按组件引用正式产出");
    return byComponent;
  }
  const expected = new Map(components.map((component) => [component.componentId, component]));
  const registered = [];
  for (const output of outputs) {
    if (!output || typeof output !== "object" || Array.isArray(output)) { require(false, "资源产出引用必须为对象"); continue; }
    const component = expected.get(output.componentId);
    require(!!component && !byComponent.has(output.componentId), "资源产出必须对应唯一 V2 组件");
    if (!component) continue;
    byComponent.set(output.componentId, output);
    if (component.productionRoute === "ROBLOX_NATIVE") {
      require(typeof output.sourceRef === "string" && !!output.sourceRef.trim()
        && !Object.hasOwn(output, "resourceId") && !Object.hasOwn(output, "revision"), "原生组件必须只绑定实际 sourceRef 正式源文件");
      try {
        const info = statSync(projectPath(repo, output.sourceRef));
        require(info.isFile() && info.size > 0, "原生 sourceRef 必须指向非空正式源文件");
      } catch (error) { require(false, `原生 sourceRef 无效：${error.message}`); }
    } else {
      require(typeof output.resourceId === "string" && !!output.resourceId.trim()
        && Number.isSafeInteger(output.revision) && output.revision > 0 && !Object.hasOwn(output, "sourceRef"),
      "生产或复用资源必须绑定总表 resourceId 和正整数 revision");
      registered.push(output);
    }
  }
  require(outputs.length === expected.size && [...expected.keys()].every((id) => byComponent.has(id)), "正式产出必须完整覆盖 V2 组件，不能只提供画廊或文字摘要");
  if (!registered.length) return byComponent;
  let report;
  try {
    report = validateAssetRegister(readJson(repo, "docs/asset-register.json"), repo,
      { relevantIds: registered.map((output) => output.resourceId) });
  } catch (error) { require(false, `V3 正式资源缺少有效资源登记：${error.message}`); return byComponent; }
  for (const error of report.errors) require(false, `V3 资源登记：${error}`);
  blockers.push(...report.blockers.map((message) => `V3 资源登记：${message}`));
  for (const output of registered) {
    const asset = report.assetsById.get(output.resourceId);
    require(asset?.status === "ready" && asset?.license?.status === "approved" && asset?.revision === output.revision,
      `V3 资源 ${output.resourceId} 必须绑定已获许可的当前 ready 修订`);
  }
  return byComponent;
}
