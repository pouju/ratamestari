import * as Comlink from 'comlink'
import type { EngineApi } from './engine.worker'

export type Engine = Comlink.Remote<EngineApi>

export const createEngine = (): Engine =>
  Comlink.wrap<EngineApi>(
    new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' }),
  )
