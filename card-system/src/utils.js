import { getDb } from "./db.js";

/**
 * 从请求中提取客户端 IP。
 * 只信任 Express 依据 trust proxy 配置解析后的 req.ip，不直接读 x-forwarded-for，
 * 避免客户端伪造请求头污染记录。
 */
export function getClientIp(req) {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return String(ip).replace(/^::ffff:/, ""); // IPv6 映射地址还原为 IPv4
}

/** 取当前北京/本机时间 */
export function now() {
  return new Date();
}

/**
 * 本地时间戳 YYYY-MM-DD HH:MM:SS。
 * 与 SQLite 的 datetime('now','localtime')、批次时间的本地展示保持同一时区，
 * 避免用 toISOString() 造成的 8 小时偏移。
 */
export function localStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

export function isBatchActive(batch, t = now()) {
  const ts = t.getTime();
  if (batch.start_time && ts < new Date(batch.start_time).getTime()) return false;
  if (batch.end_time && ts > new Date(batch.end_time).getTime()) return false;
  return true;
}

/**
 * 批次统计：
 * - code* 维度 = 领取 CDK 库存（用户手里能拿去兑换的凭证）
 * - content* 维度 = 分发内容库存（真正能发出去的东西）
 * - remaining = 实际还能领取的数量，取两者较小值
 */
export function batchStats(batchId) {
  const db = getDb();
  const count = (sql, ...p) => db.prepare(sql).get(batchId, ...p).c;
  const codeTotal = count(`SELECT COUNT(*) AS c FROM claim_codes WHERE batch_id = ?`);
  const codeClaimed = count(
    `SELECT COUNT(*) AS c FROM claim_codes WHERE batch_id = ? AND status = 'claimed'`
  );
  const codeDisabled = count(
    `SELECT COUNT(*) AS c FROM claim_codes WHERE batch_id = ? AND status = 'disabled'`
  );
  const codeAvailable = codeTotal - codeClaimed - codeDisabled;
  const contentTotal = count(`SELECT COUNT(*) AS c FROM contents WHERE batch_id = ?`);
  const contentUsed = count(`SELECT COUNT(*) AS c FROM contents WHERE batch_id = ? AND status = 'used'`);
  const contentAvailable = contentTotal - contentUsed;
  const codeBound = count(
    `SELECT COUNT(*) AS c FROM claim_codes WHERE batch_id = ? AND content_id IS NOT NULL`
  );
  // 可被新 CDK 绑定的内容：未发放且尚未被任何 CDK 占用
  const contentBindable = count(
    `SELECT COUNT(*) AS c FROM contents ct WHERE ct.batch_id = ? AND ct.status = 'available'
       AND NOT EXISTS (SELECT 1 FROM claim_codes cc WHERE cc.content_id = ct.id)`
  );
  return {
    codeTotal,
    codeAvailable,
    codeClaimed,
    codeDisabled,
    codeBound,
    contentTotal,
    contentAvailable,
    contentUsed,
    contentBindable,
    remaining: Math.min(codeAvailable, contentAvailable),
  };
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
    description: b.description,
    mode: b.mode,
    bind_mode: b.bind_mode || "dynamic",
    status: b.status,
    owner_id: b.owner_id,
    owner_name: b.owner_name,
    created_at: b.created_at,
    created_by: b.owner_name || b.created_by,
  };
}
