/**
 * beaba — lib/weather.js
 * Client Open-Meteo (gratuit, sans cle) avec cache memoire 1h.
 *
 * Coordonnees par defaut : Bruxelles (50.85, 4.35). Toutes les campagnes
 * actuelles sont en region bruxelloise — on hardcode pour eviter une
 * geocoding step et un schema migration. A configurer si extension nationale.
 */

'use strict';
const axios = require('axios');

const DEFAULT_LAT = 50.85;
const DEFAULT_LON = 4.35;
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache = null; // { ts, lat, lon, data }

async function fetchCurrent(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  const now = Date.now();
  if (
    cache &&
    cache.lat === lat &&
    cache.lon === lon &&
    now - cache.ts < CACHE_TTL_MS
  ) {
    return cache.data;
  }

  const url = 'https://api.open-meteo.com/v1/forecast';
  const params = {
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
    timezone: 'Europe/Brussels',
  };

  try {
    const res = await axios.get(url, { params, timeout: 8000 });
    const c = res.data?.current || {};
    const data = {
      source: 'open-meteo',
      lat,
      lon,
      ts: c.time || new Date().toISOString(),
      temperature_c: typeof c.temperature_2m === 'number' ? c.temperature_2m : null,
      humidity_pct: typeof c.relative_humidity_2m === 'number' ? c.relative_humidity_2m : null,
      wind_speed_m_s: typeof c.wind_speed_10m === 'number' ? c.wind_speed_10m : null,
      weather_code: c.weather_code ?? null,
    };
    cache = { ts: now, lat, lon, data };
    return data;
  } catch (err) {
    // Si on a un cache obsolete on prefere le rendre plutot que rien
    if (cache && cache.lat === lat && cache.lon === lon) {
      return { ...cache.data, stale: true, error: String(err.message || err) };
    }
    throw err;
  }
}

module.exports = { fetchCurrent, DEFAULT_LAT, DEFAULT_LON };
