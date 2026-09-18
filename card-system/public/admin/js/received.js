/* 领取记录 */

function fullTime(s) { if (!s) return "—"; const d = new Date(s); return `${String(d.getFullYear()-2000).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

let allClaims = [];
let filterProject = "all";

async function load() {
  if (!(await requireAuth())) return;
  window.__openNewProject = () => openNewProjectModal(load);
  document.getElementById("pageTitle").textContent = `${greeting()}，管理员`;

  // 拉取全部项目领取记录
  const batches = await api("/api/batches");
  const claims = [];
  for (const b of batches.list) {
    const cl = await api(`/api/batches/${b.id}/claims`);
    cl.list.forEach((c) => claims.push({ ...c, project_id: b.id, project_name: b.name }));
  }
  claims.sort((a, b) => (a.id > b.id ? -1 : 1));
  allClaims = claims;

  // 项目筛选
  const fr = document.getElementById("filterRow");
  fr.innerHTML = `<span class="weak" style="font-size:12.5px">项目筛选</span>` +
    `<select class="input" id="projectSel" style="width:180px;padding:7px 12px">
       <option value="all">全部项目</option>
       ${batches.list.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}
     </select>`;
  document.getElementById("projectSel").onchange = (e) => { filterProject = e.target.value; render(); };

  document.getElementById("searchInput").addEventListener("input", render);
  render();
}

function render() {
  const kw = document.getElementById("searchInput").value.trim().toLowerCase();
  let list = allClaims;
  if (filterProject !== "all") list = list.filter((c) => c.project_id == filterProject);
  if (kw) list = list.filter((c) => (c.code + " " + c.ip).toLowerCase().includes(kw));

  document.getElementById("totalLabel").textContent = `共 ${list.length} 条记录`;
  const rows = document.getElementById("claimRows");
  if (!list.length) {
    rows.innerHTML = `<tr><td colspan="5" class="weak" style="text-align:center;padding:40px">暂无符合条件的记录</td></tr>`;
    return;
  }
  rows.innerHTML = list.map((c) => `
    <tr>
      <td class="num weak">${c.id}</td>
      <td>${esc(c.project_name)}</td>
      <td class="payload">${esc(c.code)}</td>
      <td class="num">${esc(c.ip || "—")}</td>
      <td class="num weak">${fullTime(c.claimed_at)}</td>
    </tr>`).join("");
}

load();