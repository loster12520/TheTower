# TheTower 已实现功能汇总

## 项目概述

TheTower 是一个浏览器 RPA（机器人流程自动化）工作流编排与执行系统，采用前后端分离架构，支持可视化工作流设计、实时调试与执行监控。

- **前端**：React + TypeScript + Umi + MobX + Ant Design + React Flow
- **后端**：Kotlin + Ktor + Playwright + SQLite + Jimmer
- **通信**：REST API + WebSocket 实时事件流

---

## 1. 模板管理功能

### 1.1 模板 CRUD
- 创建模板（名称、描述）
- 查询模板列表（支持包含上次运行状态）
- 获取单个模板详情
- 更新模板元数据（重命名、修改描述）
- 删除模板
- 模板导入/导出（JSON 格式，支持 0.0.1 ~ 0.0.7 版本兼容）

### 1.2 模板版本管理
- Schema 版本控制（当前默认 0.0.7）
- 多版本模板并行兼容
- 自动版本迁移支持

---

## 2. 工作流编排功能

### 2.1 画布编辑器
- 可视化节点拖拽编排
- 节点自动连线（拖拽靠近时自动连接）
- 节点复制/剪切/粘贴（支持快捷键 Ctrl+C/X/V）
- 撤销/重做（支持快捷键 Ctrl+Z/Y）
- 画布平移、缩放、MiniMap 导航

### 2.2 节点类型（共 38 种）

#### 页面操作节点（13 种）
| 节点 | 功能 |
|------|------|
| openUrl | 打开网页 URL |
| click | 点击元素（支持单击/双击、左/中/右键） |
| type | 输入文本（支持固定文本/变量/随机/顺序/随机数字） |
| newPage | 新建标签页 |
| closePage | 关闭标签页 |
| switchPage | 切换标签页（按别名/标题/URL 匹配） |
| reloadPage | 刷新页面 |
| screenshotPage | 页面截图（PNG/JPEG，支持整页） |
| hover | 悬停元素 |
| focus | 聚焦元素 |
| selectOption | 选择下拉选项 |
| scrollPage | 滚动页面（位置/像素模式） |
| uploadFiles | 上传文件（本地文件/URL 下载） |

#### 等待节点（2 种）
| 节点 | 功能 |
|------|------|
| waitFor | 等待元素出现或固定时间 |
| waitForResponse | 等待网络响应 |

#### 数据操作节点（11 种）
| 节点 | 功能 |
|------|------|
| extract | 提取元素数据（文本/属性/HTML/源码等） |
| executeJs | 执行 JavaScript |
| getUrl | 获取当前 URL |
| downloadFile | 下载文件 |
| importText | 导入文本文件 |
| totp | 生成 TOTP 验证码 |
| getCookies | 获取 Cookies |
| clearCookies | 清空 Cookies |
| convertJson | JSON 转换（字符串/对象互转） |
| extractKey | 提取对象键值 |
| randomGet | 随机取数组元素 |

#### 流程控制节点（10 种）
| 节点 | 功能 |
|------|------|
| if | 条件分支（THEN/ELSE 子流程） |
| forTimes | For 循环（指定次数） |
| while | While 循环（条件判断，支持最大迭代限制） |
| break | 退出循环（仅允许在循环 BODY 内使用） |
| forEachElement | 遍历元素集合 |
| forEachData | 遍历数据变量 |
| startBrowser | 浏览器上下文（独立上下文隔离） |
| closeBrowser | 关闭浏览器上下文 |
| callWorkflow | 调用子流程/其他模板 |
| importText | 导入文本作为变量 |

### 2.3 容器节点与子流程
- 容器节点支持嵌套子流程（THEN/ELSE/BODY 分支）
- 子流程可视化编辑（独立画布工作台）
- 子流程缩略预览（显示前 3 个步骤标签）
- 分支状态聚合显示（执行中/成功/失败）
- 支持多层嵌套（主流程 → 容器 → 子容器）

### 2.4 节点配置
- 属性面板表单配置
- 支持断点设置（调试时暂停）
- 变量引用语法 `${variableName}`
- 字段校验与错误提示

---

## 3. 运行执行功能

### 3.1 运行生命周期
- 启动运行（普通模式/调试模式）
- 运行取消
- 运行重启
- 运行删除
- 运行列表查询（支持按模板、状态、时间范围筛选）

### 3.2 执行器能力
- Playwright 浏览器自动化
- 步骤递归执行（支持嵌套子流程）
- 变量上下文传递
- 页面上下文管理（多标签页）
- 浏览器上下文隔离

### 3.3 执行校验
- 步骤树结构校验
- THEN/BODY 必填校验
- break 节点位置校验（仅允许在循环体内）
- while 最大迭代次数校验
- 运行前画布完整性校验

---

## 4. 实时调试功能

### 4.1 调试模式
- 普通运行（无调试）
- 调试运行（带实时预览）
- 启动即暂停（在首个步骤前暂停）

### 4.2 调试控制能力
- 继续执行
- 单步执行
- 断点命中暂停
- 打开宿主机浏览器调试窗口
- 关闭调试预览

### 4.3 调试预览
- 近实时浏览器画面预览（Base64 图片流）
- FPS 和质量可配置
- 全屏预览模式
- 页面尺寸显示

### 4.4 调试上下文
- 当前步骤路径显示
- 页面别名和上下文 ID
- 变量检查器（变量名值对）
- 更新时间戳

---

## 5. 运行监控功能

### 5.1 WebSocket 事件流
- RUN_STARTED - 运行开始
- STEP_STARTED - 步骤开始
- STEP_SUCCEEDED - 步骤成功
- STEP_FAILED - 步骤失败
- LOG - 日志输出
- RUN_SUCCEEDED - 运行成功
- RUN_FAILED - 运行失败
- RUN_CANCELED - 运行取消
- DEBUG_SESSION_STARTED - 调试会话启动
- DEBUG_FRAME - 调试画面帧
- DEBUG_STATUS_CHANGED - 调试状态变更
- DEBUG_BREAKPOINT_HIT - 命中断点
- DEBUG_CONTEXT_UPDATED - 调试上下文更新
- DEBUG_RESUMED - 调试继续
- DEBUG_STEPPED - 调试单步
- DEBUG_SESSION_CLOSED - 调试会话关闭
- DEBUG_ERROR - 调试错误

### 5.2 运行面板
- 运行状态实时监控
- 当前步骤路径显示
- 步骤执行状态列表（待执行/执行中/成功/失败）
- 运行日志（带时间戳和级别）
- 变量输出摘要
- 产物文件列表
- 事件流时间线
- 失败节点一键定位

### 5.3 节点状态可视化
- 节点执行状态边框高亮
- 容器节点嵌套状态聚合
- 当前执行路径高亮
- 断点标记显示
- 暂停状态指示器

---

## 6. 数据持久化

### 6.1 存储
- SQLite 数据库存储
- Jimmer ORM 框架
- 模板数据持久化
- 运行记录持久化
- 运行输出和产物存储

### 6.2 数据库迁移
- Flyway 迁移脚本
- V1 - 初始表结构
- V2 - 索引优化
- V3 - 运行表确保
- V4 - 输出和产物字段

---

## 7. API 接口

### 7.1 模板接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/templates | 模板列表 |
| POST | /api/v1/templates | 创建模板 |
| GET | /api/v1/templates/{id} | 模板详情 |
| PATCH | /api/v1/templates/{id} | 更新元数据 |
| PUT | /api/v1/templates/{id} | 保存步骤 |
| DELETE | /api/v1/templates/{id} | 删除模板 |

### 7.2 运行接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/runs | 启动运行 |
| GET | /api/v1/runs | 运行列表 |
| GET | /api/v1/runs/{id} | 运行详情 |
| POST | /api/v1/runs/{id}/cancel | 取消运行 |
| POST | /api/v1/runs/{id}/restart | 重启运行 |
| DELETE | /api/v1/runs/{id} | 删除运行 |

### 7.3 调试接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/runs/{id}/debug/open-browser | 打开调试浏览器 |
| GET | /api/v1/runs/{id}/debug/context | 获取调试上下文 |
| POST | /api/v1/runs/{id}/debug/continue | 继续调试 |
| POST | /api/v1/runs/{id}/debug/step | 单步调试 |
| POST | /api/v1/runs/{id}/debug/close | 关闭调试 |

### 7.4 WebSocket
| 路径 | 说明 |
|------|------|
| /ws/v1/runs/{runId} | 运行事件流 |

---

## 8. 前端基础设施

### 8.1 状态管理
- MobX 响应式状态管理
- editorStore - 编辑器状态
- runStore - 运行状态
- templateStore - 模板列表状态
- uiStore - UI 状态
- healthStore - 健康检查

### 8.2 网络通信
- Axios HTTP 客户端
- WebSocket 工厂（支持自动重连）
- 统一 API 层封装

### 8.3 编辑器基础设施
- React Flow 画布引擎
- 节点类型注册系统
- 步骤注册表（NODE_DEFINITIONS）
- 画布转换器（steps ↔ nodes/edges）
- 验证器

### 8.4 用户体验
- 快捷键支持（Ctrl+S 保存、Ctrl+C/X/V 复制粘贴、Ctrl+Z/Y 撤销重做）
- 页面关闭前未保存提示
- 加载状态指示
- 错误提示与处理

---

## 9. 测试覆盖

### 9.1 后端测试
- TemplateServiceTest - 模板服务单元测试
- StepTreeSupportTest - 步骤树支持测试
- DebugExecutionGateTest - 调试执行门控测试
- RunRepositoryTest - 运行仓库测试

### 9.2 前端测试
- smoke.spec.ts - 冒烟测试
- import-export.spec.ts - 导入导出测试
- regression.spec.ts - 回归测试
- real-backend.spec.ts - 真实后端联调测试

### 9.3 测试脚本
- api-smoke-test.ps1 - API 冒烟测试
- ws-event-test.ps1 - WebSocket 事件测试

---

## 10. 版本演进

| 版本 | 主要功能 |
|------|----------|
| 0.0.1 | 基础节点、线性流程、模板 CRUD |
| 0.0.2 | 运行执行、Playwright 执行器 |
| 0.0.3 | WebSocket 实时事件流 |
| 0.0.4 | 控制流节点（if/forTimes/while/break）、子流程 |
| 0.0.5 | 调试模式、实时预览、断点 |
| 0.0.6 | 调试控制（继续/单步）、变量检查器 |
| 0.0.7 | 浏览器上下文、子流程调用、数据操作节点增强 |

---

## 11. 当前状态总结

TheTower 已形成完整的"编排-执行-观测-调试"闭环：

1. **可视化编排**：38 种节点、容器嵌套、子流程编辑
2. **灵活执行**：普通运行、调试运行、条件分支、循环控制
3. **实时监控**：WebSocket 事件流、步骤状态、运行日志
4. **深度调试**：实时画面预览、断点暂停、单步执行、变量检查
5. **工程完备**：前后端测试覆盖、多版本兼容、数据持久化
