# TheTower - 基于 Playwright 的浏览器 RPA 画布工作流系统

> 导语：本文档为 AI 编程助手提供项目背景、架构概览、技术选型与开发规范，便于快速理解与协作开发。

## 1. 项目概述

**TheTower** 是一个低代码/可视化的浏览器 RPA（机器人流程自动化）系统，毕业设计项目。用户通过拖拽节点、连线并配置参数在画布上编排工作流；系统将画布定义转换为可执行步骤序列，由后端通过 Playwright 驱动浏览器执行，并实时回传执行状态到前端。

### 1.1 核心目标
- **可视化流程编排**：基于 ReactFlow 实现拖拽式工作流设计
- **流程执行引擎**：利用 Playwright 完成浏览器自动化操作
- **状态监控**：执行进度、当前节点、日志/错误实时回传

### 1.2 版本状态
- 当前版本：`0.1.0`（首版产品化能力已收口）
- 项目阶段：已完成前后端实现、联调、测试与文档收口
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
- **当前实现**：SQLite（本地持久化）+ 文件存储（运行产物、协作数据等）
- **演进方向**：可按部署目标升级到更强持久化与审计方案

---

## 3. 系统架构

```
┌─────────────────────────── Frontend (React + Umi) ───────────────────────────┐
│  ReactFlow Canvas  ──>  Flow JSON (nodes/edges + node configs)               │
│         │                              │                                     │
│         ├── Node Config Panel (Antd)   ├── Import/Export                     │
│         │                              │                                     │
│         └─────────────── REST: /templates, /runs ────────────────────────────┤
│                                        │                                     │
│                             WebSocket: /ws/v1/runs/{runId} (events)          │
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
├── frontend/                       # React + Umi 前端应用
├── backend/                        # Kotlin + Ktor 后端服务
├── docs/                           # 用户、接口、部署文档
├── plan/                           # 分版本规划与实施文档
├── report/                         # 分版本技术、测试与总结报告
├── test/                           # 分版本测试脚本与说明
├── feedback/                       # 阶段反馈与配图
├── .github/skills/                 # 项目技能与治理规范
├── README.md                       # 项目主文档（中文）
├── 众资料.md                       # 毕业设计相关材料（开题报告等）
└── AGENTS.md                       # 本文件
```

### 4.1 文档目录说明
- **`docs/`**：当前用户手册、API 文档与部署文档
- **`plan/`**：从 `0.0.1` 到 `0.1.0` 的版本规划、需求与实施拆分文档
- **`report/`**：各版本技术实现、测试与总结报告，以及总览能力清单
- **`test/`**：各版本后端脚本、验证说明与配套 README

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

### 5.3 节点类型（当前实现示例）
| 类型 | 配置参数 | 说明 |
|------|----------|------|
| `openUrl` | `url: string` | 打开网页 |
| `click` | `selector: string` | 点击元素 |
| `type` | `selector: string`, `text: string` | 输入文本 |
| `waitFor` | `selector?: string` 或 `waitMs?: number` | 等待元素或时间 |
| `extract` | `selector: string`, `as: string`, `mode: "text" \| "attribute"`, `attributeName?: string` | 提取数据 |
| `saveData` | `fileName: string`, `format: string` | 保存结构化数据 |
| `importExcel` | `filePath: string`, `sheetName?: string` | 导入 Excel 数据 |
| `listenRequestTrigger` | `urlPattern?: string`, `method?: string` | 监听请求触发 |

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

### 7.1 当前代码组织
```
frontend/                  # 前端项目
├── src/
│   ├── components/        # 通用组件
│   ├── pages/             # 页面组件
│   ├── models/            # 数据模型
│   ├── services/          # API 服务
│   └── utils/             # 工具函数
└── package.json

backend/                   # 后端项目
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

### 8.1 当前收口结论（0.1.0）
- 已完成模板管理、编辑、运行、调试、市场、调度、认证与协作首版闭环
- 已完成数据文件节点与网络监听节点接入执行与回归
- 已完成前后端构建、自动化测试、联调验证与交付文档收口

### 8.2 当前验证基线
- **前端画布性能**：已完成 50 节点性能测量与回归资产沉淀
- **后端执行稳定性**：已完成核心链路自动化测试与多浏览器兼容验证

---

## 9. 版本规划

### 9.1 0.1.0（当前）
- 编辑器体验增强：自动保存、搜索、标签/分组、克隆、自动布局、批量删除、运行参数面板
- 高级调试：条件断点、时间旅行、远程操控
- 数据与网络监听：文件、Excel、剪贴板、焦点元素、请求监听
- 产品化能力：模板市场、调度、认证与工作空间、协作编辑

### 9.2 后续版本（规划）
- 协作冲突自动合并与状态机可视化增强
- 更细粒度权限模型与操作授权
- 高级调试更完整的端到端自动化覆盖
- 运维审计与持久化能力增强

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
| `README.md` | 项目总览、启动方式与完整文档导航 |
| `docs/user-guide.md` | 用户使用手册 |
| `docs/api-reference.md` | API 与 WebSocket 协议文档 |
| `docs/deployment.md` | 本地联调与部署说明 |
| `backend/README.md` | 后端模块、接口与配置说明 |
| `plan/0.1.0/plan.md` | 0.1.0 版本目标与范围 |
| `plan/0.1.0/requirements.md` | 0.1.0 需求与验收口径 |
| `report/0.1.0/tech.md` | 0.1.0 技术实现报告 |
| `report/0.1.0/test.md` | 0.1.0 测试报告 |
| `report/0.1.0/result.md` | 0.1.0 版本总结 |
| `report/implemented-feature-summary.md` | 已实现能力总表 |
| `report/unimplemented-features.md` | 后续版本缺口清单 |
| `众资料.md` | 毕业设计开题报告与任务书 |
| `.github/skills/lignting-document/skills/base-documents.md` | 文档编写规范 |

---

总结：TheTower 当前已完成 0.1.0 首版产品化能力收口，AI 助手在协作开发时应优先参考 README、docs、plan/0.1.0 与 report/0.1.0 相关文档，保持实现、测试与交付口径一致。
