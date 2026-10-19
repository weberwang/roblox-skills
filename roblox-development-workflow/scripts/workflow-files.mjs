#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { addOptionalProjectDocs, checkProjectDocs, initializeProjectDocs } from "./runtime/project-artifacts.mjs";
import { checkProjectLayout, initializeProjectLayout } from "./runtime/project-layout.mjs";

/** 解析严格的 `--名称 值` 参数，避免拼写错误被静默忽略。 */
function parseOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) throw new Error(`不支持位置参数：${token}`);
    const name = token.slice(2);
    if (options.has(name)) throw new Error(`参数重复：--${name}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options.set(name, true);
      continue;
    }
    options.set(name, value);
    index += 1;
  }
  return options;
}

/** 校验子命令允许的选项，拒绝未支持的覆盖开关。 */
function rejectUnknownOptions(options, allowed) {
  const unknown = [...options.keys()].filter((name) => !allowed.includes(name));
  if (unknown.length > 0) throw new Error(`未知参数：${unknown.map((name) => `--${name}`).join("、")}`);
}

/** 读取必填选项并返回其字符串值。 */
function requireOption(options, name) {
  const value = options.get(name);
  if (typeof value !== "string" || value.length === 0) throw new Error(`缺少参数：--${name}`);
  return value;
}

/** 将可选逗号列表交给运行时验证，默认不启用可选文档。 */
function selectedIncludes(options) {
  const raw = options.get("include");
  if (raw === undefined) return [];
  if (typeof raw !== "string") throw new Error("参数缺少值：--include");
  const values = raw.split(",").map((value) => value.trim());
  if (values.some((value) => value.length === 0)) throw new Error("--include 需要逗号分隔的非空名称。");
  return [...new Set(values)];
}

/** 分派目录和文档工具命令；每个子命令只接受明确定义的选项。 */
export function main(args = process.argv.slice(2)) {
  const command = args[0];
  const options = parseOptions(args.slice(1));
  if (command === "init-layout") {
    rejectUnknownOptions(options, ["repo"]);
    return initializeProjectLayout({ repo: requireOption(options, "repo") }).join("\n");
  }
  if (command === "check-layout") {
    rejectUnknownOptions(options, ["repo"]);
    return checkProjectLayout({ repo: requireOption(options, "repo") });
  }
  if (command === "init-docs") {
    rejectUnknownOptions(options, ["repo", "project-id", "include"]);
    const paths = initializeProjectDocs({
      repo: requireOption(options, "repo"),
      projectId: requireOption(options, "project-id"),
      include: selectedIncludes(options),
    });
    return paths.join("\n");
  }
  if (command === "add-docs") {
    rejectUnknownOptions(options, ["repo", "project-id", "include"]);
    const paths = addOptionalProjectDocs({
      repo: requireOption(options, "repo"),
      projectId: requireOption(options, "project-id"),
      include: selectedIncludes(options),
    });
    return paths.join("\n");
  }
  if (command === "check-docs") {
    rejectUnknownOptions(options, ["repo", "include"]);
    return checkProjectDocs({ repo: requireOption(options, "repo"), include: selectedIncludes(options) });
  }
  throw new Error("用法：workflow-files.mjs <init-layout|check-layout|init-docs|add-docs|check-docs> --repo <项目路径> [--project-id <小写ID>] [--include visual,assets,qa,release]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = main();
    if (typeof result === "string") console.log(result);
    else {
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid || !result.ready) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`文件工具失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
