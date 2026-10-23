export const formatMeters = (meters: number): string => `${Math.round(meters)} m`

export const formatDuration = (seconds: number): string => {
  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}

export const formatKilometers = (meters: number): string => `${(meters / 1000).toFixed(1)} km`

export function parsePace(text: string): number | null {
  const match = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(text)
  if (!match) return null
  const seconds = Number(match[1]) * 60 + Number(match[2])
  return seconds > 0 ? seconds : null
}
