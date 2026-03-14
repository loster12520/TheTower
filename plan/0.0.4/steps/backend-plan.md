# 0.0.4 后端实施文档（容器步骤与递归执行）

导语：本文档用于指导 TheTower 后端在 0.0.4 完成步骤扩展、容器步骤递归执行、subflow 校验与事件路径化，实现从线性执行器到树形步骤执行器的升级。

## 目录
- [1. 实施目标与边界](#1-实施目标与边界)
- [2. 后端改造主线](#2-后端改造主线)
- [3. 数据模型与校验改造](#3-数据模型与校验改造)
- [4. 执行器改造方案](#4-执行器改造方案)
- [5. 运行事件与可观测性](#5-运行事件与可观测性)
- [6. 分阶段实施清单](#6-分阶段实施清单)
- [7. 测试重点](#7-测试重点)
- [8. 风险与回滚策略](#8-风险与回滚策略)

---

## 1. 实施目标与边界

### 1.1 本版目标
1. 扩展模板校验，支持容器步骤与子步骤字段。
2. 扩展执行器，支持递归执行 `then/else/body`。
3. 在 WS 事件中增加 `stepPath`，提升嵌套流程可观测性。
4. 保持现有 run 生命周期与接口路径不变。

### 1.2 不变边界
- 不在本版引入多浏览器实例池。
- 不实现第三方工具步骤。
- 不修改 REST 主资源路径与响应包裹结构。

---

## 2. 后端改造主线

| 模块 | 当前现状 | 0.0.4 目标 |
|---|---|---|
| `models` | `StepData.config` 为 JsonObject | 保持结构，新增容器字段语义 |
| `services` | RunService 线性遍历 steps | 递归执行步骤树 |
| `executor` | Playwright 仅执行 5 个基础步骤 | 增加页面/键盘/等待/数据处理/控制流能力 |
| `validation` | 仅校验基础节点 config | 增加容器结构校验与 subflow 线性校验 |
| `ws events` | 仅有 `stepId/stepType` | 增加 `stepPath/parentStepId/branch` |

---

## 3. 数据模型与校验改造

### 3.1 模型策略
- 继续使用 [backend/src/main/kotlin/com/thetower/models/Template.kt](backend/src/main/kotlin/com/thetower/models/Template.kt) 中的 `JsonObject config`。
- 0.0.4 不强行把每个步骤都建成静态 data class，优先走“解析 + 校验 + 执行分发”。
- 容器节点通过 `type` 决定 `config` 必须包含哪些分支字段。

### 3.2 校验主线
建议新增或拆分：
1. `StepConfigValidator`：校验单步 config 字段。
2. `FlowStructureValidator`：校验某一层 `Step[]` 的结构合法性。
3. `ContainerStepValidator`：校验 `then/else/body` 的存在性、空值与嵌套合法性。

### 3.3 容器步骤校验规则
- `if.then` 必须非空数组。
- `if.else` 可为空数组。
- `while.maxIterations` 必填且大于 0。
- `break` 只能出现在循环容器的 `body` 中。
- 每一层 `Step[]` 都要单独校验为线性流程。

---

## 4. 执行器改造方案

### 4.1 当前问题
当前 [backend/src/main/kotlin/com/thetower/services/RunService.kt](backend/src/main/kotlin/com/thetower/services/RunService.kt) 以顶层 `for (step in template.steps)` 顺序执行，这无法表达 `if/while/for` 的嵌套执行位置。

### 4.2 目标结构
建议把执行过程拆成：
- `executeSteps(steps, context, path)`：递归执行一层步骤。
- `executeLeafStep(step, context, path)`：执行普通步骤。
- `executeContainerStep(step, context, path)`：执行 `if/for/while/startBrowser`。

### 4.3 执行上下文建议

```kotlin
internal data class ExecutionContext(
    val outputs: MutableMap<String, String>,
    val browserScope: String,
    val loopDepth: Int
)
```

说明：
- `outputs`：运行级变量上下文。
- `browserScope`：标识当前浏览器上下文，供 `startBrowser/closeBrowser` 使用。
- `loopDepth`：用于校验和执行 `break`。

### 4.4 `if` 执行语义
1. 计算 `condition`。
2. 条件为 true，则执行 `then`。
3. 条件为 false，则执行 `else`。
4. 路径示例：`["if-1", "then", "click-1"]`。

### 4.5 `for/while` 执行语义
- `forTimes`：根据 `times` 重复执行 `body`。
- `forEachData`：从变量上下文中取数组/对象，逐项执行 `body`。
- `forEachElement`：根据 `selector + elementOrder + extractType` 生成循环项，再执行 `body`。
- `while`：每轮先判断条件，最大执行次数受 `maxIterations` 限制。
- `break`：抛出内部受控中断信号，仅结束最近一层循环。

### 4.6 `startBrowser` 执行语义
- 该步骤创建新的浏览器上下文并执行 `body`。
- `closeBrowser` 默认关闭当前上下文。
- 若 `startBrowser.onComplete = close`，则 `body` 结束后自动关闭；否则保持到显式关闭或 run 结束。

---

## 5. 运行事件与可观测性

### 5.1 事件新增字段
建议所有步骤事件统一增加：
- `stepPath: List<String>`
- `parentStepId: String?`
- `branch: String?`

### 5.2 发事件时机
1. 进入任一步骤前：`STEP_STARTED`
2. 步骤成功后：`STEP_SUCCEEDED`
3. 步骤失败后：`STEP_FAILED`
4. 控制流内部可继续复用 `LOG` 表达条件判断、循环次数等过程信息。

### 5.3 日志建议
- `if` 记录命中分支。
- `while` 记录当前迭代次数。
- `forEachData` 记录当前索引。
- `forEachElement` 记录当前元素序号或提取结果摘要。

---

## 6. 分阶段实施清单

### Phase A：模型与校验基线（P0）
- 扩展 stepType 常量与配置解析。
- 建立容器步骤校验器。
- 建立子流程线性校验器。

### Phase B：执行器递归化（P0）
- 抽出 `executeSteps` 递归入口。
- 实现 `if/for/while/break` 的控制流语义。
- 保留旧普通步骤执行逻辑，避免一次性重写全部叶子步骤。

### Phase C：事件路径化（P0）
- 为所有步骤事件增加 `stepPath`。
- RunService 与 WS 推送结构同步更新。
- 与前端联调高亮规则。

### Phase D：新步骤补齐（P1）
- 页面操作：`hover/selectOption/focus/reloadPage/screenshotPage/uploadFiles/executeJs`
- 键盘操作：`keyboardPress/keyboardHotkey`
- 获取数据：`getUrl/getCookies/clearCookies/totp/importText`
- 数据处理：`textExtract/convertJson/extractKey/randomGet`

### Phase E：错误码与报告补齐（P1）
- 增加 subflow 相关错误码。
- 在技术报告中记录执行器从线性到递归的结构变化。

---

## 7. 测试重点

### 7.1 单元级重点
- `if.then/else` 分支选择正确。
- `while.maxIterations` 生效。
- `break` 仅中断最近循环。
- 子流程非法结构被正确拦截。

### 7.2 集成级重点
1. 保存带容器节点模板成功。
2. 启动运行后按路径收到完整事件链。
3. 子步骤失败时，`STEP_FAILED` 含完整 `stepPath`。
4. 旧版线性模板仍可直接运行。

---

## 8. 风险与回滚策略

### 8.1 主要风险
- 递归执行改造可能破坏现有线性步骤行为。
- `break`、`startBrowser` 等控制流语义易出现边界错误。
- 事件结构升级可能影响前端旧解析逻辑。

### 8.2 回滚策略
- 保留旧线性执行路径的可对照测试。
- 先让新事件字段“新增不替换”，避免一步破坏旧前端。
- 容器节点能力按 stepType 分批启用，优先 `if/while/forTimes`。

总结：后端 0.0.4 以“校验先行、执行递归化、事件路径化、步骤分批补齐”为主线，先把控制流与可观测性打稳，再扩展更多叶子步骤。