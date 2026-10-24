import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { LocalPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, Course, PaperChoice } from '@ratamestari/engine'
import type { CourseRequest, IsomCode, PrintScaleChoice } from '@ratamestari/rules'
import { createCourseTools, type CourseWorkspace, type GenerateOptions } from '@ratamestari/agent'
import {
  formatOcadSymbolNumber,
  isomCodeForOcadSymbol,
  loadOcadMap,
  type OcadMap,
} from '@ratamestari/map-ocad'
import { renderCostMap, type CostMapImage } from './cost-map-image'
import { ChatPanel } from './ChatPanel'
import { CoursePanel } from './CoursePanel'
import { descriptionBoxFor } from './description-box'
import { downloadCourseXml } from './export-xml'
import { savePrintPdf } from './print-pdf'
import { SymbolPanel } from './SymbolPanel'
import {
  loadCorrections,
  mapKeyOf,
  saveCorrections,
  type SymbolCorrections,
} from './symbol-corrections'
import { courseNameOf } from './course-labels'
import { createEngine, progressCallback } from './engine'
import { formatDuration, parsePace } from './format'
import { LegRoutesPanel, PlanLegPanel, type LegRoutesState } from './LegRoutesPanel'
import { EMPTY_PLANNED_LEG, legEnds, plannedEnds, type PlannedLeg } from './leg-routes'
import { useMessages } from './i18n'
import { DIFFICULTY_COLOURS, MapView } from './MapView'
import { rasterizeSvg, type MapImage } from './rasterize'
import { SOURCE_CODE_URL } from './config'

type LoadState =
  | { status: 'empty' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; fileName: string; map: OcadMap; image: MapImage; ms: number }

type EngineState = 'idle' | 'loading' | 'ready' | 'error'

const DEFAULT_REQUEST: CourseRequest = {
  eventLevel: 'finnishChampionship',
  format: 'long',
  sex: 'H',
  ageClass: 21,
  skillLetter: 'A',
}

const DEFAULT_WINNER_PACE = '5:00'

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function App() {
  const [engine] = useState(createEngine)
  const [state, setState] = useState<LoadState>({ status: 'empty' })
  const [engineState, setEngineState] = useState<EngineState>('idle')
  const [plannedLeg, setPlannedLeg] = useState<PlannedLeg | null>(null)
  const [planRoutes, setPlanRoutes] = useState<LegRoutesState>({ status: 'finding' })
  const plannedLegQueue = useRef<{
    isBusy: boolean
    next: readonly [LocalPoint, LocalPoint] | null
  }>({ isBusy: false, next: null })
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null)
  const [legRoutes, setLegRoutes] = useState<LegRoutesState>({ status: 'finding' })
  const latestLegRoutesRequest = useRef(0)
  const messages = useMessages()
  const [showCostMap, setShowCostMap] = useState(false)
  const [costMap, setCostMap] = useState<CostMapImage | null>(null)
  const [showSites, setShowSites] = useState(false)
  const [sites, setSites] = useState<readonly ControlSiteCandidate[] | null>(null)
  const [competitionCentre, setCompetitionCentre] = useState<LocalPoint | null>(null)
  const [isPickingCentre, setIsPickingCentre] = useState(false)
  const [request, setRequest] = useState<CourseRequest>(DEFAULT_REQUEST)
  const [seed, setSeed] = useState(1)
  const [course, setCourse] = useState<Course | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [paceText, setPaceText] = useState(DEFAULT_WINNER_PACE)
  const [paper, setPaper] = useState<PaperChoice>('auto')
  const [printScale, setPrintScale] = useState<PrintScaleChoice>('auto')
  const [isPreparingPdf, setIsPreparingPdf] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [mapKey, setMapKey] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<SymbolCorrections>(new Map())
  const [editMessage, setEditMessage] = useState<string | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const paceSecondsPerKm = parsePace(paceText)
  const winnerPace = paceSecondsPerKm ?? parsePace(DEFAULT_WINNER_PACE)!
  const winnerPaceRef = useRef(winnerPace)
  winnerPaceRef.current = winnerPace

  async function openFile(file: File) {
    setState({ status: 'loading', fileName: file.name })
    setEngineState('loading')
    setCostMap(null)
    setSites(null)
    setCourse(null)
    setSelectedLeg(null)
    setPlannedLeg(null)
    setCompetitionCentre(null)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const key = await mapKeyOf(bytes)
    const storedCorrections = loadCorrections(key)
    setMapKey(key)
    setCorrections(storedCorrections)
    engine
      .loadMap(bytes, storedCorrections)
      .then(() => setEngineState('ready'))
      .catch(() => setEngineState('error'))
    try {
      const t0 = performance.now()
      const map = await loadOcadMap(bytes)
      const image = await rasterizeSvg(map.renderSvg(document), map.info.extent)
      setState({ status: 'ready', fileName: file.name, map, image, ms: performance.now() - t0 })
    } catch (e) {
      setState({ status: 'error', message: errorMessage(e) })
    }
  }

  useEffect(() => {
    const ends = plannedLeg && plannedEnds(plannedLeg)
    if (engineState !== 'ready' || !ends) return
    const queue = plannedLegQueue.current
    queue.next = ends
    if (queue.isBusy) return
    const evaluateNext = () => {
      const next = queue.next
      queue.next = null
      queue.isBusy = next !== null
      if (!next) return
      void engine.evaluateLeg(next[0], next[1], winnerPaceRef.current).then(leg => {
        setPlanRoutes(leg ? { status: 'evaluated', leg } : { status: 'unreachable' })
        evaluateNext()
      })
    }
    evaluateNext()
  }, [engine, engineState, plannedLeg, winnerPace])

  useEffect(() => {
    if (engineState !== 'ready' || !course || selectedLeg === null) return
    const ends = legEnds(course, selectedLeg)
    if (!ends) {
      setSelectedLeg(null)
      return
    }
    const request = ++latestLegRoutesRequest.current
    setLegRoutes({ status: 'finding' })
    void engine.evaluateLeg(ends[0], ends[1], winnerPace).then(leg => {
      if (request !== latestLegRoutesRequest.current) return
      setLegRoutes(leg ? { status: 'evaluated', leg } : { status: 'unreachable' })
    })
  }, [engine, engineState, course, selectedLeg, winnerPace])

  useEffect(() => {
    if (!showCostMap || costMap || engineState !== 'ready') return
    void engine.costGrid().then(renderCostMap).then(setCostMap)
  }, [engine, engineState, showCostMap, costMap])

  useEffect(() => {
    if (!showSites || sites || engineState !== 'ready') return
    void engine.controlSites().then(setSites)
  }, [engine, engineState, showSites, sites])

  async function generateCourse(
    nextRequest: CourseRequest,
    nextSeed: number,
    pace: number | null,
  ): Promise<Course | null> {
    if (!competitionCentre || pace === null) return null
    setRequest(nextRequest)
    setSeed(nextSeed)
    setIsGenerating(true)
    setPlannedLeg(null)
    setSelectedLeg(null)
    try {
      const result = await engine.generateCourse(
        nextRequest,
        competitionCentre,
        nextSeed,
        pace,
        paper,
        printScale,
        progressCallback<Course>(setCourse),
      )
      setCourse(result)
      return result
    } finally {
      setIsGenerating(false)
    }
  }

  function generateFromChat(nextRequest: CourseRequest, options: GenerateOptions) {
    const pace = options.winnerPaceSecondsPerKm ?? paceSecondsPerKm
    if (options.winnerPaceSecondsPerKm !== undefined)
      setPaceText(formatDuration(options.winnerPaceSecondsPerKm))
    return generateCourse(nextRequest, options.option ?? seed, pace)
  }

  const latestWorkspace = useRef<CourseWorkspace | null>(null)
  latestWorkspace.current = {
    status: () => ({
      mapLoaded: state.status === 'ready' && engineState === 'ready',
      mapScale: state.status === 'ready' ? state.map.info.scale : null,
      hasCompetitionCentre: competitionCentre !== null,
      request,
      winnerPaceSecondsPerKm: paceSecondsPerKm,
      course,
    }),
    generateCourse: generateFromChat,
    replaceControl: async (current, controlNumber, preference) => {
      const edited = await engine.fixControl(current, controlNumber, preference)
      if (edited) setCourse(edited)
      return edited
    },
    mapSymbols: () =>
      state.status === 'ready'
        ? state.map.symbols().map(symbol => ({
            symbol: formatOcadSymbolNumber(symbol.number),
            name: symbol.name,
            objects: symbol.objectCount,
            isomCode: corrections.has(symbol.number)
              ? corrections.get(symbol.number)!
              : isomCodeForOcadSymbol(symbol.number),
            corrected: corrections.has(symbol.number),
          }))
        : [],
    correctSymbol: async (label, isomCode) => {
      if (state.status !== 'ready') return
      const symbol = state.map.symbols().find(s => formatOcadSymbolNumber(s.number) === label)
      if (symbol) await correctSymbol(symbol.number, isomCode)
    },
  }
  const [chatTools] = useState(() =>
    createCourseTools({
      status: () => latestWorkspace.current!.status(),
      generateCourse: (nextRequest, options) =>
        latestWorkspace.current!.generateCourse(nextRequest, options),
      replaceControl: (current, controlNumber, preference) =>
        latestWorkspace.current!.replaceControl(current, controlNumber, preference),
      mapSymbols: () => latestWorkspace.current!.mapSymbols(),
      correctSymbol: (symbol, isomCode) => latestWorkspace.current!.correctSymbol(symbol, isomCode),
    }),
  )

  async function editCourse(edit: (current: Course) => Promise<Course | null>, refused: string) {
    if (!course || isEditing) return
    setIsEditing(true)
    setEditMessage(null)
    const before = course
    try {
      const edited = await edit(before)
      setCourse(edited ?? { ...before })
      if (!edited) setEditMessage(refused)
    } catch (e) {
      setCourse({ ...before })
      setEditMessage(errorMessage(e))
    } finally {
      setIsEditing(false)
    }
  }

  async function correctSymbol(symbolNumber: number, isomCode: IsomCode | null | undefined) {
    const next = new Map(corrections)
    if (isomCode === undefined) next.delete(symbolNumber)
    else next.set(symbolNumber, isomCode)
    setCorrections(next)
    if (mapKey) saveCorrections(mapKey, next)
    setEngineState('loading')
    setCourse(null)
    setCostMap(null)
    setSites(null)
    try {
      await engine.applySymbolCorrections(next)
      setEngineState('ready')
    } catch {
      setEngineState('error')
    }
  }

  function startPlanningLeg() {
    setSelectedLeg(null)
    setPlanRoutes({ status: 'finding' })
    setPlannedLeg(EMPTY_PLANNED_LEG)
  }

  function selectLeg(leg: number | null) {
    setPlannedLeg(null)
    setSelectedLeg(leg)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void openFile(file)
  }

  const georef = state.status === 'ready' ? state.map.info.georef : null
  const mapInfo = state.status === 'ready' ? state.map.info : null
  const descriptionBox = useMemo(
    () => (course && mapInfo ? descriptionBoxFor(course, request, mapInfo) : null),
    [course, request, mapInfo],
  )

  return (
    <div className="workspace" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <main>
        {state.status === 'ready' ? (
          <MapView
            info={state.map.info}
            image={state.image}
            routes={
              selectedLeg !== null
                ? legRoutes.status === 'evaluated'
                  ? legRoutes.leg
                  : null
                : plannedLeg && plannedEnds(plannedLeg) && planRoutes.status === 'evaluated'
                  ? planRoutes.leg
                  : null
            }
            selectedLeg={selectedLeg}
            onLegSelected={selectLeg}
            costMap={showCostMap ? costMap : null}
            sites={showSites ? sites : null}
            course={course}
            descriptionBox={descriptionBox}
            competitionCentre={competitionCentre}
            isPickingCentre={isPickingCentre}
            plannedLeg={plannedLeg}
            onPlannedLegChanged={setPlannedLeg}
            onCentrePicked={centre => {
              setCompetitionCentre(centre)
              setIsPickingCentre(false)
            }}
            canEditCourse={course !== null && !isGenerating && !isEditing}
            onStopMoved={(stopIndex, to) =>
              void editCourse(
                current => engine.moveControl(current, stopIndex, to),
                'No control site within 60 m of that spot, so the control stayed where it was.',
              )
            }
          />
        ) : (
          <div className="drop">
            {state.status === 'loading'
              ? `Loading ${state.fileName}…`
              : 'Drop an OCAD map (.ocd) here'}
          </div>
        )}
      </main>

      <aside>
        <h1>Ratamestari</h1>
        {course && selectedLeg !== null && (
          <LegRoutesPanel
            course={course}
            leg={selectedLeg}
            routes={legRoutes}
            onSelectLeg={selectLeg}
          />
        )}
        {plannedLeg && (
          <PlanLegPanel plan={plannedLeg} routes={planRoutes} onDone={() => setPlannedLeg(null)} />
        )}
        <label className="file">
          Open map
          <input
            type="file"
            accept=".ocd"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) void openFile(file)
            }}
          />
        </label>
        <p className="note">Your map stays on this computer.</p>

        {state.status === 'error' && <p className="error">{state.message}</p>}

        {state.status === 'ready' && (
          <dl>
            <dt>File</dt>
            <dd>{state.fileName}</dd>
            <dt>Scale</dt>
            <dd>1:{state.map.info.scale}</dd>
            <dt>Objects</dt>
            <dd>{state.map.objectCount}</dd>
            <dt>Coordinate system</dt>
            <dd>{georef ? `EPSG:${georef.epsg}` : 'none'}</dd>
            <dt>Image</dt>
            <dd>
              {state.image.width} × {state.image.height} px, loaded in {Math.round(state.ms)} ms
            </dd>
            {state.map.backgroundMapPaths.length > 0 && (
              <>
                <dt>Background maps</dt>
                <dd>{state.map.backgroundMapPaths.join(', ')}</dd>
              </>
            )}
          </dl>
        )}

        <ChatPanel tools={chatTools} />

        {state.status === 'ready' && (
          <CoursePanel
            request={request}
            onRequestChange={setRequest}
            hasCentre={competitionCentre !== null}
            isPickingCentre={isPickingCentre}
            onPickCentre={() => setIsPickingCentre(true)}
            canGenerate={
              engineState === 'ready' &&
              competitionCentre !== null &&
              paceSecondsPerKm !== null &&
              !isGenerating
            }
            paceText={paceText}
            onPaceTextChange={setPaceText}
            isPaceValid={paceSecondsPerKm !== null}
            isGenerating={isGenerating}
            seed={seed}
            onGenerate={nextSeed => void generateCourse(request, nextSeed, paceSecondsPerKm)}
            course={course}
            descriptionBox={descriptionBox}
            paper={paper}
            onPaperChange={setPaper}
            printScale={printScale}
            onPrintScaleChange={setPrintScale}
            isPreparingPdf={isPreparingPdf}
            isEditing={isEditing || isGenerating}
            onFixControl={controlNumber =>
              void editCourse(
                current => engine.fixControl(current, controlNumber),
                'The control could not be fixed.',
              )
            }
            onPrintPdf={() => {
              if (!course || !descriptionBox || state.status !== 'ready') return
              setIsPreparingPdf(true)
              setPrintError(null)
              savePrintPdf(
                state.map,
                course,
                descriptionBox.sheet,
                `${courseNameOf(request)}-${request.format}.pdf`,
              )
                .catch(e => setPrintError(errorMessage(e)))
                .finally(() => setIsPreparingPdf(false))
            }}
            onExportXml={() => {
              if (course && descriptionBox && mapInfo) {
                downloadCourseXml(course, descriptionBox.sheet, request, mapInfo)
              }
            }}
          />
        )}

        {course && selectedLeg === null && <p className="note">{messages.leg.selectHint}</p>}

        {editMessage && <p className="error">{editMessage}</p>}
        {printError && <p className="error">The PDF could not be made: {printError}</p>}

        {state.status === 'ready' && (
          <section>
            {plannedLeg === null && (
              <button type="button" disabled={engineState !== 'ready'} onClick={startPlanningLeg}>
                {messages.planLeg.open}
              </button>
            )}
            {engineState === 'loading' && <p className="note">Building the cost map…</p>}
            {engineState === 'error' && (
              <p className="error">The engine could not read this map.</p>
            )}
            <label className="toggle">
              <input
                type="checkbox"
                checked={showCostMap}
                onChange={e => setShowCostMap(e.target.checked)}
              />{' '}
              Show cost map
            </label>
            {showCostMap && (
              <p className="note">
                Blue: fast (paths, open land). Clear: normal forest. Orange: slow, darker is slower.
                Red: impassable or out of bounds.
              </p>
            )}
          </section>
        )}

        {state.status === 'ready' && (
          <SymbolPanel
            symbols={state.map.symbols()}
            corrections={corrections}
            isApplying={engineState === 'loading'}
            onCorrect={(symbolNumber, isomCode) => void correctSymbol(symbolNumber, isomCode)}
          />
        )}

        {state.status === 'ready' && (
          <section>
            <h2>Candidate control sites</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showSites}
                onChange={e => setShowSites(e.target.checked)}
              />{' '}
              Show candidate control sites
            </label>
            {showSites && sites && (
              <p className="note">
                {sites.length} sites. Difficulty:{' '}
                {Object.entries(DIFFICULTY_COLOURS).map(([difficulty, colour]) => (
                  <span key={difficulty} className="legend-dot" style={{ background: colour }}>
                    {difficulty}
                  </span>
                ))}{' '}
                (1 easy, 5 hard)
              </p>
            )}
          </section>
        )}

        <footer>
          <a href={SOURCE_CODE_URL} target="_blank" rel="noreferrer">
            Source code
          </a>{' '}
          · AGPL-3.0-or-later · OCAD reading by{' '}
          <a href="https://github.com/perliedman/ocad2geojson" target="_blank" rel="noreferrer">
            ocad2geojson
          </a>
        </footer>
      </aside>
    </div>
  )
}
