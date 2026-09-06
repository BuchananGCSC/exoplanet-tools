# Physics core: what changed and how to wire it in

## What this is

`physics.js` is now the only place the simulator's physical calculations
live. Everything else — the HTML, the Plotly code, the sidebar — is
presentation. The point is not tidiness. It is that there were at least
three implementations of this physics in circulation (the deployed file,
`exoplanet_climate_simulator_9.html`, and the Python notebook the code
comments refer to), nothing kept them in agreement, and the one that was
deployed was the oldest.

```
physics.js                   the calculations, no DOM, no globals
test/test_cases.json         the cross-language contract
test/harness.js              derived quantities the contract refers to
test/physics.test.js         Node suite: contract + sweeps + invariants
validation/physics.py        Python implementation for the notebook
validation/validation.ipynb  JupyterLite validation notebook
.github/workflows/tests.yml  runs the suite on every push
```

Run the tests with `node --test` from the repository root. No
dependencies, Node 18 or newer.

## Bugs this fixes

**The ice-albedo iteration returned non-converged answers.** The old
solver ran exactly eight outer iterations and returned iteration eight
whatever state it was in. Near the snowball bifurcation eight is nowhere
near enough. At S₀ = 1180 W/m² it reported −22.5 °C when the converged
answer is about −47 °C, a 24-degree error with no warning, in the flux
range that corresponds to the outer habitable zone. The solver now
iterates to a tolerance, under-relaxes, uses a smooth ice fraction
instead of a hard threshold so it stops chattering, and reports
`converged` honestly.

**The habitable zone was wider than any published definition.** The old
code divided by S_eff where it should have divided by its square root,
and the outer constant implied S_eff = 0.25, which is not a published
limit. The Sun's zone came out as 0.91–2.00 AU, with an outer edge past
even the optimistic early-Mars value. It now uses the Kopparapu et al.
2013 polynomial in stellar effective temperature and returns both the
conservative and optimistic pairs: 0.98–1.69 and 0.75–1.77 AU for the
Sun.

**The solstice profile was a steady-state solve of a transient state.**
Solving for radiative equilibrium at fixed solstice insolation asks what
temperature a latitude would reach if the sun stopped where it is and
stayed there. Under polar day the answer runs away: Earth's north pole
came out at +51 °C, and above about 65° of obliquity it pinned to the
150 °C guard rail. `latProfileSeasonal` now time-steps through the year
with a real heat capacity and gives +8.5 °C at the summer pole against an
observed Arctic July mean near 0 °C. `latProfileEquilibrium` still
exists, correctly labelled as an upper bound, because it is genuinely
useful for showing students what heat capacity is *for*.

**The age control did not affect tidal locking.** The lock radius had
4.5 Gyr baked into a constant while the interface offered a system-age
slider, so age moved the dynamo estimate but not the locking result,
which is backwards in terms of which one is actually age-sensitive. Age
now enters with the t^(1/6) dependence that follows from the a⁶ scaling
of the locking timescale.

**Planet type silently set planet mass.** The dynamo heuristic looked
mass up from the planet-type control, so choosing "Desert World" quietly
made the planet 0.3 M⊕ and guaranteed no magnetic field, for a reason no
student could see, while the calculator tab let them enter a completely
different mass for the same planet. `magneticFieldEstimate` now takes
mass explicitly.

**The Neptune density preset disagreed with its own label.** The button
in `exoplanet-orbit-calculator.html` said 1.64 and set 1.27. Presets live
in `DENSITY_PRESETS` now, so the label and the value come from the same
place.

**A stale comment about heat transport.** The old file set `D_rel = 0.20`
for an Earth-like planet with a comment beside it saying 0.35 reproduces
Earth's pole-to-equator contrast. Re-tuning against the seasonal model
settles it in favour of the default: 0.20 gives a 14.1 °C global mean and
a 24 °C equator. The comment was the stale half, and it is gone.

## Two behaviour changes worth knowing about

**Seasonal albedo responds to climate, not to weather.** Ice cover is
computed from a running mean temperature with a five-year memory, not the
instantaneous temperature. Perennial sea ice and ice sheets take years to
decades to grow or retreat. Without this, any planet with a cold season
grew bright ice every winter that reflected away the following summer,
and the model tipped into a spurious snowball — a 60° obliquity planet
froze solid, the opposite of the published result that high obliquity
warms a planet by feeding its poles more annual sunlight. Five years is a
choice, not a measurement; the notebook has a cell for testing how much
it matters.

**Clouds are an explicit term, not a tuned albedo.** `PLANET_TYPES` no
longer has a single `albedo`. It has `surfaceAlbedo` (the ground) and
`cloudFraction` (the deck above it), and clouds now act in both directions:
reflecting sunlight (cooling) and trapping infrared (warming). `A_OLR` moved
from 210.0 to 236.3 to compensate for the longwave term becoming separate.
Calibration is checked against CERES in the test suite.

**Heat transport is derived, not chosen.** The Diffusion D slider is gone,
replaced by a Day length slider running 6 to 100 hours on a log scale.
`diffusionFrom(dayHours, pressureBar, transportFactor)` computes D following
Williams & Kasting 1997. `defaultD` per planet type is replaced by
`transportFactor`, which stands in for ocean circulation. Tidally locked
planets deliberately keep a bounded `D_LOCKED_DEFAULT` instead, because
deriving transport from an orbital period gives a flat, contrast-free
planet.

**Effective heat capacity is now a per-planet-type property.** It sets
the thermal relaxation time, so it controls how large the seasonal swing
is. A dry world stores almost no heat and swings 45 °C at midlatitudes; a
waterworld swings about 2 °C. This gives "Desert World" a consequence
students can see and reason about, which it did not have before.

## Wiring it into the simulator

1. Add `<script src="physics.js"></script>` in `<head>`, before the main
   inline script. A classic script tag, not a module: ES module imports
   fail over `file://`, and a teacher opening the HTML from a flash drive
   should still get a working tool.

2. Delete these from the inline script and let `Physics` provide them:
   `stellarLuminosity`, `stellarLifespan`, `stellarType`,
   `habitableZone`, `tidalLockRadius`, `effectiveS0`, `run0dEBM`,
   `solsticeInsolation`, `monthlyDeclination`, `tridiagSolve`,
   `latProfileRotating`, `tlProfile`, `magneticFieldEstimate`,
   `pressureForcing`, `atmThicknessLabel`, `clampC`, `clampK`,
   `PLANET_ALBEDO`, `DIFFUSION_DEFAULTS`, `PLANET_MASS_EARTH`, and the
   constants block from `S0_SUN` down through `C_heat`.

3. At the top of the inline script, destructure what the UI code uses:

   ```js
   const {
     stellarLuminosity, stellarTeff, habitableZone, effectiveS0,
     tidalLockRadius, isTidallyLocked, magneticFieldEstimate,
     run0dEBM, latProfileSeasonal, latProfileEquilibrium,
     tidallyLockedProfile, kepler, planetaryProperties,
     PLANET_TYPES, DENSITY_PRESETS, MODEL_RANGE,
   } = Physics;
   ```

4. `state.diff` becomes `state.dayHours`, and the `sl-diff` slider becomes
   `sl-day` on a log scale (`dayFromSlider` / `sliderFromDay` helpers).
   `derive()` returns the computed `dRel` so every tab and the record block
   report the same number.

5. Signature changes to fix at the call sites:

   | old | new |
   |---|---|
   | `habitableZone(m)` returns `[inner, outer]` | returns an object; use `.conservative` and `.optimistic` |
   | `run0dEBM(T0, CO2, S0, alb, P)` positional | `run0dEBM({ T0_K, co2ppm, S0, surfaceAlbedo, cloudFraction, pressureBar })` |
   | `latProfileRotating(...)` returns `[lats, temps, clipped]` | `latProfileSeasonal({...})` returns an object |
   | `tlProfile(...)` returns an array triple | `tidallyLockedProfile({...})` returns an object |
   | `magneticFieldEstimate(type, age, locked)` | `magneticFieldEstimate(massEarth, age, locked)` |
   | `tidalLockRadius(m, mp)` | `tidalLockRadius(m, mp, ageGyr)` |
   | `PLANET_TYPES[x].albedo` | `cloudyAlbedos(surfaceAlbedo, cloudFraction).planetary` |
   | `PLANET_TYPES[x].defaultD` | `diffusionFrom(dayHours, pressureBar, transportFactor)` |
   | `latProfileSeasonal({ dRel })` | `latProfileSeasonal({ dayHours })` |

6. `latProfileSeasonal` takes about 50 ms for an Earth-like planet and up
   to 150 ms for a dry world, because it marches until the annual cycle
   repeats. That is fine on a click and visible on a slider drag, so
   debounce slider input by about 150 ms before recomputing.

7. Show the flags. Every model function returns `converged` and
   `outOfRange`. A result that did not converge, or that hit the guard
   rails, is the most teachable moment the tool produces, and it should
   read as a finding about the limits of a linearised model rather than
   as an error.

## Keeping it from drifting again

The CI workflow does two things. It runs the test suite, and it greps the
HTML files for private copies of functions that belong in `physics.js`.
If either fails, do not deploy.

`test_cases.json` is the contract. Both the Node suite and the Python
notebook read the same file, so a Python implementation that passes it
agrees with the browser. Note what that does and does not prove: it shows
the two have not drifted, not that either is right. Only the cases marked
`"source": "published"` check correctness, because only those compare
against something outside this project. When you settle a question in the
notebook, add a case with a `reference` string. That is how the contract
gets stronger.
