/**
 * beaba — sync/influx.js
 * Envoie les releves non-synchronises vers InfluxDB cloud par batch.
 * Tourne sur un cron toutes les SYNC_INTERVAL_MIN minutes.
 * Si la 4G est coupee, les donnees restent en SQLite (synced=0) et
 * seront renvoyees au prochain cycle.
 */

'use strict';
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { getDb, getActiveCampaign } = require('../db');

const BATCH = parseInt(process.env.SYNC_BATCH_SIZE, 10) || 500;

let _influx = null;

function getWriteApi() {
  if (!process.env.INFLUX_TOKEN) return null;
  if (!_influx) {
    _influx = new InfluxDB({
      url: process.env.INFLUX_URL,
      token: process.env.INFLUX_TOKEN,
    });
  }
  return _influx.getWriteApi(
    process.env.INFLUX_ORG,
    process.env.INFLUX_BUCKET,
    'ms'
  );
}

// ── Constructeurs de points InfluxDB ─────────────────────────────────

function tempPoints(rows, campaign) {
  return rows.map((r) =>
    new Point('temperature_humidity')
      .tag('kit_id', campaign.kit_id)
      .tag('campaign_id', campaign.id)
      .tag('household', campaign.household)
      .tag('sensor_id', r.sensor_id)
      .floatField('temperature_c', r.temperature_c)
      .floatField('humidity_pct', r.humidity_pct)
      .intField('battery_pct', r.battery_pct ?? 0)
      .timestamp(new Date(r.ts + 'Z'))
  );
}

function co2Points(rows, campaign) {
  return rows.map((r) => {
    const p = new Point('co2')
      .tag('kit_id', campaign.kit_id)
      .tag('campaign_id', campaign.id)
      .tag('household', campaign.household)
      .tag('sensor_id', r.sensor_id)
      .intField('co2_ppm', r.co2_ppm)
      .timestamp(new Date(r.ts + 'Z'));
    if (r.temperature_c != null) p.floatField('temperature_c', r.temperature_c);
    if (r.humidity_pct  != null) p.floatField('humidity_pct',  r.humidity_pct);
    return p;
  });
}

function powerPoints(rows, db, campaign) {
  const plugCache = {};
  return rows.map((r) => {
    if (!plugCache[r.plug_id]) {
      plugCache[r.plug_id] = db.prepare(
        'SELECT room_id, appliance_name, source FROM plugs WHERE id = ?'
      ).get(r.plug_id) || {};
    }
    const meta = plugCache[r.plug_id];
    const p = new Point('power')
      .tag('kit_id', campaign.kit_id)
      .tag('campaign_id', campaign.id)
      .tag('household', campaign.household)
      .tag('plug_id', r.plug_id)
      .tag('source', meta.source || 'unknown')
      .floatField('power_w', r.power_w)
      .timestamp(new Date(r.ts + 'Z'));
    if (meta.room_id)        p.tag('room_id', meta.room_id);
    if (meta.appliance_name) p.tag('appliance', meta.appliance_name);
    if (r.energy_kwh != null) p.floatField('energy_kwh', r.energy_kwh);
    return p;
  });
}

// ── Sync d'une table ─────────────────────────────────────────────────

async function syncTable({ db, writeApi, table, buildPoints }) {
  const rows = db.prepare(
    `SELECT * FROM ${table} WHERE synced = 0 ORDER BY ts ASC LIMIT ?`
  ).all(BATCH);

  if (!rows.length) return 0;

  const points = buildPoints(rows, db);
  points.forEach((p) => writeApi.writePoint(p));

  try {
    await writeApi.flush();
  } catch (err) {
    console.warn(`[Sync] Flush ${table} echoue :`, err.message);
    return 0;
  }

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`).run(...ids);

  return rows.length;
}

// ── Cycle principal ──────────────────────────────────────────────────

async function run() {
  const writeApi = getWriteApi();
  if (!writeApi) {
    console.warn('[Sync] INFLUX_TOKEN absent — sync desactive');
    return;
  }

  const campaign = getActiveCampaign();
  const db = getDb();
  let total = 0;

  try {
    total += await syncTable({
      db, writeApi,
      table: 'readings_temp',
      buildPoints: (rows) => tempPoints(rows, campaign || { kit_id: 'unknown', id: 'unknown', household: 'unknown' }),
    });
    total += await syncTable({
      db, writeApi,
      table: 'readings_co2',
      buildPoints: (rows) => co2Points(rows, campaign || { kit_id: 'unknown', id: 'unknown', household: 'unknown' }),
    });
    total += await syncTable({
      db, writeApi,
      table: 'readings_power',
      buildPoints: (rows) => powerPoints(rows, db, campaign || { kit_id: 'unknown', id: 'unknown', household: 'unknown' }),
    });
    if (total > 0) console.log(`[Sync] ${total} points envoyes vers InfluxDB`);
  } catch (err) {
    console.error('[Sync] Erreur :', err.message);
  } finally {
    await writeApi.close().catch(() => {});
    _influx = null;
  }
}

module.exports = { run };
