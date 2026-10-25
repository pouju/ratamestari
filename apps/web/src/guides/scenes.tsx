import type { ReactNode } from 'react'
import { ROUTE_CHOICE } from '@ratamestari/rules'
import type { Format, Messages, StopName } from '../i18n'
import type { DemoPoint } from '../landing/demo-run'
import { SAMPLE_RUN as run } from '../landing/demo-run'
import { GUIDE_RUN as guide, type GuideLeg, type GuideRoute } from './guide-run'
import {
  along,
  focusBox,
  Overprint,
  Pointer,
  progress,
  routeColour,
  RoutePath,
  shiftedNumber,
  type DrawnStop,
  type ViewBox,
} from './scene'

export interface Scene {
  readonly loopTicks: number
  readonly stillTick: number
  readonly stepStarts: readonly number[]
  readonly view: ViewBox
  // When the scene zooms, the view at each tick.
  readonly viewAt?: (tick: number) => ViewBox
  readonly map: (tick: number) => ReactNode
  readonly panel: (tick: number) => ReactNode
}

export type GuideName =
  | 'setCourse'
  | 'legRoutes'
  | 'courseRoutes'
  | 'keep'
  | 'drag'
  | 'setByHand'
  | 'planLeg'
  | 'assistant'

const FOCUS_PADDING = 40
const WHOLE_PAGE: ViewBox = [0, 0, ...run.page]
const stops = [run.start, ...run.controls, run.finish]
const routeWidth = run.symbols.lineWidth * 2.6

const enteringFrom = ([x, y, width, height]: ViewBox): DemoPoint => [
  x + width * 1.05,
  y + height * 0.95,
]
const midpoint = ([ax, ay]: DemoPoint, [bx, by]: DemoPoint): DemoPoint => [
  (ax + bx) / 2,
  (ay + by) / 2,
]
const stopNameOf = (stop: number): StopName =>
  stop === 0 ? 'start' : stop === stops.length - 1 ? 'finish' : stop
const courseControls = (controls: readonly DemoPoint[] = run.controls): DrawnStop[] =>
  controls.map(at => ({ at }))
const findingsLine = (m: Messages, count: number) =>
  count === 0 ? m.course.noFindings : m.course.findingCount(count)

export function scenes(m: Messages, format: Format): Record<GuideName, Scene | null> {
  return {
    setCourse: setCourseScene(m, format),
    legRoutes: legRoutesScene(m, format),
    courseRoutes: courseRoutesScene(m, format),
    keep: keepScene(m),
    drag: dragScene(m),
    setByHand: setByHandScene(m),
    planLeg: planLegScene(m, format),
    assistant: assistantScene(m),
  }
}

function setCourseScene(m: Messages, format: Format): Scene {
  const view = WHOLE_PAGE
  const centreClick = 16
  const setCoursePress = 26
  const phases = [
    [28, m.course.searchPhases.areas],
    [36, m.course.searchPhases.skeleton],
    [44, m.course.searchPhases.sections],
    [50, m.course.searchPhases.improving],
    [56, m.course.searchPhases.checking],
  ] as const
  const revealed = 62
  return {
    loopTicks: 110,
    stillTick: 109,
    stepStarts: [0, 22, revealed],
    view,
    map: tick => (
      <>
        {tick >= centreClick && <CentreMark at={run.centre} />}
        <Overprint
          run={run}
          start={run.start}
          controls={courseControls()}
          finish={run.finish}
          numbers={run.numbers ?? undefined}
          opacity={progress(tick, revealed, 6)}
        />
        <Pointer
          view={view}
          tick={tick}
          clicks={[centreClick]}
          at={along(tick, [
            [2, enteringFrom(view)],
            [14, run.centre],
          ])}
          opacity={1 - progress(tick, 20, 2)}
        />
      </>
    ),
    panel: tick => {
      const phase = phases.findLast(([from]) => tick >= from)
      return (
        <>
          <PanelLine
            label={m.course.centreLine}
            value={tick >= centreClick ? m.course.centreChosen : m.course.centreQuestion}
          />
          {tick < centreClick && <p className="guide-soft">{m.course.centreHint}</p>}
          {tick < phases[0][0] && (
            <div className="guide-buttons">
              <PanelButton
                isPrimary
                isPointed={tick >= 20}
                isPressed={isPressing(tick, setCoursePress)}
              >
                {m.course.setCourse}
              </PanelButton>
              <PanelButton>{m.setByHand.entry}</PanelButton>
            </div>
          )}
          {phase && tick < revealed && (
            <>
              <p>
                <strong>{m.course.setting}</strong>
                <br />
                <span className="guide-soft">{phase[1]}</span>
              </p>
              <div className="guide-buttons">
                <PanelButton isPrimary>{m.course.stop}</PanelButton>
              </div>
            </>
          )}
          {tick >= revealed && (
            <>
              <PanelLine label={m.course.length} value={format.kilometres(run.lengthMeters)} />
              <PanelLine label={m.course.climb} value={format.metres(run.climbMeters)} />
              <PanelLine label={m.course.controls} value={String(run.controls.length)} />
              <p className="guide-note">{findingsLine(m, guide.findings)}</p>
            </>
          )}
        </>
      )
    },
  }
}

function legRoutesScene(m: Messages, format: Format): Scene {
  const leg = guide.leg.index
  const from = stops[leg]!
  const to = stops[leg + 1]!
  const view = focusBox(
    [from, to, ...guide.leg.routes.flatMap(route => route.points)],
    FOCUS_PADDING,
    run.page,
  )
  const click = 20
  const routesFrom = 22
  return {
    loopTicks: 100,
    stillTick: 99,
    stepStarts: [0, click, 38],
    view,
    map: tick => (
      <>
        <RoutesDrawn routes={guide.leg.routes} tick={tick} from={routesFrom} />
        <Overprint
          run={run}
          start={run.start}
          controls={courseControls()}
          finish={run.finish}
          numbers={run.numbers ?? undefined}
          highlightedLeg={tick >= click ? leg : null}
        />
        <Pointer
          view={view}
          tick={tick}
          clicks={[click]}
          at={along(tick, [
            [4, enteringFrom(view)],
            [18, midpoint(from, to)],
          ])}
        />
      </>
    ),
    panel: tick =>
      tick < click ? (
        <p className="guide-soft">{m.leg.selectHint}</p>
      ) : (
        <LegCard
          m={m}
          format={format}
          title={m.leg.title(stopNameOf(leg), stopNameOf(leg + 1))}
          leg={guide.leg}
          shownRoutes={guide.leg.routes.filter((_, i) => tick >= routeShownAt(routesFrom, i))}
          tick={tick}
        />
      ),
  }
}

function courseRoutesScene(m: Messages, format: Format): Scene {
  const view = WHOLE_PAGE
  const press = 10
  const findFrom = 14
  const ticksPerLeg = 6
  const foundAt = (leg: number) => findFrom + (leg + 1) * ticksPerLeg
  const legs = guide.courseRoutes
  const allFound = foundAt(legs.length - 1)
  const rowPress = allFound + 16
  const opened = guide.leg.index
  return {
    loopTicks: allFound + 50,
    stillTick: allFound + 49,
    stepStarts: [0, findFrom, allFound + 6],
    view,
    map: tick => (
      <>
        {legs.map((routes, leg) => (
          <g key={leg}>
            {routes.map((route, i) => (
              <RoutePath
                key={i}
                points={route.points}
                colour={routeColour(i, routes.length)}
                width={tick >= rowPress && leg === opened ? routeWidth * 1.6 : routeWidth}
                shown={progress(tick, foundAt(leg) - ticksPerLeg, ticksPerLeg)}
              />
            ))}
          </g>
        ))}
        <Overprint
          run={run}
          start={run.start}
          controls={courseControls()}
          finish={run.finish}
          numbers={run.numbers ?? undefined}
          highlightedLeg={tick >= rowPress ? opened : null}
        />
      </>
    ),
    panel: tick => {
      if (tick < findFrom)
        return (
          <>
            <h3>{m.courseRoutes.title}</h3>
            <div className="guide-buttons">
              <PanelButton isPointed={tick >= 4} isPressed={isPressing(tick, press)}>
                {m.courseRoutes.findAll}
              </PanelButton>
            </div>
            <p className="guide-soft">{m.courseRoutes.findAllHint}</p>
          </>
        )
      const found = legs.filter((_, leg) => tick >= foundAt(leg)).length
      const withChoice = legs.filter((routes, leg) => tick >= foundAt(leg) && routes.length > 1)
      const openedLeg = tick >= rowPress + 2 ? guide.leg : null
      return (
        <>
          {openedLeg && (
            <>
              <p className="guide-back">‹ {m.leg.wholeCourse}</p>
              <h3>{m.leg.title(stopNameOf(opened), stopNameOf(opened + 1))}</h3>
              <RouteTable m={m} format={format} leg={openedLeg} shownRoutes={openedLeg.routes} />
            </>
          )}
          <h3>{m.courseRoutes.title}</h3>
          <p>
            {found < legs.length
              ? m.courseRoutes.finding(found, legs.length)
              : m.courseRoutes.summary(withChoice.length, legs.length)}
          </p>
          <table className="guide-table">
            <thead>
              <tr>
                <th scope="col">{m.courseRoutes.leg}</th>
                <th scope="col">{m.courseRoutes.fastest}</th>
                <th scope="col">{m.courseRoutes.choice}</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((routes, leg) => {
                const [fastest, best] = routes
                const isFound = tick >= foundAt(leg)
                return (
                  <tr
                    key={leg}
                    className={
                      [
                        isFound && best && 'has-route-choice',
                        openedLeg && leg === opened && 'is-selected',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                  >
                    <th scope="row">
                      <span className="guide-row-name">
                        {m.courseRoutes.legName(stopNameOf(leg), stopNameOf(leg + 1))}
                        {leg === opened && tick >= rowPress - 8 && (
                          <PanelPointer isPressed={isPressing(tick, rowPress)} />
                        )}
                      </span>
                    </th>
                    <td>
                      {!isFound
                        ? m.courseRoutes.findingLeg
                        : fastest
                          ? format.duration(fastest.timeSeconds)
                          : m.courseRoutes.unreachable}
                    </td>
                    <td>
                      {isFound &&
                        fastest &&
                        (best ? (
                          <span className="guide-choice">
                            <Swatches count={routes.length - 1} total={routes.length} />
                            {m.courseRoutes.alternatives(
                              routes.length - 1,
                              format.timeDifference(best.timeSeconds - fastest.timeSeconds),
                            )}
                          </span>
                        ) : (
                          <span className="guide-soft">{m.courseRoutes.none}</span>
                        ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )
    },
  }
}

function keepScene(m: Messages): Scene | null {
  const again = guide.keep
  if (!again) return null
  const view = WHOLE_PAGE
  const leg = again.leg
  const legClick = 14
  const keepPress = 28
  const tryPress = 50
  const revealed = 64
  const lockedBefore = [stops[leg]!, stops[leg + 1]!] as const
  const [firstKept, secondKept] = again.keptStops.map(stop => again.controls[stop - 1]!)
  return {
    loopTicks: 110,
    stillTick: 109,
    stepStarts: [0, keepPress, tryPress],
    view,
    map: tick => {
      const isNew = tick >= revealed - 4
      const keptNumbers = isNew
        ? again.keptStops.map(stop => again.numbers[stop - 1])
        : [leg, leg + 1].map(stop => run.numbers?.[stop - 1])
      const locks =
        isNew && firstKept && secondKept
          ? [firstKept, secondKept, midpoint(firstKept, secondKept)]
          : tick >= keepPress && !isNew
            ? [...lockedBefore, midpoint(...lockedBefore)]
            : []
      return (
        <>
          {isNew ? (
            <Overprint
              run={run}
              start={again.start}
              controls={courseControls(again.controls)}
              finish={run.finish}
              numbers={again.numbers}
              opacity={progress(tick, revealed - 4, 6)}
            />
          ) : (
            <Overprint
              run={run}
              start={run.start}
              controls={courseControls()}
              finish={run.finish}
              numbers={run.numbers ?? undefined}
              highlightedLeg={tick >= legClick && tick < tryPress ? leg : null}
              opacity={1 - progress(tick, tryPress + 2, 4)}
            />
          )}
          {locks.map((at, i) => (
            <KeptMark key={i} at={at} awayFrom={i === 2 ? null : (keptNumbers[i] ?? null)} />
          ))}
          <Pointer
            view={view}
            tick={tick}
            clicks={[legClick]}
            at={along(tick, [
              [2, enteringFrom(view)],
              [legClick - 2, midpoint(...lockedBefore)],
            ])}
            opacity={1 - progress(tick, legClick + 6, 2)}
          />
        </>
      )
    },
    panel: tick => {
      if (tick < legClick) return <p className="guide-soft">{m.leg.selectHint}</p>
      if (tick < 40) {
        const isKept = tick >= keepPress
        return (
          <>
            <h3>{m.leg.title(stopNameOf(leg), stopNameOf(leg + 1))}</h3>
            <p>
              <strong>{m.keep.title}</strong>
            </p>
            <div className="guide-buttons">
              <PanelButton
                isPrimary={isKept}
                isPointed={tick >= keepPress - 8}
                isPressed={isPressing(tick, keepPress)}
              >
                {m.keep.leg}
              </PanelButton>
              <PanelButton isPrimary={isKept}>{m.keep.control(leg)}</PanelButton>
              <PanelButton isPrimary={isKept}>{m.keep.control(leg + 1)}</PanelButton>
            </div>
            <p className="guide-soft">{m.keep.hint}</p>
          </>
        )
      }
      if (tick >= tryPress + 2 && tick < revealed)
        return (
          <p>
            <strong>{m.course.setting}</strong>
            <br />
            <span className="guide-soft">{m.course.searchPhases.sections}</span>
          </p>
        )
      return (
        <>
          <div className="guide-buttons">
            <PanelButton isPrimary>{m.course.downloadPdf}</PanelButton>
            <PanelButton
              isPointed={tick >= tryPress - 8 && tick < revealed}
              isPressed={isPressing(tick, tryPress)}
            >
              {m.course.tryAnother}
            </PanelButton>
          </div>
          <p className="guide-note">{m.keep.summary(2, 1)}</p>
          {tick >= revealed && (
            <PanelLine label={m.course.controls} value={String(again.controls.length)} />
          )}
        </>
      )
    },
  }
}

function dragScene(m: Messages): Scene | null {
  const drag = guide.drag
  if (!drag) return null
  const index = drag.control - 1
  const from = run.controls[index]!
  const view = focusBox(
    [from, drag.to, stops[drag.control - 1]!, stops[drag.control + 1]!],
    FOCUS_PADDING,
    run.page,
  )
  const press = 18
  const release = 40
  const checked = 46
  const pointerAt = (tick: number) =>
    along(tick, [
      [4, enteringFrom(view)],
      [16, from],
      [20, from],
      [release - 2, drag.to],
    ])
  return {
    loopTicks: 90,
    stillTick: 89,
    stepStarts: [0, release, checked],
    view,
    map: tick => {
      const at = tick < press ? from : pointerAt(tick)
      return (
        <>
          <Overprint
            run={run}
            start={run.start}
            controls={run.controls.map((control, i) => ({
              at: i === index ? at : control,
              isSelected: i === index && tick >= press && tick < release,
            }))}
            finish={run.finish}
            numbers={run.numbers?.map((number, i) =>
              i === index ? shiftedNumber(number, from, at) : number,
            )}
          />
          <Pointer view={view} tick={tick} clicks={[press]} at={pointerAt(tick)} />
        </>
      )
    },
    panel: tick => (
      <>
        <p className="guide-soft">{m.course.dragHint}</p>
        <p className={tick >= checked ? 'guide-note is-new' : 'guide-note'}>
          {findingsLine(m, tick >= checked ? drag.findings : guide.findings)}
        </p>
      </>
    ),
  }
}

function setByHandScene(m: Messages): Scene {
  const placed = [run.start, ...run.controls.slice(0, 3)]
  const view = focusBox([...placed, run.finish], FOCUS_PADDING, run.page)
  const entryPress = 6
  const placeClicks = [16, 28, 40, 52]
  const selectClick = 68
  const deletePress = 82
  const undoPress = 100
  const selected = 2
  const pointerKeys: [number, DemoPoint][] = [
    [10, enteringFrom(view)],
    ...placeClicks.map((click, i): [number, DemoPoint] => [click - 2, placed[i]!]),
    [selectClick - 4, placed[selected]!],
  ]
  return {
    loopTicks: 130,
    stillTick: 129,
    stepStarts: [0, 12, 64, 94],
    view,
    map: tick => {
      const shown = placeClicks.filter(click => tick >= click).length
      const isDeleted = tick >= deletePress && tick < undoPress
      const isKept = (_: unknown, i: number) => !(isDeleted && i + 1 === selected)
      const controls = placed
        .slice(1, shown)
        .map((at, i) => ({ at, isSelected: i + 1 === selected && tick >= selectClick }))
        .filter(isKept)
      return (
        <>
          <Overprint
            run={run}
            start={shown > 0 ? run.start : null}
            controls={controls}
            finish={tick >= 12 ? run.finish : null}
            numbers={run.numbers?.slice(0, shown - 1).filter(isKept)}
          />
          <Pointer
            view={view}
            tick={tick}
            clicks={[...placeClicks, selectClick]}
            at={along(tick, pointerKeys)}
            opacity={tick < 10 ? 0 : 1 - progress(tick, selectClick + 6, 2)}
          />
        </>
      )
    },
    panel: tick => {
      if (tick < 12)
        return (
          <div className="guide-buttons">
            <PanelButton isPrimary>{m.course.setCourse}</PanelButton>
            <PanelButton isPointed isPressed={isPressing(tick, entryPress)}>
              {m.setByHand.entry}
            </PanelButton>
          </div>
        )
      const shown = placeClicks.filter(click => tick >= click).length
      const isDeleted = tick >= deletePress && tick < undoPress
      const nextControl = shown - (isDeleted ? 1 : 0)
      const isSelected = tick >= selectClick && tick < deletePress
      return (
        <>
          <h3>{m.setByHand.title}</h3>
          {isSelected ? (
            <>
              <p>{m.setByHand.selected(selected)}</p>
              <p className="guide-soft">{m.setByHand.selectedControlHint}</p>
              <div className="guide-buttons">
                <PanelButton
                  isPointed={tick >= deletePress - 8}
                  isPressed={isPressing(tick, deletePress)}
                >
                  {m.setByHand.deleteControl(selected)}
                </PanelButton>
              </div>
              <p className="guide-soft">{m.setByHand.deleteKeyHint}</p>
            </>
          ) : (
            <p className="guide-soft">
              {shown === 0 ? m.setByHand.placeStart : m.setByHand.placeNext(nextControl)}
            </p>
          )}
          <div className="guide-buttons">
            <PanelButton
              isPointed={tick >= undoPress - 8 && tick < undoPress + 10}
              isPressed={isPressing(tick, undoPress)}
            >
              {m.setByHand.undo}
            </PanelButton>
            <PanelButton>{m.setByHand.done}</PanelButton>
            {tick >= deletePress && <kbd>Ctrl+Z</kbd>}
          </div>
        </>
      )
    },
  }
}

function planLegScene(m: Messages, format: Format): Scene | null {
  const planned = guide.plannedLeg
  if (!planned?.around) return null
  const around = planned.around
  const view = focusBox(
    [planned.from, planned.to, ...planned.routes.flatMap(route => route.points)],
    FOCUS_PADDING,
    run.page,
  )
  const toolPress = 6
  const fromClick = 20
  const toClick = 34
  const routesFrom = 37
  const aroundPress = 66
  const zoomOut = 70
  const revealed = 82
  const [firstKept, secondKept] = around.keptStops.map(stop => around.controls[stop - 1]!)
  const keptNumbers = around.keptStops.map(stop => around.numbers[stop - 1])
  return {
    loopTicks: 135,
    stillTick: 134,
    stepStarts: [0, 14, routesFrom, aroundPress],
    view,
    viewAt: tick => {
      const t = progress(tick, zoomOut, 8)
      return view.map((value, i) => value + (WHOLE_PAGE[i]! - value) * t) as unknown as ViewBox
    },
    map: tick => (
      <>
        <g opacity={1 - progress(tick, revealed - 6, 4)}>
          <RoutesDrawn routes={planned.routes} tick={tick} from={routesFrom} />
          <Overprint
            run={run}
            start={null}
            controls={[
              ...(tick >= fromClick ? [{ at: planned.from }] : []),
              ...(tick >= toClick ? [{ at: planned.to }] : []),
            ]}
            finish={null}
            hasNumbers={false}
          />
        </g>
        {tick >= revealed - 4 && firstKept && secondKept && (
          <g opacity={progress(tick, revealed - 4, 6)}>
            <Overprint
              run={run}
              start={around.start}
              controls={courseControls(around.controls)}
              finish={run.finish}
              numbers={around.numbers}
            />
            <KeptMark at={firstKept} awayFrom={keptNumbers[0] ?? null} />
            <KeptMark at={secondKept} awayFrom={keptNumbers[1] ?? null} />
            <KeptMark at={midpoint(firstKept, secondKept)} awayFrom={null} />
          </g>
        )}
        <Pointer
          view={view}
          tick={tick}
          clicks={[fromClick, toClick]}
          at={along(tick, [
            [12, enteringFrom(view)],
            [fromClick - 2, planned.from],
            [toClick - 2, planned.to],
          ])}
          opacity={tick < 12 ? 0 : 1 - progress(tick, toClick + 6, 2)}
        />
      </>
    ),
    panel: tick => {
      if (tick < 14)
        return (
          <>
            <p className="guide-soft">{m.map.toolbar}</p>
            <div className="guide-buttons">
              <PanelButton>{m.map.layers}</PanelButton>
              <PanelButton isPointed isPressed={isPressing(tick, toolPress)}>
                {m.map.planLeg}
              </PanelButton>
              <PanelButton>{m.map.editControls}</PanelButton>
            </div>
          </>
        )
      if (tick >= aroundPress + 2 && tick < revealed)
        return (
          <p>
            <strong>{m.course.setting}</strong>
            <br />
            <span className="guide-soft">{m.course.searchPhases.sections}</span>
          </p>
        )
      if (tick >= revealed)
        return (
          <>
            <PanelLine label={m.course.controls} value={String(around.controls.length)} />
            <p className="guide-note">{m.keep.summary(2, 1)}</p>
          </>
        )
      const shownRoutes = planned.routes.filter((_, i) => tick >= routeShownAt(routesFrom, i))
      return (
        <>
          <h3>{m.planLeg.title}</h3>
          <p className="guide-soft">
            {tick < fromClick
              ? m.planLeg.placeFirst
              : tick < toClick
                ? m.planLeg.placeSecond
                : m.planLeg.dragHint}
          </p>
          {shownRoutes.length > 0 && (
            <>
              <PanelLine
                label={m.planLeg.straightLine}
                value={format.distance(planned.straightMeters)}
              />
              <RouteTable m={m} format={format} leg={planned} shownRoutes={shownRoutes} />
              <div className="guide-buttons">
                <PanelButton
                  isPrimary
                  isPointed={tick >= aroundPress - 8}
                  isPressed={isPressing(tick, aroundPress)}
                >
                  {m.planLeg.setCourseAround}
                </PanelButton>
              </div>
            </>
          )}
        </>
      )
    },
  }
}

function assistantScene(m: Messages): Scene | null {
  const asked = guide.assistant
  if (!asked) return null
  const index = asked.control - 1
  const from = run.controls[index]!
  const view = focusBox(
    [from, asked.to, stops[asked.control - 1]!, stops[asked.control + 1]!],
    FOCUS_PADDING,
    run.page,
  )
  const direction = m.guides.assistant.directions[asked.direction]
  const question = m.guides.assistant.question(asked.control, direction)
  const typedFrom = 4
  const sent = 30
  const answered = 46
  const moved = 50
  return {
    loopTicks: 110,
    stillTick: 109,
    stepStarts: [0, sent, answered],
    view,
    map: tick => {
      const at = along(tick, [
        [moved, from],
        [moved + 8, asked.to],
      ])
      return (
        <Overprint
          run={run}
          start={run.start}
          controls={run.controls.map((control, i) => ({
            at: i === index ? at : control,
            isSelected: i === index && tick >= moved && tick < moved + 20,
          }))}
          finish={run.finish}
          numbers={run.numbers?.map((number, i) =>
            i === index ? shiftedNumber(number, from, at) : number,
          )}
        />
      )
    },
    panel: tick => {
      const typed = Math.round(question.length * progress(tick, typedFrom, sent - typedFrom - 2))
      return (
        <>
          <h3>{m.chat.title}</h3>
          <div className="guide-chat">
            {tick >= sent && <p className="guide-chat-question">{question}</p>}
            {tick >= sent + 2 && tick < answered && (
              <p className="guide-chat-typing" aria-hidden="true">
                <span />
                <span />
                <span />
              </p>
            )}
            {tick >= answered && (
              <p className="guide-chat-answer">
                {m.guides.assistant.answer(asked.control, direction)}
              </p>
            )}
          </div>
          <div className="guide-chat-input">
            <span className={typed === 0 ? 'guide-soft' : undefined}>
              {tick < sent && typed > 0 ? question.slice(0, typed) : m.chat.placeholder}
            </span>
            <span className="guide-chat-send">{m.chat.send}</span>
          </div>
        </>
      )
    },
  }
}

const routeShownAt = (from: number, rank: number) => from + rank * 6

function RoutesDrawn({
  routes,
  tick,
  from,
}: {
  routes: readonly GuideRoute[]
  tick: number
  from: number
}) {
  return (
    <>
      {routes.map((route, i) => (
        <RoutePath
          key={i}
          points={route.points}
          colour={routeColour(i, routes.length)}
          width={routeWidth}
          shown={progress(tick, routeShownAt(from, i), 10)}
        />
      ))}
    </>
  )
}

// The app's padlock: beside a kept control away from its number, or at the middle of a kept leg.
function KeptMark({ at: [x, y], awayFrom }: { at: DemoPoint; awayFrom: DemoPoint | null }) {
  const offset = awayFrom ? run.symbols.controlRadius * 1.6 : 0
  const [dx, dy] = awayFrom ? [x - awayFrom[0], y - awayFrom[1]] : [0, 0]
  const length = Math.hypot(dx, dy) || 1
  const scale = (run.symbols.controlRadius * 0.6) / 11
  const [markX, markY] = [x + (dx / length) * offset, y + (dy / length) * offset]
  return (
    <g transform={`translate(${markX} ${markY}) scale(${scale}) translate(-12 -12)`}>
      <circle cx={12} cy={12} r={11} fill="var(--colour-map-white)" stroke="var(--colour-ink)" />
      <path
        d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"
        fill="none"
        stroke="var(--colour-ink)"
        strokeWidth={2}
      />
      <rect x={6.5} y={11} width={11} height={7.5} rx={1.5} fill="var(--colour-ink)" />
    </g>
  )
}

function CentreMark({ at: [x, y] }: { at: DemoPoint }) {
  const { controlRadius, lineWidth } = run.symbols
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={controlRadius}
        fill="var(--colour-ink)"
        stroke="var(--colour-map-white)"
        strokeWidth={lineWidth * 2}
      />
      <circle cx={x} cy={y} r={controlRadius / 3} fill="var(--colour-map-white)" />
    </g>
  )
}

function LegCard({
  m,
  format,
  title,
  leg,
  shownRoutes,
  tick,
}: {
  m: Messages
  format: Format
  title: string
  leg: GuideLeg
  shownRoutes: readonly GuideRoute[]
  tick: number
}) {
  return (
    <>
      <p className="guide-back">‹ {m.leg.wholeCourse}</p>
      <div className="guide-leg-heading">
        <h3>{title}</h3>
        <span className={tick >= 70 ? 'guide-steps is-pointed' : 'guide-steps'}>‹ ›</span>
      </div>
      <p className="guide-soft">{m.leg.straightLine(format.distance(leg.straightMeters))}</p>
      {shownRoutes.length > 0 && (
        <RouteTable m={m} format={format} leg={leg} shownRoutes={shownRoutes} />
      )}
    </>
  )
}

function RouteTable({
  m,
  format,
  leg,
  shownRoutes,
}: {
  m: Messages
  format: Format
  leg: GuideLeg
  shownRoutes: readonly GuideRoute[]
}) {
  const [fastest, second] = leg.routes
  return (
    <>
      <table className="guide-table">
        <thead>
          <tr>
            <th scope="col">{m.leg.route}</th>
            <th scope="col">{m.leg.length}</th>
            <th scope="col">{m.leg.time}</th>
          </tr>
        </thead>
        <tbody>
          {shownRoutes.map((route, i) => (
            <tr key={i}>
              <th scope="row">
                <span
                  className="guide-swatch"
                  style={{ background: routeColour(i, leg.routes.length) }}
                  aria-hidden="true"
                />
                {m.leg.routeLetters[i]}
              </th>
              <td>{format.distance(route.lengthMeters)}</td>
              <td>
                {i === 0 ? (
                  <strong>{format.duration(route.timeSeconds)}</strong>
                ) : (
                  <>
                    {format.duration(route.timeSeconds)}{' '}
                    <span className="guide-soft">
                      {m.leg.slowerBy(
                        format.timeDifference(route.timeSeconds - fastest!.timeSeconds),
                      )}
                    </span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shownRoutes.length === leg.routes.length && (
        <p className="guide-note">
          {second
            ? m.leg.routeChoice(
                m.leg.routeLetters[1]!,
                format.timeDifference(second.timeSeconds - fastest!.timeSeconds),
              )
            : m.leg.noRouteChoice(format.share(ROUTE_CHOICE.maxExtraTimeShare))}
        </p>
      )}
    </>
  )
}

function Swatches({ count, total }: { count: number; total: number }) {
  return (
    <span className="guide-swatches" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="guide-swatch" style={{ background: routeColour(i + 1, total) }} />
      ))}
    </span>
  )
}

const PRESS_TICKS = 3
const isPressing = (tick: number, press: number) => tick >= press && tick < press + PRESS_TICKS

function PanelLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="guide-line">
      <span className="guide-soft">{label}</span>
      <strong>{value}</strong>
    </p>
  )
}

function PanelButton({
  isPrimary = false,
  isPointed = false,
  isPressed = false,
  children,
}: {
  isPrimary?: boolean
  isPointed?: boolean
  isPressed?: boolean
  children: ReactNode
}) {
  const classes = ['guide-button', isPrimary && 'is-primary', isPressed && 'is-pressed']
  return (
    <span className={classes.filter(Boolean).join(' ')}>
      {children}
      {isPointed && <PanelPointer isPressed={isPressed} />}
    </span>
  )
}

function PanelPointer({ isPressed }: { isPressed: boolean }) {
  return (
    <svg
      className={isPressed ? 'guide-pointer is-pressed' : 'guide-pointer'}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M0 0 L0 19 L5 14.5 L8.6 22.4 L12 20.9 L8.5 13.2 L15 13 Z"
        fill="var(--colour-ink)"
        stroke="var(--colour-map-white)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}
