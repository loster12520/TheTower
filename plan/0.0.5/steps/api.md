# 0.0.5 API 实施文档（高频步骤与 artifacts 协议）

导语：本文档用于落地 0.0.5 的接口协议与运行事件扩展，重点解决新增步骤、artifacts、浏览器上下文与运行结果可观测性。

## 1. 目标与边界

- 目标：在不改变主资源路径的前提下，支持第一批高频步骤与其运行结果。
- 目标：为截图、下载等产物定义稳定的 artifacts 语义。
- 目标：为多标签页与浏览器上下文定义最小可用协议。
- 边界：不新增独立 artifacts 资源接口；本版允许先通过 run 详情或事件回传产物元信息。

## 2. 协议升级原则

1. 模板结构继续沿用 `steps + otherStep + config.then/else/body`。
2. 新 stepType 仅通过 `type + config` 扩展，不新增另一套步骤结构。
3. 运行事件优先扩展 payload 字段，不更换事件种类。
4. 旧模板可读，旧事件解析逻辑不应因新增字段而失效。

## 3. 模板保存结构扩展

### 3.1 新 stepType

- 页面操作：`newPage`、`closePage`、`switchPage`、`reloadPage`、`screenshotPage`、`hover`、`focus`、`selectOption`、`scrollPage`、`uploadFiles`、`executeJs`
- 等待操作：`waitForResponse`，以及 `waitFor` 的参数增强
- 获取数据：`getUrl`、`downloadFile`、`importText`、`totp`、`getCookies`、`clearCookies`
- 流程管理：`forEachElement`、`forEachData`、`startBrowser`、`closeBrowser`

### 3.2 公共字段约定

- 可阻塞步骤支持 `timeoutMs?: number`
- 元素类步骤支持：
  - `selector?: string`
  - `elementRefVar?: string`
  - `elementOrder?: { mode: 'fixed'|'randomRange', index?: number, min?: number, max?: number }`
- 输出字段统一使用 `saveAs?: string`

### 3.3 浏览器上下文字段

- 页面步骤可返回 `pageAlias?`
- 容器上下文步骤可返回 `contextId?`
- `startBrowser` 的 `body` 内部步骤默认绑定当前容器上下文

## 4. REST 接口实施清单

| 方法 | 路径 | 0.0.5 要求 |
|---|---|---|
| GET | `/api/v1/templates/{id}` | 返回完整 0.0.5 步骤结构与新 config 字段 |
| PUT | `/api/v1/templates/{id}` | 接收 0.0.5 新步骤并执行参数与结构校验 |
| POST | `/api/v1/runs` | 支持运行新增步骤与 artifacts 结果 |
| GET | `/api/v1/runs/{id}` | 若已有详情能力，应允许返回 outputs 与 artifacts 摘要 |

> 补充：若现有 `GET /api/v1/runs/{id}` 尚未承载 outputs 与 artifacts，可先通过 WS 事件补齐最小可观测能力，再在后续版本完善详情接口。

## 5. WebSocket 事件升级清单

### 5.1 保持现有事件种类

- `RUN_STARTED`
- `STEP_STARTED`
- `STEP_SUCCEEDED`
- `STEP_FAILED`
- `LOG`
- `RUN_SUCCEEDED`
- `RUN_FAILED`
- `RUN_CANCELED`

### 5.2 步骤成功事件扩展

```json
{
  "type": "STEP_SUCCEEDED",
  "payload": {
    "stepId": "shot-1",
    "stepType": "screenshotPage",
    "stepPath": ["shot-1"],
    "outputs": {},
    "artifacts": [
      {
        "artifactId": "artifact-1",
        "name": "homepage.png",
        "kind": "screenshot",
        "relativePath": "runs/run-1/homepage.png"
      }
    ]
  }
}
```

### 5.3 字段语义

- `outputs`：步骤新增或覆盖的运行变量
- `artifacts`：步骤产生的产物列表
- `pageAlias`：当前步骤创建或切换到的页面别名
- `contextId`：当前步骤所在浏览器上下文标识

## 6. 错误码与校验扩展

| 错误码 | HTTP | 语义描述 | 场景 |
|---|---:|---|---|
| `TT-0400-201` | 400 | step config 缺少必要参数 | 新步骤缺少 `value`、`saveAs`、`responseUrl` 等 |
| `TT-0400-202` | 400 | 元素定位配置非法 | `selector` 与 `elementRefVar` 均为空 |
| `TT-0400-203` | 400 | 页面切换目标非法 | `switchPage` 未命中页面 |
| `TT-0400-204` | 400 | 浏览器上下文非法 | `closeBrowser` 在无上下文时执行 |
| `TT-0500-201` | 500 | artifact 写入失败 | 截图、下载落盘异常 |
| `TT-0500-202` | 500 | 下载失败 | `downloadFile` 失败或超时 |

## 7. 兼容策略

- 未使用 0.0.5 新步骤的 0.0.4 模板不需要自动迁移即可继续运行。
- `schemaVersion` 可升级为 `0.0.5`，但后端仍应接受旧模板读取。
- 前端若暂未消费 `artifacts` 字段，不应影响运行主链路。

## 8. 联调检查点与验收口径

1. 新步骤模板保存后，GET 详情返回结构一致。
2. `STEP_SUCCEEDED` 可回传 `outputs` 与 `artifacts`。
3. 截图与下载步骤的产物信息可在事件中查询。
4. `startBrowser` 与 `closeBrowser` 的上下文切换语义明确，不污染主流程。
5. 旧模板读取与运行不报错。

总结：0.0.5 API 实施的重点是“新步骤可保存、事件可观测、产物可追踪、旧结构不破坏”，先把协议打稳，再进入实现与联调。