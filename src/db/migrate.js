/**
 * beaba — migrate.js
 * Cree le schema SQLite local sur le Raspberry Pi.
 * Sert de buffer offline et de source de verite pour la config du kit.
 * A lancer une fois au deploiement : node src/db/migrate.js
 */

'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Execution directe : node src/db/migrate.js
if (require.main === module) {
  const dbPath = process.env.SQLITE_PATH || './data/beaba.db';
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigration(db);

  db.close();
  console.log(`Migration OK — base : ${dbPath}`);
}

/**
 * Applique le schema complet. Exportee pour etre reutilisee par le wipe.
 */
function runMigration(database) {
  database.exec(`
    -- ── Campagnes ──────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS campaigns (
      id            TEXT PRIMARY KEY,
      kit_id        TEXT NOT NULL,
      household     TEXT NOT NULL,
      address       TEXT,
      start_date    TEXT NOT NULL,
      expected_days INTEGER NOT NULL DEFAULT 30,
      status        TEXT NOT NULL DEFAULT 'setup' CHECK(status IN ('setup','active','completed')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT,
      notes         TEXT
    );

    -- ── Pieces ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS rooms (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      name        TEXT NOT NULL,
      color       TEXT NOT NULL DEFAULT '#888780',
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    -- ── Capteurs temperature / humidite (Sonoff SNZB-02P) ─────────────

    CREATE TABLE IF NOT EXISTS temp_sensors (
      id            TEXT PRIMARY KEY,
      campaign_id   TEXT NOT NULL REFERENCES campaigns(id),
      room_id       TEXT REFERENCES rooms(id),
      name          TEXT NOT NULL,
      friendly_name TEXT NOT NULL,
      comment       TEXT
    );

    -- ── Capteur CO2 (Heiman HS3AQ) ────────────────────────────────────

    CREATE TABLE IF NOT EXISTS co2_sensors (
      id            TEXT PRIMARY KEY,
      campaign_id   TEXT NOT NULL REFERENCES campaigns(id),
      room_id       TEXT REFERENCES rooms(id),
      name          TEXT NOT NULL,
      friendly_name TEXT NOT NULL,
      comment       TEXT
    );

    -- ── Prises de mesure ──────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS plugs (
      id              TEXT PRIMARY KEY,
      campaign_id     TEXT NOT NULL REFERENCES campaigns(id),
      room_id         TEXT REFERENCES rooms(id),
      source          TEXT NOT NULL CHECK(source IN ('innr','shelly_em')),
      zigbee_id       TEXT,
      shelly_channel  INTEGER,
      appliance_name  TEXT NOT NULL,
      rated_power_w   INTEGER,
      sort_order      INTEGER NOT NULL DEFAULT 0
    );

    -- ── Releves temperature / humidite ────────────────────────────────

    CREATE TABLE IF NOT EXISTS readings_temp (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_id     TEXT NOT NULL REFERENCES temp_sensors(id),
      campaign_id   TEXT NOT NULL,
      ts            TEXT NOT NULL DEFAULT (datetime('now')),
      temperature_c REAL NOT NULL,
      humidity_pct  REAL NOT NULL,
      battery_pct   INTEGER,
      synced        INTEGER NOT NULL DEFAULT 0
    );

    -- ── Releves CO2 ───────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS readings_co2 (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_id     TEXT NOT NULL REFERENCES co2_sensors(id),
      campaign_id   TEXT NOT NULL,
      ts            TEXT NOT NULL DEFAULT (datetime('now')),
      co2_ppm       INTEGER NOT NULL,
      temperature_c REAL,
      humidity_pct  REAL,
      synced        INTEGER NOT NULL DEFAULT 0
    );

    -- ── Releves puissance (Innr + Shelly EM) ─────────────────────────

    CREATE TABLE IF NOT EXISTS readings_power (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      plug_id       TEXT NOT NULL REFERENCES plugs(id),
      campaign_id   TEXT NOT NULL,
      ts            TEXT NOT NULL DEFAULT (datetime('now')),
      power_w       REAL NOT NULL,
      energy_kwh    REAL,
      synced        INTEGER NOT NULL DEFAULT 0
    );

    -- ── Index pour les requetes frequentes ───────────────────────────

    CREATE INDEX IF NOT EXISTS idx_rtemp_sensor   ON readings_temp(sensor_id, ts);
    CREATE INDEX IF NOT EXISTS idx_rtemp_synced   ON readings_temp(synced, ts);
    CREATE INDEX IF NOT EXISTS idx_rco2_sensor    ON readings_co2(sensor_id, ts);
    CREATE INDEX IF NOT EXISTS idx_rco2_synced    ON readings_co2(synced, ts);
    CREATE INDEX IF NOT EXISTS idx_rpow_plug      ON readings_power(plug_id, ts);
    CREATE INDEX IF NOT EXISTS idx_rpow_synced    ON readings_power(synced, ts);
    CREATE INDEX IF NOT EXISTS idx_campaign_status ON campaigns(status);
  `);
}

module.exports = { runMigration };
