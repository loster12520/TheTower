# TheTower 0.0.6 技术实现报告（调试可视化 + 编辑体验重构）

导语：本文档用于记录 0.0.6 的最终实现路径、关键设计点、测试资产与工程取舍，作为本版本收官后的技术回溯基线。

## 1. 技术目标

- 交付近实时调试预览、全屏查看与宿主机浏览器调试入口。
- 交付左右端口、无抖动选中态、复制剪切粘贴、撤销重做与自动连线。
- 保持 0.0.5 的默认运行主链路、outputs/artifacts、失败定位与作者流不回归。

## 2. 关键设计

### 2.1 调试会话与预览帧

- 后端在 `RunService` 内增加 debug session 生命周期、活动 Playwright 会话映射与预览协程管理。
- 调试模式启动后，预览帧不再只依赖步骤事件触发，而是按 `previewFps` 启动独立循环持续采样。
- 预览关闭时通过“关闭标记 + 停止预览协程 + 预览锁串行化”保证 `DEBUG_SESSION_CLOSED` 之后不再有 `DEBUG_FRAME` 越界。

### 2.2 宿主机浏览器与 DevTools

- `PlaywrightRunExecutor` 在调试模式下支持非 headless 启动，并在 Chromium/Chrome 下打开 DevTools。
- `open-browser` 控制接口不再只改状态，而是命中当前活动会话并调用页面 `bringToFront()`，把已启动的宿主机浏览器切到前台。
- 若调试运行不是以可见浏览器模式启动，或运行已结束，则返回结构化错误而不是静默成功。

### 2.3 运行面板与调试工作台

- `RunPanel` 增加调试预览卡片、页面别名、上下文、最近帧时间、全屏预览与关闭预览入口。
- `runStore` 增加 `debugSession`、`latestDebugFrame` 与调试事件消费逻辑，保持普通运行和调试运行共用同一套 run 状态机。
- 调试预览关闭后前端清空最后一帧，避免关闭后仍残留旧画面。

### 2.4 画布几何与编辑体验

- 所有节点统一改为左入右出端口，容器节点和普通节点保持一致。
- 选中态改为固定 2px 边框加阴影，不再通过边框增宽表达，消除选中抖动。
- `editorStore` 增加 clipboard 与 history 快照模型，支持复制、剪切、粘贴、撤销与重做。
- 编辑页在拖拽结束时按约 50px 阈值计算最近合法候选边，并继续复用单入单出校验落边。

## 3. 主要改动文件

### 3.1 后端

- `backend/src/main/kotlin/com/thetower/services/RunService.kt`
- `backend/src/main/kotlin/com/thetower/executor/PlaywrightRunExecutor.kt`
- `backend/src/main/kotlin/com/thetower/executor/PlaywrightRunSession.kt`
- `backend/src/main/kotlin/com/thetower/routes/RunRoutes.kt`
- `backend/src/main/kotlin/com/thetower/models/Run.kt`

### 3.2 前端

- `frontend/src/components/RunPanel/index.tsx`
- `frontend/src/stores/runStore.ts`
- `frontend/src/stores/editorStore.ts`
- `frontend/src/pages/editor/index.tsx`
- `frontend/src/nodes/index.tsx`
- `frontend/e2e/regression.spec.ts`
- `frontend/e2e/real-backend.spec.ts`

### 3.3 测试资产

- `test/0.0.6/README.md`
- `test/0.0.6/debug-preview-test.ps1`

## 4. 风险与控制

- 预览帧推送的性能风险：通过 `previewFps` 范围限制和独立调试模式隔离控制。
- 调试关闭后的竞态风险：通过活动预览协程管理和每个 run 的预览锁消除关闭后越界帧。
- 历史栈污染子流程风险：快照记录按当前画布作用域保存，并在恢复时同步 root/subflow 图状态。
- 自动连线绕过约束风险：吸附只负责找最近候选边，真正落边仍走既有 `addEdge` 规则。

## 5. 实现记录

- 已完成：调试会话事件模型、持续预览帧推送、全屏预览、宿主机浏览器调试入口。
- 已完成：左右端口、无抖动选中态、复制剪切粘贴、撤销重做与自动连线。
- 已完成：0.0.6 后端调试黑盒脚本与前端 mock/真实联调回归。
- 未纳入：预览画面内的远程点击/输入接管、跨模板系统剪贴板、画布自动排版。

## 6. 版本承接说明

- 0.0.6 承接自 0.0.5 的运行事件、outputs/artifacts、多标签页与浏览器上下文能力。
- 本版没有继续扩步骤家族，而是优先把运行调试与画布编辑体验做成可测试、可回归的能力。

总结：0.0.6 的收官结果是“调试时看得见、关闭后停得住、编辑时更顺手、0.0.5 主链路不回归”。