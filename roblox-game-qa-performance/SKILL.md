---
name: roblox-game-qa-performance
description: 规划或执行 Roblox 功能回归、安全边界、稳定性和性能检查；当需要验证 Studio 玩法、分析性能热点、建立缺陷证据或评估设备模拟覆盖时使用。
---

# Roblox QA 与性能

用可复现步骤和真实证据说明功能是否成立，不从静态代码推断运行时通过。开始前读取验收条件、目标平台、架构/Remote 契约、性能预算及[插件路由](../roblox-development-workflow/references/studio-plugin-routing.md)。

可见体验按[响应式 UI 合同](../roblox-development-workflow/references/responsive-ui-contract.md)覆盖真实目标矩阵，并按[视觉工作流](../roblox-development-workflow/references/visual-workflow.md)记录五项人工质量结论及四类动态情境。机器只核对字段、技术参数和真实运行证据；截图由用户检查，技术 `PASS` 不得自动写成视觉 `PASS`。

汇总前核对[阶段交付](../roblox-game-workflow-control/references/stage-contract.md)确已顺序退出，不能用运行证据反填 V0–V3。情景 `technical` 保存 Play/断言结果，`visual` 保存独立的当前候选用户判断；没有用户判断时仍为 NOT_RUN。保留失败、修复与复验记录，不把旧 FAIL 改写为 PASS；结构 ready 不能表述为过程正确或引擎已通过。

3D 资源按[模型生产与回读清单](../roblox-development-workflow/references/model-production.md)核对 V2 选型和 V3 实际产物；参数预算、job Completed、Edit 源回读、运行加载/性能和人工视觉分别报告。不能把 maxTriangles 当实测三角数，不能从分件推断 Rig/动画完成；只复验受影响消费者及必要运行路径。

按[覆盖契约](../roblox-game-workflow-control/references/coverage-contract.md)逐行绑定批准用例与实际 Client 测量，禁止把一份 Play 复用于其他视口或情景。项目整体交付按[项目依赖契约](../roblox-game-workflow-control/references/project-contract.md)运行 `check-project`；多 Place 仅显式启用后检查关系契约与真实运行证据，单客户端和单 Place 证据不能代替跨 Place 结论。

## 职责与输入

- 检查实际 Studio 状态、目标 Place、已有测试和代码；保留版本、用例、结果和错误原文。
- 验收范围、预算或风险接受需真实用户取舍时，交[拷问技能](../roblox-game-grilling/SKILL.md)记录；普通测试按已推荐等级自动执行，不因新增拷问技能要求人工重选测试。
- 用户要求单元测试、测试覆盖、运行测试或调试测试失败时，才载入 rbx-unit-test；性能分析路由到 rbx-perf-profiling。
- 需要断点与暂停线程诊断时使用 rbx-debug；在暂停回调中不得修改 DataModel 或调用 yield。
- SceneAnalysis 需实际运行状态、功能标志及允许视角；LibMP 最多分析 256 帧，并按工具要求释放对象。
- 设备模拟 API 是异步任务；从工具返回的设备列表选实际 ID，并等待任务终态；应在进入 Play 前设置设备，PlayServer 状态下 setter 会失败。
- Studio 当前只有单客户端 Play 操作入口时，它不构成多客户端验收；无 Server & Clients 专用 MCP 时如实标记未运行。

## 执行步骤

1. 先把验收拆成正常路径、无效输入、权限、速率限制、重复调用、玩家退出/重生、Streaming 缺失、资源失败和回归路径。
2. 每个用例记录起始状态、执行操作、预期、实际、证据、版本和严重度；通过条件来自当前验收，不自设阈值。
3. 仅在已授权 Studio 流程中使用 start_stop_play；运行后读取 get_console_output 并记录错误与警告。
4. 单客户端结果与多人竞争验证分开；缺少多客户端环境时，静态审查可报告风险，但不声称并发测试通过。
5. 性能分析先记录真实场景、玩家/实例数量、设备或模拟设置、采样窗口与工具版本，再收集可比指标。
6. 区分脚本热点、实例数量、资源加载、网络请求和渲染瓶颈；给出能复现的触发条件和证据。
7. 使用设备模拟时记录真实设备 ID、画面方向、输入路径与异步任务终态；未完成任务标 NOT_RUN。
8. 缺陷按影响和复现稳定性排序，交还相应所有者修复；仅复验受影响用例及必要回归。

## 证据与停止条件

- 输出用例矩阵、缺陷清单、控制台结果、性能指标、测试环境、未覆盖项和复验状态。
- screen_capture 仅用于 Edit 状态，不用它伪造运行画面证据；未经明确要求不得自动分析截图。
- 视觉显示由用户人工检查截图并确认；任何截图都不能单独证明输入、安全、多人或性能通过。
- 出现数据写入、线上服务、设备启动或外部发布需求时，先停在可审查计划并取得对应授权。

未运行的 Server & Clients、目标设备、设备性能或真实运行视觉用例必须标 NOT_RUN，不得宣称通过。
- Remote 边界依 [架构](../roblox-game-architecture/SKILL.md) 和 [玩法开发](../roblox-gameplay-development/SKILL.md) 建立；收据、持久化与购买回归按 [LiveOps](../roblox-game-live-ops/SKILL.md) 契约覆盖。

## 性能与稳定性报告

- 运行时采样记录服务器/客户端侧、场景、玩家数、持续时间、采样方法和资源版本。
- 把服务器脚本耗时、客户端帧率、内存、网络消息、实例数和资源载入分项记录。
- 比较前后数据时固定运行流程和测试配置；环境不同则明确标成不可直接比较。
- 分析脚本热点前确认采样覆盖目标事件，短暂异常不能直接推断持续性回归。
- Roblox 设备模拟是模拟覆盖证据，不能替代真机运行、输入体验或实际网络质量。
- 真实玩家隐私或线上遥测数据只在已授权、最小范围和有明确用途时使用。
- 报告结论引用实际日志/任务结果；截图只由用户人工确认视觉表现。
