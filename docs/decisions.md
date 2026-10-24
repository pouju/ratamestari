# Decision log: AI Orienteering Course Setter

## D1: Map input uses ocad2geojson; the project is AGPL-3.0 and public

**Date:** 2026-10-22
**Status:** Decided

### Decision

Read OCAD (`.ocd`) map files directly in the browser with [ocad2geojson](https://github.com/perliedman/ocad2geojson) (by Per Liedman). Because that library is AGPL-3.0, our project is also licensed **AGPL-3.0-or-later**, and the repository is public.

### Why

- Users drag and drop their `.ocd` file straight into the app, with no command line and no separate export step.
- It runs in the browser as pure JavaScript. The `fs` module is only used for file paths; we pass a `Buffer` instead.
- It is actively maintained (v2.1.23, July 2026). It supports OCAD 10, 11, 12 and 2018-format files, and newer OCAD versions appear to still save in the 2018 format.
- Each feature carries its OCAD **symbol number**, which maps directly to ISOM/ISSprOM categories.

### Alternatives considered

- **OCAD Viewer (free):** rejected. It only exports PDF and raster images, not Shapefile, DXF or GeoJSON.
- **OpenOrienteering Mapper export (GeoJSON, DXF, Shapefile):** a viable fallback with no AGPL obligations. But it needs a manual export step, and features are tagged with language-dependent symbol _names_, not numbers.
- **Our own OCD reader:** too big for the hackathon. It's a possible future step if we want a non-AGPL license.
- **Raster image + vision model:** loses the exact symbol data needed for rule checks.

### Consequences and checklist

- [ ] Add a `LICENSE` file (AGPL-3.0-or-later) and set `"license": "AGPL-3.0-or-later"` in `package.json`
- [ ] Keep the repo public, and add a visible "Source code" link in the running app (AGPL network-use clause)
- [ ] Use only AGPL-compatible dependencies (MIT, BSD and Apache-2.0 are fine)
- [ ] Credit ocad2geojson and Per Liedman in the README
- [ ] Tell all team members at kickoff that their contributions are AGPL. Going closed-source later would require replacing ocad2geojson **and** every contributor's agreement to relicense.
- [ ] Wrap ocad2geojson in one adapter module that outputs our internal map format (features with a category such as forbidden, impassable, water, path or control feature, plus scale and georeference). Then the reader can be swapped later without touching the course logic.
- [ ] Bundling: provide the `buffer` package and alias `fs` to an empty module (Vite or webpack 5)

---

## D2: Algorithms set the course; the AI handles language

**Date:** 2026-10-22
**Status:** Decided

### Decision

A deterministic course engine does all geometry: candidate control sites from ISOM symbols, a runnability cost map with A* routing, course search, rule checks and fitting to paper. The LLM works as an agent with tools. It turns the user's sentence into a course spec, calls engine tools (e.g. `generate_course`, `make_leg_harder`), reads the rule-check results, and explains the course in plain language.

### Why

- A language model is good at understanding "SM-level long distance" and explaining choices, but unreliable at measuring distances on a map.
- Rule checks must be exact and repeatable.

### Alternatives considered

- **Vision model placing controls on a map image:** rejected. The results look plausible but break rules.

### Consequences

- Rule values (control spacing, winning times per class, difficulty levels) live in a config file sourced from the IOF and SSL documents. The LLM reads them and never invents numbers.

---

## D3: The map never leaves the user's computer

**Date:** 2026-10-22
**Status:** Decided

### Decision

Privacy of the club's OCAD file is a core requirement. The map is parsed and processed only in the browser (course engine in a Web Worker). The LLM receives only text and numbers: the request, course and leg statistics, rule-check results and control descriptions as words. It never receives the map file, coordinates or geometry. Engine tools run locally and return summaries.

### Consequences

- MVP: the user pastes their own Claude API key, which is stored only in their browser.
- Future option: an offline mode with a local model.
- The open-source code (D1) lets anyone verify that the map is not uploaded. Mention this in pitches.

---

## D4: MVP is a static app on GitHub Pages, built to be server-ready

**Date:** 2026-10-22
**Status:** Decided

### Decision

The MVP is a static web app hosted on GitHub Pages, with no backend. The course engine is a browser-independent TypeScript package behind three interfaces:

- `MapSource`: OCAD, OMAP/XMAP, later PNG + world file
- `LlmProvider`: own key in the browser, a server proxy, or a local model
- `Storage`: the browser now, a database later

### Why

- No server work during the hackathon.
- The same engine can later run in a Node service, for our own hosted version or an integration into another system.

### Consequences

- A hosted service is fine under AGPL (D1) if users can get the source.
- Integration into a closed-source system requires replacing the OCAD reader first.

---

## D5: One-view workspace instead of a step-by-step wizard

**Date:** 2026-10-22
**Status:** Decided

### Decision

The UI is a single workspace:

- Main area: the map shown as the print page, with the course and control description box on it.
- Side panel: the assistant chat, interpreted spec, live progress, rule warnings with Fix buttons, and tabs for several courses (e.g. H21, D21).

The course draws itself live in the same view. The user can stop and take over at any point, drag controls or the description box, and rules re-check instantly.

### Alternatives considered

- **Four-step flow (map, build, edit, export):** rejected as too complex for non-technical users.

---

## D6: The user chooses the competition centre

**Date:** 2026-10-22
**Status:** Decided

### Decision

The tool does not guess the competition centre. It suggests candidate places found from the map (fields, buildings, parking areas, roads), and the user picks one or clicks the map. Other wishes, such as start and finish placement, are given in the chat.

### Why

- Usually only a few places on a map can work as the centre, and the organiser already knows which one.
- It narrows the search space and keeps the scope realistic.

---

## D7: Courses are fitted to paper automatically

**Date:** 2026-10-22
**Status:** Decided

### Decision

By default the engine plans the course so that the whole course and the control description box fit the chosen paper (A4 or A3). It picks the print area and orientation (landscape or portrait) automatically based on the course's shape. The user can override paper size, orientation, scale and the print area.

### Consequences

- "Fits on paper with the description box" is a rule check like any other.
- The description box placement must not cover the course.

---

## D8: IOF control descriptions are generated and printed on the map

**Date:** 2026-10-22
**Status:** Decided

### Decision

Control descriptions follow the IOF symbolic format (columns A–H, header rows with event, class, length and climb, thicker lines every third control, a finish row). They are generated from the map objects under each control, mainly columns D (feature) and G (location of the flag). They are printed on the map in the print area and also feed into the difficulty assessment (e.g. "hill, top" is too easy for SM level).

### Consequences

- The build uses the official IOF pictogram set. The concept sketches use hand-drawn stand-ins.

---

## D9: Export is IOF XML 3.0 for the course and PDF for the print

**Date:** 2026-10-22
**Status:** Decided

### Decision

- **IOF XML 3.0:** controls, their order and positions, so the course opens in OCAD, Condes and Purple Pen.
- **Print PDF:** the map with the course and the description box, plus a separate description sheet.

### Why

IOF XML 3.0 has no standard fields for control description symbols. Course controls carry map text, leg length, score, type and a special instruction. Descriptions could go into `Extensions`, but other programs would ignore them.

---

## D10: Hackathon scope

**Date:** 2026-10-22
**Status:** Decided

### In scope

- OCAD input (OMAP/XMAP if time allows), competition centre selection, chat request to spec, course search with core rules, live drawing, IOF description box, automatic paper fit, IOF XML export.

### Out of scope for the weekend

- PNG and PDF map input, relay forking, planning a whole event's courses together, a hosted server, a local model.

### Pitch material

- Long interactive pitch and a one-minute animated pitch (with narration, music and subtitles) exist as artifacts in the claude.ai project "AI Orienteering Course Setter".

---

## D11: Tech stack and package structure

**Date:** 2026-10-23
**Status:** Decided

### Decision

- **Language:** TypeScript, strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Repo:** pnpm workspace. Internal packages export TypeScript source directly (`"exports": "./src/index.ts"`), so there is no per-package build step. One app consumes them.
  - `packages/core`: shared types, branded units and coordinates, rules config (IOF/SSL values) and its schemas
  - `packages/map-ocad`: `MapSource` adapter. The only package that imports ocad2geojson.
  - `packages/engine`: cost map, A* routing, control sites, course search, rule checks, paper fit. No DOM.
  - `packages/iof`: IOF control descriptions and IOF XML 3.0 export
  - `packages/agent`: `LlmProvider` interface, Claude implementation, tool definitions
  - `apps/web`: the one-view workspace (D5)
- **App:** React + Vite, with TanStack Store for app state and TanStack Form for settings. Add TanStack Query only if async worker/LLM plumbing needs it. No router (single view).
- **Schemas:** Zod is the single source of truth for the course spec, the rules config and LLM tool inputs. Tool calls from the LLM are validated at runtime.
- **Coordinates:** branded types for each coordinate system (OCAD paper units, ground metres, lat/lon, page/screen) so mixing them is a compile error. The engine works only in ground metres.
- **Map display:** OpenLayers. The OCAD map is rendered in the browser (ocad2geojson → SVG → canvas/bitmap) and shown as a static image layer. The engine uses the vector features, never the image. The course, paper frame and description box are vector layers; controls are draggable with OpenLayers interactions.
- **Coordinate frame:** the engine and the map view both use the map's **local frame**: ground metres, axes aligned with the printed map (map north up), origin at the OCAD paper origin. It is OCAD paper coordinates × scale. The projected CRS (the dev map is ETRS-TM35FIN, EPSG:3067, with a 10.2° grivation) is a rotation + offset away, so distances are identical. It's used only where real-world coordinates are needed (export, display). Non-georeferenced maps work the same way. Chosen during the first spike: ocad2geojson renders the map in paper orientation, and printing is in paper orientation too, so showing the map in EPSG:3067 would mean rotating the image for no benefit.
- **Worker:** the engine runs in a Web Worker via Comlink.
- **Testing:** Vitest, per package.
- **Deploy:** GitHub Actions → GitHub Pages.

### Why

- Solo developer: a small, familiar stack with strong types catches mistakes that no reviewer will.
- Packages give structure, keep the engine reusable outside the app (D4), and are easy to test in isolation.
- Several coordinate systems meet in this project. Branded types prevent unit-mix bugs.
- LLM tool inputs are untrusted; a Zod schema gives both the runtime check and the TypeScript type.
- OpenLayers handles projected and local coordinate systems as first-class citizens and has built-in feature editing.

### Alternatives considered

- **Single app with an engine folder:** simpler, but weaker boundaries and harder to reuse.
- **TanStack Router / Query:** mostly suited to server-data apps; ours is local state plus a map canvas.
- **Zustand:** equivalent to TanStack Store. TanStack chosen for consistency with TanStack Form.
- **Leaflet:** simpler, but only `CRS.Simple` for local coordinates, community types and plugin-based editing.
- **MapLibre GL:** fast, but locked to Web Mercator and cannot show non-georeferenced maps.
- **Rendering the vector features directly in the map library:** would mean reimplementing OCAD symbol styling. ocad2geojson already renders it.

### Consequences

- No online base map tiles: requesting tiles would reveal the event area to a tile server (spirit of D3).
- Browser canvas size limits (Safari's is the lowest) may require tiling the rendered map or a lower display resolution. Check with the spike.
- The PDF export renders at exact scale on its own; it does not screenshot the map view.
- First spike: load the real `.ocd` in `map-ocad`, render it, show it in OpenLayers with one draggable test control.

---

## D12: One engine package with a seeded, spec-driven course search

**Date:** 2026-10-23
**Status:** Decided

### Decision

`packages/engine` holds the whole pipeline as separate modules:

- **Cost map:** a grid of speed factors from the ISOM runnability classes; impassable and forbidden features block.
- **Router:** A\* on the cost map, giving the fastest route and its time between two points.
- **Leg evaluation:** length, best time, deviation from the straight line, route choice (distinct routes with nearly equal times), direction, climb.
- **Candidate sites:** features that can carry a control, with a difficulty score.
- **Course search:** builds the course.
- **Rule checks** and **paper fit.**

The course search is a stochastic optimisation driven by the spec:

- The LLM turns the request into a Zod-validated spec (format, class, level, centre, wishes). The engine turns the spec into targets and weights using values from `packages/rules` (course length from winning times, leg-length mix, control difficulty, amount of route choice). The LLM never supplies numbers.
- The search follows the Ratamestarikirja planning order: strong route-choice legs first, then map-reading links. It then improves the course by moving, adding and removing controls.
- A random seed drives the search. The same map, spec and seed give the same course; a new seed gives a different good course.
- Locked controls, feedback tools (e.g. `make_leg_harder`) and courses already set for the same event become constraints or weights, and the search continues from the current course.
- Climb is estimated from contour crossings along the route (contour interval × crossings), as the map has no elevation grid.

### Why

- Routing answers "how fast from A to B"; the course search asks it thousands of times. Keeping them as layers in one package lets the search reuse the cost map and route cache.
- Different requests must produce different courses on the same map, and the user must be able to ask for alternatives, but results must stay reproducible for rule checks and debugging (D2).
- Spec-to-targets through the rules package keeps rule numbers out of the LLM (hard rule 3).

### Alternatives considered

- **Fixed greedy recipe:** always produces the same course for the same input, with no alternatives.
- **LLM chooses controls from a candidate list:** breaks D2; the LLM cannot judge legs it cannot measure.
- **Separate packages per pipeline stage:** more ceremony for a solo hackathon; the module boundaries inside `engine` are enough for now.

### Consequences

- The worker streams the best course found so far, which gives the live drawing in D5.
- Every generated course records its seed and spec, so it can be regenerated.
- Climb estimates are approximate; the 4% climb check is a warning, not an error.

---

## D13: Whole-course planning: shape, rhythm and skeleton before filling in

**Date:** 2026-10-24
**Status:** Decided

### Decision

Course generation follows [`course-planning-spec.md`](course-planning-spec.md): an explainable whole-course score with shape and rhythm metrics (route doglegs, length-scaled reversals, ring, spread, leg-length distribution, alternation, direction changes), skeleton-first planning (waypoint zones now, route-choice anchor legs next), a stronger search within a fixed time budget, a text-only course report for Claude, and calibration from real courses. It is built in phases A–E; phase A replaces the forced long-distance loop with waypoint zones.

### Why

- Generated courses looked like rings with monotonous legs and out-and-back turns. The old score never looked at leg rhythm or routes, and the loop produced the ring by design.
- Course setters plan the shape and key legs first, then link them (RMK 1.2.6.S, IOF App. 2 §3.4.1).
- An explainable score lets course setters and Claude see why a course scored as it did, and lets real courses calibrate the weights.

### Alternatives considered

- **Keep tuning the existing penalties:** the missing terms (rhythm, routes, shape) cannot be reached by tuning.
- **The original draft as written:** described a different engine and invented thresholds without sources; aligned instead (spec section 15).

### Consequences

- Quality values live in `packages/rules/src/course-quality.ts`, cited or flagged as interpretation until calibrated.
- A benchmark script measures every phase against the previous one.
- Real courses for calibration stay in the git-ignored `maps/` folder.

---

## D14: Site structure, UX and visual language

**Date:** 2026-10-24
**Status:** Decided

### Decision

The site and app follow [`site-ux-plan.md`](site-ux-plan.md):

- Two pages built as a Vite multi-page app: a landing page at `/` and the workspace at `/app/`. No client-side router.
- The landing page opens with a replay of a recorded engine run on a sample map, drawn as SVG, and its main action is "Try it with a sample map".
- The workspace has one main action per state. Expert tools move to the map toolbar (Layers, Measure) and Settings.
- The assistant is off by default and turned on in Settings with the user's own key. Settings already has a slot for a hosted provider.
- The whole workflow works on phones: the map fills the screen and the panel becomes a bottom sheet.
- English first. All UI text comes from typed message catalogues, so another language is one new file.
- Visual language from the orienteering map: white paper, black ink, overprint purple as the only accent, one typeface (Atkinson Hyperlegible Next), no boxes, no all-caps labels.
- A small sample map © Vehkalahden Veikot is committed under `apps/web/public/sample/`.
- A credits section names the author (Pouju), ocad2geojson by Per Liedman and the sample map.

### Why

- The UI had grown one panel per engine feature, and most visitors will arrive on a phone without an OCAD file or an API key.
- Showing the real engine at work explains the tool in seconds without the usual AI-product look.
- A typed catalogue costs little now and avoids a rewrite when Finnish is added.

### Alternatives considered

- **GIF or video in the hero:** heavy, blurry on large screens, not translatable, and goes stale when the engine changes.
- **i18next:** heavier, and its keys are not type-checked without extra tooling.
- **Desktop-only workspace with a "use a larger screen" notice:** loses most first-time visitors.
- **Hanken Grotesk with IBM Plex Mono:** chosen from habit, and monospace data labels look generated.

### Consequences

- New conventions in `CLAUDE.md`: message catalogues, one design-token file, and the sample map as the only committed map.
- Engine and rules output stays language-free (structured findings). The UI writes the text.
- Map-dependent tests can run against the sample map in CI.

---

## D15: Course setter tools: routes, leg planning, locks and checking own courses

**Date:** 2026-10-24
**Status:** Decided

### Decision

The app gets four tools for course setters, described in [`site-ux-plan.md`](site-ux-plan.md) › Course setter tools:

- **Routes on a leg:** the fastest route and its alternatives are drawn green, blue and red (fastest to slowest), with letters and a row each in the panel.
- **Plan a leg:** the two-control dev tool becomes a user tool, and its leg can seed a generated course.
- **Lock controls and legs:** the search keeps locked controls in place and locked legs in order when it tries another course.
- **Check a course you set:** an IOF XML course file can be opened next to the map. It gets rule findings, routes, measured length and climb, and proposed descriptions. Fixes are only suggested.

They are built before the new UI (D14), in today's UI.

### Why

- Course setters want to see what the algorithm considered on a leg, and to plan the key legs themselves.
- Checking courses set in OCAD or Purple Pen widens the users from "wants a generated course" to every course setter and controller.
- The engine already has route alternatives, the IOF XML reader, recheckCourse and description generation. These tools are mostly UI.

### Alternatives considered

- **Green, yellow and red for routes:** the usual route-analysis colours, but yellow disappears on open land, so blue replaces it.
- **Fix that edits an imported course directly:** the course belongs to its setter, so fixes only suggest.
- **Lock every dragged control automatically:** surprising. Locking is an explicit choice.

### Consequences

- The course search must accept locked controls and anchor legs (D13 phases B and C come earlier for user-given anchors).
- Red and green differ in hue mainly, so routes always carry a letter and a panel row as well.

---

## D16: Public repo, versioned releases and automatic deploys to GitHub Pages

**Date:** 2026-10-24
**Status:** Decided, to be implemented once the new UI (D14) is ready for a first release

### Decision

- The repository is public on GitHub (required by D1). Pages is set to **Source: GitHub Actions**. There is no `gh-pages` branch.
- **A release is what goes live.** Pushes to `main` never change the live site, so development continues on `main` while the released version stays untouched.
- **release-please** (Apache-2.0) keeps a "Release PR" open and up to date from the Conventional Commits on `main`. The PR bumps the version (`feat` → minor, `fix` → patch, `!` → major) and updates `CHANGELOG.md`, grouped by type and scope. **Merging the Release PR is the release:** it creates the `vX.Y.Z` tag and a GitHub Release with the notes.
- One version for the whole app, kept in the root `package.json` and starting at `0.1.0`. Internal packages are not versioned separately, since they are not published.
- Three workflows in `.github/workflows/`:
  - `ci.yml`: `pnpm check` and `pnpm build` on every pull request and push to `main`.
  - `release-please.yml`: on push to `main`, maintains the Release PR.
  - `deploy.yml`: on a published release (or started by hand to redeploy), builds `apps/web` and deploys it with `actions/deploy-pages`.
- The app shows its version next to the "Source code" link, so a bug report says which release it came from.
- The README gets a header with a one-line pitch, badges (CI, latest release, license, live demo), a screenshot or GIF of the workspace, a short "How it works" diagram showing that the map stays in the browser (D3), and a "Releasing" section.

### Why

- Releasing should take one click and no hand-edited versions or changelogs. The project already uses Conventional Commits, so the version bump and changelog can be derived from them.
- Deploying from Actions avoids a branch full of build output and extra deploy tooling.
- A Release PR lets us decide when to release, with the notes visible for review before they go out.
- The README is the first thing visitors see, and the privacy claim should be easy to check.

### Alternatives considered

- **`gh-pages` branch:** the older way to publish Pages. It mixes build output into the repository's history and needs a deploy tool.
- **Deploy on every push to `main`:** simplest, but half-finished work would go live during the hackathon.
- **changesets:** wants a hand-written note per change and suits published libraries with several versions.
- **semantic-release:** releases on every push to `main`, which removes the choice of when to release.

### Consequences

- Before going public, the history was checked: no map files (`.ocd`, `.omap`, `.xmap`) or source PDFs have ever been committed. `maps/` and `docs/sources` stay git-ignored.
- Vite already uses `base: './'`, so the build works under the `/ratamestari/` path of a project Pages site.
- Map-dependent tests skip in CI except those using the committed sample map.
- Commit types now matter for releases: a user-visible change must be `feat` or `fix` to appear in the changelog, and breaking changes need `!`.
- The README screenshot waits until the new UI is demo-ready.
