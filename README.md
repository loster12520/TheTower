# TheTower

> 导语：TheTower 是一个基于 Playwright 的浏览器 RPA 画布工作流系统，当前已完成 0.0.9 的工程化补完、本地指标验收与交付文档收口，剩余 P0 主线为云部署实机验证。

## 1. 当前状态

- 当前稳定实现口径：0.0.9。
- 当前默认模板版本：0.0.8。
- 当前导入兼容版本：0.0.1、0.0.4、0.0.5、0.0.6、0.0.7、0.0.8。
- 当前剩余 P0：云部署实机验证。
- 当前后续方向：P1 体验增强、高级调试增强与外部集成扩展。

**0.0.9 当前验证结果**

| 项目 | 结果 |
|---|---|
| 前端 mock Playwright | 28/28 通过 |
| 前端真实联调 Playwright | 17/17 通过 |
| 后端 `gradle test` | 通过 |
| 后端 API / WS / 并发 / 成功率脚本 | 通过 |
| 三浏览器兼容矩阵 | `chromium / firefox / edge` 全部通过 |
| 50 节点性能测量 | 渲染 1184ms、选中 127ms、拖拽 276ms |

## 2. 核心能力

### 2.1 已完成能力

- 可视化流程编排：节点拖拽、连线、复制粘贴、撤销重做、缩放与小地图。
- 模板管理：创建、编辑、保存、重命名、删除、导入、导出。
- 执行引擎：后端解析步骤树并通过 Playwright 执行浏览器自动化。
- 调试工作台：断点、继续、单步、浏览器预览、变量检查、事件流与日志。
- 失败定位：运行面板可定位失败节点，容器节点支持聚合态展示。
- 多层流程：`if`、`forTimes`、`while`、`forEachElement`、`forEachData`、`callWorkflow` 等流程节点已接入前后端。
- 元素引用增强：选择器类步骤支持 `elementRefVar + elementOrder`。

### 2.2 当前节点清单

当前前端注册表共 39 个节点，按分组如下。

| 分组 | 数量 | 节点 |
|---|---:|---|
| 页面操作 | 17 | `openUrl`、`click`、`type`、`keyboardPress`、`keyboardHotkey`、`goBack`、`closeOtherPages`、`newPage`、`closePage`、`switchPage`、`reloadPage`、`screenshotPage`、`hover`、`focus`、`selectOption`、`scrollPage`、`uploadFiles` |
| 等待 | 2 | `waitFor`、`waitForResponse` |
| 数据处理 | 12 | `extract`、`textExtract`、`executeJs`、`getUrl`、`downloadFile`、`importText`、`totp`、`getCookies`、`clearCookies`、`convertJson`、`extractKey`、`randomGet` |
| 流程控制 | 8 | `if`、`forTimes`、`while`、`break`、`forEachElement`、`forEachData`、`startBrowser`、`callWorkflow` |

## 3. 技术栈

### 3.1 前端

- React 18
- Umi 4
- TypeScript
- MobX
- Ant Design
- React Flow
- Playwright

### 3.2 后端

- Kotlin 2.2.20
- Ktor 2.3.12
- Playwright Java 1.49.0
- SQLite
- Jimmer
- Kotlin Coroutines

### 3.3 通信与存储

- REST API：`/api/v1`
- WebSocket：`/ws/v1/runs/{runId}`
- SQLite 文件：`backend/data/thetower.db`
- 运行产物目录：`data/runs/`

## 4. 架构概览

```text
Frontend (React + Umi + React Flow)
  -> 画布编辑、配置表单、运行监控、调试工作台
  -> REST 调用模板与运行接口
  -> WebSocket 订阅运行事件与调试事件

Backend (Kotlin + Ktor + Playwright)
  -> TemplateService 处理模板 CRUD 与保存
  -> RunService 处理运行、取消、重启、调试控制
  -> Executor 递归执行步骤树并维护变量、页面、产物上下文
  -> EventBus 向前端推送运行状态、日志、调试帧与错误
```

## 5. 仓库结构

```text
TheTower/
├── backend/                      后端工程与脚本
├── frontend/                     前端工程与 Playwright 用例
├── plan/                         版本计划与需求文档
├── report/                       测试、实现总结与版本报告
├── test/                         后端黑盒测试脚本
├── feedback/                     版本反馈材料
├── data/                         运行产物与本地数据
└── AGENTS.md                     项目协作说明
```

## 6. 快速开始

### 6.1 启动前端

```powershell
cd frontend
npm install
npm run dev
```

### 6.2 启动后端

```powershell
cd backend
$env:PORT=8080
.\gradlew.bat run
```

> 补充说明：后端入口已改为读取 Ktor 配置，`PORT` 环境变量现在会真正覆盖默认端口。

### 6.3 健康检查

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
```

## 7. 文档索引

- `plan/0.0.9/plan.md`：0.0.9 开发方向。
- `plan/0.0.9/requirements.md`：0.0.9 详细需求。
- `report/0.0.9/test.md`：0.0.9 专项测试与验收结果。
- `report/0.0.9/tech.md`：0.0.9 技术实现报告。
- `report/0.0.9/result.md`：0.0.9 版本总结。
- `report/0.0.9/deployment-validation.md`：云部署实机验收记录模板。
- `report/implemented-feature-summary.md`：当前已实现能力总表。
- `report/unimplemented-features.md`：当前剩余待补项总表。
- `backend/README.md`：后端启动、接口与配置说明。
- `docs/user-guide.md`：用户使用手册。
- `docs/api-reference.md`：REST / WebSocket / 错误码文档。
- `docs/deployment.md`：本地与云机部署手册。

## 8. 当前缺口

0.0.9 的本地工程化闭环已经完成，当前真正剩余的是把现有部署手册转成真实云环境验收记录。

- 真实云服务器部署一次完整前后端并完成验收记录。
- 自动保存、模板搜索、模板克隆、自动布局等 P1 体验增强。
- 条件断点、时间旅行调试、预览远程操控等高级调试能力。
- 外部平台集成、计划任务、模板市场、多用户等产品化能力。

总结：TheTower 当前不是规划原型，而是已完成前后端闭环、调试闭环、专项验证与交付文档收口的可运行系统，0.0.9 的最后一步是把部署说明落实成真实云环境验收证据。