# 可见工作阶段契约

本契约适用于 `SCENE` 与 `DISPLAY_LAYER` 工作项。阶段字段沿用工作项的 `stage`、`stageReviews` 和现有证据，不建立第二套流程状态机。结构检查只能证明记录满足本契约，不能证明 Roblox 引擎执行正确，也不能代替用户视觉验收。

## 顺序与推进

每个新可见工作项必须从 `stage=V0` 和唯一的 active V0 记录开始。`createStageReview(item, "V0")` 生成实际 `startedAt`，并为本阶段固定交付物和退出检查创建空槽位。阶段只能按 V0、V1、V2、V3、V4 排列；每条历史记录只出现一次，前置阶段必须 complete，且 `item.stage` 必须等于最后一条阶段记录。

每一阶段先填写交付内容、核对每个退出条件、展示结果，再调用 `completeCurrentStage`。完成后由 `advanceStage` 只创建下一阶段的 active 记录。禁止一次生成多个后续阶段或仅凭阶段名称、时间、截图存在就判定完成。完整的旧式 `{stage,path}` 批量记录缺少真实交付与退出依据，会被拒绝；工具不会替它们补时间或结论。

`stagePolicy` 只能是 `deliverables` 或 `manual`。`deliverables` 策略要求每阶段有实际交付和展示记录；完成后可以立即连续推进，不增加人工审批。`manual` 策略还要求每条完成记录有真实 `userMessageRef`。有待决产品决定、必要授权或人工视觉门时，只阻断依赖该结果的阶段。无论使用哪种策略，都不能跳过阶段交付；拼错或缺失策略会阻断阶段状态检查与推进。

阶段汇报应说明当前阶段、实际交付、完成依据、剩余问题和下一步。阶段完成时 `remainingIssues` 必须为空；未解决事项应留在 active 阶段中处理。`nextAction` 记录已完成阶段之后的具体动作。

## 阶段交付与退出条件

每条记录使用以下固定 deliverable ID；每项完成时都要有非空 `summary`，并有同 ID 的唯一 `{result:"PASS",basis}` 退出依据：

| 阶段 | 交付内容 |
| --- | --- |
| V0 | `identity` 对象身份；`target` 目标；`scope` 范围；`host` 宿主；`dependencies` 依赖；`existingResources` 已有资源；`unknowns` 未知项 |
| V1 | `playerFlow` 玩家流程；`states` 状态；`informationHierarchy` 信息层级；`layoutGoals` 布局目标；`visualReferences` 视觉参考；`acceptanceScope` 验收范围 |
| V2 | `instanceStructure` 实例结构；`componentResponsibilities` 组件职责；`dataInterfaces` 数据接口；`resourceConsumption` 资源消费；`ownership` 所有权；`verificationPlan` 验证计划；`visualDecomposition` 冻结 V1 图的编号框选中文标注图及内部拆解合同 |
| V3 | `editComposition` Edit 组合；`wiring` 引用接线；`sourceReadback` 正式源回读；`viewableDelivery` 可查看交付 |
| V4 | `runtimeIntegration` 运行接入；`inputLifecycle` 输入与生命周期；`console` 日志；`dynamicCoverage` 动态覆盖；`humanDisplay` 人工显示验收 |

架构内容按[架构阶段交付](../../roblox-development-workflow/references/foundation-integration.md#架构在-v0v4-中的交付)落入上述既有槽位：V2 的实例结构与职责说明服务端/客户端/共享归属，数据接口说明 Remote 方向及校验，资源消费和所有权列出实际消费者与状态所有者，验证计划覆盖依赖、启动、重生/退出及相关拒绝路径。TDD 和模块清单可作为分阶段交付的引用来源；未涉及的系统明确说明，不另加架构状态机或额外人工门。

3D 模型按[模型阶段交付](../../roblox-development-workflow/references/model-production.md)落实到同一槽位：V2 明确具体生产方法与参数、参考、部件、预算和回读计划；V3 的组合/接线/正式回读/可查看交付分别记录真实生成终态、产物审查、装配、资源消费及 Edit 属性依据。可用[内部模板](../../roblox-development-workflow/assets/templates/model-production.md)定位独立 V2/V3 章节，不增字段或默认审批。当前阶段检查只要求有效通用 readback，不逐字段认证模型报告；整体工作项检查才核对已声明资源消费绑定。不能把阶段 canAdvance 表述为模型已经生成、接入或质量验收通过。

每条阶段记录还包含稳定唯一 `id`、`workItemId`、`candidate`、`status`、`startedAt`、`completedAt`、`path`、`section`、`presentedRef`、`remainingIssues`、`nextAction`、`reuse`、`evidenceIds` 与 `userMessageRef`。开始时间必须是有效且不晚于当前的 ISO 时间；完成时间不早于开始时间，下一阶段开始时间不早于前一阶段完成时间。每个阶段必须有自己的实际开始时间，检查器不会代填时间。

`path` 指向项目内非空 Markdown 文件；`section` 填唯一 ATX 标题文本，不带 `#`。例如 Markdown 中为 `## V0 对象身份与范围`，记录填写 `V0 对象身份与范围`。标题之后、下一个同级或更高级标题之前必须有非空正文。多个阶段可以共用同一文件，但标题和正文必须独立，不能用同一章节重复冒充多个阶段。当前定位器只支持 Markdown ATX 标题。

`presentedRef` 定位实际展示给协作者/用户的阶段交付或交付报告。已有成果可在 `reuse` 中说明 `sourceRef` 来源、`scope` 适用范围及 `remaining` 当前阶段尚需完成的工作。全局美术方向、另一场景或其他界面的确认不能冒充当前对象的交付和验收。

V1 必须冻结本对象各必要状态的完整效果图；V2 记录另含 `decompositionRef`，指向[视觉拆解合同](../../roblox-development-workflow/references/visual-decomposition.md)的项目内 JSON。active V2 可保留空值；完成前核对本工作项已完成 V1 的源图身份/版本、图片文件、稳定组件编号及状态覆盖，禁止只填交付摘要就认定拆解完成。标注图须在回复中直接展示，图内中文引线说明视觉来源、消费、装配与生产边界；内部 Markdown、架构图、合同或下载链接不能替代。`stage-template` 仅在 V2 输出此待填引用，不生成图片、冻结来源或人工 PASS；`complete-stage` 和后续推进均检查合同。其余阶段不用该字段。

V2 检查只证明合同与图片文件关系符合规则，不证明图片内容正确、来源已经人工确认或引擎通过；实际展示及必要视觉门须按真实过程核对。仍按 deliverables/manual 推进，不将新增图交付变成默认逐阶段人工审批。无当前用户判断时人工视觉结论保持 NOT_RUN。

V0–V2 的有效记录不会因无关文案变更而要求候选号相同。V3 和 V4 必须绑定当前 candidate。V3 的 `evidenceIds` 至少包含一条当前候选 Edit readback；先核实目标的 Studio、Place、Universe 身份完整，再通过通用证据检查器校验工作项、Studio、Place、Universe、summary、ISO 采集时间、项目内非空文件及可选 `checkId`，并拒绝未来采集时间。空白、null 或 undefined 目标不能因与证据值相等而通过。正式源回读不由临时运行实例替代。

## 技术证据与人工结论

探针、布局参数、日志与交互断言作为技术证据记录在工作项的 `evidence` 中，并由阶段 `evidenceIds` 引用。人工视觉质量和动态情景结论留在 `visualReview`，须绑定当前候选的真实用户回复与 visual 证据。任何技术 PASS 都不能自动生成视觉 PASS；两个视口运行通过也不能自动判定人工视觉情景通过。

完成 V4 时，控制器必须注入 `validateExit(item, repo, review)`，由完整可见交付校验器核对运行、输入、生命周期、日志、动态覆盖和当前候选人工显示结论。V4 阶段结构检查本身不代表这个门已通过。完成 V4 也只完成阶段记录，不会自动把工作项 `state` 改为 `complete`。

复验期间产生的 FAIL/BLOCKED 退出记录不可改写为 PASS。完成操作会把当前阶段既有的失败条目追加到 `exitCheckHistory`，随后用新一轮逐项退出结论替换当前 `exitChecks`；具体失败与修复报告仍应保留在项目证据中。
