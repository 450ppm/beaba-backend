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

/**
 * Donnees historiques (jusqu'a ~5 jours de retard reel, sinon ERA5 reanalyse
 * avec ~2 jours de latence). Open-Meteo Archive — gratuit, sans cle.
 *
 * @param {string} fromDate YYYY-MM-DD
 * @param {string} toDate   YYYY-MM-DD
 * @param {object} opts     { interval: 'hourly' | 'daily', lat, lon }
 */
async function fetchHistorical(fromDate, toDate, opts = {}) {
  const lat = opts.lat ?? DEFAULT_LAT;
  const lon = opts.lon ?? DEFAULT_LON;
  const interval = opts.interval === 'daily' ? 'daily' : 'hourly';

  const url = 'https://archive-api.open-meteo.com/v1/archive';
  const params = {
    latitude: lat,
    longitude: lon,
    start_date: fromDate,
    end_date: toDate,
    timezone: 'Europe/Brussels',
  };
  if (interval === 'hourly') {
    params.hourly = 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation';
  } else {
    params.daily = 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_sum';
  }

  const res = await axios.get(url, { params, timeout: 12000 });
  return {
    source: 'open-meteo-archive',
    lat,
    lon,
    from: fromDate,
    to: toDate,
    interval,
    series: interval === 'hourly' ? res.data?.hourly : res.data?.daily,
  };
}

/**
 * CO2 atmospherique global (Mauna Loa, NOAA). Source : global-warming.org
 * qui republie les valeurs NOAA en JSON simple, sans cle. Cache 24h car
 * les valeurs evoluent de quelques dixiemes de ppm par mois.
 *
 * Si l'API est indisponible, on retourne une derniere valeur connue
 * raisonnable pour 2026 (~426 ppm) afin que la carte reste affichable.
 */
const PARIS_THRESHOLD_PPM = 450;
const PREINDUSTRIAL_PPM = 280;
let _co2Cache = null; // { ts, data }

// Convertit un enregistrement {year, month, day} en timestamp ms (UTC).
function recordTs(r) {
  if (!r || !r.year || !r.month) return null;
  return Date.UTC(parseInt(r.year, 10), parseInt(r.month, 10) - 1, parseInt(r.day || 1, 10));
}

async function fetchAtmosphericCo2() {
  const now = Date.now();
  if (_co2Cache && now - _co2Cache.ts < 24 * 60 * 60 * 1000) {
    return _co2Cache.data;
  }
  const fallback = {
    ppm: 426.5,
    annual_increase_ppm: 2.5,
    years_to_threshold: (PARIS_THRESHOLD_PPM - 426.5) / 2.5,
    source: 'fallback',
    sample_date: null,
    threshold_ppm: PARIS_THRESHOLD_PPM,
    preindustrial_ppm: PREINDUSTRIAL_PPM,
  };
  try {
    const res = await axios.get('https://global-warming.org/api/co2-api', { timeout: 6000 });
    const list = res.data?.co2 || [];
    // On prend la valeur "trend" (desaisonnalisee) la plus recente.
    const recent = list.slice(-30).reverse().find((r) => r && r.trend != null);
    if (!recent) throw new Error('Pas de valeur recente');
    const ppm = parseFloat(recent.trend);
    if (!Number.isFinite(ppm) || ppm < 300 || ppm > 700) throw new Error(`ppm aberrant: ${recent.trend}`);

    // Calcule le taux annuel d'augmentation a partir d'un point ~12 mois plus tot.
    // On cherche l'enregistrement le plus proche de (recent - 12 mois).
    const recentTs = recordTs(recent);
    const targetTs = recentTs ? recentTs - 365.25 * 86400000 : null;
    let annual = null;
    if (targetTs) {
      let best = null;
      let bestDelta = Infinity;
      for (const r of list) {
        if (!r || r.trend == null) continue;
        const ts = recordTs(r);
        if (!ts) continue;
        const delta = Math.abs(ts - targetTs);
        if (delta < bestDelta) { best = r; bestDelta = delta; }
      }
      if (best && bestDelta < 60 * 86400000) {
        const olderPpm = parseFloat(best.trend);
        const olderTs = recordTs(best);
        const yearsElapsed = (recentTs - olderTs) / (365.25 * 86400000);
        if (yearsElapsed > 0.5 && Number.isFinite(olderPpm)) {
          annual = (ppm - olderPpm) / yearsElapsed;
        }
      }
    }
    const annualIncrease = Number.isFinite(annual) && annual > 0 ? annual : 2.5; // fallback rate

    const years = annualIncrease > 0 ? (PARIS_THRESHOLD_PPM - ppm) / annualIncrease : null;

    const data = {
      ppm,
      annual_increase_ppm: annualIncrease,
      years_to_threshold: years,
      source: 'noaa-mauna-loa',
      sample_date: `${recent.year}-${String(recent.month).padStart(2, '0')}-${String(recent.day || 1).padStart(2, '0')}`,
      threshold_ppm: PARIS_THRESHOLD_PPM,
      preindustrial_ppm: PREINDUSTRIAL_PPM,
    };
    _co2Cache = { ts: now, data };
    return data;
  } catch (err) {
    if (_co2Cache) return { ...(_co2Cache.data), stale: true };
    return { ...fallback, error: String(err.message || err) };
  }
}

module.exports = { fetchCurrent, fetchHistorical, fetchAtmosphericCo2, DEFAULT_LAT, DEFAULT_LON };
