# 项目发现与源数据

1. 检查当前目录、项目说明、现有技能、工作项、代码与未提交改动；若有 `.codegraph/`，先用 CodeGraph 理解代码。没有索引不自动建索引。
2. 调用 list_roblox_studios，按实例名称、Place/文件和用户上下文选择目标；名称相同不代表同一对象。首次修改前让用户确认具体实例；当前会话已有明确绑定时复用，不反复询问。
3. 调用 get_studio_state，记录可用 DataModel。仅查询存在的 Edit/Client/Server，不为了只读调查自动切换 Play 状态。
4. 通过有限深度 search_game_tree 查看 Workspace、ServerScriptService、ServerStorage、ReplicatedStorage、StarterPlayer、StarterGui；用 inspect_instance 深入真实路径，脚本先搜索再读全文或必要上下文。遇到 head_limit、深度汇总、脚本搜索/匹配数量上限时，按子树或更具体条件继续调查；未返回的节点不能视作不存在。同名多匹配先消除目标歧义，不能默认改首项。
5. 明确 sourceOfTruth。Studio 原生项目以 DataModel 为源；已有 Rojo/文件同步项目以映射与源码为源。检查现有同步进程和端口，只在没有可复用实例且确需服务时启动；不同时从两边修改同一脚本。
6. 记录 Studio/Place 身份、编辑模式、现有模块与入口、资源来源、设备/输入要求、DataStore/外部服务隔离、当前错误和现有测试。不读取凭据或全量线上玩家数据。

连接列表为空或工具不可用时，明确记录“Studio 未连接”，保持引擎验证 NOT_RUN。若当前环境提供官方 Roblox 入门连接技能，先读取其说明再修复连接；不把本地安装技能当作 Studio 已连接，不通过反复新开 Studio 绕过连接问题。启动安装器、同步服务或新的 Editor 前先检查已有实例与进程；登录、账号选择和真实权限由用户完成必要操作，完成后重新发现实例。

## 建议结构

沿用已存在的项目结构。全新项目可以将服务器规则和数据放在 ServerScriptService/ServerStorage，将可复制的协议和纯共享模块放在 ReplicatedStorage，将输入与表现放在 StarterPlayerScripts，将 UI 模板放在 StarterGui；实际运行界面检查 PlayerGui。

这不是创建目录的命令，也不要求复制固定框架。共享能力有真实消费者才提取，服务器秘密不得复制给客户端。仅文件项目在实际存在同步映射后才编写对应目录；没有映射时先解决源数据归属。

完整的容器职责、状态权威、模块/Remote/生命周期交付及 V0–V4 交接统一按[项目架构约定](foundation-integration.md#项目架构与-datamodel-职责)执行，并由架构技能写入现有 TDD 与模块清单。

项目文档按需要维护 GDD（体验与范围）、TDD（模块/Remote/存档契约）、资源清单（来源/许可/Asset ID/消费者）与工作项。记录真实事实，未知值明确标注待发现，不编造玩法、资产或发布目标。
