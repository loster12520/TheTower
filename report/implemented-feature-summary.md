# TheTower 已实现功能详细汇总与统一测试结果

导语：本文档汇总当前代码库中已经落地的功能能力，并给出 2026-03-15 的统一回归测试结果、问题修复记录与当前可用性结论。

## 1. 汇总范围
- 统计范围：`backend/`、`frontend/`、`test/`、`backend/scripts/`、`frontend/e2e/`、`report/0.0.4/`。
- 结论口径：仅统计已在代码中实现且已被当前测试验证的能力。
- 统计时间：2026-03-15。

## 2. 后端已实现功能

### 2.1 API 与运行能力
- 已实现健康检查、模板 CRUD、运行启动/查询/列表/重启/取消/删除。
- 已实现统一响应包装：`requestId/data/error`。
- 已实现运行事件流推送：`/ws/v1/runs/{runId}`。
- 已实现旧模板 `0.0.1` 与控制流模板 `0.0.4` 的并行兼容。

### 2.2 控制流执行能力
- 已实现 `if / forTimes / while / break` 的递归执行骨架。
- 已实现步骤树校验：`then/body` 必填、`while.maxIterations` 校验、`break` 仅允许出现在循环体内。
- 已实现递归步数统计，模板 `stats.stepCount` 可包含子步骤。
- 已实现运行事件扩展：`stepPath / parentStepId / branch`。

### 2.3 执行器与持久化
- 已接入 Playwright 执行器，支持 `openUrl/click/type/waitFor/extract`。
- 已完成 SQLite + Jimmer 数据层主链路。
- 已支持模板与运行数据持久化。

## 3. 前端已实现功能

### 3.1 页面与编排能力
- 已实现模板首页、编辑页、运行面板与属性面板切换。
- 已实现控制流节点 `if / forTimes / while / break` 的节点库、配置面板与保存流程。
- 已实现 subflow 画布：THEN/ELSE/BODY 缩略预览、切换编辑、工作台提示、保存与重载恢复。
- 已实现 `break` 作用域限制，根流程不暴露，循环 BODY 内才允许拖入。

### 3.2 运行态与联调能力
- 已实现真实 `stepPath` 消费与运行路径展示。
- 已实现容器节点与分支预览的失败态、执行态聚合显示。
- 已实现运行面板失败节点一键定位，可自动切入对应 subflow 并选中目标节点。
- 已实现真实联调模式下直连后端 WS，避免代理链路导致的事件流异常。

### 3.3 基础设施与样式
- 已实现统一请求层、WebSocket 工厂与增强 Hook。
- 已实现主题变量、布局页与编辑页样式整理。
- 已实现真实联调与 mock 模式分离的 Playwright 配置。

## 4. 自动化测试能力
- 后端单元测试：`TemplateServiceTest`、`StepTreeSupportTest`。
- 后端冒烟脚本：`backend/scripts/api-smoke-test.ps1`。
- 后端 WS 脚本：`backend/scripts/ws-event-test.ps1`。
- 后端 0.0.4 集成脚本：`test/0.0.4/backend-if-step-path-test.ps1`。
- 前端常规 Playwright：`frontend/e2e/smoke.spec.ts`、`frontend/e2e/import-export.spec.ts` 与 `frontend/e2e/regression.spec.ts`。
- 前端真实后端联调 Playwright：`frontend/e2e/real-backend.spec.ts`。

## 5. 统一回归测试（2026-03-15）

### 5.1 执行项与结果
| 类别 | 命令 | 结果 |
|---|---|---|
| 后端单元测试 | `Set-Location backend; gradle test` | 通过 |
| 前端构建 | `Set-Location frontend; npm run build` | 通过 |
| 后端 API 回归 | `backend/scripts/api-smoke-test.ps1` | 通过（15/15） |
| 后端 WS 回归 | `backend/scripts/ws-event-test.ps1` | 通过 |
| 后端 0.0.4 IF 路径回归 | `test/0.0.4/backend-if-step-path-test.ps1` | 通过 |
| 前端常规 E2E 回归 | `Set-Location frontend; npx playwright test` | 通过（17/17） |
| 前端真实联调回归 | `Set-Location frontend; npx playwright test -c playwright.real.config.ts` | 通过（5/5） |

### 5.2 实测关键指标
- API 冒烟：`15/15` 通过。
- 常规前端 Playwright：`17/17` 通过。
- 真实联调 Playwright：`5/5` 通过。
- 真实联调已覆盖 IF 路径、While BODY 路径、失败态展示、失败节点定位，以及空白模板作者流运行成功。

## 6. 本轮问题与修复记录

| 问题 | 现象 | 修复结果 |
|---|---|---|
| `otherStep` 空值兼容不足 | 真实模板加载时前端崩溃 | 已为 `stepsToGraph` 增加空值兜底 |
| WebSocket 重复重连 | 运行面板只显示重复 `RUN_STARTED` | 已稳定回调与编解码引用，并支持真实 WS 直连 |
| 子流程失败不可见 | 未展开容器看不到子节点失败 | 已增加路径前缀聚合与容器失败态展示 |
| 运行面板空 `payload` 崩溃 | 真实失败场景下事件流渲染报错 | 已增加空对象回退渲染 |
| 失败定位命中容器根节点 | 点击定位后未进入具体失败分支 | 已优先使用最深层失败 `stepPath` |

## 7. 当前结论
- 当前代码库已具备“前端编排 + 后端执行 + 实时观测 + 失败定位”的完整可运行闭环。
- 0.0.4 的控制流与 subflow 能力已完成并经过真实联调验证。
- 当前未发现阻塞性缺陷，仓库级对外结论应以 0.0.4 报告为准。

总结：TheTower 当前已形成“控制流可编辑、递归执行可观测、失败可定位、旧模板不回归”的稳定基线。
