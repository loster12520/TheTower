# TheTower - 基于 Playwright 的浏览器 RPA 画布工作流系统

> 导语：本文档为 AI 编程助手提供项目背景、架构概览、技术选型与开发规范，便于快速理解与协作开发。

## 1. 项目概述

**TheTower** 是一个低代码/可视化的浏览器 RPA（机器人流程自动化）系统，毕业设计项目。用户通过拖拽节点、连线并配置参数在画布上编排工作流；系统将画布定义转换为可执行步骤序列，由后端通过 Playwright 驱动浏览器执行，并实时回传执行状态到前端。

### 1.1 核心目标
- **可视化流程编排**：基于 ReactFlow 实现拖拽式工作流设计
- **流程执行引擎**：利用 Playwright 完成浏览器自动化操作
- **状态监控**：执行进度、当前节点、日志/错误实时回传

### 1.2 版本状态
- 当前版本：`0.0.1`（MVP 阶段）
- 项目阶段：规划与设计阶段，核心代码尚未实现
- 开源协议：MIT License
- 仓库地址：https://github.com/loster12520/TheTower.git

---

## 2. 技术栈

### 2.1 前端
| 技术 | 用途 | 版本建议 |
|------|------|----------|
| **React** | UI 框架 | v18+ |
| **Umi** | 前端框架 | v4 |
| **ReactFlow** | 可视化画布（节点/边模型、拖拽、连线） | 最新稳定版 |
| **Ant Design** | 组件库（表单、抽屉、消息提示等） | v5 |
| **TypeScript** | 类型系统 | 严格模式 |

### 2.2 后端
| 技术 | 用途 | 说明 |
|------|------|------|
| **Kotlin** | 编程语言 | JVM 平台 |
| **Ktor** | Web 框架 | 轻量级异步框架 |
| **Playwright** | 浏览器自动化 | Java bindings |
| **Kotlin Coroutines** | 并发模型 | 每个 Run 独立协程 + 取消控制 |

### 2.3 通信协议
- **REST API**：标准 HTTP/JSON 数据交互
- **WebSocket**：执行状态实时推送（`/ws/v1/runs/{runId}`）

### 2.4 数据存储
- **MVP 阶段**：内存存储（便于快速跑通）
- **演进方向**：SQLite（本地部署）或 PostgreSQL（云部署）

---

## 3. 系统架构

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

### 3.1 关键设计原则
1. **画布定义与执行定义解耦**：前端保存图（Graph），后端执行"编译后步骤"（Steps/IR）
2. **强类型节点模型**：每种节点有固定的 `type` 与 `config` schema
3. **可观测性优先**：每个节点开始/结束/失败必须产生事件

---

## 4. 项目结构

```
TheTower/
├── .github/
│   └── skills/
│       └── lignting-document/      # 文档编写规范技能
├── plan/
│   └── 0.0.1/                      # 0.0.1 版本规划
│       ├── api.md                  # API 架构表（前后端交互协议）
│       └── requirements.md         # 详细需求文档
├── .git/                           # Git 版本控制
├── LICENSE                         # MIT 许可证
├── README.md                       # 项目主文档（中文）
├── 众资料.md                        # 毕业设计相关材料（开题报告等）
└── AGENTS.md                       # 本文件
```

### 4.1 规划文档说明
- **`plan/0.0.1/requirements.md`**：产品需求文档，定义功能范围、页面交互、验收标准
- **`plan/0.0.1/api.md`**：API 设计文档，定义数据模型、REST 接口、WebSocket 事件

---

## 5. 核心数据模型

### 5.1 模板 (WorkflowTemplate)
```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "schemaVersion": "0.0.1",
  "steps": [],           // 主流程步骤（有序数组）
  "otherStep": {         // 零散节点与连线（不参与执行）
    "nodes": [],
    "edges": []
  },
  "createdAt": "string",
  "updatedAt": "string",
  "stats": { "stepCount": 0 },
  "lastRun": { "runId": "string", "status": "...", "finishedAt": "..." } | null
}
```

### 5.2 运行 (Run)
```json
{
  "id": "string",
  "templateId": "string",
  "status": "PENDING | RUNNING | SUCCEEDED | FAILED | CANCELED",
  "currentStepId": "string | null",
  "startedAt": "string | null",
  "finishedAt": "string | null",
  "error": { "code": "string", "message": "string" } | null
}
```

### 5.3 节点类型（0.0.1 MVP）
| 类型 | 配置参数 | 说明 |
|------|----------|------|
| `openUrl` | `url: string` | 打开网页 |
| `click` | `selector: string` | 点击元素 |
| `type` | `selector: string`, `text: string` | 输入文本 |
| `waitFor` | `selector?: string` 或 `waitMs?: number` | 等待元素或时间 |
| `extract` | `selector: string`, `as: string`, `mode: "text" \| "attribute"`, `attributeName?: string` | 提取数据 |

---

## 6. API 规范

### 6.1 基础约定
- **Base URL REST**：`/api/v1`
- **Base URL WebSocket**：`/ws/v1`
- **Content-Type**：`application/json; charset=utf-8`
- **时间格式**：ISO 8601 UTC（例：`2026-01-22T09:12:34.123Z`）

### 6.2 响应包装格式
```json
{
  "requestId": "string",
  "data": {},
  "error": null
}
```

### 6.3 核心接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/templates` | 获取模板列表 |
| POST | `/api/v1/templates` | 创建模板 |
| GET | `/api/v1/templates/{id}` | 获取模板详情 |
| PATCH | `/api/v1/templates/{id}` | 更新模板元信息 |
| PUT | `/api/v1/templates/{id}` | 保存模板步骤 |
| DELETE | `/api/v1/templates/{id}` | 删除模板 |
| POST | `/api/v1/runs` | 发起运行 |
| POST | `/api/v1/runs/{id}/cancel` | 取消运行 |
| POST | `/api/v1/runs/{id}/restart` | 重启运行 |
| GET | `/api/v1/runs/{id}` | 查询运行状态 |
| GET | `/api/v1/runs` | 运行列表 |
| WS | `/ws/v1/runs/{runId}` | 运行事件流 |

### 6.4 WebSocket 事件类型
- `RUN_STARTED` - 运行开始
- `STEP_STARTED` - 步骤开始
- `STEP_SUCCEEDED` - 步骤成功
- `STEP_FAILED` - 步骤失败
- `LOG` - 日志消息
- `RUN_SUCCEEDED` - 运行成功
- `RUN_FAILED` - 运行失败
- `RUN_CANCELED` - 运行取消

---

## 7. 开发规范

### 7.1 代码组织建议
```
frontend/                  # 前端项目（待创建）
├── src/
│   ├── components/        # 通用组件
│   ├── pages/             # 页面组件
│   ├── models/            # 数据模型
│   ├── services/          # API 服务
│   └── utils/             # 工具函数
└── package.json

backend/                   # 后端项目（待创建）
├── src/
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   ├── models/            # 数据模型
│   ├── executor/          # Playwright 执行器
│   └── utils/             # 工具函数
└── build.gradle.kts
```

### 7.2 文档编写规范
项目遵循 `.github/skills/lignting-document/skills/base-documents.md` 定义的规范：
- **简洁**：以最少文字讲清楚核心信息
- **强调**：每段约 200 字，强调首句或尾句关键词
- **举例**：示例必须使用引用或代码块包裹
- **导语与总结**：每篇文档必须有导语（目的）与总结（回顾）
- **文本规范**：能用单行代码就用单行代码，有对比时优先使用表格

---

## 8. 测试策略

### 8.1 验收标准（0.0.1）
- 能创建模板并在列表中看到
- 能在编辑页完成：放置 3-5 个节点、连线、配置、保存
- 能点击运行并让浏览器执行至少一个可复现流程（如打开 example.com 并提取标题）
- 前端能看到节点级执行状态（开始/成功/失败）与错误提示

### 8.2 技术指标
- **前端画布性能**：支持至少 50 个节点流畅拖拽与渲染，响应时间 ≤ 200ms
- **后端执行稳定性**：支持 Chrome、Firefox、Edge 三款浏览器自动化，单流程执行成功率 ≥ 95%，支持并发执行至少 3 个流程

---

## 9. 版本规划

### 9.1 0.0.1 MVP（当前）
- 线性流程执行（单入口单出口）
- 基础节点类型（openUrl、click、type、waitFor、extract）
- 模板 CRUD 与导入/导出
- 运行监控（最小可用）
- 单机/单用户，无登录

### 9.2 后续版本（规划）
- 控制流节点（if 条件、loop 循环）
- 用户体系与多租户
- 定时调度
- 数据持久化（数据库）
- 运行历史与详情页

---

## 10. 参考资源

### 10.1 核心技术文档
- React Flow: https://reactflow.dev/learn
- Playwright: https://playwright.dev/docs/intro
- Ktor: https://ktor.io/docs/welcome.html
- Umi: https://umijs.org/docs/tutorials/getting-started

### 10.2 项目文档索引
| 文件 | 内容 |
|------|------|
| `README.md` | 项目概述与技术栈 |
| `plan/0.0.1/requirements.md` | 产品需求与页面功能 |
| `plan/0.0.1/api.md` | API 设计与数据模型 |
| `众资料.md` | 毕业设计开题报告与任务书 |
| `.github/skills/lignting-document/skills/base-documents.md` | 文档编写规范 |

---

总结：TheTower 是一个基于 ReactFlow + Playwright + Kotlin/Ktor 的低代码浏览器 RPA 系统，目前处于 0.0.1 规划阶段，核心代码待实现。开发时应遵循已有 API 规范与文档编写规范，优先实现线性流程编排与执行的 MVP 闭环。
