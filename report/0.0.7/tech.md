# TheTower 0.0.7 技术实现报告

导语：本文档用于记录 0.0.7 的最终实现路径、关键设计点、真实缺陷修复与测试资产，统一“代码已完成”后的技术口径。

## 1. 技术目标达成

| 目标项 | 状态 | 结果说明 |
|---|---|---|
| 调试控制深化 | 已完成 | 已交付断点、暂停、继续、单步和变量快照，并保持与既有 run 生命周期一致。 |
| `callWorkflow` 子流程复用 | 已完成 | 已支持模板调用、入参映射、结果写回、循环引用校验与嵌套深度保护。 |
| 数据处理步骤 | 已完成 | 已交付 `convertJson`、`extractKey`、`randomGet`，并接入前后端校验与真实执行。 |
| 0.0.6 不回归 | 已完成 | 调试预览、全屏调试、宿主机浏览器入口与编辑器体验继续通过回归。 |

## 2. 后端实现要点

### 2.1 调试状态机

- 在 `RunService` 中补齐暂停态、继续与单步控制，并沿用既有 run 生命周期。
- 在 `DebugExecutionGate` 中定义 `PAUSE_ON_START`、`BREAKPOINT`、`STEP_COMPLETE` 三类暂停原因，保证暂停与恢复语义稳定。
- 在 WebSocket 事件层新增 `DEBUG_BREAKPOINT_HIT`、`DEBUG_CONTEXT_UPDATED`、`DEBUG_RESUMED`、`DEBUG_STEPPED`，扩展而不替换 0.0.6 协议。

### 2.2 流程复用

- `callWorkflow` 在执行层复用同一 run 和 `stepPath`，子流程路径通过 `callWorkflow` 层级展开。
- 模板保存阶段和运行阶段都增加循环引用与嵌套深度保护，避免只依赖前端校验。
- `inputMapping` 修复为同时支持“纯变量名”和模板字符串两种写法，解决前端表单与后端解析语义漂移。

### 2.3 数据处理步骤

- `convertJson` 支持 `parse` / `stringify` 两个方向，并对非法输入返回稳定错误。
- `extractKey` 支持 `data.items[0].title` 形式的 `keyPath`，不存在或越界时返回结构化错误。
- `randomGet` 对空数组返回明确错误，不再依赖随机实现细节。

## 3. 前端实现要点

### 3.1 调试工作台

- 在 `RunPanel` 内补齐暂停提示、继续、单步和变量检查器，不新增独立调试页面。
- `runStore` 统一消费 0.0.7 调试事件，并规范化 `latestContext`，避免空变量快照导致面板崩溃。
- 节点渲染补齐断点标识与暂停态视觉反馈，命中节点可快速定位。

### 3.2 步骤配置与保存

- `callWorkflow` 配置面板支持模板选择、手动模板 ID、参数映射 JSON 与结果变量。
- 0.0.7 数据步骤已接入步骤库、校验、保存加载与回归测试。
- 前端补齐数据步骤与后端协议字段的映射兼容：UI 继续使用“输入变量/输出变量/转换目标”，保存时转换为执行层需要的 `value`、`direction`、`inputVar`、`saveAs`。

## 4. 关键缺陷修复

- 修复：前端数据步骤保存字段与后端执行字段不一致，导致真实运行无法命中 `convertJson`、`extractKey`、`randomGet` 的正确配置。
- 修复：调试启动与单步响应中的 `latestContext.variables` 可能缺省，前端变量检查器会因 `Object.keys(undefined)` 崩溃。
- 修复：`callWorkflow.inputMapping` 前端传变量名、后端按模板字符串解析，导致子流程收到字面量而不是父流程变量值。
- 修复：真实联调用例中的若干歧义文本断言，统一改为更稳定的精确匹配或行内断言。

## 5. 测试资产更新

- 前端 mock 回归：`frontend/e2e/smoke.spec.ts`、`frontend/e2e/regression.spec.ts`
- 前端真实联调：`frontend/e2e/real-backend.spec.ts`
- 后端关键实现：`backend/src/main/kotlin/com/thetower/services/RunService.kt`、`backend/src/main/kotlin/com/thetower/services/DebugExecutionGate.kt`、`backend/src/main/kotlin/com/thetower/services/StepTreeSupport.kt`、`backend/src/main/kotlin/com/thetower/executor/PlaywrightRunSession.kt`

## 6. 版本承接说明

- 0.0.7 承接 0.0.6 的调试预览、全屏调试与编辑器交互优化。
- 本版把重点从“能看见”推进到“能暂停、能继续、能复用、能处理常见数据”。

总结：0.0.7 的技术收口点是让调试控制、流程复用和数据处理三条主线都形成稳定协议、真实回归和缺陷闭环，而不是只完成表层 UI。