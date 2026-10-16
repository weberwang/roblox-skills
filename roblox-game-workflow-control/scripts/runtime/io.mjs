import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

/** 检查整条现存路径，拒绝符号链接与 Windows 目录联接。 */
export function assertNoLinks(path) {
  const parent = dirname(path);
  if (parent !== path) assertNoLinks(parent);
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`拒绝链接路径：${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

/** 将记录限制在显式项目内；相对路径不能借助盘符、父级或联接越界。 */
export function projectPath(repo, localPath) {
  if (typeof localPath !== "string" || !localPath.trim() || isAbsolute(localPath) || /^[a-z]:/i.test(localPath)
      || localPath.startsWith("\\") || localPath.split(/[\\/]/).includes("..")) {
    throw new Error(`需要项目内相对路径：${localPath}`);
  }
  assertNoLinks(resolve(repo));
  const root = realpathSync(repo);
  const path = resolve(root, localPath);
  const rel = relative(root, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`路径超出项目：${localPath}`);
  assertNoLinks(path);
  return path;
}

/** 排他创建文本；磁盘写满等中途失败时只清理本次新文件，已有文件永不覆盖。 */
export function writeNewText(repo, localPath, text) {
  const path = projectPath(repo, localPath);
  mkdirSync(dirname(path), { recursive: true });
  let descriptor;
  let created = false;
  try {
    descriptor = openSync(path, "wx");
    created = true;
    writeFileSync(descriptor, text, { encoding: "utf8" });
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* 保留原始写入或关闭错误，随后尝试清理本次文件。 */ }
    }
    if (created) {
      try { unlinkSync(path); } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") throw new AggregateError([error, cleanupError], `新文件写入失败且无法清理：${path}`);
      }
    }
    throw error;
  }
  return path;
}

/** 在创建文件前完成 JSON 序列化，不为无效值或循环对象留下空记录。 */
export function writeNewJson(repo, localPath, value) {
  const content = JSON.stringify(value, null, 2);
  if (content === undefined) throw new Error("JSON 记录不能是 undefined");
  return writeNewText(repo, localPath, `${content}\n`);
}

/** 读取项目内 JSON，保持所有写入和证据读取使用相同路径边界。 */
export function readJson(repo, localPath) {
  return JSON.parse(readFileSync(projectPath(repo, localPath), "utf8"));
}
