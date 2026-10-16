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

用例清单是用户批准的实际组合，不要求把所有视口、输入、语言和情景做笛卡尔积。每条用例必须引用已声明的视口、输入方式、语言，以及必需的动态情景；每个已声明视口、输入方式、语言和必需情景至少出现在一条用例中。不适用情景不得建立用例。`id` 在合同内唯一，修订号为正整数，`userMessageRef` 指向真实批准来源。

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

修订号、用例 ID、视口身份与尺寸、输入方式、语言、情景都必须精确匹配当前批准清单；证据必须来自 Client，且属于当前候选的有效 PASS。一个宽泛 Play 不能代替多个用例。必需情景的 `visualReview.scenarios[].evidenceIds` 必须引用同一情景的有效覆盖证据。未知用例、过期修订或测量维度冲突都会使检查失败；遗漏任一用例也会阻断完成。

此校验只核对记录与覆盖关系，不打开或分析截图，也不替用户作视觉结论。截图的显示效果仍由用户人工检查并确认。
