/* =====================================================================
 * physics.js — Exoplanet Climate Simulator
 * Single source of truth for every physical calculation in the toolset.
 *
 * NO DOM ACCESS. NO GLOBAL STATE. Every function is pure: same inputs,
 * same outputs, always. That is what makes the test suite meaningful.
 *
 * Loading:
 *   Browser  <script src="physics.js"></script>   then use  Physics.foo()
 *            (works over file:// as well as https://, unlike ES modules)
 *   Node     const Physics = require('./physics.js');
 *
 * Every function that can fail to converge or can leave the model's
 * domain of validity returns that fact in its result object rather than
 * silently returning a number. Read the flags.
 * ===================================================================== */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Physics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ===================================================================
   * SECTION 0 — CONSTANTS
   * All tunable numbers live here so a reader can audit them in one
   * place. Values that are fitted or chosen rather than measured are
   * marked [FIT] or [CHOICE].
   * =================================================================== */

  const C = {
    // --- Solar / terrestrial reference values (measured) ---
    S0_SUN: 1361.0,        // W/m^2, total solar irradiance at 1 AU (Kopp & Lean 2011)
    TEFF_SUN: 5772.0,      // K
    M_EARTH: 5.972e24,     // kg
    R_EARTH: 6.371e6,      // m
    G_GRAV: 6.674e-11,     // m^3 kg^-1 s^-2
    G_EARTH: 9.807,        // m/s^2
    SEC_PER_YEAR: 3.1557e7,

    // --- Linearised outgoing longwave radiation: OLR = A + B*T(degC) ---
    // [FIT] Budyko/Sellers-type fit. Valid only near Earth-like
    // temperatures; see MODEL_RANGE below.
    A_OLR: 210.0,          // W/m^2
    B_OLR: 2.0,            // W/m^2/K

    // --- Greenhouse forcing ---
    A_GHG: 5.35,           // W/m^2 per e-fold CO2 (Myhre et al. 1998)
    CO2_REF: 280.0,        // ppm
    B_PRESSURE: 4.0,       // [FIT] W/m^2 per e-fold total pressure
    P_REF: 1.0,            // bar

    // --- Albedo ---
    ALPHA_ICE: 0.62,       // [CHOICE] bright ice/snow
    ICE_T_CENTER: -10.0,   // degC, midpoint of the ice transition
    ICE_T_WIDTH: 3.0,      // [CHOICE] degC, half-width of the smooth ramp

    // --- Heat capacity ---
    RHO_WATER: 1025.0,     // kg/m^3
    CP_WATER: 3994.0,      // J/kg/K
    MIXED_LAYER_M: 70.0,   // [CHOICE] default ocean mixed-layer depth

    // --- Meridional heat transport ---
    // D_rel is the dimensionless slider value the student sees.
    // D_phys = D_rel * D_SCALE, in W/m^2/K.
    D_SCALE: 2.86,         // [FIT] D_rel = 0.35 reproduces Earth's pole-equator contrast

    // --- Tidal locking ---
    TIDAL_REF_AGE_GYR: 4.5,   // age the base constant is calibrated to
    TIDAL_CONST: 0.3681,      // [FIT] AU; lock radius for a 1 Msun star, 1 Mearth planet, 4.5 Gyr
  };

  // Domain of validity for the linear-OLR model. Outside this band the
  // arithmetic still works but the physics does not: real atmospheres in
  // this regime undergo runaway greenhouse or condense out entirely.
  const MODEL_RANGE = { minC: -100, maxC: 150 };
  MODEL_RANGE.minK = MODEL_RANGE.minC + 273.15;
  MODEL_RANGE.maxK = MODEL_RANGE.maxC + 273.15;

  const clampC = (t) => Math.max(MODEL_RANGE.minC, Math.min(MODEL_RANGE.maxC, t));
  const clampK = (t) => Math.max(MODEL_RANGE.minK, Math.min(MODEL_RANGE.maxK, t));
  const outOfRangeC = (arr) => arr.some((t) => t < MODEL_RANGE.minC || t > MODEL_RANGE.maxC);

  const DEG = Math.PI / 180;

  /* ===================================================================
   * SECTION 1 — STARS
   * =================================================================== */

  // Piecewise main-sequence mass-luminosity relation.
  // The very-low-mass segment is calibrated against dynamical
  // measurements of TRAPPIST-1 (0.089 Msun, 5.22e-4 Lsun; Van Grootel
  // et al. 2018) and Proxima Centauri (0.122 Msun, 1.55e-3 Lsun),
  // because a single exponent across the whole M range overestimates
  // the luminosity of the coolest dwarfs by ~70%.
  function stellarLuminosity(mass) {
    if (mass < 0.14) return 2.20 * Math.pow(mass, 3.45);
    if (mass < 0.43) return 0.23 * Math.pow(mass, 2.3);
    if (mass < 2.0) return Math.pow(mass, 4.0);
    return 1.4 * Math.pow(mass, 3.5);
  }

  // [FIT] Main-sequence mass-radius. R = M^0.9 reproduces TRAPPIST-1
  // (0.115 vs 0.119 measured) and Proxima (0.154 vs 0.154) and is exact
  // at the Sun by construction.
  function stellarRadius(mass) {
    return Math.pow(mass, 0.9);
  }

  // Teff from the Stefan-Boltzmann law: L = 4*pi*R^2*sigma*Teff^4.
  // In solar units this reduces to Teff = Teff_sun * (L/R^2)^(1/4).
  function stellarTeff(mass) {
    const L = stellarLuminosity(mass);
    const R = stellarRadius(mass);
    return C.TEFF_SUN * Math.pow(L / (R * R), 0.25);
  }

  function stellarLifespanGyr(mass) {
    return 10.0 * Math.pow(mass, -2.5);
  }

  const SPECTRAL = [
    [16.0, 'O-type', '30,000-50,000+'],
    [2.1, 'B-type', '10,000-30,000'],
    [1.4, 'A-type', '7,500-10,000'],
    [1.04, 'F-type', '6,000-7,500'],
    [0.8, 'G-type', '5,200-6,000'],
    [0.45, 'K-type', '3,700-5,200'],
    [0.08, 'M-type', '2,400-3,700'],
    [0.0, 'Sub-stellar', '<2,400'],
  ];

  function spectralType(mass) {
    for (const [minM, sp, temp] of SPECTRAL) if (mass >= minM) return { type: sp, tempRange: temp };
    return { type: 'Unknown', tempRange: 'Unknown' };
  }

  /* ===================================================================
   * SECTION 2 — HABITABLE ZONE (Kopparapu et al. 2013, incl. erratum)
   *
   * S_eff(Teff) = S_sun + a*T + b*T^2 + c*T^3 + d*T^4,  T = Teff - 5780 K
   * Distance:  d_AU = sqrt( L / S_eff )
   *
   * NOTE ON THE PREVIOUS IMPLEMENTATION: the old code computed
   * sqrt(L)/1.10 and sqrt(L)/0.50, which is sqrt(L/1.21) and
   * sqrt(L/0.25). The outer constant implied S_eff = 0.25, well outside
   * any published limit, and gave the Sun a habitable zone reaching
   * 2.0 AU. The test suite now pins these boundaries to the published
   * solar values, so this class of drift cannot recur silently.
   *
   * !! VERIFY these coefficients against Table 3 of the paper (and the
   * 2013 erratum) before the first class period. The test suite checks
   * that they reproduce the published solar boundaries, which is a
   * strong check but not a proof that every digit is right.
   * =================================================================== */

  const HZ_COEFFS = {
    recentVenus:      { S: 1.7763, a: 1.4335e-4, b: 3.3954e-9, c: -7.6364e-12, d: -1.1950e-15 },
    runawayGreenhouse:{ S: 1.0385, a: 1.2456e-4, b: 1.4612e-8, c: -7.6345e-12, d: -1.7511e-15 },
    moistGreenhouse:  { S: 1.0146, a: 8.1884e-5, b: 1.9394e-9, c: -4.3618e-12, d: -6.8260e-16 },
    maxGreenhouse:    { S: 0.3507, a: 5.9578e-5, b: 1.6707e-9, c: -3.0058e-12, d: -5.1925e-16 },
    earlyMars:        { S: 0.3207, a: 5.4471e-5, b: 1.5275e-9, c: -2.1709e-12, d: -3.8282e-16 },
  };

  // The polynomial fit is published for 2600 K <= Teff <= 7200 K.
  const HZ_TEFF_MIN = 2600, HZ_TEFF_MAX = 7200;

  function seffAt(limitName, teff) {
    const k = HZ_COEFFS[limitName];
    if (!k) throw new Error('Unknown habitable-zone limit: ' + limitName);
    const T = Math.max(HZ_TEFF_MIN, Math.min(HZ_TEFF_MAX, teff)) - 5780;
    return k.S + k.a * T + k.b * T * T + k.c * T * T * T + k.d * T * T * T * T;
  }

  /**
   * Habitable zone boundaries.
   * @returns {{conservative:[number,number], optimistic:[number,number],
   *            teff:number, teffClamped:boolean}}  distances in AU
   */
  function habitableZone(mass) {
    const L = stellarLuminosity(mass);
    const teff = stellarTeff(mass);
    const d = (limit) => Math.sqrt(L / seffAt(limit, teff));
    return {
      conservative: [d('runawayGreenhouse'), d('maxGreenhouse')],
      optimistic: [d('recentVenus'), d('earlyMars')],
      moistGreenhouse: d('moistGreenhouse'),
      teff,
      teffClamped: teff < HZ_TEFF_MIN || teff > HZ_TEFF_MAX,
    };
  }

  /* ===================================================================
   * SECTION 3 — ORBIT, TIDAL LOCKING, DYNAMO
   * =================================================================== */

  function effectiveS0(mass, aAU) {
    return C.S0_SUN * stellarLuminosity(mass) / (aAU * aAU);
  }

  /**
   * Tidal-locking radius.
   *
   * Locking timescale goes roughly as a^6, so the lock RADIUS goes as
   * t^(1/6). The old implementation had a fixed 4.5 Gyr baked into the
   * constant while the interface offered a system-age control, so the
   * age slider moved the dynamo estimate but not the locking result.
   * Age now enters both, with the weak t^(1/6) dependence it deserves.
   *
   * The base constant folds in the usual unstated assumptions: tidal
   * quality factor Q ~ 100 and an initial rotation period of order
   * half a day. Both are guesses for any real exoplanet.
   */
  function tidalLockRadius(starMass, planetMassEarth = 1.0, ageGyr = C.TIDAL_REF_AGE_GYR) {
    const base = C.TIDAL_CONST * Math.pow(Math.pow(starMass / 0.665, 2) / planetMassEarth, 1 / 6);
    return base * Math.pow(Math.max(ageGyr, 0.01) / C.TIDAL_REF_AGE_GYR, 1 / 6);
  }

  function isTidallyLocked(starMass, aAU, planetMassEarth = 1.0, ageGyr = C.TIDAL_REF_AGE_GYR) {
    return aAU <= tidalLockRadius(starMass, planetMassEarth, ageGyr);
  }

  /**
   * Magnetic field heuristic. NOT a dynamo simulation.
   *
   * A real dynamo needs a convecting, electrically conductive core with
   * enough heat flow to sustain it. Core composition and heat budget are
   * the gating factors; rotation mainly organises an existing dynamo into
   * a coherent field rather than switching one on (Mercury rotates once
   * per 59 days and still has one). Planet mass stands in for retained
   * interior heat, system age for how long that budget has had to run
   * down, and tidal locking applies a single-level downgrade.
   *
   * CHANGED: mass is now an explicit argument. It used to be looked up
   * from the planet-type control, so choosing "Desert World" silently
   * set the planet to 0.3 Mearth and guaranteed no magnetic field, for a
   * reason no student could see, while the calculator tab let them enter
   * a completely different mass for the same planet.
   */
  function magneticFieldEstimate(planetMassEarth, ageGyr, isLocked) {
    const cutoffStrong = planetMassEarth * 6.0;
    const cutoffWeak = planetMassEarth * 10.0;
    let level = ageGyr < cutoffStrong ? 2 : (ageGyr < cutoffWeak ? 1 : 0);
    if (isLocked) level = Math.max(0, level - 1);
    return { level, label: ['None', 'Weak', 'Strong'][level] };
  }

  /* ===================================================================
   * SECTION 4 — RADIATIVE FORCING AND ALBEDO
   * =================================================================== */

  function pressureForcing(pressureBar) {
    return C.B_PRESSURE * Math.log(Math.max(pressureBar, 0.01) / C.P_REF);
  }

  /**
   * Total greenhouse forcing relative to the 280 ppm / 1 bar reference.
   *
   * CAVEAT worth stating to students: the CO2 term and the pressure term
   * are not independent. CO2 concentration in ppm at higher total
   * pressure means more CO2 molecules, so part of the pressure term is
   * double-counting the CO2 term. The split is kept because it lets the
   * two effects be varied separately, which is pedagogically useful, but
   * the sum is an approximation and not additive in reality.
   */
  function greenhouseForcing(co2ppm, pressureBar) {
    return C.A_GHG * Math.log(co2ppm / C.CO2_REF) + pressureForcing(pressureBar);
  }

  function atmosphereThicknessLabel(pressureBar) {
    if (pressureBar < 0.3) return 'Thin';
    if (pressureBar > 3.0) return 'Thick';
    return 'Moderate';
  }

  /**
   * Ice fraction as a smooth function of temperature.
   *
   * CHANGED: this used to be a hard switch (T < -10 => fully iced).
   * A hard switch makes the outer albedo iteration chatter between two
   * states near the transition instead of converging, which is exactly
   * where the ice-albedo bifurcation lives. The tanh ramp converges.
   */
  function iceFraction(tempC) {
    return 0.5 * (1 - Math.tanh((tempC - C.ICE_T_CENTER) / C.ICE_T_WIDTH));
  }

  // mixedLayerM is an EFFECTIVE depth, not a literal one. It sets the
  // thermal relaxation time tau = rho*cp*depth/B. Earth's 8 m is chosen
  // so the seasonal amplitude comes out right for a mixed land-and-ocean
  // planet; a literal 70 m ocean mixed layer gives tau ~ 4.5 years and
  // erases the seasons entirely. A dry world stores almost no heat and
  // swings hard; a waterworld barely swings at all. This is the knob
  // that makes "Desert World" mean something for seasonality.
  const PLANET_TYPES = {
    // On defaultD: the old file set 0.20 for Earth while the comment
    // beside it said 0.35 reproduces Earth's pole-equator contrast. They
    // cannot both be right. Re-tuning against the seasonal model settles
    // it in favour of the default: D_rel = 0.20 reproduces Earth's 14 degC
    // global mean and a 24 degC equator. The comment was the stale half.
    // massEarth is a REPRESENTATIVE mass, used only where the interface
    // offers no mass control of its own (currently the dynamo estimate).
    // It is here rather than in a private lookup table so that any code
    // relying on it has to name it, and so the interface can tell the
    // student what mass it assumed. The old version hid this, which meant
    // picking "Desert World" silently guaranteed no magnetic field.
    earth:  { label: 'Earth-like',        albedo: 0.30, defaultD: 0.20, mixedLayerM: 8,  massEarth: 1.0 },
    desert: { label: 'Desert World',      albedo: 0.35, defaultD: 0.08, mixedLayerM: 2,  massEarth: 0.3 },
    ocean:  { label: 'Ocean Super-Earth', albedo: 0.25, defaultD: 0.40, mixedLayerM: 40, massEarth: 3.0 },
  };

  /* ===================================================================
   * SECTION 5 — INSOLATION GEOMETRY
   * =================================================================== */

  /**
   * Daily-mean insolation at latitude phi for solar declination delta.
   *   Q = (S0/pi) * [ h0*sin(phi)*sin(delta) + cos(phi)*cos(delta)*sin(h0) ]
   * with h0 = arccos(-tan(phi)*tan(delta)), the half-day-length hour angle.
   * h0 = pi under polar day, 0 under polar night.
   */
  function dailyMeanInsolation(S0, declinationDeg, latDeg) {
    const phi = latDeg * DEG;
    const delta = declinationDeg * DEG;
    const tantan = Math.tan(phi) * Math.tan(delta);
    let h0;
    if (tantan >= 1) h0 = Math.PI;
    else if (tantan <= -1) h0 = 0;
    else h0 = Math.acos(-tantan);
    return (S0 / Math.PI) * (h0 * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(h0));
  }

  // Northern summer solstice: declination equals the obliquity.
  function solsticeInsolation(S0, obliquityDeg, latDeg) {
    return dailyMeanInsolation(S0, obliquityDeg, latDeg);
  }

  // Circular-orbit declination. Peaks at +obliquity in June (index 5)
  // and troughs in December (index 11), matching a Jan..Dec label array.
  function monthlyDeclination(obliquityDeg, monthIndex) {
    return obliquityDeg * Math.cos(2 * Math.PI * (monthIndex - 5) / 12);
  }

  /* ===================================================================
   * SECTION 6 — LINEAR SOLVER
   * =================================================================== */

  // Thomas algorithm for a tridiagonal system.
  function tridiagSolve(a, b, c, d) {
    const n = d.length;
    const cp = new Array(n), dp = new Array(n), x = new Array(n);
    cp[0] = c[0] / b[0];
    dp[0] = d[0] / b[0];
    for (let i = 1; i < n; i++) {
      const m = b[i] - a[i] * cp[i - 1];
      cp[i] = c[i] / m;
      dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
    }
    x[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
    return x;
  }

  /* ===================================================================
   * SECTION 7 — ZERO-DIMENSIONAL ENERGY BALANCE MODEL
   * =================================================================== */

  /**
   * Globally averaged EBM, integrated forward until steady state.
   * @returns {{times:number[], tempsK:number[], tempsKRaw:number[],
   *            equilibriumC:number, outOfRange:boolean}}
   */
  function run0dEBM(opts) {
    const {
      T0_K = 288, co2ppm = 280, S0 = C.S0_SUN, albedoWarm = 0.30,
      pressureBar = 1.0, years = 300, dtYears = 0.5,
      mixedLayerM = C.MIXED_LAYER_M,
    } = opts;

    const heatCapacity = C.RHO_WATER * C.CP_WATER * mixedLayerM;
    const dt = dtYears * C.SEC_PER_YEAR;
    const steps = Math.floor(years / dtYears);
    const dF = greenhouseForcing(co2ppm, pressureBar);

    let T = T0_K;
    const times = [0], raw = [T];
    for (let i = 0; i < steps; i++) {
      const f = iceFraction(T - 273.15);
      const alb = f * C.ALPHA_ICE + (1 - f) * albedoWarm;
      const asr = S0 * (1 - alb) / 4;
      const olr = C.A_OLR + C.B_OLR * (T - 273.15);
      T += dt * (asr - olr + dF) / heatCapacity;
      times.push((i + 1) * dtYears);
      raw.push(T);
    }
    return {
      times,
      tempsK: raw.map(clampK),
      tempsKRaw: raw,
      equilibriumC: clampK(T) - 273.15,
      equilibriumCRaw: T - 273.15,
      outOfRange: T < MODEL_RANGE.minK || T > MODEL_RANGE.maxK,
    };
  }

  /* ===================================================================
   * SECTION 8 — ONE-DIMENSIONAL DIFFUSIVE EBM
   *
   * B*T - D*grad^2(T) = Q*(1 - alpha) + dF - A
   *
   * Two entry points, and the difference between them matters:
   *
   *   latProfileEquilibrium()  steady-state solution for a FIXED
   *     declination. This is the temperature a latitude would reach if
   *     the sun stopped where it is and stayed there forever. Under
   *     polar day it runs away to absurd values (Earth's north pole
   *     came out at +51 degC in the previous version) because nothing
   *     in the equations remembers that summer ends. Useful as an
   *     upper bound. Labelled as such by the returned `interpretation`.
   *
   *   latProfileSeasonal()  time-stepping solution with an explicit
   *     heat capacity, marched through several annual cycles until the
   *     seasonal cycle repeats. This is what a real solstice looks
   *     like, and it is what a seasonal plot should be built from.
   * =================================================================== */

  const LAT_STEP = 2;

  function latitudeGrid(step = LAT_STEP) {
    const lats = [];
    for (let l = -90; l <= 90; l += step) lats.push(l);
    return lats;
  }

  // Build the tridiagonal diffusion operator on a spherical latitude
  // grid: (1/cos p) d/dp [ cos p dT/dp ]. Half-grid cosines at the cell
  // faces; zero-flux at both poles.
  function diffusionOperator(coords, dRel, extraDiagonal) {
    const N = coords.length;
    const step = Math.abs(coords[1] - coords[0]);
    const dx = step * DEG;
    const D = dRel * C.D_SCALE;
    const lo = new Array(N).fill(0), di = new Array(N).fill(0), up = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const cosMid = Math.max(Math.cos(coords[i] * DEG), 1e-4);
      const cosN = i < N - 1 ? Math.cos((coords[i] + step / 2) * DEG) : 0;
      const cosS = i > 0 ? Math.cos((coords[i] - step / 2) * DEG) : 0;
      const dN = D * cosN / (cosMid * dx * dx);
      const dS = D * cosS / (cosMid * dx * dx);
      lo[i] = -dS;
      up[i] = -dN;
      di[i] = extraDiagonal + dN + dS;
    }
    return { lo, di, up };
  }

  /**
   * Iterate the albedo feedback to convergence.
   *
   * CHANGED, and this was the real bug. The previous code ran exactly 8
   * outer iterations and returned iteration 8 whatever state it was in.
   * Near the snowball bifurcation the iteration converges slowly, so for
   * S0 between roughly 1100 and 1190 W/m^2 it returned a partially
   * glaciated world with a temperate midlatitude band when the converged
   * answer was a hard snowball. The error reached 24 degC, with no
   * indication to the user. That band is the outer habitable zone, which
   * is where a student exploring the model spends most of their time.
   *
   * Now: iterate to a tolerance, under-relax to damp oscillation, cap at
   * maxIter, and report whether it actually converged.
   */
  function solveWithAlbedoFeedback(coords, Q, dRel, baseAlbedo, dF, opts = {}) {
    const { tolerance = 1e-4, maxIter = 200, relaxation = 0.5, dayMask = null } = opts;
    const N = coords.length;
    const { lo, di, up } = diffusionOperator(coords, dRel, C.B_OLR);

    let frac = new Array(N).fill(0);
    let T = null, converged = false, iterations = 0;

    for (let it = 1; it <= maxIter; it++) {
      iterations = it;
      const rhs = Q.map((q, i) => {
        // On a tidally locked night side there is no sunlight, so the
        // surface albedo there is irrelevant to the energy budget.
        const f = dayMask && !dayMask[i] ? 0 : frac[i];
        const alpha = f * C.ALPHA_ICE + (1 - f) * baseAlbedo;
        return q * (1 - alpha) + dF - C.A_OLR;
      });
      T = tridiagSolve(lo, di, up, rhs);
      const target = T.map((t) => iceFraction(t));
      let maxDelta = 0;
      const next = frac.map((f, i) => {
        const v = f + relaxation * (target[i] - f);
        maxDelta = Math.max(maxDelta, Math.abs(v - f));
        return v;
      });
      frac = next;
      if (maxDelta < tolerance) { converged = true; break; }
    }

    return {
      coords,
      tempsC: T.map(clampC),
      tempsCRaw: T,
      iceFraction: frac,
      converged,
      iterations,
      outOfRange: outOfRangeC(T),
    };
  }

  /**
   * Steady-state latitude profile at a fixed declination.
   * Read the `interpretation` field before plotting this as "solstice".
   */
  function latProfileEquilibrium(opts) {
    const {
      S0 = C.S0_SUN, co2ppm = 280, obliquityDeg = 23.44, planetType = 'earth',
      dRel = null, pressureBar = 1.0, declinationDeg = null,
    } = opts;
    const type = PLANET_TYPES[planetType] || PLANET_TYPES.earth;
    const D = dRel === null ? type.defaultD : dRel;
    const decl = declinationDeg === null ? obliquityDeg : declinationDeg;
    const lats = latitudeGrid();
    const Q = lats.map((lat) => dailyMeanInsolation(S0, decl, lat));
    const out = solveWithAlbedoFeedback(lats, Q, D, type.albedo, greenhouseForcing(co2ppm, pressureBar));
    out.lats = lats;
    out.declinationDeg = decl;
    out.interpretation =
      'Instantaneous radiative-equilibrium temperature at fixed declination. ' +
      'An upper bound, not a forecast: it assumes this season lasts forever. ' +
      'Use latProfileSeasonal for temperatures a planet actually reaches.';
    return out;
  }

  /**
   * Seasonal latitude profile: implicit (backward Euler) time-stepping
   * with a real heat capacity, marched until the annual cycle repeats.
   *
   *   Cs * dT/dt = Q(t)*(1 - alpha) + dF - A - B*T + D*grad^2(T)
   *
   * Backward Euler keeps it unconditionally stable, so a monthly step is
   * fine. Heat capacity is why a polar summer tops out near freezing
   * instead of near boiling: the ocean cannot warm that fast, and it
   * spends the season melting ice rather than raising temperature.
   *
   * @returns {{lats:number[], months:number[][], annualMeanC:number[],
   *            solsticeC:number[], converged:boolean, ...}}
   *          months[m][i] is the temperature at month m, latitude i.
   */
  function latProfileSeasonal(opts) {
    const {
      S0 = C.S0_SUN, co2ppm = 280, obliquityDeg = 23.44, planetType = 'earth',
      dRel = null, pressureBar = 1.0, stepsPerYear = 24, spinUpYears = 200,
      tolerance = 0.02, mixedLayerM = null,
    } = opts;

    const type = PLANET_TYPES[planetType] || PLANET_TYPES.earth;
    const D = dRel === null ? type.defaultD : dRel;
    const depth = mixedLayerM === null ? type.mixedLayerM : mixedLayerM;
    const dF = greenhouseForcing(co2ppm, pressureBar);

    const lats = latitudeGrid();
    const N = lats.length;
    const Cs = C.RHO_WATER * C.CP_WATER * depth;          // J/m^2/K
    const dt = C.SEC_PER_YEAR / stepsPerYear;             // s
    const inertia = Cs / dt;                              // W/m^2/K

    const { lo, di, up } = diffusionOperator(lats, D, C.B_OLR + inertia);

    // Precompute insolation for each step of the year.
    const Qyear = [];
    for (let s = 0; s < stepsPerYear; s++) {
      const decl = obliquityDeg * Math.cos(2 * Math.PI * (s / stepsPerYear - 5 / 12));
      Qyear.push(lats.map((lat) => dailyMeanInsolation(S0, decl, lat)));
    }

    let T = new Array(N).fill(10);

    // Ice cover responds to the climatological temperature, not the
    // instantaneous one. Perennial sea ice and ice sheets take years to
    // decades to grow or retreat; they do not appear and vanish with the
    // months. Tbar is a running mean with a multi-year memory, and the
    // albedo is computed from it.
    //
    // This matters more than it sounds. Driving albedo off the
    // instantaneous temperature makes any planet with a cold season
    // grow bright ice every winter, which reflects away the following
    // summer and tips the model into a spurious snowball. Without this,
    // a 60-degree-obliquity planet froze solid in the model, the exact
    // opposite of the published result that high obliquity warms a
    // planet by feeding the poles more annual sunlight.
    const albedoMemoryYears = 5;
    const memoryWeight = 1 / (albedoMemoryYears * stepsPerYear);
    let Tbar = T.slice();

    let prevYear = null, converged = false, yearsRun = 0;
    let cycle = null;

    for (let y = 0; y < spinUpYears; y++) {
      yearsRun = y + 1;
      cycle = [];
      for (let s = 0; s < stepsPerYear; s++) {
        const Q = Qyear[s];
        const rhs = Q.map((q, i) => {
          const f = iceFraction(Tbar[i]);
          const alpha = f * C.ALPHA_ICE + (1 - f) * type.albedo;
          return q * (1 - alpha) + dF - C.A_OLR + inertia * T[i];
        });
        T = tridiagSolve(lo, di, up, rhs);
        Tbar = Tbar.map((tb, i) => tb + memoryWeight * (T[i] - tb));
        cycle.push(T.slice());
      }
      if (prevYear) {
        let maxDelta = 0;
        for (let s = 0; s < stepsPerYear; s++)
          for (let i = 0; i < N; i++)
            maxDelta = Math.max(maxDelta, Math.abs(cycle[s][i] - prevYear[s][i]));
        if (maxDelta < tolerance) { converged = true; prevYear = cycle; break; }
      }
      prevYear = cycle;
    }

    // Northern summer solstice is the step whose declination is maximal.
    let solsticeStep = 0, best = -Infinity;
    for (let s = 0; s < stepsPerYear; s++) {
      const decl = obliquityDeg * Math.cos(2 * Math.PI * (s / stepsPerYear - 5 / 12));
      if (decl > best) { best = decl; solsticeStep = s; }
    }

    const annualMeanC = lats.map((_, i) =>
      cycle.reduce((acc, step) => acc + step[i], 0) / stepsPerYear);

    const allTemps = cycle.flat();

    return {
      lats,
      stepsPerYear,
      months: cycle.map((step) => step.map(clampC)),
      monthsRaw: cycle,
      solsticeC: cycle[solsticeStep].map(clampC),
      winterSolsticeC: cycle[(solsticeStep + stepsPerYear / 2) % stepsPerYear].map(clampC),
      annualMeanC: annualMeanC.map(clampC),
      globalMeanC: clampC(areaWeightedMean(lats, annualMeanC)),
      solsticeStep,
      mixedLayerM: depth,
      converged,
      yearsRun,
      outOfRange: outOfRangeC(allTemps),
      interpretation:
        'Time-stepping seasonal solution including surface heat capacity. ' +
        'These are temperatures the planet actually reaches.',
    };
  }

  function areaWeightedMean(lats, values) {
    let num = 0, den = 0;
    lats.forEach((lat, i) => {
      const w = Math.cos(lat * DEG);
      num += values[i] * w;
      den += w;
    });
    return num / den;
  }

  /* ===================================================================
   * SECTION 9 — TIDALLY LOCKED PROFILE
   *
   * Coordinates: angle a from -90 (antistellar) to +90 (substellar).
   * Insolation Q(a) = S0*sin(a) on the day side, 0 on the night side.
   * Area-weighted global mean of that is S0/4, so it conserves energy.
   * The same spherical diffusion operator applies with co-latitude
   * measured from the substellar point.
   * =================================================================== */

  function tidallyLockedProfile(opts) {
    const {
      S0 = C.S0_SUN, co2ppm = 280, planetType = 'earth',
      dRel = null, pressureBar = 1.0,
    } = opts;
    const type = PLANET_TYPES[planetType] || PLANET_TYPES.earth;
    const D = dRel === null ? type.defaultD : dRel;

    const angles = latitudeGrid();
    const Q = angles.map((a) => (a > 0 ? S0 * Math.sin(a * DEG) : 0));
    const dayMask = angles.map((a) => a > 0);

    const out = solveWithAlbedoFeedback(
      angles, Q, D, type.albedo, greenhouseForcing(co2ppm, pressureBar), { dayMask });

    out.angles = angles;
    out.substellarC = out.tempsC[out.tempsC.length - 1];
    out.antistellarC = out.tempsC[0];
    out.terminatorC = out.tempsC[(out.tempsC.length - 1) / 2];

    // Atmospheric collapse check. If the night side is below the CO2
    // frost point (~-140 degC at 1 bar) the atmosphere freezes out onto
    // the dark hemisphere and the whole diffusive picture breaks down.
    // A real result, not a numerical failure: it is one of the classic
    // arguments about thin atmospheres on locked planets.
    out.atmosphericCollapseRisk = out.tempsCRaw[0] < -140;
    return out;
  }

  /* ===================================================================
   * SECTION 10 — SIMPLE CALCULATORS
   * =================================================================== */

  // Kepler's third law in solar units: P^2 = a^3 / M
  const kepler = {
    period: (aAU, starMass) => Math.sqrt(Math.pow(aAU, 3) / starMass),
    semiMajorAxis: (periodYr, starMass) => Math.pow(starMass * periodYr * periodYr, 1 / 3),
    starMass: (aAU, periodYr) => Math.pow(aAU, 3) / (periodYr * periodYr),
  };

  /**
   * Radius and surface gravity from mass and mean density.
   * Densities in g/cm^3. Reference values, verified:
   * Earth 5.51, Mars 3.93, Jupiter 1.33, Saturn 0.69, Neptune 1.64.
   * (The standalone orbit calculator had a Neptune button labelled
   * 1.64 that set 1.27. Presets now live here so they cannot disagree
   * with their own labels.)
   */
  const DENSITY_PRESETS = {
    earth: 5.51, mars: 3.93, jupiter: 1.33, saturn: 0.69, neptune: 1.64,
  };

  function planetaryProperties(massEarth, densityGcm3) {
    const rho = densityGcm3 * 1000;
    const M = massEarth * C.M_EARTH;
    const R_m = Math.pow((3 * M) / (4 * Math.PI * rho), 1 / 3);
    const g = (C.G_GRAV * M) / (R_m * R_m);
    return {
      radiusM: R_m,
      radiusEarth: R_m / C.R_EARTH,
      gravityMS2: g,
      gravityEarth: g / C.G_EARTH,
    };
  }

  /* ===================================================================
   * SECTION 9.5 — CLIMATE ZONES
   *
   * Turns a temperature profile into named bands a student can point at.
   * Deliberately Koppen-flavoured, because that is the vocabulary an
   * Earth science course already uses, but simplified to what a
   * temperature-only model can honestly support: no precipitation, so no
   * desert/rainforest distinction, only the thermal classes.
   *
   * Classification uses BOTH the warmest and coldest season, because
   * they carry different information. Tundra and temperate forest can
   * share an annual mean and differ completely in winter, and it is the
   * winter that decides what can live there.
   *
   * On a tidally locked planet there are no seasons, so pass the same
   * array for both and the bands come out as day-side rings.
   * =================================================================== */

  const CLIMATE_ZONES = [
    { key: 'scorching',   label: 'Too hot for liquid-water life', color: '#7f1d1d' },
    { key: 'tropical',    label: 'Tropical (no cold season)',     color: '#166534' },
    { key: 'subtropical', label: 'Subtropical (mild winter)',     color: '#4d7c0f' },
    { key: 'temperate',   label: 'Temperate (freezing winter)',   color: '#0e7490' },
    { key: 'continental', label: 'Continental (severe winter)',   color: '#1e40af' },
    { key: 'tundra',      label: 'Tundra (brief cool summer)',    color: '#6b21a8' },
    { key: 'polar',       label: 'Polar (never thaws)',           color: '#334155' },
  ];

  const ZONE_BY_KEY = Object.fromEntries(CLIMATE_ZONES.map((z) => [z.key, z]));

  /** Classify one location from its warmest and coldest season. */
  function classifyClimate(warmestC, coldestC) {
    if (warmestC > 50) return 'scorching';
    if (warmestC < 0) return 'polar';
    if (warmestC < 10) return 'tundra';
    if (coldestC >= 18) return 'tropical';
    if (coldestC >= 5) return 'subtropical';
    if (coldestC >= -15) return 'temperate';
    return 'continental';
  }

  /**
   * Collapse a profile into contiguous zone bands.
   * @returns {{bands:Array<{key,label,color,from,to}>, keys:string[],
   *            habitableFraction:number}}
   *   `from` and `to` are in the units of `coords` (latitude, or degrees
   *   from the terminator). `habitableFraction` is the area-weighted
   *   share of the surface in a zone that ever thaws and never cooks.
   */
  function climateZones(coords, warmestC, coldestC) {
    const keys = coords.map((_, i) => classifyClimate(warmestC[i], coldestC[i]));
    const bands = [];
    let start = 0;
    for (let i = 1; i <= keys.length; i++) {
      if (i === keys.length || keys[i] !== keys[start]) {
        const z = ZONE_BY_KEY[keys[start]];
        bands.push({
          key: z.key, label: z.label, color: z.color,
          from: coords[start], to: coords[i - 1],
        });
        start = i;
      }
    }
    const livable = new Set(['tropical', 'subtropical', 'temperate', 'continental', 'tundra']);
    let num = 0, den = 0;
    coords.forEach((c, i) => {
      const w = Math.cos(c * DEG);
      den += w;
      if (livable.has(keys[i])) num += w;
    });
    return { bands, keys, habitableFraction: num / den };
  }

  /* =================================================================== */

  return {
    CONSTANTS: C,
    MODEL_RANGE,
    PLANET_TYPES,
    HZ_COEFFS,
    DENSITY_PRESETS,
    // stars
    stellarLuminosity, stellarRadius, stellarTeff, stellarLifespanGyr, spectralType,
    // habitable zone
    seffAt, habitableZone,
    // orbit and interior
    effectiveS0, tidalLockRadius, isTidallyLocked, magneticFieldEstimate,
    // forcing
    pressureForcing, greenhouseForcing, atmosphereThicknessLabel, iceFraction,
    // geometry
    dailyMeanInsolation, solsticeInsolation, monthlyDeclination,
    // solvers
    tridiagSolve, solveWithAlbedoFeedback, areaWeightedMean,
    // climate zones
    CLIMATE_ZONES, classifyClimate, climateZones,
    run0dEBM, latProfileEquilibrium, latProfileSeasonal, tidallyLockedProfile,
    // calculators
    kepler, planetaryProperties,
    // utilities
    clampC, clampK, latitudeGrid,
  };
});
