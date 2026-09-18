import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getDb } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "card-system-secret-change-me";

export function displayName(u) {
  return u.role === "admin" ? "管理员" : u.username;
}

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, name: displayName(user) },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
}

/** 需要登录；校验 token 并通过 req.user 注入当前用户 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: "未登录或登录已过期" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { uid, role, name }
    const db = getDb();
    const u = db.prepare(`SELECT id, role, status FROM users WHERE id = ?`).get(payload.uid);
    // 封禁的用户强制下线
    if (!u || u.status === "banned") {
      return res.status(401).json({ ok: false, message: "账号已被封禁" });
    }
    req.user.role = u.role;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "未登录或登录已过期" });
  }
}

/** 仅管理员可访问 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ ok: false, message: "无权限，仅管理员可操作" });
  }
  next();
}

export function authRouter() {
  const r = Router();
  const db = getDb;

  // 登录：用户名 + 密码
  r.post("/login", (_req, res) => {
    const { username, password } = _req.body || {};
    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ ok: false, message: "请输入用户名和密码" });
    }
    const user = db()
      .prepare(`SELECT * FROM users WHERE username = ?`)
      .get(username.trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ ok: false, message: "用户名或密码错误" });
    }
    if (user.status === "banned") {
      return res.status(403).json({ ok: false, message: "账号已被封禁，请联系管理员" });
    }
    res.json({
      ok: true,
      token: signToken(user),
      user: { id: user.id, username: user.username, role: user.role, status: user.status },
    });
  });

  r.get("/me", requireAuth, (req, res) => {
    const u = db()
      .prepare(`SELECT id, username, role, status, created_at FROM users WHERE id = ?`)
      .get(req.user.uid);
    res.json({ ok: true, user: { ...u, name: displayName(u) } });
  });

  return r;
}