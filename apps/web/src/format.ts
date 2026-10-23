export const formatMeters = (meters: number): string => `${Math.round(meters)} m`

export const formatDuration = (seconds: number): string => {
  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}
