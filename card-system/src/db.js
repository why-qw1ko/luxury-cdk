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

function tableHasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

export async function initDb() {
  await ensureDir();
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
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
    limit_ip INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'one_one',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
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

  // 卡密唯一约束（去重兜底）
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_code ON cards(code);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cards_batch ON cards(batch_id, status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_claims_batch ON claims(batch_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_claims_card ON claims(card_id);`);

  // 兼容旧库：批次增加归属字段
  if (!tableHasColumn("batches", "owner_id")) {
    db.exec(`ALTER TABLE batches ADD COLUMN owner_id INTEGER`);
  }
  if (!tableHasColumn("batches", "owner_name")) {
    db.exec(`ALTER TABLE batches ADD COLUMN owner_name TEXT`);
  }

  // 迁移：旧 admin 表数据并入 users，作为唯一管理员
  const hasAdminTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='admin'`)
    .get();
  db.exec(`UPDATE batches SET owner_id = 1, owner_name = '管理员' WHERE owner_id IS NULL`);

  const adminCount = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).get().c;
  if (adminCount === 0) {
    const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
    if (hasAdminTable) {
      const old = db.prepare(`SELECT username, password_hash FROM admin ORDER BY id LIMIT 1`).get();
      const username = "admin";
      if (old) {
        db.prepare(
          `INSERT INTO users (id, username, password_hash, role, status) VALUES (1, ?, ?, 'admin', 'active')`
        ).run(username, old.password_hash);
      } else {
        db.prepare(
          `INSERT INTO users (id, username, password_hash, role, status) VALUES (1, ?, ?, 'admin', 'active')`
        ).run(username, bcrypt.hashSync(defaultPassword, 10));
      }
    } else {
      db.prepare(
        `INSERT INTO users (id, username, password_hash, role, status) VALUES (1, 'admin', ?, 'admin', 'active')`
      ).run(bcrypt.hashSync(defaultPassword, 10));
    }
  }

  return db;
}