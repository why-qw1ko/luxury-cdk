import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";
import { batchStats, publicBatch } from "../utils.js";
import {
  CONTENT_TYPE_LABEL,
  MIN_CODE_LENGTH,
  detectContentType,
  formatClaimCode,
  generateClaimCode,
  normalizeClaimCode,
} from "../codes.js";

const MAX_GENERATE = 5000;
const DEFAULT_PAGE = 500;
const MAX_PAGE = 5000;

/** 返回当前用户可访问的项目，无权限则返回 null */
function ownedBatch(db, batchId, req) {
  const b = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(batchId);
  if (!b) return null;
  if (req.user.role === "admin" || b.owner_id == req.user.uid) return b;
  return null;
}

/** 按空白 / 逗号 / 分号切分文本，返回原始条目 */
function splitLines(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/[\s,，;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function csvCell(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, header, lines) {
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

function pageLimit(q) {
  const n = Number(q?.limit);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_PAGE;
  return Math.min(n, MAX_PAGE);
}

/** 绑定模式：按顺序取一条尚未被任何 CDK 占用的未发放内容 */
function nextBindableContent(db, batchId) {
  return db
    .prepare(
      `SELECT ct.id FROM contents ct
       WHERE ct.batch_id = ? AND ct.status = 'available'
         AND NOT EXISTS (SELECT 1 FROM claim_codes cc WHERE cc.content_id = ct.id)
       ORDER BY ct.id LIMIT 1`
    )
    .get(batchId);
}

export function batchRouter() {
  const r = Router();
  r.use(requireAuth);

  // 项目列表（管理员全部，普通用户仅自己的）
  r.get("/", (req, res) => {
    const db = getDb();
    const isAdmin = req.user.role === "admin";
    const rows = isAdmin
      ? db.prepare(`SELECT * FROM batches ORDER BY id DESC`).all()
      : db.prepare(`SELECT * FROM batches WHERE owner_id = ? ORDER BY id DESC`).all(req.user.uid);
    const list = rows.map((b) => ({ ...publicBatch(b), ...batchStats(b.id) }));
    res.json({ ok: true, list });
  });

  // 项目详情
  r.get("/:id", (req, res) => {
    const db = getDb();
    const b = ownedBatch(db, req.params.id, req);
    if (!b) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    res.json({ ok: true, batch: { ...publicBatch(b), ...batchStats(b.id) } });
  });

  // 创建项目（归属当前用户）
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
    if (startTime && isNaN(startTime.getTime())) {
      return res.status(400).json({ ok: false, message: "开始时间格式不正确" });
    }
    if (endTime && isNaN(endTime.getTime())) {
      return res.status(400).json({ ok: false, message: "结束时间格式不正确" });
    }
    if (startTime && endTime && startTime >= endTime) {
      return res.status(400).json({ ok: false, message: "结束时间需晚于开始时间" });
    }

    const bindMode = body.bind_mode === "bound" ? "bound" : "dynamic";
    const result = db
      .prepare(
        `INSERT INTO batches (name, tags, start_time, end_time, description, mode, bind_mode, owner_id, owner_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        JSON.stringify(tags),
        startTime ? startTime.toISOString() : null,
        endTime ? endTime.toISOString() : null,
        (body.description || "").trim(),
        body.mode || "one_one",
        bindMode,
        req.user.uid,
        req.user.name
      );

    const batch = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(result.lastInsertRowid);
    res.json({ ok: true, batch: publicBatch(batch) });
  });

  // 调整分发模式（不改动已生成 CDK 的绑定状态）
  r.patch("/:id", (req, res) => {
    const db = getDb();
    const b = ownedBatch(db, req.params.id, req);
    if (!b) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    const mode = req.body?.bind_mode;
    if (!["dynamic", "bound"].includes(mode)) {
      return res.status(400).json({ ok: false, message: "不支持的分发模式" });
    }
    db.prepare(`UPDATE batches SET bind_mode = ? WHERE id = ?`).run(mode, b.id);
    const nb = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(b.id);
    res.json({ ok: true, batch: { ...publicBatch(nb), ...batchStats(b.id) } });
  });

  // 删除项目
  r.delete("/:id", (req, res) => {
    const db = getDb();
    const b = ownedBatch(db, req.params.id, req);
    if (!b) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    db.prepare(`DELETE FROM batches WHERE id = ?`).run(b.id);
    res.json({ ok: true });
  });

  /* ---------- 分发内容 ---------- */

  // 内容清单
  r.get("/:id/contents", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM contents WHERE batch_id = ?`)
      .get(batch.id).c;
    const rows = db
      .prepare(
        `SELECT ct.id, ct.type, ct.payload, ct.status, ct.created_at, ct.used_at,
                COALESCE(cl.claim_code, '') AS claim_code, COALESCE(cl.ip, '') AS ip,
                COALESCE(bc.code, '') AS bound_code
         FROM contents ct
         LEFT JOIN claims cl ON cl.content_id = ct.id
         LEFT JOIN claim_codes bc ON bc.content_id = ct.id
         WHERE ct.batch_id = ?
         ORDER BY ct.id DESC LIMIT ?`
      )
      .all(batch.id, pageLimit(req.query));
    res.json({ ok: true, total, list: rows });
  });

  // 批量导入分发内容（项目内自动去重）
  r.post("/:id/contents/import", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });

    const raw = splitLines(req.body?.text);
    if (!raw.length) {
      return res.status(400).json({ ok: false, message: "未检测到有效内容，请粘贴兑换码 / 链接 / 文本" });
    }
    const prefer = String(req.body?.type || "auto");

    const seen = new Set();
    const unique = [];
    for (const p of raw) if (!seen.has(p)) { seen.add(p); unique.push(p); }

    const existing = new Set(
      db.prepare(`SELECT payload FROM contents WHERE batch_id = ?`).all(batch.id).map((x) => x.payload)
    );
    const insert = db.prepare(`INSERT INTO contents (batch_id, type, payload) VALUES (?, ?, ?)`);
    let inserted = 0;
    let duplicate = raw.length - unique.length;

    const tx = db.transaction((list) => {
      for (const p of list) {
        if (existing.has(p)) { duplicate++; continue; }
        try {
          insert.run(batch.id, detectContentType(p, prefer), p);
          inserted++;
        } catch (e) {
          if (/UNIQUE constraint failed/.test(e.message)) duplicate++;
          else throw e;
        }
      }
    });
    tx(unique);

    res.json({
      ok: true,
      submitted: raw.length,
      inserted,
      duplicate,
      stats: batchStats(batch.id),
    });
  });

  // 删除单条未发放内容
  r.delete("/:id/contents/:contentId", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    const info = db
      .prepare(
        `DELETE FROM contents
         WHERE id = ? AND batch_id = ? AND status = 'available'
           AND NOT EXISTS (SELECT 1 FROM claim_codes cc WHERE cc.content_id = contents.id)`
      )
      .run(req.params.contentId, batch.id);
    if (info.changes === 0) {
      return res.status(400).json({ ok: false, message: "仅可删除尚未发放、且未被 CDK 占用的内容" });
    }
    res.json({ ok: true, stats: batchStats(batch.id) });
  });

  /* ---------- 领取 CDK ---------- */

  // CDK 清单
  r.get("/:id/claim-codes", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM claim_codes WHERE batch_id = ?`)
      .get(batch.id).c;
    const rows = db
      .prepare(
        `SELECT cc.id, cc.code, cc.status, cc.created_at, cc.claimed_at,
                COALESCE(ct.payload, '') AS bound_payload
         FROM claim_codes cc
         LEFT JOIN contents ct ON ct.id = cc.content_id
         WHERE cc.batch_id = ?
         ORDER BY cc.id DESC LIMIT ?`
      )
      .all(batch.id, pageLimit(req.query));
    res.json({
      ok: true,
      total,
      list: rows.map((x) => ({ ...x, code_display: formatClaimCode(x.code) })),
    });
  });

  // 批量生成 CDK
  r.post("/:id/claim-codes/generate", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });

    const count = Number(req.body?.count);
    if (!Number.isInteger(count) || count < 1) {
      return res.status(400).json({ ok: false, message: "生成数量需为大于 0 的整数" });
    }
    if (count > MAX_GENERATE) {
      return res.status(400).json({ ok: false, message: `单次最多生成 ${MAX_GENERATE} 个 CDK` });
    }
    const prefix = normalizeClaimCode(req.body?.prefix || "").slice(0, 8);

    // 绑定模式：每个新 CDK 按顺序绑定一条尚未占用的内容，绑定数受库存约束
    const bind = batch.bind_mode === "bound";
    if (bind) {
      const s = batchStats(batch.id);
      if (s.contentBindable < count) {
        return res.status(400).json({
          ok: false,
          message: `绑定模式下需可绑定的内容：当前仅剩 ${s.contentBindable} 条，不足 ${count} 个`,
        });
      }
    }

    const insert = db.prepare(`INSERT INTO claim_codes (batch_id, code, content_id) VALUES (?, ?, ?)`);
    let inserted = 0;
    const tx = db.transaction(() => {
      let guard = 0;
      while (inserted < count) {
        if (++guard > count * 20) throw new Error("CODE_COLLISION");
        const code = generateClaimCode({ prefix });
        let contentId = null;
        if (bind) {
          const c = nextBindableContent(db, batch.id);
          if (!c) throw new Error("NO_BINDABLE");
          contentId = c.id;
        }
        try {
          insert.run(batch.id, code, contentId);
          inserted++;
        } catch (e) {
          if (!/UNIQUE constraint failed/.test(e.message)) throw e;
        }
      }
    });

    try {
      tx();
    } catch (e) {
      if (e.message === "CODE_COLLISION") {
        return res.status(500).json({ ok: false, message: "CDK 随机冲突过多，请重试" });
      }
      if (e.message === "NO_BINDABLE") {
        return res.status(400).json({ ok: false, message: "可绑定的内容已用尽，请先补充内容" });
      }
      throw e;
    }

    res.json({ ok: true, inserted, stats: batchStats(batch.id) });
  });

  // 手动导入已有的 CDK（全局去重）
  r.post("/:id/claim-codes/import", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });

    const raw = splitLines(req.body?.text);
    if (!raw.length) return res.status(400).json({ ok: false, message: "未检测到有效的 CDK 文本" });

    let invalid = 0;
    const seen = new Set();
    const unique = [];
    for (const p of raw) {
      const c = normalizeClaimCode(p);
      if (c.length < MIN_CODE_LENGTH) { invalid++; continue; }
      if (seen.has(c)) continue;
      seen.add(c);
      unique.push(c);
    }

    const existing = new Set(db.prepare(`SELECT code FROM claim_codes`).all().map((x) => x.code));
    const bind = batch.bind_mode === "bound";
    if (bind) {
      const s = batchStats(batch.id);
      if (s.contentBindable < unique.length) {
        return res.status(400).json({
          ok: false,
          message: `绑定模式下需可绑定的内容：当前仅剩 ${s.contentBindable} 条，不足 ${unique.length} 个 CDK`,
        });
      }
    }

    const insert = db.prepare(`INSERT INTO claim_codes (batch_id, code, content_id) VALUES (?, ?, ?)`);
    let inserted = 0;
    let duplicate = raw.length - unique.length - invalid;

    const tx = db.transaction((list) => {
      for (const c of list) {
        if (existing.has(c)) { duplicate++; continue; }
        let contentId = null;
        if (bind) {
          const b2 = nextBindableContent(db, batch.id);
          if (!b2) throw new Error("NO_BINDABLE");
          contentId = b2.id;
        }
        try {
          insert.run(batch.id, c, contentId);
          inserted++;
        } catch (e) {
          if (/UNIQUE constraint failed/.test(e.message)) duplicate++;
          else throw e;
        }
      }
    });

    try {
      tx(unique);
    } catch (e) {
      if (e.message === "NO_BINDABLE") {
        return res.status(400).json({ ok: false, message: "可绑定的内容已用尽，请先补充内容" });
      }
      throw e;
    }

    res.json({
      ok: true,
      submitted: raw.length,
      inserted,
      duplicate,
      invalid,
      stats: batchStats(batch.id),
    });
  });

  // 导出 CDK 清单（用于对外分发）
  r.get("/:id/claim-codes/export", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    const rows = db
      .prepare(`SELECT code, status, claimed_at FROM claim_codes WHERE batch_id = ? ORDER BY id`)
      .all(batch.id);
    const header = [csvCell("领取CDK"), csvCell("状态"), csvCell("领取时间")].join(",");
    const lines = rows.map((c) =>
      [
        csvCell(formatClaimCode(c.code)),
        csvCell(c.status === "claimed" ? "已使用" : c.status === "disabled" ? "已禁用" : "未使用"),
        csvCell(c.claimed_at || ""),
      ].join(",")
    );
    sendCsv(res, `batch_${batch.id}_claim_codes.csv`, header, lines);
  });

  // 删除单个未使用的 CDK
  r.delete("/:id/claim-codes/:codeId", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    const info = db
      .prepare(`DELETE FROM claim_codes WHERE id = ? AND batch_id = ? AND status = 'available'`)
      .run(req.params.codeId, batch.id);
    if (info.changes === 0) {
      return res.status(400).json({ ok: false, message: "仅可删除尚未使用的 CDK" });
    }
    res.json({ ok: true, stats: batchStats(batch.id) });
  });

  /* ---------- 领取记录与导出 ---------- */

  // 项目的领取记录（哪个 CDK 领走了哪份内容）
  r.get("/:id/claims", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });
    const total = db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE batch_id = ?`).get(batch.id).c;
    const rows = db
      .prepare(
        `SELECT id, claim_code, content_type, content_payload, ip, claimed_at
         FROM claims WHERE batch_id = ?
         ORDER BY id DESC LIMIT ?`
      )
      .all(batch.id, pageLimit(req.query));
    res.json({ ok: true, total, list: rows });
  });

  // 导出内容发放明细 CSV
  r.get("/:id/export", (req, res) => {
    const db = getDb();
    const batch = ownedBatch(db, req.params.id, req);
    if (!batch) return res.status(404).json({ ok: false, message: "项目不存在或无权访问" });

    const rows = db
      .prepare(
        `SELECT ct.type, ct.payload, ct.status,
                COALESCE(cl.claim_code, '') AS claim_code,
                COALESCE(bc.code, '') AS bound_code,
                COALESCE(cl.ip, '') AS ip,
                COALESCE(cl.claimed_at, '') AS claimed_at
         FROM contents ct
         LEFT JOIN claims cl ON cl.content_id = ct.id
         LEFT JOIN claim_codes bc ON bc.content_id = ct.id
         WHERE ct.batch_id = ?
         ORDER BY ct.id`
      )
      .all(batch.id);

    const header = [
      csvCell("内容类型"),
      csvCell("内容"),
      csvCell("状态"),
      csvCell("绑定CDK"),
      csvCell("领取CDK"),
      csvCell("领取IP"),
      csvCell("领取时间"),
    ].join(",");
    const lines = rows.map((c) =>
      [
        csvCell(CONTENT_TYPE_LABEL[c.type] || c.type),
        csvCell(c.payload),
        csvCell(c.status === "used" ? "已发放" : "未发放"),
        csvCell(c.bound_code ? formatClaimCode(c.bound_code) : ""),
        csvCell(c.claim_code ? formatClaimCode(c.claim_code) : ""),
        csvCell(c.ip),
        csvCell(c.claimed_at),
      ].join(",")
    );
    sendCsv(res, `batch_${batch.id}_contents.csv`, header, lines);
  });

  return r;
}
