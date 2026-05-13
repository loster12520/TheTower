# TheTower 开发流程规范（先文档后开发）

导语：本文档定义 TheTower 版本开发的固定顺序、变更边界、质量门禁与验收口径，要求所有迭代严格执行“先文档，后实现，再测试，最后总结”。

## 1. 适用范围
- 适用于 `plan/*`、`report/*`、`test/*` 及前后端实现改造。
- 适用于功能开发、基建升级、重构治理三类任务。

## 2. 强制流程顺序

1. 版本目标文档：`plan/${version-code}/plan.md`
2. 需求文档：`plan/${version-code}/requirements.md`
3. 拆分实施文档：`plan/${version-code}/steps/{api.md,backend-plan.md,frontend-plan.md}`
4. 技术实现报告：`report/${version-code}/tech.md`
5. 测试文档模板：`report/${version-code}/test.md`（先给完整表格，不预填结果）
6. 后端开发
7. 后端接口自动化测试：`test/${version-code}/backend-test.py`
8. 前端开发
9. 前端测试
10. 黑盒功能测试（按测试计划执行）
11. 缺陷修复
12. 版本总结：`report/${version-code}/result.md`

### 2.1 执行规则
- 任何实现代码提交前，前置文档必须存在并可评审。
- 跳步开发必须先记录“原因 + 风险 + 回补时间”，并得到确认。

## 3. 变更边界控制（强制）

### 3.1 前置产物保护
- 若需改动已确认的前置产物（如 `plan.md`、`requirements.md`、`steps/*.md`），必须先与用户确认再修改。
- 未确认情况下只能新增补充文档，不能直接覆写既有约定。

### 3.2 变更说明最小要求
- 变更原因
- 影响范围
- 回滚方案
- 是否影响当前版本验收口径

## 4. 代码规范执行要求

### 4.1 注释分级
- 白名单（高密度注释）：
  - `frontend/src/pages/**`
  - `frontend/src/stores/**`
  - `frontend/src/services/**`
  - `backend/src/main/kotlin/com/thetower/routes/**`
  - `backend/src/main/kotlin/com/thetower/services/**`
  - `backend/src/main/kotlin/com/thetower/repository/**`
- 灰名单（简化注释）：
  - `frontend/src/models/**`
  - `frontend/src/utils/**`
  - `backend/src/main/kotlin/com/thetower/models/**`
  - `backend/src/main/kotlin/com/thetower/utils/**`
- 黑名单（禁止注释膨胀）：构建产物、第三方依赖、自动生成文件。

### 4.2 命名词典
- 函数动词：`get/create/update/delete/start/cancel/restart/validate/parse/emit`
- 状态名词：`template/run/status/event/payload/response/context/repository/cache/errorCode`
- routes 与 services 命名语义必须一致。

### 4.3 复杂度与长度阈值
- 圈复杂度：`<= 10`
- 单函数长度：建议 `<= 60` 行
- 单文件长度：`<= 400` 行
- 超限必须拆分，或附豁免说明并记录处理计划。

## 5. 重构安全网（必须通过）

1. 编译通过（frontend/backend）
2. 静态检查通过（lint + 复杂度 + 文件长度）
3. 核心测试通过（后端自动化 + 前端关键链路）
4. 回归清单通过（模板创建、保存、运行、取消、删除）
5. 变更说明完整（重命名映射、迁移影响、回滚方案）

## 6. 验收检查单

| 检查项 | 验收目标 |
|---|---|
| 流程资产完整性 | `plan/report/test` 结构完整 |
| 注释白名单合规率 | >= 95% |
| 命名一致率 | >= 95% |
| 复杂度与长度门禁 | 可自动化检查且无未说明超限 |
| 回归通过率 | 核心主链路全部通过 |

## 7. 提交信息规范（强制）

### 7.1 格式
- Git 提交信息必须统一为：`版本号: 目前阶段`。
- 版本号与阶段之间使用英文冒号与空格 `: ` 连接，不增加其他前后缀。

### 7.2 示例
- `0.0.2: 后端收口`
- `0.0.2: 前端联调`
- `0.0.2: 黑盒回归`

### 7.3 执行要求
- 同一阶段内可多次提交，但格式必须保持一致。
- 阶段切换时必须更新“目前阶段”字段，禁止沿用上一阶段文案。

总结：本规范把 TheTower 的版本开发流程从“经验驱动”升级为“可检查、可复用、可回滚”的工程流程。
