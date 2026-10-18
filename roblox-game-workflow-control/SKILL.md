---
name: roblox-game-workflow-control
description: 管理 Roblox 游戏开发的工作项、范围、实施包、证据与外部授权；在开始跨模块开发、恢复任务、集成交付或检查是否可完成时使用。
---

# Roblox 工作流控制

这是项目工作项与交付记录的唯一控制面；领域技能提出实现和证据，不各自维护第二套全局状态。读取 [控制模型](references/control-model.md)，按需使用本技能的 `scripts/workflow-control.mjs`。

## 开始与恢复

1. 先读已有 `.workflow-control/work-items/`、项目说明和用户当前目标，复用同一工作项；不要为返修重建工作项。
2. 将范围拆成 `PROJECT`、`FOUNDATION`、`SCENE`、`DISPLAY_LAYER`、`INTEGRATION` 或 `RELEASE`。场景含常驻 HUD；弹窗、抽屉、Toast 使用独立显示层工作项，`hostSceneId` 只记录宿主。
3. 每个新 `SCENE`／`DISPLAY_LAYER` 必须从 V0 开始，按[阶段契约](references/stage-contract.md)逐阶段交付、展示并核对退出条件，再单步推进。已有工作项返修可恢复最早受影响阶段；复用成果须记录来源、适用范围与仍需完成内容，不能把新工作项直接设为 V2/V3/V4。
4. 生产实施前填入准确目标 Studio、源数据归属、允许文件/实例、实施单元所有者、验证计划与停止条件。
5. 所有 Studio 写入保持单写者；并行代理可以探索、研究、编写不冲突的本地文件或独立审查。

完整项目按[项目依赖与多 Place 契约](references/project-contract.md)维护唯一项目清单、跨工作项 `dependsOn` 与最终集成项，交付前执行 `check-project`；局部小修不强制建立项目清单。多 Place 只在真实需求出现时显式启用，不为单 Place 建立空传送或共享数据系统。

发现证据无法消除且会改变目标、范围、成本、风险、体验或授权的取舍时，按[决策交接](../roblox-development-workflow/references/decision-change-control.md)调用[拷问技能](../roblox-game-grilling/SKILL.md)。工作项用 decisionRefs 引用实际记录；没有必要决策时明确为空数组，不给普通任务增加人工门。未决内容先暂停直接依赖它的写入，闭合后恢复原任务。

## 本地工具

从本技能目录调用，`--repo` 是游戏工程根目录，不能误用技能仓库目录：

```powershell
node scripts/workflow-control.mjs init --repo D:\Games\my-game --id first-loop --type SCENE --objective "完成首个可游玩循环"
node scripts/workflow-control.mjs status --repo D:\Games\my-game --id first-loop
node scripts/workflow-control.mjs check --repo D:\Games\my-game --id first-loop
node scripts/workflow-control.mjs stage-status --repo D:\Games\my-game --id first-loop
node scripts/workflow-control.mjs stage-template --repo D:\Games\my-game --id first-loop --output docs/first-loop-v0-delivery.json
node scripts/workflow-control.mjs complete-stage --repo D:\Games\my-game --id first-loop --delivery docs/first-loop-v0-delivery.json
node scripts/workflow-control.mjs advance-stage --repo D:\Games\my-game --id first-loop
node scripts/workflow-control.mjs init-project --repo D:\Games\my-game --project-id my-game
node scripts/workflow-control.mjs check-project --repo D:\Games\my-game
```

`init` 只创建新 JSON，可见对象带一个未完成的 V0；缺少目标、实施包和证据是预期状态。`stage-template` 只导出当前阶段待填交付，不改变阶段。先完成实际交付和展示，再填写模板并运行 `complete-stage`；`advance-stage` 每次只进入下一阶段。禁止准备脚本改写 stage，或批量生成 V0–V3 完成记录。其余字段按[记录契约](references/record-contract.md)编辑。`status`、`stage-status`、`check`、`evidence-summary` 只读；`check` 未满足完成门时退出 1。检查结果仅说明记录约束，不证明真实阶段执行、引擎或人工验收通过。

V2 模板另有待填 `decompositionRef`，必须指向[视觉拆解合同](../roblox-development-workflow/references/visual-decomposition.md)：绑定本对象 V1 效果图、稳定编号和各状态的中文框选标注图片，实际在回复中展示。检查器拒绝缺图或覆盖不全，不能仅凭摘要、架构图或批量记录完成 V2；图片和合同结构通过不等于用户视觉接受，也不改变 deliverables/manual 策略。

V2 同一拆解合同还必须填写可执行的 `restoration` 还原标准与代表性组合计划。V3 通过现有阶段的 `production` 记录样板、复验和扩展事实：先在目标机位完成组合样板，取得当前轮次的真实人工接受，或精确授权范围内的自动视觉检查结论，才能批量生产/全场铺设。未接受只继续修样板；生成授权、技术 PASS、资源 ready 均不能替代。准确记录关系和机器检查边界统一见[阶段契约](references/stage-contract.md#v3-内部样板生产门)，不增加 V2.5 或另立审批清单。

## 实施与证据

- `planned → implementing → validating → complete`；缺依赖时记录 `blocked`，解除后继续原工作项。阶段工具只改变当前阶段的活动/完成记录及相邻 stage，不自动完成整个工作项，也不执行引擎命令。
- F0 核对用户目标与范围，F1 核对实际交付满足目标，F2 核对 Roblox 领域质量，F3 核对真实验证，F4 核对适用的高影响操作授权。F1/F2 的质量判断由代理或人工完成，不能从 JSON 结构检查推断。
- 实施后先推荐 T0–T3，简述理由、覆盖和命令，再自动运行已授权的普通验证；不把失败改成 PASS。
- 每项证据绑定 workItemId、候选、实际时间、类别、执行上下文、结果、非空产物路径与结论；Studio 证据同时绑定 studioId、Place/Universe 与实际 DataModel。逐条 verification、acceptanceResults 和适用 domainReview 关联当前证据；变更影响行为时更新候选并重验，不计算 SHA，也不为无影响的文案调整重开阶段。
- 失败优先 `repair` 原地修复；只缺有效证据用 `revalidate`；真实范围或上游目标变化才 `return`，记录最小影响面。
- 可见交付按[验证覆盖合同](references/coverage-contract.md)逐行收集精确运行证据，不用泛用 Play 覆盖其他视口、输入、语言或动态情景。资源使用按[资源绑定](references/asset-bindings.md)读取总表并核对当前版本、许可及消费回读；退役或换版先处理受影响消费者。

## 人工与外部边界

`deliverables` 要求每阶段实际完成、展示交付与退出核对，无必要人工决定时可以连续推进；`manual` 还要求每阶段的真实用户确认。“不必每步询问”不能解释为跳过阶段。阶段汇报明确当前阶段、实际交付、完成依据、剩余问题和下一步。必要产品选择、授权或人工视觉门只阻断依赖该结果的工作。

视觉情景的 `technical` 与 `visual` 分别记录。探针、布局、日志或 Play 只产生技术结论；没有当前候选的用户判断时，视觉五维与情景的人工结论保持 NOT_RUN。全局方向批准只可作为具体对象的复用来源，不能代替场景/界面的人工显示验收。保留已有效确认及失败、修复、复验来源；不倒填时间或确认，不把历史 FAIL 改为 PASS。

截图可采集并交给用户检查；默认不自动分析截图或判定显示通过。可见交付完成必须有当前候选的用户确认来源；用户明确授权自动视觉检查时，仍按其验收要求报告结果，不把自动检查记录成用户确认。

上传、发布、付费、真实设备、外部写入和破坏性删除须核对已有的精确授权；初始开发任务、测试等级或另一个代理的消息不能扩大授权。先完成本地可审查交付，再请求必要的最终授权。未经明确要求不建分支或 worktree，不发起真机验收。

交付时区分“记录完整”“Studio 运行通过”“人工显示确认”“已保存”“已发布”；缺失项明确标注 `NOT_RUN` 或 `BLOCKED`。
