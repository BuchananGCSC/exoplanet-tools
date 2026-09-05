# Reading list: the physics inside the simulator

An extension of the existing reading list, organised around what the code
actually computes rather than around topic areas. Each entry names the
part of `physics.js` it justifies, so a question about a specific number
has a specific place to go.

**On links.** The six items already on your list keep their URLs. For the
additions I have given full citations without links rather than risk
handing you a wrong arXiv identifier, which is exactly the kind of error
this whole exercise is about avoiding. Every one of them resolves on NASA
ADS from the title alone.

**Reading order.** If you want a single path through it, read §1 for the
energy balance framework, §2 for what makes it one-dimensional, §3 for
where the boundaries come from, then dip into §4 through §7 as questions
come up. The two starred items are the ones that would change how you
teach this if you only read two.

---

## 1. The energy balance framework

This is the spine. Everything the simulator does is a variation on
"absorbed sunlight minus emitted infrared, plus what the atmosphere moves
around."

**★ Pierrehumbert, *Principles of Planetary Climate*, Cambridge, 2010.**
Chapters 3 and 4 in particular. Chapter 3 builds the energy balance from
scratch and derives the ice-albedo bifurcation; chapter 4 is where the
grey-atmosphere and pressure-broadening arguments live. This is the book
behind the WHOI lecture notes already on your list, and it is the single
best answer to "why does the code look like this." Written for people who
want the derivation, not the result.
*Justifies:* the whole structure, `A_OLR`, `B_OLR`, `B_PRESSURE`.

**Budyko, "The effect of solar radiation variations on the climate of the
Earth," *Tellus* 21, 611 (1969).**
**Sellers, "A global climatic model based on the energy balance of the
earth-atmosphere system," *J. Appl. Meteorol.* 8, 392 (1969).**
The two papers, published independently the same year, that invented this
class of model, including the linearised OLR = A + B·T and the ice-albedo
catastrophe. Short, readable, and useful for showing students that a
model this simple was a genuine research contribution.
*Justifies:* `A_OLR + B_OLR * T`, the ice-albedo feedback loop.

**Myhre, Highwood, Shine & Stordal, "New estimates of radiative forcing
due to well mixed greenhouse gases," *Geophys. Res. Lett.* 25, 2715
(1998).**
Where 5.35·ln(C/C₀) comes from, and the range of concentrations over
which it holds. Worth knowing that it is a fit to line-by-line
calculations over roughly 100 to 1000 ppm, which is well inside the range
your sliders allow students to leave.
*Justifies:* `A_GHG`, and the honest limits on `greenhouseForcing`.

---

## 2. Making it one-dimensional: diffusion, seasons, heat capacity

**★ North & Coakley, "Differences between seasonal and mean annual energy
balance model calculations of climate and climate sensitivity," *J.
Atmos. Sci.* 36, 1189 (1979).**
This is the paper for the problem you hit. It works out exactly how a
seasonal energy balance model differs from an annual-mean one, why heat
capacity is what makes a solstice finite, and how to choose an effective
mixed-layer depth. If you read one thing about the change from
`latProfileEquilibrium` to `latProfileSeasonal`, read this.
*Justifies:* the time-stepping seasonal model, `mixedLayerM`, the whole
argument for why a fixed-declination equilibrium solve is the wrong
object.

**North, Cahalan & Coakley, "Energy balance climate models," *Rev.
Geophys. Space Phys.* 19, 91 (1981).**
The review that consolidates the diffusive one-dimensional formulation,
including the spherical form of the diffusion operator and how D is
calibrated against observed pole-to-equator contrast. Read this before
touching `D_SCALE`.
*Justifies:* `diffusionOperator`, `D_SCALE`, the `defaultD` values.

**Rose, "Climate Laboratory" (Brian E. J. Rose, University at Albany), the
`climlab` documentation and course notes.**
Open teaching material, in Python, that builds exactly these models up
from zero-dimensional to seasonal diffusive, with the derivations beside
runnable code. The closest existing thing to what you are building, and a
useful cross-check for the validation notebook: if `climlab` runs in
Pyodide, you can validate against a maintained implementation rather than
against your own arithmetic.
*Justifies:* everything, and it is the best source of alternative
implementations to check yourself against.

---

## 3. Habitable zone boundaries

**Kopparapu et al. 2013** — already on your list. When you go back to it,
the thing to pull out is Table 3, the polynomial coefficients now hard
coded in `HZ_COEFFS`, and the erratum, which corrected some of them.
Verify the numbers in the code against the paper before the first class
period; the test suite checks that they reproduce the published solar
boundaries, which is a strong check but not a proof that every digit is
right.
*Justifies:* `HZ_COEFFS`, `seffAt`, `habitableZone`.

**Kasting, Whitmire & Reynolds, "Habitable zones around main sequence
stars," *Icarus* 101, 108 (1993).**
The paper Kopparapu updates. Worth reading first, because it lays out the
physical reasoning — runaway greenhouse at the inner edge, maximum CO₂
greenhouse and Rayleigh scattering at the outer — in a way the 2013 paper
assumes you already know. It is also the origin of the tidal-locking
radius formula whose constant is sitting in `TIDAL_CONST`.
*Justifies:* the conceptual content of the habitable zone tab, and
`tidalLockRadius`.

**Shields, Ballard & Johnson 2016** — already on your list. Section 3 is
the one to reread: how the habitable zone shifts around M dwarfs, and why
ice albedo is lower there. That last point matters for the code, because
`ALPHA_ICE` is a single number regardless of stellar type, and it should
not be.
*Justifies:* an unfixed limitation, which is worth telling students about.

---

## 4. Tidally locked planets

**Joshi, Haberle & Reynolds, "Simulations of the atmospheres of
synchronously rotating terrestrial planets orbiting M dwarfs: conditions
for atmospheric collapse and the implications for habitability," *Icarus*
129, 450 (1997).**
The original atmospheric-collapse argument: how thick an atmosphere has
to be to keep the night side above the condensation point of its own main
constituent. This is the physics behind the collapse flag in
`tidallyLockedProfile`, and the reason the day-night heat transport
parameter is not just a cosmetic slider.
*Justifies:* `atmosphericCollapseRisk`, the meaning of `dRel` on a locked
planet.

**Yang, Cowan & Abbot 2013** — already on your list. The important caveat
for your model: the stabilising feedback in that paper is *clouds*, and
the simulator has no clouds at all. Its locked planets are therefore
systematically too extreme at the substellar point. Worth stating out
loud in the teacher guide.

**Barnes, "Tidal locking of habitable exoplanets," *Celest. Mech. Dyn.
Astron.* 129, 509 (2017).**
A careful treatment of when synchronisation actually happens, including
how much the answer depends on the tidal quality factor Q and the initial
rotation state — both of which are unstated assumptions folded into
`TIDAL_CONST`. Read this if a student asks how confident we are that
Proxima b is locked. The honest answer is less confident than the binary
result the tool displays.
*Justifies:* `tidalLockRadius`, and the size of the uncertainty on it.

---

## 5. Obliquity and seasons

**Spiegel, Menou & Scharf, "Habitable climates: the influence of
obliquity," *Astrophys. J.* 691, 596 (2009).**
Energy balance modelling of high-obliquity planets. The result to check
your model against: high obliquity generally *helps*, warming the poles
and leaving the global mean roughly unchanged. If a model freezes a
high-obliquity planet solid, it has a seasonal-ice artefact, which is
precisely the failure the albedo-memory change was introduced to fix.
*Justifies:* the `albedoMemoryYears` treatment, and the obliquity
monotonicity test.

**Armstrong, Barnes, Domagal-Goldman, Breiner, Quinn & Meadows, "Effects
of extreme obliquity variations on the habitability of exoplanets,"
*Astrobiology* 14, 277 (2014).**
Extends it to planets whose obliquity varies, which is the realistic case
for a planet without a large moon. Useful background for the Planetary
Biography capstone, where students choose an axial tilt and then treat it
as permanent.

---

## 6. Stars

**Eker et al., "Interrelated main-sequence mass-luminosity, mass-radius,
and mass-effective temperature relations," *Mon. Not. R. Astron. Soc.*
479, 5491 (2018).**
The source of the piecewise mass-luminosity relation, and also of the
mass-radius and mass-Teff relations the code currently approximates with
M^0.9. If you want the temperature that feeds the habitable zone
polynomial to be properly grounded, this is where to get it.
*Justifies:* `stellarLuminosity`, `stellarRadius`, `stellarTeff`.

**Van Grootel et al., "Stellar parameters for TRAPPIST-1," *Astrophys.
J.* 853, 30 (2018).**
The dynamical mass and luminosity measurement that the very-low-mass
branch of the code is calibrated against, and one of two hard anchors in
the test suite.

**Anglada-Escudé et al., "A terrestrial planet candidate in a temperate
orbit around Proxima Centauri," *Nature* 536, 437 (2016).**
The discovery paper for the worked example in your curriculum. Also a
good model of evidence-to-inference reasoning in its own right, which
makes it usable in the Planet [X] capstone rather than only as a
reference.

---

## 7. Where the model is knowingly wrong

Not further reading so much as a list of things to be able to say out
loud when a student pushes on the tool. Each has an entry above that
explains it properly.

- **No clouds.** The single largest omission. Clouds are the dominant
  uncertainty in real habitability modelling, and their stabilising
  effect is the entire point of the Yang paper on your list.
- **No rotation rate.** Meridional heat transport depends strongly on
  rotation, and `D_rel` is a free slider with no connection to it.
- **Ice albedo is a single number.** It should depend on stellar spectrum;
  ice is much darker under an M dwarf.
- **The linearised OLR has no runaway greenhouse.** The guard rails at
  −100 and +150 °C exist because the equations keep producing numbers
  after the physics has stopped applying. The real behaviour past the
  inner edge is a runaway, and the model cannot represent it.
- **The pressure and CO₂ terms double-count.** More total pressure at
  fixed ppm means more CO₂, so part of the pressure forcing is the CO₂
  forcing again. Kept separate because varying them independently is
  pedagogically useful, not because it is right.
- **Tidal locking is binary.** Real planets can settle into higher-order
  spin-orbit resonances; Mercury is in a 3:2, not a 1:1.

That last list is worth handing to students directly. A model that says
what it cannot do is a better object lesson than one that appears to know
everything.
