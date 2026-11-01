// These constants are replaced by electron.vite.config.ts at build time.
// The typeof guards keep this module safe in Vitest and development tooling.
declare const __BUILD_NUMBER__: string
declare const __BUILD_TIMESTAMP__: string

export const BUILD_NUMBER =
  typeof __BUILD_NUMBER__ !== 'undefined' && __BUILD_NUMBER__
    ? __BUILD_NUMBER__
    : 'dev'

export const BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== 'undefined' && __BUILD_TIMESTAMP__
    ? __BUILD_TIMESTAMP__
    : new Date().toISOString()
