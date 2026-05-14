/**
 * beaba — api/routes.js
 * Routeur principal — monte les sous-routeurs.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');
const { requireAuth, requireAdmin, requireActiveCampaign } = require('./middleware');

const auth         = require('./auth');
const users        = require('./users');
const campaign     = require('./campaign');
const rooms        = require('./rooms');
const plugs        = require('./plugs');
const sensors      = require('./sensors');
const readings     = require('./readings');
const zigbee       = require('./zigbee');
const report       = require('./report');
const exportRouter = require('./export');
const meters       = require('./meters');
const comfort      = require('./comfort');
const weather      = require('./weather');
const pipe         = require('./pipe');

const router = Router();

// ── Auth (public) ────────────────────────────────────────────────────

router.use('/auth', auth);

// ── Users (admin seulement) ──────────────────────────────────────────

router.use('/users', requireAuth, requireAdmin, users);

// ── Sous-routeurs (authentifies) ─────────────────────────────────────

router.use('/campaign', requireAuth, campaign);
router.use('/rooms',    requireAuth, requireActiveCampaign, rooms);
router.use('/plugs',    requireAuth, requireActiveCampaign, plugs);
router.use('/sensors',  requireAuth, requireActiveCampaign, sensors);
router.use('/readings', requireAuth, requireActiveCampaign, readings);
router.use('/meters',   requireAuth, requireActiveCampaign, meters);
router.use('/comfort',  requireAuth, requireActiveCampaign, comfort);
router.use('/weather',  requireAuth, weather);
router.use('/pipe',     requireAuth, requireActiveCampaign, pipe);
router.use('/zigbee',   requireAuth, zigbee);
router.use('/report',   requireAuth, report);
router.use('/export',   requireAuth, exportRouter);

// ── Cartographie consolidee (garde sa place ici) ─────────────────────

router.get('/map', requireAuth, requireActiveCampaign, (req, res) => {
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
