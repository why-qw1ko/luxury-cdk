/* 项目管理 */

function fmt(n) { return Number(n || 0).toLocaleString("zh-CN"); }
function fmtTime(s) { if (!s) return "—"; const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fullTime(s) { if (!s) return "—"; const d = new Date(s); return `${String(d.getFullYear()-2000).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

async function loadList() {
  if (!(await requireAuth())) return;
  window.__openNewProject = () => openNewProjectModal(loadList);
  const u = await ensureUser();
  document.getElementById("pageTitle").textContent = `${greeting()}，${displayName(u)}`;
  document.getElementById("newProject").onclick = () => openNewProjectModal(loadList);

  const res = await api("/api/batches");
  const rows = document.getElementById("projectRows");
  if (!res.list.length) {
    rows.innerHTML = `<tr><td colspan="8" class="weak" style="text-align:center;padding:40px">还没有项目，点击右上角"新建项目"开始</td></tr>`;
    return;
  }
  rows.innerHTML = res.list.map((b) => `
    <tr>
      <td>
        <div style="font-weight:500">${esc(b.name)}</div>
        <div class="weak" style="font-size:12px">${b.mode === "one_one" ? "一码一用" : b.mode}</div>
      </td>
      <td>
        ${b.tags.length ? `<div class="tag-stack">${b.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : `<span class="weak">—</span>`}
      </td>
      <td class="num">${fmt(b.total)}</td>
      <td class="num">${fmt(b.remaining)}</td>
      <td class="num">${fmt(b.claimed)}</td>
      <td>${batchStatusBadge(b)}</td>
      <td class="num weak" style="font-size:12px">${fullTime(b.created_at)}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn sm" data-id="${b.id}" data-act="detail">查看</button>
        <button class="btn sm danger" data-id="${b.id}" data-act="del">删除</button>
      </td>
    </tr>`).join("");

  rows.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = () => {
      const b = res.list.find((x) => x.id == btn.dataset.id);
      if (btn.dataset.act === "detail") openBatchModal(b);
      else deleteBatch(b);
    };
  });
}

function batchStatusBadge(b) {
  const now = new Date();
  let cls = "ok", label = "进行中";
  if (b.end_time && now > new Date(b.end_time)) { cls = "off"; label = "已结束"; }
  else if (b.start_time && now < new Date(b.start_time)) { cls = "warn"; label = "未开始"; }
  return `<span class="badge ${cls}"><span class="dot"></span>${label}</span>`;
}

async function deleteBatch(b) {
  if (!confirm(`确认删除项目「${b.name}」？该项目下的所有卡密与领取记录将一并删除。`)) return;
  try {
    await api(`/api/batches/${b.id}`, { method: "DELETE" });
    toast("项目已删除");
    loadList();
  } catch (e) { toast(e.message, "err"); }
}

/* ---------- 项目详情弹窗 ---------- */
async function openBatchModal(b) {
  const overlay = document.createElement("div");
  overlay.className = "overlay open";
  overlay.innerHTML = `
    <div class="modal" style="width:720px">
      <div class="modal-head">
        <div class="row between">
          <div style="min-width:0">
            <h2 class="card-title" style="font-size:16px">${esc(b.name)}</h2>
            <div class="row weak" style="font-size:12px;gap:10px;margin-top:4px;flex-wrap:wrap">
              ${b.tags.length ? b.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("") : ""}
              <span>时间：${fmtTime(b.start_time)} ~ ${fmtTime(b.end_time)}</span>
              <span>${b.limit_ip ? "· 限制同IP" : "· 不限IP"}</span>
            </div>
          </div>
          <div class="row" id="batchStatsRow"></div>
        </div>
        <div class="tabs">
          <button class="tab active" data-tab="cards">卡密管理</button>
          <button class="tab" data-tab="claims">领取记录</button>
        </div>
      </div>
      <div class="modal-body" style="overflow:hidden;display:flex;flex-direction:column">
        <div id="paneCards"></div>
        <div id="paneClaims" class="hidden"></div>
      </div>
      <div class="modal-foot">
        <a class="btn" id="expCsv">导出 CSV</a>
        <button class="btn danger" id="delBatch">删除项目</button>
        <button class="btn primary" id="closeModal">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const $ = (id) => overlay.querySelector("#" + id);
  const tabs = overlay.querySelectorAll(".tab");

  function switchTab(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    $("paneCards").classList.toggle("hidden", name !== "cards");
    $("paneClaims").classList.toggle("hidden", name !== "claims");
  }
  tabs.forEach((t) => (t.onclick = () => switchTab(t.dataset.tab)));

  $("closeModal").onclick = close;
  $("delBatch").onclick = async () => {
    if (!confirm(`确认删除项目「${b.name}」？`)) return;
    await api(`/api/batches/${b.id}`, { method: "DELETE" });
    toast("项目已删除");
    close(); loadList();
  };
  $("expCsv").onclick = async () => {
    const token = tokenStore.get();
    const res = await fetch(`/api/batches/${b.id}/export`, { headers: { Authorization: "Bearer " + token } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `batch_${b.id}_cards.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  function close() { overlay.classList.remove("open"); document.body.style.overflow = ""; setTimeout(() => overlay.remove(), 180); }

  await renderCardsTab(b);
  await renderClaimsTab(b);
  refreshStats();

  async function refreshStats() {
    const d = await api(`/api/batches/${b.id}`);
    $("batchStatsRow").innerHTML =
      `<span class="badge off">总 ${d.batch.total}</span>
       <span class="badge ${d.batch.remaining ? "warn" : "off"}">剩余 ${d.batch.remaining}</span>
       <span class="badge ok">已领 ${d.batch.claimed}</span>`;
  }

  /* 卡密管理 */
  async function renderCardsTab() {
    $("paneCards").innerHTML = `
      <div class="field">
        <label>批量导入卡密 <span class="hint">每行一个，空格/逗号分隔，自动去重</span></label>
        <textarea class="input" id="batchCodes" style="min-height:130px" placeholder="在此粘贴卡密文本，多个项目下也将自动剔除已存在卡密"></textarea>
        <span class="hint num" id="codeCount"></span>
      </div>
      <div class="row" style="gap:10px;margin-bottom:6px">
        <button class="btn primary sm" id="doImport">导入并去重</button>
        <span class="weak" id="importResult" style="font-size:12.5px"></span>
      </div>
      <div class="table-wrap" style="max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:10px">
        <table class="tbl"><thead><tr><th>#</th><th>卡密</th><th>状态</th><th style="text-align:right">领取时间</th></tr></thead><tbody id="cardsBody"></tbody></table>
      </div>`;

    $("batchCodes").addEventListener("input", () => {
      const n = new Set($("batchCodes").value.replace(/\r/g, "").split(/[\s,，;；]+/).map(s=>s.trim()).filter(Boolean)).size;
      $("codeCount").textContent = `已识别 ${n} 个唯一卡密`;
    });
    $("doImport").onclick = async () => {
      const text = $("batchCodes").value;
      if (!text.trim()) { toast("请先粘贴卡密文本", "err"); return; }
      const btn = $("doImport"); btn.disabled = true;
      try {
        const r = await api(`/api/batches/${b.id}/cards/import`, { method: "POST", body: JSON.stringify({ text }) });
        $("importResult").innerHTML = `<span style="color:var(--success)">成功导入 ${r.inserted}</span> · 去重 ${r.duplicate}，当前剩余 ${r.stats.remaining}`;
        $("batchCodes").value = "";
        await refreshStats(); await renderCardsTabCards();
      } catch (e) { toast(e.message, "err"); }
      finally { btn.disabled = false; }
    };
    await renderCardsTabCards();
  }

  async function renderCardsTabCards() {
    const res = await api(`/api/batches/${b.id}/cards`);
    const body = document.getElementById("cardsBody");
    if (!body) return;
    if (!res.list.length) { body.innerHTML = `<tr><td colspan="4" class="weak" style="text-align:center">暂无卡密</td></tr>`; return; }
    body.innerHTML = res.list.map((c, i) => `
      <tr>
        <td class="num weak">${i + 1}</td>
        <td class="payload">${esc(c.code)}</td>
        <td>${c.status === "claimed" ? `<span class="badge off">已领取</span>` : `<span class="badge ok">可用</span>`}</td>
        <td class="weak num" style="text-align:right">${esc(c.status === "claimed" ? fullTime(c.created_at) : "—")}</td>
      </tr>`).join("");
  }

  /* 领取记录 */
  async function renderClaimsTab() {
    const res = await api(`/api/batches/${b.id}/claims`);
    const rows = res.list.map((c) => `
      <tr>
        <td class="num weak">${c.id}</td>
        <td class="payload">${esc(c.code)}</td>
        <td class="num">${esc(c.ip || "—")}</td>
        <td class="num weak">${fullTime(c.claimed_at)}</td>
      </tr>`).join("") || `<tr><td colspan="4" class="weak" style="text-align:center">暂无领取记录</td></tr>`;
    $("paneClaims").innerHTML = `
      <div class="table-wrap" style="max-height:400px;overflow:auto;border:1px solid var(--border);border-radius:10px">
        <table class="tbl"><thead><tr><th>#</th><th>卡密</th><th>领取IP</th><th>领取时间</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
  }
}

loadList();