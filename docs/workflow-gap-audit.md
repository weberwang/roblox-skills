# Unity 对照与 Roblox 工作流补齐

核对日期：2026-10-16。参考工程 `D:\Git\unity-skills` 只读；本轮修改发生在 Roblox 技能工程，不开发或发布特定游戏。

## 主要遗漏与处理

| 对照范围 | 原有遗漏 | 本轮补齐 |
| --- | --- | --- |
| Unity workflow-files 与项目交付模板 | 只有工作项初始化，没有 GDD/TDD、模块和资源总表初始化 | 新增 init-docs/add-docs/check-docs，未配置文档不会视作就绪，拒绝覆盖与链接路径 |
| 模块规划与基础工程 | 共享骨架、垂直切片和集成完成的边界不够明确 | 模块/实施依赖无环、精确所有权、单 Studio 写者、代表性切片与全局回归流程 |
| 控制面 F1/F2/F3 | 有目标文字和同类日志即可填充完成材料，缺少逐项结果 | 版本 2 将验收结果、计划检查、独立领域审查与当前有效证据绑定 |
| 引擎证据身份 | 只绑定候选和 Studio，跨 Place/工作项复用仍可能混淆 | 同时核对工作项、候选、Studio、Place、Universe、时间、DataModel；多人记录必须说明至少两个客户端及真实方式 |
| 可见对象 V0–V4 | 最终只检查 stage=V4，缺少前序产物和布局规格引用 | 保留五阶段交付、可选逐阶段人工策略、视觉合同与节点无环检查；不额外强制普通步骤反复确认 |
| 美术目标与动态体验 | 未统一记录主题/受众/可读/舒适/完成度和叠加情景 | 增加视觉基线 brief、五维人工质量结论、正常/重复/峰值/叠加适用性与实际 Play 证据 |
| UI 布局、九宫格与共享资源 | 原则性说明多，缺少真实 Roblox API 和统一交接结构 | ScreenInsets/安全区、ScaleType.Slice/SliceCenter/SliceScale、语义布局参照、资源许可与消费者登记 |
| 模型、材质、角色动画 | 漏列 segment_mesh，网格与绑定/动画职责未充分区分 | 补分件上限/同级新对象、材质配对/原位贴图、Animator 生产者与权限/复制/清理流程 |
| 真实能力与技术回读 | 没有可复用、有界的项目/布局采集源码 | 两个不写入游戏、不切模式的只读探针，空数据和截断明确报告 |

相关参考来自 Unity 的 development-workflow/references 下 module-planning、foundation-workflow、shared-asset-usage、responsive-ui-contract、animation-intent-contract、art-quality-contract，以及 workflow-control 的实施包、证据与阶段交付纪律。未复制其内部历史字段或自动引入无关审批。

## Roblox 能力核实

- 当前工具支持 segment_mesh，但它只分件，不承诺骨骼、关节、蒙皮或动画；最多 5 名部件，与 generate_mesh 显式最多 8 部件不同。
- StudioTestService 多客户端 API 需要 PluginSecurity；当前 Edit/Client/Server 路由不能证明具备该权限。单 Play 结果不升级为多人结论。
- screen_capture 当前契约是 Edit-time；与内置设备技能叙述冲突时遵守实际工具契约，不假设 Play 截图、录屏或 set_active_studio 存在。
- 插件没有专用保存、发布、UV、Rig 或动画制作/导出工具；资源引用、保存、上传和发布分别取证。
- 官方细节和入口集中在[插件路由](../roblox-development-workflow/references/studio-plugin-routing.md)、[响应式 UI](../roblox-development-workflow/references/responsive-ui-contract.md)、[动画交接](../roblox-development-workflow/references/animation-intent-contract.md)，避免复制过期教程。

## 不直接迁移的机制

Unity 的 GUID/.meta/AssetDatabase、URP/PBR 通道打包、Prefab/Addressables、CanvasScaler/TMP、程序集和域重载、Unity 原生 2D 骨骼/Spine 等不映射为虚构的 Roblox 功能。不为凑齐 Unity 技能数量新增空的建模/贴图/骨骼技能；现有资源与反馈技能通过按需参考承担其真实可执行边界。

没有复制 Unity 的强制固定语言集、固定设计分辨率、合同摘要门或每个小修重走全阶段的流程。项目只纳入真实支持的设备、方向、语言与输入；用户未要求的旧版兼容不额外实现。

## Studio 实测边界

已在连接实例 Place2 的 Edit DataModel 执行两份只读探针：发现探针返回 Place/Universe 均为 0，属于未发布工程；布局探针返回 available=true、scanned=1、nodes=[]、truncated=false，说明当前 StarterGui 没有待采集 UI。未创建或修改实例，未读脚本源码，未启动 Play，未采集或分析截图。

这只证明当前两个有界探针可执行，不证明存在游戏玩法、完成了 UI 显示、多人、安全、性能或发布验收。运行/多人/真机/真实画面与外部写入均未执行，保留 NOT_RUN。

## 验证方法

实际执行 T2，结果如下：

| 验证 | 实际结果 |
| --- | --- |
| npm test | 49/49 通过，0 失败、0 跳过 |
| npm run check | 13 项技能元数据、文档引用、模板残留、文件规模与 Node 语法通过 |
| skill-creator quick_validate 与界面 YAML | 13/13 通过，界面短描述长度合规 |
| npx skills add 本地路径 --list | 发现全部 13 个技能，未安装到真实工程 |
| npm pack + 本地 tarball 的 npx 安装 | 56 个包文件、13 个技能，新增脚本/探针/参考均被打包 |
| 已安装工具冒烟 | init-docs、add-docs、check-docs、版本 2 工作项初始化均可独立运行；未配置文档正确阻断 |
| Studio 只读探针 | 两份探针在 Edit 执行成功；空 StarterGui 不推定 UI 通过 |
| 独立审查 | 控制器及项目文档工具分别审查，发现均修复并复验，无剩余实质发现 |

审查中修正了错误目标的视觉证据、空/不同层级章节误报、原始模板正文冒充 ready、数值项目 ID，以及 ENOSPC 中途写入留下半文件等问题。新增反例覆盖初始化和可选文档追加失败后的清理与重试。

自动测试和包安装仅使用具名临时目录，清理前校验绝对路径；不触达真实游戏工程。没有执行 Play、多客户端、真机、运行画面验收、上传或发布；这些未执行项不计为通过。本地检查无法自行验证证据内容、许可证据或用户确认引用的真实性。

## 后续修正：拷问技能融入

前次对照只提取了必要人工取舍原则，遗漏了 Unity 的独立拷问角色、决策交接与机器记录。本次根据用户指出的遗漏补上 [roblox-game-grilling](../roblox-game-grilling/SKILL.md)，并将其接入开发编排、工作流控制和全部领域技能。

Unity 的 grilling-record Schema 实际位于 unity-development-workflow/schemas，模板位于其 templates；Roblox 不直接引用 Unity 契约，而以自己的[决策记录约定](../roblox-game-grilling/references/decision-record.md)和 runtime/decisions.mjs 执行校验。

- 先查事实，再对无法由证据消除的必要取舍逐项提问；高影响问题一次一个，推荐不代替用户回答。
- 明确回答后提交完整结论，保留真实用户批准；同一已批准对象和范围不重复确认。
- Work Item.decisionRefs 引用实际 JSON。pending、answered、rejected、失效引用、未答问题、范围越界、批准修订不符、并列有效批准均不能满足完成门。
- 旧决策只有显式关联同对象、更高修订且已批准的替代记录后才可 superseded；普通实现候选变化不自动撤销产品决定。
- 未决只暂停直接依赖内容；已授权的独立工作继续。产品决定不能代替上传、付费、线上数据、真机或发布授权。

本次实际执行 T2：npm test **60/60 通过**（新增 11 项拷问检查）；npm run check 与技能/界面 YAML **14/14 通过**；通用 skills CLI 发现全部 14 项；npm 本地包包含 **61 个文件**，安装全部 14 项及已安装 CLI 冒烟通过。独立审查未发现实质问题。

本次未操作 Studio、游戏或任何外部发布系统。决策记录仅验证结构与绑定，真实用户消息和批准内容仍由编排者核对，不能把本地 JSON 当作身份证明。

## 后续补齐：覆盖、项目依赖与资源消费

本轮继续对照 Unity 的验证矩阵、项目任务依赖与共享资源消费者回归纪律，将前三项缺口补入本地控制器，保持原有拷问闭环。多 Place 作为条件性能力，仅在项目清单显式启用时增加约束，单 Place 不建立传送或共享数据系统。

| 缺口 | 现在的可执行约束 |
| --- | --- |
| 泛用 Play 可覆盖多个声明目标 | 可见合同增加有批准来源与修订的用例清单；每个方向、视口、输入、语言和必需情景都进入实际用例，每条 Client Play 精确绑定一行和实测尺寸。漏行、错维度、旧修订或错情景阻断。 |
| 单工作项通过被误作全项目完成 | 项目清单登记全部活动工作项候选，根字段 dependsOn 表达跨项 DAG；前置必须完成并通过局部门，最终集成覆盖非发布成员，发布依赖集成。check-project 聚合全部成员并拒绝漏登记文件。 |
| 资源退役/拒绝许可仍能完成消费验收 | 资源修订、active/historical 消费者、工作项 assetBindings 与正式 Edit 回读联动，核对许可、当前版本、候选、消费范围、Asset ID/实例路径；全局聚合另拒绝未登记的 active 消费者。历史引用不要求仍有活动工作项。 |
| 多 Place 需求缺少统一交接 | multiPlace.enabled 默认 false；开启后核对同 Universe 的真实 Place、工作项唯一归属、转场/适用共享数据合同、集成依赖及逐关系当前运行证据。工具不自动启动、传送、写云数据或发布。 |

实现入口与准确字段见[项目契约](../roblox-game-workflow-control/references/project-contract.md)、[覆盖契约](../roblox-game-workflow-control/references/coverage-contract.md)、[资源绑定](../roblox-game-workflow-control/references/asset-bindings.md)。开发编排、控制、QA、资源与发布技能已接入相应流程；不新增空的领域技能。

本轮按 T2 执行：全量测试 **88/88 通过**，失败、跳过均为 0；`npm run check` 检查全部 14 项技能的元数据、引用、模板、文件规模和 Node 语法；官方 quick_validate 与界面 YAML **14/14 通过**；通用 skills CLI 发现 14 项；实际 npm 包 **68 个文件**，本地 tarball 安装全部 14 项，已安装的项目、工作项和文档 CLI 冒烟通过，空项目和未配置文档正确阻断。

独立审查发现并复现了四个 P2：资源消费节点和多 Place 成员列表畸形时崩溃、声明竖屏却无竖屏覆盖仍通过、active 消费者未登记却能聚合完成。已修复并增加回归用例；复审重跑原反例，均正确阻断，退役历史消费者仍不误阻断，无剩余实质发现。聚合报告中的各成员状态同步反映依赖、跨 Place 和全局结构错误。

测试和安装只操作具名临时目录，清理前验证绝对目标范围。本轮未连接或修改 Studio、未启动 Play、未进行真实跨 Place/多客户端/真机运行、未采集或自动分析截图、未上传或发布。这些游戏层验证仍为 NOT_RUN；本地记录检查不认证用户消息、许可或日志内容的真实性。

## 本轮对齐：阶段职责与执行约束

按用户确认的方案同步工作流控制、视觉交付、资源生产和 Git 收尾文档。六阶段和 V0–V4 编号保持不变；Roblox 的服务器权威、Studio/Place 身份、许可、外部授权和真实显示由用户检查等平台边界继续生效。

| 范围 | 对齐后的约束 |
| --- | --- |
| V2 拆解和布局 | 在冻结的 V1 效果图上先完成拆解图展示与独立人工确认，之后生成并展示布局图，再取得引用前一确认的独立布局确认。`deliverables` 与 `manual` 都不能跳过任一确认。确认按当前工作项、候选和图片身份绑定。 |
| V3 资源生产 | 固定交付 `resourceProduction`、`resourceAcceptance`、`assetIdentity`、`productionRecords`。资源接受为人工 `PASS`，覆盖 V2 全部组件且 `outputs` 每组件恰有一个纯引用：`ROBLOX_NATIVE` 指向项目内非空原生制作源文件，其他生产路由引用唯一资源登记及当前 ready 修订、已批准许可和来源/产出证据。当前 visual 预览的 `resources:{stageReviewId,componentIds,outputs}` 仅覆盖自身组件，逐项匹配接受引用。复用资源也登记引用，不复制元数据；V3 不要求 V4 消费者或 Edit 回读，不声明正式 Scene 装配完成。 |
| V4 场景和运行 | 固定交付 `editComposition`、`wiring`、`sourceReadback`、`viewableDelivery`、`runtimeIntegration`、`inputLifecycle`、`console`、`dynamicCoverage`、`humanDisplay`。原 `production:{sampleAttempts,expansions}` 整体在 V4；先接受代表性场景样板，再按 `scene-assembly` 或 `full-scene-layout` 扩展铺设。 |
| 阶段策略 | `deliverables` 可连续推进普通阶段；`manual` 额外要求普通阶段逐项真实确认。V2 双图确认、V3 资源人工接受、V4 场景样板接受及最终人工显示验收是两种策略共有的必要门。 |
| 条件性视觉基线 | 有视觉依赖的 `FOUNDATION`，或 `type=PROJECT` 且仅含 `SHARED`/`MODULE` 的基础工程包，仅在 `implementation.visualDependency === true` 或非空 `visualContractRef` 时启用 `docs/visual-baseline.json`；不从任意 `assetBindings` 或资产表自由字符串推断。须有三个候选，候选 `generationRef` 为 `{candidateId,image,tool,generatedAt}` JSON 对象，绑定对应候选和图片且生成时间早于选择；`selection.presentedCandidateIds` 按原序包含三个候选，用户唯一人工选择，五维 PASS 并冻结来源。候选图片须通过结构解码检查；结构检查不分析画面，纯工程包豁免，普通场景/显示层不会因含模块而误触发。 |
| 文本与视觉验证 | `visualContract.programmaticText.enabled:true` 时 `requiredLanguages` 为 en、zh-CN、ja、ru、es，且全部列在 `visualContract.locales`，逐语言声明换行、禁止截断并提供显示适配证据；关闭时用完整空结构。`visualValidation.mode` 默认 `usability`，按批准代表性用例覆盖所有声明方向和必需情景，不要求每个备选视口/输入/语言都出现；明确要求精确还原才使用 `exact`，覆盖声明维度的完整组合并核查声明目标。`exact` 不代表像素差异检查或自动视觉分析，最终显示仍由用户检查。 |
| 阶段 Git 收尾 | 阶段验收及规定验证通过后，代理自动在当前分支创建仅含本任务必要文件及其递归引用的本地提交。不创建分支/worktree、不推送；验证失败或文件归属不明时不提交。CLI 不执行 Git、引擎命令，也不伪造人工消息。 |

历史“没有复制 Unity 的强制固定语言集”记录的是上一轮取舍；本轮已按用户决定，为启用的程序化文本合同采用上述五种语言要求。此处不覆盖之前各轮的验证数字。

### 2026-10-20 验证与审查

本轮实际执行 T2：`npm test` **173/173 通过**，失败、跳过均为 0；`npm run check` 验证全部 14 项技能的元数据、文档引用、模板残留、文件规模与 Node 语法；`npm pack --dry-run --json` 检查 **89 个交付文件**，新基线、视觉政策、布局确认及资源接受/产出模块均包含在包内。测试覆盖已安装入口、阶段推进、必要确认、资源生产与消费、视觉基线、五语言政策和两种覆盖模式。

独立审查发现的旧确认复用、非视觉资源误触发基线、资源接受未绑定正式产出，以及接受资源 A 却消费 B 的问题均已修复并补回归。V4 完成命令与最终 `check` 都核对资源接受及消费关系；音频等其他节点的非视觉附属资源仍使用通用资源门。全量运行另暴露一个随机器执行速度波动的冻结时间反例，已改为相对评审时间构造，并在最终全量复验通过。最终独立复核未发现剩余实质问题。

所有测试只使用隔离本地目录；本轮未操作 Studio、未启动 Play 或真机、未采集或分析截图、未上传或发布。`exact` 本轮实现的是完整声明组合覆盖，不是像素差异比较引擎；真实画面、用户消息语义、来源及许可内容仍由实际执行与人工检查核实。
