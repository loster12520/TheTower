# TheTower 0.0.3 版本总结

导语：本文档用于 0.0.3 收官时汇总目标达成情况、统一回归结果、问题修复与发布结论。

## 1. 版本目标与达成情况

| 目标项 | 状态 | 结果说明 |
|---|---|---|
| 模板导入/导出（JSON） | 完成 | 首页支持导入/导出；Playwright E2E 用例通过 |
| 步骤失败事件（STEP_FAILED） | 完成 | WS 失败回归脚本收到 `STEP_FAILED` 与 `RUN_FAILED` |
| WS 心跳协议与收包处理 | 完成 | 服务端消费 incoming + PING→PONG；心跳回归 2 分钟保持连接 |
| 黑盒回归扩展（取消/失败路径） | 完成 | REST 冒烟（15/15）+ WS 成功/失败两条回归脚本通过 |

## 2. 统一测试与质量结果
- 后端 REST：`backend/scripts/api-smoke-test.ps1`（15/15 通过）
- 后端 WS 成功路径：`backend/scripts/ws-event-test.ps1`（含终态事件、seq 严格递增）
- 后端 WS 失败路径：`test/0.0.3/ws-step-failed-test.ps1`（收到 `STEP_FAILED`、`RUN_FAILED`）
- 后端 WS 心跳：`test/0.0.3/ws-heartbeat-test.ps1`（120s，`pingCount=24`、`pongCount=24`，未断线）
- 前端构建：`frontend/npm run build`（通过）
- 前端 E2E：`frontend/npx playwright test`（5/5 通过，已可自动启动 dev server）

## 3. 缺陷修复记录
- 修复：`RunService.emit()` 仅 `tryEmit` 可能导致事件丢失的边界风险（新增 tryEmit 失败兜底 emit + 日志）
- 修复：WS 路由消费 incoming，避免客户端消息积压导致断连；对 `PING` 回 `PONG`
- 工程：本机 Gradle wrapper 下载分发包存在 SSL 握手问题，已通过全局 Gradle 执行 `buildFatJar` 完成构建与启动
- 测试：Playwright 配置补齐 `webServer`，避免 E2E 因未手动启动 8000 而失败

## 4. 发布结论
- 通过统一回归，可作为 0.0.3 发布基线。

总结：0.0.3 以“模板交换 + 可定位失败 + 长连接稳定”为核心，结果以统一回归为准。
