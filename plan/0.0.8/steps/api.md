# 0.0.8 API 实施文档（体验收口 + 运行语义修正 + 高频步骤补洞）

导语：本文档用于定义 0.0.8 需要补齐的接口、事件与协议口径，重点解决跨页运行自动启动、调试浏览器保留语义、新增步骤协议以及节点显示信息的用户可读化。

## 1. 目标与边界

- 目标：为“从列表运行跳转到编辑页自动启动”定义稳定的前后端协作方式。
- 目标：明确调试运行结束后浏览器与调试会话的保留语义，不破坏 0.0.7 run 终态。
- 目标：为 `keyboardPress`、`keyboardHotkey`、`textExtract`、`goBack`、`closeOtherPages` 与 `elementRefVar + elementOrder` 补齐协议。
- 目标：让运行与调试事件能同时提供内部 `stepId` 和用户可见的步骤显示名。
- 边界：0.0.8 不新增条件断点、时间旅行调试或预览远程操控协议。

## 2. 协议升级原则

1. 0.0.7 的 run 生命周期、调试控制接口与 WebSocket 事件继续兼容。
2. 0.0.8 以新增字段、补充枚举和明确语义为主，不重做现有响应包装结构。
3. 运行自动启动优先通过前端路由意图传递完成，后端继续只接收标准 `POST /api/v1/runs` 请求。
4. 调试浏览器保留语义与 run 状态解耦：run 可结束，debug session 可继续保留到用户关闭。
5. 新增步骤配置继续沿用现有 JSON config 风格，并与导入导出 schema 保持一致。

## 3. REST 接口实施清单

| 方法 | 路径 | 0.0.8 要求 |
|---|---|---|
| POST | `/api/v1/runs` | 继续作为唯一运行启动入口，支持新步骤 schema 与调试保留策略 |
| GET | `/api/v1/runs/{id}` | 返回当前步骤可读名称、最新调试会话保留状态 |
| GET | `/api/v1/runs/{id}/debug/context` | 继续返回调试上下文，并补齐用户可见步骤名称摘要 |
| POST | `/api/v1/runs/{id}/debug/close` | 显式结束保留的调试会话并关闭浏览器资源 |
| POST | `/api/v1/templates/{id}/run-intent` | 可选；若采用服务端承接跨页运行意图，可新增一次性运行意图票据接口 |

> 建议：若前端可通过路由 state、query 或内存 store 安全传递一次性运行意图，则不新增 `run-intent` 接口，避免无意义扩 API 面。

## 4. Run 启动请求补充约定

### 4.1 调试会话保留策略

建议在 `debug` 下新增可选字段：

```json
{
  "debug": {
    "enabled": true,
    "openVisibleBrowser": true,
    "openDevtools": true,
    "pauseOnStart": false,
    "breakpoints": ["step-1"],
    "keepBrowserOnFinish": true
  }
}
```

- `keepBrowserOnFinish?: boolean`：调试执行结束后是否保留浏览器与调试会话。
- 0.0.8 调试运行默认值建议为 `true`。
- 普通运行忽略该字段。

### 4.2 一次性运行意图字段

- 若采用前端自带路由状态，无需进入 API。
- 若采用服务端票据方式，票据应具备一次性消费、短时过期与模板绑定能力。
- 不论采用哪种方式，都必须防止刷新页面或重复挂载导致重复启动。

## 5. 模板步骤配置协议补充

### 5.1 `keyboardPress`

```json
{
  "type": "keyboardPress",
  "config": {
    "key": "Enter"
  }
}
```

- `key: string`：标准化后的按键名。
- 前端可显示中文标签，保存时统一落标准键名。

### 5.2 `keyboardHotkey`

```json
{
  "type": "keyboardHotkey",
  "config": {
    "modifiers": ["Control", "Shift"],
    "key": "KeyP"
  }
}
```

- `modifiers: string[]`：顺序固定为 `Control/Meta/Shift/Alt`。
- `key: string`：主键。
- 后端应负责转换为底层 Playwright 可消费格式。

### 5.3 `textExtract`

```json
{
  "type": "textExtract",
  "config": {
    "input": "${content}",
    "pattern": "订单号:(\\d+)",
    "groupIndex": 1,
    "global": false,
    "saveAs": "orderId"
  }
}
```

- `input: string`：输入文本或模板字符串。
- `pattern: string`：正则表达式原文。
- `groupIndex?: number`：默认 `0` 或产品约定值；0.0.8 需先固定默认语义。
- `global?: boolean`：是否返回多次匹配结果。
- `saveAs: string`：输出变量。

### 5.4 `goBack`

```json
{
  "type": "goBack",
  "config": {}
}
```

- 可最小化为无参步骤。
- 若后续需要超时控制，可继续复用通用 `timeoutMs` 能力而不是单独造字段。

### 5.5 `closeOtherPages`

```json
{
  "type": "closeOtherPages",
  "config": {
    "keep": "current"
  }
}
```

或：

```json
{
  "type": "closeOtherPages",
  "config": {
    "keep": "alias",
    "pageAlias": "main"
  }
}
```

- `keep`：`current | alias`
- `pageAlias?: string`：仅当 `keep = alias` 时必填。

### 5.6 `elementRefVar + elementOrder`

建议作为选择器类步骤共用字段：

```json
{
  "selector": ".item",
  "elementRefVar": "matchedItems",
  "elementOrder": {
    "type": "index",
    "index": 0
  }
}
```

或：

```json
{
  "elementRefVar": "matchedItems",
  "elementOrder": {
    "type": "random"
  }
}
```

- `elementRefVar?: string`：引用前置变量中的元素或元素集合。
- `elementOrder?: { type: 'first' | 'last' | 'index' | 'random', index?: number }`
- 0.0.8 需固定 `selector` 与 `elementRefVar` 同时存在时的优先级；建议优先使用 `elementRefVar`，`selector` 只作兜底。

## 6. WebSocket 事件补充建议

### 6.1 步骤显示信息补齐

普通步骤事件和调试事件建议统一补充：

- `stepName?: string`：用户可见的步骤名称。
- `stepType?: string`：步骤类型名。
- `stepPathDisplay?: string[]`：适合 UI 直接展示的路径名称数组。

示例：

```json
{
  "type": "STEP_STARTED",
  "payload": {
    "runId": "run-1",
    "stepId": "node_1775872418395_poq5f5oa6",
    "stepName": "输入文本",
    "stepType": "type",
    "stepPath": "root/node_1775872418395_poq5f5oa6",
    "stepPathDisplay": ["主流程", "输入文本"],
    "ts": "2026-04-11T10:00:00.000Z"
  }
}
```

### 6.2 调试结束但会话保留

建议在 `DEBUG_STATUS_CHANGED` 或 `DEBUG_SESSION_CLOSED` 之前明确状态：

- `ACTIVE`
- `PAUSED`
- `COMPLETED_WAITING_CLOSE`
- `FAILED_WAITING_CLOSE`
- `CLOSED`

这样前端可区分“run 结束了，但浏览器还保留”与“调试会话已彻底关闭”。

## 7. 错误码建议

| 错误码 | HTTP | 语义描述 | 场景 |
|---|---:|---|---|
| `TT-0400-501` | 400 | 键盘步骤配置非法 | `key` 为空或组合键主键缺失 |
| `TT-0400-502` | 400 | 文本提取配置非法 | 正则为空、groupIndex 非法 |
| `TT-0400-503` | 400 | 页面操作配置非法 | `closeOtherPages` 的 `keep=alias` 但无 `pageAlias` |
| `TT-0400-504` | 400 | 元素引用配置非法 | `elementOrder.type=index` 但未提供索引 |
| `TT-0400-505` | 400 | 调试会话已关闭 | run 已结束且 debug session 不再接受关闭之外的调试动作 |
| `TT-0500-501` | 500 | 调试浏览器保留失败 | run 正常结束但浏览器保留或状态迁移异常 |

## 8. 联调检查点与验收口径

1. 从列表运行跳转到编辑页后，只触发一次真实运行启动。
2. 调试运行成功或失败后，run 可进入终态，但 debug session 保持“待用户关闭”。
3. 新增步骤在模板保存、加载、运行详情和事件流中字段一致。
4. `stepName`、`stepType` 或 `stepPathDisplay` 足以支撑前端默认不暴露内部节点 ID。
5. `elementRefVar + elementOrder` 在相关步骤中语义一致、错误可观测。
6. 0.0.7 调试继续、单步、变量快照和预览协议不回归。

总结：0.0.8 API 实施的重点不是继续扩大接口数量，而是把运行意图、调试保留语义和高频步骤协议补得更完整、更适合前端直接消费。