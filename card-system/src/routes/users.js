import { Router } from "express";
import bcrypt from "bcryptjs";
import { getDb } from "../db.js";
import { requireAuth, requireAdmin, displayName } from "../auth.js";

export function usersRouter() {
  const r = Router();
  r.use(requireAuth, requireAdmin);

  // 用户列表（含项目/内容/CDK/领取统计）
  r.get("/", (_req, res) => {
    const db = getDb();
    const rows = db.prepare(`SELECT id, username, role, status, created_at FROM users ORDER BY id`).all();
    const groupCount = (sql) =>
      Object.fromEntries(db.prepare(sql).all().map((x) => [x.owner_id, x.c]));
    const projects = groupCount(`SELECT owner_id, COUNT(*) AS c FROM batches GROUP BY owner_id`);
    const contents = groupCount(
      `SELECT b.owner_id AS owner_id, COUNT(*) AS c FROM contents ct JOIN batches b ON b.id = ct.batch_id GROUP BY b.owner_id`
    );
    const codes = groupCount(
      `SELECT b.owner_id AS owner_id, COUNT(*) AS c FROM claim_codes cc JOIN batches b ON b.id = cc.batch_id GROUP BY b.owner_id`
    );
    const used = groupCount(
      `SELECT b.owner_id AS owner_id,
              SUM(CASE WHEN cc.status = 'claimed' THEN 1 ELSE 0 END) AS c
       FROM claim_codes cc JOIN batches b ON b.id = cc.batch_id GROUP BY b.owner_id`
    );
    const list = rows.map((u) => ({
      ...u,
      name: displayName(u),
      projects: projects[u.id] || 0,
      contents: contents[u.id] || 0,
      codes: codes[u.id] || 0,
      claimed: used[u.id] || 0,
    }));
    res.json({ ok: true, list });
  });

  // 新增用户（管理员创建普通用户，用于分发自己的 CDK）
  r.post("/", (req, res) => {
    const db = getDb();
    const { username, password } = req.body || {};
    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ ok: false, message: "请填写用户名和密码" });
    }
    const uname = username.trim();
    if (uname.length < 2 || uname.length > 20) {
      return res.status(400).json({ ok: false, message: "用户名长度需在 2-20 字符之间" });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: "密码至少 6 位" });
    }
    const exists = db.prepare(`SELECT id FROM users WHERE username = ?`).get(uname);
    if (exists) return res.status(409).json({ ok: false, message: "用户名已存在" });

    const info = db
      .prepare(`INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'user', 'active')`)
      .run(uname, bcrypt.hashSync(password, 10));
    const u = db.prepare(`SELECT id, username, role, status, created_at FROM users WHERE id = ?`)
      .get(info.lastInsertRowid);
    res.json({ ok: true, user: { ...u, name: u.username } });
  });

  // 更新用户（封禁/解封、重置密码）。不可操作唯一管理员
  r.patch("/:id", (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    if (id === 1) return res.status(400).json({ ok: false, message: "不能修改唯一管理员账号" });
    const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!u) return res.status(404).json({ ok: false, message: "用户不存在" });

    const { status, password } = req.body || {};
    if (status) {
      if (["active", "banned"].includes(status)) {
        db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(status, id);
      }
    }
    if (password && typeof password === "string") {
      if (password.length < 6) return res.status(400).json({ ok: false, message: "密码至少 6 位" });
      db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(bcrypt.hashSync(password, 10), id);
    }
    const nu = db.prepare(`SELECT id, username, role, status, created_at FROM users WHERE id = ?`).get(id);
    res.json({ ok: true, user: { ...nu, name: nu.username } });
  });

  // 删除用户（连带其项目/内容/CDK/领取记录）
  r.delete("/:id", (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    if (id === 1) return res.status(400).json({ ok: false, message: "不能删除唯一管理员账号" });
    const u = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
    if (!u) return res.status(404).json({ ok: false, message: "用户不存在" });

    const tx = db.transaction(() => {
      const batchIds = db.prepare(`SELECT id FROM batches WHERE owner_id = ?`).all(id).map((b) => b.id);
      for (const bid of batchIds) {
        db.prepare(`DELETE FROM claims WHERE batch_id = ?`).run(bid);
        db.prepare(`DELETE FROM claim_codes WHERE batch_id = ?`).run(bid);
        db.prepare(`DELETE FROM contents WHERE batch_id = ?`).run(bid);
      }
      db.prepare(`DELETE FROM batches WHERE owner_id = ?`).run(id);
      db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    });
    tx();
    res.json({ ok: true });
  });

  return r;
}
