import recorded from './sample-run.json'
import sampleDescriptions from './sample-descriptions.svg'
import samplePage from './sample-page.png'

export type DemoPoint = readonly [x: number, y: number]

export interface DemoSymbols {
  readonly lineWidth: number
  readonly controlRadius: number
  readonly startRadius: number
  readonly finishInnerRadius: number
  readonly finishOuterRadius: number
  readonly numberHeight: number
  readonly gap: number
}

// What the hero replays, in page units with y down: a real engine run on the sample map, recorded
// by `pnpm record-demo-run` (scripts/record-demo-run.ts) with its page image.
export interface DemoRun {
  readonly pageImage: string
  readonly page: readonly [width: number, height: number]
  readonly centre: DemoPoint
  readonly sites: readonly DemoPoint[]
  readonly start: DemoPoint
  readonly controls: readonly DemoPoint[]
  // Where each control's number goes (ISOM sym. 704); recorded runs before it have none.
  readonly numbers: readonly DemoPoint[] | null
  readonly finish: DemoPoint
  readonly descriptions: {
    readonly image: string
    readonly width: number
    readonly height: number
    readonly rows: number
  }
  readonly symbols: DemoSymbols
  readonly siteCount: number
  readonly lengthMeters: number
  readonly climbMeters: number
}

const point = ([x = 0, y = 0]: readonly number[]): DemoPoint => [x, y]

export const SAMPLE_RUN: DemoRun = {
  pageImage: samplePage,
  page: point(recorded.page),
  centre: point(recorded.centre),
  sites: recorded.sites.map(point),
  start: point(recorded.start),
  controls: recorded.controls.map(point),
  numbers: 'numbers' in recorded ? (recorded.numbers as number[][]).map(point) : null,
  finish: point(recorded.finish),
  descriptions: { image: sampleDescriptions, ...recorded.descriptions },
  symbols: recorded.symbols,
  siteCount: recorded.siteCount,
  lengthMeters: recorded.lengthMeters,
  climbMeters: recorded.climbMeters,
}
