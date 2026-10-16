# Roblox 基础工程与垂直集成

本参考对应项目发现后的最小共享基础工作，不是新游戏空壳生成器。先读取[项目发现](project-discovery.md)、[工作流控制模型](../../roblox-game-workflow-control/references/control-model.md)、[Studio 执行契约](studio-execution.md)及当前 Place/本地源码的真实结构。仅为本项目已有需求建立基础能力；新项目也要尽早完成一条可玩的代表性纵向切片，不能把目录、空 ModuleScript 或单次 Play 当成游戏完成。

## 建立最小启动与生命周期

1. **基线**：选定唯一目标 Studio/Place，读取 DataModel、现有代码同步来源、脚本类型和已有启动流程。区分“技能包”“本地源码游戏”“Studio Place”，技能包任务不因此创建/写入游戏。
2. **所有权**：画出服务器、客户端和共享模块的最小职责。服务器保有规则、奖励、数据写入和 Remote 的最终判断；客户端收集输入并展示；共享模块只放双方确实都要读取的非秘密定义。每个模块写清消费者、所有者和清理责任。
3. **启动路径**：只建立实际需要的启动入口、依赖装配、配置读取、日志/错误出口、客户端输入与 HUD 连接、玩家/角色到达和移除清理。不要加入空的框架层、无消费者的抽象服务或未使用依赖。
4. **生命周期**：初始化逻辑幂等处理 `PlayerAdded` / `PlayerRemoving` 与 `CharacterAdded` / `CharacterRemoving`，覆盖晚加入、角色重生、重复初始化和退出清理。存在持久化时交由 LiveOps 明确唯一写者、失败/重试和数据格式；没有数据功能时不搭空存档架构。
5. **屏幕边界**：有交互式屏幕 UI 时按[响应式 UI 合同](responsive-ui-contract.md)设置实际 `ScreenGui.ScreenInsets` 和背景/安全内容层。交互层默认沿用 `CoreUISafeInsets`；全屏非交互背景才考虑 `None`，不可把旧 `SafeAreaCompatibility.FullscreenExtension` 当作新方案。

`RunContext` 只作用于 `Script`，不能用来配置 `LocalScript`。采用客户端 `Script` 时，依据[脚本位置与运行方式](https://create.roblox.com/docs/scripting/locations)检查真实容器和复制路径；放入 `StarterPlayer` / 角色相关容器时，要核实源实例与角色副本是否导致双重运行。不要把路径名当执行侧证据。

## 只抽真实共享能力

- 仅当两个或以上已批准消费者确实需要相同接口/数据/生命周期时，才将实现抽进共享模块；只被一个消费者需要的行为留在该消费者。
- 定义共享模块路径、公开成员、消费者、数据可见性、加载顺序、依赖方向、资源权限和变更后的影响面。禁止共享层含密钥、权威决策或客户端不应读取的服务器数据。
- Remote、配置、资源、输入、显示和持久化各自拥有明确责任人。共享修改先查调用方和真实 DataModel 依赖，再安排受影响消费者回归。

## 以代表性切片证明集成

完整项目维护[项目级工作项 DAG](../../roblox-game-workflow-control/references/project-contract.md)：最终集成项传递依赖全部非发布交付，发布项依赖最终集成；依赖固定上游候选且必须已完成并通过本地记录检查。完成单项后仍执行 `check-project`，不从局部 ready 推断项目完成。只有确有多 Place 需求时启用该契约的 multiPlace，登记各 Place 身份、传送关系、适用的共享数据契约与验证工作项；当前插件没有多 Place 或多客户端启动器，不能用单 Place Play 宣称跨 Place 成功。

选择能贯通本项目关键风险的一条真实玩家路径，例如：玩家进入 → 角色可操作 → 输入请求 → 服务器验证/状态变更 → UI 与世界反馈 → 退出/重生清理。只包含当前项目确实有的保存、购买、多人协作、触控或动画环节；不要为了“完整”新增无关系统。

集成时按此顺序逐项回读：

1. 初始加载和依赖顺序正确；客户端只读取允许的数据，服务器权威逻辑处于预期运行侧。
2. 角色首次加入、重生和离场时输入、HUD、事件连接、临时对象和动作表现能正确建立/销毁。
3. Remote 请求符合既定方向、载荷和服务端校验，拒绝路径也能正确更新客户端状态。
4. 视觉资源、界面、音频/动画反馈绑定真实登记身份及路径；必要的运行画面由用户人工检查。
5. 若该切片含持久化/在线服务，按其自己的授权与错误路径验证；否则不把未使用的 DataStore、购买、云服务加入基础骨架。
6. 读取本次相关 Console 增量并修复回归。只在授权的 Studio 工作流中启动/结束 Play；单客户端 Play 仅证明该配置，不构成 Server & Clients 并发验收。

基线和切片报告保留当前 Work Item、Place/代码版本、实现路径、启动与生命周期事实、实际消费者、已覆盖的运行侧/输入/视口、Console 差异、未覆盖项、失败责任人与修复出口。复用 V0–V4 的 `stageReviews` 交付路径；只有项目 `manual` 策略或实质选择/视觉验收门要求时才等待额外确认。空壳可运行、树形结构完整或一台客户端没有报错，均不能替代代表性功能与回归验证。

## 保存、上传与发布边界

DataModel 写入、本地源码保存、本地 Place 保存、Roblox 云端保存和公开发布是不同结果。当前 Studio MCP 工具表没有专用保存或发布工具；调用脚本/实例写入成功或 Console 无错误都不能证明 Place 已保存/已上传/已发布。必须通过当前已核实的 Studio 路径取得相应事实，并在证据中精确写明完成到哪一层。图片/资产上传是外部写入，发布体验和覆盖云资源也独立核对权限与授权，不随一般“开发”授权隐含执行。

多客户端验证也不能从 `StudioTestService.ExecuteMultiplayerTestAsync` 推断可用：该 API 有 `PluginSecurity` 约束，而当前插件的 Edit/Client/Server 工具上下文不证明其调用成功。使用可观察到的测试方式；没有 Server & Clients 证据时，明确保留未验证项。

阻断出口包括：目标 Place 不唯一、同步来源不清、客户端与服务器职责冲突、共享能力没有真实消费者、启动有错误、角色重生重复连接、权威 Remote 缺校验、目标运行证据缺失，或试图将编辑/云保存/公开发布混为一谈。修复后只复验相关启动路径、消费者和已有阶段交付。

官方参考：[客户端与服务端](https://create.roblox.com/docs/projects/client-server)、[安全边界](https://create.roblox.com/docs/scripting/security/client-server-boundary)、[Studio 测试模式](https://create.roblox.com/docs/studio/testing-modes)、[脚本位置与运行方式](https://create.roblox.com/docs/scripting/locations)。
