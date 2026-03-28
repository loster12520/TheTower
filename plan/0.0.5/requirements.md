# 0.0.5 需求文档：高频步骤补齐 + 执行基础设施收口

导语：本版本以 0.0.4 的控制流与 subflow 为基线，<u>补齐</u>第一批高频步骤，并同步收口变量、产物、下载、浏览器上下文等**公共基础设施**。

## 目录

- [0.0.5 需求文档：高频步骤补齐 + 执行基础设施收口](#005-需求文档高频步骤补齐--执行基础设施收口)
  - [目录](#目录)
  - [范围与非目标](#范围与非目标)
  - [版本目标](#版本目标)
  - [承接基线（来自 0.0.4）](#承接基线来自-004)
  - [0.0.5 公共基础能力](#005-公共基础能力)
    - [1. 变量模板替换](#1-变量模板替换)
    - [2. 通用超时与阻塞能力](#2-通用超时与阻塞能力)
    - [3. ElementRef 与元素顺序](#3-elementref-与元素顺序)
    - [4. Artifacts 与运行结果](#4-artifacts-与运行结果)
    - [5. 浏览器上下文与页面别名](#5-浏览器上下文与页面别名)
    - [6. 事件与状态回传](#6-事件与状态回传)
  - [0.0.5 步骤清单（第一批）](#005-步骤清单第一批)
    - [页面操作（11）](#页面操作11)
    - [等待操作（2）](#等待操作2)
    - [获取数据（6）](#获取数据6)
    - [流程管理（4）](#流程管理4)
  - [前后端实现约束](#前后端实现约束)
    - [前端约束](#前端约束)
    - [后端约束](#后端约束)
    - [协议约束](#协议约束)
  - [延期项（明确不纳入 0.0.5）](#延期项明确不纳入-005)
  - [验收口径（最小可复现流程）](#验收口径最小可复现流程)

## 范围与非目标

- 范围：在 0.0.4 已完成的 `if / forTimes / while / break + subflow` 基础上，交付第一批高频步骤，并同步落地变量替换、通用超时、artifacts、下载、浏览器上下文等基础能力。
- 范围：本版优先补齐 **页面操作 / 等待操作 / 获取数据 / 流程管理** 四类步骤。
- 范围：本版允许扩展协议、前后端类型与运行事件，但不改变主资源路径与主流程 + subflow 的总体结构。
- 非目标：不在本版一次性补齐 AdsPower 全量缺口。
- 非目标：不做第三方工具步骤，如 Google Sheet、邮件获取、请求监听、第三方打码、OpenAI。
- 非目标：不做高级流程复用，如 `callWorkflow`。
- 非目标：不在本版交付数据处理四件套 `textExtract / convertJson / extractKey / randomGet`。

## 版本目标

| 目标项 | 优先级 | 说明 | 验收信号 |
|---|---:|---|---|
| 高频步骤补齐 | P0 | 交付第一批 23 个高频步骤与增强能力 | 新 stepType 可创建、保存、加载、运行 |
| 执行基础设施收口 | P0 | 补齐变量模板替换、通用超时、artifacts、下载与截图落盘 | 运行事件与结果可返回变量和产物 |
| 浏览器上下文扩展 | P0 | 支持多标签页与容器浏览器上下文 | 页面流与 `startBrowser` 可独立运行 |
| 前端步骤注册化 | P1 | 降低新增步骤时对配置面板与校验器的重复修改 | 新步骤主要通过注册接入 |
| 0.0.4 不回归 | P0 | 既有控制流、subflow 编辑与失败定位保持稳定 | `if / forTimes / while / break` 与作者流回归通过 |

## 承接基线（来自 0.0.4）

- 0.0.4 已完成：`openUrl / click / type / waitFor / extract / if / forTimes / while / break` 的前后端闭环。
- 0.0.4 已完成：容器节点 subflow 编辑、保存重载恢复、`stepPath` 回传、高亮与失败定位。
- 0.0.5 不重做控制流主骨架，而是在此基础上补齐高频叶子步骤与缺失容器步骤。

> 说明：0.0.5 的核心不是“再堆一批节点”，而是先把**公共能力**收口，再让新增步骤可复用、可测试、可继续扩展。

## 0.0.5 公共基础能力

### 1. 变量模板替换

- 所有字符串字段统一支持 `${varName}`。
- 支持字段：URL、选择器、文件名、目录、文本内容、Cookie 名称、JS 注入变量、页面别名。
- 后端统一在执行前解析，不允许每个步骤各自维护一套变量替换逻辑。

### 2. 通用超时与阻塞能力

- 所有可能阻塞的步骤统一支持 `timeoutMs?: number`。
- `waitForResponse`、`downloadFile`、`uploadFiles`、`newPage`、`switchPage`、`reloadPage`、`executeJs` 应支持超时控制。
- 超时失败应返回统一错误码与明确的 `stepPath`。

### 3. ElementRef 与元素顺序

- 延续 0.0.4 约定，元素类步骤统一支持：
  - `selector?: string`
  - `elementRefVar?: string`
  - `elementOrder?: { mode: 'fixed'|'randomRange', index?: number, min?: number, max?: number }`
- 0.0.5 的元素类步骤至少包括：`click`、`type`、`hover`、`focus`、`selectOption`、`extract`、`forEachElement`。

### 4. Artifacts 与运行结果

- 本版必须正式引入 **artifacts** 概念，用于保存截图、下载文件、未来的写文件结果。
- 最低要求：`screenshotPage` 与 `downloadFile` 必须把产物写入运行目录，并在运行结果中可查询。
- WS 事件不要求直接推送二进制内容，但要能返回产物元信息，如 `artifactId`、`name`、`relativePath`、`kind`。

### 5. 浏览器上下文与页面别名

- 本版开始区分 **浏览器上下文** 与 **页面标签页**。
- `newPage`、`closePage`、`switchPage` 在当前上下文内工作。
- `startBrowser` 创建独立浏览器上下文，`closeBrowser` 关闭当前上下文。
- 若 `startBrowser` 未激活真实外部环境集成，本版允许先实现为 Playwright 多上下文语义占位。

### 6. 事件与状态回传

- 所有新增步骤继续复用 0.0.4 的 `stepPath` 机制。
- `STEP_SUCCEEDED` 应允许携带：
  - `outputs`
  - `artifacts`
  - `pageAlias?`
  - `contextId?`
- 前端运行面板至少要能显示当前路径、失败路径、关键 outputs 与产物摘要。

## 0.0.5 步骤清单（第一批）

说明：下表只列出 0.0.5 <u>纳入实现</u>的步骤，不再重复 0.0.4 已闭环但仍需增强的全部细节；凡与 0.0.4 既有步骤重名的，默认视为“增强实现”。

### 页面操作（11）

| TheTower stepType | 优先级 | 参数（0.0.5 交付口径） | 说明 |
|---|---:|---|---|
| `newPage` | P0 | `pageAlias?`、`switchToNew?: boolean`、`timeoutMs?` | 在当前上下文中创建新标签页 |
| `closePage` | P0 | `pageAlias?` | 关闭当前页或指定别名页 |
| `switchPage` | P0 | `matchBy: 'title'|'url'|'alias'`、`matchType: 'equals'|'contains'`、`value`、`timeoutMs?` | 支持按标题、URL、别名切换 |
| `reloadPage` | P0 | `timeoutMs?` | 刷新当前页面 |
| `screenshotPage` | P0 | `name?`、`fullPage?: boolean`、`format: 'png'|'jpeg'`、`quality?` | 生成 artifact |
| `hover` | P0 | `selector?`、`elementRefVar?`、`elementOrder?`、`timeoutMs?` | 鼠标悬停元素 |
| `focus` | P0 | `selector?`、`elementRefVar?`、`elementOrder?`、`timeoutMs?` | 聚焦元素 |
| `selectOption` | P0 | `selector?`、`elementRefVar?`、`elementOrder?`、`value`、`timeoutMs?` | 下拉选择器选值 |
| `scrollPage` | P0 | `scrollMode: 'position'|'pixel'`、`position?: 'top'|'middle'|'bottom'`、`pixels?: number`、`scrollType?: 'smooth'|'instant'` | 支持滚动到位置或按像素滚动 |
| `uploadFiles` | P0 | `selector`、`elementOrder?`、`source: 'localFile'|'url'`、`pathOrUrl`、`timeoutMs?` | 第一版先支持本地文件与 URL 下载后上传 |
| `executeJs` | P1 | `javascript`、`injectVars?: string[]`、`saveAs?: string`、`timeoutMs?` | 执行 JS 并可保存返回值 |

### 等待操作（2）

| TheTower stepType | 优先级 | 参数（0.0.5 交付口径） | 说明 |
|---|---:|---|---|
| `waitFor`（增强） | P0 | `selector?`、`waitMs?`、`minMs?`、`maxMs?`、`visible?: boolean`、`timeoutMs?`、`saveAs?` | 支持固定等待、随机区间等待、等待元素可见 |
| `waitForResponse` | P0 | `responseUrl`、`matchType?: 'equals'|'contains'`、`timeoutMs?`、`saveAs?` | 等待响应命中并可保存是否成功 |

### 获取数据（6）

| TheTower stepType | 优先级 | 参数（0.0.5 交付口径） | 说明 |
|---|---:|---|---|
| `getUrl` | P0 | `extract: 'full'|'origin'|'queryParam'`、`paramName?`、`saveAs` | 从当前页 URL 提取值 |
| `downloadFile` | P0 | `url`、`saveDir?`、`fileName?`、`timeoutMs?`、`saveAs?` | 下载文件并生成 artifact |
| `importText` | P1 | `path`、`saveAs` | 从 txt 文件加载数组数据 |
| `totp` | P1 | `secret`、`saveAs` | 生成身份验证器码 |
| `getCookies` | P0 | `saveAs` | 读取当前上下文 Cookies |
| `clearCookies` | P0 | 无 | 清空当前上下文 Cookies |

### 流程管理（4）

| TheTower stepType | 优先级 | 参数（0.0.5 交付口径） | 说明 |
|---|---:|---|---|
| `forEachElement` | P0 | `selector`、`elementOrder?`、`itemVar`、`indexVar?`、`extractType?: 'text'|'attribute'|'html'`、`attributeName?`、`body: Step[]` | 遍历元素结果并执行子流程 |
| `forEachData` | P0 | `dataVar`、`itemVar`、`indexVar?`、`body: Step[]` | 遍历数组或对象结果并执行子流程 |
| `startBrowser` | P0 | `envSerial?`、`onError?: 'skip'|'abort'`、`onComplete?: 'keep'|'close'`、`body: Step[]` | 创建独立浏览器上下文并执行子流程 |
| `closeBrowser` | P0 | 无 | 关闭当前上下文；在 `startBrowser.body` 内仅关闭该容器上下文 |

## 前后端实现约束

### 前端约束

- 前端必须把步骤定义从“多文件分散硬编码”逐步收口到可注册结构。
- 简单叶子步骤优先复用 schema 驱动表单；以下节点允许保留专用表单：
  - `if`
  - `forTimes`
  - `while`
  - `forEachElement`
  - `forEachData`
  - `startBrowser`
- `break` 仍只允许在循环 BODY 中可见与可添加。
- 运行面板需支持显示产物摘要与关键输出，不要求本版完成完整产物管理页。

### 后端约束

- `RunService` 保持控制流递归主骨架，不直接堆叠所有叶子步骤细节。
- 新增叶子步骤应按步骤域拆分执行 handler，如页面操作、等待、获取数据、浏览器上下文。
- 变量替换、超时解析、artifact 记录、元素选择逻辑必须做成公共能力，不允许每个步骤重复实现。
- 新增步骤失败时必须返回可定位的 `stepPath` 与明确错误消息。

### 协议约束

- 模板结构继续沿用 0.0.4 的 `steps + otherStep + config.then/else/body`。
- 本版允许在运行结果与 WS payload 中新增字段，但不移除既有字段。
- 旧模板必须继续可读；未使用 0.0.5 新步骤的 0.0.4 模板不应因 schema 升级而失效。

## 延期项（明确不纳入 0.0.5）

| 类别 | 延期项 | 延期原因 |
|---|---|---|
| 页面操作 | `closeOtherPages`、`goBack` | 收益较低，可在现有页面流稳定后补齐 |
| 获取数据 | `getClipboardText`、`extractActiveElement`、`saveData`、`saveExcel`、`importExcel` | 需要更多文件与系统集成能力 |
| 第三方能力 | `googleSheet`、`getEmail`、`listenRequestTrigger`、`listenRequestResult`、`stopPageListen` | 外部依赖与验收复杂度高 |
| 数据处理 | `textExtract`、`convertJson`、`extractKey`、`randomGet` | 更适合在变量模型稳定后统一实现 |
| 流程管理 | `callWorkflow` | 涉及模板依赖、入参与出参映射、递归引用保护 |

## 验收口径（最小可复现流程）

1. 页面流闭环
   - `openUrl -> newPage -> switchPage -> reloadPage -> hover -> click -> type -> screenshotPage`
   - 验收点：多标签页切换成功，截图产物可查。

2. 等待与下载闭环
   - `openUrl -> waitFor(selector + visible=true) -> waitForResponse -> getUrl(queryParam) -> downloadFile`
   - 验收点：等待成功、变量提取成功、下载产物可查。

3. Cookie 闭环
   - `openUrl -> getCookies(saveAs=cookies) -> clearCookies -> getCookies(saveAs=afterClear)`
   - 验收点：清理前后结果有差异，变量与事件可见。

4. 子流程遍历闭环
   - `forEachElement` 或 `forEachData` 容器中执行 `click / extract / break` 等子步骤。
   - 验收点：`stepPath` 能定位到 BODY 内部步骤，循环变量可用，`break` 不越级。

5. 浏览器上下文闭环
   - `startBrowser -> body(openUrl -> newPage -> closePage) -> closeBrowser`
   - 验收点：容器上下文独立创建与关闭，不污染主流程默认上下文。

6. 回归闭环
   - 0.0.4 的 `if / forTimes / while / break`、subflow 编辑、失败定位、空白模板作者流必须全部通过回归。

总结：0.0.5 的交付标准是“第一批高频步骤能稳定运行，公共基础设施可复用，0.0.4 控制流能力不回归”，而不是一次性补齐全部 AdsPower 差距。