/**
 * beaba — api/readings.js
 * Endpoints de lecture des releves, scopes par campagne active.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// GET /temp — dernier releve de chaque capteur temp
router.get('/temp', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const rows = db.prepare(`
    SELECT t.*, s.name AS sensor_name, s.room_id
    FROM readings_temp t
    INNER JOIN temp_sensors s ON s.id = t.sensor_id
    WHERE t.campaign_id = ?
      AND t.ts = (
        SELECT MAX(t2.ts) FROM readings_temp t2 WHERE t2.sensor_id = t.sensor_id
      )
    ORDER BY s.room_id
  `).all(campaignId);
  res.json(rows);
});

// GET /co2 — dernier releve CO2
router.get('/co2', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const rows = db.prepare(`
    SELECT c.*, s.name AS sensor_name, s.room_id
    FROM readings_co2 c
    INNER JOIN co2_sensors s ON s.id = c.sensor_id
    WHERE c.campaign_id = ?
      AND c.ts = (SELECT MAX(c2.ts) FROM readings_co2 c2 WHERE c2.sensor_id = c.sensor_id)
  `).all(campaignId);
  res.json(rows);
});

// GET /power — puissance instantanee par prise
router.get('/power', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const rows = db.prepare(`
    SELECT r.*, p.appliance_name, p.room_id, p.source
    FROM readings_power r
    INNER JOIN plugs p ON p.id = r.plug_id
    WHERE r.campaign_id = ?
      AND r.ts = (SELECT MAX(r2.ts) FROM readings_power r2 WHERE r2.plug_id = r.plug_id)
    ORDER BY r.power_w DESC
  `).all(campaignId);
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

module.exports = router;
