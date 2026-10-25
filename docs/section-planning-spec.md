# Spec: Section-based course planning

**Project:** Ratamestari, orienteering course setter
**Status:** Decided, recorded as **D19** (planner) and **D20** (reveal instead of live drawing) in [`decisions.md`](decisions.md)
**Applies to:** `packages/engine` (course search), `packages/rules` (`course-quality.ts`), `scripts/` (benchmark, render), `docs/rules/course-setting.md` (Course search section), and the progress contract with `apps/web`
**Builds on:** [`course-planning-spec.md`](course-planning-spec.md) (D13). Its score, metrics, benchmark and phase A stay. This spec replaces its section 8 (planning and search) and folds in its phases B and C.
**Written:** 2026-10-24, for the demo on 2026-10-25

---

## 0. Instructions for the implementing agent

- Read, in this order:
  1. this document;
  2. `CLAUDE.md`;
  3. D13, D19 and D20 in `decisions.md`;
  4. [`course-setting.md`](rules/course-setting.md), especially "Planning", "Long distance", "Middle distance" and "Course search";
  5. `packages/engine/src/course-search.ts`, the file this spec mostly rewrites;
  6. `waypoints.ts`, `site-quality.ts`, `time-tree.ts`, `course-metrics.ts`, `print-area.ts` and `course-on-paper.ts`;
  7. `packages/rules/src/course-quality.ts`.
- **Hard rules (CLAUDE.md) still apply.**
  - All geometry is deterministic engine code (D2).
  - Nothing new goes to the LLM (D3).
  - Every new number lives in `packages/rules/src/course-quality.ts`, cites a rule digest section or is flagged `interpretation: true`, and is marked _(tune)_ below when it is a starting default.
  - Never invent rule numbers.
- **Determinism (D12):** every random choice uses the seeded `Random` from `random.ts`. Same seed, same course.
- **Work on `main`,** in small commits that each pass `pnpm check`. Chain `pnpm check && git commit`, never `;`. Use Conventional Commits with the package as scope, and a body that says why.
- **Ask the user** before introducing a new convention (CLAUDE.md). The new engine files named in section 4 are approved by this spec.
- **Measure every phase.** Run `pnpm benchmark-courses` before and after each phase and render courses with `pnpm render-course` (section 9). Stop after each phase and report to the user:
  - the benchmark table;
  - the paths of 4–6 renders (long on `maps/map-b.ocd`, middle on `map-a` and `map-c`);
  - what you could not finish.

  The user is an orienteer and judges the renders. The numbers alone are not enough.

- **Parallel work on main:** a separate agent is changing `apps/web` on branch `feat/course-reveal` (D20: no live drawing, reveal of the final course). Don't edit `MapView.tsx`, `CoursePanel.tsx`, `course-overprint.ts` or `App.tsx`'s `generateCourse` until that branch is merged. The engine-side progress contract (section 7) is yours. The web side adopts it after the merge.

---

## 1. Problem and evidence

User feedback (2026-10-24):

- **Middle distance** often packs a full course into too small an area, which gives a messy course.
- **Long distance** often has sections where about ten controls sit very close together.
- **The course "runs out" at the end.** The algorithm seems to finish the course and only then notice there is not enough space left, so the ending is messy.

Renders on the club maps confirm all three. For example:

- Middle on map-a, seed 2: 8 of 14 controls bunch around the start.
- Long on map-b, seed 3: controls 4–6 are 0.5-minute legs, controls 13, 17, 18 and 19 are in one spot, and controls 20→25 run home in a straight line.

### Root causes in today's search (`course-search.ts`)

1. **No time budget per part of the course.** `planWaypoints` places zones by distance, never by time, and `buildGreedy` walks forward until the time runs out.
   - When the zones are used up early, the last 25% of the time pulls towards the finish (`isHeadingHome`, `closerToFinish`) while drawing short legs, which gives a tangle near home.
   - When the zones are too far apart, `t + toFinish ≤ remaining` shrinks the allowed area and the course is squeezed home.
2. **The leg-length quota ignores position.** `pickLegBin` fills histogram deficits. Long legs use up the time early, the only deficits left are short bins, and short legs come back to back. `QUALITY_PREFERENCE` then keeps them around the same good spot.
3. **The middle leg-mix target is wrong.** `FORMAT_QUALITY.middle.legLengths.shares` asks for 25% of legs under 150 m.
   - The human reference courses in `maps/*.Courses.xml` have about 7% (one leg per course; median leg 330 m).
   - Generated courses score _better_ on "middle fit" than the human ones (0.01–0.04 against 0.05–0.08).
   - Experiment: setting the shares to `[0.08, 0.35, 0.4, 0.1, 0.07, 0, 0]` removed most middle bunching and cut middle search time from 7–13 s to 1.5–2.5 s.
4. **Crowding is not penalised.** Spacing is only checked for pairs (about 60 m), so ten controls 80 m apart are legal. The middle `closeness` weight is 5.
5. **The improvement step can't restructure.** It uses single-control moves and accepts only strict improvements, and `addsLineProblems` vetoes many moves. A cluster of 8 controls is a deep local optimum. The draft loop stops at the first draft that reaches 85% of the target time, so in practice only one draft is built.
6. **Middle area placement.** The core has a fixed 750 m radius, the start is forced inside it, and the finish stays at the centre the user picked, wherever the core is. The result is courses that run back past the start, or a 1.1 km final leg (map-c).

---

## 2. Design

Plan the way a course setter does: first find the good technical areas, then decide which ones the course visits and which legs connect them, then set each section. The rule digests support this:

- "Plan as many good route-choice legs … as possible first, then join them with map-reading legs" (RMK 1.2.6.S).
- "Connecting legs between terrain parts don't have to be high quality" (RMK 1.2.6.S).
- "A few very good legs joined by short links" (IOF App. 2 §3.4.1).
- "Changes of rhythm are central" in middle distance (RMK 2.S.2).
- 1.5–2 km² of good terrain is enough for middle distance (RMK 2.S.2).

```
print area (descriptions reserved)
  └─ 1. areas      technical areas in the usable print area, each with a capacity in seconds
      └─ 2. skeleton   format template → which areas, in which order; connecting legs with fixed
          │            endpoints; start; run-in; a time budget for every section
          └─ 3. fill       each section: the best control sequence from its entry to its exit
              │            within its budget (beam search); sections are independent
              └─ 4. improve   section rebuild + existing single-control moves, simulated annealing
                  └─ 5. repair   existing hard-rule and dogleg repair → Course
```

Key properties:

- **Every section has a budget,** including the last one into the finish. The course can't run out of time or space at the end.
- **Capacity limits the budget.** An area gets no more time than it can hold without crowding. A middle course in too small an area visits a second area, or comes out shorter with the existing "winning time out of reach" finding. It is never crammed.
- **Connecting legs cross weaker terrain on purpose.** They are chosen for route-choice value (long) or as the semi-long leg (middle). Controls are not put in weak terrain.
- **The degenerate case is one section** covering the whole pool. Small maps and the synthetic test maps therefore still work, and the old greedy builder can be removed once the benchmark passes.
- **Sections are independent given their endpoints,** so they can later run in parallel workers (section 8).

---

## 3. Phase 0: quick wins (do first; they stay useful in the new design)

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Where                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| a   | Middle leg-mix target `[0.08, 0.35, 0.4, 0.1, 0.07, 0, 0]` _(tune)_. Cite RMK 2.S.2 ("legs are short on average, the shortest a few tens of metres"). Flag it as interpretation calibrated on the reference courses in `maps/` (benchmark 2026-10-24). Check the long shares against the long reference course on map-b too, and report; don't change them blindly.                                                                                        | `course-quality.ts`                                          |
| b   | **Crowding metric** `crowding(stops, radiusMetres, maxControls)`: for each control, count the controls within the radius (itself included). The value is the sum of `max(0, count − maxControls)`. Config: long 300 m / 3, middle 150 m / 3 _(tune, interpretation)_, weight 40 _(tune)_. Add it as a `ScoreTermName` with a note naming the controls. Also add it as a filter in `buildGreedy` (until phase 3 replaces it) and later in the section fill. | `course-metrics.ts`, `course-quality.ts`, `course-search.ts` |
| c   | **End-of-course benchmark columns:** max controls in any crowding circle, and an "end tangle" ratio: the mean nearest-neighbour distance of the controls in the last 25% of the time ÷ that of all controls. Also add these to the reference rows.                                                                                                                                                                                                         | `scripts/benchmark-courses.ts`                               |
| d   | Build all `MAX_DRAFTS` drafts and keep the best by score. Drop the 85% early exit, but keep the `yield null` pause between drafts.                                                                                                                                                                                                                                                                                                                         | `course-search.ts`                                           |

**Fallback for the demo:** if phases 1–3 aren't passing the benchmark by the cut-off the user sets, also do the simple time budgeting in the greedy:

- give each waypoint section a share of the target time, proportional to its zone-to-zone distance;
- when the last waypoint is reached with more than 15% _(tune)_ of the time left, add a new waypoint at the best area at least `minSeparationMetres` from the controls used so far, instead of heading home.

Ship phase 0 plus this fallback.

---

## 4. Modules

New files in `packages/engine/src` (flat, like the existing ones):

| File              | Exports                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `areas.ts`        | `findTechnicalAreas(pool, quality, profile, random?) → TechnicalArea[]`                                  |
| `skeleton.ts`     | `planSkeleton(context, areas, template, random) → Skeleton \| null`                                      |
| `section-fill.ts` | `fillSection(context, request: SectionRequest, random) → SectionFill \| null` (pure, serialisable input) |

`course-search.ts` keeps its public API (`searchCourseSteps`, `searchCourse`, `evaluationFor`, `assembleCourse`, `expectedControlCount`, `Course`, `CourseSpec`), so `course-on-paper.ts`, `course-editing.ts`, the agent tools and the worker keep working. Internally, the draft loop calls areas → skeleton → fill instead of `planWaypoints` → `buildGreedy`.

Types (adapt names to the code; keep them in engine, not core):

```ts
interface TechnicalArea {
  readonly sites: readonly number[] // pool indices
  readonly centre: LocalPoint // quality-weighted
  readonly hull: readonly LocalPoint[] // convex hull of the sites
  readonly areaSquareMetres: number
  readonly meanQuality: number
  readonly capacitySeconds: number
}

interface SkeletonSection {
  readonly area: number | null // null: the run-in, or a single whole-pool section
  readonly entry: number // pool index of the first stop (start, or the end of a connecting leg)
  readonly exit: number | 'finish' // pool index of the last control, or the finish
  readonly budgetSeconds: number
  readonly legBandMetres: readonly [number, number]
}

interface Skeleton {
  readonly start: number
  readonly sections: readonly SkeletonSection[]
  readonly connectingLegs: readonly { from: number; to: number; seconds: number }[]
  readonly estimatedSeconds: number
  readonly score: number
}
```

---

## 5. Algorithm

### 5.1 Technical areas (`areas.ts`)

1. **Candidate sites:** the search pool (already limited to the usable print area, so the description box and peripheral box are excluded, and to sites reachable from the finish) with area quality ≥ `minQuality` _(tune: long 0.45, middle 0.4)_.
2. **Cluster with DBSCAN** on positions: `eps` long 175 m, middle 110 m; `minPoints` 4 _(tune)_. DBSCAN is deterministic, needs no cluster count and leaves weak terrain as noise. Use a bucket grid for the neighbour queries, as `siteAreaQuality` does.
3. **Split clusters** larger than `maxAreaSquareMetres` (long 1.0 km², middle 2.0 km² _(tune)_; RMK 2.S.2 for middle) with k-medoids on positions. Seed the medoids by farthest-point sampling so the result is deterministic. This gives long distance several areas instead of one giant one.
4. **Drop areas** below `minAreaSquareMetres` _(tune: long 0.08 km², middle 0.05 km²)_ or with fewer than 4 sites.
5. **Capacity:** pick a maximal well-spread subset of the area's sites by farthest-point sampling, with a minimum separation of the format's typical technical leg (long 250 m, middle 150 m _(tune)_). For k sites picked, `capacitySeconds = (k − 1) × typicalLegSeconds`, where `typicalLegSeconds` is the separation × pace × the area's mean slowness from the cost grid. This is a rough, explainable upper bound on how much course the area holds without crowding.
6. **Compute once per map and pool,** then filter by print area. The paper evaluation (5.6) then reuses the same areas.

Debug output: `pnpm render-course --areas` draws the hulls with their capacity in minutes. Build this first: the user judges the areas visually.

### 5.2 Format templates (`course-quality.ts`, `FORMAT_TEMPLATES`)

| Format | Template _(all tune, interpretation)_                                                                                                                                                                                                                                                                     | Basis                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| long   | 3–5 technical sections. 2–4 **connecting legs**, each 6–12% of the winning time and 800–2500 m straight (today's `LEG_PROFILES.long.longLeg`, which is cited). Connecting legs together take 30–50% of the time. Technical legs 150–800 m. A run-in of 0–3 controls near the finish.                      | RMK 1.2.6.S, RMK 2.S.1, IOF App. 2 §3.4.1 |
| middle | 1 main technical section (≥ 50% of the time) and an optional second section in a different area. Exactly 1 **semi-long leg**: 500–1200 m, 6–10% of the time. Technical legs 60–500 m. A run-in of 0–2 controls. The main section lies within `MIDDLE_CORE_REACH_SHARE_OF_TARGET` of the finish, as today. | RMK 2.S.2                                 |

The template gives ranges. The skeleton search picks inside them, and the choice depends on the seed.

### 5.3 Skeleton (`skeleton.ts`)

1. **Order the areas** with a beam search (width 40 _(tune)_) over sequences that match the template's section count, using estimated times between area centres:
   - straight distance × pace × the mean slowness along the line (sample the cost grid, like `straightLineSeconds`);
   - then refine the top 5 skeletons with real time trees.

   The skeleton score is a weighted sum (weights in config):
   - fit of the time estimate to the target (each section budget ≤ its capacity);
   - the quality of the areas used;
   - connecting-leg bearings at least 60° apart, with no reversal (`COURSE_SHAPE.reversalDegrees`) between consecutive connecting legs;
   - spread on the paper (the existing `spread` target);
   - connecting legs that don't cross each other badly (`crossingSeverity`).

2. **Choose the connecting-leg endpoints.** For each connecting leg A→B, take up to 8 _(tune)_ exit candidates in A on the side facing B and 8 entry candidates in B on the side facing A, all within the difficulty range. Score the pairs:
   - long: `routeChoiceValue` (already in `course-search.ts`) + mean quality, inside the leg band;
   - middle: the semi-long leg band, with route-choice value as a smaller bonus.

   Build time trees only from the 8 exit candidates. This is phase B's "route-choice anchors" from D13, integrated here.

3. **Start:** today's `pickStart` rules (difficulty ≤ 2, distance from the finish, or the user's `startDistanceFromFinishMeters` wish). The start is the entry of the first section, or one short leg before it.
   - Middle: the start must not lie inside the main section's hull, unless the user's wish forces it. This fixes the course running back past the start.
4. **Run-in:** the last section exits into the finish. When the last area's nearest site is more than `FINAL_LEG_MAX_SHARE_OF_TARGET` from the finish, add a run-in section from sites near the finish (any quality, at least difficulty 1), budget ≤ 8% _(tune)_.
5. **Budgets:** `free = target − Σ connecting legs − start leg − run-in budget`. Split `free` between the technical sections in proportion to `min(capacity, quality × area)` and cap each at its capacity.
   - If the capped total is short of `free` by more than 10%, try the next skeleton (another area, or one more section).
   - If none fits, keep the best one and let the course come out short. The existing `winningTimeOutsideRange` finding then tells the user the terrain is too small for the class.
6. Yield `null` between candidate skeletons so the worker can slice and stop (section 7).

### 5.4 Section fill (`section-fill.ts`)

Input: `entry`, `exit`, `budgetSeconds ± tolerance` (3% of the budget _(tune)_), the allowed sites (the area's sites plus a 100 m buffer; for the run-in, sites within reach of the finish), the leg band, and the stops already fixed elsewhere (other sections, connecting legs), for the geometry checks.

Beam search, width 40 and top 10 expansions per state _(tune)_:

- **State:** a partial path from `entry`, its elapsed seconds, and its leg lengths.
- **Expand** to sites that pass the local hard checks today's `fits` uses in `buildGreedy` (move them into a shared helper rather than copying):
  - spacing, and circles not overlapping;
  - angle ≥ `ACUTE_ANGLE.noteBelowDegrees`;
  - no bad crossing with the section's own legs or the fixed legs;
  - the line clear of other circles, on the map and clear of the descriptions;
  - plus the crowding limit;
  - plus feasibility: `elapsed + t(current→site) + t(site→exit) ≤ budget × (1 + tol)`.
- **State score:**
  - local quality (site quality, difficulty in range);
  - rhythm: the leg-mix deviation of the section from the format target, alternation, and direction changes;
  - a **pacing** term: the share of the budget used should roughly match the share of the expected leg count placed. This prevents early wandering followed by a dash for the exit.
  - Small seeded noise breaks ties and gives variety.
- **Complete** when closing to `exit` lands within tolerance. Return the best complete path. If none is complete, return the closest one under budget, flagged short.
- **Time trees:**
  - one tree from `exit` (limit = the budget);
  - from each expanded site, a tree limited to the maximum leg seconds of the band. Bounded trees are far cheaper than today's 25%-of-target trees.
  - Share the existing `timesFrom` cache, keyed by site and limit.

### 5.5 Assembly and improvement

1. Assemble `start → section 1 → connecting leg → section 2 → … → finish` and score with `createEvaluation`, which now includes crowding.
2. **Improvement loop:** simulated annealing with geometric cooling, within a time budget (long 8 s, middle 4 s _(tune)_), yielding `null` regularly. Moves:
   - **rebuildSection** (half of the moves): pick a contiguous window of 3–6 controls, preferring windows with findings or crowding, and refill it with `fillSection` using the same entry, exit and freed time;
   - **moveConnectingLeg** (rare): swap a connecting leg for another endpoint pair from 5.3 step 2, and refill its two neighbouring sections;
   - today's single-control moves from `proposeChange`, keeping section boundaries (connecting-leg endpoints) fixed.

   Keep `addsLineProblems` as a veto for single-control moves only; rebuilt sections already pass the checks.

3. Then today's `repairHardRules` and `repairDoglegs`, unchanged.
4. **Drafts:** the outer loop builds up to 3 skeleton+fill drafts (different seeds of the same `Random`) and improves the best one.

### 5.6 Paper (after phase 3; cut if short of time)

The user's idea: choose where the paper goes by what the course can do there.

- For automatic paper, make `planPrintArea` return its top 5 _distinct_ positions (today it keeps only the best), run 5.1 (filtered) and 5.3 for each, and keep the one whose best skeleton scores highest.
- Try A3 only when no A4 skeleton reaches the class's winning-time range. This keeps today's A4-first rule (course-setting.md, Paper).
- When the user placed the frame (`printFrame`), skip this and plan inside it.

---

## 6. Config (`packages/rules/src/course-quality.ts`)

Add, Zod-validated, each block cited or `interpretation: true`:

- `crowding: { radiusMetres, maxControls }` per format, plus a `crowding` weight in `SCORE_WEIGHTS`;
- `technicalAreas: { minQuality, eps, minPoints, minAreaSquareMetres, maxAreaSquareMetres, capacityLegMetres }` per format;
- `FORMAT_TEMPLATES` (5.2);
- `sectionFill: { beamWidth, expansions, budgetTolerance }`, `skeletonSearch: { beamWidth, refined }` and `improvementSeconds` per format.

Move constants from `course-search.ts` into config when this spec touches them (as D13 asked). Constants not touched can stay.

Update **`docs/rules/course-setting.md` › Course search** to describe the new behaviour (areas, templates, budgets, crowding), keeping each statement cited or marked **Interpretation:**. The digest describes what the engine does, and it is out of date the moment the greedy goes.

---

## 7. Progress contract (engine side; D20)

The UI no longer draws intermediate courses. It shows a phase and reveals the final course. Change the generator's yield type:

```ts
export type SearchPhase = 'areas' | 'skeleton' | 'sections' | 'improving' | 'checking'
export interface SearchProgress {
  readonly phase: SearchPhase
  readonly done: number
  readonly total: number
}
export type SearchStep = SearchProgress | null // null: a pause point, as today
export type Search = Generator<SearchStep, Course | null, boolean | undefined>
```

- `runSearch` and `setCourseOnPaper` take `onProgress: (progress: SearchProgress) => void`. Stopping still returns the best course so far as the generator's return value.
- Update the `course-search.test.ts` "reports progress" test and the worker (`runSliced`) in the same commit. Coordinate the web side with the `feat/course-reveal` branch: it defines a web `SearchPhase` placeholder, which should import the engine type after the merge. Labels live in `apps/web/src/i18n/`. Engine output stays language-free.
- The engine stops assembling intermediate `Course` objects for progress. That saves time.

---

## 8. Parallel sections (after the demo)

`fillSection` takes plain, serialisable input (pool indices, budget, endpoints), so sections can go to a pool of Web Workers via Comlink.

- GitHub Pages can't send COOP/COEP headers, so there is **no `SharedArrayBuffer`**. Each worker needs its own copy of the terrain grid (transfer a copy once per map).
- Measure first. The bounded time trees (5.4) may make single-threaded filling fast enough.

---

## 9. Evaluation and acceptance

**Benchmark:** `pnpm benchmark-courses` (long on map-b, seeds 1–5; middle on all maps with references, seeds 1–3), with the phase 0c columns added. Also add columns for the number of sections and connecting legs, and the connecting legs' route-choice values.

**Renders:** for every phase, `pnpm render-course` for long map-b seeds 1–3 and middle map-a and map-c seeds 1–2. Report the paths. The `--areas` overlay applies from phase 1.

**Accept the planner (phases 1–3) when, across the benchmark runs:**

- no hard-rule findings (spacing, overlapping circles, lines off the map or under the descriptions); estimated time inside the class range in ≥ 90% of runs;
- crowding: no circle of the configured radius holds more than its limit, in every run;
- end tangle ratio ≥ 0.7 in every run (the last quarter is not much denser than the rest);
- middle: at most 2 legs under 150 m per course, and median leg 250–400 m (reference: 330 m);
- long: at least 2 connecting legs ≥ 1 km with route-choice value ≥ 0.5 in ≥ 80% of runs;
- search time: long ≤ 20 s, middle ≤ 8 s in `pnpm render-course` on the dev machine (today: long 23–55 s, middle 7–13 s);
- all existing engine tests pass. Update test expectations only where this spec changes the behaviour (progress type), never to hide a regression;
- **the user's visual review of the renders.**

---

## 10. Phases

| Phase | Content                                                                                                                                                      | Demo-critical      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 0     | Quick wins a–d (section 3)                                                                                                                                   | yes                |
| 1     | `areas.ts` + config + `--areas` overlay + tests on a synthetic map (two separated site clusters → two areas, noise → none)                                   | yes                |
| 2     | `skeleton.ts`: templates, area order, connecting-leg endpoints, start, run-in, budgets + overlay of the skeleton in `render-course`                          | yes                |
| 3     | `section-fill.ts` + assembly; the draft loop uses it; remove `buildGreedy` and `planWaypoints` once the benchmark passes                                     | yes                |
| 4     | Annealing + `rebuildSection` / `moveConnectingLeg`                                                                                                           | yes if time allows |
| 5     | Progress contract (section 7), re-run `pnpm record-demo-run`, update `course-setting.md`, CLAUDE.md (Engine pipeline, Product behaviour) and D13 §8 pointers | yes                |
| 6     | Paper choice from skeletons (5.6)                                                                                                                            | no                 |
| 7     | Parallel sections (section 8), calibration of templates and weights on reference courses (D13 phase E)                                                       | no                 |

**Cut lines:** after phase 0 the app is already better. If phase 3 isn't accepted by the user's cut-off, ship phase 0 with the fallback from section 3, and phase 5's progress contract, because the reveal UI needs it.

---

## 11. Risks

- **Too few areas on a map** (small, uniform or open terrain): the one-section fallback must give a course at least as good as phase 0. Test it on the synthetic fixtures and the sample map (`apps/web/public/sample/`).
- **Areas cut by impassable features** (lakes, cliffs): DBSCAN on straight distance can join sites across a lake. Split a cluster when the time between its sites (bounded time tree from the medoid) is much larger than the straight distance suggests (ratio > 2 _(tune)_).
- **Connecting legs that cross forbidden areas or tempt competitors through them:** reuse the leg checks (`evaluateLeg` route findings) on the chosen pairs (IOF App. 2 §3.4.2).
- **Course lines of different sections crossing:** the section fill checks against all fixed legs. Fill the sections in course order and re-check at assembly.
- **Search time:** the beam sizes are the knobs. Measure before tuning anything else.
