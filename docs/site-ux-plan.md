# Site and UX plan

**Date:** 2026-10-24
**Status:** Decided (D14 in `decisions.md`)
**Mockups:** design canvas "Ratamestari site and UX" (landing page with animated demo, site map, five desktop workspace states, four phone screens), revised after the frontend-design review

So far the UI has grown one panel per engine feature. This plan decides what the public site looks like before we build more UI: a landing page, the tool itself, and how the optional assistant fits in. It keeps D3 (map stays local), D4 (static now, server-ready), D5 (one-view workspace) and D6 (user picks the centre).

## Goals

1. **Easy first, powerful underneath.** A first-time user goes from map to PDF without reading anything. Expert tools are one click away, never in the way.
2. **One primary action per state.** At any moment exactly one filled button tells the user what to do next. Everything else is a text button or lives on the map.
3. **Works on a phone.** Most people will find Ratamestari from a link on their phone. The landing page and the whole workflow work there, not just a "use a bigger screen" message.
4. **No API key needed.** The form is the main way to set a course. The assistant is an extra input, turned on in Settings.
5. **Honest about status.** The landing page says what works, what is next, and that the course setter still owns the course.
6. **English first, ready for Finnish.** No user-facing string is written inline, so adding a language is only a new message file.
7. **Server-ready.** The same pages work when a server appears; only what sits behind `LlmProvider` and `Storage` changes.

## Site structure

| Path      | Page      | What it is                                                                                             |
| --------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `/`       | Landing   | What it is, the demo, how to use it, status, privacy, credits. Small bundle, no map or engine code.    |
| `/app/`   | Workspace | The tool. React app with the engine worker.                                                            |
| `/guide/` | Guide     | Later. Longer how-to and the rule digests as readable pages. Until then a section on the landing page. |

Built as a **Vite multi-page app** (two HTML entry points). No client-side router, so GitHub Pages needs no `404.html` trick. `base` is set for the Pages sub-path. With a server later the same paths are served as they are. A Finnish version later lives at `/fi/` and `/fi/app/` or picks the language from the browser; the choice is remembered in the browser.

## The wow

We want people to get it in three seconds, without the usual AI-product look (gradients, glowing orbs, sparkles). The wow comes from showing the real thing working, in the language of an orienteering map.

1. **The hero is the engine, replayed.** Not a GIF or video: a recorded run of the real engine on the sample map, played back as live SVG. The map appears, the centre drops in, candidate control sites light up across the map, the course is drawn leg by leg while the length counts up, the description box fills row by row, and the A4 frame settles around it. Then "11.4 km · 320 m · no rule errors · PDF and XML". It loops, has a pause button, and follows `prefers-reduced-motion` (shows the finished page and the step list). See the "Hero demo" artboard, which plays.
   - Why not a GIF: sharp on every screen, a few kB instead of MBs, its captions are translatable, and it can't go stale: we re-record it when the engine changes.
   - How: a script runs the engine in Node on the sample map with a fixed seed and records the progress events (sites, each draft, the final course, descriptions, print area) into one JSON file. The landing page draws the map from a small pre-rendered image of the sample map plus that JSON. The sample map is public, so this does not touch D3.
2. **One tap to a real course.** The main button on the landing page is **Try it with a sample map**. It opens the app with the sample map loaded and the centre chosen, and the engine starts at once. Within seconds the visitor watches a course being set live on their own device, the same motion they just saw in the hero. What the landing page promises is exactly what the app does.
3. **The same motion inside the app.** While searching, the workspace shows what the engine is doing: sites appear, the current best course redraws, figures count, controls with problems get a dashed orange ring. When it finishes, the description box assembles row by row. Dragging a control snaps it to the nearest site with a short settle, and the rule rings update as you drag.
4. **Paper as the material.** The print page sits on the field-grey table with a real shadow, the course is in overprint purple, and the hero map carries a real scale bar and north lines. It should feel like a course setter's desk, not a SaaS dashboard.

Motion rules: only to show what the engine is actually doing, never decoration; under 300 ms for UI responses; always skippable; nothing moves when reduced motion is on.

## Landing page

Sections, top to bottom (see the "Landing page" and "Phone · landing" artboards):

1. **Header:** wordmark, How it works, Status, Privacy, Source code, **Open the app**. On a phone only the wordmark and Open the app; the other links are in the footer.
2. **Hero:** "A first course in minutes, set by the rules." One paragraph, **Try it with a sample map** (primary), _Open your own map_, the privacy line, and the hero demo next to it (under it on a phone).
3. **How it works:** four steps drawn as course symbols (start triangle, control 2, control 3, finish).
4. **Every check names its rule:** one short paragraph (measured, not guessed; you stay the course setter) next to a real finding with its citation, instead of a three-up principles band.
5. **Status:** _Works now / Coming next / Later_, kept in one data file (one per language) so it is easy to update.
6. **Privacy and the assistant:** no server, nothing uploaded; the assistant is optional, uses your own key and only receives text and numbers. A short sample exchange.
7. **Credits:** quiet, near the bottom. **Made by Pouju** is the biggest line in it (author name, one line about you, GitHub, Send feedback). Next to it, smaller: ocad2geojson by Per Liedman, the sample map © Vehkalahden Veikot, the IOF and SSL rule documents, and what it is built with.
8. **Footer:** "Ratamestari by Pouju · AGPL-3.0-or-later · Source code", Credits link, language switch. D1 requires the source link and the ocad2geojson credit; both are visible.

## Sample map

- A small area (about 1 km², a few hundred kB at most) cut from a Vehkalahden Veikot map in OCAD, saved as `.ocd`.
- Lives in `apps/web/public/sample/` with a `README.md` stating: © Vehkalahden Veikot, for trying Ratamestari only, not covered by the AGPL. This is a deliberate exception to "club maps go in git-ignored `maps/`"; D14 records it.
- Shown with its copyright: on the map in the app ("© Vehkalahden Veikot · sample map"), in the PDF footer, and in the landing page credits.
- Bonus: map-dependent tests can use it, so they run in CI instead of skipping.

## Workspace

### Desktop and tablet (≥ 1024 px)

Layout stays as D5: the map as the print page on the left, one panel on the right. The panel is the same width in every state; its content follows the state.

### Phone and narrow screens (< 1024 px)

See the three "Phone" workspace artboards.

- The map fills the screen. The panel becomes a **bottom sheet** with three heights: _peek_ (request, figures, findings count, the primary action), _half_, and _full_ (everything the desktop panel has).
- Floating at the top: home, the course picker ("H21 Long ▾", replaces tabs), Layers.
- Touch: tap a control to select it, **press and hold to drag** it (so panning the map never moves controls by accident), pinch to zoom.
- Opening a map uses the file picker, since phones can't drag and drop. PDF and XML use the system share sheet where the browser supports it, otherwise a download.
- Risks to test on real phones: engine speed on big maps (the sample map is small on purpose; show progress), and memory when rasterising the print PDF at 400 dpi (use a lower resolution or tiles on phones if needed).

### States

| #   | State          | Primary action               | Panel shows                                                       |
| --- | -------------- | ---------------------------- | ----------------------------------------------------------------- |
| 1   | No map         | Choose map file (or drop)    | The three lines to come (Map, Centre, Course), maps opened before |
| 2   | Map, no centre | Use this centre              | Map line, suggested centres with reasons, "or click the map"      |
| 3   | Ready to set   | Set course                   | Request sentence ("SM level long distance for H21")               |
| 4   | Searching      | Stop (keeps the best course) | Live figures as the course draws                                  |
| 5   | Course ready   | Download PDF                 | Figures, findings with Fix, IOF XML, Another                      |

Earlier choices stay visible as one line each and are changed in place. Changing one moves the workspace back to that state; nothing else is lost. The sample map path starts in state 4.

### Where today's controls go

| Today (`apps/web/src/App.tsx`)                   | New place                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Open map button, drop zone                       | Empty state; "Change" on the Map line                            |
| File info list (scale, objects, CRS, image size) | Settings › Map file (scale also on the Map line)                 |
| Event level, format, sex, age, skill selects     | Request sentence: each underlined word opens its own small menu  |
| Pick centre button                               | State 2; "change" link on the centre line                        |
| Generate / Try another                           | Set course → Stop → Another                                      |
| Pace field                                       | Settings (default 5:00/km); the assistant can also set it        |
| Paper and print scale selects                    | Label under the page: "A4 portrait · 1:15 000 · Adjust"          |
| Rule checks with Fix                             | Findings: "2 things to check", severity word, basis, Fix         |
| Control descriptions section                     | Only on the map and in the PDF                                   |
| Print PDF, Export XML                            | Export row at the bottom of the panel                            |
| Leg tool and leg details                         | Map toolbar › Measure (off by default)                           |
| Cost map and candidate site toggles, legends     | Map toolbar › Layers                                             |
| Symbol panel                                     | Settings › How map symbols are read › Review (full-height sheet) |
| Chat panel                                       | Only when the assistant is on                                    |

### Several classes

Tabs at the top of the panel (H21 Long, D21 Long, +); a picker on phones. Each is its own request and course on the same map and centre. Planning courses together is out of scope (D10); tabs only keep them side by side.

### Assistant on and off

- **Off (default):** the panel is the form described above. No chat, no key prompt, no "AI" badge anywhere.
- **Turning it on:** Settings › Assistant. "Connect with" offers _Your own Claude API key_ now and _Ratamestari service_ (disabled, "needs the hosted version") so the server option has a place later. The key is kept in this browser only. The sheet says plainly what the assistant receives and what it never receives (D3).
- **On:** the request sentence and figures shrink to two lines at the top; the conversation fills the middle; the composer is at the bottom and becomes the primary input. What the assistant did shows as one short grey sentence above each answer ("Set the course and kept the best of 3 drafts"). PDF and XML stay one click away. On a phone the composer sits at the bottom of the sheet.

## Localisation

English only for now, built so that Finnish is just a new file.

- **Message catalogue, no library.** `apps/web/src/i18n/en.ts` exports one nested `as const` object of messages; strings with values are functions (`findings: (count: number) => …`). `type Messages = typeof en` (widened to `string` and functions), and `fi.ts` must satisfy `Messages`, so TypeScript reports every missing or extra key. Components read messages from a React context: `const m = useMessages()` then `m.course.length`, with autocompletion and no string keys. Rejected: i18next (MIT, fine licence-wise) because it adds weight and loses the type checking unless set up with extra tooling.
- **Formatting with `Intl`.** Numbers, distances, durations, dates and plurals go through `Intl.NumberFormat`, `Intl.PluralRules` and `Intl.DateTimeFormat` with the active locale ("11.4 km" in English, "11,4 km" in Finnish). One `format.ts` helper module, extending today's.
- **Engine and rules stay language-free.** The engine already returns structured findings (`kind` + `stops`); the UI turns them into text from the catalogue. Rule citations (`LS 11.41`, `ISOM 2017-2 sym. 406`) are not translated. The English description in `packages/agent` stays for the assistant, which replies in the user's language anyway.
- **Landing page** uses the same catalogue (its own namespace) and the status list is per language.
- **Lint rule later:** flag string literals in JSX so new inline text is caught.

Agreed as a convention in D14.

## Visual language

Reviewed against the frontend-design guidance on 2026-10-24. The idea: **the site looks like the margin of an orienteering map.** The map is the one bold thing; everything around it is quiet black print on white paper.

### Colour, from ISOM

| Token         | Hex       | Use                                                                 |
| ------------- | --------- | ------------------------------------------------------------------- |
| Map white     | `#FFFFFF` | Pages, the panel, the print page                                    |
| Field grey    | `#ECEEEA` | The table behind the print page; the one tinted band on the landing |
| Ink           | `#000000` | Text, like map black (no tinted near-black)                         |
| Ink soft      | `#4D4D4D` | Secondary text (7.9:1 on white)                                     |
| Overprint     | `#A3238E` | The course, the main button, links, the active tab. Means "course"  |
| Contour brown | `#9C4A12` | Errors in findings, rings around problem controls                   |
| Open yellow   | `#FFBA36` | Only the selected competition centre (a light tint, `#FFF0CC`)      |

Water blue and vegetation green appear only inside the map, plus the blue magnetic north lines on the hero map.

### Type

**One family: Atkinson Hyperlegible Next** (Braille Institute, OFL, self-hosted). It was drawn so similar letters (I l 1, 0 O) never get confused, which suits reading on a phone outdoors. No second face.

- Headlines: weight 800, tight tracking (about −0.04 em), line height about 1.0. The headline is the typographic event on each page.
- Body: weight 400, 17–21 px, line height 1.5–1.6, lines under about 70 characters.
- Figures (km, m, min, scales): the same family with tabular numbers, laid out side by side, never joined with middle dots.
- Rule citations (`LS 11.41`) in small regular text under the sentence they back.

### Things we avoid

The guidance lists the tells of generated pages; we checked the mockups against them.

- No all-caps labels above headings or fields. A line says what it is ("Ruissalo 2026, 1:10 000"), or gets a sentence-case heading.
- No strings joined with middle dots; use spacing or plain sentences.
- No monospace face for small data.
- No three-up feature band. The principles are shown where they are proven: "Every check names its rule" sits next to a real finding with its citation.
- No identical cards, gradient washes or a shadow on everything. Only paper casts a shadow: the print page, the floating map controls and the phone sheet.

### Shape and structure

- Radius follows hierarchy: paper has sharp corners, the one main button is a pill, everything else is plain text with an underline or colour.
- Map-margin devices appear only where they carry real data: the scale bar and north lines for the demo map, the IOF description box, course symbols for the steps (a real sequence: start, 1, 2, finish, joined by legs).
- Findings use map-like markers: a brown triangle for an error, an open grey circle for a note.

### Motion

One orchestrated moment: the hero replay. Elsewhere motion only answers the user (sheet opening, control snapping, rings updating while dragging). Reduced motion is respected everywhere.

### Accessibility floor

Real buttons and labels, 44 px touch targets, text contrast at least 4.5:1, visible keyboard focus, a keyboard-reachable map toolbar.

The tokens go into one CSS custom-property file in `apps/web` (convention agreed in D14).

## Server-ready points

- `LlmProvider`: the Settings switch already has a slot for a hosted provider.
- `Storage`: "Opened before on this computer" uses browser storage now (IndexedDB, keyed by the map's SHA-256 like the symbol corrections). Later it can list saved events from a database. Maps stay local unless the user opts in.
- Sign-in appears only when there is something to keep on a server. The static app never shows it.
- The landing page is static either way and can be served from the same server or a CDN.

## Build order

The demo is tomorrow, so the workspace comes first and the cheap foundations go in from the start:

1. Message catalogue and visual tokens (cheap now, costly to retrofit).
2. Panel and map layout with the state-based primary button (incl. Stop); request sentence and centre line.
3. Findings and export row; move pace, file info and symbols into Settings; Layers and Measure into the map toolbar.
4. Sample map and the "Try it with a sample map" path.
5. Phone layout: bottom sheet, press-and-hold drag, file picker.
6. Assistant behind the Settings switch.
7. Landing page as the second Vite entry with the recorded hero demo, status list and credits; GitHub Pages deploy.
8. After the demo: course tabs, centre suggestions, Finnish catalogue, guide pages.

## Open questions

1. **Credits text:** the one line about you, and whether to show "Pouju" only or also your full name.
2. **Sample map:** which area to cut out.
3. **Name in the UI:** "Ratamestari" only, or with a subtitle like "course setter"?
4. **Language detection:** pick Finnish automatically from the browser once it exists, or always start in English?
