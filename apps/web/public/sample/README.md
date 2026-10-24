# Sample map

`leirikangas-sample.ocd` is a small part (about 1 km × 0.8 km, the open rock area) of the orienteering map Leirikangas, Hamina.

© Vehkalahden Veikot. Mapping: Simo-Pekka Fincke and Tero Föhr 2002–2003; update: Lari Takanen and Janne Weckman 2013.

It is here only so that Ratamestari can be tried without a map of your own. It is **not** covered by the project's AGPL licence: do not copy, print or use it for any other purpose. Events on the map must be agreed with the landowners and hunting rights holders; ask Vehkalahden Veikot ry.

The file was cut from the club's OCAD map with `pnpm crop-ocad` (see `scripts/crop-ocad.ts`). The tool keeps the objects inside the box, clipped at its edges, and the whole symbol set. It moves the club's logo, the copyright notice and the contour interval next to the box, and leaves out file paths from the original computer.
