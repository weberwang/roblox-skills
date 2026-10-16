# Roblox 游戏开发 Skills

以 [Roblox Studio 插件](plugin://roblox-studio@openai-curated-remote) 为引擎执行层的中文技能工程，承接 `D:\Git\unity-skills` 的阶段化协作方式。包含 14 个技能、本地安装器、工作项记录工具和自动测试；不捆绑特定游戏或插件实现。

## 工作流

工作流控制维护范围、实施包和证据；开发编排调度领域技能；Studio 插件负责真实引擎操作。项目进度沿用六阶段：需求范围、全局基线、基础工程、场景/显示层生产、全局集成验证、发布。

可见对象按 V0 分流 → V1 定义 → V2 拆解 → V3 资源组合 → V4 运行接入组织。每一步保留交付，视觉结果由用户检查；已有授权范围内的普通实施和测试自动推进，不照搬 Unity 的 API、资源 GUID 或 Editor 工具链。

项目文档、资源登记和模块依赖由[文件工具](roblox-development-workflow/references/project-artifacts.md)维护；[基础工程与集成](roblox-development-workflow/references/foundation-integration.md)明确空壳、代表性垂直切片和全局回归的不同交付。视觉对象按[布局合同](roblox-development-workflow/references/responsive-ui-contract.md)、[共享资源](roblox-development-workflow/references/shared-asset-usage.md)和[动画交接](roblox-development-workflow/references/animation-intent-contract.md)实现，不依赖生成工具未提供的 UV、绑定或动画制作能力。

| 技能 | 职责 |
| --- | --- |
| [roblox-game-workflow-control](roblox-game-workflow-control/SKILL.md) | 工作项、范围、实施包、证据、授权 |
| [roblox-development-workflow](roblox-development-workflow/SKILL.md) | 完整开发编排和 Studio 工具路由 |
| [roblox-game-grilling](roblox-game-grilling/SKILL.md) | 证据无法消除的关键取舍、逐项提问、真实用户决定与摘要批准 |
| [roblox-game-production](roblox-game-production/SKILL.md) | 需求、核心循环、范围与验收 |
| [roblox-game-architecture](roblox-game-architecture/SKILL.md) | 模块、服务器权威、Remote 与生命周期 |
| [roblox-gameplay-development](roblox-gameplay-development/SKILL.md) | 交互、战斗、回合与关卡 |
| [roblox-game-ui](roblox-game-ui/SKILL.md) | HUD、弹窗、输入、适配与本地化 |
| [roblox-game-visual-assets](roblox-game-visual-assets/SKILL.md) | 模型、材质、贴图与资源交接 |
| [roblox-game-audio](roblox-game-audio/SKILL.md) | 音频、空间声与声音生命周期 |
| [roblox-game-balance](roblox-game-balance/SKILL.md) | 经济、成长、奖励与数值验证 |
| [roblox-game-juice](roblox-game-juice/SKILL.md) | 动画、镜头、粒子与事件反馈 |
| [roblox-game-live-ops](roblox-game-live-ops/SKILL.md) | 存档、收据、商店与在线服务 |
| [roblox-game-qa-performance](roblox-game-qa-performance/SKILL.md) | 质量、调试、多人和性能证据 |
| [roblox-game-release](roblox-game-release/SKILL.md) | 保存、发布候选、授权与回滚 |

## 安装到游戏项目

需要 Node.js 22 或更高。已克隆本工程后：

```powershell
node D:\Git\roblox-skills\scripts\install-project-skills.mjs D:\Games\my-game
```

安装到 `.agents/skills/`，默认拒绝覆盖同名技能，也拒绝链接或目录联接路径。不自动连接 Studio，不安装 Rojo，不写全局技能目录。

也可用通用 skills CLI 从本地集合安装：

```powershell
npx skills add D:\Git\roblox-skills --list
npx skills add D:\Git\roblox-skills --skill roblox-development-workflow roblox-game-workflow-control
```

领域技能有跨技能引用，完整流程建议用本工程安装器安装全部 14 项；只安装部分时，应同时提供其引用的控制/编排技能与相关领域技能。

根目录没有 `SKILL.md`，避免通用 CLI 在根入口提前停止扫描，导致子技能无法被发现。初始单技能模板已转为技能集合。`package.json` 暂设 private，本工程未上传 npm 或 GitHub；不提供虚构的远程 npx 包地址。

## 开始游戏开发

在目标项目使用 `$roblox-development-workflow`，说明游戏概念或当前功能。代理先发现并确认目标 Studio、源数据和已有工程，不凭空选择玩法或改动当前打开的 Place。

用户要求“拷问”，或证据无法消除关键产品/体验/架构/视觉/成本/风险/发布取舍时，编排和领域技能统一调用 `$roblox-game-grilling`。它先查事实，再逐项提问、提交完整结论并保留真实批准，将记录加入 Work Item.decisionRefs。未决项阻断相应工作项完成；普通实现不新增审批，产品决定也不代替上传/付费/发布授权。

```powershell
node .agents/skills/roblox-development-workflow/scripts/workflow-files.mjs init-docs --repo . --project-id my-game --include visual,assets,qa,release
node .agents/skills/roblox-development-workflow/scripts/workflow-files.mjs check-docs --repo .
node .agents/skills/roblox-game-workflow-control/scripts/workflow-control.mjs init-project --repo . --project-id my-game
node .agents/skills/roblox-game-workflow-control/scripts/workflow-control.mjs init --repo . --id first-loop --type SCENE --objective "完成首个可游玩循环"
node .agents/skills/roblox-game-workflow-control/scripts/workflow-control.mjs status --repo . --id first-loop
node .agents/skills/roblox-game-workflow-control/scripts/workflow-control.mjs check --repo . --id first-loop
node .agents/skills/roblox-game-workflow-control/scripts/workflow-control.mjs check-project --repo .
```

新工作项尚未配置完整，`check` 返回缺失信息是正常行为。字段和证据见 [记录契约](roblox-game-workflow-control/references/record-contract.md)。本地检查不执行 Studio 命令，不自动批准或标记完成。

当前工作项版本为 2：每条验收目标和计划检查都绑定当前证据，Studio 证据同时核对工作项、候选、Studio、Place、Universe 与采集时间。未发布工程回读得到的 Place/Universe 可以是 0，未知值保持 null。可见交付保留 V0–V4 产物、视觉目标合同、五项人工美术结论和适用动态情景；复杂交付另需独立领域审查。仅填写 PASS 或放入无关日志不能满足记录检查。

初始项目文档保持 unconfigured，不预设游戏内容或线上身份；已有核心文档时用 add-docs 增加所需可选交付，不覆盖设计文件。具体参数见[项目文档](roblox-development-workflow/references/project-artifacts.md)。

完整项目用 `.workflow-control/project.json` 登记工作项候选及最终集成项，通过 `dependsOn` 固定上游候选；`check-project` 汇总全项目完成情况，不能以单项通过代替。局部小修可不启用项目清单。详见[项目依赖与多 Place](roblox-game-workflow-control/references/project-contract.md)。多 Place 默认关闭，仅项目实际跨 Place 时启用，并保留传送、共享数据契约与真实验证证据；本地工具不会启动或发布 Place。

可见合同通过[批准用例](roblox-game-workflow-control/references/coverage-contract.md)关联视口、输入、语言和动态情景，每份运行证据只覆盖实际测量的一行。工作项通过[资源消费绑定](roblox-game-workflow-control/references/asset-bindings.md)核对资源当前修订、许可、消费节点和 Edit 回读；历史消费者与当前消费者分别记录。

## 已核实边界

- Studio 插件支持脚本/实例调查与修改、资源生成/插入、本地 Play、输入模拟、调试与分析；详见 [能力路由](roblox-development-workflow/references/studio-plugin-routing.md)。
- 当前工具没有专用保存、发布、构建或多客户端启动入口；单客户端 Play 不能代替多人验收，Edit 截图不能冒充运行截图。
- [有界只读探针](roblox-development-workflow/references/studio-probes.md)可采集身份和布局数值；它们不创建实例，不切换 Play，不代替截图人工验收。segment_mesh 返回同级新模型，也不代表角色已绑定或动画已完成。
- 截图交用户人工检查；未明确授权自动视觉检查时，代理不分析截图或宣布显示通过。
- Studio 写入串行，文件同步项目先明确源数据，持久化与收据由服务器处理。线上存档开关、上传、外部写入、付费、发布和真机须核对精确授权。
- 不自动创建分支或 worktree，不自动发起真机验收。

## 本地验证

```powershell
npm run check
npm test
npm pack --dry-run
```

验证技能元数据/链接、安装拒绝覆盖与路径边界、项目文档/资源许可/模块依赖、验收与证据身份、计划覆盖/人工确认门、CLI 初始化及打包内容。自动测试只使用临时本地目录，不修改 Studio、线上数据或真实游戏项目。技能静态检查与工具测试不能证明实际游戏行为通过。本轮对照发现、取舍和验证边界见[对照记录](docs/workflow-gap-audit.md)。
