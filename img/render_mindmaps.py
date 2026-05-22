import os
import sys
import numpy as np
from playwright.sync_api import sync_playwright
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
sys.stdout.reconfigure(encoding='utf-8')

output_dir = r"d:\TheTower\img"

diagrams = [
    ("fig_4_1_mindmap", "图4-1 系统架构示意图", r"""graph TB
    Root["TheTower 系统架构"]
    Root --> FE["前端展示层<br/>React + Umi + ReactFlow"]
    Root --> Comm["通信协议层"]
    Root --> BE["后端服务层<br/>Ktor + Kotlin"]
    Root --> Engine["执行引擎层<br/>Playwright"]
    Root --> Storage["数据存储层"]
    FE --> FE1["画布编排<br/>节点拖拽·连线·自动布局"]
    FE --> FE2["配置面板<br/>节点参数·运行参数"]
    FE --> FE3["运行监控<br/>状态·日志·产物"]
    FE --> FE4["调试工作台<br/>断点·单步·远程操控"]
    FE --> FE5["协作界面<br/>在线成员·差异采纳"]
    Comm --> REST["REST 接口<br/>模板·运行·调试·认证"]
    Comm --> WS["WebSocket 推送<br/>运行事件·调试事件·协作事件"]
    BE --> S1["模板服务"]
    BE --> S2["运行服务"]
    BE --> S3["调试服务"]
    BE --> S4["认证服务"]
    BE --> S5["调度服务"]
    BE --> S6["协作服务"]
    Engine --> Ex1["流程执行器<br/>步骤解析·上下文管理"]
    Engine --> Ex2["浏览器驱动<br/>Chromium·Firefox·WebKit"]
    Storage --> DB["SQLite 数据库<br/>模板·运行·用户·调度"]
    Storage --> FS["文件存储<br/>运行产物·协作数据"]
    FE1 & FE2 --> REST
    FE3 --> WS
    FE4 --> REST
    FE4 --> WS
    FE5 --> REST
    FE5 --> WS
    REST --> S1 & S2 & S3 & S4 & S5 & S6
    WS --> S2
    S2 --> Ex1
    S3 --> Ex1
    Ex1 --> Ex2
    S1 & S2 & S4 & S5 & S6 --> DB
    Ex1 --> FS
    S6 --> FS"""),
    ("fig_4_2_mindmap", "图4-2 系统功能模块关系图", r"""graph TB
    M1["📦 模块管理<br/>创建/编辑/删除/克隆<br/>市场发布与导入"]
    M2["🎨 流程编排<br/>节点库/拖拽/连线<br/>参数配置/自动布局"]
    M3["▶️ 运行与调试<br/>普通运行/调试运行<br/>断点/时间旅行/远程操控"]
    M4["📊 数据与集成<br/>文件/Excel/剪贴板<br/>焦点元素/请求监听"]
    M5["🏢 平台能力<br/>调度/认证/工作空间<br/>协作编辑"]
    M6["💾 协议与存储<br/>REST/WS/SQLite<br/>运行产物/协作数据"]
    M1 -->|"维护 WorkflowTemplate"| M2
    M2 -->|"修改 steps/otherStep"| M3
    M3 -->|"消费模板生成 Run"| M4
    M5 -->|"工作空间访问边界"| M1
    M6 -.->|"支撑"| M1
    M6 -.->|"支撑"| M3
    M6 -.->|"支撑"| M5"""),
    ("fig_4_3_mindmap", "图4-3 核心数据模型ER图", r"""graph LR
    User["👤 User<br/>─────────<br/>id · PK<br/>username<br/>password"]
    Workspace["📁 Workspace<br/>─────────<br/>id · PK<br/>name<br/>ownerId · FK"]
    WT["📋 WorkflowTemplate<br/>─────────<br/>id · PK<br/>name<br/>description<br/>schemaVersion<br/>steps · array<br/>otherStep · object<br/>createdAt<br/>updatedAt<br/>stats · object<br/>lastRun · object"]
    Step["⚙️ Step<br/>─────────<br/>type<br/>config · object"]
    Run["▶️ Run<br/>─────────<br/>id · PK<br/>templateId · FK<br/>status · enum<br/>currentStepId<br/>startedAt<br/>finishedAt<br/>error · object"]
    RunEvent["📡 RunEvent<br/>─────────<br/>type<br/>stepId<br/>data · object<br/>timestamp"]

    User -->|"1:N 拥有"| Workspace
    Workspace -->|"1:N 隔离资源"| WT
    WT -->|"1:N 包含步骤"| Step
    WT -->|"1:N 触发执行"| Run
    Run -->|"1:N 产生事件"| RunEvent"""),
    ("fig_5_1_mindmap", "图5-1 前端编排交互流程时序图", r"""sequenceDiagram
    participant User as 用户
    participant Canvas as 画布
    participant API as REST API
    participant RunSvc as RunService
    participant Executor as PlaywrightRunExecutor
    participant Session as PlaywrightRunSession
    participant PW as Playwright
    participant WS as WebSocket
    participant Monitor as 运行监控
    User->>Canvas: 拖拽节点、连线、配置参数
    Canvas->>API: PUT /templates/{id} 保存步骤
    API-->>Canvas: 保存成功
    User->>Canvas: 点击运行
    Canvas->>API: POST /runs
    API->>RunSvc: 创建 Run 记录
    RunSvc->>Executor: 创建浏览器上下文
    Executor->>PW: 启动浏览器
    PW-->>Executor: 浏览器就绪
    RunSvc->>Session: 开始步骤执行
    RunSvc->>WS: RUN_STARTED
    loop 逐步执行 steps
        Session->>WS: STEP_STARTED
        Session->>PW: 执行浏览器操作
        PW-->>Session: 操作结果
        alt 成功
            Session->>WS: STEP_SUCCEEDED
        else 失败
            Session->>WS: STEP_FAILED
        end
    end
    Session->>WS: RUN_SUCCEEDED / RUN_FAILED
    WS-->>Monitor: 事件推送
    Monitor-->>User: 实时状态展示"""),
    ("fig_5_2a_mindmap", "图5-2a 后端执行引擎 — 初始化与执行主循环", r"""sequenceDiagram
    participant Client as 前端客户端
    participant RunSvc as RunService
    participant Coroutine as 独立协程
    participant Executor as PlaywrightRunExecutor
    participant Session as PlaywrightRunSession
    participant PW as Playwright API
    participant EventBus as EventBus
    participant WS as WebSocket
    Client->>RunSvc: POST /runs
    RunSvc->>RunSvc: 创建 Run (PENDING)
    RunSvc-->>Client: 返回 runId
    RunSvc->>Coroutine: 启动协程
    Coroutine->>Executor: 创建浏览器上下文
    Executor->>PW: launch(browserType, options)
    PW-->>Executor: Browser + Page
    Executor->>RunSvc: 更新 status → RUNNING
    RunSvc->>EventBus: RUN_STARTED
    EventBus->>WS: 推送事件
    loop 遍历 steps 数组
        Session->>EventBus: STEP_STARTED
        EventBus->>WS: 推送事件
        Session->>PW: 执行浏览器操作
        PW-->>Session: 操作结果
        alt 执行成功
            Session->>EventBus: STEP_SUCCEEDED
        else 执行失败
            Session->>EventBus: STEP_FAILED
        end
        EventBus->>WS: 推送事件
    end"""),
    ("fig_5_2b_mindmap", "图5-2b 后端执行引擎 — 特殊节点与取消机制", r"""sequenceDiagram
    participant Session as PlaywrightRunSession
    participant PW as Playwright API
    participant Context as RunContext
    participant EventBus as EventBus
    participant WS as WebSocket
    Note over Session,Context: 特殊节点处理
    alt 产物节点 (saveData/saveExcel/importExcel)
        Session->>Context: 写入变量/产物到运行目录
        Session->>EventBus: STEP_SUCCEEDED
    else 监听节点 (listenRequestTrigger)
        Session->>PW: 注册 route 拦截器
        PW-->>Session: 拦截器已注册
        Session->>Context: 监听结果写入变量
        Session->>EventBus: STEP_SUCCEEDED
    else 监听结果节点 (listenRequestResult)
        Session->>Context: 获取累积请求/响应数据
        Session->>EventBus: STEP_SUCCEEDED
    end
    EventBus->>WS: 推送事件
    Note over Session,WS: 取消机制
    alt 协程取消信号
        Session->>Session: 检测取消状态
        Session->>PW: 释放浏览器资源
        Session->>EventBus: RUN_CANCELED
        EventBus->>WS: 推送事件
    end
    Note over Session,WS: 运行结束
    alt 全部步骤成功
        Session->>EventBus: RUN_SUCCEEDED
    else 任一步骤失败
        Session->>EventBus: RUN_FAILED
    end
    EventBus->>WS: 推送事件"""),
    ("fig_5_3_mindmap", "图5-3 调试会话状态机", r"""stateDiagram-v2
    [*] --> IDLE
    IDLE --> DEBUGGING : 启动调试运行
    state DEBUGGING {
        [*] --> Executing
        Executing --> StepOK : 步骤成功
        Executing --> StepFail : 步骤失败
        StepOK --> Executing : 继续下一步
        StepFail --> [*] : 终止执行
    }
    DEBUGGING --> PAUSED : 断点命中
    DEBUGGING --> SUCCEEDED : 全部完成
    DEBUGGING --> FAILED : 执行失败
    DEBUGGING --> CANCELED : 用户取消
    PAUSED --> DEBUGGING : 继续/单步执行
    PAUSED --> PAUSED : 远程操控/上下文/时间旅行
    PAUSED --> CANCELED : 用户取消
    SUCCEEDED --> [*]
    FAILED --> [*]
    CANCELED --> [*]"""),
    ("fig_5_4a_mindmap", "图5-4a WebSocket通信 — 运行与调试事件流", r"""sequenceDiagram
    participant FE as 前端
    participant WS as WebSocket 服务
    participant RunSvc as RunService
    participant DebugGate as DebugExecutionGate
    FE->>WS: 建立 WS /ws/v1/runs/{runId}
    WS-->>FE: 连接确认
    Note over WS,RunSvc: 运行事件流
    RunSvc->>WS: RUN_STARTED {runId, templateId}
    WS->>FE: 推送 → 初始化进度视图
    loop 步骤执行循环
        RunSvc->>WS: STEP_STARTED {stepId, stepType}
        WS->>FE: 推送 → 高亮当前步骤
        RunSvc->>WS: STEP_SUCCEEDED / STEP_FAILED
        WS->>FE: 推送 → 填充结果/展示错误
    end
    RunSvc->>WS: RUN_SUCCEEDED / RUN_FAILED / RUN_CANCELED
    WS->>FE: 推送 → 更新运行状态
    Note over WS,DebugGate: 调试事件流
    DebugGate->>WS: DEBUG_SESSION_STARTED
    WS->>FE: 推送
    DebugGate->>WS: DEBUG_BREAKPOINT_HIT
    WS->>FE: 推送 → 暂停执行
    DebugGate->>WS: DEBUG_CONTEXT_UPDATED
    WS->>FE: 推送 → 刷新变量
    DebugGate->>WS: DEBUG_FRAME
    WS->>FE: 推送 → 更新预览"""),
    ("fig_5_4b_mindmap", "图5-4b WebSocket通信 — 协作事件流", r"""sequenceDiagram
    participant FE as 前端
    participant WS as WebSocket 服务
    participant CollabSvc as CollaborationService
    FE->>WS: 建立 WS /ws/v1/templates/{tid}/collaboration
    WS-->>FE: 连接确认
    Note over WS,CollabSvc: 协作事件流
    CollabSvc->>WS: COLLAB_PRESENCE {onlineMembers}
    WS->>FE: 推送 → 更新在线成员
    CollabSvc->>WS: COLLAB_REMOTE_PATCH {patchSummary}
    WS->>FE: 推送 → 提示远端保存
    alt 版本时间一致
        FE->>FE: 自动采纳差异
    else 版本冲突
        CollabSvc->>WS: COLLAB_CONFLICT
        WS->>FE: 推送 → 展示差异摘要
        FE->>FE: 用户选择：采纳远端/保留本地
    end
    Note over FE,CollabSvc: 消息格式：eventType + timestamp + payload"""),
]

MC = """{
  startOnLoad: true,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif',
  fontSize: 40,
  sequence: { actorMargin: 120, messageMargin: 60, mirrorActors: false, useMaxWidth: false, width: 260, actorFontSize: 40, messageFontSize: 40, noteFontSize: 36 },
  flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis', nodeSpacing: 60, rankSpacing: 90, fontSize: 40 },
  er: { useMaxWidth: false, fontSize: 36, entityPadding: 20 },
  stateDiagram: { useMaxWidth: false, fontSize: 40 }
}"""


def make_html(title, mm):
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: white;
    font-family: "Microsoft YaHei","PingFang SC",sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
  }}
  .title {{
    text-align: center;
    color: #1a1a2e;
    font-size: 40px;
    font-weight: bold;
    padding: 40px 60px 20px 60px;
    margin-bottom: 40px;
  }}
  .title-border {{
    height: 4px;
    background: #4a90d9;
    margin-bottom: 40px;
    align-self: center;
    width: min(60%, 800px);
  }}
  .mermaid {{
    padding: 20px 60px 80px 60px;
  }}
  svg {{
    max-width: none !important;
  }}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
</head>
<body>
<div class="title">{title}</div>
<div class="title-border"></div>
<pre class="mermaid">
{mm}
</pre>
<script>mermaid.initialize({MC});</script>
</body>
</html>"""


def trim_whitespace(img_path, margin=30, threshold=250):
    img = Image.open(img_path)
    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    arr = np.array(img)
    non_white = np.any(arr < threshold, axis=2)
    rows = np.any(non_white, axis=1)
    cols = np.any(non_white, axis=0)
    if not rows.any() or not cols.any():
        return img.size
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    cropped = img.crop((
        max(0, cmin - margin),
        max(0, rmin - margin),
        min(img.size[0], cmax + margin + 1),
        min(img.size[1], rmax + margin + 1)
    ))
    cropped.save(img_path)
    return cropped.size


MIN_SVG_WIDTH = 2000
MAX_DIMENSION = 10000

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for fig_id, title, mm in diagrams:
        page = browser.new_page(viewport={"width": 5000, "height": 6000})
        page.set_content(make_html(title, mm), wait_until="networkidle")
        page.wait_for_timeout(5000)

        # Scale up SVG if its natural width is too small, but cap max dimension
        page.evaluate(f"""() => {{
            const svg = document.querySelector('.mermaid svg');
            if (!svg) return;
            const vb = svg.getAttribute('viewBox');
            if (!vb) return;
            const parts = vb.split(/[\\s,]+/).map(Number);
            const vbW = parts[2], vbH = parts[3];
            const currentW = parseFloat(svg.getAttribute('width')) || vbW;
            const currentH = parseFloat(svg.getAttribute('height')) || vbH;
            if (currentW < {MIN_SVG_WIDTH}) {{
                let scale = {MIN_SVG_WIDTH} / currentW;
                if (vbH * scale > {MAX_DIMENSION}) {{
                    scale = {MAX_DIMENSION} / vbH;
                }}
                if (vbW * scale > {MAX_DIMENSION}) {{
                    scale = {MAX_DIMENSION} / vbW;
                }}
                const newW = Math.ceil(vbW * scale);
                const newH = Math.ceil(vbH * scale);
                svg.setAttribute('width', newW);
                svg.setAttribute('height', newH);
                svg.style.width = newW + 'px';
                svg.style.height = newH + 'px';
            }}
        }}""")
        page.wait_for_timeout(500)

        out_path = os.path.join(output_dir, f"{fig_id}.png")
        page.screenshot(path=out_path, full_page=True)
        page.close()

        final_size = trim_whitespace(out_path)
        print(f"✓ {title} -> {fig_id}.png ({final_size[0]}x{final_size[1]})")

    browser.close()

print("\n全部渲染完成！")
