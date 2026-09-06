# Exoplanet Tools: handoff

Written September 2026. Supersedes the earlier handoff. Read this first if
you come back after a break, hand the project to someone else, or start a
fresh conversation about it.

---

## Where things stand

Two public repositories, both deploying to GitHub Pages.

**`BuchananGCSC/exoplanet-tools`** — the student-facing tools.

```
physics.js                          every physical calculation, no DOM
exoplanet_climate_simulator.html    seven-tab simulator
exoplanet-orbit-calculator.html     standalone Kepler + planetary properties
index.html                          landing page linking both
README-physics.md                   integration and maintenance notes
reading-list-physics.md             sources mapped to specific constants
package.json
test/
  test_cases.json                   cross-language contract, 61 cases
  harness.js                        derived quantities the contract refers to
  physics.test.js                   87 tests: contract + sweeps + invariants
.github/workflows/tests.yml         runs on every push, every branch
```

**`BuchananGCSC/jupyterlite`** — validation, from the `jupyterlite/demo`
template.

```
content/
  validation.ipynb    runs the contract in Python, plus diagnostics
  physics.py          independent Python implementation
  test_cases.json     copy of the contract
```

Live at `buchanangcsc.github.io/jupyterlite/lab/index.html`. Also
`/repl/index.html` for a bare console and
`/notebooks/index.html?path=validation.ipynb` for the notebook alone.

**Current status:** 87/87 JavaScript tests passing, 61/61 Python contract
cases passing, both CI steps green.

---

## The one thing to understand

Every physical calculation lives in `physics.js`. Nothing else computes a
temperature, a distance, or a luminosity. This is the fix for the problem
that started everything: three divergent implementations were in
circulation, nothing kept them in agreement, and the deployed one was the
oldest and least correct.

Two mechanisms prevent that recurring.

`test/test_cases.json` is a **contract**, readable by any language. The Node
suite runs it and so does the Python notebook. **Note carefully what that
does and does not prove:** agreement shows the two have not drifted, not
that either is right. Of 61 cases, 22 are marked `"source": "published"` and
compare against something outside the project. **Growing that number is the
highest-value maintenance task.**

The CI workflow greps both HTML files for private copies of functions that
belong in `physics.js`. If either grows its own `stellarLuminosity` or stops
loading `physics.js`, the build fails. Do not deploy on red.

---

## What the model does

A one-dimensional diffusive energy balance model, in three modes.

**`run0dEBM`** — globally averaged, integrated to steady state.

**`latProfileSeasonal`** — the main one. Time-steps through the year with a
real surface heat capacity, marched until the annual cycle repeats. Backward
Euler, so a monthly step is stable.

**`tidallyLockedProfile`** — the same diffusion operator with co-latitude
measured from the substellar point.

**`latProfileEquilibrium`** also exists and is tested but is deliberately
**not wired into the student interface**. It solves for steady state at a
fixed declination, which asks what a latitude would reach if the sun stopped
where it is and stayed there. Under polar day the answer runs away. Kept
available for a teacher-facing figure showing why the tool doesn't draw it.

Radiation is linearised, `OLR = A + B·T`. Clouds are explicit, with a
shortwave term that cools and a longwave term that warms. Heat transport is
derived from day length, pressure, and planet type rather than set by hand.

---

## Bugs fixed, and why each mattered

Recorded because each is a plausible thing to reintroduce.

**The ice-albedo solver returned non-converged answers.** Eight fixed outer
iterations with a hard ice threshold, returning iteration eight whatever
state it held. At S₀ = 1180 W/m² it reported −22.5 °C when the converged
answer was about −47 °C — silent, in the flux range corresponding to the
outer habitable zone. Now iterates to tolerance, under-relaxes, uses a
smooth ice fraction, and reports `converged`.

**The habitable zone was wider than any published definition.** Divided by
S_eff where it should have divided by its square root; the outer constant
implied S_eff = 0.25. The Sun's zone came out 0.909–2.000 AU. Now uses the
Kopparapu et al. 2013 polynomial in stellar effective temperature:
0.982–1.690 AU conservative, 0.751–1.767 AU optimistic.

**The solstice profile was a steady-state solve of a transient state.**
Earth's north pole came out at +51 °C. The seasonal model gives +8.4 °C
against an observed Arctic July mean near 0.

**System age did not affect tidal locking.** Age moved the dynamo estimate
but not the locking result, which is backwards.

**Planet type silently set planet mass.** Choosing "Desert World" quietly
made the planet 0.3 M⊕ and guaranteed no magnetic field, invisibly. Mass is
now explicit and displayed.

**The Neptune density preset disagreed with its own label** — said 1.64, set
1.27. Presets generate from `DENSITY_PRESETS` in both tools.

**Venus's pole-to-equator contrast was 57.9 °C** against a real value of a
few degrees. Pressure fed greenhouse forcing but not heat transport. Now
1.0 °C.

---

## Judgement calls

Choices, not facts. Someone maintaining this should know they were chosen.

**Clouds are explicit but fixed.** `ALPHA_CLOUD = 0.374` is solved from
Earth's planetary albedo of 0.30 at 67% cover over a clear-sky albedo of
0.15; `LW_CLOUD = 39.0` is set so the longwave effect matches CERES. The
check: −51 W/m² shortwave against observed −47, +26 against +26, net −25
against −20. `A_OLR` moved from 210.0 to 236.3 to compensate for the
longwave term becoming separate.

**The rotation exponent is disputed and we picked one.**
`D_ROTATION_EXPONENT = 2.0`, from Williams & Kasting 1997 following Farrell
1990. Vladilo's group compared against 3D circulation models and found it
unsupported. Ramirez 2024 fitted coefficients to GCM runs instead. Kept at 2
because it has a citation; it is a named constant and changing it is a
one-character edit.

**Tidally locked planets are deliberately not rotation-scaled.** Their
rotation equals their orbital period, which gives D of 7–25 and a flat,
contrast-free planet. Haqq-Misra et al. report exactly this failure. Tab 6
keeps `D_LOCKED_DEFAULT`. The inconsistency between Tabs 5 and 6 is the
honest one.

**Seasonal albedo responds to climate, not weather.** Ice cover comes from a
running mean with a five-year memory. Without it, any planet with a cold
season grew winter ice that reflected away the following summer, and a 60°
obliquity planet froze solid — the opposite of the published result.

**Effective mixed-layer depth is per planet type** (8 m Earth-like, 2 m
desert, 40 m ocean), setting the thermal relaxation time and therefore the
seasonal swing: 19 / 52 / 2 °C at 46°N.

**`transportFactor`** (0.6 / 1.0 / 1.6) stands in for ocean circulation,
which the Williams & Kasting atmospheric formula doesn't cover. Chosen, not
measured.

**Climate zones are Köppen-flavoured but thermal only.** No precipitation,
so no desert/rainforest distinction. Classification uses both warmest and
coldest season, because tundra and temperate forest can share an annual mean
and differ entirely in winter.

---

## Known limitations, stated honestly

Worth handing to students directly.

- **Clouds don't respond to temperature.** A warming planet should grow more
  cloud, reflecting more sunlight. That stabilising feedback is missing and
  is the largest remaining gap. A first attempt worked on the hot side and
  failed on the cold side, because tying both cloud effects to one number
  makes a cold planet lose its greenhouse with nothing to offset it.
- **The rotation exponent is an open research question**, and students are
  moving a slider whose sensitivity depends on it.
- **Very slow rotators develop day-night swings the model can't see.**
  Everything is daily-averaged; beyond about 100 hours that stops holding.
- **Ice albedo is one number**, independent of stellar spectrum. Ice is much
  darker under an M dwarf.
- **The linearised OLR has no runaway greenhouse.** The −100/+150 °C guard
  rails exist because the equations keep producing numbers after the physics
  has stopped applying.
- **Pressure and CO₂ forcing double-count.** More pressure at fixed ppm
  means more CO₂. Kept separate because varying them independently is
  pedagogically useful, not because it is right.
- **Tidal locking is binary.** Mercury is in a 3:2 resonance.
- **No continents, oceans, or topography** — only latitude. The model never
  produces an Antarctica, which is why an Earth-like planet shows 100%
  livable surface.

---

## Open work, in priority order

**1. Document sync — the largest remaining piece, and it is your prose.**

Two files describe it. `document-sync-list.md` locates thirteen items across
the teacher guide, student handout, and limitations doc.
`numbers-that-moved-round2.md` covers the clouds-and-rotation round and adds
four more. Neither has been acted on.

The ones that matter most:

- The instruction to "map the summer solstice profile," in both documents.
  That tab no longer produces one. Students should map the climate zone
  bands directly — a rewrite, and a simplification.
- The zone boundary rule ("wherever the curve crosses −10 °C"), superseded
  by the zone bands.
- Any mention of the **Diffusion D slider**, which no longer exists, and the
  teacher guide note that planet type sets its default. Planet type now sets
  surface albedo, cloud cover, heat storage, and an ocean-circulation
  factor — not transport.
- The limitations document's "no clouds" and "no rotation rate" entries.
  Both are now partly addressed and need rewriting rather than deleting.
- Any **Desert or Ocean world temperature** quoted anywhere. Both moved
  substantially.
- The worked example climate row: roughly 70 °C substellar, −34 °C
  terminator, −73 °C night side for Proxima b.

The rubric, peer review checklist, and worked example handout were never
scanned — they weren't in project knowledge. Upload them for a scan.

**2. Teacher guide, Tab 5 section.** Needs rewriting, not editing.

**3. Day length as a Planetary Dossier field.** It has a formation story the
Biography capstone can trace (angular momentum, giant impacts, tidal
spin-down) and direct consequences the Alien Project needs (circadian
rhythm, thermoregulation, activity pattern). Seasonal swing is a second
candidate.

**4. Temperature-responsive clouds.** The most valuable next physics. Needs
care on the cold side; see the notebook's closing section.

**5. Grow the published-source cases.** Unvalidated, roughly by importance:
the linear OLR fit outside Earth-like conditions; `B_PRESSURE = 4.0`, a
fitted number with no source; the transport factors; the albedo memory
timescale; the dynamo heuristic against McIntyre, Lineweaver & Ireland 2019.

**6. Try `climlab` under Pyodide.** `%pip install climlab` in the notebook.
If it works, you can validate against a maintained implementation rather
than your own arithmetic — the one gap the current setup cannot close.

**7. Interface work.** You've said twice that the tool presents a lot in
small print, and that concern has survived every fix. If it becomes a
redesign rather than spot fixes, that's the point where Claude Code earns
its setup cost, because interface iteration needs a visual check on every
change and a chat setup can't see the screen.

**8. Two curriculum questions**, unrelated to code. Whether the Planet [X]
capstone confirms the fictional planet at the end (more gradable) or leaves
it unconfirmed (truer to how Planet Nine research actually sits). And the
Indiana 2016 versus 2023 standards comparison against the capstone content
areas.

---

## Maintenance notes

**Changing a number in `physics.js`?** Run `node --test` before pushing. If
a published-source case fails, the message names the paper it disagrees with.

**Adding physics?** Three places: `physics.js`, a case in `test_cases.json`,
and a mirror in `physics.py`. The contract makes the third checkable.

**`test_cases.json` exists in two repositories** and must stay identical.
Treat `exoplanet-tools/test/` as the original.

**The seasonal model takes 50–150 ms.** Fine on a click, visible on a slider
drag. Keep slider input debounced.

**Tab 5 plot heights** are set by ID in the stylesheet under `.plot-half`.
Two-character edits, safe to make directly in GitHub.

**A workflow file GitHub cannot parse produces no run and no error.**
Silence in the Actions tab means check the YAML, not that the commit failed.
This cost an hour once. The `on:` block must be `push:` / `pull_request:` /
`workflow_dispatch:` with no branch filters, or pushes to a working branch
run nothing.

**Uploading through the GitHub web interface:** drag whole folders, not
their contents, or subdirectories get flattened. To replace an existing
file, the local filename must match exactly; renaming in the editor creates
a collision rather than an overwrite.

---

## Reading

`reading-list-physics.md` maps sources to the specific parts of `physics.js`
they justify, and flags where the literature disagrees. Three starred items:
Pierrehumbert's *Principles of Planetary Climate* chapters 3 and 4 for the
framework, North & Coakley 1979 for why a seasonal model differs from an
annual-mean one, and Williams & Kasting 1997 for the transport
parameterization the day-length slider is built on.
