# ISOM symbols for course setting

Digest of ISOM 2017-2 rev. 6 (see [`docs/sources`](../sources/README.md)), limited to what the course engine needs: how each symbol affects movement, whether it may be crossed or entered, and whether it can carry a control. Sources are cited as `§` for sections and `sym.` for symbol definitions. Lines marked **Interpretation** are our own reading, not ISOM text.

## Runnability classes

ISOM §2.3 divides runnability into five speed classes, relative to flat, open, runnable forest at 4 min/km:

| Class | Speed vs. normal | Description             | Approx. min/km | Examples (ISOM)                                  |
| ----- | ---------------- | ----------------------- | -------------- | ------------------------------------------------ |
| 1     | > 100%           | Easy running            | < 4            | Lawns, paved areas, paths                        |
| 2     | 80–100%          | Normal running speed    | < 5            | Rough open land, forest                          |
| 3     | 60–80%           | Slow running            | 5–6:40         | Stony ground, undergrowth, dense vegetation      |
| 4     | 20–60%           | Walk / difficult to run | 6:40–20        | Very stony ground, undergrowth, dense vegetation |
| 5     | < 20%            | Fight                   | > 20           | Extremely stony ground, very dense vegetation    |

- A green screen combined with stony ground is slower than either alone (§2.3).
- Steeper terrain is less runnable (§2.3).
- White represents typical open forest (§3.4), so unmapped terrain is class 2.
- **Interpretation:** each runnability symbol belongs to a layer.
  - `cover`: vegetation, open land, paved area, bare rock, canopy. Where cover areas overlap, the slowest wins.
  - `ground`: very broken ground, dense boulder field, stony and sandy ground, shallow water, marsh. These are combined with cover (§2.3, §3.3), so the ground factor is applied relative to typical forest: speed = cover × ground ÷ forest.
  - `path`: roads, tracks, paths and stairways (lines). A path is never slower than the terrain it crosses.
- **Interpretation:** one speed factor per class for routing: 1.1, 0.9, 0.7, 0.4 and 0.1 (the middle of each range, 1.1 for class 1). Paths are deliberately only a little faster than runnable forest: in Finnish terrain the straight route is often a good one, and a faster path factor (1.3 was tried) biases routes towards path detours.
- **Interpretation:** crossing a line marked "crossing slows" halves the speed on it. Following an out-of-bounds route (711) is at 0.1 of the speed, so crossing it directly stays cheap but following it doesn't.
- Climb is handled separately from runnability.

## Barriers

- **Impassable / uncrossable** means too difficult or dangerous for the average elite orienteer under normal conditions. It is not forbidden, but a mapped barrier may turn out to be passable (§1, §2.4).
- **Out-of-bounds** features shall not be crossed or entered (§2.4).
- **Interpretation:** the engine treats both as blocking. A route that crosses an impassable feature would be unfair, and one that crosses out-of-bounds is illegal.
- Passages between impassable features are at least 0.4 mm on the map (6 m at 1:15 000), except next to 201 and 206 (§2.11.3).

## Reading relief

- Contour interval is 5 m as standard, 2.5 m allowed in flat terrain (sym. 101).
- Slope lines may be drawn on the lower side of a contour (sym. 101). A depression has to have at least one slope line (sym. 101).
- Form lines are not intermediate contours (sym. 103).
- **Interpretation:** climb is estimated from contour and index contour crossings (101, 102), not form lines. A crossing goes up or down depending on which side of the contour is uphill:
  - a slope tick points to the downhill side;
  - a closed contour without a slope tick is a knoll;
  - areas touching uncrossable or shallow water (301, 302) are the lowest;
  - elsewhere the slope continues across the band between two contours, since it only turns on a ridge or in a valley.
- **Interpretation:** where none of this applies, the direction is unknown and the crossing counts half up, half down.

## Symbols

Category values: `class N` (runnability class above), `impassable`, `forbidden`, `no effect` (no impact on movement), `crossing slows` (line feature that slows crossing it).

### Landforms (brown)

| ISOM      | Name                              | Movement       | Control site | Source / notes                                                                   |
| --------- | --------------------------------- | -------------- | ------------ | -------------------------------------------------------------------------------- |
| 101–103   | Contour, index contour, form line | no effect      | via shape    | sym. 101–103. Re-entrants, spurs, knolls and depressions are read from contours. |
| 104       | Earth bank                        | crossing slows | yes          | sym. 104 "may impact runnability". Impassable banks use 201.                     |
| 105.1–106 | Earth wall, ruined earth wall     | crossing slows | yes          | sym. 105–106. **Interpretation:** minor crossing cost.                           |
| 107, 108  | Erosion gully, small gully        | crossing slows | yes          | sym. 107–108. **Interpretation:** minor crossing cost.                           |
| 109, 110  | Small knoll, elongated knoll      | no effect      | yes          | sym. 109–110. Min. height 1 m.                                                   |
| 111       | Small depression                  | no effect      | yes          | sym. 111. Min. depth 1 m.                                                        |
| 112       | Pit                               | no effect      | yes          | sym. 112. Min. depth 1 m.                                                        |
| 113       | Broken ground                     | no effect      | no           | sym. 113 "little impact on runnability".                                         |
| 114       | Very broken ground                | class 3        | no           | sym. 114 "affects runnability". **Interpretation:** class 3.                     |
| 115       | Prominent landform feature        | no effect      | yes          | sym. 115. Meaning defined on the map.                                            |

### Rock and boulders (black, grey)

| ISOM  | Name                          | Movement       | Control site | Source / notes                                                                                                                  |
| ----- | ----------------------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 201   | Impassable cliff              | impassable     | yes          | sym. 201. Also used for impassable earth banks and trenches.                                                                    |
| 202   | Cliff                         | crossing slows | yes          | sym. 202 "Crossing a cliff will normally slow progress".                                                                        |
| 203.1 | Rocky pit or cave             | no effect      | yes          | sym. 203.1. May be a danger.                                                                                                    |
| 203.2 | Dangerous pit                 | impassable     | **no**       | sym. 203.2 "strongly recommended not to use such a feature as a control point". **Interpretation:** impassable.                 |
| 204   | Boulder                       | no effect      | yes          | sym. 204. Higher than 1 m.                                                                                                      |
| 205   | Large boulder                 | no effect      | yes          | sym. 205. Higher than 2 m.                                                                                                      |
| 206   | Gigantic boulder, rock pillar | impassable     | yes          | sym. 206. Area in plan shape. **Interpretation:** impassable, from the 0.15 mm gap rule.                                        |
| 207   | Boulder cluster               | no effect      | yes          | sym. 207.                                                                                                                       |
| 208   | Boulder field                 | no effect      | weak         | sym. 208 "will generally not impact runnability".                                                                               |
| 209   | Dense boulder field           | class 3        | weak         | sym. 209 "runnability is affected". **Interpretation:** class 3.                                                                |
| 210   | Stony ground, slow running    | class 3        | no           | sym. 210, 60–80%.                                                                                                               |
| 211   | Stony ground, walk            | class 4        | no           | sym. 211, 20–60%.                                                                                                               |
| 212   | Stony ground, fight           | class 5        | no           | sym. 212, < 20%.                                                                                                                |
| 213   | Sandy ground                  | class 3        | no           | sym. 213 "less than 80%". **Interpretation:** class 3.                                                                          |
| 214   | Bare rock                     | class 2        | weak         | sym. 214 "runnable area of rock". **Interpretation:** class 2; outlines are irregular, so corners are not clear control points. |
| 215   | Trench                        | crossing slows | yes          | sym. 215. Impassable trenches use 201.                                                                                          |

### Water and marsh (blue)

| ISOM | Name                          | Movement       | Control site | Source / notes                                                                                                                   |
| ---- | ----------------------------- | -------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 301  | Uncrossable body of water     | impassable     | edge         | sym. 301. Black bank line = uncrossable.                                                                                         |
| 302  | Shallow body of water         | class 3        | edge         | sym. 302 "less than 0.5 m deep and runnable". **Interpretation:** class 3.                                                       |
| 303  | Waterhole                     | no effect      | yes          | sym. 303.                                                                                                                        |
| 304  | Crossable watercourse (> 2 m) | crossing slows | yes          | sym. 304. **Interpretation:** noticeable crossing cost.                                                                          |
| 305  | Small crossable watercourse   | crossing slows | yes          | sym. 305. **Interpretation:** minor crossing cost.                                                                               |
| 306  | Minor/seasonal water channel  | no effect      | yes          | sym. 306.                                                                                                                        |
| 307  | Uncrossable marsh             | impassable     | edge         | sym. 307 "uncrossable or dangerous".                                                                                             |
| 308  | Marsh                         | class 3        | yes          | sym. 308 crossable; combined with other symbols for runnability. **Interpretation:** class 3 unless combined symbols are slower. |
| 309  | Narrow marsh                  | no effect      | yes          | sym. 309.                                                                                                                        |
| 310  | Indistinct marsh              | class 2        | weak         | sym. 310 crossable, vegetation similar to surroundings. **Interpretation:** class 2.                                             |
| 311  | Well, fountain, water tank    | no effect      | yes          | sym. 311.                                                                                                                        |
| 312  | Spring                        | no effect      | yes          | sym. 312.                                                                                                                        |
| 313  | Prominent water feature       | no effect      | yes          | sym. 313. Meaning defined on the map.                                                                                            |

### Vegetation (yellow, green)

| ISOM | Name                                      | Movement  | Control site | Source / notes                                                                                               |
| ---- | ----------------------------------------- | --------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| 401  | Open land                                 | class 1   | edge         | sym. 401 "better runnability than typical open forest".                                                      |
| 402  | Open land with scattered trees            | class 1   | edge         | sym. 402. **Interpretation:** class 1, as 401.                                                               |
| 403  | Rough open land                           | class 2   | edge         | sym. 403 "same runnability as typical open forest".                                                          |
| 404  | Rough open land with scattered trees      | class 2   | edge         | sym. 404. **Interpretation:** class 2, as 403.                                                               |
| 405  | Forest                                    | class 2   | no           | sym. 405 "typical open forest". The reference speed for §2.3.                                                |
| 406  | Vegetation: slow running                  | class 3   | edge         | sym. 406, 60–80%, low visibility.                                                                            |
| 407  | Vegetation: slow running, good visibility | class 3   | edge         | sym. 407, 60–80%.                                                                                            |
| 408  | Vegetation: walk                          | class 4   | edge         | sym. 408, 20–60%, low visibility.                                                                            |
| 409  | Vegetation: walk, good visibility         | class 4   | edge         | sym. 409, 20–60%.                                                                                            |
| 410  | Vegetation: fight                         | class 5   | edge         | sym. 410, < 20%, "barely passable".                                                                          |
| 412  | Cultivated land                           | class 2   | **avoid**    | sym. 412 "such areas should be avoided when setting courses". **Interpretation:** avoid routes and controls. |
| 413  | Orchard                                   | combined  | edge         | sym. 413. Combined with 401/403 and optionally 407/409.                                                      |
| 414  | Vineyard or similar                       | combined  | edge         | sym. 414. Good or normal runnability along the rows.                                                         |
| 415  | Distinct cultivation boundary             | no effect | weak         | sym. 415.                                                                                                    |
| 416  | Distinct vegetation boundary              | no effect | weak         | sym. 416.                                                                                                    |
| 417  | Prominent large tree                      | no effect | yes          | sym. 417.                                                                                                    |
| 418  | Prominent bush or tree                    | no effect | yes          | sym. 418.                                                                                                    |
| 419  | Prominent vegetation feature              | no effect | yes          | sym. 419. Meaning defined on the map.                                                                        |

A stripe pattern in 406, 408 and 410 shows a direction of better running (sym. 406, 408, 410). **Interpretation:** ignored in the MVP.

### Man-made features (black, brown, grey)

| ISOM  | Name                               | Movement                            | Control site | Source / notes                                                                                                                                                                                                                                                                 |
| ----- | ---------------------------------- | ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 501   | Paved area                         | class 1                             | edge         | sym. 501, §2.3 examples.                                                                                                                                                                                                                                                       |
| 502   | Wide road                          | class 1                             | yes          | sym. 502, §2.3 "paths". **Interpretation:** class 1.                                                                                                                                                                                                                           |
| 503   | Road                               | class 1                             | yes          | sym. 503. **Interpretation:** class 1.                                                                                                                                                                                                                                         |
| 504   | Vehicle track                      | class 1                             | yes          | sym. 504. **Interpretation:** class 1.                                                                                                                                                                                                                                         |
| 505   | Footpath                           | class 1                             | yes          | sym. 505 "easily runnable path".                                                                                                                                                                                                                                               |
| 506   | Small footpath                     | class 1                             | yes          | sym. 506 "can be followed at competition speed". **Interpretation:** class 1, slower than 505.                                                                                                                                                                                 |
| 507   | Less distinct small footpath       | class 2                             | yes          | sym. 507 "runnable". **Interpretation:** class 2.                                                                                                                                                                                                                              |
| 508   | Narrow ride / linear trace         | by background                       | yes          | sym. 508: yellow = easy, white in green = normal, green 30% = slow, green 60% = walk, none = as surroundings.                                                                                                                                                                  |
| 509   | Railway                            | forbidden except at level crossings | no           | sym. 509. LS 3.61 f: a railway may not be used as a route and may be crossed at grade only at level crossings or specially permitted places. **Interpretation:** level crossings are where roads and paths cross it; bridges, tunnels and crossing points also allow crossing. |
| 510   | Power line, cableway, skilift      | no effect                           | yes          | sym. 510.                                                                                                                                                                                                                                                                      |
| 511   | Major power line                   | no effect                           | yes          | sym. 511.                                                                                                                                                                                                                                                                      |
| 512   | Bridge / tunnel                    | crossing point                      | yes          | sym. 512. Bridges a watercourse or barrier.                                                                                                                                                                                                                                    |
| 513.1 | Wall                               | crossing slows                      | yes          | sym. 513.1. Min. height 1 m.                                                                                                                                                                                                                                                   |
| 513.2 | Retaining wall                     | crossing slows                      | yes          | sym. 513.2.                                                                                                                                                                                                                                                                    |
| 514   | Ruined wall                        | crossing slows                      | yes          | sym. 514. **Interpretation:** minor crossing cost.                                                                                                                                                                                                                             |
| 515   | Impassable wall                    | impassable                          | yes          | sym. 515 "normally more than 1.5 m high".                                                                                                                                                                                                                                      |
| 516   | Fence                              | crossing slows                      | yes          | sym. 516 "passable or crossable".                                                                                                                                                                                                                                              |
| 517   | Ruined fence                       | crossing slows                      | yes          | sym. 517. **Interpretation:** minor crossing cost.                                                                                                                                                                                                                             |
| 518   | Impassable fence                   | impassable                          | yes          | sym. 518 "normally more than 1.5 m high".                                                                                                                                                                                                                                      |
| 519   | Crossing point                     | crossing point                      | yes          | sym. 519. Gate or stile; impassable lines are broken here.                                                                                                                                                                                                                     |
| 520   | Area that shall not be entered     | forbidden                           | **no**       | sym. 520 "shall not be entered". Paths through it are shown discontinued.                                                                                                                                                                                                      |
| 521   | Building                           | impassable                          | yes (edge)   | sym. 521. Passages through buildings ≥ 0.4 mm.                                                                                                                                                                                                                                 |
| 522   | Canopy                             | class 1                             | yes          | sym. 522 "accessible and runnable area with roof". **Interpretation:** class 1.                                                                                                                                                                                                |
| 523   | Ruin                               | no effect                           | yes          | sym. 523.                                                                                                                                                                                                                                                                      |
| 524   | High tower                         | no effect                           | yes          | sym. 524.                                                                                                                                                                                                                                                                      |
| 525   | Small tower                        | no effect                           | yes          | sym. 525.                                                                                                                                                                                                                                                                      |
| 526   | Cairn                              | no effect                           | yes          | sym. 526.                                                                                                                                                                                                                                                                      |
| 527   | Fodder rack                        | no effect                           | yes          | sym. 527.                                                                                                                                                                                                                                                                      |
| 528   | Prominent line feature             | crossing slows                      | yes          | sym. 528. Meaning defined on the map.                                                                                                                                                                                                                                          |
| 529   | Prominent uncrossable line feature | impassable                          | yes          | sym. 529 "uncrossable".                                                                                                                                                                                                                                                        |
| 530   | Prominent man-made feature, ring   | no effect                           | yes          | sym. 530. Meaning defined on the map.                                                                                                                                                                                                                                          |
| 531   | Prominent man-made feature, x      | no effect                           | yes          | sym. 531. Meaning defined on the map.                                                                                                                                                                                                                                          |
| 532   | Stairway                           | class 2                             | yes          | sym. 532 "helps to climb very steep slopes or to cross over impassable objects". **Interpretation:** class 2, crossing point.                                                                                                                                                  |

### Technical and course planning symbols

| ISOM    | Name                                        | Movement        | Source / notes                                                                            |
| ------- | ------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| 601–603 | North line, registration mark, spot height  | no effect       | sym. 601–603. Not terrain.                                                                |
| 701–706 | Start, control, number, course line, finish | —               | sym. 701–706. Course overprint, ignored when reading terrain.                             |
| 707     | Marked route                                | mandatory       | sym. 707 "mandatory to follow".                                                           |
| 708     | Out-of-bounds boundary                      | forbidden       | sym. 708 "shall not be crossed".                                                          |
| 709     | Out-of-bounds area                          | forbidden       | sym. 709 "shall not be entered". Also marks cultivated land not to be entered (sym. 412). |
| 710     | Crossing point                              | crossing point  | sym. 710.                                                                                 |
| 711     | Out-of-bounds route                         | forbidden along | sym. 711. May be crossed directly, not followed.                                          |
| 712–715 | First aid, refreshment, map exchange        | —               | sym. 712–715.                                                                             |

## Control sites

- Controls shall only be placed on points that are clearly identifiable on the map (sym. 703).
- For point features, the circle centre is the symbol centre. For line and area features, it is the exact marker position (sym. 703).
- **Interpretation:** "yes" above means a usable control site in itself. "edge" means the boundary or corner of the area can carry a control, not its interior. "weak" means usable only at a distinct point such as a corner. Suitability for a given difficulty level is decided with the control-description rules, not here.

- **Interpretation:** an area corner counts only where the map visibly changes there: the area is the top-most one just inside the corner and something else is visible just outside. Corners hidden under other areas and seams between pieces of the same area are not control points.
- **Interpretation:** cliffs, earth banks and walls, erosion gullies, trenches and ruins are controlled along their length: a site at the centre of short ones (up to 60 m) as well as at the ends. Other line features (paths, ditches, fences) only at their ends.
- **Interpretation:** a closed contour or form line is a knoll or depression (sym. 101, 103). The innermost closed contour of one, up to 10 000 m², is a site at its centre. Point symbols for very small contour knolls and depressions are sites too.
- **Interpretation:** a sharp bend in a contour or form line is a spur (nose) or re-entrant: a turn of at least 60° measured over 15 m each way (ISOM requires the mouth to be wider than 0.5 mm, sym. 101). Where the contour's uphill side is known, a bend whose inside is uphill points downhill and is a spur; one whose inside is downhill is a re-entrant.

## OCAD symbol numbers

- **Interpretation:** OCAD stores a symbol as ISOM number × 1000 + variant, e.g. `404001` is a variant of 404. Map makers add their own variants (the dev map has `410.003` "very difficult forest" and `520.004` "forbidden yard"), so we categorise by the base ISOM number and allow per-map overrides.
