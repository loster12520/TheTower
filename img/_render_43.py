import os
import sys
import numpy as np
from playwright.sync_api import sync_playwright
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
sys.stdout.reconfigure(encoding='utf-8')

output_dir = r"d:\TheTower\img"

fig_id = "fig_4_3_mindmap"
title = "图4-3 核心数据模型ER图"
mm = r"""graph LR
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
    Run -->|"1:N 产生事件"| RunEvent"""

MC = """{
  startOnLoad: true,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif',
  fontSize: 40,
  flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis', nodeSpacing: 60, rankSpacing: 90, fontSize: 40 }
}"""

html = f"""<!DOCTYPE html>
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

MIN_SVG_WIDTH = 2000
MAX_DIMENSION = 10000


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


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 5000, "height": 6000})
    page.set_content(html, wait_until="networkidle")
    page.wait_for_timeout(5000)

    page.evaluate(f"""() => {{
        const svg = document.querySelector('.mermaid svg');
        if (!svg) return;
        const vb = svg.getAttribute('viewBox');
        if (!vb) return;
        const parts = vb.split(/[\\s,]+/).map(Number);
        const vbW = parts[2], vbH = parts[3];
        const currentW = parseFloat(svg.getAttribute('width')) || vbW;
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
