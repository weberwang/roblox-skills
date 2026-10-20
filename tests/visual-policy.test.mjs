import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  checkProgrammaticTextPolicy, getVisualValidationMode, PROGRAMMATIC_TEXT_LANGUAGES,
} from "../roblox-game-workflow-control/scripts/runtime/visual-policy.mjs";
import { inProject } from "./helpers.mjs";

/** 为视觉政策检查建立不会吞掉结构错误的本地上下文。 */
function context(repo) {
  const errors = [];
  const blockers = [];
  return { repo, errors, blockers, require: (condition, message) => { if (!condition) errors.push(message); } };
}

test("未启用程序化文本时只要求完整的关闭结构，不强制五语", () => inProject((root) => {
  const checked = context(root);
  checkProgrammaticTextPolicy({ programmaticText: {
    enabled: false, requiredLanguages: [], wrap: {}, truncatePolicy: "forbid", displayFitEvidenceRefs: {},
  } }, checked);
  assert.deepEqual(checked.errors, []);
}));

test("启用程序化文本时强制五语、逐语换行方式和真实适配文件", () => inProject((root) => {
  mkdirSync(join(root, "evidence"), { recursive: true });
  const displayFitEvidenceRefs = {};
  const wrap = {};
  for (const [index, language] of PROGRAMMATIC_TEXT_LANGUAGES.entries()) {
    const path = `evidence/display-fit-${language}.txt`;
    writeFileSync(join(root, path), `适配 ${language}\n`);
    displayFitEvidenceRefs[language] = path;
    wrap[language] = index === 0 ? "single-line" : "wrap";
  }
  const checked = context(root);
  checkProgrammaticTextPolicy({ locales: [...PROGRAMMATIC_TEXT_LANGUAGES], programmaticText: {
    enabled: true, requiredLanguages: [...PROGRAMMATIC_TEXT_LANGUAGES], wrap,
    truncatePolicy: "forbid", displayFitEvidenceRefs,
  } }, checked);
  assert.deepEqual(checked.errors, []);

  const incomplete = context(root);
  checkProgrammaticTextPolicy({ locales: ["zh-CN"], programmaticText: {
    enabled: true, requiredLanguages: ["en"], wrap: { en: "other" },
    truncatePolicy: "allow", displayFitEvidenceRefs: { en: "../outside.txt" },
  } }, incomplete);
  assert.ok(incomplete.errors.some((entry) => entry.includes("必须包含 zh-CN")));
  assert.ok(incomplete.errors.some((entry) => entry.includes("en 也必须列入视觉合同 locales")));
  assert.ok(incomplete.errors.some((entry) => entry.includes("single-line 或 wrap")));
  assert.ok(incomplete.errors.some((entry) => entry.includes("truncatePolicy 必须为 forbid")));
  assert.ok(incomplete.errors.some((entry) => entry.includes("路径无效")));
}));

test("程序化文本合同缺对象时报结构错误，验证模式默认 usability 并拒绝拼错值", () => inProject((root) => {
  const missing = context(root);
  checkProgrammaticTextPolicy({}, missing);
  assert.ok(missing.errors.some((entry) => entry.includes("缺少 programmaticText 对象")));

  const defaults = context(root);
  assert.equal(getVisualValidationMode({}, defaults), "usability");
  assert.deepEqual(defaults.errors, []);

  const exact = context(root);
  assert.equal(getVisualValidationMode({ visualValidation: { mode: "exact" } }, exact), "exact");

  const typo = context(root);
  assert.equal(getVisualValidationMode({ visualValidation: { mode: "usabilty" } }, typo), "usability");
  assert.ok(typo.errors.some((entry) => entry.includes("只能是 usability 或 exact")));
}));
