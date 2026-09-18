/* 前台领取页 */
(function () {
  const box = document.getElementById("claimBox");
  box.innerHTML = `
    <div class="card" style="padding:24px">
      <div class="field" style="margin-bottom:18px">
        <label for="code">卡密</label>
        <input class="input" id="code" placeholder="请输入 16 位卡密" style="padding:14px;font-size:16px;letter-spacing:0.5px;text-transform:uppercase" autocomplete="off"/>
      </div>
      <button class="btn primary" id="claimBtn" style="width:100%;padding:13px;font-size:15px">立即领取</button>
    </div>
    <div id="claimResult" style="margin-top:12px"></div>`;

  const input = document.getElementById("code");
  const btn = document.getElementById("claimBtn");
  const result = document.getElementById("claimResult");

  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doClaim(); });
  btn.onclick = doClaim;

  async function doClaim() {
    const code = input.value.trim();
    if (!code) { toast("请输入卡密", "err"); return; }
    btn.disabled = true; btn.textContent = "领取中…";
    result.innerHTML = "";
    try {
      const r = await api("/api/claims", { method: "POST", body: JSON.stringify({ code }) });
      result.innerHTML = `
        <div class="card" style="border-color:rgba(16,185,129,.35)">
          <div class="row" style="gap:10px">
            <div class="stat-icon" style="background:var(--success-soft)">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;color:var(--success)"><path d="M20 6 9 17l-5-5"></path></svg>
            </div>
            <div>
              <div style="font-weight:600;color:var(--success);font-size:15px">领取成功</div>
              <div class="weak" style="font-size:12.5px;margin-top:2px">项目：${esc(r.project)} · ${esc(r.claimed_at)}</div>
            </div>
          </div>
          <div class="card" style="margin-top:14px;padding:14px;background:#F9FAFB;border-radius:10px;text-align:center">
            <div class="weak" style="font-size:12px;margin-bottom:6px">您的卡密</div>
            <div class="payload" style="font-size:20px;font-weight:600;letter-spacing:1px">${esc(r.code)}</div>
          </div>
        </div>`;
      input.value = "";
    } catch (e) {
      result.innerHTML = `
        <div class="card" style="border-color:var(--danger)">
          <div class="row" style="gap:10px">
            <div class="stat-icon" style="background:var(--danger-soft)">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;color:var(--danger)"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>
            </div>
            <div>
              <div style="font-weight:600;color:var(--danger);font-size:15px">兑换失败</div>
              <div class="weak" style="font-size:12.5px;margin-top:2px">${esc(e.message)}</div>
            </div>
          </div>
        </div>`;
    } finally { btn.disabled = false; btn.textContent = "立即领取"; }
  }

  // 进行中项目
  api("/api/claims/projects").then((r) => {
    const host = document.getElementById("projectList");
    if (!r.list.length) { host.innerHTML = `<div class="weak" style="font-size:12.5px">暂无可兑换项目</div>`; return; }
    host.innerHTML = r.list.map((p) => `
      <div class="rank-item">
        <div class="rank-num">${p.tags.length || "·"}</div>
        <div class="rank-main">
          <div class="rank-title">${esc(p.name)}</div>
          <div class="rank-sub">${esc(p.description || "暂无描述")}</div>
        </div>
        <span class="badge ok"><span class="dot"></span>兑换中</span>
      </div>`).join("");
  }).catch(() => {});
})();