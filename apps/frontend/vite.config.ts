import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const isVitest = Boolean(process.env.VITEST)

function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('react-force-graph-3d') || id.includes('3d-force-graph') || id.includes('three')) {
    return 'vendor-3d-graph'
  }
  if (id.includes('pixi.js')) return 'vendor-pixi'
  if (id.includes('@xyflow/react') || id.includes('reactflow')) return 'vendor-flow'
  if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n'
  if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react'
  if (id.includes('d3-') || id.includes('d3/')) return 'vendor-d3'
  if (id.includes('three/examples') || id.includes('postprocessing')) return 'vendor-3d-extras'

  return undefined
}

export default defineConfig({
  plugins: isVitest ? [] : [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
  build: {
    target: 'ES2020',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})

