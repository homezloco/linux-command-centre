import { writable } from 'svelte/store'

export type ThemeId = 'default' | 'cyberdeck' | 'xenomorph' | 'synthwave' | 'matrix'

export interface ThemeDef {
  id: ThemeId
  label: string
  tagline: string
  /** background, primary, glow — swatch dots shown in the picker */
  swatch: [string, string, string]
}

export const THEMES: ThemeDef[] = [
  { id: 'default',   label: 'Default',   tagline: 'Clean & neutral',    swatch: ['#0b0c0e', '#4f8ef7', '#4f8ef7'] },
  { id: 'cyberdeck', label: 'Cyberdeck', tagline: 'High-tech neon HUD', swatch: ['#040c0f', '#22d3ee', '#22d3ee'] },
  { id: 'xenomorph', label: 'Xenomorph', tagline: 'Alien bio-terminal', swatch: ['#080a06', '#7bc73e', '#7bc73e'] },
  { id: 'synthwave', label: 'Synthwave', tagline: 'Retro-future grid',  swatch: ['#0c0618', '#f0399c', '#22d3ee'] },
  { id: 'matrix',    label: 'Matrix',    tagline: 'Green CRT terminal', swatch: ['#050a05', '#22e05a', '#22e05a'] }
]

const STORAGE_KEY = 'lcc-theme'
const DEFAULT_THEME: ThemeId = 'default'

function isThemeId(v: string | null): v is ThemeId {
  return !!v && THEMES.some((t) => t.id === v)
}

function readStored(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isThemeId(v) ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function applyToDom(id: ThemeId): void {
  if (typeof document === 'undefined') return
  if (id === DEFAULT_THEME) delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = id
}

export const theme = writable<ThemeId>(readStored())

theme.subscribe((id) => {
  applyToDom(id)
  try { localStorage.setItem(STORAGE_KEY, id) } catch { /* non-critical */ }
})
