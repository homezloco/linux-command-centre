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
    execFileSync('userdel', ['-r', username])
    console.log(`User deleted: ${username}`)
  },

  'user-toggle-sudo'(username, action) {
    if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(username)) throw new Error('Invalid username')
    if (!['add', 'remove'].includes(action)) throw new Error('Action must be add or remove')
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

  'hosts-write'(tmpPath) {
    if (!tmpPath || !/^\/tmp\/lcc-hosts-\d+$/.test(tmpPath)) throw new Error('Invalid temp path')
    if (!existsSync(tmpPath)) throw new Error('Temp file not found')
    const content = readFileSync(tmpPath, 'utf8')
    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(content)) throw new Error('Invalid characters in content')
    if (!content.includes('127.0.0.1') && !content.includes('localhost')) {
      throw new Error('Content must contain localhost entry')
    }
    writeFileSync('/etc/hosts', content, 'utf8')
    console.log('/etc/hosts updated')
  },

  'resolv-write'(tmpPath) {
    if (!tmpPath || !/^\/tmp\/lcc-resolv-\d+$/.test(tmpPath)) throw new Error('Invalid temp path')
    if (!existsSync(tmpPath)) throw new Error('Temp file not found')
    const content = readFileSync(tmpPath, 'utf8')
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

try {
  ops[operation](...args)
  process.exit(0)
} catch (e) {
  console.error(`Error: ${e.message}`)
  process.exit(1)
}
