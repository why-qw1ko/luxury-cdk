import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export async function initDb() {
  await ensureDir();
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    start_time TEXT,               -- ISO local
    end_time TEXT,
    limit_ip INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'one_one',   -- 分发方式: one_one
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    created_by TEXT NOT NULL DEFAULT '管理员'
  );

  -- 卡密表：code 上建立 UNIQUE 索引作为去重兜底
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',  -- available / claimed
    batch_ref INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id),
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    claimed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  `);

  // 去重兜底：卡密全局唯一
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_code ON cards(code);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cards_batch ON cards(batch_id, status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_claims_batch ON claims(batch_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_claims_card ON claims(card_id);`);

  // 默认管理员
  const adminCount = db.prepare(`SELECT COUNT(*) AS c FROM admin`).get().c;
  if (adminCount === 0) {
    const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
    db.prepare(
      `INSERT INTO admin (id, username, password_hash) VALUES (1, '管理员', ?)`
    ).run(bcrypt.hashSync(defaultPassword, 10));
  }
  return db;
}