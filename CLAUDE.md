# AI Orienteering Course Setter

A web app that takes an orienteering map (OCAD `.ocd`) and generates a requested course automatically, following IOF/SSL rules and course-setting guidelines. Users ask in plain language ("SM-level long distance for H21") and get a course drawn on the print page, with IOF control descriptions, ready to export.

Built as an MVP for a hackathon weekend: a few hours of hacking on Friday and Saturday, demo on Sunday. Favour working end-to-end over completeness.

Full decision log with reasoning and rejected alternatives: [`docs/decisions.md`](docs/decisions.md). Read it before changing architecture, licensing, or anything touching privacy.

## Hard rules (do not break these)

1. **The map never leaves the user's computer** (D3). OCAD parsing and the course engine run in the browser (engine in a Web Worker). The LLM receives only text and numbers: the request, course/leg statistics, rule-check results, control descriptions as words. Never send the map file, coordinates or geometry to the LLM or any server.
2. **Algorithms set the course; the LLM handles language** (D2). All geometry, distances, routing and rule checks are deterministic code. The LLM is an agent that turns the request into a spec, calls engine tools, reads results and explains. It never measures or places controls itself.
3. **The LLM never invents rule numbers.** Control spacing, winning times per class, difficulty levels etc. live in a config file sourced from IOF and SSL documents.
4. **License is AGPL-3.0-or-later** (D1), because we use ocad2geojson. Only add AGPL-compatible dependencies (MIT, BSD, Apache-2.0 are fine). Keep a visible "Source code" link in the running app.

## Architecture

- **Static web app on GitHub Pages**, no backend (D4).
- **Course engine**: a browser-independent TypeScript package (so it can later run in Node), behind three interfaces:
  - `MapSource` — OCAD now; OMAP/XMAP if time allows; later PNG + world file
  - `LlmProvider` — user's own Claude API key stored in the browser (MVP); later a server proxy or local model
  - `Storage` — browser now, database later
- **Map input** (D1): [ocad2geojson](https://github.com/perliedman/ocad2geojson) by Per Liedman, wrapped in **one adapter module** that outputs our internal map format: features with a category (forbidden, impassable, water, path, control feature…), plus scale and georeference. Course logic must not depend on ocad2geojson directly. Features carry OCAD symbol numbers, which map to ISOM/ISSprOM categories.
  - Bundling: provide the `buffer` package and alias `fs` to an empty module (Vite or webpack 5). Pass a `Buffer`, not a file path.
- **Engine pipeline**: candidate control sites from ISOM symbols → runnability cost map + A* routing → course search → rule checks → fit to paper.
- **Agent tools** (examples): `generate_course`, `make_leg_harder`. Tools run locally and return summaries only.

## Product behaviour

- **One-view workspace** (D5), not a wizard. Main area: the map as the print page with course and description box. Side panel: assistant chat, interpreted spec, live progress, rule warnings with Fix buttons, tabs per course (H21, D21…). The course draws live; the user can stop, drag controls or the description box, and rules re-check instantly.
- **User picks the competition centre** (D6). Suggest candidates from the map (fields, buildings, parking, roads); user picks or clicks. Start/finish wishes come via chat.
- **Auto-fit to paper** (D7): course + description box fit A4 or A3; engine picks print area and orientation. User can override paper, orientation, scale, print area. "Fits on paper" is a normal rule check; the description box must not cover the course.
- **IOF control descriptions** (D8): symbolic format, columns A–H, header rows (event, class, length, climb), thicker line every third control, finish row. Generated from map objects under each control (mainly column D feature, G flag location). Also used in difficulty assessment (e.g. "hill, top" is too easy for SM level). Use the official IOF pictogram set.
- **Export** (D9): IOF XML 3.0 (controls, order, positions; opens in OCAD, Condes, Purple Pen) and a print PDF (map with course and description box, plus a separate description sheet). IOF XML has no standard fields for description symbols.

## Hackathon scope (D10)

In: OCAD input (OMAP/XMAP if time), competition centre selection, chat → spec, course search with core rules, live drawing, IOF description box, automatic paper fit, IOF XML export.

Out for the weekend: PNG/PDF map input, relay forking, planning a whole event's courses together, hosted server, local model.

## Open setup checklist

- [ ] `LICENSE` file (AGPL-3.0-or-later) and `"license": "AGPL-3.0-or-later"` in `package.json`
- [ ] Repo public; "Source code" link in the app
- [ ] Credit ocad2geojson and Per Liedman in the README
- [ ] Tell all team members at kickoff that contributions are AGPL
- [ ] ocad2geojson adapter module → internal map format
- [ ] Bundler config: `buffer` polyfill, `fs` aliased to empty module
- [ ] Rules config file (IOF + SSL values)

## Recording new decisions

Add new decisions to `docs/decisions.md` using the same format (D11, D12…: Date, Status, Decision, Why, Alternatives considered, Consequences). Update this file if a decision changes a hard rule or the architecture.
