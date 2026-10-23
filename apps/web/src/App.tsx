import { useState, type DragEvent } from 'react'
import { localToProjected, type LocalPoint } from '@ratamestari/core'
import { loadOcadMap, type OcadMap } from '@ratamestari/map-ocad'
import { MapView } from './MapView'
import { rasterizeSvg, type MapImage } from './rasterize'
import { SOURCE_CODE_URL } from './config'

type LoadState =
  | { status: 'empty' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; fileName: string; map: OcadMap; image: MapImage; ms: number }

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'empty' })
  const [control, setControl] = useState<LocalPoint | null>(null)

  async function openFile(file: File) {
    setState({ status: 'loading', fileName: file.name })
    try {
      const t0 = performance.now()
      const map = await loadOcadMap(new Uint8Array(await file.arrayBuffer()))
      const image = await rasterizeSvg(map.renderSvg(document), map.info.extent)
      setState({ status: 'ready', fileName: file.name, map, image, ms: performance.now() - t0 })
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

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
          <MapView info={state.map.info} image={state.image} onControlMoved={setControl} />
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
            {control && (
              <>
                <dt>Test control (map frame)</dt>
                <dd>
                  {control[0].toFixed(1)}, {control[1].toFixed(1)} m
                </dd>
                {georef && (
                  <>
                    <dt>Test control (EPSG:{georef.epsg})</dt>
                    <dd>
                      {localToProjected(control, georef)
                        .map(v => v.toFixed(1))
                        .join(', ')}
                    </dd>
                  </>
                )}
              </>
            )}
          </dl>
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
