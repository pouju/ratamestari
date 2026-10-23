import type { LegEvaluation } from '@ratamestari/engine'
import { REFERENCE_PACE_SECONDS_PER_KM, ROUTE_CHOICE } from '@ratamestari/rules'
import { formatDuration, formatMeters } from './format'

const formatPercentMore = (ratio: number) => `+${Math.round((ratio - 1) * 100)}%`

export function LegDetails({ leg }: { leg: LegEvaluation }) {
  return (
    <dl>
      <dt>Fastest route</dt>
      <dd>
        {formatMeters(leg.fastest.lengthMeters)} ({formatPercentMore(leg.lengthRatio)} vs. straight
        line)
      </dd>
      <dt>Straight line</dt>
      <dd>
        {formatMeters(leg.straightMeters)}, bearing {Math.round(leg.bearingDegrees)}°
      </dd>
      <dt>Estimated time</dt>
      <dd>
        {formatDuration(leg.fastest.timeSeconds)} at{' '}
        {formatDuration(REFERENCE_PACE_SECONDS_PER_KM.value)} min/km reference pace
      </dd>
      <dt>Route choice</dt>
      <dd>
        {leg.hasRouteChoice
          ? leg.alternatives
              .map(
                route =>
                  `${formatDuration(route.timeSeconds)} (${formatPercentMore(route.timeSeconds / leg.fastest.timeSeconds)})`,
              )
              .join(', ')
          : `No clearly different route within ${Math.round(ROUTE_CHOICE.maxExtraTimeShare * 100)}%`}
      </dd>
      <dt>Furthest from the straight line</dt>
      <dd>{formatMeters(leg.maxDeviationMeters)}</dd>
      <dt>Contours crossed</dt>
      <dd>
        {leg.contourCrossings}: about {Math.round(leg.climbMeters)} m up,{' '}
        {Math.round(leg.descentMeters)} m down
        {leg.unknownHeightChangeMeters > 0 &&
          `, ${Math.round(leg.unknownHeightChangeMeters)} m direction unknown`}
      </dd>
    </dl>
  )
}
