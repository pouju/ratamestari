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

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) with the package as scope, and the body explains why:

```
feat(engine): prefer controls on distinct features

Course setters avoid two controls on similar knolls in a row,
because runners can confuse them.
```

Releases and the changelog are generated from these messages. A change users will notice should be `feat` or `fix`, and a breaking change gets a `!` (`feat(engine)!: …`). Other types (`docs`, `refactor`, `test`, `chore`) stay out of the changelog.

## Pull requests

Keep pull requests small and focused. If you plan a larger change or a new convention (a pattern, tool or folder layout), open an issue first so we can agree on it.
