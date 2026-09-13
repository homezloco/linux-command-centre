import { WebSocketServer, WebSocket } from 'ws'
import { collectThermal } from './ipc'
import { sysread } from './shell'
import { readdir } from 'fs/promises'

const PORT = 52341
// The dev renderer runs on the electron-vite dev server (see index.html's
// CSP connect-src); the packaged renderer loads from disk via loadFile(),
// which Electron/Chromium reports as either no Origin header or "file://".
// Anything else — in particular any http(s):// origin — means some other
// page in some other browser tab is connecting, not our own renderer, since
// this server is bound to loopback but has no other access control.
const DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
const MAX_CHANNELS_PER_SOCKET = 8

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === 'null' || origin.startsWith('file://')) return true
  return DEV_ORIGINS.has(origin)
}

let wss: WebSocketServer | null = null

export function startStreamServer(): void {
  const verifyClient: WebSocket.VerifyClientCallbackSync = (info) => isAllowedOrigin(info.origin)
  wss = new WebSocketServer({
    host: '127.0.0.1',
    port: PORT,
    verifyClient
  })

  wss.on('error', (err) => {
    console.error('[stream] server error:', err)
  })

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { subscribe?: string; unsubscribe?: string }
        if (msg.subscribe) handleSubscribe(ws, msg.subscribe)
        if (msg.unsubscribe) handleUnsubscribe(ws, msg.unsubscribe)
      } catch { /* ignore malformed */ }
    })
    ws.on('close', () => handleClose(ws))
  })

  console.log(`[stream] WebSocket server on ws://127.0.0.1:${PORT}`)
}

type Subscription = { interval: ReturnType<typeof setInterval> }
const subscriptions = new WeakMap<WebSocket, Map<string, Subscription>>()

function handleUnsubscribe(ws: WebSocket, channel: string): void {
  const sub = subscriptions.get(ws)?.get(channel)
  if (!sub) return
  clearInterval(sub.interval)
  subscriptions.get(ws)!.delete(channel)
}

function handleClose(ws: WebSocket): void {
  const map = subscriptions.get(ws)
  if (!map) return
  for (const sub of map.values()) clearInterval(sub.interval)
  subscriptions.delete(ws)
}

function handleSubscribe(ws: WebSocket, channel: string): void {
  if (!subscriptions.has(ws)) subscriptions.set(ws, new Map())
  const map = subscriptions.get(ws)!

  if (map.has(channel)) return // already subscribed
  if (map.size >= MAX_CHANNELS_PER_SOCKET) return // ignore runaway subscribe spam

  let intervalMs = 2000
  let collector: () => Promise<unknown>

  switch (channel) {
    case 'thermal':
      collector = collectThermal
      intervalMs = 2000
      break
    case 'battery':
      collector = collectBattery
      intervalMs = 10000
      break
    default:
      return
  }

  const interval = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval)
      map.delete(channel)
      return
    }
    try {
      const data = await collector()
      ws.send(JSON.stringify({ channel, data }))
    } catch { /* sensor read failed */ }
  }, intervalMs)

  map.set(channel, { interval })

  // Send first frame immediately
  collector().then(data => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ channel, data }))
    }
  }).catch(() => {})
}

async function collectBattery(): Promise<unknown> {
  try {
    const entries = await readdir('/sys/class/power_supply')
    const bat = entries.find(e => e.startsWith('BAT'))
    if (!bat) return null
    const base = `/sys/class/power_supply/${bat}`
    return {
      timestamp: Date.now(),
      capacity: parseInt(await sysread(`${base}/capacity`) || '0'),
      status: await sysread(`${base}/status`)
    }
  } catch {
    return null
  }
}
