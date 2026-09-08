# Fedora COPR

`.spec` for building on https://copr.fedorainfracloud.org. Same `-bin`
repackaging approach as `../aur/` and `../obs/` — see `../README.md` for why.

## Prerequisites

1. A Fedora account (COPR uses the same login): https://copr.fedorainfracloud.org
2. `copr-cli` installed and configured (`dnf install copr-cli`, then get your
   API token from https://copr.fedorainfracloud.org/api/ and save it to
   `~/.config/copr`)
3. The `v0.1.0` GitHub release **published** (not draft) — see `../README.md`

## Test the build locally (on Fedora, or a Fedora container)

```
cd packaging/copr
rpmbuild -bs --define "_sourcedir $(pwd)" --define "_srcrpmdir $(pwd)" linux-command-centre.spec
mock -r fedora-40-x86_64 linux-command-centre-0.1.0-1.fc40.src.rpm
```

## Publish

Create the project once (web UI, or):
```
copr-cli create linux-command-centre --chroot fedora-40-x86_64 --chroot fedora-41-x86_64
```

Build from this spec + its local sources:
```
copr-cli build linux-command-centre \
  --nowait \
  packaging/copr/linux-command-centre.spec \
  packaging/copr/linux-command-centre.desktop \
  packaging/copr/io.lcc.helper.policy \
  packaging/copr/icon.png
```

(COPR's plain `build` command only accepts a single spec/srpm target — if it
rejects the extra local sources, build a source RPM locally first with the
`rpmbuild -bs` command above and upload that instead:
`copr-cli build linux-command-centre linux-command-centre-0.1.0-1.fc40.src.rpm`.)

## Bumping to a new version

```
../scripts/update-checksums.sh vX.Y.Z
copr-cli build linux-command-centre --nowait <srpm or spec+sources as above>
```
