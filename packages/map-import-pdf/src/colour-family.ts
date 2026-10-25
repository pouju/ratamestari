import { isOverprintColor } from '@ratamestari/course-detect'

export type ColourFamily =
  | 'black'
  | 'grey'
  | 'white'
  | 'brown'
  | 'brownLight'
  | 'yellow'
  | 'yellowLight'
  | 'olive'
  | 'green'
  | 'greenMid'
  | 'greenLight'
  | 'blue'
  | 'blueMid'
  | 'blueLight'
  | 'purple'
  | 'other'

// Interpretation: ISOM's colours and screens (§3) as producers print them. Hue tells the colour,
// lightness the screen; thresholds are set from OCAD and Condes exports.
const GREYSCALE_SATURATION = 0.15
const BLACK_MAX_LIGHTNESS = 0.3
const WHITE_MIN_LIGHTNESS = 0.95
const BROWN_HUE = { min: 10, max: 32 }
const YELLOW_HUE = { min: 32, max: 50 }
const OLIVE_HUE = { min: 50, max: 80 }
const GREEN_HUE = { min: 80, max: 170 }
const BLUE_HUE = { min: 170, max: 240 }
const LIGHT_BROWN_MIN_LIGHTNESS = 0.65
const LIGHT_YELLOW_MIN_LIGHTNESS = 0.75
const LIGHT_GREEN_MIN_LIGHTNESS = 0.78
const MID_GREEN_MIN_LIGHTNESS = 0.6
const MID_BLUE_MIN_LIGHTNESS = 0.55
const LIGHT_BLUE_MIN_LIGHTNESS = 0.68

const within = (value: number, { min, max }: { min: number; max: number }) =>
  value >= min && value < max

export function colourFamilyOf(hex: string): ColourFamily {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return 'other'
  if (isOverprintColor(hex)) return 'purple'
  const [red, green, blue] = match.slice(1).map(part => parseInt(part, 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const chroma = max - min
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1))
  if (lightness >= WHITE_MIN_LIGHTNESS) return 'white'
  if (saturation < GREYSCALE_SATURATION || lightness < BLACK_MAX_LIGHTNESS / 2) {
    return lightness < BLACK_MAX_LIGHTNESS ? 'black' : 'grey'
  }
  const hue =
    max === red
      ? (((green - blue) / chroma + 6) % 6) * 60
      : max === green
        ? ((blue - red) / chroma + 2) * 60
        : ((red - green) / chroma + 4) * 60
  if (within(hue, BROWN_HUE)) return lightness >= LIGHT_BROWN_MIN_LIGHTNESS ? 'brownLight' : 'brown'
  if (within(hue, YELLOW_HUE))
    return lightness >= LIGHT_YELLOW_MIN_LIGHTNESS ? 'yellowLight' : 'yellow'
  if (within(hue, OLIVE_HUE)) return 'olive'
  if (within(hue, GREEN_HUE)) {
    if (lightness >= LIGHT_GREEN_MIN_LIGHTNESS) return 'greenLight'
    return lightness >= MID_GREEN_MIN_LIGHTNESS ? 'greenMid' : 'green'
  }
  if (within(hue, BLUE_HUE)) {
    if (lightness >= LIGHT_BLUE_MIN_LIGHTNESS) return 'blueLight'
    return lightness >= MID_BLUE_MIN_LIGHTNESS ? 'blueMid' : 'blue'
  }
  return 'other'
}
