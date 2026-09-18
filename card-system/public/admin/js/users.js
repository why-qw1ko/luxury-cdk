/* 用户管理（仅管理员） */

function fullTime(s) { if (!s) return "—"; const d = new Date(s); return `${String(d.getFullYear()-2000).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

let me = null;

async function load() {
  if (!(await requireAuth())) return;
  me = await ensureUser();
  if (me.role !== "admin") { location.href = "/admin/dashboard.html"; return; }
  window.__openNewProject = () => openNewProjectModal(load);
  document.getElementById("pageTitle").textContent = `${greeting()}，${displayName(me)}`;
  document.getElementById("newUser").onclick = openAddUser;

  const res = await api("/api/users");
  const rows = document.getElementById("userRows");
  if (!res.list.length) {
    rows.innerHTML = `<tr><td colspan="9" class="weak" style="text-align:center;padding:40px">暂无用户</td></tr>`;
    return;
  }
  rows.innerHTML = res.list.map((u) => {
    const isMe = me.id === u.id;
    const isAdmin = u.role === "admin";
    return `
    <tr>
      <td>
        <div class="clamp-2" style="font-weight:500" title="${esc(u.username)}">${esc(u.username)}${isMe ? ' <span class="tag solid">我</span>' : ""}</div>
        <div class="weak trunc" style="font-size:12px" title="${esc(u.name)}">${esc(u.name)}</div>
      </td>
      <td>${isAdmin ? `<span class="badge" style="background:var(--accent-soft);color:var(--accent)">管理员</span>` : `<span class="badge off">普通用户</span>`}</td>
      <td>${u.status === "active" ? `<span class="badge ok"><span class="dot"></span>正常</span>` : `<span class="badge warn"><span class="dot"></span>已封禁</span>`}</td>
      <td class="num">${u.projects}</td>
      <td class="num">${u.contents}</td>
      <td class="num">${u.codes}</td>
      <td class="num">${u.claimed}</td>
      <td class="num weak" style="font-size:12px">${fullTime(u.created_at)}</td>
      <td class="col-actions">
        ${isAdmin ? `<span class="weak" style="font-size:12px">不可操作</span>`
          : ` <button class="btn sm" data-id="${u.id}" data-act="${u.status === "active" ? "ban" : "unban"}">${u.status === "active" ? "封禁" : "解封"}</button>
              <button class="btn sm" data-id="${u.id}" data-act="pwd">重置密码</button>
              <button class="btn sm danger" data-id="${u.id}" data-act="del">删除</button>`}
      </td>
    </tr>`;
  }).join("");

  rows.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = () => {
      const u = res.list.find((x) => x.id == btn.dataset.id);
      action(u, btn.dataset.act);
    };
  });
}

async function action(u, act) {
  if (act === "ban") {
    if (!confirm(`确认封禁用户「${u.username}」？封禁后其将无法登录后台。`)) return;
    await update(u.id, { status: "banned" });
    toast("已封禁用户");
  } else if (act === "unban") {
    await update(u.id, { status: "active" });
    toast("已解封用户");
  } else if (act === "pwd") {
    const pwd = prompt(`为「${u.username}」设置新密码（至少6位）：`);
    if (!pwd) return;
    if (pwd.length < 6) { toast("密码至少 6 位", "err"); return; }
    await update(u.id, { password: pwd });
    toast("密码已重置");
  } else if (act === "del") {
    if (!confirm(`确认删除用户「${u.username}」？其所有项目、分发内容、领取 CDK 与领取记录将一并删除，不可恢复。`)) return;
    try { await api(`/api/users/${u.id}`, { method: "DELETE" }); toast("用户已删除"); }
    catch (e) { toast(e.message, "err"); }
  }
  load();
}

async function update(id, body) {
  try { await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }); }
  catch (e) { toast(e.message, "err"); }
}

/* 新增用户弹窗 */
function openAddUser() {
  const overlay = document.createElement("div");
  overlay.className = "overlay open";
  overlay.innerHTML = `
    <div class="modal" style="width:420px">
      <div class="modal-head">
        <div class="row between">
          <div>
            <h2 class="card-title" style="font-size:16px">新增用户</h2>
            <p class="page-sub" style="margin-top:2px">为用户分配后台账号，其可创建并分发自己的 CDK</p>
          </div>
          <button class="btn sm" id="nuX" style="border:none;padding:6px 8px">✕</button>
        </div>
      </div>
      <div class="modal-body" style="padding-top:8px">
        <div class="field">
          <label for="nuName">用户名 <span class="hint">2-20字符</span></label>
          <input class="input" id="nuName" maxlength="20" placeholder="登录用户名"/>
        </div>
        <div class="field">
          <label for="nuPwd">初始密码 <span class="hint">至少6位</span></label>
          <input class="input" id="nuPwd" type="text" placeholder="初始登录密码"/>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="nuCancel">取消</button>
        <button class="btn primary" id="nuSave">创建用户</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  const $ = (id) => overlay.querySelector("#" + id);

  function close() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => overlay.remove(), 180);
  }
  $("nuX").onclick = close;
  $("nuCancel").onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  $("nuSave").onclick = async () => {
    const username = $("nuName").value.trim();
    const password = $("nuPwd").value;
    if (!username || !password) { toast("请填写用户名和密码", "err"); return; }
    const btn = $("nuSave"); btn.disabled = true; btn.textContent = "创建中…";
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify({ username, password }) });
      toast("用户已创建");
      close();
      load();
    } catch (e) { toast(e.message, "err"); }
    finally { btn.disabled = false; btn.textContent = "创建用户"; }
  };
}

load();
