# Contributing to Ratamestari

Thanks for helping! Bug reports, rule corrections from course setters and code are all welcome.

## Licence of contributions

Ratamestari is licensed under [AGPL-3.0-or-later](LICENSE). By contributing, you agree that your contribution is licensed under the same terms. There is no separate contributor agreement.

New dependencies must have an AGPL-compatible licence, such as MIT, BSD or Apache-2.0.

## Never commit club maps

Orienteering maps belong to their clubs. Put the maps you test with in `maps/`, which is git-ignored, and never attach them to issues or pull requests without the club's permission. The only committed map is the sample in `apps/web/public/sample/`.

## Ground rules

These come from the [decision log](docs/decisions.md) and are not up for change in a pull request:

1. **The map never leaves the user's computer.** Map parsing and the course engine run in the browser. The AI assistant receives only text and numbers, never the map file, coordinates or geometry.
2. **Algorithms set the course; the AI handles language.** Geometry, distances, routing and rule checks are deterministic code.
3. **Rule values come from documents.** Every value in `packages/rules` cites its IOF or SSL source, and our own readings are marked as interpretations.

[`CLAUDE.md`](CLAUDE.md) describes the architecture and the code conventions in detail.

## Development

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm check      # formatting, types, tests and build
```

Every commit must pass `pnpm check`. Tests live in each package's `test/` folder.

## Code practices

Agreed on 2026-11-15. Where a tool can check a practice, `pnpm check` does.

### Structure

- **Each package has one job:** the engine has no DOM, `packages/rules` holds rule values with their sources, and only `packages/map-import-ocad` knows ocad2geojson. Packages import each other only through their `index.ts`, never another package's internal files.
- **Logic lives in plain modules** (`kept.ts`, `event.ts`, …); components arrange the UI and call that logic.
- **A component or module does one thing.** There is no line limit, but "this file does two things" is a reason to split it in review. `App.tsx` is being split along the event and per-course state.

### State and effects in React

Follow the React documentation ([Managing State](https://react.dev/learn/managing-state), [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)):

- **`useState` by default, close to where it is used.** Lift it up only when components share it.
- **Don't store what can be calculated.** Derive it while rendering.
- **`useReducer` when update logic is complex** or many updates touch the same data (the event and its courses). The reducer is a pure function with its own tests.
- **Context for data many components deep in the tree need** and that changes rarely, such as the language.
- **Effects only to sync with something outside React:** the engine worker, OpenLayers, browser storage. Not to update one piece of state from another.
- **Heavy work runs in the engine worker**, never on the main thread, so the UI stays responsive. Calls to the worker happen in a few clear places, not in every component.

### Style

- **Functional where it matters:** pure functions, immutable data (`readonly` types), no classes. Mutation inside a function is fine for speed, as in the engine's search and routing, as long as the function is pure from the outside.
- **`function` declarations for components and named functions with a body; arrow functions for short expressions and callbacks** (`const isSameSite = (a, b) => …`).
- **Types:** strict TypeScript and branded coordinate types; Zod at the boundaries (requests, rules, assistant tool inputs). No `any`. `as` casts only in tests and at boundaries that have been checked, never to silence the compiler.
- **Names over comments.** Comment only a non-obvious _why_.

### Errors

- **Errors from the engine or storage are never lost silently.** Show them to the user with a message from the catalogue, or ignore them on purpose with a comment saying why (as when browser storage is blocked).
- **`void` marks a promise we deliberately don't wait for;** any other promise is awaited.

### UI

- **All text in the message catalogues** (`apps/web/src/i18n/`), in English and Finnish; numbers, units and plurals through `Intl`.
- **Design tokens** for colours, type and spacing; no hard-coded values in components.
- **Accessible names** on interactive elements (labels, `aria-label`, roles). The end-to-end tests find elements by them.
- **Every view works on a phone.** An overlap or an unreachable control on a small screen is a bug.

### Tests

- **Pure logic gets unit tests** in the package's `test/` folder.
- **Every user-visible flow gets an end-to-end test** (`apps/web/e2e/`), run on desktop and phone.
- **A bug fix comes with a test that fails without the fix.**
- **Test names are sentences about behaviour** ("keeps the code of a control moved within its only course").
- **Test data is anonymous:** no real map, place, club or event names.

### Privacy and data

- **The map, coordinates and course geometry never leave the computer** (D3). The assistant receives only text and numbers.
- **Analytics events say what was done, never with what** (D23): no names, files or coordinates.
- **Saved data stays in this browser** (localStorage, IndexedDB), keyed by the map.

### Dependencies and docs

- **A new dependency needs a reason.** It must have an AGPL-compatible licence, and we prefer few, well-maintained, stable (1.0 or later) ones.
- **A change that makes a doc out of date updates it in the same pull request.** New decisions go in [`docs/decisions.md`](docs/decisions.md).

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) with the package as scope, and the body explains why:

```
feat(engine): prefer controls on distinct features

Course setters avoid two controls on similar knolls in a row,
because runners can confuse them.
```

Releases and the changelog are generated from these messages. A change users will notice should be `feat` or `fix`, and a breaking change gets a `!` (`feat(engine)!: …`). Other types (`docs`, `refactor`, `test`, `chore`) stay out of the changelog.

## Branches and pull requests

- **Branch names:** `<type>/<what-it-does>`, with the Conventional Commit type and a short kebab-case description (`feat/description-box-drag`, `docs/rules-control-spacing`). Branch from the latest `main`.
- **One topic per pull request**, small and focused. If you plan a larger change or a new convention (a pattern, tool or folder layout), open an issue first so we can agree on it.
- **Before merging:** CI is green, including the end-to-end tests. Pull requests are merged with rebase and merge, and the maintainer decides when.
