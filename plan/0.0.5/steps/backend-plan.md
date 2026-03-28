# 0.0.5 后端实施文档（步骤分发 + 运行基础设施）

导语：本文档用于指导 0.0.5 后端实现，重点解决叶子步骤分发、变量解析、artifacts、下载与浏览器上下文管理。

## 1. 实施目标与边界

- 目标：补齐 0.0.5 第一批高频步骤的后端执行闭环。
- 目标：把变量替换、超时、artifacts、元素选择逻辑做成公共能力。
- 目标：保留 0.0.4 的控制流递归骨架，不重写 `RunService` 主链路。
- 边界：不在本版引入第三方服务接入与 `callWorkflow`。

## 2. 后端改造主线

| 模块 | 当前现状 | 0.0.5 目标 |
|---|---|---|
| `RunService` | 已支持控制流递归 | 保持递归骨架，接入更多容器步骤 |
| `PlaywrightRunExecutor` | 少量叶子步骤集中在单一分支 | 拆成按步骤域分发的 handler |
| `StepTreeSupport` | 已支持条件与循环基础校验 | 扩展新容器与公共解析工具 |
| artifacts | 尚未形成正式能力 | 支持截图与下载产物记录 |
| context/page 管理 | 仅有单页执行语义 | 支持多标签页与浏览器上下文 |

## 3. 模块拆分建议

### 3.1 保持 `RunService` 负责控制流

- `RunService` 继续负责：
  - 步骤树递归执行
  - `stepPath` 维护
  - 控制流日志
  - 循环与 break 语义
- `RunService` 不直接承载叶子步骤细节。

### 3.2 拆分叶子步骤 handler

- `PageStepHandler`
  - `newPage`
  - `closePage`
  - `switchPage`
  - `reloadPage`
  - `scrollPage`
- `ElementStepHandler`
  - `hover`
  - `focus`
  - `selectOption`
  - 既有 `click / type / extract` 的增强逻辑
- `WaitStepHandler`
  - `waitFor` 增强
  - `waitForResponse`
- `DataStepHandler`
  - `getUrl`
  - `importText`
  - `totp`
  - `getCookies`
  - `clearCookies`
  - `executeJs`
- `ArtifactStepHandler`
  - `screenshotPage`
  - `downloadFile`
  - `uploadFiles`
- `ContextStepHandler`
  - `startBrowser`
  - `closeBrowser`

## 4. 公共能力改造

### 4.1 变量与参数解析

- 统一扩展 `resolveTextTemplate`
- 新增统一的：
  - `resolveBooleanConfig`
  - `resolveEnumConfig`
  - `resolveOptionalInt`
  - `resolveOptionalString`
- 字符串类参数统一先做变量替换，再做类型与枚举校验。

### 4.2 超时控制

- 所有可阻塞 handler 从统一配置中读取 `timeoutMs`。
- Playwright 原语调用要么使用页面默认超时，要么为当前操作临时覆写。
- 超时必须转换为统一错误码与运行错误消息。

### 4.3 artifacts 能力

- 定义运行目录约定，例如：`data/runs/{runId}/artifacts/`
- 新增 artifact 记录结构：
  - `artifactId`
  - `name`
  - `kind`
  - `relativePath`
  - `createdAt`
- 最低要求支持 `screenshotPage` 与 `downloadFile`。

### 4.4 页面与上下文管理

- 执行上下文需维护：
  - 当前浏览器上下文
  - 当前页面
  - `pageAlias -> Page` 映射
  - `contextId -> BrowserContext` 映射
- `startBrowser` 创建新上下文；其 `body` 内默认使用该上下文。
- `closeBrowser` 只关闭当前上下文，不越级影响外层上下文。

## 5. 容器步骤实施要求

### 5.1 `forEachElement`

- 先定位元素集合，再按顺序生成循环项。
- 本版循环项至少支持：
  - `text`
  - `attribute`
  - `html`
- 循环时将当前项写入 `itemVar`，位置写入 `indexVar?`。

### 5.2 `forEachData`

- 从运行变量中读取数组或对象。
- 若不是可遍历结构，直接报配置错误。
- 本版先支持数组；对象遍历可按键值对简化为 P1 兼容实现。

### 5.3 `startBrowser` / `closeBrowser`

- 本版允许先使用 Playwright 多上下文语义占位，不强制接入真实外部浏览器环境。
- `onComplete = close` 时，BODY 结束后自动关闭当前上下文。
- `closeBrowser` 若在无上下文场景执行，应返回明确错误而不是静默成功。

## 6. 测试重点

1. handler 级单元测试：参数解析、变量替换、错误码映射。
2. `StepTreeSupport` 测试：
   - `forEachElement` BODY 校验
   - `forEachData` BODY 校验
   - `startBrowser` BODY 校验
3. 集成测试：
   - 多标签页切换
   - 截图 artifact 写入
   - 下载 artifact 写入
   - Cookie 获取/清空
   - `forEachElement` / `forEachData` 执行路径
4. 回归测试：0.0.4 的 `if / forTimes / while / break` 不回归。

## 7. 实施顺序

1. 统一参数解析与超时工具
2. 页面与上下文管理能力
3. artifacts 能力
4. 页面、等待、获取数据 handler
5. 容器步骤 `forEachElement / forEachData / startBrowser / closeBrowser`
6. 单元、集成、WS 回归

总结：0.0.5 后端的重点不是“把步骤全塞进一个执行器”，而是建立可扩的分发结构与运行基础设施，让新增步骤继续可控地扩展。