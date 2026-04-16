/**
 * beaba — api/middleware.js
 * Middleware Express pour injecter la campagne active dans req.campaign.
 */

'use strict';
const { getActiveCampaign } = require('../db');

function requireActiveCampaign(req, res, next) {
  const campaign = getActiveCampaign();
  if (!campaign) return res.status(409).json({ error: 'Aucune campagne active' });
  req.campaign = campaign;
  next();
}

module.exports = { requireActiveCampaign };
