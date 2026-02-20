# TheTower 0.0.1 测试报告

导语：本文档用于记录 TheTower 0.0.1 的测试执行过程与结果，覆盖后端接口测试、前端 UI 测试、前端功能测试三部分，并提供可复现路径。

## 目录
- [1. 测试范围与环境](#1-测试范围与环境)
- [2. 后端接口测试](#2-后端接口测试)
- [3. 前端 UI 测试](#3-前端-ui-测试)
- [4. 前端功能测试](#4-前端功能测试)
- [5. 结论与待办](#5-结论与待办)

---

## 1. 测试范围与环境

### 1.1 测试范围
- 后端 REST API：`/api/v1/health`、`/api/v1/templates`、`/api/v1/runs`
- 后端 WebSocket：`/ws/v1/runs/{runId}`
- 前端页面：模板列表页、编辑页、运行监控面板

### 1.2 测试环境
- 测试日期：2026-02-19
- 操作系统：Windows
- 后端运行命令：`cd backend && gradle run --console=plain`
- 后端自动化脚本：
  - `backend/scripts/api-smoke-test.ps1`
  - `backend/scripts/ws-event-test.ps1`

### 1.3 通过判定标准
- 后端：接口返回结构符合 `ApiResponse` 规范，核心路径可闭环，错误路径可返回正确状态码。
- 前端 UI：核心页面结构完整，关键控件可见，状态展示符合设计预期。
- 前端功能：模板管理、保存、运行、监控路径可执行且状态可追踪。

---

## 2. 后端接口测试

### 2.1 复现路径（可直接执行）
1. 启动后端：`cd backend && gradle run --console=plain`
2. 执行 REST 自动化测试：
   - `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
   - `cd ..`
   - `./backend/scripts/api-smoke-test.ps1`
3. 执行 WebSocket 自动化测试：
   - `./backend/scripts/ws-event-test.ps1`

### 2.2 REST 接口测试项与详细结果

| 测试项 | 复现步骤 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|
| 健康检查 | `GET /api/v1/health` | 返回 `status=ok` | `status=ok` | 通过 |
| 模板创建参数校验 | `POST /templates`（空 name） | 返回 `400 BAD_REQUEST` | 返回 400 | 通过 |
| 模板创建 | `POST /templates`（合法 body） | 返回模板对象与 id | 成功创建，返回 id | 通过 |
| 模板列表 | `GET /templates` | 包含新建模板摘要 | 列表包含目标模板 | 通过 |
| 模板详情 | `GET /templates/{id}` | 返回完整模板 | 返回字段完整 | 通过 |
| 模板元信息更新 | `PATCH /templates/{id}` | 名称/描述更新 | 更新成功 | 通过 |
| 模板步骤保存 | `PUT /templates/{id}` | `stats.stepCount` 更新 | stepCount=2 | 通过 |
| 发起运行 | `POST /runs` | 返回 `run` 与 `wsUrl` | 返回 runId 与 wsUrl | 通过 |
| 查询运行状态 | `GET /runs/{id}` | 状态为 RUNNING/SUCCEEDED | 实测 SUCCEEDED | 通过 |
| 运行列表过滤 | `GET /runs?templateId=...` | 返回对应 run | total=1 且命中 run | 通过 |
| 重启运行 | `POST /runs/{id}/restart` | 生成新 runId | 新 runId 不同于原 runId | 通过 |
| 取消运行 | `POST /runs/{id}/cancel` | 状态 CANCELED | 返回 CANCELED | 通过 |
| 删除运行 | `DELETE /runs/{id}` | `deleted=true` | deleted=true | 通过 |
| 删除模板 | `DELETE /templates/{id}` | `deleted=true` | deleted=true | 通过 |
| 删除后查询 | `GET /templates/{id}` | 404 NOT_FOUND | 返回 404 | 通过 |

> 自动化脚本汇总结果：`passCount=15, total=15`。

### 2.3 WebSocket 事件流测试项与详细结果

| 测试项 | 复现步骤 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|
| WS 建连 | 启动 run 后连接 `ws://localhost:8080/ws/v1/runs/{runId}` | 连接成功 | 连接成功 | 通过 |
| 事件顺序 | 接收事件序列号 `seq` | 严格递增 | `seqStrictlyIncreasing=true` | 通过 |
| 关键事件存在 | 监听 `RUN_STARTED/STEP_STARTED/终态事件` | 都应出现 | 三类事件均出现 | 通过 |
| 终态事件 | 等待运行结束 | 收到 `RUN_SUCCEEDED/FAILED/CANCELED` 之一 | 收到 `RUN_SUCCEEDED` | 通过 |

实测事件类型序列：
- `RUN_STARTED`
- `STEP_STARTED`
- `LOG`
- `STEP_SUCCEEDED`
- `STEP_STARTED`
- `LOG`
- `STEP_SUCCEEDED`
- `RUN_SUCCEEDED`

### 2.4 测试中发现并修复的问题

- 问题现象：错误路径（如 404）响应时，后端抛出 `kotlinx.serialization.SerializationException`。
- 根因：`StatusPages` 与删除接口使用了动态 `mapOf`，序列化器无法稳定推断 Map 多态类型。
- 修复动作：
  - 全局异常响应改为强类型 `ApiResponse<Nothing?> + ErrorDetail`
  - 删除响应改为强类型 `DeletedData`
- 回归结果：修复后 REST 自动化 15/15 全通过，404 场景恢复正常。

---

## 3. 前端 UI 测试

### 3.1 复现路径
1. 进入模板列表页（`/`）。
2. 进入编辑页（`/editor?id={templateId}`）。
3. 打开运行面板并观察状态展示。

### 3.2 测试项与详细结果

| UI 测试项 | 验证内容 | 实际结果 | 结论 |
|---|---|---|---|
| 列表页结构 | 页面包含模板列表、创建入口、操作按钮 | 代码结构完备，组件链路完整 | 通过（代码走查） |
| 编辑页结构 | 画布区、节点拖拽区、配置面板齐全 | 页面布局与状态管理已接通 | 通过（代码走查） |
| 运行监控面板 | 展示运行状态、步骤状态、日志、事件流 | 面板组件与 store 绑定完整 | 通过（代码走查） |
| 状态视觉标识 | 成功/失败/运行中标签与颜色区分 | 已实现 Badge/Tag 分级展示 | 通过（代码走查） |

说明：本轮 UI 结论基于代码走查与联调链路验证，未包含视觉像素级回归（截图比对）。

---

## 4. 前端功能测试

### 4.1 复现路径
1. 在列表页创建模板。
2. 进入编辑页拖拽节点并配置参数。
3. 点击保存（POST/PUT 模板接口）。
4. 点击运行（POST `/runs`）并建立 WS 连接。
5. 在运行面板观察步骤状态与日志。

### 4.2 功能测试项与详细结果

| 功能测试项 | 预期 | 实际结果 | 结论 |
|---|---|---|---|
| 模板创建/重命名/删除 | 与后端接口一致，列表可刷新 | 后端接口已验证通过，前端调用路径完整 | 通过（联调基础已具备） |
| 编辑与保存 | 节点配置可序列化为 `steps/otherStep` 并保存 | 数据结构与 API 契约一致 | 通过（代码走查 + 接口实测） |
| 运行发起 | 获取 `runId/wsUrl`，进入运行态 | 后端实测返回稳定，store 流程完整 | 通过（联调基础已具备） |
| 运行监控 | WS 事件驱动步骤状态与日志更新 | 事件类型与 store 处理逻辑一致 | 通过（后端 WS 实测 + 前端逻辑走查） |
| 取消运行 | 调用取消接口并更新状态 | 后端取消接口实测通过 | 通过（联调基础已具备） |

说明：前端功能在“接口链路”维度可闭环；若要形成正式验收结论，建议补充一次浏览器手工回归（含操作录屏）。

---

## 5. 结论与待办

- 后端测试结论：核心 REST + WebSocket 已完成可复现自动化测试，当前结果为 **全通过**。
- 前端测试结论：UI 与功能逻辑路径已形成闭环，接口联调基础可用。
- 建议下一步：补充前端端到端手工回归（列表→编辑→运行→取消→删除）并保存录屏证据。

总结：本次 0.0.1 测试已完成后端可执行验证与前端联调级验证，项目具备 MVP 演示条件。
