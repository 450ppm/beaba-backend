/**
 * beaba — api/rooms.js
 * CRUD pieces, scopees par campagne active.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// GET / — lister les pieces de la campagne active (avec plugs)
router.get('/', (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;

  const rooms = db.prepare(
    'SELECT * FROM rooms WHERE campaign_id = ? ORDER BY sort_order, name'
  ).all(campaignId);

  const plugs = db.prepare(
    'SELECT * FROM plugs WHERE campaign_id = ? ORDER BY sort_order, appliance_name'
  ).all(campaignId);

  const result = rooms.map((r) => ({
    ...r,
    plugs: plugs.filter((p) => p.room_id === r.id),
  }));
  res.json(result);
});

// POST / — creer une piece
router.post('/', (req, res) => {
  const { name, color, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });

  const db = getDb();
  const campaignId = req.campaign.id;
  const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

  db.prepare(
    'INSERT INTO rooms (id, campaign_id, name, color, sort_order) VALUES (?,?,?,?,?)'
  ).run(id, campaignId, name, color || '#888780', sort_order || 0);
  res.status(201).json({ id });
});

// PUT /:id — modifier une piece
router.put('/:id', (req, res) => {
  const { name, color, sort_order } = req.body;
  const db = getDb();
  db.prepare(
    'UPDATE rooms SET name=COALESCE(?,name), color=COALESCE(?,color), sort_order=COALESCE(?,sort_order) WHERE id=? AND campaign_id=?'
  ).run(name, color, sort_order, req.params.id, req.campaign.id);
  res.json({ ok: true });
});

// DELETE /:id — supprimer une piece
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM rooms WHERE id = ? AND campaign_id = ?').run(req.params.id, req.campaign.id);
  res.json({ ok: true });
});

module.exports = router;
