/* 前台领取页：用户输入领取 CDK，兑换管理员在项目中创建的内容 */
(function () {
  const box = document.getElementById("claimBox");
  box.innerHTML = `
    <div class="card" style="padding:24px">
      <div class="field" style="margin-bottom:18px">
        <label for="code">领取 CDK</label>
        <input class="input" id="code" placeholder="请输入领取 CDK" style="padding:14px;font-size:16px;letter-spacing:0.5px;text-transform:uppercase" autocomplete="off" spellcheck="false"/>
        <span class="hint">不区分大小写，横线可省略</span>
      </div>
      <button class="btn primary" id="claimBtn" style="width:100%;padding:13px;font-size:15px">立即领取</button>
    </div>
    <div id="claimResult" style="margin-top:12px"></div>`;

  const input = document.getElementById("code");
  const btn = document.getElementById("claimBtn");
  const result = document.getElementById("claimResult");

  // 输入时统一大写、去掉空格与连字符，避免同码不同写法导致的失败
  input.addEventListener("input", () => {
    const at = input.selectionStart;
    const before = input.value;
    const after = before.toUpperCase().replace(/[\s-]/g, "");
    if (before !== after) {
      input.value = after;
      input.setSelectionRange(Math.max(0, at - (before.length - after.length)), Math.max(0, at - (before.length - after.length)));
    }
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doClaim(); });
  btn.onclick = doClaim;

  const ICON_OK = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;color:var(--success)"><path d="M20 6 9 17l-5-5"></path></svg>`;
  const ICON_ERR = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;color:var(--danger)"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>`;
  const ICON_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`;

  /** 按内容长度选择排版：短内容可以放大居中，长内容自动回落为小字号左对齐并滚动 */
  function lenClass(s) {
    const n = String(s ?? "").length;
    if (n <= 24) return "len-s";
    if (n <= 64) return "len-m";
    return "len-l";
  }

  /** 生成可复制内容块；长文案自动加标题提示与滚动区 */
  function copyBox(text, opts = {}) {
    const lc = lenClass(text);
    const scroll = lc === "len-l" || String(text).length > 300 ? " scroll" : "";
    const multi = opts.multi || lc !== "len-s";
    const label = opts.label ? `<div class="payload-label">${esc(opts.label)}</div>` : "";
    return `
      ${label}
      <div class="payload-box ${opts.lg ? "lg " : ""}${lc}${multi ? " multi" : ""}">
        <div class="payload-text${scroll}" title="${esc(text)}">${esc(text)}</div>
        <button class="btn sm" data-copy="${esc(text)}">${ICON_COPY}<span>复制</span></button>
      </div>`;
  }

  function renderContent(content) {
    if (content.type === "link") {
      // 仅当内容确实是 http(s) 链接时才渲染可点击地址，避免 javascript: 之类的伪协议
      const isHttp = /^https?:\/\//i.test(content.payload);
      const href = isHttp ? content.payload : /^www\./i.test(content.payload) ? "https://" + content.payload : null;
      return `
        ${copyBox(content.payload, { label: "领取链接", multi: true })}
        ${href ? `<a class="btn primary sm" style="margin-top:10px;display:inline-flex" href="${esc(href)}" target="_blank" rel="noopener noreferrer">打开链接</a>` : ""}`;
    }
    if (content.type === "text") {
      return copyBox(content.payload, { label: content.type_label || "文本内容", multi: true });
    }
    return copyBox(content.payload, { label: content.type_label || "兑换码", lg: true });
  }

  function bindCopyButtons(root) {
    root.querySelectorAll("[data-copy]").forEach((b) => {
      b.onclick = async () => {
        const ok = await copyText(b.dataset.copy);
        const span = b.querySelector("span");
        if (ok) {
          toast("已复制到剪贴板");
          if (span) {
            const old = span.textContent;
            span.textContent = "已复制";
            setTimeout(() => { span.textContent = old; }, 1600);
          }
        } else {
          toast("复制失败，请手动选择内容复制", "err");
        }
      };
    });
  }

  async function doClaim() {
    const code = input.value.trim();
    if (!code) { toast("请输入领取 CDK", "err"); return; }
    btn.disabled = true; btn.textContent = "领取中…";
    result.innerHTML = "";
    try {
      const r = await api("/api/claims", { method: "POST", body: JSON.stringify({ code }) });
      result.innerHTML = `
        <div class="card" style="border-color:rgba(16,185,129,.35)">
          <div class="row" style="gap:10px;align-items:flex-start">
            <div class="stat-icon" style="background:var(--success-soft);flex-shrink:0">${ICON_OK}</div>
            <div style="min-width:0">
              <div style="font-weight:600;color:var(--success);font-size:15px">领取成功</div>
              <div class="weak" style="font-size:12.5px;margin-top:2px;overflow-wrap:anywhere">${esc(r.project)} · ${esc(r.claimed_at)}</div>
            </div>
          </div>
          ${renderContent(r.content)}
        </div>`;
      bindCopyButtons(result);
      input.value = "";
      input.focus(); // 连续领取时不用再点一下输入框
    } catch (e) {
      result.innerHTML = `
        <div class="card" style="border-color:var(--danger)">
          <div class="row" style="gap:10px;align-items:flex-start">
            <div class="stat-icon" style="background:var(--danger-soft);flex-shrink:0">${ICON_ERR}</div>
            <div style="min-width:0">
              <div style="font-weight:600;color:var(--danger);font-size:15px">领取失败</div>
              <div class="weak" style="font-size:12.5px;margin-top:2px;overflow-wrap:anywhere">${esc(e.message)}</div>
            </div>
          </div>
        </div>`;
    } finally { btn.disabled = false; btn.textContent = "立即领取"; }
  }

  // 进行中的项目
  api("/api/claims/projects").then((r) => {
    const host = document.getElementById("projectList");
    if (!r.list.length) { host.innerHTML = `<div class="weak" style="font-size:12.5px">暂无可领取项目</div>`; return; }
    const ICON_GIFT = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M20 12v9H4v-9"></path><path d="M2 7h20v5H2z"></path><path d="M12 21V7"></path><path d="M12 7C10.5 5 8 4 7 4.5S6 7 7.5 7H12z"></path><path d="M12 7c1.5-2 4-3 5-2.5S18 7 16.5 7H12z"></path></svg>`;
    host.innerHTML = r.list.map((p) => {
      const soldOut = p.remaining <= 0;
      return `
      <div class="rank-item">
        <div class="rank-num" style="background:var(--accent-soft);color:var(--accent)">${ICON_GIFT}</div>
        <div class="rank-main">
          <div class="rank-title clamp-2" title="${esc(p.name)}">${esc(p.name)}</div>
          <div class="rank-sub clamp-2" title="${esc(p.description || "")}">${esc(p.description || "暂无描述")}</div>
        </div>
        ${soldOut
          ? `<span class="badge off"><span class="dot"></span>已领完</span>`
          : `<span class="badge ok"><span class="dot"></span>剩余 ${p.remaining}</span>`}
      </div>`;
    }).join("");
  }).catch(() => {});
})();
