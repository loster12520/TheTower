# 0.0.6 API 实施文档（调试通道 + 预览帧协议）

导语：本文档用于定义 0.0.6 的调试接口与事件协议，重点解决近实时预览、调试状态、DevTools 控制与普通运行模式兼容。

## 1. 目标与边界

- 目标：在不破坏 0.0.5 运行协议的前提下，增加调试预览与控制入口。
- 目标：为近实时预览帧、调试状态与宿主机调试入口定义最小可用协议。
- 边界：本版不定义远程点击、输入转发与调试画面内交互协议。

## 2. 协议升级原则

1. 默认运行模式继续复用 0.0.5 的 run 协议。
2. 调试相关能力通过新增字段、调试接口或独立通道扩展，不替换既有字段。
3. 调试预览帧只在调试模式下推送。
4. 若宿主机环境不支持可见浏览器，应返回明确错误码。

## 3. REST 接口实施清单

| 方法 | 路径 | 0.0.6 要求 |
|---|---|---|
| POST | `/api/v1/runs` | 允许通过 `debug.enabled` 启动调试模式 |
| GET | `/api/v1/runs/{id}` | 返回当前 run 的基础信息与 `debugStatus?` |
| POST | `/api/v1/runs/{id}/debug/open-browser` | 打开宿主机可见浏览器与 DevTools |
| POST | `/api/v1/runs/{id}/debug/close` | 关闭调试会话与预览通道 |

> 建议：若不希望污染 `POST /runs` 主体，也可新增 `POST /api/v1/runs/{id}/debug/start`，但 0.0.6 应保持启动路径尽量简单。

## 4. WebSocket 事件升级清单

### 4.1 普通运行事件保持不变

- `RUN_STARTED`
- `STEP_STARTED`
- `STEP_SUCCEEDED`
- `STEP_FAILED`
- `LOG`
- `RUN_SUCCEEDED`
- `RUN_FAILED`
- `RUN_CANCELED`

### 4.2 调试事件建议新增

- `DEBUG_SESSION_STARTED`
- `DEBUG_FRAME`
- `DEBUG_STATUS_CHANGED`
- `DEBUG_SESSION_CLOSED`
- `DEBUG_ERROR`

### 4.3 调试帧事件结构

```json
{
  "type": "DEBUG_FRAME",
  "payload": {
    "runId": "run-1",
    "contextId": "ctx-1",
    "pageAlias": "tab1",
    "mimeType": "image/jpeg",
    "frameBase64": "...",
    "width": 1280,
    "height": 720,
    "ts": "2026-03-28T10:00:00.000Z"
  }
}
```

### 4.4 调试状态事件结构

```json
{
  "type": "DEBUG_STATUS_CHANGED",
  "payload": {
    "runId": "run-1",
    "status": "STREAMING",
    "pageAlias": "tab1",
    "contextId": "ctx-1",
    "message": "preview frame streaming"
  }
}
```

## 5. 数据字段约定

- `debug.enabled: boolean`：是否以调试模式启动。
- `debug.openVisibleBrowser?: boolean`：是否允许启动可见浏览器。
- `debug.openDevtools?: boolean`：是否请求打开 DevTools。
- `debug.previewFps?: number`：预览帧率建议值。
- `debug.previewQuality?: number`：预览压缩质量建议值。

## 6. 错误码建议

| 错误码 | HTTP | 语义描述 | 场景 |
|---|---:|---|---|
| `TT-0400-301` | 400 | 调试参数非法 | `previewFps`、`previewQuality` 超限 |
| `TT-0400-302` | 400 | 调试会话不存在 | run 未启动或无调试态时调用调试接口 |
| `TT-0500-301` | 500 | 预览帧生成失败 | screenshot/frame 编码异常 |
| `TT-0500-302` | 500 | 宿主机浏览器打开失败 | 本地环境不支持可见浏览器或 DevTools |

## 7. 联调检查点与验收口径

1. 调试模式启动后可收到 `DEBUG_SESSION_STARTED`。
2. 调试模式运行中可连续收到 `DEBUG_FRAME`。
3. `pageAlias` 与 `contextId` 在多标签页和多上下文下同步正确。
4. 关闭调试后收到 `DEBUG_SESSION_CLOSED`，且不再推送帧。
5. 普通运行模式不推送任何调试帧。

总结：0.0.6 API 实施的重点是让“调试能力新增而不破坏旧运行链路”，先把调试通道与预览帧协议打稳，再进入界面与黑盒联调。