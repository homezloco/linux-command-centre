<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, HardDrive, Database, CheckCircle2, Search, Package, FolderTree, EyeOff, Eye } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type Mount = {
    device: string; mountpoint: string; fstype: string; options: string
    size: number; used: number; avail: number; pct: number; inFstab: boolean
  }
  type FstabEntry = {
    device: string; mountpoint: string; fstype: string
    options: string; dump: string; pass: string
  }
  type MountsStatus = { mounts: Mount[]; fstab: FstabEntry[] }

  let status  = $state<MountsStatus | null>(null)
  let loading = $state(true)
  let error   = $state('')
  let view    = $state<'live' | 'fstab'>('live')
  let query   = $state('')
  let hideSnaps = $state(true)

  // Categorized mounts
  const filteredMounts = $derived(() => {
    if (!status) return { physical: [], snaps: [], virtual: [] }
    let mounts = status.mounts
    if (hideSnaps) mounts = mounts.filter(m => !m.device.startsWith('/dev/loop'))
    if (query.trim()) {
      const q = query.toLowerCase()
      mounts = mounts.filter(m => 
        m.mountpoint.toLowerCase().includes(q) ||
        m.device.toLowerCase().includes(q) ||
        m.fstype.toLowerCase().includes(q)
      )
    }
    return {
      physical: mounts.filter(m => m.device.startsWith('/dev/sd') || m.device.startsWith('/dev/nvme') || m.device.startsWith('/dev/hd')),
      snaps: mounts.filter(m => m.device.startsWith('/dev/loop') && m.fstype === 'squashfs'),
      virtual: mounts.filter(m => 
        !m.device.startsWith('/dev/sd') && 
        !m.device.startsWith('/dev/nvme') && 
        !m.device.startsWith('/dev/hd') &&
        !(m.device.startsWith('/dev/loop') && m.fstype === 'squashfs')
      )
    }
  })

  function fmt(bytes: number): string {
    if (!bytes) return '—'
    const gb = bytes / 1024 ** 3
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / 1024 ** 2
    if (mb >= 1) return `${mb.toFixed(0)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  function pctColor(pct: number): string {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 75) return 'bg-yellow-500'
    return 'bg-primary'
  }

  async function load() {
    loading = true; error = ''
    try { status = await invoke<MountsStatus>('mounts:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error && !status}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-2xl">

    <!-- Header / tabs -->
    <div class="flex items-center justify-between">
      <div class="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
        <button
          onclick={() => view = 'live'}
          class="px-3 py-1.5 transition-colors
                 {view === 'live' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/50'}"
        >
          Live Mounts ({status.mounts.length})
        </button>
        <button
          onclick={() => view = 'fstab'}
          class="px-3 py-1.5 border-l border-border transition-colors
                 {view === 'fstab' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/50'}"
        >
          /etc/fstab ({status.fstab.length})
        </button>
      </div>
      <button onclick={load} class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" aria-label="Refresh">
        <RefreshCw size={13} />
      </button>
    </div>

    {#if view === 'live'}
      <!-- Search & Filter -->
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            bind:value={query}
            placeholder="Filter mounts..."
            class="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-secondary/50 text-sm
                   placeholder:text-muted-foreground/50 focus:outline-none"
          />
        </div>
        <button
          onclick={() => hideSnaps = !hideSnaps}
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-border
                 {hideSnaps ? 'text-muted-foreground bg-secondary/30' : 'text-primary bg-primary/10'}"
          title="{hideSnaps ? 'Show' : 'Hide'} snap mounts"
        >
          <Package size={12} />
          {hideSnaps ? 'Snaps hidden' : 'Snaps shown'}
        </button>
      </div>
    {/if}

    {#if view === 'live'}
      {@const cats = filteredMounts()}
      
      <!-- Physical Disks -->
      {#if cats.physical.length > 0}
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
            <HardDrive size={12} />
            Physical Disks ({cats.physical.length})
          </div>
          {#each cats.physical as m}
            <div class="rounded-xl border border-border bg-card p-4 space-y-2">
              <div class="flex items-start gap-2.5">
                <div class="w-7 h-7 rounded-md bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                  <HardDrive size={13} />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium">{m.mountpoint}</span>
                    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/50 border border-border/50 text-muted-foreground">
                      {m.fstype}
                    </span>
                    {#if m.inFstab}
                      <span title="In fstab">
                        <CheckCircle2 size={10} class="text-green-400" />
                      </span>
                    {/if}
                  </div>
                  <p class="text-[10px] font-mono text-muted-foreground/60 truncate mt-0.5">{m.device}</p>
                </div>
                {#if m.size > 0}
                  <div class="text-right shrink-0">
                    <p class="text-xs font-medium">{fmt(m.used)} <span class="text-muted-foreground font-normal">/ {fmt(m.size)}</span></p>
                    <p class="text-[10px] text-muted-foreground">{fmt(m.avail)} free</p>
                  </div>
                {/if}
              </div>

              {#if m.size > 0}
                <div class="space-y-1">
                  <div class="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div class="h-full rounded-full transition-all {pctColor(m.pct)}" style="width: {m.pct}%"></div>
                  </div>
                  <div class="flex justify-between text-[10px] text-muted-foreground">
                    <span>{m.pct}% used</span>
                    <span class="font-mono truncate max-w-[200px]" title={m.options}>{m.options}</span>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Virtual/Special -->
      {#if cats.virtual.length > 0}
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
            <FolderTree size={12} />
            Virtual & Network ({cats.virtual.length})
          </div>
          <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {#each cats.virtual as m}
              <div class="px-4 py-2.5 flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-sm text-muted-foreground truncate">{m.mountpoint}</span>
                  <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/30 text-muted-foreground">{m.fstype}</span>
                </div>
                <span class="text-[10px] font-mono text-muted-foreground/50 truncate max-w-[150px]">{m.device}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Snap Packages (when shown) -->
      {#if !hideSnaps && cats.snaps.length > 0}
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
            <Package size={12} />
            Snap Packages ({cats.snaps.length})
          </div>
          <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden max-h-64 overflow-y-auto">
            {#each cats.snaps as m}
              <div class="px-4 py-2 flex items-center justify-between">
                <span class="text-sm text-muted-foreground truncate">{m.mountpoint}</span>
                <span class="text-[10px] font-mono text-muted-foreground/50">{m.device}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if cats.physical.length === 0 && cats.virtual.length === 0 && (hideSnaps || cats.snaps.length === 0)}
        <div class="rounded-xl border border-border bg-card p-8 text-center">
          <p class="text-sm text-muted-foreground">No mounts match your filter</p>
        </div>
      {/if}

    {:else}
      <!-- fstab entries -->
      <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {#each status.fstab as e}
          <div class="px-4 py-3 space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <Database size={12} class="text-muted-foreground shrink-0" />
              <span class="text-sm font-medium">{e.mountpoint}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground">
                {e.fstype}
              </span>
            </div>
            <p class="text-[10px] font-mono text-muted-foreground/60 truncate ml-5">{e.device}</p>
            {#if e.options && e.options !== 'defaults'}
              <p class="text-[10px] font-mono text-muted-foreground/40 ml-5">{e.options}</p>
            {/if}
          </div>
        {/each}

        {#if status.fstab.length === 0}
          <div class="px-4 py-6 text-center text-sm text-muted-foreground">No fstab entries found</div>
        {/if}
      </div>
      <p class="text-[10px] text-muted-foreground/40">
        /etc/fstab is read-only — edit it with a text editor as root.
      </p>
    {/if}

  </div>
{/if}
