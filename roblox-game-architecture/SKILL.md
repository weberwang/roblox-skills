---
name: roblox-game-architecture
description: 设计或审查 Roblox Experience 的 DataModel、服务边界、服务器权威、Remote 安全、玩家生命周期、数据和资源所有权；当要建立系统结构或排查跨模块边界时使用。
---

# Roblox 游戏架构

围绕 Roblox DataModel 建立简单、清晰的所有权边界。先读取[Studio 插件路由](../roblox-development-workflow/references/studio-plugin-routing.md)和[工作流控制模型](../roblox-game-workflow-control/references/control-model.md)。

新启动路径或公共模块需按[基础工程与垂直集成](../roblox-development-workflow/references/foundation-integration.md)只建立真实需要的生命周期与共享能力；资产身份和消费者通过[共享资源流程](../roblox-development-workflow/references/shared-asset-usage.md)统一对账。

## 职责与输入

- 通过 get_studio_state、search_game_tree、inspect_instance、script_search 和 script_read 查明当前 Place 的真实结构；先复用现有目录、模块和 Remote。
- 读取目标玩家路径、已有脚本、资源引用、持久化需求、Streaming 行为和性能约束。
- 对公开 Remote 契约、共享模块、存档格式或服务依赖等实质改变，向制作策划提交影响和方案；不要自行改写范围。
- 若服务器/客户端权威、Remote 契约、多人状态所有权、Place 边界或数据责任仍有多个会改变授权范围的方案，交给[Roblox 游戏拷问](../roblox-game-grilling/SKILL.md)记录用户决定；不要用技术偏好代替产品批准。决定获批后回交当前架构工作项。
- 不把 Roblox 服务树当成普通目录；结合脚本类型、Script.RunContext、所在容器和当前 DataModel 的实际回读判断运行侧，不能只凭路径推断。

## 设计步骤

1. 将状态按权威方分类：服务器规则和关键状态放在服务器侧；客户端负责输入采集、展示和非权威预测；共享模块只放双方都需读取且不含秘密的数据。
2. 依职责选择 Roblox 服务容器：服务端逻辑、仅服务器资源、共享模块、客户端脚本、界面和角色脚本分别归入合适容器。
3. 为每个 Remote 写出调用方向、有效载荷结构、类型/长度界限、玩家权限、距离或状态前置条件、速率限制、拒绝方式和日志策略。
4. 规划 PlayerAdded、PlayerRemoving、CharacterAdded、CharacterRemoving 的订阅与清理；幂等处理角色重生、玩家退出和重复初始化。
5. 对 StreamingEnabled 场景检查客户端可能暂时看不到的实例；客户端需按需等待或处理缺失，服务器逻辑不能依赖客户端收到完整世界树。
6. 为 DataStore 写入者、缓存、重试、并发冲突和数据格式版本标明归属，并交给 live-ops 细化预算与恢复策略。
7. 只让被多个系统实际共享的能力上移为公共模块；每个公共接口列明消费者、变更影响和清理责任。
8. 向 [玩法开发](../roblox-gameplay-development/SKILL.md) 发布可执行接口；存档及收据契约交给 [LiveOps](../roblox-game-live-ops/SKILL.md) 落地。

## 交付与验证

- 交付 DataModel 路径图、模块职责、依赖方向、状态所有者、Remote 契约、玩家/角色生命周期和数据读写者。
- 交付资源与代码信任边界、Streaming 假设、性能热点和需要 QA 覆盖的边界条件。
- 用 Studio 树与脚本读取结果证明结构，用 script_grep 或 script_search 检查调用方；不能仅凭设计图宣称实现符合。
- 发现 Remote 未校验、客户端能决定奖励或连接未清理时，列为阻断项并指派修复角色。

不要把客户端藏起来的内容视为秘密；ReplicatedStorage 中的客户端可见代码与数据不能存放凭据或服务器专属决策。架构评审不执行未授权的游戏逻辑、不发布体验。

## 设计审查清单

- 检查脚本类型、Script.RunContext、容器及当前 DataModel 回读结果是否共同支持预期运行侧，并确认网络可见性和生命周期。
- 检查 Remote 是否只暴露必要操作，且服务器持有每次请求的拒绝/接受决定。
- 对客户端可见模块、属性和实例按可被玩家读取或复制的边界设计。
- 检查服务器到客户端的状态同步是否避免发送无关私有数据。
- 查明每个事件连接和临时对象的创建方、销毁时机和重复初始化行为。
- 把外部服务和 DataStore 调用留在受控的服务器模块，记录失败降级策略。
- Streaming 区域内的 UI/交互需按对象暂时未加载或离开视野设计。
- 发现隐式循环依赖、重复权威状态或没有单一所有者时先提出清理顺序。
- 方案只描述当前 Place 中能观察到的结构，不推断未打开的 Place 或线上服务配置。
