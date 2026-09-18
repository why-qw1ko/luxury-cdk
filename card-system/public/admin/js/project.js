/* 项目管理：项目 / 分发内容 / 领取 CDK / 领取记录 */

function fmt(n) { return Number(n || 0).toLocaleString("zh-CN"); }
function fmtTime(s) { if (!s) return "—"; const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fullTime(s) { if (!s) return "—"; const d = new Date(String(s).replace(" ", "T")); if (isNaN(d.getTime())) return String(s); return `${String(d.getFullYear()-2000).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

const TYPE_LABEL = { code: "兑换码", link: "链接", text: "文本" };
const MAX_GENERATE = 5000;

/** CDK 打码显示：保留前 4 后 4，中间用 **** 代替（分组展示，与 code_display 风格一致） */
function maskCode(raw) {
  const s = String(raw || "").replace(/[\s-]/g, "").toUpperCase();
  if (!s) return "";
  if (s.length <= 8) return s; // 太短没有遮的意义
  const groups = Math.ceil(s.length / 4);
  const mid = Array(Math.max(groups - 2, 1)).fill("****").join("-");
  return `${s.slice(0, 4)}-${mid}-${s.slice(-4)}`;
}

let allBatches = [];
let projectKeyword = "";

async function loadList() {
  if (!(await requireAuth())) return;
  window.__openNewProject = () => openNewProjectModal(loadList);
  const u = await ensureUser();
  document.getElementById("pageTitle").textContent = `${greeting()}，${displayName(u)}`;
  document.getElementById("newProject").onclick = () => openNewProjectModal(loadList);

  const res = await api("/api/batches");
  allBatches = res.list;

  const search = document.getElementById("projectSearch");
  if (search && !search.dataset.bound) {
    search.dataset.bound = "1";
    let timer = null;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => { projectKeyword = search.value; renderProjectRows(); }, 200);
    });
  }

  renderProjectRows();
}

function renderProjectRows() {
  const rows = document.getElementById("projectRows");
  if (!allBatches.length) {
    rows.innerHTML = `<tr><td colspan="9" class="weak" style="text-align:center;padding:40px">还没有项目，点击右上角"新建项目"开始</td></tr>`;
    return;
  }
  const kw = projectKeyword.trim().toLowerCase();
  const list = kw
    ? allBatches.filter((b) =>
        (b.name + " " + (b.tags || []).join(" ") + " " + (b.description || "")).toLowerCase().includes(kw))
    : allBatches;

  if (!list.length) {
    rows.innerHTML = `<tr><td colspan="9" class="weak" style="text-align:center;padding:40px">没有匹配「${esc(projectKeyword)}」的项目</td></tr>`;
    return;
  }

  rows.innerHTML = list.map((b) => `
    <tr>
      <td style="min-width:180px;max-width:340px">
        <div class="trunc" style="font-weight:500" title="${esc(b.name)}">${esc(b.name)}</div>
        <div class="weak trunc" style="font-size:12px" title="${b.bind_mode === "bound" ? "一码一内容绑定" : "动态发放"}">一码一用 · ${b.bind_mode === "bound" ? "一码一内容绑定" : "动态发放"}</div>
      </td>
      <td style="max-width:220px">
        ${b.tags.length
          ? `<div class="row" style="gap:4px" title="${esc(b.tags.join("、"))}"><span class="tag trunc" style="max-width:120px">${esc(b.tags[0])}</span>${b.tags.length > 1 ? `<span class="tag">+${b.tags.length - 1}</span>` : ""}</div>`
          : `<span class="weak">—</span>`}
      </td>
      <td class="num" style="font-weight:600">${fmt(b.remaining)}</td>
      <td class="num weak" style="font-size:12.5px">${fmt(b.codeAvailable)} / ${fmt(b.codeTotal)}</td>
      <td class="num weak" style="font-size:12.5px">${fmt(b.contentAvailable)} / ${fmt(b.contentTotal)}</td>
      <td class="num">${fmt(b.codeClaimed)}</td>
      <td>${batchStatusBadge(b)}</td>
      <td class="num weak" style="font-size:12px">${fullTime(b.created_at)}</td>
      <td class="col-actions">
        <button class="btn sm" data-id="${b.id}" data-act="detail">查看</button>
        <button class="btn sm danger" data-id="${b.id}" data-act="del">删除</button>
      </td>
    </tr>`).join("");

  rows.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = () => {
      const b = list.find((x) => x.id == btn.dataset.id);
      if (!b) return;
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
        <div class="row between" style="gap:12px">
          <div style="flex:1 1 auto;min-width:0">
            <h2 class="modal-title" title="${esc(b.name)}">${esc(b.name)}</h2>
            <div class="row weak" style="font-size:12px;gap:10px;margin-top:4px;flex-wrap:wrap">
              ${b.tags.length ? b.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("") : ""}
              <span>时间：${fmtTime(b.start_time)} ~ ${fmtTime(b.end_time)}</span>
              <span id="bindModeTag"></span>
            </div>
          </div>
          <div class="row" style="gap:8px;flex-shrink:0;flex-wrap:wrap">
            <button class="btn sm" id="bindModeBtn" title="切换分发模式">切换模式</button>
            <div class="row" id="batchStatsRow" style="gap:6px;flex-wrap:wrap"></div>
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

  // 列表查询状态（搜索 / 状态过滤 / 翻页）
  const codeState = { keyword: "", status: "all", offset: 0, limit: 200, timer: null };
  const contentState = { keyword: "", status: "all", offset: 0, limit: 200, timer: null };

  /** 拉取 CDK 纯文本清单（每行一个），用于「复制全部」 */
  async function fetchCodesText(status) {
    const res = await fetch(`/api/batches/${b.id}/claim-codes/text?status=${encodeURIComponent(status)}`, {
      headers: { Authorization: "Bearer " + tokenStore.get() },
    });
    if (!res.ok) throw new Error("获取 CDK 清单失败");
    return (await res.text()).trim();
  }

  async function bulkCopyCodes(status) {
    try {
      const text = await fetchCodesText(status);
      if (!text) { toast(status === "available" ? "没有未使用的 CDK" : "暂无 CDK", "err"); return; }
      const ok = await copyText(text);
      toast(ok ? `已复制 ${text.split("\n").length} 个 CDK` : "复制失败，请手动选择复制", ok ? "ok" : "err");
    } catch (e) { toast(e.message, "err"); }
  }

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
    const ok = await confirmDialog({
      title: next === "bound" ? "切换为一码一内容绑定" : "切换为动态发放",
      description: next === "bound"
        ? "之后生成 / 导入 CDK 会按内容顺序一对一绑定，已生成的 CDK 不受影响。"
        : "之后生成 / 导入 CDK 不再绑定内容，已绑定的 CDK 仍按绑定发放。",
      confirmText: "切换",
    });
    if (!ok) return;
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
    const ok = await confirmDialog({
      title: `删除项目「${b.name}」`,
      description: "该项目下的分发内容、领取 CDK 与领取记录将一并删除，不可恢复。",
      confirmText: "删除",
      danger: true,
      icon: "trash",
    });
    if (!ok) return;
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
      <div class="row" style="gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn primary sm" id="doImportContent">导入并去重</button>
        <span class="weak" id="contentImportResult" style="font-size:12.5px;overflow-wrap:anywhere"></span>
      </div>
      <div class="row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <input class="input" id="contentSearch" placeholder="搜索分发内容" value="${esc(contentState.keyword)}" style="width:200px"/>
        <select class="input" id="contentStatus" style="width:130px">
          <option value="all">全部状态</option>
          <option value="available">未发放</option>
          <option value="used">已发放</option>
        </select>
      </div>
      <div id="contentListHost"></div>`;

    const contentStatusSel = $("contentStatus");
    contentStatusSel.value = contentState.status;
    contentStatusSel.onchange = () => { contentState.status = contentStatusSel.value; contentState.offset = 0; renderContentList(); };
    $("contentSearch").oninput = () => {
      clearTimeout(contentState.timer);
      contentState.timer = setTimeout(() => {
        contentState.keyword = $("contentSearch").value.trim();
        contentState.offset = 0;
        renderContentList();
      }, 250);
    };

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
    const qs = new URLSearchParams({
      limit: String(contentState.limit),
      offset: String(contentState.offset),
      status: contentState.status,
    });
    if (contentState.keyword) qs.set("keyword", contentState.keyword);
    const res = await api(`/api/batches/${b.id}/contents?${qs}`);
    const host = $("contentListHost");
    if (!host) return;
    const start = contentState.offset;
    const filtering = Boolean(contentState.keyword) || contentState.status !== "all";
    const rows = res.list.map((c, i) => {
      // 关联 CDK：已发放显示领取者用的码，未发放且绑定模式显示预绑定的码
      const related = c.claim_code || c.bound_code || "";
      return `
      <tr>
        <td class="num weak">${start + i + 1}</td>
        <td><span class="tag">${esc(TYPE_LABEL[c.type] || c.type)}</span></td>
        <td class="payload limit" title="${esc(c.payload)}">${esc(c.payload)}</td>
        <td>${c.status === "used" ? `<span class="badge off">已发放</span>` : `<span class="badge ok">未发放</span>`}</td>
        <td class="payload weak limit-sm" title="${esc(related)}">${related ? esc(maskCode(related)) : `<span class="weak">—</span>`}</td>
        <td class="col-actions">
          ${copyBtn(c.payload)}
          ${c.status === "used" ? "" : `<button class="btn sm danger" data-del-content="${c.id}">删除</button>`}
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="6" class="weak" style="text-align:center;padding:24px">${
        filtering ? "没有匹配的内容，试试清空搜索条件" : "暂无内容"
      }</td></tr>`;
    host.innerHTML = `
      <div class="weak" style="font-size:12px;margin-bottom:6px;overflow-wrap:anywhere">
        ${filtering
          ? `匹配 ${fmt(res.filtered)} 条（项目共 ${fmt(res.total)} 条）`
          : `内容共 ${fmt(res.total)} 条${res.total > res.list.length + start ? `，已显示 ${fmt(res.list.length + start)} 条` : ""}`}
      </div>
      <div class="table-wrap" style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:10px">
        <table class="tbl"><thead><tr><th>#</th><th>类型</th><th>内容</th><th>状态</th><th>关联 CDK</th><th style="text-align:right">操作</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="weak" style="font-size:12px;margin-top:8px">
        ${b.bind_mode === "bound"
          ? "一码一内容绑定：未发放的内容会显示预先绑定的 CDK（打码显示，悬停看全码）。"
          : "动态发放：内容不预绑定 CDK，用户领取时按顺序发放；已发放的内容显示领取者使用的 CDK。"}
      </div>`;
    bindCopy(host);
    if (res.hasMore) {
      host.insertAdjacentHTML("beforeend",
        `<div class="row" style="justify-content:center;margin-top:10px">
           <button class="btn sm" id="loadMoreContents">加载更多（已显示 ${fmt(res.list.length + start)} / ${fmt(res.filtered)}）</button>
         </div>`);
      host.querySelector("#loadMoreContents").onclick = () => { contentState.offset += contentState.limit; renderContentList(); };
    }
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
      <div class="card" style="padding:14px 16px;background:var(--soft-bg);margin-bottom:14px">
        <div class="field" style="margin-bottom:12px">
          <label>批量生成 <span class="hint">16 位随机码，生成后可一键复制</span></label>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <input class="input" id="genCount" type="number" min="1" max="${bound ? Math.max(s.contentBindable, 1) : MAX_GENERATE}" placeholder="生成数量" style="width:130px"/>
            <input class="input" id="genPrefix" maxlength="8" placeholder="前缀（可选）" style="width:150px"/>
            <button class="btn primary sm" id="doGenerate">批量生成</button>
          </div>
        </div>
        <div class="field" style="margin-bottom:12px">
          <label>手动导入 <span class="hint">已有 CDK，逗号 / 换行分隔，全局去重</span></label>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <input class="input" id="importCodes" placeholder="粘贴已有 CDK" style="min-width:180px"/>
            <button class="btn sm" id="doImportCodes">导入</button>
          </div>
        </div>
        <div class="weak" style="font-size:12px">${esc(modeHint)}</div>
        <div class="weak" style="font-size:12px;margin-top:2px">标准 CDK 为 16 位随机码，不区分大小写、横线可省略。</div>
        ${poolTip}
      </div>
      <div class="card" style="padding:12px 16px;margin-bottom:12px">
        <div class="row between" style="gap:10px;flex-wrap:wrap">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <input class="input" id="codeSearch" placeholder="搜索 CDK / 绑定内容" value="${esc(codeState.keyword)}" style="width:200px"/>
            <select class="input" id="codeStatus" style="width:130px">
              <option value="all">全部状态</option>
              <option value="available">未使用</option>
              <option value="claimed">已使用</option>
            </select>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn primary sm" id="copyAllAvailable">复制全部未使用</button>
            <button class="btn sm" id="copyAll">复制全部</button>
            <button class="btn sm" id="expCodesTxt">导出 TXT</button>
          </div>
        </div>
      </div>
      <div id="codeListHost"></div>`;

    const codeStatusSel = $("codeStatus");
    codeStatusSel.value = codeState.status;
    codeStatusSel.onchange = () => { codeState.status = codeStatusSel.value; codeState.offset = 0; renderCodeList(); };
    $("codeSearch").oninput = () => {
      clearTimeout(codeState.timer);
      codeState.timer = setTimeout(() => {
        codeState.keyword = $("codeSearch").value.trim();
        codeState.offset = 0;
        renderCodeList();
      }, 250);
    };

    $("copyAllAvailable").onclick = () => bulkCopyCodes("available");
    $("copyAll").onclick = () => bulkCopyCodes("all");
    $("expCodesTxt").onclick = async () => {
      try {
        const text = await fetchCodesText("all");
        downloadBlob(text, `${b.name}_CDK.txt`);
        toast(`已导出 ${text.split("\n").length} 个 CDK`);
      } catch (e) { toast(e.message, "err"); }
    };

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
        if (r.codes && r.codes.length) showCodesResult(r.codes, "生成", b.name);
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
        if (r.codes && r.codes.length) showCodesResult(r.codes, "导入", b.name);
      } catch (e) { toast(e.message, "err"); }
      finally { btn.disabled = false; }
    };

    await renderCodeList();
  }

  async function renderCodeList() {
    const qs = new URLSearchParams({
      limit: String(codeState.limit),
      offset: String(codeState.offset),
      status: codeState.status,
    });
    if (codeState.keyword) qs.set("keyword", codeState.keyword);
    const res = await api(`/api/batches/${b.id}/claim-codes?${qs}`);
    const host = $("codeListHost");
    if (!host) return;
    const start = codeState.offset;
    const filtering = Boolean(codeState.keyword) || codeState.status !== "all";
    const rows = res.list.map((c, i) => `
      <tr>
        <td class="num weak">${start + i + 1}</td>
        <td class="payload" style="overflow-wrap:anywhere">${esc(c.code_display)}</td>
        <td class="payload weak limit-sm" title="${esc(c.bound_payload || "")}">${c.bound_payload ? esc(c.bound_payload) : "—"}</td>
        <td>${c.status === "claimed"
          ? `<span class="badge off">已使用</span>`
          : c.status === "disabled"
            ? `<span class="badge warn">已禁用</span>`
            : `<span class="badge ok">未使用</span>`}</td>
        <td class="weak num" style="font-size:12px">${c.claimed_at ? fullTime(c.claimed_at) : "—"}</td>
        <td class="col-actions">
          ${copyBtn(c.code_display)}
          ${c.status === "available" ? `<button class="btn sm danger" data-del-code="${c.id}">删除</button>` : ""}
        </td>
      </tr>`).join("") || `<tr><td colspan="6" class="weak" style="text-align:center;padding:24px">${
        filtering ? "没有匹配的 CDK，试试清空搜索条件" : "暂无 CDK，请先批量生成"
      }</td></tr>`;
    host.innerHTML = `
      <div class="weak" style="font-size:12px;margin-bottom:6px;overflow-wrap:anywhere">
        ${filtering
          ? `匹配 ${fmt(res.filtered)} 个（项目共 ${fmt(res.total)} 个）`
          : `CDK 共 ${fmt(res.total)} 个${res.total > res.list.length + start ? `，已显示 ${fmt(res.list.length + start)} 个` : ""}`}
      </div>
      <div class="table-wrap" style="max-height:340px;overflow:auto;border:1px solid var(--border);border-radius:10px">
        <table class="tbl"><thead><tr><th>#</th><th>领取 CDK</th><th>绑定内容</th><th>状态</th><th>领取时间</th><th style="text-align:right">操作</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    bindCopy(host);
    if (res.hasMore) {
      host.insertAdjacentHTML("beforeend",
        `<div class="row" style="justify-content:center;margin-top:10px">
           <button class="btn sm" id="loadMoreCodes">加载更多（已显示 ${fmt(res.list.length + start)} / ${fmt(res.filtered)}）</button>
         </div>`);
      host.querySelector("#loadMoreCodes").onclick = () => { codeState.offset += codeState.limit; renderCodeList(); };
    }
    host.querySelectorAll("[data-del-code]").forEach((btn) => {
      btn.onclick = async () => {
        const ok = await confirmDialog({
          title: "删除这个 CDK",
          description: "删除后该码将无法领取，不可恢复。",
          confirmText: "删除",
          danger: true,
          icon: "trash",
        });
        if (!ok) return;
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
        <td class="payload limit" title="${esc(c.content_payload)}">${esc(c.content_payload)}</td>
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
