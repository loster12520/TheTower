# 0.0.5 前端实施文档（步骤注册化 + 运行态增强）

导语：本文档用于指导 0.0.5 前端实现，重点解决步骤接入重复劳动、配置面板膨胀、产物展示与新增容器节点接入。

## 1. 实施目标与边界

- 目标：让 0.0.5 新步骤可快速接入节点库、默认配置、配置表单、校验器与运行态展示。
- 目标：保持 0.0.4 的 subflow 编辑模型与失败定位能力不回归。
- 目标：让运行面板可展示 outputs 与 artifacts 摘要。
- 边界：不重做画布架构，不引入新的画布层级结构。

## 2. 前端改造主线

| 模块 | 当前现状 | 0.0.5 目标 |
|---|---|---|
| 步骤定义 | 分散在 model、store、converter、validator | 收口为可注册结构 |
| 配置表单 | `NodeConfigPanel` 分支持续增长 | 改为注册表 + schema 驱动 + 专用表单混合模式 |
| 节点库 | 仅覆盖 0.0.4 少量步骤 | 覆盖 0.0.5 第一批高频步骤 |
| 运行态 | 已支持 `stepPath` 与失败定位 | 增加 outputs 与 artifacts 摘要 |
| 容器节点 | 已支持 `if / forTimes / while` | 增加 `forEachElement / forEachData / startBrowser` |

## 3. 状态模型建议

### 3.1 步骤注册表

- 新增统一步骤定义结构，至少包含：
  - `type`
  - `label`
  - `group`
  - `icon`
  - `color`
  - `isContainer`
  - `defaultConfig`
  - `formType: 'schema'|'custom'`

### 3.2 运行态扩展

- `runStore` 需支持：
  - `outputs` 摘要读取
  - `artifacts` 摘要读取
  - 失败步骤与产物步骤的快速定位
- 容器节点摘要状态继续基于 `stepPath` 聚合，不新增另一套状态模型。

## 4. 组件拆分建议

### 4.1 保留专用配置组件

- `if`
- `forTimes`
- `while`
- `forEachElement`
- `forEachData`
- `startBrowser`

这些节点需要承担分支摘要、BODY 计数或进入子流程编辑按钮，不适合纯 schema 表单。

### 4.2 适合 schema 驱动的叶子步骤

- `newPage`
- `closePage`
- `switchPage`
- `reloadPage`
- `screenshotPage`
- `hover`
- `focus`
- `selectOption`
- `scrollPage`
- `uploadFiles`
- `executeJs`
- `waitForResponse`
- `getUrl`
- `downloadFile`
- `importText`
- `totp`
- `getCookies`
- `clearCookies`

## 5. 数据转换与校验

### 5.1 转换要求

- `canvasConverter` 继续负责根流程 + subflow 的递归转换。
- 0.0.5 只扩默认配置与步骤类型，不改变转换主算法。
- 新容器节点 `forEachElement / forEachData / startBrowser` 继续使用 `body: Step[]`。

### 5.2 校验要求

- 简单叶子步骤由注册表提供字段级校验规则。
- 容器步骤继续保留专门校验：
  - `forEachElement.body` 非空
  - `forEachData.body` 非空
  - `startBrowser.body` 允许为空与否，以需求稿为准
- `break` 仍只允许出现在循环 BODY 中。

## 6. 运行态联动

- `RunPanel` 至少展示：
  - 当前路径
  - 最近失败路径
  - 最近 outputs 摘要
  - 最近 artifacts 摘要
- 容器节点继续展示聚合运行态；若 BODY 内部产生失败或产物，应能通过摘要看出。

## 7. 测试重点

1. 节点库可见性：新增步骤能显示在正确分组。
2. 配置表单：新增叶子步骤可编辑并保存。
3. 保存重载：新步骤模板保存后重新加载不丢字段。
4. 容器步骤：`forEachElement / forEachData / startBrowser` 可进入 BODY 子流程编辑。
5. 运行态：outputs 与 artifacts 摘要可见，失败定位不回归。
6. 真实联调：多标签页、截图下载、Cookie、容器遍历至少各覆盖一条。

## 8. 实施顺序

1. 建步骤注册表
2. 扩默认配置与类型模型
3. 抽 schema 驱动叶子表单
4. 接入新增容器步骤
5. 扩运行面板与节点摘要
6. 补 mock 与真实联调测试

总结：0.0.5 前端的重点是把“新增步骤的接入成本”降下来，同时保持 0.0.4 的 subflow 编辑体验与运行态定位能力不退化。