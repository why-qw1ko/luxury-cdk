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

const ICON_TOAST_OK = `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>`;
const ICON_TOAST_ERR = `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`;
const ICON_TOAST_INFO = `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
const ICON_TOAST_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

function toast(msg, type = "ok") {
  const host = document.querySelector(".toasts") || (() => {
    const d = document.createElement("div");
    d.className = "toasts";
    document.body.appendChild(d);
    return d;
  })();
  const el = document.createElement("div");
  const icon =
    type === "err" ? ICON_TOAST_ERR
    : type === "info" ? ICON_TOAST_INFO
    : ICON_TOAST_OK;
  el.className = "toast " + (type === "ok" ? "ok" : type === "err" ? "err" : "info");
  el.innerHTML = `${icon}<div class="toast-msg"></div><button class="toast-close" title="关闭">${ICON_TOAST_CLOSE}</button>`;
  el.querySelector(".toast-msg").textContent = msg;
  const dismiss = () => {
    if (!el.isConnected) return;
    el.classList.add("out");
    setTimeout(() => el.remove(), 180);
  };
  el.querySelector(".toast-close").onclick = dismiss;
  host.appendChild(el);
  setTimeout(dismiss, 3200);
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

/* 统一的复制按钮行为：成功则按钮短暂显示「已复制」，失败明确提示手动复制。
   页面只需要给按钮加上 data-copy="要复制的内容"，再调用 bindCopy(根节点)。 */
function bindCopy(root) {
  (root || document).querySelectorAll("[data-copy]").forEach((btn) => {
    if (btn.dataset.copyBound) return;
    btn.dataset.copyBound = "1";
    btn.addEventListener("click", async () => {
      const ok = await copyText(btn.dataset.copy);
      if (ok) {
        toast("已复制到剪贴板");
        if (btn.dataset.copyLabel !== "0") {
          const span = btn.querySelector("span.cp-label") || null;
          if (span) {
            const old = span.textContent;
            span.textContent = "已复制";
            setTimeout(() => { span.textContent = old; }, 1600);
          } else {
            const old = btn.textContent;
            btn.textContent = "已复制";
            setTimeout(() => { btn.textContent = old; }, 1600);
          }
        }
      } else {
        toast("复制失败，请手动选择内容复制", "err");
      }
    });
  });
}

/** 生成一个标准复制按钮；label 为 false 时只显示图标 */
function copyBtn(text, label = "复制") {
  return `<button class="btn sm" data-copy="${esc(text)}" title="${esc(text)}">${ICON_COPY}${label ? `<span class="cp-label">${esc(label)}</span>` : ""}</button>`;
}

const ICON_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`;

/** 导出任意文本为本地文件（TXT / CSV） */
function downloadBlob(content, filename, type = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 生成 / 导入 CDK 后立刻把新码展示出来并提供一键复制。
 * 这些码不在这里复制走的话，之后只能在列表里手动逐个复制，所以这一步很关键。
 * @param {Array<{code:string, display:string}>} codes
 * @param {string} actionLabel  "生成" | "导入"
 * @param {string} batchName   用于导出文件名
 */
function showCodesResult(codes, actionLabel = "生成", batchName = "CDK") {
  const list = Array.isArray(codes) ? codes : [];
  if (!list.length) return;
  const nfmt = (n) => Number(n || 0).toLocaleString("zh-CN");
  const allText = list.map((c) => c.display || c.code).join("\n");

  const overlay = document.createElement("div");
  overlay.className = "overlay open";
  overlay.style.zIndex = "80"; // 叠在项目详情弹窗之上

  // 数量不多时逐条渲染并带单独复制按钮；量大时只渲染整体文本，避免生成上万个 DOM 节点
  const detail = list.length <= 100
    ? `<div class="table-wrap" style="max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:10px">
         <table class="tbl"><tbody>${list.map((c, i) => `
           <tr>
             <td class="num weak" style="width:52px">${i + 1}</td>
             <td class="payload limit" title="${esc(c.display || c.code)}">${esc(c.display || c.code)}</td>
             <td class="col-actions">${copyBtn(c.display || c.code)}</td>
           </tr>`).join("")}</tbody></table>
       </div>`
    : `<div style="max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:10px;background:var(--soft-bg);padding:12px 14px">
         <div class="payload" style="line-height:2;overflow-wrap:anywhere;white-space:pre-wrap;user-select:all">${esc(allText)}</div>
       </div>`;

  overlay.innerHTML = `
    <div class="modal" style="width:560px">
      <div class="modal-head">
        <h2 class="modal-title">${esc(actionLabel)}成功 · ${nfmt(list.length)} 个 CDK</h2>
        <p class="page-sub" style="margin-top:4px">请立即复制保存；关闭后仍可在项目的「领取 CDK」标签中查看、搜索与导出。</p>
      </div>
      <div class="modal-body">
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn primary sm" id="cpResAll">复制全部（${nfmt(list.length)}）</button>
          <button class="btn sm" id="txtRes">导出 TXT</button>
        </div>
        ${detail}
      </div>
      <div class="modal-foot"><button class="btn primary" id="closeRes">我知道了</button></div>
    </div>`;
  document.body.appendChild(overlay);
  // 记住外层状态：可能会盖在项目详情弹窗之上，关闭时要还原而不是一律放开滚动
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const destroy = () => { overlay.remove(); document.body.style.overflow = prevOverflow; };
  overlay.querySelector("#closeRes").onclick = destroy;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) destroy(); });
  overlay.querySelector("#cpResAll").onclick = async () => {
    const ok = await copyText(allText);
    toast(ok ? `已复制 ${nfmt(list.length)} 个 CDK` : "复制失败，请手动选择复制", ok ? "ok" : "err");
  };
  overlay.querySelector("#txtRes").onclick = () => {
    downloadBlob(allText, `${batchName}_CDK_${list.length}个.txt`);
    toast("已导出 TXT");
  };
  bindCopy(overlay);
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
  const sun = `<svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
  const moon = `<svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
  const gear = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

  const adminItemHtml = u.role === "admin"
    ? `<a class="dock-btn ${active === "users" ? "active" : ""}" href="/admin/users.html" title="用户管理">${icon(users)}</a>
       <a class="dock-btn ${active === "settings" ? "active" : ""}" href="/admin/settings.html" title="站点设置">${icon(gear)}</a>`
    : "";

  host.innerHTML = `
    <nav class="dock">
      <a class="dock-btn ${active === "dashboard" ? "active" : ""}" href="/admin/dashboard.html" title="概览">${icon(bar)}</a>
      <a class="dock-btn ${active === "project" ? "active" : ""}" href="/admin/project.html" title="项目">${icon(folder)}</a>
      <a class="dock-btn ${active === "received" ? "active" : ""}" href="/admin/received.html" title="领取记录">${icon(bag)}</a>
      ${adminItemHtml}
      <div class="dock-divider"></div>
      <button class="dock-btn dock-plus" id="dockNew" title="新建项目">${icon(plus)}</button>
      <button class="dock-btn theme-toggle" id="dockTheme" title="切换亮 / 暗主题">${sun}${moon}</button>
      <div class="dock-divider"></div>
      <button class="dock-btn" id="dockUser" title="退出登录">${icon(user)}</button>
    </nav>`;
  document.getElementById("dockNew").onclick = () => window.__openNewProject && window.__openNewProject();
  document.getElementById("dockTheme").onclick = () => {
    const dark = window.toggleTheme();
    toast(dark === "dark" ? "已切换到暗色主题" : "已切换到亮色主题", "info");
  };
  document.getElementById("dockUser").onclick = async () => {
    if (await confirmDialog({ title: "退出登录", description: "确定要退出当前账号吗？", confirmText: "退出", danger: true, icon: "alert" })) {
      tokenStore.clear();
      location.href = "/admin/login.html";
    }
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

  // 弹窗里的 <form> 没有提交目标，回车会触发表单默认提交并整页刷新，
  // 导致已填内容全部丢失。这里统一接管：回车 = 下一步 / 创建项目。
  overlay.querySelectorAll("form").forEach((f) => {
    f.addEventListener("submit", (e) => e.preventDefault());
    f.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (e.target.tagName === "TEXTAREA") return; // 多行输入框保留换行
      e.preventDefault();
      if (tabIndex < TABS.length - 1) $("npNext").click();
      else if (!$("npSubmit").disabled) $("npSubmit").click();
    });
  });

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
      const createdCodes = [];
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
          if (gen.codes) createdCodes.push(...gen.codes);
        }
      } else {
        const text = $("npCodeText").value;
        if (text.trim()) {
          const imp = await api(`/api/batches/${id}/claim-codes/import`, {
            method: "POST",
            body: JSON.stringify({ text }),
          });
          parts.push(`CDK ${imp.inserted} 个（去重 ${imp.duplicate}${imp.invalid ? `，无效 ${imp.invalid}` : ""}）`);
          if (imp.codes) createdCodes.push(...imp.codes);
        }
      }

      toast(parts.length ? `项目已创建：${parts.join("，")}` : "项目已创建");
      close();
      onCreated && onCreated();
      // 新建流程里生成的 CDK 同样要能一键复制走
      if (createdCodes.length) showCodesResult(createdCodes, codeSrc === "generate" ? "生成" : "导入", name);
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
  $("npName").focus(); // 打开就能直接输入
}

window.__openNewProject ||= openNewProjectModal;
window.openNewProjectModal = openNewProjectModal;
window.api = api;
window.toast = toast;
window.copyText = copyText;
window.esc = esc;
window.greeting = greeting;
window.renderDock = renderDock;
window.bindCopy = bindCopy;
window.copyBtn = copyBtn;
window.downloadBlob = downloadBlob;
window.showCodesResult = showCodesResult;
window.tokenStore = tokenStore;
window.ensureUser = ensureUser;
window.displayName = displayName;
window.getCurrentUser = () => currentUser;

/* ---------- 站点设置（公开接口，登录前也能读取） ---------- */
window.__siteSettings = null;
async function loadSiteSettings() {
  if (window.__siteSettings) return window.__siteSettings;
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    window.__siteSettings = data.settings || null;
  } catch { window.__siteSettings = null; }
  applySiteSettings();
  return window.__siteSettings;
}

/** 把站点名称 / 公告 / 页脚应用到页面（页面里放 #siteName / #siteNotice / #siteFooter 即可生效） */
function applySiteSettings() {
  const s = window.__siteSettings;
  if (!s) return;
  if (s.site_name) {
    const parts = document.title.split(" · ");
    const pageTitle = parts[0] === s.site_name ? parts.slice(1).join(" · ") || s.site_name : parts[0];
    document.title = pageTitle === s.site_name ? s.site_name : `${pageTitle} · ${s.site_name}`;
    const nameEl = document.getElementById("siteName");
    if (nameEl) nameEl.textContent = s.site_name;
  }
  const notice = document.getElementById("siteNotice");
  if (notice && s.site_notice) {
    notice.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg><span>${esc(s.site_notice)}</span>`;
    notice.classList.remove("hidden");
  }
  const footer = document.getElementById("siteFooter");
  if (footer && s.site_footer) {
    footer.textContent = s.site_footer;
    footer.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page) renderDock(page);
  loadSiteSettings();
});
