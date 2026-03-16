# 基于 Playwright 的浏览器 RPA 画布工作流系统

> 目标：做一个“低代码/可视化”的浏览器 RPA 系统。用户在画布上拖拽节点、连线并配置参数；系统把画布定义转换为可执行的步骤序列，由后端通过 Playwright 驱动浏览器执行，并把执行状态实时回传到前端。

## 1. 当前状态

**当前版本：0.0.4**
- 已完成模板首页、编辑页、运行面板与基础执行闭环。
- 已完成控制流节点 `if / forTimes / while / break` 的前后端支持。
- 已完成 subflow 表达：容器节点缩略预览、THEN/ELSE/BODY 切换编辑、保存与重载恢复。
- 已完成运行态路径观测：后端事件支持 `stepPath / parentStepId / branch`，前端可消费并展示嵌套路径。
- 已完成失败定位闭环：未展开容器可显示失败态，运行面板可一键定位到失败分支和失败节点。

**最新回归结果：2026-03-15**
- 前端常规 Playwright：`17/17` 通过。
- 前端真实后端联调 Playwright：`5/5` 通过。
- 后端：`gradle test`、REST 冒烟、WS 事件脚本、IF `stepPath` 集成脚本通过。

## 2. 当前范围

**已实现能力**
- 可视化流程编排：节点拖拽、连线、配置、删除。
- 工作流保存、导入、导出与重载恢复。
- 执行引擎：解析流程定义，调用 Playwright 执行。
- 状态监控：执行进度、当前节点、日志、错误与失败定位。

**当前已实现节点类型**
- 打开网页 `openUrl`
- 点击 `click`
- 输入 `type`
- 等待元素/等待时间 `waitFor`
- 提取文本/属性 `extract`
- 条件分支 `if`
- 次数循环 `forTimes`
- 条件循环 `while`
- 退出循环 `break`

> 说明：后续步骤扩展仍可继续补充，但 0.0.4 已完成控制流与 subflow 的核心闭环。

## 3. 技术栈

### 3.1 前端
- React 18 + Umi 4
- ReactFlow
- Ant Design
- TypeScript
- MobX
- Playwright

### 3.2 后端
- Kotlin + Ktor
- Playwright Java bindings
- Kotlin Coroutines
- REST API + WebSocket
- SQLite + Jimmer

## 4. 总体架构

```
┌─────────────────────────── Frontend (React + Umi) ───────────────────────────┐
│  ReactFlow Canvas  ──>  Flow JSON (nodes/edges + node configs)               │
│         │                              │                                     │
│         ├── Node Config Panel (Antd)   ├── Import/Export                     │
│         │                              │                                     │
│         └─────────────── REST: /templates, /runs ────────────────────────────┤
│                                        │                                     │
│                             WebSocket: /ws/v1/runs/{runId}                   │
└────────────────────────────────────────┼────────────────────────────────────┘
                                                                                 │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                          Backend (Ktor + Kotlin)                             │
│  API Layer -> Template Service / Run Service -> Playwright Executor          │
│                                │                                             │
│                                └── Event Bus -> WS push                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 关键设计原则
- **画布定义与执行定义解耦**：前端保存图结构，后端执行编译后的步骤树。
- **强类型节点模型**：每种节点固定 `type` 与 `config` 结构，便于校验和扩展。
- **可观测性优先**：每个步骤开始、成功、失败都产生事件，嵌套流程补充 `stepPath`。

## 5. 项目结构

```
TheTower/
├── backend/                        # Kotlin + Ktor 后端
├── frontend/                       # React + Umi 前端
├── plan/                           # 版本规划与需求文档
│   ├── 0.0.1/
│   ├── 0.0.2/
│   └── 0.0.4/
├── report/                         # 实现汇总与版本报告
│   ├── implemented-feature-summary.md
│   └── 0.0.4/
├── test/                           # 集成测试脚本
├── README.md
└── AGENTS.md
```

### 5.1 关键文档
- `plan/0.0.4/requirements.md`：0.0.4 需求稿。
- `plan/0.0.4/steps/api.md`：0.0.4 API 与事件结构设计。
- `report/0.0.4/test.md`：0.0.4 测试记录。
- `report/0.0.4/tech.md`：0.0.4 技术实现报告。
- `report/0.0.4/result.md`：0.0.4 版本总结。
- `report/implemented-feature-summary.md`：仓库级已实现功能与统一回归结果。

## 6. 核心数据模型

### 6.1 模板（WorkflowTemplate）
```json
{
    "id": "string",
    "name": "string",
    "description": "string | null",
    "schemaVersion": "0.0.4",
    "steps": [],
    "otherStep": {
        "nodes": [],
        "edges": []
    },
    "createdAt": "string",
    "updatedAt": "string",
    "stats": { "stepCount": 0 },
    "lastRun": null
}
```

### 6.2 运行（Run）
```json
{
    "id": "string",
    "templateId": "string",
    "status": "PENDING | RUNNING | SUCCEEDED | FAILED | CANCELED",
    "currentStepId": "string | null",
    "finishedAt": "string | null",
    "error": { "code": "string", "message": "string" } | null
}
```

### 6.3 节点类型（0.0.4）
| 类型 | 配置参数 | 说明 |
|------|----------|------|
| `openUrl` | `url` | 打开网页 |
| `click` | `selector` | 点击元素 |
| `type` | `selector`, `text` | 输入文本 |
| `waitFor` | `selector?`, `waitMs?` | 等待元素或时间 |
| `extract` | `selector`, `as`, `mode`, `attributeName?` | 提取数据 |
| `if` | `condition`, `then`, `else` | 条件分支 |
| `forTimes` | `times`, `indexVar?`, `body` | 固定次数循环 |
| `while` | `condition`, `maxIterations`, `body` | 条件循环 |
| `break` | 无 | 退出当前循环 |

## 7. API 与事件

- REST Base URL：`/api/v1`
- WebSocket Base URL：`/ws/v1`
- 关键接口：`/templates`、`/runs`、`/runs/{id}`、`/runs/{id}/cancel`
- 关键事件：`RUN_STARTED`、`STEP_STARTED`、`STEP_SUCCEEDED`、`STEP_FAILED`、`LOG`、`RUN_SUCCEEDED`、`RUN_FAILED`、`RUN_CANCELED`

> 说明：0.0.4 事件已补充 `stepPath / parentStepId / branch`，用于嵌套运行高亮与失败节点定位。

## 8. 已验证能力

| 能力 | 状态 |
|------|------|
| 模板 CRUD | 已验证 |
| 画布节点拖拽与保存 | 已验证 |
| 控制流 subflow 编辑 | 已验证 |
| 后端递归执行控制流 | 已验证 |
| 运行路径展示 | 已验证 |
| 失败态聚合展示 | 已验证 |
| 失败节点一键定位 | 已验证 |
| 旧模板 `0.0.1` 兼容 | 已验证 |

总结：当前仓库已不再是纯规划状态，0.0.4 已形成“subflow 可编辑、控制流可执行、失败可定位、旧模板不回归”的可运行闭环。
