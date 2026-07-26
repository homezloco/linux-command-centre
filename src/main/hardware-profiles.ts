// =============================================================================
// Hardware profiles
//
// Per-machine quirks (a touchpad that needs rebinding, an out-of-tree camera
// driver, a vendor EC module) do not generalise, and inlining them as
// `if (isVendor) { … }` blocks in ipc.ts stops scaling once there are more
// than a couple of machines to support.
//
// A profile is *description*: which module to look for, which sysfs path to
// read, what to say when it is missing, and — by name only — which privileged
// operation offers to fix it. A profile can reference an action; it cannot
// define one. That boundary matters: lcc-helper runs as root via pkexec and
// its safety rests entirely on being a fixed allowlist, so profiles must never
// become a way to introduce privileged code.
//
// To support a new machine, add a profile below. No changes to ipc.ts.
// =============================================================================

import { existsSync, readdirSync } from 'fs'

export type CheckState = 'ok' | 'warn' | 'fail' | 'info'

export type HwCheck = {
  id: string
  label: string
  state: CheckState
  detail: string
  action?: string
}

/** Shell access handed to profile evaluation, so profiles stay side-effect free. */
export type ProfileContext = {
  run: (cmd: string) => Promise<string>
  runFile: (file: string, args: string[]) => Promise<string>
  sysread: (path: string) => Promise<string>
  kernel: string
}

type Base = {
  id: string
  label: string
  /** State when the condition does not hold. Defaults to 'warn'. */
  failState?: CheckState
  okDetail: string
  failDetail: string
  /** Privileged operation offered as a "Fix" when the check does not pass. */
  action?: string
}

export type ProfileCheck =
  /**
   * Kernel module is loaded (checked via /sys/module, not lsmod).
   * Set `prefix` for driver families that ship as several modules with no
   * bare parent — intel_skl_int3472 for instance only ever exists as
   * _common/_discrete/_tps68470, so an exact match is always a false negative.
   */
  | (Base & { kind: 'module'; module: string; prefix?: boolean })
  /** A path exists on disk. */
  | (Base & { kind: 'path'; path: string })
  /** A sysfs file reads back an expected value. */
  | (Base & { kind: 'sysfs'; path: string; equals: string })
  /** A systemd unit is active. */
  | (Base & { kind: 'systemd'; unit: string })
  /** A DKMS package is built and installed for the running kernel. */
  | (Base & { kind: 'dkms'; package: string })
  /**
   * Logic that does not reduce to the above. Still in-tree code reviewed with
   * the app — this is an escape hatch for complex *reads*, never a way to
   * gain privilege.
   */
  | { kind: 'custom'; id: string; evaluate: (ctx: ProfileContext) => Promise<HwCheck | null> }

export type HardwareProfile = {
  id: string
  name: string
  /** Matched against lowercased DMI sys_vendor / product_name. */
  match: (dmi: { vendor: string; product: string }) => boolean
  checks: ProfileCheck[]
}

// ── Evaluation ───────────────────────────────────────────────────────────────

async function evaluateCheck(c: ProfileCheck, ctx: ProfileContext): Promise<HwCheck | null> {
  if (c.kind === 'custom') return c.evaluate(ctx)

  let pass = false
  switch (c.kind) {
    case 'module': {
      // /sys/module rather than parsing lsmod output.
      const name = c.module.replace(/-/g, '_')
      pass = c.prefix
        ? readdirSync('/sys/module').some(m => m.startsWith(name))
        : existsSync(`/sys/module/${name}`)
      break
    }
    case 'path':
      pass = existsSync(c.path)
      break
    case 'sysfs':
      pass = (await ctx.sysread(c.path).catch(() => '')).trim() === c.equals
      break
    case 'systemd':
      pass = (await ctx.run(`systemctl is-active ${c.unit}`).catch(() => '')).trim() === 'active'
      break
    case 'dkms': {
      const out = await ctx.run('dkms status 2>/dev/null').catch(() => '')
      pass = out.split('\n')
        .filter(l => l.startsWith(`${c.package}/`))
        .some(l => l.includes(ctx.kernel) && l.includes('installed'))
      break
    }
  }

  return {
    id: c.id,
    label: c.label,
    state: pass ? 'ok' : (c.failState ?? 'warn'),
    detail: pass ? c.okDetail : c.failDetail,
    action: pass ? undefined : c.action
  }
}

export async function evaluateProfile(
  profile: HardwareProfile,
  ctx: ProfileContext
): Promise<HwCheck[]> {
  const out: HwCheck[] = []
  for (const c of profile.checks) {
    // One bad check must not blank the whole panel.
    const r = await evaluateCheck(c, ctx).catch(() => null)
    if (r) out.push(r)
  }
  return out
}

export function selectProfile(dmi: { vendor: string; product: string }): HardwareProfile | null {
  const key = { vendor: dmi.vendor.toLowerCase(), product: dmi.product.toLowerCase() }
  return profiles.find(p => p.match(key)) ?? null
}

// ── Profiles ─────────────────────────────────────────────────────────────────

const huawei: HardwareProfile = {
  id: 'huawei-matebook',
  name: 'Huawei MateBook',
  match: d => d.vendor.includes('huawei'),
  checks: [
    {
      kind: 'systemd',
      id: 'touchpad-rebind',
      label: 'Touchpad rebind service',
      unit: 'touchpad-rebind.service',
      okDetail: 'Running — fixes the GXTP7863 boot regression',
      failDetail: 'Not active — the touchpad may be dead until rebound',
      failState: 'fail',
      action: 'touchpad-rebind'
    },
    {
      kind: 'path',
      id: 'libinput-quirk',
      label: 'libinput touchpad quirk',
      path: '/etc/libinput/local-overrides.quirks',
      okDetail: '/etc/libinput/local-overrides.quirks installed',
      failDetail: 'Missing — the touchpad may not behave as a clickpad'
    },
    ...([
      { m: 'intel_ipu6', prefix: false },
      { m: 'ipu_bridge', prefix: false },
      // Ships only as _common/_discrete/_tps68470 — never a bare module.
      { m: 'intel_skl_int3472', prefix: true }
    ] as const).map(({ m, prefix }): ProfileCheck => ({
      kind: 'module',
      id: `mod-${m}`,
      label: m,
      module: m,
      prefix,
      okDetail: 'Kernel module loaded',
      failDetail: 'Not loaded'
    })),
    {
      kind: 'module',
      id: 'mod-gc2607',
      label: 'gc2607 sensor driver',
      module: 'gc2607',
      okDetail: 'V4L2 sensor driver loaded',
      failDetail: 'Not loaded — camera unavailable',
      failState: 'fail',
      action: 'camera-load'
    },
    // The camera stack is out-of-tree, so it is tied to the kernel it was built
    // against. Without DKMS it works until the next kernel upgrade and then
    // silently stops, with nothing obvious pointing at the cause.
    {
      kind: 'dkms',
      id: 'dkms-gc2607',
      label: 'DKMS: gc2607',
      package: 'gc2607',
      okDetail: 'Built for the running kernel — rebuilds automatically on upgrade',
      failDetail: 'Not built for the running kernel — the camera will not work until rebuilt',
      failState: 'fail',
      action: 'camera-rebuild'
    },
    {
      kind: 'dkms',
      id: 'dkms-ipu-bridge-gc2607',
      label: 'DKMS: ipu-bridge-gc2607',
      package: 'ipu-bridge-gc2607',
      okDetail: 'Built for the running kernel — rebuilds automatically on upgrade',
      failDetail: 'Not built for the running kernel — the sensor will not be wired up',
      failState: 'fail',
      action: 'camera-rebuild'
    },
    {
      kind: 'sysfs',
      id: 'acpi-camera',
      label: 'Camera ACPI node (GCTI2607)',
      path: '/sys/bus/acpi/devices/GCTI2607:00/status',
      equals: '15',
      okDetail: 'ACPI enabled (status=15)',
      failDetail: 'Not enabled in the ACPI table',
      failState: 'info'
    },
    {
      // The I2C device is ACPI-enumerated, so its existence proves nothing —
      // it is present even when ipu_bridge has no GCTI2607 entry. What marks a
      // working stack is that it lost waiting_for_supplier and gained a driver.
      kind: 'custom',
      id: 'camera-sensor-bound',
      async evaluate() {
        const dev = '/sys/bus/i2c/devices/i2c-GCTI2607:00'
        if (!existsSync(dev)) return null
        const bound = existsSync(`${dev}/driver`)
        const waiting = existsSync(`${dev}/waiting_for_supplier`)
        return {
          id: 'camera-sensor-bound',
          label: 'GC2607 sensor binding',
          state: bound ? 'ok' : 'fail',
          detail: bound
            ? 'Bound to gc2607 with regulator suppliers attached'
            : waiting
              ? 'Waiting for a supplier — ipu_bridge has no GCTI2607 entry'
              : 'Enumerated but no driver bound',
          action: bound ? undefined : 'camera-load'
        }
      }
    },
    {
      // Under Secure Boot an unsigned module installs without complaint and is
      // then refused at load time, with nothing pointing at signing.
      kind: 'custom',
      id: 'camera-module-signed',
      async evaluate(ctx) {
        const sb = (await ctx.run('mokutil --sb-state 2>/dev/null').catch(() => '')).toLowerCase()
        if (!sb.includes('enabled')) return null
        const info = await ctx.runFile('modinfo', ['-k', ctx.kernel, 'gc2607']).catch(() => '')
        if (!info) return null
        const signer = info.match(/^signer:\s*(.+)$/m)?.[1]?.trim()
        return {
          id: 'camera-module-signed',
          label: 'GC2607 module signature',
          state: signer ? 'ok' : 'fail',
          detail: signer
            ? `Signed by "${signer}"`
            : 'Unsigned — Secure Boot will refuse to load it',
          action: signer ? undefined : 'camera-rebuild'
        }
      }
    },
    {
      kind: 'custom',
      id: 'camera-hal',
      async evaluate(ctx) {
        const out = await ctx.run("dpkg-query -W -f='${Status}' libcamhal-ipu6epmtl 2>/dev/null").catch(() => '')
        const installed = out.includes('install ok installed')
        return {
          id: 'camera-hal',
          label: 'Camera HAL (libcamhal-ipu6epmtl)',
          state: installed ? 'ok' : 'warn',
          detail: installed ? 'Installed' : 'Not installed — sudo apt install libcamhal-ipu6epmtl'
        }
      }
    },
    {
      kind: 'custom',
      id: 'fingerprint',
      async evaluate(ctx) {
        const fp = await ctx.run('fprintd-list $(whoami) 2>/dev/null').catch(() => '')
        const enrolled = fp.includes('enrolled') || fp.includes('finger')
        const goodix = (await ctx.run('lsusb 2>/dev/null').catch(() => '')).toLowerCase().includes('goodix')
        return {
          id: 'fingerprint',
          label: 'Fingerprint reader',
          state: enrolled ? 'ok' : goodix ? 'fail' : 'info',
          detail: enrolled
            ? 'Enrolled fingerprints found'
            : goodix
              ? 'Goodix sensor detected but no Linux driver exists for it'
              : 'No fingerprint device detected'
        }
      }
    }
  ]
}

const msi: HardwareProfile = {
  id: 'msi',
  name: 'MSI',
  match: d => d.vendor.includes('micro-star') || d.vendor.includes('msi'),
  checks: [
    {
      kind: 'module',
      id: 'msi-ec',
      label: 'MSI EC kernel module',
      module: 'msi_ec',
      okDetail: 'msi_ec loaded — fan/battery control available',
      failDetail: 'Not loaded — install msi-ec-dkms for fan control'
    },
    {
      kind: 'custom',
      id: 'cooler-boost',
      async evaluate(ctx) {
        const v = (await ctx.run(
          'cat /sys/class/firmware-attributes/*/attributes/cooler_boost/current_value 2>/dev/null'
        ).catch(() => '')).trim()
        if (!v) return null
        return {
          id: 'cooler-boost',
          label: 'Cooler Boost',
          state: 'info',
          detail: `Cooler Boost: ${v === '1' ? 'ON' : 'OFF'}`
        }
      }
    }
  ]
}

/** Order matters only if two profiles could match the same machine. */
export const profiles: HardwareProfile[] = [huawei, msi]
