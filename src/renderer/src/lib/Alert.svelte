<script lang="ts">
  import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-svelte'

  let {
    variant = 'error',
    message,
  }: {
    variant?: 'error' | 'warn' | 'info' | 'ok'
    message: string
  } = $props()

  const cfg = {
    error: { icon: AlertCircle,   cls: 'border-destructive/30 bg-destructive/10 text-destructive' },
    warn:  { icon: AlertTriangle, cls: 'border-status-warn/30 bg-status-warn/10 text-status-warn' },
    info:  { icon: Info,          cls: 'border-border bg-secondary text-muted-foreground' },
    ok:    { icon: CheckCircle2,  cls: 'border-status-ok/30 bg-status-ok/10 text-status-ok' },
  }

  const { icon: Icon, cls } = $derived(cfg[variant])
</script>

<div class="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm {cls}">
  <Icon size={15} class="mt-px shrink-0" />
  <span class="leading-snug">{message}</span>
</div>
