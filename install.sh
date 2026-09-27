#!/bin/bash
# Screendial Automated Web Installer for macOS
# Downloads Screendial.dmg, mounts it, installs Screendial.app, and clears Gatekeeper blocks.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/idaraabasiudoh/screendialpub/main/install.sh | bash

set -e

echo "=================================================="
echo "    Screendial macOS Automated Installer"
echo "=================================================="
echo ""

# Ensure we are running on macOS
if [ "$(uname)" != "Darwin" ]; then
    echo "Error: Screendial is currently only supported on macOS."
    exit 1
fi

DEST_DIR="/Applications"
DEST_APP="$DEST_DIR/Screendial.app"
TEMP_DMG="/tmp/Screendial_Download.dmg"
MOUNT_POINT="/Volumes/Screendial"
DMG_URL="https://github.com/idaraabasiudoh/screendialpub/releases/download/v.0.1.0/Screendial_0.1.0_aarch64.dmg"

# Cleanup any previous incomplete runs
rm -f "$TEMP_DMG"
if mount | grep -q "$MOUNT_POINT"; then
    echo "-> Cleaning up old disk mounts..."
    hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1 || true
fi

echo "-> Downloading Screendial.dmg..."
curl -L -f -o "$TEMP_DMG" "$DMG_URL"

if [ ! -f "$TEMP_DMG" ] || [ ! -s "$TEMP_DMG" ]; then
    echo "Error: Failed to download Screendial.dmg."
    exit 1
fi

if [ -d "$DEST_APP" ]; then
    echo "-> Removing existing Screendial version..."
    rm -rf "$DEST_APP"
fi

echo "-> Mounting disk image..."
hdiutil mount "$TEMP_DMG" -quiet

if [ ! -d "$MOUNT_POINT/Screendial.app" ]; then
    echo "Error: Screendial.app not found inside the mounted DMG."
    hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1 || true
    rm -f "$TEMP_DMG"
    exit 1
fi

echo "-> Installing to /Applications..."
cp -R "$MOUNT_POINT/Screendial.app" "$DEST_DIR/"

echo "-> Cleaning up installer files..."
hdiutil detach "$MOUNT_POINT" -quiet
rm -f "$TEMP_DMG"

echo "-> Authorizing Screendial and clearing Gatekeeper restrictions..."
# Recursively clear macOS Gatekeeper quarantine attribute
xattr -cr "$DEST_APP"

echo ""
echo "=================================================="
echo "    SUCCESS: Screendial has been installed!"
echo "=================================================="
echo "Location: $DEST_APP"
echo "Launching Screendial now..."
echo ""

open "$DEST_APP"
exit 0
