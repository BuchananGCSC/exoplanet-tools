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

  /** Warmest and coldest season at every latitude, from one seasonal run. */
  seasonalExtremes(planetType, extra = {}) {
    const s = P.latProfileSeasonal(Object.assign({ planetType }, extra));
    const warm = [], cold = [];
    s.lats.forEach((_, i) => {
      let mx = -Infinity, mn = Infinity;
      s.monthsRaw.forEach((row) => { mx = Math.max(mx, row[i]); mn = Math.min(mn, row[i]); });
      warm.push(mx); cold.push(mn);
    });
    return { lats: s.lats, warm, cold };
  },

  /** Climate zone key at one latitude. */
  climateZoneAt(planetType, latDeg) {
    const { lats, warm, cold } = derived.seasonalExtremes(planetType);
    return P.climateZones(lats, warm, cold).keys[idx(latDeg)];
  },

  /** Area-weighted share of the surface in a zone that thaws and does not cook. */
  climateHabitableFraction(planetType, extra = {}) {
    const { lats, warm, cold } = derived.seasonalExtremes(planetType, extra);
    return P.climateZones(lats, warm, cold).habitableFraction;
  },

  /** Number of distinct zone bands, a proxy for how varied the planet is. */
  climateBandCount(planetType) {
    const { lats, warm, cold } = derived.seasonalExtremes(planetType);
    return P.climateZones(lats, warm, cold).bands.length;
  },

  /** Band count for a minus band count for b. Tests a comparison, not a number. */
  climateBandCountDifference(a, b) {
    return derived.climateBandCount(a) - derived.climateBandCount(b);
  },

  /** Planetary albedo of a surface under a cloud deck. */
  cloudPlanetaryAlbedo(surfaceAlbedo, cloudFraction) {
    return P.cloudyAlbedos(surfaceAlbedo, cloudFraction).planetary;
  },

  /** Shortwave cloud radiative effect, W/m^2. Negative means cooling. */
  cloudShortwaveEffect(surfaceAlbedo, cloudFraction) {
    const clear = P.cloudyAlbedos(surfaceAlbedo, 0).planetary;
    const cloudy = P.cloudyAlbedos(surfaceAlbedo, cloudFraction).planetary;
    return -(cloudy - clear) * P.CONSTANTS.S0_SUN / 4;
  },

  /** Net cloud radiative effect, shortwave plus longwave. */
  cloudNetEffect(surfaceAlbedo, cloudFraction) {
    return derived.cloudShortwaveEffect(surfaceAlbedo, cloudFraction)
      + P.cloudLongwave(cloudFraction);
  },

  /** Ice-albedo swing with clouds, as a fraction of the swing without. */
  iceAlbedoSwingRatio(surfaceAlbedo, cloudFraction) {
    const withC = P.cloudyAlbedos(surfaceAlbedo, cloudFraction);
    const without = P.cloudyAlbedos(surfaceAlbedo, 0);
    return (withC.ice - withC.base) / (without.ice - without.base);
  },

  /** Do a warm start and a frozen start reach different equilibria? */
  bistableAt(S0) {
    const warm = P.run0dEBM({ T0_K: 288, S0 }).equilibriumCRaw;
    const cold = P.run0dEBM({ T0_K: 215, S0 }).equilibriumCRaw;
    return Math.abs(warm - cold) > 5;
  },

  /** Pole-to-equator contrast for a Venus-like 92-bar atmosphere. */
  venusContrast() {
    const s = P.latProfileSeasonal({
      S0: P.effectiveS0(1.0, 0.723), pressureBar: 92, co2ppm: 400, dayHours: 24,
    });
    return s.annualMeanC[45] - s.annualMeanC[90];
  },

  /** Substellar minus antistellar temperature for a locked Proxima b. */
  lockedDayNightContrast() {
    const r = P.tidallyLockedProfile({ S0: P.effectiveS0(0.122, 0.0485) });
    return r.tempsCRaw[r.tempsCRaw.length - 1] - r.tempsCRaw[0];
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
