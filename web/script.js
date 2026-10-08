/* 个人站公共交互脚本 —— 原生 JS，无外部依赖，多页面共用（缺元素时静默跳过） */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const many = (selector, scope) =>
    Array.from((scope || document).querySelectorAll(selector));

  /* ---------------------------------------------------------- 1. 顶部导航 */
  const header = document.querySelector(".site-header");
  const nav = document.getElementById("primary-nav");
  const navToggle = document.getElementById("nav-toggle");

  if (header) {
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  if (nav && navToggle) {
    const setNavOpen = (open) => {
      nav.classList.toggle("is-open", open);
      navToggle.setAttribute("aria-expanded", String(open));
    };

    navToggle.addEventListener("click", () => {
      setNavOpen(!nav.classList.contains("is-open"));
    });

    // 点击菜单项后收起移动端菜单
    nav.addEventListener("click", (event) => {
      if (event.target.matches("a")) setNavOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        setNavOpen(false);
        navToggle.focus();
      }
    });
  }

  /* 首页锚点区块滚动时高亮对应导航项（内页无锚点区块则自动跳过） */
  if (nav) {
    const navLinks = many("a", nav).filter(
      (link) => (link.getAttribute("href") || "").charAt(0) === "#"
    );
    const sections = navLinks
      .map((link) => document.getElementById(link.getAttribute("href").slice(1)))
      .filter(Boolean);

    if ("IntersectionObserver" in window && sections.length) {
      const markActive = (id) => {
        navLinks.forEach((link) =>
          link.classList.toggle(
            "is-active",
            link.getAttribute("href") === "#" + id
          )
        );
      };

      const sectionObserver = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible) markActive(visible.target.id);
        },
        { rootMargin: "-45% 0px -45% 0px", threshold: [0.05, 0.3, 0.6] }
      );
      sections.forEach((section) => sectionObserver.observe(section));
    }
  }

  /* ---------------------------------------------------------- 2. 入场动效 */
  const reveals = many(".reveal");
  many(".hero .reveal").forEach((el, i) => {
    el.style.setProperty("--i", i);
  });

  if (!reveals.length) {
    /* 本页没有需要入场的元素 */
  } else if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-in"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach((el) => revealObserver.observe(el));
    // 保险：3 秒后仍未触发的元素直接显示
    setTimeout(() => reveals.forEach((el) => el.classList.add("is-in")), 3200);
  }

  /* ------------------------------------------------ 3. 内容列表分类筛选 */
  // 长文列表（.post-row）、短日志流（.feed-row）、分享卡片（.share）共用同一套筛选
  const filters = many(".filter[data-cat]");
  const rows = many(".post-row[data-cat], .feed-row[data-cat], .share[data-cat]");

  if (filters.length && rows.length) {
    const emptyHint = document.getElementById("list-empty");
    const countLabel = document.getElementById("list-count");
    const total = rows.length;
    const unit = rows.some((row) => row.classList.contains("post-row"))
      ? "篇"
      : "条";

    const applyCat = (cat, updateUrl) => {
      let shown = 0;
      rows.forEach((row) => {
        const match = cat === "all" || row.dataset.cat === cat;
        row.classList.toggle("is-hidden", !match);
        if (match) shown += 1;
      });

      filters.forEach((button) => {
        const active = button.dataset.cat === cat;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });

      if (emptyHint) emptyHint.hidden = shown > 0;
      if (countLabel) {
        countLabel.textContent =
          cat === "all"
            ? `全部 ${total} ${unit}`
            : `当前分类 ${shown} ${unit} · 共 ${total} ${unit}`;
      }

      if (updateUrl && window.history && history.replaceState) {
        const url = new URL(window.location.href);
        if (cat === "all") url.searchParams.delete("cat");
        else url.searchParams.set("cat", cat);
        history.replaceState(null, "", url);
      }
    };

    filters.forEach((button) => {
      button.addEventListener("click", () => applyCat(button.dataset.cat, true));
    });

    // 支持 ?cat=work 之类的链接直接停在某个分类上
    const wanted = new URLSearchParams(window.location.search).get("cat");
    const valid = filters.some((button) => button.dataset.cat === wanted);
    applyCat(valid ? wanted : "all", false);
  }

  /* ------------------------------------------------------------ 4. FAQ 折叠 */
  const faqItems = many(".faq-item");

  if (faqItems.length) {
    faqItems.forEach((item) => {
      const button = item.querySelector(".faq-q");
      const panel = item.querySelector(".faq-a");
      if (!button || !panel) return;

      button.addEventListener("click", () => {
        const willOpen = button.getAttribute("aria-expanded") !== "true";

        // 收起其他项，保持页面专注
        faqItems.forEach((other) => {
          if (other === item) return;
          const ob = other.querySelector(".faq-q");
          const op = other.querySelector(".faq-a");
          if (ob && op && ob.getAttribute("aria-expanded") === "true") {
            ob.setAttribute("aria-expanded", "false");
            op.style.maxHeight = "0px";
            setTimeout(() => {
              if (ob.getAttribute("aria-expanded") === "false") op.hidden = true;
            }, 320);
          }
        });

        button.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) {
          panel.hidden = false;
          panel.style.maxHeight = panel.scrollHeight + "px";
        } else {
          panel.style.maxHeight = "0px";
          setTimeout(() => {
            if (button.getAttribute("aria-expanded") === "false") {
              panel.hidden = true;
            }
          }, 320);
        }
      });
    });

    window.addEventListener("resize", () => {
      faqItems.forEach((item) => {
        const button = item.querySelector(".faq-q");
        const panel = item.querySelector(".faq-a");
        if (button && panel && button.getAttribute("aria-expanded") === "true") {
          panel.style.maxHeight = panel.scrollHeight + "px";
        }
      });
    });
  }

  /* ---------------------------------------------- 5. 阅读进度（文章按正文，整站按页面） */
  const postArticle = document.querySelector(".post");
  const readingBar = document.querySelector(".reading-bar") || makeReadingBar();

  function makeReadingBar() {
    // 文章页的 HTML 里已经带了进度条，其余页面由脚本补一条，页面太短就一直停在 0
    if (!document.querySelector(".site-header")) return null;
    const bar = document.createElement("div");
    bar.className = "reading-bar";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    return bar;
  }

  if (readingBar) {
    const setProgress = () => {
      let ratio = 0;
      if (postArticle) {
        const total = postArticle.offsetHeight - window.innerHeight;
        const done = Math.min(
          Math.max(window.scrollY - postArticle.offsetTop, 0),
          Math.max(total, 1)
        );
        ratio = total > 0 ? done / total : 0;
      } else {
        const root = document.documentElement;
        const total = root.scrollHeight - window.innerHeight;
        ratio = total > 0 ? window.scrollY / total : 0;
      }
      readingBar.style.width = (Math.min(Math.max(ratio, 0), 1) * 100).toFixed(2) + "%";
    };
    setProgress();
    window.addEventListener("scroll", setProgress, { passive: true });
    window.addEventListener("resize", setProgress);
  }

  /* -------------------------------------------- 6. 留言板（本机暂存 + 邮件移交） */
  const gbForm = document.getElementById("guestbook-form");

  if (gbForm) {
    const STORE_KEY = "shenchensi.guestbook.v1";
    const MAX_BODY = 600;
    const mailTo = gbForm.dataset.mail || "hi@example.com";

    const nameInput = document.getElementById("m-name");
    const contactInput = document.getElementById("m-contact");
    const bodyInput = document.getElementById("m-body");
    const bodyCount = document.getElementById("m-count");
    const formError = document.getElementById("m-error");
    const doneNote = document.getElementById("m-done");
    const mailLink = document.getElementById("m-mail-link");
    const listBox = document.getElementById("msg-box");
    const listEmpty = document.getElementById("msg-empty");
    const listCount = document.getElementById("msg-count");
    const copyBtn = document.getElementById("msg-copy");
    const clearBtn = document.getElementById("msg-clear");

    /* 本机存储不可用时（隐私模式等）自动降级为「只走邮件」 */
    let storageOk = true;
    try {
      window.localStorage.setItem(STORE_KEY + ".probe", "1");
      window.localStorage.removeItem(STORE_KEY + ".probe");
    } catch (storageErr) {
      storageOk = false;
    }

    const load = () => {
      if (!storageOk) return [];
      try {
        const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch (parseErr) {
        return [];
      }
    };

    const persist = () => {
      if (!storageOk) return false;
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(messages));
        return true;
      } catch (writeErr) {
        storageOk = false;
        return false;
      }
    };

    let messages = load();

    const stamp = (iso) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    };

    const mailtoFor = (msg) => {
      const subject = `网友留言 · ${msg.name}`;
      const body = [
        msg.body,
        "",
        "————————",
        `称呼：${msg.name}`,
        `联系方式：${msg.contact || "未填写"}`,
        `提交时间：${stamp(msg.at)}`,
        "（来自沈沉思个人站留言板）",
      ].join("\n");
      return `mailto:${mailTo}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
    };

    const setError = (input, message) => {
      const field = input.closest(".field");
      const output = field ? field.querySelector(".field-error") : null;
      if (!field) return !message;
      if (message) {
        field.classList.add("has-error");
        input.setAttribute("aria-invalid", "true");
      } else {
        field.classList.remove("has-error");
        input.removeAttribute("aria-invalid");
      }
      if (output) output.textContent = message || "";
      return !message;
    };

    const validate = () => {
      const name = nameInput.value.trim();
      const body = bodyInput.value.trim();
      const contact = contactInput.value.trim();

      let first = null;
      if (name.length < 1 || name.length > 24) {
        setError(nameInput, "写个称呼，1 到 24 个字。");
        first = first || nameInput;
      } else {
        setError(nameInput, "");
      }

      if (body.length < 4) {
        setError(bodyInput, "再多写几句，至少 4 个字。");
        first = first || bodyInput;
      } else if (body.length > MAX_BODY) {
        setError(bodyInput, `太长啦，最多 ${MAX_BODY} 字。`);
        first = first || bodyInput;
      } else {
        setError(bodyInput, "");
      }

      if (contact && !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(contact)) {
        setError(contactInput, "邮箱格式不太对，留空也可以。");
        first = first || contactInput;
      } else {
        setError(contactInput, "");
      }

      if (first) {
        if (formError) formError.hidden = false;
        first.focus();
        return null;
      }
      if (formError) formError.hidden = true;
      return {
        name,
        contact,
        body,
        at: new Date().toISOString(),
        id: `m${Date.now().toString(36)}`,
      };
    };

    const render = () => {
      if (!listBox) return;
      listBox.innerHTML = "";

      messages
        .slice()
        .reverse()
        .forEach((msg) => {
          const card = document.createElement("article");
          card.className = "msg";

          const head = document.createElement("p");
          head.className = "msg-head";
          const who = document.createElement("strong");
          who.className = "msg-name";
          who.textContent = msg.name;
          const when = document.createElement("span");
          when.textContent = stamp(msg.at);
          head.append(who, when);
          if (msg.contact) {
            const back = document.createElement("span");
            back.textContent = `回信：${msg.contact}`;
            head.append(back);
          }

          const body = document.createElement("p");
          body.className = "msg-body";
          body.textContent = msg.body;

          const actions = document.createElement("p");
          actions.className = "msg-actions";

          const resend = document.createElement("a");
          resend.className = "btn-tiny";
          resend.href = mailtoFor(msg);
          resend.textContent = "再寄一次";

          const drop = document.createElement("button");
          drop.type = "button";
          drop.className = "btn-tiny";
          drop.textContent = "删掉这条";
          drop.addEventListener("click", () => {
            messages = messages.filter((item) => item.id !== msg.id);
            if (!persist()) if (doneNote) doneNote.hidden = false;
            render();
          });

          actions.append(resend, drop);
          card.append(head, body, actions);
          listBox.append(card);
        });

      if (listEmpty) listEmpty.hidden = messages.length > 0;
      if (listCount) {
        listCount.textContent = messages.length
          ? `这台设备上暂存 ${messages.length} 条`
          : "这台设备上还没有暂存";
      }
      if (copyBtn) copyBtn.hidden = messages.length === 0;
      if (clearBtn) clearBtn.hidden = messages.length === 0;
    };

    if (bodyInput) {
      bodyInput.setAttribute("maxlength", String(MAX_BODY));
      bodyInput.addEventListener("input", () => {
        if (bodyCount) {
          bodyCount.textContent = `${bodyInput.value.length} / ${MAX_BODY}`;
        }
      });
    }

    gbForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const msg = validate();
      if (!msg) return;

      messages.push(msg);
      const saved = persist();
      render();

      if (mailLink) {
        mailLink.href = mailtoFor(msg);
        mailLink.focus();
      }
      if (doneNote) doneNote.hidden = false;
      if (!saved && formError) {
        formError.hidden = false;
        formError.textContent = "这台设备不允许本地存储，留言只保留在当前页面，请用上面的链接寄出。";
      }

      gbForm.reset();
      if (bodyCount) bodyCount.textContent = `0 / ${MAX_BODY}`;
      [nameInput, contactInput, bodyInput].forEach((input) => setError(input, ""));
    });

    if (copyBtn) {
      /* 兜底：剪贴板 API 需要页面处于焦点，拿不到时用临时 textarea + execCommand */
      const copyBySelection = (text) => {
        const holder = document.createElement("textarea");
        holder.value = text;
        holder.setAttribute("readonly", "");
        holder.style.position = "fixed";
        holder.style.top = "-9999px";
        document.body.appendChild(holder);
        holder.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } catch (copyErr) {
          ok = false;
        }
        document.body.removeChild(holder);
        return ok;
      };

      copyBtn.addEventListener("click", async () => {
        const text = messages
          .map(
            (msg) =>
              `${stamp(msg.at)} ${msg.name}：${msg.body}${
                msg.contact ? `（回信 ${msg.contact}）` : ""
              }`
          )
          .join("\n");
        let ok = false;
        try {
          await navigator.clipboard.writeText(text);
          ok = true;
        } catch (clipErr) {
          ok = copyBySelection(text);
        }
        copyBtn.textContent = ok ? "已复制" : "复制失败，请手动选中";
        setTimeout(() => {
          copyBtn.textContent = "复制全部留言";
        }, 1800);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        messages = [];
        persist();
        render();
        if (doneNote) doneNote.hidden = true;
      });
    }

    if (!storageOk && formError) {
      formError.hidden = false;
      formError.textContent = "当前浏览器不允许本地存储，留言不会被暂存，只能通过邮件寄出。";
    }

    render();
  }

  /* ============================================================ 动效层 v3
   * 约定：装饰层一律 pointer-events:none；只动 transform / opacity / clip-path，
   * 不触发重排；所有循环动画挂在同一个 rAF 调度器上，切到后台浏览器自动停，
   * 回前台自动续；元素不在视口内时任务直接跳过；跟随类效果的逼近系数取得很大，
   * 刻意把延迟压到几乎没有，避免晃眼。 */
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const canHover = window.matchMedia("(hover: hover)").matches;
  const deskFx = finePointer && canHover && !reduceMotion;

  const fxJobs = [];
  let fxRaf = 0;
  const fxFrame = (now) => {
    fxRaf = 0;
    for (let i = 0; i < fxJobs.length; i += 1) fxJobs[i](now);
    if (fxJobs.length > 0) fxRaf = requestAnimationFrame(fxFrame);
  };
  const fxAdd = (job) => {
    if (fxJobs.indexOf(job) === -1) fxJobs.push(job);
    if (!fxRaf) fxRaf = requestAnimationFrame(fxFrame);
  };
  const fxRemove = (job) => {
    const at = fxJobs.indexOf(job);
    if (at > -1) fxJobs.splice(at, 1);
  };
  const fxClamp = (value, low, high) => Math.min(Math.max(value, low), high);
  // 以 60fps 为一单位的时长差，高刷屏上动画速度保持一致
  const fxStep = (now, last) => fxClamp((now - last) / 16.67, 0, 3);

  /* 元素是否在当前视口附近（供循环任务自行休眠） */
  const fxOnScreen = (el, onEnter) => {
    // 初始状态直接用几何位置判定，避免观察者回调到达前第一次计算被漏掉
    const rect = el.getBoundingClientRect();
    const state = { visible: rect.bottom > -140 && rect.top < window.innerHeight + 140 };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            state.visible = entry.isIntersecting;
            // 元素刚露头就补算一次：锚点跳转、恢复滚动位置时不会再有 scroll 事件
            if (entry.isIntersecting && onEnter) onEnter();
          }),
        { rootMargin: "140px 0px" }
      );
      io.observe(el);
    }
    return state;
  };

  /* 滚动驱动的效果：每帧最多算一次，且只在元素可见时算 */
  const fxOnScroll = (el, update) => {
    let queued = false;
    const kick = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (watch.visible) update();
      });
    };
    const watch = fxOnScreen(el, kick);
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    kick();
  };

  /* -------------------------------------- 7. 环境质感：噪点 / 极光 / 回到顶部 */
  const fxGrain = document.createElement("div");
  fxGrain.className = "fx-noise";
  fxGrain.setAttribute("aria-hidden", "true");
  document.body.appendChild(fxGrain);

  many(".closing, .site-footer").forEach((zone) => {
    const aurora = document.createElement("div");
    aurora.className = "fx-aurora";
    aurora.setAttribute("aria-hidden", "true");
    zone.insertBefore(aurora, zone.firstChild);
  });

  const backTop = document.createElement("button");
  backTop.type = "button";
  backTop.className = "fx-top";
  backTop.setAttribute("aria-label", "回到顶部");
  backTop.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 20V6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />' +
    '<path d="M6 12l6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />' +
    "</svg>";
  document.body.appendChild(backTop);

  const toggleBackTop = () =>
    backTop.classList.toggle("is-on", window.scrollY > window.innerHeight * 0.9);
  toggleBackTop();
  window.addEventListener("scroll", toggleBackTop, { passive: true });
  backTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  /* -------------------------------- 8. 首屏：粒子星链 + 几乎零延迟的鼠标光晕 */
  const heroSection = document.querySelector(".hero");
  if (heroSection && !reduceMotion) {
    const heroSpot = document.createElement("div");
    heroSpot.className = "hero-spot";
    heroSpot.setAttribute("aria-hidden", "true");

    const heroCanvas = document.createElement("canvas");
    heroCanvas.className = "hero-canvas";
    heroCanvas.setAttribute("aria-hidden", "true");

    heroSection.insertBefore(heroSpot, heroSection.firstChild);
    heroSection.insertBefore(heroCanvas, heroSpot.nextSibling);

    const paint =
      typeof heroCanvas.getContext === "function"
        ? heroCanvas.getContext("2d")
        : null;

    if (paint) {
      let heroW = 0;
      let heroH = 0;
      let dots = [];
      const mouse = {
        tx: 0, ty: 0, x: 0, y: 0,        // 光斑：目标 / 当前（像素）
        tgx: 0, tgy: 0, gx: 0, gy: 0,    // 视差：目标 / 当前（-1..1）
        live: false,
      };

      const seedDots = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        heroW = heroSection.offsetWidth;
        heroH = heroSection.offsetHeight;
        heroCanvas.width = Math.max(1, Math.round(heroW * dpr));
        heroCanvas.height = Math.max(1, Math.round(heroH * dpr));
        paint.setTransform(dpr, 0, 0, dpr, 0, 0);
        // 粒子数按面积给，最少 18 颗、最多 70 颗，窄屏不会变卡
        const count = Math.round(fxClamp((heroW * heroH) / 17000, 18, 70));
        dots = [];
        for (let i = 0; i < count; i += 1) {
          dots.push({
            x: Math.random() * heroW,
            y: Math.random() * heroH,
            r: 0.7 + Math.random() * 1.6,
            vx: (Math.random() - 0.5) * 0.24,
            vy: (Math.random() - 0.5) * 0.24,
            a: 0.34 + Math.random() * 0.5,
          });
        }
      };
      seedDots();

      let seedQueued = false;
      window.addEventListener("resize", () => {
        if (seedQueued) return;
        seedQueued = true;
        requestAnimationFrame(() => {
          seedQueued = false;
          seedDots();
        });
      });

      if (finePointer) {
        heroSection.addEventListener("pointermove", (event) => {
          const rect = heroSection.getBoundingClientRect();
          mouse.tx = event.clientX - rect.left;
          mouse.ty = event.clientY - rect.top;
          mouse.tgx = fxClamp((mouse.tx / rect.width) * 2 - 1, -1, 1);
          mouse.tgy = fxClamp((mouse.ty / rect.height) * 2 - 1, -1, 1);
          if (!mouse.live) {
            mouse.live = true;
            mouse.x = mouse.tx;
            mouse.y = mouse.ty;
            heroSection.classList.add("is-live");
          }
        });
        heroSection.addEventListener("pointerleave", () => {
          mouse.live = false;
          mouse.tgx = 0;
          mouse.tgy = 0;
          heroSection.classList.remove("is-live");
        });
      }

      const heroWatch = fxOnScreen(heroSection);
      const linkRange = 132;
      let heroLast = performance.now();

      const drawHero = (now) => {
        const dt = fxStep(now, heroLast);
        heroLast = now;
        if (!heroWatch.visible) return;

        // 每帧逼近目标 30%：位移只有十几像素，肉眼几乎看不出延迟
        mouse.x += (mouse.tx - mouse.x) * 0.3 * dt;
        mouse.y += (mouse.ty - mouse.y) * 0.3 * dt;
        mouse.gx += (mouse.tgx - mouse.gx) * 0.3 * dt;
        mouse.gy += (mouse.tgy - mouse.gy) * 0.3 * dt;
        heroSection.style.setProperty("--sx", mouse.x.toFixed(1) + "px");
        heroSection.style.setProperty("--sy", mouse.y.toFixed(1) + "px");
        heroSection.style.setProperty("--mx", mouse.gx.toFixed(3));
        heroSection.style.setProperty("--my", mouse.gy.toFixed(3));

        for (let i = 0; i < dots.length; i += 1) {
          const dot = dots[i];
          dot.x += dot.vx * dt;
          dot.y += dot.vy * dt;
          if (dot.x < -24) dot.x = heroW + 24;
          else if (dot.x > heroW + 24) dot.x = -24;
          if (dot.y < -24) dot.y = heroH + 24;
          else if (dot.y > heroH + 24) dot.y = -24;
        }

        paint.clearRect(0, 0, heroW, heroH);
        paint.lineWidth = 1;
        for (let i = 0; i < dots.length; i += 1) {
          for (let j = i + 1; j < dots.length; j += 1) {
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const distSq = dx * dx + dy * dy;
            if (distSq > linkRange * linkRange) continue;
            const alpha = (1 - Math.sqrt(distSq) / linkRange) * 0.2;
            paint.strokeStyle = "rgba(180,255,61," + alpha.toFixed(3) + ")";
            paint.beginPath();
            paint.moveTo(dots[i].x, dots[i].y);
            paint.lineTo(dots[j].x, dots[j].y);
            paint.stroke();
          }
        }
        for (let i = 0; i < dots.length; i += 1) {
          const dot = dots[i];
          let near = 0;
          if (mouse.live) {
            const d = Math.hypot(dot.x - mouse.x, dot.y - mouse.y);
            near = Math.max(0, 1 - d / 180);
          }
          paint.fillStyle =
            "rgba(196,255,102," + Math.min(0.95, dot.a + near * 0.45).toFixed(3) + ")";
          paint.beginPath();
          paint.arc(dot.x, dot.y, dot.r + near * 0.9, 0, Math.PI * 2);
          paint.fill();
        }
      };
      fxAdd(drawHero);
    }
  }

  /* ------------------------------------------- 9. 统计数字：进入视口从 0 数上去 */
  const statNums = many(".stat-num[data-to]");
  if (statNums.length && !reduceMotion && "IntersectionObserver" in window) {
    statNums.forEach((el) => {
      const target = Number(el.dataset.to);
      const decimals = Number(el.dataset.decimals || 0);
      if (!isFinite(target)) return;
      const show = (value) => {
        el.textContent = decimals ? value.toFixed(decimals) : String(Math.round(value));
      };
      let done = false;
      show(0);
      const io = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting || done) return;
            observer.disconnect();
            const start = performance.now();
            const span = 1150;
            const job = (now) => {
              const p = fxClamp((now - start) / span, 0, 1);
              show(target * (1 - Math.pow(1 - p, 3)));
              if (p >= 1) {
                done = true;
                show(target);
                fxRemove(job);
              }
            };
            fxAdd(job);
          });
        },
        // 只要有任意一部分露头就开始数，避免半遮时还停在 0
        { threshold: 0 }
      );
      io.observe(el);
      // 兜底：六秒后如果数字其实已经在视口里却没被触发，就直接显示终值
      setTimeout(() => {
        if (done) return;
        const rect = el.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          done = true;
          io.disconnect();
          show(target);
        }
      }, 6000);
    });
  }

  /* --------------------------------------- 10. 关键词滚动墙：悬停时缓停不是急停 */
  many(".marquee").forEach((marquee) => {
    if (reduceMotion) return;
    const track = marquee.querySelector(".marquee-track");
    if (!track) return;

    let half = 0;
    let offset = 0;
    let speed = 0;
    let resting = 0.55;
    let hovering = false;
    const watch = fxOnScreen(marquee);

    const measure = () => {
      const total = track.scrollWidth;
      half = total / 2;
      // 内容没有超出容器就没必要滚动
      const fits = half <= marquee.clientWidth + 40;
      resting = fits ? 0 : 0.55;
    };
    measure();
    window.addEventListener("resize", measure);

    marquee.addEventListener("pointerenter", () => {
      hovering = true;
    });
    marquee.addEventListener("pointerleave", () => {
      hovering = false;
    });

    let last = performance.now();
    const job = (now) => {
      const dt = fxStep(now, last);
      last = now;
      if (!watch.visible || half <= 0 || resting === 0) return;
      const goal = hovering ? 0 : resting;
      speed += (goal - speed) * 0.05 * dt; // 悬停时逐渐减速到停
      offset -= speed * dt;
      if (offset <= -half) offset += half;
      track.style.transform = "translate3d(" + offset.toFixed(2) + "px,0,0)";
    };
    fxAdd(job);
  });

  /* ------------------------------------------- 11. 一级导航：下划线滑动指示 */
  if (nav && deskFx) {
    const indicator = document.createElement("span");
    indicator.className = "nav-indicator";
    indicator.setAttribute("aria-hidden", "true");
    nav.appendChild(indicator);

    const currentLink = () =>
      nav.querySelector(".is-current") || nav.querySelector("a");

    const placeIndicator = (link) => {
      const target = link || currentLink();
      if (!target) {
        indicator.style.opacity = "0";
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const linkRect = target.getBoundingClientRect();
      if (!linkRect.width) {
        indicator.style.opacity = "0";
        return;
      }
      indicator.style.width = linkRect.width.toFixed(1) + "px";
      indicator.style.transform =
        "translate3d(" + (linkRect.left - navRect.left).toFixed(1) + "px,0,0)";
      indicator.style.opacity = "1";
    };

    nav.addEventListener("pointerover", (event) => {
      const link = event.target.closest("a");
      if (link && link.parentElement === nav) placeIndicator(link);
    });
    nav.addEventListener("pointerleave", () => placeIndicator());
    window.addEventListener("resize", () => placeIndicator());
    window.addEventListener("load", () => placeIndicator());
    placeIndicator();
  }

  /* --------------------------- 12. 关于页时间线：连线随滚动生长，节点逐个亮起 */
  many(".timeline").forEach((tl) => {
    const items = many(".tl-item", tl);
    if (!items.length) return;
    if (reduceMotion) {
      tl.style.setProperty("--tl", "1");
      items.forEach((item) => item.classList.add("is-lit"));
      return;
    }
    fxOnScroll(tl, () => {
      const rect = tl.getBoundingClientRect();
      const line = window.innerHeight * 0.78;
      const ratio = fxClamp((line - rect.top) / Math.max(rect.height, 1), 0, 1);
      tl.style.setProperty("--tl", ratio.toFixed(3));
      items.forEach((item) => {
        const itemTop = item.getBoundingClientRect().top;
        item.classList.toggle("is-lit", itemTop < line);
      });
    });
  });

  /* -------------------- 13. 卡片：3D 倾斜 + 高光跟随（仅桌面），列表行只做扫光 */
  many(".shelf, .link-item").forEach((card) => {
    if (!deskFx) return;
    card.classList.add("fx-tilt", "fx-sheen");
    const maxTilt = 4.5;
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const nx = fxClamp((event.clientX - rect.left) / rect.width, 0, 1);
      const ny = fxClamp((event.clientY - rect.top) / rect.height, 0, 1);
      card.style.setProperty("--px", (nx * 100).toFixed(1) + "%");
      card.style.setProperty("--py", (ny * 100).toFixed(1) + "%");
      card.style.transform =
        "perspective(760px) rotateX(" +
        ((0.5 - ny) * maxTilt * 2).toFixed(2) +
        "deg) rotateY(" +
        ((nx - 0.5) * maxTilt * 2).toFixed(2) +
        "deg) translate3d(0,-3px,0)";
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
      card.style.setProperty("--px", "50%");
      card.style.setProperty("--py", "50%");
    });
  });

  many(
    ".share, .post-row, .feed-row, .week-card"
  ).forEach((card) => card.classList.add("fx-sheen"));

  /* ------------------------------------------ 14. 磁吸按钮 + 点击涟漪（全设备） */
  if (!reduceMotion) {
    many(".btn").forEach((btn) => {
      btn.addEventListener("pointerdown", (event) => {
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2.1;
        const ripple = document.createElement("span");
        ripple.className = "fx-ripple";
        ripple.style.width = ripple.style.height = size.toFixed(0) + "px";
        ripple.style.left = (event.clientX - rect.left - size / 2).toFixed(0) + "px";
        ripple.style.top = (event.clientY - rect.top - size / 2).toFixed(0) + "px";
        btn.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove());
        setTimeout(() => {
          if (ripple.isConnected) ripple.remove();
        }, 900);
      });
    });
  }

  if (deskFx) {
    many(".btn-accent, .btn-lg").forEach((btn) => {
      btn.addEventListener("pointermove", (event) => {
        const rect = btn.getBoundingClientRect();
        const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        btn.style.transform =
          "translate3d(" +
          (fxClamp(dx, -1, 1) * 7).toFixed(1) +
          "px," +
          (fxClamp(dy, -1, 1) * 5 - 2).toFixed(1) +
          "px,0)";
      });
      btn.addEventListener("pointerleave", () => {
        btn.style.transform = "";
      });
    });
  }

  /* ----------------------------------------------- 15. 定制光标：小绿点 + 跟随圆环 */
  if (deskFx) {
    const cursorDot = document.createElement("span");
    cursorDot.className = "fx-cursor-dot";
    cursorDot.setAttribute("aria-hidden", "true");
    const cursorRing = document.createElement("span");
    cursorRing.className = "fx-cursor-ring";
    cursorRing.setAttribute("aria-hidden", "true");
    document.body.appendChild(cursorDot);
    document.body.appendChild(cursorRing);
    document.documentElement.classList.add("fx-cursor");

    const aim = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      rx: window.innerWidth / 2,
      ry: window.innerHeight / 2,
      shown: false,
    };
    const wideSelector =
      'a, button, input, textarea, select, summary, .fx-tilt, [data-fx-wide]';
    let overWide = false;
    let pressing = false;
    const syncRing = () =>
      cursorRing.classList.toggle("is-wide", overWide || pressing);

    window.addEventListener(
      "pointermove",
      (event) => {
        aim.x = event.clientX;
        aim.y = event.clientY;
        if (!aim.shown) {
          aim.shown = true;
          aim.rx = aim.x;
          aim.ry = aim.y;
          cursorDot.style.opacity = "1";
          cursorRing.style.opacity = "1";
        }
      },
      { passive: true }
    );
    document.addEventListener("pointerover", (event) => {
      if (!event.target || !event.target.closest) return;
      overWide = !!event.target.closest(wideSelector);
      syncRing();
    });
    document.addEventListener("pointerdown", () => {
      pressing = true;
      syncRing();
    });
    window.addEventListener("pointerup", () => {
      pressing = false;
      syncRing();
    });
    const hideCursor = () => {
      aim.shown = false;
      cursorDot.style.opacity = "0";
      cursorRing.style.opacity = "0";
    };
    document.addEventListener("pointerleave", hideCursor);
    window.addEventListener("blur", hideCursor);

    let jobLast = performance.now();
    const job = (now) => {
      const dt = fxStep(now, jobLast);
      jobLast = now;
      cursorDot.style.transform = "translate3d(" + aim.x + "px," + aim.y + "px,0)";
      // 圆环比点慢一点点，形成包裹感；系数大所以依然跟手
      aim.rx += (aim.x - aim.rx) * 0.22 * dt;
      aim.ry += (aim.y - aim.ry) * 0.22 * dt;
      cursorRing.style.transform =
        "translate3d(" + aim.rx.toFixed(1) + "px," + aim.ry.toFixed(1) + "px,0)";
    };
    fxAdd(job);
  }
})();
