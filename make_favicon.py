"""生成站点图标并挂到 12 个页面的 <head>：消除 /favicon.ico 的 404，补上站点头像。

图标沿用 Orbit 的识别元素——深色圆角底 + 霓虹绿细环（与导航 logo 的 .wordmark-mark 同款），
不做花哨图形，缩到 16px 仍然认得出。

产出：
- web/favicon.svg —— 矢量主图，现代浏览器优先用它；
- web/favicon.png —— 供 apple-touch-icon 等场景；
- web/favicon.ico —— 老浏览器和爬虫默认就会请求这个路径，直接给它一份，避免 404。

用法：python make_favicon.py（重复执行安全，已有 link 不会重复插入）。
"""

import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"

BG = (6, 11, 27)          # --bg
NEON = (180, 255, 61)     # --neon

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="沈沉思个人站">
  <rect width="64" height="64" rx="14" fill="#060b1b"/>
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.5" fill="none" stroke="#b4ff3d" stroke-opacity="0.35" stroke-width="1.5"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="#b4ff3d" stroke-width="5"/>
  <circle cx="32" cy="32" r="3.6" fill="#b4ff3d"/>
</svg>
"""


def render(size: int) -> Image.Image:
    """按 SVG 同一套几何在 size 像素上重绘，保证 png/ico 与矢量版一致。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = max(2, round(size * 14 / 64))
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)
    ring = max(1, round(size * 1.5 / 64))
    draw.rounded_rectangle(
        [ring // 2, ring // 2, size - 1 - ring // 2, size - 1 - ring // 2],
        radius=max(1, radius - 1),
        outline=(180, 255, 61, 90),
        width=ring,
    )
    cx = size / 2
    r_outer = size * 15 / 64
    w = max(1, round(size * 5 / 64))
    draw.ellipse(
        [cx - r_outer, cx - r_outer, cx + r_outer, cx + r_outer],
        outline=NEON,
        width=w,
    )
    r_dot = max(1.0, size * 3.6 / 64)
    draw.ellipse(
        [cx - r_dot, cx - r_dot, cx + r_dot, cx + r_dot],
        fill=NEON,
    )
    return img


def patch_heads() -> list[str]:
    """把图标 link 插进每个页面的 theme-color 之后；已存在就跳过。"""
    block = (
        '<link rel="icon" href="./favicon.svg" type="image/svg+xml" />\n'
        "    "
        '<link rel="alternate icon" href="./favicon.ico" />\n'
        "    "
        '<link rel="apple-touch-icon" href="./favicon.png" />'
    )
    touched = []
    for html in sorted(WEB.glob("*.html")):
        text = html.read_text(encoding="utf-8")
        if "favicon.svg" in text:
            continue
        anchor = re.search(r'(<meta name="theme-color"[^>]*/>\n)', text)
        if not anchor:
            print(f"跳过 {html.name}：找不到 theme-color 锚点")
            continue
        pos = anchor.end()
        indent = "    "
        text = text[:pos] + indent + block + "\n" + text[pos:]
        html.write_text(text, encoding="utf-8")
        touched.append(html.name)
    return touched


def main():
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "favicon.svg").write_text(SVG, encoding="utf-8")
    render(180).save(WEB / "favicon.png")
    render(64).save(
        WEB / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    touched = patch_heads()
    print("已生成：favicon.svg / favicon.png / favicon.ico")
    print("已挂上图标的页面：" + ("、".join(touched) if touched else "（全部已存在，无需改动）"))


if __name__ == "__main__":
    main()
