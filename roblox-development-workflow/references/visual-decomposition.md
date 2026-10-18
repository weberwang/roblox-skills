# V2 视觉拆解交付与合同

本参考将场景/界面 V2 视觉拆解落实到 Roblox 原生对象及现有 `stageReviews`。项目级模块/场景架构拆分继续写 TDD 与模块清单；本合同只适用于 `SCENE`／`DISPLAY_LAYER` 的 V2，不新增阶段或状态机。先完成并冻结本对象 V1 效果图，再拆解，明确逐项还原标准和代表性样板计划，V2 退出后才进入 V3。

## 从效果图反查生产边界

从完整 V1 图逐项反查文字造型、底板、填充、边框、图标、光影、装饰与空间结构，不能只写“按钮”“结算面板”等功能名。每项分配稳定正整数编号 `elementIndex` 与 `componentId`，绑定消费节点、适用状态、所有者和生产归属。原子资产内部的显著特征也说明归属；原生文本、简单填充及无需生产的项同样编号。逐项判断轮廓、比例、位置、空间层次、材质、纹理尺度、光照、水面/岸沿及其他显著表面特征，不能因已经有道具模型就遗漏环境表现。

先查已登记的字体、图片、模型、材质、图标及组件。复用合格资源保留本地拆解编号，在 `sourceRef` 中绑定公共资源 ID、修订和登记来源；新生产项记已选来源或规格来源，不能伪造正式 Asset ID。V3 资源消费再按[资源使用流程](shared-asset-usage.md)绑定总表、实际实例及回读，不能用 V2 计划证明资源已接入。

| `productionRoute` | 适用边界 |
| --- | --- |
| `IMAGE_ASSET` | 特色字标、纹理、复杂底板或图标等位图生产；明确透明、切片、分辨率和消费规格。 |
| `ROBLOX_NATIVE` | 普通操作文案、可变数字、本地化及简单填充/边框等原生文本、UI 或几何；说明可达到目标的真实能力。 |
| `REUSE` | 已有合格资源或组件；记录实际公共资源身份、修订及适用范围。 |
| `MODEL_3D` | 独立空间形体与模型；按[Roblox 模型生产选型](model-production.md#按拆解结果路由生成模式)基于逐项还原要求明确网格生成或可调程序化，以及尺度、部件、材质槽和消费边界；外部制作仅记录已确定的受限替代。 |
| `MATERIAL` | 材质或表面表现，说明消费对象和搭配资源。 |
| `VFX` | 特效资源与表现，说明触发、层级、生命周期及宿主。 |

路线由视觉显著性、变化、本地化/复用需求和实际渲染能力决定。不能因为“程序可以画”就把特色金属、纹理、立体光影降成普通色块。按来源拆分不等于拆散功能组件：交互、状态、数据、本地化、裁切和布局由原组件统一控制。动态文字不烘焙成固定图片；特色文字造型仍须保留对应生产方案。效果图和参考图只提供目标，禁止裁切、抠取为正式资源，或整图铺底隐藏混合来源。

3D 的类别与具体工具分开：合格现有模型用 REUSE，直接规则几何用 ROBLOX_NATIVE；只改表面时用 MATERIAL。MODEL_3D 必须在既有 `productionBoundary` 和阶段规格中写明具体方法与理由，并在标注图上显示；关联的 `restoration.requirements[].productionMethod` 说明各要求如何实现。生成模式依据及两种工具边界见[按拆解结果路由生成模式](model-production.md#按拆解结果路由生成模式)，并用[模型生产模板](../assets/templates/model-production.md)按组件记录关联要求 ID、约束、工具输入能力和样板验证。`sourceRef` 保留来源/规格定位，`assembly`、`owner`、`consumerNodeId` 与验证计划衔接 V3 的生成、装配和回读。不另造模型专属拆解字段或第二份资源表，也不将自由文本已填写误称为程序已验证选型正确。

## V2 还原标准

`decomposition.restoration` 是 V2 对效果图的可执行还原规格，仍属于当前拆解合同和 V2，不另建记录或阶段。`views` 中每个目标视图绑定冻结的 `sourceImageId`，说明该图/视图的用途、目标机位、FOV、视口和构图锚点。优先记录项目确实指定或实测的相机与尺寸；参考图没有提供的信息写明未知及原因，不从截图外观臆造数值或精度。锚点要能指认场景中应保持的相对位置/边界关系。

`requirements` 用稳定 `id` 逐项对应来源图和一个或多个 `componentIds`，并记录 `aspect`、`productionMethod`、`consumer`、`verification`、`flexibility` 与 `adjustmentReason`。每个工作项至少覆盖 `silhouette`、`proportion`、`placement`、`depth`、`palette`、`material`、`textureScale`、`lighting`、`surface`、`signature` 十类维度；水面、岸沿和背景层次等显著特征要落实在相应要求中，不适用时填明确理由。要求应描述能检查的目标，例如轮廓转折、物件相对高度/间距、遮挡顺序、色板值或纹理重复尺度；只写“风格一致”“接近参考”不足以验收。

`target.status` 区分 `specified`（来源或项目给出的目标）、`measured`（真实测量结果）、`unknown`（当前未知）和 `not-applicable`（明确不适用），`value` 与 `basis` 分别记录目标/结果和依据。只有做过实际测量才可标 `measured`；例如计划采用的相机值写作指定值，来源无法确定的目标写明未知和原因，不能把计划或估算伪装成测量。每条要求都要指明将如何生产、由谁/哪个节点消费、以什么证据验证；固定项与允许为玩法调整的项分别标记，`adjustmentReason` 要说明固定原因或玩法调整理由/边界。

`samplePlan` 在 V2 指定 V3 的 `viewId`、代表性 `componentIds`、要验证的 `requirementIds` 和组合说明。选择能暴露比例、轮廓、材质/纹理尺度、接缝、遮挡、空间层次与风格关系的最小组合，而非仅挑孤立模型。它是后续 V3 生产门的计划，V2 不能用计划冒充已经完成或接受的样板。

## 用户侧图片交付

在冻结的 V1 **完整效果图**上逐项框选，使用稳定编号和引线连接**图内中文标注**。标注用途、来源路线、父子/同组关系、装配方法和生产边界；无需生产也明确标出。框选位置不证明实例父子关系，父子关系必须来自布局、状态或行为依赖，其他关系用同组表达。

图内包含工作项、V2、交付版本、图例、核对结果和待确认范围。只做本地结构检查时明确标注“记录检查”，人工判断未取得时标 NOT_RUN，不能标成引擎通过或用户已验收。总览过密时加局部放大图并复用编号，不遮挡必要视觉特征；不同状态和独立显示层分别交付，全部覆盖后才提交阶段退出。

V2 用户侧只直接展示图片，阶段汇报所需的实际交付、依据、剩余问题和下一步一并放在图内；不附文字段落、表格、编号清单或代码块作为拆解说明，也不能只给路径或下载链接。内部合同供后续实施追溯，不充当用户侧输出。按项目规则将位图生成/编辑委派给 `image_generator`，提供冻结源图和全部标注约束；没有源图时先补 V1，不能为了让检查通过生成无来源的示例图。Studio 插件没有专用标注图编辑器，Edit 截图、结构探针或生成工具成功不能替代 V2 交付。

## 内部结构化合同

复制[待填模板](../assets/templates/visual-decomposition.json)到游戏工程，例如 `docs/<工作项>-v2-decomposition.json`。模板不构成完成产物，空值、空集合及覆盖声明 false 会阻断 V2 完成。`stage-template` 导出的当前 V2 交付填写 `decompositionRef` 指向该项目内 JSON；其他阶段不使用此字段。`path`／`section` 仍定位内部阶段规格，`presentedRef` 记录实际展示来源，两者不能代替图片。

| 字段 | 约定 |
| --- | --- |
| `version / workItemId / candidate` | 固定版本 1、当前工作项 ID、V2 阶段自身的候选；不强制跟随无关文案变更后的 item.candidate。 |
| `sourceImages[]` | 每项含唯一 `id`、本工作项已完成 V1 的 `stageReviewId` 和 `candidate`、图片 `version`、项目内 `path`、实际正整数 `width/height`、唯一 `state` 及非空 `frozenRef`。后者指向真实冻结/展示来源，不能借全局方向确认冒充本图。 |
| `components[]` | 每项含唯一 `componentId`、唯一正整数 `elementIndex`、`purpose`、`visualFeatures`、`productionRoute`、`sourceRef`、`consumerNodeId`、`parentId`、`group`、`assembly`、`layoutRef`、`productionBoundary`、`owner` 和非空唯一 `states`。除 parentId/group 可为 null 外文本必填。 |
| `previews[]` | 每项含项目内标注图片 `path`、`sourceImageId`、真实直接展示的 `presentedRef` 和非空 `annotations`。图片支持 PNG/JPEG/WebP，不能指回源图本身或用 Markdown/Draw.io 代替。 |
| `annotations[]` | 每项含 `componentId`、图内中文 `label`、`bounds: {x,y,width,height}`；坐标指向源图像素，宽高为正且框在源图范围内，不是 Roblox 屏幕或实例坐标。 |
| `coverage` | `allSignificantElementsMapped` 完整时才填 true；`exclusions[]` 每项说明 `description/reason`。排除理由不能掩盖属于本工作项验收范围的显著元素。 |
| `restoration` | 必填 `views[]`、`requirements[]`、`samplePlan`；视图冻结目标机位/FOV/视口/锚点。每条还原要求绑定来源图、组件、十类 `aspect` 之一、目标状态与依据、生产方法、消费者、验证方式、调整策略/原因。目标状态只能使用 `specified`、`measured`、`unknown`、`not-applicable`；未知和不适用也需写明值与依据。样板计划引用已有视图、组件和要求，并说明最小组合。 |

`consumerNodeId` 使用[可见合同](responsive-ui-contract.md)的稳定计划节点身份；V2 可以描述尚未创建的节点，V3 再核对实际 `game.` 路径。`parentId` 引用另一个 componentId 或为 null，父引用必须完整且无环；仅同组时用 `group`。`assembly` 说明组合方式，`layoutRef` 说明参照与约束，`productionBoundary` 明确资产/原生/复用的生产分工，不用 Unity GUID、Importer、Prefab 或 RectTransform 代替 Roblox 字段。

组件 `states` 必须属于源图声明的状态。每张源图至少有一个预览；每项在声明的每个状态中至少有一次标注，预览内不重复 componentId；总览与局部图可共用编号。组件与图共享编号，不把一个状态中的标注自动当成其他状态已覆盖。

## 退出检查与人工边界

V2 固定交付新增 `visualDecomposition`：内部合同及 `restoration`、源图、图片、组件/状态/十类还原维度覆盖和实际展示均齐备，并与实例结构、职责、接口、资源、所有权、验证计划一并逐项写退出依据，才能 `complete-stage` 后 `advance-stage`。`restoration` 的机位与目标值是计划/来源信息，不代表 V3 样板已制作或通过。

沿用既有阶段策略：`deliverables` 无必要人工决定时可以连续交付和推进；`manual` 每阶段记录真实用户确认。产品取舍、必要授权或人工视觉门尚未闭合时，只暂停依赖它的工作。V2 图片交付本身不自动产生人工视觉 PASS，也不替代 V4 当前运行候选的显示验收；已有有效确认不因无关文案变更失效。

校验器只检查项目安全路径、图片文件结构和尺寸、阶段/身份引用、编号、父关系与状态覆盖。文件检查包含 PNG 块校验和与压缩扫描行完整性、JPEG 必要表与扫描结构、WebP 帧头之外的负载边界；不是完整图像解码器。PNG 解压扫描数据限制为 256 MiB，超过时报告本地检查预算限制，不能据此判视觉失败。`frozenRef`／`presentedRef`／`userMessageRef` 真实性、框选和引线内容、来源路线是否保真、图片是否实际直出，仍须依据真实过程核对；程序不分析截图或判定视觉质量。保留真实失败、修复和复验产物，不倒填确认或阶段时间。
