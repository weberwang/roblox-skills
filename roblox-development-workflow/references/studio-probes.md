# 有界只读探针

这些源码通过 execute_luau 在当前已发现的 DataModel 执行，不写入游戏脚本，不创建实例，不启动 Play，也不读取脚本源码。先重新 list_roblox_studios/get_studio_state，使用当前 studio_id 和可用的 datamodel_type；不要将某次会话 ID 写入源码。

- [项目发现](../assets/studio-probes/project-discovery.luau)：返回真实 Place/Universe ID、名称、七类服务的直接子级计数和最多 16 项预览。用于填写工作项目标，不把服务存在视作功能已经实现。
- [UI 布局快照](../assets/studio-probes/ui-layout-snapshot.luau)：Edit 读取 StarterGui，运行时只在当前 Client 的 PlayerGui 可用时采集；Server 缺少界面根时明确返回 available=false。最多扫描 128 个实例，truncated=true 时应缩小查询或补充定向 inspect_instance，不能声称全覆盖。

运行方式：读取文件原文，将其作为 execute_luau 的 code 参数。返回对象是技术数据，不是截图或视觉验收。UI 属性不可读时标 UNAVAILABLE，不从模型猜默认值；空的 StarterGui 只能证明没有可采集布局，不等于 UI 合格。

禁止把代码写成 Script/ModuleScript 后 require 执行，或为了取得探针结果改变用户测试状态。需要运行时数据但当前没有 Client 时保持 NOT_RUN，按已授权验证计划进入 Play；不能将 Edit 快照冒充运行快照。
