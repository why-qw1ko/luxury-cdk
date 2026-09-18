import { Router } from "express";
import { getDb } from "../db.js";
import { getClientIp, isBatchActive, publicBatch } from "../utils.js";

export function claimRouter() {
  const r = Router();

  // 前台可领取的开放项目（供领取页展示）
  r.get("/projects", (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM batches WHERE status = 'active' ORDER BY id DESC`)
      .all()
      .filter((b) => isBatchActive(b));
    res.json({ ok: true, list: rows.map(publicBatch) });
  });

  // 领取卡密
  r.post("/", (req, res) => {
    const db = getDb();
    const code = String((req.body?.code || "") + "").trim();
    const ip = getClientIp(req);
    if (!code) return res.status(400).json({ ok: false, message: "请输入卡密" });

    const card = db
      .prepare(
        `SELECT c.id AS card_id, c.code, c.status, c.batch_id
         FROM cards c WHERE c.code = ?`
      )
      .get(code);
    if (!card) return res.status(404).json({ ok: false, message: "卡密不存在，请核对后重试" });

    if (card.status === "claimed") {
      return res.status(409).json({ ok: false, message: "该卡密已被领取使用" });
    }

    const batch = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(card.batch_id);
    if (!batch || batch.status !== "active") {
      return res.status(400).json({ ok: false, message: "该卡密所属项目已停用" });
    }
    if (!isBatchActive(batch)) {
      return res.status(400).json({ ok: false, message: "该项目当前不在可领取时间范围内" });
    }

    // 限制同 IP
    if (batch.limit_ip && ip) {
      const existed = db
        .prepare(`SELECT COUNT(*) AS c FROM claims WHERE batch_id = ? AND ip = ?`)
        .get(batch.id, ip).c;
      if (existed > 0) {
        return res.status(403).json({ ok: false, message: "已在其他设备领取过该项目，同一IP仅可领取一次" });
      }
    }

    const claimCard = db.prepare(
      `UPDATE cards SET status = 'claimed' WHERE id = ? AND status = 'available'`
    );
    const insertClaim = db.prepare(
      `INSERT INTO claims (card_id, batch_id, code, ip) VALUES (?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      const info = claimCard.run(card.card_id);
      if (info.changes === 0) {
        throw Object.assign(new Error("already_claimed"), { code: "CONFLICT" });
      }
      insertClaim.run(card.card_id, card.batch_id, card.code, ip);
    });

    try {
      tx();
    } catch (e) {
      if (e.code === "CONFLICT") {
        return res.status(409).json({ ok: false, message: "该卡密已被领取使用" });
      }
      throw e;
    }

    res.json({
      ok: true,
      message: "领取成功",
      code: card.code,
      project: batch.name,
      claimed_at: new Date().toLocaleString("zh-CN", { hour12: false }),
    });
  });

  return r;
}