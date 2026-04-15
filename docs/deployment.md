# TheTower 部署说明

导语：本文档说明 TheTower 在本地环境下的启动方式、关键环境变量、前后端联调策略和常见问题，并提供一份可选的服务器部署参考。

## 目录

- [TheTower 部署说明](#thetower-部署说明)
  - [目录](#目录)
  - [1. 环境要求](#1-环境要求)
    - [1.1 后端](#11-后端)
    - [1.2 前端](#12-前端)
    - [1.3 浏览器依赖](#13-浏览器依赖)
  - [2. 本地启动方式](#2-本地启动方式)
    - [2.1 启动后端](#21-启动后端)
    - [2.2 启动前端](#22-启动前端)
    - [2.3 健康检查](#23-健康检查)
  - [3. 关键环境变量](#3-关键环境变量)
    - [3.1 后端](#31-后端)
    - [3.2 前端](#32-前端)
  - [4. 前后端联调方式](#4-前后端联调方式)
    - [4.1 前端 mock 回归](#41-前端-mock-回归)
    - [4.2 真实联调回归](#42-真实联调回归)
  - [5. 数据与产物目录](#5-数据与产物目录)
  - [6. 常见问题](#6-常见问题)
    - [6.1 端口被占用](#61-端口被占用)
    - [6.2 前端能打开，运行却没有事件](#62-前端能打开运行却没有事件)
    - [6.3 调试运行结束后浏览器没有自动关闭](#63-调试运行结束后浏览器没有自动关闭)
  - [7. 服务器部署手册（可选）](#7-服务器部署手册可选)
    - [7.1 推荐目录结构](#71-推荐目录结构)
    - [7.2 服务器准备](#72-服务器准备)
    - [7.3 前端发布](#73-前端发布)
    - [7.4 后端发布](#74-后端发布)
    - [7.5 可直接复用的部署资产](#75-可直接复用的部署资产)
    - [7.6 systemd 服务示例](#76-systemd-服务示例)
    - [7.7 Nginx 反向代理示例](#77-nginx-反向代理示例)
    - [7.8 数据持久化建议](#78-数据持久化建议)
    - [7.9 多浏览器部署说明](#79-多浏览器部署说明)
  - [8. 上线检查单](#8-上线检查单)

## 1. 环境要求

### 1.1 后端

- JDK 17 或更高版本
- Windows 下可直接使用 `gradlew.bat`

### 1.2 前端

- Node.js
- npm 或 yarn

### 1.3 浏览器依赖

- 后端默认使用 Playwright 的 `chromium`
- 若要验证 Firefox 或 Edge，需要确保对应浏览器环境可用

## 2. 本地启动方式

### 2.1 启动后端

```powershell
cd backend
.\gradlew.bat run
```

默认监听端口是 `8080`。

如果端口冲突。

```powershell
cd backend
$env:PORT=8082
.\gradlew.bat run
```

### 2.2 启动前端

```powershell
cd frontend
npm install
npm run dev
```

### 2.3 健康检查

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
```

## 3. 关键环境变量

### 3.1 后端

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8080` | 覆盖 Ktor 监听端口 |
| `THETOWER_BROWSER` | `chromium` | 覆盖 Playwright 浏览器类型，支持 `chromium`、`chrome`、`firefox`、`webkit`、`edge` |
| `THETOWER_HEADLESS` | `true` | 覆盖 Playwright 无头模式 |
| `THETOWER_DEFAULT_TIMEOUT_MS` | `10000` | 覆盖默认步骤超时 |

后端其他关键配置来自 `backend/src/main/resources/application.conf`。

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `thetower.persistence.sqlite.path` | `data/thetower.db` | SQLite 数据文件 |
| `thetower.executor.playwright.browser` | `chromium` | 默认浏览器 |
| `thetower.executor.playwright.headless` | `true` | 默认无头模式 |
| `thetower.executor.playwright.defaultTimeoutMs` | `10000` | 默认步骤超时 |

> 若设置了同名环境变量，则以后者为准，便于做浏览器兼容矩阵与多端口验证。

### 3.2 前端

来自 `frontend/src/config/runtime.ts` 的运行时变量如下。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `UMI_APP_API_BASE_URL` | `/api/v1` | 前端请求 API 的基地址 |
| `UMI_APP_WS_BASE_URL` | `/ws/v1` | 前端构造 WebSocket 地址的基路径 |
| `UMI_APP_AUTH_ENABLED` | `false` | 是否启用鉴权逻辑 |
| `UMI_APP_AUTH_HEADER` | `Authorization` | 鉴权请求头 |
| `UMI_APP_AUTH_TOKEN_KEY` | `thetower_token` | Token 本地存储键名 |
| `UMI_APP_LOG_ENABLED` | `true` | 是否启用前端日志 |
| `UMI_APP_LOG_LEVEL` | `debug` 或 `info` | 前端日志等级 |

## 4. 前后端联调方式

### 4.1 前端 mock 回归

项目已有 Playwright mock 配置。

```text
frontend/playwright.config.ts
```

特点如下。

- 固定端口 `8010`
- 设置 `UMI_APP_USE_MOCK=true`
- 不依赖真实后端

### 4.2 真实联调回归

项目已有真实后端 Playwright 配置。

```text
frontend/playwright.real.config.ts
```

特点如下。

- 固定端口 `8011`
- 设置 `UMI_APP_USE_MOCK=false`
- 设置 `UMI_APP_WS_BASE_URL=ws://127.0.0.1:8080/ws/v1`

> 真实联调时建议让前端 WebSocket 直连后端地址，而不是依赖开发服务器代理，这样更容易避免重复事件和连接漂移问题。

## 5. 数据与产物目录

| 路径 | 说明 |
|---|---|
| `backend/data/thetower.db` | SQLite 数据库 |
| `data/runs/` | 运行产物目录 |
| `backend/build/libs/` | 后端构建产物目录 |

## 6. 常见问题

### 6.1 端口被占用

现象：后端启动时报 `Address already in use`。

处理方式。

1. 检查是否已有旧进程占用 `8080`。
2. 或直接用 `PORT` 切换端口重新启动。

### 6.2 前端能打开，运行却没有事件

常见原因是 WebSocket 地址没有正确指向后端。

处理方式。

1. 检查 `UMI_APP_WS_BASE_URL`。
2. 检查后端是否已启动。
3. 检查浏览器控制台与后端日志是否有连接失败信息。

### 6.3 调试运行结束后浏览器没有自动关闭

这是 0.0.8 之后的设计行为之一。

- 若启用了 `keepBrowserOnFinish`，调试结束后会进入保留现场状态。
- 需要显式点击“关闭调试”或调用调试关闭接口。

## 7. 服务器部署手册（可选）

当前文档默认面向 Linux 云服务器，目标是把单机版 TheTower 部署成“前端静态资源 + 后端服务 + 反向代理”的基础可用形态。

### 7.1 推荐目录结构

```text
/opt/thetower/
  frontend-dist/        # 前端构建产物
  backend/              # 后端 fat jar 与运行脚本
  data/                 # SQLite、runs、logs
  thetower.db
  runs/
  logs/
```

### 7.2 服务器准备

建议先安装下面几类依赖。

1. JDK 17。
2. Nginx。
3. Node.js，仅在服务器上需要重新构建前端时安装。
4. Playwright 浏览器运行依赖。

若后端直接在服务器上使用 Playwright 浏览器，至少要确保对应浏览器可正常启动。对于 `edge`，还需要系统已安装 Microsoft Edge。

### 7.3 前端发布

在本地或服务器执行构建。

```powershell
cd frontend
npm install
npm run build
```

把 `frontend/dist/` 上传到服务器的 `/opt/thetower/frontend-dist/`。

### 7.4 后端发布

优先使用 fat jar 方式部署后端。

```powershell
cd backend
gradle buildFatJar
```

构建完成后，把 `backend/build/libs/thetower-backend-all.jar` 上传到服务器 `/opt/thetower/backend/`。

建议在服务器上准备启动脚本。

```bash
#!/usr/bin/env bash
set -euo pipefail

export PORT=8080
export THETOWER_BROWSER=chromium
export THETOWER_HEADLESS=true
export THETOWER_DEFAULT_TIMEOUT_MS=10000

cd /opt/thetower
exec java -jar /opt/thetower/backend/thetower-backend-all.jar
```

### 7.5 可直接复用的部署资产

为减少手工抄写配置导致的漂移，仓库已补下列 Linux 部署样例文件。

| 文件 | 用途 |
|---|---|
| `docs/deploy/linux/start-backend.sh` | 后端启动脚本 |
| `docs/deploy/linux/thetower.env.example` | 环境变量示例 |
| `docs/deploy/linux/thetower-backend.service` | `systemd` 服务文件 |
| `docs/deploy/linux/nginx.thetower.conf` | Nginx 站点配置示例 |

建议部署时按下面方式落盘。

1. 把 `start-backend.sh` 复制到 `/opt/thetower/backend/start-backend.sh` 并赋执行权限。
2. 把 `thetower.env.example` 复制成 `/opt/thetower/backend/thetower.env` 后按实际环境修改。
3. 把 `thetower-backend.service` 复制到 `/etc/systemd/system/thetower-backend.service`。
4. 把 `nginx.thetower.conf` 复制到 Nginx 站点配置目录后再执行 `nginx -t`。

### 7.6 systemd 服务示例

后端可以用 `systemd` 托管。

```ini
[Unit]
Description=TheTower Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/thetower
Environment=PORT=8080
Environment=THETOWER_BROWSER=chromium
Environment=THETOWER_HEADLESS=true
Environment=THETOWER_DEFAULT_TIMEOUT_MS=10000
ExecStart=/usr/bin/java -jar /opt/thetower/backend/thetower-backend-all.jar
Restart=always
RestartSec=5
StandardOutput=append:/opt/thetower/data/logs/backend.log
StandardError=append:/opt/thetower/data/logs/backend-error.log

[Install]
WantedBy=multi-user.target
```

启用方式。

```bash
sudo systemctl daemon-reload
sudo systemctl enable thetower-backend
sudo systemctl start thetower-backend
sudo systemctl status thetower-backend
```

### 7.7 Nginx 反向代理示例

Nginx 需要同时处理静态资源、REST API 和 WebSocket。

```nginx
server {
  listen 80;
  server_name your-domain.example.com;

  root /opt/thetower/frontend-dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/v1/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /ws/v1/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### 7.8 数据持久化建议

最少要把下面目录独立持久化。

| 路径 | 原因 |
|---|---|
| `/opt/thetower/data/thetower.db` | 模板与运行记录持久化 |
| `/opt/thetower/data/runs/` | 截图、下载等运行产物 |
| `/opt/thetower/data/logs/` | 服务日志与排障信息 |

如果后续切换到 Docker 或云盘，也应优先保证这三类目录可持久化。

### 7.9 多浏览器部署说明

当前后端支持通过 `THETOWER_BROWSER` 切浏览器。

| 值 | 实际行为 |
|---|---|
| `chromium` | Playwright Chromium |
| `chrome` | Chromium 引擎，`chrome` channel |
| `firefox` | Playwright Firefox |
| `webkit` | Playwright WebKit |
| `edge` | Chromium 引擎，`msedge` channel |

> 如果服务器未安装 Chrome 或 Edge，`chrome` 和 `edge` channel 可能无法启动，这属于部署环境问题，不是路由或模板问题。

## 8. 上线检查单

1. 后端健康检查 `GET /api/v1/health` 返回 `ok`。
2. 首页能正常加载模板列表。
3. 模板可以创建、保存和删除。
4. 普通运行能成功结束并产生事件流。
5. WebSocket 事件流可收到 `RUN_STARTED` 和终态事件。
6. `data/runs/` 下能看到新 run 的产物目录。
7. Nginx 已正确转发 `/api/v1/` 和 `/ws/v1/`。
8. 日志目录和数据库目录具备写权限。

总结：TheTower 当前已经具备本地部署闭环、服务器部署手册（可选）和可直接复用的 Linux 配置样例，可用于快速复现实验环境或在服务器上部署联调。
