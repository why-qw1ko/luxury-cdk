/* 领取记录 */

function fullTime(s) { if (!s) return "—"; const d = new Date(String(s).replace(" ", "T")); if (isNaN(d.getTime())) return String(s); return `${String(d.getFullYear()-2000).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

const TYPE_LABEL = { code: "兑换码", link: "链接", text: "文本" };

let allClaims = [];
let filterProject = "all";
let truncated = [];

/* 单项目单次拉取上限，与后端 MAX_PAGE 保持一致 */
const CLAIM_LIMIT = 5000;

async function load() {
  if (!(await requireAuth())) return;
  window.__openNewProject = () => openNewProjectModal(load);
  const u = await ensureUser();
  document.getElementById("pageTitle").textContent = `${greeting()}，${displayName(u)}`;

  // 拉取全部项目领取记录（单项目超过上限时记录下来，避免静默丢数据）
  const batches = await api("/api/batches");
  const claims = [];
  truncated = [];
  for (const b of batches.list) {
    const cl = await api(`/api/batches/${b.id}/claims?limit=${CLAIM_LIMIT}`);
    cl.list.forEach((c) => claims.push({ ...c, project_id: b.id, project_name: b.name }));
    if (cl.total > cl.list.length) {
      truncated.push({ id: String(b.id), name: b.name, loaded: cl.list.length, total: cl.total });
    }
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
  if (kw) list = list.filter((c) => (c.claim_code + " " + c.content_payload + " " + c.ip).toLowerCase().includes(kw));

  const cut = filterProject === "all" ? truncated : truncated.filter((p) => p.id === String(filterProject));
  document.getElementById("totalLabel").innerHTML =
    `共 ${list.length} 条记录` +
    (cut.length
      ? ` · <span style="color:var(--danger)">${cut
          .map((p) => `「${esc(p.name)}」仅显示最新 ${p.loaded}/${p.total} 条`)
          .join("、")}，更早的记录请导出该项目的内容 CSV 查看</span>`
      : "");
  const rows = document.getElementById("claimRows");
  if (!list.length) {
    rows.innerHTML = `<tr><td colspan="7" class="weak" style="text-align:center;padding:40px">暂无符合条件的记录</td></tr>`;
    return;
  }
  rows.innerHTML = list.map((c) => `
    <tr>
      <td class="num weak">${c.id}</td>
      <td>${esc(c.project_name)}</td>
      <td class="payload">${esc(c.claim_code)}</td>
      <td><span class="tag">${esc(TYPE_LABEL[c.content_type] || c.content_type)}</span></td>
      <td style="max-width:260px">
        <div class="row" style="gap:8px;align-items:flex-start">
          <span class="payload" style="flex:1;min-width:0;word-break:break-all">${esc(c.content_payload)}</span>
          <button class="btn sm" data-copy="${esc(c.content_payload)}">复制</button>
        </div>
      </td>
      <td class="num">${esc(c.ip || "—")}</td>
      <td class="num weak">${fullTime(c.claimed_at)}</td>
    </tr>`).join("");

  rows.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.onclick = async () => { toast((await copyText(btn.dataset.copy)) ? "已复制" : "复制失败"); };
  });
}

load();
