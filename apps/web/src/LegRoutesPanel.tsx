import type { ReactNode } from 'react'
import type { Course, LegEvaluation } from '@ratamestari/engine'
import { ROUTE_CHOICE } from '@ratamestari/rules'
import { useFormat, useMessages } from './i18n'
import {
  legCount,
  needsPlacing,
  rankedRoutes,
  ROUTE_COLOUR_TOKENS,
  stopName,
  type LegRoutesState,
  type PlannedLeg,
} from './leg-routes'

interface Props {
  course: Course
  leg: number
  routes: LegRoutesState
  onSelectLeg: (leg: number | null) => void
  keeping: { readonly leg: boolean; readonly from: boolean; readonly to: boolean }
  onToggleLegKept: () => void
  onToggleStopKept: (stop: number) => void
}

export function LegRoutesPanel({
  course,
  leg,
  routes,
  onSelectLeg,
  keeping,
  onToggleLegKept,
  onToggleStopKept,
}: Props) {
  const m = useMessages().leg
  const k = useMessages().keep
  const format = useFormat()
  const isLastLeg = leg === legCount(course) - 1

  return (
    <section className="leg-view" aria-labelledby="leg-view-title">
      <button type="button" className="leg-view-back" onClick={() => onSelectLeg(null)}>
        <Chevron direction="left" />
        {m.wholeCourse}
      </button>

      <div className="leg-view-heading">
        <div>
          <h2 id="leg-view-title">{m.title(stopName(course, leg), stopName(course, leg + 1))}</h2>
          {routes.status === 'evaluated' && (
            <p className="leg-view-soft">
              {m.straightLine(format.distance(routes.leg.straightMeters))}
            </p>
          )}
        </div>
        <div className="leg-view-steps">
          <button
            type="button"
            aria-label={m.previous}
            disabled={leg === 0}
            onClick={() => onSelectLeg(leg - 1)}
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            aria-label={m.next}
            disabled={isLastLeg}
            onClick={() => onSelectLeg(leg + 1)}
          >
            <Chevron direction="right" />
          </button>
        </div>
      </div>

      {routes.status === 'finding' && <p className="leg-view-soft">{m.findingRoutes}</p>}
      {routes.status === 'unreachable' && <p className="error">{m.unreachable}</p>}
      {routes.status === 'evaluated' && <RouteTable leg={routes.leg} />}

      <div className="leg-keep">
        <h3>{k.title}</h3>
        <div className="leg-keep-options">
          <KeepToggle isKept={keeping.leg} onToggle={onToggleLegKept}>
            {k.leg}
          </KeepToggle>
          <KeepToggle isKept={keeping.from} onToggle={() => onToggleStopKept(leg)}>
            {leg === 0 ? k.start : k.control(leg)}
          </KeepToggle>
          {!isLastLeg && (
            <KeepToggle isKept={keeping.to} onToggle={() => onToggleStopKept(leg + 1)}>
              {k.control(leg + 1)}
            </KeepToggle>
          )}
        </div>
        <p className="leg-view-soft leg-view-small">{k.hint}</p>
      </div>

      <p className="leg-view-soft leg-view-small">{m.fromSymbols}</p>
    </section>
  )
}

function KeepToggle({
  isKept,
  onToggle,
  children,
}: {
  isKept: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="leg-keep-toggle" aria-pressed={isKept} onClick={onToggle}>
      <LockIcon isClosed={isKept} />
      {children}
    </button>
  )
}

export function LockIcon({ isClosed }: { isClosed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={isClosed ? 'M7 11V8a5 5 0 0 1 10 0v3' : 'M7 11V8a5 5 0 0 1 9.6-2'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <rect x="4" y="11" width="16" height="10" rx="2" fill="currentColor" />
    </svg>
  )
}

interface PlanLegProps {
  plan: PlannedLeg
  routes: LegRoutesState
  onDone: () => void
  // null until the competition centre is chosen.
  onSetCourseAround: (() => void) | null
}

export function PlanLegPanel({ plan, routes, onDone, onSetCourseAround }: PlanLegProps) {
  const m = useMessages()
  const format = useFormat()
  const instruction =
    plan.from === null
      ? m.planLeg.placeFirst
      : needsPlacing(plan)
        ? m.planLeg.placeSecond
        : m.planLeg.dragHint

  return (
    <section className="leg-view" aria-labelledby="plan-leg-title">
      <button type="button" className="leg-view-back" onClick={onDone}>
        <Chevron direction="left" />
        {m.planLeg.done}
      </button>

      <div>
        <h2 id="plan-leg-title">{m.planLeg.title}</h2>
        <p className="leg-view-soft" aria-live="polite">
          {instruction}
        </p>
      </div>

      {!needsPlacing(plan) && (
        <>
          {routes.status === 'finding' && <p className="leg-view-soft">{m.leg.findingRoutes}</p>}
          {routes.status === 'unreachable' && <p className="error">{m.leg.unreachable}</p>}
          {routes.status === 'evaluated' && (
            <>
              <dl className="leg-view-figures">
                <div>
                  <dt>{m.planLeg.straightLine}</dt>
                  <dd>{format.distance(routes.leg.straightMeters)}</dd>
                </div>
                <div>
                  <dt>{m.planLeg.bearing}</dt>
                  <dd>{format.bearing(routes.leg.bearingDegrees)}</dd>
                </div>
              </dl>
              <RouteTable leg={routes.leg} />
            </>
          )}
          <div className="plan-leg-around">
            <button
              type="button"
              className="course-primary"
              disabled={!onSetCourseAround}
              onClick={() => onSetCourseAround?.()}
            >
              {m.planLeg.setCourseAround}
            </button>
            <p className="leg-view-soft leg-view-small">
              {onSetCourseAround ? m.planLeg.setCourseAroundHint : m.planLeg.chooseCentreFirst}
            </p>
          </div>
          <p className="leg-view-soft leg-view-small">{m.leg.fromSymbols}</p>
        </>
      )}
    </section>
  )
}

function RouteTable({ leg }: { leg: LegEvaluation }) {
  const m = useMessages().leg
  const format = useFormat()
  const routes = rankedRoutes(leg)
  const secondBest = routes[1]

  return (
    <>
      <table className="leg-view-routes">
        <thead>
          <tr>
            <th scope="col">{m.route}</th>
            <th scope="col">{m.length}</th>
            <th scope="col">{m.time}</th>
          </tr>
        </thead>
        <tbody>
          {routes.map(({ route, rank, secondsSlower }, i) => (
            <tr key={i}>
              <th scope="row">
                <span
                  className="leg-view-swatch"
                  style={{ background: `var(${ROUTE_COLOUR_TOKENS[rank]})` }}
                  aria-hidden="true"
                />
                {m.routeLetters[i]}
              </th>
              <td>{format.distance(route.lengthMeters)}</td>
              <td>
                {i === 0 ? (
                  <strong>{format.duration(route.timeSeconds)}</strong>
                ) : (
                  <>
                    {format.duration(route.timeSeconds)}{' '}
                    <span className="leg-view-soft">
                      {m.slowerBy(format.timeDifference(secondsSlower))}
                    </span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="leg-view-lead">
        {leg.hasRouteChoice && secondBest
          ? m.routeChoice(m.routeLetters[1]!, format.timeDifference(secondBest.secondsSlower))
          : m.noRouteChoice(format.share(ROUTE_CHOICE.maxExtraTimeShare))}
      </p>
      <p className="leg-view-soft">{m.fastestClimb(format.metres(leg.climbMeters))}</p>
    </>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
    </svg>
  )
}
