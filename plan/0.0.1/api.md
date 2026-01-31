# 0.0.1 API 架构表（前后端交互协议）

导语：本文档用于定义 0.0.1 版本的 API 资源模型、数据类型与接口设计，便于前后端对齐与联调。为避免理解偏差，本文件不仅描述接口清单，也明确**数据结构、状态流转与最小实现边界**，使后端可落地、前端可联调。

阅读建议：
- 先看「协议约定」理解统一包装与错误码处理；
- 再看「核心数据模型」理解模板与运行的字段含义；
- 最后对照「页面到 API 映射」校验前端调用是否覆盖需求。

## 目录
- [1. 协议约定](#1-协议约定)
- [2. 核心数据模型（前后端共享 JSON）](#2-核心数据模型前后端共享-json)
- [3. REST API 设计（0.0.1）](#3-rest-api-设计001)
- [4. 模板（Workflow Templates）](#4-模板workflow-templates)
- [5. 运行与监控（Start / Cancel / Restart / Delete / List）](#5-运行与监控start--cancel--restart--delete--list)
- [6. WebSocket：运行事件流（最小可用监控区）](#6-websocket运行事件流最小可用监控区)
- [7. 前端校验建议（仅前端实现）](#7-前端校验建议仅前端实现)
- [8. 前端页面到 API 的映射（对齐需求）](#8-前端页面到-api-的映射对齐需求)
- [9. 兼容性与版本策略（schemaVersion）](#9-兼容性与版本策略schemaversion)

> 范围：单机/单用户；无登录；模板管理 + 画布保存 + 发起一次运行 + 最小可用监控（步骤级状态与错误）。

---

## 1. 协议约定

### 1.1 Base URL
- REST：`/api/v1`
- WebSocket：`/ws/v1`

### 1.2 通用 Header
- 请求：`Content-Type: application/json; charset=utf-8`
- 响应：`Content-Type: application/json; charset=utf-8`

### 1.3 时间与标识
- `id`：字符串（推荐 UUID v4，例如 `"3f0c7b3a-..."`）
- `createdAt/updatedAt/startedAt/finishedAt/ts`：ISO 8601 字符串（UTC，例：`"2026-01-22T09:12:34.123Z"`）

### 1.4 响应包裹（推荐）
为便于错误处理与可观测性，建议所有 REST 响应统一包裹。**即使是简单接口，也返回统一结构**，前端可一次性实现通用解析与错误提示逻辑：

```json
{
  "requestId": "string",
  "data": {},
  "error": null
}
```

错误时：

```json
{
  "requestId": "string",
  "data": null,
  "error": {
    "code": "BAD_REQUEST",
    "message": "请求体无法解析",
    "details": {
      "field": "steps"
    }
  }
}
```

- `requestId`：服务端生成，用于定位日志。

### 1.5 通用错误码（0.0.1 必须覆盖）
| HTTP | code | 典型场景 |
|---:|---|---|
| 400 | `BAD_REQUEST` | 请求体无法解析或字段缺失 |
| 404 | `NOT_FOUND` | 模板/运行不存在 |
| 409 | `CONFLICT` | 并发保存冲突（可选：基于 `etag` 或 `updatedAt`） |
| 500 | `INTERNAL_ERROR` | 未预期异常 |

说明：0.0.1 阶段允许后端“最小实现”，但**不得省略错误码**。前端依赖错误码决定提示语与重试策略。

---

## 2. 核心数据模型（前后端共享 JSON）

### 2.1 WorkflowTemplate（模板）

```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "schemaVersion": "0.0.1",
  "steps": [],
  "otherStep": {
    "nodes": [],
    "edges": []
  },
  "createdAt": "string",
  "updatedAt": "string",
  "stats": {
    "stepCount": 0
  },
  "lastRun": {
    "runId": "string",
    "status": "SUCCEEDED | FAILED | CANCELED | RUNNING",
    "finishedAt": "string | null"
  } | null
}
```

说明：
- `steps` 为有序数组，按执行顺序排列，**即真实执行顺序**。
- `otherStep` 保存不在主流程中的零散节点与连线，用于编辑器恢复；不参与执行。
- `stats.stepCount` 可由服务端计算并返回，前端无需计算，避免重复逻辑。
- `lastRun` 为列表页“最近一次运行状态（可选）”提供数据；若无运行过可为 `null`。

### 2.2 Steps 与 OtherStep（线性流程存储）

```json
{
  "steps": [
    {
      "id": "string",
      "type": "openUrl | click | type | waitFor | extract",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "string",
        "config": {}
      }
    }
  ],
  "otherStep": {
    "nodes": [
      {
        "id": "string",
        "type": "openUrl | click | type | waitFor | extract",
        "position": { "x": 0, "y": 0 },
        "data": { "label": "string", "config": {} }
      }
    ],
    "edges": [
      { "id": "string", "source": "string", "target": "string" }
    ]
  }
}
```

约束（0.0.1 线性流程最简版）：
- 仅支持单入口单出口的主线顺序执行。
- 前端在画布中指定开始节点，每个节点只允许 1 条出边与 1 条入边。
- 保存时前端遍历主线节点生成 `steps`；不在主线上的节点与连线写入 `otherStep`。
- 该设计可保证执行引擎只需处理线性数组，降低 0.0.1 的实现复杂度。

### 2.3 Node Config（节点配置联合类型）

#### openUrl
```json
{ "url": "https://example.com" }
```

#### click
```json
{ "selector": "#submit" }
```

#### type
```json
{ "selector": "#username", "text": "alice" }
```

#### waitFor
二选一：
```json
{ "selector": "#result" }
```
或
```json
{ "waitMs": 1000 }
```

#### extract
```json
{
  "selector": "h1",
  "as": "title",
  "mode": "text | attribute",
  "attributeName": "string | null"
}
```

规则：
- `mode=text` 时 `attributeName` 必须为 `null`。
- `mode=attribute` 时 `attributeName` 必填。
- `extract.as` 用作变量名，前端可据此在运行结果面板展示键值对。

### 2.4 Run（一次执行）

```json
{
  "id": "string",
  "templateId": "string",
  "status": "PENDING | RUNNING | SUCCEEDED | FAILED | CANCELED",
  "currentStepId": "string | null",
  "startedAt": "string | null",
  "finishedAt": "string | null",
  "error": {
    "code": "string",
    "message": "string"
  } | null
}
```

---

## 3. REST API 设计（0.0.1）

### 3.1 健康检查
| 方法 | Path | 说明 |
|---|---|---|
| GET | `/api/v1/health` | 服务是否可用 |

响应：
```json
{ "requestId": "...", "data": { "status": "ok" }, "error": null }
```

---

## 4. 模板（Workflow Templates）

### 4.1 获取模板列表
| 方法 | Path | 说明 |
|---|---|---|
| GET | `/api/v1/templates` | 列表页展示 |

Query（可选）：
- `includeLastRun`：`true/false`（默认 `true`）

响应 data：
```json
{ "items": [/* WorkflowTemplate 摘要 */] }
```

建议列表项返回“摘要结构”以减小体积，**避免在列表页加载完整 steps**：
```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "updatedAt": "string",
  "stats": { "stepCount": 0 },
  "lastRun": { "runId": "string", "status": "...", "finishedAt": "string | null" } | null
}
```

### 4.2 创建模板（保存时创建）
| 方法 | Path | 说明 |
|---|---|---|
| POST | `/api/v1/templates` | 首次保存时创建模板并返回详情 |

请求：
```json
{
  "name": "新模板",
  "description": null,
  "schemaVersion": "0.0.1",
  "steps": [],
  "otherStep": { "nodes": [], "edges": [] }
}
```

响应：`WorkflowTemplate`

### 4.3 获取模板详情
| 方法 | Path | 说明 |
|---|---|---|
| GET | `/api/v1/templates/{templateId}` | 编辑页打开模板 |

响应：`WorkflowTemplate`

### 4.4 更新模板元信息（重命名/描述）
| 方法 | Path | 说明 |
|---|---|---|
| PATCH | `/api/v1/templates/{templateId}` | 列表页快速改名/编辑页改名 |

请求（任意字段可选）：
```json
{ "name": "string", "description": "string | null" }
```

响应：`WorkflowTemplate`

### 4.5 保存模板（更新 steps）
| 方法 | Path | 说明 |
|---|---|---|
| PUT | `/api/v1/templates/{templateId}` | 编辑页点击保存 |

请求：
```json
{
  "schemaVersion": "0.0.1",
  "steps": [],
  "otherStep": { "nodes": [], "edges": [] }
}
```

响应：`WorkflowTemplate`

### 4.6 删除模板（需要二次确认由前端保证）
| 方法 | Path | 说明 |
|---|---|---|
| DELETE | `/api/v1/templates/{templateId}` | 删除模板 |

响应：
```json
{ "requestId": "...", "data": { "deleted": true }, "error": null }
```

> 补充说明：导入/导出由前端完成，不提供后端 API。该策略可减少 0.0.1 的后端工作量，同时不影响演示功能。

---

## 5. 运行与监控（Start / Cancel / Restart / Delete / List）

### 5.1 发起一次运行（Start）
| 方法 | Path | 说明 |
|---|---|---|
| POST | `/api/v1/runs` | 编辑页点击“运行” |

请求：
```json
{
  "templateId": "string",
  "dryRun": false
}
```

说明：
- `dryRun`（可选）：仅生成运行记录不执行（0.0.1 可先不实现，保留字段）。
- 返回 `wsUrl` 便于前端立即建立事件流连接，形成“运行中”的最小可用监控体验。

响应 data：
```json
{
  "run": { /* Run */ },
  "wsUrl": "/ws/v1/runs/{runId}"
}
```

### 5.2 取消运行（Cancel）
| 方法 | Path | 说明 |
|---|---|---|
| POST | `/api/v1/runs/{runId}/cancel` | 运行中点击“停止” |

响应：`Run`

### 5.3 重启运行（Restart）
| 方法 | Path | 说明 |
|---|---|---|
| POST | `/api/v1/runs/{runId}/restart` | 重新发起一次运行（生成新 run） |

响应：
```json
{
  "run": { /* Run */ },
  "wsUrl": "/ws/v1/runs/{runId}"
}
```

### 5.4 删除运行记录（Delete）
| 方法 | Path | 说明 |
|---|---|---|
| DELETE | `/api/v1/runs/{runId}` | 删除运行记录（不影响模板） |

响应：
```json
{ "requestId": "...", "data": { "deleted": true }, "error": null }
```

### 5.5 查询运行状态（Get by id）
| 方法 | Path | 说明 |
|---|---|---|
| GET | `/api/v1/runs/{runId}` | 获取当前状态 |

响应：`Run`

### 5.6 运行列表（List）
| 方法 | Path | 说明 |
|---|---|---|
| GET | `/api/v1/runs` | 按条件筛选运行记录 |

Query（可选）：
- `templateId`：按模板过滤
- `status`：`PENDING | RUNNING | SUCCEEDED | FAILED | CANCELED`
- `from` / `to`：ISO 8601 时间范围
- `limit` / `offset`：分页

响应 data：
```json
{ "items": [/* Run 摘要 */], "total": 0 }
```

---

## 6. WebSocket：运行事件流（最小可用监控区）

### 6.1 连接
- URL：`/ws/v1/runs/{runId}`
- 子协议：可不需要；如需版本化可用 `Sec-WebSocket-Protocol: rpa.run.v1`

### 6.2 事件消息格式
统一 JSON：

```json
{
  "runId": "string",
  "seq": 1,
  "ts": "2026-01-22T09:12:34.123Z",
  "type": "RUN_STARTED | STEP_STARTED | STEP_SUCCEEDED | STEP_FAILED | LOG | RUN_SUCCEEDED | RUN_FAILED | RUN_CANCELED",
  "payload": {}
}
```

字段说明：
- `seq`：递增序号（便于前端按序渲染与排重）
- `type`：事件类型
- 事件应按执行顺序发出，前端据此高亮节点与追加日志。

### 6.3 事件 payload 规范

#### RUN_STARTED
```json
{ "templateId": "string" }
```

#### STEP_STARTED
```json
{ "stepId": "string", "stepType": "string" }
```

#### STEP_SUCCEEDED
```json
{ "stepId": "string", "outputs": { "title": "Example Domain" } }
```
- `outputs`：用于承载 `extract.as` 的变量结果（0.0.1 可只支持字符串）。

#### STEP_FAILED
```json
{
  "stepId": "string",
  "error": { "code": "TIMEOUT", "message": "等待元素超时" }
}
```

#### LOG
```json
{ "level": "INFO | WARN | ERROR", "message": "string" }
```

#### RUN_SUCCEEDED / RUN_FAILED / RUN_CANCELED
- 成功：
```json
{ "summary": "ok" }
```
- 失败：
```json
{ "error": { "code": "string", "message": "string" } }
```

### 6.4 前端渲染建议（非强制）
- 收到 `STEP_STARTED`：高亮对应节点
- 收到 `STEP_SUCCEEDED`/`STEP_FAILED`：标记节点成功/失败并追加日志
- 收到 `RUN_*`：更新整体状态与停止按钮可用性

---

## 7. 前端校验建议（仅前端实现）

> 补充说明：后端不做流程与参数校验，前端必须在保存与运行前完成校验。这样可以显著降低后端实现复杂度，并让错误提示更贴近用户操作。

### 7.1 结构校验
- `steps` 至少 1 个
- 主流程为线性顺序（由前端遍历节点生成 `steps`）

### 7.2 参数校验（示例）
- `openUrl.url` 必填且为合法 URL（至少校验以 `http://` 或 `https://` 开头）
- `click.selector` / `type.selector` / `extract.selector` 必填
- `type.text` 必填（是否允许空字符串由产品决定）
- `waitFor.selector` 与 `waitFor.waitMs` 必须二选一且仅能选一个
- `extract.as` 必填（变量名建议正则：`^[a-zA-Z_][a-zA-Z0-9_]*$`）

---

## 8. 前端页面到 API 的映射（对齐需求）

### 8.1 模板列表页
- 列表加载：GET `/templates`
- 新建：进入空白编辑页（无 API）
- 重命名/描述：PATCH `/templates/{id}`
- 删除：DELETE `/templates/{id}`

### 8.2 画布编辑页
- 打开模板：GET `/templates/{id}`
- 保存新模板：POST `/templates`
- 保存已有模板：PUT `/templates/{id}`
- 运行：POST `/runs`，随后连接 WS `/ws/v1/runs/{runId}`
- 停止：POST `/runs/{runId}/cancel`

---

## 9. 兼容性与版本策略（schemaVersion）

- 模板 JSON 必带 `schemaVersion`，0.0.1 固定为 `"0.0.1"`。
- 0.0.1 仅用于后端存储与前端渲染，导入/导出由前端自行处理。

总结：本接口文档覆盖协议约定、模型定义、接口清单与前端校验建议，确保 0.0.1 联调一致。

