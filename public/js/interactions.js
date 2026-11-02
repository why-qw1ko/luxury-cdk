/* 所有页面共用的输入法保护、选择器和折叠交互。 */
(function () {
  const compositions = new WeakMap();
  document.addEventListener("compositionstart", (event) => {
    compositions.set(event.target, { active: true, ended: -Infinity });
  }, true);
  document.addEventListener("compositionend", (event) => {
    compositions.set(event.target, { active: false, ended: performance.now() });
  }, true);
  window.isInputComposing = (target) => compositions.get(target)?.active === true;
  document.addEventListener("keydown", (event) => {
    const state = compositions.get(event.target);
    const enter = event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
    if (enter &&
        (event.isComposing || event.keyCode === 229 || state?.active ||
         performance.now() - (state?.ended ?? -Infinity) < 500)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.setExpanded = (element, expanded) => {
    element.classList.toggle("expanded", expanded);
    element.inert = !expanded;
    element.setAttribute("aria-hidden", String(!expanded));
  };

  // 保留原生 select 作为表单值与 change 事件来源，展示层按选项数量调整。
  window.enhanceSelect = (select, label) => {
    if (select.dataset.enhanced) return;
    select.dataset.enhanced = "1";
    select.hidden = true;
    const options = Array.from(select.options);
    const host = document.createElement("div");
    host.className = options.length < 5 ? "choice-group" : "select-control";
    host.setAttribute("aria-label", label);
    select.after(host);
    const choose = (value) => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    if (options.length < 5) {
      host.setAttribute("role", "radiogroup");
      for (const option of options) {
        const item = document.createElement("label");
        item.className = "choice-option";
        item.title = option.text;
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `${select.id}-choice`;
        radio.value = option.value;
        radio.checked = select.value === option.value;
        radio.disabled = option.disabled || select.disabled;
        radio.addEventListener("change", () => choose(radio.value));
        item.append(radio, document.createTextNode(option.text));
        host.append(item);
      }
      select.addEventListener("change", () => {
        host.querySelectorAll("input").forEach((radio) => { radio.checked = radio.value === select.value; });
      });
      return;
    }

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "input select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", label);
    trigger.disabled = select.disabled;
    const panel = document.createElement("div");
    panel.className = "select-panel";
    panel.hidden = true;
    const list = document.createElement("div");
    list.className = "select-options";
    list.id = `${select.id}-options`;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", label);
    trigger.setAttribute("aria-controls", list.id);
    let search;
    if (options.length > 10) {
      search = document.createElement("input");
      search.className = "input select-search";
      search.placeholder = "搜索选项";
      search.setAttribute("aria-label", `搜索${label}`);
      panel.append(search);
    }
    panel.append(list);
    host.append(trigger);
    const sync = () => {
      trigger.textContent = select.selectedOptions[0]?.text || "请选择";
      trigger.title = trigger.textContent;
    };
    select.addEventListener("change", sync);
    sync();
    const close = (focus = false) => {
      panel.hidden = true;
      panel.remove();
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", onScroll, true);
      if (focus) trigger.focus();
    };
    const outside = (event) => { if (!host.contains(event.target) && !panel.contains(event.target)) close(); };
    const onScroll = (event) => { if (!panel.contains(event.target)) close(); };
    const reposition = () => {
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      panel.style.maxHeight = "264px";
      panel.style.width = `${Math.min(Math.max(rect.width, 240), viewportWidth - 24)}px`;
      const below = innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const up = below < Math.min(264, panel.scrollHeight) && above > below;
      panel.classList.toggle("opens-up", up);
      panel.style.maxHeight = `${Math.max(0, Math.min(264, up ? above : below))}px`;
      panel.style.left = `${Math.max(12, Math.min(rect.left, viewportWidth - panel.offsetWidth - 12))}px`;
      panel.style.top = up ? "auto" : `${rect.bottom + 6}px`;
      panel.style.bottom = up ? `${innerHeight - rect.top + 6}px` : "auto";
    };
    const renderOptions = () => {
      const query = search?.value.trim().toLocaleLowerCase() || "";
      list.replaceChildren();
      for (const option of options.filter((item) => item.text.toLocaleLowerCase().includes(query))) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "select-option";
        button.textContent = option.text;
        button.title = option.text;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(option.value === select.value));
        button.disabled = option.disabled;
        button.tabIndex = -1;
        button.addEventListener("click", () => { choose(option.value); close(true); });
        list.append(button);
      }
      if (!list.childElementCount) {
        const empty = document.createElement("div");
        empty.className = "select-empty";
        empty.textContent = "没有匹配的选项";
        empty.setAttribute("role", "status");
        list.append(empty);
      }
    };
    search?.addEventListener("input", () => { renderOptions(); reposition(); });
    const open = () => {
      if (search) search.value = "";
      renderOptions();
      // 挂到 body，避免页面入场 transform 和弹窗 overflow 改变定位/裁切面板。
      document.body.append(panel);
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      reposition();
      (search || list.querySelector('[aria-selected="true"]:not(:disabled)') || list.querySelector("button:not(:disabled)"))?.focus();
      document.addEventListener("pointerdown", outside, true);
      window.addEventListener("resize", reposition);
      document.addEventListener("scroll", onScroll, true);
    };
    trigger.addEventListener("click", () => panel.hidden ? open() : close());
    const onKey = (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        event.preventDefault(); event.stopPropagation(); close(true); return;
      }
      if (event.key === "Tab" && !panel.hidden) { close(true); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      if (event.target === search && ["Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (panel.hidden) { open(); return; }
      const items = Array.from(list.querySelectorAll("button:not(:disabled)"));
      const current = items.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
        event.key === "ArrowDown" ? Math.min(current + 1, items.length - 1) : Math.max(current - 1, 0);
      items[next]?.focus();
    };
    host.addEventListener("keydown", onKey);
    panel.addEventListener("keydown", onKey);
  };
})();

