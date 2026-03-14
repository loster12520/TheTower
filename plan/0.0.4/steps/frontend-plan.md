# 0.0.4 前端实施文档（subflow 画布与步骤扩展）

导语：本文档用于指导 TheTower 前端在 0.0.4 完成步骤扩展与 subflow 编辑能力，重点解决容器节点内嵌小画布、编辑态数据结构、运行高亮与保存编译问题。

## 目录
- [1. 实施目标与边界](#1-实施目标与边界)
- [2. 核心交互方案](#2-核心交互方案)
- [3. 状态模型设计](#3-状态模型设计)
- [4. 组件拆分方案](#4-组件拆分方案)
- [5. 数据转换与校验](#5-数据转换与校验)
- [6. 运行态联动](#6-运行态联动)
- [7. 实施顺序](#7-实施顺序)
- [8. 风险与缓解策略](#8-风险与缓解策略)

---

## 1. 实施目标与边界

### 1.1 本版目标
1. 扩展节点库，新增页面操作、数据处理、流程管理相关节点类型。
2. 为容器步骤提供内嵌 subflow 画布，而非跳转新页面编辑。
3. 保持主流程编辑体验不退化，避免主画布被分支线污染。
4. 让运行态可以同时高亮主节点与 subflow 内部当前节点。

### 1.2 不变边界
- 不把主画布改造成任意 DAG 编辑器。
- 不支持跨层连线。
- 不在本版引入多选批量编辑、复制跨层粘贴等高级交互。

---

## 2. 核心交互方案

### 2.1 主画布与容器节点
- 主画布继续承载根流程。
- `if/for/while/startBrowser` 渲染为大型容器节点。
- 容器节点内部显示 subflow 预览区。

### 2.2 subflow 编辑态
- 默认态：subflow 仅展示缩略图与步骤计数。
- 激活态：当前容器节点内部 subflow 可拖拽、缩放、连线。
- 同一时刻仅允许一个容器节点进入激活态。

### 2.3 分支切换
| 容器类型 | 分支模式 | UI 要求 |
|---|---|---|
| `if` | `then` / `else` | 容器头部提供分支 Tab |
| `forEachElement` | `body` | 单分支 |
| `forTimes` | `body` | 单分支 |
| `forEachData` | `body` | 单分支 |
| `while` | `body` | 单分支 |
| `startBrowser` | `body` | 单分支 |

### 2.4 拖拽规则
1. 左侧节点库拖拽时，若当前存在激活的 subflow，则优先投递到该 subflow。
2. 若无激活 subflow，则投递到主画布。
3. `break` 仅在循环容器的 BODY 中可见或可投递。

---

## 3. 状态模型设计

### 3.1 编辑器状态新增项
建议在 [frontend/src/stores/editorStore.ts](frontend/src/stores/editorStore.ts) 增加：

```ts
interface SubflowGraph {
  nodes: Node[];
  edges: Edge[];
}

interface ActiveSubflow {
  stepId: string;
  branch: 'then' | 'else' | 'body';
}
```

核心状态：
- `activeSubflow: ActiveSubflow | null`
- `subflowGraphMap: Record<string, Record<string, SubflowGraph>>`
- `selectedNodeScope: 'root' | 'subflow'`

### 3.2 节点数据建议
- 普通节点：继续沿用当前 `label + config`。
- 容器节点：在 `config` 中维护业务配置，在前端临时编辑态额外挂接 subflow graph。
- 保存前再统一编译，避免后端持久化 ReactFlow 运行时字段。

### 3.3 选中态规则
- 点击主画布普通节点：右侧面板显示普通配置。
- 点击容器节点：右侧面板显示容器配置和 subflow 摘要。
- 点击 subflow 内部节点：右侧面板显示该子节点配置，并保留父容器上下文提示。

---

## 4. 组件拆分方案

### 4.1 建议新增组件
| 路径 | 职责 |
|---|---|
| `frontend/src/components/SubflowCanvas/` | subflow 小画布容器、缩放与激活态控制 |
| `frontend/src/components/ContainerNode/` | 容器节点视觉壳与分支摘要 |
| `frontend/src/components/BranchTabs/` | IF 的 THEN/ELSE 切换 |
| `frontend/src/components/NodeConfigPanel/` | 扩展容器配置面板 |

### 4.2 现有页面改造点
- [frontend/src/pages/editor/index.tsx](frontend/src/pages/editor/index.tsx)
  - 增加 active subflow 识别。
  - 拖拽逻辑改为“按当前激活目标分发”。
  - 运行高亮要识别 `stepPath`。
- [frontend/src/components/NodeConfigPanel/index.tsx](frontend/src/components/NodeConfigPanel/index.tsx)
  - 新增容器步骤配置表单。
  - 新增 subflow 计数、切换、清空分支操作。
- [frontend/src/nodes/index.tsx](frontend/src/nodes/index.tsx)
  - 注册容器节点类型与渲染组件。

### 4.3 样式要求
- subflow 预览区需有清晰边框、激活态高亮、分支标题区。
- 缩放按钮与摘要信息放在容器节点内部，不污染全局工具栏。
- 所有新增样式写入对应 `.scss` 文件，不新增大段内联样式。

---

## 5. 数据转换与校验

### 5.1 转换策略
- 根流程继续通过 [frontend/src/utils/canvasConverter.ts](frontend/src/utils/canvasConverter.ts) 转换。
- 新增“递归转换”能力：
  1. 先转换根流程。
  2. 再遍历容器节点，把每个 subflow graph 转换为 `then/else/body` 的 `Step[]`。

### 5.2 校验策略
- 根流程与每个 subflow 独立执行线性校验。
- 保存前校验项：
  - 单入口
  - 单入边
  - 单出边
  - 无环
  - `if.then` 非空
  - `while.maxIterations` 已填写
  - `break` 仅在循环体中

### 5.3 加载策略
- 模板详情返回 `then/else/body: Step[]` 后，前端需要把它们逆转换为 subflow graph，恢复到容器节点内部。
- 逆转换失败时，应显示容器节点错误态，而不是直接丢弃分支数据。

---

## 6. 运行态联动

### 6.1 运行事件扩展适配
建议在 [frontend/src/stores/runStore.ts](frontend/src/stores/runStore.ts) 增加：
- `currentStepPath: string[] | null`
- `stepPathStatusMap: Map<string, StepStatus>`

### 6.2 高亮规则
1. 收到 `STEP_STARTED` 时，先高亮主画布上的父容器节点。
2. 若 `activeSubflow` 与 `stepPath` 命中同一容器同一分支，则继续高亮 subflow 内节点。
3. 日志面板可显示形如 `if-1 / then / click-1` 的路径串。

### 6.3 失败定位
- 收到 `STEP_FAILED` 时，若失败发生在未展开的 subflow，容器节点必须显示错误徽标。
- 用户展开对应分支后，定位到失败子节点。

---

## 7. 实施顺序

1. 扩展节点类型与默认配置。
2. 新增容器节点渲染与 subflow 预览壳。
3. 完成 editorStore 的 subflow 状态管理。
4. 完成保存与加载的递归转换。
5. 完成容器节点配置面板。
6. 完成运行态 `stepPath` 高亮联动。
7. 执行手工回归与 E2E 补充。

---

## 8. 风险与缓解策略

### 8.1 主要风险
- 多层 ReactFlow 嵌套导致滚轮、拖拽事件冲突。
- 保存/加载的递归转换出错导致子流程丢失。
- 容器节点 UI 过重导致主画布性能下降。

### 8.2 缓解策略
- 同时只激活一个 subflow，非激活态只显示预览。
- 转换逻辑单独抽到 utils，并补独立单元测试。
- 容器节点预览态尽量静态化，只在编辑时挂载交互能力。

总结：前端 0.0.4 以“容器节点 + subflow 小画布 + 递归转换 + 路径高亮”为主线，先把交互壳与状态模型打稳，再补节点细节。