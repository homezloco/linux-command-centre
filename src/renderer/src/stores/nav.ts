import { get, writable } from 'svelte/store'

export type NavPrefs = {
  last: string
  collapsed: string[]
  pins: string[]
  recents: string[]
}

const STORAGE_KEY = 'lcc-nav'
const PIN_MAX = 6
const RECENT_MAX = 5
const DEFAULT_LAST = 'home'

const DEFAULTS: NavPrefs = {
  last: DEFAULT_LAST,
  collapsed: ['Hardware'],
  pins: [],
  recents: [],
}

export const active = writable(DEFAULT_LAST)
export const collapsed = writable<string[]>([...DEFAULTS.collapsed])
export const pins = writable<string[]>([])
export const recents = writable<string[]>([])

let known = new Set<string>()
let listening = false
let warnedInvalid = false

function uniqValid(ids: unknown, limit: number, extraExclude: Set<string> = new Set()): string[] {
  if (!Array.isArray(ids)) return []
  const out: string[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || !known.has(id) || extraExclude.has(id) || out.includes(id)) continue
    out.push(id)
    if (out.length >= limit) break
  }
  return out
}

function readPrefs(): NavPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS, pins: [], recents: [], collapsed: [...DEFAULTS.collapsed] }
    const parsed = JSON.parse(raw) as Partial<NavPrefs>
    const last = typeof parsed.last === 'string' && known.has(parsed.last) ? parsed.last : DEFAULT_LAST
    const collapsedIds = Array.isArray(parsed.collapsed)
      ? parsed.collapsed.filter((x): x is string => typeof x === 'string')
      : [...DEFAULTS.collapsed]
    const pinIds = uniqValid(parsed.pins, PIN_MAX)
    const recentIds = uniqValid(parsed.recents, RECENT_MAX, new Set(pinIds))
    return { last, collapsed: collapsedIds, pins: pinIds, recents: recentIds }
  } catch {
    if (!warnedInvalid) {
      warnedInvalid = true
      console.warn('invalid lcc-nav JSON')
    }
    return { ...DEFAULTS, pins: [], recents: [], collapsed: [...DEFAULTS.collapsed] }
  }
}

function persist(): void {
  const prefs: NavPrefs = {
    last: get(active),
    collapsed: get(collapsed),
    pins: get(pins),
    recents: get(recents),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch { /* non-critical */ }
}

function syncHash(id: string): void {
  const next = '#' + id
  if (location.hash !== next) location.hash = next
}

/** Record the panel being left so it stays in recents/cache; drop the destination so Recents does not duplicate the current row. */
function recordLeave(fromId: string, toId: string): void {
  const pinIds = get(pins)
  recents.update((r) => {
    const next: string[] = []
    if (fromId && fromId !== toId && !pinIds.includes(fromId) && known.has(fromId)) next.push(fromId)
    for (const x of r) {
      if (x === fromId || x === toId || pinIds.includes(x) || next.includes(x) || !known.has(x)) continue
      next.push(x)
      if (next.length >= RECENT_MAX) break
    }
    return next
  })
}

function onHashChange(): void {
  const id = location.hash.replace(/^#/, '')
  if (!id || !known.has(id) || id === get(active)) return
  const prev = get(active)
  active.set(id)
  recordLeave(prev, id)
  persist()
}

export function initNav(ids: Iterable<string>): void {
  known = new Set(ids)
  const prefs = readPrefs()
  const hash = location.hash.replace(/^#/, '')
  const start = known.has(hash) ? hash : prefs.last
  active.set(start)
  collapsed.set(prefs.collapsed)
  pins.set(prefs.pins)
  recents.set(prefs.recents.filter((id) => id !== start))
  syncHash(start)
  persist()
  if (!listening) {
    listening = true
    window.addEventListener('hashchange', onHashChange)
  }
}

export function setActive(id: string): void {
  if (!known.has(id)) return
  const prev = get(active)
  if (id !== prev) {
    active.set(id)
    recordLeave(prev, id)
  }
  syncHash(id)
  persist()
}

export function toggleCollapsed(label: string): void {
  collapsed.update((c) => (c.includes(label) ? c.filter((x) => x !== label) : [...c, label]))
  persist()
}

/** @returns false when the pin cap is already full */
export function togglePin(id: string): boolean {
  if (!known.has(id)) return true
  const current = get(pins)
  if (current.includes(id)) {
    pins.set(current.filter((x) => x !== id))
    persist()
    return true
  }
  if (current.length >= PIN_MAX) return false
  pins.set([...current, id])
  recents.update((r) => r.filter((x) => x !== id))
  persist()
  return true
}

export function navCache(
  activeId: string,
  pinIds: string[],
  recentIds: string[],
  knownIds: Set<string>,
): string[] {
  const ids: string[] = []
  const add = (id: string | undefined): void => {
    if (!id || !knownIds.has(id) || ids.includes(id)) return
    ids.push(id)
  }
  if (knownIds.has('home')) add('home')
  add(activeId)
  for (const id of pinIds) add(id)
  for (const id of recentIds) add(id)
  return ids
}
