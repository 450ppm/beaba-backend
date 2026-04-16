/**
 * beaba — mqtt/shelly.js
 * Interroge l'API locale Shelly EM via HTTP.
 * La Shelly EM expose /status avec emeters[0] et emeters[1].
 * Un cron tourne toutes les SHELLY_POLL_INTERVAL_S secondes.
 */

'use strict';
const axios = require('axios');
const { getDb, getActiveCampaign } = require('../db');

let _timer = null;

async function poll() {
  const ip = process.env.SHELLY_EM_IP;
  if (!ip) return;

  // Verifier qu'une campagne active existe
  const campaign = getActiveCampaign();
  if (!campaign || campaign.status !== 'active') return;

  const db = getDb();
  const campaignId = campaign.id;

  let status;
  try {
    const res = await axios.get(`http://${ip}/status`, { timeout: 5000 });
    status = res.data;
  } catch (err) {
    console.warn('[Shelly] Impossible de joindre', ip, ':', err.message);
    return;
  }

  const emeters = status?.emeters;
  if (!Array.isArray(emeters)) return;

  emeters.forEach((em, channel) => {
    const plug = db.prepare(
      "SELECT id FROM plugs WHERE shelly_channel = ? AND campaign_id = ? AND source = 'shelly_em'"
    ).get(channel, campaignId);
    if (!plug) return;

    const power = em.power ?? 0;
    const energy = em.total ?? null;
    const energy_kwh = energy != null ? +(energy / 60000).toFixed(4) : null;

    db.prepare(`
      INSERT INTO readings_power (plug_id, campaign_id, power_w, energy_kwh)
      VALUES (?, ?, ?, ?)
    `).run(plug.id, campaignId, power, energy_kwh);
  });
}

function start() {
  const interval = (parseInt(process.env.SHELLY_POLL_INTERVAL_S, 10) || 30) * 1000;
  poll();
  _timer = setInterval(poll, interval);
  console.log(`[Shelly] Polling demarre — intervalle ${interval / 1000}s`);
}

function stop() {
  if (_timer) clearInterval(_timer);
}

module.exports = { start, stop };
