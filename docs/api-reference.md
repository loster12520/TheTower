# TheTower API 文档（0.1.0）

导语：本文档汇总 TheTower 0.1.0 当前稳定可用的 REST 与 WebSocket 协议，供前后端联调与测试使用。

## 1. 基础约定

- REST Base URL：`/api/v1`
- 运行 WebSocket：`/ws/v1/runs/{runId}`
- 协作 WebSocket：`/ws/v1/templates/{templateId}/collaboration`
- 鉴权请求头：`Authorization: Bearer <token>`
- 工作空间请求头：`X-Workspace-Id: <workspaceId>`
- 响应包装：

```json
{
  "requestId": "string",
  "data": {},
  "error": null
}
```

### 1.1 鉴权与多工作空间说明

- 未开启鉴权时，可不带 `Authorization`。
- 开启鉴权后，涉及模板访问控制、协作、用户信息的接口需要携带 `Authorization`。
- `X-Workspace-Id` 用于在多工作空间场景下明确上下文，建议在所有鉴权请求中一并传递。

## 2. 模板接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/templates` | 模板列表，支持 `includeLastRun`、`keyword`、`groupName`、`tag` |
| POST | `/templates` | 创建模板 |
| GET | `/templates/{id}` | 模板详情 |
| PATCH | `/templates/{id}` | 更新模板元信息 |
| PUT | `/templates/{id}` | 保存模板步骤 |
| DELETE | `/templates/{id}` | 删除模板 |
| POST | `/templates/{id}/clone` | 克隆模板 |
| POST | `/templates/batch-delete` | 批量删除模板 |

### 2.1 查询参数与请求体

`GET /templates` 查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `includeLastRun` | boolean | `true` | 是否返回模板最近一次运行摘要 |
| `keyword` | string | - | 按模板名称关键字过滤 |
| `groupName` | string | - | 按分组名称过滤 |
| `tag` | string | - | 按标签过滤 |

`POST /templates` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 模板名称 |
| `description` | string | 否 | 模板描述 |
| `groupName` | string | 否 | 模板分组 |
| `tags` | string[] | 否 | 模板标签列表 |
| `schemaVersion` | string | 是 | 模板 schema 版本 |
| `steps` | array | 否 | 主流程步骤 |
| `otherStep` | object | 否 | 画布零散节点与边 |

`PATCH /templates/{id}` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 否 | 更新模板名称 |
| `description` | string | 否 | 更新模板描述 |
| `groupName` | string | 否 | 更新分组 |
| `tags` | string[] | 否 | 更新标签列表 |

`PUT /templates/{id}` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schemaVersion` | string | 是 | 模板 schema 版本 |
| `steps` | array | 是 | 主流程步骤 |
| `otherStep` | object | 是 | 画布零散节点与边 |

`POST /templates/{id}/clone` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 否 | 克隆后的模板名称，未传则自动生成 |

`POST /templates/batch-delete` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `ids` | string[] | 是 | 待删除模板 ID 列表 |

## 3. 运行与调试接口

### 3.1 运行

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/runs` | 启动运行，支持 `launchOptions` 与 `debug` |
| GET | `/runs` | 运行列表，支持筛选参数 |
| GET | `/runs/{id}` | 运行详情 |
| POST | `/runs/{id}/cancel` | 取消运行 |
| POST | `/runs/{id}/restart` | 重启运行 |
| DELETE | `/runs/{id}` | 删除运行 |

`GET /runs` 查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `templateId` | string | - | 按模板过滤 |
| `status` | enum | - | 运行状态：`PENDING` `RUNNING` `SUCCEEDED` `FAILED` `CANCELED` |
| `from` | string | - | 起始时间（ISO 8601） |
| `to` | string | - | 结束时间（ISO 8601） |
| `limit` | int | - | 分页大小 |
| `offset` | int | - | 分页偏移 |

`POST /runs` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `templateId` | string | 是 | 运行模板 ID |
| `dryRun` | boolean | 否 | 是否仅做干跑 |
| `debug` | object | 否 | 调试参数 |
| `launchOptions` | object | 否 | 浏览器启动参数 |

`launchOptions` 子字段：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `browser` | string | `chromium` | 浏览器类型 |
| `headless` | boolean | `true` | 是否无头模式 |
| `defaultTimeoutMs` | number | `10000` | 默认步骤超时（毫秒） |

`debug` 子字段：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `false` | 是否启用调试 |
| `openVisibleBrowser` | boolean | `false` | 是否展示调试浏览器 |
| `openDevtools` | boolean | `false` | 是否打开 DevTools |
| `previewFps` | int | `2` | 调试预览帧率 |
| `previewQuality` | int | `60` | 调试预览质量 |
| `pauseOnStart` | boolean | `false` | 启动后是否暂停 |
| `breakpoints` | string[] | `[]` | 断点步骤 ID 列表 |
| `keepBrowserOnFinish` | boolean | `true` | 结束后是否保留浏览器 |

### 3.2 调试

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/runs/{id}/debug/open-browser` | 打开调试浏览器 |
| GET | `/runs/{id}/debug/context` | 获取调试上下文 |
| POST | `/runs/{id}/debug/continue` | 继续执行 |
| POST | `/runs/{id}/debug/step` | 单步执行 |
| POST | `/runs/{id}/debug/close` | 关闭调试会话 |
| POST | `/runs/{id}/debug/remote-control` | 调试预览远程操控 |

`POST /runs/{id}/debug/remote-control` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | 操作类型（如 click、type） |
| `x` | int | 否 | 点击 x 坐标 |
| `y` | int | 否 | 点击 y 坐标 |
| `text` | string | 否 | 输入文本 |
| `clearBeforeType` | boolean | 否 | 输入前是否清空 |

## 4. 模板市场接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/market/templates` | 市场模板列表，支持 `keyword` |
| POST | `/market/templates/publish` | 发布模板到市场 |
| POST | `/market/templates/{id}/import` | 从市场导入模板 |

## 5. 调度接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/schedules` | 调度列表，支持 `templateId`、`enabled` |
| POST | `/schedules` | 创建调度 |
| PATCH | `/schedules/{id}` | 更新调度 |
| DELETE | `/schedules/{id}` | 删除调度 |

`GET /schedules` 查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `templateId` | string | - | 按模板过滤 |
| `enabled` | boolean | - | 按启停状态过滤 |

`POST /schedules` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `templateId` | string | 是 | 模板 ID |
| `triggerType` | enum | 是 | 触发类型：`ONE_TIME` `INTERVAL` |
| `delaySeconds` | int | 否 | 一次性任务延迟秒数 |
| `intervalSeconds` | int | 否 | 周期任务间隔秒数 |
| `enabled` | boolean | 否 | 是否启用 |

`PATCH /schedules/{id}` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `triggerType` | enum | 否 | 触发类型 |
| `delaySeconds` | int | 否 | 一次性任务延迟秒数 |
| `intervalSeconds` | int | 否 | 周期任务间隔秒数 |
| `enabled` | boolean | 否 | 是否启用 |

## 6. 认证与工作空间接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 登录 |
| POST | `/auth/logout` | 登出 |
| GET | `/me` | 当前用户信息 |
| GET | `/workspaces` | 当前用户工作空间列表 |

`POST /auth/login` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `email` | string | 是 | 登录邮箱 |
| `password` | string | 是 | 登录密码 |
| `workspaceId` | string | 否 | 期望进入的工作空间 ID |

## 7. 协作接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/templates/{id}/collaboration` | 模板协作信息 |
| POST | `/templates/{id}/collaboration/share` | 分享模板给协作者 |
| GET | `/templates/{id}/collaboration/presence` | 在线成员快照 |
| POST | `/templates/{id}/collaboration/presence/heartbeat` | presence 心跳 |
| DELETE | `/templates/{id}/collaboration/presence` | 离开协作会话 |

`POST /templates/{id}/collaboration/share` 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `email` | string | 是 | 被分享协作者邮箱 |
| `permission` | enum | 否 | 权限：`OWNER` `EDITOR` `VIEWER`，默认 `VIEWER` |

## 8. WebSocket 事件

### 8.1 运行事件

- `RUN_STARTED`
- `STEP_STARTED`
- `STEP_SUCCEEDED`
- `STEP_FAILED`
- `LOG`
- `RUN_SUCCEEDED`
- `RUN_FAILED`
- `RUN_CANCELED`

### 8.2 调试事件

- `DEBUG_SESSION_STARTED`
- `DEBUG_STATUS_CHANGED`
- `DEBUG_BREAKPOINT_HIT`
- `DEBUG_FRAME`
- `DEBUG_CONTEXT_UPDATED`

### 8.3 协作事件

- `COLLABORATION_PRESENCE_CHANGED`
- `COLLABORATION_PATCH_APPLIED`

## 9. 常见错误分类

- 参数错误：`BAD_REQUEST`
- 未认证：`UNAUTHORIZED`
- 无权限：`FORBIDDEN`
- 资源不存在：`NOT_FOUND`
- 资源冲突：`CONFLICT`
- 服务异常：`INTERNAL_ERROR`

## 10. 联调建议

1. 优先使用统一响应包装解析 `data/error`。
2. 前端需同时管理 token 与工作空间头，避免跨空间误读数据。
3. 协作场景建议同时订阅协作 WS 并保留轮询兜底。

总结：0.1.0 的 API 已覆盖模板、运行、调试、市场、调度、认证和协作主线，可直接支撑当前版本联调与回归。
