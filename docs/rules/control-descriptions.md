# Control descriptions

Digest of how control descriptions are written and laid out, for individual foot orienteering in forest. Trail-O columns (IOF CD p. 29) are left out.

Sources (see [`docs/sources`](../sources/README.md)):

- **IOF CD x**: International Specification for Control Descriptions 2024, symbol or section x.
- **LS x**: Suunnistuksen lajisäännöt 2026.
- **RMK x.y**: Ratamestarikirja, chapter x.y.

Lines marked **Interpretation** are our own reading.

## Purpose

- A description gives greater precision to the map's picture of the control feature and says where the flag is relative to it. A control is found mainly by map reading; descriptions stay as short as possible (IOF CD Introduction, LS 12.21).
- Descriptions must not be used to correct map errors (IOF CD Introduction).
- Descriptions follow the federation's instructions, which point to the IOF specification (LS 12.22, RMK 5.2.ST).
- Refreshment controls and the length of any marked compulsory route must be shown in the descriptions (LS 12.24, LS 12.25).
- Always show descriptions on the map, even when loose descriptions are given too (RMK 6.6).

## Sheet layout

- Contents: heading, start location, one row per control including special instructions, and the route from the last control to the finish (IOF CD p. 3).
- Printed in black or purple. Boxes are square, 5–7 mm a side (IOF CD p. 3).
- Heading: event title; classes (optional); course code, length in km to the nearest 0.1 km from where timing starts, and climb in metres to the nearest 5 m (IOF CD p. 3).
- The start is the first row, described as if it were a control feature; column B may carry a start code (IOF CD p. 3). The start point is the centre of the start triangle (RMK 5.2.ST).
- An optional row before the start gives the distance from the timed start to the start triangle when they are not within a few metres (IOF CD p. 3, 14.1).
- Control rows come in visiting order. A thicker line follows every third row and goes on both sides of a special instruction (IOF CD p. 3).
- The finish row gives the distance from the last control to the finish and whether the route is taped all the way (16.1), taped from a funnel (16.2) or not taped (16.3) (IOF CD p. 16).
- A written version keeps the layout and column order of the symbolic one as far as possible (IOF CD p. 3).

## Columns

| Column | Content                                              | Source                 |
| ------ | ---------------------------------------------------- | ---------------------- |
| A      | Control number, in visiting order                    | IOF CD p. 4            |
| B      | Control code, a number above 30                      | IOF CD p. 4            |
| C      | Which of any similar feature                         | IOF CD p. 4–5          |
| D      | Control feature, as shown on the map                 | IOF CD p. 4–5          |
| E      | Appearance, or the second feature                    | IOF CD p. 4            |
| F      | Dimensions, combination (crossing, junction) or bend | IOF CD p. 4            |
| G      | Location of the flag relative to the feature         | IOF CD p. 4            |
| H      | Other information (first aid, refreshments, manned)  | IOF CD p. 4, 13.1–13.3 |

### C: which of similar features

- Only when several similar features are close enough that the intended one isn't obvious; not needed for a second feature near the circle edge (IOF CD col. C).
- Symbols: a direction (0.1 northern, 0.2 south-eastern and the other six), upper (0.3), lower (0.4), middle (0.5) (IOF CD 0.1–0.5).
- If column C cannot make the flag position unambiguous, the feature is not suitable for a control site (IOF CD col. C; change 3 of 2024).
- With printed maps the circle is always exactly placed, so column C clarifiers can partly be dropped; "middle boulder" among random boulders at the circle edge is not informative, but two boulders in the circle centre still call for one (RMK 5.2.ST).

### D: control feature

- The feature at the centre of the circle. Only one symbol in D; a second feature for crossing, junction or between goes in E (IOF CD col. D).
- Each D symbol lists the ISOM symbols it represents; a number covers all its sub-symbols (IOF CD col. D). The mapping is in [`packages/rules/src/control-description.ts`](../../packages/rules/src/control-description.ts), one entry per ISOM symbol with the IOF CD reference.
- Landforms 1.1–1.16, rock 2.1–2.10, water and marsh 3.1–3.11, vegetation 4.1–4.10, man-made 5.1–5.24, special items 6.1–6.2 (IOF CD col. D).
- Hill (1.9) and depression (1.12) are shown with contour lines; knoll (1.10) and small depression (1.13) are the small point symbols (IOF CD 1.9, 1.10, 1.12, 1.13).
- Forest corner (4.3) is the corner of forest projecting into open land (IOF CD 4.3).
- **Interpretation:** a small closed contour around higher ground is a hill (1.9), around lower ground a depression (1.12). A contour bend pointing downhill is a spur (1.2), uphill a re-entrant (1.3). Contour sites whose up and down sides are unknown can't be described and are not used.

### E: appearance

- Low, shallow, deep, overgrown, open, rocky, marshy, sandy, needle leaved, broad leaved, ruined (IOF CD 8.1–8.11), only when they add clarity the map doesn't give.
- Ruined wall (ISOM 514) is wall 5.8 with ruined 8.11; ruined fence (517) is fence 5.9 with 8.11; rocky pit (203) is pit 1.14 with rocky 8.6; sandy ground (213) is open land 4.1 with sandy 8.8 (IOF CD 5.8, 5.9, 1.14, 4.1).

### F: dimensions, combinations, bend

- Give the dimension when the map symbol is symbolic rather than to scale and the size matters, e.g. for visibility (IOF CD col. F).
- Height or depth (9.1), size (9.2), height on a slope (9.3), heights of two features (9.4) (IOF CD 9.1–9.4).
- Crossing (10.1) and junction (10.2) need both features in D and E (IOF CD 10.1, 10.2).
- Bend (11.1): a linear feature changes direction smoothly (IOF CD 11.1).
- **Interpretation:** OCAD maps carry no heights for boulders, cliffs or knolls, so F stays empty unless a later version reads them from the map.

### G: location of the flag

- No symbol when the flag is at the centre of the feature, or at the centre of the foot of a cliff (IOF CD col. G).
- Side (12.1): the feature rises above the ground; e.g. boulder, north-east side (IOF CD 12.1).
- Edge (12.2): the edge of a depression-type feature at ground level, or the border of an area (IOF CD 12.2).
- Part (12.3): inside a large area, neither centre nor edge (IOF CD 12.3).
- Corner (12.4 inside, 12.5 outside): the edge of a feature turns through 45–135°, or a linear feature turns a corner. The symbol points the way the corner points (IOF CD 12.4, 12.5).
- Tip (12.6): the edge turns through less than 45° (IOF CD 12.6).
- End (12.7): where a linear feature ends or starts (IOF CD 12.7).
- Upper part (12.8), lower part (12.9), top (12.10), foot (12.11, 12.12 with direction), beneath (12.13), between (12.14) (IOF CD 12.8–12.14).
- **Interpretation:** directions are relative to map north, which is the map's paper up. They are rounded to the nearest of the eight compass points.
- **Interpretation:** "corner (inside)" means the flag is inside the angle of the corner, "outside" outside it. With the flag on the area's own side, a convex corner is inside and a concave corner outside; with the flag off the area, the other way round.

## Difficulty

- Descriptions also feed the difficulty assessment: a big, easily seen feature such as "hill" is too easy for championship level (D8, [`docs/decisions.md`](../decisions.md)).
