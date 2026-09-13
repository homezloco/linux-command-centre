#!/usr/bin/env node
// =============================================================================
// lcc-helper — Privileged operations helper for Linux Command Centre
// Runs as root via pkexec. Accepts only a strict whitelist of operations.
// Install: sudo cp helper/lcc-helper.js /usr/lib/lcc-helper.js
// =============================================================================

'use strict'

const { execFileSync, execSync, spawnSync, spawn } = require('child_process')
const { writeFileSync, readdirSync, existsSync, readFileSync, unlinkSync, mkdtempSync, rmSync } = require('fs')

const [, , operation, ...args] = process.argv

function syswrite(p, val) {
  writeFileSync(p, String(val), 'utf8')
}

function sysread(p) {
  return readFileSync(p, 'utf8').trim()
}

function findBattery() {
  const entries = readdirSync('/sys/class/power_supply')
  const bat = entries.find(e => e.startsWith('BAT'))
  return bat ? `/sys/class/power_supply/${bat}` : null
}

function findBacklight() {
  if (!existsSync('/sys/class/backlight')) return null
  const entries = readdirSync('/sys/class/backlight')
  return entries.length > 0 ? `/sys/class/backlight/${entries[0]}` : null
}

function runApt(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('apt-get', args, { env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      const s = d.toString()
      stdout += s
      process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
      const s = d.toString()
      stderr += s
      process.stderr.write(d)
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `apt-get exited with status ${code}`))
    })
  })
}

// Like runApt but for an arbitrary command, and never rejects on a non-zero
// exit — lynis in particular returns non-zero for reasons unrelated to
// whether the audit actually completed, so the caller inspects stdout itself.
function runLive(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env })
    let stdout = ''
    child.stdout.on('data', (d) => { stdout += d.toString(); process.stdout.write(d) })
    child.stderr.on('data', (d) => { process.stderr.write(d) })
    child.on('error', (err) => resolve({ code: -1, stdout, error: err }))
    child.on('close', (code) => resolve({ code, stdout }))
  })
}

// Shared guard for user-delete/user-toggle-sudo. The username regex alone
// doesn't stop a caller from naming a real system account (e.g. "daemon",
// "www-data") or the very account that authenticated this pkexec call —
// both would otherwise pass the regex and reach userdel/usermod/gpasswd.
// PKEXEC_UID is set by pkexec to the uid of the unprivileged user who
// invoked it, not something the caller can override from the app side.
function assertModifiableUser(username) {
  let uid
  try {
    uid = parseInt(execFileSync('id', ['-u', username], { encoding: 'utf8' }).trim(), 10)
  } catch {
    throw new Error(`No such user: ${username}`)
  }
  if (!Number.isInteger(uid) || uid < 1000 || uid === 65534) {
    throw new Error('Refusing to modify a system account')
  }
  const callerUid = parseInt(process.env.PKEXEC_UID, 10)
  if (Number.isInteger(callerUid) && uid === callerUid) {
    throw new Error('Refusing to modify the account that authenticated this action')
  }
}

const ops = {
  'set-battery-threshold'(valueStr) {
    const value = parseInt(valueStr)
    if (isNaN(value) || value < 50 || value > 100) throw new Error('Value must be 50–100')
    const bat = findBattery()
    if (!bat) throw new Error('No battery found')
    const p = `${bat}/charge_control_end_threshold`
    if (!existsSync(p)) throw new Error('Charge threshold not supported on this kernel/driver')
    syswrite(p, value)
    console.log(`Battery threshold set to ${value}%`)
  },

  'set-brightness'(valStr) {
    const val = parseInt(valStr, 10)
    if (Number.isNaN(val) || val < 0 || val > 100) throw new Error('Invalid brightness value')
    // Try brightnessctl first (modern, works with multiple controllers)
    try {
      execSync(`brightnessctl set ${val}%`, { stdio: 'pipe' })
      console.log(`Set brightness to ${val}% via brightnessctl`)
      return
    } catch {
      // brightnessctl not available, fall through to sysfs
    }
    const backlight = execSync('ls /sys/class/backlight/ 2>/dev/null | head -n1').toString().trim()
    if (!backlight) throw new Error('No backlight found')
    const maxStr = execSync(`cat /sys/class/backlight/${backlight}/max_brightness`).toString().trim()
    const max = parseInt(maxStr, 10)
    if (Number.isNaN(max) || max === 0) throw new Error('Could not read max brightness')
    const raw = Math.round((val / 100) * max)
    execSync(`echo ${raw} > /sys/class/backlight/${backlight}/brightness`)
    console.log(`Set brightness to ${val}% (${raw}/${max})`)
  },

  'wifi-toggle'() {
    const out = execSync('rfkill list wifi').toString()
    const blocked = out.includes('Soft blocked: yes')
    execFileSync('rfkill', [blocked ? 'unblock' : 'block', 'wifi'])
    console.log(blocked ? 'WiFi enabled' : 'WiFi disabled')
  },

  'bluetooth-toggle'() {
    const out = execSync('rfkill list bluetooth').toString()
    const blocked = out.includes('Soft blocked: yes')
    execFileSync('rfkill', [blocked ? 'unblock' : 'block', 'bluetooth'])
    console.log(blocked ? 'Bluetooth enabled' : 'Bluetooth disabled')
  },

  'touchpad-rebind'() {
    const unbind = '/sys/bus/i2c/drivers/i2c_hid_acpi/unbind'
    const bind   = '/sys/bus/i2c/drivers/i2c_hid_acpi/bind'
    try { syswrite(unbind, 'i2c-GXTP7863:00') } catch { /* may already be unbound */ }
    execSync('sleep 1')
    syswrite(bind, 'i2c-GXTP7863:00')
    console.log('Touchpad rebound')
  },

  // Rebuild out-of-tree kernel modules for the running kernel. The MateBook
  // camera (GC2607 sensor + a patched ipu_bridge) is out-of-tree, so a kernel
  // upgrade leaves it built only for the old kernel and the camera silently
  // stops working. `dkms autoinstall` rebuilds everything registered.
  //
  // Deliberately takes no arguments: accepting a script or package path here
  // would let any caller run arbitrary code as root through pkexec.
  'camera-rebuild'() {
    let out
    try {
      out = execFileSync('dkms', ['autoinstall'], { encoding: 'utf8' })
    } catch (e) {
      const detail = (e.stdout || '') + (e.stderr || '')
      throw new Error(`dkms autoinstall failed: ${detail.trim() || e.message}`)
    }
    try { execFileSync('depmod', ['-a']) } catch { /* non-fatal */ }
    console.log(out.trim() || 'DKMS autoinstall complete')
  },

  // Load the camera module stack in dependency order. gc2607 must come after
  // intel_ipu6_isys or its async subdev never joins the media graph.
  'camera-load'() {
    const mods = [
      'videodev', 'v4l2_async', 'intel_skl_int3472_discrete',
      'intel_ipu6', 'ipu_bridge', 'intel_ipu6_isys', 'gc2607'
    ]
    const failed = []
    for (const m of mods) {
      try {
        execFileSync('modprobe', [m], { stdio: 'pipe' })
      } catch {
        failed.push(m)
      }
    }
    if (failed.includes('gc2607')) {
      throw new Error('gc2607 failed to load — it may not be built for this kernel, or is unsigned under Secure Boot')
    }
    console.log(failed.length ? `Loaded, could not load: ${failed.join(', ')}` : 'Camera module stack loaded')
  },

  // Windows stores the RTC in local time by default, Linux expects UTC. With
  // both installed the clock jumps by the timezone offset on every reboot
  // between them. Fixing it on the Linux side is the usual remedy.
  'rtc-set-utc'() {
    execFileSync('timedatectl', ['set-local-rtc', '0', '--adjust-system-clock'], { stdio: 'inherit' })
    console.log('Hardware clock set to UTC and system clock adjusted')
  },

  'set-sleep-state'(state) {
    if (!['s2idle', 'deep'].includes(state)) throw new Error('State must be s2idle or deep')
    syswrite('/sys/power/mem_sleep', state)
    console.log(`Sleep state set to ${state}`)
  },

  'set-power-profile'(profile) {
    const allowed = ['balanced', 'performance', 'power-saver']
    if (!allowed.includes(profile)) throw new Error(`Profile must be one of: ${allowed.join(', ')}`)
    if (existsSync('/sys/firmware/acpi/platform_profile')) {
      syswrite('/sys/firmware/acpi/platform_profile', profile)
    } else {
      throw new Error('No power profile mechanism found')
    }
    console.log(`Power profile set to ${profile}`)
  },

  'grub-set'(...pairs) {
    if (pairs.length === 0 || pairs.length % 2 !== 0) throw new Error('Must provide key value pairs')
    const allowed = new Set(['GRUB_TIMEOUT', 'GRUB_DEFAULT', 'GRUB_CMDLINE_LINUX_DEFAULT', 'GRUB_TIMEOUT_STYLE'])
    let content = readFileSync('/etc/default/grub', 'utf8')
    for (let i = 0; i < pairs.length; i += 2) {
      const key = pairs[i]
      const value = pairs[i + 1]
      if (!allowed.has(key)) throw new Error(`Disallowed GRUB key: ${key}`)
      if (typeof value !== 'string' || value.length > 512) throw new Error(`Invalid value for ${key}`)
      // This file is sourced as a shell script by update-grub/grub-mkconfig. Every value
      // below is written back double-quoted, so reject the characters that stay meaningful
      // even inside double quotes (backtick/$ for substitution, " to break out, \ to
      // escape, newlines to smuggle in an extra line) — this is the actual trust boundary,
      // the renderer-side check is only a friendlier first error message.
      if (/[`$"\\\r\n]/.test(value)) throw new Error(`Invalid characters in ${key}`)
      if (key === 'GRUB_TIMEOUT' && !/^-?\d+$/.test(value)) throw new Error('GRUB_TIMEOUT must be an integer')
      if (key === 'GRUB_TIMEOUT_STYLE' && !['menu', 'hidden', 'countdown'].includes(value)) {
        throw new Error('Invalid GRUB_TIMEOUT_STYLE')
      }
      const formatted = `"${value}"`
      if (new RegExp(`^\\s*${key}=`, 'm').test(content)) {
        content = content.replace(new RegExp(`^(\\s*${key})=.*`, 'm'), `$1=${formatted}`)
      } else {
        content += `\n${key}=${formatted}\n`
      }
    }
    writeFileSync('/etc/default/grub', content, 'utf8')
    execSync('update-grub 2>&1')
    console.log('GRUB config updated')
  },

  'service-action'(action, service) {
    if (!service || !/^[a-zA-Z0-9@._-]+\.(service|timer)$/.test(service)) throw new Error('Invalid service/timer name')
    if (!['start', 'stop', 'enable', 'disable', 'restart'].includes(action)) throw new Error('Invalid action')
    execFileSync('systemctl', [action, service])
    console.log(`systemctl ${action} ${service}`)
  },

  'set-timezone'(tz) {
    if (!tz || !/^[A-Za-z_]+\/[A-Za-z_\/+\-]+$/.test(tz)) throw new Error('Invalid timezone')
    execFileSync('timedatectl', ['set-timezone', tz])
    console.log(`Timezone set to ${tz}`)
  },

  'set-ntp'(enabled) {
    if (!['true', 'false'].includes(enabled)) throw new Error('Must be true or false')
    execFileSync('timedatectl', ['set-ntp', enabled])
    console.log(`NTP set to ${enabled}`)
  },

  'vpn-up'(name) {
    if (!name || name.length > 64) throw new Error('Invalid connection name')
    execFileSync('nmcli', ['connection', 'up', name], { stdio: 'inherit' })
    console.log(`VPN up: ${name}`)
  },

  'vpn-down'(name) {
    if (!name || name.length > 64) throw new Error('Invalid connection name')
    execFileSync('nmcli', ['connection', 'down', name], { stdio: 'inherit' })
    console.log(`VPN down: ${name}`)
  },

  'vpn-create-wireguard'(name, gateway) {
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid connection name')
    if (!gateway) throw new Error('Gateway is required')
    // Create a basic WireGuard connection (user will need to configure keys)
    execFileSync('nmcli', ['connection', 'add',
      'type', 'wireguard',
      'con-name', name,
      'ifname', name,
      'wireguard.peer-routes', 'yes'
    ], { stdio: 'inherit' })
    console.log(`WireGuard VPN created: ${name}`)
  },

  // name/gateway are non-secret and arrive as argv. Everything that can be a
  // credential (username, password, certFile, ovpnConfig) arrives as a JSON
  // object over stdin instead — pkexec logs its full argv to the system
  // journal, so passing secrets as CLI arguments would leave them in a
  // persistent, readable log. See privilegedOpWithStdin in privilege.ts.
  'vpn-create-openvpn'(name, gateway) {
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid connection name')
    const { username, password, certFile, ovpnConfig } = JSON.parse(readFileSync(0, 'utf8') || '{}')
    if (!gateway && !ovpnConfig) throw new Error('Gateway or config is required')

    // If we have an .ovpn config, import it via nmcli
    if (ovpnConfig) {
      // Written under a private, root-only directory (mkdtemp under /run)
      // rather than a predictable /tmp/vpn-<name>.ovpn path — a local
      // attacker could otherwise pre-create that path as a symlink and have
      // us (running as root) write the config through it onto an arbitrary
      // file.
      const tmpDir = mkdtempSync('/run/lcc-vpn-')
      // File is named <name>.ovpn because nmcli derives the imported
      // connection's id from the file basename — importing a generic
      // "config.ovpn" would create a connection called "config".
      const tmpFile = `${tmpDir}/${name}.ovpn`
      try {
        writeFileSync(tmpFile, ovpnConfig, 'utf8')
        execFileSync('nmcli', ['connection', 'import', 'type', 'openvpn', 'file', tmpFile], { stdio: 'inherit' })
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    } else {
      const args = ['connection', 'add',
        'type', 'vpn',
        'vpn-type', 'openvpn',
        'con-name', name,
        'ifname', '*'
      ]

      // nmcli replaces a property when it is passed more than once, so
      // vpn.data must be built as one comma-separated value. Passing it twice
      // (remote=, then ca=) silently dropped the remote and produced a
      // connection with no server to dial.
      const vpnData = [`remote=${gateway}`]
      if (username) {
        // username is configuration, not a secret — it belongs in vpn.data.
        // password-flags=0 means "the password is stored in the connection",
        // which is only true if we actually store it below.
        vpnData.push('connection-type=password', `username=${username}`, 'password-flags=0')
      }
      if (certFile && existsSync(certFile)) {
        vpnData.push(`ca=${certFile}`)
      }
      args.push('vpn.data', vpnData.join(', '))

      // The password was previously accepted and then never used, so every
      // connection created this way was missing the credential it claimed to
      // have stored, and failed to authenticate for no visible reason.
      if (password) {
        args.push('vpn.secrets', `password=${password}`)
      }

      execFileSync('nmcli', args, { stdio: 'inherit' })
    }
    console.log(`OpenVPN connection created: ${name}`)
  },

  // name/peerPublicKey/peerEndpoint/address are non-secret and arrive as
  // argv. privateKey arrives as a JSON object over stdin instead — pkexec
  // logs its full argv to the system journal, so a private key passed as a
  // CLI argument would leave it in a persistent, readable log. See
  // privilegedOpWithStdin in privilege.ts. (Our own public key is not
  // needed here: NetworkManager derives it from the private key, and it was
  // only ever shown in the UI for the user to hand to the peer.)
  //
  // The key also never reaches nmcli's argv: `connection add` would expose
  // `wireguard.private-key=...` on the command line, and `connection import`
  // only supports VPN plugin types (not wireguard). Instead we write the
  // NetworkManager keyfile directly — this process already runs as root —
  // and ask NM to reload it.
  'vpn-create-wireguard-full'(name, peerPublicKey, peerEndpoint, address) {
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid connection name')
    const { privateKey } = JSON.parse(readFileSync(0, 'utf8') || '{}')
    const addr = address || '10.200.200.2/24'

    // These values are written verbatim into a keyfile — strict format
    // checks keep them single-line and well-formed.
    const wgKey = /^[A-Za-z0-9+/]{43}=$/
    if (!wgKey.test(privateKey || '')) throw new Error('Invalid private key')
    if (!wgKey.test(peerPublicKey || '')) throw new Error('Invalid peer public key')
    if (peerEndpoint && !/^[a-zA-Z0-9_.[\]-]+:\d{1,5}$/.test(peerEndpoint)) throw new Error('Invalid endpoint')
    if (!/^[0-9a-fA-F.:]+\/\d{1,3}$/.test(addr)) throw new Error('Invalid address')

    // `connection add` would refuse to overwrite an existing profile; keep
    // the same semantics rather than silently clobbering a keyfile.
    const existing = execFileSync('nmcli', ['-t', '-f', 'NAME', 'connection', 'show'], { encoding: 'utf8' })
    if (existing.split('\n').includes(name)) throw new Error(`Connection "${name}" already exists`)

    const lines = [
      '[connection]',
      `id=${name}`,
      'type=wireguard',
      `interface-name=${name}`,
      '',
      '[wireguard]',
      `private-key=${privateKey}`,
      'peer-routes=true',
      '',
      `[wireguard-peer.${peerPublicKey}]`,
      'allowed-ips=0.0.0.0/0'
    ]
    if (peerEndpoint) lines.push(`endpoint=${peerEndpoint}`)
    lines.push('', '[ipv4]', 'method=manual', `address1=${addr}`, '', '[ipv6]', 'method=disabled', '')

    const keyfilePath = `/etc/NetworkManager/system-connections/${name}.nmconnection`
    writeFileSync(keyfilePath, lines.join('\n'), { mode: 0o600 })
    try {
      execFileSync('nmcli', ['connection', 'reload'], { stdio: 'inherit' })
      // A malformed keyfile is silently skipped on reload — verify NM
      // actually picked the profile up.
      execFileSync('nmcli', ['connection', 'show', 'id', name], { stdio: 'pipe' })
    } catch (e) {
      rmSync(keyfilePath, { force: true })
      try { execFileSync('nmcli', ['connection', 'reload'], { stdio: 'inherit' }) } catch { /* best effort */ }
      throw e
    }

    console.log(`WireGuard connection created: ${name}`)
  },

  'logs-query'(argsJson) {
    const args = JSON.parse(argsJson)
    if (!Array.isArray(args)) throw new Error('Invalid arguments')

    // These args are normally assembled entirely in the app's main process
    // (see logs:query in ipc.ts) from a fixed set of options, never taken
    // verbatim from the renderer. Whitelisting them here is defense in
    // depth: it caps what a compromised main process could still do with
    // this op to read-only journalctl queries — never e.g. --file, which
    // would point journalctl at an arbitrary log file as root.
    const FLAG_ONLY = new Set(['--output=json', '--no-pager', '--reverse'])
    const FLAG_VALIDATORS = {
      '-n': (v) => /^\d{1,5}$/.test(v),
      '-p': (v) => /^\d(\.\.\d)?$/.test(v),
      '--unit': (v) => /^[a-zA-Z0-9@._:-]+$/.test(v),
      '--since': (v) => typeof v === 'string' && v.length <= 64 && !/[`$\\]/.test(v),
      '--grep': (v) => typeof v === 'string' && v.length <= 200
    }

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (FLAG_ONLY.has(arg)) continue
      const validate = FLAG_VALIDATORS[arg]
      if (validate) {
        const value = args[i + 1]
        if (typeof value !== 'string' || !validate(value)) throw new Error(`Invalid value for ${arg}`)
        i++
        continue
      }
      throw new Error(`Disallowed journalctl argument: ${arg}`)
    }

    const result = execFileSync('journalctl', args, {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      shell: false
    })
    return result
  },

  'firewall-action'(action) {
    if (!['enable', 'disable'].includes(action)) throw new Error('Action must be enable or disable')
    execFileSync('ufw', [action], { stdio: 'inherit' })
    console.log(`UFW ${action}d`)
  },

  'kill-process'(pid, signal = 'TERM') {
    const pidNum = parseInt(pid)
    if (!Number.isInteger(pidNum) || pidNum <= 1) throw new Error('Invalid PID')
    if (!['TERM', 'KILL'].includes(signal)) throw new Error('Invalid signal')
    execFileSync('kill', [`-${signal}`, String(pidNum)])
    console.log(`Sent ${signal} to PID ${pidNum}`)
  },

  async 'apt-upgrade'(packagesStr) {
    if (!packagesStr || packagesStr.length === 0) throw new Error('No packages specified')
    const packages = packagesStr.split(',').filter(p => p.length > 0 && /^[a-zA-Z0-9._+-]+$/.test(p))
    if (packages.length === 0) throw new Error('Invalid package names')
    const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
    await runApt(['-o', 'DPkg::Lock::Timeout=300', 'update'], env)
    // The user explicitly picked these packages from the "available updates" list, so
    // honor that choice even if apt would otherwise defer them (phased rollout) or the
    // resolver would need to pull in new dependencies (a plain --only-upgrade refuses that).
    await runApt([
      '-o', 'DPkg::Lock::Timeout=300',
      '-o', 'APT::Get::Always-Include-Phased-Updates=true',
      'install', '-y', ...packages
    ], env)
    console.log(`Upgraded packages: ${packages.join(', ')}`)
  },

  async 'apt-upgrade-all'() {
    const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
    const phased = ['-o', 'APT::Get::Always-Include-Phased-Updates=true']
    await runApt(['-o', 'DPkg::Lock::Timeout=300', 'update'], env)
    // Plain `apt-get upgrade` silently skips packages deferred by phased rollout and
    // anything "kept back" because it would need to install/remove other packages.
    // "Upgrade All" should mean all of what the panel just listed, so use dist-upgrade
    // and opt in to phased updates explicitly.
    await runApt(['-o', 'DPkg::Lock::Timeout=300', ...phased, 'dist-upgrade', '-y'], env)

    // dist-upgrade's system-wide resolver still won't remove an already-installed
    // package to satisfy an upgrade (e.g. a plugin ABI bump) — it leaves it "kept back"
    // rather than touch anything not explicitly requested. Anything still upgradable at
    // this point needs to be named directly, the same way an individual package upgrade
    // already works, since apt is willing to remove conflicting packages for an
    // explicitly named target.
    const listing = spawnSync('apt', ['list', '--upgradable'], { encoding: 'utf8' }).stdout || ''
    const remaining = [...listing.matchAll(/^(\S+)\/\S+\s+\S+\s+\S+\s+\[upgradable from:/gm)].map((m) => m[1])
    if (remaining.length > 0) {
      await runApt(['-o', 'DPkg::Lock::Timeout=300', ...phased, 'install', '-y', ...remaining], env)
    }
    console.log('System upgrade completed')
  },

  // name is looked up in a fixed table rather than used directly as the apt
  // package name, so this can never install anything but these three tools.
  async 'tool-install'(name) {
    const allowed = { clamav: 'clamav', lynis: 'lynis', 'unattended-upgrades': 'unattended-upgrades' }
    const pkg = allowed[name]
    if (!pkg) throw new Error('Unknown tool')
    const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
    await runApt(['-o', 'DPkg::Lock::Timeout=300', 'update'], env)
    await runApt(['-o', 'DPkg::Lock::Timeout=300', 'install', '-y', pkg], env)
    console.log(`Installed ${pkg}`)
  },

  'set-auto-upgrades'(enabled) {
    if (!['true', 'false'].includes(enabled)) throw new Error('Must be true or false')
    const val = enabled === 'true' ? '1' : '0'
    const confPath = '/etc/apt/apt.conf.d/20auto-upgrades'
    writeFileSync(
      confPath,
      `APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "${val}";\n`,
      'utf8'
    )
    // Timers ship enabled by default; re-enabling is a no-op if already on and
    // recovers a system where they were previously stopped or masked.
    try { execFileSync('systemctl', ['enable', '--now', 'apt-daily.timer', 'apt-daily-upgrade.timer']) } catch { /* best-effort */ }
    console.log(`Unattended upgrades ${val === '1' ? 'enabled' : 'disabled'}`)
  },

  // Takes no arguments — this always runs the same fixed audit, so there's no
  // user-controlled input that could turn this into arbitrary root execution.
  async 'lynis-audit'() {
    const { code, stdout, error } = await runLive('lynis', ['audit', 'system', '--quick', '--no-colors'])
    if (error) throw new Error(error.code === 'ENOENT' ? 'lynis not found — install it first' : error.message)
    if (!stdout.includes('Lynis')) throw new Error(`Lynis audit failed (exit ${code})`)
    console.log('Lynis audit complete')
  },

  // Takes no arguments — the package list comes from dpkg's own residual
  // ("rc" state) packages, not from the caller, so nothing here can be used
  // to purge an arbitrary package.
  async 'purge-residual-packages'() {
    const listing = execSync('dpkg -l | awk \'$1=="rc"{print $2}\'', { encoding: 'utf8' })
    const packages = listing.split('\n').map((s) => s.trim()).filter(Boolean)
    if (packages.length === 0) {
      console.log('No residual packages to purge')
      return
    }
    const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
    await runApt(['-o', 'DPkg::Lock::Timeout=300', 'purge', '-y', ...packages], env)
    console.log(`Purged ${packages.length} residual package(s): ${packages.join(', ')}`)
  },

  // Fixed, non-parameterized content — nothing here comes from the caller.
  'blacklist-unused-protocols'() {
    const confPath = '/etc/modprobe.d/lcc-blacklist-unused-protocols.conf'
    const content = [
      '# Added by Linux Command Centre — disables kernel modules for network',
      '# protocols not used by default, reducing kernel attack surface.',
      'install dccp /bin/true',
      'install sctp /bin/true',
      'install rds /bin/true',
      'install tipc /bin/true',
      ''
    ].join('\n')
    writeFileSync(confPath, content, 'utf8')
    console.log(`Wrote ${confPath}`)
  },

  'user-add'(username, fullName) {
    if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(username)) throw new Error('Invalid username')
    const args = ['-m', '-s', '/bin/bash']
    if (fullName && fullName !== username) { args.push('-c'); args.push(fullName) }
    args.push(username)
    execFileSync('useradd', args)
    console.log(`User added: ${username}`)
  },

  'user-delete'(username) {
    if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(username)) throw new Error('Invalid username')
    if (username === 'root') throw new Error('Cannot delete root')
    assertModifiableUser(username)
    execFileSync('userdel', ['-r', username])
    console.log(`User deleted: ${username}`)
  },

  'user-toggle-sudo'(username, action) {
    if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(username)) throw new Error('Invalid username')
    if (!['add', 'remove'].includes(action)) throw new Error('Action must be add or remove')
    assertModifiableUser(username)
    if (action === 'add') {
      execFileSync('usermod', ['-aG', 'sudo', username])
    } else {
      execFileSync('gpasswd', ['-d', username, 'sudo'])
    }
    console.log(`Sudo ${action === 'add' ? 'granted to' : 'revoked from'} ${username}`)
  },

  'firewall-status'() {
    const out = execSync('ufw status numbered 2>&1').toString()
    process.stdout.write(out)
  },

  'dmidecode-memory'() {
    const out = execFileSync('dmidecode', ['-t', 'memory'], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
    process.stdout.write(out)
  },

  'set-sysctl'(key, valueStr) {
    const allowed = ['vm.swappiness', 'vm.vfs_cache_pressure']
    if (!allowed.includes(key)) throw new Error('Unsupported sysctl key')
    const value = parseInt(valueStr, 10)
    if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error('Value must be 0-1000')
    execFileSync('sysctl', ['-w', `${key}=${value}`], { stdio: 'inherit' })

    // Persist across reboots
    const confPath = '/etc/sysctl.d/99-lcc-tuning.conf'
    let lines = existsSync(confPath) ? readFileSync(confPath, 'utf8').split('\n').filter(Boolean) : []
    lines = lines.filter((l) => !l.startsWith(`${key}=`))
    lines.push(`${key}=${value}`)
    writeFileSync(confPath, lines.join('\n') + '\n', 'utf8')
    console.log(`${key} set to ${value} (persisted to ${confPath})`)
  },

  'firewall-rule-add'(action, port, proto) {
    if (!['allow', 'deny', 'reject'].includes(action)) throw new Error('Invalid action')
    if (!/^\d+$/.test(port) || parseInt(port) > 65535) throw new Error('Invalid port')
    if (!['tcp', 'udp', 'any'].includes(proto)) throw new Error('Invalid protocol')
    const rule = proto === 'any' ? port : `${port}/${proto}`
    execFileSync('ufw', [action, rule], { stdio: 'inherit' })
    console.log(`UFW rule added: ${action} ${rule}`)
  },

  'firewall-delete-rule'(numStr) {
    const num = parseInt(numStr)
    if (isNaN(num) || num < 1) throw new Error('Invalid rule number')
    execFileSync('ufw', ['--force', 'delete', String(num)], { stdio: 'inherit' })
    console.log(`UFW rule ${num} deleted`)
  },

  'printer-delete'(name) {
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error('Invalid printer name')
    execFileSync('lpadmin', ['-x', name])
    console.log(`Printer deleted: ${name}`)
  },

  'set-locale'(locale) {
    if (!/^[a-zA-Z]{2,8}(_[A-Z]{2,4})?(\.[A-Za-z0-9-]+)?(@\w+)?$/.test(locale)) throw new Error('Invalid locale')
    execFileSync('localectl', ['set-locale', `LANG=${locale}`])
    console.log(`Locale set to ${locale}`)
  },

  'hosts-write'() {
    // Content arrives over stdin rather than a shared /tmp file — nothing on disk for a
    // local process to swap for a symlink between our write and this read.
    const content = readFileSync(0, 'utf8')
    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(content)) throw new Error('Invalid characters in content')
    if (!content.includes('127.0.0.1') && !content.includes('localhost')) {
      throw new Error('Content must contain localhost entry')
    }
    writeFileSync('/etc/hosts', content, 'utf8')
    console.log('/etc/hosts updated')
  },

  'smart-info'(device) {
    if (!device || !/^\/dev\/[a-zA-Z0-9]+$/.test(device)) throw new Error('Invalid device path')
    const result = spawnSync('smartctl', ['--json=c', '-a', device], { encoding: 'utf8' })
    if (result.error) {
      if (result.error.code === 'ENOENT') throw new Error('smartctl not found — install with: sudo apt install smartmontools')
      throw result.error
    }
    const output = result.stdout || ''
    if (!output || !output.includes('{')) throw new Error(result.stderr?.trim() || 'No SMART data returned')
    process.stdout.write(output)
  },

  'resolv-write'() {
    // Content arrives over stdin rather than a shared /tmp file — nothing on disk for a
    // local process to swap for a symlink between our write and this read.
    const content = readFileSync(0, 'utf8')
    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(content)) throw new Error('Invalid characters in resolv content')
    // Must contain at least one nameserver
    if (!content.includes('nameserver')) throw new Error('Content must contain at least one nameserver')
    // Unlink the symlink (systemd-resolved manages it) if it exists as a symlink
    const { lstatSync, unlinkSync } = require('fs')
    try {
      const stat = lstatSync('/etc/resolv.conf')
      if (stat.isSymbolicLink()) unlinkSync('/etc/resolv.conf')
    } catch { /* ignore */ }
    writeFileSync('/etc/resolv.conf', content, 'utf8')
    console.log('/etc/resolv.conf updated')
  }
}

if (!operation) {
  console.error('Usage: lcc-helper <operation> [args...]')
  console.error('Operations:', Object.keys(ops).join(', '))
  process.exit(1)
}

if (!ops[operation]) {
  console.error(`Unknown operation: ${operation}`)
  process.exit(1)
}

(async () => {
  try {
    await ops[operation](...args)
    process.exit(0)
  } catch (e) {
    console.error(`Error: ${e.message || e}`)
    process.exit(1)
  }
})()
