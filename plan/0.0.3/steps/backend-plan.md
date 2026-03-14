# 0.0.3 后端实施文档（STEP_FAILED + WS 心跳）

导语：后端以最小改动补齐失败可观测性与 WS 稳定性，保证不破坏 0.0.2 的主链路。

## 1. 改动范围
- `services/RunService`：在 step 维度捕获异常并发出 `STEP_FAILED`。
- `routes/WebSocketRoutes`：消费 incoming；对 PING 可选回 PONG。

## 2. 实施步骤

1. <u>补齐</u> `STEP_FAILED` 事件：在每个 step 执行处 try/catch。
2. <u>统一</u> 错误码映射：优先使用 `ApiException.code`，否则 `TT-0500-001`。
3. <u>保证</u> 失败路径落库：run 终态 `FAILED`，`error` 字段可用。
4. <u>修复</u> WS 连接的 incoming 积压：启动一个协程消费 incoming。

## 3. 验收检查点
- WS 失败脚本能收到 `STEP_FAILED`。
- 运行失败后 `GET /api/v1/runs/{id}` 返回 `status=FAILED` 且 `error` 不为空。

总结：后端 0.0.3 以“可定位失败 + 长连接稳定”为主线，不扩张接口。
