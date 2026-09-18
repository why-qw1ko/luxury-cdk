/* 管理后台公共工具：token、请求封装、悬浮导航、toast、问候语 */
const TOKEN_KEY = "card_admin_token";
const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "凌晨好";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

/** 统一的 API 请求封装 */
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const token = tokenStore.get();
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    tokenStore.clear();
    if (!location.pathname.endsWith("login.html")) location.href = "/admin/login.html";
    throw new Error("未登录");
  }
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    throw new Error(data?.message || `请求失败 (${res.status})`);
  }
  return data;
}

/** toast 提示 */
function toast(msg, type = "ok") {
  const host = document.querySelector(".toasts") || (() => {
    const d = document.createElement("div");
    d.className = "toasts";
    document.body.appendChild(d);
    return d;
  })();
  const el = document.createElement("div");
  el.className = "toast " + (type === "ok" ? "ok" : type === "err" ? "err" : "");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/** 转义 HTML */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** 渲染底部悬浮导航 */
function renderDock(active) {
  const host = document.getElementById("dock");
  if (!host) return;
  const icon = (path) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const bar = `<path d="M5 21v-6"></path><path d="M12 21V9"></path><path d="M19 21V3"></path>`;
  const folder = `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>`;
  const bag = `<path d="M16 10a4 4 0 0 1-8 0"></path><path d="M3.103 6.034h17.794"></path><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"></path>`;
  const plus = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>`;
  const user = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

  host.innerHTML = `
    <nav class="dock">
      <a class="dock-btn ${active === "dashboard" ? "active" : ""}" href="/admin/dashboard.html" title="概览">${icon(bar)}</a>
      <a class="dock-btn ${active === "project" ? "active" : ""}" href="/admin/project.html" title="项目">${icon(folder)}</a>
      <a class="dock-btn ${active === "received" ? "active" : ""}" href="/admin/received.html" title="领取记录">${icon(bag)}</a>
      <div class="dock-divider"></div>
      <button class="dock-btn dock-plus" id="dockNew" title="新建项目">${icon(plus)}</button>
      <div class="dock-divider"></div>
      <button class="dock-btn" id="dockUser" title="退出登录">${icon(user)}</button>
    </nav>`;
  document.getElementById("dockNew").onclick = () => window.__openNewProject && window.__openNewProject();
  const u = document.getElementById("dockUser");
  u.onclick = () => {
    if (confirm("确认退出登录？")) { tokenStore.clear(); location.href = "/admin/login.html"; }
  };
}

async function requireAuth() {
  const token = tokenStore.get();
  if (!token) { location.href = "/admin/login.html"; return false; }
  try { await api("/api/auth/me"); return true; }
  catch { location.href = "/admin/login.html"; return false; }
}

/* ---------- 新建项目弹窗（全局复用） ---------- */
const MODES = { one_one: "一码一用" };

function openNewProjectModal(onCreated) {
  const overlay = document.createElement("div");
  overlay.className = "overlay open";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2 class="card-title" style="font-size:17px">新建项目</h2>
        <p class="page-sub" style="margin-top:4px">创建一个新的项目来管理和分发您的内容</p>
        <div class="tabs">
          <button class="tab active" data-tab="basic">基本设置</button>
          <button class="tab" data-tab="content">分发内容</button>
        </div>
      </div>
      <div class="modal-body">
        <!-- 基本设置 -->
        <form id="paneBasic" class="pane">
          <div class="field">
            <label>项目名称 <span class="req">*</span> <span class="hint">（32字符以内）</span></label>
            <input class="input" id="npName" maxlength="32" placeholder="请输入项目名称"/>
            <span class="hint num" id="npNameCount">0 / 32</span>
          </div>
          <div class="field">
            <label>关联标签 <span class="hint" id="npTagCount">0 / 10</span></label>
            <div class="tag-stack" id="npTags"></div>
            <div class="row" style="margin-top:8px">
              <input class="input" id="npTagInput" style="max-width:220px" placeholder="输入标签后回车" />
              <button type="button" class="btn sm" id="npTagAdd">添加</button>
            </div>
          </div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><label>开始时间</label><input class="input" id="npStart" type="datetime-local"/></div>
            <div class="field"><label>结束时间</label><input class="input" id="npEnd" type="datetime-local"/></div>
          </div>
          <div class="switch-row">
            <div class="switch-box">
              <div class="switch-title">限制相同 IP</div>
              <div class="switch-desc">开启后，同一 IP 在该项目只能领取一次</div>
            </div>
            <label class="switch"><input type="checkbox" id="npLimit"/><span class="slider"></span></label>
          </div>
          <div class="field" style="margin-top:8px">
            <label>项目描述</label>
            <textarea class="input" id="npDesc" placeholder="可选，描述该项目用途"></textarea>
          </div>
        </form>
        <!-- 分发内容 -->
        <form id="paneContent" class="pane hidden">
          <div class="field">
            <label>分发方式</label>
            <div class="tag-stack" id="npMode">
              <label class="tag solid" style="padding:7px 12px"><input type="radio" name="mode" value="one_one" checked style="width:auto;margin-right:4px"/> 一码一用</label>
              <span class="weak" style="align-self:center">每张卡密仅可使用一次，领取后即失效</span>
            </div>
          </div>
          <div class="field">
            <label>批量导入卡密</label>
            <textarea class="input" id="npCodes" style="min-height:180px" placeholder="每行一个卡密，支持空格 / 逗号分隔。系统将自动去重并统计剩余库存。"></textarea>
            <span class="hint num" id="npCodesCount">已识别 0 个唯一卡密</span>
          </div>
        </form>
      </div>
      <div class="modal-foot">
        <button class="btn" id="npCancel">取消</button>
        <button class="btn primary" id="npNext">下一步</button>
        <button class="btn primary hidden" id="npSubmit">创建项目</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const $ = (id) => overlay.querySelector(id);
  let basic = true; // current tab
  let tags = [];

  const syncCount = () => {
    let n = 0;
    const lines = $("npCodes").value.replace(/\r/g, "").split(/[\s,，;；]+/).map(s=>s.trim()).filter(Boolean);
    n = new Set(lines).size;
    $("npCodesCount").textContent = `已识别 ${n} 个唯一卡密`;
  };

  const renderTags = () => {
    $("npTags").innerHTML = tags.map((t,i) =>
      `<span class="tag">${esc(t)}<span class="x" data-tag="${esc(t)}">✕</span></span>`).join("") +
      (tags.length === 0 ? `<span class="weak">最多添加 10 个标签</span>` : "");
    overlay.querySelectorAll(".tag .x").forEach(x => x.onclick = () => {
      tags = tags.filter(t => t !== x.dataset.tag);
      renderTags();
    });
    const c = $("npTagCount");
    if (c) c.textContent = `${tags.length} / 10`;
  };

  $("npName").oninput = () => $("npNameCount").textContent = `${$("npName").value.length} / 32`;
  $("npTagInput").onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); addTag(); }
  };
  $("npTagAdd").onclick = addTag;
  function addTag() {
    const v = $("npTagInput").value.trim();
    if (!v || tags.length >= 10) return;
    if (!tags.includes(v)) { tags.push(v); renderTags(); }
    $("npTagInput").value = "";
  }
  $("npCodes").oninput = syncCount;
  $("npNext").onclick = () => switchTab("content");
  $("npCancel").onclick = close;

  overlay.querySelectorAll(".tab").forEach(t => t.onclick = () => switchTab(t.dataset.tab));
  function switchTab(name) {
    basic = name === "basic";
    overlay.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    $("paneBasic").classList.toggle("hidden", name !== "basic");
    $("paneContent").classList.toggle("hidden", name !== "content");
    const next = name === "basic" ? $("npNext") : $("npSubmit");
    const prev = name === "content" ? $("npNext") : null;
    next.classList.toggle("hidden", false);
    if (prev) prev.classList.remove("hidden");
  }

  $("npSubmit").onclick = async () => {
    const name = $("npName").value.trim();
    if (!name) { toast("请填写项目名称", "err"); switchTab("basic"); return; }
    const codes = $("npCodes").value;
    const body = {
      name,
      tags,
      start_time: $("npStart").value || null,
      end_time: $("npEnd").value || null,
      limit_ip: $("npLimit").checked,
      description: $("npDesc").value.trim(),
      mode: (overlay.querySelector('input[name="mode"]:checked') || {}).value || "one_one",
    };
    const submitBtn = $("npSubmit");
    submitBtn.disabled = true; submitBtn.textContent = "创建中…";
    try {
      const res = await api("/api/batches", { method: "POST", body: JSON.stringify(body) });
      let msg = "项目已创建";
      if (codes.trim()) {
        const imp = await api(`/api/batches/${res.batch.id}/cards/import`, { method: "POST", body: JSON.stringify({ text: codes }) });
        msg = `项目已创建，导入卡密 ${imp.inserted} 个，去重 ${imp.duplicate} 个`;
      }
      toast(msg);
      close();
      onCreated && onCreated();
    } catch (e) { toast(e.message, "err"); }
    finally { submitBtn.disabled = false; submitBtn.textContent = "创建项目"; }
  };

  function close() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => overlay.remove(), 180);
  }
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  renderTags();
  syncCount();
}

window.__openNewProject ||= openNewProjectModal;
window.openNewProjectModal = openNewProjectModal;
window.api = api;
window.toast = toast;
window.esc = esc;
window.greeting = greeting;
window.renderDock = renderDock;
window.tokenStore = tokenStore;

// 默认挂载：页面声明 data-page 时自动渲染 dock
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page) renderDock(page);
});