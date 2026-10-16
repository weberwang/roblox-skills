import { readdirSync, statSync } from "node:fs";
import { projectPath, readJson } from "./io.mjs";
import { checkProjectAssetConsumers } from "./project-assets.mjs";

const PROJECT_PATH = ".workflow-control/project.json";
const WORK_ITEM_DIR = ".workflow-control/work-items";
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 判断工作项和项目标识是否使用稳定的文件名安全格式。 */
function isId(value) { return typeof value === "string" && ID_PATTERN.test(value); }

/** 判断需要由真实记录提供的文本字段是否非空。 */
function isText(value) { return typeof value === "string" && value.trim().length > 0; }

/** 创建尚未填入项目事实的工作项清单；空清单不能通过全局完成检查。 */
export function createProject(projectId) {
  if (!isId(projectId)) throw new Error("projectId 必须为 1–64 位小写字母、数字或连字符");
  return { version: 1, projectId, workItems: [], integrationWorkItemId: "", multiPlace: { enabled: false } };
}

/** 把检查结果加入调用方的项目工作项上下文，并避免重复错误信息。 */
function appendContext(context, issues) {
  for (const message of issues.errors) {
    if (!context.errors.includes(message)) context.require(false, message);
  }
  for (const message of issues.blockers) {
    if (!context.blockers.includes(message)) context.blockers.push(message);
  }
}

/** 只把真正不存在的清单或工作项识别为缺失；链接和解析错误继续作为安全/结构错误处理。 */
function readOptionalJson(repo, path) {
  try { return { value: readJson(repo, path), missing: false }; }
  catch (error) {
    if (error.code === "ENOENT") return { value: null, missing: true };
    throw error;
  }
}

/** 记录跨工作项图、候选身份、集成覆盖和可选多 Place 的静态契约。 */
function inspectProject(repo) {
  const result = {
    exists: false, manifest: null, members: new Map(), records: new Map(), graph: new Map(),
    errors: [], blockers: [], nodeBlockers: new Map(), edgeBlockers: new Map(), multiPlaceRelations: [],
  };
  let read;
  try { read = readOptionalJson(repo, PROJECT_PATH); }
  catch (error) { result.errors.push(`项目清单读取失败：${error.message}`); return result; }
  if (read.missing) return result;
  result.exists = true;
  result.manifest = read.value;
  const manifest = read.value;
  const require = (condition, message) => { if (!condition) result.errors.push(message); };
  require(manifest && typeof manifest === "object" && !Array.isArray(manifest), "项目清单必须是对象");
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return result;

  require(manifest.version === 1, "项目清单 version 必须为 1");
  require(isId(manifest.projectId), "项目清单 projectId 格式不合法");
  require(Array.isArray(manifest.workItems), "项目清单 workItems 必须是数组");
  const members = Array.isArray(manifest.workItems) ? manifest.workItems : [];
  for (const member of members) {
    if (!member || typeof member !== "object" || Array.isArray(member)) {
      require(false, "项目清单成员必须是对象");
      continue;
    }
    require(isId(member.id) && isText(member.candidate), "项目清单成员必须声明合法 id 和非空 candidate");
    if (!isId(member.id) || !isText(member.candidate)) continue;
    require(!result.members.has(member.id), `项目清单工作项重复：${member.id}`);
    if (!result.members.has(member.id)) result.members.set(member.id, member);
  }
  require(manifest.multiPlace && typeof manifest.multiPlace === "object" && !Array.isArray(manifest.multiPlace)
    && typeof manifest.multiPlace.enabled === "boolean", "项目清单 multiPlace.enabled 必须是布尔值");

  for (const id of result.members.keys()) {
    let item;
    try { item = readJson(repo, `${WORK_ITEM_DIR}/${id}.json`); }
    catch (error) {
      if (error.code === "ENOENT") addNodeBlocker(result, id, `项目登记的工作项文件缺失：${id}`);
      else result.errors.push(`工作项 ${id} 读取失败：${error.message}`);
      result.records.set(id, null);
      result.graph.set(id, []);
      continue;
    }
    result.records.set(id, item);
    result.graph.set(id, []);
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      addNodeBlocker(result, id, `项目登记的工作项记录无效：${id}`);
      continue;
    }
    if (item.id !== id) addNodeBlocker(result, id, `工作项 id 与文件名不一致：${id}`);
    if (item.candidate !== result.members.get(id).candidate) addNodeBlocker(result, id, `项目清单候选与工作项不一致：${id}`);
    if (!Array.isArray(item.dependsOn)) {
      result.errors.push(`工作项 ${id} 必须声明 dependsOn 数组`);
      continue;
    }
    const seen = new Set();
    for (const dependency of item.dependsOn) {
      if (!dependency || typeof dependency !== "object" || Array.isArray(dependency)) {
        result.errors.push(`工作项 ${id} 的依赖必须包含 workItemId 和 candidate`);
        continue;
      }
      const targetId = dependency.workItemId;
      require(isId(targetId) && isText(dependency.candidate), `工作项 ${id} 的依赖身份不合法`);
      if (!isId(targetId) || !isText(dependency.candidate)) continue;
      require(!seen.has(targetId), `工作项 ${id} 重复声明依赖：${targetId}`);
      seen.add(targetId);
      require(targetId !== id, `工作项不能依赖自身：${id}`);
      if (targetId === id) continue;
      if (!result.members.has(targetId)) {
        result.errors.push(`依赖工作项未登记在项目清单：${id} → ${targetId}`);
        continue;
      }
      result.graph.get(id).push(targetId);
      if (dependency.candidate !== result.members.get(targetId).candidate) {
        addEdgeBlocker(result, id, `依赖候选与项目清单不一致：${id} → ${targetId}`);
      }
    }
  }

  for (const [id, item] of result.records) {
    if (!item || !Array.isArray(item.dependsOn)) continue;
    for (const dependency of item.dependsOn) {
      const targetId = dependency?.workItemId;
      const target = result.records.get(targetId);
      if (target && dependency?.candidate !== target.candidate) {
        addEdgeBlocker(result, id, `依赖候选与工作项当前候选不一致：${id} → ${targetId}`);
      }
    }
  }

  validateCycles(result);
  validateIntegration(result);
  if (manifest.multiPlace?.enabled === true) validateMultiPlace(result, repo);
  return result;
}

/** 给某个成员记下候选或文件问题，避免无关未完成工作项阻断单项检查。 */
function addNodeBlocker(result, id, message) {
  if (!result.nodeBlockers.has(id)) result.nodeBlockers.set(id, []);
  if (!result.nodeBlockers.get(id).includes(message)) result.nodeBlockers.get(id).push(message);
}

/** 把依赖边上的候选问题绑定到源工作项，只有检查该依赖链时才阻断单项。 */
function addEdgeBlocker(result, id, message) {
  if (!result.edgeBlockers.has(id)) result.edgeBlockers.set(id, []);
  if (!result.edgeBlockers.get(id).includes(message)) result.edgeBlockers.get(id).push(message);
}

/** 用三色深度遍历拒绝全局依赖环，避免循环让前置闭包失去定义。 */
function validateCycles(result) {
  const active = new Set();
  const complete = new Set();
  function visit(id) {
    if (active.has(id)) { result.errors.push(`项目工作项依赖成环：${id}`); return; }
    if (complete.has(id)) return;
    active.add(id);
    for (const dependency of result.graph.get(id) ?? []) visit(dependency);
    active.delete(id);
    complete.add(id);
  }
  for (const id of result.members.keys()) visit(id);
}

/** 计算一个工作项的全部传递前置项，不包括工作项自身。 */
function ancestors(id, graph) {
  const found = new Set();
  function visit(current) {
    for (const dependency of graph.get(current) ?? []) {
      if (found.has(dependency)) continue;
      found.add(dependency);
      visit(dependency);
    }
  }
  visit(id);
  return found;
}

/** 集成工作项必须汇合全部非发布成员；发布依赖也必须经过该集成节点。 */
function validateIntegration(result) {
  const manifest = result.manifest;
  if (!manifest) return;
  const id = manifest.integrationWorkItemId;
  if (!isId(id) || !result.members.has(id)) {
    result.errors.push("integrationWorkItemId 必须指向已登记的 INTEGRATION 工作项");
    return;
  }
  const integration = result.records.get(id);
  if (!integration) return;
  if (integration.type !== "INTEGRATION") result.errors.push(`项目集成工作项类型必须是 INTEGRATION：${id}`);
  const integrationAncestors = ancestors(id, result.graph);
  for (const [memberId, item] of result.records) {
    if (!item) continue;
    if (item.type !== "RELEASE" && memberId !== id && !integrationAncestors.has(memberId)) {
      result.errors.push(`集成工作项未依赖非发布成员：${id} → ${memberId}`);
    }
    if (item.type === "RELEASE" && !ancestors(memberId, result.graph).has(id)) {
      result.errors.push(`发布工作项必须传递依赖集成工作项：${memberId} → ${id}`);
    }
  }
}

/** 检查引用的合同产物是否为项目内非空普通文件。 */
function validateContractRef(result, repo, relation, label) {
  if (!isText(relation.contractRef)) {
    result.errors.push(`${label} 必须声明 contractRef`);
    return false;
  }
  try {
    const file = statSync(projectPath(repo, relation.contractRef));
    if (!file.isFile() || file.size === 0) throw new Error("合同文件必须是非空普通文件");
    return true;
  } catch (error) {
    result.errors.push(`${label} 合同文件无效：${error.message}`);
    return false;
  }
}

/** 检查某条跨 Place 关系的验证工作项及其生产前置覆盖。 */
function validateMultiPlaceVerifier(result, relation, label, placeIds) {
  const verifierId = relation.verificationWorkItemId;
  if (!isId(verifierId) || !result.members.has(verifierId)) {
    result.errors.push(`${label} verificationWorkItemId 必须引用已登记工作项`);
    return;
  }
  const verifier = result.records.get(verifierId);
  if (!verifier) return;
  if (verifier.type !== "INTEGRATION") result.errors.push(`${label} 验证工作项必须是 INTEGRATION：${verifierId}`);
  const covered = ancestors(verifierId, result.graph);
  for (const place of result.multiPlaces ?? []) {
    if (!placeIds.includes(place.id)) continue;
    for (const workItemId of Array.isArray(place.workItemIds) ? place.workItemIds : []) {
      const item = result.records.get(workItemId);
      if (item && item.phase === "production" && item.type !== "RELEASE" && !covered.has(workItemId)) {
        result.errors.push(`${label} 验证工作项未依赖 Place ${place.id} 的生产工作项：${verifierId} → ${workItemId}`);
      }
    }
  }
  result.multiPlaceRelations.push({
    kind: relation.transitionId ? "transition" : "sharedData",
    id: relation.transitionId ?? relation.sharedDataId,
    verifierId,
    placeIds: [...placeIds],
  });
}

/** 只在用户显式启用时校验多个真实 Place、转场和共享数据关系。 */
function validateMultiPlace(result, repo) {
  const multiPlace = result.manifest.multiPlace;
  if (!Array.isArray(multiPlace.places) || !Array.isArray(multiPlace.transitions) || !Array.isArray(multiPlace.sharedData)) {
    result.errors.push("启用多 Place 时必须提供 places、transitions 和 sharedData 数组");
    return;
  }
  const placeIds = new Map();
  const numericIds = new Map();
  const assigned = new Map();
  result.multiPlaces = [];
  for (const place of multiPlace.places) {
    if (!place || typeof place !== "object" || Array.isArray(place)) {
      result.errors.push("多 Place 条目必须是对象");
      continue;
    }
    if (!isId(place.id) || placeIds.has(place.id)) result.errors.push("Place id 必须合法且唯一");
    if (!Number.isSafeInteger(place.placeId) || place.placeId <= 0) result.errors.push(`Place ${place.id} 必须绑定真实正整数 placeId`);
    if (!Number.isSafeInteger(place.universeId) || place.universeId <= 0) result.errors.push(`Place ${place.id} 必须绑定真实正整数 universeId`);
    if (!Array.isArray(place.workItemIds)) result.errors.push(`Place ${place.id} 的 workItemIds 必须是数组`);
    if (isId(place.id) && !placeIds.has(place.id)) placeIds.set(place.id, place);
    if (Number.isSafeInteger(place.placeId) && place.placeId > 0) {
      if (numericIds.has(place.placeId)) result.errors.push(`Place placeId 重复：${place.placeId}`);
      else numericIds.set(place.placeId, place);
    }
    if (Array.isArray(place.workItemIds)) {
      const local = new Set();
      for (const workItemId of place.workItemIds) {
        if (!isId(workItemId) || !result.members.has(workItemId)) {
          result.errors.push(`Place ${place.id} 引用了未登记工作项：${workItemId}`);
          continue;
        }
        if (local.has(workItemId)) result.errors.push(`Place ${place.id} 重复登记工作项：${workItemId}`);
        local.add(workItemId);
        if (!assigned.has(workItemId)) assigned.set(workItemId, []);
        assigned.get(workItemId).push(place.id);
        const item = result.records.get(workItemId);
        if (item && (item.target?.placeId !== place.placeId || item.target?.universeId !== place.universeId)) {
          addNodeBlocker(result, workItemId, `工作项目标与 Place 身份不一致：${workItemId}/${place.id}`);
        }
      }
    }
  }
  const places = [...placeIds.values()];
  result.multiPlaces = places;
  result.multiPlaceById = new Map(places.map((place) => [place.id, place]));
  if (places.length < 2 || numericIds.size < 2) result.errors.push("启用多 Place 至少需要两个不同的真实 Place");
  if (new Set(places.map((place) => place.universeId)).size > 1) result.errors.push("同一体验的多 Place 必须属于同一 Universe");
  for (const id of result.members.keys()) {
    const owners = assigned.get(id) ?? [];
    if (owners.length !== 1) result.errors.push(`每个登记工作项必须且只能属于一个 Place：${id}`);
  }

  const transitionIds = new Set();
  if (multiPlace.transitions.length === 0) result.errors.push("启用多 Place 至少需要一条 Place 转场关系");
  for (const relation of multiPlace.transitions) {
    if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
      result.errors.push("Place 转场必须是对象");
      continue;
    }
    if (!isId(relation.id) || transitionIds.has(relation.id)) result.errors.push("Place 转场 id 必须合法且唯一");
    transitionIds.add(relation.id);
    const from = placeIds.get(relation.from);
    const to = placeIds.get(relation.to);
    if (!from || !to || relation.from === relation.to) {
      result.errors.push(`Place 转场端点必须是两个有效且不同的 Place：${relation.id}`);
      continue;
    }
    validateContractRef(result, repo, relation, `Place 转场 ${relation.id}`);
    validateMultiPlaceVerifier(result, { ...relation, transitionId: relation.id }, `Place 转场 ${relation.id}`,
      [relation.from, relation.to]);
  }

  const sharedIds = new Set();
  for (const relation of multiPlace.sharedData) {
    if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
      result.errors.push("共享数据关系必须是对象");
      continue;
    }
    if (!isId(relation.id) || sharedIds.has(relation.id)) result.errors.push("共享数据 id 必须合法且唯一");
    sharedIds.add(relation.id);
    if (!Array.isArray(relation.placeIds) || relation.placeIds.length < 2
        || new Set(relation.placeIds).size !== relation.placeIds.length
        || relation.placeIds.some((id) => !placeIds.has(id))) {
      result.errors.push(`共享数据关系至少需要两个有效且不重复的 Place：${relation.id}`);
      continue;
    }
    validateContractRef(result, repo, relation, `共享数据 ${relation.id}`);
    validateMultiPlaceVerifier(result, { ...relation, sharedDataId: relation.id }, `共享数据 ${relation.id}`,
      relation.placeIds);
  }
}

/** 返回工作项及其全部依赖链上的记录问题和候选漂移。 */
function dependencyChainIssues(result, id) {
  const blockers = [];
  const relevant = new Set([id, ...ancestors(id, result.graph)]);
  for (const memberId of relevant) {
    blockers.push(...(result.nodeBlockers.get(memberId) ?? []));
    blockers.push(...(result.edgeBlockers.get(memberId) ?? []));
  }
  return [...new Set(blockers)];
}

/** 检查传递前置项已完成且通过本地门，不让无关成员的未完成状态阻断当前任务。 */
function validateDependencyState(result, id, repo, assessLocal) {
  const blockers = [];
  const dependencies = ancestors(id, result.graph);
  for (const dependencyId of dependencies) {
    const item = result.records.get(dependencyId);
    if (!item) continue;
    if (item.state !== "complete") blockers.push(`传递前置工作项尚未完成：${dependencyId}`);
    let local;
    try { local = assessLocal(item, repo); }
    catch (error) {
      blockers.push(`前置工作项本地检查失败：${dependencyId}（${error.message}）`);
      continue;
    }
    if (!local?.ready) blockers.push(`传递前置工作项未通过本地验收：${dependencyId}`);
  }
  return blockers;
}

/** 匹配当前候选下真实运行证据中的跨 Place 关系标记。 */
function hasMultiPlaceEvidence(item, relation) {
  const field = relation.kind === "transition" ? "transitionId" : "sharedDataId";
  const expectedPlaceIds = [...new Set(relation.placeIds.map((id) => {
    const place = item.__multiPlaceById?.get(id);
    return place?.placeId;
  }))].sort((a, b) => a - b);
  if (expectedPlaceIds.some((id) => !Number.isSafeInteger(id))) return false;
  return Array.isArray(item.evidence) && item.evidence.some((entry) => {
    const metadata = entry?.multiPlace;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const keys = Object.keys(metadata).sort();
    if (keys.join(",") !== [field, "placeIds"].sort().join(",")) return false;
    if (entry.workItemId !== item.id || entry.candidate !== item.candidate || entry.result !== "PASS"
        || !["play", "multiplayer"].includes(entry.type) || !relation.placeIds.some((id) => {
          const place = item.__multiPlaceById?.get(id);
          return place?.placeId === entry.placeId;
        })) return false;
    if (metadata[field] !== relation.id || !Array.isArray(metadata.placeIds)) return false;
    const actual = [...metadata.placeIds].sort((a, b) => a - b);
    return actual.length === expectedPlaceIds.length && actual.every((id, index) => id === expectedPlaceIds[index]);
  });
}

/** 检查给定工作项的多 Place 验证记录并通过常规本地证据门复核。 */
function validateVerifierEvidence(result, repo, assessLocal, verifierIds = null) {
  const blockers = [];
  const relations = result.multiPlaceRelations.filter((relation) => !verifierIds || verifierIds.has(relation.verifierId));
  for (const relation of relations) {
    const verifier = result.records.get(relation.verifierId);
    if (!verifier) continue;
    if (!hasMultiPlaceEvidence({ ...verifier, __multiPlaceById: result.multiPlaceById }, relation)) {
      blockers.push(`跨 Place 关系缺少当前候选运行证据：${relation.kind}/${relation.id}`);
    }
    let local;
    try { local = assessLocal(verifier, repo); }
    catch (error) {
      blockers.push(`多 Place 验证工作项本地检查失败：${relation.verifierId}（${error.message}）`);
      continue;
    }
    if (!local?.ready) blockers.push(`多 Place 验证工作项未通过本地证据门：${relation.verifierId}`);
  }
  return blockers;
}

/** 让依赖集成验证工作的下游项继承适用于该前置的跨 Place 证据门。 */
function relevantVerifierIds(result, id) {
  const reachable = ancestors(id, result.graph);
  reachable.add(id);
  return new Set(result.multiPlaceRelations
    .filter((relation) => reachable.has(relation.verifierId))
    .map((relation) => relation.verifierId));
}

/** 向工作项评估上下文添加项目图约束及传递前置状态结果。 */
export function checkProjectDependencies(item, context, assessLocal) {
  if (!Array.isArray(item?.dependsOn)) context.require(false, "工作项必须声明 dependsOn 数组");
  const result = inspectProject(context.repo);
  appendContext(context, result);
  if (!result.exists) {
    if (Array.isArray(item?.dependsOn) && item.dependsOn.length) context.blockers.push("跨工作项依赖需要 .workflow-control/project.json 项目清单");
    return;
  }
  if (!item || !isId(item.id) || !result.members.has(item.id)) {
    context.blockers.push(`工作项未登记在项目清单：${item?.id ?? "<未知>"}`);
    return;
  }
  const member = result.members.get(item.id);
  if (item.candidate !== member.candidate) context.blockers.push(`当前工作项候选与项目清单不一致：${item.id}`);
  const diskItem = result.records.get(item.id);
  if (diskItem && JSON.stringify(item.dependsOn) !== JSON.stringify(diskItem.dependsOn)) {
    context.require(false, `当前工作项依赖与项目文件不一致：${item.id}`);
  }
  const issues = dependencyChainIssues(result, item.id);
  for (const message of issues) if (!context.blockers.includes(message)) context.blockers.push(message);
  for (const message of validateDependencyState(result, item.id, context.repo, assessLocal)) {
    if (!context.blockers.includes(message)) context.blockers.push(message);
  }
  const verifierIds = relevantVerifierIds(result, item.id);
  for (const message of validateVerifierEvidence(result, context.repo, assessLocal, verifierIds)) {
    if (!context.blockers.includes(message)) context.blockers.push(message);
  }
}

/** 发现工作项目录中的 JSON 孤儿文件，阻止全局清单漏登记成员。 */
function findUnregisteredWorkItems(repo, manifest) {
  const errors = [];
  let directory;
  try { directory = projectPath(repo, WORK_ITEM_DIR); }
  catch (error) { return [`工作项目录路径无效：${error.message}`]; }
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === "ENOENT") return errors;
    return [`工作项目录无法列举：${error.message}`];
  }
  const registered = new Set((Array.isArray(manifest?.workItems) ? manifest.workItems : []).map((entry) => entry?.id));
  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    const id = entry.name.slice(0, -5);
    try {
      const file = statSync(projectPath(repo, `${WORK_ITEM_DIR}/${entry.name}`));
      if (!file.isFile()) { errors.push(`工作项目录中的 JSON 路径不是普通文件：${entry.name}`); continue; }
    } catch (error) { errors.push(`工作项目录成员无效：${entry.name}（${error.message}）`); continue; }
    if (!isId(id) || !registered.has(id)) errors.push(`工作项文件未登记在项目清单：${entry.name}`);
  }
  return errors;
}

/** 全局聚合所有登记成员，确保每项完成、局部通过、依赖闭合且清单无孤儿文件。 */
export function assessProject(repo, assessLocal) {
  const result = inspectProject(repo);
  const errors = [...result.errors];
  const globalErrors = [...result.errors];
  const blockers = [...result.blockers];
  if (!result.exists) {
    const message = "缺少 .workflow-control/project.json 项目清单";
    errors.push(message);
    globalErrors.push(message);
  }
  if (result.members.size === 0) blockers.push("项目清单尚未登记工作项");
  if (result.manifest) {
    const unregisteredErrors = findUnregisteredWorkItems(repo, result.manifest);
    errors.push(...unregisteredErrors);
    globalErrors.push(...unregisteredErrors);
  }

  const items = [];
  const localResults = new Map();
  for (const [id, member] of result.members) {
    const item = result.records.get(id);
    const nodeErrors = [];
    const nodeBlockers = [...(result.nodeBlockers.get(id) ?? []), ...(result.edgeBlockers.get(id) ?? [])];
    if (!item) {
      items.push({ id, candidate: member.candidate, state: null, valid: false, ready: false, errors: nodeErrors, blockers: nodeBlockers });
      blockers.push(...nodeBlockers);
      continue;
    }
    let local;
    try { local = assessLocal(item, repo); }
    catch (error) { local = { valid: false, ready: false, errors: [`本地检查失败：${error.message}`], blockers: [] }; }
    localResults.set(id, local);
    nodeErrors.push(...(Array.isArray(local?.errors) ? local.errors : []));
    nodeErrors.push(...result.errors);
    nodeBlockers.push(...(Array.isArray(local?.blockers) ? local.blockers : []));
    if (item.state !== "complete") nodeBlockers.push(`工作项尚未完成：${id}`);
    if (!local?.ready) nodeBlockers.push(`工作项未通过本地验收：${id}`);
    for (const message of nodeErrors) errors.push(`工作项 ${id}：${message}`);
    for (const message of nodeBlockers) blockers.push(`工作项 ${id}：${message}`);
    items.push({ id, candidate: item.candidate, state: item.state, valid: local?.valid === true && nodeErrors.length === 0,
      ready: item.state === "complete" && local?.ready === true && nodeErrors.length === 0 && nodeBlockers.length === 0,
      errors: [...new Set(nodeErrors)], blockers: [...new Set(nodeBlockers)] });
  }

  const itemReports = new Map(items.map((item) => [item.id, item]));
  const assetReport = checkProjectAssetConsumers(repo, result.members, result.records);
  errors.push(...assetReport.errors);
  globalErrors.push(...assetReport.errors);
  blockers.push(...assetReport.blockers);
  for (const report of items) report.errors.push(...globalErrors);
  for (const [id, messages] of assetReport.byWorkItem) {
    const report = itemReports.get(id);
    if (!report) continue;
    for (const message of messages) {
      report.blockers.push(message);
      blockers.push(`工作项 ${id}：${message}`);
    }
  }
  for (const [id, item] of result.records) {
    if (!item) continue;
    const report = itemReports.get(id);
    if (!report) continue;
    for (const message of dependencyChainIssues(result, id)) report.blockers.push(message);
    for (const dependencyId of ancestors(id, result.graph)) {
      const dependency = result.records.get(dependencyId);
      if (!dependency) continue;
      if (dependency.state !== "complete") report.blockers.push(`传递前置工作项尚未完成：${dependencyId}`);
      if (!localResults.get(dependencyId)?.ready) report.blockers.push(`传递前置工作项未通过本地验收：${dependencyId}`);
    }
    for (const message of report.blockers) blockers.push(`工作项 ${id}：${message}`);
  }
  for (const id of result.members.keys()) {
    const report = itemReports.get(id);
    if (!report) continue;
    const verifierIds = relevantVerifierIds(result, id);
    for (const message of validateVerifierEvidence(result, repo, assessLocal, verifierIds)) {
      report.blockers.push(message);
      blockers.push(`工作项 ${id}：${message}`);
    }
    report.blockers = [...new Set(report.blockers)];
    report.errors = [...new Set(report.errors)];
    report.valid = report.valid && report.errors.length === 0;
    report.ready = report.ready && report.errors.length === 0 && report.blockers.length === 0;
  }
  // 全局错误使任何单项都无法声称通过，因为依赖结构本身不能完整解释。
  for (const report of items) {
    report.errors = [...new Set(report.errors)];
    report.blockers = [...new Set(report.blockers)];
    report.valid = report.valid && report.errors.length === 0;
    report.ready = report.ready && report.errors.length === 0 && report.blockers.length === 0;
  }

  const uniqueErrors = [...new Set(errors)];
  const uniqueBlockers = [...new Set(blockers)];
  return { valid: uniqueErrors.length === 0, ready: uniqueErrors.length === 0 && uniqueBlockers.length === 0,
    errors: uniqueErrors, blockers: uniqueBlockers, items };
}
