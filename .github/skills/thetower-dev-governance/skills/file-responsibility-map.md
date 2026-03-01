# TheTower 前后端文件职责地图

导语：本文档定义 TheTower 前后端目录职责、允许放置内容与命名规则，减少职责漂移和跨层耦合，保证新增代码可被快速定位与评审。

## 1. 前端职责地图

| 目录 | 职责 | 允许内容 | 禁止内容 |
|---|---|---|---|
| `frontend/src/pages/**` | 页面编排与路由入口 | 页面结构、页面级交互编排 | 通用网络层实现、全局业务规则 |
| `frontend/src/components/**` | 可复用组件 | 通用 UI、受控组件 | 直接访问页面私有 store 细节 |
| `frontend/src/stores/**` | 状态与领域行为 | 状态定义、状态变更方法 | 直接拼接接口 URL |
| `frontend/src/services/**` | 请求与通信入口 | HTTP/WS 客户端、接口封装、错误映射 | 页面渲染逻辑 |
| `frontend/src/models/**` | 类型与数据结构 | TS 类型、接口协议模型 | 副作用逻辑 |
| `frontend/src/utils/**` | 通用工具函数 | 纯函数、转换函数、校验函数 | 业务状态持有 |
| `frontend/src/hooks/**` | 复用交互逻辑 | 可复用 hooks、副作用封装 | 直接耦合多个页面私有状态 |

### 1.1 前端命名约束
- 页面组件使用名词 + `Page` 后缀（如 `EditorPage`）。
- store 方法使用动词开头（如 `createTemplate`、`startRun`）。
- 服务函数与后端 API 语义一致（如 `getTemplates`、`restartRun`）。

### 1.2 前端导入约束
- `src` 下统一使用 `@` 别名导入。
- 禁止新增深层相对路径（如 `../../../../`）。

### 1.3 前端样式约束
- 页面与组件样式放入对应 `.scss` 文件。
- TSX 仅保留结构与状态逻辑，禁止大段内联样式。

## 2. 后端职责地图

| 目录 | 职责 | 允许内容 | 禁止内容 |
|---|---|---|---|
| `backend/src/main/kotlin/com/thetower/routes/**` | 协议层 | 参数解析、响应输出、状态码映射 | 核心业务流程编排 |
| `backend/src/main/kotlin/com/thetower/services/**` | 业务层 | 领域流程、状态机、事务边界 | 直接处理 HTTP 协议细节 |
| `backend/src/main/kotlin/com/thetower/repository/**` | 数据访问层 | 数据读写抽象与实现 | 协议层对象拼装 |
| `backend/src/main/kotlin/com/thetower/models/**` | 领域与传输模型 | data class、序列化模型、枚举 | 网络调用、副作用流程 |
| `backend/src/main/kotlin/com/thetower/config/**` | 应用配置层 | 插件配置、中间件、启动装配 | 业务规则硬编码 |
| `backend/src/main/kotlin/com/thetower/utils/**` | 通用工具层 | ID/时间/公共扩展/错误码常量 | 粘连业务状态 |

### 2.1 后端命名约束
- routes 与 services 同语义一一对应：
  - `getTemplates`
  - `createTemplate`
  - `updateTemplateMeta`
  - `updateTemplateSteps`
  - `startRun`
  - `cancelRun`
  - `restartRun`
- 避免泛化命名：`handle/do/process` 仅用于私有辅助函数。

### 2.2 后端响应与错误约束
- 所有 REST 接口统一返回：`requestId + data + error`。
- 错误码必须登记后使用，禁止“一码多义”和“同义多码”。
- 请求链路必须可追踪（至少包含 `requestId`）。

## 3. 跨层协作边界

1. 前端只调用 `services` 暴露的接口，不直接拼接后端 URL。
2. routes 不直接访问 repository，统一经由 services。
3. models 负责结构，不承担流程控制。
4. utils 保持无状态，不承载业务流程。

## 4. 评审清单（提交前）

- 是否把代码放在了正确目录职责下。
- 命名是否符合动词/名词词典。
- 是否新增了跨层调用或反向依赖。
- 是否引入了重复语义函数。
- 是否破坏统一返回体或错误码规则。

总结：该职责地图通过“目录职责 + 命名约束 + 跨层边界 + 评审清单”四项规则，确保 TheTower 的前后端代码结构可长期维护。
