# TheTower API 文档（0.1.0）

导语：本文档汇总 TheTower 0.1.0 当前稳定可用的 REST 与 WebSocket 协议，供前后端联调与测试使用。

## 1. 基础约定

- REST Base URL：`/api/v1`
- 运行 WebSocket：`/ws/v1/runs/{runId}`
- 协作 WebSocket：`/ws/v1/templates/{templateId}/collaboration`
- 响应包装：

```json
{
  "requestId": "string",
  "data": {},
  "error": null
}
```

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

### 3.2 调试

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/runs/{id}/debug/open-browser` | 打开调试浏览器 |
| GET | `/runs/{id}/debug/context` | 获取调试上下文 |
| POST | `/runs/{id}/debug/continue` | 继续执行 |
| POST | `/runs/{id}/debug/step` | 单步执行 |
| POST | `/runs/{id}/debug/close` | 关闭调试会话 |
| POST | `/runs/{id}/debug/remote-control` | 调试预览远程操控 |

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

## 6. 认证与工作空间接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 登录 |
| POST | `/auth/logout` | 登出 |
| GET | `/me` | 当前用户信息 |
| GET | `/workspaces` | 当前用户工作空间列表 |

## 7. 协作接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/templates/{id}/collaboration` | 模板协作信息 |
| POST | `/templates/{id}/collaboration/share` | 分享模板给协作者 |
| GET | `/templates/{id}/collaboration/presence` | 在线成员快照 |
| POST | `/templates/{id}/collaboration/presence/heartbeat` | presence 心跳 |
| DELETE | `/templates/{id}/collaboration/presence` | 离开协作会话 |

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
