/* =====================================================================
 * test/harness.js
 *
 * Some things worth testing are not single function calls: energy
 * conservation, hemispheric symmetry, round-trip consistency. Those get
 * named derived quantities here, so test_cases.json stays a flat list of
 * "call this, expect that" and stays readable by a Python notebook.
 *
 * A Python implementation validating itself against test_cases.json
 * needs to define the same names. Each one is a few lines.
 * ===================================================================== */

const P = require('../physics.js');

// Grid index for a latitude. The grid runs -90 to +90 in 2-degree steps,
// so only even latitudes exist; anything else is snapped to the nearest.
const idx = (latDeg) => Math.round((latDeg + 90) / 2);

const derived = {
  /** Peak-to-trough seasonal temperature range at 46 N, in degC. */
  seasonalAmplitudeAt45N(planetType) {
    const s = P.latProfileSeasonal({ planetType });
    return s.solsticeC[idx(46)] - s.winterSolsticeC[idx(46)];
  },

  /**
   * Area-weighted mean of the tidally locked insolation pattern,
   * divided by S0. Must be 0.25: a sphere intercepts pi*r^2 of a beam
   * and radiates from 4*pi*r^2, locked or not.
   */
  tidalLockedMeanInsolationFraction() {
    const angles = P.latitudeGrid();
    const Q = angles.map((a) => (a > 0 ? Math.sin(a * Math.PI / 180) : 0));
    return P.areaWeightedMean(angles, Q);
  },

  keplerPeriod(aAU, starMass) {
    return P.kepler.period(aAU, starMass);
  },

  /** Largest fractional error from solving forward then backward. */
  keplerRoundTripError() {
    let worst = 0;
    for (const a of [0.05, 0.1, 0.5, 1.0, 5.2, 30.0]) {
      for (const M of [0.089, 0.5, 1.0, 2.0]) {
        const back = P.kepler.semiMajorAxis(P.kepler.period(a, M), M);
        worst = Math.max(worst, Math.abs(back - a) / a);
      }
    }
    return worst;
  },

  planetRadiusEarth(massEarth, density) {
    return P.planetaryProperties(massEarth, density).radiusEarth;
  },

  planetGravityEarth(massEarth, density) {
    return P.planetaryProperties(massEarth, density).gravityEarth;
  },

  densityPreset(name) {
    return P.DENSITY_PRESETS[name];
  },

  magneticLabel(massEarth, ageGyr, locked) {
    return P.magneticFieldEstimate(massEarth, ageGyr, locked).label;
  },

  dailyMeanInsolation(S0, decl, lat) {
    return P.dailyMeanInsolation(S0, decl, lat);
  },

  /** Daily-mean insolation at the summer pole minus that at the equator. */
  solsticePolarMinusEquator(S0, obliquityDeg) {
    return P.dailyMeanInsolation(S0, obliquityDeg, 90) - P.dailyMeanInsolation(S0, obliquityDeg, 0);
  },

  /**
   * Mean absolute north-south difference in solstice insolation, in
   * W/m^2. Zero at zero obliquity; large at a real solstice.
   */
  hemisphereAsymmetry(obliquityDeg) {
    const lats = P.latitudeGrid();
    let sum = 0, n = 0;
    for (const lat of lats) {
      if (lat <= 0) continue;
      const north = P.dailyMeanInsolation(P.CONSTANTS.S0_SUN, obliquityDeg, lat);
      const south = P.dailyMeanInsolation(P.CONSTANTS.S0_SUN, obliquityDeg, -lat);
      sum += Math.abs(north - south);
      n++;
    }
    return sum / n;
  },
};

/** Resolve a function name from test_cases.json against physics or the derived table. */
function resolve(name) {
  if (typeof derived[name] === 'function') return derived[name];
  if (typeof P[name] === 'function') return P[name];
  throw new Error('test_cases.json refers to unknown function: ' + name);
}

/** Walk a dotted path into a returned value. */
function pluck(value, path) {
  if (!path) return value;
  return path.split('.').reduce((acc, key) => {
    if (acc === undefined || acc === null) throw new Error('path ' + path + ' ran off the end');
    return acc[/^\d+$/.test(key) ? Number(key) : key];
  }, value);
}

module.exports = { P, derived, resolve, pluck, idx };
