/**
 * beaba — api/plugs.js
 * CRUD prises, scopees par campagne active.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// GET / — toutes les prises de la campagne active
router.get('/', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM plugs WHERE campaign_id = ?').all(req.campaign.id));
});

// POST / — creer une prise
router.post('/', (req, res) => {
  const { id, room_id, source, zigbee_id, shelly_channel, appliance_name, rated_power_w } = req.body;
  if (!id || !source || !appliance_name) {
    return res.status(400).json({ error: 'id, source, appliance_name requis' });
  }
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO plugs (id, campaign_id, room_id, source, zigbee_id, shelly_channel, appliance_name, rated_power_w)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, req.campaign.id, room_id || null, source, zigbee_id || null, shelly_channel ?? null, appliance_name, rated_power_w || null);
  res.status(201).json({ ok: true });
});

// PUT /:id — modifier une prise
router.put('/:id', (req, res) => {
  const { room_id, appliance_name, rated_power_w, sort_order } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE plugs SET
      room_id        = COALESCE(?, room_id),
      appliance_name = COALESCE(?, appliance_name),
      rated_power_w  = COALESCE(?, rated_power_w),
      sort_order     = COALESCE(?, sort_order)
    WHERE id = ? AND campaign_id = ?
  `).run(room_id, appliance_name, rated_power_w, sort_order, req.params.id, req.campaign.id);
  res.json({ ok: true });
});

// DELETE /:id — supprimer une prise
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM plugs WHERE id = ? AND campaign_id = ?').run(req.params.id, req.campaign.id);
  res.json({ ok: true });
});

module.exports = router;
