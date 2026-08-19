import { contextBridge, ipcRenderer } from 'electron'

// Expose typed API to renderer — this is the only bridge between sandboxed
// renderer and main process. All hardware access goes through here.
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  onUpdatesProgress: (callback: (output: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, output: string): void => callback(output)
    ipcRenderer.on('updates:progress', listener)
    return () => ipcRenderer.removeListener('updates:progress', listener)
  },
  streamPort: 52341
})
