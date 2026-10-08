"""个人站链接与资源自检：复现浏览器的真实请求路径。

检查三件事：
1. 每个 HTML 页面能否从本地服务器成功取回（HTTP 200）；
2. 页面内所有 href/src 引用（相对路径）在服务器上是否真的存在；
3. 页内锚点（#xxx）在目标页面里是否真的有对应 id。

用法：python check_links.py [base_url]
"""

import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urldefrag, urlparse, urlunparse

WEB_DIR = Path(__file__).resolve().parent / "web"
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123").rstrip("/")

REF_RE = re.compile(r'(?:href|src)\s*=\s*"([^"]+)"', re.I)
ID_RE = re.compile(r'\bid\s*=\s*"([^"]+)"', re.I)


def fetch(url):
    """返回 (状态码, 文本)；失败返回 (None, 错误说明)。"""
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except Exception as exc:  # 记录具体原因，不静默跳过
        return None, str(exc)


def main():
    pages = sorted(WEB_DIR.glob("*.html"))
    if not pages:
        print("没找到页面，检查 web 目录：", WEB_DIR)
        return 1

    problems = []
    external = set()
    checked = 0

    for page in pages:
        name = page.name
        status, body = fetch(f"{BASE}/{name}")
        if status != 200:
            problems.append(f"{name} 页面本身请求失败：{status} {body}")
            continue
        print(f"页面 {name:<26} HTTP {status}  {len(body):>6} 字符")

        for ref in REF_RE.findall(body):
            target, frag = urldefrag(ref)
            if target.startswith(("mailto:", "tel:", "data:")):
                continue
            if target.startswith("http://") or target.startswith("https://"):
                external.add(target)
                continue

            checked += 1
            local = (WEB_DIR / target.split("?")[0].split("#")[0]).resolve()

            # 相对路径必须真的落在 web 目录内
            if WEB_DIR.resolve() not in local.parents and local != WEB_DIR.resolve():
                problems.append(f"{name} 引用越界：{ref}")
                continue
            if not local.exists():
                problems.append(f"{name} 引用不存在的文件：{ref}")
                continue

            # 带锚点时验证目标页面里真的有这个 id
            if frag and local.suffix == ".html":
                _, frag_body = fetch(
                    f"{BASE}/{urlparse(target).path.lstrip('/') if target else name}"
                )
                host_body = frag_body if frag_body else body
                if frag not in set(ID_RE.findall(host_body)):
                    problems.append(f"{name} 的锚点 #{frag} 在 {ref} 里找不到")

    # 服务器上的静态资源
    for asset in ("styles.css", "script.js"):
        status, _ = fetch(f"{BASE}/{asset}")
        print(f"资源 {asset:<26} HTTP {status}")
        if status != 200:
            problems.append(f"资源 {asset} 请求失败：{status}")

    print("\n检查的内部引用数：", checked)
    print("外部链接（发布后需人工确认可用）：")
    for url in sorted(external):
        print("   ", url)

    if problems:
        print("\n发现 {} 个问题：".format(len(problems)))
        for item in problems:
            print("   -", item)
        return 1

    print("\n全部通过：页面可访问，内部引用与锚点均能解析。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
