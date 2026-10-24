import { useEffect, useState } from 'react'
import { useFormat, useMessages } from '../i18n'
import type { DemoPoint, DemoRun } from './demo-run'
import { IllustratedMap } from './IllustratedMap'

const TICK_MS = 100
const MAP_TICKS = 8
const CENTRE_FROM = 10
const CENTRE_TICKS = 6
const SITES_FROM = 22
const SITE_EVERY = 0.5
const SITES_FADE_FROM = 72
const SITES_FADE_TICKS = 14
const SITE_OPACITY = 0.55
const LEGS_FROM = 48
const LEG_TICKS = 5
const DESCRIPTIONS_FROM = 108
const DESCRIPTION_ROW_EVERY = 1.1
const FRAME_FROM = 124
const DONE_FROM = 130
const LOOP_TICKS = 165
const STEP_STARTS = [0, CENTRE_FROM, SITES_FROM, LEGS_FROM, DESCRIPTIONS_FROM, DONE_FROM]

const CONTROL_RADIUS = 15
const START_GAP = 18
const LABEL_OFFSET: DemoPoint = [17, -12]
const DESCRIPTION_ORIGIN: DemoPoint = [18, 18]
const DESCRIPTION_WIDTH = 152
const DESCRIPTION_ROW_HEIGHT = 10
const DESCRIPTION_HEADER_ROWS = 2

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function HeroDemo({ run }: { run: DemoRun }) {
  const m = useMessages().landing.demo
  const format = useFormat()
  const [isStill] = useState(prefersReducedMotion)
  const [tick, setTick] = useState(isStill ? LOOP_TICKS - 1 : 0)
  const [isPaused, setIsPaused] = useState(isStill)

  useEffect(() => {
    if (isPaused) return
    const timer = setInterval(() => setTick(t => (t + 1) % LOOP_TICKS), TICK_MS)
    return () => clearInterval(timer)
  }, [isPaused])

  const stops = [run.start, ...run.controls, run.finish]
  const legs = stops.slice(1).map((to, i) => {
    const from = stops[i]!
    const full = Math.hypot(to[0] - from[0], to[1] - from[1])
    const [ux, uy] = [(to[0] - from[0]) / full, (to[1] - from[1]) / full]
    const gapFrom = i === 0 ? START_GAP : CONTROL_RADIUS
    const drawable = full - gapFrom - CONTROL_RADIUS
    const shown = clamp((tick - LEGS_FROM - i * LEG_TICKS) / LEG_TICKS)
    return {
      full,
      shown,
      x1: from[0] + ux * gapFrom,
      y1: from[1] + uy * gapFrom,
      x2: to[0] - ux * CONTROL_RADIUS,
      y2: to[1] - uy * CONTROL_RADIUS,
      dash: drawable,
      offset: drawable * (1 - shown),
    }
  })
  const appearsAfterLeg = (leg: number) => clamp((tick - LEGS_FROM - leg * LEG_TICKS) / 2)
  const drawnShare =
    legs.reduce((sum, leg) => sum + leg.full * leg.shown, 0) /
    legs.reduce((sum, leg) => sum + leg.full, 0)
  const placedControls = run.controls.filter((_, i) => appearsAfterLeg(i + 1) > 0.5).length
  const shownSites = run.sites.filter((_, i) => tick >= SITES_FROM + i * SITE_EVERY).length

  const step = STEP_STARTS.findLastIndex(start => tick >= start)
  const captions = [
    m.mapCaption,
    m.centreCaption,
    m.sitesCaption(Math.round((run.siteCount * shownSites) / run.sites.length)),
    m.courseCaption(format.kilometres(run.lengthMeters * drawnShare), placedControls),
    m.descriptionsCaption,
    m.doneCaption(format.kilometres(run.lengthMeters), format.metres(run.climbMeters)),
  ]
  const centreShown = clamp((tick - CENTRE_FROM) / CENTRE_TICKS)
  const descriptionRows = run.controls.length + DESCRIPTION_HEADER_ROWS + 2
  const [pageWidth, pageHeight] = run.page

  return (
    <figure className="hero-demo">
      <svg
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        className="hero-demo-page"
        role="img"
        aria-label={m.label}
      >
        <g opacity={clamp(tick / MAP_TICKS)}>
          <IllustratedMap />
        </g>

        {run.sites.map(([x, y], i) => {
          const appears = SITES_FROM + i * SITE_EVERY
          const opacity =
            tick < appears
              ? 0
              : SITE_OPACITY * clamp(1 - (tick - SITES_FADE_FROM) / SITES_FADE_TICKS)
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4.5"
              fill="var(--colour-overprint)"
              opacity={opacity}
            />
          )
        })}

        <g transform={`translate(0 ${-40 * (1 - centreShown)})`} opacity={centreShown > 0 ? 1 : 0}>
          <circle
            cx={run.centre[0]}
            cy={run.centre[1]}
            r="13"
            fill="#000"
            stroke="#fff"
            strokeWidth="3"
          />
          <circle cx={run.centre[0]} cy={run.centre[1]} r="4" fill="#fff" />
        </g>

        <g stroke="var(--colour-overprint)" strokeWidth="2.6" fill="none">
          {legs.map((leg, i) => (
            <line
              key={i}
              x1={leg.x1}
              y1={leg.y1}
              x2={leg.x2}
              y2={leg.y2}
              strokeDasharray={leg.dash}
              strokeDashoffset={leg.offset}
            />
          ))}
          <polygon points={startTriangle(run.start)} opacity={clamp((tick - LEGS_FROM + 2) / 2)} />
          {run.controls.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={CONTROL_RADIUS} opacity={appearsAfterLeg(i + 1)} />
          ))}
          <g opacity={appearsAfterLeg(stops.length - 1)}>
            <circle cx={run.finish[0]} cy={run.finish[1]} r="10" />
            <circle cx={run.finish[0]} cy={run.finish[1]} r={CONTROL_RADIUS} />
          </g>
        </g>
        <g fill="var(--colour-overprint)" fontWeight="800" fontSize="20">
          {run.controls.map(([x, y], i) => (
            <text
              key={i}
              x={x + LABEL_OFFSET[0]}
              y={y + LABEL_OFFSET[1]}
              opacity={appearsAfterLeg(i + 1)}
            >
              {i + 1}
            </text>
          ))}
        </g>

        <rect
          x="6"
          y="6"
          width={pageWidth - 12}
          height={pageHeight - 12}
          fill="none"
          stroke="#000"
          strokeWidth="1.5"
          strokeDasharray="10 6"
          opacity={clamp((tick - FRAME_FROM) / 4)}
        />
        {Array.from({ length: descriptionRows }, (_, row) => (
          <rect
            key={row}
            x={DESCRIPTION_ORIGIN[0]}
            y={DESCRIPTION_ORIGIN[1] + row * DESCRIPTION_ROW_HEIGHT}
            width={DESCRIPTION_WIDTH}
            height={DESCRIPTION_ROW_HEIGHT}
            fill="#fff"
            stroke="#1b1b1b"
            strokeWidth="0.8"
            opacity={clamp((tick - DESCRIPTIONS_FROM - row * DESCRIPTION_ROW_EVERY) / 2)}
          />
        ))}
      </svg>

      <figcaption className="hero-demo-caption">
        {!isStill && (
          <button
            type="button"
            className="hero-demo-play"
            aria-label={isPaused ? m.play : m.pause}
            onClick={() => setIsPaused(paused => !paused)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {isPaused ? <path d="M7 4l13 8-13 8z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
            </svg>
          </button>
        )}
        <span className="hero-demo-text">
          <strong aria-live="polite">{m.steps[step]}</strong>
          <span>{captions[step]}</span>
        </span>
      </figcaption>
      <div className="hero-demo-progress" aria-hidden="true">
        {m.steps.map((_, i) => (
          <span key={i} className={i <= step ? 'is-done' : undefined} />
        ))}
      </div>
    </figure>
  )
}

function startTriangle([x, y]: DemoPoint): string {
  const radius = 19
  return [-90, 30, 150]
    .map(degrees => {
      const angle = (degrees * Math.PI) / 180
      return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`
    })
    .join(' ')
}
