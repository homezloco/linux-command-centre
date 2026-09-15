import { derived, readable, writable } from 'svelte/store'

export type ThemeId = 'default' | 'cyberdeck' | 'xenomorph' | 'synthwave' | 'matrix' | 'light'

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
  { id: 'matrix',    label: 'Matrix',    tagline: 'Green CRT terminal', swatch: ['#050a05', '#22e05a', '#22e05a'] },
  { id: 'light',     label: 'Light',     tagline: 'Daylight & paper',   swatch: ['#f4f5f7', '#2f6feb', '#2f6feb'] }
]

const OVERLAY: Record<ThemeId, { color: string; symbolColor: string; source: 'light' | 'dark' }> = {
  default:   { color: '#0b0c0e', symbolColor: '#a1a1aa', source: 'dark' },
  cyberdeck: { color: '#040c0f', symbolColor: '#67e8f9', source: 'dark' },
  xenomorph: { color: '#080a06', symbolColor: '#7bc73e', source: 'dark' },
  synthwave: { color: '#0c0618', symbolColor: '#f0399c', source: 'dark' },
  matrix:    { color: '#050a05', symbolColor: '#22e05a', source: 'dark' },
  light:     { color: '#f4f5f7', symbolColor: '#3f3f46', source: 'light' }
}

const STORAGE_KEY = 'lcc-theme'
const REDUCE_KEY = 'lcc-reduce-effects'
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
  try {
    void window.electronAPI.invoke('app:setTitleBarOverlay', { ...OVERLAY[id] }).catch(() => {})
  } catch { /* overlay IPC missing or unsupported */ }
})

function readReduceFlag(): boolean {
  try {
    return localStorage.getItem(REDUCE_KEY) === '1'
  } catch {
    return false
  }
}

export const userReduceFlag = writable(readReduceFlag())

userReduceFlag.subscribe((on) => {
  try { localStorage.setItem(REDUCE_KEY, on ? '1' : '0') } catch { /* non-critical */ }
})

const osPrefersReducedMotion = readable(
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false,
  (set) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    set(mq.matches)
    const onChange = (): void => set(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }
)

export const reduceEffects = derived(
  [userReduceFlag, osPrefersReducedMotion],
  ([$user, $os]) => $user || $os
)

reduceEffects.subscribe((on) => {
  if (typeof document === 'undefined') return
  document.documentElement.toggleAttribute('data-reduce-effects', on)
})
