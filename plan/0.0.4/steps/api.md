# 0.0.4 API 实施文档（步骤扩展与 subflow 协议）

导语：本文档用于落地 0.0.4 的接口协议与事件结构，重点解决步骤扩展、subflow 持久化、运行事件可观测性与前后端兼容问题。

## 目录
- [1. 目标与边界](#1-目标与边界)
- [2. 协议升级原则](#2-协议升级原则)
- [3. 模板保存结构升级](#3-模板保存结构升级)
- [4. REST 接口实施清单（0.0.4）](#4-rest-接口实施清单004)
- [5. WebSocket 事件升级清单](#5-websocket-事件升级清单)
- [6. 校验与错误码扩展](#6-校验与错误码扩展)
- [7. 兼容策略](#7-兼容策略)
- [8. 联调检查点与验收口径](#8-联调检查点与验收口径)

---

## 1. 目标与边界

### 1.1 本版目标
- 扩展模板协议，支持容器步骤携带 subflow 子步骤。
- 扩展运行事件，支持通过 `stepPath` 表达嵌套执行位置。
- 保持现有 `templates`、`runs`、`ws/runs/{runId}` 主路径不变。
- 为前端 subflow 编辑与后端递归执行提供统一数据语义。

### 1.2 本版边界
- 不新增独立 `subflows` 资源，不拆分成多张模板表。
- 不引入跨模板事务编排。
- 不为第三方工具步骤设计协议字段。

---

## 2. 协议升级原则

### 2.1 升级原则
1. 主流程仍使用 `steps: Step[]` 表达。
2. 容器步骤仅在 `config` 内新增固定分支字段：`then`、`else`、`body`。
3. 普通步骤协议不被破坏，0.0.3 模板应可继续读取。
4. 前端可维护 richer 编辑态，但提交到后端的模板必须是稳定 JSON 结构。

### 2.2 容器步骤范围

| stepType | 分支字段 | 说明 |
|---|---|---|
| `if` | `then`、`else` | 双分支 |
| `forEachElement` | `body` | 单体循环 |
| `forTimes` | `body` | 固定次数循环 |
| `forEachData` | `body` | 数据循环 |
| `while` | `body` | 条件循环 |
| `startBrowser` | `body` | 浏览器上下文容器 |

---

## 3. 模板保存结构升级

### 3.1 Step 结构不变，config 扩展

```json
{
  "id": "if-1",
  "type": "if",
  "position": { "x": 200, "y": 120 },
  "data": {
    "label": "IF 条件",
    "config": {
      "condition": {
        "left": "${loginState}",
        "op": "exists",
        "right": ""
      },
      "then": [
        {
          "id": "click-1",
          "type": "click",
          "position": { "x": 0, "y": 0 },
          "data": {
            "label": "点击登录",
            "config": { "selector": "#login" }
          }
        }
      ],
      "else": []
    }
  }
}
```

### 3.2 前端编辑态与提交态约定
- 前端编辑态允许在容器节点内部维护 subflow 的 `nodes/edges`。
- 提交态必须把每个 subflow 编译为有序 `Step[]`。
- 后端不接收 ReactFlow 特有运行时字段，如 viewport、selection、dragging 状态。

### 3.3 schemaVersion
- 0.0.4 模板保存时，`schemaVersion` 升级为 `0.0.4`。
- 后端读取旧模板时，若未出现 `then/else/body` 字段，则按普通线性模板处理。

---

## 4. REST 接口实施清单（0.0.4）

### 4.1 模板接口
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/templates` | 无新增字段要求，但 `stats.stepCount` 需明确是否仅统计主流程或包含子流程 |
| GET | `/api/v1/templates/{id}` | 返回完整容器步骤 config，包括 `then/else/body` |
| PUT | `/api/v1/templates/{id}` | 接收 0.0.4 新版步骤结构并执行校验 |

### 4.2 模板统计字段建议
- `stats.stepCount`：建议改为“包含子步骤的总步数”。
- 如前端仍需要主流程步数，建议新增：`stats.rootStepCount`。

### 4.3 保存校验要求
- 顶层 `steps` 必须是单入口线性流程。
- 每个 `then`、`else`、`body` 必须分别通过同层线性校验。
- 容器节点的必填分支字段不能为空对象；允许空数组仅限 `else`。

---

## 5. WebSocket 事件升级清单

### 5.1 事件类型
- 继续沿用：`RUN_STARTED`、`STEP_STARTED`、`STEP_SUCCEEDED`、`STEP_FAILED`、`LOG`、`RUN_SUCCEEDED`、`RUN_FAILED`、`RUN_CANCELED`
- 本版不新增事件种类，优先扩展 `payload` 字段。

### 5.2 事件 payload 升级

```json
{
  "runId": "run-1",
  "type": "STEP_STARTED",
  "payload": {
    "stepId": "click-1",
    "stepType": "click",
    "stepPath": ["if-1", "then", "click-1"],
    "parentStepId": "if-1",
    "branch": "then"
  }
}
```

### 5.3 字段语义
- `stepId`：当前实际执行步骤 ID。
- `stepPath`：从根流程到当前步骤的完整路径。
- `parentStepId`：当前步骤直属容器节点 ID，无父节点则为空。
- `branch`：当前步骤所在分支，取值 `then`、`else`、`body` 或为空。

### 5.4 事件约束
1. 所有步骤事件必须带 `stepPath`。
2. 顶层普通步骤的 `stepPath` 为单元素数组，如 `["open-1"]`。
3. `STEP_FAILED` 必须返回失败步骤的 `stepPath`，便于前端定位到 subflow 内部。

---

## 6. 校验与错误码扩展

| 错误码 | HTTP | 语义描述 | 触发场景 |
|---|---:|---|---|
| `TT-0400-101` | 400 | subflow 结构非法 | 容器节点缺失 `then/else/body` 字段或字段类型错误 |
| `TT-0400-102` | 400 | subflow 非线性 | 某一层 subflow 存在多个起点、多入边、多出边或环 |
| `TT-0400-103` | 400 | break 作用域非法 | `break` 出现在非循环体中 |
| `TT-0400-104` | 400 | 容器步骤配置缺失 | `if.then` 为空或 `while.maxIterations` 缺失 |
| `TT-0502-101` | 502 | 嵌套步骤执行失败 | 子步骤执行异常并中断运行 |

补充约束：
- 旧版节点配置错误码继续保留，不在本版删除。
- 新增错误码必须同步更新前端错误提示映射。

---

## 7. 兼容策略

### 7.1 读取兼容
- 读取 0.0.3 及之前模板时，不要求自动补齐空分支字段。
- 只有用户新增容器步骤并保存后，模板才会升级到 0.0.4 结构。

### 7.2 写入兼容
- 后端可接受旧结构保存请求，但若包含 0.0.4 新 stepType，则必须通过新校验。
- 前端导入旧 JSON 时，缺少子流程字段不视为错误。

### 7.3 回滚策略
- 若前端 subflow 编辑功能未完成，可先保留后端对子流程字段的读取能力，不开放新节点类型到 UI。

---

## 8. 联调检查点与验收口径

### 8.1 联调检查点
1. 前端保存带 `if.then/else` 的模板后，GET 详情返回结构一致。
2. 子流程模板重新加载后，subflow 内容不丢失。
3. 运行容器节点时，前端可根据 `stepPath` 精确定位执行位置。
4. 非法 `break` 与非法 subflow 结构能返回文档登记的错误码。

### 8.2 验收口径
- 模板协议可承载容器步骤子流程。
- WS 事件可表达嵌套执行路径。
- 旧版模板读取不报错。
- 0.0.4 新结构可被保存、读取、运行、定位错误。

总结：0.0.4 API 实施以“容器步骤协议化、subflow 持久化、事件路径化、旧版兼容”为主线，先把协议打稳，再进入前后端实现。