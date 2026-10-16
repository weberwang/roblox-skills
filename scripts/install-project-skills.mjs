#!/usr/bin/env node
import { cpSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS } from "./catalog.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 逐级拒绝链接和非目录，避免复制越出用户指定的项目。 */
function assertDirectoryChain(path) {
  const parent = dirname(path);
  if (parent !== path) assertDirectoryChain(parent);
  let info;
  try { info = lstatSync(path); } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`路径不能是链接或普通文件：${path}`);
  }
}

/** 使用固定白名单安装；预检全部冲突后才开始复制，不覆盖项目已有技能。 */
export function installSkills(projectPath) {
  const project = resolve(projectPath);
  assertDirectoryChain(project);
  if (!existsSync(project) || dirname(project) === project) throw new Error("目标必须是已存在的项目目录，且不能是磁盘根目录。");
  const targetRoot = join(project, ".agents", "skills");
  assertDirectoryChain(targetRoot);
  for (const name of SKILLS) {
    const source = join(sourceRoot, name);
    if (!existsSync(join(source, "SKILL.md"))) throw new Error(`安装包缺少技能：${name}`);
    const rel = relative(source, targetRoot);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error("不能把技能安装到自身目录中。");
    try {
      lstatSync(join(targetRoot, name));
      throw new Error(`拒绝覆盖已有技能：${name}。请先核对已有内容。`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  mkdirSync(targetRoot, { recursive: true });
  for (const name of SKILLS) {
    cpSync(join(sourceRoot, name), join(targetRoot, name), { recursive: true, errorOnExist: true, force: false });
  }
  return SKILLS.map((name) => join(targetRoot, name));
}

/** 命令入口只安装本地技能，不连接 Studio 或启动任何服务。 */
function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("用法：roblox-skills [目标项目目录]\n默认安装到当前项目 .agents/skills；已有同名技能时拒绝覆盖。");
    return;
  }
  if (args.length > 1 || args.some((arg) => arg.startsWith("-"))) throw new Error("只接受一个目标项目目录或 --help。");
  console.log(installSkills(args[0] ?? process.cwd()).join("\n"));
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
