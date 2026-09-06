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
where the boundaries come from, then dip into §4 through §8 as questions
come up. §7 is new and is where planet mass finally earns its keep. The
starred items are the ones that would change how you teach this if you
only read a few.

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

## 5b. Clouds

The model now represents clouds explicitly, with a shortwave term that cools
and a longwave term that warms. These are the sources behind those numbers.

**Loeb et al., "Toward optimal closure of the Earth's top-of-atmosphere
radiation budget," *J. Climate* 22, 748 (2009), and the CERES EBAF data
product documentation.**
Where the cloud radiative effect numbers come from: about −47 W/m²
shortwave, +26 W/m² longwave, net −20 W/m² globally. `ALPHA_CLOUD` is solved
from Earth's planetary albedo and `LW_CLOUD` is set by the longwave figure,
so these are the observations the cloud terms are pinned to. The CERES data
is public and browsable, which makes it usable in class directly.
*Justifies:* `ALPHA_CLOUD`, `LW_CLOUD`, and the three contract cases in the
`clouds` group.

**Yang, Cowan & Abbot 2013** — already on your list, and now more directly
relevant. The stabilising feedback in that paper is substellar cloud
formation. The model can now represent clouds but not their response to
temperature, so it captures half of what that paper is about. Reading it
alongside the notebook's cloud section makes clear what is still missing.

**Ramirez, "A New 2D Energy Balance Model for Simulating the Climates of
Rapidly and Slowly Rotating Terrestrial Planets," *Planet. Sci. J.* 5, 2
(2024).**
Contains a cloud parameterization in which cover responds to temperature —
roughly 50% for Earth at 288 K, rising when warmer. This is the next piece
of physics for the simulator, and the paper is the place to get it right. A
first attempt at it worked on the hot side and failed on the cold side; see
the notebook for why.
*Justifies:* nothing yet. This is the roadmap.

---

## 5c. Heat transport as a derived quantity

`D` is no longer a slider. It comes from day length, atmospheric pressure,
and planet type.

**★ Williams & Kasting, "Habitable planets with high obliquities," *Icarus*
129, 254 (1997).**
The paper that makes D a function of rotation rate, pressure, mean
molecular mass, and atmospheric heat capacity instead of a fitted constant.
This is the single source behind the day-length slider. It is also, usefully,
an obliquity paper, so it does double duty with §5.
*Justifies:* `diffusionFrom`, `D_EARTH_REL`, `D_ROTATION_EXPONENT`.

**Farrell, "Equatorial superrotation and the transport of angular momentum
in atmospheres of the outer planets," and the rotation-scaling argument it
supplies (1990).**
Where the Ω⁻² dependence originates: faster rotation means stronger Coriolis
deflection, narrower circulation cells, and less poleward transport. Read
this for the mechanism rather than the formula.

**Vladilo et al., "Modeling the surface temperature of Earth-like planets,"
*Astrophys. J.* 804, 50 (2015).**
**Read this one immediately after Williams & Kasting.** Vladilo's group
compared the Ω⁻² dependence against 3D global circulation models and found
it unsupported, preferring a weaker dependence, with agreement good at high
rotation rates and poor at low ones. The simulator uses the exponent your
students can move; this is the paper that says the value is arguable.
*Justifies:* the comment attached to `D_ROTATION_EXPONENT`, and the honest
answer when a student asks how confident we are.

**Haqq-Misra et al., "An Energy Balance Model for Rapidly and Synchronously
Rotating Terrestrial Planets," *Planet. Sci. J.* 3, 32 (2022).**
Describes HEXTOR, a direct descendant of the Williams & Kasting model, and
reports the specific failure that shaped this simulator's design: applying
the rotation dependence inside a tidally locked EBM gives very large D and
completely flat temperature profiles. That is why Tab 6 keeps a bounded
default instead of deriving transport from the orbital period.
*Justifies:* `D_LOCKED_DEFAULT`, and the deliberate inconsistency between
Tabs 5 and 6.

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

## 7. Atmospheres: what a planet can keep, and what warms it

This section is new, and it exists because planet mass used to have almost
no consequences in the code. Escape velocity is what connects a planet's
mass to the air above it, and it is the piece that lets "small, therefore
dry" follow from something rather than be asserted.

**★ Catling & Kasting, *Atmospheric Evolution on Inhabited and Lifeless
Worlds*, Cambridge, 2017.**
The book to own for this whole section. Chapter 5 is thermal escape done
properly, including where the Jeans picture stops working. If you read one
thing here, read this — it is the atmospheric counterpart to Pierrehumbert
in §1, and between them they justify most of the model.
*Justifies:* `gasRetention`, `JEANS_RETENTION_FACTOR`, the whole §3.5.

**Jeans, *The Dynamical Theory of Gases*, Cambridge, 1916.**
The original: molecules in the tail of the Maxwell–Boltzmann distribution
exceed escape velocity and leave, so an atmosphere is always evaporating,
just usually slowly. Worth showing students that the mechanism is
statistical rather than a threshold — nothing "switches on."
*Justifies:* the form of the retention test.

**Chamberlain & Hunten, *Theory of Planetary Atmospheres*, Academic Press,
2nd ed., 1987.**
Where the exobase, the escape parameter and the factor-of-six style rule
of thumb are set out carefully. Also the source of the honest caveat: the
temperature that matters is the exosphere's, not the surface's, and they
differ by a factor of three or four for Earth.
*Justifies:* `T_EXO_EARTH_K`, `exosphereTemperature`.

**Hunten, "Thermal and nonthermal escape mechanisms for terrestrial
bodies," *Planetary and Space Science* 30, 773 (1982).**
The catalogue of everything the model leaves out — sputtering, pickup
ions, photochemical escape, impact erosion. Read it to know how much the
thermal answer is missing, which for Mars is most of the story.
*Justifies:* the non-thermal caveat the interface prints whenever the
magnetic field comes out weak or absent.

**★ Zahnle & Catling, "The Cosmic Shoreline: The Evidence that Escape
Determines which Planets Have Atmospheres, and what this May Mean for
Proxima Centauri b," *Astrophysical Journal* 843, 122 (2017).**
Plots escape velocity against lifetime stellar XUV for every solar system
body and every measured exoplanet, and finds a startlingly clean dividing
line. This is the modern, empirical version of the diagram in §8 of the
validation notebook, and it is where the M-dwarf problem becomes concrete:
planets around active M dwarfs sit on the wrong side of the shoreline.
*Justifies:* the warning that this model is optimistic around flare stars,
since it scales exosphere temperature with bolometric flux rather than XUV.

**Jakosky et al., "Mars' atmospheric history derived from upper-atmosphere
measurements of ³⁸Ar/³⁶Ar," *Science* 355, 1408 (2017).**
The MAVEN isotope result: most of Mars's atmosphere was lost to space,
not buried. The reason the tool says, whenever a world's field comes out
weak, that Mars kept CO₂ thermally and lost it anyway.

**Wordsworth & Pierrehumbert, "Hydrogen-nitrogen greenhouse warming in
Earth's early atmosphere," *Science* 339, 64 (2013).**
Collision-induced absorption: hydrogen has no dipole, but two colliding
molecules briefly do, and in a thick H₂ atmosphere that is a serious
greenhouse effect. The model does not include it, which is why a
hydrogen-rich world comes out too cold and now says so.

**Byrne & Goldblatt, "Radiative forcing at high concentrations of
well-mixed greenhouse gases," *Geophysical Research Letters* 41, 152
(2014).**
Extends the Myhre fits well past the range the sliders can reach. The
place to go if you ever want the CO₂ term to stay honest at Venus-like
partial pressures, or to know how badly the methane square root
misbehaves when extrapolated.
*Justifies:* the "beyond the fitted range" flag on methane.

**On why there is no oxygen term.** Nothing new is needed here — it is in
Pierrehumbert chapter 4 — but it is the question students ask most, so it
is worth having the answer ready. Nitrogen and oxygen are homonuclear
diatomics: two identical atoms, perfectly symmetric, no dipole moment, so
their one vibrational mode does not couple to infrared. They cannot absorb
the radiation a planet is trying to emit, and no amount of either warms
it. CO₂ and methane can flex into asymmetric shapes and water is bent
already, so those three absorb. An oxygen slider in the forcing would not
be a simplification, it would be wrong; oxygen's real effect is ozone,
and therefore ultraviolet shielding.

---

## 8. Where the model is knowingly wrong

Not further reading so much as a list of things to be able to say out
loud when a student pushes on the tool. Each has an entry above that
explains it properly.

- **Clouds do not respond to temperature.** They are represented, with both
  their cooling and warming effects, but the cover is fixed for a given
  surface. A warming planet should grow more cloud, which reflects more
  sunlight; that stabilising feedback is missing, and it is the largest
  remaining gap. It is the entire point of the Yang paper on your list.
- **The rotation exponent is disputed.** Williams & Kasting use 2 and this
  model follows them. Vladilo's comparison against 3D models says that is
  too strong. Students are moving a slider whose sensitivity is an open
  research question, which is worth telling them.
- **Very slow rotators develop day-night swings the model cannot see.**
  Everything here is daily-averaged. Beyond about a hundred hours, that
  assumption stops holding, which is why the day-length slider stops there.
- **Ice albedo is a single number.** It should depend on stellar spectrum;
  ice is much darker under an M dwarf.
- **The linearised OLR has no runaway greenhouse.** The guard rails at
  −100 and +150 °C exist because the equations keep producing numbers
  after the physics has stopped applying. The real behaviour past the
  inner edge is a runaway, and the model cannot represent it.
- **The pressure and CO₂ terms used to double-count.** `greenhouseForcing`
  still does: more total pressure at fixed ppm means more CO₂, so part of
  its pressure term is the CO₂ term again. `greenhouseForcingMix`, which
  is what the app now calls, does not — CO₂ enters as a partial pressure
  and the broadening term is deliberately not added on top. The old
  function is kept only so the test contract still has something to pin.
- **No non-thermal escape.** The model computes molecules leaking away
  because they are hot. It does not compute the solar wind stripping an
  unprotected atmosphere, which is how Mars actually lost one it could
  hold thermally. The interface says so; the model cannot.
- **No photochemistry.** Ozone shielding is a threshold on oxygen
  abundance, not a calculation. There is no ozone in the radiative scheme
  and no ultraviolet in the energy budget.
- **Hydrogen's greenhouse effect is missing.** Collision-induced
  absorption is real and strong in thick H₂ atmospheres (see §7), so
  hydrogen-rich worlds come out colder here than they should.
- **Methane past ~100 ppm is extrapolation.** The square-root fit is
  anchored near 1.7 ppm. The model flags it rather than clipping it,
  because a student pushing that slider should be told the curve has left
  its evidence behind.
- **Tidal locking is binary.** Real planets can settle into higher-order
  spin-orbit resonances; Mercury is in a 3:2, not a 1:1.
- **No continents, oceans, or topography** — only latitude. The
  `transportFactor` carried by the water-inventory slider is a crude stand-in
  for ocean circulation, chosen rather than measured. The model never
  produces an Antarctica, which is why an Earth-like planet comes out with
  100% livable surface.

That last list is worth handing to students directly. A model that says
what it cannot do is a better object lesson than one that appears to know
everything.
