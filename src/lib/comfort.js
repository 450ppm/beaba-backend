/**
 * beaba — lib/comfort.js
 * Modele physique d'evaluation du confort thermo-hygrometrique.
 *
 * Hypotheses (constantes — voir COMFORT_CONFIG) :
 *   - Mur : brique pleine non isolee, epaisseur 30 cm, conductivite 0.7 W/m.K
 *   - Resistance superficielle int. Rsi = 0.13 m².K/W (paroi verticale, hiver)
 *   - Resistance superficielle ext. Rse = 0.04 m².K/W
 *   - Temperature exterieure corrigee = T_ext - 2°C (effet refroidissement vent)
 *
 * Demarche :
 *   1. Calculer la temperature de surface interieure T_si du mur a partir de
 *      la temperature interieure, exterieure corrigee, et du facteur de
 *      temperature f_Rsi = Rsi / R_total.
 *        T_si = T_int - (T_int - T_ext_corr) * f_Rsi
 *   2. Calculer le point de rosee T_d de l'air interieur (Magnus-Tetens) :
 *        alpha = ln(RH/100) + 17.27 * T / (237.7 + T)
 *        T_d   = 237.7 * alpha / (17.27 - alpha)
 *   3. Comparer T_si et T_d :
 *        - T_si <= T_d              -> CONDENSATION (eau visible sur le mur)
 *        - T_si - T_d <= +3°C       -> RISQUE MOISISSURE (norme DIN 4108-2)
 *        - sinon                    -> OK pour la paroi
 *   4. Evaluer aussi temperature et humidite seules :
 *        - T_int < 17°C             -> trop froid
 *        - RH < 30% ou RH > 60%     -> hors zone physiologique
 */

'use strict';

const COMFORT_CONFIG = Object.freeze({
  wall: {
    description: 'Mur en brique pleine non isolee de 30 cm',
    thickness_m: 0.30,
    conductivity_w_per_mk: 0.7, // lambda brique pleine
    r_wall_m2k_per_w: 0.30 / 0.7, // ≈ 0.4286
    rsi_m2k_per_w: 0.13,
    rse_m2k_per_w: 0.04,
    get r_total_m2k_per_w() {
      return this.r_wall_m2k_per_w + this.rsi_m2k_per_w + this.rse_m2k_per_w;
    },
    get f_rsi() {
      // Part du saut thermique repris par la couche limite interieure
      return this.rsi_m2k_per_w / this.r_total_m2k_per_w;
    },
  },
  outdoor: {
    wind_safety_c: 2,
    description: 'On retire 2°C a la temperature ambiante pour modeliser le refroidissement par vent',
  },
  temperature: {
    min_c: 17, // tolerance basse acceptee (au lieu de 19) sous reserve d'absence de risque condensation
    max_c: 26,
    description: 'On accepte une plage 17-26°C tant que la paroi reste au-dessus du point de rosee + 3°C',
  },
  humidity: {
    min_pct: 30, // < 30 % -> air sec, irritation muqueuses
    max_pct: 60, // > 60 % -> moisissures, acariens
    description: 'Plage physiologique : <30% irrite les muqueuses, >60% favorise moisissures et acariens',
  },
  condensation: {
    mold_margin_c: 3, // DIN 4108-2 : marge anti-moisissure
    description: 'Norme DIN 4108-2 : on considere un risque de moisissure des que la paroi est a moins de 3°C du point de rosee, meme sans condensation visible',
  },
});

/**
 * Point de rosee — Magnus-Tetens.
 * @param {number} tempC temperature de l'air (°C)
 * @param {number} rhPct humidite relative (%)
 * @returns {number} point de rosee en °C
 */
function dewPointC(tempC, rhPct) {
  if (!Number.isFinite(tempC) || !Number.isFinite(rhPct) || rhPct <= 0) return NaN;
  const a = 17.27;
  const b = 237.7;
  const alpha = Math.log(rhPct / 100) + (a * tempC) / (b + tempC);
  return (b * alpha) / (a - alpha);
}

/**
 * Temperature de surface interieure d'une paroi exterieure.
 * @param {number} tIntC temperature interieure de l'air (°C)
 * @param {number} tExtC temperature exterieure corrigee (°C)
 * @returns {number} temperature de surface interieure (°C)
 */
function wallSurfaceTempC(tIntC, tExtC) {
  if (!Number.isFinite(tIntC) || !Number.isFinite(tExtC)) return NaN;
  const f = COMFORT_CONFIG.wall.f_rsi;
  return tIntC - (tIntC - tExtC) * f;
}

/**
 * Applique la correction vent a la temperature exterieure brute.
 */
function adjustOutdoor(tExtRawC) {
  if (!Number.isFinite(tExtRawC)) return NaN;
  return tExtRawC - COMFORT_CONFIG.outdoor.wind_safety_c;
}

/**
 * Evalue le confort d'une piece.
 * @param {object} input
 * @param {number} input.tIntC      temperature interieure
 * @param {number} input.rhPct      humidite relative interieure
 * @param {number} input.tExtRawC   temperature exterieure brute (meteo)
 * @returns {object} structure detaillee
 */
function evaluateRoom({ tIntC, rhPct, tExtRawC }) {
  const tExtAdjC = adjustOutdoor(tExtRawC);
  const tSiC = wallSurfaceTempC(tIntC, tExtAdjC);
  const tDewC = dewPointC(tIntC, rhPct);
  const margin = Number.isFinite(tSiC) && Number.isFinite(tDewC) ? tSiC - tDewC : NaN;
  const moldMargin = COMFORT_CONFIG.condensation.mold_margin_c;

  const reasons = [];
  let status = 'ok'; // ok | watch | mold_risk | condensation

  // Condensation / moisissure (priorite absolue)
  if (Number.isFinite(margin)) {
    if (margin <= 0) {
      status = 'condensation';
      reasons.push({
        code: 'condensation',
        severity: 'bad',
        text: `Condensation sur le mur : surface interieure ${tSiC.toFixed(1)}°C ≤ point de rosee ${tDewC.toFixed(1)}°C`,
      });
    } else if (margin <= moldMargin) {
      status = 'mold_risk';
      reasons.push({
        code: 'mold_risk',
        severity: 'bad',
        text: `Risque de moisissure : la paroi est a ${margin.toFixed(1)}°C du point de rosee (marge minimale ${moldMargin}°C)`,
      });
    } else {
      reasons.push({
        code: 'wall_ok',
        severity: 'good',
        text: `Paroi saine : surface ${tSiC.toFixed(1)}°C, point de rosee ${tDewC.toFixed(1)}°C (marge ${margin.toFixed(1)}°C)`,
      });
    }
  }

  // Temperature
  if (Number.isFinite(tIntC)) {
    if (tIntC < COMFORT_CONFIG.temperature.min_c) {
      if (status === 'ok') status = 'watch';
      reasons.push({
        code: 'cold',
        severity: 'warn',
        text: `Trop froid : ${tIntC.toFixed(1)}°C (minimum recommande ${COMFORT_CONFIG.temperature.min_c}°C)`,
      });
    } else if (tIntC > COMFORT_CONFIG.temperature.max_c) {
      if (status === 'ok') status = 'watch';
      reasons.push({
        code: 'hot',
        severity: 'warn',
        text: `Trop chaud : ${tIntC.toFixed(1)}°C (maximum ${COMFORT_CONFIG.temperature.max_c}°C)`,
      });
    } else {
      reasons.push({
        code: 'temp_ok',
        severity: 'good',
        text: `Temperature OK : ${tIntC.toFixed(1)}°C`,
      });
    }
  }

  // Humidite (physiologique)
  if (Number.isFinite(rhPct)) {
    if (rhPct < COMFORT_CONFIG.humidity.min_pct) {
      if (status === 'ok') status = 'watch';
      reasons.push({
        code: 'dry',
        severity: 'warn',
        text: `Air trop sec : ${rhPct.toFixed(0)}% (minimum ${COMFORT_CONFIG.humidity.min_pct}%) — irritation des muqueuses`,
      });
    } else if (rhPct > COMFORT_CONFIG.humidity.max_pct) {
      if (status === 'ok') status = 'watch';
      reasons.push({
        code: 'humid',
        severity: 'warn',
        text: `Air trop humide : ${rhPct.toFixed(0)}% (maximum ${COMFORT_CONFIG.humidity.max_pct}%) — risque moisissures/acariens`,
      });
    } else {
      reasons.push({
        code: 'hum_ok',
        severity: 'good',
        text: `Humidite OK : ${rhPct.toFixed(0)}%`,
      });
    }
  }

  return {
    inputs: {
      t_int_c: tIntC,
      rh_pct: rhPct,
      t_ext_raw_c: tExtRawC,
      t_ext_adj_c: tExtAdjC,
    },
    derived: {
      t_si_c: tSiC,
      t_dew_c: tDewC,
      mold_margin_c: margin,
      f_rsi: COMFORT_CONFIG.wall.f_rsi,
    },
    status,
    reasons,
  };
}

module.exports = {
  COMFORT_CONFIG,
  dewPointC,
  wallSurfaceTempC,
  adjustOutdoor,
  evaluateRoom,
};
