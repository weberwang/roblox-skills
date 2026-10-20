# Roblox Studio 插件能力路由

以下来自当前 MCP 工具契约。工具名称、参数或服务能力变化时，先读取当前定义和官方文档，不凭记忆创建不存在的接口。所有调用传入从 list_roblox_studios 得到的 studio_id，不能缓存为跨会话常量。

| 目的 | 工具 / 内置技能 | 关键边界 |
| --- | --- | --- |
| 选择实例与模式 | list_roblox_studios、get_studio_state | 首次修改前确认目标；多个实例不能取第一个默认写入 |
| 场景查询 | search_game_tree、inspect_instance | 查询限定 path/depth/head_limit；树查询传 datamodel_type |
| 脚本调查 | script_search、script_grep、script_read | 先读后改，真实完整路径，不猜不存在脚本 |
| 脚本创建/修改 | multi_edit | 仅 Edit；新脚本传 className，首条 old_string 为空 |
| 实例操作与查询 | execute_luau | 显式 Edit/Client/Server；主线程执行，大任务分块并 yield |
| 日志 | get_console_output | 记录基线与本次增量，不能忽略已有错误 |
| 本地 Play | start_stop_play | 先查状态，复用已有会话，不随意终止用户测试 |
| 输入与移动 | user_keyboard_input、user_mouse_input、character_navigation | 仅 Client；记录实际轨迹和结果 |
| 编辑画面采集 | screen_capture | 当前说明仅 Edit 截图；不推断支持运行截图或录屏 |
| 创作者资源 | search_asset、insert_asset | 记录来源/许可，插入后审查脚本和引用 |
| 网格/材质/贴图 | generate_mesh、generate_material、generate_texture | 生成结果回读；texture 原位替换；MaterialVariant 与 BaseMaterial 配套 |
| 既有网格分件 | segment_mesh | MeshPart/Model 源，最多 5 个部件名；返回同级新 Model，不生成骨骼/关节 |
| 可调程序化模型 | generate_procedural_model | 可直接传入 attachedImageUri；默认 async=true 并直接插入 Workspace；prompt 仅沿用用户原话和用户要求的可调属性 |
| 本地参考图片 | store_image | 转换为 IMAGEID，不等于上传发布 |
| 上传图片 | upload_image | 外部写入；需当前资源/目标的明确授权 |
| 后台任务 | wait_job_finished | 仅用户要求等待或后续操作依赖结果时调用，保留同一 studio_id/jobId |
| 有界项目/布局采集 | execute_luau + [只读探针](studio-probes.md) | 回读身份或布局参数，不创建游戏对象、不自动判图 |
| 官方资料 | skill: rbx-docs-search → http_get | 使用官方 .md 或 llms.txt；先确认索引与 API |

## 内置专业技能

执行相应任务前通过 `skill` 工具读取，不复制内部实现：

- rbx-debug：断点、日志点、暂停线程与变量；暂停回调不改 DataModel、不 yield。
- rbx-perf-profiling：LibMP/MicroProfiler，采样窗口与上下文必须一致，分析后释放采样对象。
- rbx-scene-analysis：运行时 SceneAnalysisService；视角和功能标志影响数据。
- rbx-device-simulator-lua：从当前设备列表取 ID，异步 setter 的上下文受限；截图仍遵守人工检查规则。
- rbx-unit-test：仅用户要求加单测、提覆盖、运行现有测试或调试失败测试时载入。它测试 ModuleScript，不替代 Play、玩法 QA 或视觉验收。
- rbx-create-skill：用于 Studio Assistant 的自定义技能创作；本仓库是文件型技能集合，没有 create_skill 工具时不能声称已发布到 Personal Skills。

## 不承诺的能力

当前工具表没有专用 save、publish、build 或多客户端启动工具。单 Play 会话不代表 Server & Clients 验收；Studio UI 或另经核实的 StudioTestService 路径需单独取证。不得为补齐工具缺口直接调用未知 API、模拟发布成功或擅自开启外部权限。

StudioTestService.ExecuteMultiplayerTestAsync 需要 PluginSecurity；当前 execute_luau 只声明 Edit/Client/Server，不能从“有 API 文档”推断该连接拥有调用权限。内置设备技能提到的 Play 截图或 set_active_studio 与当前工具列表不一致时，使用实际工具契约，每次明确传 studio_id。

search_asset 库存查询一次只接受一种资源类型，缺省为 Model；Package 单独查询。可见库存不等于跨所有者使用授权。generate_mesh 显式分件最多 8 项、三角形参数范围 12–20,000；这与 segment_mesh 的 5 项上限不同。generate_texture 的 Quality 预览仅支持单 MeshPart；写入前记录原位替换的影响和还原信息。

模型选型与实际生产使用[3D 模型 V2/V3/V4 流程](model-production.md)，并按[拆解结果路由生成模式](model-production.md#按拆解结果路由生成模式)逐组件选择。以下仅记录实际工具输入边界：

- `generate_mesh` 接受 `textPrompt`，不声明图像输入；`size` 与 `maxTriangles` 是生成目标参数，不是实际测量结果。
- `generate_procedural_model` 的产物由基础体、脚本和可编辑 attributes 组成；调用输入支持 `attachedImageUri`。`async` 默认 `true`，工具会自动插入 Workspace。其 `prompt` 保留用户原话及用户要求的可调属性；只有图片、没有用户文字描述时传空字符串。V2 内部分析用于规格和路由，不能伪装成用户原话写进调用提示。
- 规格计划和原始调用输入分别留档。工具分件名称只能来自用户明确要求的分件，不能将内部拆解单元冒充用户给出的 `segmentation`／`partNames`。

`store_image` 输入为本地 PNG/JPG/JPEG、最大 5 MB，返回 IMAGEID；不能将其与 `generate_texture` 的 `hintImage` 对象混用。后台任务的单写者与重试规则见[执行契约](studio-execution.md)。

## 官方入口

- [客户端与服务端](https://create.roblox.com/docs/projects/client-server)
- [客户端/服务端安全边界](https://create.roblox.com/docs/scripting/security/client-server-boundary)
- [Studio 测试模式](https://create.roblox.com/docs/studio/testing-modes)
- [数据存储](https://create.roblox.com/docs/cloud-services/data-stores)
- [发布游戏与 Place](https://create.roblox.com/docs/production/publishing/publish-games-and-places)

模型相关工具定义核实日期：2026-10-18；其余条目参考核实日期：2026-10-16。读取工具定义或验证连接不代表各项能力均已实测。
