import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Use the shared game engine straight from its TypeScript source; Vite compiles it
      '@checkline/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
    },
  },
})
