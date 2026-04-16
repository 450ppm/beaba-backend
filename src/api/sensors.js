/**
 * beaba — api/sensors.js
 * CRUD capteurs temperature et CO2, scopes par campagne active.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// ── Capteurs temperature ─────────────────────────────────────────────

// GET /temp — lister les capteurs temp de la campagne active
router.get('/temp', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM temp_sensors WHERE campaign_id = ?').all(req.campaign.id));
});

// POST /temp — creer un capteur temp
router.post('/temp', (req, res) => {
  const { id, friendly_name, name, room_id, comment } = req.body;
  if (!id || !friendly_name || !name) {
    return res.status(400).json({ error: 'id, friendly_name, name requis' });
  }
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO temp_sensors (id, campaign_id, room_id, name, friendly_name, comment)
    VALUES (?,?,?,?,?,?)
  `).run(id, req.campaign.id, room_id || null, name, friendly_name, comment || null);
  res.status(201).json({ ok: true });
});

// PUT /temp/:id — modifier un capteur temp
router.put('/temp/:id', (req, res) => {
  const { room_id, name, comment } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE temp_sensors SET
      room_id = COALESCE(?, room_id),
      name    = COALESCE(?, name),
      comment = COALESCE(?, comment)
    WHERE id = ? AND campaign_id = ?
  `).run(room_id, name, comment, req.params.id, req.campaign.id);
  res.json({ ok: true });
});

// DELETE /temp/:id — supprimer un capteur temp
router.delete('/temp/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM temp_sensors WHERE id = ? AND campaign_id = ?').run(req.params.id, req.campaign.id);
  res.json({ ok: true });
});

// ── Capteurs CO2 ─────────────────────────────────────────────────────

// GET /co2 — lister les capteurs CO2 de la campagne active
router.get('/co2', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM co2_sensors WHERE campaign_id = ?').all(req.campaign.id));
});

// POST /co2 — creer un capteur CO2
router.post('/co2', (req, res) => {
  const { id, friendly_name, name, room_id, comment } = req.body;
  if (!id || !friendly_name || !name) {
    return res.status(400).json({ error: 'id, friendly_name, name requis' });
  }
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO co2_sensors (id, campaign_id, room_id, name, friendly_name, comment)
    VALUES (?,?,?,?,?,?)
  `).run(id, req.campaign.id, room_id || null, name, friendly_name, comment || null);
  res.status(201).json({ ok: true });
});

// PUT /co2/:id — modifier un capteur CO2
router.put('/co2/:id', (req, res) => {
  const { room_id, name, comment } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE co2_sensors SET
      room_id = COALESCE(?, room_id),
      name    = COALESCE(?, name),
      comment = COALESCE(?, comment)
    WHERE id = ? AND campaign_id = ?
  `).run(room_id, name, comment, req.params.id, req.campaign.id);
  res.json({ ok: true });
});

// DELETE /co2/:id — supprimer un capteur CO2
router.delete('/co2/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM co2_sensors WHERE id = ? AND campaign_id = ?').run(req.params.id, req.campaign.id);
  res.json({ ok: true });
});

module.exports = router;
