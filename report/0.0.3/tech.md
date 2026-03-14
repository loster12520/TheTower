# TheTower 0.0.3 技术实现报告（模板交换 + 事件增强）

导语：本文档记录 0.0.3 的实现路径、关键设计点与改动文件范围，便于回溯与复用。

## 1. 技术目标
- 模板导入/导出可用（JSON）。
- WS 失败可定位（`STEP_FAILED`）。
- WS 连接稳定（消费 incoming；心跳可忽略或回包）。

## 2. 关键设计

### 2.1 导入/导出格式
- 复用后端 `WorkflowTemplate` 的 JSON 结构。
- 仅支持 `schemaVersion=0.0.1`。

### 2.2 STEP_FAILED 事件
- 在 step 执行处捕获异常，构造 `payload.error`。
- 失败路径事件顺序保持稳定：`STEP_FAILED` 先于 `RUN_FAILED`。

### 2.3 WS 心跳
- 服务端消费所有 incoming，避免积压。
- 对 `type=PING` 选择性回复 `PONG`。

## 3. 预期改动文件

### 3.1 后端
- `backend/src/main/kotlin/com/thetower/services/RunService.kt`
- `backend/src/main/kotlin/com/thetower/routes/WebSocketRoutes.kt`

### 3.2 前端
- `frontend/src/pages/index.tsx`
- `frontend/src/stores/templateStore.ts`（新增导入/导出方法）

## 4. 风险与控制
- 导入 JSON 校验不足导致脏数据：用最小字段校验 + 后端保存失败兜底。
- WS 心跳回包格式不一致：仅回最小字段或直接忽略。

总结：0.0.3 以“可交换 + 可定位 + 可稳定”为核心，通过小改动提升产品可用性。
