# 决策记录约定

本文件定义 Roblox 工作流拷问记录的权威 JSON 格式。工作项的 `decisionRefs` 必须存在；无待决事项时为空数组，有事项时填入项目相对 JSON 文件路径，按[目录规范](../../roblox-development-workflow/references/project-layout.md)放在 `.workflow-control/decisions/<工作项>/<决策ID>/r<修订>.json`。不存在专用的决策初始化命令；使用普通文件工具按需创建记录。决策按自身修订保存，不随普通实现候选变化复制。本契约为 Roblox 控制面单独定义，不直接引用 Unity 工作流中的 YAML 记录模板或 `grilling-record` Schema 作为 Roblox 契约。

## 字段与约束

每份记录必须有以下字段：

| 字段 | 约束 |
| --- | --- |
| `version` | 当前值为整数 `1`。 |
| `id` | 小写、稳定的决策 ID。同一决策的不同修订沿用此 ID；全项目唯一键为 `id` 与 `revision` 的组合。 |
| `workItemId` | 被阻断或受该决策影响的工作项 ID。 |
| `revision` | 从 `1` 开始的正整数。只有决策目标或批准范围实质变化才递增。 |
| `subject` | 含 `id`、`description`、`files`、`instances`。`files` 是项目相对文件路径字符串数组，逐项对应工作项 `scope.files`；`instances` 是 Studio 实例身份字符串数组，逐项对应 `scope.instances`。两者均须落在对应 scope 的精确白名单内；概念决策可都为空。 |
| `trigger` | 说明为何该选择不能由现有证据或合理假设消除，以及它阻断什么。 |
| `facts` | `{claim, source}` 数组；记录可追溯事实及项目相对路径、对象版本、工具结果来源或其他可信来源。没有已核实事实时用空数组。它只供溯源，不做 SHA 比对。 |
| `assumptions` | 假设字符串数组，不能写成已核实事实。 |
| `unknowns` | 未知项字符串数组；获批状态必须为空。 |
| `questions` | 问题数组。每题有稳定 `id`、`prompt`、互斥 `options`、`recommendedOptionId` 和 `answer`。每题提供 2–3 个选项，每个选项含 `id`、`label`、`impact`；推荐 ID 必须对应一个选项。 |
| `questions[].answer` | 未回答时为 `null`。回答时为 `{optionId, freeText, userMessageRef}`：`optionId` 是某选项 ID 或 `null`；`freeText` 是非空回答或 `null`；两者至少有一个表达真实用户的选择；`userMessageRef` 指向真实用户消息或宿主可信收据。 |
| `conclusion` | 尚未形成时为 `null`。形成后含 `summary`、`scope`、`nonGoals`、`rejectedOptions`、`acceptedRisks`、`acceptance`、`nextAction`。批准记录的摘要、范围和验收条件必须非空，其余字段也必须存在；无对应项目时使用空数组或清楚说明。 |
| `status` | 只能是 `pending`、`answered`、`approved`、`rejected`、`superseded`。 |
| `approval` | 未获批时为 `null`。获批时为 `{userMessageRef, approvedAt, revision}`，批准消息必须来自真实用户且明确批准当前完整结论；时间为 ISO 8601，修订号必须等于当前 `revision`。 |

状态语义如下：

- `pending`：至少有未知项、未回答问题或尚未形成结论。工作项不得以此记录作为完成依据。
- `answered`：当前问题已有回答，但结论尚未获用户明确批准。仍阻断受影响工作项完成。
- `rejected`：用户拒绝当前结论或选项。仍阻断该路径；不能据此继续，也不能把拒绝记作批准。
- `approved`：所有问题均有真实回答，`unknowns` 为空，结论字段齐全且范围/验收非空，`approval` 绑定真实明确批准消息及当前修订。仅解除批准范围内的决策阻断。
- `superseded`：必须另含 `supersededBy`，其值为替代记录的项目相对路径。替代记录必须属于同一 `workItemId` 和 `subject.id`、具有更高 `revision`、状态为 `approved`；原记录和替代记录都必须显式出现在同一工作项的 `decisionRefs` 中。替代路径也须按 `approved` 条件验证，不能只靠把原记录标记为过期绕过阻断。

`pending`、`answered`、`rejected` 均阻断其工作项完成。同一 `workItemId` 与 `subject.id` 下同时最多只能有一个 active 的 `approved` 修订；替代旧决定时必须将旧记录改为 `superseded`，并显式引用旧记录和新批准记录。候选变化、普通实现调整或来源修订变化本身不使批准失效，也不自动要求新建修订；只有决策目标或批准范围实质变化才建立更高修订，并按 `superseded` 规则显式指向替代记录。任一记录只有在 `files`、`instances` 都与对应工作项 scope 精确匹配时才有效；新增决策记录不扩大 scope 或工具授权，也不要求计算或比较哈希。

## 待决记录示例

下面是概念工作项的合法待决示例。它不代表任何真实项目事实或用户决定，也不是批准；`pending` 状态不能解除阻断。

```json
{
  "version": 1,
  "id": "core-loop",
  "workItemId": "experience-concept",
  "revision": 1,
  "subject": {
    "id": "core-loop",
    "description": "概念阶段的核心循环选择",
    "files": [],
    "instances": []
  },
  "trigger": "目标玩家和重复游玩方式尚未确定，现有材料无法消除对核心循环的取舍。",
  "facts": [],
  "assumptions": [],
  "unknowns": [
    "目标玩家尚未确认。"
  ],
  "questions": [
    {
      "id": "player-goal",
      "prompt": "首个版本优先服务哪类游玩动机？",
      "options": [
        {
          "id": "cooperative",
          "label": "合作完成关卡",
          "impact": "需要队伍协作目标和多人退出处理。"
        },
        {
          "id": "competitive",
          "label": "短局竞技得分",
          "impact": "需要公平匹配、回合结算和竞争状态同步。"
        }
      ],
      "recommendedOptionId": "cooperative",
      "answer": null
    }
  ],
  "conclusion": null,
  "status": "pending",
  "approval": null
}
```

## 来源真实性

结构校验只能验证字段和状态关系，不能证明 `userMessageRef` 或 `approval.userMessageRef` 确实来自用户。记录创建者必须对照当前宿主对话中的真实用户消息，或宿主提供的可信只读收据。不能从文件作者、提交记录、技术测试通过、用户沉默或审查意见推定用户身份和批准。不可核验来源时保持未批准，并将身份验证边界明确报告给工作流控制者。
