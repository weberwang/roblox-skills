import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { assertNoLinks, projectPath, readJson, writeNewJson, writeNewText } from "../../../roblox-game-workflow-control/scripts/runtime/io.mjs";
import { validateAssetRegister as validateSharedAssetRegister } from "../../../roblox-game-workflow-control/scripts/runtime/assets.mjs";

const CORE_DOCS = Object.freeze([
  "project-profile.json",
  "GDD.md",
  "TDD.md",
  "module-manifest.json",
]);

const OPTIONAL_DOCS = Object.freeze({
  visual: ["visual-baseline.json"],
  assets: ["asset-register.json"],
  qa: ["qa-plan.md"],
  release: ["release-checklist.md"],
});

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SOURCE_OF_TRUTH = new Set(["studio", "filesystem"]);
const READ_FAILED = Symbol("read-failed");

/** 默认档案只保存未知值占位，不填入任何 Studio 或游戏事实。 */
const PROFILE_TEMPLATE = Object.freeze({
  version: 1,
  projectId: "",
  status: "unconfigured",
  studio: {
    experienceName: "",
    universeId: null,
    placeId: null,
    instanceName: "",
    sourceOfTruth: "unknown",
    syncTool: "",
  },
  devices: [],
  inputs: [],
  sourceData: [],
});

/** 文档模板只提供章节结构，不声称设计、实现或验证已经完成。 */
const MARKDOWN_TEMPLATES = Object.freeze({
  "GDD.md": `# 游戏设计文档\n\n状态：unconfigured\n\n## 体验概述\n\n待填写实际体验目标。\n\n## 核心循环\n\n待填写玩家可观察的核心循环。\n\n## 玩家目标与成长\n\n待填写目标、进度与奖励。\n\n## 范围与非目标\n\n待填写本阶段包含和排除的内容。\n\n## 验收标准\n\n待填写可观察的验收条件。\n`,
  "TDD.md": `# 技术设计文档\n\n状态：unconfigured\n\n## 源数据与工程入口\n\n待记录 Studio DataModel、文件工程或同步映射的实际来源。\n\n## 模块边界与所有权\n\n待记录模块职责、唯一负责人和依赖。详见 module-manifest.json。\n\n## 客户端与服务器职责\n\n待记录实际权威边界和客户端表现职责。\n\n## Remote 与数据契约\n\n待记录 Remote 名称、参数验证、速率限制与数据所有权。\n\n## 生命周期与持久化\n\n待记录玩家加入、离开、保存和失败处理。\n`,
  "qa-plan.md": `# QA 计划\n\n状态：unconfigured\n\n## 测试范围\n\n待填写本次测试目标、工作项及当前阶段、明确排除项；核对前置阶段的独立交付和退出依据。\n\n## Studio 检查\n\n待填写计划检查；计划内容不代表已执行，运行报告不能补齐早期阶段。\n\n## 设备与输入覆盖\n\n待填写已确认的目标设备、输入方式和用例；技术结果记录在情景 technical 中。\n\n## 人工视觉验收\n\n待填写当前候选的视觉检查范围、visual 证据和真实用户判断来源；未取得判断时保持视觉 NOT_RUN，不从技术 PASS 自动填入。\n`,
  "release-checklist.md": `# 发布检查清单\n\n状态：unconfigured\n\n## 目标身份\n\n待填写已确认的体验、Universe 和 Place。\n\n## 保存与发布授权\n\n待记录单独授权；缺少授权时不得执行上传或发布。\n\n## 发布前检查\n\n待填写真实完成的检查及对应证据。\n\n## 回滚与后续观察\n\n待填写可执行的恢复步骤和观察负责人。\n`,
});

/** 可选基线保持空白，人工确认状态不能由结构检查推断。 */
const VISUAL_TEMPLATE = Object.freeze({
  version: 1,
  status: "unconfigured",
  artBrief: { theme: "", audience: "", coreLoop: "", viewingContext: "", readabilityGoal: "", comfortConstraints: "" },
  userMessageRef: "",
  targets: [],
  evidenceRefs: [],
});

/** 资源清单从空数组开始，避免虚构资产来源、许可或 Asset ID。 */
const ASSET_TEMPLATE = Object.freeze({ version: 1, assets: [] });

/** 模块清单从空数组开始；列出计划不会证明 Studio 内存在对应实例。 */
const MODULE_TEMPLATE = Object.freeze({ version: 1, modules: [] });

/** 按名称取得模板并序列化为待写字节，所有目标在写入前一次性准备。 */
function prepareTemplate(name, projectId) {
  if (name === "project-profile.json") {
    const profile = { ...PROFILE_TEMPLATE, projectId };
    return `${JSON.stringify(profile, null, 2)}\n`;
  }
  if (name === "module-manifest.json") return `${JSON.stringify(MODULE_TEMPLATE, null, 2)}\n`;
  if (name === "asset-register.json") return `${JSON.stringify(ASSET_TEMPLATE, null, 2)}\n`;
  if (name === "visual-baseline.json") return `${JSON.stringify(VISUAL_TEMPLATE, null, 2)}\n`;
  const markdown = MARKDOWN_TEMPLATES[name];
  if (typeof markdown === "string" && markdown.trim().length > 0) return markdown;
  throw new Error(`缺少文档模板：${name}`);
}

/** 校验小写项目 ID，避免生成含糊或无法稳定引用的文档标识。 */
function validateProjectId(projectId) {
  if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("项目 ID 必须为 1 至 64 位小写字母、数字或连字符，且以字母或数字开头。");
  }
}

/** 确认实例引用采用 game. 前缀且每段名称非空，保留 Roblox 名称中的空格。 */
function isGameInstancePath(value) {
  return typeof value === "string" && value.startsWith("game.")
    && value.slice("game.".length).split(".").every((segment) => segment.trim().length > 0);
}

/** 确认仓库目录已经存在、不是文件系统根且其路径没有经过链接。 */
function validateProjectRoot(input) {
  const root = resolve(input);
  if (dirname(root) === root) throw new Error("项目根目录不能是文件系统根目录。");
  assertNoLinks(root);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`项目根目录不存在或不是目录：${root}`);
  return root;
}

/** 将可选名称映射为唯一文档集合，并拒绝未支持的交付物。 */
function documentNames(include) {
  if (!Array.isArray(include)) throw new Error("include 必须为名称数组。");
  const names = [...CORE_DOCS];
  for (const key of include) {
    const docs = OPTIONAL_DOCS[key];
    if (docs === undefined) throw new Error(`不支持的可选文档：${key}`);
    names.push(...docs);
  }
  return [...new Set(names)];
}

/** 预检指定文档的全部目标和模板，再排他写入并回滚本次新建文件。 */
function writePreparedDocs(root, projectId, names) {
  const targets = names.map((name) => ({ name, local: `docs/${name}`, path: projectPath(root, `docs/${name}`) }));
  const docsDirectory = projectPath(root, "docs");
  if (existsSync(docsDirectory) && !statSync(docsDirectory).isDirectory()) throw new Error("docs 路径已存在但不是目录。");

  // 模板解析和所有目标冲突检查都在创建任何文档之前完成。
  const prepared = targets.map((target) => {
    const content = prepareTemplate(target.name, projectId);
    if (target.name.endsWith(".md") && content.trim().length === 0) throw new Error(`文档模板为空：${target.name}`);
    const jsonValue = target.name.endsWith(".json") ? JSON.parse(content) : undefined;
    return { ...target, content, jsonValue };
  });
  const collisions = prepared.filter((target) => existsSync(target.path)).map((target) => target.local);
  if (collisions.length > 0) throw new Error(`拒绝覆盖已有文档：${collisions.join("、")}`);

  const docsExisted = existsSync(docsDirectory);
  const written = [];
  try {
    mkdirSync(docsDirectory, { recursive: true });
    for (const target of prepared) {
      if (target.name.endsWith(".json")) {
        writeNewJson(root, target.local, target.jsonValue);
      } else {
        writeNewText(root, target.local, target.content);
      }
      written.push(target.path);
    }
  } catch (error) {
    // wx 创建记录本身，回滚时仅删除本次已成功创建的文件。
    for (const path of written.reverse()) {
      try { unlinkSync(path); } catch (cleanupError) { if (cleanupError.code !== "ENOENT") throw cleanupError; }
    }
    if (!docsExisted) {
      try { rmdirSync(docsDirectory); } catch (cleanupError) { if (! ["ENOENT", "ENOTEMPTY"].includes(cleanupError.code)) throw cleanupError; }
    }
    throw error;
  }
  return prepared.map((target) => target.local);
}

/** 初始化核心文档及用户显式选择的可选文档。 */
export function initializeProjectDocs({ repo, projectId, include = [] }) {
  const root = validateProjectRoot(repo);
  validateProjectId(projectId);
  return writePreparedDocs(root, projectId, documentNames(include));
}

/** 只添加可选文档；先核对核心档案版本和 ID，再预检全部可选目标。 */
export function addOptionalProjectDocs({ repo, projectId, include = [] }) {
  const root = validateProjectRoot(repo);
  validateProjectId(projectId);
  const names = documentNames(include).filter((name) => !CORE_DOCS.includes(name));
  if (names.length === 0) throw new Error("add-docs 必须通过 --include 至少选择一项可选文档。");

  let profile;
  try {
    profile = readJson(root, "docs/project-profile.json");
  } catch (error) {
    throw new Error(`add-docs 需要先有可读取的 docs/project-profile.json：${error instanceof Error ? error.message : String(error)}`);
  }
  const errors = [];
  const blockers = [];
  validateProfile(profile, root, projectId, errors, blockers);
  if (errors.length > 0) throw new Error(`核心项目档案无效：${errors.join("；")}`);
  return writePreparedDocs(root, projectId, names);
}

/** 判断值是否为可用文本，排除常见未知和模板占位写法。 */
function isActualText(value) {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const text = value.trim();
  return !/^(unknown|tbd|todo|待填写|未知|未配置|n\/a|null)$/i.test(text)
    && !/^<.*>$/.test(text)
    && !/\{\{.*\}\}/.test(text);
}

/** 检查非空唯一字符串列表并把问题追加到错误集合。 */
function validateStringList(value, label, errors, { nonEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${label} 必须为数组。`);
    return [];
  }
  if (nonEmpty && value.length === 0) errors.push(`${label} 不能为空。`);
  const seen = new Set();
  value.forEach((entry, index) => {
    if (!isActualText(entry)) errors.push(`${label}[${index}] 必须为非空且非占位文本。`);
    else if (seen.has(entry)) errors.push(`${label} 包含重复值：${entry}`);
    else seen.add(entry);
  });
  return value;
}

/** 检查路径是否指向项目内的非空普通文件，不读取或执行其内容。 */
function validateEvidenceFile(repo, localPath, label, errors) {
  if (!isActualText(localPath)) {
    errors.push(`${label} 必须为项目内文件路径。`);
    return false;
  }
  try {
    const path = projectPath(repo, localPath);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
      errors.push(`${label} 必须指向项目内已存在的非空文件：${localPath}`);
      return false;
    }
    return true;
  } catch (error) {
    errors.push(`${label} 路径无效：${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** 对尚未完成的证据引用也检查项目边界与链接，但不要求文件已创建。 */
function validateProjectRelativeReference(repo, localPath, label, errors) {
  if (typeof localPath !== "string" || localPath.trim().length === 0) return;
  try {
    projectPath(repo, localPath);
  } catch (error) {
    errors.push(`${label} 路径无效：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 验证项目档案的基础结构，并在 ready 状态下要求可核实的实际项目字段。 */
function validateProfile(value, repo, expectedProjectId, errors, blockers) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push("project-profile.json 根必须为对象。");
    return;
  }
  if (value.version !== 1) errors.push("project-profile.version 必须为 1。");
  if (typeof value.projectId !== "string" || value.projectId !== expectedProjectId || !PROJECT_ID_PATTERN.test(value.projectId)) {
    errors.push("project-profile.projectId 必须与 --project-id 初始化值一致，并使用小写 ID。");
  }
  if (!["unconfigured", "ready"].includes(value.status)) errors.push("project-profile.status 只能是 unconfigured 或 ready。");
  if (value.studio === null || typeof value.studio !== "object" || Array.isArray(value.studio)) {
    errors.push("project-profile.studio 必须为对象。");
  }
  if (value.studio !== null && typeof value.studio === "object" && !Array.isArray(value.studio)) {
    for (const key of ["experienceName", "instanceName", "sourceOfTruth", "syncTool"]) {
      if (typeof value.studio[key] !== "string") errors.push(`project-profile.studio.${key} 必须为字符串。`);
    }
    for (const key of ["universeId", "placeId"]) {
      if (value.studio[key] !== null && (!Number.isSafeInteger(value.studio[key]) || value.studio[key] < 0)) {
        errors.push(`project-profile.studio.${key} 必须为 null 或非负安全整数。`);
      }
    }
  }
  validateStringList(value.devices, "project-profile.devices", errors);
  validateStringList(value.inputs, "project-profile.inputs", errors);
  if (!Array.isArray(value.sourceData)) errors.push("project-profile.sourceData 必须为数组。");
  else {
    value.sourceData.forEach((source, index) => {
      if (source === null || typeof source !== "object" || Array.isArray(source)) {
        errors.push(`project-profile.sourceData[${index}] 必须为对象。`);
        return;
      }
      for (const key of ["kind", "uri", "evidenceRef"]) {
        if (typeof source[key] !== "string") errors.push(`project-profile.sourceData[${index}].${key} 必须为字符串。`);
      }
      validateProjectRelativeReference(repo, source.evidenceRef, `project-profile.sourceData[${index}].evidenceRef`, errors);
    });
  }
  if (value.status === "unconfigured") {
    blockers.push("项目档案状态为 unconfigured，尚不能视为已配置。");
    return;
  }
  if (value.status !== "ready" || errors.length > 0) return;

  const studio = value.studio;
  for (const key of ["experienceName", "instanceName"]) {
    if (!isActualText(studio[key])) errors.push(`project-profile.studio.${key} 必须填写实际值。`);
  }
  for (const key of ["universeId", "placeId"]) {
    if (!Number.isSafeInteger(studio[key]) || studio[key] < 0) {
      errors.push(`project-profile.studio.${key} 必须是已实际回读的非负安全整数。`);
    }
  }
  if (!SOURCE_OF_TRUTH.has(studio.sourceOfTruth)) errors.push("project-profile.studio.sourceOfTruth 必须是 studio 或 filesystem；Rojo 等同步工具记录在 syncTool。");
  validateStringList(value.devices, "project-profile.devices", errors, { nonEmpty: true });
  validateStringList(value.inputs, "project-profile.inputs", errors, { nonEmpty: true });
  if (!Array.isArray(value.sourceData) || value.sourceData.length === 0) {
    errors.push("project-profile.sourceData 必须包含至少一条实际来源记录。");
    return;
  }
  const sourceKeys = new Set();
  value.sourceData.forEach((source, index) => {
    if (source === null || typeof source !== "object" || Array.isArray(source)) {
      errors.push(`project-profile.sourceData[${index}] 必须为对象。`);
      return;
    }
    for (const key of ["kind", "uri", "evidenceRef"]) {
      if (!isActualText(source[key])) errors.push(`project-profile.sourceData[${index}].${key} 必须填写实际值。`);
    }
    const key = `${source.kind}\u0000${source.uri}`;
    if (sourceKeys.has(key)) errors.push(`project-profile.sourceData[${index}] 来源重复。`);
    sourceKeys.add(key);
    validateEvidenceFile(repo, source.evidenceRef, `project-profile.sourceData[${index}].evidenceRef`, errors);
  });
}

/** 验证模块 ID、依赖、游戏实例路径和本地文件所有权路径，并拒绝依赖环。 */
function validateModuleManifest(value, repo, errors) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push("module-manifest.json 根必须为对象。");
    return;
  }
  if (value.version !== 1) errors.push("module-manifest.version 必须为 1。");
  if (!Array.isArray(value.modules)) {
    errors.push("module-manifest.modules 必须为数组。");
    return;
  }
  const ids = new Set();
  const modulesById = new Map();
  value.modules.forEach((module, index) => {
    if (module === null || typeof module !== "object" || Array.isArray(module)) {
      errors.push(`module-manifest.modules[${index}] 必须为对象。`);
      return;
    }
    for (const key of ["id", "owner", "responsibility"]) {
      if (!isActualText(module[key])) errors.push(`module-manifest.modules[${index}].${key} 必须为非空文本。`);
    }
    if (isActualText(module.id)) {
      if (ids.has(module.id)) errors.push(`模块 ID 重复：${module.id}`);
      ids.add(module.id);
      modulesById.set(module.id, module);
    }
    validateStringList(module.dependencies, `module-manifest.modules[${index}].dependencies`, errors);
    if (!Array.isArray(module.files)) errors.push(`module-manifest.modules[${index}].files 必须为数组。`);
    else {
      const seenFiles = new Set();
      module.files.forEach((file, fileIndex) => {
        if (!isActualText(file)) {
          errors.push(`module-manifest.modules[${index}].files[${fileIndex}] 必须为项目内路径。`);
          return;
        }
        try {
          const resolved = projectPath(repo, file);
          const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
          if (seenFiles.has(key)) errors.push(`模块 ${module.id} 包含重复文件路径：${file}`);
          seenFiles.add(key);
        } catch (error) {
          errors.push(`模块 ${module.id} 文件路径无效：${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
    if (!Array.isArray(module.instances)) errors.push(`module-manifest.modules[${index}].instances 必须为数组。`);
    else {
      const seenInstances = new Set();
      module.instances.forEach((instance, instanceIndex) => {
        if (!isGameInstancePath(instance)) {
          errors.push(`module-manifest.modules[${index}].instances[${instanceIndex}] 必须使用 game. 开头的 DataModel 路径。`);
        } else if (seenInstances.has(instance)) errors.push(`模块 ${module.id} 包含重复实例路径：${instance}`);
        else seenInstances.add(instance);
      });
    }
  });

  for (const [id, module] of modulesById) {
    if (!Array.isArray(module.dependencies)) continue;
    for (const dependency of module.dependencies) {
      if (!ids.has(dependency)) errors.push(`模块 ${id} 依赖不存在的模块：${dependency}`);
      if (dependency === id) errors.push(`模块 ${id} 不能依赖自身。`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  /** 深度优先标记依赖栈，发现回边时报告循环而不递归重复节点。 */
  function visit(id) {
    if (visiting.has(id)) {
      errors.push(`模块依赖存在循环：${[...visiting, id].join(" -> ")}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const module = modulesById.get(id);
    if (module && Array.isArray(module.dependencies)) {
      for (const dependency of module.dependencies) if (modulesById.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of modulesById.keys()) visit(id);
}

/** 项目文档与工作项复用资源门，防止两处对许可、版本和消费者状态产生分歧。 */
function validateAssetRegister(value, repo, errors, blockers) {
  const report = validateSharedAssetRegister(value, repo);
  errors.push(...report.errors);
  blockers.push(...report.blockers);
}

/** 统一识别 Markdown 标题，正文切分与章节匹配复用相同的行位置和层级信息。 */
function parseMarkdownHeading(line, lineIndex) {
  const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  return { level: match[1].length, title: match[2].trim(), lineIndex };
}

/** 识别模板残留的未落实提示，避免任意非空文字让 ready 文档过门。 */
function isUnresolvedMarkdownLine(line) {
  const text = line.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "");
  return /^(?:待(?:填写|记录|确认|补充|实现|验证|提供)|未配置|未知|占位|todo\b|tbd\b|unknown\b|unconfigured\b|pending\b|placeholder\b)/i.test(text);
}

/** 验证章节结构和文档状态；ready 时每章都要可定位且含实际正文。 */
function validateMarkdown(value, name, requiredHeadings, errors, blockers) {
  if (typeof value !== "string") {
    errors.push(`${name} 必须为 UTF-8 文本。`);
    return;
  }
  const lines = value.split(/\r?\n/);
  const headings = lines.map((line, lineIndex) => parseMarkdownHeading(line, lineIndex)).filter(Boolean);
  const requiredHeadingMatches = new Map(requiredHeadings.map((heading) => [
    heading,
    headings.filter((entry) => entry.level <= 2 && entry.title === heading),
  ]));
  for (const [heading, matches] of requiredHeadingMatches) {
    if (matches.length === 0) errors.push(`${name} 缺少章节：${heading}`);
    else if (matches.length > 1) errors.push(`${name} 章节重复：${heading}`);
  }

  const status = value.match(/^状态：(unconfigured|ready)\s*$/m)?.[1];
  if (!status) {
    errors.push(`${name} 必须声明“状态：unconfigured”或“状态：ready”。`);
    return;
  }
  if (status === "unconfigured") blockers.push(`${name} 状态为 unconfigured，内容尚未确认。`);
  if (status === "ready") {
    for (const heading of requiredHeadings) {
      const matches = requiredHeadingMatches.get(heading);
      const section = matches?.[0];
      if (!section) {
        errors.push(`${name} 标记 ready，但章节“${heading}”无法定位。`);
        continue;
      }

      // Markdown 的同级或更高级标题结束当前章节；统一按解析后的行号切片。
      const nextSection = headings.find((entry) => entry.lineIndex > section.lineIndex && entry.level <= section.level);
      const endLine = nextSection?.lineIndex ?? lines.length;
      const body = lines
        .slice(section.lineIndex + 1, endLine)
        .filter((line, offset) => !parseMarkdownHeading(line, section.lineIndex + 1 + offset))
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !/^<!--.*-->$/.test(line));

      if (body.length === 0) errors.push(`${name} 标记 ready，但“${heading}”章节没有实际正文。`);
      if (body.some(isUnresolvedMarkdownLine)) errors.push(`${name} 标记 ready，但“${heading}”仍含待填写、待记录或其他未落实的占位正文。`);
    }
  }
}

/** 读取 Markdown 项目文档并把文件系统或 UTF-8 错误纳入检查报告。 */
function readMarkdown(repo, name, errors) {
  try {
    return readFileSync(projectPath(repo, `docs/${name}`), "utf8");
  } catch (error) {
    errors.push(`${name} 无法读取：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** 读取 JSON 项目文档并统一收集缺失、链接和解析错误。 */
function readDocumentJson(repo, name, errors) {
  try {
    return readJson(repo, `docs/${name}`);
  } catch (error) {
    errors.push(`${name} 无法读取：${error instanceof Error ? error.message : String(error)}`);
    return READ_FAILED;
  }
}

/** 默认检查所有已存在的可选文档；显式 include 还会要求对应文档存在。 */
function checkDocumentNames(root, include, errors) {
  const explicitlySelected = new Set(documentNames(include).filter((name) => !CORE_DOCS.includes(name)));
  const optionalNames = Object.values(OPTIONAL_DOCS).flat();
  const discovered = [];
  for (const name of optionalNames) {
    let path;
    try {
      path = projectPath(root, `docs/${name}`);
    } catch (error) {
      errors.push(`${name} 路径无效：${error instanceof Error ? error.message : String(error)}`);
      if (explicitlySelected.has(name)) discovered.push(name);
      continue;
    }
    if (explicitlySelected.has(name) || existsSync(path)) discovered.push(name);
  }
  return [...CORE_DOCS, ...discovered];
}

/** 检查项目文档的结构和配置状态；不连接 Studio，也不判定游戏实现完成。 */
export function checkProjectDocs({ repo, include = [] }) {
  const root = validateProjectRoot(repo);
  const errors = [];
  const blockers = [];
  const names = checkDocumentNames(root, include, errors);
  const notices = [
    "模块清单表达计划边界，不证明 Roblox Studio 中已有对应代码或实例。",
    "本命令只检查本地文档和证据文件，不连接 Studio、不运行游戏，也不判定视觉或发布验收。",
  ];

  const profile = readDocumentJson(root, "project-profile.json", errors);
  if (profile !== READ_FAILED) validateProfile(profile, root, profile?.projectId, errors, blockers);

  const gdd = readMarkdown(root, "GDD.md", errors);
  if (gdd !== null) validateMarkdown(gdd, "GDD.md", ["体验概述", "核心循环", "玩家目标与成长", "范围与非目标", "验收标准"], errors, blockers);
  const tdd = readMarkdown(root, "TDD.md", errors);
  if (tdd !== null) validateMarkdown(tdd, "TDD.md", ["源数据与工程入口", "模块边界与所有权", "客户端与服务器职责", "Remote 与数据契约", "生命周期与持久化"], errors, blockers);

  const modules = readDocumentJson(root, "module-manifest.json", errors);
  if (modules !== READ_FAILED) validateModuleManifest(modules, root, errors);

  for (const name of names.filter((entry) => !CORE_DOCS.includes(entry))) {
    if (name === "visual-baseline.json") {
      const visual = readDocumentJson(root, name, errors);
      if (visual === READ_FAILED) continue;
      if (visual === null || typeof visual !== "object" || Array.isArray(visual)) {
        errors.push("visual-baseline.json 根必须为对象。");
        continue;
      }
      if (visual.version !== 1 || !["unconfigured", "ready"].includes(visual.status)) errors.push("visual-baseline.version/status 无效。");
      const briefFields = ["theme", "audience", "coreLoop", "viewingContext", "readabilityGoal", "comfortConstraints"];
      if (visual.artBrief === null || typeof visual.artBrief !== "object" || Array.isArray(visual.artBrief)) {
        errors.push("visual-baseline.artBrief 必须为对象。");
      } else {
        for (const field of briefFields) {
          if (typeof visual.artBrief[field] !== "string") errors.push(`visual-baseline.artBrief.${field} 必须为字符串。`);
        }
      }
      if (typeof visual.userMessageRef !== "string") errors.push("visual-baseline.userMessageRef 必须为字符串。");
      const targets = validateStringList(visual.targets, "visual-baseline.targets", errors);
      const refs = validateStringList(visual.evidenceRefs, "visual-baseline.evidenceRefs", errors);
      refs.forEach((reference, index) => validateProjectRelativeReference(root, reference, `visual-baseline.evidenceRefs[${index}]`, errors));
      if (visual.status === "unconfigured") blockers.push("视觉基线状态为 unconfigured，尚无已确认基线。");
      if (visual.status === "ready") {
        if (targets.length === 0 || refs.length === 0) errors.push("ready 视觉基线必须包含目标和证据文件。");
        if (!isActualText(visual.userMessageRef)) errors.push("ready 视觉基线必须引用真实的 userMessageRef。");
        if (visual.artBrief && typeof visual.artBrief === "object" && !Array.isArray(visual.artBrief)) {
          for (const field of briefFields) {
            if (!isActualText(visual.artBrief[field])) errors.push(`ready 视觉基线的 artBrief.${field} 必须填写实际内容。`);
          }
        }
        refs.forEach((reference, index) => validateEvidenceFile(root, reference, `visual-baseline.evidenceRefs[${index}]`, errors));
      }
    }
    if (name === "asset-register.json") {
      const assets = readDocumentJson(root, name, errors);
      if (assets !== READ_FAILED) validateAssetRegister(assets, root, errors, blockers);
    }
    if (name === "qa-plan.md") {
      const qa = readMarkdown(root, name, errors);
      if (qa !== null) validateMarkdown(qa, name, ["测试范围", "Studio 检查", "设备与输入覆盖", "人工视觉验收"], errors, blockers);
    }
    if (name === "release-checklist.md") {
      const release = readMarkdown(root, name, errors);
      if (release !== null) validateMarkdown(release, name, ["目标身份", "保存与发布授权", "发布前检查", "回滚与后续观察"], errors, blockers);
    }
  }

  const valid = errors.length === 0;
  return { valid, ready: valid && blockers.length === 0 && profile?.status === "ready", errors, blockers, notices };
}
