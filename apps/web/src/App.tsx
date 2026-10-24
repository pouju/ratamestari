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
import { useAssistantKey } from './assistant-key'
import { SettingsSheet } from './SettingsSheet'
import { MapStart, PanelHeader, PanelLine } from './WorkspaceStart'
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
import { useFormat, useMessages } from './i18n'
import { MapView } from './MapView'
import { LayersMenu, PlanLegTool, PrintLabel } from './MapTools'
import { rasterizeSvg, type MapImage } from './rasterize'
import { OCAD2GEOJSON_URL, SOURCE_CODE_URL } from './config'

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
  const format = useFormat()
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const assistantKey = useAssistantKey()
  const fileInput = useRef<HTMLInputElement>(null)
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
    setEditMessage(null)
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
      if (!result) setEditMessage(messages.course.noCourse)
      return result
    } catch (e) {
      setEditMessage(messages.course.generationFailed(errorMessage(e)))
      return null
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

  function changePrint(nextPaper: PaperChoice, nextScale: PrintScaleChoice) {
    setPaper(nextPaper)
    setPrintScale(nextScale)
    if (course)
      void editCourse(
        current => engine.refitToPaper(current, nextPaper, nextScale),
        messages.print.refitFailed,
      )
  }

  function selectLeg(leg: number | null) {
    setPlannedLeg(null)
    setSelectedLeg(leg)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setIsDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void openFile(file)
  }

  const chooseMapFile = () => fileInput.current?.click()

  const georef = state.status === 'ready' ? state.map.info.georef : null
  const mapInfo = state.status === 'ready' ? state.map.info : null
  const isChoosingCentre =
    plannedLeg === null &&
    (isPickingCentre || (state.status === 'ready' && competitionCentre === null))

  const descriptionBox = useMemo(
    () => (course && mapInfo ? descriptionBoxFor(course, request, mapInfo) : null),
    [course, request, mapInfo],
  )

  return (
    <div
      className="workspace"
      onDragOver={e => {
        e.preventDefault()
        if (!isDraggingOver) setIsDraggingOver(true)
      }}
      onDragLeave={e => {
        if (e.relatedTarget === null) setIsDraggingOver(false)
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileInput}
        type="file"
        accept=".ocd"
        hidden
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void openFile(file)
        }}
      />
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
            isPickingCentre={isChoosingCentre}
            plannedLeg={plannedLeg}
            onPlannedLegChanged={setPlannedLeg}
            onCentrePicked={centre => {
              setCompetitionCentre(centre)
              setIsPickingCentre(false)
            }}
            canEditCourse={course !== null && !isGenerating && !isEditing}
            tools={
              <>
                <LayersMenu
                  showCostMap={showCostMap}
                  onShowCostMap={setShowCostMap}
                  showSites={showSites}
                  onShowSites={setShowSites}
                  siteCount={sites?.length ?? null}
                />
                <PlanLegTool
                  isActive={plannedLeg !== null}
                  isDisabled={engineState !== 'ready'}
                  onToggle={() => (plannedLeg ? setPlannedLeg(null) : startPlanningLeg())}
                />
              </>
            }
            footer={
              <PrintLabel
                course={course}
                format={request.format}
                paper={paper}
                printScale={printScale}
                isDisabled={isGenerating || isEditing}
                onPaperChange={next => changePrint(next, printScale)}
                onPrintScaleChange={next => changePrint(paper, next)}
              />
            }
            onStopMoved={(stopIndex, to) =>
              void editCourse(
                current => engine.moveControl(current, stopIndex, to),
                messages.course.moveRefused,
              )
            }
          />
        ) : (
          <MapStart opening={state} isDraggingOver={isDraggingOver} onChooseFile={chooseMapFile} />
        )}
      </main>

      <aside>
        <PanelHeader onOpenSettings={() => setIsSettingsOpen(true)} />
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
        <PanelLine
          label={messages.workspace.mapLine}
          value={
            state.status === 'ready'
              ? messages.workspace.mapValue(state.fileName, format.scale(state.map.info.scale))
              : state.status === 'loading'
                ? messages.workspace.openingLine(state.fileName)
                : messages.workspace.noMap
          }
          action={
            state.status === 'ready'
              ? { label: messages.workspace.changeMap, onClick: chooseMapFile }
              : undefined
          }
        />
        {engineState === 'loading' && <p className="note">{messages.map.building}</p>}
        {engineState === 'error' && <p className="error">{messages.map.engineError}</p>}
        {state.status !== 'ready' && (
          <>
            <PanelLine
              label={messages.workspace.centreLine}
              value={messages.workspace.afterMap}
              isPending
            />
            <PanelLine
              label={messages.workspace.courseLine}
              value={messages.workspace.afterCentre}
              isPending
            />
          </>
        )}

        {assistantKey.apiKey && <ChatPanel apiKey={assistantKey.apiKey} tools={chatTools} />}

        {state.status === 'ready' && (
          <CoursePanel
            request={request}
            onRequestChange={setRequest}
            hasCentre={competitionCentre !== null}
            isPickingCentre={isChoosingCentre}
            onMoveCentre={() => setIsPickingCentre(true)}
            canSetCourse={
              engineState === 'ready' &&
              competitionCentre !== null &&
              paceSecondsPerKm !== null &&
              !isGenerating
            }
            isGenerating={isGenerating}
            onSetCourse={() => void generateCourse(request, seed, paceSecondsPerKm)}
            onTryAnother={() => void generateCourse(request, seed + 1, paceSecondsPerKm)}
            course={course}
            isEditing={isEditing || isGenerating}
            isPreparingPdf={isPreparingPdf}
            onFixControl={controlNumber =>
              void editCourse(
                current => engine.fixControl(current, controlNumber),
                messages.course.fixRefused,
              )
            }
            onDownloadPdf={() => {
              if (!course || !descriptionBox || state.status !== 'ready') return
              setIsPreparingPdf(true)
              setPrintError(null)
              const { map } = state
              engine
                .peripheralInformation()
                .then(peripheral => {
                  const contours = peripheral.contourIntervalMetres
                  const scaleLine = messages.print.scaleLine(
                    format.scale(course.printArea?.scale ?? map.info.scale),
                    contours === null ? null : format.metres(contours),
                  )
                  return savePrintPdf(
                    map,
                    course,
                    descriptionBox.sheet,
                    `${courseNameOf(request)}-${request.format}.pdf`,
                    peripheral,
                    scaleLine,
                  )
                })
                .catch(e => setPrintError(errorMessage(e)))
                .finally(() => setIsPreparingPdf(false))
            }}
            onDownloadXml={() => {
              if (course && descriptionBox && mapInfo) {
                downloadCourseXml(course, descriptionBox.sheet, request, mapInfo)
              }
            }}
          />
        )}

        {course && selectedLeg === null && <p className="note">{messages.leg.selectHint}</p>}

        {editMessage && <p className="error">{editMessage}</p>}
        {printError && <p className="error">{messages.course.pdfFailed(printError)}</p>}

        {paceSecondsPerKm === null && (
          <p className="error">
            {messages.settings.paceInvalid}{' '}
            <button type="button" className="link" onClick={() => setIsSettingsOpen(true)}>
              {messages.workspace.settings}
            </button>
          </p>
        )}

        <footer className="panel-footer">
          <a href={SOURCE_CODE_URL} target="_blank" rel="noreferrer">
            {messages.workspace.sourceCode}
          </a>
          <span>{messages.workspace.licence}</span>
          <span>
            {messages.workspace.ocadReading}{' '}
            <a href={OCAD2GEOJSON_URL} target="_blank" rel="noreferrer">
              ocad2geojson
            </a>
          </span>
        </footer>
      </aside>

      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        assistantKey={assistantKey}
        paceText={paceText}
        onPaceTextChange={setPaceText}
        isPaceValid={paceSecondsPerKm !== null}
        map={
          state.status === 'ready' && (
            <section className="settings-section" aria-labelledby="settings-map">
              <h3 id="settings-map">{messages.settings.map}</h3>
              <dl className="settings-facts">
                <div>
                  <dt>{messages.settings.fileName}</dt>
                  <dd>{state.fileName}</dd>
                </div>
                <div>
                  <dt>{messages.settings.scale}</dt>
                  <dd>{format.scale(state.map.info.scale)}</dd>
                </div>
                <div>
                  <dt>{messages.settings.objects}</dt>
                  <dd>{state.map.objectCount}</dd>
                </div>
                <div>
                  <dt>{messages.settings.coordinateSystem}</dt>
                  <dd>{georef ? `EPSG:${georef.epsg}` : messages.settings.noCoordinateSystem}</dd>
                </div>
                <div>
                  <dt>{messages.settings.image}</dt>
                  <dd>
                    {messages.settings.imageValue(
                      state.image.width,
                      state.image.height,
                      Math.round(state.ms),
                    )}
                  </dd>
                </div>
                {state.map.backgroundMapPaths.length > 0 && (
                  <div>
                    <dt>{messages.settings.backgroundMaps}</dt>
                    <dd>{state.map.backgroundMapPaths.join(', ')}</dd>
                  </div>
                )}
              </dl>
              <SymbolPanel
                symbols={state.map.symbols()}
                corrections={corrections}
                isApplying={engineState === 'loading'}
                onCorrect={(symbolNumber, isomCode) => void correctSymbol(symbolNumber, isomCode)}
              />
            </section>
          )
        }
      />
    </div>
  )
}
