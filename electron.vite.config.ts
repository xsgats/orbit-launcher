import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/*
 * Build secrets live in a gitignored .env so they never enter the repo, only
 * the packaged artifact. Values are read raw — CurseForge keys contain '$'
 * and must not be shell-expanded or quote-stripped.
 */
function envFile(): Record<string, string> {
  try {
    const out: Record<string, string> = {}
    for (const line of readFileSync(resolve('.env'), 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const at = trimmed.indexOf('=')
      if (at === -1) continue
      out[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim()
    }
    return out
  } catch {
    return {}
  }
}

const fileEnv = envFile()
const secret = (name: string): string => process.env[name] || fileEnv[name] || ''

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },











    define: {
      __ORBIT_MSA_CLIENT_ID__: JSON.stringify(secret('ORBIT_MSA_CLIENT_ID')),
      __ORBIT_CURSEFORGE_API_KEY__: JSON.stringify(secret('ORBIT_CURSEFORGE_API_KEY'))
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
