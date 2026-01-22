# 0.0.1 API 架构表（前后端交互协议）

本文档基于「0.0.1 详细需求（产品视角）」定义后端 API 的资源模型、数据类型与接口设计，用于前后端联调与后端实现对齐。

> 范围：单机/单用户；无登录；模板管理 + 画布保存/导入导出 + 发起一次运行 + 最小可用监控（节点级状态与错误）。

---

## 1. 协议约定

### 1.1 Base URL
- REST：`/api/v1`
- WebSocket：`/ws/v1`

### 1.2 通用 Header
- 请求：`Content-Type: application/json; charset=utf-8`
- 响应：`Content-Type: application/json; charset=utf-8`
- 文件导入（可选 multipart 方案）：`Content-Type: multipart/form-data`

### 1.3 时间与标识
- `id`：字符串（推荐 UUID v4，例如 `"3f0c7b3a-..."`）
- `createdAt/updatedAt/startedAt/finishedAt/ts`：ISO 8601 字符串（UTC，例：`"2026-01-22T09:12:34.123Z"`）

### 1.4 响应包裹（推荐）
为便于错误处理与可观测性，建议所有 REST 响应统一包裹：

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
    "code": "VALIDATION_ERROR",
    "message": "selector 不能为空",
    "details": {
      "field": "nodes[2].config.selector"
    }
  }
}
```

- `requestId`：服务端生成，用于定位日志。

### 1.5 通用错误码（0.0.1 必须覆盖）
| HTTP | code | 典型场景 |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | 参数缺失/格式错误/节点配置非法 |
| 400 | `SCHEMA_VERSION_UNSUPPORTED` | 导入的 `schemaVersion` 高于当前支持 |
| 404 | `NOT_FOUND` | 模板/运行不存在 |
| 409 | `CONFLICT` | 并发保存冲突（可选：基于 `etag` 或 `updatedAt`） |
| 422 | `WORKFLOW_NOT_EXECUTABLE` | 无入口/无法线性执行/连线规则不满足 |
| 500 | `INTERNAL_ERROR` | 未预期异常 |

---

## 2. 核心数据模型（前后端共享 JSON）

### 2.1 WorkflowTemplate（模板）

```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "schemaVersion": "0.0.1",
  "graph": {
    "nodes": [],
    "edges": []
  },
  "createdAt": "string",
  "updatedAt": "string",
  "stats": {
    "nodeCount": 0
  },
  "lastRun": {
    "runId": "string",
    "status": "SUCCEEDED | FAILED | CANCELED | RUNNING",
    "finishedAt": "string | null"
  } | null
}
```

说明：
- `stats.nodeCount` 可由服务端计算并返回，前端无需计算。
- `lastRun` 为列表页“最近一次运行状态（可选）”提供数据。

### 2.2 Graph（画布定义，ReactFlow 兼容）

```json
{
  "nodes": [
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
  "edges": [
    {
      "id": "string",
      "source": "string",
      "target": "string"
    }
  ]
}
```

约束（0.0.1 线性流程最简版）：
- 仅支持单入口单出口的主线顺序执行。
- 服务端在保存与运行前都应做可执行性校验；不满足时返回 `WORKFLOW_NOT_EXECUTABLE`。

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

### 2.4 Run（一次执行）

```json
{
  "id": "string",
  "templateId": "string",
  "status": "PENDING | RUNNING | SUCCEEDED | FAILED | CANCELED",
  "currentNodeId": "string | null",
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

建议列表项返回“摘要结构”以减小体积：
```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "updatedAt": "string",
  "stats": { "nodeCount": 0 },
  "lastRun": { "runId": "string", "status": "...", "finishedAt": "string | null" } | null
}
```

### 4.2 新建空白模板
| 方法 | Path | 说明 |
|---|---|---|
| POST | `/api/v1/templates` | 新建模板并返回详情（进入编辑页） |

请求：
```json
{ "name": "新模板", "description": null }
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

### 4.5 保存画布（更新 graph）
| 方法 | Path | 说明 |
|---|---|---|
| PUT | `/api/v1/templates/{templateId}/graph` | 编辑页点击保存 |

请求：
```json
{ "schemaVersion": "0.0.1", "graph": { "nodes": [], "edges": [] } }
```

校验失败：
- 节点参数缺失/格式错误：`400 VALIDATION_ERROR`
- 连线不满足线性规则：`422 WORKFLOW_NOT_EXECUTABLE`

响应：`WorkflowTemplate`

### 4.6 删除模板（需要二次确认由前端保证）
| 方法 | Path | 说明 |
|---|---|---|
| DELETE | `/api/v1/templates/{templateId}` | 删除模板 |

响应：
```json
{ "requestId": "...", "data": { "deleted": true }, "error": null }
```

---

## 5. 导入 / 导出（JSON）

> 需求点：
> - 列表页导入/导出
> - 编辑页导入：覆盖当前画布 or 作为新模板（弹窗选择）

### 5.1 导出单个模板 JSON
| 方法 | Path | 说明 |
|---|---|---|
| GET | `/api/v1/templates/{templateId}/export` | 下载模板 JSON |

响应：
- `Content-Type: application/json`
- `Content-Disposition: attachment; filename="template-{templateId}.json"`（建议）

Body：完整 `WorkflowTemplate`（或最小可导入结构，见 5.3）。

### 5.2 导入为“新模板”
| 方法 | Path | 说明 |
|---|---|---|
| POST | `/api/v1/templates/import` | 从 JSON 创建新模板 |

请求（application/json 方案）：
```json
{
  "template": {
    "schemaVersion": "0.0.1",
    "name": "导入的模板",
    "description": null,
    "graph": { "nodes": [], "edges": [] }
  }
}
```

返回：新建的 `WorkflowTemplate`

错误：
- `SCHEMA_VERSION_UNSUPPORTED`：导入版本高于支持版本（提示“请升级系统”）
- `VALIDATION_ERROR`：结构或节点配置不合法

### 5.3 导入并“覆盖当前模板”
| 方法 | Path | 说明 |
|---|---|---|
| PUT | `/api/v1/templates/{templateId}/import` | 覆盖指定模板（编辑页覆盖当前画布） |

请求：同 5.2

返回：更新后的 `WorkflowTemplate`

---

## 6. 运行与监控（Start / Cancel / Status / Events）

### 6.1 发起一次运行
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
- `dryRun`（可选）：仅校验不执行（0.0.1 可先不实现，保留字段）。

响应 data：
```json
{
  "run": { /* Run */ },
  "wsUrl": "/ws/v1/runs/{runId}"
}
```

运行前校验失败：
- `VALIDATION_ERROR`：必填参数缺失
- `WORKFLOW_NOT_EXECUTABLE`：无法顺序执行

### 6.2 取消运行
| 方法 | Path | 说明 |
|---|---|---|
| POST | `/api/v1/runs/{runId}/cancel` | 运行中点击“停止” |

响应：`Run`

### 6.3 查询运行状态（用于刷新/兜底）
| 方法 | Path | 说明 |
|---|---|---|
| GET | `/api/v1/runs/{runId}` | 获取当前状态 |

响应：`Run`

---

## 7. WebSocket：运行事件流（最小可用监控区）

### 7.1 连接
- URL：`/ws/v1/runs/{runId}`
- 子协议：可不需要；如需版本化可用 `Sec-WebSocket-Protocol: rpa.run.v1`

### 7.2 事件消息格式
统一 JSON：

```json
{
  "runId": "string",
  "seq": 1,
  "ts": "2026-01-22T09:12:34.123Z",
  "type": "RUN_STARTED | NODE_STARTED | NODE_SUCCEEDED | NODE_FAILED | LOG | RUN_SUCCEEDED | RUN_FAILED | RUN_CANCELED",
  "payload": {}
}
```

字段说明：
- `seq`：递增序号（便于前端按序渲染与排重）
- `type`：事件类型

### 7.3 事件 payload 规范

#### RUN_STARTED
```json
{ "templateId": "string" }
```

#### NODE_STARTED
```json
{ "nodeId": "string", "nodeType": "string" }
```

#### NODE_SUCCEEDED
```json
{ "nodeId": "string", "outputs": { "title": "Example Domain" } }
```
- `outputs`：用于承载 `extract.as` 的变量结果（0.0.1 可只支持字符串）。

#### NODE_FAILED
```json
{
  "nodeId": "string",
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

### 7.4 前端渲染建议（非强制）
- 收到 `NODE_STARTED`：高亮对应节点
- 收到 `NODE_SUCCEEDED`/`NODE_FAILED`：标记节点成功/失败并追加日志
- 收到 `RUN_*`：更新整体状态与停止按钮可用性

---

## 8. 最小可用校验规则（服务端应实现）

### 8.1 Graph 结构校验
- `nodes` 至少 1 个
- `edges` 满足线性主线：
  - 恰好 1 个入口节点（入度 0）
  - 恰好 1 个出口节点（出度 0）
  - 其余节点入度=1 且出度=1
  - 无环

### 8.2 节点参数校验（示例）
- `openUrl.url` 必填且为合法 URL（至少校验以 `http://` 或 `https://` 开头）
- `click.selector` / `type.selector` / `extract.selector` 必填
- `type.text` 必填（允许空字符串与否可按产品决定；建议允许但提示）
- `waitFor.selector` 与 `waitFor.waitMs` 必须二选一且仅能选一个
- `extract.as` 必填（作为变量名，建议正则：`^[a-zA-Z_][a-zA-Z0-9_]*$`）

---

## 9. 前端页面到 API 的映射（对齐需求）

### 9.1 模板列表页
- 列表加载：GET `/templates`
- 新建：POST `/templates`
- 重命名/描述：PATCH `/templates/{id}`
- 删除：DELETE `/templates/{id}`
- 导入（JSON 文件解析后）：POST `/templates/import`
- 导出：GET `/templates/{id}/export`

### 9.2 画布编辑页
- 打开模板：GET `/templates/{id}`
- 保存：PUT `/templates/{id}/graph`
- 导入覆盖：PUT `/templates/{id}/import`
- 导入为新模板：POST `/templates/import`（然后跳转新模板）
- 导出当前：GET `/templates/{id}/export`
- 运行：POST `/runs`，随后连接 WS `/ws/v1/runs/{runId}`
- 停止：POST `/runs/{runId}/cancel`

---

## 10. 兼容性与版本策略（schemaVersion）

- 模板 JSON 必带 `schemaVersion`，0.0.1 固定为 `"0.0.1"`。
- 导入时：
  - 若 `schemaVersion` 高于后端支持版本：返回 `400 SCHEMA_VERSION_UNSUPPORTED`，`message` 明确提示升级。
  - 若低于支持版本：0.0.1 可直接拒绝或尝试兼容；建议 0.0.1 先拒绝（简单可靠）。

