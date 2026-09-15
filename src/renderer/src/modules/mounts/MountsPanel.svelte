<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button, EmptyState, SearchField, SegmentedControl, Toggle } from '$ui'
  import { RefreshCw, HardDrive, Database, CheckCircle2, FolderTree, Package } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type Mount = {
    device: string; mountpoint: string; fstype: string; options: string
    size: number; used: number; avail: number; pct: number; inFstab: boolean
  }
  type FstabEntry = {
    device: string; mountpoint: string; fstype: string
    options: string; dump: string; pass: string
  }
  type MountsStatus = { mounts: Mount[]; fstab: FstabEntry[] }
  type View = 'live' | 'fstab'

  const groupLabel = 'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground'
  const chip = 'text-[11px] font-mono px-1.5 py-0.5 rounded bg-secondary/50 border border-border/50 text-muted-foreground'

  let status  = $state<MountsStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error   = $state('')
  let view    = $state<View>('live')
  let query   = $state('')
  let showSnaps = $state(false)

  const viewOptions = $derived<{ value: View; label: string }[]>([
    { value: 'live',  label: `Live mounts (${status?.mounts.length ?? 0})` },
    { value: 'fstab', label: `/etc/fstab (${status?.fstab.length ?? 0})` },
  ])

  const isPhysical = (m: Mount) => /^\/dev\/(sd|nvme|hd)/.test(m.device)
  const isSnap = (m: Mount) => m.device.startsWith('/dev/loop') && m.fstype === 'squashfs'

  // Categorised, filtered mounts
  const cats = $derived.by(() => {
    if (!status) return { physical: [] as Mount[], snaps: [] as Mount[], virtual: [] as Mount[] }
    let mounts = status.mounts
    if (!showSnaps) mounts = mounts.filter(m => !m.device.startsWith('/dev/loop'))
    const q = query.trim().toLowerCase()
    if (q) {
      mounts = mounts.filter(m =>
        m.mountpoint.toLowerCase().includes(q) ||
        m.device.toLowerCase().includes(q) ||
        m.fstype.toLowerCase().includes(q)
      )
    }
    return {
      physical: mounts.filter(isPhysical),
      snaps: mounts.filter(isSnap),
      virtual: mounts.filter(m => !isPhysical(m) && !isSnap(m)),
    }
  })
  const nothingMatches = $derived(
    cats.physical.length === 0 && cats.virtual.length === 0 && (!showSnaps || cats.snaps.length === 0),
  )

  function fmt(bytes: number): string {
    if (!bytes) return '—'
    const gb = bytes / 1024 ** 3
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / 1024 ** 2
    if (mb >= 1) return `${mb.toFixed(0)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  function pctColor(pct: number): string {
    if (pct >= 90) return 'bg-status-fail'
    if (pct >= 75) return 'bg-status-warn'
    return 'bg-primary'
  }

  // Read-only: mounts:status is the only IPC this panel uses (no unmount).
  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<MountsStatus>('mounts:status') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh mounts"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-4">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <Skeleton class="h-8 w-64" />
      <Skeleton class="h-8 w-full" />
      <Skeleton class="h-28 w-full" />
      <Skeleton class="h-40 w-full" />

    {:else if status}
      <SegmentedControl value={view} options={viewOptions} ariaLabel="Mount view" onChange={(v) => { view = v }} />

      {#if view === 'live'}
        {#if status.mounts.length === 0}
          <EmptyState icon={HardDrive} title="No mounts found" message="No mounted filesystems were reported." />
        {:else}
          <!-- Filter row -->
          <div class="flex items-center gap-3">
            <SearchField value={query} placeholder="Filter mounts…" aria-label="Filter mounts" class="flex-1" onChange={(v) => { query = v }} />
            <div class="flex items-center gap-2 shrink-0">
              <Package size={12} class="text-muted-foreground" />
              <span class="text-xs text-muted-foreground" id="mounts-snaps-label">Show snaps</span>
              <Toggle checked={showSnaps} aria-labelledby="mounts-snaps-label" onCheckedChange={(v) => { showSnaps = v }} />
            </div>
          </div>

          <!-- Physical disks -->
          {#if cats.physical.length > 0}
            <div class="space-y-2">
              <div class={groupLabel}>
                <HardDrive size={12} />
                Physical disks ({cats.physical.length})
              </div>
              {#each cats.physical as m, i (i)}
                <Card class="space-y-2">
                  <div class="flex items-start gap-2.5">
                    <div class="w-7 h-7 rounded-md bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                      <HardDrive size={13} />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[13px] font-medium">{m.mountpoint}</span>
                        <span class={chip}>{m.fstype}</span>
                        {#if m.inFstab}
                          <span title="In /etc/fstab" aria-label="In /etc/fstab">
                            <CheckCircle2 size={11} class="text-status-ok" />
                          </span>
                        {/if}
                      </div>
                      <p class="text-[11px] font-mono text-muted-foreground truncate mt-0.5">{m.device}</p>
                    </div>
                    {#if m.size > 0}
                      <div class="text-right shrink-0 tabular-nums">
                        <p class="text-xs font-medium">{fmt(m.used)} <span class="text-muted-foreground font-normal">/ {fmt(m.size)}</span></p>
                        <p class="text-[11px] text-muted-foreground">{fmt(m.avail)} free</p>
                      </div>
                    {/if}
                  </div>

                  {#if m.size > 0}
                    <div class="space-y-1">
                      <div class="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div class="h-full rounded-full transition-all {pctColor(m.pct)}" style="width: {m.pct}%"></div>
                      </div>
                      <div class="flex justify-between gap-3 text-[11px] text-muted-foreground">
                        <span class="tabular-nums">{m.pct}% used</span>
                        <span class="font-mono truncate max-w-[50%]" title={m.options}>{m.options}</span>
                      </div>
                    </div>
                  {/if}
                </Card>
              {/each}
            </div>
          {/if}

          <!-- Virtual / network -->
          {#if cats.virtual.length > 0}
            <div class="space-y-2">
              <div class={groupLabel}>
                <FolderTree size={12} />
                Virtual &amp; network ({cats.virtual.length})
              </div>
              <Card padding="none" class="divide-y divide-border overflow-hidden">
                {#each cats.virtual as m, i (i)}
                  <div class="px-4 py-2 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-[13px] text-muted-foreground truncate">{m.mountpoint}</span>
                      <span class={chip}>{m.fstype}</span>
                    </div>
                    <span class="text-[11px] font-mono text-muted-foreground truncate max-w-[40%]">{m.device}</span>
                  </div>
                {/each}
              </Card>
            </div>
          {/if}

          <!-- Snaps (when shown) -->
          {#if showSnaps && cats.snaps.length > 0}
            <div class="space-y-2">
              <div class={groupLabel}>
                <Package size={12} />
                Snap packages ({cats.snaps.length})
              </div>
              <Card padding="none" class="divide-y divide-border overflow-hidden max-h-64 overflow-y-auto">
                {#each cats.snaps as m, i (i)}
                  <div class="px-4 py-2 flex items-center justify-between gap-3">
                    <span class="text-[13px] text-muted-foreground truncate">{m.mountpoint}</span>
                    <span class="text-[11px] font-mono text-muted-foreground shrink-0">{m.device}</span>
                  </div>
                {/each}
              </Card>
            </div>
          {/if}

          {#if nothingMatches}
            <EmptyState icon={HardDrive} title="No mounts match" message="Nothing matches the current filter.">
              {#snippet action()}
                <Button variant="secondary" size="sm" onclick={() => { query = ''; showSnaps = true }}>Clear filter</Button>
              {/snippet}
            </EmptyState>
          {/if}
        {/if}

      {:else}
        <!-- fstab entries (read-only) -->
        {#if status.fstab.length === 0}
          <EmptyState icon={Database} title="No fstab entries" message="/etc/fstab has no mount entries." />
        {:else}
          <Card padding="none" class="divide-y divide-border overflow-hidden">
            {#each status.fstab as e, i (i)}
              <div class="px-4 py-3 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <Database size={12} class="text-muted-foreground shrink-0" />
                  <span class="text-[13px] font-medium">{e.mountpoint}</span>
                  <span class={chip}>{e.fstype}</span>
                </div>
                <p class="text-[11px] font-mono text-muted-foreground truncate ml-5">{e.device}</p>
                {#if e.options && e.options !== 'defaults'}
                  <p class="text-[11px] font-mono text-muted-foreground ml-5">{e.options}</p>
                {/if}
              </div>
            {/each}
          </Card>
        {/if}
        <p class="text-[11px] text-muted-foreground">
          /etc/fstab is read-only here — edit it with a text editor as root.
        </p>
      {/if}
    {/if}
  </div>
</Page>
