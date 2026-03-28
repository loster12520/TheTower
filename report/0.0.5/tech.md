# TheTower 0.0.5 技术实现报告（高频步骤补齐 + 基础设施收口）

导语：本文档用于记录 0.0.5 的实现路径、关键设计点、改动文件与技术取舍，便于回溯与后续版本复用。

## 1. 技术目标

- 交付 0.0.5 第一批高频步骤的前后端闭环。
- 收口变量替换、通用超时、artifacts、下载与浏览器上下文等公共基础设施。
- 降低新增步骤接入时对前后端多处硬编码的重复修改。
- 保持 0.0.4 的控制流、subflow 编辑、`stepPath` 高亮与失败定位不回归。

## 2. 关键设计

### 2.1 步骤注册与前端接入机制

- 前端将步骤定义从 `model + store + converter + validator + config panel` 分散硬编码，收口为统一步骤注册结构。
- 叶子步骤优先采用 schema 驱动表单，减少 `NodeConfigPanel` 的条件分支膨胀。
- 容器步骤 `forEachElement / forEachData / startBrowser` 保留专用配置组件，以承载 BODY 子流程入口、摘要与计数。

### 2.2 后端步骤分发机制

- 后端保留 `RunService` 的递归控制流骨架。
- 叶子步骤从单一 `when` 分发升级为按步骤域拆分的 handler 结构。
- 页面操作、等待、数据获取、artifact、上下文管理等逻辑分层实现，避免主执行器持续膨胀。

### 2.3 公共基础设施

- 字符串类参数统一走变量模板替换。
- 可阻塞步骤统一支持 `timeoutMs`。
- 截图与下载结果统一写入 artifacts，并在运行事件中返回元信息。
- 页面别名与浏览器上下文在运行态中形成最小可用语义。

### 2.4 兼容策略

- 模板结构继续沿用 `steps + otherStep + config.then/else/body`。
- 运行事件采用“新增字段，不替换旧字段”的升级策略。
- 0.0.4 模板不要求迁移即可继续读取与运行。

## 3. 预期改动文件

### 3.1 前端

- `frontend/src/models/index.ts`
- `frontend/src/stores/editorStore.ts`
- `frontend/src/stores/runStore.ts`
- `frontend/src/components/NodeConfigPanel/index.tsx`
- `frontend/src/utils/canvasConverter.ts`
- `frontend/src/utils/validator.ts`
- `frontend/src/nodes/index.tsx`
- `frontend/src/pages/editor/**`
- `frontend/e2e/**`

### 3.2 后端

- `backend/src/main/kotlin/com/thetower/services/RunService.kt`
- `backend/src/main/kotlin/com/thetower/services/StepTreeSupport.kt`
- `backend/src/main/kotlin/com/thetower/executor/**`
- `backend/src/main/kotlin/com/thetower/models/**`
- `backend/src/main/kotlin/com/thetower/utils/**`
- `backend/src/test/kotlin/com/thetower/**`

## 4. 风险与控制

- 前端配置面板继续膨胀：通过步骤注册表与 schema 驱动表单控制复杂度。
- 下载、截图、上传等能力依赖文件系统：先定义统一 artifacts 目录与元信息结构，再逐步接入步骤。
- 多标签页与多上下文状态容易混乱：以 `pageAlias` 与 `contextId` 明确运行态作用域。
- `forEachElement / forEachData` 作用域与循环变量处理易出错：在 `StepTreeSupport` 与集成测试中补足校验。
- 事件字段升级影响前端旧逻辑：坚持只新增字段，不替换既有字段。

## 5. 实现记录

- 待补：步骤注册结构的前端落地与默认配置收口。
- 待补：后端 handler 分发结构与公共参数解析工具。
- 待补：artifacts 目录规范、截图与下载产物回传。
- 待补：多标签页切换、Cookie 获取/清理与 `startBrowser` 容器上下文执行链路。
- 待补：`forEachElement / forEachData` 的子流程执行与变量作用域验证。

## 6. 版本承接说明

- 承接自 0.0.4 的能力：`openUrl / click / type / waitFor / extract / if / forTimes / while / break`，以及 subflow 编辑、失败定位、`stepPath` 可观测性。
- 0.0.5 不重做控制流架构，而是在既有控制流与运行态基础上补步骤与基础设施。
- 未纳入 0.0.5 的步骤与能力，保持在 0.0.6 再进入需求与实现阶段。

总结：0.0.5 技术实现的核心是把“新增步骤”从一次性扩展变成可持续扩展，让高频能力先可用，再为后续版本继续铺底。