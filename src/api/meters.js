/**
 * beaba -- api/meters.js
 * CRUD releves compteurs (electricite, gaz, eau).
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

const VALID_TYPES = ['electricity', 'gas', 'water'];
const VALID_PHASES = ['start', 'end'];

// GET / — tous les releves de la campagne active
router.get('/', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;

  const readings = db.prepare(
    'SELECT * FROM meter_readings WHERE campaign_id = ? ORDER BY meter_type, phase'
  ).all(campaignId);

  res.json(readings);
});

// GET /status — statut de chaque releve (fait / pas fait)
router.get('/status', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;

  const readings = db.prepare(
    'SELECT meter_type, phase FROM meter_readings WHERE campaign_id = ?'
  ).all(campaignId);

  const status = {};
  for (const type of VALID_TYPES) {
    for (const phase of VALID_PHASES) {
      status[`${type}_${phase}`] = readings.some(
        r => r.meter_type === type && r.phase === phase
      );
    }
  }

  res.json(status);
});

// POST / — creer ou mettre a jour un releve
router.post('/', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;
  const { meter_type, phase, value, unit, notes } = req.body;

  if (!meter_type || !phase || value == null || !unit) {
    return res.status(400).json({ error: 'meter_type, phase, value et unit requis' });
  }

  if (!VALID_TYPES.includes(meter_type)) {
    return res.status(400).json({ error: `meter_type invalide. Valeurs acceptees : ${VALID_TYPES.join(', ')}` });
  }

  if (!VALID_PHASES.includes(phase)) {
    return res.status(400).json({ error: `phase invalide. Valeurs acceptees : ${VALID_PHASES.join(', ')}` });
  }

  if (typeof value !== 'number' || value < 0) {
    return res.status(400).json({ error: 'value doit etre un nombre positif' });
  }

  db.prepare(`
    INSERT INTO meter_readings (campaign_id, meter_type, phase, value, unit, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(campaign_id, meter_type, phase)
    DO UPDATE SET value = excluded.value, unit = excluded.unit, notes = excluded.notes, recorded_at = datetime('now')
  `).run(campaignId, meter_type, phase, value, unit, notes || null);

  res.json({ ok: true });
});

module.exports = router;
