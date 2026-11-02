import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectContentType } from "./codes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "card.db");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

let db = null;

export function getDb() {
  if (db) return db;
  throw new Error("DB not initialized yet");
}

function tableExists(name) {
  return !!db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(name);
}

function tableHasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

/* ---------- 表结构 ---------- */

const BASE_SCHEMA = `
  -- 用户表（唯一管理员 + 普通用户），role 区分 admin / user
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',       -- admin / user
    status TEXT NOT NULL DEFAULT 'active',   -- active / banned
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    start_time TEXT,
    end_time TEXT,
    description TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'one_one',
    bind_mode TEXT NOT NULL DEFAULT 'dynamic', -- dynamic 动态发放 / bound 一码一内容绑定
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- 分发内容：管理员导入的兑换码 / 链接 / 文本，用户领取 CDK 后从内容池发放一份
  CREATE TABLE IF NOT EXISTS contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'code',        -- code / link / text
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available', -- available / used
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    used_at TEXT
  );

  -- 领取 CDK：系统生成（或手动导入）的领取凭证，用户在前台输入它来领取内容
  CREATE TABLE IF NOT EXISTS claim_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    content_id INTEGER REFERENCES contents(id), -- 绑定模式下指向固定内容；动态模式为 NULL
    status TEXT NOT NULL DEFAULT 'available', -- available / claimed / disabled
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    claimed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const CLAIMS_TABLE = `
  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    claim_code_id INTEGER NOT NULL REFERENCES claim_codes(id) ON DELETE CASCADE,
    claim_code TEXT NOT NULL,
    content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL DEFAULT 'code',
    content_payload TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    claimed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`;

const INDEXES = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_codes_code ON claim_codes(code);
  CREATE INDEX IF NOT EXISTS idx_claim_codes_batch ON claim_codes(batch_id, status);
  CREATE INDEX IF NOT EXISTS idx_claim_codes_content ON claim_codes(content_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_unique ON contents(batch_id, payload);
  CREATE INDEX IF NOT EXISTS idx_contents_batch ON contents(batch_id, status);
  CREATE INDEX IF NOT EXISTS idx_claims_batch ON claims(batch_id);
  CREATE INDEX IF NOT EXISTS idx_claims_code ON claims(claim_code_id);
`;

/* ---------- 旧库迁移 ---------- */

/**
 * 旧版是单层模型：cards 表里的卡密既是管理员导入的内容，又是用户输入的凭证。
 * 迁移时每条旧卡密同时生成「一份分发内容」与「一个领取 CDK」，老用户手里的码继续可用，
 * 且兑换回来的内容与旧行为完全一致。
 */
function migrateLegacy() {
  const hasCards = tableExists("cards");
  const needClaimsRebuild = tableExists("claims") && !tableHasColumn("claims", "claim_code");
  if (!hasCards && !needClaimsRebuild) return; // 全新库

  const done = db.prepare(`SELECT value FROM meta WHERE key = 'legacy_migrated'`).get();
  if (done) return;

  const legacyCards = hasCards ? db.prepare(`SELECT * FROM cards ORDER BY id`).all() : [];
  const legacyClaims = needClaimsRebuild ? db.prepare(`SELECT * FROM claims`).all() : [];
  if (!legacyCards.length && !legacyClaims.length) {
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('legacy_migrated', '1')`).run();
    return;
  }

  const tx = db.transaction(() => {
    if (needClaimsRebuild) db.exec(`ALTER TABLE claims RENAME TO claims_legacy`);

    const claimedAtByCode = new Map(legacyClaims.map((c) => [c.code, c.claimed_at]));
    const insContent = db.prepare(
      `INSERT INTO contents (batch_id, type, payload, status, created_at, used_at) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insCode = db.prepare(
      `INSERT INTO claim_codes (batch_id, code, content_id, status, created_at, claimed_at) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const card of legacyCards) {
      const claimed = card.status === "claimed";
      const claimedAt = claimed ? claimedAtByCode.get(card.code) || card.created_at : null;
      // 旧行为是"输码即得同码内容"，迁移后直接绑定到这份内容，语义完全一致
      const contentId = insContent.run(
        card.batch_id,
        detectContentType(card.code),
        card.code,
        claimed ? "used" : "available",
        card.created_at,
        claimedAt
      ).lastInsertRowid;
      insCode.run(
        card.batch_id,
        card.code,
        contentId,
        claimed ? "claimed" : "available",
        card.created_at,
        claimedAt
      );
    }

    if (needClaimsRebuild) {
      db.exec(CLAIMS_TABLE);
      const findCode = db.prepare(`SELECT id, code FROM claim_codes WHERE code = ?`);
      const findContent = db.prepare(
        `SELECT id, type, payload FROM contents WHERE batch_id = ? AND payload = ?`
      );
      const insClaim = db.prepare(
        `INSERT INTO claims (batch_id, claim_code_id, claim_code, content_id, content_type, content_payload, ip, claimed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const old of legacyClaims) {
        const cc = findCode.get(old.code);
        const ct = findContent.get(old.batch_id, old.code);
        if (!cc || !ct) continue;
        insClaim.run(old.batch_id, cc.id, cc.code, ct.id, ct.type, ct.payload, old.ip || "", old.claimed_at);
      }
      db.exec(`DROP TABLE claims_legacy`);
    }

    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('legacy_migrated', '1')`).run();
  });
  tx();
  console.log(`已迁移旧版卡密数据：${legacyCards.length} 条 -> 分发内容 + 领取 CDK`);
}

export async function initDb() {
  await ensureDir();
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(BASE_SCHEMA);
  db.exec(CLAIMS_TABLE);

  // 兼容旧库：补齐新增字段（需在建索引与数据迁移之前完成）
  if (!tableHasColumn("batches", "owner_id")) {
    db.exec(`ALTER TABLE batches ADD COLUMN owner_id INTEGER`);
  }
  if (!tableHasColumn("batches", "owner_name")) {
    db.exec(`ALTER TABLE batches ADD COLUMN owner_name TEXT`);
  }
  if (!tableHasColumn("batches", "bind_mode")) {
    db.exec(`ALTER TABLE batches ADD COLUMN bind_mode TEXT NOT NULL DEFAULT 'dynamic'`);
  }
  // simple_mode 列为已废弃功能的遗留（2026-09 短暂上线后按需求移除），
  // 列保留避免复杂迁移，代码层不再读写。
  if (!tableHasColumn("batches", "simple_mode")) {
    db.exec(`ALTER TABLE batches ADD COLUMN simple_mode INTEGER NOT NULL DEFAULT 0`);
  }
  if (!tableHasColumn("claim_codes", "content_id")) {
    db.exec(`ALTER TABLE claim_codes ADD COLUMN content_id INTEGER REFERENCES contents(id)`);
  }

  migrateLegacy();
  db.exec(INDEXES);

  // 同 IP 领取限制已下线，清理遗留字段（失败也不影响运行）
  if (tableHasColumn("batches", "limit_ip")) {
    try {
      db.exec(`ALTER TABLE batches DROP COLUMN limit_ip`);
    } catch (e) {
      console.warn(`未清理 batches.limit_ip 字段（已不再使用，不影响运行）：${e.message}`);
    }
  }

  // 迁移：旧 admin 表数据并入 users，作为唯一管理员
  const hasAdminTable = tableExists("admin");
  db.exec(`UPDATE batches SET owner_id = 1, owner_name = '管理员' WHERE owner_id IS NULL`);

  const adminCount = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).get().c;
  if (adminCount === 0) {
    const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
    let hash = null;
    if (hasAdminTable) {
      const old = db.prepare(`SELECT username, password_hash FROM admin ORDER BY id LIMIT 1`).get();
      if (old) hash = old.password_hash;
    }
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, status) VALUES (1, 'admin', ?, 'admin', 'active')`
    ).run(hash || bcrypt.hashSync(defaultPassword, 10));
  }

  // 历史数据补齐：旧版本动态发放领取后不回填 content_id，
  // 用领取记录把已使用 CDK 关联到实际发出去的内容（幂等，无缺失时影响 0 行）
  db.exec(`
    UPDATE claim_codes
    SET content_id = (SELECT cl.content_id FROM claims cl WHERE cl.claim_code_id = claim_codes.id)
    WHERE status = 'claimed' AND content_id IS NULL
      AND EXISTS (SELECT 1 FROM claims cl WHERE cl.claim_code_id = claim_codes.id)
  `);

  return db;
}
