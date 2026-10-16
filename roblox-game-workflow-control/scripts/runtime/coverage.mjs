/** 可见 Play 的视口、输入、语言与情景必须对应获批合同中的单个用例。 */
export function checkCoverage(item, contract, usable, context, scenarios) {
  const { require, blockers } = context;
  const declared = contract?.coverage;
  require(declared && Number.isSafeInteger(declared.revision) && declared.revision > 0
    && typeof declared.userMessageRef === "string" && !!declared.userMessageRef.trim()
    && Array.isArray(declared.cases) && declared.cases.length > 0,
  "视觉合同必须提供有修订号、批准来源和用例的 coverage");

  const viewports = new Map((Array.isArray(contract?.viewports) ? contract.viewports : [])
    .filter((viewport) => typeof viewport?.id === "string").map((viewport) => [viewport.id, viewport]));
  const cases = new Map();
  const validCases = new Map();
  const declaredCases = Array.isArray(declared?.cases) ? declared.cases : [];
  for (const testCase of declaredCases) {
    if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) {
      require(false, "coverage 用例必须是对象");
      continue;
    }
    let valid = true;
    /** 记录该用例的结构错误，并阻止错误用例参与覆盖统计。 */
    const check = (condition, message) => {
      require(condition, message);
      if (!condition) valid = false;
    };
    check(typeof testCase.id === "string" && !!testCase.id.trim() && !cases.has(testCase.id), "coverage 用例必须有唯一 id");
    if (typeof testCase.id === "string" && testCase.id.trim() && !cases.has(testCase.id)) cases.set(testCase.id, testCase);
    const viewport = viewports.get(testCase.viewportId);
    check(matchesViewportOrientation(viewport), `coverage 用例引用的视口尺寸与方向不匹配：${testCase.id}`);
    check(Array.isArray(contract?.inputs) && contract.inputs.includes(testCase.input), `coverage 用例输入方式未在视觉合同声明：${testCase.id}`);
    check(Array.isArray(contract?.locales) && contract.locales.includes(testCase.locale), `coverage 用例语言未在视觉合同声明：${testCase.id}`);
    check(scenarios.has(testCase.scenario), `coverage 用例情景未声明：${testCase.id}`);
    check(scenarios.get(testCase.scenario)?.required === true, `不适用情景不得建立 coverage 用例：${testCase.id}`);
    if (valid) validCases.set(testCase.id, { ...testCase, viewport });
  }

  // 已声明的每个目标维度都要进入明确批准的用例清单，避免遗漏一类设备或语言。
  for (const viewport of Array.isArray(contract?.viewports) ? contract.viewports : []) {
    if (!declaredCases.some((testCase) => testCase?.viewportId === viewport?.id)) blockers.push(`coverage 缺少视口用例：${viewport?.id}`);
  }
  for (const input of Array.isArray(contract?.inputs) ? contract.inputs : []) {
    if (!declaredCases.some((testCase) => testCase?.input === input)) blockers.push(`coverage 缺少输入方式用例：${input}`);
  }
  for (const locale of Array.isArray(contract?.locales) ? contract.locales : []) {
    if (!declaredCases.some((testCase) => testCase?.locale === locale)) blockers.push(`coverage 缺少语言用例：${locale}`);
  }
  for (const orientation of Array.isArray(contract?.orientations) ? contract.orientations : []) {
    const hasViewport = [...viewports.values()].some((viewport) => viewport.orientation === orientation && matchesViewportOrientation(viewport));
    const hasCase = [...validCases.values()].some((testCase) => testCase.viewport.orientation === orientation);
    if (!hasViewport || !hasCase) blockers.push(`coverage 缺少方向 ${orientation} 的有效视口或用例`);
  }
  for (const [scenarioId, scenario] of scenarios) {
    if (scenario?.required === true && !declaredCases.some((testCase) => testCase?.scenario === scenarioId)) {
      blockers.push(`coverage 缺少必需情景用例：${scenarioId}`);
    }
  }

  const evidenceCases = new Map();
  const playEntries = Array.isArray(item.evidence) ? item.evidence.filter((entry) => entry?.type === "play" && entry.candidate === item.candidate) : [];
  for (const entry of playEntries) {
    if (!Object.hasOwn(entry, "coverage")) continue;
    const measurement = entry.coverage;
    let valid = true;
    /** 只有所有测量身份字段正确时，证据才会加入可用覆盖映射。 */
    const check = (condition, message) => {
      require(condition, message);
      if (!condition) valid = false;
    };
    check(measurement && typeof measurement === "object" && !Array.isArray(measurement), `Play 覆盖测量格式不合法：${entry.id}`);
    if (!measurement || typeof measurement !== "object" || Array.isArray(measurement)) continue;
    const testCase = validCases.get(measurement.caseId);
    check(Number.isSafeInteger(measurement.revision) && measurement.revision === declared?.revision, `Play 覆盖修订与当前批准合同不匹配：${entry.id}`);
    check(!!testCase, `Play 覆盖引用未知或无效用例：${entry.id}`);
    if (!testCase) continue;
    check(measurement.viewportId === testCase.viewportId && measurement.width === testCase.viewport.width
      && measurement.height === testCase.viewport.height, `Play 覆盖视口身份或测量尺寸不匹配：${entry.id}`);
    check(measurement.input === testCase.input && measurement.locale === testCase.locale
      && measurement.scenario === testCase.scenario, `Play 覆盖维度与批准用例不匹配：${entry.id}`);
    // 视口表现只能由 Client 侧实际呈现结果覆盖，Server 状态无法证明客户端布局。
    check(entry.datamodel === "Client", `可见 Play 覆盖必须来自 Client：${entry.id}`);
    if (valid && usable.get(entry.id) === entry) evidenceCases.set(entry.id, testCase);
  }

  for (const [caseId] of validCases) {
    if (![...evidenceCases.values()].some((testCase) => testCase.id === caseId)) blockers.push(`coverage 用例缺少当前 PASS Client Play：${caseId}`);
  }

  for (const [scenarioId, scenario] of scenarios) {
    if (scenario?.required !== true) continue;
    for (const evidenceId of Array.isArray(scenario.evidenceIds) ? scenario.evidenceIds : []) {
      const testCase = evidenceCases.get(evidenceId);
      if (!testCase || testCase.scenario !== scenarioId) {
        require(false, `情景 ${scenarioId} 引用的 Play 未通过同情景 coverage：${evidenceId}`);
      }
    }
  }
}

/** 校验目标尺寸与方向一致；正方形尺寸可按项目声明用于任一方向。 */
function matchesViewportOrientation(viewport) {
  if (!viewport || !Number.isSafeInteger(viewport.width) || viewport.width <= 0
      || !Number.isSafeInteger(viewport.height) || viewport.height <= 0) return false;
  if (viewport.orientation === "portrait") return viewport.height >= viewport.width;
  if (viewport.orientation === "landscape") return viewport.width >= viewport.height;
  return false;
}
