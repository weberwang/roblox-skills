# 可见 Play 覆盖合同

`SCENE` 和 `DISPLAY_LAYER` 的视觉合同仍使用 `version: 1`，并增加必填的 `coverage`：

```json
{
  "coverage": {
    "revision": 1,
    "userMessageRef": "用户批准覆盖范围的真实消息引用",
    "cases": [
      { "id": "desktop-normal", "viewportId": "desktop", "input": "keyboard-mouse", "locale": "zh-CN", "scenario": "normal-play" }
    ]
  }
}
```

`visualValidation.mode` 默认 `usability`。此模式的用例清单是用户批准的代表性组合；只要求覆盖所有声明方向和必需情景，不要求每个备选视口、输入方式、语言都出现，也不要求所有维度做笛卡尔积。明确选择 `exact` 时，必须为所有已声明视口 × 输入方式 × 语言 × 必需情景组合分别建立批准用例，并为每条用例提供匹配的当前 Client PASS Play 证据。不适用情景不得建立用例。`id` 在合同内唯一，修订号为正整数，`userMessageRef` 指向真实批准来源。

`exact` 表示覆盖所有声明组合并按视觉合同核查声明目标，不表示像素差异比较或存在自动视觉分析引擎。截图显示效果仍由用户人工检查，视觉结论继续绑定真实人工判断；安全、身份、必需情景与最终人工门在两种模式下都保留。

每个声明的方向至少对应一个有有效用例的视口。横屏要求宽度不小于高度，竖屏要求高度不小于宽度；正方形可按实际合同声明为任一方向。只给横屏用例和证据不能同时宣称竖屏覆盖通过。

当前候选的每条可见 Play 证据最多覆盖一条用例，并记录实际测量身份：

```json
{
  "coverage": {
    "revision": 1,
    "caseId": "desktop-normal",
    "viewportId": "desktop",
    "width": 1280,
    "height": 720,
    "input": "keyboard-mouse",
    "locale": "zh-CN",
    "scenario": "normal-play"
  }
}
```

修订号、用例 ID、视口身份与尺寸、输入方式、语言、情景都必须精确匹配当前批准清单；证据必须来自 Client，且属于当前候选的有效 PASS。一个宽泛 Play 不能代替多个用例。技术覆盖只写入 `visualReview.scenarios[].technical`，不会自动生成视觉质量或情景结论：

```json
{
  "id": "normal-play",
  "required": true,
  "reason": "基础游玩流程始终需要覆盖",
  "technical": { "result": "PASS", "evidenceIds": ["play-desktop-normal"] },
  "visual": {
    "result": "NOT_RUN",
    "evidenceIds": [],
    "userMessageRef": "",
    "reason": "尚无当前候选的人工判断"
  }
}
```

对适用情景，`technical.result: PASS` 必须引用同一情景、当前候选且匹配批准用例的 Play 证据。`visual.result: PASS` 或 `FAIL` 则必须独立引用当前候选的 `visual` 证据和针对该情景的真实 `userMessageRef`；Play、探针、布局参数与日志都不能替代人工视觉结论。尚未完成用户检查时，视觉质量维度和情景维度保持 `NOT_RUN`，因此可记录技术通过，但工作项仍不能报告人工显示验收通过。非适用情景的技术和视觉结果都应为 `NOT_APPLICABLE`，并且不引用证据；新模板将其他情景的适用性设为待确认，完成合同前需明确选择。

旧的 `scenarios[].result` 与 `scenarios[].evidenceIds` 混合字段不再接受，避免 Play 结果被误读为人工体验判断。未知用例、过期修订或测量维度冲突都会使检查失败；遗漏任一用例也会阻断完成。

此校验只核对记录与覆盖关系，不打开或分析截图，也不替用户作视觉结论。截图的显示效果仍由用户人工检查并确认。
