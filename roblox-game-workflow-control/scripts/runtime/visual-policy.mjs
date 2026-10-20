import { statSync } from "node:fs";
import { projectPath } from "./io.mjs";

/** 开启程序化文本策略时必须声明的五种语言。 */
export const PROGRAMMATIC_TEXT_LANGUAGES = Object.freeze(["en", "zh-CN", "ja", "ru", "es"]);

const TEXT_WRAP_MODES = new Set(["single-line", "wrap"]);

/** 获取视觉验证模式；缺省为 usability，拼错的显式值会形成结构错误。 */
export function getVisualValidationMode(contract, context) {
  const policy = contract?.visualValidation;
  if (policy === undefined) return "usability";
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    context.require(false, "visualValidation 必须为对象");
    return "usability";
  }
  if (policy.mode === undefined) return "usability";
  if (!["usability", "exact"].includes(policy.mode)) {
    context.require(false, "visualValidation.mode 只能是 usability 或 exact");
    return "usability";
  }
  return policy.mode;
}

/** 校验程序化文字的语言、换行策略和真实适配证据，不自动分析显示像素。 */
export function checkProgrammaticTextPolicy(contract, context) {
  const policy = contract?.programmaticText;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    context.require(false, "视觉合同缺少 programmaticText 对象");
    return;
  }

  context.require(typeof policy.enabled === "boolean", "programmaticText.enabled 必须为布尔值");
  context.require(Array.isArray(policy.requiredLanguages), "programmaticText.requiredLanguages 必须为数组");
  context.require(policy.wrap && typeof policy.wrap === "object" && !Array.isArray(policy.wrap),
    "programmaticText.wrap 必须是按语言声明的对象");
  context.require(policy.truncatePolicy === "forbid", "programmaticText.truncatePolicy 必须为 forbid");
  context.require(policy.displayFitEvidenceRefs && typeof policy.displayFitEvidenceRefs === "object"
    && !Array.isArray(policy.displayFitEvidenceRefs), "programmaticText.displayFitEvidenceRefs 必须是按语言声明的对象");

  const languages = Array.isArray(policy.requiredLanguages) ? policy.requiredLanguages : [];
  const seen = new Set();
  for (const language of languages) {
    context.require(typeof language === "string" && !!language.trim(), "requiredLanguages 中的语言必须为非空字符串");
    if (typeof language !== "string" || !language.trim()) continue;
    context.require(!seen.has(language), `requiredLanguages 包含重复语言：${language}`);
    seen.add(language);
  }

  const wrap = policy.wrap && typeof policy.wrap === "object" && !Array.isArray(policy.wrap) ? policy.wrap : {};
  for (const [language, mode] of Object.entries(wrap)) {
    context.require(TEXT_WRAP_MODES.has(mode), `programmaticText.wrap.${language} 必须为 single-line 或 wrap`);
  }

  const evidenceRefs = policy.displayFitEvidenceRefs && typeof policy.displayFitEvidenceRefs === "object"
    && !Array.isArray(policy.displayFitEvidenceRefs) ? policy.displayFitEvidenceRefs : {};
  for (const [language, reference] of Object.entries(evidenceRefs)) {
    context.require(typeof reference === "string", `programmaticText.displayFitEvidenceRefs.${language} 必须为项目内文件路径`);
  }

  if (policy.enabled !== true) return;

  const targetLocales = new Set(Array.isArray(contract?.locales) ? contract.locales : []);
  for (const language of PROGRAMMATIC_TEXT_LANGUAGES) {
    context.require(seen.has(language), `启用程序化文本时 requiredLanguages 必须包含 ${language}`);
  }
  for (const language of languages) {
    if (typeof language !== "string" || !language.trim()) continue;
    context.require(targetLocales.has(language), `启用程序化文本时 ${language} 也必须列入视觉合同 locales`);
    context.require(TEXT_WRAP_MODES.has(wrap[language]), `启用程序化文本时必须为 ${language} 声明 single-line 或 wrap`);
    requireDisplayEvidence(evidenceRefs[language], language, context);
  }
}

/** 适配证据需是项目内非空文件；路径边界同时拒绝链接和目录穿越。 */
function requireDisplayEvidence(reference, language, context) {
  if (typeof reference !== "string" || !reference.trim()) {
    context.require(false, `启用程序化文本时必须为 ${language} 提供 displayFitEvidenceRefs`);
    return;
  }
  try {
    const info = statSync(projectPath(context.repo, reference));
    context.require(info.isFile() && info.size > 0, `${language} 适配证据必须是项目内非空文件`);
  } catch (error) {
    context.require(false, `${language} 适配证据路径无效：${error instanceof Error ? error.message : String(error)}`);
  }
}
