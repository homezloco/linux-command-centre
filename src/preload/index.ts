import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { ElectronAPI } from '../shared/electron-api'

// contextIsolation already stops the renderer from reaching ipcRenderer
// directly, but without this the renderer could still ask this bridge to
// invoke any channel string it likes. Restricting to the fixed set of
// channels the main process actually registers (see
// src/shared/ipc-channels.ts) means a compromised renderer can't use this
// bridge to reach anything beyond what the app's own UI already can.
const ALLOWED_CHANNELS = new Set<string>(IPC_CHANNELS)

// Expose typed API to renderer — this is the only bridge between sandboxed
// renderer and main process. All hardware access goes through here.
const api: ElectronAPI = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel "${channel}" is not allowed`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  onUpdatesProgress: (callback: (output: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, output: string): void => callback(output)
    ipcRenderer.on('updates:progress', listener)
    return () => ipcRenderer.removeListener('updates:progress', listener)
  },
  onSecurityProgress: (callback: (output: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, output: string): void => callback(output)
    ipcRenderer.on('security:progress', listener)
    return () => ipcRenderer.removeListener('security:progress', listener)
  },
  streamPort: 52341
}
contextBridge.exposeInMainWorld('electronAPI', api)
