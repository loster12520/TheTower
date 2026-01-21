# 基于 Playwright 的浏览器 RPA 画布工作流系统

> 目标：做一个“低代码/可视化”的浏览器 RPA 系统。用户在画布上拖拽节点、连线并配置参数；系统把画布定义转换为可执行的步骤序列，由后端通过 Playwright 驱动浏览器执行，并把执行状态实时回传到前端。

## 1. 项目范围（MVP）

**必须具备**
- 可视化流程编排：节点拖拽、连线、配置、删除（ReactFlow）
- 工作流保存/导入/导出（JSON）
- 执行引擎：解析流程定义，调用 Playwright 执行
- 状态监控：执行进度、当前节点、日志/错误实时回传

**第一批节点类型（建议）**
- 打开网页 `openUrl`
- 点击 `click`
- 输入 `type`
- 等待元素/等待时间 `waitFor`
- 提取文本/属性 `extract`
- 控制流：条件 `if`、循环 `loop`

> 说明：节点类型可以从“基础操作”先做齐，再逐步扩展（截图、下载、iframe、网络拦截等）。

## 2. 技术栈

### 2.1 前端（Web）
- **框架**：React + Umi（建议 Umi v4）
- **画布**：ReactFlow（节点/边模型、拖拽、连线、视图交互）
- **组件库**：Ant Design（表单、抽屉/侧栏、消息提示、表格等）
- **类型系统**：TypeScript
- **状态管理（建议）**：Umi 内置 model（或 Zustand，二选一，尽量保持简单）
- **数据请求（建议）**：umi-request / axios（任选其一）

### 2.2 后端（Server）
- **语言/框架**：Kotlin + Ktor
- **自动化执行器**：Playwright（Java bindings，可直接用 Kotlin 调用）
- **并发模型**：Kotlin Coroutines（每个 Run 独立协程 + 取消控制）
- **协议**：REST API + WebSocket（用于执行状态实时推送）
- **日志**：Ktor logging + 结构化日志（建议 JSON 格式）

### 2.3 数据存储（建议路线）
- MVP：先用内存存储（便于快速跑通）
- 可演进：SQLite（本地部署友好）或 PostgreSQL（云部署友好）

## 3. 总体架构

```
┌─────────────────────────── Frontend (React + Umi) ───────────────────────────┐
│  ReactFlow Canvas  ──>  Flow JSON (nodes/edges + node configs)               │
│         │                              │                                     │
│         ├── Node Config Panel (Antd)   ├── Import/Export                     │
│         │                              │                                     │
│         └─────────────── REST: /workflows, /runs ────────────────────────────┤
│                                        │                                     │
│                             WebSocket: /ws/runs/{runId} (events)             │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                          Backend (Ktor + Kotlin)                             │
│  API Layer (routes/controllers)                                               │
│        │                                                                      │
│  Workflow Service (validate/compile)                                          │
│        │                                                                      │
│  Run Service (start/stop/status)                                              │
│        │                                                                      │
│  Executor (Playwright)  <── Context (vars, secrets, artifacts, logs)          │
│        │                                                                      │
│  Event Bus (per run)  ──>  WS push (nodeStart/nodeEnd/log/error/progress)     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 关键设计原则
- **画布定义与执行定义解耦**：前端保存的是图（Graph）；后端执行的是“编译后步骤”（Steps/IR）。
- **强类型节点模型**：每种节点都有固定的 `type` 与 `config` schema，便于校验与扩展。
- **可观测性优先**：每个节点开始/结束/失败必须产生事件；日志可追踪。
