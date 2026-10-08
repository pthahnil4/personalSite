"""动效层自检：用真实浏览器内核（Playwright Chromium）逐项跑一遍动效。

内置预览页是隐藏状态（visibilityState: "hidden"），requestAnimationFrame 不触发，
JS 驱动的动效在那儿无法观察，所以这里用无头 Chromium 真实渲染来验证：

1. 注入层：噪点 / 极光 / 回到顶部 / 粒子画布 / 光斑 / 光标 / 导航指示 / 进度条；
2. 运行层：粒子是否真的画出来、数字滚动、滚动墙是否移动、悬停是否减速、
   鼠标跟随与视差、阅读进度、时间线生长与节点亮起、卡片倾斜、磁吸与涟漪；
3. 回归层：筛选、FAQ 折叠、留言板本机暂存、移动端导航开关——动效改造不能碰坏这些；
4. 降级层：prefers-reduced-motion 与移动端（粗指针）应当关掉哪些效果；
5. 全站 12 个页面的 JS 报错与失败请求（含资源 404）收集。

注意：视口外的元素本来就不该触发动画，测量前必须先让它露头，
所以脚本里凡是对着滚动驱动 / IntersectionObserver 的检查，都先 scroll_to()。

用法：先起本地服务器（python -m http.server 8123 --bind 127.0.0.1），再跑本脚本。
结果写到 motion-check.json，截图输出在 motion-shots/ 目录。
"""

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8123"
ROOT = Path(__file__).resolve().parent
SHOTS = ROOT / "motion-shots"
PAGES = [
    "index.html", "notes.html", "logs.html", "shares.html", "contact.html",
    "about.html", "note-market-regime.html", "note-trade-sizing.html",
    "note-kline-http2.html", "note-merge-migration.html", "note-night-run.html",
    "note-four-films.html",
]

results = []


def launch_options(playwright):
    """本机 Playwright 版本与新浏览器包版本不一致时，回落到已存在的 Chromium / Edge。"""
    for candidate in (
        Path.home() / "AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe",
        Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
        Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    ):
        if candidate.exists():
            return {"executable_path": str(candidate)}
    return {}


def mobile_options(playwright, device_name="iPhone 13"):
    """devices 里有两个键不是 new_context 的参数，需要剔除。"""
    raw = dict(playwright.devices[device_name])
    for drop in ("default_browser_type", "browser_context_options"):
        raw.pop(drop, None)
    return raw


def check(name, ok, detail=""):
    results.append({"name": name, "ok": bool(ok), "detail": str(detail)})
    print(("  PASS  " if ok else "  FAIL  ") + name + ("   " + str(detail) if detail else ""),
          flush=True)


def collect_errors(page, sink):
    """一个页面配一个 sink；换页时新建页面，避免监听器叠加重复记账。"""
    page.on("pageerror", lambda exc: sink.append(str(exc)))
    page.on("console", lambda msg: sink.append(console_text(msg)) if msg.type == "error" else None)
    # 资源 404 有时只进 network 不进 console，这里一并收
    page.on("response", lambda r: sink.append(f"HTTP {r.status} {r.url}") if r.status >= 400 else None)


def console_text(msg):
    location = msg.location or {}
    return f"{msg.text} @{location.get('url', '')}"


def real_errors(sink):
    """站点图标已经补齐；万一还有浏览器自发请求 favicon 落空，不算动效层问题。"""
    return [m for m in sink if "favicon" not in m]


def scroll_to(page, selector, block="center", settle=320):
    """把元素滚进视口——滚动驱动与 IntersectionObserver 类动效都只看视口内。"""
    page.evaluate(
        """(a) => { const el = document.querySelector(a.sel);
                    if (el) el.scrollIntoView({behavior: 'instant', block: a.block}); }""",
        {"sel": selector, "block": block},
    )
    if settle:
        page.wait_for_timeout(settle)


def scroll_by(page, ratio=0.8, settle=380):
    page.evaluate(
        "(r) => window.scrollBy({top: Math.round(window.innerHeight * r), behavior: 'instant'})",
        ratio,
    )
    page.wait_for_timeout(settle)


def align_top_to_fold(page, selector):
    """把元素顶边贴到视口下沿：滚动叙事类动效从这里开始应当是 0%。"""
    page.evaluate(
        """(sel) => { const el = document.querySelector(sel);
                      if (!el) return;
                      const r = el.getBoundingClientRect();
                      window.scrollTo({top: window.scrollY + r.top - window.innerHeight + 8,
                                       behavior: 'instant'}); }""",
        selector,
    )
    page.wait_for_timeout(360)


def scroll_top(page):
    page.evaluate("() => window.scrollTo({top: 0, behavior: 'instant'})")
    page.wait_for_timeout(320)


def canvas_lit(page, selector=".hero-canvas"):
    """画布里实际亮起的像素数，用来证明粒子真的画出来了。"""
    return page.evaluate(
        """(sel) => {
          const c = document.querySelector(sel);
          if (!c) return -1;
          const ctx = c.getContext('2d');
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1;
          return n;
        }""",
        selector,
    )


def matrix_tx(page, selector):
    """把 computed transform 解析成位移的 x 分量（matrix 与 matrix3d 都支持）。"""
    return page.evaluate(
        """(sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const t = getComputedStyle(el).transform;
          if (t === 'none') return 0;
          const m = t.match(/matrix3?d?\\(([^)]+)\\)/);
          if (!m) return t;
          const parts = m[1].split(',').map(Number);
          if (t.indexOf('matrix3d') === 0) return parts.length >= 13 ? parts[12] : null;
          return parts.length >= 6 ? parts[4] : null;
        }""",
        selector,
    )


def css_var(page, selector, name):
    return page.evaluate(
        """(a) => { const el = document.querySelector(a.sel);
                    return el ? getComputedStyle(el).getPropertyValue(a.name).trim() : null; }""",
        {"sel": selector, "name": name},
    )


def anim_name(page, selector, pseudo=""):
    return page.evaluate(
        """(a) => { const el = document.querySelector(a.sel);
                    if (!el) return null;
                    return getComputedStyle(el, a.pseudo).animationName; }""",
        {"sel": selector, "pseudo": pseudo},
    )


def sample_text(page, selector, times=16, gap=0.08):
    """按帧间隔采样同一段文本，用来观察数字滚动的过程值。"""
    out = []
    for _ in range(times):
        try:
            out.append(page.evaluate(
                "(sel) => { const e = document.querySelector(sel); return e ? e.textContent : null; }",
                selector,
            ))
        except Exception:
            out.append(None)
        time.sleep(gap)
    return out


def main():
    SHOTS.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch_options(playwright))

        # ==================== 桌面端：首页 ====================
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errs = []
        collect_errors(page, errs)

        print("\n[1] 首页：注入层（先不滚动，看静态结构）", flush=True)
        page.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
        page.wait_for_timeout(700)
        injection = page.evaluate(
            """() => {
              const ind = document.querySelector('.nav-indicator');
              return {
                noise: document.querySelectorAll('.fx-noise').length,
                noiseAnim: (document.querySelector('.fx-noise') || {}).nodeType
                  ? getComputedStyle(document.querySelector('.fx-noise')).animationName : null,
                aurora: Array.from(document.querySelectorAll('.fx-aurora')).map(e => e.parentElement.className),
                top: document.querySelectorAll('.fx-top').length,
                topOn: document.querySelectorAll('.fx-top.is-on').length,
                canvas: document.querySelectorAll('.hero-canvas').length,
                spot: document.querySelectorAll('.hero-spot').length,
                cursor: document.querySelectorAll('.fx-cursor-dot,.fx-cursor-ring').length,
                htmlCursor: document.documentElement.classList.contains('fx-cursor'),
                indicator: document.querySelectorAll('.nav-indicator').length,
                indicatorW: ind ? ind.style.width : null,
                readingBar: document.querySelectorAll('.reading-bar').length,
                sheen: document.querySelectorAll('.fx-sheen').length,
                tilt: document.querySelectorAll('.fx-tilt').length,
                marqueeItems: document.querySelectorAll('.marquee-item').length,
                statNums: document.querySelectorAll('.stat-num[data-to]').length,
              };
            }"""
        )
        check("噪点层已注入且在动", injection["noise"] == 1 and injection["noiseAnim"] == "fx-grain",
              injection["noiseAnim"])
        check("极光层注入到结尾行动区与页脚",
              injection["aurora"] == ["closing", "site-footer"], injection["aurora"])
        check("回到顶部按钮已注入（未滚动时不显示）",
              injection["top"] == 1 and injection["topOn"] == 0, injection)
        check("首屏粒子画布与光斑已注入", injection["canvas"] == 1 and injection["spot"] == 1)
        check("定制光标小点+圆环已注入", injection["cursor"] == 2 and injection["htmlCursor"])
        check("导航下划线指示条已注入并量到宽度",
              injection["indicator"] == 1 and float((injection["indicatorW"] or "0").replace("px", "")) > 0,
              injection["indicatorW"])
        check("整站阅读进度条由脚本补上", injection["readingBar"] == 1)
        check("卡片扫光/倾斜类已挂上", injection["sheen"] >= 10 and injection["tilt"] >= 5,
              f"sheen={injection['sheen']} tilt={injection['tilt']}")
        check("关键词滚动墙 28 项（14 项 ×2 份）+ 3 个滚动数字",
              injection["marqueeItems"] == 28 and injection["statNums"] == 3, injection)

        print("\n[2] 首屏：粒子、鼠标光斑跟随与视差", flush=True)
        lit = canvas_lit(page)
        check("粒子确实画进了画布", lit > 30, f"亮起像素 {lit}")
        before = page.evaluate(
            """() => ({
              mx: getComputedStyle(document.querySelector('.hero')).getPropertyValue('--mx').trim(),
              spot: getComputedStyle(document.querySelector('.hero-spot')).transform,
              live: document.querySelector('.hero').classList.contains('is-live'),
            })"""
        )
        page.mouse.move(1100, 300)
        page.wait_for_timeout(200)
        page.mouse.move(500, 220)
        page.wait_for_timeout(200)
        after = page.evaluate(
            """() => ({
              mx: getComputedStyle(document.querySelector('.hero')).getPropertyValue('--mx').trim(),
              sx: getComputedStyle(document.querySelector('.hero')).getPropertyValue('--sx').trim(),
              spot: getComputedStyle(document.querySelector('.hero-spot')).transform,
              live: document.querySelector('.hero').classList.contains('is-live'),
            })"""
        )
        check("鼠标进入首屏后光斑点亮并跟随", after["live"] and after["spot"] != before["spot"],
              f"{before['spot']} -> {after['spot']}")
        check("视差变量随鼠标改变", after["mx"] not in ("", "0", "0.000"),
              f"--mx={after['mx']} --sx={after['sx']}")
        check("标题强调字周期性光泽扫过",
              anim_name(page, ".hero-title .accent-text") == "fx-shimmer",
              anim_name(page, ".hero-title .accent-text"))
        page.screenshot(path=str(SHOTS / "01-hero-particles.png"),
                        clip={"x": 0, "y": 0, "width": 1440, "height": 780})

        print("\n[3] 统计数字：滚进视口后从 0 数到目标值", flush=True)
        # 滚动与采样之间至少有一次往返，起始值取不到 0；判据用「过程值 + 终值」
        scroll_to(page, ".stat-num", settle=0)
        samples = sample_text(page, ".stat-num", times=20, gap=0.06)
        nums = [int(s) for s in samples if s not in (None, "")]
        check("统计数字从 0 数到目标值",
              samples[-1] == "6" and len(set(samples)) >= 3 and min(nums) < 6,
              f"采样 {samples[:8]}… 终值 {samples[-1]}")

        print("\n[4] 关键词滚动墙：移动与悬停缓停", flush=True)
        scroll_to(page, ".marquee")
        x1 = matrix_tx(page, ".marquee-track")
        page.wait_for_timeout(400)
        x2 = matrix_tx(page, ".marquee-track")
        moving = isinstance(x1, (int, float)) and isinstance(x2, (int, float)) and x1 != x2
        check("关键词滚动墙在移动", moving, f"{x1} -> {x2}")
        if moving:
            page.hover(".marquee")
            page.wait_for_timeout(700)
            h1 = matrix_tx(page, ".marquee-track")
            page.wait_for_timeout(400)
            h2 = matrix_tx(page, ".marquee-track")
            check("悬停时滚动墙缓停", abs(h2 - h1) < abs(x2 - x1) * 0.6 + 0.5,
                  f"未悬停每 400ms 走 {abs(x2 - x1):.1f}px，悬停后 {abs(h2 - h1):.1f}px")

        print("\n[5] 导航：收缩、下划线滑动、阅读进度、回到顶部", flush=True)
        scroll_top(page)
        i1 = page.evaluate("() => document.querySelector('.nav-indicator').style.transform")
        page.hover('.primary-nav a[href="./about.html"]')
        page.wait_for_timeout(420)
        i2 = page.evaluate("() => document.querySelector('.nav-indicator').style.transform")
        check("下划线指示条滑到悬停项", i1 != i2, f"{i1} -> {i2}")
        page.evaluate("() => window.scrollTo({top: Math.round(document.body.scrollHeight * 0.45), behavior: 'instant'})")
        page.wait_for_timeout(500)
        header = page.evaluate(
            """() => ({
              scrolled: document.querySelector('.site-header').classList.contains('is-scrolled'),
              height: getComputedStyle(document.querySelector('.header-inner')).height,
              bar: document.querySelector('.reading-bar').style.width,
              topOn: document.querySelectorAll('.fx-top.is-on').length,
            })"""
        )
        check("滚动后导航玻璃收缩", header["scrolled"] and header["height"] == "58px", header["height"])
        check("阅读进度随滚动增长", header["bar"] not in ("0%", "", None), header["bar"])
        check("滚过约一屏后回到顶部出现", header["topOn"] == 1)

        print("\n[6] 卡片：3D 倾斜、高光跟随、标题遮罩揭示", flush=True)
        scroll_to(page, "#shelf")
        box = page.evaluate(
            """() => { const r = document.querySelector('.shelf').getBoundingClientRect();
                       return {x: r.left + r.width * 0.25, y: r.top + r.height * 0.25}; }"""
        )
        page.mouse.move(box["x"], box["y"])
        page.wait_for_timeout(200)
        tilt = page.evaluate(
            """() => { const c = document.querySelector('.shelf');
                       return {t: c.style.transform, px: c.style.getPropertyValue('--px'),
                               py: c.style.getPropertyValue('--py')}; }"""
        )
        check("卡片 3D 倾斜随鼠标变化",
              "perspective" in (tilt["t"] or "") and tilt["px"] not in ("", None),
              f"{(tilt['t'] or '')[:56]}… --px={tilt['px']} --py={tilt['py']}")
        head_clip = page.evaluate(
            """() => { const h = document.querySelector('#shelf .section-head h2');
                       if (!h) return null;
                       return {clip: getComputedStyle(h).clipPath,
                               isIn: h.closest('.section-head').classList.contains('is-in')}; }"""
        )
        check("分区标题滚动后由遮罩揭示",
              head_clip and "100%" not in head_clip["clip"], head_clip)
        page.screenshot(path=str(SHOTS / "02-shelf-tilt.png"),
                        clip={"x": 0, "y": 0, "width": 1440, "height": 900})

        print("\n[7] 按钮：磁吸与点击涟漪", flush=True)
        scroll_top(page)
        box = page.evaluate(
            """() => { const r = document.querySelector('.hero-actions .btn-accent').getBoundingClientRect();
                       return {x: r.left + r.width * 0.85, y: r.top + r.height * 0.2}; }"""
        )
        page.mouse.move(box["x"], box["y"])
        page.wait_for_timeout(150)
        magnet = page.evaluate("() => document.querySelector('.hero-actions .btn-accent').style.transform")
        check("主按钮磁吸跟随", "translate3d" in (magnet or ""), magnet)
        # 用合成 pointerdown 测涟漪，避免真实按下 <a class="btn"> 把页面导航走
        ripples = page.evaluate(
            """() => {
              const b = document.querySelector('.hero-actions .btn-accent');
              const r = b.getBoundingClientRect();
              b.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2}));
              return document.querySelectorAll('.fx-ripple').length;
            }"""
        )
        stayed = page.evaluate("() => location.pathname.endsWith('index.html')")
        check("按下按钮出现涟漪", ripples >= 1, f"涟漪元素 {ripples} 个")
        check("合成按下未误触发跳转", stayed, page.url)
        page.wait_for_timeout(1000)
        gone = page.evaluate("() => document.querySelectorAll('.fx-ripple').length")
        check("涟漪动画结束后自动移除", gone == 0, gone)

        print("\n[8] 定制光标：小点跟手、圆环遇可点元素放大", flush=True)
        d1 = matrix_tx(page, ".fx-cursor-dot")
        page.mouse.move(300, 600)
        page.wait_for_timeout(200)
        d2 = matrix_tx(page, ".fx-cursor-dot")
        wide = page.evaluate("() => document.querySelector('.fx-cursor-ring').classList.contains('is-wide')")
        check("定制光标随鼠标移动", d1 != d2, f"{d1} -> {d2}")
        check("光标经过可点元素时圆环放大", wide)

        print("\n[9] 关于页：时间线连线生长与节点亮起", flush=True)
        page.goto(f"{BASE}/about.html", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        # 逐段往下滚：一次性跳到底会让中间的元素从视口里「穿过去」，观察者不会触发
        scroll_to(page, ".stat-num")
        page.wait_for_timeout(1400)
        stats = page.evaluate(
            """() => Array.from(document.querySelectorAll('.stat-num')).map(e => e.dataset.to + '=' + e.textContent)"""
        )
        check("关于页统计数字同样数到终值",
              all(s.split("=")[0] == s.split("=")[1] for s in stats), stats)
        scroll_to(page, ".timeline", settle=0)
        align_top_to_fold(page, ".timeline")
        t0 = float(page.evaluate("() => document.querySelector('.timeline').style.getPropertyValue('--tl') || 0"))
        lit0 = page.evaluate("() => document.querySelectorAll('.tl-item.is-lit').length")
        scroll_by(page, 0.35)
        t1 = float(page.evaluate("() => document.querySelector('.timeline').style.getPropertyValue('--tl') || 0"))
        lit1 = page.evaluate("() => document.querySelectorAll('.tl-item.is-lit').length")
        scroll_by(page, 0.35)
        t2 = float(page.evaluate("() => document.querySelector('.timeline').style.getPropertyValue('--tl') || 0"))
        lit2 = page.evaluate("() => document.querySelectorAll('.tl-item.is-lit').length")
        total = page.evaluate("() => document.querySelectorAll('.tl-item').length")
        check("时间线连线随滚动逐段生长", t2 > t1 > t0, f"--tl {t0} -> {t1} -> {t2}")
        check("时间线节点逐个亮起", lit2 > lit0 and lit2 <= total, f"{lit0} -> {lit2} / 共 {total} 个")
        page.screenshot(path=str(SHOTS / "03-about-timeline.png"),
                        clip={"x": 0, "y": 0, "width": 1440, "height": 900})

        print("\n[10] 文章页 / 日志页：进度、Ken Burns、流水连线", flush=True)
        page.goto(f"{BASE}/note-market-regime.html", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        page.evaluate("() => window.scrollTo({top: document.body.scrollHeight, behavior: 'instant'})")
        page.wait_for_timeout(600)
        post_bar = page.evaluate("() => document.querySelector('.reading-bar').style.width")
        kb = anim_name(page, ".img-slot", "::before")
        check("文章页阅读进度走到接近 100%", post_bar not in ("0%", ""), post_bar)
        check("配图位 Ken Burns 在动", kb == "fx-kenburns", kb)

        page.goto(f"{BASE}/logs.html", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        dash = anim_name(page, ".feed", "::before")
        row_sheen = page.evaluate("() => document.querySelectorAll('.feed-row.fx-sheen').length")
        check("日志流水连线在流动", dash == "fx-dash", dash)
        check("日志行挂上扫光", row_sheen > 0, f"{row_sheen} 行")

        print("\n[11] 回归：筛选 / FAQ / 留言板 / 深链（改造动效后不能碰坏）", flush=True)
        page.goto(f"{BASE}/notes.html", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        page.click('.filter[data-cat="trade"]')
        page.wait_for_timeout(300)
        filt = page.evaluate(
            """() => {
              const rows = Array.from(document.querySelectorAll('.post-row'));
              const shown = rows.filter(r => !r.classList.contains('is-hidden'));
              return {shown: shown.length, total: rows.length,
                      allTrade: shown.length > 0 && shown.every(r => r.dataset.cat === 'trade'),
                      active: document.querySelector('.filter.is-active').dataset.cat};
            }"""
        )
        check("板块筛选只看交易类", filt["allTrade"] and filt["active"] == "trade", filt)
        page.goto(f"{BASE}/notes.html?cat=study", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        deep = page.evaluate(
            """() => {
              const rows = Array.from(document.querySelectorAll('.post-row'));
              const shown = rows.filter(r => !r.classList.contains('is-hidden'));
              return {active: document.querySelector('.filter.is-active').dataset.cat,
                      allStudy: shown.length > 0 && shown.every(r => r.dataset.cat === 'study')};
            }"""
        )
        check("?cat= 深链仍按板块预选", deep["active"] == "study" and deep["allStudy"], deep)

        page.goto(f"{BASE}/contact.html", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        page.click(".faq-item .faq-q")
        page.wait_for_timeout(300)
        faq = page.evaluate(
            """() => { const q = document.querySelector('.faq-item .faq-q');
                       const a = document.querySelector('.faq-item .faq-a');
                       return {exp: q.getAttribute('aria-expanded'), open: !a.hidden}; }"""
        )
        check("FAQ 折叠能展开", faq["exp"] == "true" and faq["open"], faq)
        page.evaluate("() => localStorage.removeItem('shenchensi.guestbook.v1')")
        page.fill("#m-name", "动效自检")
        page.fill("#m-body", "这是一条来自自动化检查的留言，用来确认提交链路没坏。")
        page.click("#guestbook-form button[type=submit]")
        page.wait_for_timeout(400)
        gb = page.evaluate(
            """() => {
              const raw = localStorage.getItem('shenchensi.guestbook.v1');
              return {saved: raw ? JSON.parse(raw).length : 0,
                      count: document.getElementById('msg-count').textContent,
                      done: !document.getElementById('m-done').hidden,
                      mail: document.getElementById('m-mail-link').href.slice(0, 14),
                      cards: document.querySelectorAll('#msg-box .msg').length};
            }"""
        )
        check("留言板写入本机暂存并渲染",
              gb["saved"] == 1 and gb["cards"] == 1 and gb["done"], gb)
        check("留言后给出 mailto 寄出入口", gb["mail"].startswith("mailto:"), gb["mail"])
        page.evaluate("() => localStorage.removeItem('shenchensi.guestbook.v1')")

        check("桌面端全程无 JS 报错", not real_errors(errs), real_errors(errs)[:3])
        ctx.close()

        # ==================== 降级：prefers-reduced-motion ====================
        print("\n[12] 降级：prefers-reduced-motion", flush=True)
        rm_ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        rm = rm_ctx.new_page()
        rm_errs = []
        collect_errors(rm, rm_errs)
        rm.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
        rm.wait_for_timeout(900)
        rm_state = rm.evaluate(
            """() => ({
              canvas: document.querySelectorAll('.hero-canvas').length,
              spot: document.querySelectorAll('.hero-spot').length,
              cursor: document.querySelectorAll('.fx-cursor-dot').length,
              htmlCursor: document.documentElement.classList.contains('fx-cursor'),
              tilt: document.querySelectorAll('.fx-tilt').length,
              marqueeT: getComputedStyle(document.querySelector('.marquee-track')).transform,
              noiseAnim: getComputedStyle(document.querySelector('.fx-noise')).animationName,
              shimmer: getComputedStyle(document.querySelector('.hero-title .accent-text')).animationName,
              clip: getComputedStyle(document.querySelector('#shelf .section-head h2')).clipPath,
              stats: Array.from(document.querySelectorAll('.stat-num')).map(e => e.textContent),
              top: document.querySelectorAll('.fx-top').length,
              sheen: document.querySelectorAll('.fx-sheen').length,
            })"""
        )
        check("降级：粒子画布与光斑不创建", rm_state["canvas"] == 0 and rm_state["spot"] == 0)
        check("降级：定制光标关闭且保留系统光标",
              rm_state["cursor"] == 0 and not rm_state["htmlCursor"])
        check("降级：卡片倾斜不挂，扫光仍作为样式保留",
              rm_state["tilt"] == 0 and rm_state["sheen"] > 0, rm_state["sheen"])
        check("降级：滚动墙静止", rm_state["marqueeT"] == "none", rm_state["marqueeT"])
        check("降级：噪点与标题光泽动画关掉",
              rm_state["noiseAnim"] == "none" and rm_state["shimmer"] == "none",
              f"{rm_state['noiseAnim']} / {rm_state['shimmer']}")
        check("降级：标题遮罩直接放开", "100%" not in rm_state["clip"], rm_state["clip"])
        check("降级：统计数字直接显示终值", rm_state["stats"] == ["6", "25", "3"], rm_state["stats"])
        check("降级：回到顶部作为工具仍保留", rm_state["top"] == 1)
        rm.goto(f"{BASE}/about.html", wait_until="domcontentloaded")
        rm.wait_for_timeout(600)
        rm_tl = rm.evaluate(
            """() => ({tl: document.querySelector('.timeline').style.getPropertyValue('--tl'),
                       lit: document.querySelectorAll('.tl-item.is-lit').length,
                       total: document.querySelectorAll('.tl-item').length})"""
        )
        check("降级：时间线一次性全亮", rm_tl["tl"] == "1" and rm_tl["lit"] == rm_tl["total"], rm_tl)
        check("降级：无 JS 报错", not real_errors(rm_errs), real_errors(rm_errs)[:2])
        rm_ctx.close()

        # ==================== 降级：移动端 ====================
        print("\n[13] 降级：移动端（粗指针 / 触屏）", flush=True)
        mb_ctx = browser.new_context(**mobile_options(playwright))
        mb = mb_ctx.new_page()
        mb_errs = []
        collect_errors(mb, mb_errs)
        mb.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
        mb.wait_for_timeout(900)
        mb_state = mb.evaluate(
            """() => ({
              cursor: document.querySelectorAll('.fx-cursor-dot').length,
              htmlCursor: document.documentElement.classList.contains('fx-cursor'),
              tilt: document.querySelectorAll('.fx-tilt').length,
              indicator: document.querySelectorAll('.nav-indicator').length,
              canvasW: (document.querySelector('.hero-canvas') || {}).width,
              noise: document.querySelectorAll('.fx-noise').length,
              top: document.querySelectorAll('.fx-top').length,
              overflowX: document.documentElement.scrollWidth <= window.innerWidth + 1,
            })"""
        )
        check("移动端：定制光标与倾斜不启用",
              mb_state["cursor"] == 0 and not mb_state["htmlCursor"] and mb_state["tilt"] == 0)
        check("移动端：导航滑动指示条不创建", mb_state["indicator"] == 0)
        check("移动端：粒子按面积减量",
              bool(mb_state["canvasW"]) and 0 < mb_state["canvasW"] <= 1000,
              f"canvas.width={mb_state['canvasW']}")
        check("移动端：噪点/回到顶部保留", mb_state["noise"] == 1 and mb_state["top"] == 1)
        check("移动端：无横向溢出", mb_state["overflowX"])
        mb.screenshot(path=str(SHOTS / "04-mobile-hero.png"))
        # 移动端导航开关：动效改造后仍要能打开，且抽屉必须是铺满宽度的纵列
        mb.goto(f"{BASE}/notes.html", wait_until="domcontentloaded")
        mb.wait_for_timeout(600)
        mb.click("#nav-toggle")
        mb.wait_for_timeout(450)
        nav_open = mb.evaluate(
            """() => {
              const nav = document.querySelector('.primary-nav');
              const r = nav.getBoundingClientRect();
              const links = Array.from(nav.querySelectorAll('a')).map((a) => {
                const b = a.getBoundingClientRect();
                return {w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top)};
              });
              return {
                expanded: document.getElementById('nav-toggle').getAttribute('aria-expanded'),
                navW: Math.round(r.width), vw: window.innerWidth,
                linkW: links.length ? links[0].w : 0,
                linkH: links.length ? links[0].h : 0,
                stacked: links.every((l, i) => i === 0 || l.top > links[i - 1].top),
                oneLine: links.every((l) => l.h <= 60),
              };
            }"""
        )
        check("移动端：汉堡菜单能展开导航",
              nav_open["expanded"] == "true" and nav_open["stacked"], nav_open)
        check("移动端：抽屉铺满宽度，菜单项没被压成竖排",
              nav_open["navW"] >= nav_open["vw"] - 8
              and nav_open["linkW"] >= nav_open["vw"] * 0.6
              and nav_open["oneLine"],
              f"抽屉 {nav_open['navW']}/{nav_open['vw']}px，菜单项 {nav_open['linkW']}×{nav_open['linkH']}px")
        check("移动端：无 JS 报错", not real_errors(mb_errs), real_errors(mb_errs)[:2])
        mb.screenshot(path=str(SHOTS / "05-mobile-nav.png"))
        mb_ctx.close()

        browser.close()

    # ==================== 全站逐页报错 ====================
    print("\n[14] 全站 12 个页面逐页 JS 报错收集", flush=True)
    bad = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch_options(playwright))
        scan_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        for name in PAGES:
            page = scan_ctx.new_page()
            sink = []
            collect_errors(page, sink)
            page.goto(f"{BASE}/{name}", wait_until="domcontentloaded")
            page.wait_for_timeout(700)
            # 顺带滚一遍，把滚动驱动的动效也走一遍再收错
            page.evaluate("() => window.scrollTo({top: document.body.scrollHeight, behavior: 'instant'})")
            page.wait_for_timeout(400)
            real = real_errors(sink)
            if real:
                bad.append((name, real[:2]))
            check(f"{name} 无 JS 报错", not real, real[:1])
            page.close()
        scan_ctx.close()
        browser.close()

    failed = [r for r in results if not r["ok"]]
    (ROOT / "motion-check.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n合计 {len(results)} 项，通过 {len(results) - len(failed)} 项，失败 {len(failed)} 项。")
    for item in failed:
        print("   -", item["name"], item["detail"])
    print("结果文件：", ROOT / "motion-check.json")
    print("截图目录：", SHOTS)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
