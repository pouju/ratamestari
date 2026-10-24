import {
  DESCRIPTION_APPEARANCES,
  DESCRIPTION_FEATURES,
  DESCRIPTION_LOCATIONS,
} from '@ratamestari/rules'
import type { CompassPoint } from './compass'
import type { ControlDescription } from './describe-control'

const DIRECTION_WORDS: Readonly<Record<CompassPoint, string>> = {
  north: 'north',
  northEast: 'north-east',
  east: 'east',
  southEast: 'south-east',
  south: 'south',
  southWest: 'south-west',
  west: 'west',
  northWest: 'north-west',
}

const WHICH_OF_SIMILAR_WORDS: Readonly<Record<CompassPoint, string>> = {
  north: 'Northern',
  northEast: 'North-eastern',
  east: 'Eastern',
  southEast: 'South-eastern',
  south: 'Southern',
  southWest: 'South-western',
  west: 'Western',
  northWest: 'North-western',
}

export function descriptionText(description: ControlDescription): string {
  const featureName = DESCRIPTION_FEATURES[description.feature].name
  const subject = description.whichOfSimilar
    ? `${WHICH_OF_SIMILAR_WORDS[description.whichOfSimilar]} ${featureName.toLowerCase()}`
    : featureName
  const parts = [subject]
  if (description.appearance) parts.push(DESCRIPTION_APPEARANCES[description.appearance].name)
  if (description.location) {
    const { kind, direction } = description.location
    const name = DESCRIPTION_LOCATIONS[kind].name
    parts.push(direction ? `${DIRECTION_WORDS[direction]} ${name}` : name)
  }
  return parts.join(', ')
}
