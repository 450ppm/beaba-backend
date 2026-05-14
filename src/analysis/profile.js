/**
 * beaba — analysis/profile.js
 * Heuristique d'identification d'appareil(s) a partir des releves de puissance.
 *
 * analyzePlug(db, plugId, campaignId) renvoie :
 *   {
 *     confidence: 0..100,
 *     stats: { avg_w, max_w, min_w, p10_w, p50_w, p90_w, stdev_w,
 *              pct_active, cycle_freq, sample_count } | null,
 *     suggestions: [{category, label, confidence, hint?}, ...],
 *     is_likely_multi: boolean,
 *     message?: string,
 *   }
 */

'use strict';

function analyzePlug(db, plugId, campaignId) {
  const readings = db.prepare(`
    SELECT ts, power_w FROM readings_power
    WHERE plug_id = ? AND campaign_id = ?
      AND ts >= datetime('now', '-7 days')
    ORDER BY ts ASC
  `).all(plugId, campaignId);

  if (readings.length < 10) {
    return {
      confidence: 0,
      message: 'Pas assez de donnees (au moins 7 jours necessaires)',
      stats: null,
      suggestions: [],
      is_likely_multi: false,
    };
  }

  // Stats de base
  const powers = readings.map((r) => r.power_w);
  const avg = powers.reduce((a, b) => a + b, 0) / powers.length;
  const max = Math.max(...powers);
  const min = Math.min(...powers);
  const pctActive = powers.filter((p) => p > 5).length / powers.length;

  // Percentiles
  const sorted = [...powers].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];

  // Variance / ecart-type
  const variance = powers.reduce((s, p) => s + (p - avg) ** 2, 0) / powers.length;
  const stdev = Math.sqrt(variance);

  // Detection de cycles (transitions au-dessus / en-dessous de la moyenne)
  let transitions = 0;
  for (let i = 1; i < powers.length; i++) {
    if ((powers[i] > avg) !== (powers[i - 1] > avg)) transitions++;
  }
  const cycleFreq = transitions / readings.length;

  const stats = {
    avg_w: Math.round(avg),
    max_w: Math.round(max),
    min_w: Math.round(min),
    p10_w: Math.round(p10),
    p50_w: Math.round(p50),
    p90_w: Math.round(p90),
    stdev_w: Math.round(stdev),
    pct_active: Math.round(pctActive * 100),
    cycle_freq: Math.round(cycleFreq * 1000) / 1000,
    sample_count: readings.length,
  };

  // ── Regles heuristiques ────────────────────────────────────────────
  const suggestions = [];

  // Frigo / congelateur : cyclique, moyenne 50-200W, base basse, souvent actif
  if (p10 < 30 && p90 > 80 && p90 < 300 && cycleFreq > 0.05 && pctActive > 0.4) {
    suggestions.push({ category: 'fridge', label: 'Frigo / Congelateur', confidence: 85 });
  }

  // Appareil en veille : puissance tres faible et stable
  if (max < 30 && stdev < 5 && pctActive > 0.9) {
    suggestions.push({ category: 'standby', label: 'Appareil en veille permanente', confidence: 90 });
  }

  // Chauffage / chauffe-eau : puissance soutenue elevee
  if (p90 > 1500 && avg > 500) {
    suggestions.push({ category: 'heating', label: 'Chauffage / Chauffe-eau', confidence: 75 });
  }

  // Bouilloire / micro-ondes : pics rares et brefs
  if (max > 1500 && pctActive < 0.05 && p50 < 5) {
    suggestions.push({ category: 'kettle', label: 'Bouilloire / Micro-ondes', confidence: 70 });
  }

  // TV / ordinateur : puissance moyenne variable, partiellement actif
  if (avg > 30 && avg < 250 && stdev > 20 && pctActive > 0.2 && pctActive < 0.8) {
    suggestions.push({ category: 'tv_computer', label: 'TV / Ordinateur', confidence: 60 });
  }

  // Box internet / routeur : faible, tres stable, toujours actif
  if (avg > 5 && avg < 25 && stdev < 3 && pctActive > 0.95) {
    suggestions.push({ category: 'router', label: 'Box internet / Routeur', confidence: 80 });
  }

  // Lave-linge / lave-vaisselle : phases multiples, pics 1500-2500W, peu actif globalement
  if (max > 1500 && max < 2800 && pctActive < 0.3 && stdev > 200) {
    suggestions.push({ category: 'washer', label: 'Lave-linge / Lave-vaisselle', confidence: 65 });
  }

  // Multi-appareils probable : variance elevee + base non nulle + peu de cycles francs
  let isLikelyMulti = false;
  if (stdev > 100 && cycleFreq < 0.05 && p10 > 10) {
    isLikelyMulti = true;
    suggestions.push({
      category: 'multi',
      label: 'Plusieurs appareils probables',
      confidence: 60,
      hint: `Baseline ~${Math.round(p10)}W (toujours branche) + pics jusqu'a ${Math.round(max)}W`,
    });
  }

  // Tri par confiance et top 3
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return {
    confidence: suggestions[0]?.confidence || 0,
    stats,
    suggestions: suggestions.slice(0, 3),
    is_likely_multi: isLikelyMulti,
  };
}

module.exports = { analyzePlug };
