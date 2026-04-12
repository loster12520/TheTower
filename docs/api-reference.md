# TheTower API 文档

导语：本文档汇总 TheTower 当前稳定可用的 REST API、WebSocket 事件、关键模型和错误码，口径对齐 0.0.8 已实现状态。

## 目录

- [TheTower API 文档](#thetower-api-文档)
  - [目录](#目录)
  - [1. 基础约定](#1-基础约定)
  - [2. 模板接口](#2-模板接口)
  - [3. 运行接口](#3-运行接口)
  - [4. 调试接口](#4-调试接口)
  - [5. WebSocket 事件流](#5-websocket-事件流)
  - [6. 核心模型](#6-核心模型)
  - [7. 错误码](#7-错误码)

## 1. 基础约定

- REST Base URL：`/api/v1`
- WebSocket 路径：`/ws/v1/runs/{runId}`
- 响应包装结构：

```json
{
  "requestId": "string",
  "data": {},
  "error": null
}
```

## 2. 模板接口

### 2.1 获取模板列表

`GET /api/v1/templates?includeLastRun=true`

说明：返回模板摘要列表。

### 2.2 创建模板

`POST /api/v1/templates`

请求示例。

```json
{
  "name": "抓取网页标题",
  "description": "打开页面并提取标题",
  "schemaVersion": "0.0.8",
  "steps": [],
  "otherStep": {
    "nodes": [],
    "edges": []
  }
}
```

### 2.3 获取模板详情

`GET /api/v1/templates/{id}`

### 2.4 更新模板元信息

`PATCH /api/v1/templates/{id}`

请求示例。

```json
{
  "name": "新的模板名称",
  "description": "新的描述"
}
```

### 2.5 保存模板步骤

`PUT /api/v1/templates/{id}`

请求示例。

```json
{
  "schemaVersion": "0.0.8",
  "steps": [],
  "otherStep": {
    "nodes": [],
    "edges": []
  }
}
```

### 2.6 删除模板

`DELETE /api/v1/templates/{id}`

## 3. 运行接口

### 3.1 启动运行

`POST /api/v1/runs`

请求示例。

```json
{
  "templateId": "template-id",
  "dryRun": false,
  "debug": {
    "enabled": true,
    "openVisibleBrowser": true,
    "openDevtools": false,
    "previewFps": 2,
    "previewQuality": 60,
    "pauseOnStart": false,
    "breakpoints": [],
    "keepBrowserOnFinish": true
  }
}
```

返回示例。

```json
{
  "requestId": "req-1",
  "data": {
    "run": {
      "id": "run-id",
      "templateId": "template-id",
      "status": "PENDING",
      "currentStepId": null,
      "startedAt": null,
      "finishedAt": null,
      "error": null,
      "outputs": {},
      "artifacts": []
    },
    "wsUrl": "/ws/v1/runs/run-id",
    "debug": {
      "enabled": true,
      "status": "STARTING",
      "keepBrowserOnFinish": true
    }
  },
  "error": null
}
```

### 3.2 获取运行列表

`GET /api/v1/runs`

支持查询参数。

- `templateId`
- `status`
- `from`
- `to`
- `limit`
- `offset`

### 3.3 获取运行详情

`GET /api/v1/runs/{id}`

### 3.4 取消运行

`POST /api/v1/runs/{id}/cancel`

### 3.5 重启运行

`POST /api/v1/runs/{id}/restart`

### 3.6 删除运行

`DELETE /api/v1/runs/{id}`

## 4. 调试接口

### 4.1 打开调试浏览器

`POST /api/v1/runs/{id}/debug/open-browser`

### 4.2 获取调试上下文

`GET /api/v1/runs/{id}/debug/context`

返回的上下文快照包含。

- `stepId`
- `stepName`
- `stepType`
- `stepPath`
- `pageAlias`
- `contextId`
- `variables`
- `updatedAt`

### 4.3 调试继续

`POST /api/v1/runs/{id}/debug/continue`

### 4.4 调试单步

`POST /api/v1/runs/{id}/debug/step`

### 4.5 关闭调试会话

`POST /api/v1/runs/{id}/debug/close`

## 5. WebSocket 事件流

连接方式。

```text
ws://127.0.0.1:8080/ws/v1/runs/{runId}
```

客户端可发送 JSON 心跳帧，服务端会返回 JSON `PONG`。

```json
{"type":"PING"}
```

返回示例。

```json
{"type":"PONG","ts":1712914388000}
```

### 5.1 通用事件结构

```json
{
  "runId": "run-id",
  "requestId": "req-id",
  "seq": 1,
  "ts": "2026-04-12T10:00:00.000Z",
  "type": "STEP_STARTED",
  "payload": {}
}
```

### 5.2 运行事件类型

- `RUN_STARTED`
- `STEP_STARTED`
- `STEP_SUCCEEDED`
- `STEP_FAILED`
- `LOG`
- `RUN_SUCCEEDED`
- `RUN_FAILED`
- `RUN_CANCELED`

### 5.3 调试事件类型

- `DEBUG_SESSION_STARTED`
- `DEBUG_FRAME`
- `DEBUG_STATUS_CHANGED`
- `DEBUG_BREAKPOINT_HIT`
- `DEBUG_CONTEXT_UPDATED`
- `DEBUG_RESUMED`
- `DEBUG_STEPPED`
- `DEBUG_SESSION_CLOSED`
- `DEBUG_ERROR`

### 5.4 调试状态值

- `IDLE`
- `STARTING`
- `STREAMING`
- `PAUSED`
- `COMPLETED_WAITING_CLOSE`
- `FAILED_WAITING_CLOSE`
- `CLOSED`
- `ERROR`

## 6. 核心模型

### 6.1 模板模型

```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "schemaVersion": "0.0.8",
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
  "lastRun": null
}
```

### 6.2 运行模型

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
  },
  "outputs": {},
  "artifacts": []
}
```

## 7. 错误码

### 7.1 基础请求与资源错误

| 错误码 | 说明 |
|---|---|
| `TT-0400-001` | 通用错误请求 |
| `TT-0400-002` | 步骤配置非法 |
| `TT-0404-001` | 模板不存在 |
| `TT-0404-002` | 运行不存在 |
| `TT-0409-001` | 模板冲突 |
| `TT-0422-001` | 运行状态不合法 |

### 7.2 步骤与数据错误

| 错误码 | 说明 |
|---|---|
| `TT-0400-201` | 缺少步骤参数 |
| `TT-0400-202` | 元素目标非法 |
| `TT-0400-203` | 页面目标非法 |
| `TT-0400-204` | 上下文目标非法 |
| `TT-0400-404` | 数据步骤配置非法 |
| `TT-0400-501` | 键盘步骤配置非法 |
| `TT-0400-502` | 文本提取配置非法 |
| `TT-0400-503` | 页面步骤配置非法 |
| `TT-0400-504` | 元素顺序配置非法 |

### 7.3 调试相关错误

| 错误码 | 说明 |
|---|---|
| `TT-0400-301` | 调试参数非法 |
| `TT-0400-302` | 调试会话不存在 |
| `TT-0400-401` | 调试控制非法 |
| `TT-0400-402` | 断点配置非法 |
| `TT-0400-505` | 调试会话已关闭 |
| `TT-0500-301` | 调试预览错误 |
| `TT-0500-302` | 打开调试浏览器失败 |
| `TT-0500-401` | 调试继续执行失败 |
| `TT-0500-501` | 调试保留浏览器失败 |

### 7.4 内部执行与持久化错误

| 错误码 | 说明 |
|---|---|
| `TT-0500-001` | 通用内部错误 |
| `TT-0500-201` | 产物写入失败 |
| `TT-0500-202` | 下载失败 |
| `TT-0500-402` | 调用子流程失败 |
| `TT-0502-001` | 执行错误 |
| `TT-0503-001` | 持久化不可用 |

总结：当前 API 已经覆盖模板、运行、调试和事件流的完整主链路，0.0.9 的工作重点是让这些能力被文档稳定表达，而不是再引入新的临时协议。