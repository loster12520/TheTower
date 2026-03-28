# 0.0.5 版本目标（高频步骤补齐 + 基础设施收口）

导语：本版本聚焦把 0.0.4 的控制流骨架升级为“可持续扩步骤”的执行平台，先交付第一批高频步骤，再把变量、产物、下载、浏览器上下文等**基础设施**收口。

## 1. 版本目标

| 目标项 | 优先级 | 说明 | 验收信号 |
|---|---:|---|---|
| 高频步骤补齐 | P0 | 交付页面、等待、获取数据、流程管理四类第一批高频步骤 | 新 stepType 可创建、保存、运行 |
| 执行基础设施收口 | P0 | 补齐变量替换、通用超时、artifacts、下载落盘、上下文管理 | 运行结果可返回 outputs 与 artifacts |
| 浏览器上下文扩展 | P0 | 支持多标签页与 `startBrowser/closeBrowser` 容器上下文 | 页面流与容器流均可跑通 |
| 步骤接入机制降复杂度 | P1 | 降低前端表单、默认配置、校验器与后端执行器的重复改动 | 新步骤主要通过注册接入 |
| 0.0.4 能力不回归 | P0 | 控制流、subflow、路径高亮、失败定位保持稳定 | 0.0.4 核心回归全部通过 |

## 2. 版本边界（不做）

- 不在本版一次性补齐 AdsPower 全量步骤。
- 不做第三方工具能力，如 Google Sheet、邮件获取、请求监听、第三方打码、OpenAI。
- 不做高级流程复用 `callWorkflow`。
- 不在本版交付数据处理四件套 `textExtract / convertJson / extractKey / randomGet`。
- 不重做 0.0.4 的主流程 + subflow 总体结构，不引入跨层连线。

## 3. 核心方案摘要

### 3.1 前端方案

- 前端继续沿用主流程 + subflow 编辑模型。
- 步骤定义从“多处硬编码”收口为步骤注册结构，统一管理标签、默认配置、分组、校验入口。
- 简单叶子步骤优先走 schema 驱动表单；复杂容器继续保留专用配置面板。

### 3.2 后端方案

- 后端继续沿用 `RunService` 的递归控制流骨架。
- 叶子步骤从单一 `when` 分发升级为按步骤域拆分的 handler 结构。
- 变量替换、超时解析、artifact 记录、元素选择逻辑统一做成公共能力。

### 3.3 协议方案

- 模板结构继续沿用 0.0.4 的 `steps + otherStep + config.then/else/body`。
- 运行事件继续沿用 `stepPath`，并允许新增 `outputs`、`artifacts`、`pageAlias`、`contextId` 等扩展字段。
- 旧模板保持可读可运行。

## 4. 分阶段推进

### Phase A：文档与协议收口（P0）

- 完成 `plan/0.0.5/plan.md`
- 完成 `plan/0.0.5/requirements.md`
- 完成 `plan/0.0.5/steps/{api.md,backend-plan.md,frontend-plan.md}`
- 明确纳入范围、延期项、事件扩展字段与 artifacts 语义

### Phase B：基础设施改造（P0）

- 统一变量模板替换入口
- 统一通用超时解析
- 建立 artifacts 记录与运行目录规范
- 建立浏览器上下文与页面别名管理

### Phase C：后端执行分发改造（P0）

- 拆分叶子步骤 handler
- 补齐页面操作、等待、获取数据、浏览器上下文执行入口
- 扩展 StepTree 校验与错误码

### Phase D：前端步骤接入改造（P0）

- 建立步骤注册结构
- 补齐默认配置、配置表单、校验器与节点目录
- 让运行面板支持 outputs 与 artifacts 摘要

### Phase E：第一批步骤联调（P0）

- 页面操作：`newPage / closePage / switchPage / reloadPage / screenshotPage / hover / focus / selectOption / scrollPage / uploadFiles / executeJs`
- 等待操作：`waitFor` 增强、`waitForResponse`
- 获取数据：`getUrl / downloadFile / importText / totp / getCookies / clearCookies`
- 流程管理：`forEachElement / forEachData / startBrowser / closeBrowser`

### Phase F：测试与收口（P0）

- 后端单元、集成、WS 脚本测试
- 前端 mock 与真实联调 Playwright 测试
- 0.0.4 控制流与作者流回归
- 版本总结、测试报告与结果文档收口

## 5. 主要风险

| 风险 | 影响 | 缓解策略 |
|---|---|---|
| 叶子步骤快速膨胀导致前端配置面板失控 | 前端维护成本升高 | 采用步骤注册表 + schema 驱动表单 |
| 下载、截图、上传能力耦合文件系统 | 联调与运行结果不稳定 | 先定义统一 artifacts 目录与记录结构 |
| 多标签页与多上下文并存导致状态混乱 | 页面流与 `startBrowser` 语义不清 | 明确 pageAlias 与 contextId 的作用域 |
| 新事件字段影响旧前端解析 | 联调失败 | 只新增字段，不替换既有字段 |
| `forEachElement` 与 `forEachData` 作用域处理错误 | 控制流行为异常 | 扩展 StepTree 校验与循环变量测试 |

## 6. 交付物清单

- `plan/0.0.5/plan.md`
- `plan/0.0.5/requirements.md`
- `plan/0.0.5/steps/{api.md,frontend-plan.md,backend-plan.md}`
- `report/0.0.5/{tech.md,test.md,result.md}`
- `test/0.0.5/*`

## 7. 版本完成判定

1. 第一批高频步骤可在前后端创建、保存、加载、运行。
2. `screenshotPage` 与 `downloadFile` 的产物可查。
3. `newPage / switchPage / closePage` 可跑通多标签页页面流。
4. `forEachElement / forEachData / startBrowser / closeBrowser` 可跑通容器子流程。
5. 0.0.4 的控制流、subflow、路径高亮与失败定位不回归。

总结：0.0.5 的重点是把步骤扩展能力从“能加节点”提升到“可持续补齐”，先交付高频能力，再为后续 0.0.6 的剩余步骤铺底。