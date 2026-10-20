import { existsSync, statSync } from "node:fs";
import { projectPath, readJson } from "./io.mjs";

/** 统一检查资源总表，供项目文档与单个消费工作项使用同一套结构规则。 */
export function validateAssetRegister(value, repo, { workItemId, relevantIds = [] } = {}) {
  const errors = [];
  const blockers = [];
  const assetsById = new Map();
  const fullCheck = workItemId === undefined && relevantIds.length === 0;
  const relevant = new Set(relevantIds);
  // 工作项只深入检查当前绑定及其 active 消费资源，避免无关 planned 条目挡住独立交付。
  const isRelevant = (asset) => fullCheck || relevant.has(asset.id)
    || (workItemId !== undefined && Array.isArray(asset.consumers)
      && asset.consumers.some((consumer) => consumer?.workItemId === workItemId && consumer?.state === "active"));

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("asset-register.json 根必须为对象。");
    return { errors, blockers, assetsById };
  }
  if (value.version !== 1) errors.push("asset-register.version 必须为 1。");
  if (!Array.isArray(value.assets)) {
    errors.push("asset-register.assets 必须为数组。");
    return { errors, blockers, assetsById };
  }

  const ids = new Set();
  value.assets.forEach((asset, index) => {
    const label = `asset-register.assets[${index}]`;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      errors.push(`${label} 必须为对象。`);
      return;
    }
    const relevantAsset = isRelevant(asset);
    for (const key of ["id", "type", "owner"]) {
      if (!text(asset[key])) errors.push(`${label}.${key} 必须为非空文本。`);
    }
    if (text(asset.id)) {
      if (ids.has(asset.id)) errors.push(`资源 ID 重复：${asset.id}`);
      else assetsById.set(asset.id, asset);
      ids.add(asset.id);
    }
    if (!positiveInteger(asset.revision)) errors.push(`${label}.revision 必须为正整数。`);
    if (!["planned", "ready", "retired"].includes(asset.status)) errors.push(`${label}.status 只能是 planned、ready 或 retired。`);
    if (!asset.source || typeof asset.source !== "object" || Array.isArray(asset.source)) {
      errors.push(`${label}.source 必须为对象。`);
    } else {
      for (const key of ["kind", "uri", "evidenceRef"]) {
        if (typeof asset.source[key] !== "string") errors.push(`${label}.source.${key} 必须为字符串。`);
      }
    }
    if (!asset.license || typeof asset.license !== "object" || Array.isArray(asset.license)) {
      errors.push(`${label}.license 必须为对象。`);
    } else {
      if (!["pending", "approved", "rejected"].includes(asset.license.status)) errors.push(`${label}.license.status 只能是 pending、approved 或 rejected。`);
      if (typeof asset.license.evidenceRef !== "string") errors.push(`${label}.license.evidenceRef 必须为字符串。`);
    }
    if (asset.assetId !== null && (typeof asset.assetId !== "string" || !/^[1-9][0-9]*$/.test(asset.assetId))) {
      errors.push(`${label}.assetId 必须为 null 或正整数数字字符串。`);
    }
    if (asset.instancePath !== null && !gamePath(asset.instancePath)) {
      errors.push(`${label}.instancePath 必须为 null 或 game. 开头的 DataModel 路径。`);
    }
    validateConsumers(asset, label, errors);
    const evidenceRefs = validateTextList(asset.evidenceRefs, `${label}.evidenceRefs`, errors);

    if (!relevantAsset) return;
    validateAssetReferences(asset, label, repo, errors, evidenceRefs);
    validateAssetEvidence(asset, label, repo, errors, blockers);
    if (asset.status === "planned") blockers.push(`资源 ${asset.id || index} 仍为 planned。`);
    if (asset.status === "ready" && asset.license?.status !== "approved") {
      blockers.push(`资源 ${asset.id || index} 必须具有 approved 许可。`);
    }
    if (asset.status === "ready" && asset.assetId === null && !gamePath(asset.instancePath)) {
      errors.push(`${label}.ready 资源必须有真实 Asset ID 或 game. 实例路径。`);
    }
    if (asset.status === "ready" && evidenceRefs.length === 0) errors.push(`${label}.ready 资源必须至少有一份证据文件。`);

    for (const [consumerIndex, consumer] of (Array.isArray(asset.consumers) ? asset.consumers : []).entries()) {
      if (consumer?.state !== "active") continue;
      if (asset.status !== "ready") blockers.push(`${label}.consumers[${consumerIndex}] 指向的资源必须为 ready。`);
      if (asset.license?.status !== "approved") blockers.push(`${label}.consumers[${consumerIndex}] 指向的资源许可必须为 approved。`);
      if (consumer.revision !== asset.revision) blockers.push(`${label}.consumers[${consumerIndex}] 的 revision 已过期。`);
    }
  });
  return { errors, blockers, assetsById };
}

/** 把当前工作项登记的资源消费绑定到最新资源版本及可用 Studio 回读证据。 */
export function checkAssets(item, usable, context) {
  const { repo, require, blockers } = context;
  require(Array.isArray(item.assetBindings), "assetBindings 必须为数组");
  const bindings = Array.isArray(item.assetBindings) ? item.assetBindings : [];
  const bindingKeys = new Set();
  for (const binding of bindings) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      require(false, "资源消费绑定必须为对象");
      continue;
    }
    require(text(binding.resourceId) && positiveInteger(binding.revision) && gamePath(binding.nodePath) && text(binding.evidenceId),
      "资源消费绑定必须声明 resourceId、正整数 revision、game. nodePath 和 evidenceId");
    const key = `${binding.resourceId}\u0000${binding.nodePath}`;
    require(!bindingKeys.has(key), `资源消费绑定重复：${binding.resourceId} / ${binding.nodePath}`);
    bindingKeys.add(key);
  }
  checkVisualResourceConsumers(item, bindings, context);

  let registerPath;
  try {
    registerPath = projectPath(repo, "docs/asset-register.json");
  } catch (error) {
    require(false, `asset-register.json 路径无效：${message(error)}`);
    return;
  }
  if (!existsSync(registerPath)) {
    if (bindings.length > 0) require(false, "工作项声明了资源消费绑定，但 docs/asset-register.json 不存在");
    return;
  }

  let register;
  try {
    register = readJson(repo, "docs/asset-register.json");
  } catch (error) {
    require(false, `asset-register.json 无法读取：${message(error)}`);
    return;
  }
  const relevantIds = bindings.filter((binding) => text(binding?.resourceId)).map((binding) => binding.resourceId);
  const report = validateAssetRegister(register, repo, { workItemId: item.id, relevantIds });
  for (const error of report.errors) require(false, error);
  blockers.push(...report.blockers);
  if (!Array.isArray(register?.assets)) return;

  const activeConsumers = [];
  for (const asset of register.assets) {
    if (!asset || typeof asset !== "object" || !Array.isArray(asset.consumers)) continue;
    for (const consumer of asset.consumers) {
      if (consumer?.workItemId !== item.id || consumer?.state !== "active") continue;
      // 候选过期的 active 记录仍是数据冲突，不能悄悄当作已归档历史跳过。
      if (consumer.candidate !== item.candidate) {
        blockers.push(`资源 ${asset.id} 仍将旧候选 ${consumer.candidate} 标记为 active 消费，必须更新或明确归档。`);
      } else {
        activeConsumers.push({ asset, consumer });
      }
    }
  }

  const currentBindings = new Map();
  for (const binding of bindings) {
    if (!binding || typeof binding !== "object") continue;
    const key = `${binding.resourceId}\u0000${binding.nodePath}`;
    if (!currentBindings.has(key)) currentBindings.set(key, binding);
  }
  for (const { asset, consumer } of activeConsumers) {
    const key = `${asset.id}\u0000${consumer.nodePath}`;
    if (!currentBindings.has(key)) blockers.push(`当前 active 资源消费缺少工作项绑定：${asset.id} / ${consumer.nodePath}`);
  }

  for (const binding of bindings) {
    if (!binding || typeof binding !== "object") continue;
    const asset = report.assetsById.get(binding.resourceId);
    if (!asset) {
      require(false, `资源消费绑定引用不存在的资源：${binding.resourceId}`);
      continue;
    }
    if (binding.revision !== asset.revision) blockers.push(`资源消费绑定 ${binding.resourceId} 未指向最新 revision ${asset.revision}。`);
    // 以点分段判断祖先，避免 Workspace 与 Workspace2 这类前缀碰撞。
    const inScope = gamePath(binding.nodePath) && Array.isArray(item.scope?.instances) && item.scope.instances.some((path) =>
      gamePath(path) && (binding.nodePath === path || binding.nodePath.startsWith(`${path}.`)));
    require(inScope, `资源消费节点超出 scope.instances：${binding.nodePath}`);
    const consumer = (Array.isArray(asset.consumers) ? asset.consumers : []).find((entry) =>
      entry?.workItemId === item.id && entry?.candidate === item.candidate && entry?.state === "active" && entry?.nodePath === binding.nodePath);
    if (!consumer) {
      blockers.push(`资源绑定未匹配到当前候选的 active 消费者：${binding.resourceId} / ${binding.nodePath}`);
      continue;
    }
    if (consumer.revision !== binding.revision) blockers.push(`资源消费者与工作项绑定 revision 不一致：${binding.resourceId} / ${binding.nodePath}`);
    validateReadbackBinding(binding, asset, usable, item, require, blockers);
  }
}

/** 正式可见消费者必须使用 V3 已接受的同一资源，音频等独立附属绑定仍走通用资源门。 */
function checkVisualResourceConsumers(item, bindings, context) {
  if (!["SCENE", "DISPLAY_LAYER"].includes(item.type) || item.stage !== "V4") return;
  const reviews = Array.isArray(item.stageReviews) ? item.stageReviews : [];
  const acceptance = reviews.find((review) => review?.stage === "V3")?.resourceAcceptance;
  const outputs = Array.isArray(acceptance?.outputs) ? acceptance.outputs.filter((output) => text(output?.resourceId)) : [];
  if (!outputs.length) return;
  let decomposition;
  let visual;
  try {
    const v2 = reviews.find((review) => review?.stage === "V2");
    decomposition = readJson(context.repo, v2?.decompositionRef);
    visual = readJson(context.repo, item.visualContractRef);
  } catch (error) { context.require(false, `正式资源消费者无法核对 V2 布局：${message(error)}`); return; }
  const acceptedByNode = new Map();
  for (const output of outputs) {
    const component = (Array.isArray(decomposition.components) ? decomposition.components : []).find((entry) => entry?.componentId === output.componentId);
    const node = (Array.isArray(visual.nodes) ? visual.nodes : []).find((entry) => entry?.id === component?.consumerNodeId);
    context.require(gamePath(node?.path), `V2 组件 ${output.componentId} 的 consumerNodeId 必须定位正式视觉合同节点`);
    if (!gamePath(node?.path)) continue;
    const accepted = acceptedByNode.get(node.path) ?? [];
    accepted.push(output);
    acceptedByNode.set(node.path, accepted);
    context.require(bindings.some((binding) => binding?.nodePath === node.path && binding.resourceId === output.resourceId
      && binding.revision === output.revision), `V4 组件 ${output.componentId} 必须消费 V3 已接受的资源及修订`);
  }
  // 仅约束 V2 明确声明的可见消费节点，不从资源类型自由文本猜测声音等附属资源。
  for (const binding of bindings) {
    const accepted = acceptedByNode.get(binding?.nodePath);
    if (!accepted) continue;
    context.require(accepted.some((output) => output.resourceId === binding.resourceId && output.revision === binding.revision),
      `V4 可见节点 ${binding.nodePath} 使用了未在 V3 接受的资源或修订`);
  }
}

/** 校验资源引用既有可用的 Edit 回读证据，也精确记录回读时的 AssetId 和实例路径。 */
function validateReadbackBinding(binding, asset, usable, item, require, blockers) {
  const evidence = usable.get(binding.evidenceId);
  if (!evidence || evidence.type !== "readback" || evidence.datamodel !== "Edit"
      || evidence.workItemId !== item.id || evidence.candidate !== item.candidate) {
    blockers.push(`资源绑定缺少当前候选的 readback 证据：${binding.evidenceId}`);
    return;
  }
  const matches = Array.isArray(evidence.assetBindings) ? evidence.assetBindings.filter((entry) =>
    entry?.resourceId === binding.resourceId && entry?.revision === binding.revision && entry?.nodePath === binding.nodePath) : [];
  if (matches.length !== 1) {
    blockers.push(`readback 证据必须唯一记录资源版本与消费节点：${binding.evidenceId}`);
    return;
  }
  const observed = matches[0];
  require(Object.hasOwn(observed, "assetId") && observed.assetId === asset.assetId
    && Object.hasOwn(observed, "instancePath") && observed.instancePath === asset.instancePath,
  `readback 证据中的 Asset ID 或实例路径与资源总表不一致：${binding.evidenceId}`);
}

/** 校验消费记录的键字段，并让历史项按 revision 与 candidate 区分。 */
function validateConsumers(asset, label, errors) {
  if (!Array.isArray(asset.consumers)) {
    errors.push(`${label}.consumers 必须为数组。`);
    return;
  }
  const seen = new Set();
  asset.consumers.forEach((consumer, index) => {
    if (!consumer || typeof consumer !== "object" || Array.isArray(consumer)) {
      errors.push(`${label}.consumers[${index}] 必须为对象。`);
      return;
    }
    if (!text(consumer.workItemId) || !gamePath(consumer.nodePath) || !text(consumer.candidate)
        || !positiveInteger(consumer.revision) || !["active", "historical"].includes(consumer.state)) {
      errors.push(`${label}.consumers[${index}] 必须包含有效 workItemId、nodePath、state、candidate 和正整数 revision。`);
    }
    const key = consumer.state === "active"
      ? `active\u0000${consumer.workItemId}\u0000${consumer.nodePath}`
      : `historical\u0000${consumer.workItemId}\u0000${consumer.nodePath}\u0000${consumer.revision}\u0000${consumer.candidate}`;
    if (seen.has(key)) errors.push(`${label}.consumers 包含重复引用：${consumer.workItemId} / ${consumer.nodePath}`);
    seen.add(key);
  });
}

/** ready 资源的来源、许可和清单证据必须是实际存在的非空项目文件。 */
function validateAssetEvidence(asset, label, repo, errors, blockers) {
  if (asset.status !== "ready") return;
  if (asset.license?.status !== "approved") errors.push(`${label}.ready 资源必须有 approved 许可，pending 或 rejected 不可供当前消费者使用。`);
  if (!text(asset.source?.kind)) errors.push(`${label}.ready 资源必须填写实际来源类型。`);
  if (!text(asset.source?.uri)) errors.push(`${label}.ready 资源必须填写实际来源 URI 或定位。`);
  validateEvidenceFile(repo, asset.source?.evidenceRef, `${label}.source.evidenceRef`, errors);
  validateEvidenceFile(repo, asset.license?.evidenceRef, `${label}.license.evidenceRef`, errors);
  if (Array.isArray(asset.evidenceRefs)) {
    asset.evidenceRefs.forEach((reference, index) => validateEvidenceFile(repo, reference, `${label}.evidenceRefs[${index}]`, errors));
  }
}

/** 对选中资源检查所有非空引用的项目边界；ready 状态再要求对应文件真实存在。 */
function validateAssetReferences(asset, label, repo, errors, evidenceRefs) {
  for (const [reference, pathLabel] of [
    [asset.source?.evidenceRef, `${label}.source.evidenceRef`],
    [asset.license?.evidenceRef, `${label}.license.evidenceRef`],
    ...evidenceRefs.map((reference, index) => [reference, `${label}.evidenceRefs[${index}]`]),
  ]) {
    if (!text(reference)) continue;
    try { projectPath(repo, reference); }
    catch (error) { errors.push(`${pathLabel} 路径无效：${message(error)}`); }
  }
}

/** 拒绝路径逃逸、链接和空文件，避免资源来源凭一段文本就被当成核实。 */
function validateEvidenceFile(repo, reference, label, errors) {
  if (!text(reference)) {
    errors.push(`${label} 必须为项目内文件路径。`);
    return;
  }
  try {
    const path = projectPath(repo, reference);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
      errors.push(`${label} 必须指向项目内已存在的非空文件：${reference}`);
    }
  } catch (error) {
    errors.push(`${label} 路径无效：${message(error)}`);
  }
}

/** 校验资源注册表中的列表型证据字段并返回可继续检查的数组。 */
function validateTextList(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} 必须为数组。`);
    return [];
  }
  const seen = new Set();
  value.forEach((entry, index) => {
    if (!text(entry)) errors.push(`${label}[${index}] 必须为非空文本。`);
    else if (seen.has(entry)) errors.push(`${label} 包含重复值：${entry}`);
    else seen.add(entry);
  });
  return value;
}

/** 验证 Roblox DataModel 路径的每一段均为非空名称。 */
function gamePath(value) {
  return typeof value === "string" && value.startsWith("game.")
    && value.slice("game.".length).split(".").every((segment) => segment.trim().length > 0);
}

/** 仅接受安全整数修订号，避免浮点或溢出值造成版本比较失真。 */
function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/** 排除未知值和模板占位符，防止文本占位被误当成资源或消费者事实。 */
function text(value) {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const normalized = value.trim();
  return !/^(unknown|tbd|todo|待填写|未知|未配置|n\/a|null)$/i.test(normalized)
    && !/^<.*>$/.test(normalized)
    && !/\{\{.*\}\}/.test(normalized);
}

/** 把异常转换成稳定的用户可读错误内容。 */
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
