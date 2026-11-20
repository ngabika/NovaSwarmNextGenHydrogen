import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { AuditLogEntry, MemoryEntry, UnifiedMessage } from '../../shared/types';

const SQLITE_PATH = path.resolve(process.cwd(), 'novaswarm.sqlite');
let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;

export const WAL_SCHEMA_VERSION = 3;

export function getWalDatabase(customPath?: string): DatabaseSync {
  const target = customPath || SQLITE_PATH;
  if (dbInstance && currentDbPath === target) {
    return dbInstance;
  }
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      source_agent_id TEXT NOT NULL,
      source_agent_name TEXT NOT NULL,
      message TEXT NOT NULL,
      hash TEXT,
      prev_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(timestamp);
    CREATE TABLE IF NOT EXISTS memories_index (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      tier TEXT NOT NULL,
      importance REAL NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages_index (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      channel TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);
  const existingVer = db
    .prepare('SELECT MAX(version) as v FROM schema_migrations')
    .get() as { v: number | null } | undefined;
  if (!existingVer?.v || existingVer.v < WAL_SCHEMA_VERSION) {
    db.prepare('INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      WAL_SCHEMA_VERSION,
      new Date().toISOString()
    );
  }
  dbInstance = db;
  currentDbPath = target;
  return db;
}

export function syncAuditEntryToWal(entry: AuditLogEntry, customPath?: string): void {
  try {
    const db = getWalDatabase(customPath);
    db.prepare(
      `INSERT OR REPLACE INTO audit_logs (id, timestamp, type, source_agent_id, source_agent_name, message, hash, prev_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.id,
      entry.timestamp,
      entry.type,
      entry.sourceAgentId,
      entry.sourceAgentName,
      entry.message,
      entry.hash || null,
      entry.prevHash || null
    );
  } catch {
    // Non-fatal fallback to JSON atomic store
  }
}

export function syncMemoryToWal(mem: MemoryEntry, customPath?: string): void {
  try {
    const db = getWalDatabase(customPath);
    db.prepare(
      `INSERT OR REPLACE INTO memories_index (id, entity, tier, importance, content, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      mem.id,
      mem.entity,
      mem.tier || 'warm',
      Number(mem.importanceScore ?? 0.5),
      mem.content,
      mem.lastAccessedAt || mem.createdAt
    );
  } catch {
    // ignore
  }
}

export function syncMessageToWal(msg: UnifiedMessage, customPath?: string): void {
  try {
    const db = getWalDatabase(customPath);
    db.prepare(
      `INSERT OR REPLACE INTO messages_index (id, thread_id, sender_type, sender_name, channel, content, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      msg.id,
      msg.threadId,
      msg.senderType,
      msg.senderName,
      msg.channel,
      msg.content,
      msg.timestamp
    );
  } catch {
    // ignore
  }
}

export function queryWalAuditLogs(limit = 50, typeFilter?: string, customPath?: string): Array<{
  id: string;
  timestamp: string;
  type: string;
  sourceAgentName: string;
  message: string;
  hash: string | null;
}> {
  const db = getWalDatabase(customPath);
  const rows = typeFilter
    ? (db
        .prepare(
          `SELECT id, timestamp, type, source_agent_name as sourceAgentName, message, hash
           FROM audit_logs WHERE type = ? ORDER BY timestamp DESC LIMIT ?`
        )
        .all(typeFilter, Math.min(500, Math.max(1, limit))) as Array<{
        id: string;
        timestamp: string;
        type: string;
        sourceAgentName: string;
        message: string;
        hash: string | null;
      }>)
    : (db
        .prepare(
          `SELECT id, timestamp, type, source_agent_name as sourceAgentName, message, hash
           FROM audit_logs ORDER BY timestamp DESC LIMIT ?`
        )
        .all(Math.min(500, Math.max(1, limit))) as Array<{
        id: string;
        timestamp: string;
        type: string;
        sourceAgentName: string;
        message: string;
        hash: string | null;
      }>);
  return rows;
}

export function getSqliteWalStatus(customPath?: string): {
  available: boolean;
  path: string;
  schemaVersion: number;
  journalMode: string;
  auditRows: number;
  memoryRows: number;
  messageRows: number;
  sizeBytes: number;
} {
  const target = customPath || SQLITE_PATH;
  const db = getWalDatabase(target);
  const jm = db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined;
  const a = (db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as { c: number })?.c ?? 0;
  const m = (db.prepare('SELECT COUNT(*) as c FROM memories_index').get() as { c: number })?.c ?? 0;
  const msg = (db.prepare('SELECT COUNT(*) as c FROM messages_index').get() as { c: number })?.c ?? 0;
  const sizeBytes = fs.existsSync(target) ? fs.statSync(target).size : 0;
  return {
    available: true,
    path: target,
    schemaVersion: WAL_SCHEMA_VERSION,
    journalMode: jm?.journal_mode || 'wal',
    auditRows: a,
    memoryRows: m,
    messageRows: msg,
    sizeBytes,
  };
}

export function closeWalDatabaseForTests(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
    currentDbPath = null;
  }
}

export const closeSqliteWal = closeWalDatabaseForTests;
