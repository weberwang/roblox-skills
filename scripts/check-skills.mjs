import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { SKILLS } from "./catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 检查交付文件规模、文档引用与 Node 语法，不加载脚本业务或连接 Studio。 */
function checkFile(path) {
  if (!/\.(md|mjs|luau)$/.test(path)) return;
  const content = readFileSync(path, "utf8");
  if (content.split("\n").length > 1000) throw new Error(`文件超过 1000 行：${path}`);
  if (path.endsWith(".mjs")) execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
  if (!path.endsWith(".md")) return;
  if (/\[TODO:|A brief description|First step/.test(content)) throw new Error(`残留模板：${path}`);
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const link = match[1].split("#")[0];
    if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
    if (!existsSync(resolve(dirname(path), link))) throw new Error(`断链：${path} → ${link}`);
  }
}

/** 只遍历受维护的交付目录，避免扫描依赖、缓存或测试产物。 */
function checkTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkTree(path);
    else checkFile(path);
  }
}

for (const name of SKILLS) {
  const directory = join(root, name);
  const content = readFileSync(join(directory, "SKILL.md"), "utf8");
  if (!content.startsWith(`---\nname: ${name}\n`) || !/^description: .+$/m.test(content)) throw new Error(`技能元数据错误：${name}`);
  const metadata = readFileSync(join(directory, "agents", "openai.yaml"), "utf8");
  if (!metadata.includes(`$${name}`)) throw new Error(`缺少调用示例：${name}`);
  checkTree(directory);
}
for (const directory of ["scripts", "docs"]) checkTree(join(root, directory));
if (existsSync(join(root, "tests"))) checkTree(join(root, "tests"));
checkFile(join(root, "README.md"));
console.log(`检查通过：${SKILLS.length} 个技能，元数据、文档引用、模板残留、文件规模和 Node 语法检查通过。`);
