/**
 * beaba — api/weather.js
 * Expose la meteo : courante (cache 1h) et historique (archive Open-Meteo).
 */

'use strict';
const { Router } = require('express');
const weather = require('../lib/weather');

const router = Router();

// GET /current — meteo du moment (Bruxelles par defaut)
router.get('/current', async (_req, res) => {
  try {
    const data = await weather.fetchCurrent();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Meteo indisponible', detail: String(err.message || err) });
  }
});

// GET /co2_atmospheric — concentration globale (Mauna Loa NOAA)
router.get('/co2_atmospheric', async (_req, res) => {
  try {
    const data = await weather.fetchAtmosphericCo2();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'CO2 atmospherique indisponible', detail: String(err.message || err) });
  }
});

// GET /history?from=YYYY-MM-DD&to=YYYY-MM-DD&interval=hourly|daily
// Renvoie la serie temporelle exterieure pour correlation avec les releves.
router.get('/history', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from et to (YYYY-MM-DD) requis' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'format date attendu YYYY-MM-DD' });
  }
  try {
    const interval = req.query.interval === 'daily' ? 'daily' : 'hourly';
    const data = await weather.fetchHistorical(from, to, { interval });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Archive meteo indisponible', detail: String(err.message || err) });
  }
});

module.exports = router;
