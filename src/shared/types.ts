export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export type ManagedView = 'element' | 'jitsi'
export type ShellView = ManagedView | 'settings' | 'logs'

export type ViewState = 'unconfigured' | 'loading' | 'ready' | 'error'

export interface ViewStatus {
  view: ManagedView
  state: ViewState
  message?: string
  code?: number
  url?: string
}

export interface ScreenShareSource {
  id: string
  name: string
  thumbnail: string
  displayId?: string
}

export interface ScreenShareRequest {
  id: number
  view: ManagedView
  sources: ScreenShareSource[]
  audioRequested: boolean
  error?: string
}

export interface SettingsMeta {
  configPath: string
  logPath: string
  appVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  platform: string
  sessionType: string
  isWayland: boolean
  loadError?: string
}

export interface SettingsSnapshot {
  settings: import('./settings').Settings
  meta: SettingsMeta
}

export interface SaveResult {
  ok: boolean
  settings?: import('./settings').Settings
  errors?: import('./settings').SettingsFieldError[]
  message?: string
}

export interface LogSnapshot {
  path: string
  lines: string[]
  size: number
}

export interface WindowState {
  maximized: boolean
  fullScreen: boolean
}

export type AppCommand =
  | 'settings'
  | 'logs'
  | 'element'
  | 'jitsi'
  | 'reload'
  | 'toggle-debug'
  | 'join-meeting'

export interface JoinMeetingResult {
  ok: boolean
  error?: string
  url?: string
}

export interface ImportExportResult {
  ok: boolean
  path?: string
  message?: string
  settings?: import('./settings').Settings
  errors?: import('./settings').SettingsFieldError[]
}

export interface TeamWorkApi {
  getSettings(): Promise<SettingsSnapshot>
  getViewStatuses(): Promise<ViewStatus[]>
  saveSettings(settings: unknown): Promise<SaveResult>
  resetSettings(): Promise<SaveResult>
  exportSettings(): Promise<ImportExportResult>
  importSettings(): Promise<ImportExportResult>
  chooseLogo(): Promise<string | null>
  getLogoDataUrl(path: string): Promise<string | null>
  openConfigFile(): Promise<void>
  readLogs(lines?: number): Promise<LogSnapshot>
  clearLogs(): Promise<void>
  openLogFolder(): Promise<void>
  restartApp(): Promise<void>
  activateView(view: ShellView): void
  setViewBounds(bounds: ViewBounds): void
  suspendViews(): void
  resumeViews(): void
  reloadView(view: ManagedView): void
  openViewInBrowser(view: ManagedView): void
  clearSession(view: ManagedView): Promise<void>
  joinJitsiMeeting(input: string): Promise<JoinMeetingResult>
  rendererReady(): void
  selectScreenShare(id: number, sourceId: string | null): void
  getWindowState(): Promise<WindowState>
  windowMinimize(): void
  windowMaximize(): void
  windowClose(): void
  onViewStatus(callback: (status: ViewStatus) => void): void
  onSettingsChanged(callback: (snapshot: SettingsSnapshot) => void): void
  onScreenShareRequest(callback: (request: ScreenShareRequest) => void): void
  onScreenShareCancelled(callback: (id: number) => void): void
  onCommand(callback: (command: AppCommand) => void): void
  onWindowState(callback: (state: WindowState) => void): void
}
