export type StopName = number | 'start' | 'finish'

const stopWord = (stop: StopName) => (typeof stop === 'number' ? String(stop) : stop)

export const en = {
  leg: {
    title: (from: StopName, to: StopName) =>
      from === 'start' ? `Start to ${stopWord(to)}` : `Leg ${from} to ${stopWord(to)}`,
    straightLine: (distance: string) => `${distance} in a straight line`,
    previous: 'Previous leg',
    next: 'Next leg',
    wholeCourse: 'Whole course',
    route: 'Route',
    length: 'Length',
    time: 'Time',
    routeLetters: ['A', 'B', 'C'],
    slowerBy: (difference: string) => `+${difference}`,
    fastestClimb: (climb: string) => `The fastest route climbs about ${climb}.`,
    routeChoice: (letter: string, difference: string) =>
      `A real route choice: ${letter} goes a different way and is only ${difference} slower.`,
    noRouteChoice: (share: string) => `No clearly different route within ${share} of the fastest.`,
    findingRoutes: 'Finding routes…',
    unreachable: 'No route: a control is in an impassable or forbidden area.',
    fromSymbols: "Routes are worked out from the map's symbols, not from GPS tracks.",
    selectHint: 'Tap a leg or a control on the map to see its routes.',
  },
  units: {
    seconds: (value: string) => `${value} s`,
  },
}
