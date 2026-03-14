# TheTower 0.0.3 测试文档模板

导语：本文档用于 0.0.3 的测试执行与记录，覆盖模板导入/导出、STEP_FAILED 与 WS 心跳稳定性。

## 1. 后端测试

| 用例ID | 测试项 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| BE-301 | WS 心跳稳定 | 连接 WS，持续发送 PING 2 分钟 | 连接不因积压断开 | `pingCount=24, pongCount=24, endedBecause=deadline` | 通过 |
| BE-302 | STEP_FAILED 事件 | 构造必失败步骤并运行 | 收到 STEP_FAILED 与 RUN_FAILED | `messageCount=8, 含 STEP_FAILED/RUN_FAILED` | 通过 |

## 2. 前端测试

| 用例ID | 测试项 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| FE-301 | 导出模板 | 首页导出任意模板 | 下载 JSON 成功 | Playwright：export 用例通过 | 通过 |
| FE-302 | 导入模板 | 首页导入导出文件 | 导入成功并刷新列表 | Playwright：import 用例通过 | 通过 |

## 3. 端到端回归

| 用例ID | 场景 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| E2E-301 | 导出再导入 | 执行 Playwright E2E 套件（smoke + import/export） | 核心链路可用且不回归 | `npx playwright test`：5/5 通过 | 通过 |

总结：0.0.3 测试以“导入/导出可复现、失败可定位、长连接稳定”为验收核心，本次回归已覆盖并通过。
