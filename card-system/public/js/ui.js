/* ui.js —— 组件化对话框（shadcn AlertDialog 风格）
   依赖：/admin/js/common.js 的 esc() / ICONS。
   confirmDialog(opts) -> Promise<boolean>
   inputDialog(opts)   -> Promise<string|null> */
(function () {
  const ICONS = {
    alert: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    trash: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  };

  /** 组装一个临时模态层，返回 {overlay, close} */
  function buildOverlay(inner, opts = {}) {
    const overlay = document.createElement("div");
    overlay.className = "overlay open";
    overlay.style.zIndex = opts.zIndex || "90";
    overlay.innerHTML = inner;
    document.body.appendChild(overlay);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = () => {
      document.removeEventListener("keydown", onKey);
      overlay.classList.remove("open");
      document.body.style.overflow = prevOverflow;
      setTimeout(() => overlay.remove(), 180);
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return { overlay, close };
  }

  /**
   * 确认对话框，替代原生 confirm()
   * @param {object} opts {title, description, confirmText, cancelText, danger}
   * @returns {Promise<boolean>} 点击确认返回 true，取消 / ESC / 点遮罩返回 false
   */
  function confirmDialog(opts = {}) {
    const {
      title = "确认操作",
      description = "",
      confirmText = "确认",
      cancelText = "取消",
      danger = false,
      icon = "alert",
    } = opts;
    return new Promise((resolve) => {
      const { overlay, close } = buildOverlay(`
        <div class="modal confirm-modal">
          <div class="modal-body" style="padding:24px 24px 8px">
            <div class="alert-icon ${danger ? "danger" : "warn"}">${ICONS[icon] || ICONS.alert}</div>
            <h2 class="modal-title">${esc(title)}</h2>
            ${description ? `<p class="modal-desc">${esc(description)}</p>` : ""}
          </div>
          <div class="modal-foot" style="border-top:none;background:transparent;padding-top:12px">
            <button class="btn" data-r="cancel">${esc(cancelText)}</button>
            <button class="btn ${danger ? "danger" : "primary"}" data-r="ok" style="${danger ? "background:var(--danger);border-color:var(--danger);color:#fff" : ""}">${esc(confirmText)}</button>
          </div>
        </div>`);

      const done = (val) => { close(); resolve(val); };
      overlay.querySelector("[data-r=ok]").onclick = () => done(true);
      overlay.querySelector("[data-r=cancel]").onclick = () => done(false);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) done(false); });
      // 确认按钮聚焦，回车直接确认，符合 AlertDialog 习惯
      setTimeout(() => overlay.querySelector("[data-r=ok]").focus(), 60);
    });
  }

  /**
   * 单行输入对话框，替代原生 prompt()
   * @param {object} opts {title, description, label, placeholder, defaultValue, type, validate, confirmText}
   *   validate(value) 返回错误文案表示不通过；返回空 / undefined 表示通过
   * @returns {Promise<string|null>}
   */
  function inputDialog(opts = {}) {
    const {
      title = "请输入",
      description = "",
      label = "",
      placeholder = "",
      defaultValue = "",
      type = "text",
      validate = null,
      confirmText = "确认",
    } = opts;
    return new Promise((resolve) => {
      const { overlay, close } = buildOverlay(`
        <div class="modal confirm-modal">
          <div class="modal-body" style="padding:24px 24px 8px">
            <h2 class="modal-title">${esc(title)}</h2>
            ${description ? `<p class="modal-desc">${esc(description)}</p>` : ""}
            <div class="field" style="margin:16px 0 4px">
              ${label ? `<label for="dlgInput">${esc(label)}</label>` : ""}
              <input class="input" id="dlgInput" type="${esc(type)}" placeholder="${esc(placeholder)}" value="${esc(defaultValue)}"/>
              <span class="hint" id="dlgErr" style="color:var(--danger);display:none"></span>
            </div>
          </div>
          <div class="modal-foot" style="border-top:none;background:transparent;padding-top:12px">
            <button class="btn" id="dlgCancel">取消</button>
            <button class="btn primary" id="dlgOk">${esc(confirmText)}</button>
          </div>
        </div>`);

      const input = overlay.querySelector("#dlgInput");
      const err = overlay.querySelector("#dlgErr");
      const submit = () => {
        const v = input.value;
        const problem = validate ? validate(v) : "";
        if (problem) { err.textContent = problem; err.style.display = "block"; return; }
        close(); resolve(v);
      };
      overlay.querySelector("#dlgOk").onclick = submit;
      overlay.querySelector("#dlgCancel").onclick = () => { close(); resolve(null); };
      overlay.addEventListener("click", (e) => { if (e.target === overlay) { close(); resolve(null); } });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submit(); }
      });
      setTimeout(() => { input.focus(); input.select(); }, 60);
    });
  }

  window.confirmDialog = confirmDialog;
  window.inputDialog = inputDialog;
})();
