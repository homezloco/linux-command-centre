import { writable } from 'svelte/store'

export const paletteOpen = writable(false)

export function openPalette(): void {
  paletteOpen.set(true)
}

export function closePalette(): void {
  paletteOpen.set(false)
}
