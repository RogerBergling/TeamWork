import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = { '@shared': resolve('src/shared') }

function resolveBuildTimestamp(): string {
  if (process.env.BUILD_TIMESTAMP?.trim()) return process.env.BUILD_TIMESTAMP.trim()
  if (process.env.SOURCE_DATE_EPOCH?.trim()) {
    const seconds = Number(process.env.SOURCE_DATE_EPOCH)
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString()
  }
  return new Date().toISOString()
}

const buildTimestamp = resolveBuildTimestamp()
const buildNumber =
  process.env.BUILD_NUMBER?.trim() ||
  buildTimestamp.replace(/\D/g, '').slice(0, 12) ||
  'dev'
const buildDefines = {
  __BUILD_NUMBER__: JSON.stringify(buildNumber),
  __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp)
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    define: buildDefines
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer')
      }
    }
  }
})
