import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";

/** 站点设置键与默认值（存 meta 表） */
export const SITE_KEYS = {
  site_name: "卡密发放系统",   // 站点名称（页面标题 / 登录页标题）
  site_notice: "",             // 前台公告（空则不显示）
  site_footer: "",             // 前台页脚文案（空则不显示）
};

export function getSiteSettings() {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM meta WHERE key IN (?, ?, ?)`)
    .all(...Object.keys(SITE_KEYS));
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = {};
  for (const [k, def] of Object.entries(SITE_KEYS)) out[k] = map[k] ?? def;
  return out;
}

export function settingsRouter() {
  const r = Router();

  // 公开：前台 / 登录页需要读取站点名称、公告、页脚
  r.get("/", (_req, res) => {
    res.json({ ok: true, settings: getSiteSettings() });
  });

  // 保存：仅管理员
  r.put("/", requireAuth, requireAdmin, (req, res) => {
    const body = req.body || {};
    const db = getDb();
    const upsert = db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    const apply = (key, value, maxLen) => {
      if (typeof value !== "string") return;
      upsert.run(key, value.trim().slice(0, maxLen));
    };
    apply("site_name", body.site_name, 32);
    apply("site_notice", body.site_notice, 500);
    apply("site_footer", body.site_footer, 200);
    res.json({ ok: true, settings: getSiteSettings() });
  });

  return r;
}
