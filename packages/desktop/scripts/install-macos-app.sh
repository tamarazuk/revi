#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer only supports macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Revi.app"
SOURCE_APP="${SCRIPT_DIR}/../src-tauri/target/release/bundle/macos/${APP_NAME}"
SOURCE_BINARY="${SCRIPT_DIR}/../src-tauri/target/release/revi-desktop"
SOURCE_ICON="${SCRIPT_DIR}/../src-tauri/icons/icon.icns"
DEST_DIR="/Applications"
DEST_APP="${DEST_DIR}/${APP_NAME}"
DEST_MACOS_DIR="${DEST_APP}/Contents/MacOS"
DEST_RESOURCES_DIR="${DEST_APP}/Contents/Resources"

if [[ ! -d "${SOURCE_APP}" && ! -f "${SOURCE_BINARY}" ]]; then
  echo "Neither macOS app bundle nor binary was found." >&2
  echo "Expected one of:" >&2
  echo "  ${SOURCE_APP}" >&2
  echo "  ${SOURCE_BINARY}" >&2
  echo "Run: pnpm --filter @revi/desktop tauri:build" >&2
  exit 1
fi

if [[ ! -w "${DEST_DIR}" ]]; then
  echo "No write access to ${DEST_DIR}." >&2
  echo "Run with sudo:" >&2
  echo "  sudo bash ${SCRIPT_DIR}/install-macos-app.sh" >&2
  exit 1
fi

rm -rf "${DEST_APP}"

if [[ -d "${SOURCE_APP}" ]]; then
  cp -R "${SOURCE_APP}" "${DEST_APP}"
else
  mkdir -p "${DEST_MACOS_DIR}" "${DEST_RESOURCES_DIR}"
  cp "${SOURCE_BINARY}" "${DEST_MACOS_DIR}/Revi"
  chmod +x "${DEST_MACOS_DIR}/Revi"

  if [[ -f "${SOURCE_ICON}" ]]; then
    cp "${SOURCE_ICON}" "${DEST_RESOURCES_DIR}/icon.icns"
  fi

  cat > "${DEST_APP}/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Revi</string>
  <key>CFBundleExecutable</key>
  <string>Revi</string>
  <key>CFBundleIconFile</key>
  <string>icon</string>
  <key>CFBundleIdentifier</key>
  <string>dev.revi.app</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Revi</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST
fi

# Prevent stale quarantine warnings in local development builds.
xattr -dr com.apple.quarantine "${DEST_APP}" >/dev/null 2>&1 || true

echo "Installed ${APP_NAME} to ${DEST_DIR}."
