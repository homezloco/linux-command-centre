import { writable } from 'svelte/store'

export const DEFAULT_APP_NAME = 'Command Centre'

const STORAGE_KEY = 'lcc-app-name'
const MAX_LENGTH = 60

function readStored(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.slice(0, MAX_LENGTH) : DEFAULT_APP_NAME
  } catch {
    return DEFAULT_APP_NAME
  }
}

export const appName = writable<string>(readStored())

appName.subscribe((v) => {
  try {
    const trimmed = v.trim()
    if (trimmed && trimmed !== DEFAULT_APP_NAME) localStorage.setItem(STORAGE_KEY, trimmed)
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* non-critical */ }
})
