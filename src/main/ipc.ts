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

    const capacity = parseInt(await sysread(`${batDir}/capacity`) || '0')
    const status = await sysread(`${batDir}/status`)
    const powerNow = parseInt(await sysread(`${batDir}/power_now`) || '0')
    const energyNow = parseInt(await sysread(`${batDir}/energy_now`) || '0')
    const energyFull = parseInt(await sysread(`${batDir}/energy_full`) || '0')
    const energyFullDesign = parseInt(await sysread(`${batDir}/energy_full_design`) || '0')
    const cycleCount = parseInt(await sysread(`${batDir}/cycle_count`) || '0')

    // Calculate time remaining
    let timeRemaining: number | null = null
    if (powerNow > 0) {
      if (status === 'Discharging') {
        timeRemaining = Math.round(energyNow / powerNow * 60) // minutes
      } else if (status === 'Charging') {
        const energyToFull = energyFull - energyNow
        timeRemaining = Math.round(energyToFull / powerNow * 60) // minutes
      }
    }

    // Calculate wear level (1 - full_capacity/design_capacity)
    let wearLevel: number | null = null
    if (energyFullDesign > 0) {
      wearLevel = Math.round((1 - energyFull / energyFullDesign) * 100)
    }

    return {
      capacity,
      status,
      health: await sysread(`${batDir}/health`),
      threshold: parseInt(await sysread(`${batDir}/charge_control_end_threshold`) || '100'),
      hasThreshold: sysexists(`${batDir}/charge_control_end_threshold`),
      powerNow: Math.round(powerNow / 1000000), // watts
      timeRemaining,
      cycleCount,
      wearLevel,
      energyFull: Math.round(energyFull / 1000000), // Wh
      energyFullDesign: Math.round(energyFullDesign / 1000000) // Wh
    }
  })

  ipcMain.handle('battery:setThreshold', async (_, value: number) => {
    return privilegedOp('set-battery-threshold', String(value))
  })

  // ── Thermal ────────────────────────────────────────────────────────────────
  async function getThermalThrottling(): Promise<{ throttled: boolean; type: string } | null> {
    try {
      // Check for thermal throttling via thermal zones
      const zones = await readdir('/sys/class/thermal').catch(() => [])
      for (const zone of zones) {
        const type = await sysread(`/sys/class/thermal/${zone}/type`).catch(() => '')
        if (type.toLowerCase().includes('x86_pkg_temp') || type.toLowerCase().includes('cpu')) {
          const trip = await sysread(`/sys/class/thermal/${zone}/trip_point_0_type`).catch(() => '')
          const temp = parseInt(await sysread(`/sys/class/thermal/${zone}/temp`) || '0') / 1000
          const tripTemp = parseInt(await sysread(`/sys/class/thermal/${zone}/trip_point_0_temp`) || '0') / 1000
          if (trip.toLowerCase().includes('critical') && temp >= tripTemp * 0.95) {
            return { throttled: true, type: 'Temperature critical' }
          }
        }
      }

      // Check via dmesg for throttling messages
      const dmesg = await run('dmesg 2>/dev/null | tail -100').catch(() => '')
      if (dmesg.toLowerCase().includes('throttling') && dmesg.toLowerCase().includes('cpu')) {
        return { throttled: true, type: 'CPU throttling detected' }
      }

      // Check MSR for thermal throttling (if rdmsr available)
      const msr = await run('rdmsr -f 0:0 0x1a0 2>/dev/null || echo 0').catch(() => '0')
      if (msr.trim() === '1') {
        return { throttled: true, type: 'Thermal throttling active' }
      }

      return { throttled: false, type: 'Normal' }
    } catch {
      return null
    }
  }

  async function getTopProcesses(): Promise<{ name: string; pid: number; cpu: number; mem: number }[]> {
    try {
      // Use ps to get top CPU processes
      const ps = await run('ps -eo pid,comm,pcpu,pmem --sort=-pcpu --no-headers -w | head -5').catch(() => '')
      return ps.split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/)
        return {
          pid: parseInt(parts[0]) || 0,
          name: parts[1] || 'unknown',
          cpu: parseFloat(parts[2]) || 0,
          mem: parseFloat(parts[3]) || 0
        }
      }).filter(p => p.pid > 0)
    } catch {
      return []
    }
  }

  ipcMain.handle('thermal:snapshot', async () => {
    const snapshot = await collectThermal()
    const throttling = await getThermalThrottling()
    const processes = await getTopProcesses()
    return { ...snapshot, throttling, processes }
  })

  // ── Power ──────────────────────────────────────────────────────────────────
  ipcMain.handle('power:status', async () => {
    try {
      const profile = await run('powerprofilesctl get')
      const profiles = (await run('powerprofilesctl list'))
        .split('\n')
        .filter(l => l.trim().endsWith(':'))
        .map(l => l.trim().replace(':', '').replace('*', '').trim())

      // Get screen timeout from gsettings (GNOME)
      const idleDelay = parseInt(await run('gsettings get org.gnome.desktop.session idle-delay 2>/dev/null').catch(() => '600'))

      // Get lid close behavior
      const lidClose = await run('gsettings get org.gnome.settings-daemon.plugins.power lid-close-ac-action 2>/dev/null').catch(() => 'nothing')
      const lidCloseBattery = await run('gsettings get org.gnome.settings-daemon.plugins.power lid-close-battery-action 2>/dev/null').catch(() => 'suspend')

      // Get power button action
      const powerButton = await run('gsettings get org.gnome.settings-daemon.plugins.power power-button-action 2>/dev/null').catch(() => 'interactive')

      // Get battery info if available
      let batteryTime: number | null = null
      let batteryPower: number | null = null
      try {
        const bat = await findBattery()
        if (bat) {
          const powerNow = parseInt(await sysread(`${bat}/power_now`) || '0')
          const energyNow = parseInt(await sysread(`${bat}/energy_now`) || '0')
          const status = await sysread(`${bat}/status`)
          if (powerNow > 0 && status === 'Discharging') {
            batteryTime = Math.round(energyNow / powerNow * 60) // minutes
            batteryPower = Math.round(powerNow / 1000000) // watts
          }
        }
      } catch { /* no battery info */ }

      return {
        profile,
        profiles,
        idleDelay,
        lidCloseAc: lidClose.replace(/'/g, ''),
        lidCloseBattery: lidCloseBattery.replace(/'/g, ''),
        powerButton: powerButton.replace(/'/g, ''),
        batteryTime,
        batteryPower
      }
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

  ipcMain.handle('power:setIdleDelay', async (_, seconds: number) => {
    await run(`gsettings set org.gnome.desktop.session idle-delay ${seconds}`)
  })

  ipcMain.handle('power:setLidClose', async (_, ac: string, battery: string) => {
    await run(`gsettings set org.gnome.settings-daemon.plugins.power lid-close-ac-action '${ac}'`)
    await run(`gsettings set org.gnome.settings-daemon.plugins.power lid-close-battery-action '${battery}'`)
  })

  ipcMain.handle('power:setPowerButton', async (_, action: string) => {
    await run(`gsettings set org.gnome.settings-daemon.plugins.power power-button-action '${action}'`)
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

  ipcMain.handle('wifi:saved', async () => {
    try {
      const out = await run('nmcli -t -f NAME,TYPE,ACTIVE connection show')
      return out.split('\n')
        .filter(l => l.includes(':802-11-wireless:') || l.includes(':wifi:'))
        .map(l => {
          const [name, type, active] = l.split(':')
          return { name, active: active === 'yes' }
        })
    } catch {
      return []
    }
  })

  ipcMain.handle('wifi:forget', async (_, ssid: string) => {
    try {
      await run(`nmcli connection delete "${ssid}"`)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('wifi:macRandomization', async () => {
    try {
      const enabled = await run('nmcli -g 802-11-wireless.cloned-mac-address connection show 2>/dev/null || echo "default"').catch(() => 'default')
      return { enabled: enabled.includes('random') || enabled.includes('stable') }
    } catch {
      return { enabled: false }
    }
  })

  ipcMain.handle('wifi:setMacRandomization', async (_, enabled: boolean) => {
    try {
      // Get all WiFi connections
      const conns = await run('nmcli -t -f NAME,TYPE connection show')
        .then(o => o.split('\n').filter(l => l.includes(':802-11-wireless:') || l.includes(':wifi:')))
        .then(lines => lines.map(l => l.split(':')[0]))

      // Set randomization for all WiFi connections
      const mode = enabled ? 'stable' : 'default'
      for (const conn of conns) {
        await run(`nmcli connection modify "${conn}" 802-11-wireless.cloned-mac-address ${mode}`).catch(() => {})
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
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
  type AudioDevice = {
    id: string
    name: string
    description: string
    isDefault: boolean
  }

  type AudioStream = {
    id: string
    name: string
    appName: string
    volume: number
    muted: boolean
    sinkId: string
  }

  async function parseWpctlStatus(): Promise<{ sinks: AudioDevice[], sources: AudioDevice[] }> {
    try {
      const out = await run('wpctl status 2>/dev/null').catch(() => '')
      const lines = out.split('\n')

      const sinks: AudioDevice[] = []
      const sources: AudioDevice[] = []

      let inSinks = false
      let inSources = false

      for (const line of lines) {
        if (line.includes('Sinks:')) { inSinks = true; inSources = false; continue }
        if (line.includes('Sources:')) { inSinks = false; inSources = true; continue }
        if (line.match(/^\s*$/)) { inSinks = false; inSources = false; continue }

        // Match device line: [number] + name [description] [vol] [muted]
        const match = line.match(/^\s*(\d+)\.\s+(.+?)\s+\[([^\]]+)\]/)
        if (!match) continue

        const [, id, name, desc] = match
        const isDefault = line.includes('[vol:')

        const device = { id, name: name.trim(), description: desc.trim(), isDefault }

        if (inSinks) sinks.push(device)
        if (inSources) sources.push(device)
      }

      return { sinks, sources }
    } catch {
      return { sinks: [], sources: [] }
    }
  }

  async function getAudioStreams(): Promise<AudioStream[]> {
    try {
      // Use pactl to get per-application streams
      const out = await run('pactl list sink-inputs 2>/dev/null || pw-dump 2>/dev/null | jq -r \'.[] | select(.type == "PipeWire:Interface:Node" and .info.props["media.class"] == "Stream/Output/Audio")\'').catch(() => '')
      const streams: AudioStream[] = []

      // Parse pactl format
      let current: Partial<AudioStream> = {}
      for (const line of out.split('\n')) {
        if (line.startsWith('Sink Input #')) {
          if (current.id) streams.push(current as AudioStream)
          current = { id: line.match(/#(\d+)/)?.[1] || '' }
        }
        const nameMatch = line.match(/Name:\s+(.+)/)
        if (nameMatch) current.name = nameMatch[1].trim()

        const appMatch = line.match(/application\.name = "([^"]+)"/) || line.match(/application.process.binary = "([^"]+)"/) || line.match(/application\.name:\s+(.+)/)
        if (appMatch) current.appName = appMatch[1].trim()

        const volMatch = line.match(/Volume:\s+[^:]+:\s*\d+\s*\/\s*(\d+)/) || line.match(/(\d+)%/)
        if (volMatch) current.volume = parseInt(volMatch[1], 10)

        const muteMatch = line.match(/Mute:\s+(yes|no)/i)
        if (muteMatch) current.muted = muteMatch[1].toLowerCase() === 'yes'

        const sinkMatch = line.match(/Sink:\s+(\d+)/)
        if (sinkMatch) current.sinkId = sinkMatch[1]
      }
      if (current.id) streams.push(current as AudioStream)

      return streams
    } catch {
      return []
    }
  }

  ipcMain.handle('audio:status', async () => {
    try {
      const volOutput = await run('wpctl get-volume @DEFAULT_AUDIO_SINK@')
      const match = volOutput.match(/Volume:\s+([\d.]+)/)
      const volume = match ? Math.round(parseFloat(match[1]) * 100) : 0
      const muted = volOutput.includes('[MUTED]')

      const { sinks, sources } = await parseWpctlStatus()
      const streams = await getAudioStreams()

      return {
        volume,
        muted,
        defaultSink: sinks.find(s => s.isDefault)?.id || null,
        defaultSource: sources.find(s => s.isDefault)?.id || null,
        sinks,
        sources,
        streams
      }
    } catch {
      return { volume: 0, muted: false, sinks: [], sources: [], streams: [] }
    }
  })

  ipcMain.handle('audio:setVolume', async (_, value: number) => {
    await run(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${value}%`)
    return value
  })

  ipcMain.handle('audio:toggleMute', async () => {
    await run('wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle')
  })

  ipcMain.handle('audio:setDefaultSink', async (_, id: string) => {
    await run(`wpctl set-default ${id}`)
  })

  ipcMain.handle('audio:setDefaultSource', async (_, id: string) => {
    await run(`wpctl set-default ${id}`)
  })

  ipcMain.handle('audio:setStreamVolume', async (_, id: string, volume: number) => {
    await run(`wpctl set-volume ${id} ${volume}%`)
  })

  ipcMain.handle('audio:setStreamMute', async (_, id: string, muted: boolean) => {
    await run(`wpctl set-mute ${id} ${muted ? 1 : 0}`)
  })

  // ── Display ────────────────────────────────────────────────────────────────
  type DisplayMode = {
    resolution: string
    refreshRate: number
    isCurrent: boolean
    isPreferred: boolean
  }

  type Monitor = {
    name: string
    connected: boolean
    resolution: string
    refreshRate: number
    position: string
    primary: boolean
    scale: number
    modes: DisplayMode[]
  }

  async function getMonitors(): Promise<Monitor[]> {
    try {
      // Try wlr-randr first (Wayland), then xrandr (X11)
      const out = await run('wlr-randr 2>/dev/null || xrandr --query 2>/dev/null').catch(() => '')
      const monitors: Monitor[] = []

      let currentMonitor: Partial<Monitor> | null = null
      let currentModes: DisplayMode[] = []

      for (const line of out.split('\n')) {
        // Monitor line: "HDMI-A-1 "Dell U2720Q" (connected)"
        const monitorMatch = line.match(/^([\w-]+)\s+"?([^"]*)"?\s*(\(connected\b|\(disconnected\b)?/)
        if (monitorMatch) {
          if (currentMonitor && currentMonitor.name) {
            monitors.push({ ...currentMonitor, modes: currentModes } as Monitor)
          }
          currentMonitor = {
            name: monitorMatch[1],
            connected: line.includes('connected') && !line.includes('disconnected'),
            primary: line.includes('primary'),
            scale: 1
          }
          currentModes = []
          continue
        }

        if (!currentMonitor?.connected) continue

        // Parse position and resolution: "  3840x2160 @ 60Hz  0x0       320mm x 180mm"
        const modeMatch = line.match(/^\s+(\d+)x(\d+)\s+@\s+(\d+(?:\.\d+)?)Hz\s+(\S+)/)
        if (modeMatch) {
          const [, w, h, hz, pos] = modeMatch
          currentMonitor.resolution = `${w}x${h}`
          currentMonitor.refreshRate = parseFloat(hz)
          currentMonitor.position = pos

          currentModes.push({
            resolution: `${w}x${h}`,
            refreshRate: parseFloat(hz),
            isCurrent: line.includes('+') || line.includes('*'),
            isPreferred: line.includes('+')
          })
        }

        // xrandr format: "  3840x2160     60.00*+  59.94..."
        const xrandrModeMatch = line.match(/^\s+(\d+)x(\d+).*?(\d+\.\d+)([*+]+)?/)
        if (xrandrModeMatch) {
          const [, w, h, hz, markers] = xrandrModeMatch
          const mode: DisplayMode = {
            resolution: `${w}x${h}`,
            refreshRate: parseFloat(hz),
            isCurrent: line.includes('*') || !!markers?.includes('*'),
            isPreferred: line.includes('+') || !!markers?.includes('+')
          }
          currentModes.push(mode)

          if (mode.isCurrent) {
            currentMonitor.resolution = mode.resolution
            currentMonitor.refreshRate = mode.refreshRate
          }
        }
      }

      if (currentMonitor && currentMonitor.name) {
        monitors.push({ ...currentMonitor, modes: currentModes } as Monitor)
      }

      return monitors.filter(m => m.connected)
    } catch {
      return []
    }
  }

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

    // Get fractional scale from GNOME if available
    const scale = await run('gsettings get org.gnome.desktop.interface text-scaling-factor 2>/dev/null').catch(() => '1.0')
    const fractionalScale = parseFloat(scale) || 1.0

    const monitors = await getMonitors()

    return {
      brightness,
      nightLight: nightLight.trim() === 'true',
      nightLightTemp: nlTemp,
      monitors,
      fractionalScale
    }
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

  ipcMain.handle('display:setResolution', async (_, monitor: string, resolution: string, refreshRate?: number) => {
    const rateStr = refreshRate ? ` --rate ${refreshRate}` : ''
    return run(`xrandr --output ${monitor} --mode ${resolution}${rateStr}`).catch(() =>
      run(`wlr-randr --output ${monitor} --mode ${resolution}@${refreshRate || 60}Hz`)
    )
  })

  ipcMain.handle('display:setScale', async (_, scale: number) => {
    // Update GNOME text scaling factor for fractional scaling
    await run(`gsettings set org.gnome.desktop.interface text-scaling-factor ${scale}`)
    return { scale }
  })

  ipcMain.handle('display:setPrimary', async (_, monitor: string) => {
    await run(`xrandr --output ${monitor} --primary`)
  })

  ipcMain.handle('display:arrange', async (_, arrangements: { monitor: string; position: string; relativeTo?: string }[]) => {
    // Build xrandr command for multi-monitor arrangement
    for (const arr of arrangements) {
      if (arr.relativeTo) {
        await run(`xrandr --output ${arr.monitor} --${arr.position} ${arr.relativeTo}`)
      }
    }
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
  async function getTouchpadDevices(): Promise<{ name: string; id: string }[]> {
    try {
      // Try libinput list-devices first
      const libinput = await run('libinput list-devices 2>/dev/null || libinput-list-devices 2>/dev/null').catch(() => '')
      const devices: { name: string; id: string }[] = []

      let inTouchpad = false
      let currentName = ''
      for (const line of libinput.split('\n')) {
        if (line.toLowerCase().includes('touchpad')) {
          inTouchpad = true
          currentName = line.split(':')[0]?.trim() || 'Touchpad'
        }
        if (inTouchpad && line.includes('Kernel:')) {
          const eventMatch = line.match(/event(\d+)/)
          if (eventMatch) {
            devices.push({ name: currentName, id: `event${eventMatch[1]}` })
          }
          inTouchpad = false
        }
      }

      if (devices.length === 0) {
        // Fallback to /proc/bus/input/devices
        const inputDevices = await sysread('/proc/bus/input/devices').catch(() => '')
        const lines = inputDevices.split('\n')
        let currentHandlers = ''
        let currentName = ''

        for (const line of lines) {
          if (line.startsWith('N: Name=')) {
            currentName = line.match(/"([^"]+)"/)?.[1] || ''
          }
          if (line.startsWith('H: Handlers=')) {
            currentHandlers = line
            if (currentName.toLowerCase().includes('touchpad') || currentName.toLowerCase().includes('mouse')) {
              const eventMatch = currentHandlers.match(/event(\d+)/)
              if (eventMatch) {
                devices.push({ name: currentName, id: `event${eventMatch[1]}` })
              }
            }
          }
        }
      }

      return devices
    } catch {
      return []
    }
  }

  async function getTouchpadSettings(): Promise<{
    tapToClick: boolean
    naturalScrolling: boolean
    speed: number
    twoFingerScroll: boolean
    disableWhileTyping: boolean
  }> {
    try {
      // Get settings from gsettings (GNOME/libinput)
      const tapToClick = await run('gsettings get org.gnome.desktop.peripherals.touchpad tap-to-click 2>/dev/null').catch(() => 'true')
      const naturalScrolling = await run('gsettings get org.gnome.desktop.peripherals.touchpad natural-scroll 2>/dev/null').catch(() => 'false')
      const speed = await run('gsettings get org.gnome.desktop.peripherals.touchpad speed 2>/dev/null').catch(() => '0.0')
      const twoFingerScroll = await run('gsettings get org.gnome.desktop.peripherals.touchpad two-finger-scrolling-enabled 2>/dev/null').catch(() => 'true')
      const disableWhileTyping = await run('gsettings get org.gnome.desktop.peripherals.touchpad disable-while-typing 2>/dev/null').catch(() => 'true')

      return {
        tapToClick: tapToClick.trim() === 'true',
        naturalScrolling: naturalScrolling.trim() === 'true',
        speed: parseFloat(speed) || 0,
        twoFingerScroll: twoFingerScroll.trim() === 'true',
        disableWhileTyping: disableWhileTyping.trim() === 'true'
      }
    } catch {
      return {
        tapToClick: true,
        naturalScrolling: false,
        speed: 0,
        twoFingerScroll: true,
        disableWhileTyping: true
      }
    }
  }

  ipcMain.handle('touchpad:status', async () => {
    const devices = await getTouchpadDevices()
    const hasGXTP7863 = devices.some(d => d.name.toLowerCase().includes('gxtp7863'))
    const serviceEnabled = await run('systemctl is-enabled touchpad-rebind.service').catch(() => 'disabled')
    const settings = await getTouchpadSettings()

    return {
      devices,
      hasGXTP7863,
      serviceEnabled: serviceEnabled.trim() === 'enabled',
      ...settings
    }
  })

  ipcMain.handle('touchpad:rebind', async () => {
    return privilegedOp('touchpad-rebind')
  })

  ipcMain.handle('touchpad:setSetting', async (_, key: string, value: unknown) => {
    const gsettingsMap: Record<string, string> = {
      'tapToClick': 'tap-to-click',
      'naturalScrolling': 'natural-scroll',
      'speed': 'speed',
      'twoFingerScroll': 'two-finger-scrolling-enabled',
      'disableWhileTyping': 'disable-while-typing'
    }

    const gsettingsKey = gsettingsMap[key]
    if (!gsettingsKey) throw new Error(`Unknown setting: ${key}`)

    const valStr = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
    await run(`gsettings set org.gnome.desktop.peripherals.touchpad ${gsettingsKey} ${valStr}`)
    return { ok: true }
  })

  // ── Kernel version ─────────────────────────────────────────────────────────
  ipcMain.handle('kernel:version', async () => {
    return (await run('uname -r')).split('-')[0]  // e.g. "6.17.0"
  })

  // ── Updates ────────────────────────────────────────────────────────────────
  type PackageUpdate = {
    name: string
    currentVersion: string
    newVersion: string
    size: string
    isSecurity: boolean
    source: string
  }

  async function getAptUpdates(): Promise<PackageUpdate[]> {
    try {
      // Update package list first
      await run('apt update 2>/dev/null || true').catch(() => '')

      // Get upgradeable packages
      const out = await run('apt list --upgradable 2>/dev/null').catch(() => '')
      const packages: PackageUpdate[] = []

      for (const line of out.split('\n')) {
        if (!line.includes('upgradable from:')) continue
        // Format: package/arch version arch [upgradable from: oldver]
        const match = line.match(/^(\S+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s+(\S+)\]/)
        if (!match) continue

        const [, name, newVer, oldVer] = match

        // Check if security update
        const policy = await run(`apt-cache policy ${name}`).catch(() => '')
        const isSecurity = policy.includes('-security') || policy.includes('security.ubuntu.com')

        // Get size from apt-cache
        const show = await run(`apt-cache show ${name} 2>/dev/null | grep -E '^(Size:|Filename:)' | head -2`).catch(() => '')
        const sizeMatch = show.match(/Size:\s+(\d+)/)
        const size = sizeMatch ? formatBytes(parseInt(sizeMatch[1])) : 'Unknown'

        packages.push({
          name,
          currentVersion: oldVer,
          newVersion: newVer,
          size,
          isSecurity,
          source: isSecurity ? 'Security' : 'Regular'
        })
      }

      return packages.sort((a, b) => (b.isSecurity ? 1 : 0) - (a.isSecurity ? 1 : 0))
    } catch {
      return []
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  async function getRebootRequired(): Promise<boolean> {
    try {
      // Check if reboot-required file exists
      const rebootFile = await sysread('/var/run/reboot-required').catch(() => null)
      return rebootFile !== null
    } catch {
      return false
    }
  }

  ipcMain.handle('updates:check', async () => {
    const packages = await getAptUpdates()
    const rebootRequired = await getRebootRequired()
    const runningKernel = (await run('uname -r').catch(() => '')).split('-')[0]

    // Check for kernel update
    const kernelPkg = packages.find(p => p.name.includes('linux-image'))
    const kernelUpdateAvailable = !!kernelPkg

    return {
      packages,
      rebootRequired,
      runningKernel,
      kernelUpdateAvailable,
      lastCheck: new Date().toISOString()
    }
  })

  ipcMain.handle('updates:upgrade', async (_, packages?: string[]) => {
    // Run apt upgrade via privileged helper
    if (packages && packages.length > 0) {
      return privilegedOp('apt-upgrade', packages.join(','))
    }
    return privilegedOp('apt-upgrade-all')
  })

  ipcMain.handle('updates:changelog', async (_, pkg: string) => {
    try {
      const changelog = await run(`apt-get changelog ${pkg} 2>/dev/null | head -50`).catch(() => '')
      return { changelog }
    } catch {
      return { changelog: 'Changelog not available' }
    }
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

  // ── Security ───────────────────────────────────────────────────────────────
  async function getFirewallStatus() {
    try {
      const ufwOut = await run('ufw status verbose').catch(() => '')
      const lines = ufwOut.split('\n')
      const statusLine = lines.find(l => l.toLowerCase().includes('status:'))
      const active = statusLine?.toLowerCase().includes('active') ?? false

      const defaultLines = lines.filter(l => l.includes('Default:'))
      const defaultIncoming = defaultLines.find(l => l.includes('incoming'))?.match(/Default:\s*(\w+)/)?.[1] ?? 'deny'
      const defaultOutgoing = defaultLines.find(l => l.includes('outgoing'))?.match(/Default:\s*(\w+)/)?.[1] ?? 'allow'

      const rules = lines.filter(l => l.includes('ALLOW') || l.includes('DENY') || l.includes('REJECT')).length

      return {
        installed: ufwOut.length > 0,
        active,
        rules,
        defaultIncoming,
        defaultOutgoing
      }
    } catch {
      return { installed: false, active: false, rules: 0, defaultIncoming: 'deny', defaultOutgoing: 'allow' }
    }
  }

  async function getOpenPorts() {
    try {
      const ssOut = await run('ss -tlnp -4').catch(() => '')
      const ports: { protocol: string; port: string; service: string; pid?: string }[] = []
      const seen = new Set<string>()

      for (const line of ssOut.split('\n').slice(1)) {
        if (!line.trim()) continue
        const parts = line.trim().split(/\s+/)
        if (parts.length < 5) continue

        const state = parts[0]
        const localAddr = parts[3]
        const portMatch = localAddr?.match(/:(\d+)$/)
        if (!portMatch) continue

        const port = portMatch[1]
        const protocol = parts[0]?.includes('udp') ? 'UDP' : 'TCP'

        // Extract process info if available
        const processPart = parts.slice(5).join(' ')
        const pidMatch = processPart?.match(/pid=(\d+)/)
        const nameMatch = processPart?.match(/users:\(\("([^"]+)"/) ?? processPart?.match(/([^,]+),pid=/)
        const service = nameMatch?.[1] ?? 'Unknown'

        const key = `${protocol}-${port}`
        if (!seen.has(key)) {
          seen.add(key)
          ports.push({ protocol, port, service, pid: pidMatch?.[1] })
        }
      }

      return ports.sort((a, b) => parseInt(a.port) - parseInt(b.port))
    } catch {
      return []
    }
  }

  async function getSshStatus() {
    try {
      const serviceOut = await run('systemctl status sshd 2>/dev/null || systemctl status ssh 2>/dev/null').catch(() => '')
      const installed = serviceOut.length > 0
      const running = serviceOut.includes('Active: active (running)')

      let port = 22
      let passwordAuth = true
      let rootLogin = true

      try {
        const sshConfig = await run('sshd -T 2>/dev/null || cat /etc/ssh/sshd_config 2>/dev/null').catch(() => '')
        const portMatch = sshConfig.match(/^port\s+(\d+)/mi)
        if (portMatch) port = parseInt(portMatch[1], 10)

        const passwordMatch = sshConfig.match(/^passwordauthentication\s+(\w+)/mi)
        if (passwordMatch) passwordAuth = passwordMatch[1].toLowerCase() === 'yes'

        const rootMatch = sshConfig.match(/^permitrootlogin\s+(\w+)/mi)
        if (rootMatch) {
          rootLogin = rootMatch[1].toLowerCase() === 'yes' || rootMatch[1].toLowerCase() === 'prohibit-password'
        }
      } catch { /* ignore config read errors */ }

      return { installed, running, port, passwordAuth, rootLogin }
    } catch {
      return { installed: false, running: false, port: 22, passwordAuth: true, rootLogin: true }
    }
  }

  async function getEncryptionStatus() {
    try {
      const cryptOut = await run('lsblk -o NAME,TYPE,FSTYPE,SIZE,MOUNTPOINT -J 2>/dev/null || lsblk -o NAME,TYPE,FSTYPE,SIZE,MOUNTPOINT').catch(() => '')
      const devices: { name: string; type: string; encrypted: boolean }[] = []

      // Try JSON first, fallback to text
      if (cryptOut.startsWith('{')) {
        const parsed = JSON.parse(cryptOut)
        const checkBlock = (dev: any) => {
          const isCrypt = dev.fstype === 'crypto_LUKS' || dev.type === 'crypt'
          devices.push({ name: dev.name, type: dev.type, encrypted: isCrypt })
          if (dev.children) dev.children.forEach(checkBlock)
        }
        parsed.blockdevices?.forEach(checkBlock)
      } else {
        // Text fallback - look for crypt entries
        for (const line of cryptOut.split('\n')) {
          if (line.includes('crypt') || line.includes('LUKS')) {
            const parts = line.trim().split(/\s+/)
            devices.push({ name: parts[0], type: parts[1], encrypted: true })
          }
        }
      }

      const encrypted = devices.some(d => d.encrypted)
      return { encrypted, devices }
    } catch {
      return { encrypted: false, devices: [] }
    }
  }

  async function getFailedLogins() {
    try {
      // Try lastb first (requires root, shows bad logins)
      const lastbOut = await run('lastb -w -s -7days 2>/dev/null || lastb -w 2>/dev/null').catch(() => '')
      const attempts: Record<string, { count: number; latest: string }> = {}

      for (const line of lastbOut.split('\n')) {
        if (!line.trim() || line.includes('begins') || line.includes('wtmp')) continue
        const parts = line.trim().split(/\s+/)
        const user = parts[0]
        const date = parts.slice(-6, -1).join(' ') || 'Unknown'

        if (!attempts[user]) {
          attempts[user] = { count: 0, latest: date }
        }
        attempts[user].count++
        if (new Date(date) > new Date(attempts[user].latest)) {
          attempts[user].latest = date
        }
      }

      return Object.entries(attempts).map(([user, data]) => ({
        user,
        count: data.count,
        latest: data.latest
      })).sort((a, b) => b.count - a.count).slice(0, 10)
    } catch {
      return []
    }
  }

  async function getSecurityUpdates() {
    try {
      // Check for security updates
      const aptOut = await run('apt list --upgradable 2>/dev/null').catch(() => '')
      const lines = aptOut.split('\n')

      let securityCount = 0
      let kernelUpdate = false

      for (const line of lines) {
        if (line.includes('-security') || line.includes('security.')) {
          securityCount++
        }
        if (line.match(/linux-(image|headers|generic)/)) {
          kernelUpdate = true
        }
      }

      return { securityUpdates: securityCount, kernelUpdates: kernelUpdate }
    } catch {
      return { securityUpdates: 0, kernelUpdates: false }
    }
  }

  ipcMain.handle('security:status', async () => {
    const [firewall, ports, ssh, encryption, failedLogins, updates] = await Promise.all([
      getFirewallStatus(),
      getOpenPorts(),
      getSshStatus(),
      getEncryptionStatus(),
      getFailedLogins(),
      getSecurityUpdates()
    ])

    return {
      firewall,
      ports,
      ssh,
      encryption,
      failedLogins,
      securityUpdates: updates.securityUpdates,
      kernelUpdates: updates.kernelUpdates
    }
  })

  ipcMain.handle('firewall:set', async (_, action: 'enable' | 'disable') => {
    if (!['enable', 'disable'].includes(action)) throw new Error('Invalid action')
    return privilegedOp('firewall-action', action)
  })

  ipcMain.handle('ssh:set', async (_, action: 'start' | 'stop') => {
    if (!['start', 'stop'].includes(action)) throw new Error('Invalid action')
    const service = await run('systemctl list-unit-files | grep -E "^(ssh|sshd)\\.service" | head -1 | cut -d" " -f1').catch(() => 'ssh.service')
    return privilegedOp('service-action', action, service.trim() || 'ssh.service')
  })

  // ── Storage ────────────────────────────────────────────────────────────────
  ipcMain.handle('storage:status', async () => {
    // Partitions via df
    const dfOut = await run("df -B1 --output=source,fstype,size,used,avail,pcent,target -x tmpfs -x devtmpfs -x squashfs -x overlay").catch(() => '')
    type Partition = { source: string; fstype: string; size: number; used: number; avail: number; pct: number; mount: string }
    const partitions: Partition[] = []
    for (const line of dfOut.split('\n').slice(1)) {
      const p = line.trim().split(/\s+/)
      if (p.length < 7) continue
      const source = p[0], fstype = p[1], size = parseInt(p[2]) || 0
      const used = parseInt(p[3]) || 0, avail = parseInt(p[4]) || 0
      const pct = parseInt(p[5]) || 0, mount = p[6]
      if (size === 0 || source.startsWith('none')) continue
      partitions.push({ source, fstype, size, used, avail, pct, mount })
    }

    // Block devices via lsblk
    type BlockDev = { name: string; size: string; type: string; vendor: string; model: string; mountpoint: string }
    const lsblkOut = await run('lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,VENDOR,MODEL -J').catch(() => '')
    let blockDevices: BlockDev[] = []
    try {
      const parsed = JSON.parse(lsblkOut)
      const flatten = (nodes: { name: string; size: string; type: string; mountpoint: string; vendor?: string; model?: string; children?: unknown[] }[]): BlockDev[] =>
        nodes.flatMap(n => [
          { name: n.name, size: n.size, type: n.type, mountpoint: n.mountpoint || '', vendor: (n.vendor || '').trim(), model: (n.model || '').trim() },
          ...(n.children ? flatten(n.children as typeof nodes) : [])
        ])
      blockDevices = flatten(parsed.blockdevices || []).filter((d: BlockDev) => d.type === 'disk')
    } catch { /* lsblk may not support -J */ }

    // SMART health (best-effort, no privilege escalation)
    type SmartHealth = { device: string; healthy: boolean | null; temperature: number | null }
    const smartResults: SmartHealth[] = []
    for (const dev of blockDevices) {
      const out = await run(`smartctl -H /dev/${dev.name} 2>/dev/null`).catch(() => '')
      if (!out) { smartResults.push({ device: dev.name, healthy: null, temperature: null }); continue }
      const healthy = out.includes('PASSED') || out.includes('OK') ? true : out.includes('FAILED') ? false : null
      const tempMatch = out.match(/Temperature[^:]*:\s*(\d+)/)
      const temperature = tempMatch ? parseInt(tempMatch[1]) : null
      smartResults.push({ device: dev.name, healthy, temperature })
    }

    return { partitions, blockDevices, smart: smartResults }
  })

  // ── System Overview ────────────────────────────────────────────────────────
  ipcMain.handle('system:status', async () => {
    // Hostname & OS
    const hostname = await run('hostname').catch(() => 'unknown')
    const osRelease = await readFile('/etc/os-release', 'utf8').catch(() => '')
    const getOsVal = (key: string) => osRelease.match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))?.[1] ?? ''
    const osName = getOsVal('PRETTY_NAME') || getOsVal('NAME')

    // Kernel & arch
    const kernel = await run('uname -r').catch(() => 'unknown')
    const arch = await run('uname -m').catch(() => 'unknown')

    // Uptime from /proc/uptime
    const uptimeRaw = await readFile('/proc/uptime', 'utf8').catch(() => '0')
    const uptimeSecs = parseFloat(uptimeRaw.split(' ')[0]) || 0
    const uptimeDays = Math.floor(uptimeSecs / 86400)
    const uptimeHrs = Math.floor((uptimeSecs % 86400) / 3600)
    const uptimeMins = Math.floor((uptimeSecs % 3600) / 60)

    // CPU info
    const cpuInfo = await readFile('/proc/cpuinfo', 'utf8').catch(() => '')
    const cpuModel = cpuInfo.match(/^model name\s*:\s*(.+)/m)?.[1]?.trim() ?? 'Unknown CPU'
    const cpuCores = (cpuInfo.match(/^processor\s*:/gm) || []).length

    // CPU usage (2 samples ~150ms apart)
    async function getCpuTimes() {
      const stat = await readFile('/proc/stat', 'utf8').catch(() => '')
      const nums = stat.split('\n')[0].split(/\s+/).slice(1).map(Number)
      const idle = nums[3] + (nums[4] || 0)
      return { idle, total: nums.reduce((a, b) => a + b, 0) }
    }
    const t1 = await getCpuTimes()
    await new Promise<void>(r => setTimeout(r, 150))
    const t2 = await getCpuTimes()
    const cpuUsage = Math.round((1 - (t2.idle - t1.idle) / (t2.total - t1.total)) * 100)

    // Memory from /proc/meminfo
    const memInfo = await readFile('/proc/meminfo', 'utf8').catch(() => '')
    const memGet = (key: string) => parseInt(memInfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? '0') * 1024
    const memTotal = memGet('MemTotal')
    const memFree = memGet('MemFree')
    const memBuffers = memGet('Buffers')
    const memCached = memGet('Cached')
    const memAvailable = memGet('MemAvailable')
    const memUsed = memTotal - memFree - memBuffers - memCached
    const swapTotal = memGet('SwapTotal')
    const swapFree = memGet('SwapFree')

    // Load averages
    const loadAvg = await readFile('/proc/loadavg', 'utf8').catch(() => '0 0 0')
    const [load1, load5, load15] = loadAvg.split(' ').map(parseFloat)

    // Process count
    const procCount = await run("ls /proc | grep -c '^[0-9]'").catch(() => '0')

    return {
      hostname: hostname.trim(),
      osName,
      kernel: kernel.trim(),
      arch: arch.trim(),
      uptime: { days: uptimeDays, hours: uptimeHrs, minutes: uptimeMins, totalSeconds: uptimeSecs },
      cpu: { model: cpuModel, cores: cpuCores, usage: Math.max(0, Math.min(100, cpuUsage)) },
      memory: {
        total: memTotal,
        used: Math.max(0, memUsed),
        available: memAvailable,
        swapTotal,
        swapUsed: swapTotal - swapFree
      },
      load: { one: load1 || 0, five: load5 || 0, fifteen: load15 || 0 },
      processes: parseInt(procCount.trim()) || 0
    }
  })

  // ── Network ────────────────────────────────────────────────────────────────
  ipcMain.handle('network:status', async () => {
    // Interfaces from `ip -j addr`
    type IpAddr = { addr_info: { family: string; local: string; prefixlen: number }[]; ifname: string; operstate: string; link_type: string; address?: string; stats64?: { rx: { bytes: number; packets: number; errors: number }; tx: { bytes: number; packets: number; errors: number } } }
    const ipOut = await run('ip -j addr show').catch(() => '[]')
    let ifaces: IpAddr[] = []
    try { ifaces = JSON.parse(ipOut) } catch { /* ignore */ }

    // Stats from /proc/net/dev
    const devStats: Record<string, { rxBytes: number; txBytes: number; rxPackets: number; txPackets: number }> = {}
    const procNet = await readFile('/proc/net/dev', 'utf8').catch(() => '')
    for (const line of procNet.split('\n').slice(2)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 10) continue
      const name = parts[0].replace(':', '')
      devStats[name] = {
        rxBytes: parseInt(parts[1]) || 0, rxPackets: parseInt(parts[2]) || 0,
        txBytes: parseInt(parts[9]) || 0, txPackets: parseInt(parts[10]) || 0
      }
    }

    // Default gateway
    const routeOut = await run('ip route show default').catch(() => '')
    const gateway = routeOut.match(/default via ([\d.]+)/)?.[1] ?? null
    const gatewayIface = routeOut.match(/dev (\S+)/)?.[1] ?? null

    // DNS from resolvectl (systemd-resolved) or /etc/resolv.conf
    let dnsServers: string[] = []
    const resolvectl = await run('resolvectl status --no-pager 2>/dev/null').catch(() => '')
    if (resolvectl) {
      const dns = resolvectl.match(/DNS Servers?:\s+(.+)/g)
      if (dns) dnsServers = dns.flatMap(l => l.replace(/DNS Servers?:\s+/, '').trim().split(/\s+/)).filter(Boolean)
    }
    if (dnsServers.length === 0) {
      const resolv = await readFile('/etc/resolv.conf', 'utf8').catch(() => '')
      dnsServers = [...resolv.matchAll(/^nameserver\s+(\S+)/gm)].map(m => m[1])
    }

    const interfaces = ifaces
      .filter(i => i.ifname !== 'lo')
      .map(i => {
        const v4 = i.addr_info?.find(a => a.family === 'inet')
        const v6 = i.addr_info?.find(a => a.family === 'inet6' && !a.local.startsWith('fe80'))
        const stats = devStats[i.ifname]
        return {
          name: i.ifname,
          state: i.operstate?.toLowerCase() ?? 'unknown',
          type: i.link_type ?? 'ether',
          mac: i.address ?? null,
          ipv4: v4 ? `${v4.local}/${v4.prefixlen}` : null,
          ipv6: v6 ? `${v6.local}/${v6.prefixlen}` : null,
          isDefault: i.ifname === gatewayIface,
          rx: stats?.rxBytes ?? 0,
          tx: stats?.txBytes ?? 0,
          rxPackets: stats?.rxPackets ?? 0,
          txPackets: stats?.txPackets ?? 0,
        }
      })

    return { interfaces, gateway, dnsServers: [...new Set(dnsServers)].slice(0, 4) }
  })

  // ── Processes ─────────────────────────────────────────────────────────────
  ipcMain.handle('processes:list', async (_, sortBy: 'cpu' | 'mem' = 'cpu') => {
    const col = sortBy === 'mem' ? '-%mem' : '-%cpu'
    const psOut = await run(`ps aux --sort=${col} --no-headers`).catch(() => '')
    type Proc = { pid: number; user: string; cpu: number; mem: number; vsz: number; rss: number; stat: string; command: string; name: string }
    const procs: Proc[] = []
    for (const line of psOut.split('\n').slice(0, 50)) {
      const p = line.trim().split(/\s+/)
      if (p.length < 11) continue
      const command = p.slice(10).join(' ')
      const name = command.replace(/^-/, '').split(/[\s/]/).pop()?.split('?')[0] || command.slice(0, 20)
      procs.push({
        pid: parseInt(p[1]) || 0,
        user: p[0],
        cpu: parseFloat(p[2]) || 0,
        mem: parseFloat(p[3]) || 0,
        vsz: parseInt(p[4]) || 0,
        rss: parseInt(p[5]) * 1024 || 0,
        stat: p[7],
        command: command.slice(0, 80),
        name: name.slice(0, 20)
      })
    }
    return procs
  })

  ipcMain.handle('processes:kill', async (_, pid: number, signal: 'TERM' | 'KILL' = 'TERM') => {
    if (!Number.isInteger(pid) || pid <= 1) throw new Error('Invalid PID')
    if (!['TERM', 'KILL'].includes(signal)) throw new Error('Invalid signal')
    try {
      await run(`kill -${signal} ${pid}`)
      return { ok: true }
    } catch {
      // Try privileged kill
      return privilegedOp('kill-process', String(pid), signal).then(() => ({ ok: true }))
    }
  })

  // ── Logs ───────────────────────────────────────────────────────────────────
  ipcMain.handle('logs:query', async (_, opts: {
    lines?: number; unit?: string; priority?: number; since?: string; grep?: string
  } = {}) => {
    const args = ['--output=json', '--no-pager', '--reverse']
    args.push(`-n`, String(opts.lines ?? 200))
    if (opts.unit)     args.push(`--unit=${opts.unit}`)
    if (opts.priority !== undefined) args.push(`--priority=0..${opts.priority}`)
    if (opts.since)    args.push(`--since=${opts.since}`)
    if (opts.grep)     args.push(`--grep=${opts.grep}`)

    const out = await run(`journalctl ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`).catch(() => '')

    type JEntry = { pid: number | null; priority: number; unit: string; message: string; timestamp: number; identifier: string }
    const entries: JEntry[] = []
    for (const line of out.split('\n')) {
      if (!line.startsWith('{')) continue
      try {
        const j = JSON.parse(line)
        entries.push({
          pid: j._PID ? parseInt(j._PID) : null,
          priority: parseInt(j.PRIORITY ?? '6'),
          unit: (j._SYSTEMD_UNIT || j.UNIT || j.SYSLOG_IDENTIFIER || 'kernel').replace('.service', ''),
          message: Array.isArray(j.MESSAGE) ? Buffer.from(j.MESSAGE).toString('utf8') : String(j.MESSAGE ?? ''),
          timestamp: Math.floor(parseInt(j.__REALTIME_TIMESTAMP ?? '0') / 1000),
          identifier: j.SYSLOG_IDENTIFIER ?? ''
        })
      } catch { /* skip malformed */ }
    }
    return entries
  })

  ipcMain.handle('logs:units', async () => {
    const out = await run("journalctl --field=_SYSTEMD_UNIT 2>/dev/null | sort -u | head -100").catch(() => '')
    return out.split('\n').map(l => l.trim().replace('.service', '')).filter(Boolean).sort()
  })

  // ── USB ────────────────────────────────────────────────────────────────────
  ipcMain.handle('usb:list', async () => {
    const out = await run('lsusb').catch(() => '')
    type UsbDevice = { bus: string; device: string; vendorId: string; productId: string; description: string; hub: boolean }
    const devices: UsbDevice[] = []
    for (const line of out.split('\n')) {
      // Bus 001 Device 004: ID 046d:c548 Logitech, Inc. Logi Bolt Receiver
      const m = line.match(/^Bus (\d+) Device (\d+): ID ([0-9a-f]{4}):([0-9a-f]{4})\s+(.*)$/i)
      if (!m) continue
      const description = m[5].trim()
      devices.push({
        bus: m[1], device: m[2],
        vendorId: m[3], productId: m[4],
        description: description || 'Unknown device',
        hub: /hub/i.test(description)
      })
    }
    return devices
  })

  // ── App Info ───────────────────────────────────────────────────────────────
  ipcMain.handle('app:info', async () => {
    const osRelease = await readFile('/etc/os-release', 'utf8').catch(() => '')
    const getVal = (key: string) => osRelease.match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))?.[1] ?? ''
    const osName = getVal('PRETTY_NAME') || getVal('NAME') || 'Linux'
    const { app } = await import('electron')
    return { version: app.getVersion(), osName }
  })

  // ── VPN ────────────────────────────────────────────────────────────────────
  ipcMain.handle('vpn:list', async () => {
    const out = await run('nmcli -t -f NAME,TYPE,STATE,DEVICE connection show').catch(() => '')
    type VpnConn = { name: string; type: string; active: boolean; device: string | null }
    const connections: VpnConn[] = []
    for (const line of out.split('\n')) {
      // nmcli uses ':' as separator but colons can appear in names — split from right
      const parts = line.split(':')
      if (parts.length < 3) continue
      const type = parts[1]
      if (!['vpn', 'wireguard'].includes(type)) continue
      connections.push({
        name: parts[0],
        type,
        active: parts[2] === 'activated',
        device: parts[3]?.trim() || null
      })
    }
    return connections
  })

  ipcMain.handle('vpn:connect', async (_, name: string) => {
    if (!name || name.length > 64) throw new Error('Invalid connection name')
    try {
      await run(`nmcli connection up ${JSON.stringify(name)}`)
    } catch (e) {
      // Fallback: privileged helper (some VPNs need root)
      await privilegedOp('vpn-up', name)
    }
    return { ok: true }
  })

  ipcMain.handle('vpn:disconnect', async (_, name: string) => {
    if (!name || name.length > 64) throw new Error('Invalid connection name')
    await run(`nmcli connection down ${JSON.stringify(name)}`).catch(async () => {
      await privilegedOp('vpn-down', name)
    })
    return { ok: true }
  })

  // ── Badge counts ───────────────────────────────────────────────────────────
  ipcMain.handle('badge:counts', async () => {
    // Pending updates (fast — cached by apt)
    const aptOut = await run('apt list --upgradable 2>/dev/null').catch(() => '')
    const upgradeLines = aptOut.split('\n').filter(l => l.includes('[upgradable'))
    const securityUpdates = upgradeLines.filter(l => l.toLowerCase().includes('-security')).length
    const pendingUpdates = upgradeLines.length

    // High disk usage (any partition ≥ 85 %)
    const dfOut = await run("df --output=pcent,target -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null").catch(() => '')
    const highDisk = dfOut.split('\n').some(l => {
      const m = l.trim().match(/^(\d+)%/)
      return m && parseInt(m[1]) >= 85
    })

    // Active VPN
    const vpnOut = await run("nmcli -t -f TYPE,STATE connection show 2>/dev/null").catch(() => '')
    const vpnActive = vpnOut.split('\n').some(l => {
      const [type, state] = l.split(':')
      return ['vpn', 'wireguard'].includes(type) && state === 'activated'
    })

    return { pendingUpdates, securityUpdates, highDisk, vpnActive }
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
