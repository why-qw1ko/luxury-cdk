import { Router } from "express";
import { getDb } from "../db.js";
import { getClientIp, isBatchActive, localStamp, batchStats, publicBatch } from "../utils.js";
import { normalizeClaimCode, formatClaimCode, CONTENT_TYPE_LABEL } from "../codes.js";

/** 项目对外展示文案用的时间（转本地时间，无需前端解析） */
function shortTime(s) {
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s || "");
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function claimRouter() {
  const r = Router();

  // 前台可领取的开放项目（供领取页展示）
  r.get("/projects", (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM batches WHERE status = 'active' ORDER BY id DESC`)
      .all()
      .filter((b) => isBatchActive(b));
    res.json({
      ok: true,
      list: rows.slice(0, 12).map((b) => {
        const s = batchStats(b.id);
        return {
          ...publicBatch(b),
          remaining: s.remaining,
          codeAvailable: s.codeAvailable,
          contentAvailable: s.contentAvailable,
          total: s.codeTotal,
        };
      }),
    });
  });

  // 用户凭领取 CDK 兑换项目内容
  r.post("/", (req, res) => {
    const db = getDb();
    const code = normalizeClaimCode(req.body?.code);
    const ip = getClientIp(req);
    if (!code) return res.status(400).json({ ok: false, message: "请输入领取 CDK" });

    const cc = db
      .prepare(`SELECT id, code, status, batch_id, content_id FROM claim_codes WHERE code = ?`)
      .get(code);
    if (!cc) return res.status(404).json({ ok: false, message: "CDK 不存在，请核对后重试" });
    if (cc.status === "claimed") return res.status(409).json({ ok: false, message: "该 CDK 已被使用" });
    if (cc.status === "disabled") {
      return res.status(403).json({ ok: false, message: "该 CDK 已被禁用，请联系发放方" });
    }

    const batch = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(cc.batch_id);
    if (!batch || batch.status !== "active") {
      return res.status(400).json({ ok: false, message: "该 CDK 所属项目已停用" });
    }
    const t = new Date();
    if (batch.start_time && t < new Date(batch.start_time)) {
      return res.status(400).json({ ok: false, message: `该项目将于 ${shortTime(batch.start_time)} 开始` });
    }
    if (batch.end_time && t > new Date(batch.end_time)) {
      return res.status(400).json({ ok: false, message: `该项目已于 ${shortTime(batch.end_time)} 结束` });
    }

    // 动态发放只能取"未被任何 CDK 预留"的内容，否则会抢走绑定模式预留的库存
    const pickContent = db.prepare(
      `SELECT ct.id, ct.type, ct.payload FROM contents ct
       WHERE ct.batch_id = ? AND ct.status = 'available'
         AND NOT EXISTS (SELECT 1 FROM claim_codes cc WHERE cc.content_id = ct.id)
       ORDER BY ct.id LIMIT 1`
    );
    const getContent = db.prepare(`SELECT id, type, payload FROM contents WHERE id = ?`);
    const useContent = db.prepare(
      `UPDATE contents SET status = 'used', used_at = ? WHERE id = ? AND status = 'available'`
    );
    const useCode = db.prepare(
      `UPDATE claim_codes SET status = 'claimed', claimed_at = ? WHERE id = ? AND status = 'available'`
    );
    const insertClaim = db.prepare(
      `INSERT INTO claims (batch_id, claim_code_id, claim_code, content_id, content_type, content_payload, ip, claimed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    // 领取后把内容回填到 CDK 上，让后台「领取 CDK」列表能直接看到每个码发出去的内容
    const linkContent = db.prepare(`UPDATE claim_codes SET content_id = ? WHERE id = ?`);

    const ts = localStamp();
    const boundContentId = cc.content_id || null;
    let delivered = null;

    const tx = db.transaction(() => {
      // 抢占 CDK，保证一码一用
      if (useCode.run(ts, cc.id).changes === 0) {
        throw Object.assign(new Error("already_claimed"), { code: "CONFLICT" });
      }

      if (boundContentId) {
        // 绑定模式：只发放该 CDK 预先绑定的那一份内容
        const c = getContent.get(boundContentId);
        if (!c) throw Object.assign(new Error("bound_missing"), { code: "BOUND_MISSING" });
        if (useContent.run(ts, c.id).changes === 0) {
          throw Object.assign(new Error("bound_used"), { code: "BOUND_USED" });
        }
        delivered = c;
      } else {
        // 动态发放：从内容池取一份（极端并发下重试，避免取到正被占用的内容）
        for (let i = 0; i < 5 && !delivered; i++) {
          const c = pickContent.get(batch.id);
          if (!c) break;
          if (useContent.run(ts, c.id).changes > 0) delivered = c;
        }
        if (!delivered) throw Object.assign(new Error("no_content"), { code: "NO_CONTENT" });
      }

      insertClaim.run(
        batch.id,
        cc.id,
        cc.code,
        delivered.id,
        delivered.type,
        delivered.payload,
        ip,
        ts
      );
      // 动态模式下 content_id 原本为 NULL，回填后 CDK 与内容双向可查
      linkContent.run(delivered.id, cc.id);
    });

    try {
      tx();
    } catch (e) {
      if (e.code === "CONFLICT") {
        return res.status(409).json({ ok: false, message: "该 CDK 已被使用" });
      }
      if (e.code === "NO_CONTENT") {
        return res.status(409).json({ ok: false, message: "该项目暂无可发放内容，请联系发放方补充" });
      }
      if (e.code === "BOUND_MISSING") {
        return res.status(409).json({ ok: false, message: "该 CDK 绑定的内容已被删除，请联系发放方" });
      }
      if (e.code === "BOUND_USED") {
        return res.status(409).json({ ok: false, message: "该 CDK 绑定的内容已被发放，请联系发放方" });
      }
      throw e;
    }

    res.json({
      ok: true,
      message: "领取成功",
      code: cc.code,
      code_display: formatClaimCode(cc.code),
      content: {
        type: delivered.type,
        type_label: CONTENT_TYPE_LABEL[delivered.type] || delivered.type,
        payload: delivered.payload,
      },
      project: batch.name,
      claimed_at: ts,
    });
  });

  return r;
}
