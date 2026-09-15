import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke<T>(channel, ...args)
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
