# 0.0.2 后端实施文档（规范化与基建升级）

导语：本文档用于指导 TheTower 后端在 0.0.2 完成“规范落地 + 基建升级 + 质量门禁”的分阶段实施，保障核心链路在重构中保持稳定。

## 目录
- [1. 实施目标与不变边界](#1-实施目标与不变边界)
- [2. 模块职责地图（后端）](#2-模块职责地图后端)
- [3. 分阶段实施清单](#3-分阶段实施清单)
- [4. 代码规范与质量门禁落地](#4-代码规范与质量门禁落地)
- [5. 重构安全网与回归清单](#5-重构安全网与回归清单)
- [6. 改动文件范围（预估）](#6-改动文件范围预估)
- [7. 风险与回滚策略](#7-风险与回滚策略)

---

## 1. 实施目标与不变边界

### 1.1 0.0.2 后端目标
1. 建立统一响应体、错误码与日志链路（requestId）。
2. routes/services 语义化命名一一对应。
3. 引入高频接口缓存（TTL + 主动失效）。
4. 数据层从内存实现迁移到 SQLite + Jimmer。
5. 建立数据库迁移机制并可执行升级。

### 1.2 不变边界
- 不扩展新业务节点类型。
- 不改变前端已依赖的核心 API 路径与业务语义。
- 不在本版引入多租户与权限体系。

---

## 2. 模块职责地图（后端）

| 目录 | 职责 | 约束 |
|---|---|---|
| `routes/` | HTTP/WS 协议层、参数接入、响应输出 | 禁止写核心业务逻辑 |
| `services/` | 业务编排、状态机、事务边界 | 命名与 routes 同语义 |
| `repository/` | 数据访问抽象与实现 | 不处理协议细节 |
| `models/` | 领域模型与 DTO | 字段语义必须文档化 |
| `config/` | 配置加载与开关管理 | 不出现业务分支 |
| `utils/` | 通用工具（ID、时间、响应封装） | 避免耦合业务状态 |

---

## 3. 分阶段实施清单

### Phase A：规范基线与命名对齐（优先级 P0）

#### A.1 注释体系升级（白名单目录）
- 范围：
  - `backend/src/main/kotlin/com/thetower/routes/**`
  - `backend/src/main/kotlin/com/thetower/services/**`
  - `backend/src/main/kotlin/com/thetower/repository/**`
- 要求：
  - 文件头职责说明；
  - 对外方法 KDoc；
  - 复杂分支/副作用代码块注释。

#### A.2 命名语义化重构
- routes 与 services 保持同语义命名：`getTemplates/createTemplate/restartRun`。
- 禁止模糊命名：`handle/do/process` 仅允许在抽象层内部使用。
- 重命名需附“旧名 -> 新名”映射记录（写入 `report/0.0.2/tech.md`）。

### Phase B：统一响应与错误码中心（优先级 P0）

#### B.1 统一返回封装
- 新增统一响应模型：`requestId + data + error`。
- 实现便捷函数：`success(...)`、`fail(...)`。
- 禁止路由层直接拼装自由 JSON。

#### B.2 错误码中心
- 建立错误码常量与映射中心（建议 `utils/errors` 或同级目录）。
- 约束：新增错误码先登记后使用。
- 在异常处理中统一转换为标准错误结构。

#### B.3 全局异常处理
- 通过 Ktor `StatusPages` 统一兜底。
- 未分类异常映射 `TT-0500-001`。
- 错误日志记录：`requestId + errorCode + path + message`。

### Phase C：日志分级与链路追踪（优先级 P1）

#### C.1 日志分级规范
- 统一使用 `debug/info/warn/error`。
- 开启请求级入口日志与异常日志。

#### C.2 requestId 透传
- 优先读取 `X-Request-Id`，无则生成。
- 写入响应体与日志 MDC。
- WS 关键事件至少带 `runId`，必要时附 `requestId`。

### Phase D：缓存策略（优先级 P1）

#### D.1 高读接口缓存
- 建议先覆盖：`getTemplates`、`getTemplateById`、`getRuns`。
- 每个缓存项配置 TTL。

#### D.2 主动失效
- 模板写操作触发模板缓存失效。
- 运行状态变化触发运行缓存失效。
- 命中/失效记录日志，便于观察效果。

### Phase E：SQLite + Jimmer 持久化（优先级 P0）

#### E.1 Repository 抽象与实现分层
- 保留接口层，新增 Jimmer 实现层。
- 逐步替换当前内存实现，避免一次性替换导致联调中断。

#### E.2 数据模型落库
- 核心实体：`Template`、`Run`、必要关联表。
- 字段语义与 API 对齐，不允许隐式字段含义变化。

#### E.3 兼容策略
- 迁移期间保留最小回退能力（可切回内存实现用于应急演示）。
- 对外 API 字段不变，前端无需改协议。

### Phase F：数据库迁移机制（优先级 P1）

#### F.1 版本化迁移
- 采用迁移脚本管理 schema 版本（如 `V1__init.sql`、`V2__xxx.sql`）。
- 支持空库初始化与从旧版本升级。

#### F.2 启动校验
- 应用启动时校验数据库版本与应用预期版本。
- 迁移失败统一报错并中断启动（避免半可用状态）。

---

## 4. 代码规范与质量门禁落地

### 4.1 复杂度与长度阈值
- 函数圈复杂度：`<= 10`
- 单函数长度：建议 `<= 60`
- 单文件长度：`<= 400`

### 4.2 自动化检查接入
- 在后端 lint/静态检查中接入复杂度与文件长度规则。
- CI 必须执行并阻断超阈值提交（或附豁免说明）。

### 4.3 命名词典执行
- 动词：`get/create/update/delete/start/cancel/restart/validate/parse/emit`
- 名词：`template/run/status/event/payload/response/context/repository`
- 术语统一写入评审清单，代码评审按清单逐项核对。

---

## 5. 重构安全网与回归清单

### 5.1 必过门禁
1. `backend` 编译通过。
2. 静态检查通过（lint/复杂度/文件长度）。
3. 接口自动化测试通过（后续脚本：`test/0.0.2/backend-test.py`）。
4. 核心链路回归通过：模板创建、保存、运行、取消、删除。

### 5.2 回归顺序建议
1. 先回归模板 CRUD。
2. 再回归运行启动/取消/重启。
3. 最后回归 WS 事件流与错误码映射。

---

## 6. 改动文件范围（预估）

> 说明：以下为实施阶段预估路径，最终以实际提交为准。

- `backend/src/main/kotlin/com/thetower/routes/**`
- `backend/src/main/kotlin/com/thetower/services/**`
- `backend/src/main/kotlin/com/thetower/repository/**`
- `backend/src/main/kotlin/com/thetower/models/**`
- `backend/src/main/kotlin/com/thetower/config/**`
- `backend/src/main/kotlin/com/thetower/utils/**`
- `backend/build.gradle.kts`
- `backend/src/main/resources/application.conf`
- `backend/src/main/resources/logback.xml`

---

## 7. 风险与回滚策略

### 7.1 主要风险
- 命名重构可能导致调用链断裂。
- 持久化切换可能引发语义不一致。
- 缓存引入后可能出现脏读。

### 7.2 回滚策略
- 分阶段合并：每阶段都保持可编译、可测试、可回滚。
- 持久化切换提供临时开关，异常时回退到内存实现。
- 关键接口保留对照测试，确保返回结构稳定。

总结：后端 0.0.2 以“语义统一、稳定可观测、数据可持久化”为主轴，按阶段推进可降低重构风险并确保交付质量。
