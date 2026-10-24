export type DemoPoint = readonly [x: number, y: number]

// What the hero replays, in page units with y down. A recorder will fill this from a real engine
// run on the sample map; until the sample map is in the repo it holds the illustrated course.
export interface DemoRun {
  readonly page: readonly [width: number, height: number]
  readonly centre: DemoPoint
  readonly sites: readonly DemoPoint[]
  readonly start: DemoPoint
  readonly controls: readonly DemoPoint[]
  readonly finish: DemoPoint
  readonly siteCount: number
  readonly lengthMeters: number
  readonly climbMeters: number
}

const PAGE_WIDTH = 600
const PAGE_HEIGHT = 848
const SHOWN_SITES = 46
const SITE_MARGIN = 40

function scatteredSites(): DemoPoint[] {
  let seed = 7
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  return Array.from({ length: SHOWN_SITES }, () => [
    SITE_MARGIN + random() * (PAGE_WIDTH - 2 * SITE_MARGIN),
    60 + random() * 700,
  ])
}

export const ILLUSTRATED_RUN: DemoRun = {
  page: [PAGE_WIDTH, PAGE_HEIGHT],
  centre: [455, 722],
  sites: scatteredSites(),
  start: [250, 700],
  controls: [
    [220, 610],
    [110, 500],
    [170, 360],
    [185, 238],
    [300, 140],
    [420, 230],
    [500, 330],
    [350, 420],
    [470, 560],
    [400, 640],
  ],
  finish: [360, 705],
  siteCount: 414,
  lengthMeters: 11_400,
  climbMeters: 320,
}
