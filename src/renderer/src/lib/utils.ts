import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function overlayPortalTarget(): HTMLElement {
  return document.getElementById('lcc-overlay-root') ?? document.body
}

export function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke<T>(channel, ...args).catch((err) => {
    // Report every failed invoke into the app's own log so panel-level
    // "catch → toast → discard" doesn't erase the record. Bypasses this
    // wrapper (calls electronAPI.invoke directly) so a failure of the
    // app:log channel itself can't recurse.
    const msg = err instanceof Error ? err.message : String(err)
    void window.electronAPI.invoke('app:log', 'warn', 'ipc', `${channel} failed: ${msg}`).catch(() => {})
    throw err
  })
}

let errorCaptureInstalled = false

/** Forward uncaught renderer errors/rejections into the main-process log. */
export function installErrorCapture(): void {
  if (errorCaptureInstalled) return
  errorCaptureInstalled = true
  const report = (msg: string) => {
    void window.electronAPI.invoke('app:log', 'error', 'uncaught', msg).catch(() => {})
  }
  window.addEventListener('error', (e) => {
    report(`${e.message} @${e.filename}:${e.lineno}:${e.colno}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason.stack ?? e.reason.message : String(e.reason)
    report(`unhandled rejection: ${reason}`)
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function tempColor(celsius: number): string {
  if (celsius >= 85) return 'text-status-fail'
  if (celsius >= 70) return 'text-status-warn'
  return 'text-status-ok'
}

/** Trailing-edge debounce for instant-save sliders (spec: 150 ms). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 150): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
