# 游戏工程目录与产物归档

在游戏工程内初始化目录、生成候选、提交阶段交付、接入资源及清理中间文件时读取。本规范约束目标游戏工程，技能仓库及安装在 `.agents/skills/` 的技能实现不存放具体游戏产物。项目相对路径均以 `--repo` 指定的游戏工程为根。

## 目录职责

```text
游戏工程/
├── .gitignore                         本地缓存与可重建文件的忽略规则
├── README.md                          恢复入口、固定工具来源与执行命令
├── AGENTS.md                          项目专属代理规则，存在时提交
├── .gitattributes                     使用 LFS 等属性规则时提交
├── docs/                              项目长期设计与总表
│   ├── project-profile.json
│   ├── GDD.md
│   ├── TDD.md
│   ├── module-manifest.json
│   ├── asset-register.json             按需初始化，唯一资源总表
│   ├── visual-baseline.json            按需初始化
│   ├── qa-plan.md                      按需初始化
│   └── release-checklist.md            按需初始化
├── .tmp/                              可重新生成且未被持久记录引用的加工文件
│   └── <工作项>/<候选>/<阶段>/<尝试>/
├── artifacts/                         用户侧交付文件，不进入游戏运行包
│   ├── candidates/<工作项>/<候选>/<阶段>/r<修订>/
│   └── approved/<工作项>/<候选>/<阶段>/r<修订>/
├── assets/                            正式游戏资源，按类型和资源身份归档
│   └── <类型>/<资源ID>/r<修订>/
│       ├── source/                    制作源文件
│       └── runtime/                   用于导入或加载的导出文件
├── src/                               文件为正式源时的代码，按实际同步映射建立
│   ├── server/
│   ├── client/
│   └── shared/
├── places/<Place标识>/                实际保存的本地 Place 文件，按需建立
└── .workflow-control/                 唯一工作流控制面
    ├── project.json                   完整项目的工作项清单与依赖
    ├── work-items/<工作项>.json        活动工作项状态
    ├── records/<工作项>/<候选>/<阶段>/ 阶段交付记录、合同与实施包
    ├── decisions/<工作项>/<决策ID>/   按决策自身修订保存，不随候选复制
    ├── evidence/<工作项>/<候选>/<阶段>/<尝试>/
    │                                  日志、截图、回读和测试输出
    └── archive/                       已退出活动清单的记录及归档说明
```

`阶段` 使用当前工作项实际 V0–V4；不适用这些阶段的项目、基础工程、集成或发布工作项分别使用 `project`、`foundation`、`integration` 或 `release`，不伪造 V 阶段。`候选` 取已有工作项的 `candidate`；`修订` 与 `尝试` 用递增编号区分内容版本和执行轮次。路径分段使用稳定、安全的名称，不含斜杠、父级跳转或盘符。需要跨对象复用的全局美术方向，由负责它的工作项维护并被其他对象引用，不复制出多份权威来源。

`docs/` 只放长期设计、项目档案与总表。一次性阶段 JSON、拆解合同、实施包、测试日志和生成候选分别进入上表对应位置，不继续堆进 `docs/` 或项目根目录。`asset-register.json` 和 `module-manifest.json` 沿用现有唯一总表；目录不引入第二份资源账本或状态机。

## 临时、候选与已确认产物

| 类别 | 存放位置 | 写入与保留规则 |
| --- | --- | --- |
| 临时中间产物 | `.tmp/<工作项>/<候选>/<阶段>/<尝试>/` | 生成缓存、加工草稿、格式转换和未采用预览；只放可重建且没有持久引用的文件 |
| 待确认的正式候选 | `artifacts/candidates/<工作项>/<候选>/<阶段>/r<修订>/` | 已交给用户查看的完整效果图、标注图、候选交付包等；保持版本可定位，等待所需确认 |
| 已确认交付 | `artifacts/approved/<工作项>/<候选>/<阶段>/r<修订>/` | 已按适用确认规则接受的效果图、标注图或交付包；冻结版本，不原位覆盖 |
| 已登记游戏资源 | `assets/<类型>/<资源ID>/r<修订>/` | 正式制作源与导出文件；待审资源留在临时或候选目录，不能仅凭目录位置标 ready |
| 过程与验收证据 | `.workflow-control/evidence/<工作项>/<候选>/<阶段>/<尝试>/` | 截图、Console、回读、测试输出及失败/复验记录；成功、失败、待人工判断均按事实保存 |

“已确认”指具体范围和修订已有真实接受依据；人工视觉确认必须来自用户对当前画面的明确判断。仅完成技术检查、生成成功或取得全局方向批准不能放大成当前画面已确认。项目允许的自动视觉结果仍明确标为 automatic，不能填入人工确认来源。没有必要人工门的阶段仍按 `deliverables` 连续推进，不因目录分类增加审批；其交付可保留在候选目录并由现有阶段记录说明完成事实。

从候选晋升时，先核对工作项、候选、阶段、修订及适用确认来源，再复制当前确切文件到新的 approved 修订路径，在原有阶段/合同中更新相应引用并核对它们仍指向同一内容。保留曾展示和被引用的候选，避免历史消息失去来源；确认引用继续使用原有 `userMessageRef`、`presentedRef`、阶段退出依据等字段，不为归档伪造新的确认。目录工具不自动晋升、移动、改写状态或推断接受。

截图和失败输出只要已成为过程证据，就应先保存到 evidence，再将其路径登记到工作项。临时文件一旦需要被 `path`、`decompositionRef`、`visualContractRef`、`sourceRef`、`evidenceRef` 或其他持久字段引用，先复制到其正式类别目录并核对所有引用；不得让 `.tmp/` 成为正式依赖。失败候选不因未获接受就自动清理。

## 游戏资源与运行位置

资源类型使用下列目录，各类型按实际需要建立；同一个资源只维护一份制作源，其他对象通过资源 ID 和修订引用。

| 类型目录 | 内容 |
| --- | --- |
| `assets/models/` | 网格、模型与实际需要的绑定源、模型导出 |
| `assets/textures/` | 贴图与纹理集 |
| `assets/materials/` | 材质制作源、参数与相关导出 |
| `assets/images/` | 游戏实际消费的插画、图标等通用位图 |
| `assets/ui/` | UI 专用图集、界面资源与模板导出；可交互 UI 仍由实际组件实现 |
| `assets/audio/` | 音乐、音效与语音文件 |
| `assets/animations/` | 动画制作源、动作导出与实际需要的绑定数据 |
| `assets/vfx/` | 特效制作源与特效对象导出 |

每种资源下沿用 `<资源ID>/r<修订>/{source,runtime}`。`source/` 与 `runtime/` 仅在存在对应文件时建立；制作源和运行导出是不同用途，不把大体积源文件一起打入运行包。游戏实际使用的图片归 assets，定义阶段的完整效果图及中文拆解图归 artifacts，截图与性能图归 evidence，不能因都是 PNG 混在一个图片目录。图集、材质与特效共用的贴图由其唯一资源所有者维护，不在多个类型目录复制独立可编辑版本。

接入前在 `docs/asset-register.json` 记录稳定 ID、修订、真实来源/许可、本地来源定位以及实际 Asset ID 或 `game.` 实例路径，登记当前消费者并回读绑定。`source.uri` 可使用实际项目相对来源文件定位；许可和技术证据仍分别指向 evidence 中的真实文件。资源 ready、样板接受、全场视觉验收、上传与发布是独立事实，目录归档不代替任何一项。

文件目录不会自动成为 DataModel 路径。Studio 为正式源时，以真实实例及已保存的 Asset ID 为准；没有本地导出文件就不制造空文件或宣称已备份。已有文件同步工程按 TDD 记录实际映射；新文件工程的 `src/server`、`src/client`、`src/shared` 只作为对应服务端、客户端和纯共享职责的默认组织，配置并核实同步后才用于正式实现。

运行容器按[基础工程职责](foundation-integration.md#项目架构与-datamodel-职责)安排：服务器私有资源放 `ServerStorage`，双方需要且允许客户端读取的资源放 `ReplicatedStorage`，UI 模板放 `StarterGui`，正式世界实例放 `Workspace`；声音、动画和特效绑定各自实际消费者。不能将整个 assets 目录一概复制到 `ReplicatedStorage`。同步/打包只显式包含所需 src 和 runtime 资源，排除 `.tmp/`、`artifacts/`、`.workflow-control/`、设计总表及制作源。初始化目录不会安装 Rojo、创建同步映射或写入 Studio。

## 工作流引用与归档

活动状态仍只有 `.workflow-control/work-items/<id>.json` 与项目清单。`records/` 保存阶段 `path`、交付 JSON、拆解/响应式合同和实施包；`evidence/` 保存支撑事实。决策记录使用 `.workflow-control/decisions/<工作项>/<决策ID>/r<修订>.json`，按其自身范围和修订引用，普通候选变化不复制或撤销决策。全局基线内容仍由 `docs/visual-baseline.json` 引用实际产物和证据。

被引用文件按版本追加，修复和复验使用新修订/尝试，保留旧 FAIL。归档工作项时，先核对项目依赖与消费者，将记录移出活动 work-items 并在项目清单同步处理；阶段产物、决策、证据及资源历史引用保持可解析。`archive/` 不能充当新的活动清单，移动文件前必须处理全部引用，不能只搬 JSON 而留下失效路径。

`.tmp/` 可在项目 `.gitignore` 中忽略；目录工具不会改写已有忽略或同步配置。需持久保存的 artifacts、assets、docs 和工作流记录按项目版本管理或资产存储策略保存，大文件可使用项目已有的 LFS/资产存储，不把它们一并当作临时缓存忽略。清理前核对实际引用和本次所有权，只处理未引用的本工作项中间文件；不自动递归清空目录、不删除失败证据或他人产物。

工作流工具为原子替换在目标记录同目录短暂创建的 `.tmp` 和 `.lock` 属于工具内部事务文件，保持现有原子写入机制，由该操作自行清理；它们不是业务中间产物，也不作为交付引用。

## Git 最小提交边界

按[最小提交与恢复](git-minimum.md)选择文件：提交工程恢复入口、设计与唯一清单、项目登记工作项及其依赖、被保留记录递归引用的合同/交付/证据，以及继续实现所必需的正式源码与资源。未引用的探索产物、重复导出、安装副本和缓存留在本地。空目录不提交占位文件，由 `init-layout` 重建。

最小提交按实际引用确定，不按整个目录打包。已确认文件、失败证据或候选图片只要仍被保留记录引用，就属于必要文件；不能把 candidates、evidence、approved 或 assets 整体忽略来缩减仓库。`.gitignore` 最小模板和按需纳入规则见上述恢复规范。目录初始化不会修改 Git 索引或执行提交。

## 初始化与检查

从已安装的 `roblox-development-workflow` 技能目录运行：

```powershell
node scripts/workflow-files.mjs init-layout --repo D:\Games\my-game
node scripts/workflow-files.mjs check-layout --repo D:\Games\my-game
node scripts/workflow-files.mjs init-docs --repo D:\Games\my-game --project-id my-game --include visual,assets,qa,release
```

`init-layout` 要求目标游戏工程已存在且不是文件系统根目录。它只补齐 docs、.tmp、artifacts 及 candidates/approved、assets、.workflow-control 及 work-items/records/evidence/archive；类型、决策、工作项、候选等子目录按需创建。全部目标先预检，再逐级创建；已有目录和文件内容不变，目标同名文件或链接/目录联接会被拒绝。失败只尝试回滚本次创建的空目录，非空目录及既有内容保留。命令可以重复执行，不执行资源晋升或历史文件迁移。

`check-layout` 只读检查这些目录是否存在、类型正确且路径安全，报告 `valid`、`ready`、`errors`、`blockers`、`notices`；缺目录阻止 ready，文件冲突或非法路径使 valid=false，未就绪返回非零状态。它不扫描或认证目录中的内容、确认、许可、同步映射或引擎行为。编排者在生成/交付/接入时按本规范核对实际归类，继续使用 `check-docs`、工作项 `check`、`stage-status` 和 `check-project` 验证各自已有合同，不能把目录检查通过当作完整验收。
