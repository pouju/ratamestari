// "Purple is used for course information" (ISOM 2017-2 §3). Interpretation: any clearly purple
// hue, because producers mix it differently: OCAD exports #a749a5, Condes #cd2d98.
const PURPLE_HUE_DEGREES = { min: 280, max: 345 }
const MIN_SATURATION = 0.3
const LIGHTNESS = { min: 0.25, max: 0.8 }

export function isOverprintColor(hex: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return false
  const [red, green, blue] = match.slice(1).map(part => parseInt(part, 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const chroma = max - min
  if (chroma === 0) return false
  const saturation = chroma / (1 - Math.abs(2 * lightness - 1))
  const hue =
    max === red
      ? (((green - blue) / chroma + 6) % 6) * 60
      : max === green
        ? ((blue - red) / chroma + 2) * 60
        : ((red - green) / chroma + 4) * 60
  return (
    hue >= PURPLE_HUE_DEGREES.min &&
    hue <= PURPLE_HUE_DEGREES.max &&
    saturation >= MIN_SATURATION &&
    lightness >= LIGHTNESS.min &&
    lightness <= LIGHTNESS.max
  )
}
