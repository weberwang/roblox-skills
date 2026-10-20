# 项目文档与清单

此工具为现有 Roblox 游戏项目初始化本地设计和清单文档，并检查文档结构。它不连接 Roblox Studio、不执行 Play、不截屏、不启动服务，也不上传、保存或发布游戏。`ready` 只表示本地文档检查满足下述条件，不表示 Studio 中存在对应实现。

完整目录职责、临时/候选/已确认产物、正式资源及过程记录位置见[工程目录与产物归档](project-layout.md)。先用 `init-layout` 补齐分类目录，再初始化文档；已有文档项目可以单独补目录，不必重跑 `init-docs`。`check-layout` 检查目录，`check-docs` 仍只检查本页文档合同，不认证产物归类或确认。

## 命令

从已安装的 `roblox-development-workflow` 技能目录运行：

```powershell
node scripts/workflow-files.mjs init-layout --repo D:\Games\my-game
node scripts/workflow-files.mjs check-layout --repo D:\Games\my-game
node scripts/workflow-files.mjs init-docs --repo D:\Games\my-game --project-id my-game
node scripts/workflow-files.mjs init-docs --repo D:\Games\my-game --project-id my-game --include visual,assets,qa,release
node scripts/workflow-files.mjs add-docs --repo D:\Games\my-game --project-id my-game --include assets,qa
node scripts/workflow-files.mjs check-docs --repo D:\Games\my-game
node scripts/workflow-files.mjs check-docs --repo D:\Games\my-game --include visual,assets,qa,release
```

`--repo` 必须指向已存在的非根目录，项目路径及文档路径不能经过符号链接或 Windows 目录联接。项目 ID 仅接受以小写字母或数字开头、最多 64 位的小写字母、数字和连字符。初始化默认创建 `docs/project-profile.json`、`docs/GDD.md`、`docs/TDD.md` 和 `docs/module-manifest.json`。`--include` 可选值为 `visual`、`assets`、`qa`、`release`，分别增加视觉基线、资源清单、QA 计划和发布清单。

初始化先检查全部目标路径和模板，再以排他方式创建文件；任何同名文件都会拒绝本次初始化，不支持 `--force`。发生写入错误时会清理由本次成功创建的文件。当核心文档已经初始化后，用 `add-docs` 增加可选文档；它只写 `--include` 指定的可选文档，先要求现有 `project-profile.json` 使用有效且匹配的项目 ID，并对所有目标做冲突预检，不重新创建或覆盖核心文档。`check-docs` 总是检查四份核心文档，并自动检查 `docs/` 下所有已存在的可选文档；`--include` 还会要求所选文档存在。它输出包含 `valid`、`ready`、`errors`、`blockers` 和 `notices` 的 JSON 报告；无效或未就绪时进程返回非零状态。

`valid` 表示文件结构和本工具管理的约束有效。`ready` 还要求档案、核心设计文档和选中的可选文档均不再处于 `unconfigured`，ready 资源满足许可与证据要求。空清单是合法的初始结构，但不代表已规划或已实现任何玩法、模块或资产。遇到未知或占位值时，不得将其视为真实配置。

## 核心文档结构

### `project-profile.json`

```json
{
  "version": 1,
  "projectId": "my-game",
  "status": "unconfigured",
  "studio": {
    "experienceName": "",
    "universeId": null,
    "placeId": null,
    "instanceName": "",
    "sourceOfTruth": "unknown",
    "syncTool": ""
  },
  "devices": [],
  "inputs": [],
  "sourceData": []
}
```

`status` 为 `unconfigured` 或 `ready`。初始模板故意保留空值。将状态改成 `ready` 时，必须填写实际 Experience 名称、Studio 实例名称，以及 `studio` 或 `filesystem` 作为 `sourceOfTruth`。`universeId` 与 `placeId` 必须是 JSON 非负安全整数；未发布的 Place 可能实际回读为 `0`，但只能在来源证据真实记录该值时填写，不能用 `0` 代替未知值。`syncTool` 可另记 Rojo 等同步工具，不改变源数据归属。`devices` 和 `inputs` 各自必须包含不重复的真实目标。`sourceData` 必须至少包含一条 `{ "kind": "...", "uri": "...", "evidenceRef": "项目内文件路径" }` 来源记录；`evidenceRef` 必须指向项目内存在且非空的普通文件。不得用 `unknown`、`TBD`、`待填写`、空值或示例值填充 ready 档案。检查器只验证这些字段和本地证据文件，不会连接 Studio 验证实例、Experience 或 ID 的真实性。

`GDD.md` 和 `TDD.md` 必须保留初始化模板中的章节。章节标题使用一级或二级 Markdown 标题（`#` 或 `##`，允许标题末尾的闭合 `#`）。二者都使用 `状态：unconfigured` 或 `状态：ready`。标记为 ready 时，每个必需章节都必须含有实际正文；章节范围按标题层级一致切分，只有子标题、空白或“待填写”“待记录”等未落实提示不能作为正文。GDD 记录体验概述、核心循环、成长、范围和验收标准；TDD 记录实际源数据、模块边界、客户端/服务器职责、Remote 契约及生命周期。

### `module-manifest.json`

唯一支持的格式为：

```json
{
  "version": 1,
  "modules": [
    {
      "id": "combat-service",
      "owner": "gameplay-team",
      "responsibility": "维护服务端战斗规则",
      "dependencies": [],
      "files": ["src/server/combat.luau"],
      "instances": ["game.ServerScriptService.CombatService"]
    }
  ]
}
```

`modules` 可以为空。每个模块需要唯一 `id`、非空 `owner` 与 `responsibility`，以及 `dependencies`、`files`、`instances` 数组。依赖必须引用存在的模块，不能自依赖或形成环。`files` 使用项目根目录内相对路径；检查器拒绝越界路径和路径上的链接，但不要求计划中的源文件已经存在。`instances` 只能使用 `game.` 开头的 DataModel 路径。

该清单表达模块计划、所有权和目标位置，不证明对应脚本或实例已在 Studio 中创建、保存或运行。需要实际实现证据时，工作项应通过 Studio 插件读取 DataModel 并记录对应证据。

## 可选文档

### `visual-baseline.json`

以下展示未配置状态的基础字段；达到视觉依赖基础工程包的 `ready` 门槛时，还须满足候选和选择要求。

```json
{
  "version": 1,
  "status": "unconfigured",
  "artBrief": {
    "theme": "",
    "audience": "",
    "coreLoop": "",
    "viewingContext": "",
    "readabilityGoal": "",
    "comfortConstraints": ""
  },
  "userMessageRef": "",
  "targets": [],
  "evidenceRefs": []
}
```

`visual-baseline.json` 作为全局前置仅适用于有视觉依赖的 `FOUNDATION`，或 `type=PROJECT` 且仅含 `SHARED`/`MODULE` 的基础工程包。仅 `implementation.visualDependency === true` 或非空 `visualContractRef` 时触发；`baselineRef` 默认指向 `docs/visual-baseline.json`。不从任意 `assetBindings` 或资产表自由字符串推断视觉依赖。纯工程基础包豁免。普通场景/显示层即使引用模块，也仍按自身 V1–V4 交付，不因模块单元或全局基线缺失而误触发该门。

状态只能为 `unconfigured` 或 `ready`。`artBrief` 持久化主题、目标受众、核心循环、观看情境、可读性目标和舒适度约束；初始值为空，不得替用户编造。ready 基线要求这六项均有实际内容，并通过 `userMessageRef` 引用用户真实提供或确认简报的消息；工具不得生成用户确认。`targets` 可记录已确认的规范，例如色彩、字体或语言数量，不预设固定限制。ready 还要求三个生成候选，每项包含 `{id,image,generationRef}`；`generationRef` 必须为 `{candidateId,image,tool,generatedAt}`，将生成来源绑定对应候选及图片，且生成时间早于选择。`selection.presentedCandidateIds` 按原顺序包含展示的三个候选，用户只人工选择其中一个；五维质量 `themeFit`、`audienceFit`、`gameplayReadability`、`viewingComfort`、`artCompletion` 均为 PASS，并将所选方向和依据冻结。`evidenceRefs` 指向项目内已存在的非空证据文件，候选图片需通过结构解码检查。结构检查不会自动读取、分析或验收截图；视觉效果由用户人工检查。

视觉基线确认仅覆盖全局方向。具体场景/界面复用时须在阶段交付中注明来源、适用范围与剩余工作，不能据此认定其 V1、V2 图片确认、V3 资源接受、V4 场景样板或人工显示验收已完成。

### `asset-register.json`

```json
{
  "version": 1,
  "assets": [
    {
      "id": "rock-mesh",
      "revision": 1,
      "type": "mesh",
      "owner": "environment-art",
      "status": "planned",
      "source": { "kind": "catalog", "uri": "", "evidenceRef": "" },
      "license": { "status": "pending", "evidenceRef": "" },
      "assetId": null,
      "instancePath": null,
      "consumers": [],
      "evidenceRefs": []
    }
  ]
}
```

每条资源需要唯一 `id` 与正整数 `revision`；`status` 只能为 `planned`、`ready` 或 `retired`。`assetId` 是 `null` 或正整数数字字符串；`instancePath` 是 `null` 或 `game.` 开头的 DataModel 路径。消费者含 `workItemId`、完整 `game.` `nodePath`、`candidate`、`revision`、`state`（`active` 或 `historical`）。active 消费者须使用 ready 且许可 approved 的当前修订，同一资源的当前工作项/节点不能重复。historical 可保留旧候选和旧修订；计划资源尚未接入时不登记 active 消费者。

工作项同时填写 `assetBindings`，与 active 消费者、当前修订和真实 Edit 回读精确配对；不能仅凭生产者已完成来认定消费者接入。完整结构及历史记录规则见[资源消费绑定](../../roblox-game-workflow-control/references/asset-bindings.md)。`check-docs` 与工作项评估复用资源校验；前者仍会报告总表中的计划资源，后者只让实际消费相关资源的工作项受其就绪状态影响。

`ready` 资源必须满足全部条件：许可状态为 `approved`；`source.uri` 是实际来源 URI 或定位，可以是外部官方页面；`source.evidenceRef`、`license.evidenceRef` 和至少一条 `evidenceRefs` 都指向项目内已存在且非空的普通文件；`assetId` 与 `instancePath` 至少填写一项。程序化实例可只填写 `instancePath`，不强制 Asset ID。`pending` 许可不能作为 ready 通过；来源 URI 本身不能替代本地来源取证、许可和检查证据文件。处于 `planned` 的资源会作为 blocker，直到状态推进或移除。

### `qa-plan.md` 与 `release-checklist.md`

两份文件都要求有 `状态：unconfigured` 或 `状态：ready` 标记及模板中的全部章节。标记 ready 时章节需要有非占位正文。QA 计划记载目标测试和用户人工视觉检查安排；计划不证明测试执行通过。发布清单记录实际目标、授权与证据；文档就绪不会授权上传、保存或发布，也不证明这些动作已经发生。

## 路径与信任边界

版本字段只接受 `1`，不迁移旧格式。模块文件路径和证据引用通过工作流控制技能的共同路径守卫解析；路径不能越出项目根或经过符号链接/Windows 目录联接。资源许可和来源文本是项目记录，不是本工具认可的法律结论。任何 Studio 修改、Play 验证、真实设备检查、上传、发布或付费操作，都必须由相应工作流单独处理并遵守授权要求。
