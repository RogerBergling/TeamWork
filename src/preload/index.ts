import { contextBridge, ipcRenderer } from 'electron'
import type { TeamWorkApi } from '../shared/types'

const api: TeamWorkApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getViewStatuses: () => ipcRenderer.invoke('view:statuses'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  chooseLogo: () => ipcRenderer.invoke('settings:choose-logo'),
  getLogoDataUrl: (path) => ipcRenderer.invoke('settings:logo-data', path),
  openConfigFile: () => ipcRenderer.invoke('settings:open-config'),
  readLogs: (lines) => ipcRenderer.invoke('logs:read', lines),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  openLogFolder: () => ipcRenderer.invoke('logs:open'),
  restartApp: () => ipcRenderer.invoke('app:restart'),
  activateView: (view) => ipcRenderer.send('view:activate', view),
  setViewBounds: (bounds) => ipcRenderer.send('view:bounds', bounds),
  reloadView: (view) => ipcRenderer.send('view:reload', view),
  openViewInBrowser: (view) => ipcRenderer.send('view:open-external', view),
  clearSession: (view) => ipcRenderer.invoke('view:clear-session', view),
  selectScreenShare: (id, sourceId) =>
    ipcRenderer.send('screenshare:select', id, sourceId),
  getWindowState: () => ipcRenderer.invoke('app:window-state'),
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  onViewStatus: (callback) => {
    ipcRenderer.on('view:status', (_event, status) => callback(status))
  },
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings:changed', (_event, snapshot) => callback(snapshot))
  },
  onScreenShareRequest: (callback) => {
    ipcRenderer.on('screenshare:request', (_event, request) => callback(request))
  },
  onScreenShareCancelled: (callback) => {
    ipcRenderer.on('screenshare:cancelled', (_event, id) => callback(id))
  },
  onCommand: (callback) => {
    ipcRenderer.on('app:command', (_event, command) => callback(command))
  },
  onWindowState: (callback) => {
    ipcRenderer.on('window:state', (_event, state) => callback(state))
  }
}

contextBridge.exposeInMainWorld('teamwork', api)
