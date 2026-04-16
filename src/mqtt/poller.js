/**
 * beaba — mqtt/poller.js
 * Polling actif des prises Innr et capteurs temp via MQTT get.
 * Demande les valeurs regulierement pour eviter les trous de donnees.
 */

'use strict';
const { getDb, getActiveCampaign } = require('../db');

let _timer = null;

function start(mqttClient) {
  const interval = 30000; // 30 secondes

  function poll() {
    const campaign = getActiveCampaign();
    if (!campaign || campaign.status !== 'active' || !mqttClient) return;

    const db = getDb();

    // Poll les prises Innr
    const plugs = db.prepare("SELECT zigbee_id FROM plugs WHERE campaign_id = ? AND source = 'innr'").all(campaign.id);
    plugs.forEach((p) => {
      if (p.zigbee_id) {
        mqttClient.publish(`zigbee2mqtt/${p.zigbee_id}/get`, JSON.stringify({ power: '', energy: '', state: '' }));
      }
    });

    // Poll les capteurs temp
    const sensors = db.prepare('SELECT friendly_name FROM temp_sensors WHERE campaign_id = ?').all(campaign.id);
    sensors.forEach((s) => {
      if (s.friendly_name) {
        mqttClient.publish(`zigbee2mqtt/${s.friendly_name}/get`, JSON.stringify({ temperature: '', humidity: '' }));
      }
    });
  }

  // Premier poll apres 5 secondes
  setTimeout(poll, 5000);
  _timer = setInterval(poll, interval);
  console.log(`[Poller] Polling actif des capteurs — toutes les ${interval / 1000}s`);
}

function stop() {
  if (_timer) clearInterval(_timer);
}

module.exports = { start, stop };
