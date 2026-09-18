/* 站点设置页（仅管理员） */

let savedSettings = { site_name: "", site_notice: "", site_footer: "" };

async function load() {
  if (!(await requireAuth())) return;
  const me = await ensureUser();
  if (me.role !== "admin") { location.href = "/admin/dashboard.html"; return; }
  window.__openNewProject = () => openNewProjectModal(load);

  const res = await api("/api/settings");
  savedSettings = res.settings;
  fillForm(savedSettings);

  const $ = (id) => document.getElementById(id);
  const syncPreview = () => {
    const notice = $("siteNoticeInput").value.trim();
    const footer = $("siteFooterInput").value.trim();
    $("previewNotice").classList.toggle("hidden", !notice);
    if (notice) $("previewNoticeText").textContent = notice;
    $("previewFooter").textContent = footer || "（留空则不显示页脚）";
  };
  $("siteNoticeInput").addEventListener("input", syncPreview);
  $("siteFooterInput").addEventListener("input", syncPreview);
  syncPreview();
}

function fillForm(s) {
  document.getElementById("siteNameInput").value = s.site_name || "";
  document.getElementById("siteNoticeInput").value = s.site_notice || "";
  document.getElementById("siteFooterInput").value = s.site_footer || "";
}

async function save(e) {
  e.preventDefault();
  const btn = document.getElementById("saveBtn");
  btn.disabled = true; btn.textContent = "保存中…";
  try {
    const res = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        site_name: document.getElementById("siteNameInput").value.trim(),
        site_notice: document.getElementById("siteNoticeInput").value,
        site_footer: document.getElementById("siteFooterInput").value,
      }),
    });
    savedSettings = res.settings;
    window.__siteSettings = res.settings;
    toast("站点设置已保存");
  } catch (err) { toast(err.message, "err"); }
  finally { btn.disabled = false; btn.textContent = "保存设置"; }
}

document.getElementById("settingsForm").addEventListener("submit", save);
document.getElementById("resetBtn").onclick = () => fillForm(savedSettings);

load();
