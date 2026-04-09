import { WebSocketServer, WebSocket } from 'ws'
import { collectThermal } from './ipc'
import { sysread } from './shell'
import { readdir } from 'fs/promises'

const PORT = 52341
let wss: WebSocketServer | null = null

export function startStreamServer(): void {
  wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { subscribe?: string; unsubscribe?: string }
        if (msg.subscribe) handleSubscribe(ws, msg.subscribe)
      } catch { /* ignore malformed */ }
    })
  })

  console.log(`[stream] WebSocket server on ws://127.0.0.1:${PORT}`)
}

type Subscription = { interval: ReturnType<typeof setInterval> }
const subscriptions = new WeakMap<WebSocket, Map<string, Subscription>>()

function handleSubscribe(ws: WebSocket, channel: string): void {
  if (!subscriptions.has(ws)) subscriptions.set(ws, new Map())
  const map = subscriptions.get(ws)!

  if (map.has(channel)) return // already subscribed

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
