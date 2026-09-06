/* =====================================================================
 * test/physics.test.js
 *
 * Run with:  node --test
 * No dependencies. Node 18 or newer.
 *
 * Two kinds of test live here:
 *   1. Every case in test_cases.json, which is the cross-language
 *      contract. A Python implementation must pass the same list.
 *   2. Sweep and invariant tests, which are easier to express in code
 *      than in JSON: no NaNs anywhere in the reachable parameter space,
 *      monotone responses, honest convergence flags.
 * ===================================================================== */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { P, derived, resolve, pluck, idx } = require('./harness.js');

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test_cases.json'), 'utf8'));

/* ------------------------------------------------------------------ *
 * 1. The shared contract
 * ------------------------------------------------------------------ */

test('shared contract (test_cases.json)', async (t) => {
  const seen = new Set();
  for (const c of contract.cases) {
    assert.ok(!seen.has(c.id), 'duplicate case id: ' + c.id);
    seen.add(c.id);

    await t.test(`${c.group} / ${c.id}`, () => {
      const fn = resolve(c.call.fn);
      const raw = fn(...(c.call.args || []));
      const actual = pluck(raw, c.expect.path);
      const label = c.reference ? `\n  reference: ${c.reference}` : '';

      if (Object.prototype.hasOwnProperty.call(c.expect, 'value')) {
        if (typeof c.expect.value === 'number') {
          assert.strictEqual(typeof actual, 'number', `${c.id} did not return a number` + label);
          assert.ok(Number.isFinite(actual), `${c.id} returned ${actual}` + label);
          const tol = c.expect.absTol !== undefined
            ? c.expect.absTol
            : Math.abs(c.expect.value) * (c.expect.relTol !== undefined ? c.expect.relTol : 1e-9);
          assert.ok(
            Math.abs(actual - c.expect.value) <= tol,
            `${c.id}: expected ${c.expect.value} +/- ${tol}, got ${actual}` + label);
        } else {
          assert.strictEqual(actual, c.expect.value, c.id + label);
        }
      }
      if (c.expect.min !== undefined) {
        assert.ok(actual >= c.expect.min,
          `${c.id}: expected at least ${c.expect.min}, got ${actual}` + label);
      }
      if (c.expect.max !== undefined) {
        assert.ok(actual <= c.expect.max,
          `${c.id}: expected at most ${c.expect.max}, got ${actual}` + label);
      }
    });
  }
});

/* ------------------------------------------------------------------ *
 * 2. Sweeps: nothing in the reachable parameter space may return NaN,
 *    and anything outside the model's domain must say so.
 * ------------------------------------------------------------------ */

const STAR_MASSES = [0.08, 0.089, 0.122, 0.3, 0.5, 0.8, 1.0, 1.5, 3.0, 10.0];
const AXES = [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 20.0];
const OBLIQUITIES = [0, 10, 23.44, 45, 70, 90];
const CO2 = [10, 280, 1000, 10000];
const PRESSURES = [0.1, 1.0, 10.0];
const TYPES = ['earth', 'desert', 'ocean'];

test('no NaN or Infinity anywhere in the star and orbit sweep', () => {
  for (const m of STAR_MASSES) {
    for (const fn of ['stellarLuminosity', 'stellarRadius', 'stellarTeff', 'stellarLifespanGyr']) {
      assert.ok(Number.isFinite(P[fn](m)), `${fn}(${m}) = ${P[fn](m)}`);
    }
    const hz = P.habitableZone(m);
    for (const v of [...hz.conservative, ...hz.optimistic]) {
      assert.ok(Number.isFinite(v) && v > 0, `habitableZone(${m}) gave ${v}`);
    }
    for (const a of AXES) {
      assert.ok(Number.isFinite(P.effectiveS0(m, a)));
      assert.ok(Number.isFinite(P.tidalLockRadius(m, 1.0, 4.5)));
    }
  }
});

test('no NaN in the climate sweep, and out-of-range results are flagged', () => {
  for (const type of TYPES) {
    for (const co2ppm of CO2) {
      for (const pressureBar of PRESSURES) {
        for (const obliquityDeg of OBLIQUITIES) {
          for (const S0 of [600, 1000, 1361, 2000]) {
            const r = P.latProfileEquilibrium({ S0, co2ppm, pressureBar, obliquityDeg, planetType: type });
            const tag = `${type} S0=${S0} co2=${co2ppm} P=${pressureBar} obl=${obliquityDeg}`;
            assert.ok(r.tempsC.every(Number.isFinite), 'NaN in ' + tag);
            const clamped = r.tempsC.some((v, i) => v !== r.tempsCRaw[i]);
            assert.strictEqual(clamped, r.outOfRange,
              'outOfRange flag disagrees with the clamping in ' + tag);
          }
        }
      }
    }
  }
});

test('the albedo iteration converges across the interesting range', () => {
  // The band that used to return non-converged answers.
  for (let S0 = 1000; S0 <= 1400; S0 += 10) {
    const r = P.latProfileEquilibrium({ S0, obliquityDeg: 23.44, dRel: 0.35 });
    assert.ok(r.converged, `did not converge at S0 = ${S0} (${r.iterations} iterations)`);
  }
});

test('a converged answer does not depend on the iteration cap', () => {
  // This is the specific failure mode of the old fixed-8-iteration loop:
  // the answer changed if you kept going.
  for (const S0 of [1100, 1150, 1180, 1200, 1250]) {
    const lats = P.latitudeGrid();
    const Q = lats.map((l) => P.dailyMeanInsolation(S0, 23.44, l));
    const a = P.solveWithAlbedoFeedback(lats, Q, 0.35, 0.30, 0, { maxIter: 200 });
    const b = P.solveWithAlbedoFeedback(lats, Q, 0.35, 0.30, 0, { maxIter: 2000 });
    assert.ok(Math.abs(a.tempsCRaw[45] - b.tempsCRaw[45]) < 0.5,
      `S0 = ${S0}: 200 iterations gave ${a.tempsCRaw[45].toFixed(2)}, ` +
      `2000 gave ${b.tempsCRaw[45].toFixed(2)}`);
  }
});

test('the seasonal model converges for every planet type', () => {
  for (const planetType of TYPES) {
    const s = P.latProfileSeasonal({ planetType });
    assert.ok(s.converged, `${planetType} seasonal cycle still drifting after ${s.yearsRun} years`);
    assert.ok(s.months.every((row) => row.every(Number.isFinite)), 'NaN in ' + planetType);
  }
});

/* ------------------------------------------------------------------ *
 * 3. Monotonicity: the direction of every response must be right.
 *    These catch sign errors, which are the errors most likely to
 *    survive a spot check and end up in front of a class.
 * ------------------------------------------------------------------ */

test('more CO2 is warmer', () => {
  let prev = -Infinity;
  for (const co2ppm of [50, 280, 1000, 5000]) {
    const T = P.run0dEBM({ co2ppm }).equilibriumCRaw;
    assert.ok(T > prev, `T did not increase going to ${co2ppm} ppm`);
    prev = T;
  }
});

test('thicker atmosphere is warmer', () => {
  let prev = -Infinity;
  for (const pressureBar of [0.1, 0.5, 1, 3, 10]) {
    const T = P.run0dEBM({ pressureBar }).equilibriumCRaw;
    assert.ok(T > prev, `T did not increase at ${pressureBar} bar`);
    prev = T;
  }
});

test('closer to the star is warmer, brighter star is warmer', () => {
  let prev = Infinity;
  for (const a of [0.5, 0.8, 1.0, 1.5, 2.0]) {
    const T = P.run0dEBM({ S0: P.effectiveS0(1.0, a) }).equilibriumCRaw;
    assert.ok(T < prev, `T did not decrease at ${a} AU`);
    prev = T;
  }
  prev = -Infinity;
  for (const m of [0.3, 0.5, 0.8, 1.0]) {
    const T = P.run0dEBM({ S0: P.effectiveS0(m, 1.0) }).equilibriumCRaw;
    assert.ok(T > prev, `T did not increase for a ${m} Msun star`);
    prev = T;
  }
});

test('more heat transport flattens the pole-to-equator contrast', () => {
  let prev = Infinity;
  for (const dRel of [0.05, 0.15, 0.35, 0.6]) {
    const s = P.latProfileSeasonal({ dRel, planetType: 'earth' });
    const contrast = s.annualMeanC[idx(0)] - s.annualMeanC[idx(90)];
    assert.ok(contrast < prev, `contrast did not shrink at D = ${dRel}`);
    prev = contrast;
  }
});

test('greater obliquity warms the poles and cools the equator', () => {
  // Published result: high obliquity feeds the poles more annual
  // sunlight and starves the equator, without much changing the global
  // mean. A model that freezes over at high obliquity has a runaway
  // seasonal-ice artefact, not a physical result.
  let prevPole = -Infinity, prevEquator = Infinity;
  for (const obliquityDeg of [0, 23.44, 45, 60, 90]) {
    const s = P.latProfileSeasonal({ obliquityDeg });
    assert.ok(s.annualMeanC[idx(90)] > prevPole,
      `annual-mean pole did not warm at ${obliquityDeg} degrees obliquity`);
    assert.ok(s.annualMeanC[idx(0)] < prevEquator,
      `equator did not cool at ${obliquityDeg} degrees obliquity`);
    assert.ok(Math.abs(s.globalMeanC - 14.1) < 4.0,
      `global mean moved to ${s.globalMeanC.toFixed(1)} at ${obliquityDeg} degrees; ` +
      'obliquity redistributes heat, it does not create or destroy it');
    prevPole = s.annualMeanC[idx(90)];
    prevEquator = s.annualMeanC[idx(0)];
  }
});

test('a habitable zone is farther out around a brighter star', () => {
  let prev = 0;
  for (const m of [0.1, 0.3, 0.6, 1.0, 1.5]) {
    const inner = P.habitableZone(m).conservative[0];
    assert.ok(inner > prev, `inner edge did not move out for ${m} Msun`);
    prev = inner;
  }
});

test('a bigger, younger planet is likelier to have a dynamo', () => {
  assert.strictEqual(P.magneticFieldEstimate(3.0, 4.5, false).label, 'Strong');
  assert.strictEqual(P.magneticFieldEstimate(1.0, 4.5, false).label, 'Strong');
  assert.strictEqual(P.magneticFieldEstimate(0.5, 4.5, false).label, 'Weak');
  assert.strictEqual(P.magneticFieldEstimate(0.107, 4.5, false).label, 'None');
  // Tidal locking is a one-level downgrade, never worse than that.
  for (const m of [0.3, 1.0, 3.0]) {
    const open = P.magneticFieldEstimate(m, 4.5, false).level;
    const locked = P.magneticFieldEstimate(m, 4.5, true).level;
    assert.ok(open - locked <= 1 && locked <= open, 'locking penalty is wrong at ' + m);
  }
});

/* ------------------------------------------------------------------ *
 * 4. Energy conservation and internal consistency
 * ------------------------------------------------------------------ */

test('the zero-D and one-D models agree on a uniformly lit planet', () => {
  // With no obliquity, no ice, and very strong heat transport, the
  // one-dimensional model should collapse onto the zero-dimensional one.
  const zero = P.run0dEBM({ albedoWarm: 0.30, co2ppm: 280 }).equilibriumCRaw;
  const one = P.latProfileSeasonal({ obliquityDeg: 0, dRel: 5.0, planetType: 'earth' });
  assert.ok(Math.abs(one.globalMeanC - zero) < 2.0,
    `0-D says ${zero.toFixed(2)}, 1-D says ${one.globalMeanC.toFixed(2)}`);
});

test('the tridiagonal solver actually solves the system', () => {
  const n = 40;
  const a = [], b = [], c = [], x = [];
  for (let i = 0; i < n; i++) {
    a.push(i === 0 ? 0 : -1);
    b.push(4 + i * 0.1);
    c.push(i === n - 1 ? 0 : -1);
    x.push(Math.sin(i) * 3 + 1);
  }
  const d = x.map((_, i) =>
    (i > 0 ? a[i] * x[i - 1] : 0) + b[i] * x[i] + (i < n - 1 ? c[i] * x[i + 1] : 0));
  const solved = P.tridiagSolve(a, b, c, d);
  solved.forEach((v, i) => assert.ok(Math.abs(v - x[i]) < 1e-9, 'row ' + i));
});

test('ice fraction is a smooth, monotone ramp between 0 and 1', () => {
  let prev = -Infinity;
  for (let T = 40; T >= -60; T -= 1) {
    const f = P.iceFraction(T);
    assert.ok(f >= 0 && f <= 1, `ice fraction ${f} at ${T} degC`);
    assert.ok(f >= prev - 1e-12, 'ice fraction is not monotone');
    prev = f;
  }
  assert.ok(P.iceFraction(30) < 0.001, 'a warm planet should have no ice');
  assert.ok(P.iceFraction(-40) > 0.999, 'a frozen planet should be fully iced');
  assert.ok(Math.abs(P.iceFraction(P.CONSTANTS.ICE_T_CENTER) - 0.5) < 1e-12);
});

test('the seasonal cycle conserves the annual mean it is built from', () => {
  const s = P.latProfileSeasonal({ planetType: 'earth' });
  s.lats.forEach((lat, i) => {
    const mean = s.monthsRaw.reduce((acc, step) => acc + step[i], 0) / s.stepsPerYear;
    assert.ok(Math.abs(mean - s.annualMeanC[i]) < 0.6,
      `annual mean at ${lat} disagrees with the months it came from`);
  });
});

test('every documented planet type is complete', () => {
  for (const [key, t] of Object.entries(P.PLANET_TYPES)) {
    for (const field of ['label', 'surfaceAlbedo', 'cloudFraction',
                         'transportFactor', 'mixedLayerM', 'massEarth']) {
      assert.ok(t[field] !== undefined, `${key} is missing ${field}`);
    }
    assert.ok(t.surfaceAlbedo > 0 && t.surfaceAlbedo < 1, key + ' has an impossible surface albedo');
    assert.ok(t.cloudFraction >= 0 && t.cloudFraction <= 1, key + ' has an impossible cloud fraction');
    assert.ok(t.transportFactor > 0, key + ' has an impossible transport factor');
  }
});

/* ------------------------------------------------------------------ *
 * 5. Clouds and derived heat transport
 * ------------------------------------------------------------------ */

test('clouds cool in the shortwave and warm in the longwave', () => {
  // Both effects must grow with cloud cover, in opposite directions.
  let prevAlbedo = -Infinity, prevLW = -Infinity;
  for (const f of [0, 0.2, 0.5, 0.8, 1.0]) {
    const a = P.cloudyAlbedos(0.15, f).planetary;
    const lw = P.cloudLongwave(f);
    assert.ok(a > prevAlbedo, `planetary albedo did not rise at f = ${f}`);
    assert.ok(lw >= prevLW, `longwave trapping did not rise at f = ${f}`);
    prevAlbedo = a; prevLW = lw;
  }
  // On Earth the net is cooling. If this flips, the terms are swapped.
  assert.ok(derived.cloudNetEffect(0.15, 0.67) < 0, 'Earth clouds should cool on balance');
});

test('cloud fraction is clamped to a physical range', () => {
  assert.strictEqual(P.cloudLongwave(-1), 0);
  assert.strictEqual(P.cloudLongwave(2), P.CONSTANTS.LW_CLOUD);
  assert.ok(P.cloudyAlbedos(0.15, 5).planetary <= 1);
});

test('a cloudier planet is colder, all else equal', () => {
  let prev = Infinity;
  for (const cloudFraction of [0, 0.3, 0.6, 0.9]) {
    const T = P.run0dEBM({ cloudFraction }).equilibriumCRaw;
    assert.ok(T < prev, `T did not fall at cloud fraction ${cloudFraction}`);
    prev = T;
  }
});

test('heat transport falls with rotation rate and rises with pressure', () => {
  let prev = -Infinity;
  for (const dayHours of [6, 12, 24, 48, 100]) {
    const d = P.diffusionFrom(dayHours, 1.0, 1.0);
    assert.ok(d > prev, `D did not rise with a longer day at ${dayHours} h`);
    prev = d;
  }
  prev = -Infinity;
  for (const pressureBar of [0.1, 0.5, 1, 4, 20]) {
    const d = P.diffusionFrom(24, pressureBar, 1.0);
    assert.ok(d > prev, `D did not rise with pressure at ${pressureBar} bar`);
    prev = d;
  }
});

test('a faster-spinning planet has a steeper pole-to-equator gradient', () => {
  let prev = -Infinity;
  for (const dayHours of [100, 48, 24, 12, 6]) {
    const s = P.latProfileSeasonal({ dayHours });
    const contrast = s.annualMeanC[idx(0)] - s.annualMeanC[idx(90)];
    assert.ok(contrast > prev, `contrast did not steepen at ${dayHours} h`);
    prev = contrast;
  }
});

test('clouds keep the rotation response from running away', () => {
  // The specific failure this guards: without explicit clouds, shortening
  // the day from 24 to 18 hours cooled the planet by nine degrees, because
  // the single-valued ice albedo made the feedback far too strong.
  const earth = P.latProfileSeasonal({ dayHours: 24 }).globalMeanC;
  const fast = P.latProfileSeasonal({ dayHours: 18 }).globalMeanC;
  assert.ok(earth - fast < 4,
    `an 18-hour day cooled the planet by ${(earth - fast).toFixed(1)} degC; ` +
    'that is the over-sensitivity the cloud term exists to damp');
});

test('a thick atmosphere flattens the temperature gradient', () => {
  const thin = P.latProfileSeasonal({ pressureBar: 1 });
  const thick = P.latProfileSeasonal({ pressureBar: 8 });
  const c = (s) => s.annualMeanC[idx(0)] - s.annualMeanC[idx(90)];
  assert.ok(c(thick) < c(thin) / 2,
    'pressure must feed heat transport, not only greenhouse forcing');
});
