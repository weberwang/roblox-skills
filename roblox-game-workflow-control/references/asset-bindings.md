# 资源消费绑定契约

项目资源总表位于 `docs/asset-register.json`，版本仍为 1。每个资源使用正整数 `revision`；当前工作项通过必填 `assetBindings` 声明实际消费。没有资源消费时写空数组，且没有总表的项目仍可通过检查。

## 资源记录

资源记录保留 `id`、`type`、`owner`、`status`、`source`、`license`、`assetId`、`instancePath` 和 `evidenceRefs`，并新增：

```json
{
  "revision": 3,
  "consumers": [
    {
      "workItemId": "forest-props",
      "candidate": "candidate-4",
      "revision": 3,
      "state": "active",
      "nodePath": "game.Workspace.Forest.Rock"
    }
  ]
}
```

`active` 表示当前候选仍使用该资源；它必须引用 `ready` 资源、已批准许可和资源当前 revision。修改或替换资源时递增 revision，并同步更新实际消费者的工作项绑定与回读证据。工作项候选变化后，旧候选消费者须更新为当前 candidate，或显式转为 `historical`，不能让旧记录继续冒充当前消费。

`historical` 用于保留已停止消费的历史。历史消费者必须保存 candidate 和 revision，重复检查以资源、工作项、节点、revision 与 candidate 的组合识别；它不要求工作项仍存在，也不因资源退役或许可拒绝阻断没有当前消费的工作项。

## 工作项绑定与回读证据

每个当前 active 消费都必须在工作项 `assetBindings` 中有一条对应记录，且节点属于 `scope.instances` 声明路径本身或其子级：

```json
{
  "resourceId": "rock-mesh",
  "revision": 3,
  "nodePath": "game.Workspace.Forest.Rock",
  "evidenceId": "rock-readback"
}
```

`evidenceId` 必须指向该工作项当前 candidate、Edit DataModel 的可用 `readback` 证据，运行时临时副本不能代替正式接入回读。证据 `assetBindings` 数组要记录同一 `resourceId`、`revision`、`nodePath`，并把 `assetId` 和 `instancePath` 精确回读为资源总表中的值。程序化实例可以没有 Asset ID，但要记录实际 `game.` 实例路径。资源来源、许可和 ready 资源证据必须指向项目内存在的非空文件。

`check-docs` 会检查全表结构、资源 ID 唯一性、所有 active 消费与 ready/许可/revision 关系。工作项 `check` 还会核对它的每条消费绑定、范围归属和 readback 记录；无关的 planned 资源不会阻断该工作项。若绑定或 active 消费所指资源已退役、许可不合格、版本过期、证据不一致或节点越界，该工作项不能 ready。

可见工作项的 V4 退出和最终 `check` 还须核对 V3 接受范围：`resourceAcceptance.outputs` 的每项已登记资源，通过 V2 组件的 `consumerNodeId` 定位 `visualContract.nodes[].id/path`，正式节点必须绑定同一 `resourceId/revision`。接受资源 A 之后换成 B，即使 B 的许可、回读和技术加载通过，也须先完成受影响资源的实际验收。每项接受的可见资源都要接入对应节点；音频等位于其他节点的附属资源仍独立执行通用资源门，不因缺少视觉组件编号而误阻断。
