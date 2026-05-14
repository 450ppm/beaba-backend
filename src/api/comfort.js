/**
 * beaba — api/comfort.js
 * Expose le modele de confort (constantes, formules) et evalue chaque piece
 * a partir des derniers releves temp/humidite + meteo exterieure courante.
 */

'use strict';
const { Router } = require('express');
const { getDb } = require('../db');
const { COMFORT_CONFIG, evaluateRoom, dewPointC, wallSurfaceTempC, adjustOutdoor } = require('../lib/comfort');
const weather = require('../lib/weather');

const router = Router();

// GET /config — constantes + formules pour la page d'explication frontend
router.get('/config', (_req, res) => {
  res.json({
    wall: {
      description: COMFORT_CONFIG.wall.description,
      thickness_m: COMFORT_CONFIG.wall.thickness_m,
      conductivity_w_per_mk: COMFORT_CONFIG.wall.conductivity_w_per_mk,
      r_wall_m2k_per_w: COMFORT_CONFIG.wall.r_wall_m2k_per_w,
      rsi_m2k_per_w: COMFORT_CONFIG.wall.rsi_m2k_per_w,
      rse_m2k_per_w: COMFORT_CONFIG.wall.rse_m2k_per_w,
      r_total_m2k_per_w: COMFORT_CONFIG.wall.r_total_m2k_per_w,
      f_rsi: COMFORT_CONFIG.wall.f_rsi,
    },
    outdoor: { ...COMFORT_CONFIG.outdoor },
    temperature: { ...COMFORT_CONFIG.temperature },
    humidity: { ...COMFORT_CONFIG.humidity },
    condensation: { ...COMFORT_CONFIG.condensation },
    formulas: {
      wall_surface: 'T_si = T_int - (T_int - T_ext_adj) * f_Rsi',
      dew_point_magnus:
        'alpha = ln(RH/100) + 17.27 * T / (237.7 + T) ; T_d = 237.7 * alpha / (17.27 - alpha)',
      outdoor_adjustment: `T_ext_adj = T_ext - ${COMFORT_CONFIG.outdoor.wind_safety_c}`,
    },
  });
});

// GET /current — meteo + evaluation par piece a partir des derniers releves
router.get('/current', async (req, res) => {
  let outdoor;
  try {
    outdoor = await weather.fetchCurrent();
  } catch (err) {
    return res.status(502).json({ error: 'Meteo indisponible', detail: String(err.message || err) });
  }

  const db = getDb();
  const campaignId = req.campaign.id;

  // Derniere temp/humidite par capteur, joint au capteur pour la room
  const tempRows = db.prepare(`
    SELECT t.sensor_id, t.ts, t.temperature_c, t.humidity_pct, s.room_id, s.name AS sensor_name
    FROM readings_temp t
    INNER JOIN temp_sensors s ON s.id = t.sensor_id
    WHERE t.campaign_id = ?
      AND t.id = (SELECT t2.id FROM readings_temp t2 WHERE t2.sensor_id = t.sensor_id ORDER BY t2.ts DESC LIMIT 1)
  `).all(campaignId);

  // Moyenne par piece
  const byRoom = new Map();
  for (const r of tempRows) {
    if (!r.room_id) continue;
    if (!byRoom.has(r.room_id)) byRoom.set(r.room_id, { temps: [], hums: [], ts: r.ts });
    const acc = byRoom.get(r.room_id);
    if (r.temperature_c != null) acc.temps.push(r.temperature_c);
    if (r.humidity_pct != null) acc.hums.push(r.humidity_pct);
    if (r.ts && r.ts > acc.ts) acc.ts = r.ts;
  }

  const rooms = db.prepare('SELECT * FROM rooms WHERE campaign_id = ?').all(campaignId);
  const evaluations = rooms.map((room) => {
    const data = byRoom.get(room.id);
    const tIntC = data && data.temps.length
      ? data.temps.reduce((s, v) => s + v, 0) / data.temps.length
      : null;
    const rhPct = data && data.hums.length
      ? data.hums.reduce((s, v) => s + v, 0) / data.hums.length
      : null;
    const ts = data?.ts || null;

    if (tIntC == null || rhPct == null) {
      return {
        room_id: room.id,
        room_name: room.name,
        ts,
        evaluation: null,
      };
    }
    return {
      room_id: room.id,
      room_name: room.name,
      ts,
      evaluation: evaluateRoom({
        tIntC,
        rhPct,
        tExtRawC: outdoor.temperature_c,
      }),
    };
  });

  res.json({
    outdoor: {
      ...outdoor,
      temperature_adjusted_c: adjustOutdoor(outdoor.temperature_c),
    },
    rooms: evaluations,
  });
});

// GET /simulate?t_int=20&rh=55&t_ext=5 — simulateur pour la page d'explication
router.get('/simulate', (req, res) => {
  const tIntC = parseFloat(req.query.t_int);
  const rhPct = parseFloat(req.query.rh);
  const tExtRawC = parseFloat(req.query.t_ext);
  if (!Number.isFinite(tIntC) || !Number.isFinite(rhPct) || !Number.isFinite(tExtRawC)) {
    return res.status(400).json({ error: 't_int, rh, t_ext requis (numeriques)' });
  }
  res.json({
    inputs: { t_int_c: tIntC, rh_pct: rhPct, t_ext_raw_c: tExtRawC },
    intermediate: {
      t_ext_adj_c: adjustOutdoor(tExtRawC),
      t_si_c: wallSurfaceTempC(tIntC, adjustOutdoor(tExtRawC)),
      t_dew_c: dewPointC(tIntC, rhPct),
    },
    evaluation: evaluateRoom({ tIntC, rhPct, tExtRawC }),
  });
});

module.exports = router;
