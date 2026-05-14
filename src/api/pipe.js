/**
 * beaba — api/pipe.js
 * Capteurs sur tuyaux/cuves : CRUD + lectures + analyse cycles.
 * Scope par campagne active.
 */

'use strict';
const { Router } = require('express');
const { randomUUID } = require('crypto');
const { getDb } = require('../db');
const { detectCycles, analyzeCycles, analyzeDhw } = require('../analysis/cycles');

const router = Router();

// ── CRUD capteurs ────────────────────────────────────────────────────

router.get('/sensors', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM pipe_sensors WHERE campaign_id = ? ORDER BY sort_order, name'
  ).all(req.campaign.id);
  res.json(rows);
});

router.post('/sensors', (req, res) => {
  const { name, kind, shelly_ip, shelly_channel, color, baseline_c } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const validKinds = ['boiler_out', 'boiler_return', 'dhw_tank', 'radiator'];
  const k = validKinds.includes(kind) ? kind : 'boiler_out';
  const id = `pipe-${randomUUID().slice(0, 8)}`;
  const db = getDb();
  db.prepare(`
    INSERT INTO pipe_sensors (id, campaign_id, name, kind, shelly_ip, shelly_channel, color, baseline_c)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    id, req.campaign.id, name, k,
    shelly_ip || null,
    shelly_channel ?? 100,
    color || '#f59e0b',
    baseline_c ?? 30,
  );
  res.status(201).json({ ok: true, id });
});

router.put('/sensors/:id', (req, res) => {
  const { name, kind, shelly_ip, shelly_channel, color, baseline_c } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE pipe_sensors SET
      name           = COALESCE(?, name),
      kind           = COALESCE(?, kind),
      shelly_ip      = COALESCE(?, shelly_ip),
      shelly_channel = COALESCE(?, shelly_channel),
      color          = COALESCE(?, color),
      baseline_c     = COALESCE(?, baseline_c)
    WHERE id = ? AND campaign_id = ?
  `).run(
    name ?? null,
    kind ?? null,
    shelly_ip ?? null,
    shelly_channel ?? null,
    color ?? null,
    baseline_c ?? null,
    req.params.id, req.campaign.id,
  );
  res.json({ ok: true });
});

router.delete('/sensors/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM readings_pipe_temp WHERE sensor_id = ?').run(req.params.id);
  db.prepare('DELETE FROM pipe_sensors WHERE id = ? AND campaign_id = ?').run(req.params.id, req.campaign.id);
  res.json({ ok: true });
});

// ── Lectures brutes ─────────────────────────────────────────────────

// GET /readings/:id?from=ISO&to=ISO  (par defaut : dernieres 24h)
router.get('/readings/:id', (req, res) => {
  const db = getDb();
  const now = new Date();
  const from = req.query.from || new Date(now.getTime() - 86400000).toISOString();
  const to = req.query.to || now.toISOString();
  const rows = db.prepare(`
    SELECT ts, temperature_c
    FROM readings_pipe_temp
    WHERE sensor_id = ? AND campaign_id = ? AND ts BETWEEN ? AND ?
    ORDER BY ts ASC
  `).all(req.params.id, req.campaign.id, from, to);
  res.json(rows);
});

// GET /cycles/:id?from=&to= — cycles detectes (sans heuristiques)
router.get('/cycles/:id', (req, res) => {
  const db = getDb();
  const now = new Date();
  const from = req.query.from || new Date(now.getTime() - 86400000).toISOString();
  const to = req.query.to || now.toISOString();
  const rows = db.prepare(`
    SELECT ts, temperature_c
    FROM readings_pipe_temp
    WHERE sensor_id = ? AND campaign_id = ? AND ts BETWEEN ? AND ?
    ORDER BY ts ASC
  `).all(req.params.id, req.campaign.id, from, to);
  res.json(detectCycles(rows));
});

// GET /analysis/:id?from=&to= — cycles + heuristiques. Branche par kind du capteur :
//   - boiler_out / boiler_return / radiator -> heuristiques chauffage + correlation pieces
//   - dhw_tank                              -> heuristiques ECS (pertes au repos, soutirages)
router.get('/analysis/:id', (req, res) => {
  const db = getDb();
  const sensor = db.prepare(
    'SELECT * FROM pipe_sensors WHERE id = ? AND campaign_id = ?'
  ).get(req.params.id, req.campaign.id);
  if (!sensor) return res.status(404).json({ error: 'Capteur introuvable' });

  const now = new Date();
  const from = req.query.from || new Date(now.getTime() - 86400000).toISOString();
  const to = req.query.to || now.toISOString();

  const samples = db.prepare(`
    SELECT ts, temperature_c
    FROM readings_pipe_temp
    WHERE sensor_id = ? AND campaign_id = ? AND ts BETWEEN ? AND ?
    ORDER BY ts ASC
  `).all(req.params.id, req.campaign.id, from, to);

  const cycles = detectCycles(samples);

  let analysis;
  if (sensor.kind === 'dhw_tank') {
    analysis = analyzeDhw(samples, cycles);
  } else {
    const roomTemps = db.prepare(`
      SELECT t.ts, t.temperature_c, s.room_id
      FROM readings_temp t
      INNER JOIN temp_sensors s ON s.id = t.sensor_id
      WHERE t.campaign_id = ? AND t.ts BETWEEN ? AND ?
      ORDER BY t.ts ASC
    `).all(req.campaign.id, from, to);
    analysis = analyzeCycles(cycles, roomTemps);
  }

  res.json({
    from, to,
    sensor: {
      id: sensor.id, name: sensor.name, kind: sensor.kind, color: sensor.color,
    },
    sample_count: samples.length,
    samples_first_ts: samples[0]?.ts || null,
    samples_last_ts: samples[samples.length - 1]?.ts || null,
    cycles,
    analysis,
  });
});

module.exports = router;
