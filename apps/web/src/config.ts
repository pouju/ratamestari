declare const __APP_VERSION__: string

export const SOURCE_CODE_URL = 'https://github.com/pouju/ratamestari'
export const AUTHOR_URL = 'https://github.com/pouju'
export const FEEDBACK_URL = `${SOURCE_CODE_URL}/issues`
export const OCAD2GEOJSON_URL = 'https://github.com/perliedman/ocad2geojson'
export const APP_PATH = './app/'
export const SAMPLE_QUERY = 'sample'

// The sample map in public/sample, set up as in the landing page's recorded run
// (scripts/record-demo-run.ts): its centre is the middle of the mapped area.
export const SAMPLE_MAP = {
  path: '../sample/leirikangas-sample.ocd',
  fileName: 'leirikangas-sample.ocd',
  centre: [-5331.1, 161.75],
  request: {
    eventLevel: 'national',
    format: 'middle',
    sex: 'D',
    ageClass: 10,
    skillLetter: 'A',
  },
} as const

export const APP_VERSION = __APP_VERSION__
export const RELEASE_URL = `${SOURCE_CODE_URL}/releases/tag/v${APP_VERSION}`
