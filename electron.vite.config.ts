import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    /**
     * Baked in at build time from the environment, so credentials live in the
     * build machine's shell rather than in the repository.
     *
     *   $env:ORBIT_MSA_CLIENT_ID = "..."
     *   $env:ORBIT_CURSEFORGE_API_KEY = "..."
     *   npm run dist
     *
     * Both default to empty, in which case Orbit falls back to asking the user
     * for their own values in Settings.
     */
    define: {
      __ORBIT_MSA_CLIENT_ID__: JSON.stringify(process.env.ORBIT_MSA_CLIENT_ID ?? ''),
      __ORBIT_CURSEFORGE_API_KEY__: JSON.stringify(process.env.ORBIT_CURSEFORGE_API_KEY ?? '')
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      },
      chunkSizeWarningLimit: 2000
    }
  }
})
