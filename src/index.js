/**
 * beaba — index.js
 * Point d'entree. Demarre :
 *   - Le subscriber MQTT (zigbee2mqtt)
 *   - Le poller Shelly EM
 *   - Le cron de sync vers InfluxDB
 *   - L'API REST Express
 */

'use strict';
require('dotenv').config();

const path         = require('path');
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const cron     = require('node-cron');
const mqtt     = require('./mqtt/subscriber');
const poller   = require('./mqtt/poller');
const shelly   = require('./mqtt/shelly');
const { run: syncInflux } = require('./sync/influx');
const { getActiveCampaign } = require('./db');
const routes   = require('./api/routes');

// ── Express ───────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/api', routes);

// ── Frontend statique ────────────────────────────────────────────────
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/health', (req, res) => {
  const campaign = getActiveCampaign();
  res.json({
    status: 'ok',
    campaign: campaign ? {
      id: campaign.id,
      household: campaign.household,
      status: campaign.status,
      kit_id: campaign.kit_id,
    } : null,
    ts: new Date().toISOString(),
  });
});

// ── Demarrage des services ────────────────────────────────────────────

mqtt.start();
// Lancer le poller actif apres connexion MQTT (delai 3s)
setTimeout(() => {
  const mqttClient = mqtt.getClient();
  if (mqttClient) poller.start(mqttClient);
}, 3000);
shelly.start();

// Sync InfluxDB — toutes les SYNC_INTERVAL_MIN minutes
const syncMin = parseInt(process.env.SYNC_INTERVAL_MIN, 10) || 5;
cron.schedule(`*/${syncMin} * * * *`, () => {
  syncInflux().catch((err) => console.error('[Cron sync]', err.message));
});
console.log(`[Sync] Cron configure — toutes les ${syncMin} min`);

const port = parseInt(process.env.API_PORT, 10) || 3000;
app.listen(port, '0.0.0.0', () => {
  const campaign = getActiveCampaign();
  console.log(`[API] Beaba backend demarre sur :${port}`);
  console.log(`[API] Campagne active : ${campaign ? `${campaign.household} (${campaign.id})` : 'aucune'}`);
});

// ── Arret propre ──────────────────────────────────────────────────────

process.on('SIGTERM', () => { mqtt.stop(); poller.stop(); shelly.stop(); process.exit(0); });
process.on('SIGINT',  () => { mqtt.stop(); poller.stop(); shelly.stop(); process.exit(0); });
