#!/usr/bin/env node
// =============================================================================
// lcc-helper — Privileged operations helper for Linux Command Centre
// Runs as root via pkexec. Accepts only a strict whitelist of operations.
// Install: sudo cp helper/lcc-helper.js /usr/lib/lcc-helper.js
// =============================================================================

'use strict'

const { execFileSync, execSync } = require('child_process')
const { writeFileSync, readdirSync, existsSync, readFileSync } = require('fs')

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

  'set-brightness'(valueStr) {
    const pct = parseInt(valueStr)
    if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('Value must be 0–100')
    const bl = findBacklight()
    if (!bl) throw new Error('No backlight found')
    const max = parseInt(sysread(`${bl}/max_brightness`))
    const raw = Math.round((pct / 100) * max)
    syswrite(`${bl}/brightness`, raw)
    console.log(`Brightness set to ${pct}% (raw ${raw}/${max})`)
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
      // Values that must be quoted
      const quoted = ['GRUB_CMDLINE_LINUX_DEFAULT', 'GRUB_TIMEOUT_STYLE'].includes(key)
      const formatted = quoted ? `"${value}"` : value
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
    if (!service || !/^[a-zA-Z0-9@._-]+\.service$/.test(service)) throw new Error('Invalid service name')
    if (!['start', 'stop', 'enable', 'disable', 'restart'].includes(action)) throw new Error('Invalid action')
    execFileSync('systemctl', [action, service])
    console.log(`systemctl ${action} ${service}`)
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

  'apt-upgrade'(packagesStr) {
    if (!packagesStr || packagesStr.length === 0) throw new Error('No packages specified')
    const packages = packagesStr.split(',').filter(p => p.length > 0 && /^[a-zA-Z0-9._+-]+$/.test(p))
    if (packages.length === 0) throw new Error('Invalid package names')
    execFileSync('apt-get', ['install', '--only-upgrade', '-y', ...packages], { stdio: 'inherit' })
    console.log(`Upgraded packages: ${packages.join(', ')}`)
  },

  'apt-upgrade-all'() {
    execFileSync('apt-get', ['upgrade', '-y'], { stdio: 'inherit' })
    console.log('System upgrade completed')
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

try {
  ops[operation](...args)
  process.exit(0)
} catch (e) {
  console.error(`Error: ${e.message}`)
  process.exit(1)
}
