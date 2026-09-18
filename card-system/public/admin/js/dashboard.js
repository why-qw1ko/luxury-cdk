/* 概览看板 */

function fmt(n) {
  return Number(n || 0).toLocaleString("zh-CN");
}

/* ---------- 面积图 ---------- */
function drawAreaChart(el, labels, counts) {
  const W = 560, H = 240, L = 10, R = 16, T = 18, B = 26;
  const plotW = W - L - R, plotH = H - T - B;
  const n = labels.length;
  const max = Math.max(1, ...counts);
  const niceMax = niceCeil(max);
  const px = (i) => (n <= 1 ? L + plotW / 2 : L + (i / (n - 1)) * plotW);
  const py = (v) => T + (1 - v / niceMax) * plotH;

  let grid = "";
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const v = Math.round((niceMax / steps) * s);
    const y = py(v);
    grid += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" style="stroke:var(--border)" stroke-width="1"/>`;
  }

  let line = "";
  let area = `M ${px(0)} ${py(counts[0])}`;
  counts.forEach((c, i) => { line += `${i ? "L" : "M"} ${px(i).toFixed(1)} ${py(c).toFixed(1)} `; });
  for (let i = counts.length - 1; i >= 1; i--) area += ` L ${px(i).toFixed(1)} ${py(counts[i]).toFixed(1)}`;
  area += ` L ${px(counts.length - 1).toFixed(1)} ${H - B} L ${px(0).toFixed(1)} ${H - B} Z`;

  const gid = "agrad" + Math.random().toString(36).slice(2, 7);
  let dots = "";
  counts.forEach((c, i) => {
    if (c > 0) dots += `<circle class="chart-dot" style="fill:var(--card);stroke:var(--accent);animation-delay:${(0.35 + i * 0.04).toFixed(2)}s" cx="${px(i).toFixed(1)}" cy="${py(c).toFixed(1)}" r="3" stroke-width="2"/>`;
  });
  // x 轴标签
  let xlabels = "";
  labels.forEach((lb, i) => {
    const skip = n > 14 ? i % 2 !== 0 : false;
    if (!skip) xlabels += `<text x="${px(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" style="fill:var(--text-3)">${lb}</text>`;
  });

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="240" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.28"/>
          <stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path class="chart-area" d="${area}" fill="url(#${gid})"/>
      <path class="chart-line" pathLength="1" d="${line}" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${xlabels}
    </svg>`;
}
function niceCeil(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/* ---------- 环形图 ---------- */
const DONUT_COLORS = ["#60A5FA", "#34D399", "#FBBF24", "#A78BFA", "#F472B6", "#FB923C", "#94A3B8", "#2DD4BF"];
function drawDonut(el, legendEl, data) {
  const totals = data.reduce((s, d) => s + d.value, 0);
  if (totals === 0) {
    el.innerHTML = `<div class="weak" style="display:flex;align-items:center;justify-content:center;height:100%">暂无领取数据</div>`;
    legendEl.innerHTML = "";
    return;
  }
  const R = 72, C = 2 * Math.PI * R, half = 14;
  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = d.value / totals;
    const len = frac * C;
    const gap = 2.5;
    const dash = Math.max(len - gap, 0.5);
    const seg = `<circle class="chart-seg" style="--c:${C.toFixed(1)};animation-delay:${(i * 0.09).toFixed(2)}s" r="${R}" cx="110" cy="105" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="${half}" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-acc}" transform="rotate(-90 110 105)"/>`;
    acc += len;
    return { seg, d, frac, color: DONUT_COLORS[i % DONUT_COLORS.length] };
  });
  el.innerHTML = `
    <svg viewBox="0 0 220 210" width="100%">
      <circle cx="110" cy="105" r="${R}" fill="none" style="stroke:var(--hover-bg)" stroke-width="${half}"/>
      ${segs.map((s) => s.seg).join("")}
      <text x="110" y="98" text-anchor="middle" font-size="24" font-weight="600" style="fill:var(--text)">${fmt(totals)}</text>
      <text x="110" y="118" text-anchor="middle" font-size="11" style="fill:var(--text-3)">累计领取</text>
    </svg>`;
  legendEl.innerHTML = segs
    .map((s) => `
      <div class="row" style="justify-content:space-between;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border)">
        <div class="row" style="flex:1 1 auto;min-width:0">
          <span style="width:9px;height:9px;border-radius:3px;background:${s.color};flex-shrink:0"></span>
          <span class="trunc" style="font-size:12.5px;min-width:0" title="${esc(s.d.name)}">${esc(s.d.name)}</span>
        </div>
        <div class="row" style="gap:10px;flex-shrink:0">
          <span class="num" style="font-size:12px;color:var(--text-2)">${fmt(s.d.value)}</span>
          <span class="num" style="font-size:12px;color:var(--text-3);width:44px;text-align:right">${(s.frac * 100).toFixed(1)}%</span>
        </div>
      </div>`).join("");
}

/* ---------- 渲染 ---------- */
const ICONS = {
  total: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3z"></path><path d="M3 9h18"></path><path d="M9 21V9"></path></svg>`,
  remaining: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>`,
  claimed: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`,
  today: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`,
};

function renderStats(s) {
  const pill = (d) =>
    s.todayClaimedDelta == null || s.todayClaimedDelta === 0
      ? '<span class="pill neutral">今日 0 基准</span>'
      : `<span class="pill ${d >= 0 ? "up" : "down"}">${d >= 0 ? "↑" : "↓"} ${Math.abs(d)}%</span>`;

  const items = [
    { label: "领取 CDK 总量", value: s.codeTotal, icon: ICONS.total, sub: fmt(s.batches) + " 个项目", pillC: null },
    { label: "剩余可领取", value: s.remaining, icon: ICONS.remaining, sub: `可领 CDK ${fmt(s.codeAvailable)} · 内容 ${fmt(s.contentAvailable)}`, pillC: null },
    { label: "累计已领取", value: s.claimed, icon: ICONS.claimed, sub: s.codeTotal ? Math.round((s.claimed / s.codeTotal) * 100) + "% 已用" : "", pillC: null },
    { label: "今日领取", value: s.todayClaimed, icon: ICONS.today, sub: "较昨日", pillC: s.todayClaimedDelta, pillArr: s },
  ];
  document.getElementById("statCards").innerHTML = items.map((it) => `
    <div class="card stat-card fx-elastic">
      <div class="stat-top">
        <div class="stat-icon">${it.icon}</div>
        ${it.pillC != null && it.pillArr ? pill(it.pillC) : ""}
      </div>
      <div class="stat-label">${it.label}</div>
      <div class="stat-value num" data-target="${it.value}">0</div>
      <div class="stat-sub">${it.sub || ""}</div>
    </div>`).join("");
  // 数字从 0 滚动到目标值
  document.querySelectorAll("#statCards .stat-value").forEach((el) => countUp(el, el.dataset.target));
}

function renderRanking(list) {
  if (!list.length) {
    document.getElementById("rankList").innerHTML = `<div class="weak" style="padding:40px 0;text-align:center">暂无项目</div>`;
    return;
  }
  document.getElementById("rankList").innerHTML = list.map((it, i) => `
    <li class="rank-item ${i < 3 ? "top" + (i + 1) : ""}">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-main">
        <div class="rank-title clamp-2" title="${esc(it.name)}">${esc(it.name)}</div>
        <div class="rank-sub">剩余可领 ${fmt(it.remaining)}（CDK ${fmt(it.codeAvailable)} / 内容 ${fmt(it.contentAvailable)}）</div>
      </div>
      <div class="rank-val num">${fmt(it.claimed)}</div>
    </li>`).join("");
}

function renderRecent(list) {
  const host = document.getElementById("recentList");
  if (!list.length) {
    host.innerHTML = `<div class="weak" style="padding:40px 0;text-align:center">暂无领取记录</div>`;
    return;
  }
  host.innerHTML = list.map((r, i) => `
    <li class="rank-item">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-main">
        <div class="rank-title payload clamp-2" title="${esc(r.content_payload)}">${esc(r.content_payload)}</div>
        <div class="rank-sub trunc" title="${esc(r.project_name || "")}">${esc(r.project_name || "—")}</div>
      </div>
      <div class="rank-val num" style="font-size:12px;color:var(--text-3);font-weight:500">${esc(r.claimed_at)}</div>
    </li>`).join("");
}

async function load() {
  if (!(await requireAuth())) return;
  window.__openNewProject = () => openNewProjectModal(load);
  const u = await ensureUser();
  document.getElementById("pageTitle").textContent = `${greeting()}，${displayName(u)}`;

  const now = new Date();
  document.getElementById("lastUpdated").textContent =
    `更新于 ${now.getMonth()+1}月${now.getDate()}日 ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

  const [sum, trend, dist, rank] = await Promise.all([
    api("/api/dashboard/summary"),
    api("/api/dashboard/trend"),
    api("/api/dashboard/distribution"),
    api("/api/dashboard/ranking"),
  ]);
  renderStats(sum.summary);
  drawAreaChart(document.getElementById("trendChart"), trend.labels, trend.counts);
  drawDonut(document.getElementById("donutChart"), document.getElementById("donutLegend"), dist.data || []);

  // 最近领取
  const rec = await api("/api/batches");
  const recent = [];
  for (const b of rec.list) {
    const cl = await api(`/api/batches/${b.id}/claims`);
    cl.list.forEach((c) => recent.push({ ...c, project_name: b.name }));
  }
  recent.sort((a, b) => (a.id > b.id ? -1 : 1));
  renderRanking(rank.list);
  renderRecent(recent.slice(0, 8));
}

load();
