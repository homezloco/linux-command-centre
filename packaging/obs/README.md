# openSUSE Build Service (OBS)

`_service` + `.spec` for building on https://build.opensuse.org, covering
openSUSE/Fedora/CentOS-family repos. Same `-bin` repackaging approach as
`../aur/` and `../copr/` — see `../README.md` for why.

`mode="disabled"` on the `download_url` service means it only runs when you
invoke it explicitly (`osc service runall`), not automatically server-side —
the fetched tarball gets committed as a normal source file, so the actual
OBS build never needs network access.

## Prerequisites

1. An OBS account: https://build.opensuse.org (Sign Up)
2. `osc` installed (`zypper install osc` / `dnf install osc` / `apt install osc`),
   configured with your OBS credentials (`osc` prompts on first use)
3. The `v0.1.0` GitHub release **published** (not draft) — see `../README.md`

## First-time publish

```
osc checkout home:<your-obs-username>   # or create the project first via the web UI
cd home:<your-obs-username>
osc mkpac linux-command-centre
cp /path/to/packaging/obs/_service /path/to/packaging/obs/linux-command-centre.spec \
   /path/to/packaging/obs/linux-command-centre.desktop \
   /path/to/packaging/obs/io.lcc.helper.policy \
   /path/to/packaging/obs/icon.png \
   linux-command-centre/
cd linux-command-centre

osc service runall          # runs download_url, fetches the tarball locally
osc add *.tar.gz            # add the fetched tarball as a tracked source
osc add _service linux-command-centre.spec linux-command-centre.desktop \
   io.lcc.helper.policy icon.png
osc commit -m "Initial import: 0.1.0"
```

By default an OBS home project (`home:<username>`) only builds for the
repos you've enabled under its "Repositories" settings in the web UI —
add openSUSE Tumbleweed/Leap and/or Fedora/CentOS targets there to get
binaries for each.

## Bumping to a new version

After tagging and publishing a new release:
```
../scripts/update-checksums.sh vX.Y.Z    # updates Version:, the sha256 check, and _service
osc service runall
osc addremove
osc commit -m "Update to X.Y.Z"
```
