/**
 * beaba -- api/export.js
 * Export des donnees brutes d'une campagne (CSV ZIP ou JSON).
 */

'use strict';
const { Router } = require('express');
const archiver = require('archiver');
const { getDb } = require('../db');

const router = Router();

/**
 * Convertit un tableau d'objets en CSV.
 */
function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(';')];
  for (const row of rows) {
    lines.push(
      headers.map(h => {
        const val = row[h];
        if (val == null) return '';
        const str = String(val);
        // Echapper les guillemets et entourer si necessaire
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(';')
    );
  }
  return lines.join('\n');
}

/**
 * Charge toutes les donnees brutes pour une campagne.
 */
function loadExportData(db, campaignId) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return null;

  const rooms = db.prepare(
    'SELECT id, name, color, sort_order FROM rooms WHERE campaign_id = ? ORDER BY sort_order, name'
  ).all(campaignId);

  const tempSensors = db.prepare(`
    SELECT ts.id, ts.name, ts.friendly_name, ts.comment,
      COALESCE(r.name, '') AS room_name
    FROM temp_sensors ts
    LEFT JOIN rooms r ON r.id = ts.room_id
    WHERE ts.campaign_id = ?
    ORDER BY ts.name
  `).all(campaignId);

  const plugs = db.prepare(`
    SELECT p.id, p.source, p.appliance_name, p.rated_power_w, p.sort_order,
      COALESCE(r.name, '') AS room_name
    FROM plugs p
    LEFT JOIN rooms r ON r.id = p.room_id
    WHERE p.campaign_id = ?
    ORDER BY p.sort_order
  `).all(campaignId);

  const readingsTemp = db.prepare(`
    SELECT rt.ts, rt.temperature_c, rt.humidity_pct, rt.battery_pct,
      ts.name AS sensor_name, ts.friendly_name AS sensor_friendly_name
    FROM readings_temp rt
    JOIN temp_sensors ts ON ts.id = rt.sensor_id
    WHERE rt.campaign_id = ?
    ORDER BY rt.ts
  `).all(campaignId);

  const readingsPower = db.prepare(`
    SELECT rp.ts, rp.power_w, rp.energy_kwh,
      p.appliance_name, COALESCE(r.name, '') AS room_name
    FROM readings_power rp
    JOIN plugs p ON p.id = rp.plug_id
    LEFT JOIN rooms r ON r.id = p.room_id
    WHERE rp.campaign_id = ?
    ORDER BY rp.ts
  `).all(campaignId);

  const readingsCo2 = db.prepare(`
    SELECT rc.ts, rc.co2_ppm, rc.temperature_c, rc.humidity_pct,
      cs.name AS sensor_name, cs.friendly_name AS sensor_friendly_name
    FROM readings_co2 rc
    JOIN co2_sensors cs ON cs.id = rc.sensor_id
    WHERE rc.campaign_id = ?
    ORDER BY rc.ts
  `).all(campaignId);

  return {
    campaign: [{
      id: campaign.id,
      household: campaign.household,
      address: campaign.address || '',
      start_date: campaign.start_date,
      completed_at: campaign.completed_at || '',
      expected_days: campaign.expected_days,
      status: campaign.status,
      notes: campaign.notes || '',
    }],
    rooms,
    temp_sensors: tempSensors,
    plugs,
    readings_temp: readingsTemp,
    readings_power: readingsPower,
    readings_co2: readingsCo2,
  };
}

// GET /:campaignId/csv — export ZIP de fichiers CSV
router.get('/:campaignId/csv', (req, res) => {
  const db = getDb();
  const data = loadExportData(db, req.params.campaignId);

  if (!data) {
    return res.status(404).json({ error: 'Campagne introuvable' });
  }

  const household = data.campaign[0].household.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `beaba_export_${household}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  // BOM UTF-8 pour Excel
  const bom = '\ufeff';

  archive.append(bom + toCsv(data.campaign), { name: 'campagne.csv' });
  archive.append(bom + toCsv(data.rooms), { name: 'pieces.csv' });
  archive.append(bom + toCsv(data.temp_sensors), { name: 'capteurs_temp.csv' });
  archive.append(bom + toCsv(data.plugs), { name: 'prises.csv' });
  archive.append(bom + toCsv(data.readings_temp), { name: 'releves_temperature.csv' });
  archive.append(bom + toCsv(data.readings_power), { name: 'releves_puissance.csv' });
  archive.append(bom + toCsv(data.readings_co2), { name: 'releves_co2.csv' });

  archive.finalize();
});

// GET /:campaignId/json — export JSON
router.get('/:campaignId/json', (req, res) => {
  const db = getDb();
  const data = loadExportData(db, req.params.campaignId);

  if (!data) {
    return res.status(404).json({ error: 'Campagne introuvable' });
  }

  const household = data.campaign[0].household.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `beaba_export_${household}.json`;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(data);
});

module.exports = router;
