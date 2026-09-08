%global appdir /opt/linux-command-centre
%global rpm_sha256 2a3728e42ff002259b7264ece737089ab30e0a9a24f76266da59aba4494819d9

Name:           linux-command-centre
Version:        0.1.0
Release:        1%{?dist}
Summary:        Centralised Linux system management dashboard

License:        MIT
URL:            https://github.com/Homezloco/linux-command-centre
Source0:        https://github.com/Homezloco/linux-command-centre/releases/download/v%{version}/linux-command-centre-v%{version}-linux-x64.tar.gz
Source1:        linux-command-centre.desktop
Source2:        io.lcc.helper.policy
Source3:        icon.png

BuildArch:      x86_64
Requires:       nodejs, polkit, gtk3, nss, libXScrnSaver, libXtst, alsa-lib, at-spi2-core, mesa-libGL

# electron-builder's tarball isn't a real source archive we can build from
# in a sandboxed mock chroot without network (npm install + the Electron
# binary download need it) - this repackages the tarball already built by
# .github/workflows/release.yml. See ../README.md.
%description
A desktop system management dashboard for Ubuntu/Linux, built with Electron.
Manage system info, network (VPN, Wi-Fi, Bluetooth), hardware, storage,
services, logs, and more from one place.

%prep
%setup -q -c -n %{name}-%{version}
echo "%{rpm_sha256}  %{SOURCE0}" | sha256sum -c -

%build
# nothing to build - prebuilt binary

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}%{appdir}

shopt -s nullglob
entries=(*/)
if [ "${#entries[@]}" -eq 1 ]; then
  cp -a "${entries[0]}." %{buildroot}%{appdir}/
else
  cp -a ./. %{buildroot}%{appdir}/
fi

# Chromium's sandbox helper needs setuid root to work; the tarball ships it
# as plain 0755. The %attr() override in %files makes rpm apply this at
# real install time (running as root); this chmod keeps buildroot consistent.
chmod 4755 %{buildroot}%{appdir}/chrome-sandbox

mkdir -p %{buildroot}%{_bindir}
ln -s %{appdir}/linux-command-centre %{buildroot}%{_bindir}/linux-command-centre

install -Dm644 %{SOURCE1} %{buildroot}%{_datadir}/applications/linux-command-centre.desktop
install -Dm644 %{SOURCE2} %{buildroot}%{_datadir}/polkit-1/actions/io.lcc.helper.policy
install -Dm644 %{SOURCE3} %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/linux-command-centre.png

%files
%{appdir}/
%attr(4755,root,root) %{appdir}/chrome-sandbox
%{_bindir}/linux-command-centre
%{_datadir}/applications/linux-command-centre.desktop
%{_datadir}/polkit-1/actions/io.lcc.helper.policy
%{_datadir}/icons/hicolor/512x512/apps/linux-command-centre.png

%changelog
* Mon Sep 07 2026 Homezloco <shanepeterholmes@gmail.com> - 0.1.0-1
- Initial packaging
