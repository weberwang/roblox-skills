import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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

/** 单写者以原文比对和同目录原子替换保存推进结果，失败不留下半份工作项。 */
export function replaceJson(repo, localPath, expectedText, value) {
  if (typeof expectedText !== "string") throw new Error("替换记录必须提供读取时的原文");
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) throw new Error("JSON 记录不能是 undefined");
  const target = projectPath(repo, localPath);
  const temporary = projectPath(repo, `${localPath}.${randomUUID()}.tmp`);
  const lock = projectPath(repo, `${localPath}.lock`);
  let lockDescriptor;
  let descriptor;
  let created = false;
  try {
    lockDescriptor = openSync(lock, "wx");
    if (readFileSync(target, "utf8") !== expectedText) throw new Error("工作项已变化，请重新读取后再推进");
    descriptor = openSync(temporary, "wx");
    created = true;
    writeFileSync(descriptor, `${serialized}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    // 在替换前再次核对外部编辑，保留并发写者已经保存的内容。
    if (readFileSync(projectPath(repo, localPath), "utf8") !== expectedText) throw new Error("工作项已变化，拒绝覆盖外部编辑");
    renameSync(temporary, target);
    created = false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created) unlinkSync(temporary);
    if (lockDescriptor !== undefined) { closeSync(lockDescriptor); unlinkSync(lock); }
  }
  return target;
}
