<script lang="ts">
  import { toasts, type ToastVariant } from '$stores/toasts'
  import { Info, CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-svelte'

  const icons: Record<ToastVariant, typeof Info> = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: AlertCircle,
  }

  const styles: Record<ToastVariant, string> = {
    info:    'border-primary/30 bg-primary/10 text-primary',
    success: 'border-green-500/30 bg-green-500/10 text-green-400',
    warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    error:   'border-destructive/30 bg-destructive/10 text-destructive',
  }
</script>

<div class="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-lg backdrop-blur-sm transition-all
             {styles[toast.variant]}"
      role="status"
      aria-live="polite"
    >
      <svelte:component this={icons[toast.variant]} size={16} class="shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0">
        {#if toast.title}
          <p class="text-sm font-medium leading-tight">{toast.title}</p>
        {/if}
        <p class="text-xs leading-snug opacity-90 {toast.title ? 'mt-0.5' : ''}">{toast.message}</p>
      </div>
      <button
        onclick={() => toasts.dismiss(toast.id)}
        aria-label="Dismiss notification"
        class="shrink-0 p-1 rounded-md hover:bg-black/20 text-current opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={12} />
      </button>
    </div>
  {/each}
</div>
