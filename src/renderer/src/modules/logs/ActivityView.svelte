<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Skeleton, EmptyState, Button } from '$ui'
  import { RefreshCw, CheckCircle2, XCircle, ListChecks } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type OpRecord = {
    ts: string
    op: string
    args: string[]
    stdinBytes?: number
    durationMs: number
    ok: boolean
    errClass?: string
    errMsg?: string
  }

  let ops = $state<OpRecord[]>([])
  let loading = $state(true)
  let error = $state('')

  async function load() {
    error = ''
    try { ops = await invoke<OpRecord[]>('ops:history', 100) }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  const ERR_LABEL: Record<string, string> = {
    'lock-busy': 'apt lock busy',
    'auth-cancelled': 'auth cancelled',
    'timeout': 'timed out',
    'spawn': 'spawn failed',
    'unknown': 'failed',
  }

  function errLabel(cls: string | undefined): string {
    if (!cls) return 'failed'
    if (cls.startsWith('exit-')) return `exit ${cls.slice(5)}`
    return ERR_LABEL[cls] ?? cls
  }

  function fmtTime(ts: string): string {
    const d = new Date(ts)
    const today = new Date().toDateString() === d.toDateString()
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    if (today) return time
    return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${time}`
  }

  function fmtDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    const s = ms / 1000
    if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
    const m = Math.floor(s / 60)
    return `${m}m ${Math.round(s % 60)}s`
  }

  onMount(load)
</script>

<div class="flex flex-col flex-1 min-h-0 gap-3">
  {#if error}
    <div class="shrink-0"><Alert message={error} /></div>
  {/if}

  {#if loading}
    <div class="rounded-xl border border-border bg-card flex-1 min-h-0 divide-y divide-border/50">
      {#each [0, 1, 2, 3, 4, 5] as i (i)}
        <div class="flex items-center gap-3 px-3 py-2.5">
          <Skeleton class="h-3 w-16 shrink-0" />
          <Skeleton class="h-3 w-28 shrink-0" />
          <Skeleton class="h-3 flex-1" />
          <Skeleton class="h-3 w-12 shrink-0" />
        </div>
      {/each}
    </div>
  {:else if ops.length === 0}
    <EmptyState
      icon={ListChecks}
      title="No activity yet"
      message="Privileged operations run by the app — upgrades, service changes, system writes — are journaled here once they happen."
    >
      {#snippet action()}
        <Button variant="secondary" size="sm" onclick={load}>Refresh</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="rounded-xl border border-border bg-card flex-1 min-h-0 overflow-auto">
      <table class="w-full text-xs">
        <thead class="sticky top-0 bg-card border-b border-border z-10">
          <tr class="text-muted-foreground">
            <th class="text-left px-3 py-2 font-medium w-24">Time</th>
            <th class="text-left px-2 py-2 font-medium w-44">Operation</th>
            <th class="text-left px-2 py-2 font-medium">Arguments</th>
            <th class="text-left px-2 py-2 font-medium w-20">Duration</th>
            <th class="text-left px-2 py-2 font-medium w-28">Result</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/50">
          {#each ops as op (op.ts + op.op)}
            <tr class="hover:bg-secondary/30 transition-colors">
              <td class="px-3 py-1.5 text-muted-foreground/60 font-mono whitespace-nowrap">{fmtTime(op.ts)}</td>
              <td class="px-2 py-1.5 font-mono whitespace-nowrap">{op.op}</td>
              <td class="px-2 py-1.5 text-muted-foreground font-mono text-[11px] truncate max-w-[300px]" title={op.args.join(' ')}>
                {op.args.join(' ') || '—'}
              </td>
              <td class="px-2 py-1.5 text-muted-foreground tabular-nums whitespace-nowrap">{fmtDuration(op.durationMs)}</td>
              <td class="px-2 py-1.5 whitespace-nowrap">
                {#if op.ok}
                  <span class="inline-flex items-center gap-1 text-status-ok">
                    <CheckCircle2 size={12} /> ok
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1 text-status-fail" title={op.errMsg ?? ''}>
                    <XCircle size={12} /> {errLabel(op.errClass)}
                  </span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="shrink-0 text-[11px] text-muted-foreground text-right">{ops.length} operations</p>
  {/if}
</div>
