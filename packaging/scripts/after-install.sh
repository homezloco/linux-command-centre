#!/bin/bash
# deb post-install script.
# NOTE: electron-builder REPLACES its generated postinst with this file,
# so it must also perform the steps the default postinst would have done.

# Chromium's sandbox helper needs setuid root; electron-builder ships it
# as 0755, which makes the app abort on kernels that restrict
# unprivileged user namespaces (Ubuntu 23.10+).
chmod 4755 /opt/linux-command-centre/chrome-sandbox || true

# Register the /usr/bin symlink (normally done by the default postinst).
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --install /usr/bin/linux-command-centre \
        linux-command-centre /opt/linux-command-centre/linux-command-centre 1 || true
else
    ln -sf /opt/linux-command-centre/linux-command-centre /usr/bin/linux-command-centre || true
fi
