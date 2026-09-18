/* 项目管理：项目 / 分发内容 / 领取 CDK / 领取记录 */

function fmt(n) { return Number(n || 0).toLocaleString("zh-CN"); }
function fmtTime(s) { if (!s) return "—"; const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fullTime(s) { if (!s) return "—"; const d = new Date(String(s).replace(" ", "T")); if (isNaN(d.getTime())) return String(s); return `${String(d.getFullYear()-2000).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

const TYPE_LABEL = { code: "兑换码", link: "链接", text: "文本" };
const MAX_GENERATE = 5000;

async function loadList() {
  if (!(await requireAuth())) return;
  window.__openNewProject = () => openNewProjectModal(loadList);
  const u = await ensureUser();
  document.getElementById("pageTitle").textContent = `${greeting()}，${displayName(u)}`;
  document.getElementById("newProject").onclick = () => openNewProjectModal(loadList);

  const res = await api("/api/batches");
  const rows = document.getElementById("projectRows");
  if (!res.list.length) {
    rows.innerHTML = `<tr><td colspan="9" class="weak" style="text-align:center;padding:40px">还没有项目，点击右上角"新建项目"开始</td></tr>`;
    return;
  }
  rows.innerHTML = res.list.map((b) => `
    <tr>
      <td>
        <div style="font-weight:500">${esc(b.name)}</div>
        <div class="weak" style="font-size:12px">一码一用 · ${b.bind_mode === "bound" ? "一码一内容绑定" : "动态发放"}</div>
      </td>
      <td>
        ${b.tags.length ? `<div class="tag-stack">${b.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : `<span class="weak">—</span>`}
      </td>
      <td class="num" style="font-weight:600">${fmt(b.remaining)}</td>
      <td class="num weak" style="font-size:12.5px">${fmt(b.codeAvailable)} / ${fmt(b.codeTotal)}</td>
      <td class="num weak" style="font-size:12.5px">${fmt(b.contentAvailable)} / ${fmt(b.contentTotal)}</td>
      <td class="num">${fmt(b.codeClaimed)}</td>
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
  if (!confirm(`确认删除项目「${b.name}」？该项目下的分发内容、领取 CDK 与领取记录将一并删除，不可恢复。`)) return;
  try {
    await api(`/api/batches/${b.id}`, { method: "DELETE" });
    toast("项目已删除");
    loadList();
  } catch (e) { toast(e.message, "err"); }
}

async function downloadCsv(path, filename) {
  const token = tokenStore.get();
  const res = await fetch(path, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) { toast("导出失败", "err"); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ---------- 项目详情弹窗 ---------- */
async function openBatchModal(b) {
  const overlay = document.createElement("div");
  overlay.className = "overlay open";
  overlay.innerHTML = `
    <div class="modal" style="width:780px">
      <div class="modal-head">
        <div class="row between">
          <div style="min-width:0">
            <h2 class="card-title" style="font-size:16px">${esc(b.name)}</h2>
            <div class="row weak" style="font-size:12px;gap:10px;margin-top:4px;flex-wrap:wrap">
              ${b.tags.length ? b.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("") : ""}
              <span>时间：${fmtTime(b.start_time)} ~ ${fmtTime(b.end_time)}</span>
              <span id="bindModeTag"></span>
            </div>
          </div>
          <div class="row" style="gap:8px">
            <button class="btn sm" id="bindModeBtn" title="切换分发模式">切换模式</button>
            <div class="row" id="batchStatsRow"></div>
          </div>
        </div>
        <div class="tabs">
          <button class="tab active" data-tab="contents">分发内容</button>
          <button class="tab" data-tab="codes">领取 CDK</button>
          <button class="tab" data-tab="claims">领取记录</button>
        </div>
      </div>
      <div class="modal-body" style="max-height:64vh">
        <div id="paneContents"></div>
        <div id="paneCodes" class="hidden"></div>
        <div id="paneClaims" class="hidden"></div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="expContents">导出内容 CSV</button>
        <button class="btn" id="expCodes">导出 CDK CSV</button>
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
    $("paneContents").classList.toggle("hidden", name !== "contents");
    $("paneCodes").classList.toggle("hidden", name !== "codes");
    $("paneClaims").classList.toggle("hidden", name !== "claims");
  }
  tabs.forEach((t) => (t.onclick = () => switchTab(t.dataset.tab)));

  $("closeModal").onclick = close;
  renderBindModeTag();
  $("bindModeBtn").onclick = async () => {
    const next = b.bind_mode === "bound" ? "dynamic" : "bound";
    const tip =
      next === "bound"
        ? "切换为一码一内容绑定？之后生成 / 导入 CDK 会按内容顺序一对一绑定，已生成的 CDK 不受影响。"
        : "切换为动态发放？之后生成 / 导入 CDK 不再绑定内容，已绑定的 CDK 仍按绑定发放。";
    if (!confirm(tip)) return;
    try {
      const r = await api(`/api/batches/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ bind_mode: next }),
      });
      b.bind_mode = r.batch.bind_mode;
      renderBindModeTag();
      await renderCodesTab();
      await refreshStats();
      toast("分发模式已更新");
    } catch (e) { toast(e.message, "err"); }
  };
  $("delBatch").onclick = async () => {
    if (!confirm(`确认删除项目「${b.name}」？`)) return;
    await api(`/api/batches/${b.id}`, { method: "DELETE" });
    toast("项目已删除");
    close(); loadList();
  };
  $("expContents").onclick = () =>
    downloadCsv(`/api/batches/${b.id}/export`, `batch_${b.id}_contents.csv`);
  $("expCodes").onclick = () =>
    downloadCsv(`/api/batches/${b.id}/claim-codes/export`, `batch_${b.id}_claim_codes.csv`);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  function close() { overlay.classList.remove("open"); document.body.style.overflow = ""; setTimeout(() => overlay.remove(), 180); }

  function renderBindModeTag() {
    const bound = b.bind_mode === "bound";
    $("bindModeTag").innerHTML = bound
      ? `<span class="badge warn"><span class="dot"></span>一码一内容绑定</span>`
      : `<span class="badge ok"><span class="dot"></span>动态发放</span>`;
  }

  await renderContentsTab();
  await renderCodesTab();
  await renderClaimsTab();
  refreshStats();

  async function refreshStats() {
    const d = await api(`/api/batches/${b.id}`);
    const s = d.batch;
    $("batchStatsRow").innerHTML =
      `<span class="badge off">CDK ${s.codeAvailable}/${s.codeTotal}</span>
       <span class="badge warn">内容 ${s.contentAvailable}/${s.contentTotal}</span>
       <span class="badge ok">已领 ${s.codeClaimed}</span>`;
  }

  /* ---------- 分发内容 ---------- */
  async function renderContentsTab() {
    $("paneContents").innerHTML = `
      <div class="field">
        <label>批量导入分发内容 <span class="hint">兑换码 / 链接 / 文本，每行一条，自动去重</span></label>
        <textarea class="input" id="contentText" style="min-height:110px" placeholder="在此粘贴内容，支持空格 / 逗号分隔"></textarea>
        <div class="row between" style="margin-top:6px">
          <span class="hint num" id="contentCount"></span>
          <select class="input" id="contentTypeSel" style="width:auto;padding:5px 10px;font-size:12px">
            <option value="auto">自动识别类型</option>
            <option value="code">全部按兑换码</option>
            <option value="link">全部按链接</option>
            <option value="text">全部按文本</option>
          </select>
        </div>
      </div>
      <div class="row" style="gap:10px;margin-bottom:10px">
        <button class="btn primary sm" id="doImportContent">导入并去重</button>
        <span class="weak" id="contentImportResult" style="font-size:12.5px"></span>
      </div>
      <div id="contentListHost"></div>`;

    const sync = () => {
      const n = new Set($("contentText").value.replace(/\r/g, "").split(/[\s,，;；]+/).map((s) => s.trim()).filter(Boolean)).size;
      $("contentCount").textContent = `已识别 ${n} 条唯一内容`;
    };
    $("contentText").addEventListener("input", sync);
    sync();

    $("doImportContent").onclick = async () => {
      const text = $("contentText").value;
      if (!text.trim()) { toast("请先粘贴内容", "err"); return; }
      const btn = $("doImportContent"); btn.disabled = true;
      try {
        const r = await api(`/api/batches/${b.id}/contents/import`, {
          method: "POST",
          body: JSON.stringify({ text, type: $("contentTypeSel").value }),
        });
        $("contentImportResult").innerHTML = `<span style="color:var(--success)">成功导入 ${r.inserted}</span> · 去重 ${r.duplicate}，剩余可发 ${r.stats.contentAvailable}`;
        $("contentText").value = "";
        sync();
        await renderContentList();
        await refreshStats();
      } catch (e) { toast(e.message, "err"); }
      finally { btn.disabled = false; }
    };

    await renderContentList();
  }

  async function renderContentList() {
    const res = await api(`/api/batches/${b.id}/contents`);
    const host = $("contentListHost");
    if (!host) return;
    const rows = res.list.map((c, i) => `
      <tr>
        <td class="num weak">${i + 1}</td>
        <td><span class="tag">${esc(TYPE_LABEL[c.type] || c.type)}</span></td>
        <td class="payload" style="max-width:280px;word-break:break-all">${esc(c.payload)}</td>
        <td>${c.status === "used" ? `<span class="badge off">已发放</span>` : `<span class="badge ok">未发放</span>`}</td>
        <td class="payload weak">${c.bound_code ? esc(c.bound_code) : "—"}</td>
        <td class="payload weak">${c.claim_code ? esc(c.claim_code) : "—"}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn sm" data-copy="${esc(c.payload)}">复制</button>
          ${c.status === "used" ? "" : `<button class="btn sm danger" data-del-content="${c.id}">删除</button>`}
        </td>
      </tr>`).join("") || `<tr><td colspan="7" class="weak" style="text-align:center">暂无内容</td></tr>`;
    host.innerHTML = `
      <div class="weak" style="font-size:12px;margin-bottom:6px">内容共 ${fmt(res.total)} 条${res.total > res.list.length ? `，下方显示最新 ${res.list.length} 条` : ""}</div>
      <div class="table-wrap" style="max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:10px">
        <table class="tbl"><thead><tr><th>#</th><th>类型</th><th>内容</th><th>状态</th><th>绑定 CDK</th><th>领取 CDK</th><th style="text-align:right">操作</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    host.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.onclick = async () => { toast((await copyText(btn.dataset.copy)) ? "已复制" : "复制失败"); };
    });
    host.querySelectorAll("[data-del-content]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("确认删除这条内容？")) return;
        try {
          await api(`/api/batches/${b.id}/contents/${btn.dataset.delContent}`, { method: "DELETE" });
          toast("内容已删除");
          await renderContentList(); await refreshStats();
        } catch (e) { toast(e.message, "err"); }
      };
    });
  }

  /* ---------- 领取 CDK ---------- */
  async function renderCodesTab() {
    const detail = await api(`/api/batches/${b.id}`);
    const s = detail.batch;
    const bound = s.bind_mode === "bound";
    const reserved = s.contentAvailable - s.contentBindable;
    const modeHint = bound
      ? `当前为一码一内容绑定：可绑定的内容 ${fmt(s.contentBindable)} 条，绑定时按内容顺序一一对应`
      : `当前为动态发放：可被动态 CDK 取用的内容 ${fmt(s.contentBindable)} 条，用户领取时按顺序发放` +
        (reserved > 0 ? `（另有 ${fmt(reserved)} 条已被其他 CDK 绑定，只会发给对应的 CDK）` : "");
    // 内容池为空时补发还是发不出去，先在这里明确提示
    const poolTip = s.contentBindable === 0
      ? `<div class="weak" style="font-size:12px;margin-top:6px;color:var(--danger)">${
          bound
            ? "没有可绑定的内容，请先在「分发内容」中导入。"
            : "没有可被动态 CDK 取用的内容，新生成的 CDK 会取不到内容，请先在「分发内容」中导入。"
        }</div>`
      : "";
    $("paneCodes").innerHTML = `
      <div class="card" style="padding:14px 16px;background:#F9FAFB;margin-bottom:14px">
        <div class="row between" style="flex-wrap:wrap;gap:10px">
          <div class="row" style="gap:10px;flex-wrap:wrap">
            <input class="input" id="genCount" type="number" min="1" max="${bound ? Math.max(s.contentBindable, 1) : MAX_GENERATE}" placeholder="生成数量" style="width:120px"/>
            <input class="input" id="genPrefix" maxlength="8" placeholder="前缀（可选）" style="width:130px"/>
            <button class="btn primary sm" id="doGenerate">批量生成</button>
          </div>
          <div class="row" style="gap:8px">
            <input class="input" id="importCodes" placeholder="已有 CDK，逗号 / 换行分隔" style="width:220px"/>
            <button class="btn sm" id="doImportCodes">手动导入</button>
          </div>
        </div>
        <div class="weak" style="font-size:12px;margin-top:8px">${esc(modeHint)}</div>
        <div class="weak" style="font-size:12px;margin-top:2px">标准 CDK 为 16 位随机码，不区分大小写、横线可省略。</div>
        ${poolTip}
      </div>
      <div id="codeListHost"></div>`;

    $("doGenerate").onclick = async () => {
      const count = Number($("genCount").value);
      if (!Number.isInteger(count) || count < 1) { toast("请填写生成数量", "err"); return; }
      if (count > MAX_GENERATE) { toast(`单次最多生成 ${MAX_GENERATE} 个`, "err"); return; }
      const btn = $("doGenerate"); btn.disabled = true;
      try {
        const r = await api(`/api/batches/${b.id}/claim-codes/generate`, {
          method: "POST",
          body: JSON.stringify({ count, prefix: $("genPrefix").value.trim() }),
        });
        toast(`已生成 ${r.inserted} 个 CDK`);
        $("genCount").value = "";
        await renderCodeList(); await refreshStats();
      } catch (e) { toast(e.message, "err"); }
      finally { btn.disabled = false; }
    };

    $("doImportCodes").onclick = async () => {
      const text = $("importCodes").value;
      if (!text.trim()) { toast("请先填写 CDK", "err"); return; }
      const btn = $("doImportCodes"); btn.disabled = true;
      try {
        const r = await api(`/api/batches/${b.id}/claim-codes/import`, {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        toast(`导入 ${r.inserted} 个，去重 ${r.duplicate}${r.invalid ? `，无效 ${r.invalid}` : ""}`);
        $("importCodes").value = "";
        await renderCodeList(); await refreshStats();
      } catch (e) { toast(e.message, "err"); }
      finally { btn.disabled = false; }
    };

    await renderCodeList();
  }

  async function renderCodeList() {
    const res = await api(`/api/batches/${b.id}/claim-codes`);
    const host = $("codeListHost");
    if (!host) return;
    const rows = res.list.map((c, i) => `
      <tr>
        <td class="num weak">${i + 1}</td>
        <td class="payload">${esc(c.code_display)}</td>
        <td class="payload weak" style="max-width:200px;word-break:break-all">${c.bound_payload ? esc(c.bound_payload) : "—"}</td>
        <td>${c.status === "claimed"
          ? `<span class="badge off">已使用</span>`
          : c.status === "disabled"
            ? `<span class="badge warn">已禁用</span>`
            : `<span class="badge ok">未使用</span>`}</td>
        <td class="weak num" style="font-size:12px">${c.claimed_at ? fullTime(c.claimed_at) : "—"}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn sm" data-copy="${esc(c.code_display)}">复制</button>
          ${c.status === "available" ? `<button class="btn sm danger" data-del-code="${c.id}">删除</button>` : ""}
        </td>
      </tr>`).join("") || `<tr><td colspan="6" class="weak" style="text-align:center">暂无 CDK，请先批量生成</td></tr>`;
    host.innerHTML = `
      <div class="weak" style="font-size:12px;margin-bottom:6px">CDK 共 ${fmt(res.total)} 个${res.total > res.list.length ? `，下方显示最新 ${res.list.length} 个（完整清单请导出 CSV）` : ""}</div>
      <div class="table-wrap" style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:10px">
        <table class="tbl"><thead><tr><th>#</th><th>领取 CDK</th><th>绑定内容</th><th>状态</th><th>领取时间</th><th style="text-align:right">操作</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    host.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.onclick = async () => { toast((await copyText(btn.dataset.copy)) ? "已复制" : "复制失败"); };
    });
    host.querySelectorAll("[data-del-code]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("确认删除这个 CDK？")) return;
        try {
          await api(`/api/batches/${b.id}/claim-codes/${btn.dataset.delCode}`, { method: "DELETE" });
          toast("CDK 已删除");
          await renderCodeList(); await refreshStats();
        } catch (e) { toast(e.message, "err"); }
      };
    });
  }

  /* ---------- 领取记录 ---------- */
  async function renderClaimsTab() {
    const res = await api(`/api/batches/${b.id}/claims`);
    const rows = res.list.map((c, i) => `
      <tr>
        <td class="num weak">${i + 1}</td>
        <td class="payload">${esc(c.claim_code)}</td>
        <td><span class="tag">${esc(TYPE_LABEL[c.content_type] || c.content_type)}</span></td>
        <td class="payload" style="max-width:240px;word-break:break-all">${esc(c.content_payload)}</td>
        <td class="num">${esc(c.ip || "—")}</td>
        <td class="num weak">${fullTime(c.claimed_at)}</td>
      </tr>`).join("") || `<tr><td colspan="6" class="weak" style="text-align:center">暂无领取记录</td></tr>`;
    $("paneClaims").innerHTML = `
      <div class="weak" style="font-size:12px;margin-bottom:6px">共 ${fmt(res.total)} 条记录${res.total > res.list.length ? `，下方显示最新 ${res.list.length} 条` : ""}</div>
      <div class="table-wrap" style="max-height:400px;overflow:auto;border:1px solid var(--border);border-radius:10px">
        <table class="tbl"><thead><tr><th>#</th><th>领取 CDK</th><th>类型</th><th>发放内容</th><th>领取 IP</th><th>领取时间</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
  }
}

loadList();
