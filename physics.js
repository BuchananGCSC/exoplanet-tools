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
    K_BOLTZ: 1.380649e-23, // J/K
    AMU: 1.66054e-27,      // kg

    // --- Linearised outgoing longwave radiation: OLR = A + B*T(degC) ---
    // [FIT] Budyko/Sellers-type fit. Valid only near Earth-like
    // temperatures; see MODEL_RANGE below.
    //
    // A_OLR CHANGED from 210.0 when clouds became explicit. The old value
    // was tuned to an atmosphere with Earth's cloud deck already baked into
    // it. Now that cloud longwave trapping is a separate term, the
    // clear-sky part has to be correspondingly larger.
    A_OLR: 236.3,          // W/m^2
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

    // --- Clouds ---
    // Clouds do two opposing things and the model now says so. ALPHA_CLOUD
    // is solved from Earth's observed planetary albedo of 0.30 at 67% cloud
    // cover over a clear-sky surface albedo of 0.15. LW_CLOUD is set so the
    // longwave effect matches the CERES value at that cover.
    //
    // Check against observations, at f = 0.67:
    //   shortwave effect  -51 W/m^2   (CERES: about -47)
    //   longwave effect   +26 W/m^2   (CERES: about +26)
    //   net               -25 W/m^2   (CERES: about -20)
    //   planetary albedo   0.300      (observed 0.30)
    //
    // NOTE the change in meaning this forces on every albedo in the file:
    // ALPHA_ICE and the surface anchors are now GROUND properties, not
    // planetary ones. cloudyAlbedos() puts the deck on top.
    ALPHA_CLOUD: 0.374,    // effective albedo of a fully cloudy sky
    LW_CLOUD: 39.0,        // W/m^2 of extra IR trapping at full cover

    // --- Heat capacity ---
    RHO_WATER: 1025.0,     // kg/m^3
    CP_WATER: 3994.0,      // J/kg/K
    MIXED_LAYER_M: 70.0,   // [CHOICE] default ocean mixed-layer depth

    // --- Meridional heat transport ---
    // D_phys = D_rel * D_SCALE, in W/m^2/K.
    D_SCALE: 2.86,
    // D_rel is NO LONGER a free parameter and no longer a slider. It is
    // derived from day length, atmospheric pressure, and how much ocean
    // the planet has; see diffusionFrom().
    D_EARTH_REL: 0.20,     // [FIT] Earth at 24 h, 1 bar
    DAY_HOURS_EARTH: 24.0,
    // Rotation exponent. Williams & Kasting 1997 use 2, following Farrell
    // 1990: faster spin means stronger Coriolis deflection, narrower
    // circulation cells, and less poleward transport.
    //
    // THIS VALUE IS DISPUTED. Vladilo et al. compared against 3D
    // circulation models and found the n = 2 dependence unsupported,
    // preferring something weaker, with agreement good at high rotation
    // rates and poor at low ones. Ramirez 2024 abandoned the analytic form
    // entirely and fitted coefficients to GCM runs. We keep 2 because it is
    // the value with a citation attached; changing it is a one-character
    // edit and the test suite will tell you what moved.
    D_ROTATION_EXPONENT: 2.0,
    // Transport used for tidally locked planets. NOT rotation-scaled:
    // a locked planet's rotation equals its orbital period, which gives
    // D values around 7-25 and a completely flat temperature profile.
    // Haqq-Misra et al. report exactly this failure and advise against it.
    D_LOCKED_DEFAULT: 0.20,

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
   * SECTION 3.5 — ATMOSPHERIC ESCAPE
   *
   * This is the link the interface was missing. Planet mass used to reach
   * only two calculations (tidal locking and the dynamo), so choosing
   * "Desert World" set an albedo, a heat-transport default and a mixed-layer
   * depth that were simply asserted alongside a mass, never derived from it.
   * A student had no way to see why a small planet should be dry and bright.
   *
   * Escape velocity is exact. The retention rule is a rule of thumb, and is
   * marked as such: a gas survives for billions of years if the escape
   * velocity is comfortably larger than the typical thermal speed of its
   * molecules, because the fast tail of the Maxwell-Boltzmann distribution
   * is always leaking away.
   *
   * What this DOES capture: thermal (Jeans) escape, which is why small
   * worlds cannot hold hydrogen and large ones can.
   * What it does NOT capture: non-thermal loss -- solar-wind stripping,
   * impact erosion, photochemical loss. That gap matters, and it is exactly
   * why Mars is the way it is: Mars retains CO2 thermally and lost it
   * anyway, once its dynamo died and the solar wind reached the atmosphere.
   * Callers should pair this with the magnetic-field estimate rather than
   * present thermal retention as the whole answer.
   * =================================================================== */

  // irActive: whether the molecule can absorb infrared at all.
  // N2 and O2 are homonuclear diatomics -- two identical atoms, perfectly
  // symmetric, no dipole moment. Their only vibration does not change the
  // charge distribution, so it does not couple to infrared, and no quantity
  // of them warms a planet. CO2 and CH4 can flex into asymmetric shapes and
  // H2O is bent to begin with, so all three absorb.
  // This is why there is no oxygen term in the forcing: not an omission, a
  // fact about the molecule, and one students routinely get wrong.
  const GAS_SPECIES = {
    H2:  { mu: 2.016,  label: 'H\u2082',  irActive: false },
    He:  { mu: 4.003,  label: 'He',   irActive: false },
    CH4: { mu: 16.043, label: 'CH\u2084', irActive: true  },
    H2O: { mu: 18.015, label: 'H\u2082O', irActive: true  },
    N2:  { mu: 28.013, label: 'N\u2082',  irActive: false },
    O2:  { mu: 31.999, label: 'O\u2082',  irActive: false },
    CO2: { mu: 44.010, label: 'CO\u2082', irActive: true  },
  };

  // [CHOICE] Retention threshold, v_esc / v_thermal. Textbooks quote
  // anywhere from 5 to 10 for "retained over the age of the solar system".
  // 6 is used here because it reproduces the solar system: Earth keeps
  // N2, O2, CO2 and H2O, loses H2, and loses He marginally -- which is
  // what Earth actually does.
  const JEANS_RETENTION_FACTOR = 6;

  // [CHOICE] Exosphere temperature at Earth's insolation. Escape happens at
  // the exobase, not the ground, and that layer is heated by stellar XUV
  // rather than by the surface: Earth's surface averages 288 K while its
  // exosphere runs near 1000 K. Using the surface temperature here would
  // understate escape by a large factor.
  const T_EXO_EARTH_K = 1000;

  /**
   * Exosphere temperature, scaled from stellar flux.
   *
   * [CHOICE] The quarter-power scaling is borrowed from equilibrium
   * temperature. It is a stand-in, not a derivation: real exospheric
   * heating tracks XUV, and the XUV-to-bolometric ratio is far higher for
   * active M dwarfs than for the Sun. This therefore UNDERSTATES escape
   * around flare stars, which is the direction that flatters the student's
   * planet, so interfaces should say so rather than let it pass.
   */
  function exosphereTemperature(S0) {
    return T_EXO_EARTH_K * Math.pow(Math.max(S0, 1e-6) / C.S0_SUN, 0.25);
  }

  /** Escape velocity in m/s. Exact: sqrt(2GM/R). */
  function escapeVelocity(massEarth, densityGcm3) {
    const { radiusM } = planetaryProperties(massEarth, densityGcm3);
    return Math.sqrt(2 * C.G_GRAV * massEarth * C.M_EARTH / radiusM);
  }

  /** Most probable speed of a Maxwell-Boltzmann distribution, m/s. */
  function thermalSpeed(muAmu, tempK) {
    return Math.sqrt(2 * C.K_BOLTZ * tempK / (muAmu * C.AMU));
  }

  /**
   * Which gases this world can hold on to.
   * @returns {{escapeVelocityMS, exosphereK, factor, species:Object}}
   *   species[key] = {label, mu, thermalSpeedMS, ratio, retained}
   */
  function gasRetention(opts) {
    const { massEarth, densityGcm3, S0 = C.S0_SUN } = opts;
    const vEsc = escapeVelocity(massEarth, densityGcm3);
    const tExo = exosphereTemperature(S0);
    const species = {};
    for (const [key, g] of Object.entries(GAS_SPECIES)) {
      const vTh = thermalSpeed(g.mu, tExo);
      const ratio = vEsc / vTh;
      species[key] = {
        key, label: g.label, mu: g.mu,
        thermalSpeedMS: vTh,
        ratio,
        retained: ratio >= JEANS_RETENTION_FACTOR,
      };
    }
    return {
      escapeVelocityMS: vEsc,
      exosphereK: tExo,
      factor: JEANS_RETENTION_FACTOR,
      species,
    };
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

  /**
   * Greenhouse forcing from an actual gas mixture.
   *
   * WHY THIS EXISTS, and how it differs from greenhouseForcing() above:
   * the old term used CO2 in ppm, which is a MIXING RATIO. Radiative
   * forcing depends on how many CO2 molecules are in the column, which is
   * the PARTIAL pressure -- mixing ratio times total pressure. 400 ppm of
   * CO2 in a 10-bar atmosphere is ten times the CO2 of 400 ppm in a 1-bar
   * atmosphere and cannot warm the planet by the same amount.
   *
   * At 1 bar the two agree exactly, so nothing a student did at default
   * pressure changes. Away from 1 bar this one is right and the old one
   * was not.
   *
   * The separate pressure-broadening term is deliberately NOT added on top
   * here. It existed to stand in for the pressure dependence that ppm threw
   * away; now that pressure enters honestly through the partial pressures
   * of the absorbing gases, adding it again would double-count the same
   * physics twice over.
   *
   * CH4 uses the Myhre et al. (1998) square-root form. It is included
   * because a second greenhouse gas is what makes "composition" a real
   * choice rather than a label.
   *
   * STILL MISSING, and it matters for thick CO2 atmospheres: outgoing
   * radiation saturates in reality, which is what drives a runaway
   * greenhouse. This model is linear in OLR, so it will understate a truly
   * Venus-like world even now. MODEL_RANGE is the honest guard.
   */
  // Referenced to NO methane, not to Earth's pre-industrial 700 ppb. Myhre's
  // formula is a difference from a reference concentration, so anchoring it at
  // 700 ppb made a methane-free world come out with NEGATIVE forcing, which
  // quietly shifted every default result. Anchoring at zero keeps "no methane"
  // meaning "no methane forcing", so a 1-bar planet reproduces the old numbers
  // exactly. The square-root form is fitted near present-day abundances and
  // overstates the first trace amounts; it is a teaching curve, not a spectrum.
  const CH4_REF_PPB = 0;
  function greenhouseForcingMix(opts) {
    const { pressureBar = 1.0, co2Ppm = 280, ch4Ppm = 0, co2IsBackground = false } = opts;
    const co2Frac = co2IsBackground
      ? Math.max(co2Ppm / 1e6, 0.95)      // a CO2-dominated atmosphere is ~all CO2
      : co2Ppm / 1e6;
    const pCO2 = Math.max(co2Frac * pressureBar, 1e-12);
    const pCO2ref = 280e-6 * C.P_REF;
    const fCO2 = C.A_GHG * Math.log(pCO2 / pCO2ref);
    const ch4Ppb = Math.max(ch4Ppm * 1000, 0);
    const fCH4 = 0.036 * (Math.sqrt(ch4Ppb) - Math.sqrt(CH4_REF_PPB));
    // The square-root form is fitted near Earth's ~1.7 ppm. Past roughly
    // 100 ppm it is extrapolation by orders of magnitude and runs away, where
    // the real gas saturates its bands and starts forming haze that COOLS the
    // surface. Flagged rather than silently clipped, so a student pushing the
    // slider is told the model has left its evidence behind.
    const ch4BeyondFit = ch4Ppm > 100;
    return { total: fCO2 + fCH4, co2: fCO2, ch4: fCH4,
             partialPressureCO2Bar: pCO2, ch4BeyondFit };
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
  // A planet type is now five independent physical properties rather than
  // one tuned albedo and one tuned D. surfaceAlbedo is the GROUND, not the
  // planet: the cloud deck is added on top by cloudyAlbedos().
  //
  // These three types are the endpoints and midpoint of SURFACE_ANCHORS
  // below, and are kept as named presets so the contract cases and the
  // teaching examples have something stable to refer to. The interface
  // reaches them through surfaceProperties(), not through this table.
  const PLANET_TYPES = {
    // massEarth is a REPRESENTATIVE mass, used only where a caller offers
    // no mass control of its own. It is here rather than in a private
    // lookup table so that any code relying on it has to name it, and so
    // the interface can tell the student what mass it assumed. The old
    // version hid this, which meant picking "Desert World" silently
    // guaranteed no magnetic field.
    earth: {
      label: 'Earth-like',
      surfaceAlbedo: 0.15, cloudFraction: 0.67,
      transportFactor: 1.0, mixedLayerM: 8, massEarth: 1.0,
    },
    desert: {
      // Little water means little cloud greenhouse, so a dry world runs
      // cold; little heat storage means violent seasons; no ocean means a
      // steep pole-to-equator gradient. It is harsh but not hopeless --
      // raising CO2 to a few thousand ppm brings it back above freezing,
      // which is a chain a student can find and act on.
      //
      // massEarth CHANGED 0.3 -> 0.107 (Mars) when atmospheric escape went
      // in. At 0.3 Mearth this world retains water thermally even at
      // 5000 W/m2, so the intended chain -- small, therefore dry, therefore
      // bright and poor at storing heat -- did not follow from the mass at
      // all. The thermal water-retention boundary sits near 0.12 Mearth,
      // so a genuinely Mars-like mass puts this world on the far side of
      // it, and the dynamo heuristic independently returns "no field"
      // there. The whole Mars story then falls out of the model instead of
      // being stipulated.
      label: 'Mars-like',
      surfaceAlbedo: 0.28, cloudFraction: 0.30,
      transportFactor: 0.6, mixedLayerM: 2, massEarth: 0.107,
    },
    ocean: {
      label: 'Super-Earth',
      surfaceAlbedo: 0.09, cloudFraction: 0.80,
      transportFactor: 1.6, mixedLayerM: 40, massEarth: 3.0,
    },
  };

  /**
   * Effective ice and clear-surface albedos once a cloud deck of fraction
   * fc is laid over them.
   *
   *   alpha = (1-fc) * [ice*ALPHA_ICE + (1-ice)*surfaceAlbedo] + fc*ALPHA_CLOUD
   *
   * which rearranges into the same two-term form the solvers already use,
   * with these transformed constants. That is why nothing downstream had to
   * change shape.
   *
   * Note what this does to the ice-albedo feedback: ice now acts on the
   * SURFACE and the cloud deck masks part of it. Earth's ice-free to
   * fully-glaciated albedo swing falls from 0.320 to 0.155.
   */
  function cloudyAlbedos(surfaceAlbedo, cloudFraction) {
    const fc = Math.max(0, Math.min(1, cloudFraction));
    return {
      ice: (1 - fc) * C.ALPHA_ICE + fc * C.ALPHA_CLOUD,
      base: (1 - fc) * surfaceAlbedo + fc * C.ALPHA_CLOUD,
      planetary: (1 - fc) * surfaceAlbedo + fc * C.ALPHA_CLOUD,
    };
  }

  /** Extra longwave trapping from a cloud deck, in W/m^2. */
  function cloudLongwave(cloudFraction) {
    return Math.max(0, Math.min(1, cloudFraction)) * C.LW_CLOUD;
  }

  /**
   * Meridional heat transport, derived rather than chosen.
   *
   *   D = D_earth * (P/P0) * (day/24 h)^n * transportFactor
   *
   * Following Williams & Kasting 1997, who make D a function of rotation
   * rate, pressure, mean molecular mass, and atmospheric heat capacity.
   * The first two are what this tool gives a student control over.
   *
   * REPLACES the Diffusion D slider. D was previously a number a student
   * set directly, which asked them to have an intuition for a quantity
   * with no everyday meaning. Day length has one.
   *
   * @param dayHours         length of the planet's day
   * @param pressureBar      total surface pressure
   * @param transportFactor  ocean-circulation stand-in, 1.0 for Earth-like
   */
  function diffusionFrom(dayHours, pressureBar = 1.0, transportFactor = 1.0) {
    const day = Math.max(dayHours, 0.1);
    return C.D_EARTH_REL * Math.max(pressureBar, 0.01)
      * Math.pow(day / C.DAY_HOURS_EARTH, C.D_ROTATION_EXPONENT)
      * transportFactor;
  }

  /* ===================================================================
   * SECTION 4.5 — SURFACE FROM WATER INVENTORY
   *
   * PLANET_TYPES used to bundle four numbers behind one dropdown, so a
   * student picked a costume rather than a property. Mass is now its own
   * control; the other three -- albedo, heat transport, heat storage -- all
   * follow from one physical thing, how much surface water there is:
   *
   *   dry rock is bright, moves little heat, and stores almost none;
   *   a global ocean is dark, moves heat well, and stores a great deal.
   *
   * The three old types turn out to be exactly three points on that axis:
   * albedo 0.35 / 0.30 / 0.25 is linear in water fraction, and the other
   * two interpolate smoothly through the same anchors. So this is not a new
   * model -- it is the old table with the axis it was always lying along
   * made explicit, and every previous result is still reachable.
   *
   * Water inventory is deliberately NOT derived from mass. Mass decides
   * what a planet can KEEP; how much it started with depends on where it
   * formed relative to the snow line and what was delivered later. Callers
   * should pair this with gasRetention() and say so when a student asks a
   * bone-dry world for an ocean, or an ocean world that cannot hold water.
   * =================================================================== */

  // CHANGED when clouds and rotation went in. The anchors used to carry a
  // planetary albedo (clouds baked in) and a diffusion coefficient (rotation
  // baked in). Both were doing two jobs at once. Now:
  //
  //   surfaceAlbedo    the ground itself: dust is bright, ocean is dark
  //   cloudFraction    water in the air, which follows water on the ground
  //   transportFactor  how much the OCEAN moves heat; the atmosphere's share
  //                    comes from day length and pressure via diffusionFrom()
  //   mixedLayerM      how much heat the surface stores, hence the seasons
  //
  // The three named PLANET_TYPES above are exactly these three anchors.
  const SURFACE_ANCHORS = [
    { w: 0.0, surfaceAlbedo: 0.28, cloudFraction: 0.30, transportFactor: 0.6, mixedLayerM: 2,  label: 'dry rock and dust' },
    { w: 0.5, surfaceAlbedo: 0.15, cloudFraction: 0.67, transportFactor: 1.0, mixedLayerM: 8,  label: 'mixed land and sea' },
    { w: 1.0, surfaceAlbedo: 0.09, cloudFraction: 0.80, transportFactor: 1.6, mixedLayerM: 40, label: 'global ocean' },
  ];

  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _logLerp(a, b, t) { return Math.exp(_lerp(Math.log(a), Math.log(b), t)); }

  /**
   * Surface properties for a water fraction in [0, 1].
   * Albedo interpolates linearly, transport and heat storage logarithmically,
   * because both span a factor of five or twenty rather than an increment.
   */
  function surfaceProperties(waterFraction) {
    const w = Math.max(0, Math.min(1, waterFraction));
    const i = w <= 0.5 ? 0 : 1;
    const lo = SURFACE_ANCHORS[i], hi = SURFACE_ANCHORS[i + 1];
    const t = (w - lo.w) / (hi.w - lo.w);
    const surfaceAlbedo = _lerp(lo.surfaceAlbedo, hi.surfaceAlbedo, t);
    const cloudFraction = _lerp(lo.cloudFraction, hi.cloudFraction, t);
    return {
      waterFraction: w,
      surfaceAlbedo,
      // The DEFAULT cloud cover for this much surface water. A caller may
      // override it -- more water in the air is a consequence of water on
      // the ground, but not a rigid one, and letting a student break the
      // link is the point of having a cloud control at all.
      cloudFraction,
      // What a telescope would measure, with the default deck in place.
      // Reported so an interface can show surface and planetary albedo
      // side by side, which is the whole lesson of the cloud term.
      planetaryAlbedo: cloudyAlbedos(surfaceAlbedo, cloudFraction).planetary,
      transportFactor: _logLerp(lo.transportFactor, hi.transportFactor, t),
      mixedLayerM: _logLerp(lo.mixedLayerM, hi.mixedLayerM, t),
      label: w < 0.17 ? 'dry rock and dust'
           : w < 0.4  ? 'mostly dry, scattered water'
           : w < 0.62 ? 'mixed land and sea'
           : w < 0.85 ? 'ocean with islands'
           :            'global ocean',
    };
  }

  /* ===================================================================
   * SECTION 4.6 — ATMOSPHERIC MIXTURE
   *
   * Composition as actual mole fractions rather than a menu of three
   * named atmospheres. The mean molecular weight this produces is what
   * decides whether the planet can hold the mixture at all, which is the
   * link back to Section 3.5.
   * =================================================================== */

  /**
   * Ultraviolet shielding from an ozone layer, which is what oxygen actually
   * does to a planet. O2 itself is radiatively inert, but sunlight splits it
   * and the fragments recombine into O3, which absorbs hard ultraviolet.
   *
   * [CHOICE] Thresholds in absolute mixing ratio. A useful shield appears
   * somewhere around a hundredth of Earth's present oxygen and is close to
   * saturated by a tenth of it -- the column depth of ozone rises much faster
   * than the oxygen that feeds it. Order-of-magnitude, not a photochemical
   * calculation, and there is no photochemistry anywhere in this model.
   */
  function ozoneShielding(o2Fraction) {
    if (o2Fraction >= 0.02) return { level: 2, label: 'Strong',
      note: 'Enough oxygen for a substantial ozone layer, so the surface is shielded from hard ultraviolet much as Earth is.' };
    if (o2Fraction >= 0.002) return { level: 1, label: 'Partial',
      note: 'Enough oxygen for a thin ozone layer. Some ultraviolet still reaches the ground; life at the surface would need protection.' };
    return { level: 0, label: 'None',
      note: 'Too little oxygen for an ozone layer, so unfiltered ultraviolet reaches the ground. Life would need shielding, depth, or water above it.' };
  }

  /**
   * @param {{co2Ppm, o2Ppm, h2Ppm, ch4Ppm}} mix  amounts in ppm by volume;
   *        nitrogen is whatever is left over.
   */
  function atmosphereMixture(mix) {
    const clampFrac = (ppm) => Math.max(0, (ppm || 0) / 1e6);
    const co2 = clampFrac(mix.co2Ppm), h2 = clampFrac(mix.h2Ppm),
          ch4 = clampFrac(mix.ch4Ppm), o2 = clampFrac(mix.o2Ppm);
    const named = co2 + h2 + ch4 + o2;
    // Nitrogen fills the remainder. If the named gases already exceed the
    // whole atmosphere, renormalise instead of inventing negative nitrogen.
    const scale = named > 1 ? 1 / named : 1;
    const f = { CO2: co2 * scale, H2: h2 * scale, CH4: ch4 * scale, O2: o2 * scale,
                N2: named > 1 ? 0 : 1 - named };
    let mu = 0;
    for (const k of Object.keys(f)) mu += f[k] * GAS_SPECIES[k].mu;
    let dominant = 'N2', best = f.N2;
    for (const k of ['CO2', 'H2', 'CH4', 'O2']) if (f[k] > best) { best = f[k]; dominant = k; }
    // Only three of these can warm anything. Reported so an interface can say
    // so rather than leaving a student to infer it from a missing slider.
    const greenhouseFraction = f.CO2 + f.CH4;
    const inertFraction = f.N2 + f.O2 + f.H2;
    return { fractions: f, meanMu: mu, dominant, dominantFraction: best,
             greenhouseFraction, inertFraction, renormalised: named > 1,
             ozone: ozoneShielding(f.O2) };
  }

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
      T0_K = 288, co2ppm = 280, S0 = C.S0_SUN,
      surfaceAlbedo = 0.15, cloudFraction = 0.67,
      pressureBar = 1.0, years = 300, dtYears = 0.5,
      mixedLayerM = C.MIXED_LAYER_M,
    } = opts;
    // CHANGED: this used to take one planetary albedo (albedoWarm). It now
    // takes the ground and the cloud deck separately, because they act on
    // different sides of the energy budget -- cloud raises the albedo AND
    // traps outgoing infrared, and a single number cannot do both.
    const cl = cloudyAlbedos(surfaceAlbedo, cloudFraction);

    const heatCapacity = C.RHO_WATER * C.CP_WATER * mixedLayerM;
    const dt = dtYears * C.SEC_PER_YEAR;
    const steps = Math.floor(years / dtYears);
    // forcingWm2 lets a caller pass a mixture-derived forcing (see
    // greenhouseForcingMix) instead of threading every gas through the solver.
    //
    // The cloud longwave term is added on TOP of whichever forcing the
    // caller supplies. It is a separate physical effect from the gases:
    // overriding the greenhouse forcing must not silently delete the
    // clouds' contribution to it.
    const dF = (opts.forcingWm2 === undefined
      ? greenhouseForcing(co2ppm, pressureBar) : opts.forcingWm2)
      + cloudLongwave(cloudFraction);

    let T = T0_K;
    const times = [0], raw = [T];
    for (let i = 0; i < steps; i++) {
      const f = iceFraction(T - 273.15);
      const alb = f * cl.ice + (1 - f) * cl.base;
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
      surfaceAlbedo,
      cloudFraction,
      planetaryAlbedo: cl.planetary,
      cloudLongwaveWm2: cloudLongwave(cloudFraction),
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
    const { tolerance = 1e-4, maxIter = 200, relaxation = 0.5, dayMask = null,
            iceAlbedo = C.ALPHA_ICE } = opts;
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
        const alpha = f * iceAlbedo + (1 - f) * baseAlbedo;
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
   * Resolve the surface, cloud and transport parameters the three 1-D
   * entry points share. Named planet types are the fallback; an explicit
   * value always wins, which is how the interface feeds in a surface built
   * from its water-inventory slider rather than a preset.
   *
   * dRel remains accepted so that a caller can pin transport directly --
   * the contract cases do, and so does anything reproducing an older
   * result -- but nothing in the interface sets it any more. Left null,
   * transport is derived from day length, pressure and ocean coverage.
   */
  function _resolveSurface(opts, { rotationScaled = true } = {}) {
    const type = PLANET_TYPES[opts.planetType] || PLANET_TYPES.earth;
    const surfaceAlbedo = opts.surfaceAlbedo == null ? type.surfaceAlbedo : opts.surfaceAlbedo;
    const cloudFraction = opts.cloudFraction == null ? type.cloudFraction : opts.cloudFraction;
    const transportFactor = opts.transportFactor == null ? type.transportFactor : opts.transportFactor;
    const dayHours = opts.dayHours == null ? C.DAY_HOURS_EARTH : opts.dayHours;
    const pressureBar = opts.pressureBar == null ? 1.0 : opts.pressureBar;
    const derivedD = rotationScaled
      ? diffusionFrom(dayHours, pressureBar, transportFactor)
      // Tidally locked planets are deliberately NOT rotation-scaled; see
      // D_LOCKED_DEFAULT. Ocean circulation still applies.
      : C.D_LOCKED_DEFAULT * transportFactor;
    const cl = cloudyAlbedos(surfaceAlbedo, cloudFraction);
    // As in run0dEBM: cloud longwave trapping rides on top of whichever
    // greenhouse forcing the caller supplies, never replacing it.
    const dF = (opts.forcingWm2 === undefined
      ? greenhouseForcing(opts.co2ppm == null ? 280 : opts.co2ppm, pressureBar)
      : opts.forcingWm2) + cloudLongwave(cloudFraction);
    return {
      type, surfaceAlbedo, cloudFraction, transportFactor, dayHours, pressureBar,
      cl, dF,
      D: opts.dRel == null ? derivedD : opts.dRel,
      dRelDerived: derivedD,
      mixedLayerM: opts.mixedLayerM == null ? type.mixedLayerM : opts.mixedLayerM,
    };
  }

  /** The transport and radiation numbers a caller may want to display. */
  function _surfaceReport(r) {
    return {
      surfaceAlbedo: r.surfaceAlbedo,
      cloudFraction: r.cloudFraction,
      planetaryAlbedo: r.cl.planetary,
      icedAlbedo: r.cl.ice,
      cloudLongwaveWm2: cloudLongwave(r.cloudFraction),
      transportFactor: r.transportFactor,
      dayHours: r.dayHours,
      dRel: r.D,
      forcingWm2: r.dF,
    };
  }

  /**
   * Steady-state latitude profile at a fixed declination.
   * Read the `interpretation` field before plotting this as "solstice".
   */
  function latProfileEquilibrium(opts) {
    const {
      S0 = C.S0_SUN, obliquityDeg = 23.44, declinationDeg = null,
    } = opts;
    const r = _resolveSurface(opts);
    const decl = declinationDeg === null ? obliquityDeg : declinationDeg;
    const lats = latitudeGrid();
    const Q = lats.map((lat) => dailyMeanInsolation(S0, decl, lat));
    const out = solveWithAlbedoFeedback(lats, Q, r.D, r.cl.base, r.dF,
      { iceAlbedo: r.cl.ice });
    out.lats = lats;
    out.declinationDeg = decl;
    Object.assign(out, _surfaceReport(r));
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
      S0 = C.S0_SUN, obliquityDeg = 23.44,
      stepsPerYear = 24, spinUpYears = 200, tolerance = 0.02,
    } = opts;

    const r = _resolveSurface(opts);
    const D = r.D, dF = r.dF, depth = r.mixedLayerM;

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
          const alpha = f * r.cl.ice + (1 - f) * r.cl.base;
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
      ..._surfaceReport(r),
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
    const { S0 = C.S0_SUN } = opts;
    const r = _resolveSurface(opts, { rotationScaled: false });

    const angles = latitudeGrid();
    const Q = angles.map((a) => (a > 0 ? S0 * Math.sin(a * DEG) : 0));
    const dayMask = angles.map((a) => a > 0);

    const out = solveWithAlbedoFeedback(
      angles, Q, r.D, r.cl.base, r.dF, { dayMask, iceAlbedo: r.cl.ice });

    Object.assign(out, _surfaceReport(r));
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
    pressureForcing, greenhouseForcing, greenhouseForcingMix,
    atmosphereThicknessLabel, iceFraction,
    // clouds and derived heat transport
    cloudyAlbedos, cloudLongwave, diffusionFrom,
    // atmospheric escape
    GAS_SPECIES, JEANS_RETENTION_FACTOR,
    exosphereTemperature, escapeVelocity, thermalSpeed, gasRetention,
    // surface and mixture
    SURFACE_ANCHORS, surfaceProperties, atmosphereMixture, ozoneShielding,
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
