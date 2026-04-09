import { writable, type Readable } from 'svelte/store'

const PORT = (window as Window & { electronAPI?: { streamPort: number } }).electronAPI?.streamPort ?? 52341

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

type ChannelListener = (data: unknown) => void
const listeners = new Map<string, Set<ChannelListener>>()

function connect(): void {
  ws = new WebSocket(`ws://127.0.0.1:${PORT}`)

  ws.onopen = () => {
    for (const channel of listeners.keys()) {
      ws?.send(JSON.stringify({ subscribe: channel }))
    }
  }

  ws.onmessage = (event) => {
    try {
      const { channel, data } = JSON.parse(event.data as string) as { channel: string; data: unknown }
      listeners.get(channel)?.forEach(fn => fn(data))
    } catch { /* ignore */ }
  }

  ws.onclose = () => {
    reconnectTimer = setTimeout(connect, 3000)
  }

  ws.onerror = () => {
    ws?.close()
  }
}

connect()

/** Subscribe to a named stream channel. Returns an unsubscribe function. */
export function subscribeStream<T>(channel: string, callback: (data: T) => void): () => void {
  if (!listeners.has(channel)) {
    listeners.set(channel, new Set())
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ subscribe: channel }))
    }
  }
  const set = listeners.get(channel)!
  const fn = callback as ChannelListener
  set.add(fn)

  return () => {
    set.delete(fn)
    if (set.size === 0) listeners.delete(channel)
  }
}

/** Create a Svelte readable store backed by a stream channel */
export function streamStore<T>(channel: string, initial: T): Readable<T> {
  const { subscribe, set } = writable<T>(initial)
  subscribeStream<T>(channel, set)
  return { subscribe }
}
