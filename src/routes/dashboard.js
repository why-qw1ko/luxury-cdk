import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";
import { batchStats, localStamp } from "../utils.js";

const DAY = 24 * 60 * 60 * 1000;

export function dashboardRouter() {
  const r = Router();
  r.use(requireAuth);

  const isAdmin = (req) => req.user.role === "admin";

  // 汇总
  r.get("/summary", (req, res) => {
    const db = getDb();
    const uid = req.user.uid;
    const scoped = (sql) => (isAdmin(req) ? db.prepare(sql).get().c : db.prepare(sql).get(uid).c);

    const codeTotal = isAdmin(req)
      ? scoped(`SELECT COUNT(*) AS c FROM claim_codes`)
      : scoped(`SELECT COUNT(*) AS c FROM claim_codes cc JOIN batches b ON b.id = cc.batch_id WHERE b.owner_id = ?`);
    const codeAvailable = isAdmin(req)
      ? scoped(`SELECT COUNT(*) AS c FROM claim_codes WHERE status = 'available'`)
      : scoped(
          `SELECT COUNT(*) AS c FROM claim_codes cc JOIN batches b ON b.id = cc.batch_id
           WHERE cc.status = 'available' AND b.owner_id = ?`
        );
    const contentTotal = isAdmin(req)
      ? scoped(`SELECT COUNT(*) AS c FROM contents`)
      : scoped(`SELECT COUNT(*) AS c FROM contents ct JOIN batches b ON b.id = ct.batch_id WHERE b.owner_id = ?`);
    const contentAvailable = isAdmin(req)
      ? scoped(`SELECT COUNT(*) AS c FROM contents WHERE status = 'available'`)
      : scoped(
          `SELECT COUNT(*) AS c FROM contents ct JOIN batches b ON b.id = ct.batch_id
           WHERE ct.status = 'available' AND b.owner_id = ?`
        );
    const batches = isAdmin(req)
      ? scoped(`SELECT COUNT(*) AS c FROM batches`)
      : scoped(`SELECT COUNT(*) AS c FROM batches WHERE owner_id = ?`);

    const claimScope = (lo, hi) =>
      isAdmin(req)
        ? db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE claimed_at >= ? AND claimed_at < ?`).get(lo, hi).c
        : db
            .prepare(
              `SELECT COUNT(*) AS c FROM claims cl JOIN batches b ON b.id = cl.batch_id
               WHERE cl.claimed_at >= ? AND cl.claimed_at < ? AND b.owner_id = ?`
            )
            .get(lo, hi, uid).c;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayClaimed = claimScope(localStamp(todayStart), localStamp(new Date(todayStart.getTime() + DAY)));
    const yesterdayClaimed = claimScope(
      localStamp(new Date(todayStart.getTime() - DAY)),
      localStamp(todayStart)
    );

    const claimed = codeTotal - codeAvailable;
    res.json({
      ok: true,
      summary: {
        total: codeTotal,
        claimed,
        remaining: Math.min(codeAvailable, contentAvailable),
        codeTotal,
        codeAvailable,
        contentTotal,
        contentAvailable,
        batches,
        todayClaimed,
        todayClaimedDelta:
          yesterdayClaimed === 0
            ? null
            : Math.round(((todayClaimed - yesterdayClaimed) / yesterdayClaimed) * 100),
      },
    });
  });

  // 近 14 天领取趋势
  r.get("/trend", (req, res) => {
    const db = getDb();
    const labels = [];
    const counts = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setTime(start.getTime() - 13 * DAY);

    for (let i = 0; i < 14; i++) {
      const lo = new Date(start.getTime() + i * DAY);
      const hi = new Date(lo.getTime() + DAY);
      const c = isAdmin(req)
        ? db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE claimed_at >= ? AND claimed_at < ?`).get(
            localStamp(lo),
            localStamp(hi)
          ).c
        : db
            .prepare(
              `SELECT COUNT(*) AS c FROM claims cl JOIN batches b ON b.id = cl.batch_id
               WHERE cl.claimed_at >= ? AND cl.claimed_at < ? AND b.owner_id = ?`
            )
            .get(localStamp(lo), localStamp(hi), req.user.uid).c;
      labels.push(`${lo.getMonth() + 1}/${lo.getDate()}`);
      counts.push(c);
    }
    res.json({ ok: true, labels, counts });
  });

  // 环形图：各项目领取占比
  r.get("/distribution", (req, res) => {
    const db = getDb();
    const sql = isAdmin(req)
      ? `SELECT b.id, b.name, COUNT(cl.id) AS value FROM batches b
         LEFT JOIN claims cl ON cl.batch_id = b.id
         WHERE b.status = 'active' GROUP BY b.id ORDER BY value DESC LIMIT 8`
      : `SELECT b.id, b.name, COUNT(cl.id) AS value FROM batches b
         LEFT JOIN claims cl ON cl.batch_id = b.id
         WHERE b.status = 'active' AND b.owner_id = ? GROUP BY b.id ORDER BY value DESC LIMIT 8`;
    const rows = isAdmin(req) ? db.prepare(sql).all() : db.prepare(sql).all(req.user.uid);
    res.json({ ok: true, data: rows.map((x) => ({ name: x.name, value: x.value })) });
  });

  // 排行
  r.get("/ranking", (req, res) => {
    const db = getDb();
    const sql = isAdmin(req)
      ? `SELECT b.id, b.name, COUNT(cl.id) AS claimed FROM batches b
         LEFT JOIN claims cl ON cl.batch_id = b.id GROUP BY b.id ORDER BY claimed DESC LIMIT 8`
      : `SELECT b.id, b.name, COUNT(cl.id) AS claimed FROM batches b
         LEFT JOIN claims cl ON cl.batch_id = b.id
         WHERE b.owner_id = ? GROUP BY b.id ORDER BY claimed DESC LIMIT 8`;
    const rows = isAdmin(req) ? db.prepare(sql).all() : db.prepare(sql).all(req.user.uid);
    res.json({
      ok: true,
      list: rows.map((x) => {
        const s = batchStats(x.id);
        return {
          name: x.name,
          claimed: x.claimed,
          remaining: s.remaining,
          codeAvailable: s.codeAvailable,
          contentAvailable: s.contentAvailable,
        };
      }),
    });
  });

  return r;
}
