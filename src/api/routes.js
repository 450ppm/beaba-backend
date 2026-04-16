/**
 * beaba — api/routes.js
 * Routeur principal — monte les sous-routeurs.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');
const { requireActiveCampaign } = require('./middleware');

const campaign     = require('./campaign');
const rooms        = require('./rooms');
const plugs        = require('./plugs');
const sensors      = require('./sensors');
const readings     = require('./readings');
const zigbee       = require('./zigbee');
const report       = require('./report');
const exportRouter = require('./export');
const meters       = require('./meters');

const router = Router();

// ── Sous-routeurs ────────────────────────────────────────────────────

router.use('/campaign', campaign);
router.use('/rooms',    requireActiveCampaign, rooms);
router.use('/plugs',    requireActiveCampaign, plugs);
router.use('/sensors',  requireActiveCampaign, sensors);
router.use('/readings', requireActiveCampaign, readings);
router.use('/meters',   requireActiveCampaign, meters);
router.use('/zigbee',   zigbee);
router.use('/report',  report);
router.use('/export',  exportRouter);

// ── Cartographie consolidee (garde sa place ici) ─────────────────────

router.get('/map', requireActiveCampaign, (req, res) => {
  const db = getDb();
  const campaignId = req.campaign.id;

  const roomsList = db.prepare(
    'SELECT * FROM rooms WHERE campaign_id = ? ORDER BY sort_order, name'
  ).all(campaignId);

  const latestPower = db.prepare(`
    SELECT r.plug_id, r.power_w, r.ts
    FROM readings_power r
    WHERE r.campaign_id = ?
      AND r.ts = (SELECT MAX(r2.ts) FROM readings_power r2 WHERE r2.plug_id = r.plug_id)
  `).all(campaignId);

  const powerMap = Object.fromEntries(latestPower.map((r) => [r.plug_id, r]));

  const plugsList = db.prepare('SELECT * FROM plugs WHERE campaign_id = ?').all(campaignId);

  const latestCo2 = db.prepare(`
    SELECT s.room_id, c.co2_ppm, c.temperature_c, c.humidity_pct, c.ts
    FROM readings_co2 c
    INNER JOIN co2_sensors s ON s.id = c.sensor_id
    WHERE c.campaign_id = ?
      AND c.ts = (SELECT MAX(c2.ts) FROM readings_co2 c2 WHERE c2.sensor_id = c.sensor_id)
  `).all(campaignId);

  const co2Map = Object.fromEntries(latestCo2.map((r) => [r.room_id, r]));

  const result = roomsList.map((room) => {
    const roomPlugs = plugsList
      .filter((p) => p.room_id === room.id)
      .map((p) => ({
        ...p,
        power_w:   powerMap[p.id]?.power_w ?? 0,
        last_seen: powerMap[p.id]?.ts       ?? null,
      }));

    return {
      ...room,
      plugs:   roomPlugs,
      total_w: roomPlugs.reduce((s, p) => s + p.power_w, 0),
      co2:     co2Map[room.id] ?? null,
    };
  });

  res.json(result);
});

module.exports = router;
