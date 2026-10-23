import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { LocalPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, Course, LegEvaluation } from '@ratamestari/engine'
import type { CourseRequest } from '@ratamestari/rules'
import { createCourseTools, type CourseWorkspace, type GenerateOptions } from '@ratamestari/agent'
import { loadOcadMap, type OcadMap } from '@ratamestari/map-ocad'
import { renderCostMap, type CostMapImage } from './cost-map-image'
import { ChatPanel } from './ChatPanel'
import { CoursePanel } from './CoursePanel'
import { createEngine, progressCallback } from './engine'
import { formatDuration, parsePace } from './format'
import { LegDetails } from './LegDetails'
import { DIFFICULTY_COLOURS, MapView, type ControlPair } from './MapView'
import { rasterizeSvg, type MapImage } from './rasterize'
import { SOURCE_CODE_URL } from './config'

type LoadState =
  | { status: 'empty' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; fileName: string; map: OcadMap; image: MapImage; ms: number }

type EngineState = 'idle' | 'loading' | 'ready' | 'error'

type LegState =
  { status: 'none' } | { status: 'evaluated'; leg: LegEvaluation } | { status: 'unreachable' }

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
  const [controls, setControls] = useState<ControlPair | null>(null)
  const [legState, setLegState] = useState<LegState>({ status: 'none' })
  const latestLegRequest = useRef(0)
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
  const [showLegTool, setShowLegTool] = useState(true)
  const [paceText, setPaceText] = useState(DEFAULT_WINNER_PACE)
  const paceSecondsPerKm = parsePace(paceText)

  async function openFile(file: File) {
    setState({ status: 'loading', fileName: file.name })
    setEngineState('loading')
    setLegState({ status: 'none' })
    setCostMap(null)
    setSites(null)
    setCourse(null)
    setCompetitionCentre(null)
    const bytes = new Uint8Array(await file.arrayBuffer())
    engine
      .loadMap(bytes)
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
    if (engineState !== 'ready' || !controls) return
    const request = ++latestLegRequest.current
    const [from, to] = controls
    void engine
      .evaluateLeg(from, to, paceSecondsPerKm ?? parsePace(DEFAULT_WINNER_PACE)!)
      .then(leg => {
        if (request !== latestLegRequest.current) return
        setLegState(leg ? { status: 'evaluated', leg } : { status: 'unreachable' })
      })
  }, [engine, engineState, controls, paceSecondsPerKm])

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
    setShowLegTool(false)
    try {
      const result = await engine.generateCourse(
        nextRequest,
        competitionCentre,
        nextSeed,
        pace,
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
  }
  const [chatTools] = useState(() =>
    createCourseTools({
      status: () => latestWorkspace.current!.status(),
      generateCourse: (nextRequest, options) =>
        latestWorkspace.current!.generateCourse(nextRequest, options),
    }),
  )

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void openFile(file)
  }

  const georef = state.status === 'ready' ? state.map.info.georef : null

  return (
    <div className="workspace" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <main>
        {state.status === 'ready' ? (
          <MapView
            info={state.map.info}
            image={state.image}
            leg={legState.status === 'evaluated' ? legState.leg : null}
            costMap={showCostMap ? costMap : null}
            sites={showSites ? sites : null}
            course={course}
            competitionCentre={competitionCentre}
            isPickingCentre={isPickingCentre}
            showLegTool={showLegTool}
            onCentrePicked={centre => {
              setCompetitionCentre(centre)
              setIsPickingCentre(false)
            }}
            onControlsMoved={setControls}
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
          />
        )}

        {state.status === 'ready' && (
          <section>
            <h2>Leg between the two controls</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showLegTool}
                onChange={e => setShowLegTool(e.target.checked)}
              />{' '}
              Show the leg measuring tool
            </label>
            {engineState === 'loading' && <p className="note">Building the cost map…</p>}
            {engineState === 'error' && (
              <p className="error">The engine could not read this map.</p>
            )}
            {engineState === 'ready' && legState.status === 'unreachable' && (
              <p className="error">No route: a control is in an impassable or forbidden area.</p>
            )}
            {engineState === 'ready' && legState.status === 'evaluated' && (
              <LegDetails leg={legState.leg} />
            )}
            <p className="note">Drag the purple circles to change the leg.</p>
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
