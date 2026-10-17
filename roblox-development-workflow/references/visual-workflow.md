# Roblox 视觉工作流

本流程把视觉定义、资产接入和运行体验纳入现有 Work Item 与 V0–V4 `stageReviews`。新可见工作项从 V0 开始，按[阶段契约](../../roblox-game-workflow-control/references/stage-contract.md)完成并展示当前交付、核对退出条件后再单步推进。`deliverables` 可以连续完成这些步骤；`manual` 还需逐阶段真实确认。两种策略都不能跳阶段，也不另造状态机。先读取[Studio 插件路由](studio-plugin-routing.md)、[响应式 UI 合同](responsive-ui-contract.md)和[共享资源登记与使用](shared-asset-usage.md)。

| 阶段 | 必须实际完成的内容 |
| --- | --- |
| V0 | 对象身份、目标、范围、宿主、依赖、已有资源与未知项。 |
| V1 | 玩家流程、状态、信息层级、布局目标、视觉参考与验收范围。 |
| V2 | 实例结构、组件职责、数据接口、资源消费、所有权和验证计划。 |
| V3 | 实际 Edit 组合、引用接线、正式源回读和可查看交付。 |
| V4 | 运行接入、输入与生命周期、日志、动态技术覆盖及人工显示验收。 |

V0–V3 不能由同一份运行报告批量补齐。多个阶段可以引用同一 Markdown 文档，但分别定位独立标题下的交付正文，并记录对应退出依据和展示来源。已有成果可复用，需注明来源、适用范围及当前仍需完成的内容；只批准全局 R1 等视觉方向不表示本场景、弹窗或界面已验收。每次汇报说明当前阶段、实际交付、完成依据、剩余问题和下一步。

## 视觉基线与需求

1. 读取现有 Visual Bible 和本工作项目标。确实没有可复用基线时，记录主题、目标受众、核心玩法循环、玩家需要读懂的信息、观看场景、舒适度限制、目标设备预算、允许复用的来源及禁用项；沿用已有有效方向，不为填表重做候选图。
2. 把开发说明与玩家看到的内容分开。只在玩家实际需要图标、纹理、插画或其他位图时生成/编辑位图，并交由 `image_generator` 处理；工作流文档、脚本或结构化 UI 不因此触发生图。概念图说明目标，不证明正式资源已生成、已获授权或已接入。
3. 视觉方向发生实质变化时，只重验受影响的资产、界面和运行场景；没有变化时不因文件内容或合同版本变化而重做已完成的人工确认。

## 可见工作项合同

为包含玩家可见界面或场景表现的 Work Item，在项目控制记录中由 `visualContractRef` 指向版本化 JSON。该 JSON 与艺术接受结果分开存放，用于声明实现目标和验证范围。字段必须与项目工作流控制约定一致：

- 顶层含 `version: 1`、`workItemId`、`orientations`、`inputs`、`locales`、`viewports`、`safeAreaPolicy`、`nodes`、`coverage`。
- `orientations` 只列实际目标 `landscape` / `portrait`；`inputs` 只列实际支持的 `touch` / `keyboard-mouse` / `gamepad`；`locales` 只列本项目真实目标语言，不自动套用其他引擎的固定语言集。
- `viewports` 中每项含稳定 `id`、正整数 `width` / `height` 和 `orientation`；尺寸来自实际目标设备或项目约定，不从一张概念图推算。
- `safeAreaPolicy` 是描述当前界面采用的 Roblox 屏幕边界策略的非空字符串。应记录实际 `ScreenGui.ScreenInsets` 等生效设置及背景层处理；不得把它写成文件路径或未经证实的数值。
- `nodes` 每项含稳定 `id`、`path`、`parentId`、`role`、`layoutRef`。`path` 是完整 `game.` 实例路径；`parentId` 为 `null` 或另一节点的 `id`；`layoutRef` 是非空、描述真实布局参照的文字，不是文件路径。
- 父子引用必须完整且无环。父节点必须承担真实的布局、状态或行为职责；不能只为视觉分组建立无依赖的虚假父子关系。实现后回读 Studio 实例路径核对目标节点。
- `coverage` 按[覆盖合同](../../roblox-game-workflow-control/references/coverage-contract.md)保留批准修订、真实确认来源与用例列表。每行绑定一个视口/输入/语言/情景组合，Client Play 精确测量后逐行取证；一份泛用日志不能覆盖多个用例。

视觉工作项还应有一份可复用的简短 brief：主题、受众、玩法信息层级、关键事件反馈意图、舒适度限制、参考来源和资源预算。brief 是内部规格，不得直接当作玩家文案绘入界面。细化布局时以[响应式 UI 合同](responsive-ui-contract.md)描述实际层级、参照、安全区、输入、本地化与视口矩阵。

## Studio 能力边界与实现顺序

1. 先用 `list_roblox_studios` 选定实例；`get_studio_state` 只核实运行模式和可用 DataModel，不返回 Place 身份。通过[项目发现探针](studio-probes.md)只读回读真实 Place/Universe 身份，再用 `search_game_tree`、`inspect_instance` 和脚本只读工具核实现有界面/资源及目标路径；不要把模式当 Place ID，也不要从截图猜路径。
2. 先查项目的 `docs/asset-register.json` 和实际 DataModel。对候选资源核对来源、许可、实际消费者和预算，再按[共享资源流程](shared-asset-usage.md)决定复用或生产。
3. 按实际需求选择原生 UI、程序化几何、AI 网格、材质、贴图或外部/人工制作为正式生产路线。工具生成结果先回读 Studio 对象、路径、属性和引用；不得因任务返回成功就跳过源资产、许可、结构、性能与运行消费者检查。
4. 以 `multi_edit` 修改脚本，以经核实的 `execute_luau` 修改实例属性；每次写入后回读结果和 Console。`screen_capture` 当前工具契约只支持 Edit 画面，不能充当 Play 运行视觉证据。工具能力变化时按当前插件定义重新核实。
5. UI 结构、输入、复制状态、动画接线、资产消费和运行验证由对应技能共同完成；正式实现清理占位与残留对象后，再做当前 Work Item 的代表性运行验证。

Studio 插件能查树、读写脚本/实例、采集 Edit 截图、执行单客户端 Play 和特定生成工具；不能因此推断有自动视觉分析、通用录屏、专用完整 UI 布局验收、动画录制/导出或多客户端验收能力。仓库提供[有界只读 UI 布局探针](studio-probes.md)，可技术回读最多 128 个界面实例的 `AbsolutePosition`、`AbsoluteSize`、锚点、可见性、裁切及已读属性；属性不可读或扫描被截断时如实记录。探针不采图、不判定视觉质量，也不能覆盖完整布局/交互验收。未提供的运行证据保持 `NOT_RUN`，不得用静态树、生成预览或 Edit 截图替代。

## 人工视觉验收与证据

技术检查只验证结构、实例属性、资源引用、脚本行为、输入轨迹、日志和合同字段。截图交给用户人工查看；只有用户对实际画面的明确判断可以填写视觉质量结论。机器不得分析截图、猜测用户接受度，或因技术检查通过自动填入视觉 `PASS`。

`visualReview.qualityResults` 必须逐项记录 `themeFit`、`audienceFit`、`gameplayReadability`、`viewingComfort`、`artCompletion`；每项含 `status: PASS | FAIL | NOT_RUN`、`reason` 和 `userMessageRef`。尚无当前候选的用户视觉判断时保持 `NOT_RUN`、引用为空；人工 PASS/FAIL 必须指向真实判断。工程或布局参数通过不能替代这些字段。

`visualReview.scenarios` 必须记录四种体验情境，每项含 `id`、`required`、`reason`，并分别保存 `technical: {result,evidenceIds}` 与 `visual: {result,evidenceIds,userMessageRef,reason}`：

| `id` | 何时必需 | 需观察的玩家体验 |
| --- | --- | --- |
| `normal-play` | 总是必需 | 正常节奏的主要输入、状态变化、可读性与反馈。 |
| `repeated-feedback` | 高频或连续反馈适用时 | 重复时的疲劳、残留、堆积、输入受阻和恢复。 |
| `event-peak` | 单次高强度关键事件适用时 | 关键事件是否遮住必要信息，以及结束后的恢复。 |
| `overlap-peak` | 多类事件可同时发生时 | 叠加时的优先级、遮挡和辨认结果。 |

两类 `result` 各自取 `PASS`、`FAIL`、`NOT_RUN` 或 `NOT_APPLICABLE`。`normal-play` 始终必需；其他情境待判断时 `required: null`，确认不适用后才设 false，并将两类结果均设 NOT_APPLICABLE、说明理由。适用情境的技术 PASS 绑定同情景、当前用例的 Play；人工 PASS 另绑定当前候选的 visual 证据和真实用户消息。两种视口运行成功只能更新 technical，不能自动填 visual。旧的顶层 `scenario.result/evidenceIds` 不再使用。没有人工判断时 visual 保持 NOT_RUN，不能用 Edit 截图、探针或 Play 日志替代。

返修只重验受变更影响的维度和情境；视觉目标或运行行为变化时更新相应证据，失败时交回对应所有者修复。工具不支持目标视角的运行取证时，记录缺口并等待用户提供实际画面证据或保持未运行，不伪造证据。

历史失败、修复与复验保留原始记录及来源；不得将旧 FAIL 原地改成 PASS。发现批量阶段登记时，先保留原记录与已有代码/报告/截图，核实各阶段的实际交付，再恢复最早缺失阶段；无法确认的阶段写明尚需核实，不编造过去的时间或用户确认。与本次缺陷无关的已有效确认继续有效。
