import { writable, derived } from 'svelte/store'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  variant: ToastVariant
  title?: string
  message: string
  duration?: number
}

const { subscribe, update } = writable<Toast[]>([])

function id(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const toasts = {
  subscribe,
  add(toast: Omit<Toast, 'id'>) {
    const item: Toast = { id: id(), duration: 4000, ...toast }
    update((all) => [...all, item])
    if (item.duration && item.duration > 0) {
      setTimeout(() => toasts.dismiss(item.id), item.duration)
    }
    return item.id
  },
  dismiss(id: string) {
    update((all) => all.filter((t) => t.id !== id))
  },
  info(message: string, title?: string) {
    return toasts.add({ variant: 'info', title, message })
  },
  success(message: string, title?: string) {
    return toasts.add({ variant: 'success', title, message })
  },
  warning(message: string, title?: string) {
    return toasts.add({ variant: 'warning', title, message })
  },
  error(message: string, title?: string) {
    return toasts.add({ variant: 'error', title, message })
  },
}

export const toastCount = derived(toasts, ($t) => $t.length)
