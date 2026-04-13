<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, UserPlus, Trash2, Shield, ShieldOff, Terminal, Home } from 'lucide-svelte'

  type User = { username: string; fullName: string; uid: number; home: string; shell: string; sudo: boolean }

  let users     = $state<User[]>([])
  let loading   = $state(true)
  let error     = $state('')
  let working   = $state<string | null>(null)  // username of in-progress op

  // Add user dialog
  let showAdd     = $state(false)
  let newUsername = $state('')
  let newFullName = $state('')
  let addError    = $state('')

  // Confirm delete
  let confirmDelete = $state<string | null>(null)

  async function load() {
    loading = true; error = ''
    try { users = await invoke<User[]>('users:list') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function toggleSudo(u: User) {
    working = u.username; error = ''
    try {
      await invoke('users:toggleSudo', u.username, u.sudo ? 'remove' : 'add')
      await load()
    } catch (e) { error = String(e) }
    finally { working = null }
  }

  async function deleteUser(username: string) {
    working = username; error = ''; confirmDelete = null
    try {
      await invoke('users:delete', username)
      await load()
    } catch (e) { error = String(e) }
    finally { working = null }
  }

  async function addUser() {
    addError = ''
    if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(newUsername)) {
      addError = 'Username must be lowercase letters, numbers, - or _ (max 31 chars)'; return
    }
    working = 'new'; error = ''
    try {
      await invoke('users:add', newUsername, newFullName)
      showAdd = false; newUsername = ''; newFullName = ''
      await load()
    } catch (e) { addError = String(e) }
    finally { working = null }
  }

  function avatarColor(username: string): string {
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
    let h = 0
    for (const c of username) h = (h * 31 + c.charCodeAt(0)) & 0xffff
    return colors[h % colors.length]
  }

  function initials(u: User): string {
    const n = u.fullName || u.username
    return n.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  onMount(() => load())
</script>

{#if loading}
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

{:else}
  <div class="space-y-4 max-w-xl">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">{users.length} user{users.length !== 1 ? 's' : ''}</h2>
      <button
        onclick={() => { showAdd = !showAdd; addError = '' }}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
               bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <UserPlus size={12} />
        Add User
      </button>
    </div>

    <!-- Add user form -->
    {#if showAdd}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium">New User</p>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label for="new-username" class="text-xs text-muted-foreground">Username *</label>
            <input
              id="new-username"
              bind:value={newUsername}
              placeholder="e.g. jdoe"
              class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                     text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div class="space-y-1">
            <label for="new-fullname" class="text-xs text-muted-foreground">Full Name</label>
            <input
              id="new-fullname"
              bind:value={newFullName}
              placeholder="e.g. Jane Doe"
              class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                     text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        {#if addError}
          <p class="text-xs text-destructive">{addError}</p>
        {/if}
        <div class="flex gap-2">
          <button
            onclick={addUser}
            disabled={working === 'new'}
            class="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium
                   bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {#if working === 'new'}<RefreshCw size={12} class="animate-spin" />{/if}
            Create
          </button>
          <button
            onclick={() => { showAdd = false; addError = '' }}
            class="px-4 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80"
          >
            Cancel
          </button>
        </div>
      </div>
    {/if}

    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}

    <!-- User list -->
    <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {#each users as u}
        <div class="px-4 py-3">
          <div class="flex items-center gap-3">
            <!-- Avatar -->
            <div class="w-9 h-9 rounded-full {avatarColor(u.username)} flex items-center justify-center shrink-0">
              <span class="text-xs font-bold text-white">{initials(u)}</span>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{u.username}</span>
                {#if u.sudo}
                  <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-500 border border-yellow-400/30">
                    sudo
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                {#if u.fullName}
                  <span>{u.fullName}</span>
                  <span>·</span>
                {/if}
                <span class="flex items-center gap-1"><Home size={10} />{u.home}</span>
                <span class="flex items-center gap-1"><Terminal size={10} />{u.shell.split('/').at(-1)}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1 shrink-0">
              <button
                onclick={() => toggleSudo(u)}
                disabled={working === u.username}
                aria-label="{u.sudo ? 'Revoke' : 'Grant'} sudo for {u.username}"
                title="{u.sudo ? 'Revoke sudo' : 'Grant sudo'}"
                class="p-1.5 rounded-md transition-colors hover:bg-secondary {u.sudo ? 'text-yellow-500' : 'text-muted-foreground'}"
              >
                {#if working === u.username}
                  <RefreshCw size={14} class="animate-spin" />
                {:else if u.sudo}
                  <Shield size={14} />
                {:else}
                  <ShieldOff size={14} />
                {/if}
              </button>
              <button
                onclick={() => confirmDelete = u.username}
                disabled={working === u.username}
                aria-label="Delete user {u.username}"
                title="Delete user"
                class="p-1.5 rounded-md transition-colors hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <!-- Confirm delete -->
          {#if confirmDelete === u.username}
            <div class="mt-3 rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-center justify-between gap-3">
              <p class="text-xs text-destructive">Delete <strong>{u.username}</strong> and their home directory?</p>
              <div class="flex gap-2 shrink-0">
                <button
                  onclick={() => deleteUser(u.username)}
                  class="px-3 py-1 rounded text-xs font-medium bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete
                </button>
                <button
                  onclick={() => confirmDelete = null}
                  class="px-3 py-1 rounded text-xs bg-secondary hover:bg-secondary/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}

      {#if users.length === 0}
        <div class="px-4 py-8 text-center text-sm text-muted-foreground">No local user accounts found</div>
      {/if}
    </div>

  </div>
{/if}
