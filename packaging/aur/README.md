# AUR — `linux-command-centre-bin`

Repackages the GitHub Release tarball; see `../README.md` for why this is a
`-bin` package rather than a from-source build.

## Prerequisites (one-time, on your end)

1. An AUR account: https://aur.archlinux.org/register
2. An SSH key added to that account (Account → My Account → SSH Public Key)
3. The `v0.1.0` GitHub release **published** (not draft) — see `../README.md`

## Test the build locally (on Arch/Manjaro, or an Arch container)

```
cd packaging/aur
makepkg -si          # builds and installs, prompts for missing sha256sums
```

If `sha256sums` still contains `REPLACE_WITH_TARBALL_SHA256`, run
`../scripts/update-checksums.sh v0.1.0` first, or run
`makepkg -g >> PKGBUILD` and manually replace the placeholder with the
generated line's tarball hash.

Sanity-check that hardware-config actions actually prompt for `pkexec`
auth after installing — that depends on `/usr/share/polkit-1/actions/io.lcc.helper.policy`
landing correctly and on system `node` being present (added as a `depends`
because the policy's `exec.path` is pinned to `/usr/bin/node`, not
Electron's bundled Node).

## Publish

Generate `.SRCINFO` (AUR requires this to be committed and in sync with
PKGBUILD):
```
makepkg --printsrcinfo > .SRCINFO
```

First-time publish:
```
git clone ssh://aur@aur.archlinux.org/linux-command-centre-bin.git aur-repo
cp PKGBUILD .SRCINFO linux-command-centre.desktop io.lcc.helper.policy icon.png aur-repo/
cd aur-repo
git add PKGBUILD .SRCINFO linux-command-centre.desktop io.lcc.helper.policy icon.png
git commit -m "Initial import: 0.1.0"
git push
```

On every future version bump: run `../scripts/update-checksums.sh vX.Y.Z`,
regenerate `.SRCINFO`, copy the changed files into `aur-repo/`, commit, push.
