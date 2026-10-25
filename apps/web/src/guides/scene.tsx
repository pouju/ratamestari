import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DemoPoint, DemoRun } from '../landing/demo-run'
import { useMessages } from '../i18n'

export const TICK_MS = 100
const POINTER_SIZE_SHARE = 0.075
const CLICK_RIPPLE_TICKS = 4

export const clamp = (value: number) => Math.max(0, Math.min(1, value))
export const progress = (tick: number, from: number, ticks: number) => clamp((tick - from) / ticks)
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

// The point at `tick` on a path through key points, eased between each pair.
export function along(tick: number, keys: readonly (readonly [number, DemoPoint])[]): DemoPoint {
  const next = keys.findIndex(([at]) => at > tick)
  if (next === -1) return keys.at(-1)![1]
  if (next === 0) return keys[0]![1]
  const [fromTick, [ax, ay]] = keys[next - 1]!
  const [toTick, [bx, by]] = keys[next]!
  const t = ease((tick - fromTick) / (toTick - fromTick))
  return [ax + (bx - ax) * t, ay + (by - ay) * t]
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Plays a scene in a loop while it is on screen; with reduced motion it rests on `stillTick`.
export function useSceneClock(loopTicks: number, stillTick: number) {
  const [isStill] = useState(prefersReducedMotion)
  const [tick, setTick] = useState(isStill ? stillTick : 0)
  const [isPaused, setIsPaused] = useState(isStill)
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setIsVisible(!!entry?.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isPaused || !isVisible) return
    const timer = setInterval(() => setTick(t => (t + 1) % loopTicks), TICK_MS)
    return () => clearInterval(timer)
  }, [isPaused, isVisible, loopTicks])

  return { tick, isStill, isPaused, togglePaused: () => setIsPaused(paused => !paused), ref }
}

export type ViewBox = readonly [x: number, y: number, width: number, height: number]

// The part of the page around `points`, with the page's aspect ratio and at least `minShare` of it.
export function focusBox(
  points: readonly DemoPoint[],
  padding: number,
  [pageWidth, pageHeight]: readonly [number, number],
  minShare = 0.55,
): ViewBox {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const aspect = pageWidth / pageHeight
  let width = Math.max(Math.max(...xs) - Math.min(...xs) + 2 * padding, pageWidth * minShare)
  let height = Math.max(Math.max(...ys) - Math.min(...ys) + 2 * padding, pageHeight * minShare)
  if (width / height > aspect) height = width / aspect
  else width = height * aspect
  width = Math.min(width, pageWidth)
  height = Math.min(height, pageHeight)
  const centreX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centreY = (Math.min(...ys) + Math.max(...ys)) / 2
  const x = Math.max(0, Math.min(pageWidth - width, centreX - width / 2))
  const y = Math.max(0, Math.min(pageHeight - height, centreY - height / 2))
  return [x, y, width, height]
}

export function MapStage({
  run,
  view,
  label,
  children,
}: {
  run: DemoRun
  view: ViewBox
  label: string
  children: ReactNode
}) {
  const [pageWidth, pageHeight] = run.page
  return (
    <svg viewBox={view.join(' ')} className="guide-map" role="img" aria-label={label}>
      <image
        href={run.pageImage}
        width={pageWidth}
        height={pageHeight}
        preserveAspectRatio="none"
      />
      {children}
    </svg>
  )
}

export function Pointer({
  at: [x, y],
  view,
  tick,
  clicks = [],
  opacity = 1,
}: {
  at: DemoPoint
  view: ViewBox
  tick: number
  clicks?: readonly number[]
  opacity?: number
}) {
  const size = view[2] * POINTER_SIZE_SHARE
  const click = clicks.findLast(at => tick >= at && tick < at + CLICK_RIPPLE_TICKS)
  const ripple = click === undefined ? 0 : (tick - click + 1) / CLICK_RIPPLE_TICKS
  return (
    <g opacity={opacity} pointerEvents="none">
      {click !== undefined && (
        <circle
          cx={x}
          cy={y}
          r={size * 0.25 + size * 0.5 * ripple}
          fill="none"
          stroke="var(--colour-ink)"
          strokeWidth={size * 0.06}
          opacity={1 - ripple}
        />
      )}
      <path
        transform={`translate(${x} ${y}) scale(${size / 24})`}
        d="M0 0 L0 19 L5 14.5 L8.6 22.4 L12 20.9 L8.5 13.2 L15 13 Z"
        fill="var(--colour-ink)"
        stroke="var(--colour-map-white)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </g>
  )
}

const ROUTE_COLOURS = [
  'var(--colour-route-fastest)',
  'var(--colour-route-middle)',
  'var(--colour-route-slowest)',
]

export const routeColour = (rank: number, count: number) =>
  ROUTE_COLOURS[rank === 0 ? 0 : rank === count - 1 ? 2 : 1]!

export function RoutePath({
  points,
  colour,
  shown,
  width,
}: {
  points: readonly DemoPoint[]
  colour: string
  shown: number
  width: number
}) {
  if (shown <= 0) return null
  return (
    <polyline
      points={points.map(([x, y]) => `${x},${y}`).join(' ')}
      fill="none"
      stroke={colour}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="var(--route-opacity)"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - shown}
    />
  )
}

export interface DrawnStop {
  readonly at: DemoPoint
  readonly opacity?: number
  readonly isSelected?: boolean
}

// The course overprint (ISOM 701–706) for any stops: start, controls with numbers, finish.
export function Overprint({
  run,
  start,
  controls,
  finish,
  numbers,
  highlightedLeg = null,
  hasNumbers = true,
  opacity = 1,
}: {
  run: DemoRun
  start: DemoPoint | null
  controls: readonly DrawnStop[]
  finish: DemoPoint | null
  numbers?: readonly (DemoPoint | undefined)[] | undefined
  highlightedLeg?: number | null
  hasNumbers?: boolean
  opacity?: number
}) {
  const { symbols } = run
  const stops: { at: DemoPoint; radius: number }[] = [
    ...(start ? [{ at: start, radius: symbols.startRadius }] : []),
    ...controls
      .filter(control => (control.opacity ?? 1) > 0)
      .map(control => ({ at: control.at, radius: symbols.controlRadius })),
    ...(finish ? [{ at: finish, radius: symbols.finishOuterRadius }] : []),
  ]
  const legOffset = start ? 0 : 1
  const labelOffset = (symbols.controlRadius + symbols.numberHeight / 2) * Math.SQRT1_2
  return (
    <g opacity={opacity}>
      <g stroke="var(--colour-overprint)" strokeWidth={symbols.lineWidth} fill="none">
        {stops.slice(1).map((to, i) => {
          const from = stops[i]!
          const length = Math.hypot(to.at[0] - from.at[0], to.at[1] - from.at[1])
          const gapFrom = from.radius + symbols.gap
          const gapTo = to.radius + symbols.gap
          if (length <= gapFrom + gapTo) return null
          const [ux, uy] = [(to.at[0] - from.at[0]) / length, (to.at[1] - from.at[1]) / length]
          const isHighlighted = highlightedLeg === i + legOffset
          return (
            <line
              key={i}
              x1={from.at[0] + ux * gapFrom}
              y1={from.at[1] + uy * gapFrom}
              x2={to.at[0] - ux * gapTo}
              y2={to.at[1] - uy * gapTo}
              strokeWidth={isHighlighted ? symbols.lineWidth * 2.4 : symbols.lineWidth}
            />
          )
        })}
        {start && (
          <polygon points={startTriangle(start, stops[1]?.at ?? start, symbols.startRadius)} />
        )}
        {controls.map((control, i) => (
          <g key={i} opacity={control.opacity ?? 1}>
            {control.isSelected && (
              <circle
                cx={control.at[0]}
                cy={control.at[1]}
                r={symbols.controlRadius + symbols.lineWidth * 2}
                stroke="var(--colour-ink)"
                strokeWidth={symbols.lineWidth}
                strokeDasharray={`${symbols.lineWidth * 2} ${symbols.lineWidth * 1.5}`}
              />
            )}
            <circle cx={control.at[0]} cy={control.at[1]} r={symbols.controlRadius} />
          </g>
        ))}
        {finish && (
          <>
            <circle cx={finish[0]} cy={finish[1]} r={symbols.finishInnerRadius} />
            <circle cx={finish[0]} cy={finish[1]} r={symbols.finishOuterRadius} />
          </>
        )}
      </g>
      <g
        fill="var(--colour-overprint)"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={symbols.numberHeight}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {(hasNumbers ? controls : []).map((control, i) => {
          const [x, y] = numbers?.[i] ?? [control.at[0] + labelOffset, control.at[1] - labelOffset]
          return (
            <text key={i} x={x} y={y} opacity={control.opacity ?? 1}>
              {i + 1}
            </text>
          )
        })}
      </g>
    </g>
  )
}

function startTriangle([x, y]: DemoPoint, [towardsX, towardsY]: DemoPoint, radius: number) {
  const heading = Math.atan2(towardsY - y, towardsX - x)
  return [0, 120, 240]
    .map(degrees => {
      const angle = heading + (degrees * Math.PI) / 180
      return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`
    })
    .join(' ')
}

// Keeps a number beside its control when the control moves.
export const shiftedNumber = (
  number: DemoPoint | undefined,
  from: DemoPoint,
  to: DemoPoint,
): DemoPoint | undefined => number && [number[0] + to[0] - from[0], number[1] + to[1] - from[1]]

export function SceneControls({
  steps,
  step,
  isStill,
  isPaused,
  onTogglePaused,
}: {
  steps: number
  step: number
  isStill: boolean
  isPaused: boolean
  onTogglePaused: () => void
}) {
  const m = useMessages().landing.demo
  return (
    <div className="guide-scene-controls">
      {!isStill && (
        <button
          type="button"
          className="hero-demo-play"
          aria-label={isPaused ? m.play : m.pause}
          onClick={onTogglePaused}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {isPaused ? <path d="M7 4l13 8-13 8z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
          </svg>
        </button>
      )}
      <div className="hero-demo-progress" aria-hidden="true">
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={i <= step ? 'is-done' : undefined} />
        ))}
      </div>
    </div>
  )
}
