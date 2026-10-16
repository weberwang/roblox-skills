import { projectPath } from "./io.mjs";

/** 实施单元类型控制共享接线和场景/显示层的职责边界。 */
const KINDS = ["SHARED", "MODULE", "SCENE", "DISPLAY_LAYER", "INTEGRATION", "RELEASE"];

/** 验证实施所有权与依赖，不执行或自动排序任何 Studio 写入。 */
export function checkImplementation(item, context) {
  const { require, blockers } = context;
  const plan = item.implementation;
  if (!plan || typeof plan !== "object") { require(false, "缺少 implementation"); return []; }
  require(typeof plan.owner === "string" && !!plan.owner.trim(), "implementation.owner 不得为空");
  require(Array.isArray(plan.units) && Array.isArray(plan.verification) && Array.isArray(plan.stopConditions), "implementation 必须声明 units、verification、stopConditions 数组");
  if (Array.isArray(plan.stopConditions)) require(plan.stopConditions.every((value) => typeof value === "string" && !!value.trim()), "停止条件必须是非空文字");
  if (!Array.isArray(plan.units) || !Array.isArray(plan.verification)) return [];
  const files = Array.isArray(item.scope?.files) ? item.scope.files : [];
  const instances = Array.isArray(item.scope?.instances) ? item.scope.instances : [];
  const units = new Map();
  if (!plan.units.length || !plan.verification.length) blockers.push("尚未准备实施单元或验证计划");
  for (const unit of plan.units) {
    if (!unit || typeof unit !== "object") { require(false, "实施单元必须是对象"); continue; }
    require(typeof unit.id === "string" && !!unit.id.trim() && !units.has(unit.id), "实施单元必须有非空唯一 id");
    require(typeof unit.owner === "string" && !!unit.owner.trim(), "实施单元 owner 不得为空");
    require(KINDS.includes(unit.kind), `未知实施单元 kind：${unit.id}`);
    require(Array.isArray(unit.files) && Array.isArray(unit.instances) && Array.isArray(unit.dependsOn), `实施单元缺少 files/instances/dependsOn：${unit.id}`);
    if (Array.isArray(unit.files)) require(unit.files.every((path) => files.includes(path)), "实施单元文件超出 scope.files");
    if (Array.isArray(unit.instances)) require(unit.instances.every((path) => instances.includes(path)), "实施单元实例超出 scope.instances");
    if (unit.status !== "complete") blockers.push(`实施单元未完成：${unit.id}`);
    units.set(unit.id, unit);
  }
  // 完成声明必须覆盖全部范围，避免用一个空的完成单元掩盖未实施文件。
  for (const path of files) require([...units.values()].some((unit) => Array.isArray(unit.files) && unit.files.includes(path)), `文件没有实施所有者：${path}`);
  for (const path of instances) require([...units.values()].some((unit) => Array.isArray(unit.instances) && unit.instances.includes(path)), `实例没有实施所有者：${path}`);
  const kinds = [...units.values()].map((unit) => unit.kind);
  require(!(kinds.includes("SCENE") && kinds.includes("DISPLAY_LAYER")), "场景与显示层不能合并为同一个实施包");
  if (instances.length) require(typeof plan.studioWriter === "string" && !!plan.studioWriter.trim(), "Studio 实例写入必须指定唯一 studioWriter");
  const visiting = new Set();
  const visited = new Set();
  /** 三色遍历拒绝未知依赖与环，保证实施包有实际可执行的交接顺序。 */
  function visit(id) {
    if (visiting.has(id)) { require(false, `实施依赖成环：${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const unit = units.get(id);
    for (const dependency of Array.isArray(unit?.dependsOn) ? unit.dependsOn : []) {
      require(units.has(dependency), `实施依赖不存在：${id} → ${dependency}`);
      if (units.has(dependency)) visit(dependency);
    }
    visiting.delete(id); visited.add(id);
  }
  for (const id of units.keys()) visit(id);
  /** 不同负责人接力写入同一目标时必须有明确依赖，不能把并行冲突藏在单写者声明里。 */
  function dependsOn(from, target, seen = new Set()) {
    if (seen.has(from)) return false;
    seen.add(from);
    const dependencies = units.get(from)?.dependsOn;
    return Array.isArray(dependencies) && dependencies.some((id) => id === target || dependsOn(id, target, seen));
  }
  const claims = [];
  for (const unit of units.values()) {
    for (const path of Array.isArray(unit.files) ? unit.files : []) {
      try {
        const resolved = projectPath(context.repo, path);
        claims.push({ unit, kind: "file", path: process.platform === "win32" ? resolved.toLowerCase() : resolved });
      } catch { /* 路径错误已由范围检查报告，这里只检查有效路径的所有权。 */ }
    }
    for (const path of Array.isArray(unit.instances) ? unit.instances : []) {
      if (typeof path === "string") claims.push({ unit, kind: "instance", path });
    }
  }
  for (let index = 0; index < claims.length; index += 1) {
    const left = claims[index];
    for (const right of claims.slice(index + 1)) {
      if (left.kind !== right.kind || left.unit.id === right.unit.id || left.unit.owner === right.unit.owner) continue;
      const overlap = left.path === right.path || (left.kind === "instance" && (left.path.startsWith(`${right.path}.`) || right.path.startsWith(`${left.path}.`)));
      if (overlap) require(dependsOn(left.unit.id, right.unit.id) || dependsOn(right.unit.id, left.unit.id), `不同所有者写入重叠目标但没有交接依赖：${left.path}`);
    }
  }
  const checks = [];
  const checkIds = new Set();
  for (const check of plan.verification) {
    if (!check || typeof check !== "object") { require(false, "验证计划必须是含 id、description、evidenceType 的对象"); continue; }
    require(typeof check.id === "string" && !!check.id.trim() && !checkIds.has(check.id), "验证检查 id 必须非空且唯一");
    require(typeof check.description === "string" && !!check.description.trim(), `验证检查缺少执行说明：${check.id}`);
    require(context.evidenceTypes.includes(check.evidenceType), `验证检查证据类别不合法：${check.id}`);
    checkIds.add(check.id); checks.push(check);
  }
  return checks;
}
