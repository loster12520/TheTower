# 0.0.3 API 实施文档（模板交换 + 事件增强）

导语：本版本不新增 REST 资源路径，主要补齐 WS 事件语义与心跳处理，保证前端可定位失败并长期稳定订阅。

## 1. REST 变更范围
- 无新增接口。
- 复用现有：`GET /api/v1/templates/{id}` 用于导出；`POST /api/v1/templates` + `PUT /api/v1/templates/{id}` 用于导入落库。

## 2. WebSocket 事件增强

### 2.1 STEP_FAILED 事件
- 触发：执行某个 step 时出现异常。
- payload：

```json
{
  "stepId": "string",
  "stepType": "string",
  "error": { "code": "TT-0502-001", "message": "..." }
}
```

### 2.2 事件顺序约束
- 同一次 run 的事件 `seq` 必须严格递增。
- 失败路径事件序列：`STEP_STARTED` -> `LOG`（可选）-> `STEP_FAILED` -> `RUN_FAILED`。

## 3. 心跳消息处理

### 3.1 客户端心跳消息
- 文本帧：`{"type":"PING","ts":123}`。

### 3.2 服务端处理
- 必须消费 incoming。
- 可选回包：`{"type":"PONG","ts":123}`。

总结：0.0.3 的 API 侧改动以“事件可定位 + WS 可稳定”两条约束为核心。
