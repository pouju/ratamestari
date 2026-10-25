import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const page = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const emptyModule = page('./src/shims/empty.ts')
const { version } = require('../../package.json') as { version: string }

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      input: {
        landing: page('./index.html'),
        app: page('./app/index.html'),
        guides: page('./guides/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      fs: emptyModule,
      buffer: require.resolve('buffer/'),
      string_decoder: require.resolve('string_decoder/'),
    },
  },
})
