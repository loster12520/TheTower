# 0.0.1 前端开发规划文档

导语：本文档为 TheTower 前端开发提供 0.0.1 版本的架构设计与任务拆解，涵盖技术选型、目录结构及详细开发清单，便于团队成员按图索骥、分阶段推进。

---

## 1. 架构设计

### 1.1 技术栈选型

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 框架 | React | v18+ | UI 渲染与状态管理 |
| 脚手架 | Umi | v4 | 路由、构建、插件生态 |
| 类型系统 | TypeScript | 严格模式 | 类型安全与 IDE 提示 |
| UI 组件 | Ant Design | v5 | 表单、按钮、消息提示等 |
| 画布引擎 | ReactFlow | 最新稳定版 | 节点拖拽、连线、画布交互 |
| 状态管理 | MobX | 6.x | 全局状态（画布、运行状态） |
| 网络请求 | Axios + umi-request | - | REST API 调用 |
| WebSocket | 原生 WebSocket API | - | 实时事件流接收 |
| 代码规范 | ESLint + Prettier | - | 代码风格统一 |

### 1.2 目录结构

```
frontend/
├── src/
│   ├── layouts/              # 页面布局
│   │   └── index.tsx         # 全局布局组件
│   ├── components/           # 通用组件
│   │   ├── NodeConfigPanel/  # 节点配置面板
│   │   └── LogPanel/         # 运行日志面板
│   ├── pages/                # 路由页面
│   │   ├── index.tsx         # 模板列表页
│   │   └── editor/
│   │       ├── index.tsx     # 画布编辑页
│   │       └── components/   # 编辑页特有组件
│   ├── models/               # 数据模型与类型定义
│   │   ├── template.ts       # 模板相关类型
│   │   ├── run.ts            # 运行相关类型
│   │   └── node.ts           # 节点类型定义
│   ├── services/             # API 服务层
│   │   ├── api.ts            # 通用请求封装
│   │   ├── template.ts       # 模板 API
│   │   └── run.ts            # 运行 API
│   ├── stores/               # 状态管理
│   │   ├── editorStore.ts    # 编辑器状态
│   │   └── runStore.ts       # 运行状态
│   ├── hooks/                # 自定义 Hooks
│   │   ├── useWebSocket.ts   # WebSocket 连接管理
│   │   └── useAutoSave.ts    # 自动保存逻辑
│   ├── utils/                # 工具函数
│   │   ├── validator.ts      # 节点参数校验
│   │   ├── canvasConverter.ts# 画布数据转换
│   │   └── exportImport.ts   # 导入导出处理
│   └── nodes/                # 自定义节点组件
│       ├── OpenUrlNode.tsx
│       ├── ClickNode.tsx
│       ├── TypeNode.tsx
│       ├── WaitForNode.tsx
│       └── ExtractNode.tsx
├── config/                   # Umi 配置
├── public/
└── package.json
```

### 1.3 架构分层说明

**视图层**：React 组件负责 UI 渲染，页面级组件位于 `pages/`，可复用组件位于 `components/`。

**状态层**：使用 MobX 管理编辑器状态（节点、连线、选中状态）和运行状态（WebSocket 事件、日志）。利用 MobX 的响应式特性自动触发 UI 更新。

**服务层**：`services/` 封装所有 API 调用，统一处理错误码、loading 状态与响应解析。

**工具层**：`utils/` 提供画布数据转换（ReactFlow 格式 ↔ API 格式）、参数校验、导入导出功能。

---

## 2. 开发任务清单

### Phase 1：项目初始化与基础搭建

#### Todo 1.1：初始化 Umi 项目
- **技术**：Umi CLI、TypeScript
- **思路**：使用 `npx create-umi@latest` 创建项目，选择 React 18 + TypeScript 模板。配置 `tsconfig.json` 开启严格模式，确保类型安全。配置 ESLint 和 Prettier 保持代码风格一致。

#### Todo 1.2：安装核心依赖
- **技术**：npm/yarn、ReactFlow、Ant Design、Axios
- **思路**：执行 `npm install @xyflow/react antd zustand axios`，确认版本兼容性。ReactFlow v12 版本与 Umi 4 配合良好，无需额外配置。

#### Todo 1.3：配置 Umi 路由
- **技术**：Umi 约定式路由
- **思路**：按目录结构创建 `pages/index.tsx`（列表页）和 `pages/editor/index.tsx`（编辑页）。Umi 会自动根据文件结构生成路由，无需手动配置 `routes` 数组。

---

### Phase 2：通用组件与工具函数

#### Todo 2.1：封装 API 请求模块
- **技术**：Axios、umi-request
- **思路**：在 `services/api.ts` 中创建 Axios 实例，配置 `baseURL: '/api/v1'`，添加请求/响应拦截器统一处理错误码（`BAD_REQUEST`、`NOT_FOUND` 等）。封装统一的响应解析逻辑，确保所有 API 返回结构一致。

#### Todo 2.2：定义 TypeScript 类型
- **技术**：TypeScript interface/type
- **思路**：在 `models/` 目录下定义 `WorkflowTemplate`、`Run`、`Step`、`NodeConfig` 等核心类型。严格对照 api.md 中的 JSON 结构，确保前后端类型对齐。使用联合类型定义节点配置（`OpenUrlConfig | ClickConfig | ...`）。

#### Todo 2.3：实现画布数据转换器
- **技术**：纯函数、递归遍历
- **思路**：编写 `canvasConverter.ts`，提供两个核心函数：`graphToSteps()` 将 ReactFlow 的 nodes/edges 转换为 `steps` 数组（按连线顺序遍历）；`stepsToGraph()` 反向转换。0.0.1 仅支持线性流程，遍历时检测环路与分支并抛出错误。

#### Todo 2.4：实现参数校验器
- **技术**：正则表达式、条件判断
- **思路**：编写 `validator.ts`，针对每种节点类型提供校验函数。`openUrl` 校验 URL 格式（`/^https?:\/\//`）；`click`/`type`/`extract` 校验 selector 非空；`waitFor` 校验 selector 与 waitMs 二选一；`extract.as` 校验变量名格式（`/^[a-zA-Z_][a-zA-Z0-9_]*$/`）。

---

### Phase 3：模板列表页

#### Todo 3.1：搭建列表页布局
- **技术**：Ant Design Layout、Grid
- **思路**：使用 Antd 的 `Layout` 组件构建页面框架，顶部放置标题与"新建模板"按钮，主体使用 `List` 或 `Card` 组件展示模板卡片。每张卡片显示模板名称、更新时间、节点数量、最近一次运行状态。

#### Todo 3.2：实现模板列表数据获取
- **技术**：React Hooks、Axios
- **思路**：使用 `useEffect` 在页面加载时调用 `GET /api/v1/templates` API。通过 `services/template.ts` 中的 `getTemplates()` 函数获取数据，存入组件 state。处理 loading 与空状态，展示骨架屏或空提示。

#### Todo 3.3：实现新建模板功能
- **技术**：React Router、Antd Modal
- **思路**：点击"新建"按钮后，提供两种选择："空白模板"直接跳转编辑页（无 templateId）；或弹窗输入名称后调用 `POST /api/v1/templates` 创建，成功后跳转到编辑页并携带返回的 `templateId`。

#### Todo 3.4：实现重命名与删除
- **技术**：Antd Popconfirm、Modal
- **思路**：在卡片上提供"编辑信息"和"删除"操作。重命名使用 `Modal` 弹窗，调用 `PATCH /api/v1/templates/{id}`。删除使用 `Popconfirm` 二次确认，调用 `DELETE /api/v1/templates/{id}`，成功后刷新列表。

#### Todo 3.5：实现导入/导出功能
- **技术**：FileReader API、Blob URL
- **思路**：导入使用 `<input type="file">` 选择 JSON 文件，通过 `FileReader` 读取内容，校验 `schemaVersion` 后提示"覆盖当前"或"作为新模板"。导出使用 `URL.createObjectURL` 生成下载链接，触发浏览器下载模板 JSON 文件。

---

### Phase 4：画布编辑页 - 基础画布

#### Todo 4.1：搭建 ReactFlow 画布
- **技术**：@xyflow/react
- **思路**：引入 `ReactFlow` 组件作为画布核心，配置 `fitView` 自适应视图。使用 `Background` 和 `Controls` 组件提供网格背景与缩放控制。监听 `onInit` 获取 ReactFlow 实例，后续用于添加节点。

#### Todo 4.2：实现节点库侧边栏
- **技术**：HTML5 Drag and Drop API
- **思路**：左侧创建节点库面板，展示 5 种节点类型（openUrl、click、type、waitFor、extract）的图标与描述。为每个节点类型设置 `draggable`，在 `dragStart` 事件中携带节点类型信息。

#### Todo 4.3：实现节点拖拽添加
- **技术**：ReactFlow `onDrop` 事件
- **思路**：画布监听 `onDrop` 事件，从 `dataTransfer` 获取节点类型，计算鼠标位置对应的画布坐标（使用 `project` 方法），调用 `addNodes` 添加新节点。新节点生成唯一 ID（`uuidv4`），设置默认位置与空配置。

#### Todo 4.4：实现节点连线
- **技术**：ReactFlow `onConnect` 事件
- **思路**：监听 `onConnect` 事件，调用 `addEdges` 添加连线。0.0.1 限制线性流程：检查源节点是否已有出边、目标节点是否已有入边，若存在则阻止连线并提示"仅支持单一路径"。

#### Todo 4.5：实现节点移动与删除
- **思路**：ReactFlow 内置支持节点拖拽移动，无需额外代码。删除功能通过监听键盘 `Delete` 键或提供右键菜单实现，调用 `deleteElements` 移除选中节点及其相关连线。

---

### Phase 5：画布编辑页 - 节点配置

#### Todo 5.1：搭建属性面板
- **技术**：Antd Form、Drawer
- **思路**：选中节点时，右侧显示属性面板（可用 `Drawer` 或固定侧边栏）。使用 Antd `Form` 组件动态渲染配置表单，根据 `node.type` 切换不同的表单字段。

#### Todo 5.2：实现各类型节点配置表单
- **技术**：Antd Form Item、Input、Select、Radio
- **思路**：为每种节点类型编写配置组件：
  - `openUrl`：URL 输入框，必填校验
  - `click`：selector 输入框，支持 CSS Selector 语法
  - `type`：selector 输入框 + text 输入框
  - `waitFor`：Radio 选择"等待元素"或"等待时间"，动态显示 selector 或 number 输入
  - `extract`：selector 输入框 + as 变量名输入 + mode 选择（text/attribute）+ attributeName 条件显示

#### Todo 5.3：实现配置实时保存
- **技术**：Form `onValuesChange`
- **思路**：监听表单项变化，实时更新节点 `data.config`。使用 Zustand 的 `updateNodeData` 动作同步到全局状态，确保配置与画布节点数据一致。在节点上添加角标或颜色变化提示"已配置"。

---

### Phase 6：画布编辑页 - 保存与校验

#### Todo 6.1：实现保存功能
- **技术**：REST API、canvasConverter
- **思路**：点击工具栏"保存"按钮，调用 `canvasConverter.graphToSteps()` 将画布转换为 `steps` 数组，组装 `otherStep`（不在主路径上的节点）。调用 `PUT /api/v1/templates/{id}` 或 `POST /api/v1/templates` 保存。成功后显示 Antd `message.success` 提示。

#### Todo 6.2：实现离开页面提示
- **技术**：React Router `useBlocker`、beforeunload
- **思路**：使用 MobX store 中的 `isDirty` 状态标记画布是否有未保存变更。当 `isDirty` 为 true 时，通过 `useBlocker` 拦截路由跳转，弹出确认对话框。同时监听 `beforeunload` 事件，防止意外关闭浏览器标签页。

#### Todo 6.3：实现运行前校验
- **技术**：validator、Antd notification
- **思路**：点击"运行"前，遍历所有 `steps`，调用对应类型的校验函数。收集所有错误（如缺少 URL、selector 为空），以列表形式展示在 `notification` 中，阻止运行直到所有错误修复。

---

### Phase 7：运行与监控

#### Todo 7.1：实现 WebSocket 连接管理
- **技术**：原生 WebSocket API、Zustand
- **思路**：编写 `useWebSocket` Hook，接收 `runId` 参数，建立到 `/ws/v1/runs/{runId}` 的连接。使用 Zustand 存储连接状态（connecting/open/error/closed）与消息队列。实现断线重连机制（指数退避），心跳检测保持连接。

#### Todo 7.2：实现事件解析与状态更新
- **技术**：JSON 解析、状态机
- **思路**：WebSocket 收到消息后，根据 `type` 字段分发处理：
  - `RUN_STARTED`：更新运行状态为 RUNNING，清空日志
  - `STEP_STARTED`：高亮当前执行节点（在节点上添加脉冲动画）
  - `STEP_SUCCEEDED`：标记节点成功，如有 `outputs` 显示提取结果
  - `STEP_FAILED`：标记节点失败，显示错误信息
  - `LOG`：追加到日志面板
  - `RUN_*`：更新最终状态，恢复"运行"按钮可用

#### Todo 7.3：实现日志面板
- **技术**：Antd List、Virtual Scroll
- **思路**：底部或侧边创建可折叠的日志面板，使用 `List` 组件展示事件流。每条日志显示时间戳、级别（INFO/WARN/ERROR）、消息。使用 `react-window` 或 `antd` 的虚拟滚动处理大量日志。

#### Todo 7.4：实现运行控制按钮
- **技术**：Antd Button、API 调用
- **思路**：工具栏提供"运行"和"停止"按钮。点击"运行"先校验，成功后调用 `POST /api/v1/runs`，获取 `runId` 与 `wsUrl`，建立 WebSocket 连接并进入监控状态。运行中"停止"按钮可用，点击调用 `POST /api/v1/runs/{id}/cancel`。

---

### Phase 8：体验优化

#### Todo 8.1：实现节点高亮与动画
- **技术**：CSS Animation、ReactFlow node styles
- **思路**：定义节点状态样式：idle（默认）、running（蓝色脉冲边框）、success（绿色边框）、failed（红色边框）。通过 `node.className` 或 `node.style` 动态切换样式，配合 `@keyframes` 实现呼吸动画效果。

#### Todo 8.2：实现错误友好提示
- **技术**：Antd message、notification
- **思路**：API 错误统一拦截，根据错误码显示用户友好提示：
  - `BAD_REQUEST`："请求参数有误，请检查输入"
  - `NOT_FOUND`："模板不存在或已被删除"
  - `INTERNAL_ERROR`："服务器内部错误，请稍后重试"
  画布操作错误（如非法连线）使用 `message.warning` 短暂提示。

---

## 3. 开发优先级与里程碑

| 阶段 | 任务范围 | 目标 |
|------|----------|------|
| Week 1 | Phase 1-2 | 项目跑通，API 封装完成，类型定义齐全 |
| Week 2 | Phase 3-4 | 列表页与基础画布可用，能拖拽添加节点与连线 |
| Week 3 | Phase 5-6 | 节点配置面板完成，保存功能稳定 |
| Week 4 | Phase 7-8 | 运行与监控闭环，0.0.1 验收通过 |

---

总结：本规划以前端架构分层为基础，按功能模块拆解为 8 个阶段共 24 项任务，覆盖从项目初始化到运行监控的完整链路。开发时应遵循 TypeScript 严格类型与组件化设计原则，确保 0.0.1 版本的可演示性与可扩展性。
