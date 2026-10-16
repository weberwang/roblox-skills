# 项目依赖与多 Place 契约

项目级状态保存在游戏工程的 `.workflow-control/project.json`。本地技能仓库只提供检查逻辑，不会执行 Studio 写入、传送、云数据访问或发布。

```json
{
  "version": 1,
  "projectId": "island-adventure",
  "workItems": [
    { "id": "hub-scene", "candidate": "candidate-2" },
    { "id": "arena-scene", "candidate": "candidate-1" },
    { "id": "integration", "candidate": "candidate-1" }
  ],
  "integrationWorkItemId": "integration",
  "multiPlace": { "enabled": false }
}
```

清单初始化为空，创建清单时不替项目猜测工作项和候选。把每个项目成员以 `{ "id", "candidate" }` 登记；在工作项 JSON 根字段 `dependsOn` 中逐项列出前置，例如 `{ "workItemId": "hub-scene", "candidate": "candidate-2" }`。依赖引用必须同时匹配清单候选和目标工作项当前候选。文件名、记录 id、清单 id 必须一致；工作项依赖不能指向未登记成员、重复成员或自身，也不能形成环。

单项 `check` 只要求当前工作项已登记、候选一致，并且传递前置项都处于 `complete` 且通过本地验收。其他无关工作项尚未完成，不会挡住当前单项。若项目清单不存在且当前工作项没有依赖，项目依赖门不启用。清单存在时，工作项必须登记到清单。

全局 `check-project` 要求所有登记工作项均为 `complete` 且通过本地验收，并验证依赖链。`integrationWorkItemId` 必须指向 `INTEGRATION` 类型工作项，其传递前置覆盖所有非 `RELEASE` 成员；每个 `RELEASE` 的传递前置必须包含该集成工作项。全局检查也会扫描 `.workflow-control/work-items/*.json`，拒绝有记录却未登记的成员。归档或废弃的记录应移出该目录，例如放到 `.workflow-control/archive/`，使活动清单能完整代表当前项目。

若 `docs/asset-register.json` 存在，全局检查会按资源总表完整校验每项资源，包括来源、许可、证据、版本和可用状态；这意味着尚未完成的 planned 资源也会阻止全项目 ready。每个 `active` 消费者必须指向项目清单成员，其 candidate 必须同时匹配清单和工作项当前记录。`historical` 消费保留审计信息，不要求对应工作项仍在活动目录，也不要求使用当前候选。

多 Place 默认关闭。只有将 `multiPlace.enabled` 设为 `true` 才需要下列配置：

```json
{
  "enabled": true,
  "places": [
    { "id": "hub", "placeId": 123456, "universeId": 987654, "workItemIds": ["hub-scene", "integration"] },
    { "id": "arena", "placeId": 234567, "universeId": 987654, "workItemIds": ["arena-scene"] }
  ],
  "transitions": [
    {
      "id": "hub-to-arena",
      "from": "hub",
      "to": "arena",
      "contractRef": "docs/place-transition.md",
      "verificationWorkItemId": "integration"
    }
  ],
  "sharedData": []
}
```

至少登记两个不同的真实 Place ID，且都属于同一 Universe。每个项目工作项只能属于一个 Place，工作项 target 中的 Place/Universe 必须匹配登记；Studio 可以不同。转场端点使用 `places[].id`，必须不同并引用非空项目内合同文件。共享数据关系可以为空；若存在，至少包含两个不同 Place。转场和共享数据的 `verificationWorkItemId` 都必须是已登记的 `INTEGRATION`，并传递依赖关系所涉及 Place 中全部非发布 production 工作项。

每条跨 Place 关系还需要验证工作项上的当前候选 `play` 或 `multiplayer` PASS 证据。证据的 `multiPlace` 元数据必须唯一指向该关系，并列出实际 Place 数字 ID：

```json
{
  "multiPlace": {
    "transitionId": "hub-to-arena",
    "placeIds": [123456, 234567]
  }
}
```

共享数据证据把 `transitionId` 换为 `sharedDataId`，`placeIds` 与该关系全部端点完全一致。常规证据门仍会检查候选、证据文件、Studio/Place/Universe 和运行 DataModel；证据本身绑定的 `placeId` 必须是关系端点之一。结构检查只能验证记录和身份字段是否完整，不能凭本地 JSON 证明玩家确实跨 Place 运行或数据已真实共享；缺少实际 Studio 运行证据时，项目不能通过聚合。
