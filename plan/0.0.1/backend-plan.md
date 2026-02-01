# 0.0.1 后端开发规划文档

导语：本文档为 TheTower 后端开发提供 0.0.1 版本的架构设计与任务拆解，涵盖技术选型、模块划分及详细开发清单，确保后端能够支撑前端画布编排与 Playwright 执行闭环。

---

## 1. 架构设计

### 1.1 技术栈选型

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 语言 | Kotlin | 2.3.0 | 编程语言，JVM 平台 |
| 框架 | Ktor | 2.3+ | Web 服务、路由、WebSocket |
| 序列化 | kotlinx.serialization | - | JSON 序列化/反序列化 |
| 协程 | Kotlin Coroutines | - | 异步处理、运行取消控制 |
| 浏览器自动化 | Playwright | 1.40+ | 浏览器驱动、元素操作、数据提取 |
| 日志 | Kotlin Logging + Logback | - | 结构化日志输出 |
| 构建工具 | Gradle (Kotlin DSL) | 8.0+ | 依赖管理与构建 |
| 测试 | JUnit 5 + MockK | - | 单元测试与 Mock |

### 1.2 目录结构

```
backend/
├── src/
│   ├── main/
│   │   ├── kotlin/
│   │   │   └── com/thetower/
│   │   │       ├── Application.kt          # Ktor 应用入口
│   │   │       ├── config/                 # 配置类
│   │   │       │   └── AppConfig.kt
│   │   │       ├── models/                 # 数据模型
│   │   │       │   ├── Template.kt         # 模板实体
│   │   │       │   ├── Run.kt              # 运行实体
│   │   │       │   ├── Step.kt             # 步骤定义
│   │   │       │   ├── NodeConfig.kt       # 节点配置密封类
│   │   │       │   └── WebSocketEvent.kt   # WebSocket 事件
│   │   │       ├── routes/                 # API 路由
│   │   │       │   ├── TemplateRoutes.kt   # 模板 CRUD
│   │   │       │   ├── RunRoutes.kt        # 运行控制
│   │   │       │   └── WebSocketRoutes.kt  # WebSocket 连接
│   │   │       ├── services/               # 业务逻辑层
│   │   │       │   ├── TemplateService.kt  # 模板管理
│   │   │       │   └── RunService.kt       # 运行生命周期
│   │   │       ├── executor/               # Playwright 执行器
│   │   │       │   ├── PlaywrightExecutor.kt
│   │   │       │   ├── StepExecutor.kt     # 步骤执行抽象
│   │   │       │   └── handlers/           # 各类型节点处理器
│   │   │       │       ├── OpenUrlHandler.kt
│   │   │       │       ├── ClickHandler.kt
│   │   │       │       ├── TypeHandler.kt
│   │   │       │       ├── WaitForHandler.kt
│   │   │       │       └── ExtractHandler.kt
│   │   │       ├── repository/             # 数据存储层（0.0.1 内存实现）
│   │   │       │   ├── TemplateRepository.kt
│   │   │       │   └── RunRepository.kt
│   │   │       └── utils/                  # 工具函数
│   │   │           └── IdGenerator.kt      # UUID 生成
│   │   └── resources/
│   │       ├── application.conf            # Ktor 配置
│   │       └── logback.xml                 # 日志配置
│   └── test/                               # 测试代码
├── build.gradle.kts
├── gradle.properties
└── settings.gradle.kts
```

### 1.3 架构分层说明

**路由层（Routes）**：负责 HTTP 请求解析、参数校验、响应封装。每个路由文件对应一个资源（Template/Run），处理 REST 端点与 WebSocket 升级。

**服务层（Services）**：承载业务逻辑。`TemplateService` 管理模板的 CRUD 与版本；`RunService` 负责运行的启动、取消、状态流转。

**执行器层（Executor）**：封装 Playwright 浏览器操作。`PlaywrightExecutor` 管理浏览器实例与上下文；`StepExecutor` 定义步骤执行接口；各 `Handler` 实现具体节点逻辑。

**存储层（Repository）**：0.0.1 采用内存存储（`ConcurrentHashMap`），后续可无缝替换为数据库实现。

**事件层**：运行过程中通过 `EventBus`（每运行一个 `Channel`）向 WebSocket 连接推送事件。

---

## 2. 开发任务清单

### Phase 1：项目初始化与依赖配置

#### Todo 1.1：初始化 Gradle 项目
- **技术**：Gradle Kotlin DSL
- **思路**：使用 Gradle init 或 IDE 创建 Kotlin/JVM 项目。配置 `build.gradle.kts`，引入 Ktor 核心依赖（`ktor-server-core`、`ktor-server-netty`、`ktor-server-content-negotiation`）、序列化插件（`kotlinx-serialization-json`）、Playwright（`com.microsoft.playwright:playwright`）。配置 Shadow 插件打包可执行 JAR。

#### Todo 1.2：配置 Ktor 应用入口
- **技术**：Ktor Application Engine
- **思路**：创建 `Application.kt`，配置 `embeddedServer(Netty, port = 8080)`。配置内容协商（`ContentNegotiation`）使用 Kotlinx Serialization 自动处理 JSON。配置 CORS 允许前端跨域访问（开发环境 `localhost:8000`）。

#### Todo 1.3：配置日志系统
- **技术**：Logback、Kotlin Logging
- **思路**：在 `resources/logback.xml` 中配置控制台输出格式，包含时间戳、日志级别、logger 名称、消息。定义 `requestId` 的 MDC 透传，确保每条日志都能追溯到请求 ID。

---

### Phase 2：数据模型定义

#### Todo 2.1：定义模板相关模型
- **技术**：Kotlin Data Class、`@Serializable`
- **思路**：在 `models/Template.kt` 中定义：
  - `WorkflowTemplate`：包含 `id`、`name`、`description`、`schemaVersion`、`steps`、`otherStep`、`createdAt`、`updatedAt`、`stats`、`lastRun`
  - `Step`：包含 `id`、`type`、`position`、`data`（`label`、`config`）
  - `OtherStep`：包含 `nodes`（`List<Step>`）和 `edges`（`List<Edge>`）
  - `Edge`：包含 `id`、`source`、`target`
  所有字段使用 `@Serializable` 注解，确保 JSON 序列化/反序列化正确。

#### Todo 2.2：定义节点配置密封类
- **技术**：Kotlin Sealed Class
- **思路**：在 `models/NodeConfig.kt` 中定义密封类 `NodeConfig`，子类包括：
  - `OpenUrlConfig(val url: String)`
  - `ClickConfig(val selector: String)`
  - `TypeConfig(val selector: String, val text: String)`
  - `WaitForConfig(val selector: String?, val waitMs: Int?)`
  - `ExtractConfig(val selector: String, val asVar: String, val mode: String, val attributeName: String?)`
  使用密封类确保类型安全，配合 `when` 表达式处理不同类型。

#### Todo 2.3：定义运行相关模型
- **技术**：Kotlin Data Class、Enum
- **思路**：在 `models/Run.kt` 中定义：
  - `Run`：包含 `id`、`templateId`、`status`（枚举 `RunStatus`：PENDING、RUNNING、SUCCEEDED、FAILED、CANCELED）、`currentStepId`、`startedAt`、`finishedAt`、`error`
  - `RunError`：包含 `code`、`message`
  - `RunStartRequest`、`RunStartResponse`：API 请求/响应体

#### Todo 2.4：定义 WebSocket 事件模型
- **技术**：Kotlin Data Class、密封类
- **思路**：在 `models/WebSocketEvent.kt` 中定义：
  - 密封类 `WebSocketEvent`，包含公共字段 `runId`、`seq`、`ts`、`type`、`payload`
  - 子类：`RunStartedEvent`、`StepStartedEvent`、`StepSucceededEvent`、`StepFailedEvent`、`LogEvent`、`RunSucceededEvent`、`RunFailedEvent`、`RunCanceledEvent`
  每个子类定义特定的 `payload` 结构，如 `StepSucceededEvent` 包含 `outputs: Map<String, String>`。

---

### Phase 3：存储层实现（内存版）

#### Todo 3.1：实现模板仓储
- **技术**：ConcurrentHashMap、Kotlin Coroutines
- **思路**：创建 `TemplateRepository`，内部使用 `ConcurrentHashMap<String, WorkflowTemplate>` 存储。实现接口方法：`findAll()`、`findById(id)`、`save(template)`、`update(id, updater)`、`delete(id)`。方法标记为 `suspend`，为后续切换异步数据库驱动预留接口。

#### Todo 3.2：实现运行仓储
- **技术**：ConcurrentHashMap、原子操作
- **思路**：创建 `RunRepository`，同样使用 `ConcurrentHashMap` 存储 `Run` 实体。实现：`findById(id)`、`save(run)`、`findByTemplateId(templateId)`、`findAll(filter)`（支持按 templateId、status、时间范围过滤）。提供 `updateStatus(id, status, error)` 原子更新方法。

#### Todo 3.3：实现 ID 生成器
- **技术**：Java UUID
- **思路**：编写 `IdGenerator` 对象，提供 `generate()` 方法返回 UUID v4 字符串（`UUID.randomUUID().toString()`）。确保全局唯一性，用于模板 ID、运行 ID、步骤 ID。

---

### Phase 4：模板管理 API

#### Todo 4.1：实现模板列表接口
- **技术**：Ktor Routing、Kotlinx Serialization
- **思路**：在 `TemplateRoutes.kt` 中定义 `GET /api/v1/templates`。调用 `TemplateService.list()` 获取所有模板摘要（不含完整 steps），按 `updatedAt` 倒序排列。返回统一包装结构 `ApiResponse(items = templates)`。

#### Todo 4.2：实现模板创建接口
- **技术**：Ktor Request Validation
- **思路**：定义 `POST /api/v1/templates`，接收 `CreateTemplateRequest`。校验必填字段（`name` 非空、`schemaVersion` 为 "0.0.1"）。生成模板 ID，设置 `createdAt/updatedAt`，存入 Repository。返回 201 状态码与完整模板对象。

#### Todo 4.3：实现模板详情与更新接口
- **技术**：Ktor Routing、异常处理
- **思路**：实现 `GET /api/v1/templates/{id}`，根据 ID 查询，不存在返回 404（`NOT_FOUND`）。实现 `PATCH /api/v1/templates/{id}` 用于更新元信息（name/description）。实现 `PUT /api/v1/templates/{id}` 用于更新 steps，校验 steps 数组非空，更新 `updatedAt`。

#### Todo 4.4：实现模板删除接口
- **技术**：Ktor Routing
- **思路**：定义 `DELETE /api/v1/templates/{id}`，从 Repository 删除记录。返回 `{"deleted": true}`。0.0.1 不处理级联删除（如关联的运行记录），后续版本可补充。

---

### Phase 5：Playwright 执行器

#### Todo 5.1：初始化 Playwright 与浏览器
- **技术**：Playwright Java API
- **思路**：创建 `PlaywrightExecutor` 类，单例管理 `Playwright` 实例。提供 `createBrowserContext()` 方法创建 `BrowserContext`，0.0.1 默认使用 Chromium，支持 headless 模式（可配置）。实现 `close()` 方法优雅关闭资源。

#### Todo 5.2：定义步骤执行接口
- **技术**：Kotlin Interface
- **思路**：定义 `StepHandler` 接口，包含 `suspend fun execute(page: Page, config: NodeConfig, eventChannel: Channel<WebSocketEvent>): StepResult`。`StepResult` 密封类包含 `Success`（携带 outputs）和 `Failure`（携带错误码与消息）。

#### Todo 5.3：实现各类型节点处理器
- **技术**：Playwright Page API、选择器
- **思路**：为每种节点类型实现 Handler：
  - `OpenUrlHandler`：调用 `page.navigate(config.url)`，等待 `load` 事件
  - `ClickHandler`：调用 `page.click(config.selector)`，处理超时与元素不存在错误
  - `TypeHandler`：调用 `page.fill(config.selector, config.text)`
  - `WaitForHandler`：若 `selector` 存在则 `page.waitForSelector`，否则 `delay(waitMs)`
  - `ExtractHandler`：根据 `mode` 调用 `textContent()` 或 `getAttribute()`，结果存入 `outputs` Map

#### Todo 5.4：实现执行上下文管理
- **技术**：Kotlin Coroutines、Channel
- **思路**：创建 `RunContext` 类，每个运行实例对应一个。包含 `BrowserContext`、`Page`、`eventChannel: Channel<WebSocketEvent>`、`variables: MutableMap<String, String>`（存储 extract 结果）。提供 `emitEvent()` 方法向 Channel 发送事件，供 WebSocket 消费。

---

### Phase 6：运行生命周期管理

#### Todo 6.1：实现运行启动逻辑
- **技术**：Kotlin Coroutines、Job
- **思路**：在 `RunService.start(templateId)` 中：创建 `Run` 记录（status=PENDING）；查询模板获取 steps；启动协程 `Job` 执行流程；立即返回 `runId` 与 `wsUrl`。协程内部依次执行：更新 status=RUNNING，遍历 steps 执行每个 handler，捕获异常转换为 `RunFailedEvent`。

#### Todo 6.2：实现步骤级事件发射
- **技术**：Kotlin Channel、sequence 计数
- **思路**：执行每个步骤前，通过 `eventChannel` 发送 `StepStartedEvent`（seq 自增）。步骤成功发送 `StepSucceededEvent`（携带 outputs）；失败发送 `StepFailedEvent`（携带错误信息）；同时发送 `LogEvent` 记录执行日志。WebSocket 路由从 Channel 读取事件并推送给客户端。

#### Todo 6.3：实现运行取消机制
- **技术**：Kotlin Job、CancellationException
- **思路**：维护 `runningJobs: Map<String, Job>` 记录正在运行的协程。`RunService.cancel(runId)` 查找对应 Job，调用 `job.cancel()` 触发取消。执行器内部定期检查 `isActive`，在合适时机抛出 `CancellationException`，捕获后发送 `RunCanceledEvent` 并更新状态。

#### Todo 6.4：实现运行重启与删除
- **技术**：Service 层封装
- **思路**：`restart(runId)` 实现为：查询原运行记录获取 `templateId`，调用 `start(templateId)` 创建新运行。`delete(runId)` 从 Repository 移除记录，若运行中先调用 `cancel`。

#### Todo 6.5：实现运行列表与详情查询
- **技术**：Repository 查询、过滤
- **思路**：`GET /api/v1/runs` 支持 Query 参数：`templateId`、`status`、时间范围、分页（limit/offset）。`GET /api/v1/runs/{id}` 返回单个运行详情，包含当前状态与错误信息。

---

### Phase 7：WebSocket 事件流

#### Todo 7.1：实现 WebSocket 路由
- **技术**：Ktor WebSocket、路径参数
- **思路**：定义 `webSocket("/ws/v1/runs/{runId}")` 路由，从路径提取 `runId`。校验运行是否存在，不存在立即关闭连接（返回 1008 关闭码）。建立连接后，将该连接的 `send` 函数注册到 `RunContext` 的事件监听器列表。

#### Todo 7.2：实现事件推送与背压处理
- **技术**：Kotlin Channel、Flow
- **思路**：每个 `RunContext` 持有 `BroadcastChannel<WebSocketEvent>` 或共享 Flow。WebSocket 连接启动时，订阅该 Flow 并使用 `consumeAsFlow().collect { sendSerialized(it) }` 推送事件。使用 `buffer` 操作符处理背压，避免事件堆积导致内存溢出。

#### Todo 7.3：实现连接生命周期管理
- **技术**：WebSocket 关闭处理
- **思路**：监听 WebSocket `close` 事件，从监听器列表移除当前连接。清理资源但不影响运行继续执行（支持页面刷新后重新连接查看进度）。实现心跳检测，定期发送 `ping` 帧保持连接。

---

### Phase 8：错误处理与边界情况

#### Todo 8.1：实现全局异常处理
- **技术**：Ktor StatusPages 插件
- **思路**：安装 `StatusPages` 插件，捕获路由中的异常。自定义异常类：`NotFoundException`、`BadRequestException`、`ConflictException`。根据异常类型返回对应 HTTP 状态码与统一错误结构 `{"requestId": "...", "data": null, "error": {...}}`。

#### Todo 8.2：实现 Playwright 错误映射
- **技术**：异常转换
- **思路**：捕获 Playwright 的 `TimeoutError`、`ElementNotFoundError` 等异常，转换为业务错误码：`TIMEOUT`（等待超时）、`ELEMENT_NOT_FOUND`（元素不存在）、`NAVIGATION_ERROR`（页面加载失败）。错误信息包含元素选择器便于前端展示。

#### Todo 8.3：实现资源清理机制
- **技术**：try-finally、协程作用域
- **思路**：无论运行成功、失败还是取消，确保在 `finally` 块中关闭 `BrowserContext` 和 `Page`。使用 `SupervisorJob` 防止子协程异常影响其他运行。定期清理已完成运行占用的内存（可选，0.0.1 可暂不实现）。

---

### Phase 9：测试与部署

#### Todo 9.1：编写单元测试
- **技术**：JUnit 5、MockK
- **思路**：为 Service 层编写单元测试，Mock Repository 层。测试场景：模板 CRUD、运行状态流转、取消逻辑。使用 MockK 模拟 Playwright 行为，验证 Handler 调用顺序。

#### Todo 9.2：编写集成测试
- **技术**：Ktor Test、Playwright
- **思路**：使用 `testApplication` 启动测试服务器，调用实际 API。测试完整流程：创建模板 → 启动运行 → 通过 WebSocket 接收事件 → 验证最终状态。使用 Playwright 真实操作本地 HTML 文件验证执行器正确性。

#### Todo 9.3：打包与部署配置
- **技术**：Gradle Shadow、Docker（可选）
- **思路**：配置 Shadow 插件打包包含所有依赖的可执行 fat JAR（`thetower-0.0.1-all.jar`）。编写启动脚本 `java -jar thetower-0.0.1-all.jar`，默认监听 8080 端口。可选：提供 Dockerfile 便于容器化部署。

---

## 3. 核心流程时序图

```
前端                    后端                    Playwright
 |                       |                          |
 |-- POST /runs -------->|                          |
 |                       |-- 创建 Run 记录           |
 |<-- {runId, wsUrl} ----|                          |
 |                       |                          |
 |-- WS /ws/v1/runs/{id} |                          |
 |<-- RUN_STARTED -------|                          |
 |                       |-- 启动协程 -------------->|
 |                       |-- launch browser          |
 |<-- STEP_STARTED ------|                          |
 |                       |-- page.navigate() ------->|
 |<-- STEP_SUCCEEDED ----|                          |
 |                       |-- page.click() --------->|
 |<-- STEP_STARTED ------|                          |
 |                       |-- ...                    |
 |<-- RUN_SUCCEEDED -----|                          |
 |                       |-- close browser          |
```

---

## 4. 开发优先级与里程碑

| 阶段 | 任务范围 | 目标 |
|------|----------|------|
| Week 1 | Phase 1-3 | 项目结构搭建，模型定义完成，内存仓储可用 |
| Week 2 | Phase 4-5 | 模板 API 完整，Playwright 执行器能运行单节点 |
| Week 3 | Phase 6-7 | 运行生命周期完整，WebSocket 实时推送可用 |
| Week 4 | Phase 8-9 | 错误处理完善，测试覆盖核心流程，可演示 |

---

总结：本规划以 Ktor + Playwright 为核心，采用分层架构确保关注点分离。执行器层通过 Handler 模式支持节点类型扩展，存储层预留异步接口便于后续持久化。开发重点在于协程生命周期管理与 WebSocket 事件推送的稳定性，确保 0.0.1 达成"编排-执行-监控"的最小闭环。
