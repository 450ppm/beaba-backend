/**
 * beaba — api/zigbee.js
 * Expose la liste des devices zigbee2mqtt via le subscriber MQTT.
 */

'use strict';
const { Router } = require('express');
const { getDevices, requestDevices } = require('../mqtt/subscriber');

const router = Router();

// GET /devices — liste des devices zigbee2mqtt (cache)
router.get('/devices', (req, res) => {
  res.json(getDevices());
});

// POST /devices/refresh — demander une mise a jour de la liste
router.post('/devices/refresh', (req, res) => {
  requestDevices();
  res.json({ ok: true, message: 'Demande envoyee' });
});

module.exports = router;
