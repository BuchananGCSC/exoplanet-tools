# Numbers that moved: round two

Generated after making clouds explicit and deriving heat transport from day
length and pressure. This supersedes `numbers-that-moved.md`, which covered
the earlier physics-core round. Anything in your teacher guide, student
handout, worked example, peer review checklist, or rubric that quotes one of
these needs a sync pass.

## Earth did not move

| Quantity | previous | now |
|---|---|---|
| Global mean | 14.1 °C | 14.0 °C |
| Equator (annual mean) | 24.2 °C | 24.1 °C |
| North pole (annual mean) | −7.2 °C | −7.3 °C |
| North pole at solstice | 8.5 °C | 8.4 °C |
| Seasonal swing at 46°N | 19.0 °C | 19.0 °C |

Within a tenth of a degree throughout. The recalibration was clean, which
means anything your documents say about an Earth-like planet at default
settings is still correct.

## Planet types moved, and two of them moved a lot

| | previous | now |
|---|---|---|
| Desert World global mean | −12.3 °C | −6.5 °C |
| Desert World livable surface | 66% | 97% |
| Desert World seasonal swing (46°N) | 43.5 °C | 51.7 °C |
| Ocean Super-Earth global mean | 22.6 °C | 13.6 °C |
| Ocean Super-Earth livable surface | 100% | 100% |
| Ocean Super-Earth seasonal swing | 2.2 °C | 1.9 °C |

The Ocean world cooled by nine degrees because its albedo is now built from
a dark ocean surface under heavy cloud (0.09 surface, 80% cover) rather than
one tuned number, and the cloud deck reflects more than the old value did.
The Desert world warmed because its low cloud cover means less reflection,
though it is still the harsh option. Both are now built from properties you
can point at rather than a single fitted albedo.

**If your materials quote a temperature for a Desert or Ocean world, it has
changed.**

## Venus

| | previous | now |
|---|---|---|
| Pole-to-equator contrast at 92 bar | 57.9 °C | 1.0 °C |

Real Venus varies by a few degrees at most. This is the largest single
accuracy gain in the round, and it comes from pressure feeding heat
transport rather than only greenhouse forcing.

## Proxima b, the worked example

| | previous | now |
|---|---|---|
| Substellar | 82.7 °C | 69.8 °C |
| Terminator | −31.8 °C | −33.7 °C |
| Antistellar | −73.3 °C | −72.5 °C |

The substellar point cooled 13 degrees because the Ocean Super-Earth now
carries an explicit 80% cloud deck. That is the right direction — cloud
cooling at the substellar point is the stabilising mechanism in Yang, Cowan
& Abbot — though with a fixed cloud fraction it is only a partial version of
that effect.

**Teacher guide, worked example table:** the climate row should read roughly
70 °C substellar, −34 °C terminator, −73 °C night side.

## A new quantity, and a new control

The **Diffusion D** slider is gone. In its place is **Day length**, from
6 to 100 hours on a log scale, defaulting to 24.

| Day length | Global mean | Pole-to-equator contrast |
|---|---|---|
| 6 h | 9.2 °C | 91 °C |
| 12 h | 10.3 °C | 72 °C |
| 18 h | 12.1 °C | 50 °C |
| **24 h** | **14.0 °C** | **31 °C** |
| 48 h | 14.0 °C | 11 °C |
| 100 h | 14.0 °C | 3 °C |

Anywhere your documents tell students to set a diffusion value, or explain
what D means, needs rewriting. The replacement instruction is simpler: set
your planet's day length, and the tool works out how much heat the
atmosphere can move.

The record blocks now also report cloud cover, surface albedo versus
planetary albedo, and the derived transport coefficient with its inputs
shown.

## What this means for the sync list

`document-sync-list.md` still applies — none of its thirteen items are
resolved by this round. Add to it:

1. **Any Desert or Ocean world temperature** quoted anywhere.
2. **The worked example climate row**, updated above.
3. **Any mention of the Diffusion D slider**, including the teacher guide
   note that planet type sets its default. Planet type no longer affects
   transport directly; it sets surface albedo, cloud cover, heat storage,
   and an ocean-circulation factor.
4. **The limitations document**, which lists "no clouds" as the single
   largest omission and "no rotation rate" alongside it. Both are now
   partly addressed and the entries need rewriting rather than deleting —
   clouds are represented but do not respond to temperature, and the
   rotation exponent is disputed in the literature.

## One addition worth making

Day length is a strong candidate for the Planetary Dossier. It has a
formation story the Biography capstone can trace (angular momentum, giant
impacts, tidal spin-down) and direct consequences the Alien Project needs
(circadian rhythm, thermoregulation, activity pattern). It is now a value
students set deliberately rather than a number they inherit.
