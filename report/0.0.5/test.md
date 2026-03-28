# TheTower 0.0.5 测试执行记录

导语：本文档用于记录 0.0.5 已完成的测试与联调结果，重点覆盖 artifacts、浏览器上下文、多标签页、容器步骤扩展与 0.0.4 回归。

## 1. 后端测试

| 用例ID | 测试项 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| BE-501 | 多标签页页面流 | 运行 `test/0.0.5/backend-context-page-test.ps1` | 标签页可创建、切换、关闭，事件路径正确 | `runSucceeded=true`、`switchPageAliasVisible=true`、`closePageFallsBackToTab1=true`、`bodyStepPathVisible=true` | 通过 |
| BE-502 | 截图产物写入 | 运行 `test/0.0.5/backend-test.py` 与 `test/0.0.5/ws-event-test.ps1` | 生成 artifact，事件中可见元信息 | Python 黑盒 `11/11` 通过；WS 黑盒 `screenshotArtifactsVisible=true` | 通过 |
| BE-503 | 下载产物写入 | 运行 `downloadFile` 步骤 | 下载成功并生成 artifact | 当前未补专项脚本 | 待定 |
| BE-504 | Cookie 获取与清理 | 运行 `test/0.0.5/backend-loop-cookie-test.ps1` | 清理前后结果有差异，变量可见 | `cookieBeforeVisible=true`、`cookieAfterCleared=true` | 通过 |
| BE-505 | waitForResponse 超时与命中 | 运行命中响应和超时两类模板 | 命中成功，超时返回结构化错误 | 当前未补专项脚本 | 待定 |
| BE-506 | forEachElement 执行 | 运行带 `forEachElement` BODY 的模板 | BODY 按元素顺序执行，循环变量可用 | 当前未补专项脚本 | 待定 |
| BE-507 | forEachData 执行 | 运行 `test/0.0.5/backend-loop-cookie-test.ps1` | BODY 按数据项执行，`itemVar/indexVar` 正常 | `forEachDataLoopCount=true`、`forEachDataStepPathOk=true`、`lastLoopValuePersisted=true` | 通过 |
| BE-508 | startBrowser 上下文隔离 | 运行 `test/0.0.5/ws-event-test.ps1` 与 `test/0.0.5/backend-context-page-test.ps1` | 容器上下文独立创建与关闭，不污染主流程 | `contextIdVisible=true`、`browserContextVisible=true`、多标签页切换与回退正常 | 通过 |
| BE-509 | 0.0.4 控制流回归 | 执行 `gradle test`、`backend/scripts/api-smoke-test.ps1`、`backend/scripts/ws-event-test.ps1` | 控制流能力不回归 | `gradle test` 通过；REST smoke `15/15` 通过；WS smoke 事件链成功且 `seq` 严格递增 | 通过 |

补充结果：
- `gradle test`：通过
- `backend/scripts/api-smoke-test.ps1`：`15/15` 通过
- `backend/scripts/ws-event-test.ps1`：通过
- `test/0.0.5/backend-test.py`：`11/11` 通过
- `test/0.0.5/ws-event-test.ps1`：通过
- `test/0.0.5/backend-loop-cookie-test.ps1`：通过
- `test/0.0.5/backend-context-page-test.ps1`：通过

## 2. 前端测试

| 用例ID | 测试项 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| FE-501 | 新增步骤节点可见 | 执行 `frontend/e2e/real-backend.spec.ts` 中节点库分组用例 | 0.0.5 新步骤显示在正确分组 | 真实联调通过；`页面操作 / 等待操作 / 获取数据 / 流程管理` 分组与关键节点可见 | 通过 |
| FE-502 | 新增叶子步骤配置表单 | 分别配置 `newPage / screenshotPage / waitForResponse / getUrl` | 表单字段可编辑、保存后不丢失 | 已验证空白模板作者流和 0.0.5 校验链路；逐项字段回填专项用例待补 | 部分完成 |
| FE-503 | 容器步骤 BODY 编辑 | 配置 `forEachElement / forEachData / startBrowser` | 可进入 BODY 子流程并保存重载 | 已验证 `startBrowser` 缩略预览与真实运行；`forEachElement / forEachData` 前端 BODY 编辑回归待补 | 部分完成 |
| FE-504 | outputs 与 artifacts 摘要展示 | 运行带截图模板 | 运行面板可见输出与产物摘要 | 真实联调用例通过；运行面板可见 `title=Example Domain` 与 `real-backend-shot.png` | 通过 |
| FE-505 | 多标签页页面流联调 | 运行真实页面流模板 | 页面步骤成功，路径与状态正确展示 | 新增真实联调用例通过；可见 `step-browser-ctx-001 / body / step-browser-switch-tab1-001` 与 `activeUrl` 输出 | 通过 |
| FE-506 | Cookie 流联调 | 运行真实 Cookie 模板 | Cookie 获取/清理结果可见 | 当前未补前端真实联调用例 | 待定 |
| FE-507 | 容器遍历联调 | 运行真实 `forEachElement` 或 `forEachData` 模板 | BODY 执行路径与失败定位正常 | 当前未补前端真实联调用例 | 待定 |
| FE-508 | 0.0.4 编辑器回归 | 运行既有 0.0.4 Playwright 用例 | subflow、失败定位、作者流不回归 | mock 套件 `17/17` 通过；真实后端套件 `8/8` 通过，subflow、失败定位、作者流均未回归 | 通过 |

补充结果：
- `frontend/npm run build`：通过
- `frontend/npx playwright test`：`17/17` 通过
- `frontend/npx playwright test -c playwright.real.config.ts e2e/real-backend.spec.ts`：`8/8` 通过

## 3. 端到端回归

| 用例ID | 场景 | 步骤 | 预期 | 实际 | 结论 |
|---|---|---|---|---|---|
| E2E-501 | 页面流闭环 | `startBrowser -> newPage -> switchPage -> getUrl -> closePage` | 多标签页成功，路径与输出可查 | 已通过 `backend-context-page-test.ps1` 与真实前端联调；切页、关页、BODY 路径、`activeUrl` 输出均正常 | 通过 |
| E2E-502 | 等待与下载闭环 | `waitFor -> waitForResponse -> getUrl -> downloadFile` | 等待命中，下载 artifact 可查 | 当前未补专项用例 | 待定 |
| E2E-503 | Cookie 闭环 | `getCookies -> clearCookies -> getCookies` | 清理前后结果有差异 | 已通过 `backend-loop-cookie-test.ps1`；清理前可见 `tower_cookie`，清理后输出为空 | 通过 |
| E2E-504 | forEach 容器闭环 | `forEachData` 执行 BODY 子流程 | 循环变量、路径高亮、失败定位正常 | 已通过 `backend-loop-cookie-test.ps1`，验证 `3` 次循环、固定 `stepPath` 与最终输出；`forEachElement` 前端联调待补 | 部分完成 |
| E2E-505 | 浏览器上下文闭环 | `startBrowser -> body -> closeBrowser` | 上下文独立，主流程不受污染 | 已通过 `ws-event-test.ps1` 与 `backend-context-page-test.ps1`；`contextId`、多标签页切换与关闭回退均正常 | 通过 |
| E2E-506 | 0.0.4 回归闭环 | 执行既有控制流与作者流回归 | 0.0.4 核心能力不回归 | 已由后端单测、REST/WS smoke、前端 mock `17/17` 与真实联调 `8/8` 共同覆盖 | 通过 |

## 4. 缺陷记录

| 缺陷ID | 场景 | 现象 | 原因 | 修复 | 结论 |
|---|---|---|---|---|---|
| BUG-501 | 0.0.5 提取节点运行前校验 | 真实联调点击运行后弹出“配置有误”，`extract` 节点提示变量名和提取模式非法 | 前端校验仍使用旧字段 `as / mode`，未兼容 0.0.5 的 `saveAs / extractType` | 调整 `frontend/src/utils/validator.ts`，兼容新旧字段并补充新增提取模式校验 | 已修复 |
| BUG-502 | outputs/artifacts 真实联调断言 | Playwright 用例因文本重名触发 strict mode，误报失败 | 测试同时命中运行面板与事件流中的同名文本 | 将断言收紧到对应卡片内，并改为精确文件名匹配 | 已修复 |
| BUG-503 | 真实联调作者流与多标签页流 | 点击运行后偶发卡在警告弹窗，测试误以为运行面板未出现 | “建议第一个节点设置为打开网页”的警告弹窗是异步出现的，原用例没有等待分支态 | 统一改为等待“警告”或“运行监控”任一出现后再继续处理 | 已修复 |
| BUG-504 | 多标签页新增黑盒模板 | `startBrowser` 多标签页脚本首次运行直接失败 | 测试模板把原始 HTML 标签直接塞进 `data:` URL，触发后端 URI 非法字符错误 | 改为合法的 `data:text/html,TabOneActive` 形式，脚本与真实联调均恢复通过 | 已修复 |

## 5. 验收对照

| 验收项 | 验收口径 | 结果 |
|---|---|---|
| 高频步骤补齐 | 第一批高频步骤可创建、保存、运行 | 部分完成：已验证截图、Cookie、多标签页、浏览器上下文、forEachData；`downloadFile / waitForResponse / forEachElement` 待补 |
| artifacts 能力 | 截图与下载可生成产物并回传元信息 | 部分完成：截图 artifact 已验证，下载 artifact 待补 |
| 浏览器上下文 | 多标签页与 `startBrowser` 可跑通 | 通过 |
| 容器步骤扩展 | `forEachElement / forEachData` 可执行 BODY 子流程 | 部分完成：`forEachData` 已验证，`forEachElement` 待补 |
| 0.0.4 不回归 | 控制流、subflow、失败定位、作者流通过回归 | 通过 |

总结：0.0.5 测试已完成截图产物、Cookie/forEachData、多标签页、浏览器上下文与 0.0.4 回归主链路验证，剩余缺口集中在 `downloadFile`、`waitForResponse` 与 `forEachElement` 三项专项覆盖。