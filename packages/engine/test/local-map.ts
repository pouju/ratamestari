import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const localMapPath = fileURLToPath(new URL('../../../maps/example.ocd', import.meta.url))

export const localMapExists = existsSync(localMapPath)

export const readLocalMap = (): Uint8Array => new Uint8Array(readFileSync(localMapPath))
