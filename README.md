# TheTower

导语：TheTower 是一个基于 Playwright 的浏览器 RPA 画布工作流系统，当前已完成 0.1.0 能力补齐与文档收口。

## 1. 当前状态

- 当前收口版本：0.1.0。
- 当前默认模板版本：0.0.8。
- 当前导入兼容版本：0.0.1、0.0.4、0.0.5、0.0.6、0.0.7、0.0.8。
- 当前版本主线：体验增强、高级调试、数据文件与网络监听、产品化首版能力。

**本轮验证结果**

| 项目 | 结果 |
|---|---|
| 后端 `gradle test` | 通过 |
| 前端 `npm run build` | 通过 |
| 后端核心服务测试 | 通过 |
| 前端 mock / real 回归 | 通过 |
| 文档口径一致性检查 | 通过 |

## 2. 核心能力

### 2.1 编排与执行

- 可视化流程编排：拖拽、连线、复制粘贴、撤销重做、缩放与小地图。
- 模板管理：创建、编辑、保存、删除、导入导出、搜索、标签分组、克隆、批量删除。
- 执行引擎：后端解析步骤树并通过 Playwright 执行浏览器自动化。

### 2.2 调试与数据能力

- 调试能力：条件断点、时间旅行、预览远程操控、变量与事件流查看。
- 数据文件能力：`saveData`、`saveExcel`、`importExcel`、`getClipboardText`、`extractActiveElement`。
- 网络监听能力：`listenRequestTrigger`、`listenRequestResult`、`stopPageListen`。

### 2.3 产品化首版

- 模板市场：模板发布与导入。
- 调度任务：创建、更新、删除与自动触发。
- 认证与工作空间：登录、登出、用户信息、工作空间切换。
- 协作编辑：模板分享、在线状态、冲突提示、差异详情与选择性采纳。

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
- Playwright Java
- SQLite
- Kotlin Coroutines

## 4. 快速开始

### 4.1 启动前端

```powershell
cd frontend
npm install
npm run dev
```

### 4.2 启动后端

```powershell
cd backend
$env:PORT=8080
.\gradlew.bat run
```

### 4.3 健康检查

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
```

## 5. 文档结构

### 5.1 根目录文档

| 路径 | 作用 |
|---|---|
| `README.md` | 项目总览、启动方式与完整文档导航 |
| `AGENTS.md` | 面向 AI 编程助手的项目背景、结构与协作规则 |
| `众资料.md` | 毕业设计过程材料与阶段性记录 |
| `6.计算机科学与技术学院（软件学院、网络空间安全学院）毕业论文参考模板 (1).md` | 学院论文模板原文 |

### 5.2 使用与部署文档

| 路径 | 作用 |
|---|---|
| `docs/user-guide.md` | 面向最终用户的操作手册 |
| `docs/api-reference.md` | 0.1.0 REST 与 WebSocket 接口文档 |
| `docs/deployment.md` | 本地启动、联调与可选服务器部署说明 |
| `docs/deploy/linux/` | Linux 部署配套资产目录 |
| `backend/README.md` | 后端模块说明、接口与配置补充文档 |

### 5.3 当前版本必读（0.1.0）

| 路径 | 作用 |
|---|---|
| `report/0.1.0/result.md` | 0.1.0 版本结论与发布口径 |
| `report/0.1.0/tech.md` | 0.1.0 技术实现说明 |
| `report/0.1.0/test.md` | 0.1.0 测试验证结论 |
| `plan/0.1.0/plan.md` | 0.1.0 目标与范围 |
| `plan/0.1.0/requirements.md` | 0.1.0 需求与验收口径 |
| `plan/0.1.0/steps/api.md` | 0.1.0 API 拆分 |
| `plan/0.1.0/steps/backend-plan.md` | 0.1.0 后端实施拆分 |
| `plan/0.1.0/steps/frontend-plan.md` | 0.1.0 前端实施拆分 |
| `report/implemented-feature-summary.md` | 已实现能力总表 |
| `report/unimplemented-features.md` | 后续版本缺口清单 |

### 5.4 历史版本回溯

| 路径 | 作用 |
|---|---|
| `plan/0.0.1/` | 初始 MVP 规划文档，结构为 `api.md`、`backend-plan.md`、`frontend-plan.md`、`requirements.md` |
| `plan/0.0.2/` - `plan/0.1.0/` | 各版本规划目录，通常包含 `plan.md`、`requirements.md` 与 `steps/` |
| `report/0.0.1/` - `report/0.1.0/` | 各版本技术、测试与总结报告目录 |
| `report/0.0.9/deployment-validation.md` | 0.0.9 云部署验收模板留档 |

### 5.5 测试与反馈文档

| 路径 | 作用 |
|---|---|
| `test/0.0.2/` - `test/0.0.9/` | 各版本测试脚本与测试说明目录 |
| `test/0.0.3/README.md`、`test/0.0.6/README.md`、`test/0.0.9/README.md` | 分版本测试资产说明 |
| `feedback/0.0.7.md` | 0.0.7 阶段反馈记录 |
| `feedback/assets/` | 反馈配图与素材 |

### 5.6 内部规范与技能文档

| 路径 | 作用 |
|---|---|
| `.github/skills/lignting-document/skills/base-documents.md` | 项目文档编写规范 |
| `.github/skills/thetower-dev-governance/skills/development-process.md` | 版本开发流程与质量门禁规范 |
| `.github/skills/thetower-dev-governance/skills/file-responsibility-map.md` | 前后端目录职责与命名约束 |

### 5.7 快速查阅建议

1. 想快速进入当前版本，优先看“5.3 当前版本必读（0.1.0）”中的 10 份文档。
2. 想做联调或部署，先读 `docs/api-reference.md`、`docs/user-guide.md`、`docs/deployment.md`。
3. 想回看版本演进，按“5.4 历史版本回溯”中的 `plan/版本号` 与 `report/版本号` 成对查阅。
4. 想看代码侧接口细节，补充查阅 `backend/README.md`。

## 6. 后续方向

1. 继续强化协作冲突自动合并与权限细粒度模型。
2. 增强高级调试端到端自动化覆盖。
3. 补齐运维审计与持久化演进能力。

总结：TheTower 当前已具备 0.1.0 首版产品化能力与验证证据，后续重点是稳定性和协作深度增强。
