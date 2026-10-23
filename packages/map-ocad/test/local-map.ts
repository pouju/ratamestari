import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mapsFolder = fileURLToPath(new URL('../../../maps/', import.meta.url))

const findLocalMap = (): string | null => {
  const fromEnvironment = process.env['TEST_MAP']
  if (fromEnvironment) return fromEnvironment
  if (!existsSync(mapsFolder)) return null
  const firstMap = readdirSync(mapsFolder)
    .filter(name => name.toLowerCase().endsWith('.ocd'))
    .sort()[0]
  return firstMap ? join(mapsFolder, firstMap) : null
}

const localMapPath = findLocalMap()

export const localMapExists = localMapPath !== null

export const readLocalMap = (): Uint8Array => new Uint8Array(readFileSync(localMapPath!))
