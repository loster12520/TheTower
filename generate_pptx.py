#!/usr/bin/env python3
"""Generate TheTower graduation defense PPTX — Swiss International Style, IKB Blue theme, 14 slides."""

from pptx import Presentation
from pptx.util import Inches, Pt, Cm, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import copy

# ── Colors ──────────────────────────────────────────────
IKB       = RGBColor(0x00, 0x2F, 0xA7)
IKB_80    = RGBColor(0x33, 0x59, 0xB9)
IKB_10    = RGBColor(0xE6, 0xEA, 0xF6)
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
INK       = RGBColor(0x0A, 0x0A, 0x0A)
INK_SEC   = RGBColor(0x52, 0x52, 0x52)
INK_HLP   = RGBColor(0x73, 0x73, 0x73)
GREY_1    = RGBColor(0xF0, 0xF0, 0xEE)
GREY_2    = RGBColor(0xD4, 0xD4, 0xD2)
BORDER    = RGBColor(0xE0, 0xE0, 0xE0)
ACCENT_ON = WHITE
ACCENT_DIM = RGBColor(0xD0, 0xD8, 0xF2)

# ── Slide dimensions (16:9) ─────────────────────────────
SLIDE_W = Cm(33.867)
SLIDE_H = Cm(19.05)

# ── Helper functions ────────────────────────────────────

def add_blank_slide(prs):
    """Add a blank slide."""
    layout = prs.slide_layouts[6]  # blank
    return prs.slides.add_slide(layout)

def add_textbox(slide, left, top, width, height, text="",
                font_name="Inter", font_size=Pt(16), font_color=INK,
                bold=False, alignment=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
                line_spacing=1.2):
    """Add a text box to a slide."""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    txBox.word_wrap = True
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.name = font_name
    p.font.size = font_size
    p.font.color.rgb = font_color
    p.font.bold = bold
    p.alignment = alignment
    p.line_spacing = line_spacing
    return tf

def add_para(tf, text, font_name="Inter", font_size=Pt(14), font_color=INK,
             bold=False, alignment=PP_ALIGN.LEFT, line_spacing=1.2,
             space_before=Pt(4)):
    """Add a paragraph to an existing text frame."""
    p = tf.add_paragraph()
    p.text = text
    p.font.name = font_name
    p.font.size = font_size
    p.font.color.rgb = font_color
    p.font.bold = bold
    p.alignment = alignment
    p.line_spacing = line_spacing
    p.space_before = space_before
    return p

def add_rect(slide, left, top, width, height, fill_color=None,
             border_color=None, border_width=None):
    """Add a rectangle shape."""
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.line.fill.background()
    if fill_color:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill_color
    else:
        shape.fill.background()
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.fill.solid()
        if border_width:
            shape.line.width = border_width
    return shape

def accent_bar(slide, left, top, width, height=Cm(0.08)):
    """Add a thin IKB accent bar (like a hairline or thick accent line)."""
    return add_rect(slide, left, top, width, height, fill_color=IKB)

def card_fill(slide, left, top, width, height, opacity=1.0):
    """Add a grey fill card."""
    color = GREY_1 if opacity >= 0.9 else RGBColor(
        int(240 + (250-240)*(1-opacity)),
        int(240 + (250-240)*(1-opacity)),
        int(238 + (248-238)*(1-opacity))
    )
    return add_rect(slide, left, top, width, height, fill_color=color)

def card_accent(slide, left, top, width, height):
    """Add an IKB accent card."""
    return add_rect(slide, left, top, width, height, fill_color=IKB)

def card_outlined(slide, left, top, width, height):
    """Add an outlined card."""
    return add_rect(slide, left, top, width, height, fill_color=None,
                    border_color=BORDER, border_width=Pt(1))

def hairline(slide, left, top, width):
    """Add a 1px hairline."""
    return add_rect(slide, left, top, width, Cm(0.03), fill_color=BORDER)

def rule_accent(slide, left, top, width):
    """Add a thin IKB rule."""
    return add_rect(slide, left, top, width, Cm(0.05), fill_color=IKB)

def chrome_header(slide, left_text, right_text):
    """Add chrome-min header: mono uppercase labels."""
    # Left label
    tf = add_textbox(slide, Cm(2.0), Cm(1.1), Cm(16), Cm(0.8), left_text,
                     font_name="Consolas", font_size=Pt(9), font_color=INK_HLP,
                     alignment=PP_ALIGN.LEFT)
    # Right label
    tf = add_textbox(slide, Cm(27.5), Cm(1.1), Cm(5), Cm(0.8), right_text,
                     font_name="Consolas", font_size=Pt(9), font_color=INK_HLP,
                     alignment=PP_ALIGN.RIGHT)

def accent_chrome_header(slide, left_text, right_text):
    """Chrome header on accent (IKB) background."""
    tf = add_textbox(slide, Cm(2.0), Cm(1.1), Cm(16), Cm(0.8), left_text,
                     font_name="Consolas", font_size=Pt(9),
                     font_color=RGBColor(0xC0, 0xCC, 0xF0),
                     alignment=PP_ALIGN.LEFT)
    tf = add_textbox(slide, Cm(27.5), Cm(1.1), Cm(5), Cm(0.8), right_text,
                     font_name="Consolas", font_size=Pt(9),
                     font_color=RGBColor(0xC0, 0xCC, 0xF0),
                     alignment=PP_ALIGN.RIGHT)

def big_title(slide, text, left=Cm(2.0), top=Cm(2.8), width=Cm(30),
              font_size=Pt(44), color=INK, weight=200):
    """Large Swiss-style title, typically weight 200 (ExtraLight in PPTX terms)."""
    # PPTX doesn't have weight 200, so we simulate with thin font + light color
    tf = add_textbox(slide, left, top, width, Cm(4.5), text,
                     font_name="Inter", font_size=font_size, font_color=color,
                     bold=False, line_spacing=0.95)
    return tf

def category_label(slide, text, left=Cm(2.0), top=Cm(2.15), color=INK_HLP):
    """Mono uppercase category label (t-cat)."""
    return add_textbox(slide, left, top, Cm(20), Cm(0.7), text,
                       font_name="Consolas", font_size=Pt(9), font_color=color,
                       bold=True)

def accent_category_label(slide, text, left=Cm(2.0), top=Cm(2.15)):
    """Mono category label in IKB."""
    return category_label(slide, text, left, top, color=IKB)

def body_text(slide, text, left, top, width, height, font_size=Pt(13),
              color=INK_SEC, line_spacing=1.45):
    """Regular body text."""
    return add_textbox(slide, left, top, width, height, text,
                       font_name="Inter", font_size=font_size, font_color=color,
                       line_spacing=line_spacing)

def mono_meta(slide, text, left, top, width, height=Cm(0.6),
              font_size=Pt(8), color=INK_HLP, align=PP_ALIGN.LEFT):
    """Monospaced metadata text."""
    return add_textbox(slide, left, top, width, height, text,
                       font_name="Consolas", font_size=font_size, font_color=color,
                       alignment=align)

def tag_box(slide, text, left, top, width=Cm(0.4), height=Cm(0.4),
            bg=IKB, fg=WHITE):
    """Small accent tag."""
    shape = add_rect(slide, left, top, width, height, fill_color=bg)
    tf = shape.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.text = text
    p.font.name = "Inter"
    p.font.size = Pt(9)
    p.font.color.rgb = fg
    p.font.bold = True
    p.alignment = PP_ALIGN.CENTER
    return shape

def slide_bg(slide, color=WHITE):
    """Set slide background color."""
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_full_accent_bg(slide):
    """Fill entire slide with IKB blue."""
    add_rect(slide, Cm(0), Cm(0), SLIDE_W, SLIDE_H, fill_color=IKB)

def add_full_grey_bg(slide):
    """Fill entire slide with grey-1."""
    add_rect(slide, Cm(0), Cm(0), SLIDE_W, SLIDE_H, fill_color=GREY_1)

def add_full_white_bg(slide):
    """Fill entire slide with white."""
    add_rect(slide, Cm(0), Cm(0), SLIDE_W, SLIDE_H, fill_color=WHITE)

# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════

prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H

# ────────────────────────────────────────────────────────
# P1 · 封面 · IKB 满屏
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_accent_bg(s)

# Grid dot decoration — small circles at top right
for r in range(6):
    for c in range(8):
        if (r + c) % 3 == 0:
            x = Cm(22) + Cm(c * 1.4)
            y = Cm(0.6) + Cm(r * 1.4)
            dot = s.shapes.add_shape(MSO_SHAPE.OVAL, x, y, Cm(0.15), Cm(0.15))
            dot.fill.solid()
            dot.fill.fore_color.rgb = RGBColor(0x40, 0x60, 0xC0)
            dot.line.fill.background()

accent_chrome_header(s, "TheTower · 毕业设计答辩", "01 / 14")

# Kicker
add_textbox(s, Cm(2.0), Cm(3.5), Cm(30), Cm(0.8),
            "BROWSER RPA · CANVAS WORKFLOW",
            font_name="Consolas", font_size=Pt(10),
            font_color=RGBColor(0xC0, 0xCC, 0xF0), line_spacing=1.0)

# Main title
add_textbox(s, Cm(2.0), Cm(5.0), Cm(30), Cm(6.5),
            "基于 Playwright 的\n浏览器 RPA 画布工作流系统",
            font_name="Inter", font_size=Pt(48), font_color=WHITE,
            line_spacing=0.92)

# Subtitle
add_textbox(s, Cm(2.0), Cm(12.0), Cm(30), Cm(1.5),
            "TheTower — 拖拽节点、连线编排，驱动真实浏览器自动化执行",
            font_name="Inter", font_size=Pt(16), font_color=RGBColor(0xD0, 0xD8, 0xF2),
            line_spacing=1.3)

# Separator line
add_rect(s, Cm(2.0), Cm(14.2), Cm(30), Cm(0.03),
         fill_color=RGBColor(0x60, 0x80, 0xD0))

# Footer
add_textbox(s, Cm(2.0), Cm(15.2), Cm(16), Cm(0.7),
            "东莞理工学院 · 计算机科学与技术学院",
            font_name="Inter", font_size=Pt(11), font_color=RGBColor(0xB0, 0xC0, 0xE8))
add_textbox(s, Cm(18.0), Cm(15.2), Cm(15), Cm(0.7),
            "学生：XXX · 指导教师：XXX 副教授",
            font_name="Inter", font_size=Pt(11), font_color=RGBColor(0xB0, 0xC0, 0xE8),
            alignment=PP_ALIGN.RIGHT)

# ────────────────────────────────────────────────────────
# P2 · 问题与动机 · 三列对比
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_white_bg(s)
chrome_header(s, "PROBLEM", "02 / 14")
category_label(s, "WHY THE TOWER", top=Cm(2.15))
big_title(s, "浏览器重复操作的困境", top=Cm(3.0), font_size=Pt(36))

# Three columns
col_w = Cm(9.2)
col_gap = Cm(0.8)
col_start = Cm(2.0)
col_top = Cm(8.0)
col_h = Cm(8.5)

# Left: 纯脚本
c = col_start
card_fill(s, c, col_top, col_w, col_h, opacity=0.65)
add_textbox(s, c + Cm(0.9), col_top + Cm(0.6), col_w - Cm(1.8), Cm(0.7),
            "纯脚本方案", font_name="Consolas", font_size=Pt(10), font_color=INK_HLP, bold=True)
add_textbox(s, c + Cm(0.9), col_top + Cm(1.6), col_w - Cm(1.8), Cm(0.7),
            "Selenium · Playwright · Puppeteer",
            font_name="Inter", font_size=Pt(11), font_color=INK_SEC)
hairline(s, c + Cm(0.9), col_top + Cm(2.6), col_w - Cm(1.8))
add_textbox(s, c + Cm(0.9), col_top + Cm(3.2), col_w - Cm(1.8), Cm(4.0),
            "✗ 需要编程基础\n✗ 脚本维护成本高\n✗ 缺乏可视化界面",
            font_name="Inter", font_size=Pt(11), font_color=INK_SEC, line_spacing=1.6)

# Middle: 商业RPA
c = col_start + col_w + col_gap
card_fill(s, c, col_top, col_w, col_h, opacity=0.65)
add_textbox(s, c + Cm(0.9), col_top + Cm(0.6), col_w - Cm(1.8), Cm(0.7),
            "商业 RPA 平台", font_name="Consolas", font_size=Pt(10), font_color=INK_HLP, bold=True)
add_textbox(s, c + Cm(0.9), col_top + Cm(1.6), col_w - Cm(1.8), Cm(0.7),
            "UiPath · 来也 · 影刀",
            font_name="Inter", font_size=Pt(11), font_color=INK_SEC)
hairline(s, c + Cm(0.9), col_top + Cm(2.6), col_w - Cm(1.8))
add_textbox(s, c + Cm(0.9), col_top + Cm(3.2), col_w - Cm(1.8), Cm(4.0),
            "✗ 授权费用昂贵\n✗ 配置部署复杂\n✗ 定制能力受限",
            font_name="Inter", font_size=Pt(11), font_color=INK_SEC, line_spacing=1.6)

# Right: TheTower (accent)
c = col_start + (col_w + col_gap) * 2
card_accent(s, c, col_top, col_w, col_h)
add_textbox(s, c + Cm(0.9), col_top + Cm(0.6), col_w - Cm(1.8), Cm(0.7),
            "TheTower", font_name="Consolas", font_size=Pt(10),
            font_color=RGBColor(0xC0, 0xCC, 0xF0), bold=True)
add_textbox(s, c + Cm(0.9), col_top + Cm(1.6), col_w - Cm(1.8), Cm(0.7),
            "画布编排 + 浏览器执行",
            font_name="Inter", font_size=Pt(11), font_color=ACCENT_ON)
add_rect(s, c + Cm(0.9), col_top + Cm(2.6), col_w - Cm(1.8), Cm(0.02),
         fill_color=RGBColor(0x60, 0x80, 0xD0))
add_textbox(s, c + Cm(0.9), col_top + Cm(3.2), col_w - Cm(1.8), Cm(4.0),
            "✓ 低代码拖拽编排\n✓ 零成本本地部署\n✓ 全程可观测执行",
            font_name="Inter", font_size=Pt(12), font_color=ACCENT_ON,
            line_spacing=1.6, bold=False)

# ────────────────────────────────────────────────────────
# P3 · 核心创新 · 三阶段横向时间线
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_white_bg(s)
chrome_header(s, "INNOVATION", "03 / 14")
accent_category_label(s, "CORE IDEA", top=Cm(2.15))
big_title(s, "画布 × 浏览器 = 低代码 RPA", top=Cm(3.0), font_size=Pt(38))

# Timeline line
line_y = Cm(9.5)
add_rect(s, Cm(2.8), line_y, Cm(28.4), Cm(0.03), fill_color=IKB)

# Three timeline nodes
phases = [
    ("PHASE 01", "拖拽编排", "节点拖拽 · 参数配置\n连线建模"),
    ("PHASE 02", "浏览器执行", "流程解析 · 步骤映射\n真实操作"),
    ("PHASE 03", "实时回传", "状态推送 · 日志输出\n调试反馈"),
]
tech_labels = ["ReactFlow 可视化画布", "Playwright 自动化引擎", "WebSocket 实时推送"]

for i, (phase, name, desc) in enumerate(phases):
    x = Cm(5.5) + Cm(i * 9.5)
    # Dot
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, x - Cm(0.15), line_y - Cm(0.15), Cm(0.3), Cm(0.3))
    dot.fill.solid()
    dot.fill.fore_color.rgb = IKB
    dot.line.fill.background()

    # Phase label above
    add_textbox(s, x - Cm(1.5), Cm(7.0), Cm(4.5), Cm(2.2),
                f"{phase}\n{name}\n{desc}",
                font_name="Inter", font_size=Pt(11), font_color=INK,
                line_spacing=1.35, alignment=PP_ALIGN.CENTER)

    # Tech label below
    color = IKB if i == 1 else INK_HLP
    add_textbox(s, x - Cm(2.5), Cm(10.8), Cm(5.0), Cm(1.2),
                tech_labels[i],
                font_name="Consolas", font_size=Pt(9), font_color=color,
                alignment=PP_ALIGN.CENTER)

# Bottom quote
add_textbox(s, Cm(2.0), Cm(13.8), Cm(30), Cm(1.2),
            "用户不需要写一行代码，只要理解自己的业务流程",
            font_name="Inter", font_size=Pt(13), font_color=INK_HLP,
            alignment=PP_ALIGN.CENTER, line_spacing=1.3)

# ────────────────────────────────────────────────────────
# P4 · 系统架构 · 五层堆叠
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_white_bg(s)
chrome_header(s, "ARCHITECTURE", "04 / 14")
category_label(s, "SYSTEM DESIGN", top=Cm(2.15))
big_title(s, "五层架构 · 前后端分离", top=Cm(3.0), font_size=Pt(36))

layers = [
    ("LAYER 01", "前端展示层", "React + ReactFlow\n画布 · 配置 · 监控 · 调试", False),
    ("LAYER 02", "通信协议层", "REST 管理操作\nWebSocket 实时推送", False),
    ("LAYER 03", "后端服务层 ★", "Ktor + Kotlin\n模板 · 运行 · 调试 · 调度 · 认证 · 协作", True),
    ("LAYER 04", "执行引擎层", "Playwright Java\n步骤解析 · 浏览器驱动", False),
    ("LAYER 05", "数据存储层", "SQLite + 文件存储\n模板 · 运行 · 产物", False),
]

layer_h = Cm(2.2)
layer_gap = Cm(0.5)
layer_top = Cm(5.8)
layer_w = Cm(30)

for i, (num, title, desc, is_accent) in enumerate(layers):
    y = layer_top + Cm(i * (2.2 + 0.5))
    if is_accent:
        card_accent(s, Cm(2.0), y, layer_w, layer_h)
    else:
        card_outlined(s, Cm(2.0), y, layer_w, layer_h)

    text_color = ACCENT_ON if is_accent else INK
    num_color = RGBColor(0xC0, 0xCC, 0xF0) if is_accent else IKB
    desc_color = RGBColor(0xE0, 0xE8, 0xF8) if is_accent else INK_SEC

    add_textbox(s, Cm(2.8), y + Cm(0.25), Cm(5), Cm(0.5),
                num, font_name="Consolas", font_size=Pt(7), font_color=num_color,
                bold=True)
    add_textbox(s, Cm(2.8), y + Cm(0.7), Cm(8), Cm(0.8),
                title, font_name="Inter", font_size=Pt(16), font_color=text_color,
                bold=True)
    add_textbox(s, Cm(12.0), y + Cm(0.3), Cm(18), Cm(1.6),
                desc, font_name="Inter", font_size=Pt(11), font_color=desc_color,
                line_spacing=1.4)

# Bottom summary
mono_meta(s, "界面管编排 · 后端管执行 · 双通道协议解耦",
          Cm(2.0), Cm(17.5), Cm(30), Cm(0.6),
          font_size=Pt(9), align=PP_ALIGN.CENTER)

# ────────────────────────────────────────────────────────
# P5 · 技术选型 · 4×2 卡片网格
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_grey_bg(s)
chrome_header(s, "TECH STACK", "05 / 14")
category_label(s, "TECHNOLOGIES", top=Cm(2.15))
big_title(s, "技术选型一览", top=Cm(3.0), font_size=Pt(34))

techs = [
    # Row 1 — core (accent labels)
    ("v12.10", "ReactFlow", "节点式画布引擎\n拖拽 · 连线 · 小地图", True),
    ("v1.6.3", "Playwright", "跨浏览器自动化内核\nChromium · Firefox · WebKit", True),
    ("v2.3.12", "Ktor", "轻量异步 Web 服务\nREST + WebSocket", True),
    ("v3.46", "SQLite", "零配置本地持久化\n单文件 · 零运维", True),
    # Row 2 — supporting
    ("v19.2", "React", "UI 组件框架", False),
    ("v4.6", "Umi", "前端工程化框架", False),
    ("v6.2", "Ant Design", "企业级 UI 组件库", False),
    ("v6.15", "MobX", "响应式状态管理", False),
]

card_w = Cm(6.8)
card_h = Cm(4.2)
start_x = Cm(2.0)
start_y = Cm(7.0)
gap_x = Cm(1.0)
gap_y = Cm(1.0)

for i, (ver, name, desc, is_core) in enumerate(techs):
    row = i // 4
    col = i % 4
    x = start_x + Cm(col * (6.8 + 1.0))
    y = start_y + Cm(row * (4.2 + 1.0))

    card_fill(s, x, y, card_w, card_h, opacity=0.7)

    # Version tag
    ver_color = IKB if is_core else INK_HLP
    add_textbox(s, x + Cm(0.6), y + Cm(0.4), Cm(5), Cm(0.5),
                ver, font_name="Consolas", font_size=Pt(8), font_color=ver_color)

    # Name
    name_color = IKB if is_core else INK
    add_textbox(s, x + Cm(0.6), y + Cm(1.2), Cm(5), Cm(1.0),
                name, font_name="Inter", font_size=Pt(14), font_color=name_color,
                bold=True)

    # Description
    add_textbox(s, x + Cm(0.6), y + Cm(2.2), Cm(5.5), Cm(1.8),
                desc, font_name="Inter", font_size=Pt(10), font_color=INK_SEC,
                line_spacing=1.4)

# ────────────────────────────────────────────────────────
# P6 · 亮点①：可视化编排 · 截图占位
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_white_bg(s)
chrome_header(s, "HIGHLIGHT ①", "06 / 14")
accent_category_label(s, "VISUAL ORCHESTRATION", top=Cm(2.15))
big_title(s, "拖拽即编排，无需写一行代码", top=Cm(3.0), font_size=Pt(36))

# Placeholder box
ph = add_rect(s, Cm(2.0), Cm(7.5), Cm(30), Cm(8.5),
              fill_color=GREY_1, border_color=BORDER)
add_textbox(s, Cm(2.0), Cm(10.0), Cm(30), Cm(2.0),
            "📸 截图占位：screenshot-editor.png",
            font_name="Inter", font_size=Pt(14), font_color=INK_HLP,
            alignment=PP_ALIGN.CENTER)
add_textbox(s, Cm(4.0), Cm(12.0), Cm(26), Cm(2.0),
            "编辑器三栏布局 — 左侧步骤库 · 中间 ReactFlow 画布拖拽连线 · 右侧配置面板参数表单",
            font_name="Inter", font_size=Pt(11), font_color=INK_HLP,
            alignment=PP_ALIGN.CENTER, line_spacing=1.4)

# Feature tags
tags = ["自动保存", "自动布局", "撤销重做", "搜索分组", "克隆复制", "批量删除"]
tag_w = Cm(3.8)
tag_h = Cm(0.9)
tag_start = Cm(2.5)
tag_y = Cm(16.8)
for i, t in enumerate(tags):
    x = tag_start + Cm(i * (3.8 + 0.5))
    shape = add_rect(s, x, tag_y, tag_w, tag_h, fill_color=IKB)
    tf = shape.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.text = t
    p.font.name = "Inter"
    p.font.size = Pt(9)
    p.font.color.rgb = WHITE
    p.font.bold = True
    p.alignment = PP_ALIGN.CENTER

# ────────────────────────────────────────────────────────
# P7 · 亮点②：运行监控 · 截图 + 事件流
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_grey_bg(s)
chrome_header(s, "HIGHLIGHT ②", "07 / 14")
accent_category_label(s, "REAL-TIME OBSERVABILITY", top=Cm(2.15))
big_title(s, "每一秒都知道运行到了哪里", top=Cm(3.0), font_size=Pt(36))

# Left: placeholder screenshot
ph = add_rect(s, Cm(2.0), Cm(7.2), Cm(15), Cm(9.0),
              fill_color=WHITE, border_color=BORDER)
add_textbox(s, Cm(2.0), Cm(9.5), Cm(15), Cm(2.0),
            "📸 screenshot-run-monitor.png",
            font_name="Inter", font_size=Pt(12), font_color=INK_HLP,
            alignment=PP_ALIGN.CENTER)
add_textbox(s, Cm(3.5), Cm(11.5), Cm(12), Cm(2.5),
            "运行监控面板\n步骤列表 + 状态指示灯\n实时日志输出",
            font_name="Inter", font_size=Pt(11), font_color=INK_HLP,
            alignment=PP_ALIGN.CENTER, line_spacing=1.4)
mono_meta(s, "REST：创建 / 取消 / 重启运行",
          Cm(2.0), Cm(16.6), Cm(15), font_size=Pt(8), align=PP_ALIGN.CENTER)

# Right: WebSocket event flow
add_textbox(s, Cm(19.5), Cm(6.8), Cm(12), Cm(0.7),
            "WEBSOCKET 事件流", font_name="Consolas", font_size=Pt(9),
            font_color=IKB, bold=True)

events = [
    "RUN_STARTED →",
    "STEP_STARTED →",
    "STEP_SUCCEEDED / FAILED →",
    "LOG →",
    "RUN_SUCCEEDED",
]
ev_h = Cm(1.2)
ev_top = Cm(7.8)
for i, ev in enumerate(events):
    y = ev_top + Cm(i * 1.5)
    is_last = (i == len(events) - 1)
    if is_last:
        card_accent(s, Cm(19.5), y, Cm(12.5), ev_h)
        add_textbox(s, Cm(20.2), y + Cm(0.2), Cm(11), Cm(0.8),
                    ev, font_name="Consolas", font_size=Pt(10), font_color=WHITE)
    else:
        card_fill(s, Cm(19.5), y, Cm(12.5), ev_h, opacity=0.8)
        add_textbox(s, Cm(20.2), y + Cm(0.2), Cm(11), Cm(0.8),
                    ev, font_name="Consolas", font_size=Pt(10), font_color=INK_HLP)

add_textbox(s, Cm(19.5), Cm(15.6), Cm(12), Cm(0.7),
            "8 种事件类型 · 毫秒级推送",
            font_name="Inter", font_size=Pt(11), font_color=INK_SEC,
            line_spacing=1.3)

# ────────────────────────────────────────────────────────
# P8 · 亮点③：调试工作台 · 三列
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_white_bg(s)
chrome_header(s, "HIGHLIGHT ③", "08 / 14")
accent_category_label(s, "DEBUG WORKBENCH", top=Cm(2.15))
big_title(s, "出了问题，能定位、能回溯、能远程操控", top=Cm(3.0), font_size=Pt(32))

# Three cards
debug_items = [
    ("01 条件断点", "设定触发条件\n命中后自动暂停执行\n支持命中次数计数", "BREAKPOINT · CONDITIONAL"),
    ("02 时间旅行", "回看历史步骤\n变量快照+页面状态\n像倒带一样回溯", "TIME TRAVEL · SNAPSHOT"),
    ("03 远程操控", "调试预览区直接交互\n点击 · 输入 · 导航\n操控真实浏览器", "REMOTE CONTROL · PREVIEW"),
]

card_w3 = Cm(9.2)
card_start = Cm(2.0)
card_top = Cm(7.0)

for i, (title, desc, meta) in enumerate(debug_items):
    x = card_start + Cm(i * (9.2 + 0.8))
    # Card body
    card_fill(s, x, card_top, card_w3, Cm(7.5), opacity=0.85)
    # Accent top bar
    accent_bar(s, x, card_top, card_w3, Cm(0.12))
    # Title
    add_textbox(s, x + Cm(0.9), card_top + Cm(0.8), card_w3 - Cm(1.8), Cm(0.8),
                title, font_name="Consolas", font_size=Pt(10), font_color=IKB,
                bold=True)
    # Description
    add_textbox(s, x + Cm(0.9), card_top + Cm(2.0), card_w3 - Cm(1.8), Cm(3.5),
                desc, font_name="Inter", font_size=Pt(12), font_color=INK_SEC,
                line_spacing=1.55)
    # Meta footer
    hairline(s, x + Cm(0.9), card_top + Cm(5.8), card_w3 - Cm(1.8))
    add_textbox(s, x + Cm(0.9), card_top + Cm(6.0), card_w3 - Cm(1.8), Cm(0.6),
                meta, font_name="Consolas", font_size=Pt(7), font_color=INK_HLP)

# Screenshot placeholder (small, right-aligned)
ph = add_rect(s, Cm(23.5), Cm(15.0), Cm(8.5), Cm(2.8),
              fill_color=GREY_1, border_color=BORDER)
add_textbox(s, Cm(23.5), Cm(15.8), Cm(8.5), Cm(1.2),
            "📸 debug.png", font_name="Consolas", font_size=Pt(8),
            font_color=INK_HLP, alignment=PP_ALIGN.CENTER)

# ────────────────────────────────────────────────────────
# P9 · 数据与集成能力 · 四列卡片
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_grey_bg(s)
chrome_header(s, "CAPABILITIES", "09 / 14")
category_label(s, "NODE TYPES", top=Cm(2.15))
big_title(s, "不止点击输入，覆盖完整数据链路", top=Cm(3.0), font_size=Pt(34))

node_cards = [
    ("页面操作", "openUrl\nclick\ntype\nwait"),
    ("数据提取", "extract 文本\nextract 属性\n页面信息"),
    ("文件与 Excel", "saveData\nsaveExcel\nimportExcel"),
    ("网络监听", "listenRequestTrigger\nlistenRequestResult\nstopPageListen"),
]

n_card_w = Cm(6.8)
n_card_start = Cm(2.0)
n_card_top = Cm(7.0)
n_card_h = Cm(8.0)

for i, (title, items) in enumerate(node_cards):
    x = n_card_start + Cm(i * (6.8 + 0.8))
    card_fill(s, x, n_card_top, n_card_w, n_card_h, opacity=0.85)
    add_textbox(s, x + Cm(0.8), n_card_top + Cm(0.7), n_card_w - Cm(1.6), Cm(0.7),
                title, font_name="Consolas", font_size=Pt(9), font_color=IKB,
                bold=True)
    hairline(s, x + Cm(0.8), n_card_top + Cm(1.8), n_card_w - Cm(1.6))
    add_textbox(s, x + Cm(0.8), n_card_top + Cm(2.4), n_card_w - Cm(1.6), Cm(5.0),
                items, font_name="Inter", font_size=Pt(11), font_color=INK_SEC,
                line_spacing=1.6)

# Bottom summary
add_textbox(s, Cm(2.0), Cm(15.8), Cm(30), Cm(0.8),
            "页面操作 → 数据提取 → 文件落盘 → 网络观测    一个流程跑通完整业务闭环",
            font_name="Consolas", font_size=Pt(9), font_color=INK_HLP,
            alignment=PP_ALIGN.CENTER)

# ────────────────────────────────────────────────────────
# P10 · 产品化闭环 · 四列 + 打钩表
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_white_bg(s)
chrome_header(s, "PRODUCT", "10 / 14")
category_label(s, "PLATFORM CAPABILITIES", top=Cm(2.15))
big_title(s, "从工具到平台的六个模块", top=Cm(3.0), font_size=Pt(34))

prod_cards = [
    ("模板市场", "浏览 · 发布 · 导入\n模板复用降低成本"),
    ("调度任务", "单次触发 · 周期执行\n查看最近触发结果"),
    ("认证与工作空间", "登录 · 登出 · 多空间\n资源隔离 · 访问控制"),
    ("协作编辑", "模板分享 · 在线状态\n冲突提示 · 差异采纳"),
]

p_card_w = Cm(6.8)
p_card_start = Cm(2.0)
p_card_top = Cm(7.0)
p_card_h = Cm(5.5)

for i, (title, desc) in enumerate(prod_cards):
    x = p_card_start + Cm(i * (6.8 + 0.8))
    card_fill(s, x, p_card_top, p_card_w, p_card_h, opacity=0.85)
    add_textbox(s, x + Cm(0.8), p_card_top + Cm(0.7), p_card_w - Cm(1.6), Cm(0.7),
                title, font_name="Consolas", font_size=Pt(9), font_color=IKB,
                bold=True)
    add_textbox(s, x + Cm(0.8), p_card_top + Cm(2.0), p_card_w - Cm(1.6), Cm(3.0),
                desc, font_name="Inter", font_size=Pt(12), font_color=INK_SEC,
                line_spacing=1.5)

# Checkmark row
checks = ["✓ 编排", "✓ 执行", "✓ 调试", "✓ 数据", "✓ 平台", "✓ 协议"]
check_y = Cm(13.6)
check_w_total = Cm(30)
check_start = Cm(2.0)
check_step = Cm(5.0)
for i, chk in enumerate(checks):
    x = check_start + Cm(i * 5.0)
    add_textbox(s, x, check_y, Cm(5.0), Cm(0.7),
                chk, font_name="Consolas", font_size=Pt(10), font_color=IKB,
                bold=True, alignment=PP_ALIGN.CENTER)

# Divider
hairline(s, Cm(2.0), Cm(14.6), Cm(30))

# Bottom line
add_textbox(s, Cm(2.0), Cm(15.2), Cm(30), Cm(0.8),
            "首版能力闭环已完成",
            font_name="Inter", font_size=Pt(14), font_color=IKB, bold=True,
            alignment=PP_ALIGN.CENTER)

# ────────────────────────────────────────────────────────
# P11 · 测试数据仪表盘 · H-bar
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_grey_bg(s)
chrome_header(s, "QUALITY", "11 / 14")
category_label(s, "TEST DATA", top=Cm(2.15))
big_title(s, "测试数据", top=Cm(3.0), font_size=Pt(34))

# Two big KPI boxes
kpi_top = Cm(6.0)
# Left KPI — card_fill
card_fill(s, Cm(2.0), kpi_top, Cm(14.5), Cm(3.5), opacity=0.85)
add_textbox(s, Cm(2.0), kpi_top + Cm(0.4), Cm(14.5), Cm(2.5),
            "142", font_name="Inter", font_size=Pt(60), font_color=IKB, bold=True,
            alignment=PP_ALIGN.CENTER)
add_textbox(s, Cm(2.0), kpi_top + Cm(2.8), Cm(14.5), Cm(0.6),
            "测试用例总数", font_name="Consolas", font_size=Pt(9),
            font_color=INK_HLP, alignment=PP_ALIGN.CENTER)

# Right KPI — card_accent
card_accent(s, Cm(17.5), kpi_top, Cm(14.5), Cm(3.5))
add_textbox(s, Cm(17.5), kpi_top + Cm(0.4), Cm(14.5), Cm(2.5),
            "97.2%", font_name="Inter", font_size=Pt(58), font_color=WHITE, bold=True,
            alignment=PP_ALIGN.CENTER)
add_textbox(s, Cm(17.5), kpi_top + Cm(2.8), Cm(14.5), Cm(0.6),
            "总通过率", font_name="Consolas", font_size=Pt(9),
            font_color=RGBColor(0xC0, 0xCC, 0xF0), alignment=PP_ALIGN.CENTER)

# Bar chart
bar_data = [
    ("模板管理", 1.0, "22/22 100%"),
    ("流程编排", 0.95, "20/21 95.2%"),
    ("运行调试", 1.0, "48/48 100%"),
    ("数据集成", 0.90, "27/30 90.0%"),
    ("平台能力", 1.0, "7/7 100%"),
    ("协议存储", 1.0, "9/9 100%"),
    ("性能兼容", 1.0, "5/5 100%"),
]

bar_top = Cm(10.2)
bar_h = Cm(0.7)
bar_gap = Cm(0.25)
label_w = Cm(5.5)
track_w = Cm(18.5)
val_w = Cm(5.0)
bar_left = Cm(2.0)

for i, (label, pct, val) in enumerate(bar_data):
    y = bar_top + Cm(i * (0.7 + 0.25))
    # Label
    add_textbox(s, bar_left, y, label_w, bar_h,
                label, font_name="Inter", font_size=Pt(10), font_color=INK,
                line_spacing=1.0)
    # Track background
    track_x = bar_left + label_w + Cm(0.5)
    add_rect(s, track_x, y + Cm(0.15), track_w, Cm(0.4),
             fill_color=RGBColor(0xE8, 0xE8, 0xE6))
    # Fill bar
    fill_w = int(track_w * pct)
    if fill_w > 0:
        add_rect(s, track_x, y + Cm(0.15), fill_w, Cm(0.4),
                 fill_color=IKB)
    # Value
    add_textbox(s, track_x + track_w + Cm(0.4), y, val_w, bar_h,
                val, font_name="Consolas", font_size=Pt(8), font_color=INK_HLP)

# Bottom metrics
add_textbox(s, Cm(2.0), Cm(16.8), Cm(30), Cm(0.8),
            "性能指标：50节点流畅 · 3浏览器兼容 · 3流程并发",
            font_name="Consolas", font_size=Pt(9), font_color=INK_HLP,
            alignment=PP_ALIGN.CENTER)

# ────────────────────────────────────────────────────────
# P12 · 核心设计决策 · 三行 Q&A
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_white_bg(s)
chrome_header(s, "DECISIONS", "12 / 14")
category_label(s, "DESIGN RATIONALE", top=Cm(2.15))
big_title(s, "三个关键设计选择", top=Cm(3.0), font_size=Pt(34))

qas = [
    ("为什么 ReactFlow 而非自建画布？",
     "内置节点/边模型 + 拖拽缩放 + 生态成熟，无需从零实现画布层"),
    ("为什么 REST + WebSocket 而非纯轮询？",
     "管理操作需要清晰的请求响应边界，执行状态需要毫秒级实时推送"),
    ("为什么 SQLite 而非 PostgreSQL？",
     "零配置本地部署 + 毕设规模完全够用，单文件数据库降低运维成本"),
]

qa_top = Cm(7.0)
qa_step = Cm(3.5)

for i, (q, a) in enumerate(qas):
    y = qa_top + Cm(i * 3.5)
    # Q tag
    tag_shape = add_rect(s, Cm(2.0), y, Cm(1.5), Cm(1.0), fill_color=IKB)
    tf = tag_shape.text_frame
    p = tf.paragraphs[0]
    p.text = "Q"
    p.font.name = "Inter"
    p.font.size = Pt(12)
    p.font.color.rgb = WHITE
    p.font.bold = True
    p.alignment = PP_ALIGN.CENTER

    # Question
    add_textbox(s, Cm(4.2), y + Cm(0.05), Cm(27), Cm(0.9),
                q, font_name="Inter", font_size=Pt(14), font_color=INK, bold=True)
    # Answer
    add_textbox(s, Cm(4.2), y + Cm(1.2), Cm(27), Cm(1.2),
                a, font_name="Inter", font_size=Pt(12), font_color=INK_SEC,
                line_spacing=1.4)
    # Separator
    if i < 2:
        hairline(s, Cm(2.0), y + Cm(3.0), Cm(30))

# ────────────────────────────────────────────────────────
# P13 · 总结与展望 · 左右分栏
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_white_bg(s)
chrome_header(s, "CONCLUSION", "13 / 14")
accent_category_label(s, "SUMMARY", top=Cm(2.15))
big_title(s, "总结与展望", top=Cm(3.0), font_size=Pt(34))

# Left: completed items
done_items = [
    "可视化流程编排",
    "浏览器自动化执行",
    "调试排障工作台",
    "首版产品化闭环",
]

done_top = Cm(7.0)
done_step = Cm(2.2)
done_w = Cm(13.5)

add_textbox(s, Cm(2.0), Cm(6.0), done_w, Cm(0.7),
            "已完成", font_name="Consolas", font_size=Pt(9), font_color=INK_HLP,
            bold=True)

for i, item in enumerate(done_items):
    y = done_top + Cm(i * 2.2)
    is_last = (i == len(done_items) - 1)
    if is_last:
        card_accent(s, Cm(2.0), y, done_w, Cm(1.7))
        text_color = ACCENT_ON
    else:
        card_fill(s, Cm(2.0), y, done_w, Cm(1.7), opacity=0.85)
        text_color = INK
    check_color = ACCENT_ON if is_last else IKB
    add_textbox(s, Cm(2.8), y + Cm(0.35), done_w - Cm(1.6), Cm(1.0),
                f"✓  {item}", font_name="Inter", font_size=Pt(13),
                font_color=text_color, bold=True)

# Vertical divider
add_rect(s, Cm(16.8), Cm(6.5), Cm(0.05), Cm(10.5), fill_color=IKB)

# Right: future items
future_items = [
    "协作冲突自动合并",
    "细粒度权限控制",
    "长流程自动化验证",
    "持久化能力升级",
]

add_textbox(s, Cm(18.2), Cm(6.0), Cm(13.5), Cm(0.7),
            "待改进", font_name="Consolas", font_size=Pt(9), font_color=INK_HLP,
            bold=True)

for i, item in enumerate(future_items):
    y = done_top + Cm(i * 2.2)
    add_textbox(s, Cm(18.2), y + Cm(0.35), Cm(13.5), Cm(1.0),
                f"·  {item}", font_name="Inter", font_size=Pt(12), font_color=INK_HLP)

# Bottom highlight bar
highlight_bar = add_rect(s, Cm(2.0), Cm(16.5), Cm(30), Cm(1.5), fill_color=RGBColor(0xE6, 0xEA, 0xF6))
add_textbox(s, Cm(2.8), Cm(16.6), Cm(28), Cm(1.3),
            '“让浏览器自动化更简单”出发，完成了一个可编排、可执行、可调试、可协作的低代码浏览器 RPA 系统。',
            font_name="Inter", font_size=Pt(13), font_color=INK, line_spacing=1.4)
# Left accent border for the highlight
add_rect(s, Cm(2.0), Cm(16.5), Cm(0.1), Cm(1.5), fill_color=IKB)

# ────────────────────────────────────────────────────────
# P14 · 致谢 · IKB 满屏
# ────────────────────────────────────────────────────────
s = add_blank_slide(prs)
add_full_accent_bg(s)

# Grid dot decoration — small circles at top right
for r in range(8):
    for c in range(10):
        if (r + c) % 4 == 0:
            x = Cm(22) + Cm(c * 1.2)
            y = Cm(1.0) + Cm(r * 1.2)
            dot = s.shapes.add_shape(MSO_SHAPE.OVAL, x, y, Cm(0.12), Cm(0.12))
            dot.fill.solid()
            dot.fill.fore_color.rgb = RGBColor(0x40, 0x60, 0xC0)
            dot.line.fill.background()

accent_chrome_header(s, "THANK YOU", "14 / 14")

# Main thank you
add_textbox(s, Cm(2.0), Cm(5.5), Cm(30), Cm(5.0),
            "感谢各位老师\n请多指教",
            font_name="Inter", font_size=Pt(54), font_color=WHITE,
            alignment=PP_ALIGN.CENTER, line_spacing=1.1)

# Separator
add_rect(s, Cm(14.4), Cm(11.5), Cm(5.0), Cm(0.03), fill_color=RGBColor(0x80, 0x9A, 0xE0))

# Next step hint
add_textbox(s, Cm(2.0), Cm(12.5), Cm(30), Cm(1.5),
            "接下来：现场演示（3 分钟）",
            font_name="Inter", font_size=Pt(16), font_color=RGBColor(0xC0, 0xCC, 0xF0),
            alignment=PP_ALIGN.CENTER)

# ── Save ────────────────────────────────────────────────
output_path = r"C:\code\project\kotlin\TheTower\TheTower_答辩PPT.pptx"
prs.save(output_path)
print(f"PPTX saved to: {output_path}")
print(f"Slides: {len(prs.slides)}")
