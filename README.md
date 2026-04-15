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

## 5. 文档索引

- `plan/0.1.0/plan.md`：0.1.0 版本目标与范围。
- `plan/0.1.0/requirements.md`：0.1.0 需求与验收口径。
- `plan/0.1.0/steps/*`：0.1.0 实施拆分文档。
- `report/0.1.0/tech.md`：0.1.0 技术实现报告。
- `report/0.1.0/test.md`：0.1.0 测试报告。
- `report/0.1.0/result.md`：0.1.0 版本总结。
- `docs/user-guide.md`：用户使用手册。
- `docs/api-reference.md`：REST / WebSocket / 错误码文档。
- `docs/deployment.md`：部署手册（可选）。

## 6. 后续方向

1. 继续强化协作冲突自动合并与权限细粒度模型。
2. 增强高级调试端到端自动化覆盖。
3. 补齐运维审计与持久化演进能力。

总结：TheTower 当前已具备 0.1.0 首版产品化能力与验证证据，后续重点是稳定性和协作深度增强。
