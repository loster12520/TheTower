# 0.1.0 API 实施文档（体验增强 + 高级调试 + 平台化协议扩展）

导语：本文档用于冻结 0.1.0 的接口、事件与错误码扩展方向，确保体验增强、高级调试、网络监听集成和产品化能力在进入开发前有统一协议基线。

## 1. 目标与边界

- 目标：补齐 0.1.0 新能力需要的 REST、WebSocket、错误码和数据模型定义。
- 目标：避免出现前端入口已上线但后端协议未冻结，或后端接口已实现但文档缺失的情况。
- 目标：为调试状态机、调度任务、权限体系和网络监听能力提供可拆分的协议骨架。
- 边界：本文件只冻结接口方向、关键字段和验收要求，不展开到类级实现细节。

## 2. 协议扩展主线

| 主线 | 0.1.0 协议任务 |
|---|---|
| 模板体验增强 | 搜索、标签/分组、克隆、批量删除、自动保存相关接口补齐 |
| 运行参数增强 | 启动运行与调试运行统一接收浏览器、超时、headless 等参数 |
| 高级调试 | 条件断点、时间旅行、远程操控新增控制接口与事件 |
| 数据与文件节点 | 文件、Excel、剪贴板、焦点元素节点的配置与产物字段定义 |
| 网络监听集成 | 请求监听节点所需配置模型与生命周期约束 |
| 产品化能力 | 调度任务、模板市场、认证授权、协作编辑的最小协议骨架 |

## 3. REST 扩展建议

### 3.1 模板管理

- `GET /api/v1/templates`：增加 `keyword`、`tag`、`groupId`、`page`、`pageSize` 等查询参数。
- `POST /api/v1/templates/{id}/clone`：基于现有模板创建副本。
- `DELETE /api/v1/templates`：支持批量删除，请求体包含 `ids`。
- `POST /api/v1/templates/{id}/tags` 或等价保存入口：写入标签、分组等结构化元数据。
- 自动保存可优先复用 `PUT /api/v1/templates/{id}`，但需要在文档中明确自动保存触发语义。

### 3.2 运行与调试

- `POST /api/v1/runs`：扩展运行参数，至少包含 `browser`、`headless`、`timeoutMs`、`variables`。
- `POST /api/v1/runs/{id}/debug/breakpoints`：创建或更新断点与条件断点。
- `DELETE /api/v1/runs/{id}/debug/breakpoints/{breakpointId}`：删除断点。
- `GET /api/v1/runs/{id}/debug/timeline`：获取时间旅行调试的历史帧摘要。
- `POST /api/v1/runs/{id}/debug/rewind`：切换到指定历史帧或快照。
- `POST /api/v1/runs/{id}/debug/remote-action`：执行点击、输入、滚动等远程操控动作。

### 3.3 调度与平台化

- `GET /api/v1/schedules`、`POST /api/v1/schedules`、`PATCH /api/v1/schedules/{id}`、`DELETE /api/v1/schedules/{id}`。
- `GET /api/v1/market/templates`、`POST /api/v1/market/templates/publish`、`POST /api/v1/market/templates/{id}/import`。
- `POST /api/v1/auth/login`、`POST /api/v1/auth/logout`、`GET /api/v1/me`。
- `GET /api/v1/workspaces` 或租户等价入口，用于隔离模板、运行和协作资源。
- `GET /api/v1/templates/{id}/collaboration`、`POST /api/v1/templates/{id}/collaboration/share`。

## 4. WebSocket 事件扩展建议

### 4.1 调试事件

- `DEBUG_BREAKPOINT_CONDITION_HIT`
- `DEBUG_TIMELINE_SNAPSHOT`
- `DEBUG_TIMELINE_REWOUND`
- `DEBUG_REMOTE_ACTION_APPLIED`
- `DEBUG_REMOTE_ACTION_REJECTED`

### 4.2 调度与协作事件

- `SCHEDULE_TRIGGERED`
- `SCHEDULE_SKIPPED`
- `TEMPLATE_SHARED`
- `COLLABORATION_PRESENCE_CHANGED`
- `COLLABORATION_PATCH_APPLIED`

## 5. 数据模型扩展

### 5.1 模板域

- `TemplateTag`
- `TemplateGroup`
- `TemplateCloneRequest`
- `BatchDeleteTemplatesRequest`
- `TemplateSearchResponse`

### 5.2 运行与调试域

- `RunLaunchOptions`
- `RunVariableInput`
- `DebugBreakpoint`
- `DebugBreakpointCondition`
- `DebugTimelineFrame`
- `DebugRemoteActionRequest`

### 5.3 平台域

- `Schedule`
- `ScheduleTrigger`
- `PublishedTemplate`
- `UserSession`
- `Workspace`
- `TemplateCollaborator`

## 6. 错误码与安全要求

- 所有新增接口必须给出稳定业务码，不直接向前端暴露底层异常细节。
- 调试远程操控必须校验会话状态，非 `PAUSED` 或未授权状态不得执行远程动作。
- 协作与多租户接口必须明确资源隔离失败的错误码。

## 7. 文档交付要求

1. `docs/api-reference.md` 需新增 0.1.0 接口章节，并标注字段、示例和失败场景。
2. `docs/user-guide.md` 需补体验增强、高级调试和协作入口说明。
3. `docs/deployment.md` 需补调度与认证相关部署说明。

## 8. 验收信号

1. 所有 0.1.0 新入口都能在 API 文档中找到对应协议定义。
2. 高级调试三项能力的状态迁移和事件语义可被前端稳定消费。
3. 调度、市场、权限和协作能力至少具备最小可演示协议闭环。

总结：0.1.0 的 API 重点不是把接口数量做大，而是让新增能力都有一致、可测试、可文档化的协议归宿。