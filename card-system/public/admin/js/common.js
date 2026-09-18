/* 管理后台公共工具 */
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
  if (!res.ok) throw new Error(data?.message || `请求失败 (${res.status})`);
  return data;
}

/* 当前登录用户 */
let currentUser = null;
let currentUserPromise = null;
async function ensureUser() {
  if (currentUser) return currentUser;
  if (!currentUserPromise) {
    currentUserPromise = api("/api/auth/me")
      .then((r) => { currentUser = r.user; return r.user; })
      .catch((e) => { currentUserPromise = null; throw e; });
  }
  return currentUserPromise;
}
function displayName(u) {
  return u && u.role === "admin" ? "管理员" : (u ? u.username : "管理员");
}

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

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* 复制到剪贴板：优先 Clipboard API，非 HTTPS 环境（如局域网 IP 访问）降级到 execCommand */
async function copyText(text) {
  const value = String(text ?? "");
  try {
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* 继续尝试降级方案 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

/* ---------- 底部悬浮导航 ---------- */
async function renderDock(active) {
  const host = document.getElementById("dock");
  if (!host) return;
  const u = await ensureUser();
  const icon = (path) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const bar = `<path d="M5 21v-6"></path><path d="M12 21V9"></path><path d="M19 21V3"></path>`;
  const folder = `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>`;
  const bag = `<path d="M16 10a4 4 0 0 1-8 0"></path><path d="M3.103 6.034h17.794"></path><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"></path>`;
  const users = `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>`;
  const plus = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>`;
  const user = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

  const adminItem = u.role === "admin"
    ? `<a class="dock-btn ${active === "users" ? "active" : ""}" href="/admin/users.html" title="用户管理">${icon(users)}</a>`
    : "";

  host.innerHTML = `
    <nav class="dock">
      <a class="dock-btn ${active === "dashboard" ? "active" : ""}" href="/admin/dashboard.html" title="概览">${icon(bar)}</a>
      <a class="dock-btn ${active === "project" ? "active" : ""}" href="/admin/project.html" title="项目">${icon(folder)}</a>
      <a class="dock-btn ${active === "received" ? "active" : ""}" href="/admin/received.html" title="领取记录">${icon(bag)}</a>
      ${adminItem}
      <div class="dock-divider"></div>
      <button class="dock-btn dock-plus" id="dockNew" title="新建项目">${icon(plus)}</button>
      <div class="dock-divider"></div>
      <button class="dock-btn" id="dockUser" title="退出登录">${icon(user)}</button>
    </nav>`;
  document.getElementById("dockNew").onclick = () => window.__openNewProject && window.__openNewProject();
  document.getElementById("dockUser").onclick = () => {
    if (confirm("确认退出登录？")) { tokenStore.clear(); location.href = "/admin/login.html"; }
  };
}

async function requireAuth() {
  const token = tokenStore.get();
  if (!token) { location.href = "/admin/login.html"; return false; }
  try { await ensureUser(); return true; }
  catch { location.href = "/admin/login.html"; return false; }
}

/* ---------- 新建项目弹窗（全局复用） ---------- */
function openNewProjectModal(onCreated) {
  const overlay = document.createElement("div");
  overlay.className = "overlay open";
  overlay.innerHTML = `
    <div class="modal" style="width:600px">
      <div class="modal-head">
        <div class="row between">
          <div>
            <h2 class="card-title" style="font-size:16px">新建项目</h2>
            <p class="page-sub" style="margin-top:2px">导入分发内容，并生成用于领取的 CDK</p>
          </div>
          <button class="btn sm" id="npX" title="取消" style="border:none;padding:6px 8px">✕</button>
        </div>
        <div class="tabs">
          <button class="tab active" data-tab="basic">基本设置</button>
          <button class="tab" data-tab="content">分发内容</button>
          <button class="tab" data-tab="codes">领取 CDK</button>
        </div>
      </div>
      <div class="modal-body">
        <form id="paneBasic">
          <div class="field">
            <label for="npName">项目名称 <span class="req">*</span> <span class="hint">32字符以内</span></label>
            <input class="input" id="npName" maxlength="32" placeholder="请输入项目名称"/>
          </div>
          <div class="field">
            <label for="npTagInput">关联标签 <span class="hint" id="npTagCount">0 / 10</span></label>
            <div class="tag-stack" id="npTags"></div>
            <div class="row" style="margin-top:8px">
              <input class="input" id="npTagInput" placeholder="输入标签后回车" />
              <button type="button" class="btn sm" id="npTagAdd">添加</button>
            </div>
          </div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><label for="npStart">开始时间</label><input class="input" id="npStart" type="datetime-local"/></div>
            <div class="field"><label for="npEnd">结束时间</label><input class="input" id="npEnd" type="datetime-local"/></div>
          </div>
          <div class="field" style="margin:12px 0 4px">
            <label for="npDesc">项目描述</label>
            <textarea class="input" id="npDesc" rows="2" placeholder="可选，描述该项目用途"></textarea>
          </div>
        </form>
        <form id="paneContent" class="hidden">
          <div class="field">
            <label>领取模式 <span class="hint">决定 CDK 与内容的对应关系</span></label>
            <div class="row" style="gap:10px;flex-wrap:wrap">
              <label class="tag solid" style="padding:7px 14px"><input type="radio" name="bindMode" value="dynamic" checked style="width:auto;margin:0 5px 0 0"/> 动态发放</label>
              <label class="tag" style="padding:7px 14px"><input type="radio" name="bindMode" value="bound" style="width:auto;margin:0 5px 0 0"/> 一码一内容绑定</label>
            </div>
            <span class="hint" id="bindModeHint"></span>
          </div>
          <div class="field">
            <label for="npContents">批量导入分发内容 <span class="hint">兑换码 / 链接 / 文本，每行一个</span></label>
            <textarea class="input" id="npContents" rows="6" placeholder="每行一条内容，支持空格 / 逗号分隔。系统自动去重，用户领取 CDK 后按顺序发放。"></textarea>
            <div class="row between" style="margin-top:6px">
              <span class="hint num" id="npContentsCount">已识别 0 条唯一内容</span>
              <select class="input" id="npContentType" style="width:auto;padding:5px 10px;font-size:12px">
                <option value="auto">自动识别类型</option>
                <option value="code">全部按兑换码</option>
                <option value="link">全部按链接</option>
                <option value="text">全部按文本</option>
              </select>
            </div>
          </div>
        </form>
        <form id="paneCodes" class="hidden">
          <div class="field" style="margin-bottom:12px">
            <label>CDK 来源</label>
            <div class="row" style="gap:16px;flex-wrap:wrap">
              <label class="tag solid" style="padding:7px 14px"><input type="radio" name="codeSrc" value="generate" checked style="width:auto;margin:0 5px 0 0"/> 系统生成</label>
              <label class="tag" style="padding:7px 14px"><input type="radio" name="codeSrc" value="import" style="width:auto;margin:0 5px 0 0"/> 手动导入</label>
            </div>
          </div>
          <div id="paneGen">
            <div class="grid grid-2" style="gap:12px">
              <div class="field">
                <label for="npCount">生成数量 <span class="hint">最多 5000</span></label>
                <input class="input" id="npCount" type="number" min="1" max="5000" placeholder="例如 100"/>
              </div>
              <div class="field">
                <label for="npPrefix">CDK 前缀 <span class="hint">可选，最多 8 位</span></label>
                <input class="input" id="npPrefix" maxlength="8" placeholder="例如 LUX"/>
              </div>
            </div>
            <div class="weak" style="font-size:12px">标准 CDK 为 16 位随机码（4 位一组显示，不含易混淆字符）。</div>
          </div>
          <div id="paneImport" class="hidden">
            <div class="field">
              <label for="npCodeText">手动导入 CDK <span class="hint">已有 CDK 时使用，全局去重</span></label>
              <textarea class="input" id="npCodeText" rows="6" placeholder="每行一个 CDK，支持空格 / 逗号分隔"></textarea>
            </div>
          </div>
          <div class="weak" style="font-size:12px;margin-top:10px">
            建议 CDK 数量不超过内容数量，否则超出的 CDK 将无内容可发。
          </div>
        </form>
      </div>
      <div class="modal-foot">
        <button class="btn" id="npCancel">取消</button>
        <button class="btn hidden" id="npPrev">上一步</button>
        <button class="btn primary" id="npNext">下一步</button>
        <button class="btn primary hidden" id="npSubmit">创建项目</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const $ = (id) => overlay.querySelector("#" + id);
  let tags = [];

  const parseLines = (text) =>
    String(text || "").replace(/\r/g, "").split(/[\s,，;；]+/).map((s) => s.trim()).filter(Boolean);

  const contentCount = () => new Set(parseLines($("npContents").value)).size;

  const syncCount = () => {
    $("npContentsCount").textContent = `已识别 ${contentCount()} 条唯一内容`;
  };

  const syncCodeSrc = () => {
    const src =
      (overlay.querySelector('input[name="codeSrc"]:checked') || {}).value || "generate";
    $("paneGen").classList.toggle("hidden", src !== "generate");
    $("paneImport").classList.toggle("hidden", src !== "import");
    overlay.querySelectorAll('input[name="codeSrc"]').forEach((el) => {
      const label = el.closest("label");
      if (label) label.classList.toggle("solid", el.value === src);
    });
  };

  const syncBindMode = () => {
    const el = overlay.querySelector('input[name="bindMode"]:checked');
    const v = el ? el.value : "dynamic";
    overlay.querySelectorAll('input[name="bindMode"]').forEach((i) => {
      const label = i.closest("label");
      if (label) label.classList.toggle("solid", i.value === v);
    });
    $("bindModeHint").textContent =
      v === "bound"
        ? "一码一内容绑定：生成 / 导入 CDK 时按内容顺序一对一绑定，需先准备好内容。"
        : "动态发放：用户领取时从内容池按顺序取一份，先到先得。";
  };

  const renderTags = () => {
    $("npTags").innerHTML =
      tags.map((t) => `<span class="tag">${esc(t)}<span class="x" data-tag="${esc(t)}">✕</span></span>`).join("") +
      (tags.length === 0 ? `<span class="weak">最多添加 10 个标签</span>` : "");
    overlay.querySelectorAll(".tag .x").forEach((x) => {
      x.onclick = () => { tags = tags.filter((t) => t !== x.dataset.tag); renderTags(); };
    });
    $("npTagCount").textContent = `${tags.length} / 10`;
  };

  function addTag() {
    const v = $("npTagInput").value.trim();
    if (!v || tags.length >= 10) return;
    if (!tags.includes(v)) { tags.push(v); renderTags(); }
    $("npTagInput").value = "";
  }

  const TABS = ["basic", "content", "codes"];
  let tabIndex = 0;

  function switchTab(name) {
    tabIndex = Math.max(0, TABS.indexOf(name));
    overlay.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    $("paneBasic").classList.toggle("hidden", name !== "basic");
    $("paneContent").classList.toggle("hidden", name !== "content");
    $("paneCodes").classList.toggle("hidden", name !== "codes");
    $("npPrev").classList.toggle("hidden", tabIndex === 0);
    $("npNext").classList.toggle("hidden", tabIndex === TABS.length - 1);
    $("npSubmit").classList.toggle("hidden", tabIndex !== TABS.length - 1);
  }

  $("npTagInput").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } };
  $("npTagAdd").onclick = addTag;
  $("npContents").oninput = syncCount;
  overlay.querySelectorAll('input[name="codeSrc"]').forEach((el) => (el.onchange = syncCodeSrc));
  overlay.querySelectorAll('input[name="bindMode"]').forEach((el) => (el.onchange = syncBindMode));
  $("npNext").onclick = () => {
    if (tabIndex === 0 && !$("npName").value.trim()) { toast("请填写项目名称", "err"); return; }
    // 进入 CDK 步骤时，用内容数量预填生成数量，避免生成数与库存不匹配
    if (tabIndex === 1 && !$("npCount").value.trim()) {
      const n = contentCount();
      if (n > 0) $("npCount").value = String(Math.min(n, 5000));
    }
    switchTab(TABS[tabIndex + 1]);
  };
  $("npPrev").onclick = () => switchTab(TABS[tabIndex - 1]);
  overlay.querySelectorAll(".tab").forEach((t) => {
    t.onclick = () => { if (t.dataset.tab === "basic" || $("npName").value.trim()) switchTab(t.dataset.tab); };
  });
  $("npSubmit").onclick = submit;

  $("npCancel").onclick = close;
  $("npX").onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);

  function onKey(e) { if (e.key === "Escape") close(); }

  async function submit() {
    const name = $("npName").value.trim();
    if (!name) { toast("请填写项目名称", "err"); switchTab("basic"); return; }
    const contents = $("npContents").value;
    const codeSrc = (overlay.querySelector('input[name="codeSrc"]:checked') || {}).value || "generate";
    const body = {
      name,
      tags,
      start_time: $("npStart").value || null,
      end_time: $("npEnd").value || null,
      description: $("npDesc").value.trim(),
      mode: "one_one",
      bind_mode: (overlay.querySelector('input[name="bindMode"]:checked') || {}).value || "dynamic",
    };
    const btn = $("npSubmit");
    btn.disabled = true; btn.textContent = "创建中…";
    try {
      const res = await api("/api/batches", { method: "POST", body: JSON.stringify(body) });
      const id = res.batch.id;
      const parts = [];

      if (contents.trim()) {
        const imp = await api(`/api/batches/${id}/contents/import`, {
          method: "POST",
          body: JSON.stringify({ text: contents, type: $("npContentType").value }),
        });
        parts.push(`内容 ${imp.inserted} 条（去重 ${imp.duplicate}）`);
      }

      if (codeSrc === "generate") {
        const count = Number($("npCount").value);
        if (Number.isInteger(count) && count > 0) {
          const gen = await api(`/api/batches/${id}/claim-codes/generate`, {
            method: "POST",
            body: JSON.stringify({ count, prefix: $("npPrefix").value.trim() }),
          });
          parts.push(`CDK ${gen.inserted} 个`);
        }
      } else {
        const text = $("npCodeText").value;
        if (text.trim()) {
          const imp = await api(`/api/batches/${id}/claim-codes/import`, {
            method: "POST",
            body: JSON.stringify({ text }),
          });
          parts.push(`CDK ${imp.inserted} 个（去重 ${imp.duplicate}${imp.invalid ? `，无效 ${imp.invalid}` : ""}）`);
        }
      }

      toast(parts.length ? `项目已创建：${parts.join("，")}` : "项目已创建");
      close();
      onCreated && onCreated();
    } catch (e) { toast(e.message, "err"); }
    finally { btn.disabled = false; btn.textContent = "创建项目"; }
  }

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => overlay.remove(), 180);
  }

  renderTags();
  syncCount();
  syncCodeSrc();
  syncBindMode();
}

window.__openNewProject ||= openNewProjectModal;
window.openNewProjectModal = openNewProjectModal;
window.api = api;
window.toast = toast;
window.copyText = copyText;
window.esc = esc;
window.greeting = greeting;
window.renderDock = renderDock;
window.tokenStore = tokenStore;
window.ensureUser = ensureUser;
window.displayName = displayName;
window.currentUserUser = () => currentUser;

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page) renderDock(page);
});
