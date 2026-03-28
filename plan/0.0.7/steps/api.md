# 0.0.7 API 实施文档（断点控制 + 变量快照 + 子流程复用）

导语：本文档用于定义 0.0.7 的运行控制接口与事件协议，重点解决断点暂停、继续/单步、变量快照、`callWorkflow` 路径表达与数据处理步骤兼容。

## 1. 目标与边界

- 目标：在 0.0.6 调试协议基础上增加断点控制与变量快照能力。
- 目标：为 `callWorkflow` 和新数据步骤定义最小可用协议，不破坏既有 run 结构。
- 边界：本版不定义条件断点、表达式断点与预览画面交互协议。

## 2. 协议升级原则

1. 默认运行模式继续复用 0.0.6 的 run 协议与普通事件。
2. 调试深化能力通过新增字段、控制接口和事件扩展，不替换既有调试事件。
3. `callWorkflow` 通过扩展 `stepPath`、输出与错误语义表达嵌套执行，而不是单独造第二套 run。
4. 新数据步骤优先保持与现有 step config 一致的 JSON 配置风格。

## 3. REST 接口实施清单

| 方法 | 路径 | 0.0.7 要求 |
|---|---|---|
| POST | `/api/v1/runs` | 允许通过 `debug.breakpoints` 与调试选项启动断点运行 |
| GET | `/api/v1/runs/{id}` | 返回 run 基础信息、debug session、最新变量快照摘要 |
| POST | `/api/v1/runs/{id}/debug/continue` | 从暂停态继续运行 |
| POST | `/api/v1/runs/{id}/debug/step` | 从暂停态单步推进一个步骤 |
| GET | `/api/v1/runs/{id}/debug/context` | 获取当前变量快照与调试上下文 |
| POST | `/api/v1/runs/{id}/debug/open-browser` | 兼容 0.0.6，继续保留 |
| POST | `/api/v1/runs/{id}/debug/close` | 兼容 0.0.6，继续保留 |

> 建议：若 `GET /debug/context` 足够稳定，前端变量检查器应优先依赖事件增量 + 该接口兜底，而不是频繁轮询整个 run 详情。

## 4. WebSocket 事件升级清单

### 4.1 普通运行与 0.0.6 调试事件保持兼容

- 保持 `RUN_STARTED`、`STEP_STARTED`、`STEP_SUCCEEDED`、`STEP_FAILED` 等普通事件不变。
- 保持 `DEBUG_SESSION_STARTED`、`DEBUG_FRAME`、`DEBUG_STATUS_CHANGED`、`DEBUG_SESSION_CLOSED`、`DEBUG_ERROR` 可继续消费。

### 4.2 0.0.7 建议新增事件

- `DEBUG_BREAKPOINT_HIT`
- `DEBUG_CONTEXT_UPDATED`
- `DEBUG_RESUMED`
- `DEBUG_STEPPED`

### 4.3 断点命中事件结构

```json
{
  "type": "DEBUG_BREAKPOINT_HIT",
  "payload": {
    "runId": "run-1",
    "stepId": "step-3",
    "stepPath": "root/step-3",
    "pageAlias": "tab1",
    "contextId": "ctx-1",
    "message": "breakpoint hit before step execution",
    "ts": "2026-03-28T10:00:00.000Z"
  }
}
```

### 4.4 变量快照事件结构

```json
{
  "type": "DEBUG_CONTEXT_UPDATED",
  "payload": {
    "runId": "run-1",
    "stepPath": "root/step-3",
    "pageAlias": "tab1",
    "contextId": "ctx-1",
    "variables": {
      "title": "Example Domain",
      "items": [1, 2, 3]
    },
    "ts": "2026-03-28T10:00:01.000Z"
  }
}
```

## 5. 数据字段约定

- `debug.breakpoints?: string[]`：断点步骤 ID 列表。
- `debug.pauseOnStart?: boolean`：是否启动后立即暂停。
- `debug.currentStepPath?: string`：当前暂停或执行中的步骤路径。
- `debug.variablesVersion?: string`：变量快照版本或时间戳，用于前端避免误读旧值。
- `callWorkflow.workflowId: string`：被调用模板 ID。
- `callWorkflow.inputMapping?: Record<string, string>`：显式参数映射。
- `callWorkflow.outputVar?: string`：子流程返回结果写回变量名。

## 6. 错误码建议

| 错误码 | HTTP | 语义描述 | 场景 |
|---|---:|---|---|
| `TT-0400-401` | 400 | 调试控制非法 | run 不在暂停态却调用 `continue` 或 `step` |
| `TT-0400-402` | 400 | 断点配置非法 | 断点 stepId 不存在或重复 |
| `TT-0400-403` | 400 | 子流程引用非法 | `workflowId` 不存在或引用自身 |
| `TT-0400-404` | 400 | 数据步骤配置非法 | `keyPath`、随机输入数组等参数不合法 |
| `TT-0500-401` | 500 | 调试状态恢复失败 | 暂停态恢复或单步推进异常 |
| `TT-0500-402` | 500 | 子流程执行失败 | 被调用模板运行异常且未正常包装 |

## 7. 联调检查点与验收口径

1. 命中断点后收到 `DEBUG_BREAKPOINT_HIT`，run 进入暂停态。
2. 调用 `continue` 后收到恢复事件并继续执行到后续步骤。
3. 调用 `step` 后只推进一个步骤，再次回到暂停或终态。
4. 变量快照在断点与步骤完成点更新，且 `pageAlias`、`contextId` 同步正确。
5. `callWorkflow` 的嵌套执行可在 `stepPath` 中定位到父子层级。
6. 普通运行与 0.0.6 调试预览协议不回归。

总结：0.0.7 API 实施的重点是让“调试可控、变量可查、子流程可追踪”，并继续保证旧运行链路兼容可回归。