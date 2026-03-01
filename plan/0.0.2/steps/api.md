# 0.0.2 API 实施文档（统一响应、错误码与接口语义）

导语：本文档用于落地 0.0.2 的 API 侧实施方案，重点解决统一返回体、错误码体系、语义化命名、可观测性与缓存/持久化兼容问题。

## 目录
- [1. 目标与边界](#1-目标与边界)
- [2. 统一协议约定](#2-统一协议约定)
- [3. REST 接口实施清单（0.0.2）](#3-rest-接口实施清单002)
- [4. WebSocket 事件实施清单](#4-websocket-事件实施清单)
- [5. 错误码登记表（本版）](#5-错误码登记表本版)
- [6. 缓存与持久化对 API 的约束](#6-缓存与持久化对-api-的约束)
- [7. 实施顺序与联调检查点](#7-实施顺序与联调检查点)
- [8. 验收口径](#8-验收口径)

---

## 1. 目标与边界

### 1.1 本文档目标
- 将 `plan/0.0.2/requirements.md` 中 API 相关条款转为可执行清单。
- 给出统一返回体与错误码登记规则，避免“一码多义”。
- 明确 routes 与 services 的语义化命名映射，降低联调歧义。

### 1.2 本版边界
- 保持业务功能边界不扩张：不新增 if/loop 等控制流节点。
- 保持现有 API 资源语义：`templates`、`runs`、`ws/runs/{runId}` 不改主路径。
- 允许新增字段与响应包装能力，但必须保证前端兼容读取。

---

## 2. 统一协议约定

### 2.1 基础约定
- REST Base URL：`/api/v1`
- WebSocket Base URL：`/ws/v1`
- Content-Type：`application/json; charset=utf-8`
- 时间格式：ISO 8601 UTC

### 2.2 统一返回体（必须）

```json
{
  "requestId": "string",
  "data": {},
  "error": null
}
```

错误响应：

```json
{
  "requestId": "string",
  "data": null,
  "error": {
    "code": "TT-0404-001",
    "message": "Template not found",
    "details": {
      "templateId": "xxx"
    }
  }
}
```

### 2.3 便捷返回封装（后端实现约束）
- 成功返回支持 `data.success(requestId)` 风格（扩展函数或工具函数均可）。
- 失败返回统一走 `error.fail(requestId)` 风格，不允许路由层手写散落 JSON。
- 所有失败场景必须落在错误码登记表中。

### 2.4 requestId 透传约定
- 每次 HTTP 请求若未携带 `X-Request-Id`，后端自动生成。
- 返回体必须写入 `requestId`。
- 日志必须携带同一 `requestId`，用于链路追踪。

---

## 3. REST 接口实施清单（0.0.2）

### 3.1 健康检查
| 方法 | 路径 | Service 方法 | 说明 |
|---|---|---|---|
| GET | `/api/v1/health` | `getHealth` | 返回服务状态与版本信息（可选） |

### 3.2 模板接口（语义化命名）
| 方法 | 路径 | Route 方法 | Service 方法 |
|---|---|---|---|
| GET | `/api/v1/templates` | `getTemplates` | `getTemplates` |
| POST | `/api/v1/templates` | `createTemplate` | `createTemplate` |
| GET | `/api/v1/templates/{id}` | `getTemplateById` | `getTemplateById` |
| PATCH | `/api/v1/templates/{id}` | `updateTemplateMeta` | `updateTemplateMeta` |
| PUT | `/api/v1/templates/{id}` | `updateTemplateSteps` | `updateTemplateSteps` |
| DELETE | `/api/v1/templates/{id}` | `deleteTemplate` | `deleteTemplate` |

实施要求：
1. 路由函数命名与 service 函数命名语义保持一致。
2. 模板写操作（POST/PATCH/PUT/DELETE）必须触发模板缓存主动失效。
3. 读接口可接入内存缓存（TTL），但不得返回过期结构字段。

### 3.3 运行接口（语义化命名）
| 方法 | 路径 | Route 方法 | Service 方法 |
|---|---|---|---|
| POST | `/api/v1/runs` | `startRun` | `startRun` |
| POST | `/api/v1/runs/{id}/cancel` | `cancelRun` | `cancelRun` |
| POST | `/api/v1/runs/{id}/restart` | `restartRun` | `restartRun` |
| GET | `/api/v1/runs/{id}` | `getRunById` | `getRunById` |
| GET | `/api/v1/runs` | `getRuns` | `getRuns` |

实施要求：
1. `startRun` 必须返回可用于订阅 WS 的 `runId` 信息。
2. `cancelRun` 与 `restartRun` 必须返回统一响应体，不可裸状态码。
3. 运行状态机错误必须映射错误码，禁止直接抛字符串异常给前端。

---

## 4. WebSocket 事件实施清单

### 4.1 连接接口
| 协议 | 路径 | 说明 |
|---|---|---|
| WS | `/ws/v1/runs/{runId}` | 运行事件流订阅 |

### 4.2 事件类型（0.0.2 继续沿用）
- `RUN_STARTED`
- `STEP_STARTED`
- `STEP_SUCCEEDED`
- `STEP_FAILED`
- `LOG`
- `RUN_SUCCEEDED`
- `RUN_FAILED`
- `RUN_CANCELED`

### 4.3 事件包结构约定

```json
{
  "requestId": "string",
  "runId": "string",
  "type": "STEP_SUCCEEDED",
  "ts": "2026-03-01T00:00:00.000Z",
  "payload": {}
}
```

实施要求：
1. 事件需可被前端统一解析，字段命名与 REST 术语一致。
2. 关键失败事件必须带错误码（`payload.errorCode` 或同等字段）。
3. WS 侧日志必须带 `requestId` 或 `runId` 以便关联 HTTP 启动请求。

---

## 5. 错误码登记表（本版）

> 规则：新增错误码必须先登记后使用；禁止同义多码与一码多义。

| 错误码 | HTTP | 语义描述 | 触发场景 | 前端提示建议 | 处理建议 |
|---|---:|---|---|---|---|
| `TT-0400-001` | 400 | 请求参数非法 | JSON 解析失败/字段缺失 | 请求参数有误，请检查输入 | 不可重试 |
| `TT-0400-002` | 400 | 节点配置非法 | `steps` 中节点 config 不满足 schema | 节点配置不完整，请修正后重试 | 不可重试 |
| `TT-0404-001` | 404 | 模板不存在 | 查询/更新/删除模板 ID 不存在 | 模板不存在或已被删除 | 不可重试 |
| `TT-0404-002` | 404 | 运行记录不存在 | 查询/取消/重启 run 不存在 | 运行记录不存在 | 不可重试 |
| `TT-0409-001` | 409 | 模板并发冲突 | 基于版本或时间戳更新冲突 | 模板已被其他操作修改，请刷新后重试 | 可重试 |
| `TT-0422-001` | 422 | 运行状态非法 | 对已结束 run 执行 cancel/restart | 当前运行状态不允许该操作 | 不可重试 |
| `TT-0500-001` | 500 | 服务器内部错误 | 未分类异常 | 服务异常，请稍后重试 | 可重试 |
| `TT-0502-001` | 502 | 浏览器执行失败 | Playwright 执行链路异常 | 浏览器执行失败，请检查节点配置 | 可重试 |
| `TT-0503-001` | 503 | 持久化不可用 | SQLite/Jimmer 初始化失败 | 数据存储暂不可用，请稍后重试 | 可重试 |

补充约束：
- `TT` 为项目前缀；中段三位为 HTTP 语义段；末段三位为具体序号。
- 错误 message 面向开发日志，前端展示文案按“提示建议”层做映射。

---

## 6. 缓存与持久化对 API 的约束

### 6.1 缓存策略接口约束
- 高读接口（`getTemplates`、`getTemplateById`、`getRuns`）可启用内存缓存。
- 缓存键规则建议：`resource:query-hash`。
- TTL 建议：模板列表 30 秒、模板详情 15 秒、运行列表 10 秒。

### 6.2 主动失效规则
- 模板写操作触发模板相关缓存失效。
- 运行状态变化触发运行相关缓存失效。
- 失效动作写入 `info` 日志，至少包含 `cacheKey` 与 `requestId`。

### 6.3 SQLite + Jimmer 兼容约束
- 对外 API 字段语义保持 0.0.1 不破坏。
- 存储切换后，分页/排序语义不能变化（需保持联调一致）。
- 迁移期间失败统一返回 `TT-0503-001`。

---

## 7. 实施顺序与联调检查点

1. 先落地统一响应封装与错误码中心。
2. 再完成 route/service 语义化命名对齐。
3. 然后接入日志 requestId 透传与缓存策略。
4. 最后接 SQLite + Jimmer 与迁移机制并执行回归联调。

联调检查点：
- 前端请求层是否全部按 `data/error/requestId` 解析。
- 错误码是否与文档一致并可触发对应提示。
- 启动运行后能否通过 WS 收到完整事件链。

---

## 8. 验收口径

- 所有 REST 接口均返回统一包裹结构。
- 路由与服务命名一致率达到 100%。
- 错误码实现与登记表一致率达到 100%。
- 缓存命中/失效可通过日志定位。
- SQLite + Jimmer 改造后，核心 CRUD 与运行主链路可用。

总结：0.0.2 API 实施以“统一协议 + 错误码治理 + 可观测性 + 存储升级兼容”为主线，确保后续功能迭代建立在稳定的接口基础上。
