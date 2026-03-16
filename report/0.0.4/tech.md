# TheTower 0.0.4 技术实现报告（步骤扩展 + subflow 控制流）

导语：本文档用于记录 0.0.4 的实现路径、关键设计点、改动文件与技术取舍，便于回溯与复用。

## 1. 技术目标
- 扩展步骤体系，补齐 0.0.4 P0 步骤。
- 引入容器节点与 subflow 小画布编辑能力。
- 后端执行器支持递归执行控制流。
- WS 事件支持 `stepPath`，用于嵌套流程高亮。

## 2. 关键设计

### 2.1 subflow 编辑态与持久化
- 前端编辑态允许容器节点内部维护 subflow 的 `nodes/edges`。
- 保存模板时，将 subflow 递归编译为 `config.then/config.else/config.body: Step[]`。
- 加载模板时，将子步骤逆转换为 subflow 画布。

### 2.2 容器节点 UI
- 主画布保持根流程。
- `if/for/while/startBrowser` 渲染为容器节点。
- 容器节点内部显示 subflow 预览区，激活后进入可编辑态。
- 同一时刻仅允许一个 subflow 进入激活态。

### 2.3 后端递归执行
- 顶层 `steps` 递归执行。
- `if` 根据条件选择 `then/else`。
- `for/while` 执行 `body`，并处理 `break`。
- 运行事件统一增加 `stepPath`。

### 2.4 兼容策略
- 旧版线性模板不要求自动补齐分支字段。
- 新版模板保存时写入 `schemaVersion=0.0.4`。
- 事件结构采用“新增字段，不替换旧字段”的升级策略。

## 3. 预期改动文件

### 3.1 前端
- `frontend/src/pages/editor/**`
- `frontend/src/components/NodeConfigPanel/**`
- `frontend/src/components/SubflowCanvas/**`
- `frontend/src/components/ContainerNode/**`
- `frontend/src/stores/editorStore.ts`
- `frontend/src/stores/runStore.ts`
- `frontend/src/utils/canvasConverter.ts`
- `frontend/src/utils/validator.ts`
- `frontend/src/nodes/**`

### 3.2 后端
- `backend/src/main/kotlin/com/thetower/services/RunService.kt`
- `backend/src/main/kotlin/com/thetower/executor/PlaywrightRunExecutor.kt`
- `backend/src/main/kotlin/com/thetower/models/**`
- `backend/src/main/kotlin/com/thetower/routes/**`
- `backend/src/main/kotlin/com/thetower/utils/**`

## 4. 风险与控制
- 多层 ReactFlow 嵌套带来事件冲突：限制同时只激活一个 subflow。
- 保存/加载转换错误导致子流程丢失：转换逻辑单独封装并补测试。
- 递归执行破坏旧主链路：保留旧模板回归与线性执行对照用例。
- 新步骤参数过多导致配置面板膨胀：分 P0/P1 实施，优先补齐闭环参数。

## 5. 实现记录
- 前端已完成控制流节点扩展，新增 `if / forTimes / while / break` 节点类型与对应配置面板。
- 前端编辑器已完成 `rootNodes/rootEdges + activeSubflow + subflowGraphMap` 的双层状态模型，支持 THEN、ELSE、BODY 子流程切换、保存与重载恢复。
- 容器节点已实现节点内 mini-canvas 缩略预览；激活子流程后，中间编辑区显示 subflow 工作台，提示当前作用域、子步骤数量与拖拽目标。
- 节点库已按作用域收口：`break` 仅在循环 BODY 中显示且仅允许在循环 BODY 中添加；运行前校验同步增加 `break` 非法作用域拦截。
- 运行态已接入 `stepPath`，真实前后端联调已通过独立 Playwright 配置验证，运行面板可展示真实子路径事件，并可从失败事件反向定位到具体失败节点。
- 真实联调阶段额外修复了两个兼容问题：`stepsToGraph` 对真实模板 `otherStep` 缺少空值容错，以及 `useWebSocket` 在回调与默认编解码函数不稳定时会重复重连，导致事件流只出现重复 `RUN_STARTED`。
- 运行态进一步增加了路径前缀聚合能力，容器节点和 THEN/ELSE/BODY 预览区可在未展开状态下直接展示子流程失败或执行中的状态。
- 编辑器增加了 `focusStepPath` 能力，收到失败路径后可自动切入对应 subflow 分支并选中目标节点；`runStore` 同时补充了“优先取最深层失败路径”的选择逻辑，避免容器失败事件覆盖子节点失败事件。
- 真实联调新增了 While BODY 闭环和失败路径展示两类 Playwright 用例，补齐了控制流成功路径与失败路径两侧验证。
- 运行面板事件流额外补了空 `payload` 容错，避免真实联调中的 `PONG` 等事件导致面板渲染崩溃。
- 后端实现细节与联调问题已在实现阶段分别记录到测试与版本总结，可继续增量回填。

总结：0.0.4 技术实现已形成“subflow 表达 + 递归执行 + 路径可观测 + 失败反向定位”的完整闭环。