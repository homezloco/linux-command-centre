import { writable } from 'svelte/store'
import { invoke } from '$lib/utils'

export type Badges = {
  pendingUpdates: number
  securityUpdates: number
  highDisk: boolean
  vpnActive: boolean
}

const EMPTY: Badges = {
  pendingUpdates: 0,
  securityUpdates: 0,
  highDisk: false,
  vpnActive: false,
}

export const badges = writable<Badges>(EMPTY)

let interval: ReturnType<typeof setInterval> | undefined
let started = false

export async function refreshBadges(): Promise<void> {
  try {
    badges.set(await invoke<Badges>('badge:counts'))
  } catch { /* non-critical */ }
}

/** Single 5-minute poller. Sidebar and Home both subscribe; do not start a second fetch. */
export function startBadgePolling(): void {
  if (started) return
  started = true
  void refreshBadges()
  interval = setInterval(() => { void refreshBadges() }, 5 * 60 * 1000)
}

export function stopBadgePolling(): void {
  if (!started) return
  started = false
  clearInterval(interval)
  interval = undefined
}
