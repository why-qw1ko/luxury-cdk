import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";
import { publicBatch, batchStats } from "../utils.js";

const DAY = 24 * 60 * 60 * 1000;

export function dashboardRouter() {
  const r = Router();
  r.use(requireAuth);

  // 汇总：卡密总量 / 已领取 / 剩余 / 项目数 / 今日领取
  r.get("/summary", (_req, res) => {
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) AS c FROM cards`).get().c;
    const claimed = db
      .prepare(`SELECT COUNT(*) AS c FROM cards WHERE status='claimed'`)
      .get().c;
    const batches = db.prepare(`SELECT COUNT(*) AS c FROM batches`).get().c;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayClaimed = db
      .prepare(`SELECT COUNT(*) AS c FROM claims WHERE claimed_at >= ?`)
      .get(todayStart.toISOString().replace("T", " ").slice(0, 19)).c;

    // 环比：今日 vs 昨日
    const yesterdayStart = new Date(todayStart.getTime() - DAY);
    const yesterdayClaimed = db
      .prepare(`SELECT COUNT(*) AS c FROM claims WHERE claimed_at >= ? AND claimed_at < ?`)
      .get(
        yesterdayStart.toISOString().replace("T", " ").slice(0, 19),
        todayStart.toISOString().replace("T", " ").slice(0, 19)
      ).c;

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
  r.get("/trend", (_req, res) => {
    const db = getDb();
    const labels = [];
    const counts = [];
    for (let i = 13; i >= 0; i--) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setTime(start.getTime() - i * DAY);
      const end = new Date(start.getTime() + DAY);
      const label = `${start.getMonth() + 1}/${start.getDate()}`;
      const s = start.toISOString().replace("T", " ").slice(0, 19);
      const e = end.toISOString().replace("T", " ").slice(0, 19);
      const c = db
        .prepare(`SELECT COUNT(*) AS c FROM claims WHERE claimed_at >= ? AND claimed_at < ?`)
        .get(s, e).c;
      labels.push(label);
      counts.push(c);
    }
    res.json({ ok: true, labels, counts });
  });

  // 环形图：各项目已领取占比
  r.get("/distribution", (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT b.id, b.name, COUNT(cl.id) AS value
         FROM batches b LEFT JOIN claims cl ON cl.batch_id = b.id
         WHERE b.status='active'
         GROUP BY b.id ORDER BY value DESC LIMIT 8`
      )
      .all();
    const data = rows.map((x) => ({ name: x.name, value: x.value }));
    res.json({ ok: true, data });
  });

  // 排行：领取数 Top 项目
  r.get("/ranking", (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT b.id, b.name, COUNT(cl.id) AS claimed
         FROM batches b LEFT JOIN claims cl ON cl.batch_id = b.id
         GROUP BY b.id ORDER BY claimed DESC LIMIT 8`
      )
      .all();
    const list = rows.map((x) => ({
      name: x.name,
      claimed: x.claimed,
      remaining: batchStats(x.id).remaining,
    }));
    res.json({ ok: true, list });
  });

  return r;
}

// 供前端图表使用：将 publicBatch 逻辑复用无需改动
publicBatch;