/**
 * beaba — mqtt/shellyPlus.js
 * Poller des Shelly Plus (Gen2) qui exposent des sondes DS18B20 via l'Add-On.
 * On lit l'endpoint /rpc/Shelly.GetStatus, on cherche temperature:<channel>.tC
 * et on enregistre dans readings_pipe_temp.
 *
 * Plusieurs sondes par Shelly possibles (canaux 100, 101, 102).
 */

'use strict';
const axios = require('axios');
const { getDb, getActiveCampaign } = require('../db');

let _timer = null;

async function poll() {
  const campaign = getActiveCampaign();
  if (!campaign || campaign.status !== 'active') return;
  const db = getDb();
  const sensors = db.prepare(`
    SELECT id, shelly_ip, shelly_channel FROM pipe_sensors
    WHERE campaign_id = ? AND shelly_ip IS NOT NULL AND shelly_ip != ''
  `).all(campaign.id);

  if (!sensors.length) return;

  // Regroupe par IP pour limiter les appels HTTP.
  const byIp = new Map();
  for (const s of sensors) {
    if (!byIp.has(s.shelly_ip)) byIp.set(s.shelly_ip, []);
    byIp.get(s.shelly_ip).push(s);
  }

  for (const [ip, list] of byIp.entries()) {
    let status;
    try {
      const res = await axios.get(`http://${ip}/rpc/Shelly.GetStatus`, { timeout: 4000 });
      status = res.data || {};
    } catch (err) {
      console.warn('[ShellyPlus] Joint impossible', ip, ':', err.message);
      continue;
    }
    for (const s of list) {
      const key = `temperature:${s.shelly_channel}`;
      const block = status[key];
      const tC = block?.tC;
      if (typeof tC !== 'number' || !Number.isFinite(tC)) continue;
      db.prepare(`
        INSERT INTO readings_pipe_temp (sensor_id, campaign_id, temperature_c)
        VALUES (?, ?, ?)
      `).run(s.id, campaign.id, +tC.toFixed(2));
    }
  }
}

function start() {
  const interval = (parseInt(process.env.SHELLY_PIPE_POLL_S, 10) || 20) * 1000;
  poll().catch((e) => console.error('[ShellyPlus] poll error', e.message));
  _timer = setInterval(() => {
    poll().catch((e) => console.error('[ShellyPlus] poll error', e.message));
  }, interval);
  console.log(`[ShellyPlus] Polling demarre — intervalle ${interval / 1000}s`);
}

function stop() {
  if (_timer) clearInterval(_timer);
}

module.exports = { start, stop };
