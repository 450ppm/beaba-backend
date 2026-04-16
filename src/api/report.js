/**
 * beaba -- api/report.js
 * Endpoint pour generer le rapport d'une campagne.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');
const { generateReport } = require('../report/generator');

const router = Router();

// GET /:campaignId — rapport complet
router.get('/:campaignId', (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.campaignId);

  if (!campaign) {
    return res.status(404).json({ error: 'Campagne introuvable' });
  }

  const report = generateReport(req.params.campaignId);
  if (!report) {
    return res.status(500).json({ error: 'Erreur lors de la generation du rapport' });
  }

  res.json(report);
});

module.exports = router;
