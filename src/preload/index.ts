import { contextBridge, ipcRenderer } from 'electron'

// Expose typed API to renderer — this is the only bridge between sandboxed
// renderer and main process. All hardware access goes through here.
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  streamPort: 52341
})
