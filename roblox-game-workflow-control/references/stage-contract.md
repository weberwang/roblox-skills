# 可见工作阶段契约

本契约适用于 `SCENE` 与 `DISPLAY_LAYER` 工作项。阶段字段沿用工作项的 `stage`、`stageReviews` 和现有证据，不建立第二套流程状态机。结构检查只能证明记录满足本契约，不能证明 Roblox 引擎执行正确，也不能代替用户视觉验收。

## 顺序与推进

每个新可见工作项必须从 `stage=V0` 和唯一的 active V0 记录开始。`createStageReview(item, "V0")` 生成实际 `startedAt`，并为本阶段固定交付物和退出检查创建空槽位。阶段只能按 V0、V1、V2、V3、V4 排列；每条历史记录只出现一次，前置阶段必须 complete，且 `item.stage` 必须等于最后一条阶段记录。

每一阶段先填写交付内容、核对每个退出条件、展示结果，再调用 `completeCurrentStage`。完成后由 `advanceStage` 只创建下一阶段的 active 记录。禁止一次生成多个后续阶段或仅凭阶段名称、时间、截图存在就判定完成。完整的旧式 `{stage,path}` 批量记录缺少真实交付与退出依据，会被拒绝；工具不会替它们补时间或结论。

`stagePolicy` 只能是 `deliverables` 或 `manual`。`deliverables` 策略允许普通阶段在实际交付、展示和退出核对后连续推进；`manual` 还要求每个普通阶段有真实 `userMessageRef`。两种策略都必须通过 V2 的拆解图确认与后置布局图确认、V3 的资源级人工接受，以及 V4 的场景样板门和最终人工显示验收。必要门不能由阶段策略绕过；未闭合时只阻断依赖它的后续工作。无论使用哪种策略，都不能跳过阶段交付；拼错或缺失策略会阻断阶段状态检查与推进。

阶段汇报应说明当前阶段、实际交付、完成依据、剩余问题和下一步。阶段完成时 `remainingIssues` 必须为空；未解决事项应留在 active 阶段中处理。`nextAction` 记录已完成阶段之后的具体动作。

## 阶段交付与退出条件

每条记录使用以下固定 deliverable ID；每项完成时都要有非空 `summary`，并有同 ID 的唯一 `{result:"PASS",basis}` 退出依据：

| 阶段 | 交付内容 |
| --- | --- |
| V0 | `identity` 对象身份；`target` 目标；`scope` 范围；`host` 宿主；`dependencies` 依赖；`existingResources` 已有资源；`unknowns` 未知项 |
| V1 | `playerFlow` 玩家流程；`states` 状态；`informationHierarchy` 信息层级；`layoutGoals` 布局目标；`visualReferences` 视觉参考；`acceptanceScope` 验收范围 |
| V2 | `instanceStructure` 实例结构；`componentResponsibilities` 组件职责；`dataInterfaces` 数据接口；`resourceConsumption` 资源消费；`ownership` 所有权；`verificationPlan` 验证计划；`visualDecomposition` 冻结 V1 图的编号框选中文标注图及内部拆解合同 |
| V3 | `resourceProduction` 正式资源生产；`resourceAcceptance` 资源级人工接受；`assetIdentity` 资源身份与登记；`productionRecords` 资源生产记录 |
| V4 | `editComposition` Edit 组合；`wiring` 引用接线；`sourceReadback` 正式源回读；`viewableDelivery` 可查看交付；`runtimeIntegration` 运行接入；`inputLifecycle` 输入与生命周期；`console` 日志；`dynamicCoverage` 动态覆盖；`humanDisplay` 人工显示验收 |

架构内容按[架构阶段交付](../../roblox-development-workflow/references/foundation-integration.md#架构在-v0v4-中的交付)落入上述既有槽位：V2 的实例结构与职责说明服务端/客户端/共享归属，数据接口说明 Remote 方向及校验，资源消费和所有权列出实际消费者与状态所有者，验证计划覆盖依赖、启动、重生/退出及相关拒绝路径。TDD 和模块清单可作为分阶段交付的引用来源；未涉及的系统明确说明，不另加架构状态机或额外人工门。

3D 模型按[模型阶段交付](../../roblox-development-workflow/references/model-production.md)落实到同一槽位：V2 明确具体生产方法与参数、参考、部件、预算和回读计划；V3 记录正式资源生产、资源级人工接受、身份登记和生产事实；V4 记录场景样板、Edit 组合、接线、正式源回读、可查看交付及运行消费。可用[内部模板](../../roblox-development-workflow/assets/templates/model-production.md)定位 V2/V3/V4 章节。阶段检查核对通用 readback 与 V4 场景样板记录，不逐字段认证模型报告或画面；整体工作项检查另核对已声明资源消费绑定。不能把 canAdvance 表述为引擎或最终质量验收通过。

每条阶段记录还包含稳定唯一 `id`、`workItemId`、`candidate`、`status`、`startedAt`、`completedAt`、`path`、`section`、`presentedRef`、`remainingIssues`、`nextAction`、`reuse`、`evidenceIds` 与 `userMessageRef`。开始时间必须是有效且不晚于当前的 ISO 时间；完成时间不早于开始时间，下一阶段开始时间不早于前一阶段完成时间。每个阶段必须有自己的实际开始时间，检查器不会代填时间。

`path` 指向项目内非空 Markdown 文件；`section` 填唯一 ATX 标题文本，不带 `#`。例如 Markdown 中为 `## V0 对象身份与范围`，记录填写 `V0 对象身份与范围`。标题之后、下一个同级或更高级标题之前必须有非空正文。多个阶段可以共用同一文件，但标题和正文必须独立，不能用同一章节重复冒充多个阶段。当前定位器只支持 Markdown ATX 标题。

`presentedRef` 定位实际展示给协作者/用户的阶段交付或交付报告。已有成果可在 `reuse` 中说明 `sourceRef` 来源、`scope` 适用范围及 `remaining` 当前阶段尚需完成的工作。全局美术方向、另一场景或其他界面的确认不能冒充当前对象的交付和验收。

V1 必须冻结本对象各必要状态的完整效果图；V2 记录另含 `decompositionRef`，指向[视觉拆解合同](../../roblox-development-workflow/references/visual-decomposition.md)的项目内 JSON。active V2 可保留空值；完成前核对本工作项已完成 V1 的源图身份/版本、图片文件、稳定组件编号及状态覆盖，禁止只填交付摘要就认定拆解完成。标注图须在回复中直接展示，图内中文引线说明视觉来源、消费、装配与生产边界；内部 Markdown、架构图、合同或下载链接不能替代。V2 必须按序完成拆解图人工确认、生成并展示布局图、布局图人工确认。两条确认记录都绑定当前工作项、候选和图片身份，布局确认还引用拆解确认；前一确认未通过时不得生成布局图，任一确认缺失时 V2 不能完成。`stage-template` 仅在 V2 输出此待填引用，不生成图片、冻结来源或人工 PASS；`complete-stage` 和后续推进均检查合同。其余阶段不用该字段。

V2 结构检查只证明合同与图片文件关系符合规则，不证明图片内容正确或引擎通过；两张图的顺序展示及两条独立人工确认是固定阶段门，deliverables 与 manual 都必须遵守。其他普通阶段仍按各自策略推进；无当前用户判断时人工视觉结论保持 NOT_RUN。

V0–V2 的有效记录不会因无关文案变更而要求候选号相同。V3 和 V4 必须绑定当前 candidate。V3 的 `resourceAcceptance` 固定为 `{mode:"manual",result:"PASS",workItemId,candidate,componentIds,userMessageRef,reviewedAt,evidenceIds,outputs}`，覆盖 V2 的全部组件；人工消息必须明确接受当前候选的资源范围。`outputs` 对每个 V2 componentId 必须恰好有一条引用：`productionRoute=ROBLOX_NATIVE` 使用 `{componentId,sourceRef}`，指向项目内非空的原生制作源文件；V3 可准备模块，不接入正式 Scene。`IMAGE_ASSET`、`REUSE`、`MODEL_3D`、`MATERIAL`、`VFX` 使用 `{componentId,resourceId,revision}`，引用唯一 `docs/asset-register.json` 条目；资源必须为当前 `ready` 修订，并有已批准许可及来源/产出证据。复用资源同样登记引用，不复制资产元数据；V3 不要求 V4 消费者或 Edit 回读。

`evidenceIds` 必须引用当前 visual 资源预览，其 `resources` 为 `{stageReviewId,componentIds,outputs}`；每条证据只列入该预览的组件，`outputs` 逐项与 `resourceAcceptance.outputs` 中对应引用一致。没有新资源时仍需真实确认所复用资源及适用范围，不能用 `ready` 状态替代。正式场景装配与 Edit 回读属于 V4。V4 的 `evidenceIds` 至少包含一条当前候选 Edit readback；先核实目标的 Studio、Place、Universe 身份完整，再通过通用证据检查器校验工作项、Studio、Place、Universe、summary、ISO 采集时间、项目内非空文件及可选 `checkId`，并拒绝未来采集时间。空白、null 或 undefined 目标不能因与证据值相等而通过。正式源回读不由临时运行实例替代。

## 技术证据与人工结论

### V3 资源接受与 V4 场景样板门

V2 `decompositionRef` 内的 `restoration` 是还原规格与 V4 场景样板计划的唯一结构入口，字段见[视觉拆解合同](../../roblox-development-workflow/references/visual-decomposition.md)。V3 只完成正式资源生产、身份登记与资源级人工接受；资源接受字段和证据边界见上文。V3 不声明正式 Scene 装配完成。既有 `production:{sampleAttempts,expansions}` 及其阶段内样板记录整体归入 V4，用于正式场景组合、样板接受和扩展铺设，不另设阶段或状态。

进入 V4 后，先在 `restoration.samplePlan.viewId` 的机位做最小代表性场景组合，核对比例、轮廓、材质尺度、接缝、遮挡、空间层次与统一风格；孤立模型预览不能代替组合。未接受时 active V4 可继续修样板；扩展场景铺设及 V4 完成必须先通过当前样板门。已有生成/上传授权不失效，但也不构成显示接受；已通过 V3 资源接受的合格资源可以复用。

每轮 `sampleAttempts` 记录唯一 `id`、递增正整数 `revision`、实际 `candidate`、`viewId`、`componentIds`、`requirementIds`、真实 `createdAt`、`evidenceIds`、`checks`、`acceptance`。组件和要求覆盖 V2 最小组合且不得引用未知编号。`checks` 的唯一固定 id 为 `proportion/silhouette/materialScale/seams/occlusion/depth/style`，各含 `result=PASS|FAIL|NOT_RUN` 与具体 `basis`；PASS 是实际视觉检查声明，不从加载、数量或布局指标推导。视觉证据绑定通用目标身份，另有 `sample:{stageReviewId,sampleId,revision,viewId}`；截图不得早于本轮创建或复用旧轮次路径。证据 result=PASS 只表示采集记录可用，不等于样板已接受。

`acceptance` 含 `scope:"sample"`、`sampleId/candidate/revision/viewId`、`result=NOT_RUN|PASS|FAIL`、`mode=manual|automatic`、`evidenceIds`、`userMessageRef`、`authorization`、`reviewedAt`。初始 NOT_RUN、证据为空、用户引用和时间为空；作出结论时引用本轮全部 visual 证据，时间不得早于截图。manual 必须引用真实且明确接受/拒绝当前样板的专属用户回复，`authorization=null`；“继续”“生成完了”、V1 方向批准或旧确认不能替代。automatic 必须有精确 `authorization:{userMessageRef,scope:"sample",sampleId,candidate,revision,viewId}`，`acceptance.userMessageRef` 留空；明确授权范围外仍交用户检查，自动结论不写成人工确认，也不自动满足 V4 最终人工门。PASS 前七项组合检查均须 PASS。

已有自动视觉检查授权确实覆盖当前样板范围时，可沿用同一授权消息，每轮仍需单独绑定身份、采集新截图并给出新检查结论；授权来源的复用不等于复用旧检查结果，也不要求新增审批。检查器不能认证授权消息的实际语义，执行者必须核实适用范围。

每条 `expansions` 记录 `kind=scene-assembly|full-scene-layout`、具体 `scope`、`sampleId/revision/candidate` 和真实 `startedAt`。开工时必须引用当时最新、已接受的样板，且不得早于其 `reviewedAt` 或晚于已登记的 V4 完成时间。后来的修复不能追认之前违规扩批。完成 V4 时最新样板须属于当前候选并已接受；资源 ready、生成成功、三角数、编译/加载 PASS 都不能绕过此门。完成接口拒绝删除或改写已有 PASS/FAIL 样板及扩展历史；待检查轮次可补充当前真实结论，修复则追加新轮次。

修复应追加新轮次、新截图和新结论，保留旧候选与 FAIL；明显视觉差距先在 `remainingIssues` 和证据中记录影响范围，按源图/镜头构图、整体空间比例、组合材质光照、单体细节中最早失配层级修复，不以零散实例修补宣称整体接近完成。工作项最终 `visualReview` 继续负责全场与运行显示验收。检查器只查记录结构、身份、引用和时序，不能认证消息语义、截图内容或未登记的实际扩批行为。

探针、布局参数、日志与交互断言作为技术证据记录在工作项的 `evidence` 中，并由阶段 `evidenceIds` 引用。人工视觉质量和动态情景结论留在 `visualReview`，须绑定当前候选的真实用户回复与 visual 证据。任何技术 PASS 都不能自动生成视觉 PASS；两个视口运行通过也不能自动判定人工视觉情景通过。

完成 V4 时，控制器必须注入 `validateExit(item, repo, review)`，由完整可见交付校验器核对运行、输入、生命周期、日志、动态覆盖和当前候选人工显示结论。V4 阶段结构检查本身不代表这个门已通过。完成 V4 也只完成阶段记录，不会自动把工作项 `state` 改为 `complete`。

复验期间产生的 FAIL/BLOCKED 退出记录不可改写为 PASS。完成操作会把当前阶段既有的失败条目追加到 `exitCheckHistory`，随后用新一轮逐项退出结论替换当前 `exitChecks`；具体失败与修复报告仍应保留在项目证据中。
