import { useEffect, useId, useState } from 'react'
import { useFormat, useMessages } from '../i18n'
import type { DemoPoint, DemoRun } from './demo-run'

const TICK_MS = 100
const MAP_TICKS = 8
const CENTRE_FROM = 10
const CENTRE_TICKS = 6
const SITES_FROM = 22
const SITE_EVERY = 0.5
const AREAS_FROM = 56
const AREAS_TICKS = 8
const AREA_FILL_OPACITY = 0.14
const SITES_FADE_FROM = 58
const SITES_FADE_TICKS = 10
const SITE_OPACITY = 0.55
const LEGS_FROM = 72
const LEG_TICKS = 5
const DESCRIPTIONS_FROM = 132
const AREAS_FADE_TICKS = 10
const DESCRIPTION_ROW_EVERY = 1.1
const DONE_FROM = 152
const LOOP_TICKS = 189
const STEP_STARTS = [
  0,
  CENTRE_FROM,
  SITES_FROM,
  AREAS_FROM,
  LEGS_FROM,
  DESCRIPTIONS_FROM,
  DONE_FROM,
]

const SITE_SHARE_OF_CONTROL_RADIUS = 0.3
const GAP_BESIDE_DESCRIPTIONS = 12

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

  const symbols = run.symbols
  const stops = [run.start, ...run.controls, run.finish]
  const radii = [
    symbols.startRadius,
    ...run.controls.map(() => symbols.controlRadius),
    symbols.finishOuterRadius,
  ]
  const legs = stops.slice(1).map((to, i) => {
    const from = stops[i]!
    const full = Math.hypot(to[0] - from[0], to[1] - from[1])
    const [ux, uy] = [(to[0] - from[0]) / full, (to[1] - from[1]) / full]
    const gapFrom = radii[i]! + symbols.gap
    const gapTo = radii[i + 1]! + symbols.gap
    const drawable = Math.max(0, full - gapFrom - gapTo)
    const shown = clamp((tick - LEGS_FROM - i * LEG_TICKS) / LEG_TICKS)
    return {
      full,
      shown,
      x1: from[0] + ux * gapFrom,
      y1: from[1] + uy * gapFrom,
      x2: to[0] - ux * gapTo,
      y2: to[1] - uy * gapTo,
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
    m.areasCaption(
      run.areas.length,
      run.areas.reduce((sum, area) => sum + area.minutes, 0),
    ),
    m.courseCaption(format.kilometres(run.lengthMeters * drawnShare), placedControls),
    m.descriptionsCaption,
    m.doneCaption(format.kilometres(run.lengthMeters), format.metres(run.climbMeters)),
  ]
  const centreShown = clamp((tick - CENTRE_FROM) / CENTRE_TICKS)
  const areasShown =
    clamp((tick - AREAS_FROM) / AREAS_TICKS) *
    clamp(1 - (tick - DESCRIPTIONS_FROM) / AREAS_FADE_TICKS)
  const clipId = useId()
  const descriptions = run.descriptions
  const rowHeight = descriptions.height / descriptions.rows
  const shownRows = Array.from({ length: descriptions.rows }, (_, row) => row).filter(
    row => tick >= DESCRIPTIONS_FROM + row * DESCRIPTION_ROW_EVERY,
  ).length
  const [pageWidth, pageHeight] = run.page
  const mapLeft = descriptions.width + GAP_BESIDE_DESCRIPTIONS
  const viewWidth = mapLeft + pageWidth
  const viewHeight = Math.max(pageHeight, descriptions.height)
  const labelOffset = (symbols.controlRadius + symbols.numberHeight / 2) * Math.SQRT1_2

  return (
    <figure className="hero-demo">
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="hero-demo-page"
        role="img"
        aria-label={m.label}
      >
        <defs>
          <clipPath id={clipId}>
            <rect width={descriptions.width} height={shownRows * rowHeight} />
          </clipPath>
        </defs>
        <image
          href={descriptions.image}
          width={descriptions.width}
          height={descriptions.height}
          clipPath={`url(#${clipId})`}
        />
        <g transform={`translate(${mapLeft} 0)`}>
          <image
            href={run.pageImage}
            width={pageWidth}
            height={pageHeight}
            preserveAspectRatio="none"
            opacity={clamp(tick / MAP_TICKS)}
          />

          {run.areas.map((area, i) => (
            <polygon
              key={i}
              points={area.hull.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="var(--colour-overprint)"
              fillOpacity={AREA_FILL_OPACITY}
              stroke="var(--colour-overprint)"
              strokeWidth={symbols.lineWidth}
              strokeDasharray={`${symbols.lineWidth * 4} ${symbols.lineWidth * 3}`}
              opacity={areasShown}
            />
          ))}

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
                r={symbols.controlRadius * SITE_SHARE_OF_CONTROL_RADIUS}
                fill="var(--colour-overprint)"
                opacity={opacity}
              />
            )
          })}

          <g
            transform={`translate(0 ${-40 * (1 - centreShown)})`}
            opacity={centreShown > 0 ? 1 : 0}
          >
            <circle
              cx={run.centre[0]}
              cy={run.centre[1]}
              r={symbols.controlRadius}
              fill="#000"
              stroke="#fff"
              strokeWidth={symbols.lineWidth * 2}
            />
            <circle
              cx={run.centre[0]}
              cy={run.centre[1]}
              r={symbols.controlRadius / 3}
              fill="#fff"
            />
          </g>

          <g stroke="var(--colour-overprint)" strokeWidth={symbols.lineWidth} fill="none">
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
            <polygon
              points={startTriangle(run.start, stops[1] ?? run.finish, symbols.startRadius)}
              opacity={clamp((tick - LEGS_FROM + 2) / 2)}
            />
            {run.controls.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={symbols.controlRadius}
                opacity={appearsAfterLeg(i + 1)}
              />
            ))}
            <g opacity={appearsAfterLeg(stops.length - 1)}>
              <circle cx={run.finish[0]} cy={run.finish[1]} r={symbols.finishInnerRadius} />
              <circle cx={run.finish[0]} cy={run.finish[1]} r={symbols.finishOuterRadius} />
            </g>
          </g>
          <g
            fill="var(--colour-overprint)"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize={symbols.numberHeight}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {run.controls.map(([x, y], i) => {
              const [numberX, numberY] = run.numbers?.[i] ?? [x + labelOffset, y - labelOffset]
              return (
                <text key={i} x={numberX} y={numberY} opacity={appearsAfterLeg(i + 1)}>
                  {i + 1}
                </text>
              )
            })}
          </g>
        </g>
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
      <p className="hero-demo-credit">{m.credit}</p>
      <div className="hero-demo-progress" aria-hidden="true">
        {m.steps.map((_, i) => (
          <span key={i} className={i <= step ? 'is-done' : undefined} />
        ))}
      </div>
    </figure>
  )
}

function startTriangle([x, y]: DemoPoint, [towardsX, towardsY]: DemoPoint, radius: number): string {
  const heading = Math.atan2(towardsY - y, towardsX - x)
  return [0, 120, 240]
    .map(degrees => {
      const angle = heading + (degrees * Math.PI) / 180
      return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`
    })
    .join(' ')
}
