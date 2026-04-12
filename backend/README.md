# TheTower Backend

> 导语：本文档用于说明 TheTower 后端的职责、启动方式、配置项与当前实际开放接口，口径对齐 0.0.8 已实现状态。

## 1. 作用范围

后端负责四类核心职责。

- 模板 CRUD 与步骤保存。
- 运行创建、取消、重启、删除与调试控制。
- Playwright 执行器、变量上下文、页面上下文与产物输出。
- WebSocket 事件流与调试事件推送。

## 2. 当前技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Kotlin | 2.2.20 | 后端主语言 |
| Ktor | 2.3.12 | HTTP 与 WebSocket 服务 |
| Playwright Java | 1.49.0 | 浏览器自动化执行 |
| Kotlinx Serialization | 1.6.3 | JSON 序列化 |
| SQLite JDBC | 3.46.1.3 | 本地数据库 |
| Jimmer | `latest.release` | 数据访问层 |
| Logback | 1.5.12 | 日志输出 |

## 3. 快速启动

### 3.1 环境要求

- JDK 17 或更高版本。
- Windows 下优先使用 `gradlew.bat` 或系统 `gradle`。

### 3.2 启动命令

```powershell
cd backend
.\gradlew.bat run
```

如果需要覆盖端口。

```powershell
cd backend
$env:PORT=8082
.\gradlew.bat run
```

> 补充说明：主入口已使用 `EngineMain.main(args)`，因此 `application.conf` 与 `PORT` 环境变量都会生效。

### 3.3 健康检查

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
```

返回示例。

```json
{
  "requestId": "...",
  "data": {
    "status": "ok"
  },
  "error": null
}
```

## 4. 关键配置

当前默认配置来自 `src/main/resources/application.conf`。

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `ktor.deployment.port` | `8080` | 服务监听端口，可被 `PORT` 覆盖 |
| `thetower.persistence.sqlite.path` | `data/thetower.db` | SQLite 数据文件 |
| `thetower.executor.playwright.browser` | `chromium` | 默认浏览器 |
| `thetower.executor.playwright.headless` | `true` | 默认无头模式 |
| `thetower.executor.playwright.defaultTimeoutMs` | `10000` | 默认步骤超时 |

当前也支持通过环境变量覆盖 Playwright 执行器配置。

| 环境变量 | 作用 |
|---|---|
| `THETOWER_BROWSER` | 覆盖浏览器类型，支持 `chromium`、`chrome`、`firefox`、`webkit`、`edge` |
| `THETOWER_HEADLESS` | 覆盖无头模式 |
| `THETOWER_DEFAULT_TIMEOUT_MS` | 覆盖默认步骤超时 |

> 补充说明：`edge` 现在会走 Chromium 引擎并使用 `msedge` channel，不再错误映射到 `webkit`。

## 5. 当前接口

### 5.1 健康检查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/health` | 服务健康检查 |

### 5.2 模板接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/templates` | 获取模板列表，支持 `includeLastRun` |
| POST | `/api/v1/templates` | 创建模板 |
| GET | `/api/v1/templates/{id}` | 获取模板详情 |
| PATCH | `/api/v1/templates/{id}` | 更新模板元信息 |
| PUT | `/api/v1/templates/{id}` | 保存模板步骤 |
| DELETE | `/api/v1/templates/{id}` | 删除模板 |

### 5.3 运行接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/runs` | 启动运行 |
| GET | `/api/v1/runs` | 获取运行列表，支持按模板、状态、时间与分页筛选 |
| GET | `/api/v1/runs/{id}` | 获取运行详情 |
| POST | `/api/v1/runs/{id}/cancel` | 取消运行 |
| POST | `/api/v1/runs/{id}/restart` | 重启运行 |
| DELETE | `/api/v1/runs/{id}` | 删除运行记录 |

### 5.4 调试接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/runs/{id}/debug/open-browser` | 打开调试浏览器 |
| GET | `/api/v1/runs/{id}/debug/context` | 获取调试上下文 |
| POST | `/api/v1/runs/{id}/debug/continue` | 继续执行 |
| POST | `/api/v1/runs/{id}/debug/step` | 单步执行 |
| POST | `/api/v1/runs/{id}/debug/close` | 关闭调试会话 |

### 5.5 WebSocket

| 路径 | 说明 |
|---|---|
| `/ws/v1/runs/{runId}` | 运行事件与调试事件流 |

## 6. 事件类型

当前事件流已覆盖运行态与调试态。

- `RUN_STARTED`
- `STEP_STARTED`
- `STEP_SUCCEEDED`
- `STEP_FAILED`
- `LOG`
- `RUN_SUCCEEDED`
- `RUN_FAILED`
- `RUN_CANCELED`
- `DEBUG_SESSION_STARTED`
- `DEBUG_FRAME`
- `DEBUG_STATUS_CHANGED`
- `DEBUG_BREAKPOINT_HIT`
- `DEBUG_CONTEXT_UPDATED`
- `DEBUG_RESUMED`
- `DEBUG_STEPPED`
- `DEBUG_SESSION_CLOSED`
- `DEBUG_ERROR`

## 7. 构建与测试

### 7.1 常用命令

```powershell
cd backend
.\gradlew.bat test
.\gradlew.bat build
.\gradlew.bat shadowJar
```

如果本机使用系统 Gradle。

```powershell
cd backend
gradle test
gradle buildFatJar
```

### 7.2 已验证基线

- `gradle test` 通过。
- `backend/scripts/api-smoke-test.ps1` 通过。
- `backend/scripts/ws-event-test.ps1` 通过。
- 0.0.8 黑盒脚本已覆盖 `keyboardPress`、`keyboardHotkey`、`textExtract`、`goBack`、`closeOtherPages`、`elementRefVar + elementOrder`。

## 8. 数据与产物目录

- SQLite 数据文件：`backend/data/thetower.db`
- 运行数据与产物：`data/runs/`
- 构建产物：`backend/build/libs/`

总结：当前后端已经不是单一健康检查示例，而是具备模板管理、运行控制、调试控制与 WebSocket 事件流的完整执行服务，后续重点是补专项指标与交付文档。