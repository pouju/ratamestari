import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const emptyModule = fileURLToPath(new URL('./src/shims/empty.ts', import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  resolve: {
    alias: {
      fs: emptyModule,
      buffer: require.resolve('buffer/'),
      string_decoder: require.resolve('string_decoder/'),
    },
  },
})
