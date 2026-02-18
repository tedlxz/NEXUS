import Database from 'better-sqlite3';
import { config } from '../config';
import { applySchema } from './schema';

// Cache per-user databases
const _dbCache: Map<string, Database.Database> = new Map();

/** Get database for a specific user */
export function getUserDb(userId: string): Database.Database {
  // If no userId, use default vault
  if (!userId) {
    return getDefaultDb();
  }
  
  const userVaultPath = config.vault.getVaultPath(userId);
  const dbPath = `${userVaultPath}/_system/nexus.db`;
  
  // Check cache first
  if (_dbCache.has(dbPath)) {
    return _dbCache.get(dbPath)!;
  }
  
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applySchema(db);
  
  _dbCache.set(dbPath, db);
  return db;
}

/** Get the default database (for backward compatibility) */
function getDefaultDb(): Database.Database {
  const { vaultPaths } = require('../config');
  const dbPath = vaultPaths.database;
  
  if (_dbCache.has(dbPath)) {
    return _dbCache.get(dbPath)!;
  }
  
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applySchema(db);
  
  _dbCache.set(dbPath, db);
  return db;
}

/** Legacy getDb - uses default vault */
export function getDb(): Database.Database {
  return getDefaultDb();
}

/** Close all databases */
export function closeDb(): void {
  for (const db of _dbCache.values()) {
    db.close();
  }
  _dbCache.clear();
}
