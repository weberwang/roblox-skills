---
name: roblox-development-workflow
description: 使用 Roblox Studio 插件编排完整游戏开发或跨模块功能，从需求、工程基线到场景、界面、玩法、数据、QA 和发布候选；局部领域任务只加载对应技能。
---

# Roblox 游戏开发编排

以 [工作流控制](../roblox-game-workflow-control/SKILL.md) 管理唯一工作项，按 [插件路由](references/studio-plugin-routing.md) 执行真实 Studio 操作。延续 Unity 工程的阶段、实施包与证据纪律，采用 Roblox 原生数据与执行边界。

## 最短路径

1. 先读项目与已有工作项，区分“技能工程”“本地源码游戏”“Studio Place”。技能工程任务不自动创建游戏或修改当前打开的 Place。
2. 发现已连接 Studio 并读取模式；按 [项目发现](references/project-discovery.md) 与[有界只读探针](references/studio-probes.md) 确定目标、现有代码、同步来源和玩家主循环。证据仍无法消除的关键取舍，或用户明确要求拷问时，按[决策与变更交接](references/decision-change-control.md)调用[拷问技能](../roblox-game-grilling/SKILL.md)，闭合后回到原工作项。
3. 展示六阶段进度：需求范围、全局基线、基础工程、场景/显示层生产、全局集成验证、发布。局部任务直接进入最早受影响步骤。
4. 按[工程目录与产物归档](references/project-layout.md)初始化或核对目录，再按[项目文档与清单](references/project-artifacts.md)初始化或复用 GDD/TDD、模块及资源登记；完整项目另按[项目依赖契约](../roblox-game-workflow-control/references/project-contract.md)登记工作项候选、前置依赖和最终集成项，多 Place 仅按需启用。[制作](../roblox-game-production/SKILL.md) 给出范围与验收，[架构](../roblox-game-architecture/SKILL.md) 确定服务端/客户端职责和模块接口。按[基础工程与集成](references/foundation-integration.md)冻结实施包与单写者，先完成代表性垂直切片。
5. 按职责调用玩法、UI、资产、音频、反馈、数值、在线服务；只加载本次相关技能。写入遵守 [Studio 执行契约](references/studio-execution.md)。
6. 推荐测试等级并自动执行已授权普通验证；由 [QA](../roblox-game-qa-performance/SKILL.md) 汇总技术证据，截图交用户检查。真实设备、上传、发布和付费单独核对授权。
7. 以 [交付要求](references/delivery.md) 结束本次工作项；项目级交付执行 `check-project` 汇总全部登记工作项与集成结果。发布候选交 [发布技能](../roblox-game-release/SKILL.md)，不从 Play 成功推断已保存或已上线。

## 领域分工

| 任务 | 技能 |
| --- | --- |
| 核心循环、范围、场景增量 | [制作](../roblox-game-production/SKILL.md) |
| 无法由证据消除的必要人工取舍 | [拷问与决策](../roblox-game-grilling/SKILL.md) |
| 服务端权威、模块、Remote、生命周期 | [架构](../roblox-game-architecture/SKILL.md) |
| 移动、战斗、交互、回合、关卡状态 | [玩法](../roblox-gameplay-development/SKILL.md) |
| HUD、弹窗、触控、手柄、适配、本地化 | [UI](../roblox-game-ui/SKILL.md) |
| 模型、材质、贴图、图片、资源来源 | [视觉资产](../roblox-game-visual-assets/SKILL.md) |
| 声音路由、环境声、音量与生命周期 | [音频](../roblox-game-audio/SKILL.md) |
| 经济、成长、难度和奖励 | [数值](../roblox-game-balance/SKILL.md) |
| 镜头、动画、粒子、声音与事件反馈 | [体验反馈](../roblox-game-juice/SKILL.md) |
| 存档、收据、商店、云配置、在线状态 | [在线服务](../roblox-game-live-ops/SKILL.md) |
| 测试、断点、场景分析、性能取证 | [QA 与性能](../roblox-game-qa-performance/SKILL.md) |
| 保存、发布候选、授权、回滚 | [发布](../roblox-game-release/SKILL.md) |

## 可见对象与协作

项目架构按[服务端、客户端与共享职责约定](references/foundation-integration.md#项目架构与-datamodel-职责)组织，并将其落实到[架构的阶段交付](references/foundation-integration.md#架构在-v0v4-中的交付)。编排负责在 V0 发现真实工程、V1 明确玩家状态与流程、V2 交付实例/模块/接口/所有权与验证计划；V3 生产并接受正式资源，V4 完成场景装配、接线、回读和运行验证。由架构技能维护对应 TDD 与已有模块清单。沿用现有结构，只为真实需求提取共享能力。

场景与显示层分别按 V0 分流、V1 定义、V2 拆解与布局确认、V3 资源生产和接受、V4 场景装配与运行接入交付。按[视觉工作流](references/visual-workflow.md)、[响应式 UI](references/responsive-ui-contract.md)、[共享资源](references/shared-asset-usage.md)、[动画意图](references/animation-intent-contract.md)按需展开。先复用节点、组件与资源，复杂 UI 保持语义分组，不用单张概念图替代按钮和文本。

V1 冻结当前对象各必要状态的完整效果图。V2 按[视觉拆解交付](references/visual-decomposition.md)从图反查全部显著特征，直接展示稳定编号框选、引线中文标注图片；原生文字、填充和复用项也标明来源、消费、装配与生产边界，并在现有拆解合同中冻结目标机位、构图锚点和逐项还原要求。V2 严格按“拆解图展示并确认 → 生成并展示布局图 → 布局图单独确认”串行执行，两条确认分别绑定对应当前图片，布局确认引用拆解确认；deliverables 和 manual 都必须遵守。内部合同用 `decompositionRef` 与图对齐，不能用架构图、文字表格或下载链接替代图片。V3 仅生产和登记正式资源，并以 `resourceAcceptance` 取得当前资源范围的真实人工接受；其 `outputs` 为 V2 每个组件各一条来源/资源引用，资源视觉证据必须绑定同一组引用。无新资源时也要确认复用范围，不能用 `ready` 替代。场景代表性样板、正式 Edit 组合、接线、源回读及扩展铺设统一在 V4，先接受当前样板再扩大铺设。

涉及 3D 模型时默认使用[Roblox Studio 模型生产与接入](references/model-production.md)：V2 从 Roblox 现有资源、网格生成、可调程序化和原生构建中明确方法、参考图能力、参数和验证计划，不能只写 MODEL_3D；需要生成的新几何按视觉拆解逐组件路由，具体依据见[按拆解结果路由生成模式](references/model-production.md#按拆解结果路由生成模式)。V3 生产并登记正式资源，以绑定当前候选、V2 全部组件及视觉资源证据的人工确认接受资源；这里不宣称场景正式装配完成。V4 使用 `stageReviews.production` 记录代表性场景样板、检查、接受和后续扩展；接受当前样板后才扩展场景铺设，并完成 Edit 组合、接线、正式源回读和可查看交付。外部制作仅作为已明确指定或能力受限后的确定替代。后台生成仍占用 Studio 单写者，不能因已返回 jobId 并发修改同一场景。

新可见工作项从 V0 开始，执行[阶段契约](../roblox-game-workflow-control/references/stage-contract.md)：当前阶段实际交付、展示并核对退出条件后，才可推进下一阶段。V2 的拆解确认和布局确认、V3 资源接受、V4 样板接受与最终视觉验收不可绕过。准备/证据汇总脚本不得提前设置 V2/V3/V4、批量补阶段或从运行成功推断早期交付。`deliverables` 可顺序推进普通阶段，`manual` 对普通阶段逐项核对真实确认；两种策略都遵守必要人工门且不能跳阶段。

开始正式 Edit 组合前，实际运行 `stage-status` 并核对阶段链有效、当前为 V4；V3 完成后不得把资源登记描述成场景正式组合。阶段检查不通过时先修复当前交付或缺失前置，不能继续实施后再补记录。当前阶段内返修仍回读受影响源和证据，保留失败与复验来源。

全局基线门仅对有视觉依赖的 `FOUNDATION`，或 `type=PROJECT` 且仅含 `SHARED`/`MODULE` 的基础工程包执行；仅 `implementation.visualDependency === true` 或非空 `visualContractRef` 触发，`baselineRef` 默认指向 `docs/visual-baseline.json`。不从任意 `assetBindings` 或资产表自由字符串推断视觉依赖。基线须记录三个候选 `{id,image,generationRef}`，其中 `generationRef` 为绑定候选身份与图片的 `{candidateId,image,tool,generatedAt}`；`selection.presentedCandidateIds` 按原序列出三个候选，用户只选择其中一个，五维质量须 PASS，选择与来源冻结，候选图片通过结构解码。程序化文本通过 `visualContract.programmaticText.enabled: true` 声明时，`requiredLanguages` 固定为 en、zh-CN、ja、ru、es，且这些语言同时列入 `visualContract.locales`；每种语言逐一填写 `wrap`，`truncatePolicy` 为 `forbid`，并提供显示适配证据。关闭时仍填写完整空结构。`visualValidation.mode` 默认为 `usability`，用代表性用例检查可读性、裁切、遮挡和交互，同时保留安全、身份、情景和人工门；明确要求精确还原时才设为 `exact`，并验证合同声明的全部维度与完整覆盖组合。

每次阶段汇报列出当前阶段、实际交付、完成依据、剩余问题及下一步。已有有效成果记录复用来源、范围与当前剩余工作；全局美术方向确认不等于具体对象验收。技术覆盖与人工显示结论分开，尚无当前用户视觉判断时保持人工 NOT_RUN。发现旧记录批量登记或结论写错时保留原记录和候选产物，只修正有证据支持的内容，不倒填过程或撤销无关确认。

可独立的研究、探索、实现和审查按项目代理规则委派；明确文件/实例所有权与验收，禁止多个代理并发写同一 Studio。图片生成或编辑由 image_generator 子代理使用 imagegen 执行，本技能不自行生成位图。

产物按[目录规范](references/project-layout.md)归类：未引用加工文件进 `.tmp/`，待确认和已确认交付分别进 `artifacts/candidates/` 与 `artifacts/approved/`，正式游戏资源按类型进 `assets/`，工作项、合同与证据进 `.workflow-control/`。确认来源和状态仍由既有记录维护，不凭目录名判定通过；持久引用不能指向可清理临时文件。

阶段验收和验证通过后，代理在当前分支自动创建本地 Git 提交，仅包含当前任务必要文件及其递归引用；提交前明确核对路径归属和暂存范围。文件归属不明或验证失败时保留现场并报告，不提交。不得创建分支或 worktree，也不得推送。缓存、安装副本、未引用探索文件和空目录不入库；不为减少文件数删除失败依据或历史确认。详见[最小提交与恢复](references/git-minimum.md)。

项目记录保存在游戏工程，不写入技能包；不得把某次会话的 Studio ID、功能开关、Asset ID 或用户授权固化成全局默认值。未明确要求不建分支/worktree，不自动发起真机验收。
