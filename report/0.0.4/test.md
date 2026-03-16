# TheTower 0.0.4 测试文档模板

导语：本文档用于 0.0.4 的测试执行与记录，覆盖步骤扩展、subflow 编辑、递归执行、错误定位与兼容回归。

## 1. 后端测试

| 用例ID | 测试项 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| BE-401 | IF 分支执行 | 运行 `test/0.0.4/backend-if-step-path-test.ps1` | 按条件命中正确分支；事件带 `stepPath` | `schemaVersionAccepted=true`、`rootIfPathOk=true`、`thenStepPathOk=true`、`elseNotExecuted=true`、`terminalSucceeded=true` | 通过 |
| BE-402 | While 最大循环保护 | 已补单元校验与执行骨架，待补 API 集成脚本 | 达到上限后停止循环，不死循环 | `gradle test` 通过；集成脚本待补 | 部分完成 |
| BE-403 | break 作用域校验 | 执行 `gradle test` 中的 `TemplateServiceTest/StepTreeSupportTest` | 返回结构化错误码或在保存前被拦截 | 单测已覆盖 `break` 循环外非法场景并通过 | 通过 |
| BE-404 | 子步骤失败定位 | 已补 `stepPath` 事件结构，失败路径脚本待补 | `STEP_FAILED` 返回完整 `stepPath` | 当前已验证成功路径 `stepPath`；失败路径集成脚本待补 | 部分完成 |
| BE-405 | 旧模板兼容 | 执行 `backend/scripts/api-smoke-test.ps1`、`backend/scripts/ws-event-test.ps1` | 0.0.1 线性模板可正常读取与运行 | REST 冒烟 `15/15` 通过；WS 事件链 `8` 条，终态成功，`seq` 严格递增 | 通过 |

补充结果：
- `gradle test`：通过
- `backend/scripts/api-smoke-test.ps1`：`15/15` 通过
- `backend/scripts/ws-event-test.ps1`：通过
- `test/0.0.4/backend-if-step-path-test.ps1`：通过

## 2. 前端测试

| 用例ID | 测试项 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| FE-401 | 控制流节点可见 | 执行 `frontend/e2e/smoke.spec.ts` 中新增用例 | 主流程节点库显示 `IF 条件 / For 次数 / While 循环`，`break` 不在根作用域暴露 | Playwright 用例通过；根流程下 `退出循环` 不显示 | 通过 |
| FE-401A | subflow 缩略预览 | 打开 `tpl-004`，未进入子流程前观察 IF 节点 | THEN / ELSE 在节点内显示 mini-canvas 缩略预览和首个子步骤名称 | 已补 Playwright 用例，断言 THEN/ELSE 缩略预览与首个子步骤名称可见 | 通过 |
| FE-402 | subflow 激活编辑 | 打开 `tpl-004`，点击 IF 节点的 `编辑 THEN` | 进入 THEN 子流程画布，并显示子流程节点 | Playwright 用例通过；工具栏与 banner 显示 `子流程 / 判断登录状态 / THEN`，子流程节点 `点击继续` 可见 | 通过 |
| FE-403 | THEN/ELSE 切换 | 在 IF 节点切换分支并分别编辑 | 分支内容隔离，计数正确 | Playwright 用例通过；从 THEN 切到 ELSE 后，`跳转登录页` 可见，`点击继续` 不再显示 | 通过 |
| FE-403A | BODY 子流程编辑 | 打开 `tpl-005`，观察循环节点并进入 BODY | BODY 缩略预览可见，进入后显示完整循环体节点 | Playwright 用例通过；进入 BODY 后可见 `重试点击登录` 和 `等待结果反馈` | 通过 |
| FE-403B | break 作用域限制 | 主流程查看节点库，再进入循环 BODY | `break` 仅在循环 BODY 中显示和可用 | Playwright 用例通过；根流程隐藏 `退出循环`，进入 BODY 后显示 `退出循环` 与 subflow 工作台 | 通过 |
| FE-404 | 保存与重载 | 在 THEN 子流程中修改子节点名称后保存并刷新 | subflow 结构与子节点改动不丢失 | Playwright 用例通过；刷新后再次进入 THEN 可看到修改后的节点名称 | 通过 |
| FE-405 | 运行高亮 | 在真实后端模式下运行 0.0.4 IF 模板 | 主节点与子节点按 `stepPath` 高亮，运行面板可见真实路径事件 | `playwright.real.config.ts` 联调用例通过；真实运行后可在运行面板看到 `step-if-real-001 / then / step-real-click-001` | 通过 |
| FE-406 | 子流程失败显式展示 | 在真实后端模式下运行带失败 THEN 分支的 IF 模板 | 未展开容器节点也能显示子流程失败状态与失败分支标记 | `playwright.real.config.ts` 联调用例通过；容器节点显示 `子流程失败`，THEN 分支显示 `失败` 标签 | 通过 |
| FE-407 | 失败节点一键定位 | 在真实后端模式下运行失败 IF 模板，点击运行面板中的 `定位失败节点` | 自动切入对应分支并选中失败子节点 | `playwright.real.config.ts` 联调用例通过；点击后进入 `子流程 / 判断失败分支 / THEN`，失败节点 `点击不存在按钮` 可见 | 通过 |
| FE-408 | 首页模板管理回归 | 在首页对新建模板执行运行、重命名、删除等操作 | 空模板禁用运行，重命名与删除入口稳定可用 | `frontend/e2e/regression.spec.ts` 用例通过；模板卡片菜单操作稳定，无误跳转 | 通过 |
| FE-409 | 空白模板作者流闭环 | 从空白模板拖入步骤、配置参数、保存并刷新回载 | 线性流程可正确编写、保存且重载后结构不丢失 | `frontend/e2e/regression.spec.ts` 用例通过；刷新后仍可看到已编排步骤与配置 | 通过 |
| FE-410 | 非法流程运行前拦截 | 从空白模板创建非法流程后点击运行 | 前端在运行前给出校验提示并阻止执行 | `frontend/e2e/regression.spec.ts` 用例通过；无效流程被阻止运行并显示校验反馈 | 通过 |
| FE-411 | 真实后端作者流运行 | 从空白模板编写真实流程并直接运行 | 可完整走通编写、保存、运行、成功反馈闭环 | `playwright.real.config.ts` 联调用例通过；作者流成功运行并出现完成提示 | 通过 |

补充结果：
- `frontend/npm run build`：通过
- `frontend/npx playwright test`：`17/17` 通过（含 import/export、根作用域节点限制、THEN/ELSE 切换、subflow 缩略预览、BODY 子流程进入、subflow 工作台、子流程保存重载、首页模板管理、空白模板作者流、运行前校验）
- `frontend/npx playwright test -c playwright.real.config.ts`：`5/5` 通过（真实后端模板加载、真实 IF stepPath、真实 While BODY stepPath、真实失败路径展示、失败节点一键定位、空白模板作者流运行）

## 3. 端到端回归

| 用例ID | 场景 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| E2E-401 | IF 控制流闭环 | 创建带 IF 的真实 0.0.4 模板，前端加载并运行 | THEN/ELSE 路径可编辑、可运行、可定位 | 已通过真实后端 Playwright 联调；模板加载正常，运行后可见真实 `stepPath` 事件 | 通过 |
| E2E-402 | While subflow 闭环 | 创建带 While 的真实模板并在 BODY 内配置步骤 | BODY 可编辑、保存后可重载、运行时可高亮 | 已通过真实后端 Playwright 联调；运行后可见 `step-while-real-001 / body / step-while-wait-001` | 通过 |
| E2E-403 | 空白模板编排闭环 | 从首页新建空白模板，拖拽步骤完成流程编排后保存并刷新 | 新流程可被稳定编写、保存并恢复 | 已通过常规 Playwright 回归；空白模板可完成线性流程编排与回载 | 通过 |
| E2E-404 | 失败定位闭环 | 创建带失败 THEN 分支的真实模板，运行失败后从运行面板定位 | 可从失败态直接进入对应 subflow 并看到失败节点 | 已通过真实后端 Playwright 联调；按钮可切入 `THEN` 分支并定位失败节点 | 通过 |
| E2E-405 | 真实作者流闭环 | 从空白模板直接编写真实后端流程并运行成功 | 编排、保存、运行、成功反馈形成完整闭环 | 已通过真实后端 Playwright 联调；作者流可直接运行成功 | 通过 |
| E2E-406 | 旧模板回归 | 打开旧版模板并运行 | 不因 0.0.4 升级回归 | 已由 `backend/scripts/api-smoke-test.ps1`、`backend/scripts/ws-event-test.ps1` 与前端 `17/17` 常规回归共同覆盖 | 通过 |

## 4. 缺陷记录

| 缺陷ID | 场景 | 现象 | 原因 | 修复 | 结论 |
|---|---|---|---|---|---|
| BUG-401 | 真实模板加载 | 真实后端模板进入编辑页时出现 `Cannot read properties of undefined (reading 'forEach')` | 前端 `stepsToGraph` 对 `otherStep.nodes/edges` 缺少容错 | 为 `otherStep` 与 `nodes/edges` 增加空值兜底 | 已修复 |
| BUG-402 | 真实 WS 联调 | 运行面板只重复出现 `RUN_STARTED`，看不到后续步骤事件 | `useWebSocket` 依赖不稳定的回调和默认编解码函数，导致连接被重复重建 | 固定 callback ref 与默认 `encode/decode` 引用，并在真实联调模式下直连后端 WS | 已修复 |
| BUG-403 | 子流程失败可见性 | 子步骤失败时，未展开的容器节点缺少显式失败提示 | 运行态只按根节点 `stepId` 建状态，未聚合子路径失败状态 | 在 `runStore` 增加路径前缀聚合，并将失败状态映射到容器节点与分支预览 | 已修复 |
| BUG-404 | 运行面板事件流崩溃 | 真实联调失败场景下运行面板出现 `Cannot read properties of undefined (reading 'stepPath')` | 事件流渲染默认假设所有事件都携带 `payload` | 为事件列表增加空 `payload` 容错，统一按空对象回退渲染 | 已修复 |
| BUG-405 | 失败定位目标偏浅 | 点击 `定位失败节点` 后只停留在容器根节点，未进入失败分支 | 失败路径选择逻辑取了最后一个 `STEP_FAILED`，被容器失败事件覆盖了子节点失败事件 | `latestFailedStepPath` 改为优先返回更深层 `stepPath`，仅在没有嵌套失败路径时才回退容器路径 | 已修复 |

总结：0.0.4 测试已覆盖“subflow 可编辑、容器步骤可运行、失败可显式展示且可一键定位、旧模板不回归”四个核心闭环。