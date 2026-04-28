# TheTower 系统架构图

导语：本文档以 Mermaid 图表呈现 TheTower 系统的整体架构、模块划分、执行链路与数据流，帮助读者快速理解系统结构。

## 目录

- [1. 系统总体架构](#1-系统总体架构)
- [2. 系统功能模块](#2-系统功能模块)
- [3. 执行链路](#3-执行链路)
- [4. 前端架构](#4-前端架构)
- [5. 后端架构](#5-后端架构)
- [6. 通信协议](#6-通信协议)
- [7. 数据模型关系](#7-数据模型关系)

## 1. 系统总体架构

TheTower 采用**前后端分离**架构，前端<u>承担</u>可视化编排与交互，后端<u>负责</u>持久化、执行与事件推送，两者通过 REST 与 WebSocket 双轨协议协同。

```mermaid
graph TB
    subgraph 前端展示层["前端展示层 (React + Umi + ReactFlow)"]
        画布编排["画布编排模块<br/>节点拖拽 · 连线 · 自动布局"]
        配置面板["配置面板模块<br/>节点参数 · 运行参数"]
        运行监控["运行监控模块<br/>状态 · 日志 · 产物"]
        调试工作台["调试工作台模块<br/>断点 · 单步 · 远程操控"]
        协作界面["协作界面模块<br/>在线成员 · 差异采纳"]
    end

    subgraph 通信协议层["通信协议层"]
        REST接口["REST 接口<br/>模板 · 运行 · 调试 · 认证"]
        WS推送["WebSocket 推送<br/>运行事件 · 调试事件 · 协作事件"]
    end

    subgraph 后端服务层["后端服务层 (Ktor + Kotlin)"]
        模板服务["模板服务"]
        运行服务["运行服务"]
        调试服务["调试服务"]
        认证服务["认证服务"]
        调度服务["调度服务"]
        协作服务["协作服务"]
    end

    subgraph 执行引擎层["执行引擎层 (Playwright)"]
        执行器["流程执行器<br/>步骤解析 · 上下文管理"]
        浏览器驱动["浏览器驱动<br/>Chromium · Firefox · WebKit"]
    end

    subgraph 数据存储层["数据存储层"]
        数据库["SQLite 数据库<br/>模板 · 运行 · 用户 · 调度"]
        文件存储["文件存储<br/>运行产物 · 协作数据"]
    end

    画布编排 --> REST接口
    配置面板 --> REST接口
    运行监控 --> WS推送
    调试工作台 --> REST接口
    调试工作台 --> WS推送
    协作界面 --> REST接口
    协作界面 --> WS推送

    REST接口 --> 模板服务
    REST接口 --> 运行服务
    REST接口 --> 调试服务
    REST接口 --> 认证服务
    REST接口 --> 调度服务
    REST接口 --> 协作服务

    WS推送 --> 运行服务

    运行服务 --> 执行器
    调试服务 --> 执行器
    执行器 --> 浏览器驱动

    模板服务 --> 数据库
    运行服务 --> 数据库
    认证服务 --> 数据库
    调度服务 --> 数据库
    协作服务 --> 数据库
    执行器 --> 文件存储
    协作服务 --> 文件存储
```

## 2. 系统功能模块

系统由**六个功能模块**构成，各模块通过统一数据模型与协议<u>协同</u>工作。

```mermaid
graph LR
    subgraph Modules["系统功能模块"]
        M1["模板管理<br/>创建 / 编辑 / 删除 / 克隆<br/>市场发布与导入"]
        M2["流程编排<br/>节点库 / 拖拽 / 连线<br/>参数配置 / 自动布局"]
        M3["运行与调试<br/>普通运行 / 调试运行<br/>断点 / 时间旅行 / 远程操控"]
        M4["数据与集成<br/>文件 / Excel / 剪贴板<br/>焦点元素 / 请求监听"]
        M5["平台能力<br/>调度 / 认证 / 工作空间<br/>协作编辑"]
        M6["协议与存储<br/>REST / WS / SQLite<br/>运行产物 / 协作数据"]
    end

    M1 -->|维护 WorkflowTemplate| M2
    M2 -->|修改 steps / otherStep| M3
    M3 -->|消费模板生成 Run| M4
    M5 -->|工作空间访问边界| M1
    M6 -.->|支撑| M1
    M6 -.->|支撑| M3
    M6 -.->|支撑| M5
```

| 模块 | 核心职责 | 关键产出 |
|------|----------|----------|
| 模板管理 | 模板生命周期管理与市场复用 | `WorkflowTemplate` CRUD |
| 流程编排 | 画布交互与节点配置 | `steps` + `otherStep` 结构 |
| 运行与调试 | 执行控制与问题定位 | `Run` 记录 + 调试事件流 |
| 数据与集成 | 运行期数据输入输出与观测 | 变量空间 + 产物文件 |
| 平台能力 | 多用户隔离与协作 | 工作空间 + 协作会话 |
| 协议与存储 | 通信标准化与数据持久化 | REST/WS 协议 + SQLite |

## 3. 执行链路

执行链路是系统**最核心的数据通路**，从画布编排到浏览器执行再到状态回传，形成<u>闭环</u>。

```mermaid
sequenceDiagram
    participant User as 用户
    participant Canvas as 画布
    participant API as REST API
    participant RunSvc as RunService
    participant Executor as PlaywrightRunExecutor
    participant Session as PlaywrightRunSession
    participant PW as Playwright
    participant WS as WebSocket
    participant Monitor as 运行监控

    User->>Canvas: 拖拽节点、连线、配置参数
    Canvas->>API: PUT /templates/{id} 保存步骤
    API-->>Canvas: 保存成功

    User->>Canvas: 点击运行
    Canvas->>API: POST /runs {templateId, launchOptions, debug}
    API->>RunSvc: 创建 Run 记录

    RunSvc->>Executor: 创建浏览器上下文
    Executor->>PW: 启动浏览器
    PW-->>Executor: 浏览器就绪

    RunSvc->>Session: 开始步骤执行
    RunSvc->>WS: RUN_STARTED

    loop 逐步执行 steps
        Session->>WS: STEP_STARTED
        Session->>PW: 执行浏览器操作
        PW-->>Session: 操作结果
        alt 成功
            Session->>WS: STEP_SUCCEEDED
        else 失败
            Session->>WS: STEP_FAILED
        end
    end

    Session->>WS: RUN_SUCCEEDED / RUN_FAILED
    WS-->>Monitor: 事件推送
    Monitor-->>User: 实时状态展示
```

## 4. 前端架构

前端以**ReactFlow**为核心，围绕三栏布局组织交互，通过 `stepRegistry` 维护节点注册表保证<u>一致性</u>与可扩展性。

```mermaid
graph TB
    subgraph Pages["页面层"]
        HomePage["首页<br/>模板管理 / 搜索 / 标签分组"]
        EditorPage["编辑器<br/>三栏布局"]
        MarketPage["模板市场"]
        SchedulerPage["调度管理"]
    end

    subgraph EditorLayout["编辑器三栏布局"]
        StepLibPanel["步骤库<br/>节点类型列表"]
        CanvasArea["画布区域<br/>ReactFlow"]
        ConfigPanelArea["配置面板<br/>节点参数 / 运行参数"]
    end

    subgraph CoreModules["核心模块"]
        StepRegistry["stepRegistry<br/>节点注册表"]
        AutoSave["自动保存"]
        AutoLayout["自动布局"]
        UndoRedo["撤销重做"]
    end

    subgraph Services["服务层"]
        TemplateAPI["模板 API"]
        RunAPI["运行 API"]
        DebugAPI["调试 API"]
        WSEvent["WS 事件监听"]
    end

    EditorPage --> StepLibPanel
    EditorPage --> CanvasArea
    EditorPage --> ConfigPanelArea

    CanvasArea --> StepRegistry
    CanvasArea --> AutoSave
    CanvasArea --> AutoLayout
    CanvasArea --> UndoRedo

    StepLibPanel --> StepRegistry
    ConfigPanelArea --> StepRegistry

    HomePage --> TemplateAPI
    EditorPage --> TemplateAPI
    EditorPage --> RunAPI
    EditorPage --> DebugAPI
    EditorPage --> WSEvent
```

## 5. 后端架构

后端以**Ktor**为 Web 框架，按路由-服务-执行器三层组织，每个运行独立协程并<u>隔离</u>浏览器上下文。

```mermaid
graph TB
    subgraph Routes["路由层"]
        TemplateRoute["模板路由"]
        RunRoute["运行路由"]
        DebugRoute["调试路由"]
        MarketRoute["市场路由"]
        SchedulerRoute["调度路由"]
        AuthRoute["认证路由"]
        CollabRoute["协作路由"]
    end

    subgraph Services["服务层"]
        TemplateService["TemplateService"]
        RunService["RunService"]
        DebugExecutionGate["DebugExecutionGate"]
        MarketService["TemplateMarketService"]
        SchedulerService["SchedulerService"]
        AuthService["AuthService"]
        CollabService["TemplateCollaborationService"]
        PresenceService["TemplatePresenceService"]
    end

    subgraph Executor["执行层"]
        PlaywrightRunExecutor["PlaywrightRunExecutor<br/>浏览器创建与适配"]
        PlaywrightRunSession["PlaywrightRunSession<br/>步骤执行主循环"]
        RunContext["RunContext<br/>变量 / 产物 / 日志 / 监听器"]
    end

    subgraph EventSystem["事件系统"]
        EventBusSvc["EventBus (per Run)"]
        WSPush["WebSocket 推送"]
    end

    subgraph Persistence["持久化"]
        SQLiteDB["SQLite"]
        FileStorage["文件存储"]
    end

    TemplateRoute --> TemplateService
    RunRoute --> RunService
    DebugRoute --> DebugExecutionGate
    MarketRoute --> MarketService
    SchedulerRoute --> SchedulerService
    AuthRoute --> AuthService
    CollabRoute --> CollabService
    CollabRoute --> PresenceService

    RunService --> PlaywrightRunExecutor
    DebugExecutionGate --> PlaywrightRunExecutor
    PlaywrightRunExecutor --> PlaywrightRunSession
    PlaywrightRunSession --> RunContext

    PlaywrightRunSession --> EventBusSvc
    EventBusSvc --> WSPush

    TemplateService --> SQLiteDB
    RunService --> SQLiteDB
    AuthService --> SQLiteDB
    SchedulerService --> SQLiteDB
    CollabService --> SQLiteDB
    RunContext --> FileStorage
    CollabService --> FileStorage
```

## 6. 通信协议

系统采用**REST 管理 + WebSocket 事件**双轨方案，REST 处理请求响应边界明确的操作，WebSocket <u>推送</u>实时状态变更。

```mermaid
graph LR
    subgraph REST["REST API (/api/v1)"]
        direction TB
        R1["模板接口<br/>GET/POST/PUT/PATCH/DELETE /templates"]
        R2["运行接口<br/>POST /runs, GET /runs/{id}"]
        R3["调试接口<br/>open-browser / continue / step / remote-control"]
        R4["市场接口<br/>发布 / 导入"]
        R5["调度接口<br/>单次 / 周期任务"]
        R6["认证接口<br/>登录 / 登出 / 工作空间"]
        R7["协作接口<br/>分享 / presence"]
    end

    subgraph WebSocket["WebSocket (/ws/v1)"]
        direction TB
        W1["运行事件通道<br/>/runs/{runId}"]
        W2["协作事件通道<br/>/templates/{templateId}/collaboration"]
    end

    subgraph RunEvents["运行事件"]
        E1["RUN_STARTED"]
        E2["STEP_STARTED"]
        E3["STEP_SUCCEEDED"]
        E4["STEP_FAILED"]
        E5["LOG"]
        E6["RUN_SUCCEEDED"]
        E7["RUN_FAILED"]
        E8["RUN_CANCELED"]
    end

    subgraph DebugEvents["调试事件"]
        D1["DEBUG_SESSION_STARTED"]
        D2["DEBUG_FRAME"]
        D3["DEBUG_BREAKPOINT_HIT"]
        D4["DEBUG_CONTEXT_UPDATED"]
        D5["DEBUG_STEPPED"]
    end

    subgraph CollabEvents["协作事件"]
        C1["在线成员变化"]
        C2["补丁应用通知"]
    end

    W1 --> RunEvents
    W1 --> DebugEvents
    W2 --> CollabEvents
```

## 7. 数据模型关系

系统核心数据模型围绕**模板**与**运行**两个实体组织，模板是流程定义的持久化载体，运行是模板执行的实例。

```mermaid
erDiagram
    WorkflowTemplate ||--o{ Run : "触发执行"
    WorkflowTemplate {
        string id PK
        string name
        string description
        string schemaVersion
        array steps
        object otherStep
        string createdAt
        string updatedAt
        object stats
        object lastRun
    }

    Run {
        string id PK
        string templateId FK
        enum status
        string currentStepId
        string startedAt
        string finishedAt
        object error
    }

    Run ||--o{ RunEvent : "产生事件"
    RunEvent {
        string type
        string stepId
        object data
        string timestamp
    }

    Step {
        string type
        object config
    }

    WorkflowTemplate ||--|{ Step : "包含步骤"

    Workspace ||--o{ WorkflowTemplate : "隔离资源"
    Workspace {
        string id PK
        string name
        string ownerId
    }

    User ||--o{ Workspace : "拥有"
    User {
        string id PK
        string username
        string password
    }
```

总结：TheTower 采用前后端分离架构，前端以 ReactFlow 为核心实现可视化编排，后端以 Ktor + Playwright 构建执行引擎，通过 REST + WebSocket 双轨协议实现编排与执行的解耦，六大功能模块围绕模板与运行两个核心实体协同工作。
