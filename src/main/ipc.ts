import { ipcMain, net } from 'electron'
import { exec } from 'child_process'
import { sysread, sysexists, run } from './shell'
import { privilegedOp } from './privilege'
import { existsSync } from 'fs'
import { readdir, readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { homedir } from 'os'

interface UpdateItem {
  label: string
  type: 'github' | 'kernel' | 'package' | 'local'
  state: 'ok' | 'warn' | 'open' | 'closed' | 'error' | 'unknown'
  detail: string
  url?: string
  updatedAt?: string
  comments?: number
}

export async function registerIpcHandlers(): Promise<void> {
  // ── Battery ────────────────────────────────────────────────────────────────
  ipcMain.handle('battery:status', async () => {
    const batDir = await findBattery()
    if (!batDir) return null
    return {
      capacity:   parseInt(await sysread(`${batDir}/capacity`) || '0'),
      status:     await sysread(`${batDir}/status`),
      health:     await sysread(`${batDir}/health`),
      threshold:  parseInt(await sysread(`${batDir}/charge_control_end_threshold`) || '100'),
      hasThreshold: sysexists(`${batDir}/charge_control_end_threshold`)
    }
  })

  ipcMain.handle('battery:setThreshold', async (_, value: number) => {
    return privilegedOp('set-battery-threshold', String(value))
  })

  // ── Thermal ────────────────────────────────────────────────────────────────
  ipcMain.handle('thermal:snapshot', async () => {
    return collectThermal()
  })

  // ── Power ──────────────────────────────────────────────────────────────────
  ipcMain.handle('power:status', async () => {
    try {
      const profile = await run('powerprofilesctl get')
      const profiles = (await run('powerprofilesctl list'))
        .split('\n')
        .filter(l => l.trim().endsWith(':'))
        .map(l => l.trim().replace(':', '').replace('*', '').trim())
      return { profile, profiles }
    } catch {
      const profile = await sysread('/sys/firmware/acpi/platform_profile')
      const choices = await sysread('/sys/firmware/acpi/platform_profile_choices')
      return { profile, profiles: choices.split(' ').filter(Boolean) }
    }
  })

  ipcMain.handle('power:set', async (_, profile: string) => {
    try {
      await run(`powerprofilesctl set ${profile}`)
    } catch {
      return privilegedOp('set-power-profile', profile)
    }
    return profile
  })

  // ── WiFi ───────────────────────────────────────────────────────────────────
  ipcMain.handle('wifi:status', async () => {
    try {
      const rfkill = await run('rfkill list wifi')
      const blocked = rfkill.includes('Soft blocked: yes')
      if (blocked) return { blocked, ssid: null, signal: null, security: null }

      // Use nmcli for richer connection info
      const active = await run(
        'nmcli -t -f NAME,TYPE,DEVICE,STATE connection show --active'
      ).catch(() => '')
      const wifiLine = active.split('\n').find(l => l.includes(':wifi:') || l.includes(':802-11-wireless:'))
      const ssid = wifiLine?.split(':')[0] ?? await run('iwgetid -r').catch(() => null)

      // Signal + security of active network
      let signal: number | null = null
      let security: string | null = null
      if (ssid) {
        const info = await run(`nmcli -t -f SSID,SIGNAL,SECURITY device wifi list`).catch(() => '')
        const match = info.split('\n').find(l => l.startsWith(`${ssid}:`))
        if (match) {
          const parts = match.split(':')
          signal = parseInt(parts[1]) || null
          security = parts[2] || null
        }
      }
      return { blocked, ssid, signal, security }
    } catch {
      return { blocked: false, ssid: null, signal: null, security: null }
    }
  })

  ipcMain.handle('wifi:scan', async () => {
    try {
      // Trigger a rescan (may fail silently if too frequent)
      await run('nmcli device wifi rescan').catch(() => {})
      await new Promise(r => setTimeout(r, 800))

      const out = await run('nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY,BSSID device wifi list')
      const networks: { ssid: string; signal: number; security: string; bssid: string; active: boolean }[] = []
      const seen = new Set<string>()

      for (const line of out.split('\n')) {
        const parts = line.split(':')
        if (parts.length < 5) continue
        const [inUse, ssid, signalStr, security, ...bssidParts] = parts
        const bssid = bssidParts.join(':')
        const signal = parseInt(signalStr) || 0
        if (!ssid || seen.has(ssid)) continue
        seen.add(ssid)
        networks.push({ ssid, signal, security: security || 'Open', bssid, active: inUse === '*' })
      }

      // Sort: active first, then by signal strength
      networks.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        return b.signal - a.signal
      })

      return networks
    } catch (e) {
      return []
    }
  })

  ipcMain.handle('wifi:connect', async (_, ssid: string, password?: string) => {
    // nmcli connect — works without root for active desktop user on Ubuntu
    try {
      if (password) {
        await run(`nmcli device wifi connect "${ssid}" password "${password}"`)
      } else {
        await run(`nmcli device wifi connect "${ssid}"`)
      }
      return { ok: true }
    } catch (e: unknown) {
      return { ok: false, error: String((e as { stderr?: string }).stderr ?? e) }
    }
  })

  ipcMain.handle('wifi:disconnect', async () => {
    try {
      const dev = await run('nmcli -t -f DEVICE,TYPE device status')
        .then(o => o.split('\n').find(l => l.includes(':wifi:'))?.split(':')[0] ?? 'wlan0')
      await run(`nmcli device disconnect ${dev}`)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('wifi:toggle', async () => {
    return privilegedOp('wifi-toggle')
  })

  // ── Bluetooth ──────────────────────────────────────────────────────────────
  ipcMain.handle('bluetooth:status', async () => {
    try {
      const rfkill = await run('rfkill list bluetooth')
      const blocked = rfkill.includes('Soft blocked: yes')

      const devices: { mac: string; name: string; connected: boolean; type: string }[] = []

      if (!blocked) {
        try {
          // List all paired devices
          const pairedOut = await run('bluetoothctl devices')
          const macs = [...pairedOut.matchAll(/Device\s+([0-9A-F:]{17})\s+(.+)/gi)]
            .map(m => ({ mac: m[1], name: m[2].trim() }))

          // Check connection state for each
          for (const { mac, name } of macs) {
            try {
              const info = await run(`bluetoothctl info ${mac}`)
              const connected = /Connected:\s+yes/i.test(info)
              const type = info.match(/Icon:\s+(\S+)/i)?.[1] ?? 'unknown'
              devices.push({ mac, name, connected, type })
            } catch {
              devices.push({ mac, name, connected: false, type: 'unknown' })
            }
          }
        } catch { /* bluetoothctl not available */ }
      }

      return { blocked, devices }
    } catch {
      return { blocked: false, devices: [] }
    }
  })

  ipcMain.handle('bluetooth:toggle', async () => {
    return privilegedOp('bluetooth-toggle')
  })

  async function getDeviceInfo(mac: string): Promise<{ name: string; type: string; rssi: number | null }> {
    try {
      const info = await run(`bluetoothctl info ${mac}`)
      const nameMatch = info.match(/Name:\s*(.+)/)
      const aliasMatch = info.match(/Alias:\s*(.+)/)
      const iconMatch = info.match(/Icon:\s*(.+)/)
      const rssiMatch = info.match(/RSSI:\s*([-\d]+)/)

      const name = nameMatch?.[1]?.trim() || aliasMatch?.[1]?.trim() || ''
      const type = iconMatch?.[1]?.trim() || 'bluetooth'
      const rssi = rssiMatch ? parseInt(rssiMatch[1], 10) : null

      return { name, type, rssi }
    } catch {
      return { name: '', type: 'bluetooth', rssi: null }
    }
  }

  ipcMain.handle('bluetooth:scan', async () => {
    try {
      const scanProc = exec('bluetoothctl scan on 2>/dev/null')
      await new Promise(r => setTimeout(r, 6000))
      scanProc.kill()
      await run('bluetoothctl scan off').catch(() => {})

      const allOut = await run('bluetoothctl devices').catch(() => '')
      const pairedOut = await run('bluetoothctl devices Paired').catch(() => '')

      const parseDevices = (out: string) =>
        [...out.matchAll(/Device\s+([0-9A-F:]{17})\s+(.+)/gi)]
          .map(m => ({ mac: m[1], name: m[2].trim() }))

      const all = parseDevices(allOut)
      const pairedMacs = new Set(parseDevices(pairedOut).map(d => d.mac))
      const unpaired = all.filter(d => !pairedMacs.has(d.mac))

      // Enrich with detailed info
      const enriched = await Promise.all(
        unpaired.map(async (d) => {
          const info = await getDeviceInfo(d.mac)
          return {
            mac: d.mac,
            name: info.name || d.name || '',
            type: info.type,
            rssi: info.rssi
          }
        })
      )

      // Sort by signal strength (stronger first)
      return enriched.sort((a, b) => {
        if (a.rssi == null && b.rssi == null) return 0
        if (a.rssi == null) return 1
        if (b.rssi == null) return -1
        return b.rssi - a.rssi
      })
    } catch {
      return []
    }
  })

  ipcMain.handle('bluetooth:connect', async (_, mac: string) => {
    try {
      await withTimeout(run(`bluetoothctl connect ${mac}`), 30000, 'Connect')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as { stderr?: string }).stderr ?? e) }
    }
  })

  ipcMain.handle('bluetooth:disconnect', async (_, mac: string) => {
    try {
      await run(`bluetoothctl disconnect ${mac}`)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as { stderr?: string }).stderr ?? e) }
    }
  })

  const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      )
    ])
  }

  ipcMain.handle('bluetooth:pair', async (_, mac: string) => {
    try {
      await withTimeout(run(`bluetoothctl pair ${mac}`), 30000, 'Pairing')
      await run(`bluetoothctl trust ${mac}`).catch(() => {})
      await run(`bluetoothctl connect ${mac}`).catch(() => {})
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as { stderr?: string }).stderr ?? e) }
    }
  })

  ipcMain.handle('bluetooth:remove', async (_, mac: string) => {
    try {
      await run(`bluetoothctl remove ${mac}`)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as { stderr?: string }).stderr ?? e) }
    }
  })

  // ── Audio ──────────────────────────────────────────────────────────────────
  ipcMain.handle('audio:status', async () => {
    try {
      const volOutput = await run('wpctl get-volume @DEFAULT_AUDIO_SINK@')
      const match = volOutput.match(/Volume:\s+([\d.]+)/)
      const volume = match ? Math.round(parseFloat(match[1]) * 100) : 0
      const muted = volOutput.includes('[MUTED]')
      return { volume, muted }
    } catch {
      return { volume: 0, muted: false }
    }
  })

  ipcMain.handle('audio:setVolume', async (_, value: number) => {
    await run(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${value}%`)
    return value
  })

  ipcMain.handle('audio:toggleMute', async () => {
    await run('wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle')
  })

  // ── Display ────────────────────────────────────────────────────────────────
  ipcMain.handle('display:status', async () => {
    const bl = await findBacklight()
    let brightness = null
    if (bl) {
      const cur = parseInt(await sysread(`${bl}/brightness`) || '0')
      const max = parseInt(await sysread(`${bl}/max_brightness`) || '100')
      brightness = Math.round((cur / max) * 100)
    }
    const nightLight = await run('gsettings get org.gnome.settings-daemon.plugins.color night-light-enabled').catch(() => 'false')
    const nlTemp = parseInt(await run('gsettings get org.gnome.settings-daemon.plugins.color night-light-temperature').catch(() => '4000'))
    return { brightness, nightLight: nightLight.trim() === 'true', nightLightTemp: nlTemp }
  })

  ipcMain.handle('display:setBrightness', async (_, value: number) => {
    return privilegedOp('set-brightness', String(value))
  })

  ipcMain.handle('display:setNightLight', async (_, enabled: boolean) => {
    await run(`gsettings set org.gnome.settings-daemon.plugins.color night-light-enabled ${enabled}`)
  })

  ipcMain.handle('display:setNightLightTemp', async (_, temp: number) => {
    await run(`gsettings set org.gnome.settings-daemon.plugins.color night-light-temperature ${temp}`)
  })

  // ── Sleep ──────────────────────────────────────────────────────────────────
  ipcMain.handle('sleep:status', async () => {
    const raw = await sysread('/sys/power/mem_sleep')
    const current = raw.match(/\[([^\]]+)\]/)?.[1] ?? 'unknown'
    const available = raw.replace(/[\[\]]/g, '').split(' ').filter(Boolean)
    return { current, available }
  })

  ipcMain.handle('sleep:setState', async (_, state: string) => {
    return privilegedOp('set-sleep-state', state)
  })

  // ── Touchpad ───────────────────────────────────────────────────────────────
  ipcMain.handle('touchpad:status', async () => {
    const detected = existsSync('/proc/bus/input/devices') &&
      (await sysread('/proc/bus/input/devices')).toLowerCase().includes('gxtp7863')
    const serviceEnabled = await run('systemctl is-enabled touchpad-rebind.service').catch(() => 'disabled')
    return { detected, serviceEnabled: serviceEnabled.trim() === 'enabled' }
  })

  ipcMain.handle('touchpad:rebind', async () => {
    return privilegedOp('touchpad-rebind')
  })

  // ── Kernel version ─────────────────────────────────────────────────────────
  ipcMain.handle('kernel:version', async () => {
    return (await run('uname -r')).split('-')[0]  // e.g. "6.17.0"
  })

  // ── Updates check (runs in main process — no CSP/CORS restrictions) ─────────
  ipcMain.handle('updates:check', async () => {
    const results: UpdateItem[] = []

    // GitHub issues
    const ghIssues = [
      { ref: 'intel/ipu6-drivers/399', label: 'Camera: INT3472 GPIO conflict (VGHH-XX)' }
    ]
    for (const { ref, label } of ghIssues) {
      const [owner, repo, number] = ref.split('/')
      try {
        const res = await net.fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
          { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'lcc/1.0' } }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const d = await res.json() as {
          state: string; title: string; updated_at: string; comments: number; html_url: string
        }
        results.push({
          label, type: 'github',
          state: d.state === 'closed' ? 'closed' : 'open',
          detail: d.title,
          url: d.html_url,
          updatedAt: d.updated_at?.slice(0, 10),
          comments: d.comments,
        })
      } catch (e) {
        results.push({ label, type: 'github', state: 'error', detail: String(e) })
      }
    }

    // Kernel version check
    try {
      const raw = await run('uname -r')
      const running = raw.split('-')[0]
      const [rMaj, rMin] = running.split('.').map(Number)
      const ok = rMaj > 6 || (rMaj === 6 && rMin >= 12)
      results.push({
        label: 'Kernel ≥ 6.12 (touchpad fix)',
        type: 'kernel',
        state: ok ? 'ok' : 'warn',
        detail: `Running ${running}`,
      })
    } catch {
      results.push({ label: 'Kernel version', type: 'kernel', state: 'unknown', detail: 'Could not read kernel version' })
    }

    // Fingerprint (local check)
    results.push({
      label: 'Fingerprint: Goodix sensor Linux driver',
      type: 'local',
      state: 'warn',
      detail: 'No Linux driver for this model (Goodix on VGHH-XX)',
      url: 'https://gitlab.freedesktop.org/libfprint/libfprint/-/issues',
    })

    // Package updates (apt-cache)
    for (const [pkg, label] of [
      ['linux-image-generic-hwe-24.04', 'Kernel HWE updates'],
      ['libcamhal-ipu6epmtl',           'Camera HAL updates'],
    ]) {
      try {
        const installed  = (await run(`dpkg -l ${pkg}`)).split('\n').find(l => l.startsWith('ii'))?.split(/\s+/)[2] ?? ''
        const available  = (await run(`apt-cache policy ${pkg}`)).match(/Candidate:\s+(\S+)/)?.[1] ?? ''
        if (!installed) {
          results.push({ label, type: 'package', state: 'warn', detail: `${pkg} not installed` })
        } else if (available && available !== installed) {
          results.push({ label, type: 'package', state: 'warn', detail: `Update available: ${available} (installed: ${installed})` })
        } else {
          results.push({ label, type: 'package', state: 'ok', detail: `Up to date (${installed})` })
        }
      } catch {
        results.push({ label, type: 'package', state: 'unknown', detail: 'Could not check' })
      }
    }

    return results
  })

  // ── Startup Apps ──────────────────────────────────────────────────────────
  ipcMain.handle('startup:list', async () => {
    const home = homedir()
    const userDir = `${home}/.config/autostart`

    interface AppEntry {
      id: string; name: string; comment: string; exec: string
      enabled: boolean; system: boolean; path: string
    }

    const parse = (content: string) => {
      const get = (key: string) => content.match(new RegExp(`^${key}=(.*)`, 'm'))?.[1]?.trim() ?? ''
      return {
        name: get('Name'), comment: get('Comment'), exec: get('Exec'),
        hidden: get('Hidden').toLowerCase() === 'true',
        noDisplay: get('NoDisplay').toLowerCase() === 'true',
        gnomeEnabled: get('X-GNOME-Autostart-enabled'),
        // X-GNOME-Autostart-Phase marks internal session daemons (gsd-*, at-spi, etc.)
        phase: get('X-GNOME-Autostart-Phase'),
      }
    }

    const apps: AppEntry[] = []
    const seen = new Set<string>()

    // User autostart first (takes precedence over system)
    try {
      const userFiles = await readdir(userDir).catch(() => [] as string[])
      for (const f of userFiles.filter(f => f.endsWith('.desktop'))) {
        const content = await readFile(`${userDir}/${f}`, 'utf8').catch(() => '')
        if (!content) continue
        const p = parse(content)
        const id = f.replace('.desktop', '')
        apps.push({
          id, name: p.name || id, comment: p.comment, exec: p.exec,
          enabled: !p.hidden && p.gnomeEnabled !== 'false',
          system: false, path: `${userDir}/${f}`
        })
        seen.add(f)
      }
    } catch { /* user dir may not exist */ }

    // System autostart (skip files the user already has an override for)
    try {
      const sysFiles = await readdir('/etc/xdg/autostart').catch(() => [] as string[])
      for (const f of sysFiles.filter(f => f.endsWith('.desktop'))) {
        if (seen.has(f)) continue
        const content = await readFile(`/etc/xdg/autostart/${f}`, 'utf8').catch(() => '')
        if (!content) continue
        const p = parse(content)
        // Skip entries explicitly hidden, internal GNOME session phases, or gsd-* daemons
        if (p.hidden || p.phase) continue
        if (p.exec.startsWith('/usr/libexec/gsd-') || p.exec.startsWith('/usr/libexec/gnome-settings-daemon')) continue
        const id = f.replace('.desktop', '')
        // NoDisplay=true means hidden from menus, not disabled — use gnomeEnabled for actual run state
        apps.push({
          id, name: p.name || id, comment: p.comment, exec: p.exec,
          enabled: p.gnomeEnabled !== 'false',
          system: true, path: `/etc/xdg/autostart/${f}`
        })
        seen.add(f)
      }
    } catch { /* dir may not exist */ }

    return apps.sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle('startup:toggle', async (_, id: string, enabled: boolean) => {
    const home = homedir()
    const userDir = `${home}/.config/autostart`
    await mkdir(userDir, { recursive: true })
    const filePath = `${userDir}/${id}.desktop`

    // Try reading existing user file first, then fall back to system file
    let content = await readFile(filePath, 'utf8').catch(() => null)
    if (!content) {
      content = await readFile(`/etc/xdg/autostart/${id}.desktop`, 'utf8').catch(() => null)
    }
    if (!content) throw new Error(`No .desktop file found for ${id}`)

    // Update or insert X-GNOME-Autostart-enabled
    if (/^X-GNOME-Autostart-enabled=/m.test(content)) {
      content = content.replace(/^X-GNOME-Autostart-enabled=.*/m, `X-GNOME-Autostart-enabled=${enabled}`)
    } else {
      content = content.replace(/(\[Desktop Entry\])/, `$1\nX-GNOME-Autostart-enabled=${enabled}`)
    }
    // Remove Hidden/NoDisplay lines when re-enabling
    if (enabled) {
      content = content.replace(/^Hidden=.*\n?/m, '').replace(/^NoDisplay=.*\n?/m, '')
    }
    await writeFile(filePath, content, 'utf8')
    return { ok: true }
  })

  ipcMain.handle('startup:add', async (_, name: string, exec: string, comment: string) => {
    const home = homedir()
    const userDir = `${home}/.config/autostart`
    await mkdir(userDir, { recursive: true })
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const content = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${name}`,
      comment ? `Comment=${comment}` : '',
      `Exec=${exec}`,
      'X-GNOME-Autostart-enabled=true',
    ].filter(Boolean).join('\n') + '\n'
    await writeFile(`${userDir}/${id}.desktop`, content, 'utf8')
    return { ok: true, id }
  })

  ipcMain.handle('startup:remove', async (_, id: string) => {
    const home = homedir()
    const filePath = `${home}/.config/autostart/${id}.desktop`
    await unlink(filePath)
    return { ok: true }
  })

  // ── App Autostart (self) ─────────────────────────────────────────────────
  const APP_ID = 'linux-command-centre'

  ipcMain.handle('app:autostartStatus', async () => {
    const home = homedir()
    const filePath = `${home}/.config/autostart/${APP_ID}.desktop`
    try {
      const content = await readFile(filePath, 'utf8')
      const hidden = /^Hidden=true$/m.test(content)
      const gnomeEnabled = content.match(/^X-GNOME-Autostart-enabled=(.*)$/m)?.[1]?.trim()
      return { enabled: !hidden && gnomeEnabled !== 'false' }
    } catch {
      return { enabled: false }
    }
  })

  ipcMain.handle('app:autostartSet', async (_, enabled: boolean) => {
    const home = homedir()
    const userDir = `${home}/.config/autostart`
    await mkdir(userDir, { recursive: true })
    const filePath = `${userDir}/${APP_ID}.desktop`

    // Try to detect how the app was launched
    const execPath = process.env.APPIMAGE || process.execPath
    const isAppImage = !!process.env.APPIMAGE

    const content = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Linux Command Centre',
      'Comment=Hardware management dashboard',
      `Exec=${execPath}${isAppImage ? ' --no-sandbox' : ''}`,
      enabled ? 'X-GNOME-Autostart-enabled=true' : 'X-GNOME-Autostart-enabled=false',
      enabled ? '' : 'Hidden=true',
      'Icon=utilities-terminal',
      'Categories=System;Settings;',
    ].filter(Boolean).join('\n') + '\n'

    await writeFile(filePath, content, 'utf8')
    return { ok: true }
  })

  // ── GRUB ──────────────────────────────────────────────────────────────────
  ipcMain.handle('grub:status', async () => {
    try {
      const content = await readFile('/etc/default/grub', 'utf8')
      const getVal = (key: string) => {
        const m = content.match(new RegExp(`^\\s*${key}=(.*)`, 'm'))
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
      }
      return {
        timeout: parseInt(getVal('GRUB_TIMEOUT') || '10'),
        defaultEntry: getVal('GRUB_DEFAULT') || '0',
        cmdline: getVal('GRUB_CMDLINE_LINUX_DEFAULT'),
        timeoutStyle: getVal('GRUB_TIMEOUT_STYLE') || 'menu',
      }
    } catch {
      return { timeout: 10, defaultEntry: '0', cmdline: 'quiet splash', timeoutStyle: 'menu' }
    }
  })

  ipcMain.handle('grub:entries', async () => {
    try {
      const content = await readFile('/boot/grub/grub.cfg', 'utf8')
      return [...content.matchAll(/^\s*menuentry\s+['"]([^'"]+)['"]/gm)].map(m => m[1])
    } catch {
      return []
    }
  })

  ipcMain.handle('grub:set', async (_, options: Record<string, string>) => {
    const pairs: string[] = []
    for (const [k, v] of Object.entries(options)) pairs.push(k, v)
    return privilegedOp('grub-set', ...pairs)
  })

  // ── Services ──────────────────────────────────────────────────────────────
  ipcMain.handle('services:list', async (_, search?: string) => {
    try {
      // Get runtime state
      const unitsOut = await run(
        'systemctl list-units --type=service --state=loaded --no-pager --plain --no-legend'
      ).catch(() => '')
      // Get enabled/disabled state
      const filesOut = await run(
        'systemctl list-unit-files --type=service --no-pager --plain --no-legend'
      ).catch(() => '')

      const enabledMap = new Map<string, string>()
      for (const line of filesOut.split('\n')) {
        const [name, state] = line.trim().split(/\s+/)
        if (name) enabledMap.set(name, state ?? 'unknown')
      }

      const services: {
        name: string; active: string; sub: string; description: string; enabledState: string
      }[] = []

      for (const line of unitsOut.split('\n')) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 4) continue
        const [name, , active, sub, ...descParts] = parts
        if (!name?.endsWith('.service')) continue
        const description = descParts.join(' ')
        if (search) {
          const q = search.toLowerCase()
          if (!name.toLowerCase().includes(q) && !description.toLowerCase().includes(q)) continue
        }
        services.push({ name, active, sub, description, enabledState: enabledMap.get(name) ?? 'unknown' })
      }

      services.sort((a, b) => {
        if (a.active !== b.active) return a.active === 'active' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return services
    } catch {
      return []
    }
  })

  ipcMain.handle('services:action', async (_, service: string, action: string) => {
    if (!/^[a-zA-Z0-9@._-]+\.service$/.test(service)) throw new Error('Invalid service name')
    if (!['start', 'stop', 'enable', 'disable', 'restart'].includes(action)) throw new Error('Invalid action')
    return privilegedOp('service-action', action, service)
  })

  // ── Camera ─────────────────────────────────────────────────────────────────
  ipcMain.handle('camera:status', async () => {
    const ipu6Loaded = (await run('lsmod').catch(() => '')).includes('intel_ipu6')
    const halInstalled = existsSync('/usr/lib/libcamhal/plugins/ipu6epmtl.so')
    const int3472Error = (await run('dmesg').catch(() => '')).includes('INT3472') &&
      (await run('dmesg').catch(() => '')).includes('EBUSY')
    return { ipu6Loaded, halInstalled, int3472Error }
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function findBattery(): Promise<string | null> {
  try {
    const entries = await readdir('/sys/class/power_supply')
    const bat = entries.find(e => e.startsWith('BAT'))
    return bat ? `/sys/class/power_supply/${bat}` : null
  } catch {
    return null
  }
}

async function findBacklight(): Promise<string | null> {
  try {
    const entries = await readdir('/sys/class/backlight')
    return entries.length > 0 ? `/sys/class/backlight/${entries[0]}` : null
  } catch {
    return null
  }
}

export async function collectThermal(): Promise<ThermalSnapshot> {
  const temps: { label: string; celsius: number }[] = []
  const fans: { label: string; rpm: number }[] = []
  let cpuMinMhz = 0, cpuMaxMhz = 0

  try {
    const hwmons = await readdir('/sys/class/hwmon')
    for (const hw of hwmons) {
      const base = `/sys/class/hwmon/${hw}`
      const name = await sysread(`${base}/name`)
      if (['coretemp', 'acpitz', 'intel_pch_thermal', 'iwlwifi_1'].includes(name)) {
        let i = 1
        while (existsSync(`${base}/temp${i}_input`)) {
          const raw = parseInt(await sysread(`${base}/temp${i}_input`) || '0')
          const label = await sysread(`${base}/temp${i}_label`) || name
          if (raw > 0) temps.push({ label, celsius: raw / 1000 })
          i++
        }
      }
      let f = 1
      while (existsSync(`${base}/fan${f}_input`)) {
        const rpm = parseInt(await sysread(`${base}/fan${f}_input`) || '0')
        const label = await sysread(`${base}/fan${f}_label`) || `${name} fan ${f}`
        if (rpm > 0) fans.push({ label, rpm })
        f++
      }
    }
  } catch { /* no hwmon */ }

  try {
    const cpus = await readdir('/sys/devices/system/cpu')
    const freqs: number[] = []
    for (const cpu of cpus.filter(c => /^cpu\d+$/.test(c))) {
      const khz = parseInt(await sysread(`/sys/devices/system/cpu/${cpu}/cpufreq/scaling_cur_freq`) || '0')
      if (khz > 0) freqs.push(khz / 1000)
    }
    if (freqs.length) {
      cpuMinMhz = Math.min(...freqs)
      cpuMaxMhz = Math.max(...freqs)
    }
  } catch { /* no cpufreq */ }

  const noTurbo = await sysread('/sys/devices/system/cpu/intel_pstate/no_turbo')

  return {
    timestamp: Date.now(),
    temps,
    fans,
    cpuMinMhz: Math.round(cpuMinMhz),
    cpuMaxMhz: Math.round(cpuMaxMhz),
    turboEnabled: noTurbo !== '1'
  }
}

export interface ThermalSnapshot {
  timestamp: number
  temps: { label: string; celsius: number }[]
  fans: { label: string; rpm: number }[]
  cpuMinMhz: number
  cpuMaxMhz: number
  turboEnabled: boolean
}
