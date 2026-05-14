/**
 * beaba — api/readings.js
 * Endpoints de lecture des releves, scopes par campagne active.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// GET /temp — dernier releve de chaque capteur temp (1 seul par capteur)
router.get('/temp', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const rows = db.prepare(`
    SELECT t.id, t.sensor_id, t.campaign_id, t.ts, t.temperature_c, t.humidity_pct, t.battery_pct, t.synced,
           s.name AS sensor_name, s.room_id
    FROM readings_temp t
    INNER JOIN temp_sensors s ON s.id = t.sensor_id
    WHERE t.campaign_id = ?
      AND t.id = (
        SELECT t2.id FROM readings_temp t2 WHERE t2.sensor_id = t.sensor_id AND t2.campaign_id = ? ORDER BY t2.ts DESC, t2.id DESC LIMIT 1
      )
    ORDER BY s.room_id
  `).all(campaignId, campaignId);
  res.json(rows);
});

// GET /co2 — dernier releve CO2 (offset de calibration applique)
router.get('/co2', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const rows = db.prepare(`
    SELECT c.id, c.sensor_id, c.campaign_id, c.ts,
           (c.co2_ppm + COALESCE(s.calibration_offset_ppm, 0)) AS co2_ppm,
           c.co2_ppm AS co2_ppm_raw,
           c.temperature_c, c.humidity_pct, c.battery_pct, c.synced,
           s.name AS sensor_name, s.room_id,
           COALESCE(s.calibration_offset_ppm, 0) AS calibration_offset_ppm
    FROM readings_co2 c
    INNER JOIN co2_sensors s ON s.id = c.sensor_id
    WHERE c.campaign_id = ?
      AND c.ts = (SELECT MAX(c2.ts) FROM readings_co2 c2 WHERE c2.sensor_id = c.sensor_id)
  `).all(campaignId);
  res.json(rows);
});

// GET /power — puissance instantanee par prise (1 seul par prise)
router.get('/power', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const rows = db.prepare(`
    SELECT r.id, r.plug_id, r.campaign_id, r.ts, r.power_w, r.energy_kwh, r.synced,
           p.appliance_name, p.room_id, p.source, p.is_multiprise
    FROM readings_power r
    INNER JOIN plugs p ON p.id = r.plug_id
    WHERE r.campaign_id = ?
      AND r.id = (
        SELECT r2.id FROM readings_power r2 WHERE r2.plug_id = r.plug_id AND r2.campaign_id = ? ORDER BY r2.ts DESC, r2.id DESC LIMIT 1
      )
    ORDER BY r.power_w DESC
  `).all(campaignId, campaignId);
  res.json(rows);
});

// GET /power/history — historique puissance
router.get('/power/history', (req, res) => {
  const { plug_id, from, to, limit } = req.query;
  if (!plug_id) return res.status(400).json({ error: 'plug_id requis' });

  const db = getDb();
  const campaignId = req.campaign.id;
  const since = from || new Date(Date.now() - 86400000).toISOString();
  const until = to   || new Date().toISOString();
  const n     = Math.min(parseInt(limit, 10) || 288, 1440);

  const rows = db.prepare(`
    SELECT ts, power_w, energy_kwh
    FROM readings_power
    WHERE plug_id = ? AND campaign_id = ? AND ts BETWEEN ? AND ?
    ORDER BY ts ASC
    LIMIT ?
  `).all(plug_id, campaignId, since, until, n);
  res.json(rows);
});

// GET /power/daily — consommation journaliere agregee
router.get('/power/daily', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;

  const now = new Date();
  const from = req.query.from || new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const to   = req.query.to   || now.toISOString().slice(0, 10);

  // Pour chaque jour et chaque prise, on prend le delta energy_kwh (max - min)
  // Si energy_kwh n'est pas dispo, on estime via power_w moyen * duree
  const rows = db.prepare(`
    SELECT
      date(r.ts) AS date,
      r.plug_id,
      p.appliance_name,
      CASE
        WHEN MAX(r.energy_kwh) IS NOT NULL AND MIN(r.energy_kwh) IS NOT NULL
          THEN MAX(r.energy_kwh) - MIN(r.energy_kwh)
        ELSE AVG(r.power_w) * 24.0 / 1000.0 * (
          CAST((julianday(MAX(r.ts)) - julianday(MIN(r.ts))) * 24 AS REAL) / 24.0
        )
      END AS kwh
    FROM readings_power r
    INNER JOIN plugs p ON p.id = r.plug_id
    WHERE r.campaign_id = ?
      AND date(r.ts) BETWEEN ? AND ?
    GROUP BY date(r.ts), r.plug_id
    ORDER BY date(r.ts) ASC
  `).all(campaignId, from, to);

  // Regrouper par date
  const byDate = {};
  for (const row of rows) {
    if (!byDate[row.date]) {
      byDate[row.date] = { date: row.date, total_kwh: 0, plugs: [] };
    }
    const kwh = Math.max(0, row.kwh || 0);
    byDate[row.date].total_kwh += kwh;
    byDate[row.date].plugs.push({
      plug_id: row.plug_id,
      appliance_name: row.appliance_name,
      kwh: Math.round(kwh * 1000) / 1000,
    });
  }

  for (const d of Object.values(byDate)) {
    d.total_kwh = Math.round(d.total_kwh * 1000) / 1000;
  }

  res.json(Object.values(byDate));
});

// GET /temp/history — historique temperature/humidite pour graphiques
router.get('/temp/history', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const { sensor_id, interval } = req.query;
  const groupBy = interval === 'day' ? 'date' : 'hour';

  const now = new Date();
  const from = req.query.from || new Date(now.getTime() - 86400000).toISOString();
  const to   = req.query.to   || now.toISOString();

  const timeExpr = groupBy === 'date'
    ? "date(r.ts)"
    : "strftime('%Y-%m-%d %H:00:00', r.ts)";

  let sql = `
    SELECT
      ${timeExpr} AS ts,
      r.sensor_id,
      s.name AS sensor_name,
      rm.name AS room_name,
      ROUND(AVG(r.temperature_c), 1) AS temperature_c,
      ROUND(AVG(r.humidity_pct), 1) AS humidity_pct
    FROM readings_temp r
    INNER JOIN temp_sensors s ON s.id = r.sensor_id
    LEFT JOIN rooms rm ON rm.id = s.room_id
    WHERE r.campaign_id = ?
      AND r.ts >= ?
      AND r.ts <= ?
  `;
  const params = [campaignId, from, to];

  if (sensor_id) {
    sql += ' AND r.sensor_id = ?';
    params.push(sensor_id);
  }

  sql += ` GROUP BY ${timeExpr}, r.sensor_id ORDER BY ts ASC`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /co2/history — historique CO2 pour graphiques
router.get('/co2/history', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const { sensor_id, interval } = req.query;
  const groupBy = interval === 'day' ? 'date' : 'hour';

  const now = new Date();
  const from = req.query.from || new Date(now.getTime() - 86400000).toISOString();
  const to   = req.query.to   || now.toISOString();

  const timeExpr = groupBy === 'date'
    ? "date(r.ts)"
    : "strftime('%Y-%m-%d %H:00:00', r.ts)";

  let sql = `
    SELECT
      ${timeExpr} AS ts,
      r.sensor_id,
      s.name AS sensor_name,
      rm.name AS room_name,
      ROUND(AVG(r.co2_ppm) + COALESCE(s.calibration_offset_ppm, 0)) AS co2_ppm
    FROM readings_co2 r
    INNER JOIN co2_sensors s ON s.id = r.sensor_id
    LEFT JOIN rooms rm ON rm.id = s.room_id
    WHERE r.campaign_id = ?
      AND r.ts >= ?
      AND r.ts <= ?
  `;
  const params = [campaignId, from, to];

  if (sensor_id) {
    sql += ' AND r.sensor_id = ?';
    params.push(sensor_id);
  }

  sql += ` GROUP BY ${timeExpr}, r.sensor_id ORDER BY ts ASC`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /power/realtime — dernières N minutes de puissance pour graphique temps reel
router.get('/power/realtime', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const minutes = Math.min(parseInt(req.query.minutes, 10) || 60, 2880);
  const since = new Date(Date.now() - minutes * 60000).toISOString();

  const rows = db.prepare(`
    SELECT r.ts, r.plug_id, p.appliance_name, r.power_w
    FROM readings_power r
    INNER JOIN plugs p ON p.id = r.plug_id
    WHERE r.campaign_id = ?
      AND r.ts >= ?
    ORDER BY r.ts ASC
  `).all(campaignId, since);

  res.json(rows);
});

module.exports = router;
