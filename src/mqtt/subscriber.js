/**
 * beaba — mqtt/subscriber.js
 * S'abonne a zigbee2mqtt et insere les releves en SQLite.
 *
 * Topics ecoutes :
 *   zigbee2mqtt/<friendly_name>  →  SNZB-02P, Innr, Heiman HS3AQ
 *   zigbee2mqtt/bridge/state     →  sante du bridge
 *   zigbee2mqtt/bridge/devices   →  liste des devices (discovery)
 */

'use strict';
const mqtt = require('mqtt');
const { getDb, getActiveCampaign } = require('../db');

let client = null;
let _activeCampaign = null;
let _campaignCheckTimer = null;
let _deviceList = [];

// ── Accesseurs device discovery ──────────────────────────────────────

function getDevices() {
  return _deviceList;
}

function requestDevices() {
  if (client && client.connected) {
    client.publish('zigbee2mqtt/bridge/request/devices', '');
  }
}

// ── Handlers par type de capteur ─────────────────────────────────────

function handleTempSensor(db, sensorId, campaignId, payload) {
  const { temperature, humidity, battery } = payload;
  if (temperature == null || humidity == null) return;

  db.prepare(`
    INSERT INTO readings_temp (sensor_id, campaign_id, temperature_c, humidity_pct, battery_pct)
    VALUES (?, ?, ?, ?, ?)
  `).run(sensorId, campaignId, temperature, humidity, battery ?? null);
}

function handleCo2Sensor(db, sensorId, campaignId, payload) {
  const { co2, temperature, humidity } = payload;
  if (co2 == null) return;

  db.prepare(`
    INSERT INTO readings_co2 (sensor_id, campaign_id, co2_ppm, temperature_c, humidity_pct)
    VALUES (?, ?, ?, ?, ?)
  `).run(sensorId, campaignId, co2, temperature ?? null, humidity ?? null);
}

function handlePlug(db, plugId, campaignId, payload) {
  const { power, energy } = payload;
  if (power == null) return;

  db.prepare(`
    INSERT INTO readings_power (plug_id, campaign_id, power_w, energy_kwh)
    VALUES (?, ?, ?, ?)
  `).run(plugId, campaignId, power, energy ?? null);
}

// ── Routage par friendly_name ─────────────────────────────────────────

function route(db, friendlyName, payload, campaignId) {
  // Capteurs temperature
  const tempSensor = db.prepare(
    'SELECT id FROM temp_sensors WHERE friendly_name = ? AND campaign_id = ?'
  ).get(friendlyName, campaignId);
  if (tempSensor) return handleTempSensor(db, tempSensor.id, campaignId, payload);

  // Capteur CO2
  const co2Sensor = db.prepare(
    'SELECT id FROM co2_sensors WHERE friendly_name = ? AND campaign_id = ?'
  ).get(friendlyName, campaignId);
  if (co2Sensor) return handleCo2Sensor(db, co2Sensor.id, campaignId, payload);

  // Prises Innr
  const plug = db.prepare(
    "SELECT id FROM plugs WHERE zigbee_id = ? AND campaign_id = ? AND source = 'innr'"
  ).get(friendlyName, campaignId);
  if (plug) return handlePlug(db, plug.id, campaignId, payload);
}

// ── Demarrage du subscriber ───────────────────────────────────────────

function start() {
  const db = getDb();
  const brokerUrl = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

  // Charger la campagne active au demarrage
  _activeCampaign = getActiveCampaign();

  // Re-verifier periodiquement (toutes les 30s) si une campagne est devenue active
  _campaignCheckTimer = setInterval(() => {
    _activeCampaign = getActiveCampaign();
  }, 30_000);

  const opts = {};
  if (process.env.MQTT_USERNAME) opts.username = process.env.MQTT_USERNAME;
  if (process.env.MQTT_PASSWORD) opts.password = process.env.MQTT_PASSWORD;

  client = mqtt.connect(brokerUrl, opts);

  client.on('connect', () => {
    console.log(`[MQTT] Connecte a ${brokerUrl}`);
    client.subscribe('zigbee2mqtt/#', (err) => {
      if (err) console.error('[MQTT] Erreur subscribe :', err.message);
      else console.log('[MQTT] Abonne a zigbee2mqtt/#');
    });
  });

  client.on('message', (topic, raw) => {
    // Bridge state
    if (topic === 'zigbee2mqtt/bridge/state') {
      console.log('[MQTT] Bridge :', raw.toString());
      return;
    }

    // Device discovery
    if (topic === 'zigbee2mqtt/bridge/devices') {
      try {
        _deviceList = JSON.parse(raw.toString());
        console.log(`[MQTT] Device list mise a jour : ${_deviceList.length} devices`);
      } catch { /* ignore */ }
      return;
    }

    // Ignore les autres topics bridge
    if (topic.startsWith('zigbee2mqtt/bridge/')) return;

    // Pas de campagne active → on ne stocke rien
    if (!_activeCampaign || _activeCampaign.status !== 'active') return;

    const friendlyName = topic.replace('zigbee2mqtt/', '');

    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }

    try {
      route(db, friendlyName, payload, _activeCampaign.id);
    } catch (err) {
      console.error(`[MQTT] Erreur route ${friendlyName} :`, err.message);
    }
  });

  client.on('error', (err) => {
    console.error('[MQTT] Erreur client :', err.message);
  });

  client.on('offline', () => {
    console.warn('[MQTT] Client offline — tentative de reconnexion...');
  });
}

function stop() {
  if (_campaignCheckTimer) clearInterval(_campaignCheckTimer);
  if (client) client.end();
}

function getClient() { return client; }

module.exports = { start, stop, getClient, getDevices, requestDevices };
