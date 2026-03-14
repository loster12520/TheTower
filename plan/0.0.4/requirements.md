# 0.0.4 需求文档（v2）：步骤补齐 + 子步骤画布表达（对标 AdsPower RPA）

导语：本版本以 AdsPower RPA“操作选项/参数表”为基准，<u>补齐</u> TheTower 的步骤与参数，并定义 **IF/For/While** 等“含子步骤”的画布表达。

## 目录

- [0.0.4 需求文档（v2）：步骤补齐 + 子步骤画布表达（对标 AdsPower RPA）](#004-需求文档v2步骤补齐--子步骤画布表达对标-adspower-rpa)
  - [目录](#目录)
  - [范围与非目标](#范围与非目标)
  - [对标来源（AdsPower 操作选项）](#对标来源adspower-操作选项)
  - [公共约定（所有步骤通用）](#公共约定所有步骤通用)
  - [流程管理的核心：含子步骤的画布表达](#流程管理的核心含子步骤的画布表达)
    - [容器步骤范围](#容器步骤范围)
    - [数据结构（Template 保存结构）](#数据结构template-保存结构)
    - [画布 UI（ReactFlow 表达）](#画布-uireactflow-表达)
    - [编译/执行语义（后端需要可观测）](#编译执行语义后端需要可观测)
  - [0.0.4 步骤清单（含参数对齐）](#004-步骤清单含参数对齐)
    - [页面操作（16）](#页面操作16)
    - [键盘操作（2）](#键盘操作2)
    - [等待操作（3）](#等待操作3)
    - [获取数据（17）](#获取数据17)
    - [数据处理（4）](#数据处理4)
    - [流程管理（9，含子步骤）](#流程管理9含子步骤)
  - [验收口径（最小可复现流程）](#验收口径最小可复现流程)

## 范围与非目标

- 范围：对标 AdsPower 的 **页面操作/键盘操作/等待操作/获取数据/数据处理/流程管理（控制流）**，新增/增强 stepType 与 config schema。
- 非目标：不做第三方工具（2Captcha/OpenAI）；不做 AdsPower 的产品管理能力（模板商店/计划任务/账号环境资产）。

## 对标来源（AdsPower 操作选项）

| 模块 | AdsPower 操作选项 |
|---|---|
| 页面操作 | 新建标签、关闭标签、关闭其他标签、切换标签、访问网站、刷新页面、页面后退、页面截图、经过元素、下拉选择器、元素聚焦、点击元素、输入内容、滚动页面、上传附件、执行 JS 脚本 |
| 键盘操作 | 键盘按键、组合键 |
| 等待操作 | 等待时间、等待元素出现、等待请求完成 |
| 获取数据 | 获取 URL、获取粘贴板内容、元素数据、当前焦点元素、存到文件、存到 Excel、下载文件、导入 Excel 素材、Google Sheet、导入 txt、获取邮件、身份验证器码、监听请求触发、监听请求结果、停止页面监听、获取页面 Cookies、清除页面 Cookies |
| 数据处理 | 文本中提取、转换 Json 对象、字段提取、随机提取 |
| 流程管理 | 启动新浏览器、IF 条件、For 循环元素、For 循环次数、For 循环数据、退出循环、关闭浏览器、While 循环、使用其他流程 |

## 公共约定（所有步骤通用）

1. 变量引用：所有“输入文本/URL/文件名/模板”等字段必须支持 `${varName}`。
2. outputs：每个步骤可写入 `outputs`（Run 级变量上下文），后续步骤可引用。
3. 元素顺序：对齐 AdsPower 的“固定值/区间随机”。
   - `elementOrder?: { mode: 'fixed'|'randomRange', index?: number, min?: number, max?: number }`
4. 元素对象（AdsPower 的“储存的元素对象”）：0.0.4 不存储 Playwright 的原生句柄，改为可序列化的 **ElementRef**。
   - `elementRefVar?: string`：引用一个变量名，变量内容为 `{ selector, selectorType?, elementOrder? }`。
5. 超时：所有可能阻塞的步骤支持 `timeoutMs?: number`。
6. 产物：截图/下载/写文件/写 Excel 必须把产物写入 run artifacts，并在事件与 run 详情可查。

## 流程管理的核心：含子步骤的画布表达

这一节是 0.0.4 的关键：AdsPower 的 IF/For/While/启动新浏览器 都是“容器步骤”，必须包含子步骤。0.0.4 不采用“跳转到另一张子页面”的方式，而采用 **subflow**：<u>在容器节点内部嵌入一个可编辑的小型画布</u>，用户直接把步骤拖进去编排。

### 容器步骤范围

- 仅以下 stepType 使用 subflow：`if`、`forEachElement`、`forTimes`、`forEachData`、`while`、`startBrowser`。
- 普通步骤仍为叶子节点，不带子步骤。
- 本版不支持“跨层连线”：主流程节点不能直接连到 subflow 内部节点，subflow 内部节点也不能直接连回主流程。

### 数据结构（Template 保存结构）

- 主流程仍保存为 `steps: Step[]`，保持 TheTower 现有主链路语义。
- 容器步骤在前端编辑态维护自己的 `subflow` 图数据；保存到后端时，编译为容器步骤 `config` 下的子步骤数组。
- 约定：普通步骤为叶子节点；控制流步骤仅允许携带固定名称的分支字段，不使用泛化 `children`。

分支字段约定：

| stepType | 子步骤字段 |
|---|---|
| `if` | `then: Step[]`、`else: Step[]` |
| `forEachElement` | `body: Step[]` |
| `forTimes` | `body: Step[]` |
| `forEachData` | `body: Step[]` |
| `while` | `body: Step[]` |
| `startBrowser` | `body: Step[]` |

前端编辑态建议结构：

```ts
type SubflowGraph = {
  nodes: Node[];
  edges: Edge[];
};
```

说明：前端保留 `nodes/edges` 是为了支持拖拽、缩放、预览；保存模板时，再把每个 subflow 编译为线性 `Step[]`。

建议结构（示例）：

```json
{
  "id": "if-1",
  "type": "if",
  "data": {
    "label": "IF 条件",
    "config": {
      "condition": { "left": "${var}", "op": "exists", "right": "" },
      "then": [ { "id": "click-1", "type": "click", "data": { "label": "点击", "config": {"selector": "#ok"} } } ],
      "else": []
    }
  }
}
```

### 画布 UI（ReactFlow 表达）

- 主画布保持“单层流程”，但容器步骤显示为 **大型容器节点**，不是普通小节点。
- 容器节点内部包含一个 `subflow viewport`，用于展示子流程缩略图或激活后的可编辑小画布。
- 容器节点的视觉结构固定为三段：
  1. 头部：步骤名称 + 关键配置摘要（如 `IF 条件`、`While max=10`）。
  2. 中部：subflow 预览区。
  3. 底部：分支计数与操作按钮（如 `THEN 3 / ELSE 1`、`BODY 4`）。

具体交互：

1. 默认态：subflow 仅显示缩略预览，不响应节点拖拽与连线。
2. 激活态：用户点击“编辑子流程”或双击容器节点后，subflow 进入激活编辑态，接管拖拽、缩放、连线事件。
3. 同一时刻只允许一个容器节点处于激活态，避免多层 ReactFlow 同时响应滚轮与拖拽。
4. 激活态下，左侧节点库拖拽目标可以是主画布，也可以是当前激活的 subflow。
5. subflow 预览区必须提供 `放大/缩小/适配视图/折叠` 操作。

分支表达规则：

- `if` 节点顶部提供 `THEN / ELSE` 分支切换，只显示当前分支的 subflow 画布，另一分支显示计数摘要。
- `forEachElement`、`forTimes`、`forEachData`、`while`、`startBrowser` 仅显示 `BODY` subflow。
- 容器节点允许嵌套容器节点，即 subflow 内部可继续放置 `if/while/for`。

右侧配置面板规则：

- 右侧面板不再承担“切页进入子流程”的职责，而是承担“配置容器参数 + 控制当前分支/编辑状态”的职责。
- `if` 面板至少包含：条件配置、`THEN/ELSE` 计数、切换按钮、清空当前分支按钮。
- `while` 面板至少包含：条件配置、`maxIterations`、`BODY` 计数、进入编辑按钮。
- `for` 面板至少包含：循环源配置、循环变量配置、`BODY` 计数、进入编辑按钮。

### 编译/执行语义（后端需要可观测）

- 主流程与每个 subflow 在保存前都必须独立校验为“本层线性流程”。0.0.4 允许嵌套，但每一层内部仍保持单入口、单出口、无环。
- 保存语义：前端把 subflow 的 `nodes/edges` 编译为 `Step[]`，写入容器步骤 `config.then/config.else/config.body`。
- 执行语义：后端执行器从“顶层顺序遍历”升级为“递归执行步骤树”。
- WS 事件必须携带 `stepPath`（数组）用于前端高亮：
  - 例：`["if-1", "then", "click-1"]`
  - 例：`["while-1", "body", "type-2"]`
- 前端运行态高亮规则：
  1. 主画布高亮当前容器父节点。
  2. 若当前容器 subflow 已展开，则继续高亮 subflow 内部的当前步骤。
  3. 日志面板显示 `stepPath`，便于定位嵌套执行位置。

事件建议结构：

```json
{
  "type": "STEP_STARTED",
  "payload": {
    "stepId": "click-1",
    "stepType": "click",
    "stepPath": ["if-1", "then", "click-1"]
  }
}
```

- 校验规则：
  - `break` 仅允许出现在循环体内。
  - `if.then` 不允许为空（P0 约束）；`else` 可为空。
  - `while` 必须配置防死循环：`maxIterations`（P0）。
  - subflow 激活编辑态下，若当前分支存在未闭合连线或多个起点，保存必须失败。
  - `startBrowser.body` 内若出现 `closeBrowser`，语义视为关闭当前容器启动的浏览器实例，不影响主流程默认上下文。

## 0.0.4 步骤清单（含参数对齐）

说明：下表以 TheTower stepType 为中心，列出与 AdsPower 一致的可调参数，并标注参数优先级（P0 必做，P1 可延后，P2 预留）。

### 页面操作（16）

| AdsPower 操作选项 | TheTower stepType | 参数（对齐 AdsPower） |
|---|---|---|
| 新建标签 | `newPage` | P0：`pageAlias?`；P1：`switchToNew?: boolean` |
| 关闭标签 | `closePage` | P0：`pageAlias?`（空=当前） |
| 关闭其他标签 | `closeOtherPages` | P1：`keepPageAlias?`（空=当前） |
| 切换标签 | `switchPage` | P1：`matchBy: 'title'|'url'`、`matchType: 'equals'|'contains'`、`value` |
| 访问网站 | `openUrl`（增强） | P0：`url`（支持变量）；P1：`timeoutMs?` |
| 刷新页面 | `reloadPage` | P0：`timeoutMs?` |
| 页面后退 | `goBack` | P1：`timeoutMs?` |
| 页面截图 | `screenshotPage` | P0：`name?`、`fullPage: boolean`；P0：`format: 'png'|'jpeg'`；P1：`quality?`（jpeg 才生效） |
| 经过元素 | `hover` | P0：`selector` 或 `elementRefVar?`；P0：`elementOrder?` |
| 下拉选择器 | `selectOption` | P0：`selector` 或 `elementRefVar?`；P0：`elementOrder?`；P0：`value`（支持变量） |
| 元素聚焦 | `focus` | P0：`selector` 或 `elementRefVar?`；P0：`elementOrder?` |
| 点击元素 | `click`（增强） | P0：`selector` 或 `elementRefVar?`；P0：`elementOrder?`；P0：`mouseButton: 'left'|'middle'|'right'`；P0：`clickAction: 'single'|'double'` |
| 输入内容 | `type`（增强） | P0：`selector` 或 `elementRefVar?`；P0：`elementOrder?`；P0：`contentMode: 'fixed'|'sequence'|'random'|'randomNumber'|'useVar'`；P0：`contents?: string[]`；P0：`varName?: string`（useVar）；P1：`randomMin?`/`randomMax?`；P0：`intervalMsPerChar?`；P1：`clearBeforeType?: boolean` |
| 滚动页面 | `scrollPage` | P0：`scrollMode: 'position'|'pixel'`；P0：`position?: 'top'|'middle'|'bottom'`；P0：`pixels?: number`；P0：`scrollType: 'smooth'|'instant'`；P1：`smoothStepPixels?`、`smoothPauseMs?` |
| 上传附件 | `uploadFiles` | P0：`selector`；P0：`elementOrder?`；P0：`source: 'localFile'|'randomFileInFolder'|'url'`；P0：`pathOrUrl`；P0：`timeoutMs?` |
| 执行 JS 脚本 | `executeJs` | P1：`javascript`；P1：`injectVars?: string[]`；P1：`saveAs?: string` |

### 键盘操作（2）

| AdsPower 操作选项 | TheTower stepType | 参数（对齐 AdsPower） |
|---|---|---|
| 键盘按键 | `keyboardPress` | P0：`key`（如 `Backspace`、`Tab`、`Enter`、`Space`、`Escape`、`Delete`、`ArrowUp/Down/...`） |
| 组合键 | `keyboardHotkey` | P0：`hotkey`（如 `Control+A`、`Control+C`、`Control+V`、`Control+R`） |

### 等待操作（3）

| AdsPower 操作选项 | TheTower stepType | 参数（对齐 AdsPower） |
|---|---|---|
| 等待时间 | `waitFor`（增强） | P0：`waitMs` 或 `minMs/maxMs`（随机区间） |
| 等待元素出现 | `waitFor`（增强） | P0：`selector`（支持变量）；P0：`elementOrder?`；P0：`visible?: boolean`；P0：`timeoutMs?`；P1：`saveAs?: string`（保存 true/false） |
| 等待请求完成 | `waitForResponse` | P1：`responseUrl`；P1：`timeoutMs?` |

### 获取数据（17）

| AdsPower 操作选项 | TheTower stepType | 参数（对齐 AdsPower） |
|---|---|---|
| 获取 URL | `getUrl` | P0：`extract: 'full'|'origin'|'queryParam'`；P0：`paramName?`；P0：`saveAs` |
| 获取粘贴板内容 | `getClipboardText` | P2：`saveAs` |
| 元素数据 | `extract`（增强） | P0：`selector` 或 `elementRefVar?`；P0：`elementOrder?`；P0：`extractType: 'text'|'attribute'|'html'|'source'|'elementRef'|'iframeRef'|'childElement'`；P0：`attributeName?`（attribute）；P1：`childTagName?`（childElement）；P0：`saveAs` |
| 当前焦点元素 | `extractActiveElement` | P1：`extractType`（同上）；P1：`attributeName?`；P1：`saveAs` |
| 存到文件 | `saveData` | P1：`fileName`（支持变量）；P1：`template`（支持变量） |
| 存到 Excel | `saveExcel` | P2：`fileName`（支持变量）；P2：`columns: string[]`（选择变量名作为列） |
| 下载文件 | `downloadFile` | P0：`url`（支持变量）；P0：`saveDir`；P1：`fileName?`；P1：`timeoutMs?` |
| 导入 Excel 素材 | `importExcel` | P2：`path`；P2：`saveAs`（数组对象） |
| Google Sheet | `googleSheet` | P2：`op: 'read'|'write'|'clear'`；P2：`spreadsheetId`；P2：`sheetName`；P2：`range?`；P2：`credentialsJson`；P2：`saveAs?` |
| 导入 txt | `importText` | P1：`path`；P1：`saveAs`（数组） |
| 获取邮件 | `getEmail` | P2：`email`、`passwordOrAuthCode`、`host`、`port`；P2：`status`、`markAsRead?`、`fromSpam?`；P2：`timeRange?`、`senderKeyword?`、`titleKeyword?`；P2：`extractPattern?`；P2：`saveAs` |
| 身份验证器码 | `totp` | P1：`secret`；P1：`saveAs` |
| 监听请求触发 | `listenRequestTrigger` | P2：`requestUrl`；P2：`extract: 'fullUrl'|'headers'|'getParams'|'postData'`；P2：`saveAs` |
| 监听请求结果 | `listenRequestResult` | P2：`requestUrl`；P2：`saveAs` |
| 停止页面监听 | `stopPageListen` | P2：无 |
| 获取页面 Cookies | `getCookies` | P1：`saveAs` |
| 清除页面 Cookies | `clearCookies` | P1：无 |

### 数据处理（4）

| AdsPower 操作选项 | TheTower stepType | 参数（对齐 AdsPower） |
|---|---|---|
| 文本中提取 | `textExtract` | P1：`textVar`；P1：`pattern`（正则）；P1：`firstOnly?: boolean`；P1：`saveAs` |
| 转换 Json 对象 | `convertJson` | P1：`textVar`；P1：`saveAs` |
| 字段提取 | `extractKey` | P1：`dataVar`（数组/对象）；P1：`key`（对象 key 或数组 index）；P1：`saveAs` |
| 随机提取 | `randomGet` | P1：`listVar`；P1：`saveAs` |

### 流程管理（9，含子步骤）

| AdsPower 操作选项 | TheTower stepType | 参数（对齐 AdsPower） |
|---|---|---|
| IF 条件 | `if` | P0：`condition.left`（变量/常量）；P0：`condition.op`（存在/不存在/包含/不包含/等于/不等于/小于/小于等于/大于/大于等于）；P0：`condition.right?`；P0：`then: Step[]`；P1：`else: Step[]` |
| For 循环元素 | `forEachElement` | P1：`selector`；P1：`elementOrder?`；P1：`extractType`（参考 extract 的类型）；P1：`itemVar`（循环对象保存至）；P1：`indexVar?`（循环位置保存至）；P1：`body: Step[]` |
| For 循环次数 | `forTimes` | P1：`times`；P1：`indexVar?`；P1：`body: Step[]` |
| For 循环数据 | `forEachData` | P1：`dataVar`（数组/对象）；P1：`itemVar`；P1：`indexVar?`；P1：`body: Step[]` |
| While 循环 | `while` | P0：`condition`（同 IF）；P0：`maxIterations`；P1：`body: Step[]` |
| 退出循环 | `break` | P1：无（只允许在循环体内） |
| 使用其他流程 | `callWorkflow` | P2：`templateId`；P2：`inputMapping?`、`outputMapping?` |
| 启动新浏览器 | `startBrowser` | P2：`envSerial`（环境编号，支持变量）；P2：`onError: 'skip'|'abort'`；P2：`onComplete: 'keep'|'close'`；P2：`body: Step[]` |
| 关闭浏览器 | `closeBrowser` | P2：无 |

## 验收口径（最小可复现流程）

1. P0：页面闭环
  - openUrl → waitFor(selector + visible=true) → click(双击/右键至少支持一种) → type(随机选取内容) → screenshot(fullPage=true)

2. P0：获取数据闭环
   - extract(text/attribute 至少一种) 保存变量 → getUrl(queryParam) 保存变量 → downloadFile(使用变量 URL)

3. P0：子步骤闭环（控制流）
  - if（exists）节点以 subflow 形式编辑 THEN/ELSE；then 内执行 click/type，else 内执行 screenshot；WS 事件能按 `stepPath` 高亮主节点与 subflow 内步骤

4. P0：subflow 编辑闭环
  - 在主画布放置 while 节点 → 激活 BODY subflow → 拖入 waitFor/click/type → 缩放与适配视图正常 → 保存后重新加载模板，subflow 结构不丢失

总结：0.0.4 的验收重点是“参数对齐 + subflow 可编辑 + 子步骤可执行可观测”，第三方工具明确不纳入本版本。
