// Shape of the bridge exposed on window.electronAPI by src/preload/index.ts.
// Renderer code reads it via the Window declaration in
// src/renderer/src/electron-api.d.ts; the preload annotates its exported
// object with this type so the two sides can't drift apart silently.
export interface ElectronAPI {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  onUpdatesProgress: (callback: (output: string) => void) => () => void
  onSecurityProgress: (callback: (output: string) => void) => () => void
  streamPort: number
}
