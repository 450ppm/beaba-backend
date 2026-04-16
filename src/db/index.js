/**
 * beaba — db/index.js
 * Singleton SQLite (better-sqlite3).
 */

'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let _db = null;

function getDb() {
  if (_db) return _db;

  const dbPath = process.env.SQLITE_PATH || './data/beaba.db';
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  return _db;
}

function getActiveCampaign() {
  const db = getDb();
  return db.prepare("SELECT * FROM campaigns WHERE status IN ('setup','active') ORDER BY created_at DESC LIMIT 1").get() || null;
}

module.exports = { getDb, getActiveCampaign };
