// systemd units whose stop/restart/disable is confirmed before running
// (spec: "Dangerous units"). `sshd` is here *and* confirmed from Security so the
// unit table can never stop SSH with one click.
export const DANGEROUS_UNITS = new Set([
  'NetworkManager.service',
  'systemd-networkd.service',
  'systemd-resolved.service',
  'NetworkManager-wait-online.service',
  'display-manager.service',
  'gdm.service', 'gdm3.service', 'sddm.service', 'lightdm.service',
  'dbus.service', 'dbus-broker.service',
  'systemd-logind.service',
  'systemd-udevd.service',
  'ssh.service', 'sshd.service',
])

/** True for units that need a ConfirmDialog before stop / restart / disable. */
export function isDangerousUnit(name: string): boolean {
  const full = name.includes('.') ? name : `${name}.service`
  return DANGEROUS_UNITS.has(full)
}
