#!/bin/bash
set -e

# Linux Command Centre — Build & Release Script
# Usage: ./packaging/build-release.sh [version]

VERSION="${1:-0.1.0}"
APP_NAME="linux-command-centre"
RELEASE_DIR="release"

echo "=== Building Linux Command Centre v${VERSION} ==="

# Clean previous builds
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"

# Install dependencies
echo "--- Installing dependencies ---"
npm install

# Build the application
echo "--- Building application ---"
npm run build

# Package for Linux (electron-builder)
echo "--- Packaging for Linux targets ---"
npm run package

# Rename artifacts with version
echo "--- Renaming artifacts ---"
cd "${RELEASE_DIR}"

for f in *.deb; do
  [ -f "$f" ] && mv "$f" "${APP_NAME}_${VERSION}_amd64.deb" 2>/dev/null || true
done

for f in *.rpm; do
  [ -f "$f" ] && mv "$f" "${APP_NAME}-${VERSION}.x86_64.rpm" 2>/dev/null || true
done

for f in *.AppImage; do
  [ -f "$f" ] && mv "$f" "${APP_NAME}-${VERSION}-x86_64.AppImage" 2>/dev/null || true
done

for f in *.tar.gz; do
  [ -f "$f" ] && mv "$f" "${APP_NAME}-${VERSION}-linux-x64.tar.gz" 2>/dev/null || true
done

cd ..

echo ""
echo "=== Build complete ==="
echo "Artifacts in ${RELEASE_DIR}/:"
ls -lh "${RELEASE_DIR}/"
echo ""
echo "Next steps:"
echo "  1. Update packaging/com.electron.linux-command-centre.yml with the tar.gz SHA256"
echo "  2. Create a GitHub release and upload the artifacts"
echo "  3. Submit to Flathub: https://github.com/flathub/flathub/wiki/App-Submission"
echo "  4. Submit to Snap Store: snapcraft upload release/*.snap"
