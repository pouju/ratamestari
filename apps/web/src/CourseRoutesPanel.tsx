import type { Course } from '@ratamestari/engine'
import { routeSummary } from './course-routes'
import { useFormat, useMessages } from './i18n'
import {
  rankedRoutes,
  ROUTE_COLOUR_TOKENS,
  stopName,
  type ControlPreview,
  type LegRoutesState,
  type RouteRank,
} from './leg-routes'

interface Props {
  course: Course
  legs: readonly LegRoutesState[] | null
  selectedLeg: number | null
  onFindAll: () => void
  onSelectLeg: (leg: number) => void
}

export function CourseRoutesPanel({ course, legs, selectedLeg, onFindAll, onSelectLeg }: Props) {
  const m = useMessages().courseRoutes
  const format = useFormat()

  if (!legs) {
    return (
      <section className="course-routes" aria-labelledby="course-routes-title">
        <h2 id="course-routes-title">{m.title}</h2>
        <button type="button" className="course-secondary" onClick={onFindAll}>
          {m.findAll}
        </button>
        <p className="leg-view-soft leg-view-small">{m.findAllHint}</p>
      </section>
    )
  }

  const summary = routeSummary(legs)
  return (
    <section className="course-routes" aria-labelledby="course-routes-title">
      <h2 id="course-routes-title">{m.title}</h2>
      <p aria-live="polite">
        {summary.evaluated < summary.legs
          ? m.finding(summary.evaluated, summary.legs)
          : m.summary(summary.withRouteChoice, summary.legs)}
      </p>
      <table className="leg-view-routes course-routes-table">
        <thead>
          <tr>
            <th scope="col">{m.leg}</th>
            <th scope="col">{m.fastest}</th>
            <th scope="col">{m.choice}</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((state, leg) => {
            const name = m.legName(stopName(course, leg), stopName(course, leg + 1))
            return (
              <tr
                key={leg}
                className={
                  [hasChoice(state) && 'has-route-choice', leg === selectedLeg && 'is-selected']
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                aria-current={leg === selectedLeg || undefined}
              >
                <th scope="row">
                  <button
                    type="button"
                    aria-label={m.openLeg(name)}
                    onClick={() => onSelectLeg(leg)}
                  >
                    {name}
                  </button>
                </th>
                <td>
                  {state.status === 'evaluated'
                    ? format.duration(state.leg.fastest.timeSeconds)
                    : state.status === 'finding'
                      ? m.findingLeg
                      : m.unreachable}
                </td>
                <td>{state.status === 'evaluated' && <ChoiceCell state={state} />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

const hasChoice = (state: LegRoutesState) =>
  state.status === 'evaluated' && state.leg.hasRouteChoice

function ChoiceCell({ state }: { state: Extract<LegRoutesState, { status: 'evaluated' }> }) {
  const m = useMessages().courseRoutes
  const format = useFormat()
  const [, best, ...rest] = rankedRoutes(state.leg)
  if (!best) return <span className="leg-view-soft">{m.none}</span>
  return (
    <span className="course-routes-choice">
      <Swatches ranks={[best.rank, ...rest.map(route => route.rank)]} />
      {m.alternatives(1 + rest.length, format.timeDifference(best.secondsSlower))}
    </span>
  )
}

function Swatches({ ranks }: { ranks: readonly RouteRank[] }) {
  return (
    <span className="course-routes-swatches" aria-hidden="true">
      {ranks.map((rank, i) => (
        <span
          key={i}
          className="leg-view-swatch"
          style={{ background: `var(${ROUTE_COLOUR_TOKENS[rank]})` }}
        />
      ))}
    </span>
  )
}

// What the legs of a control would be like if it were placed where the pointer is.
export function ControlPreviewRoutes({ preview }: { preview: ControlPreview }) {
  const m = useMessages().setByHand
  const format = useFormat()
  return (
    <div className="control-preview" aria-live="polite">
      <p className="leg-view-soft leg-view-small">{m.previewTitle}</p>
      {preview.legs.map((leg, i) => {
        const [, best, ...rest] = rankedRoutes(leg)
        return (
          <p key={i}>
            {m.previewFastest(
              format.duration(leg.fastest.timeSeconds),
              format.distance(leg.fastest.lengthMeters),
            )}
            {'. '}
            {!leg.hasLookedForAlternatives ? (
              <span className="leg-view-soft">{m.previewLooking}</span>
            ) : best ? (
              <span className="course-routes-choice">
                <Swatches ranks={[best.rank, ...rest.map(route => route.rank)]} />
                {m.previewChoice(1 + rest.length, format.timeDifference(best.secondsSlower))}
              </span>
            ) : (
              <span className="leg-view-soft">{m.previewNoChoice}</span>
            )}
          </p>
        )
      })}
    </div>
  )
}
