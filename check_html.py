"""个人站 HTML 结构自检：标签配对与嵌套顺序。

检查每个页面的开始/结束标签是否能正确配对（void 元素除外），
用于发现手改 HTML 时漏掉的闭合标签或错位嵌套。

用法：python check_html.py
"""

from html.parser import HTMLParser
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent / "web"

# 自闭合元素，不参与配对栈
VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class BalanceParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"多余的闭合标签 </{tag}>（第 {self.getpos()[0]} 行）")
            return
        top, pos = self.stack[-1]
        if top == tag:
            self.stack.pop()
        else:
            self.errors.append(
                f"嵌套错位：第 {pos[0]} 行的 <{top}> 应先闭合，"
                f"却在第 {self.getpos()[0]} 行闭合了 </{tag}>"
            )
            self.stack.pop()  # 继续检查后面的，避免一错刷屏


def main():
    pages = sorted(WEB_DIR.glob("*.html"))
    if not pages:
        print("没找到页面，检查 web 目录：", WEB_DIR)
        return 1

    problems = []
    for page in pages:
        parser = BalanceParser()
        parser.feed(page.read_text(encoding="utf-8"))
        unclosed = [f"<{tag}>（第 {pos[0]} 行）" for tag, pos in parser.stack]
        status = "OK" if not parser.errors and not unclosed else "有问题"
        print(f"{page.name:<28} {status}")
        for item in parser.errors + unclosed:
            problems.append(f"{page.name}：{item}")

    print(f"\n共检查 {len(pages)} 个页面，问题 {len(problems)} 个。")
    for item in problems:
        print("   -", item)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
