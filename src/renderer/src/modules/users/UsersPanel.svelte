<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, ConfirmDialog, EmptyState } from '$ui'
  import { RefreshCw, UserPlus, Trash2, Shield, ShieldOff, Terminal, Home, Users } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type User = { username: string; fullName: string; uid: number; home: string; shell: string; sudo: boolean }

  const TITLE = 'Users'
  const inputCls = 'w-full h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary'

  let users     = $state<User[]>([])
  let loading   = $state(true)
  let refreshing = $state(false)
  let error     = $state('')
  let working   = $state<string | null>(null)  // username of in-progress op

  // Add user form
  let showAdd     = $state(false)
  let newUsername = $state('')
  let newFullName = $state('')
  let addError    = $state('')

  // Confirms
  let sudoTarget   = $state<User | null>(null)
  let deleteTarget = $state<User | null>(null)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { users = await invoke<User[]>('users:list') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function toggleSudo(u: User) {
    working = u.username
    try {
      await invoke('users:toggleSudo', u.username, u.sudo ? 'remove' : 'add')
      toasts.success(`${u.username} ${u.sudo ? 'removed from' : 'added to'} sudo`, TITLE)
      sudoTarget = null
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
    finally { working = null }
  }

  async function deleteUser(u: User) {
    working = u.username
    try {
      await invoke('users:delete', u.username)
      toasts.success(`Deleted user ${u.username}`, TITLE)
      deleteTarget = null
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
    finally { working = null }
  }

  async function addUser() {
    addError = ''
    if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(newUsername)) {
      addError = 'Username must be lowercase letters, numbers, - or _ (max 31 chars)'; return
    }
    working = 'new'
    try {
      await invoke('users:add', newUsername, newFullName)
      toasts.success(`Created user ${newUsername}`, TITLE)
      showAdd = false; newUsername = ''; newFullName = ''
      await load(true)
    } catch (e) {
      const msg = String(e)
      addError = msg
      toasts.error(msg, TITLE)
    }
    finally { working = null }
  }

  // Avatar palette is decorative, not status — kept per the spec
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

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button variant="primary" size="sm" disabled={loading} onclick={() => { showAdd = !showAdd; addError = '' }}>
      <UserPlus size={12} />
      Add User
    </Button>
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh users"
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
      <Skeleton class="h-3 w-20" />
      <Card padding="none">
        {#each [0, 1, 2] as i (i)}
          <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0">
            <Skeleton class="h-9 w-9 rounded-full shrink-0" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-3 w-32" />
              <Skeleton class="h-2.5 w-56" />
            </div>
          </div>
        {/each}
      </Card>

    {:else}
      <h2 class="text-[13px] font-medium text-muted-foreground">{users.length} user{users.length !== 1 ? 's' : ''}</h2>

      <!-- Add user form (explicit Create — a multi-field form) -->
      {#if showAdd}
        <Card class="space-y-3">
          <p class="text-[13px] font-medium">New user</p>
          <form class="space-y-3" onsubmit={(e) => { e.preventDefault(); void addUser() }}>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <label for="new-username" class="text-xs text-muted-foreground">Username *</label>
                <input id="new-username" bind:value={newUsername} placeholder="e.g. jdoe" class={inputCls} />
              </div>
              <div class="space-y-1">
                <label for="new-fullname" class="text-xs text-muted-foreground">Full name</label>
                <input id="new-fullname" bind:value={newFullName} placeholder="e.g. Jane Doe" class={inputCls} />
              </div>
            </div>
            {#if addError}
              <p class="text-xs text-destructive">{addError}</p>
            {/if}
            <div class="flex gap-2">
              <Button type="submit" variant="primary" size="sm" loading={working === 'new'}>Create</Button>
              <Button variant="secondary" size="sm" onclick={() => { showAdd = false; addError = '' }}>Cancel</Button>
            </div>
          </form>
        </Card>
      {/if}

      <!-- User list -->
      {#if users.length === 0}
        <EmptyState icon={Users} title="No local user accounts" message="No non-system users were found in /etc/passwd." />
      {:else}
        <Card padding="none" class="divide-y divide-border overflow-hidden">
          {#each users as u (u.username)}
            <div class="flex items-center gap-3 px-4 py-3">
              <div class="w-9 h-9 rounded-full {avatarColor(u.username)} flex items-center justify-center shrink-0">
                <span class="text-xs font-bold text-white">{initials(u)}</span>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-medium">{u.username}</span>
                  {#if u.sudo}
                    <span class="text-[11px] font-medium px-1.5 py-0.5 rounded bg-status-warn/10 text-status-warn border border-status-warn/30">
                      sudo
                    </span>
                  {/if}
                </div>
                <div class="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 min-w-0">
                  {#if u.fullName}
                    <span class="truncate">{u.fullName}</span>
                    <span>·</span>
                  {/if}
                  <span class="flex items-center gap-1 truncate"><Home size={10} />{u.home}</span>
                  <span class="flex items-center gap-1 shrink-0"><Terminal size={10} />{u.shell.split('/').at(-1)}</span>
                </div>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                <Button
                  variant="icon"
                  size="sm"
                  aria-label="{u.sudo ? 'Revoke' : 'Grant'} sudo for {u.username}"
                  class={u.sudo ? 'text-status-warn' : ''}
                  loading={working === u.username}
                  disabled={working !== null}
                  onclick={() => { sudoTarget = u }}
                >
                  {#if u.sudo}<Shield size={14} />{:else}<ShieldOff size={14} />{/if}
                </Button>
                <Button
                  variant="icon"
                  size="sm"
                  aria-label="Delete user {u.username}"
                  class="hover:text-destructive"
                  disabled={working !== null}
                  onclick={() => { deleteTarget = u }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          {/each}
        </Card>
      {/if}
    {/if}
  </div>

  <ConfirmDialog
    open={sudoTarget !== null}
    onOpenChange={(open) => { if (!open) sudoTarget = null }}
    title={sudoTarget?.sudo ? `Revoke sudo from ${sudoTarget.username}?` : `Grant sudo to ${sudoTarget?.username ?? ''}?`}
    description={sudoTarget?.sudo
      ? 'The account will be removed from the sudo group and lose administrator rights.'
      : 'The account will be added to the sudo group and gain full administrator rights.'}
    busy={working !== null}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { sudoTarget = null } },
      { label: sudoTarget?.sudo ? 'Revoke' : 'Grant', variant: sudoTarget?.sudo ? 'destructive' : 'primary', onClick: () => toggleSudo(sudoTarget!) },
    ]}
  />

  <ConfirmDialog
    open={deleteTarget !== null}
    onOpenChange={(open) => { if (!open) deleteTarget = null }}
    title="Delete {deleteTarget?.username ?? ''}?"
    description="The account and its home directory will be permanently removed."
    busy={working !== null}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { deleteTarget = null } },
      { label: 'Delete', variant: 'destructive', onClick: () => deleteUser(deleteTarget!) },
    ]}
  />
</Page>
