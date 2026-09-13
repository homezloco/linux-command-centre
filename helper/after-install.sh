#!/bin/bash
# electron-builder postinst (deb/rpm). This replaces electron-builder's
# built-in after-install.tpl wholesale, so the default behavior (bin symlink,
# chrome-sandbox permissions, mime/desktop db refresh) is reproduced below
# before the Linux Command Centre-specific steps.
set -e

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# ── Linux Command Centre: privileged helper ─────────────────────────────────
# Installs the root-owned helper the app invokes via pkexec for hardware
# changes (battery threshold, GRUB, firewall, users, ...). The polkit action
# io.lcc.helper.run is bound to the exact path of the wrapper script below
# (see helper/io.lcc.helper.policy), so this authorizes only this fixed
# script — never an arbitrary `pkexec node ...` invocation. See
# src/main/privilege.ts and helper/lcc-helper.js.
RESOURCES="/opt/${sanitizedProductName}/resources/helper"
install -d -m755 /usr/lib/linux-command-centre
install -m644 "$RESOURCES/lcc-helper.js" /usr/lib/linux-command-centre/lcc-helper.js
install -m755 "$RESOURCES/lcc-helper" /usr/lib/linux-command-centre/lcc-helper
install -Dm644 "$RESOURCES/io.lcc.helper.policy" /usr/share/polkit-1/actions/io.lcc.helper.policy
