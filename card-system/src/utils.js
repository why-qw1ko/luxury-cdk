import { getDb } from "./db.js";

/** 从请求中提取客户端 IP */
export function getClientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket?.remoteAddress || "";
}

/** 取当前北京/本机时间，统一格式 */
export function now() {
  return new Date();
}

export function isBatchActive(batch, t = now()) {
  const ts = t.getTime();
  if (batch.start_time && ts < new Date(batch.start_time).getTime()) return false;
  if (batch.end_time && ts > new Date(batch.end_time).getTime()) return false;
  return true;
}

/** 批次统计（卡密总数 / 剩余 / 已领） */
export function batchStats(batchId) {
  const db = getDb();
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM cards WHERE batch_id = ?`)
    .get(batchId).c;
  const claimed = db
    .prepare(`SELECT COUNT(*) AS c FROM cards WHERE batch_id = ? AND status = 'claimed'`)
    .get(batchId).c;
  return { total, claimed, remaining: total - claimed };
}

export function publicBatch(b) {
  let tags = [];
  try { tags = JSON.parse(b.tags || "[]"); } catch { tags = []; }
  return {
    id: b.id,
    name: b.name,
    tags,
    start_time: b.start_time,
    end_time: b.end_time,
    limit_ip: !!b.limit_ip,
    description: b.description,
    mode: b.mode,
    status: b.status,
    created_at: b.created_at,
    created_by: b.created_by,
  };
}