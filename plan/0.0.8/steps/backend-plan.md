# 0.0.8 后端实施文档（运行语义修正 + 高频步骤补齐 + 元素引用收口）

导语：本文档用于指导 0.0.8 后端实现，重点解决运行自动启动承接、调试浏览器保留策略、新增高频步骤落地，以及 `elementRefVar + elementOrder` 的统一解析。

## 1. 实施目标与边界

- 目标：在不破坏 0.0.7 调试状态机的前提下，补齐调试结束后浏览器保留语义。
- 目标：实现 `keyboardPress`、`keyboardHotkey`、`textExtract`、`goBack`、`closeOtherPages`。
- 目标：把元素引用与顺序选择下沉为统一能力，避免选择器类步骤各自实现。
- 目标：为前端运行监控提供更友好的步骤显示信息。
- 边界：不在本版实现条件断点、远程预览操控、文件系统集成和外部平台能力。

## 2. 后端改造主线

| 模块 | 当前现状 | 0.0.8 目标 |
|---|---|---|
| `RunService` | 已支持 run 生命周期与 0.0.7 调试控制 | 区分 run 终态与 debug session 终态，支持保留浏览器直到显式关闭 |
| `PlaywrightRunSession` | 已支持页面、上下文、调试预览与步骤执行 | 增加键盘步骤、页面后退、关闭其他页面和浏览器保留逻辑 |
| `StepTreeSupport` / 步骤解析层 | 已支持控制流、子流程与 0.0.7 数据步骤 | 纳入新步骤 schema 校验与步骤显示名生成 |
| 选择器解析能力 | 已能解析常规 selector | 抽象 `elementRefVar + elementOrder` 统一解析入口 |
| routes / event emitter | 已输出 run 与调试事件 | 事件中补齐 `stepName`、`stepType`、可读路径摘要 |

## 3. 模块拆分建议

### 3.1 `RunService` 负责 run 与 debug session 解耦

- run 到达 `SUCCEEDED`、`FAILED`、`CANCELED` 后，不立即强制关闭 debug session。
- 若 `keepBrowserOnFinish = true`，debug session 进入 `COMPLETED_WAITING_CLOSE` 或 `FAILED_WAITING_CLOSE`。
- 只有用户显式调用关闭接口、浏览器被用户主动关闭或超时清理时，debug session 才进入 `CLOSED`。
- 继续、单步等调试控制只在 `ACTIVE` 或 `PAUSED` 态可用；等待关闭态只保留查看与关闭能力。

### 3.2 `PlaywrightRunSession` 承接页面操作和键盘能力

- `keyboardPress` 调用统一键盘发送接口，标准化键名映射。
- `keyboardHotkey` 负责组合键格式拼装和平台差异收口。
- `goBack` 直接在当前活动页面执行后退，并处理页面不可回退的边界。
- `closeOtherPages` 通过上下文页列表筛选需保留页并关闭其余页面。
- 调试会话保留时，不要在 run 结束钩子里直接关闭浏览器或上下文。

### 3.3 文本处理执行器

- `textExtract` 单独实现为纯数据步骤，不耦合页面上下文。
- 先固定支持“首个匹配”与“全部匹配”两种结果模式，避免 0.0.8 扩成复杂文本引擎。
- 统一非法正则、未匹配、匹配组越界等错误包装。

### 3.4 元素引用统一解析层

- 新增统一方法解析目标元素来源：优先 `elementRefVar`，其次 `selector`。
- 当变量是元素集合时，由 `elementOrder` 选择最终目标元素。
- 若变量为空、类型不合法、索引越界或随机选择目标为空，统一返回结构化错误。
- 让 `click`、`type`、`extract`、等待类及其他相关步骤都复用这套能力。

## 4. 公共能力要求

### 4.1 调试浏览器保留

- 浏览器保留能力必须由显式配置驱动，而不是靠“debug 模式默认不回收”这种隐式行为。
- 保留状态下仍要保留最后一次变量快照、当前页面 alias 和上下文信息，供前端继续查看。
- 若浏览器已被用户手动关闭，debug session 需要同步进入关闭态，避免前端误以为还可操作。

### 4.2 步骤显示名生成

- 每个步骤在编译或运行时都应有稳定的 `displayName` 生成规则。
- 优先级建议为：节点自定义名称 > 步骤定义中文名 > 步骤类型。
- `stepPathDisplay` 需要与 `stepPath` 一一对应，方便前端直接渲染路径。

### 4.3 元素引用一致性

- `elementRefVar` 与 `selector` 的优先级必须在所有相关步骤保持一致。
- `elementOrder` 的 `first/last/index/random` 四类策略必须统一实现，禁止每个步骤各自解释。
- 元素引用错误需保留当前步骤路径和变量名，便于前端定位问题。

## 5. 测试重点

1. debug session 在 run 结束后进入“待关闭”而非立即关闭。
2. `keyboardPress` 和 `keyboardHotkey` 对常用按键与组合键执行正确。
3. `textExtract` 在匹配成功、未匹配、非法正则、group 越界场景下行为稳定。
4. `goBack` 与 `closeOtherPages` 在多标签页上下文中行为可预测。
5. `elementRefVar + elementOrder` 在主要选择器类步骤中的统一解析与错误路径正确。
6. 0.0.7 的断点、继续、单步、变量快照与子流程执行不回归。

## 6. 实施顺序

1. 冻结新增步骤 schema 与调试保留状态枚举
2. 扩 `RunService` 的 debug session 生命周期
3. 下沉元素引用统一解析层
4. 实现键盘步骤、文本提取和页面操作步骤
5. 扩事件模型中的步骤显示字段
6. 补后端自动化测试与联调脚本

总结：0.0.8 后端的核心不是做更重的能力扩张，而是把调试生命周期、高频步骤和元素引用这三条最常用链路做成稳定底座。