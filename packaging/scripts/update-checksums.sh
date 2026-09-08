#!/usr/bin/env bash
# Bumps the pinned version + sha256 checksum in the AUR/COPR/OBS packaging
# manifests to match a published GitHub release tag.
#
# Usage: packaging/scripts/update-checksums.sh v0.1.1
#
# The release must already be published (not draft) - draft assets 404 for
# unauthenticated fetches, which is how these manifests' build steps (and
# real end users) will hit them. See packaging/README.md.

set -euo pipefail

TAG="${1:?usage: update-checksums.sh vX.Y.Z}"
VERSION="${TAG#v}"
REPO="Homezloco/linux-command-centre"
ASSET="linux-command-centre-${TAG}-linux-x64.tar.gz"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "Fetching ${ASSET} from ${REPO}@${TAG}..."
gh release download "$TAG" -R "$REPO" -D "$WORKDIR" -p "$ASSET" --clobber

SHA=$(sha256sum "$WORKDIR/$ASSET" | cut -d' ' -f1)
echo "sha256: $SHA"

# AUR
sed -i \
  -e "s/^pkgver=.*/pkgver=${VERSION}/" \
  -e "/# tarball - kept in sync by update-checksums.sh/s/'[0-9a-f]\{64\}'/'${SHA}'/" \
  "$ROOT/packaging/aur/PKGBUILD"

# COPR
sed -i \
  -e "s/^%global rpm_sha256 .*/%global rpm_sha256 ${SHA}/" \
  -e "s/^Version:.*/Version:        ${VERSION}/" \
  "$ROOT/packaging/copr/linux-command-centre.spec"

# OBS spec (same fields as COPR's)
sed -i \
  -e "s/^%global rpm_sha256 .*/%global rpm_sha256 ${SHA}/" \
  -e "s/^Version:.*/Version:        ${VERSION}/" \
  "$ROOT/packaging/obs/linux-command-centre.spec"

# OBS _service - url/filename params reference the tag directly
sed -i \
  -e "s#<param name=\"url\">.*</param>#<param name=\"url\">https://github.com/${REPO}/releases/download/${TAG}/${ASSET}</param>#" \
  -e "s#<param name=\"filename\">.*</param>#<param name=\"filename\">${ASSET}</param>#" \
  "$ROOT/packaging/obs/_service"

cat <<EOF

Updated to ${VERSION} (sha256=${SHA:0:12}...).

Next steps:
  - AUR: cd packaging/aur && makepkg --printsrcinfo > .SRCINFO, then push
  - COPR: trigger a rebuild (webhook, or copr-cli buildscm)
  - OBS:  cd packaging/obs && osc service runall && osc addremove && osc commit
EOF
