# TheTower 0.0.2 技术实现报告（方案稿）

导语：本文档用于定义 TheTower 0.0.2 的技术实现路径，重点覆盖规范化重构、前后端基建升级、错误码与可观测性治理，以及持久化迁移方案。

## 目录
- [1. 版本目标与技术边界](#1-版本目标与技术边界)
- [2. 技术实现总览](#2-技术实现总览)
- [3. 后端实现路径](#3-后端实现路径)
- [4. 前端实现路径](#4-前端实现路径)
- [5. 关键代码设计草案](#5-关键代码设计草案)
- [6. 预期改动文件清单](#6-预期改动文件清单)
- [7. 风险与控制策略](#7-风险与控制策略)
- [8. 阶段交付与完成判定](#8-阶段交付与完成判定)

---

## 1. 版本目标与技术边界

### 1.1 技术目标
1. 落地统一响应结构与全局错误码体系。
2. 完成 routes/services 语义化命名与注释规范升级。
3. 完成前端运行时配置中心、统一请求层、统一 WebSocket 层。
4. 完成前端主题能力与样式抽离（TSX 内联样式迁移至 SCSS）。
5. 完成后端缓存策略（TTL + 主动失效）与日志链路追踪（requestId）。
6. 完成后端 SQLite + Jimmer 持久化与迁移机制。

### 1.2 技术边界
- 不扩展新节点类型（if/loop 等控制流不纳入 0.0.2）。
- 不引入多租户/权限/调度系统。
- 不改变核心 API 资源路径语义（保证前端联调稳定）。

---

## 2. 技术实现总览

### 2.1 分层目标图

```
Frontend (React + Umi)
  ├─ Runtime Config Center
  ├─ Unified HTTP Client
  ├─ Unified WebSocket Client
  ├─ Theme Provider (Light/Dark)
  └─ Domain-based pages/stores/components

Backend (Kotlin + Ktor)
  ├─ Route/Service naming alignment
  ├─ Unified ApiResponse + ErrorCode Center
  ├─ RequestId tracing + leveled logging
  ├─ In-memory cache (TTL + invalidate)
  ├─ Repository abstraction
  ├─ SQLite + Jimmer implementation
  └─ Schema migration mechanism
```

### 2.2 实施顺序
1. 先规范后功能：先统一响应、错误码、命名与注释。
2. 先入口后扩展：先统一请求/WS 入口，再收敛页面调用。
3. 先可用后优化：先保证 SQLite 主链路可用，再优化查询性能。

---

## 3. 后端实现路径

### 3.1 统一响应与错误码中心
- 新增标准响应模型：`requestId + data + error`。
- 提供统一成功/失败封装函数，避免各路由散落 JSON。
- 通过 `StatusPages` 统一异常映射到错误码登记表。

### 3.2 路由与服务命名语义对齐
- 按 API 语义重构方法名：`getTemplates/createTemplate/restartRun`。
- routes 与 services 一一对应，降低联调与追踪成本。

重命名映射（旧名 → 新名）：

| 模块 | 旧名 | 新名 |
|---|---|---|
| `TemplateService` | `list` | `getTemplates` |
| `TemplateService` | `get` | `getTemplateById` |
| `TemplateService` | `create` | `createTemplate` |
| `TemplateService` | `patch` | `updateTemplateMeta` |
| `TemplateService` | `saveSteps` | `updateTemplateSteps` |
| `TemplateService` | `delete` | `deleteTemplate` |
| `RunService` | `start` | `startRun` |
| `RunService` | `restart` | `restartRun` |
| `RunService` | `get` | `getRunById` |
| `RunService` | `list` | `getRuns` |
| `RunService` | `cancel` | `cancelRun` |
| `RunService` | `delete` | `deleteRun` |

### 3.3 requestId 与日志分级
- 中间件读取 `X-Request-Id`，缺失则自动生成。
- requestId 注入日志上下文，响应体同步回传。
- 统一日志级别：`debug/info/warn/error`。

### 3.4 缓存与失效策略
- 为高读接口增加内存缓存与 TTL。
- 写操作触发主动失效，失效动作可日志追踪。
- 缓存策略对外透明，不改变 API 字段语义。

### 3.5 SQLite + Jimmer 持久化迁移
- 保持 repository 接口稳定，新增 Jimmer 实现。
- 核心实体先覆盖 `Template`、`Run`。
- 完成迁移脚本流程，支持空库初始化与版本升级。

---

## 4. 前端实现路径

### 4.1 运行时配置中心
- 构建统一配置读取层：API 地址、WS 地址、鉴权开关、日志级别。
- 业务组件仅通过配置中心访问环境参数，禁止硬编码。

### 4.2 统一请求层
- 封装统一 HTTP Client：请求拦截、响应解析、错误兜底。
- 自动注入 token/header，开发环境输出请求摘要。
- 统一处理后端错误码并映射为用户提示。

### 4.3 统一 WebSocket 层
- 提供按字符串 key 获取单例连接。
- 支持指数退避重连、心跳保活、消息加解密适配层。
- 页面不直接 new WebSocket，统一走工厂。

### 4.4 主题与样式规范化
- 提供明暗双主题切换能力。
- 将 TSX 内联样式迁移到 SCSS，组件保留结构与状态逻辑。
- 统一使用 `@` 别名导入，收敛相对路径噪音。

### 4.5 页面域收敛
- 页面、页面私有组件、页面状态按领域组织。
- 共享能力保留在公共目录，避免跨页面耦合。

---

## 5. 关键代码设计草案

### 5.1 后端统一响应封装（Kotlin）

```kotlin
@kotlinx.serialization.Serializable
data class ApiError(
    val code: String,
    val message: String,
    val details: Map<String, String>? = null
)

@kotlinx.serialization.Serializable
data class ApiResponse<T>(
    val requestId: String,
    val data: T? = null,
    val error: ApiError? = null
)

fun <T> T.success(requestId: String): ApiResponse<T> = ApiResponse(
    requestId = requestId,
    data = this,
    error = null
)

fun ApiError.fail(requestId: String): ApiResponse<Nothing> = ApiResponse(
    requestId = requestId,
    data = null,
    error = this
)
```

### 5.2 前端运行时配置（TypeScript）

```ts
export interface RuntimeConfig {
  apiBaseUrl: string;
  wsBaseUrl: string;
  auth: { enabled: boolean; tokenHeader: string };
  log: { enabled: boolean; level: 'debug' | 'info' | 'warn' | 'error' };
}

export const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: process.env.UMI_APP_API_BASE_URL || '/api/v1',
  wsBaseUrl: process.env.UMI_APP_WS_BASE_URL || '/ws/v1',
  auth: {
    enabled: process.env.UMI_APP_AUTH_ENABLED === 'true',
    tokenHeader: process.env.UMI_APP_AUTH_HEADER || 'Authorization'
  },
  log: {
    enabled: process.env.NODE_ENV === 'development',
    level: (process.env.UMI_APP_LOG_LEVEL as RuntimeConfig['log']['level']) || 'info'
  }
};
```

### 5.3 前端 WebSocket 工厂（TypeScript）

```ts
type SocketKey = string;

class WebSocketManager {
  private readonly socketMap = new Map<SocketKey, WebSocket>();

  getSocket(key: SocketKey, url: string): WebSocket {
    const existing = this.socketMap.get(key);
    if (existing && existing.readyState <= WebSocket.OPEN) {
      return existing;
    }

    const socket = new WebSocket(url);
    this.socketMap.set(key, socket);
    return socket;
  }

  closeSocket(key: SocketKey): void {
    const socket = this.socketMap.get(key);
    if (!socket) return;
    socket.close();
    this.socketMap.delete(key);
  }
}
```

---

## 6. 预期改动文件清单

### 6.1 后端（预估）
- `backend/src/main/kotlin/com/thetower/routes/**`
- `backend/src/main/kotlin/com/thetower/services/**`
- `backend/src/main/kotlin/com/thetower/repository/**`
- `backend/src/main/kotlin/com/thetower/models/**`
- `backend/src/main/kotlin/com/thetower/config/**`
- `backend/src/main/resources/application.conf`
- `backend/src/main/resources/logback.xml`
- `backend/build.gradle.kts`

### 6.2 前端（预估）
- `frontend/src/services/**`
- `frontend/src/hooks/**`
- `frontend/src/stores/**`
- `frontend/src/pages/**`
- `frontend/src/components/**`
- `frontend/src/**/*.scss`
- `frontend/tsconfig.json`
- `frontend/package.json`

---

## 7. 风险与控制策略

| 风险 | 影响 | 控制策略 |
|---|---|---|
| 命名重构范围大 | 调用链断裂 | 分阶段重命名 + 编译门禁 |
| 持久化切换 | 联调中断 | 保留 repository 接口稳定、逐步替换实现 |
| 缓存策略不当 | 脏数据 | TTL + 写后失效 + 日志可追踪 |
| 样式迁移 | 视觉回归 | 页面分批迁移并逐页回归 |

---

## 8. 阶段交付与完成判定

### 8.1 阶段交付物
1. `plan/0.0.2/steps/api.md`
2. `plan/0.0.2/steps/backend-plan.md`
3. `plan/0.0.2/steps/frontend-plan.md`
4. 本文档 `report/0.0.2/tech.md`
5. 测试模板 `report/0.0.2/test.md`

### 8.2 完成判定
- 统一响应、错误码、requestId 透传可运行并可观测。
- 前端配置中心、请求层、WS 层已接入主链路。
- SQLite + Jimmer 完成核心 CRUD，并具备迁移能力。
- 复杂度/长度/注释等门禁可自动化检查。

总结：0.0.2 技术方案以“规范先行、入口统一、存储升级、质量可验”为核心，确保项目从 MVP 走向可持续迭代。
