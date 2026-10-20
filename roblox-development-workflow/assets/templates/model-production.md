# 模型生产交付

仅在工作项涉及 3D 生产时，将相关内容并入当前工作项已有 V2/V3/V4 阶段交付。此文件是内部规格与事实报告，不是第二份资源总表、独立状态系统或额外审批清单，也不代替 V2 用户侧拆解图；V3 资源接受写入其固定 `resourceAcceptance` 交付，V4 场景样板与扩展权威记录位于现有 `stageReviews.production`。阶段各自实际完成后才填退出依据，不批量登记历史。

工作项：待填写。组件编号/componentId：待填写。V1 来源/版本/状态：待填写。生产者与唯一 Studio 写者：待填写。

## V2 模型生产规格

- 生产类别：待填写 `productionRoute`；先分流合格资源复用、规则几何原生构建和纯表面修改。新几何组件的具体生成模式与选择依据统一填写在下方“逐组件路由结果”表中。
- 冻结来源与还原要求：待填写 source image 的版本/状态/用途、目标 viewId、`decomposition.restoration` 中关联的要求 ID；相机、FOV、视口和锚点只有实测时写测量，未知值及原因明确保留。
- 受限替代（仅适用时）：待记录用户明确指定的外部路线，或 Roblox 能力缺口及已确定替代方案的来源；默认不启动外部制作。
- 来源与消费者：待填写 sourceRef、公共资源 ID/修订（复用时）、许可和消费节点；生产规格定位不能覆盖真实来源身份。
- 目标规格：待填写尺寸、轴向、Pivot、部件职责、碰撞、锚定、交互、材质/贴图、Rig/动画需求与 Streaming 假设。
- 调用计划：待填写工具、实际支持的参数、用户提示/参考图来源、分件和可调属性；不适用参数明确说明，不能编造通用图像入参。
- 候选与造型约束：待填写候选轮廓、比例、风格核对方式；工具是否能直接使用参考图及其真实入参；非等比缩放的必要性和造型/纹理尺度复查。文本生成只记为待审候选。
- 预算与验证：待填写网格/实例/纹理预算、实际测量方法、必要退出条件、可交接 V4 的验证及不支持的测量项。
- 写入与恢复：待填写临时产物与正式父级、共享影响、原位替换基线、单写者和失败恢复范围。
- 交付与退出：待填写直接展示的编号标注图来源、逐项依据、剩余问题和下一步；manual 或必要人工决定的真实确认另记现有阶段字段。

### 逐组件路由结果

只为需要新几何生成的项逐行填写；已合格资源复用、规则几何原生构建和纯表面修改属于前置分流，不填作生成模式。复用 `componentId`、`productionBoundary`、`sourceRef`、`assembly`、`consumerNodeId` 及 `decomposition.restoration.requirements[].id`，不增加 JSON 字段或资源表。路由依据统一见[按拆解结果路由生成模式](../../references/model-production.md#按拆解结果路由生成模式)。主生成模式只有网格生成和可调程序化两种；同一组件含不同生产职责时，先在原 `productionBoundary` 为每个内部生产单元指定稳定名称或编号，本表每单元一行，且每个单元只记录一种主生成方法。`restoration.requirements[].productionMethod` 须能定位到 `componentId`、内部单元稳定名称/编号及其方法；跨单元的要求列全涉及单元并说明组合装配验证。只有内部单元需要独立消费、编号或状态覆盖时，才提升为正式子组件并维护已有父子关系与标注覆盖。内部生产细分不代表用户明确声明了模型部件，也不构成第三种工具模式。以下内容均待项目填写，空表和已填自由文本都不表示检查器已验证，也不预填质量结论。

| `componentId` / `productionBoundary` 内部单元稳定名称或编号 | 关联还原要求 ID / `productionMethod` 对应关系 | 轮廓、表面、尺寸与接缝约束 | `sourceRef` | `assembly` / `consumerNodeId` | 基础体能否充分表达及依据 | 需要的可调参数 | 直接输入参考图是否为硬性要求及依据 | 主生成模式及理由 | 另一模式不适用点 | 工具输入能力缺口、后处理与组合样板验证 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |

## V3 正式资源生产与接受

- 当前目标与源：待填写 Studio/Place/Universe、Edit 模式、源数据/同步方式及资源正式登记位置；不将其表述为正式场景装配。
- 调用与任务事实：待填写参数/结果文件、jobId（仅后台任务）、真实终态和新旧路径；未执行为 NOT_RUN，不凭任务受理宣称完成。
- 候选资源审查：待填写实际产物、脚本/属性/依赖审查、轮廓、比例、材质配对、贴图替换或切分映射及资源预算。
- 资源级接受：填写 `resourceAcceptance:{mode:"manual",result:"PASS",workItemId,candidate,componentIds,userMessageRef,reviewedAt,evidenceIds,outputs:[]}`。`componentIds` 覆盖 V2 全部组件，`outputs` 为每个组件恰好一条纯引用：`ROBLOX_NATIVE` 使用 `{componentId,sourceRef}` 指向项目内非空原生制作源文件；其他资源路由使用 `{componentId,resourceId,revision}` 指向唯一资源总表条目及当前 ready 修订。资源条目须有已批准许可和来源/产出证据；复用时也写引用，不复制资产元数据。V3 可准备原生模块，不接入正式 Scene，也不要求 V4 消费者或 Edit 回读。`evidenceIds` 引用当前 visual 资源预览，其 `resources:{stageReviewId,componentIds,outputs}` 仅含预览组件，`outputs` 必须逐项匹配接受记录中的相同引用；`userMessageRef` 指向用户对当前资源范围的真实接受。没有新资源时记录确认复用的资源与范围，不以 `ready` 代替接受。
- 资源身份与生产事实：待填写资源总表 ID/当前修订、真实 Asset ID 或实例路径、来源/许可，以及 V3 的 `resourceProduction`、`assetIdentity`、`productionRecords` 退出依据。V3 不填写正式场景组合、消费者接线或 Edit 回读完成结论；正式消费在 V4 记录。

| 资源核对项 | 初始技术结果 | 实际值与证据/未完成原因 |
| --- | --- | --- |
| 目标身份、资源路径、部件与父级 | NOT_RUN | 待填写 |
| 实测尺寸、轴向、Pivot、碰撞/锚定 | NOT_RUN | 待填写 |
| 可调属性、脚本、依赖与权限 | NOT_RUN | 待填写 |
| 材质配对、网格/贴图引用 | NOT_RUN | 待填写 |
| 来源、许可、当前资源修订 | NOT_RUN | 待填写 |
| 可测预算及未测指标 | NOT_RUN | 待填写 |

| V3 资源结论 | 状态 | 当前候选、证据或未完成原因 |
| --- | --- | --- |
| 资源生产及持久化 | NOT_RUN | 待填写 |
| 当前资源范围人工接受 | NOT_RUN | 待填写 |
| 资源身份与登记 | NOT_RUN | 待填写 |
| 生产事实记录 | NOT_RUN | 待填写 |

## V4 场景组合、回读与运行交接

- 当前目标：运行 `stage-status` 确认当前 active V4，并核对真实 Studio/Place/Universe、Edit 模式、源数据/同步方式与修改前基线。
- 代表性样板：按 V2 `restoration.samplePlan` 在指定 viewId 组合最小且有代表性的内容，检查比例、轮廓、材质尺度、接缝、遮挡、层次和风格。逐轮记录到现有 `stageReviews.production.sampleAttempts`，绑定当前 candidate/revision/viewId、组件与要求 ID、创建时间、visual 证据、检查结果及接受结果。
- 样板接受：绑定同一 `sampleId`、`candidate`、`revision`、`viewId` 和当前 `evidenceIds`，`scope: sample`；按项目允许的 `manual`/`automatic` 策略记录。人工确认引用用户对当前场景样板的真实消息；自动模式仅在明确授权后使用，并精确引用授权身份。旧候选、V3 资源接受、全局方向批准、生成成功、技术 PASS 或资源 ready 均不构成场景接受。
- 扩展记录：`stageReviews.production.expansions` 的 `kind` 为 `scene-assembly` 或 `full-scene-layout`，记录 `sampleId`、`revision`、`candidate`、`startedAt` 和范围，并引用开工前已经接受的最新样板。未接受前只修复和复验样板；已授权生成/上传仍有效，合格既有资源可复用。
- 正式装配与回读：样板接受后，将资源接到计划节点，校正尺寸、轴向、Pivot、父级、碰撞/锚定、材质和引用。通过 `search_game_tree`、`inspect_instance`、脚本只读工具及必要的有界只读 Luau 回读 Edit 正式源，并记录 Console 增量；填写工作项与 readback 的 `assetBindings`。
- V4 交付：`editComposition`、`wiring`、`sourceReadback`、`viewableDelivery` 记录实际组合、接线、正式源和可查看候选；运行加载、输入/交互、碰撞、生命周期、Streaming、动画和设备性能按实际需要验证。生成和 Edit 技术结果不自动完成运行用例。

| Edit 回读对象 | 初始技术结果 | 实际值与证据/未完成原因 |
| --- | --- | --- |
| 目标身份、正式路径、部件与父级 | NOT_RUN | 待填写 |
| 实测尺寸、轴向、Pivot、碰撞/锚定 | NOT_RUN | 待填写 |
| 可调属性、脚本、依赖与权限 | NOT_RUN | 待填写 |
| 材质配对、网格/贴图引用 | NOT_RUN | 待填写 |
| 来源、许可、当前修订与消费者绑定 | NOT_RUN | 待填写 |
| 可测预算及未测指标 | NOT_RUN | 待填写 |
| 正式源/同步方式、Console 与可查看候选 | NOT_RUN | 待填写 |

| V4 场景和运行结论 | 状态 | 当前候选、证据或未完成原因 |
| --- | --- | --- |
| 正式绑定及技术加载 | NOT_RUN | 待填写 |
| 当前代表性场景样板显示接受 | NOT_RUN | 待填写 |
| 全场视觉还原 | NOT_RUN | 待填写 |
| 运行验证与最终验收 | NOT_RUN | 待填写 |
| 保存 / 上传 / 发布 | NOT_RUN | 分别记录实际状态与证据 |

仅依据实际检查更新结果；不适用项说明理由。失败、修复和复验分别保留，不把历史失败改为通过。人工显示确认：NOT_RUN。当前候选、截图/检查要点及真实用户判断来源：待实际发生后填写。若用户指出明显差距，记录受影响视图/要求/组件并先修复最早失配层级；保留旧候选、FAIL 与复验来源，不改写历史结论。未经实际验证，不填写通过或虚构阶段时间、Asset ID、用户确认。剩余问题：待填写。退出依据与下一步：待填写。
