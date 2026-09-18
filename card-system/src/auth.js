import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getDb } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "card-system-secret-change-me";

export function signToken() {
  return jwt.sign({ role: "admin", name: "管理员" }, JWT_SECRET, { expiresIn: "24h" });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: "未登录或登录已过期" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "未登录或登录已过期" });
  }
}

export function authRouter() {
  const r = Router();

  // 登录（唯一管理员）
  r.post("/login", (req, res) => {
    const db = getDb();
    const { password } = req.body || {};
    if (!password || typeof password !== "string") {
      return res.status(400).json({ ok: false, message: "请输入密码" });
    }
    const admin = db.prepare(`SELECT * FROM admin WHERE id = 1`).get();
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ ok: false, message: "密码错误" });
    }
    res.json({ ok: true, token: signToken(), name: admin.username });
  });

  r.get("/me", requireAuth, (req, res) => {
    res.json({ ok: true, name: "管理员" });
  });

  return r;
}