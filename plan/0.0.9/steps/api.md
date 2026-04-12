# 0.0.9 API 实施文档（协议冻结 + 文档交付 + 指标验证支撑）

导语：本文档用于冻结 0.0.9 阶段的 API 与事件口径，重点不是继续扩协议面，而是把当前已实现接口整理成可文档化、可验证、可答辩的稳定基线。

## 1. 目标与边界

- 目标：把当前模板、运行、调试、WebSocket 事件流整理成正式 API 文档口径。
- 目标：明确错误码、调试状态、环境变量和真实联调方式，避免 README 与实现不一致。
- 目标：为后续浏览器兼容、并发执行、成功率统计等专项测试提供稳定调用入口。
- 边界：0.0.9 不优先新增大批接口，也不为指标验证单独重做一套运行协议。

## 2. 当前协议基线

### 2.1 REST 基线路径

- 健康检查：`GET /api/v1/health`
- 模板列表：`GET /api/v1/templates`
- 创建模板：`POST /api/v1/templates`
- 模板详情：`GET /api/v1/templates/{id}`
- 更新模板元信息：`PATCH /api/v1/templates/{id}`
- 保存模板步骤：`PUT /api/v1/templates/{id}`
- 删除模板：`DELETE /api/v1/templates/{id}`
- 启动运行：`POST /api/v1/runs`
- 运行列表：`GET /api/v1/runs`
- 运行详情：`GET /api/v1/runs/{id}`
- 取消运行：`POST /api/v1/runs/{id}/cancel`
- 重启运行：`POST /api/v1/runs/{id}/restart`
- 删除运行：`DELETE /api/v1/runs/{id}`
- 打开调试浏览器：`POST /api/v1/runs/{id}/debug/open-browser`
- 获取调试上下文：`GET /api/v1/runs/{id}/debug/context`
- 调试继续：`POST /api/v1/runs/{id}/debug/continue`
- 调试单步：`POST /api/v1/runs/{id}/debug/step`
- 关闭调试会话：`POST /api/v1/runs/{id}/debug/close`

### 2.2 WebSocket 基线路径

- 事件流：`/ws/v1/runs/{runId}`
- 心跳：客户端发送 `{"type":"PING"}`，服务端回 `{"type":"PONG","ts":...}`

## 3. 0.0.9 协议实施要求

| 项目 | 0.0.9 要求 |
|---|---|
| 文档化完整度 | 所有已实现接口补齐请求示例、响应示例、字段说明 |
| 事件文档化 | 所有运行事件与调试事件列出类型、关键 payload 字段与使用场景 |
| 错误码口径 | 把当前 ErrorCodes 中的核心业务码整理成对外表格 |
| 环境变量口径 | API/WS 地址、日志等级、鉴权开关与 mock/real 运行方式写清楚 |
| 指标测试支撑 | 浏览器兼容、并发执行与成功率统计复用当前接口，不新增专用接口 |

## 4. 数据模型冻结

### 4.1 模板相关模型

- `WorkflowTemplate`
- `TemplateSummary`
- `TemplateStats`
- `LastRun`
- `CreateTemplateRequest`
- `PatchTemplateRequest`
- `SaveTemplateRequest`

### 4.2 运行相关模型

- `Run`
- `RunError`
- `RunArtifact`
- `StartRunRequest`
- `StartRunData`
- `RunListData`
- `RunDebugOptions`
- `RunDebugSession`
- `RunDebugContextSnapshot`

### 4.3 事件模型

- `RunEvent`
- `EventType`

## 5. 事件口径

### 5.1 运行事件

- `RUN_STARTED`
- `STEP_STARTED`
- `STEP_SUCCEEDED`
- `STEP_FAILED`
- `LOG`
- `RUN_SUCCEEDED`
- `RUN_FAILED`
- `RUN_CANCELED`

### 5.2 调试事件

- `DEBUG_SESSION_STARTED`
- `DEBUG_FRAME`
- `DEBUG_STATUS_CHANGED`
- `DEBUG_BREAKPOINT_HIT`
- `DEBUG_CONTEXT_UPDATED`
- `DEBUG_RESUMED`
- `DEBUG_STEPPED`
- `DEBUG_SESSION_CLOSED`
- `DEBUG_ERROR`

### 5.3 调试状态

- `IDLE`
- `STARTING`
- `STREAMING`
- `PAUSED`
- `COMPLETED_WAITING_CLOSE`
- `FAILED_WAITING_CLOSE`
- `CLOSED`
- `ERROR`

## 6. 文档产物要求

0.0.9 需要产出三类正式文档。

1. `docs/api-reference.md`：面向调用者的 API 文档。
2. `docs/deployment.md`：面向部署者的接口与环境说明。
3. `backend/README.md`：面向仓库使用者的简版后端说明。

## 7. 暂不纳入本版的协议扩展

- 专门用于成功率统计的独立查询接口。
- 专门用于性能采样的内部诊断接口。
- 计划任务、模板市场、多租户等产品化接口。

> 说明：若专项测试必须采集额外数据，优先复用运行列表、运行详情和现有事件流，不新增难维护的临时接口。

## 8. 验收信号

1. 调用者可以只看 `docs/api-reference.md` 就完成模板创建、保存、运行、调试与事件订阅。
2. README、后端 README 和 API 文档不再出现接口或字段冲突。
3. 0.0.9 后续专项测试脚本可以直接引用这里冻结的接口口径。

总结：0.0.9 的 API 主线不是“继续扩”，而是“先冻结、先写清、先让调用和答辩都能自洽”。