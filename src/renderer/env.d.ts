/// <reference types="vite/client" />

import type { TeamWorkApi } from '@shared/types'

declare global {
  interface Window {
    teamwork: TeamWorkApi
  }
}

export {}
