# TheTower 0.0.9 测试脚本说明

导语：本文档说明 0.0.9 已准备的后端专项验证脚本，重点覆盖 API 主链路、WebSocket 心跳与并发执行三类场景。

## 1. 脚本清单

| 文件 | 场景 | 说明 |
|---|---|---|
| `backend-test.py` | API 主链路 | 校验响应包装、模板 CRUD、运行启动、错误码与产物写入 |
| `ws-heartbeat-test.ps1` | WebSocket 事件流 | 校验 JSON 心跳帧、事件顺序与终态事件 |
| `concurrent-runs-test.ps1` | 并发执行 | 同模板启动 3 个运行，校验 runId 隔离与终态收敛 |
| `success-rate-test.ps1` | 成功率统计 | 批量运行样本模板并统计成功率、平均耗时与失败数量 |
| `browser-matrix-test.ps1` | 浏览器兼容 | 按 `chromium / firefox / edge` 逐个启动后端并复用 `backend-test.py` |

## 2. 执行前提

1. 后端服务已启动。
2. 默认地址是 `http://127.0.0.1:8080/api/v1`。
3. WebSocket 地址默认是 `ws://127.0.0.1:8080`。

## 3. 执行方式

### 3.1 API 主链路

```powershell
cd test/0.0.9
python backend-test.py
```

### 3.2 WebSocket 心跳

```powershell
cd test/0.0.9
powershell -File .\ws-heartbeat-test.ps1
```

### 3.3 3 并发运行

```powershell
cd test/0.0.9
powershell -File .\concurrent-runs-test.ps1
```

## 4. 使用边界

- 这批脚本不负责切换浏览器类型。
- 浏览器兼容脚本会通过 `THETOWER_BROWSER` 与 `PORT` 启动独立后端实例。
- 脚本默认会清理自己创建的模板和运行记录。

总结：0.0.9 的测试脚本先把当前最稳定、最可自动化的三类专项验证固定下来，后续浏览器兼容结果再按配置切换回填。