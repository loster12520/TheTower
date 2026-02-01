# TheTower 0.0.1 技术实现报告

导语：本文档阐述 TheTower 0.0.1 版本的核心技术实现方案，聚焦三大关键领域——前端画布编排、后端 Playwright 执行引擎、以及前后端通过模板 API 的协作机制。通过明确技术选型理由与实现路径，为项目启动前提供技术可行性验证与风险预判。

---

## 1. 架构总览

TheTower 0.0.1 采用前后端分离架构，通过 REST API 与 WebSocket 实现双向通信：

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Umi)                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   画布编排    │───▶│  模板序列化   │───▶│   运行状态监听        │  │
│  │  ReactFlow   │    │ steps/edges  │    │    WebSocket         │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ REST API / WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Backend (Kotlin + Ktor)                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  模板管理层   │───▶│  执行协调器   │───▶│   Playwright 引擎     │  │
│  │  Template    │    │   RunService │    │   浏览器自动化        │  │
│  │ Repository   │    │  Coroutines  │    │   Step Handlers      │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**核心设计原则**：画布定义与执行定义解耦。前端保存图结构（Graph），后端执行线性化的步骤数组（Steps）。

---

## 2. 前端核心技术：画布编排（ReactFlow）

### 2.1 技术选型理由

选择 **ReactFlow**（v12+）作为画布引擎，基于以下关键特性：

| 特性 | 说明 | 本项目应用 |
|------|------|------------|
| 声明式 API | 通过 `nodes`/`edges` 数组驱动渲染 | 与 MobX 状态管理天然契合 |
| 可扩展节点 | 支持自定义节点组件与样式 | 实现 5 种节点类型的差异化展示 |
| 交互完备 | 拖拽、缩放、框选、连线内置支持 | 零成本实现画布基础交互 |
| TypeScript 原生 | 类型定义完整 | 确保前后端数据结构对齐 |

### 2.2 核心实现方式

#### 画布数据流

前端维护两种数据视图：

```typescript
// 视图层：ReactFlow 渲染格式
interface GraphNode {
  id: string;
  type: 'openUrl' | 'click' | 'type' | 'waitFor' | 'extract';
  position: { x: number; y: number };
  data: { label: string; config: NodeConfig };
}

// 传输层：API 序列化格式
interface Step {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; config: NodeConfig };
}
```

**关键转换逻辑**：
- 保存时，前端从起始节点开始沿 `edges` 遍历，生成有序的 `steps` 数组
- 不在主路径上的节点存入 `otherStep.nodes`，供下次编辑恢复
- 0.0.1 限制为线性流程（单入口单出口），遍历遇到分支即报错

#### 状态管理（MobX）

采用 **MobX 6.x** 管理画布状态，利用其细粒度响应式特性：

```typescript
class EditorStore {
  @observable nodes: Node[] = [];
  @observable edges: Edge[] = [];
  @observable selectedNode: Node | null = null;
  @observable isDirty = false;
  
  @action addNode(type: NodeType, position: XYPosition) {
    this.nodes.push(createNode(type, position));
    this.isDirty = true;
  }
  
  @action updateNodeConfig(id: string, config: NodeConfig) {
    const node = this.nodes.find(n => n.id === id);
    if (node) {
      node.data.config = config;
      this.isDirty = true;
    }
  }
}
```

**选择 MobX 而非 Redux/Zustand 的理由**：
- 直接修改状态（无需 immutable 样板代码），适合频繁更新的画布场景
- 自动追踪依赖，组件仅重新渲染真正变化的部分
- 对复杂对象图（节点嵌套配置）的响应式支持更直观

#### 节点配置面板

每种节点类型对应独立的配置表单组件：

```typescript
// 动态组件映射
const configComponents: Record<NodeType, React.FC> = {
  openUrl: OpenUrlConfig,
  click: ClickConfig,
  type: TypeConfig,
  waitFor: WaitForConfig,
  extract: ExtractConfig
};

// 选中节点时动态渲染
const ConfigPanel = observer(({ node }) => {
  const Component = configComponents[node.type];
  return <Component config={node.data.config} onChange={handleChange} />;
});
```

### 2.3 技术难点与应对

| 难点 | 解决方案 |
|------|----------|
| 画布大数据量性能 | ReactFlow 内置视口裁剪（仅渲染可见节点）；节点数 > 100 时启用虚拟化 |
| 连线逻辑限制 | 自定义 `onConnect` 拦截器，检查源节点是否已有出边，确保线性流程 |
| 撤销重做 | MobX 集成 `mobx-undo` 或手动维护操作历史栈（0.0.1 可选） |

---

## 3. 后端核心技术：Playwright 执行引擎

### 3.1 技术选型理由

选择 **Playwright Java** 作为浏览器自动化引擎：

| 特性 | 优势 | 对比 Selenium/Puppeteer |
|------|------|------------------------|
| 多浏览器支持 | Chromium/Firefox/WebKit 统一 API | Selenium 需不同 Driver |
| 自动等待 | 内置智能等待，减少 flaky 测试 | Puppeteer 需手动 waitFor |
| 异步架构 | 与 Kotlin Coroutines 无缝集成 | Selenium 偏同步阻塞 |
| 现代 Web 支持 | 对 Shadow DOM、SPA、Iframe 支持完善 | 社区活跃度更高 |

### 3.2 核心实现方式

#### 执行器架构

采用**策略模式 + 协程**实现步骤执行：

```kotlin
// 密封类定义节点配置
sealed class NodeConfig {
    data class OpenUrl(val url: String) : NodeConfig()
    data class Click(val selector: String) : NodeConfig()
    data class Type(val selector: String, val text: String) : NodeConfig()
    data class WaitFor(val selector: String?, val waitMs: Int?) : NodeConfig()
    data class Extract(
        val selector: String, 
        val asVar: String, 
        val mode: String,
        val attributeName: String?
    ) : NodeConfig()
}

// 处理器接口
interface StepHandler<T : NodeConfig> {
    suspend fun execute(
        page: Page, 
        config: T, 
        context: RunContext
    ): StepResult
}

// 执行结果密封类
sealed class StepResult {
    data class Success(val outputs: Map<String, String> = emptyMap()) : StepResult()
    data class Failure(val code: String, val message: String) : StepResult()
}
```

#### 执行流程时序

```
RunService.start()
    │
    ▼
创建 Run 记录（PENDING）
    │
    ▼
启动协程（SupervisorJob）
    │
    ├──▶ 初始化 Playwright + BrowserContext
    │
    ├──▶ 发送 RUN_STARTED 事件
    │
    ├──▶ 遍历 steps 数组
    │       │
    │       ├──▶ 发送 STEP_STARTED
    │       │
    │       ├──▶ 路由到对应 Handler
    │       │       ├── OpenUrlHandler ──▶ page.navigate()
    │       │       ├── ClickHandler ────▶ page.click()
    │       │       ├── TypeHandler ─────▶ page.fill()
    │       │       ├── WaitForHandler ──▶ page.waitForSelector() / delay()
    │       │       └── ExtractHandler ──▶ textContent() / getAttribute()
    │       │
    │       ├──▶ 成功 ──▶ 发送 STEP_SUCCEEDED（携带 outputs）
    │       │
    │       └──▶ 失败 ──▶ 发送 STEP_FAILED ──▶ 终止流程
    │
    ├──▶ 发送 RUN_SUCCEEDED / RUN_FAILED / RUN_CANCELED
    │
    └──▶ 关闭 BrowserContext（finally 块保证）
```

#### 取消机制

利用 Kotlin Coroutines 的协作式取消：

```kotlin
class RunService {
    private val runningJobs = ConcurrentHashMap<String, Job>()
    
    fun start(templateId: String): Run {
        val run = createRun(templateId)
        val job = scope.launch(SupervisorJob()) {
            try {
                executeRun(run)
            } catch (e: CancellationException) {
                emitEvent(run.id, RunCanceledEvent())
                run.status = CANCELED
            } finally {
                cleanup(run.id)
            }
        }
        runningJobs[run.id] = job
        return run
    }
    
    fun cancel(runId: String) {
        runningJobs[runId]?.cancel()
    }
}
```

**关键设计**：Playwright 操作本身不响应协程取消，因此在 `finally` 块强制关闭浏览器上下文，确保资源释放。

#### 事件推送（WebSocket）

每个运行实例持有 `Channel<WebSocketEvent>`，WebSocket 连接订阅该 Channel：

```kotlin
webSocket("/ws/v1/runs/{runId}") {
    val runId = call.parameters["runId"]!!
    val runContext = runService.getContext(runId)
    
    // 订阅事件流
    runContext.eventChannel.consumeAsFlow()
        .collect { event ->
            sendSerialized(event)
        }
}
```

### 3.3 技术难点与应对

| 难点 | 解决方案 |
|------|----------|
| 浏览器资源占用 | 每个运行独立 `BrowserContext`（轻量级），非独立 Browser；限制并发数（默认 3） |
| 执行超时控制 | 每个步骤设置超时（默认 30s），Playwright 自动抛出 `TimeoutError` |
| 变量传递 | `RunContext` 维护 `MutableMap<String, String>`，`extract` 结果写入，后续步骤可读取 |
| 错误隔离 | 使用 `SupervisorJob`，单运行异常不影响其他运行 |

---

## 4. 前后端交接：模板 API 与数据契约

### 4.1 核心 API 设计

前后端通过**模板资源**作为核心交接点，实现编排与执行的解耦：

| 接口 | 方法 | 职责 | 关键数据结构 |
|------|------|------|-------------|
| `/api/v1/templates` | GET | 获取模板列表（摘要） | `WorkflowTemplate`（无 steps） |
| `/api/v1/templates` | POST | 创建新模板 | `CreateTemplateRequest` |
| `/api/v1/templates/{id}` | GET | 获取模板详情（含 steps） | `WorkflowTemplate`（完整） |
| `/api/v1/templates/{id}` | PUT | 保存画布 steps | `UpdateStepsRequest` |
| `/api/v1/runs` | POST | 发起运行 | `StartRunRequest` → `RunStartResponse`（含 wsUrl） |
| `/ws/v1/runs/{id}` | WS | 实时事件流 | `WebSocketEvent` 序列 |

### 4.2 数据契约详解

#### 模板结构（前后端共享）

```json
{
  "id": "uuid",
  "name": "抓取示例",
  "description": "打开页面并提取标题",
  "schemaVersion": "0.0.1",
  "steps": [
    {
      "id": "step-1",
      "type": "openUrl",
      "position": { "x": 100, "y": 100 },
      "data": {
        "label": "打开网页",
        "config": { "url": "https://example.com" }
      }
    },
    {
      "id": "step-2",
      "type": "extract",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "提取标题",
        "config": {
          "selector": "h1",
          "as": "title",
          "mode": "text",
          "attributeName": null
        }
      }
    }
  ],
  "otherStep": {
    "nodes": [],
    "edges": []
  },
  "createdAt": "2026-01-31T08:00:00Z",
  "updatedAt": "2026-01-31T08:00:00Z",
  "stats": { "stepCount": 2 },
  "lastRun": {
    "runId": "run-uuid",
    "status": "SUCCEEDED",
    "finishedAt": "2026-01-31T08:05:00Z"
  }
}
```

**关键约定**：
- `steps` 数组顺序即执行顺序，前端负责从画布图结构生成线性序列
- `otherStep` 保留不在主路径的节点（如草稿节点），不参与执行
- `schemaVersion` 确保版本兼容性，0.0.1 固定为 `"0.0.1"`

#### WebSocket 事件协议

```json
{
  "runId": "run-uuid",
  "seq": 1,
  "ts": "2026-01-31T08:00:01Z",
  "type": "STEP_SUCCEEDED",
  "payload": {
    "stepId": "step-2",
    "outputs": { "title": "Example Domain" }
  }
}
```

**事件类型枚举**：
- `RUN_STARTED` - 运行开始
- `STEP_STARTED` - 步骤开始
- `STEP_SUCCEEDED` - 步骤成功（携带 outputs）
- `STEP_FAILED` - 步骤失败（携带 error）
- `LOG` - 日志消息
- `RUN_SUCCEEDED` / `RUN_FAILED` / `RUN_CANCELED` - 运行终态

### 4.3 前后端职责边界

| 职责 | 前端 | 后端 |
|------|------|------|
| 画布渲染 | ✅ ReactFlow | ❌ |
| 图结构 → 线性数组 | ✅ canvasConverter | ❌ |
| 参数校验（必填/格式） | ✅ 运行时校验 | ❌ 信任前端输入 |
| 模板存储 | ❌ | ✅ Repository |
| 步骤执行 | ❌ | ✅ Playwright |
| 状态流转 | ❌ | ✅ RunService |
| 实时事件推送 | ❌ | ✅ WebSocket |
| 执行结果展示 | ✅ 日志面板 | ❌ |

### 4.4 时序示例：完整编排-执行-监控流程

```
用户操作            前端                    后端                    浏览器
  │                 │                       │                       │
  │── 拖拽节点 ─────▶│                       │                       │
  │── 连线 ─────────▶│                       │                       │
  │── 配置参数 ─────▶│                       │                       │
  │                 │                       │                       │
  │── 点击保存 ─────▶│                       │                       │
  │                 │── PUT /templates/{id} ─▶│                       │
  │                 │◀── 200 OK ────────────│                       │
  │◀── 保存成功提示 ─│                       │                       │
  │                 │                       │                       │
  │── 点击运行 ─────▶│                       │                       │
  │                 │── POST /runs ─────────▶│                       │
  │                 │◀── {runId, wsUrl} ─────│                       │
  │                 │                       │                       │
  │                 │── WS /ws/v1/runs/{id} ─▶│                       │
  │                 │◀── RUN_STARTED ────────│                       │
  │◀── 运行中状态 ───│                       │                       │
  │                 │                       │── launch browser ────▶│
  │                 │                       │                       │
  │                 │◀── STEP_STARTED ───────│                       │
  │── 高亮节点1 ────▶│                       │                       │
  │                 │                       │── navigate(url) ─────▶│
  │                 │◀── STEP_SUCCEEDED ─────│                       │
  │── 标记成功 ─────▶│                       │                       │
  │                 │                       │                       │
  │                 │◀── STEP_STARTED ───────│                       │
  │── 高亮节点2 ────▶│                       │                       │
  │                 │                       │── extract text ──────▶│
  │                 │◀── STEP_SUCCEEDED ─────│                       │
  │── 显示提取结果 ─▶│                       │                       │
  │                 │                       │                       │
  │                 │◀── RUN_SUCCEEDED ──────│                       │
  │◀── 运行完成提示 ─│                       │── close context ────▶│
```

---

## 5. 关键技术风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| ReactFlow 大画布性能下降 | 用户体验差 | 启用视口裁剪、节点虚拟化、限制 0.0.1 节点数 < 50 |
| Playwright 浏览器实例泄漏 | 内存耗尽 | 严格 finally 块关闭资源、设置 JVM 关闭钩子、监控未关闭实例数 |
| WebSocket 连接中断 | 监控状态丢失 | 支持客户端重连（seq 续传）、后端保持运行状态独立于连接 |
| 前后端类型不一致 | JSON 解析失败 | 使用共享 JSON Schema、Kotlinx Serialization 严格模式、TypeScript 从 JSON 生成类型 |
| 协程取消不及时 | 僵尸进程 | Playwright 操作加超时、强制 context.close()、定期清理孤儿浏览器进程 |

---

## 6. 总结

TheTower 0.0.1 的技术实现围绕三大核心展开：

1. **前端画布**（ReactFlow + MobX）：利用声明式 API 与细粒度响应式，实现低门槛的可视化流程编排。通过图到线性数组的转换，将复杂度留在前端，降低后端执行引擎的设计难度。

2. **后端执行**（Playwright + Kotlin Coroutines）：借助 Playwright 的现代 Web 支持能力与 Coroutines 的异步取消机制，构建稳定可靠的浏览器自动化引擎。策略模式设计的 Handler 体系确保节点类型易于扩展。

3. **前后端契约**（模板 API + WebSocket 事件流）：以模板资源为核心交接点，清晰的职责边界使前后端可独立演进。WebSocket 事件协议实现执行状态的实时透明，满足"可观测性优先"的设计原则。

技术选型在成熟度与开发效率间取得平衡，0.0.1 的核心代码量预估：前端约 4000 行（TypeScript），后端约 3000 行（Kotlin），可在 4 周内完成 MVP 闭环。
