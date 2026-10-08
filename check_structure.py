"""个人站结构自检：重复 id、aria 引用、分类取值与筛选计数一致性。

与 check_links.py 分工：那个查链接能否解析，这个查页面内部结构是否自洽。

用法：python check_structure.py
"""

import re
import sys
from collections import Counter
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent / "web"

BOARD_CATS = ("study", "trade", "work", "project", "explore")  # 五个板块
SHARE_KINDS = ("book", "doc", "api", "podcast", "film", "tool")  # 分享的种类

# 内容条目：<article class="post-row|feed-row|share" data-cat="x">
ROW_RE = re.compile(
    r'<(article|div)\s+class="((?:post-row|feed-row|share)[^"]*)"\s+data-cat="([a-z]+)"'
)
# 筛选按钮：<button class="filter..." ... data-cat="x"> ... <span class="count">N</span>
BUTTON_RE = re.compile(
    r'<button[^>]*class="filter[^"]*"[^>]*data-cat="([a-z]+)"[^>]*>([\s\S]{0,240}?)</button>',
    re.I,
)
ID_RE = re.compile(r'\bid\s*=\s*"([^"]+)"')
ARIA_RE = re.compile(r'(?:aria-controls|aria-labelledby)\s*=\s*"([^"]+)"')
FOR_RE = re.compile(r'<label\s+for\s*=\s*"([^"]+)"')
CAT_BADGE_RE = re.compile(r'class="count"[^>]*>\s*(\d+)\s*<')
PLATE_RE = re.compile(r'class="cat (cat-[a-z]+)"')


def check_page(path):
    """返回该页的问题列表。"""
    text = path.read_text(encoding="utf-8")
    problems = []

    # 1) 同一页面内 id 不能重复
    ids = ID_RE.findall(text)
    for dup, n in Counter(ids).items():
        if n > 1:
            problems.append(f'重复 id："{dup}" 出现 {n} 次')

    # 2) aria-controls / aria-labelledby / label[for] 要指向本页真实存在的 id
    for ref in set(ARIA_RE.findall(text) + FOR_RE.findall(text)):
        for token in ref.split():
            if token not in ids:
                problems.append(f'引用了不存在的 id：{token}')

    # 3) 条目分类取值：post-row / feed-row 只能用五个板块，share 只能用种类
    rows = ROW_RE.findall(text)
    cats = Counter(row[2] for row in rows)
    for _, classes, cat in rows:
        if "share" in classes.split() and cat not in SHARE_KINDS:
            problems.append(f"分享卡片的种类非法：{cat}")
        if "share" not in classes.split() and cat not in BOARD_CATS:
            problems.append(f"内容条目的板块非法：{cat}（class={classes}）")

    # 4) 板块配色类 .cat-* 必须还能映射到五个板块之一
    for cls in set(PLATE_RE.findall(text)):
        if cls[4:] not in BOARD_CATS:
            problems.append(f"板块配色类失效：.{cls}")

    # 5) 筛选按钮要覆盖本页出现过的全部分类，徽标数字要与实际条数一致
    buttons = BUTTON_RE.findall(text)
    if buttons:
        covered = {cat for cat, _ in buttons}
        missing = set(cats) - covered
        if missing:
            problems.append("缺少筛选按钮：" + ", ".join(sorted(missing)))
        for cat, inner in buttons:
            badge = CAT_BADGE_RE.search(inner)
            if not badge:
                continue
            expect = sum(cats.values()) if cat == "all" else cats.get(cat, 0)
            if int(badge.group(1)) != expect:
                problems.append(f"{cat} 徽标 {badge.group(1)}，实际条目 {expect}")

    # 6) 页脚的五个板块入口要齐全
    if "site-footer" in text:
        foot = text[text.index('class="site-footer"'):]
        for cat in BOARD_CATS:
            if f"notes.html?cat={cat}" not in foot:
                problems.append(f"页脚板块导航缺少 {cat}")

    return problems


def main():
    pages = sorted(WEB_DIR.glob("*.html"))
    if not pages:
        print("没找到页面：", WEB_DIR)
        return 1

    total = 0
    for page in pages:
        problems = check_page(page)
        total += len(problems)
        rows = len(ROW_RE.findall(page.read_text(encoding="utf-8")))
        print(f"{page.name:<26} 条目 {rows:>3}  " + ("OK" if not problems else "问题"))
        for item in problems:
            print("   -", item)

    print(f"\n共检查 {len(pages)} 个页面，问题 {total} 个。")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
