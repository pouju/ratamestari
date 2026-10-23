import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Route } from '@ratamestari/engine'
import { loadOcadMap, type OcadMap } from '@ratamestari/map-ocad'
import { REFERENCE_PACE_SECONDS_PER_KM } from '@ratamestari/rules'
import { renderCostMap, type CostMapImage } from './cost-map-image'
import { createEngine } from './engine'
import { formatDuration, formatMeters } from './format'
import { MapView, type ControlPair } from './MapView'
import { rasterizeSvg, type MapImage } from './rasterize'
import { SOURCE_CODE_URL } from './config'

type LoadState =
  | { status: 'empty' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; fileName: string; map: OcadMap; image: MapImage; ms: number }

type EngineState = 'idle' | 'loading' | 'ready' | 'error'

type RouteState =
  | { status: 'none' }
  | { status: 'found'; route: Route; straightMeters: number }
  | { status: 'unreachable' }

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function App() {
  const [engine] = useState(createEngine)
  const [state, setState] = useState<LoadState>({ status: 'empty' })
  const [engineState, setEngineState] = useState<EngineState>('idle')
  const [controls, setControls] = useState<ControlPair | null>(null)
  const [routeState, setRouteState] = useState<RouteState>({ status: 'none' })
  const latestRouteRequest = useRef(0)
  const [showCostMap, setShowCostMap] = useState(false)
  const [costMap, setCostMap] = useState<CostMapImage | null>(null)

  async function openFile(file: File) {
    setState({ status: 'loading', fileName: file.name })
    setEngineState('loading')
    setRouteState({ status: 'none' })
    setCostMap(null)
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
    const request = ++latestRouteRequest.current
    const [from, to] = controls
    void engine.route(from, to).then(route => {
      if (request !== latestRouteRequest.current) return
      setRouteState(
        route
          ? { status: 'found', route, straightMeters: Math.hypot(to[0] - from[0], to[1] - from[1]) }
          : { status: 'unreachable' },
      )
    })
  }, [engine, engineState, controls])

  useEffect(() => {
    if (!showCostMap || costMap || engineState !== 'ready') return
    void engine.costGrid().then(renderCostMap).then(setCostMap)
  }, [engine, engineState, showCostMap, costMap])

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
            route={routeState.status === 'found' ? routeState.route : null}
            costMap={showCostMap ? costMap : null}
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

        {state.status === 'ready' && (
          <section>
            <h2>Leg between the two controls</h2>
            {engineState === 'loading' && <p className="note">Building the cost map…</p>}
            {engineState === 'error' && (
              <p className="error">The engine could not read this map.</p>
            )}
            {engineState === 'ready' && routeState.status === 'unreachable' && (
              <p className="error">No route: a control is in an impassable or forbidden area.</p>
            )}
            {engineState === 'ready' && routeState.status === 'found' && (
              <dl>
                <dt>Fastest route</dt>
                <dd>{formatMeters(routeState.route.lengthMeters)}</dd>
                <dt>Straight line</dt>
                <dd>{formatMeters(routeState.straightMeters)}</dd>
                <dt>Estimated time</dt>
                <dd>
                  {formatDuration(routeState.route.timeSeconds)} at{' '}
                  {formatDuration(REFERENCE_PACE_SECONDS_PER_KM.value)} min/km reference pace
                </dd>
              </dl>
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
