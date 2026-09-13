#!/bin/bash
# electron-builder postrm (deb/rpm). Replaces electron-builder's built-in
# after-remove.tpl wholesale, so the default behavior (removing the bin
# symlink) is reproduced below before the Linux Command Centre-specific
# cleanup.
set -e

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/usr/bin/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

# ── Linux Command Centre: privileged helper ─────────────────────────────────
rm -f /usr/lib/linux-command-centre/lcc-helper.js
rm -f /usr/lib/linux-command-centre/lcc-helper
rmdir /usr/lib/linux-command-centre 2>/dev/null || true
rm -f /usr/share/polkit-1/actions/io.lcc.helper.policy
