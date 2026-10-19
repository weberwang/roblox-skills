import { lstatSync, mkdirSync, rmdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertNoLinks, projectPath } from "../../../roblox-game-workflow-control/scripts/runtime/io.mjs";

const PROJECT_DIRECTORIES = Object.freeze([
  "docs",
  ".tmp",
  "artifacts",
  "artifacts/candidates",
  "artifacts/approved",
  "assets",
  ".workflow-control",
  ".workflow-control/work-items",
  ".workflow-control/records",
  ".workflow-control/evidence",
  ".workflow-control/archive",
]);

/** 确认目标是已存在的非根项目目录，并拒绝根路径链路中的符号链接或联接。 */
function validateProjectRoot(input) {
  if (typeof input !== "string" || input.trim().length === 0) throw new Error("项目根目录必须是非空路径。");
  const root = resolve(input);
  if (dirname(root) === root) throw new Error("项目根目录不能是文件系统根目录。");
  assertNoLinks(root);

  let info;
  try {
    info = lstatSync(root);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`项目根目录不存在：${root}`);
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error(`拒绝链接路径：${root}`);
  if (!info.isDirectory()) throw new Error(`项目根目录不是目录：${root}`);
  return root;
}

/** 预检全部约定路径，确保任何写入前都发现文件冲突和链接边界问题。 */
function preflightDirectories(root) {
  return PROJECT_DIRECTORIES.map((localPath) => {
    const path = projectPath(root, localPath);
    try {
      const info = lstatSync(path);
      if (info.isSymbolicLink()) throw new Error(`拒绝链接路径：${path}`);
      if (!info.isDirectory()) throw new Error(`约定目录路径已存在但不是目录：${localPath}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return { localPath, path };
  });
}

/** 仅回滚本次创建且仍为空的目录；不递归删除，也不触碰已有内容。 */
function rollbackCreatedDirectories(root, created) {
  let firstUnexpectedError;
  for (const localPath of [...created].reverse()) {
    try {
      rmdirSync(projectPath(root, localPath));
    } catch (error) {
      if (! ["ENOENT", "ENOTEMPTY"].includes(error.code)) firstUnexpectedError ??= error;
    }
  }
  if (firstUnexpectedError) throw firstUnexpectedError;
}

/** 初始化约定目录；预检后逐级创建，幂等返回本次实际新建的项目内路径。 */
export function initializeProjectLayout({ repo }) {
  const root = validateProjectRoot(repo);
  const targets = preflightDirectories(root);
  const created = [];

  try {
    for (const { localPath } of targets) {
      // 每次创建前再次检查整条路径，避免写入时跟随已被替换成链接的父级。
      const path = projectPath(root, localPath);
      try {
        const info = lstatSync(path);
        if (info.isSymbolicLink()) throw new Error(`拒绝链接路径：${path}`);
        if (!info.isDirectory()) throw new Error(`约定目录路径已存在但不是目录：${localPath}`);
        continue;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

      mkdirSync(path);
      created.push(localPath);
    }
  } catch (error) {
    try {
      rollbackCreatedDirectories(root, created);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "目录初始化失败，且部分空目录无法回滚。");
    }
    throw error;
  }

  return created;
}

/** 只检查目录和路径边界，不读取目录内容或推断资源确认、许可及游戏验收状态。 */
export function checkProjectLayout({ repo }) {
  const errors = [];
  const blockers = [];
  const notices = [
    "本检查只验证约定目录和路径边界，不扫描目录内容。",
    "目录存在不代表产物已确认、资源许可已通过或游戏验收已完成。",
  ];

  let root;
  try {
    root = validateProjectRoot(repo);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { valid: false, ready: false, errors, blockers, notices };
  }

  for (const localPath of PROJECT_DIRECTORIES) {
    try {
      const path = projectPath(root, localPath);
      let info;
      try {
        info = lstatSync(path);
      } catch (error) {
        if (error.code === "ENOENT") {
          blockers.push(`缺少约定目录：${localPath}`);
          continue;
        }
        throw error;
      }
      if (info.isSymbolicLink()) errors.push(`拒绝链接路径：${localPath}`);
      else if (!info.isDirectory()) errors.push(`约定目录路径已存在但不是目录：${localPath}`);
    } catch (error) {
      errors.push(`目录路径无效（${localPath}）：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { valid: errors.length === 0, ready: errors.length === 0 && blockers.length === 0, errors, blockers, notices };
}
