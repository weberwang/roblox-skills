# Roblox 响应式 UI 合同

本合同为玩家可见 UI 明确真实布局参照和已批准的测试矩阵，挂在对应 Work Item 的 `visualContractRef` 下，不复制 Unity CanvasScaler、TMP 字体图集或浏览器 DPR 路线。开始前核对[视觉工作流](visual-workflow.md)和 Studio 当前实例；仅声明并测试项目真实支持的方向、输入、语言与视口。

## 合同字段与节点树

`visualContractRef` 指向 JSON，字段为 `version: 1`、`workItemId`、`orientations`、`inputs`、`locales`、`viewports`、`safeAreaPolicy`、`nodes`、`coverage`、`programmaticText`、`visualValidation`。`coverage` 按[覆盖契约](../../roblox-game-workflow-control/references/coverage-contract.md)保存真实批准的用例组合与修订：默认 `usability` 使用代表性用例，覆盖声明方向和必需情景，不要求每个备选视口/输入/语言出现或做全排列；显式 `exact` 则要求所有已声明组合均有批准用例及匹配的 Client Play 证据。每份 Client Play 证据只支撑与实际测量一致的一行。`exact` 只扩大覆盖与目标核查范围，不表示像素差异比较或自动视觉分析；截图由用户人工检查。其余字段及枚举见[视觉工作流](visual-workflow.md#可见工作项合同)，此处补充 UI 的节点规则：

- 每个 UI 节点在 `nodes` 中有稳定 `id`、完整 `game.` `path`、`parentId`、`role` 和非空 `layoutRef`。`parentId` 只表达实际的层级、布局、裁切、输入或状态依赖，并形成无环图。
- `layoutRef` 应说明“相对哪个实际父容器/同级锚点，采用哪条边界或尺寸规则”，如“相对安全内容根的底边并保持项目定义的间距”。它是描述，不是资源路径，也不能仅写“居中”“自适应”。
- 节点 `role` 标识语义，例如全屏背景、常驻 HUD、交互控件、模态层或场景锚定提示。全屏背景/装饰与需避开系统界面的交互内容必须有清晰分层；弹窗、提示条或抽屉各自说明宿主、打开关闭和焦点恢复关系。
- `viewports` 只纳入真实的目标宽高和方向；不把一个视口通过比例推算成已验证的其他设备适配。
- `programmaticText` 使用 `{enabled,requiredLanguages,wrap,truncatePolicy,displayFitEvidenceRefs}`。程序化文本启用时 `requiredLanguages` 固定为 en、zh-CN、ja、ru、es，且五种语言均须包含在 `visualContract.locales`；`wrap` 为每种语言分别声明换行策略，`truncatePolicy` 必须为 `forbid`，并引用显示适配证据。纯非文本 UI 使用完整空结构 `{enabled:false,requiredLanguages:[],wrap:{},truncatePolicy:"forbid",displayFitEvidenceRefs:[]}`。
- `visualValidation.mode` 只能是 `usability` 或 `exact`。默认 `usability` 按批准的代表性用例核对可读性、裁切、遮挡和交互，同时覆盖所有声明方向与必需情景，并保留安全区、身份及人工确认门；不要求每个备选视口、输入或语言都有用例。`exact` 要求合同声明的视口、输入、语言与必需情景完整组合都有批准用例和匹配的 Client Play 证据，并核查声明的目标。两种模式均由用户人工检查画面；没有自动像素差异或截图分析。

## Roblox 屏幕边界与安全区

屏幕 UI 依据官方 `ScreenGui.ScreenInsets` 事实设置并回读。其默认值 `CoreUISafeInsets` 是交互屏幕 UI 的安全边界；`DeviceSafeInsets` 只处理设备缺口，不代表避让所有 Core UI；`None` 仅用于可延伸全屏、且不承载交互的背景层。若全屏背景和交互内容共用同一个 GUI 层，应先拆分层级，不能为了背景铺满而把按钮放入不安全区域。

不要依赖旧的 `SafeAreaCompatibility.FullscreenExtension` 路线；对交互内容设置 `ClipToDeviceSafeArea = false` 可能让内容落入设备缺口。按目标方向、设备边界、Core UI 避让和实际可见内容核对政策，再在合同的 `safeAreaPolicy` 中用文字写出采用的值、各层用途及验证视口。属性未能从当前对象/官方定义核实时保留未验证结论。

九宫格边框图片应使用已核实的 Roblox API：在 `ImageLabel` / `ImageButton` 上以 `ScaleType = Slice` 指定切片模式，并核实 `SliceCenter` 与 `SliceScale` 的实际值。为资源登记源图尺寸、切片中心、缩放、内容边距、最小目标尺寸和消费节点；回读实际属性并查看不同目标尺寸下边角/边框是否保持。不得复制 Unity `Sprite.border` 字段或凭图片内容推导边界数值。

官方参考：[ScreenGui](https://create.roblox.com/docs/reference/engine/classes/ScreenGui)、[ImageLabel](https://create.roblox.com/docs/reference/engine/classes/ImageLabel)、[九宫格图像](https://create.roblox.com/docs/ui/9-slice)。

## 输入、文字与布局验证

1. 对已声明输入方式逐个列明关键控件的到达路径、焦点/按下反馈、取消、误触容错和触发后的服务端状态响应。当前 `user_keyboard_input` schema 也列出 `ButtonA`、`DPadUp`、`Thumbstick1` 等手柄 `KeyCode`，可按 schema 模拟相应的离散按键输入；单个按键或序列成功不代表真实手柄设备、完整轴向/导航流程或完整触控轨迹已通过。未核实的触控、真实设备手柄及完整输入路径保持 `NOT_RUN`，不要从静态属性推断可操作。
2. 对程序化文本逐一使用 en、zh-CN、ja、ru、es 的代表性长文、实际数字范围、动态状态和必要文本输入测试换行、裁切、软键盘遮挡、焦点和提交/取消；逐语言记录换行策略及显示适配证据，禁止截断。没有程序化文本的合同使用完整空结构关闭此要求。不能靠隐藏必要信息或无依据缩小字体解决空间不足。工具 schema 中列出的触控相关按键代码本身不等于完整触控设备验证。
3. 对每个已批准视口核对实际 ScreenGui 节点、布局属性、切片边界、安全区策略、文字状态和输入命中。测试方向切换只在项目宣称支持双方向时要求；resize 连续变化也只针对该平台的真实窗口场景。
4. 用 Studio 能读取的实例、脚本、当前 Play 状态与 Console 证据记录技术结果；当前 `screen_capture` 只能取 Edit 画面。它不能证明运行布局或用户视觉通过。对真实运行截图/录屏只能使用当下已核实的采集方式，交给用户人工检查。

`usability` 默认只验证已批准的代表性用例，但仍须覆盖所有声明方向、必需动态情景、适用安全区与目标身份；不要求每个备选视口、输入或语言都有用例。`exact` 要求所有声明视口、输入、语言和必需情景的完整组合都有用例及匹配证据，并核验合同声明目标。两种模式都不执行像素差异或自动截图分析；技术成功不替代[视觉质量与情境人工验收](visual-workflow.md#人工视觉验收与证据)。未覆盖的输入、视口或真实运行画面保持 `NOT_RUN`。

## 失败与复验

- 交互内容越过约定安全边界、父子关系无实际依赖、长文被截断、控件不可达或切片边框变形时，定位对应节点/资源并交由 UI 或视觉资产所有者修复。
- 只在一个方向/视口验证通过时，只能报告那个范围；缺少模拟能力时保留未验证项，不拿桌面输入覆盖移动端结论。
- 共享 UI 资源属性变更时，只重验真实消费它的节点和目标视口；布局、文本或输入行为变更时重验受影响用例及视觉人工结论。
