import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";
import { publicBatch, batchStats } from "../utils.js";

const DAY = 24 * 60 * 60 * 1000;

/** 非管理员仅统计自己的数据；管理员统计全部 */
function scalar(db, sql, ownerSql, params = []) {
  if (ownerSql) return db.prepare(sql + " " + ownerSql).get(...params).c;
  return db.prepare(sql).get().c;
}

export function dashboardRouter() {
  const r = Router();
  r.use(requireAuth);

  const owner = (req, alias) => {
    if (req.user.role === "admin") return null;
    return alias ? `AND ${alias}.owner_id = ${Number(req.user.uid)}` : `AND owner_id = ${Number(req.user.uid)}`;
  };

  // 汇总
  r.get("/summary", (req, res) => {
    const db = getDb();
    const isAdmin = req.user.role === "admin";
    const ow = owner(req, "b");

    const total = isAdmin
      ? db.prepare(`SELECT COUNT(*) AS c FROM cards`).get().c
      : db.prepare(`SELECT COUNT(*) AS c FROM cards cc JOIN batches b ON b.id = cc.batch_id ${ow}`).get().c;
    const claimed = isAdmin
      ? db.prepare(`SELECT COUNT(*) AS c FROM cards WHERE status='claimed'`).get().c
      : db.prepare(`SELECT COUNT(*) AS c FROM cards cc JOIN batches b ON b.id=cc.batch_id WHERE cc.status='claimed' ${ow}`).get().c;
    const batches = isAdmin
      ? db.prepare(`SELECT COUNT(*) AS c FROM batches`).get().c
      : db.prepare(`SELECT COUNT(*) AS c FROM batches WHERE owner_id = ?`).get(req.user.uid).c;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const rangeStart = (d) => d.toISOString().replace("T", " ").slice(0, 19);
    const a = rangeStart(todayStart);
    const b2 = rangeStart(new Date(todayStart.getTime() + DAY));

    const claimScope = (lo, hi) => {
      if (isAdmin) return db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE claimed_at >= ? AND claimed_at < ?`).get(lo, hi).c;
      return db.prepare(`SELECT COUNT(*) AS c FROM claims cl JOIN batches b ON b.id=cl.batch_id WHERE cl.claimed_at >= ? AND cl.claimed_at < ? AND b.owner_id = ?`).get(lo, hi, req.user.uid).c;
    };
    const todayClaimed = claimScope(a, b2);
    const a2 = rangeStart(new Date(todayStart.getTime() - DAY));
    const yesterdayClaimed = claimScope(a2, a);

    res.json({
      ok: true,
      summary: {
        total,
        claimed,
        remaining: total - claimed,
        batches,
        todayClaimed,
        todayClaimedDelta:
          yesterdayClaimed === 0 ? null : Math.round(((todayClaimed - yesterdayClaimed) / yesterdayClaimed) * 100),
      },
    });
  });

  // 近 14 天领取趋势
  r.get("/trend", (req, res) => {
    const db = getDb();
    const isAdmin = req.user.role === "admin";
    const labels = [];
    const counts = [];
    for (let i = 13; i >= 0; i--) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setTime(start.getTime() - i * DAY);
      const end = new Date(start.getTime() + DAY);
      const lo = start.toISOString().replace("T", " ").slice(0, 19);
      const hi = end.toISOString().replace("T", " ").slice(0, 19);
      const c = isAdmin
        ? db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE claimed_at >= ? AND claimed_at < ?`).get(lo, hi).c
        : db.prepare(`SELECT COUNT(*) AS c FROM claims cl JOIN batches b ON b.id=cl.batch_id WHERE cl.claimed_at >= ? AND cl.claimed_at < ? AND b.owner_id=?`).get(lo, hi, req.user.uid).c;
      labels.push(`${start.getMonth() + 1}/${start.getDate()}`);
      counts.push(c);
    }
    res.json({ ok: true, labels, counts });
  });

  // 环形图：各项目领取占比
  r.get("/distribution", (req, res) => {
    const db = getDb();
    const isAdmin = req.user.role === "admin";
    const sql = isAdmin
      ? `SELECT b.id, b.name, COUNT(cl.id) AS value FROM batches b LEFT JOIN claims cl ON cl.batch_id = b.id WHERE b.status='active' GROUP BY b.id ORDER BY value DESC LIMIT 8`
      : `SELECT b.id, b.name, COUNT(cl.id) AS value FROM batches b LEFT JOIN claims cl ON cl.batch_id = b.id WHERE b.status='active' AND b.owner_id=? GROUP BY b.id ORDER BY value DESC LIMIT 8`;
    const rows = isAdmin ? db.prepare(sql).all() : db.prepare(sql).all(req.user.uid);
    res.json({ ok: true, data: rows.map((x) => ({ name: x.name, value: x.value })) });
  });

  // 排行
  r.get("/ranking", (req, res) => {
    const db = getDb();
    const isAdmin = req.user.role === "admin";
    const sql = isAdmin
      ? `SELECT b.id, b.name, COUNT(cl.id) AS claimed FROM batches b LEFT JOIN claims cl ON cl.batch_id = b.id GROUP BY b.id ORDER BY claimed DESC LIMIT 8`
      : `SELECT b.id, b.name, COUNT(cl.id) AS claimed FROM batches b LEFT JOIN claims cl ON cl.batch_id = b.id WHERE b.owner_id=? GROUP BY b.id ORDER BY claimed DESC LIMIT 8`;
    const rows = isAdmin ? db.prepare(sql).all() : db.prepare(sql).all(req.user.uid);
    res.json({ ok: true, list: rows.map((x) => ({ name: x.name, claimed: x.claimed, remaining: batchStats(x.id).remaining })) });
  });

  return r;
}

// 复用函数避免 lint 未使用
void publicBatch;