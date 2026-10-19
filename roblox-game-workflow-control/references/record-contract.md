# 工作项记录契约

记录位置为游戏项目 `.workflow-control/work-items/<id>.json`。按[工程目录与产物归档](../../roblox-development-workflow/references/project-layout.md)，阶段交付 JSON、合同和实施包放 `.workflow-control/records/<工作项>/<候选>/<阶段>/`，证据放 `.workflow-control/evidence/<工作项>/<候选>/<阶段>/<尝试>/`；用户侧交付及正式资源分别进入 artifacts 与 assets 的对应目录，临时加工文件不作为持久引用。路径检查器验证项目边界与文件关系，不自动认证归类、内容或确认。技能包内不保存具体游戏的 Studio ID、Place ID、授权或验收结果。

## 必需字段

| 字段 | 内容 |
| --- | --- |
| version / id / objective | 固定版本 2、稳定工作项 ID、可观察目标；不接受旧格式旁路 |
| type | PROJECT / FOUNDATION / SCENE / DISPLAY_LAYER / INTEGRATION / RELEASE |
| phase | scope / baseline / foundation / production / integration / release |
| state | planned / implementing / validating / blocked / complete |
| candidate | 当前影响行为的候选标识；范围内无影响修改不强制换标识 |
| target | studioId、placeId、universeId、sourceOfTruth（studio 或 filesystem） |
| scope | 精确项目内 files 数组、从 game. 开始的 instances 数组；无该类改动时为空 |
| acceptance | 至少一项 `{id,criterion}`，稳定 ID 对应可判断验收目标 |
| acceptanceResults | `{id,status,evidenceIds}`；每个目标都要有绑定当前 PASS 证据的结果 |
| implementation | owner、units、verification、stopConditions |
| requiredEvidence | 本任务必须的证据类别数组 |
| evidence / operations | 真实证据、受保护动作数组；没有时为空 |
| decisionRefs | [拷问记录](../../roblox-game-grilling/references/decision-record.md)的项目内 JSON 路径数组；无必要人工取舍时为空 |
| dependsOn | 跨工作项 `{workItemId,candidate}` 数组；无前置为空，区别于实施单元依赖，见[项目契约](project-contract.md) |
| assetBindings | 当前消费 `{resourceId,revision,nodePath,evidenceId}` 数组；不消费资源时为空，见[资源绑定](asset-bindings.md) |

`SCENE` 和 `DISPLAY_LAYER` 另需 stage=V0–V4，phase=production；显示层另需 hostSceneId。可见交付检查要求 V4 以及 readback、console、play、visual 的有效证据。

可见合同必填 `coverage`，将实际批准的视口、输入、语言和动态情景组合列成用例。Play 证据精确绑定一行及客户端测量尺寸；漏行或错行阻断。完整字段见[覆盖契约](coverage-contract.md)。项目清单和资源总表存在时，`check` 同时核对前置完成状态及当前资源消费者，不能以本工作项单独填写 PASS 绕过上游。

纯本地文档/技能/源码检查任务可设 target.sourceOfTruth=filesystem，并留空 studioId；前提是任务不属于可见或发布交付，且不声明任何 Studio 证据。涉及引擎操作的文件同步工程仍必须绑定 Studio。

## 实施单元

每项含唯一 `id`、`kind`、`owner`、`files`、`instances`、`dependsOn`、`status`。kind 为 SHARED / MODULE / SCENE / DISPLAY_LAYER / INTEGRATION / RELEASE；场景和显示层不能混包。依赖必须存在且无环，范围内每个文件/实例均须有实施所有者，不能靠空的完成单元覆盖整项范围。不同所有者触及同一文件或重叠的父子实例时，必须通过 dependsOn 明确串行交接；同一文件在 Windows 下按规范化且忽略大小写的路径核对。完成单元 status=complete；有 Studio 实例写入时声明 implementation.studioWriter，保持唯一写者。

verification 不再是普通文案数组：每项为 `{id,description,evidenceType}`，记录实际命令/调用说明与证据类别。每条计划都要有同 checkId 的当前 PASS 证据，不能用另一项同类别通过掩盖缺测。stopConditions 记录实际停止边界。

多实施单元、INTEGRATION、RELEASE 还需 domainReview：`{status,reviewer,summary,evidenceIds}`，status=PASS，证据为当前候选，reviewer 不能是实施包或单元所有者。小任务可不增加独立审查门；若主动记录 domainReview，则也必须有真实有效结论。

## 证据

每项含唯一 `id`、`workItemId`、`type`、`candidate`、`observedAt`、`result`、`summary`。observedAt 是实际采集的 ISO 时间；workItemId 与当前工作项一致。结果仅有 PASS / FAIL / NOT_RUN / BLOCKED；PASS 必须含项目内相对 `path`，指向非空真实产物文件。需要满足计划检查时设置 checkId，对应 verification 中同类别的检查。

类别：static、readback、console、unit、play、multiplayer、performance、visual、save、release。Studio 技术证据另需与目标一致的 studioId、placeId、universeId 和实际 datamodel（Edit / Client / Server）。目标与证据中的 Place/Universe 均为非负安全整数；未发布工程真实值可以是 0，未知应保持 null，不得为了过门填 0。单 Play 不替代 multiplayer；多人证据还需 clientCount≥2 和 method=Server & Clients 或 StudioTestService，这只验证记录完整，实际工具能力和调用权限仍须核实。

play/multiplayer/performance 证据必须来自 Client 或 Server；内置 ModuleScript 单测来自 Server。可见交付的 console 必须来自运行时，readback 必须来自 Edit；运行中临时实例不能代替正式实现回读，也不能仅用 Edit 日志证明运行没有错误。

FAIL/BLOCKED 证据属于当前候选时始终阻断；计划内 NOT_RUN 也不能被同类 PASS 掩盖。复验成功后将失败记录移入历史文件，在交付报告中引用它，当前 evidence 只保留仍有效的最新结果。不能直接篡改失败记录为 PASS。

visual 证据保存用户实际查看的图片/视频位置、检查要点和真实回复。`visualReview` 含 status=accepted、candidate、evidenceId（绑定当前 visual 证据）、userMessageRef；不能虚构确认引用。允许自动检查的任务另存其技术结果，不冒用用户身份。

SCENE/DISPLAY_LAYER 的 visual 证据也必须绑定当前 studioId、placeId、universeId，不能用另一 Place 的图片借用当前确认。图像自身可以来自已核实的人工采集路径，因此不强制 visual 填技术 DataModel；最终运行情景另由真实 Play 证据覆盖。

visualReview.qualityResults 包含 themeFit、audienceFit、gameplayReadability、viewingComfort、artCompletion 五项，每项为 `{status,reason,userMessageRef}`。初始为 NOT_RUN；人工 PASS/FAIL 均须保留当前候选的真实用户判断，技术参数不能填入这些结论。无关文案修改不更换候选，也不撤销已有有效判断。

scenarios 列出 normal-play、repeated-feedback、event-peak、overlap-peak，每项含 id、required、reason，以及分开的 `technical: {result,evidenceIds}` 和 `visual: {result,evidenceIds,userMessageRef,reason}`。技术 PASS 引用同情景当前批准用例的 Play；人工 PASS 另需当前候选 visual 证据及真实用户回复。没有用户判断时 visual 保持 NOT_RUN。初始非 normal 情景的 required=null，确认适用性后改为 true/false；不适用时两类结果均为 NOT_APPLICABLE、证据为空并说明理由。normal-play 始终必需。旧的 scenario.result/evidenceIds 混合字段被拒绝。

## 可见合同与阶段交付

visualContractRef 指向项目内 JSON，包含 version=1、workItemId、orientations、inputs、locales、viewports、safeAreaPolicy、nodes。每个视口记录唯一 id、正数 width/height 与目标 orientation；每个节点有 id、game.路径 path、parentId（根为 null）、role 和 layoutRef。layoutRef 说明真实布局参照，父子关系不能缺失或成环。细节见[响应式合同](../../roblox-development-workflow/references/responsive-ui-contract.md)。

stageReviews 是从 V0 开始的连续前缀，当前 stage 对应最后一项；前置必须 complete，只有当前阶段可 active。每项包含稳定 id、stage、workItemId、candidate、status、真实 startedAt/completedAt、path/section、固定阶段 deliverables、逐条 exitChecks、presentedRef、remainingIssues、nextAction、reuse、evidenceIds 和 userMessageRef。准确字段与退出要求见[阶段契约](stage-contract.md)。V3/4 绑定当前候选，V0–V2 的有效交付不因无关文案变化失效；V3 另核对当前正式 Edit 回读。

V2 另含 `decompositionRef`，定位项目内的[视觉拆解合同](../../roblox-development-workflow/references/visual-decomposition.md)。该合同与实际标注图片同编号，绑定本工作项已完成 V1 的冻结效果图，覆盖组件、来源、消费、装配、生产边界和状态；用户侧必须直接展示中文框选引线图片。完整摘要或 Markdown 引用不代替该合同与图片。检查仅验证文件和引用结构，不自动填写人工视觉结论或增加默认逐阶段审批。

V2 合同的 `restoration` 记录逐项还原要求、目标机位和组合样板计划；V3 阶段另有 `production:{sampleAttempts:[],expansions:[]}`，字段、样板 visual 证据绑定和人工/明确授权自动检查的区别统一见[阶段契约的样板门](stage-contract.md#v3-内部样板生产门)。它不改变最终 `visualReview`，不建立第二份资产表或阶段状态机。资源技术 ready 与消费者样板及全场视觉验收分别取证。

同一文档可被多个阶段引用，但 section 必须定位各自唯一 Markdown 标题及非空正文，不能复用同一章节冒充多个阶段。每阶段先完成交付并展示，核对逐项退出条件，才用 complete-stage 完成、advance-stage 单步进入下一阶段；禁止准备脚本直接设置 V2/V3，禁止用批量记录或运行汇总代替真实推进。stage-template 仅生成当前阶段的待填交付，不自动填写完成或人工判断。

stagePolicy=deliverables 不额外要求每阶段人工批准，但仍须顺序交付和展示；manual 还须每阶段真实 userMessageRef。必要决定只阻断依赖它的工作。复用须说明 sourceRef、scope、remaining，不能将全局方向批准当作具体对象验收。时间和消息引用不能倒填；本地检查只验证记录关系，不能认证它们的真实性。

## 拷问与产品决策

decisionRefs 引用当前工作项的必要人工决策，记录存入 `.workflow-control/decisions/<工作项>/<决策ID>/r<修订>.json`。运行时按[决策记录约定](../../roblox-game-grilling/references/decision-record.md)检查：工作项和对象范围、记录修订、事实/假设/未知、问题选项与真实回答来源、完整结论及精确用户批准。pending、answered、rejected、无效/缺失引用或与当前修订不符的批准都会阻断完成；相同对象不能并列两份有效批准。

superseded 记录必须显式指向同工作项、同 subject.id、更高 revision 的 approved 替代记录，且替代也在 decisionRefs 内。普通实现候选变化不撤销决策；只有目标或范围实质变化才处理受影响修订。不依赖未决项的已授权工作仍可继续；本地检查不核实消息真实性，也不执行 Studio 写入。

## 受保护操作授权

operations 每项含 kind（upload / publish / payment / external-write / device / destructive-delete）、精确 target、candidate、userMessageRef 和 status。只有真实操作完成后 status 才是 complete。声明操作但未授权/执行会阻断交付；未执行可保留 NOT_RUN，不能为了 check 通过删除仍在需求范围内的操作。

发布工作项必须有 release 证据，证据另含精确 target，并与同候选、同 target 的已授权且完成的 publish 操作配对。保存、上传与发布分别取证；当前工具没有专用保存/发布入口时，记录手工执行结果或真实限制，不伪造 MCP 成功。

## 更新方法

其他工作项字段可用正常文件工具编辑，再运行 status/check。阶段使用 stage-template、complete-stage、advance-stage 维护现有 stage/stageReviews；stage-status 查看当前退出与可推进情况，evidence-summary 只读分列技术证据和人工声明。工具不自动批准、不完成整个工作项、不调用引擎。首次 init 生成版本 2、空目标、未完成实施包及 active V0，必须按实际发现补齐。只有 validating/complete 状态能满足最终完成门；检查 ready 只表示记录约束满足，不能表述为真实过程、引擎或人工验收通过。
