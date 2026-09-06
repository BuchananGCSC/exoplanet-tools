# Document sync: what needs your attention

A located list, not rewrites. Every item gives the file, the line, what it
says now, and what is true after the physics changes. Line numbers are from
the plain-text copies in project knowledge, so they will be close but not
exact in the Word versions — the quoted text is the reliable anchor.

Items are ordered by how wrong they are, not by where they appear.

---

## Tier 1 — Wrong, and a student would notice

### 1. Teacher guide, line 155 — "map the summer solstice profile"

> Also specify which time slice to map: have students use the **summer
> solstice** profile, since that is what the Tab 5/6 record block reports.

**Handout, line 193 says the same thing:**

> Map your **summer solstice** profile (the one your Record block reports).

Tab 5 no longer reports a solstice profile. It reports annual mean, with
warmest-month and coldest-month curves around it, and named climate zones.
The instruction now points at something that isn't on the screen.

This is a rewrite, not a number swap, and it's a simplification: students
map the **climate zone bands directly**. The tool has already done the
classification. The parenthetical about winter looking different is no
longer needed either, because both seasons are visible at once.

Note this also removes a genuine awkwardness in the old version. A solstice
snapshot is asymmetric by definition, so students mapping one were drawing a
world where one hemisphere was permanently in summer. Annual mean is
symmetric, which is what the mapping table on handout line 181 already
claims ("Horizontal bands, symmetric north/south"). That row was quietly
inconsistent with the tab it described. It's now correct.

### 2. Teacher guide + handout — the zone boundary rule

**Teacher guide, line 150 (table):**

> Wherever the curve crosses the Ice threshold (−10°C) or Boiling (100°C)
> reference lines already drawn on the chart

**Handout, line 191:**

> Use the Ice threshold (−10°C) and Boiling (100°C) lines already drawn on
> your graph as your zone boundaries

Superseded. Tab 5 now shades named zones behind the curves and lists their
latitude ranges in the record block, so students read boundaries off the
chart rather than deriving them from threshold crossings. The −10°C line is
still drawn, but as a reference, not as the zone rule.

Worth keeping the threshold reasoning somewhere for tidally locked planets
(Tab 6), where the zones are also computed now but the concentric-ring
mapping is less obvious.

### 3. Worked example, teacher guide line 67 — habitable zone

> HZ is very close in for a dim M dwarf (0.036–0.079 AU)

Now **0.042–0.082 AU** (conservative). The optimistic range is
0.032–0.087 AU if you want to show both. Proxima b at 0.0485 AU is still
comfortably inside either.

### 4. Limitations doc, lines 37–41 — the habitable zone entry

The whole "Habitable zone boundary precision" item is now fixed and should
be deleted or rewritten as a resolved issue. It currently reads:

> the outer edge runs about 18% too wide (2.00 AU vs. Kopparapu's 1.70 AU)

That was true and is no longer. The simulator uses Kopparapu's polynomial
in stellar effective temperature and returns 0.982–1.690 AU for the Sun.
The spectrum-dependence the entry describes as missing is now present.

---

## Tier 2 — Numbers that moved a little

### 5. Worked example, teacher guide line 69 — climate

> ~84°C substellar, ~-28°C terminator, ~-73°C night side

Now **83°C / −32°C / −73°C**. Substellar and night side are within a
degree; the terminator moved 4 degrees colder. Small enough that you could
leave it, but the terminator is the number students compare against.

### 6. Limitations doc, line 29 and teacher guide, line 110 — the Venus figure

Both say a 92-bar CO₂ atmosphere at Venus's orbit produces about **138°C**.
It now produces **133°C**. The change comes from the solar constant, which
moved from 1365.2 to 1361 W/m² to match the currently accepted value.

The surrounding argument is unaffected and still worth making: the model
gives 133°C against Venus's real 464°C, so treat it as a floor rather than
a prediction.

### 7. Worked example, teacher guide line 66 — stellar lifespan

> well under its ~2,000 Gyr lifespan

Still right. The model returns 1,924 Gyr for Proxima. No change needed;
noting it because you may have wondered.

### 8. Worked example, line 72 — magnetic field

> Weak ... tidal lock downgrades it one level

Still correct, and now for a visible reason: the assumed planet mass
(3.0 M⊕ for an Ocean Super-Earth) is stated in the Tab 7 record block
rather than hidden in a lookup table. You may want to mention that the
number is an assumption of the planet type, not something the student chose.

---

## Tier 3 — Things the tool now does that the documents don't mention

### 9. Record blocks now fold

**Handout, line 17:**

> Each Exoplanet Tools Page section ends with a **Record block** that tells
> you exactly which values to copy into the tables below.

Still true, but the blocks now show the handful of values students copy and
hide the rest behind a disclosure triangle labelled "*N* more values, model
notes & caveats." One added sentence prevents a student concluding a value
is missing.

### 10. Tab 7's output list is out of date

**Handout, line 222:**

> The Record block outputs gravity estimate, temperatures, liquid water
> coverage, habitability flag, atmospheric thickness (thin/moderate/thick),
> and a magnetic field estimate

It now also outputs climate zones, largest seasonal swing, assumed planet
mass, and a convergence flag. "Liquid water coverage" is now called
"Livable surface fraction" and is computed from the climate zones rather
than from threshold crossings.

### 11. Habitable zone fields don't say which zone

**Handout, lines 61–62:** "Inner Edge of Habitable Zone (AU)" and "Outer
Edge." The tool now reports a conservative and an optimistic pair. Say
which one goes in the table — I'd use conservative — or add a row for both.
Tab 1's plot shades them differently, so students will see two zones and
ask.

### 12. Seasonal swing is a new, teachable quantity

Nothing to correct; a gap worth filling. The tool now reports the largest
seasonal swing at any latitude: about 19°C for an Earth-like planet, 44°C
for a Desert World, 2°C for an Ocean Super-Earth, under otherwise identical
conditions.

This is the direct evidence for the claim already in the teacher guide at
line 118 ("Desert World: Less water means larger temperature swings") and
line 124 ("something students can see directly rather than take on faith").
That claim was previously supported only by the diffusion slider default.
Now there's a number attached to it, and it's a strong candidate for a
Planetary Dossier field carrying into the Alien Project.

### 13. Tidally locked planets now get climate zones too

The worked example's map row (line 70) describes the eyeball pattern
qualitatively. Tab 6 now names the rings: for Proxima b as configured, the
day side runs scorching at the substellar point, then tropical, subtropical,
tundra, and polar out to the terminator, with 21% of the surface livable.
That's a more concrete map instruction than "hot, ice-free shallow sea."

---

## One thing to decide rather than fix

The teacher guide (line 142) and handout (line 172) both use this test:

> if your baseline temperature is above 30°C, there should be no polar ice
> caps

The tool now answers this question directly — it reports where the ice line
is and which zones exist. The heuristic still works as a quick check, but
it's now redundant with something the student can look up. Keep it as a
sanity rule, or replace it with "your map's zones must match the zones in
your Tab 5 record block," which is stricter and easier to grade.

---

## Not affected

For completeness, these were checked and need no change: the day-by-day
sequence, the Phase 1 star table, the K-type and M-dwarf descriptions, the
tab naming note about "Orbital Calculators," the rotation-rate limitation
note, the graph-to-map conversion geometry for tidally locked planets, the
rubric rows, and the completion checklists.
