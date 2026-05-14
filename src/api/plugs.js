/**
 * beaba — api/plugs.js
 * CRUD prises + appareils (plug_appliances) + profilage heuristique,
 * scopes par campagne active.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');
const { analyzePlug } = require('../analysis/profile');

const router = Router();

// ── Prises ────────────────────────────────────────────────────────────

// GET / — toutes les prises de la campagne active
router.get('/', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM plugs WHERE campaign_id = ?').all(req.campaign.id));
});

// POST / — creer une prise
router.post('/', (req, res) => {
  const {
    id,
    room_id,
    source,
    zigbee_id,
    shelly_channel,
    appliance_name,
    rated_power_w,
    is_multiprise,
  } = req.body;
  if (!id || !source || !appliance_name) {
    return res.status(400).json({ error: 'id, source, appliance_name requis' });
  }
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO plugs
      (id, campaign_id, room_id, source, zigbee_id, shelly_channel, appliance_name, rated_power_w, is_multiprise)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    req.campaign.id,
    room_id || null,
    source,
    zigbee_id || null,
    shelly_channel ?? null,
    appliance_name,
    rated_power_w || null,
    is_multiprise ? 1 : 0,
  );
  res.status(201).json({ ok: true });
});

// PUT /:id — modifier une prise
router.put('/:id', (req, res) => {
  const { room_id, appliance_name, rated_power_w, sort_order, is_multiprise } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE plugs SET
      room_id        = COALESCE(?, room_id),
      appliance_name = COALESCE(?, appliance_name),
      rated_power_w  = COALESCE(?, rated_power_w),
      sort_order     = COALESCE(?, sort_order),
      is_multiprise  = COALESCE(?, is_multiprise)
    WHERE id = ? AND campaign_id = ?
  `).run(
    room_id,
    appliance_name,
    rated_power_w,
    sort_order,
    typeof is_multiprise === 'boolean' ? (is_multiprise ? 1 : 0) : null,
    req.params.id,
    req.campaign.id,
  );
  res.json({ ok: true });
});

// DELETE /:id — supprimer une prise (cascade sur plug_appliances)
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM plug_appliances WHERE plug_id = ?').run(req.params.id);
  db.prepare('DELETE FROM plugs WHERE id = ? AND campaign_id = ?').run(req.params.id, req.campaign.id);
  res.json({ ok: true });
});

// ── Appareils branches sur une prise ─────────────────────────────────

// Verifie que la prise appartient bien a la campagne courante.
function getPlugOr404(req, res) {
  const db = getDb();
  const plug = db.prepare(
    'SELECT * FROM plugs WHERE id = ? AND campaign_id = ?'
  ).get(req.params.id, req.campaign.id);
  if (!plug) {
    res.status(404).json({ error: 'Prise introuvable' });
    return null;
  }
  return plug;
}

// GET /:id/appliances — liste des appareils
router.get('/:id/appliances', (req, res) => {
  if (!getPlugOr404(req, res)) return;
  const db = getDb();
  const items = db.prepare(`
    SELECT * FROM plug_appliances
    WHERE plug_id = ?
    ORDER BY sort_order, id
  `).all(req.params.id);
  res.json(items);
});

// POST /:id/appliances — ajouter un appareil
router.post('/:id/appliances', (req, res) => {
  if (!getPlugOr404(req, res)) return;
  const { name, category, rated_power_w, always_on, control_type, sort_order } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name requis' });
  }
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO plug_appliances
      (plug_id, name, category, rated_power_w, always_on, control_type, sort_order)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    req.params.id,
    name.trim(),
    category || null,
    rated_power_w || null,
    always_on ? 1 : 0,
    control_type || null,
    sort_order || 0,
  );
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

// PUT /:id/appliances/:applianceId — modifier
router.put('/:id/appliances/:applianceId', (req, res) => {
  if (!getPlugOr404(req, res)) return;
  const { name, category, rated_power_w, always_on, control_type, sort_order } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE plug_appliances SET
      name          = COALESCE(?, name),
      category      = COALESCE(?, category),
      rated_power_w = COALESCE(?, rated_power_w),
      always_on     = COALESCE(?, always_on),
      control_type  = COALESCE(?, control_type),
      sort_order    = COALESCE(?, sort_order)
    WHERE id = ? AND plug_id = ?
  `).run(
    name ?? null,
    category ?? null,
    rated_power_w ?? null,
    typeof always_on === 'boolean' ? (always_on ? 1 : 0) : null,
    control_type ?? null,
    sort_order ?? null,
    req.params.applianceId,
    req.params.id,
  );
  res.json({ ok: true });
});

// DELETE /:id/appliances/:applianceId — supprimer
router.delete('/:id/appliances/:applianceId', (req, res) => {
  if (!getPlugOr404(req, res)) return;
  const db = getDb();
  db.prepare(
    'DELETE FROM plug_appliances WHERE id = ? AND plug_id = ?'
  ).run(req.params.applianceId, req.params.id);
  res.json({ ok: true });
});

// ── Profilage heuristique ────────────────────────────────────────────

// GET /:id/profile — analyse heuristique des 7 derniers jours
router.get('/:id/profile', (req, res) => {
  if (!getPlugOr404(req, res)) return;
  const db = getDb();
  try {
    const profile = analyzePlug(db, req.params.id, req.campaign.id);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Erreur analyse', detail: String(err.message || err) });
  }
});

module.exports = router;
