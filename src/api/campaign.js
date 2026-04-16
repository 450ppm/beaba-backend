/**
 * beaba — api/campaign.js
 * CRUD campagnes + wipe complet.
 */

'use strict';
const { Router } = require('express');
const crypto = require('crypto');
const { getDb, getActiveCampaign } = require('../db');
const { runMigration } = require('../db/migrate');

const router = Router();

// GET / — campagne active (ou 404)
router.get('/', (req, res) => {
  const campaign = getActiveCampaign();
  if (!campaign) return res.status(404).json({ error: 'Aucune campagne active' });
  res.json(campaign);
});

// POST / — creer une campagne
router.post('/', (req, res) => {
  const { household, address, start_date, expected_days, notes, kit_id } = req.body;
  if (!household || !start_date) {
    return res.status(400).json({ error: 'household et start_date requis' });
  }

  const db = getDb();

  // Verifier qu'aucune campagne non-completed n'existe
  const existing = db.prepare("SELECT id FROM campaigns WHERE status IN ('setup','active')").get();
  if (existing) {
    return res.status(409).json({ error: 'Une campagne non terminee existe deja', campaign_id: existing.id });
  }

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO campaigns (id, kit_id, household, address, start_date, expected_days, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, kit_id || 'beaba_001', household, address || null, start_date, expected_days || 30, notes || null);

  res.status(201).json({ id });
});

// PUT /:id — modifier les champs d'une campagne
router.put('/:id', (req, res) => {
  const { household, address, notes, expected_days } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE campaigns SET
      household     = COALESCE(?, household),
      address       = COALESCE(?, address),
      notes         = COALESCE(?, notes),
      expected_days = COALESCE(?, expected_days)
    WHERE id = ?
  `).run(household, address, notes, expected_days, req.params.id);
  res.json({ ok: true });
});

// POST /:id/activate — passer en status='active'
router.post('/:id/activate', (req, res) => {
  const db = getDb();
  const campaignId = req.params.id;

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
  if (campaign.status === 'completed') return res.status(400).json({ error: 'Campagne deja terminee' });

  // Verifier qu'au moins 1 room existe
  const roomCount = db.prepare('SELECT COUNT(*) AS cnt FROM rooms WHERE campaign_id = ?').get(campaignId);
  if (roomCount.cnt === 0) {
    return res.status(400).json({ error: 'Au moins une piece est requise avant activation' });
  }

  db.prepare("UPDATE campaigns SET status = 'active' WHERE id = ?").run(campaignId);
  res.json({ ok: true });
});

// POST /:id/complete — terminer une campagne
router.post('/:id/complete', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE campaigns SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// POST /wipe — tout supprimer et recreer le schema
router.post('/wipe', (req, res) => {
  const db = getDb();
  const tables = [
    'readings_temp', 'readings_co2', 'readings_power',
    'plugs', 'temp_sensors', 'co2_sensors', 'rooms', 'campaigns'
  ];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) {
    db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  db.exec('PRAGMA foreign_keys = ON');

  runMigration(db);
  res.json({ ok: true, message: 'Base videe et schema recree' });
});

module.exports = router;
