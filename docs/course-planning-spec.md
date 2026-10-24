# Spec: Whole-course planning for the course engine

**Project:** Ratamestari, orienteering course setter
**Status:** Proposed, to be recorded as **D13** in [`decisions.md`](decisions.md)
**Applies to:** `packages/engine` (browser-independent TypeScript, runs in a Web Worker), its config in `packages/rules`, and the agent tools in `packages/agent`
**Origin:** first drafted outside the repository; this version is aligned with the code as of 2026-10-24. Section 15 lists what changed from the draft.

---

## 0. Instructions for the implementing agent

- Read this document, then [`course-setting.md`](rules/course-setting.md) and [`control-descriptions.md`](rules/control-descriptions.md), then `packages/engine/src/course-search.ts`, which this spec extends.
- Follow the decisions in `decisions.md`, especially:
  - **D2:** all geometry is deterministic engine code. The LLM never places controls or measures distances.
  - **D3:** the map never leaves the browser. LLM tools return text and numbers only, never coordinates or geometry.
  - **D5:** the course draws live, so the search reports progress incrementally, and the user can drag controls.
  - **D7:** the course and description box fit the paper.
  - **D8:** control descriptions feed the difficulty assessment.
  - **D12:** the search is seeded and deterministic for a given seed.
- **Rule values come from the rules config, never from memory** (CLAUDE.md hard rule 3). Every metric below names its basis in the rule digests. Where the digests give no number, the value is our _interpretation_ and is flagged so in the config (`interpretation: true`), like every other rules value.
- Every number marked _(tune)_ is a starting default. It lives in `packages/rules/src/course-quality.ts`, never inline in the engine.
- Implement in the phase order of section 13. Stop and report after each phase with the benchmark table (section 14).
- Keep commits small and passing `pnpm check`.

---

## 1. Problem

What course setters see in generated courses (user feedback, 2026-10-23/24):

- **Long distance looks like a ring.** This is by design today: `planLoop` makes long courses travel round a loop centre, one control after another.
- **Leg lengths are monotonous.** The greedy build draws leg times from a crude long/short split (`LEG_PROFILES`), and the score never looks at the distribution of leg lengths.
- **Out and immediately back.** The score only checks the straight-line angle at each control (`ACUTE_ANGLE`, 45°/60°). A dogleg on the actual routes, or a reversal after a long leg, is not seen.
- **Few real route-choice legs.** Route choice is a small reward found by chance: on the dev map about 2 in 60 random long legs have a qualifying alternative, and the search does not look for them.
- **Middle distance finishes far from its core,** giving one long dull last leg.

Human course setters plan the other way round: first the course's shape and key legs, then the links between them, then refine the whole (RMK 1.2.6.S, IOF App. 2 §3.4.1, RMK 5.1). The engine should copy that.

---

## 2. Baseline: what the engine does today

| Piece         | Where                                   | What it does                                                                                                                                                                                                                                                                                                |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost grid     | `cost-grid.ts`, `terrain.ts`            | 5 m runnability raster from ISOM symbols (`packages/rules/src/isom.ts`), barriers, level crossings, mapped area                                                                                                                                                                                             |
| Routing       | `router.ts`, `time-tree.ts`             | A* for single legs; Dijkstra time trees from each pool site for fast leg times during the search                                                                                                                                                                                                            |
| Leg analysis  | `leg.ts`                                | Fastest route, climb from contours, alternative routes by corridor penalty (`ROUTE_CHOICE`: ≤10% slower, separated ≥ max(50 m, 15% of the straight distance))                                                                                                                                               |
| Control sites | `control-sites.ts`, `site-quality.ts`   | Candidates with technical difficulty, flag side, orientation, similar features; area quality = density of good sites within 150 m                                                                                                                                                                           |
| Descriptions  | `packages/iof`                          | IOF columns C, D, E, G; undescribable sites are dropped before the search                                                                                                                                                                                                                                   |
| Search        | `course-search.ts`                      | Pool filtered to the print area and reach of the finish; long: forced loop, middle: 750 m core; greedy build; hill-climb with swap / remove / insert / reverse / bring-last-home; up to 3 drafts                                                                                                            |
| Score         | `course-search.ts` (`createEvaluation`) | Time error, spacing, angles, difficulty, course-line crossings, lines through circles, lines off the map, lines under the description box, overlapping circles, long last leg, area quality reward, route-choice reward (long), straight-on penalty (middle). Collects **findings** with the stops involved |
| Paper         | `print-area.ts`, `course-on-paper.ts`   | Paper-sized search frame around the centre; final print area fitted to the course                                                                                                                                                                                                                           |
| Editing       | `course-editing.ts`                     | Re-check, drag-and-snap, fix or replace a control (best / harder / easier)                                                                                                                                                                                                                                  |
| LLM tools     | `packages/agent/src/course-tools.ts`    | `generate_course`, `class_rules`, `get_workspace`, `replace_control`, `fix_rule_problems`, `list_map_symbols`, `correct_map_symbol`                                                                                                                                                                         |

Existing types to build on: `ControlSiteCandidate`, `Course`, `CourseProblems`, `Finding` (engine), `CourseTarget` (rules). New code adapts to these names rather than introducing parallel ones.

---

## 3. Goals

1. A **whole-course score with an explainable breakdown**: every term with its value, weight, contribution and a short note, so course setters and Claude can see why a course scored as it did.
2. **Shape and rhythm** metrics that catch rings, doglegs on real routes, reversals and monotonous legs.
3. **Skeleton-first planning:** pick the key elements (waypoint zones now, route-choice anchor legs next) before filling in.
4. A **stronger search** (larger moves, annealing, diverse alternatives) within a fixed time budget.
5. **Calibration** of targets and weights from real human-drawn courses (the user can provide IOF XML).

Non-goals: sprint (no ISSprOM map support yet), relay forking, planning all classes together (D10).

---

## 4. Architecture

New modules sit flat in `packages/engine/src`, like the existing ones:

```
leg-routes.ts      route cache (A* polylines per site pair) + alternatives, reusing router.ts / leg.ts
course-metrics.ts  shape, rhythm and terrain metrics on a course (pure functions)
course-score.ts    weighted score with breakdown; course-search.ts calls it instead of its inline sum
waypoints.ts       skeleton: waypoint zones (phase A), route-choice anchor legs (phase B)
search-moves.ts    neighbourhood moves (existing ones moved here, plus shift and rebuild)
diversity.ts       diverse top-N (phase C)
```

Config: `packages/rules/src/course-quality.ts` (cited, Zod-validated, per format).

Data flow:

```
features ─► control sites ─► cost grid
                │               │
                ▼               ▼
        waypoints / anchors ◄── routing (time trees + route cache)
                │
                ▼
        greedy fill between them
                │
                ▼
     search (hill-climb → annealing) ◄── course-score = metrics + findings
                │
                ▼
   best course (+ diverse alternatives) ─► UI live / Claude as text
```

### Score breakdown type

```ts
interface ScoreTerm {
  readonly value: number // raw metric, documented unit
  readonly weight: number // from course-quality config
  readonly contribution: number // value × weight, added to the score (lower is better)
  readonly note: string // e.g. "3 legs of similar length in a row at controls 4–7"
}

interface ScoreBreakdown {
  readonly total: number
  readonly terms: Readonly<Record<ScoreTermName, ScoreTerm>>
}
```

`Course` gains `breakdown: ScoreBreakdown`. Existing `problems` and `findings` stay: findings are the rule checks the user sees; the breakdown is the quality judgement behind the score.

---

## 5. Routing

### 5.1 Two kinds of leg timing

- **Time trees** (existing) stay the fast path for leg _times_ during the greedy build and the search.
- A **route cache** (new, `leg-routes.ts`) gives leg _polylines_ for the metrics that need routes (doglegs, corridor reuse, route crossings). A* per site pair, cached by unordered pair because costs are symmetric (`Math.fround` comparisons as in the time trees). LRU with a size limit _(tune, 20 000 legs)_. Computed lazily.
- Route metrics are evaluated only on legs a move changed; a course score reuses cached routes for the rest.

### 5.2 Alternative routes

Reuse the existing corridor-penalty method in `leg.ts` and its `ROUTE_CHOICE` rule (RMK 1.2.2.SHP, IOF App. 2 §3.8, interpretation). The route-choice value per leg (0..1) comes from the qualifying alternatives' extra time and separation, replacing today's straight-line-time proxy (`routeChoiceValueOf`) once the route cache exists (phase B).

A leg is **obvious** when its best route runs mostly on paths or roads _(tune, > 80% of its length)_ and it has no qualifying alternative. Basis: avoid sections with no map reading unless they come from a good route choice (IOF App. 2 §3.7).

---

## 6. Quality metrics

All metrics are pure functions in `course-metrics.ts` returning a non-negative badness (0 = ideal) and a note. Each has a unit test on a synthetic grid.

### 6.1 Shape and flow

| Metric                                        | Definition                                                                                                                                                                                                                                                      | Basis                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Dogleg (route)**                            | At each control, take the last L m of the incoming route and the first L m of the outgoing route _(tune, L = 75 m)_. Badness grows with the share of outgoing samples within w m of the incoming part _(tune, w = 15 m)_. Hard above an overlap of 0.6 _(tune)_ | Acute angles and incoming runners seeing the flag: RMK 1.3.1, RMK 4.5.S, IOF App. 2 §3.5.4. Thresholds: interpretation |
| **Reversal**                                  | Turning angle between consecutive straight legs over 150° _(tune)_, scaled by the shorter of the two legs, so a reversal after 1.5 km counts far more than after 100 m                                                                                          | Change direction between legs: IOF App. 2 §3.4.1. Scaling: interpretation                                              |
| **Ring**                                      | Low variance of the signed turning angles (all turning the same way at similar angles)                                                                                                                                                                          | Interpretation of "vary leg type and direction" (IOF App. 2 §3.4.1)                                                    |
| **Spread**                                    | Share of the usable terrain in the print frame that the course reaches (convex hull of controls vs. area with good sites), against a per-format target. Middle uses its core area instead                                                                       | Interpretation; middle: 1.5–2 km² is enough (RMK 2.S.2)                                                                |
| **Corridor reuse** (phase C)                  | Share of 10 m cells _(tune)_ within 15 m of more than one leg's route, ignoring 40 m around a shared control                                                                                                                                                    | Following and splitting the field: RMK 1.4.3, IOF App. 2 §3.8. Interpretation                                          |
| **Course-line crossings** (phase A)           | Each crossing costs a severity: a small base plus the larger of its nearness to a control (fully bad within 75 m, harmless beyond 300 m) and its shallowness. Only bad crossings are findings                                                                   | Course setter guidance in [`course-setting.md`](rules/course-setting.md) (interpretation)                              |
| **Route crossings and near-passes** (phase C) | Crossings between leg _routes_ (today only straight course lines are checked) and routes passing within a circle of a control not on that leg                                                                                                                   | Existing "line through a circle" check uses the 75 m footprint (ISOM sym. 703); route version: interpretation          |

### 6.2 Rhythm

| Metric                      | Definition                                                                                                                          | Basis                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Leg-length distribution** | 1-D earth mover's distance between the course's leg-length histogram and a per-format target histogram (bins in metres), normalised | Vary leg type, length and difficulty: IOF App. 2 §3.4.1; changes of rhythm: RMK 2.S.1, RMK 2.S.2. Target shape: interpretation until calibrated |
| **Alternation**             | Runs of 3 or more consecutive legs within a length ratio of 1.3 _(tune)_                                                            | Same                                                                                                                                            |
| **Direction-change rate**   | Share of controls turning more than 60° _(tune)_, against a per-format target (high for middle)                                     | IOF App. 2 §3.4.1, RMK 2.S.2                                                                                                                    |
| **Start legs**              | Penalise several short demanding legs at the start; reward a map-reading first leg                                                  | RMK 1.4.3, RMK 1.2.1.SHP, IOF App. 2 §3.3                                                                                                       |

### 6.3 Terrain and technical content

| Metric                        | Definition                                                                                               | Basis                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Difficulty fit**            | Existing: course difficulty (site + hidden flag side) within the class range                             | RMK 11, RMK 1.2.5, D8                                       |
| **Area quality**              | Existing: mean area quality of the controls                                                              | Use the best terrain: interpretation (RMK 2.S.2 for middle) |
| **Obvious legs**              | Share of obvious legs, penalised for A classes                                                           | IOF App. 2 §3.7                                             |
| **Terrain variety** (phase C) | Entropy of the description features (column D) and cover types along the routes, rewarded up to a target | Varied tasks: RMK 2.S.1. Interpretation                     |

### 6.4 Totals and event layout

- **Winning time** (existing): estimated against the class target (LS 11.25, LS 19.41/19.44), 2 points per percent.
- **Length and climb** (existing): LS 11.22 length; climb against IOF App. 2 §3.11.6 (4% of the shortest route length).
- **Finish** (existing): last leg within a share of the winning time _(interpretation)_; at least the last part marked (IOF App. 2 §3.6). Phase B adds: middle-distance core chosen so the last leg is not long.
- **First leg towards the finish:** penalise a first-leg bearing within 30° of the start-to-finish bearing _(tune, interpretation)_.

---

## 7. Hard constraints

Existing hard rules stay as large penalties during the search and must be zero in the output:

- control spacing (LS 11.41, 11.411), overlapping circles (ISOM sym. 703);
- forbidden and impassable areas (cost grid: ISOM 520, 708–711, LS 3.61 f for railways);
- course lines inside the mapped area and clear of the description box (D7);
- every control describable (IOF CD column C).

New: **route dogleg** above the hard threshold (6.1).

The control count is not a hard rule: no source gives a range, and the winning time decides it.

---

## 8. Planning and search

### 8.1 Waypoint zones (phase A, replaces the forced loop)

Long distance today travels round a loop centre (`planLoop`). Replace it with waypoints:

1. Find 3–5 _(tune)_ **zones**: clusters of high area quality inside the print frame, at least a long-leg distance apart _(tune, from the format's long-leg band)_.
2. Order start → zones → finish by brute-force TSP (≤ 5 zones plus start and finish), minimising total gap time and turning penalties, so the order is not simply a ring.
3. The greedy build fills towards the next zone, drawing leg lengths to move the leg-length histogram towards its target (6.2).

Middle distance keeps its core but picks 2–3 zones inside it, with a high direction-change target.

### 8.2 Route-choice anchors (phase B)

Long distance only:

1. Sample site pairs whose straight distance is in the long-leg band _(config)_.
2. Score their route choice with the route cache and alternatives (5.2). Keep the top M _(tune, 200)_.
3. Choose 2–4 anchors _(config)_ greedily: high route-choice value, bearings at least 60° apart _(tune)_, little corridor overlap.
4. Order start → anchors → finish as in 8.1, then fill.

Basis: long route-choice legs are essential in championship events (RMK 2.S.1); a few very good legs joined by short links beat many even legs (IOF App. 2 §3.4.1); plan route-choice legs first, then join them (RMK 1.2.6.S).

### 8.3 Search

- **Phase A:** keep the hill-climb and its moves; add `shift` (replace a control with a nearby site, as `fixControl` does) and give the score the new terms.
- **Phase C:** simulated annealing with geometric cooling, plus `rebuild` (remove 3–5 consecutive controls and refill) and `anchorShift` (swap an anchor for another from the top-M list, rarely). One overall time budget per course _(tune, long 8 s, middle 5 s)_ instead of many restarts, so live drawing stays responsive.
- Progress to the UI on every improvement, as today (D5). Controls the user dragged become **locked** and are not moved by the search (phase C).
- Determinism: the seeded PRNG (`random.ts`) drives every random choice (D12).

### 8.4 Diverse alternatives (phase C)

Keep the best N _(tune, 3)_ courses that differ by more than 0.4 _(tune)_ in 1 − Jaccard similarity of their route corridor cells. "Another option" then shows a genuinely different course, not just the next seed.

---

## 9. Config

`packages/rules/src/course-quality.ts`, Zod-validated, every block cited or flagged `interpretation: true`:

```ts
interface CourseQualityProfile {
  // one per format: long, middle
  legLengthHistogram: { binsMetres: number[]; target: number[] }
  waypoints: { count: [number, number]; minSeparationMetres: number }
  anchors?: { count: [number, number]; longLegBandMetres: [number, number] } // long, phase B
  directionChangeRateTarget: number
  spreadTarget: number
  weights: Record<ScoreTermName, number>
  thresholds: {
    doglegLengthMetres: number
    doglegWidthMetres: number
    doglegHardOverlap: number
    reversalDegrees: number
    alternationRatio: number
    directionChangeDegrees: number
  }
}
```

The existing `PENALTY`, `QUALITY_REWARD`, `LEG_PROFILES` and route-choice constants in `course-search.ts` move into this file in phase A. Class targets (winning time, difficulty range) stay where they are (`course-request.ts`, `winning-time.ts`).

---

## 10. Claude tools (text only, D3)

Claude reviews and directs; it never sees coordinates or geometry.

- **Existing:** `generate_course`, `replace_control` (best / harder / easier), `fix_rule_problems`, `class_rules`, `get_workspace`, map symbol tools.
- **Phase D, new:**
  - `get_course_report`: leg table (length, time, climb, turning angle, route-choice value, alternatives, obvious flag, control description) and the score breakdown with notes. Directions only as coarse words from the engine ("leg 6 heads north-west").
  - `replace_section(fromControl, toControl, goal)` with `goal` in `add_route_choice | more_technical | shorter_legs | longer_legs | change_direction | avoid_area_reuse`: the engine rebuilds that section with a temporary weight boost for the goal.
  - `lock_control` / `unlock_control`, and `get_alternatives` for the diverse top-N.

---

## 11. Calibration from real courses (offline, Node, phase E)

The user can provide real courses as IOF XML 3.0 with their OCAD maps. They go in the git-ignored `maps/` folder (e.g. `maps/courses/`), never in the repository.

1. **Import** IOF XML 3.0 `CourseData` (we already write it; reading is new) and match each control to the nearest candidate site, or create one from the feature under it.
2. **Measure** every metric of section 6 on the real courses: leg-length histograms, turning angles, route-choice legs, spread, corridor reuse, per format and class level. These become the targets in `course-quality.ts`, cited as calibrated from named courses.
3. **Fit weights by ranking:** perturb each real course with the search moves (and deliberately bad variants: ring order, random order, the old planner's output), then fit non-negative weights so the real course beats its variants (pairwise logistic regression).
4. **Report:** a markdown summary of the fitted values and how often real courses beat their variants (target > 95%).

Tooling lives in `scripts/` and never ships to the browser or uploads anything.

---

## 12. Live UI

- The rule-check list stays as it is (findings).
- Phase A: a collapsible **score breakdown** under the course summary, one line per term with its note.
- Phase C: optional debug overlay on the map (routes, dogleg markers, corridor reuse heat) for tuning.

---

## 13. Implementation phases

### Phase A: shape and rhythm (target: demo, 2026-10-25)

- `course-quality.ts` config; move existing penalties and rewards there.
- `course-metrics.ts`: route dogleg (A* on the legs of the final candidates only, cached), reversal scaled by leg length, ring, spread, leg-length distribution, alternation, direction-change rate, first leg towards finish.
- `course-score.ts` with breakdown; `Course.breakdown`; breakdown shown in the panel and in Claude's course summary.
- Waypoint zones replace `planLoop` for long distance; greedy draws leg lengths towards the target histogram; `shift` move.
- Benchmark script (section 14).
- **Accept when**, on the three local maps with fixed centres and seeds 1–5 for long and middle H21 at SM level:
  - no new hard violations and the winning time within 5% as today;
  - no route doglegs above the hard threshold and no reversal over 150° after a leg longer than 300 m;
  - leg-length distribution closer to the target than the baseline in at least 8 of 10 runs per map;
  - ring metric lower than the baseline for long distance in at least 8 of 10 runs;
  - search time at most 1.5 × today's.

### Phase B: route-choice skeleton (long) and middle finish

- Route cache with alternatives; route-choice value from real alternatives; anchors (8.2); middle core chosen near the finish.
- **Accept when:** long courses contain the configured number of anchor legs, each with at least one qualifying alternative; middle last legs within the final-leg share.

### Phase C: stronger search

- Annealing, `rebuild` and `anchorShift` moves, time budget, locks for dragged controls, diverse top-N, corridor reuse, route crossings, terrain variety, debug overlay.
- **Accept when:** score better than phase A in at least 8 of 10 benchmark runs within the same time budget, and alternatives differ by the diversity threshold.

### Phase D: Claude course report

- `get_course_report`, `replace_section`, locks and alternatives as tools; prompt update.
- **Accept when:** "make the long legs more interesting" leads to `replace_section(…, add_route_choice)` and a measurable rise in route-choice value, with no geometry in any message.

### Phase E: calibration

- IOF XML import, measurement, weight fitting, report (section 11).
- **Accept when:** real courses beat their variants in more than 95% of pairs and the fitted config is committed with the report.

---

## 14. Evaluation

- **Benchmark script** (`pnpm benchmark-courses`): fixed maps, centres, classes and seeds; writes a table with every score term, rule findings, time, length and search time per course, and renders PNGs to `maps/renders/`. Run it before and after each phase.
- **Blind review** (after phase C): experienced course setters rate a mix of human and generated courses (flow, route choice, technical quality, overall, 1–5). Target: generated not worse than human on average.

---

## 15. Changes from the original draft

- Numbered **D13**, not D11 (D11 is the tech stack).
- Problem statement corrected: the engine already scores whole courses and hill-climbs; the real gaps are listed in section 1.
- Module layout and types follow the existing flat engine files and names (`ControlSiteCandidate`, `Course`, `Finding`).
- Every metric names its basis in the rule digests or is flagged as interpretation (CLAUDE.md hard rule 3).
- Routing keeps the fast time trees for the search and adds a route cache only where polylines are needed.
- Phases re-cut: shape and rhythm first for the demo, then route-choice skeleton, then the stronger search, Claude report and calibration.
- One time budget per course instead of 8 restarts, so live drawing stays responsive.
- Sprint removed (no ISSprOM support); control count no longer a hard constraint (no source gives a range).
- Calibration kept as a real phase: the user can provide real courses.
