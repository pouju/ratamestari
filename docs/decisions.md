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
