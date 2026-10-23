# Ratamestari: AI Orienteering Course Setter

Generates orienteering courses from an OCAD map, following IOF and SSL course-setting rules. Ask in plain language ("SM-level long distance for H21") and get a course on the print page with IOF control descriptions, ready to export.

**Your map never leaves your computer.** The map is read and processed entirely in the browser. The AI assistant only receives text and numbers, never the map file or coordinates. The source code is open so anyone can verify this.

## Development

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test
pnpm typecheck
pnpm build
```

Put test maps in `maps/` (git-ignored, so club maps never end up in the repository).

## Credits

OCAD files are read with [ocad2geojson](https://github.com/perliedman/ocad2geojson) by Per Liedman.

## License

[AGPL-3.0-or-later](LICENSE)
