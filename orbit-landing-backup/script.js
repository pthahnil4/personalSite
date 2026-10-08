/* Orbit 官网交互脚本 —— 原生 JS，无外部依赖 */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ---------------------------------------------------------- 1. 导航 */
  const header = document.querySelector(".site-header");
  const nav = document.getElementById("primary-nav");
  const navToggle = document.getElementById("nav-toggle");

  const setNavOpen = (open) => {
    nav.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  };

  navToggle.addEventListener("click", () => {
    setNavOpen(!nav.classList.contains("is-open"));
  });

  nav.addEventListener("click", (event) => {
    if (event.target.matches("a")) setNavOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setNavOpen(false);
      navToggle.focus();
    }
  });

  const onScroll = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* 当前所在区块高亮对应导航项 */
  const navLinks = Array.from(nav.querySelectorAll("a"));
  const linkFor = new Map(
    navLinks.map((link) => [link.getAttribute("href").slice(1), link])
  );

  const sections = navLinks
    .map((link) => document.getElementById(link.getAttribute("href").slice(1)))
    .filter(Boolean);

  const markActive = (id) => {
    navLinks.forEach((link) =>
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + id)
    );
  };

  if ("IntersectionObserver" in window && sections.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => b.intersectionRatio - a.intersectionRatio
          )[0];
        if (visible) markActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0.05, 0.3, 0.6] }
    );
    sections.forEach((section) => sectionObserver.observe(section));
  }

  /* ------------------------------------------------- 2. 入场动效 */
  const reveals = Array.from(document.querySelectorAll(".reveal"));
  document.querySelectorAll(".hero .reveal").forEach((el, i) => {
    el.style.setProperty("--i", i);
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
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

  /* --------------------------------------- 3. 任务列表筛选（预览） */
  const filters = Array.from(document.querySelectorAll(".filter"));
  const tasks = Array.from(document.querySelectorAll(".task"));
  const emptyHint = document.getElementById("empty-hint");

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      const status = button.dataset.filter;
      filters.forEach((other) => {
        const active = other === button;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-selected", String(active));
      });

      let shown = 0;
      tasks.forEach((task) => {
        const match = status === "all" || task.dataset.status === status;
        task.classList.toggle("is-hidden", !match);
        if (match) shown += 1;
      });
      emptyHint.hidden = shown > 0;
    });
  });

  /* -------------------------------------------------- 4. 价格周期切换 */
  const cycleButtons = Array.from(document.querySelectorAll(".switch-btn"));
  const priceBlocks = Array.from(document.querySelectorAll(".plan-price"));
  const saveHint = document.getElementById("save-hint");

  const applyCycle = (cycle) => {
    cycleButtons.forEach((button) => {
      const active = button.dataset.cycle === cycle;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    priceBlocks.forEach((block) => {
      const monthly = block.dataset.month;
      const yearly = block.dataset.year;
      if (!monthly) return; // 企业版为定制报价
      const amount = block.querySelector(".amount");
      amount.textContent = cycle === "year" ? yearly : monthly;
      if (!reduceMotion) {
        amount.classList.add("is-flashing");
        setTimeout(() => amount.classList.remove("is-flashing"), 420);
      }
      const bill = block.nextElementSibling;
      if (bill && bill.classList.contains("plan-bill")) {
        bill.textContent =
          cycle === "year"
            ? `一次性支付 ¥${Number(yearly) * 12}/人/年`
            : "按月计费，随时取消";
      }
    });

    saveHint.textContent =
      cycle === "year"
        ? "按年付费：每人每月相当于打 8 折"
        : "切换按年，每人每月省 20%";
    saveHint.classList.toggle("is-on", cycle === "year");
  };

  cycleButtons.forEach((button) =>
    button.addEventListener("click", () => applyCycle(button.dataset.cycle))
  );
  applyCycle("month");

  /* ---------------------------------------------------- 5. FAQ 折叠 */
  const faqItems = Array.from(document.querySelectorAll(".faq-item"));

  faqItems.forEach((item) => {
    const button = item.querySelector(".faq-q");
    const panel = item.querySelector(".faq-a");

    button.addEventListener("click", () => {
      const willOpen = button.getAttribute("aria-expanded") !== "true";

      // 收起其他项，保持页面专注
      faqItems.forEach((other) => {
        if (other === item) return;
        const ob = other.querySelector(".faq-q");
        const op = other.querySelector(".faq-a");
        if (ob.getAttribute("aria-expanded") === "true") {
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
          if (button.getAttribute("aria-expanded") === "false") panel.hidden = true;
        }, 320);
      }
    });
  });

  window.addEventListener("resize", () => {
    faqItems.forEach((item) => {
      const button = item.querySelector(".faq-q");
      const panel = item.querySelector(".faq-a");
      if (button.getAttribute("aria-expanded") === "true") {
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    });
  });

  /* ------------------------------------------ 6. 演示预约表单弹窗 */
  const modal = document.getElementById("demo-modal");
  const panel = modal.querySelector(".modal-panel");
  const formView = document.getElementById("demo-form-view");
  const resultView = document.getElementById("demo-result-view");
  const form = document.getElementById("demo-form");
  const resultList = document.getElementById("result-list");
  const resultLine = document.getElementById("result-line");
  const formError = document.getElementById("form-error");
  const noteCount = document.getElementById("note-count");
  const againBtn = document.getElementById("result-again");

  let lastFocused = null;

  const focusables = () =>
    Array.from(
      panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.disabled && el.offsetParent !== null);

  const openModal = (trigger) => {
    lastFocused = trigger || document.activeElement;
    modal.hidden = false;
    document.body.classList.add("is-locked");
    showForm();
    requestAnimationFrame(() => {
      const first = formView.querySelector("input");
      (first || panel).focus();
    });
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove("is-locked");
    if (lastFocused && document.body.contains(lastFocused)) lastFocused.focus();
  };

  const showForm = () => {
    formView.hidden = false;
    resultView.hidden = true;
  };

  const showResult = (data) => {
    formView.hidden = true;
    resultView.hidden = false;
    resultLine.textContent = `我们会在 1 个工作日内通过 ${data.email} 与你确认时间。`;
    resultList.innerHTML = "";
    [
      ["联系人", data.name],
      ["公司/团队", data.company],
      ["邮箱", data.email],
      ["团队规模", data.size],
      ["方便的时间", data.slot],
      ["关注重点", data.note || "未填写"],
      ["提交时间", data.time],
    ].forEach(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      resultList.append(dt, dd);
    });
    panel.scrollTop = 0;
    panel.focus();
  };

  document.querySelectorAll("[data-demo-open]").forEach((button) => {
    button.addEventListener("click", () => openModal(button));
  });

  modal.addEventListener("click", (event) => {
    if (event.target.hasAttribute("data-modal-close")) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (modal.hidden) return;

    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (event.key === "Tab") {
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  /* 校验规则 */
  const rules = {
    name: {
      label: "姓名",
      el: () => document.getElementById("f-name"),
      test: (value) => value.trim().length >= 2 || "请填写真实姓名或称呼（至少 2 个字）。",
    },
    company: {
      label: "公司或团队名称",
      el: () => document.getElementById("f-company"),
      test: (value) => value.trim().length >= 2 || "请填写公司或团队名称。",
    },
    email: {
      label: "工作邮箱",
      el: () => document.getElementById("f-email"),
      test: (value) =>
        /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(value.trim()) ||
        "邮箱格式不正确，示例：name@company.com。",
    },
    size: {
      label: "团队规模",
      el: () => document.getElementById("f-size"),
      test: (value) => Boolean(value) || "请选择团队规模。",
    },
  };

  const setFieldError = (key, message) => {
    const input = rules[key].el();
    const field = input.closest(".field");
    const output = field.querySelector(".field-error");
    if (message) {
      field.classList.add("has-error");
      input.setAttribute("aria-invalid", "true");
      output.textContent = message;
    } else {
      field.classList.remove("has-error");
      input.removeAttribute("aria-invalid");
      output.textContent = "";
    }
    return !message;
  };

  Object.keys(rules).forEach((key) => {
    const input = rules[key].el();
    input.addEventListener("blur", () => {
      if (!input.value.trim() && !input.dataset.touched) return;
      input.dataset.touched = "1";
      const result = rules[key].test(input.value);
      setFieldError(key, result === true ? "" : result);
    });
    input.addEventListener("input", () => {
      if (!input.closest(".field").classList.contains("has-error")) return;
      const result = rules[key].test(input.value);
      setFieldError(key, result === true ? "" : result);
    });
  });

  document.getElementById("f-note").addEventListener("input", (event) => {
    noteCount.textContent = String(event.target.value.length);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    let firstInvalid = null;
    Object.keys(rules).forEach((key) => {
      const input = rules[key].el();
      const result = rules[key].test(input.value);
      const ok = setFieldError(key, result === true ? "" : result);
      if (!ok && !firstInvalid) firstInvalid = input;
    });

    if (firstInvalid) {
      formError.hidden = false;
      firstInvalid.focus();
      return;
    }

    formError.hidden = true;
    const slot = document.getElementById("f-slot");
    showResult({
      name: document.getElementById("f-name").value.trim(),
      company: document.getElementById("f-company").value.trim(),
      email: document.getElementById("f-email").value.trim(),
      size: rules.size.el().value,
      slot: slot.value,
      note: document.getElementById("f-note").value.trim(),
      time: new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    });
    form.reset();
    noteCount.textContent = "0";
    Object.keys(rules).forEach((key) => {
      delete rules[key].el().dataset.touched;
      setFieldError(key, "");
    });
  });

  againBtn.addEventListener("click", () => {
    showForm();
    document.getElementById("f-name").focus();
  });
})();
