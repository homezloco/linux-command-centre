# Native packaging

Manifests for distributing Linux Command Centre outside the Snap Store: AUR,
Fedora COPR, and openSUSE Build Service (OBS), plus a self-hosted APT
repository as a stand-in for a Launchpad PPA.

## Why these are all "-bin" style packages

The app needs network access mid-build (`npm install`, and electron-builder
downloading the Electron binary), but AUR's `makepkg`, Launchpad's build
farm, and (by default) COPR/OBS chroots all disable network access during
the actual build step — only fetching declared `source=()`/`Source0` URLs is
allowed. Rebuilding Electron from scratch inside each of those sandboxes
would mean vendoring `node_modules` *and* Electron's ~100MB platform binary
into the source tarball for every one of them.

Instead, every manifest here does the same thing: fetch the already-built
`linux-command-centre-vX.Y.Z-linux-x64.tar.gz` from the GitHub Release (built
once, by `.github/workflows/release.yml`), and repackage that. This is the
same pattern VS Code, Discord, and Slack use for their AUR/RPM/DEB packages.

Each manifest also installs, on top of the tarball's contents:
- `linux-command-centre.desktop` (the tarball itself has no desktop entry —
  only the deb/rpm/AppImage targets in `package.json` add one, and CI
  doesn't currently build the AppImage target despite it being listed)
- `icon.png` → `hicolor/512x512/apps/linux-command-centre.png`
- `io.lcc.helper.policy` → `/usr/share/polkit-1/actions/`, needed for the
  root-privileged hardware-config helper (`helper/lcc-helper.js`) to be
  authorized via `pkexec`

**Heads up:** that policy file is *not* currently included in the `.deb` or
`.rpm` that `release.yml`/`package.json` build either — `extraResources` in
`package.json` only copies `helper/lcc-helper.js`, not
`helper/io.lcc.helper.policy`. Only the Snap build's `override-build` step
copies it. That means hardware-config actions likely fail silently today on
anyone who installed the existing GitHub Release `.deb`/`.rpm` outside of
this packaging. Each manifest here works around it by installing its own
bundled copy of the policy file, independent of that gap — but the upstream
`extraResources` list is worth fixing separately so the primary `.deb`/`.rpm`
work too.

## Hard prerequisite: publish the release

`release.yml` creates releases as **drafts**. Draft release assets return
404 to unauthenticated requests — which is exactly how AUR's build servers,
COPR, and OBS's `download_url` source service fetch things. **The `v0.1.0`
release must be published (un-drafted) before any of these will build.**
That's a manual call since it makes the release publicly visible — do it via
the GitHub UI or `gh release edit v0.1.0 --draft=false` when ready.

## Bumping to a new version

After tagging and **publishing** a new release:

```
packaging/scripts/update-checksums.sh v0.1.1
```

This re-downloads the release tarball, updates `pkgver`/`Version` and the
sha256 checksum in the AUR/COPR/OBS manifests, and reminds you to regenerate
`packaging/aur/.SRCINFO`. Then push each manifest to its respective service
(see the README in each subdirectory).

## Layout

- `aur/` — Arch User Repository (`linux-command-centre-bin`)
- `copr/` — Fedora COPR (`.spec`)
- `obs/` — openSUSE Build Service (`_service` + `.spec`)
- `apt-repo/` — self-hosted APT repo (Launchpad PPA substitute — see that
  README for why a real PPA isn't practical here)
- `scripts/` — shared release-bump tooling

## Also in this directory (pre-existing, not part of this batch)

`com.electron.linux-command-centre.yml`, its `.metainfo.xml`, and
`build-release.sh` are an earlier, unfinished Flathub manifest — its
`sha256` is still a placeholder and its source URL doesn't match the actual
release asset naming (`linux-command-centre-0.1.0-linux-amd64.tar.gz` vs.
the real `linux-command-centre-v0.1.0-linux-x64.tar.gz`). Flathub shares
Snap's sandboxing/review tension (see the top-level `--filesystem=host`
permission it requests), so it wasn't part of this round of native-channel
packaging. Worth finishing or removing later, but out of scope here.
