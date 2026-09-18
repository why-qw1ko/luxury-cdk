import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";
import { batchStats, publicBatch } from "../utils.js";

export function batchRouter() {
  const r = Router();
  r.use(requireAuth);

  // 项目（批次）列表，含统计
  r.get("/", (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM batches ORDER BY id DESC`)
      .all();
    const list = rows.map((b) => {
      const s = batchStats(b.id);
      return { ...publicBatch(b), ...s };
    });
    res.json({ ok: true, list });
  });

  // 项目详情
  r.get("/:id", (req, res) => {
    const db = getDb();
    const b = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(req.params.id);
    if (!b) return res.status(404).json({ ok: false, message: "项目不存在" });
    res.json({ ok: true, batch: { ...publicBatch(b), ...batchStats(b.id) } });
  });

  // 创建项目（基本设置 + 分发内容）
  r.post("/", (req, res) => {
    const db = getDb();
    const body = req.body || {};
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, message: "请填写项目名称" });
    if (name.length > 32) return res.status(400).json({ ok: false, message: "项目名称不能超过32字符" });

    let tags = Array.isArray(body.tags) ? body.tags : [];
    tags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 10);

    const startTime = body.start_time ? new Date(body.start_time) : null;
    const endTime = body.end_time ? new Date(body.end_time) : null;
    if (startTime && endTime && startTime >= endTime) {
      return res.status(400).json({ ok: false, message: "结束时间需晚于开始时间" });
    }

    const result = db
      .prepare(
        `INSERT INTO batches (name, tags, start_time, end_time, limit_ip, description, mode)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        JSON.stringify(tags),
        startTime ? startTime.toISOString() : null,
        endTime ? endTime.toISOString() : null,
        body.limit_ip ? 1 : 0,
        (body.description || "").trim(),
        body.mode || "one_one"
      );

    const batch = db
      .prepare(`SELECT * FROM batches WHERE id = ?`)
      .get(result.lastInsertRowid);
    res.json({ ok: true, batch: publicBatch(batch) });
  });

  // 删除项目
  r.delete("/:id", (req, res) => {
    const db = getDb();
    const info = db.prepare(`DELETE FROM batches WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ ok: false, message: "项目不存在" });
    res.json({ ok: true });
  });

  // 批量导入卡密（粘贴文本，自动去重）
  r.post("/:id/cards/import", (req, res) => {
    const db = getDb();
    const batch = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(req.params.id);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在" });

    const text = (req.body?.text || "").replace(/\r/g, "");
    const cards = text
      .split(/[\s,，;；]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cards.length === 0) {
      return res.status(400).json({ ok: false, message: "未检测到有效的卡密文本" });
    }

    const seen = new Set();
    const uniqueInput = [];
    for (const c of cards) {
      if (!seen.has(c)) { seen.add(c); uniqueInput.push(c); }
    }

    // 应用层：排除已在库中的
    const existing = new Set(
      db.prepare(`SELECT code FROM cards`).all().map((x) => x.code)
    );
    const unique = uniqueInput.filter((c) => !existing.has(c));

    // 兜底：依赖 code UNIQUE 约束，插入时捕获冲突，保证最终去重
    const insert = db.prepare(
      `INSERT INTO cards (batch_id, code) VALUES (?, ?)`
    );
    let inserted = 0;
    let fallbackDup = 0;

    const tx = db.transaction((list) => {
      for (const c of list) {
        try {
          insert.run(batch.id, c);
          inserted++;
        } catch (e) {
          if (/UNIQUE constraint failed/.test(e.message)) fallbackDup++;
          else throw e;
        }
      }
    });
    tx(unique);

    const dupInInput = uniqueInput.length - unique.length;
    const stats = batchStats(batch.id);
    res.json({
      ok: true,
      submitted: uniqueInput.length,
      inserted,
      duplicate: dupInInput + fallbackDup,
      stats,
    });
  });

  // 项目的卡密清单
  r.get("/:id/cards", (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM cards WHERE batch_id = ? ORDER BY id`)
      .all(req.params.id);
    res.json({ ok: true, list: rows });
  });

  // 项目的领取记录
  r.get("/:id/claims", (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT c.id, c.code, c.ip, c.claimed_at
         FROM claims c WHERE c.batch_id = ?
         ORDER BY c.id DESC`
      )
      .all(req.params.id);
    res.json({ ok: true, list: rows });
  });

  // 导出 CSV
  r.get("/:id/export", (req, res) => {
    const db = getDb();
    const batch = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(req.params.id);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在" });

    const cards = db
      .prepare(
        `SELECT c.code, c.status, COALESCE(cl.ip,'') AS ip, COALESCE(cl.claimed_at,'') AS claimed_at
         FROM cards c
         LEFT JOIN claims cl ON cl.card_id = c.id
         WHERE c.batch_id = ?
         ORDER BY c.id`
      )
      .all(batch.id);

    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = escape("卡密") + "," + escape("状态") + "," + escape("领取IP") + "," + escape("领取时间");
    const lines = cards.map((c) =>
      [c.code, c.status === "claimed" ? "已领取" : "未领取", c.ip, c.claimed_at]
        .map(escape)
        .join(",")
    );
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="batch_${batch.id}_cards.csv"`
    );
    res.send(csv);
  });

  return r;
}