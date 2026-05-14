/**
 * beaba — analysis/cycles.js
 * Detection des cycles de chauffe a partir d'une serie de temperature
 * mesuree sur le tuyau de depart d'une chaudiere (ou la cuve d'un ECS).
 *
 * Demarche :
 *  1. Lissage de la serie (moyenne glissante) pour absorber le bruit.
 *  2. Calcul de la pente locale dT/dt (en °C/min).
 *  3. State machine BASELINE -> RISING -> PEAK -> FALLING -> BASELINE.
 *  4. A chaque transition complete on emet un cycle avec ses metriques.
 *
 * Heuristiques expose les :
 *  - Surchauffe  : cycles emis alors qu'une piece est deja chaude.
 *  - Sous-dim    : cycles courts a frequence elevee.
 */

'use strict';

const DEFAULT_OPTS = Object.freeze({
  smoothingWindowMin: 2,     // lissage : fenetre en minutes
  riseRateCPerMin: 0.5,      // seuil de pente pour declencher RISING
  fallRateCPerMin: -0.3,     // seuil de pente pour declencher FALLING
  flatRateCPerMin: 0.08,     // |dT/dt| en dessous : plateau / baseline
  minDeltaC: 4,              // amplitude minimale (peak - base) pour valider un cycle
  baselineCool: 0.6,         // tolerance (°C) pour considerer qu'on est revenu a baseline
  minCycleDurationMin: 2,    // ignore les "faux" cycles plus courts
  flatHoldMin: 1.5,          // plateau confirme apres flatHoldMin minutes a plat
});

/**
 * Detecte les cycles dans une serie.
 * @param {Array<{ts:string, temperature_c:number}>} samples — ordonnes par ts croissant
 * @param {object} [opts]
 * @returns {Array<Cycle>}
 */
function detectCycles(samples, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (!Array.isArray(samples) || samples.length < 4) return [];

  // Index temporel + temperature
  const pts = samples
    .map((s) => ({ t: new Date(s.ts).getTime(), c: s.temperature_c }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.c))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 4) return [];

  // ── 1. Lissage : moyenne glissante sur smoothingWindowMin minutes ──
  const winMs = o.smoothingWindowMin * 60000;
  const smooth = new Array(pts.length);
  let lo = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    // ajout
    sum += pts[i].c;
    n += 1;
    // retire les points trop anciens
    while (pts[i].t - pts[lo].t > winMs) {
      sum -= pts[lo].c;
      n -= 1;
      lo += 1;
    }
    smooth[i] = sum / n;
  }

  // ── 2. Pente par minute (regression locale simple sur fenetre lissee) ──
  const slope = new Array(pts.length);
  const slopeWinMs = o.smoothingWindowMin * 60000;
  for (let i = 0; i < pts.length; i++) {
    // Trouve l'index slopeLo qui borde la fenetre glissante
    let j = i;
    while (j > 0 && pts[i].t - pts[j].t < slopeWinMs) j -= 1;
    const dt = (pts[i].t - pts[j].t) / 60000;
    slope[i] = dt > 0 ? (smooth[i] - smooth[j]) / dt : 0;
  }

  // ── 3. State machine ──────────────────────────────────────────────
  let state = 'BASELINE';
  let baseC = smooth[0];
  let flatSinceTs = pts[0].t;
  let cycle = null;
  const cycles = [];

  function emitIfValid(end) {
    if (!cycle) return;
    if (
      cycle.peak_c - cycle.base_c >= o.minDeltaC &&
      (end.t - cycle.start_t) / 60000 >= o.minCycleDurationMin
    ) {
      cycles.push({
        start_ts: new Date(cycle.start_t).toISOString(),
        end_ts: new Date(end.t).toISOString(),
        peak_ts: new Date(cycle.peak_t).toISOString(),
        base_c: round(cycle.base_c, 2),
        peak_c: round(cycle.peak_c, 2),
        delta_c: round(cycle.peak_c - cycle.base_c, 2),
        rise_duration_min: round((cycle.peak_t - cycle.start_t) / 60000, 2),
        total_duration_min: round((end.t - cycle.start_t) / 60000, 2),
      });
    }
    cycle = null;
  }

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const s = slope[i];
    const c = smooth[i];

    switch (state) {
      case 'BASELINE':
        if (s >= o.riseRateCPerMin) {
          state = 'RISING';
          cycle = { start_t: p.t, base_c: c, peak_c: c, peak_t: p.t };
        } else if (Math.abs(s) <= o.flatRateCPerMin) {
          // adaptation lente du baseline
          baseC = baseC * 0.95 + c * 0.05;
        }
        break;

      case 'RISING':
        if (c > cycle.peak_c) { cycle.peak_c = c; cycle.peak_t = p.t; }
        if (Math.abs(s) <= o.flatRateCPerMin) {
          flatSinceTs = p.t;
          state = 'PEAK';
        } else if (s <= o.fallRateCPerMin) {
          state = 'FALLING';
        }
        break;

      case 'PEAK':
        if (c > cycle.peak_c) { cycle.peak_c = c; cycle.peak_t = p.t; }
        if (s <= o.fallRateCPerMin) {
          state = 'FALLING';
        } else if (s >= o.riseRateCPerMin) {
          state = 'RISING';
          flatSinceTs = p.t;
        }
        break;

      case 'FALLING':
        if (c <= cycle.base_c + o.baselineCool) {
          emitIfValid(p);
          state = 'BASELINE';
          baseC = c;
        } else if (s >= o.riseRateCPerMin) {
          // re-acceleration en cours de descente : on bascule sur un nouveau cycle
          emitIfValid(p);
          state = 'RISING';
          cycle = { start_t: p.t, base_c: c, peak_c: c, peak_t: p.t };
        }
        break;
    }
  }
  // cycle ouvert en fin de serie : on l'emet si suffisamment avance
  if (cycle && state !== 'BASELINE') {
    emitIfValid({ t: pts[pts.length - 1].t });
  }

  return cycles;
}

/**
 * Calcule des metriques globales sur une liste de cycles + heuristiques.
 * @param {Array<Cycle>} cycles
 * @param {Array<{ts:string, room_id:string, temperature_c:number}>} roomTempSamples
 * @param {object} [opts]
 */
function analyzeCycles(cycles, roomTempSamples = [], opts = {}) {
  if (!cycles.length) {
    return {
      cycles_count: 0,
      avg_duration_min: null,
      avg_delta_c: null,
      avg_peak_c: null,
      cycles_per_hour: null,
      overheating_events: 0,
      undersizing_score: 0,
      diagnosis: ['Pas assez de cycles detectes pour analyser.'],
    };
  }

  const durations = cycles.map((c) => c.total_duration_min);
  const deltas = cycles.map((c) => c.delta_c);
  const peaks = cycles.map((c) => c.peak_c);
  const firstStart = new Date(cycles[0].start_ts).getTime();
  const lastEnd = new Date(cycles[cycles.length - 1].end_ts).getTime();
  const spanHours = Math.max(1 / 60, (lastEnd - firstStart) / 3600000);
  const perHour = cycles.length / spanHours;

  // ── Surchauffe : cycle demarre alors qu'au moins une piece etait deja chaude
  const overheatTempC = opts.overheatRoomC || 22;
  let overheating = 0;
  const overheatingCycles = [];
  if (roomTempSamples.length) {
    // Pour chaque cycle on cherche la temperature de piece la plus chaude juste avant le start
    cycles.forEach((c) => {
      const startMs = new Date(c.start_ts).getTime();
      const windowStart = startMs - 5 * 60000; // 5 min avant le demarrage
      const before = roomTempSamples.filter((r) => {
        const t = new Date(r.ts).getTime();
        return t >= windowStart && t <= startMs && r.temperature_c != null;
      });
      if (!before.length) return;
      const maxRoomT = Math.max(...before.map((r) => r.temperature_c));
      if (maxRoomT >= overheatTempC) {
        overheating += 1;
        overheatingCycles.push({ ...c, room_max_c: round(maxRoomT, 1) });
      }
    });
  }

  // ── Sous-dimensionnement : score 0..100 ────────────────────────────
  const avgDur = mean(durations);
  // Composantes : cycles/h eleve (>4), duree faible (<8min)
  const freqScore = clamp((perHour - 2) / 6, 0, 1); // 0 a 2c/h: 0 — 8c/h: 1
  const shortScore = clamp((10 - avgDur) / 8, 0, 1); // 10min: 0 — 2min: 1
  const undersizing = Math.round(freqScore * 50 + shortScore * 50);

  // ── Diagnosis (texte humain) ───────────────────────────────────────
  const diag = [];
  if (perHour >= 5) {
    diag.push(`Frequence elevee : ${perHour.toFixed(1)} cycles/heure — la chaudiere relance souvent.`);
  } else if (perHour >= 3) {
    diag.push(`Frequence moderee : ${perHour.toFixed(1)} cycles/heure.`);
  } else {
    diag.push(`Frequence basse : ${perHour.toFixed(1)} cycles/heure — cycles longs et bien espaces.`);
  }
  if (avgDur < 6) {
    diag.push(`Cycles courts (${avgDur.toFixed(1)} min en moyenne) : indice de sous-dimensionnement ou loi d'eau trop reactive.`);
  } else if (avgDur > 20) {
    diag.push(`Cycles longs (${avgDur.toFixed(1)} min en moyenne) : la chaudiere repond a une demande soutenue.`);
  }
  if (overheating > 0) {
    diag.push(`Surchauffe potentielle : ${overheating} demarrage(s) detectes alors qu'une piece etait deja ≥ ${overheatTempC}°C.`);
  }
  if (undersizing >= 70) {
    diag.push(`Score de sous-dimensionnement eleve (${undersizing}/100) — chauffe trop souvent par a-coups.`);
  } else if (undersizing >= 40) {
    diag.push(`Score de sous-dimensionnement modere (${undersizing}/100).`);
  } else {
    diag.push(`Score de sous-dimensionnement faible (${undersizing}/100) — comportement plutot sain.`);
  }

  return {
    cycles_count: cycles.length,
    avg_duration_min: round(avgDur, 1),
    avg_delta_c: round(mean(deltas), 1),
    avg_peak_c: round(mean(peaks), 1),
    cycles_per_hour: round(perHour, 2),
    overheating_events: overheating,
    overheating_cycles: overheatingCycles,
    undersizing_score: undersizing,
    diagnosis: diag,
  };
}

/* ── helpers ───────────────────────────────────────────────────────── */
function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function round(v, p = 2) { const m = Math.pow(10, p); return Math.round(v * m) / m; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

module.exports = { detectCycles, analyzeCycles, DEFAULT_OPTS };
