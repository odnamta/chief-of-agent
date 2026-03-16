#!/bin/bash
set -euo pipefail

# Chief of Agent — macOS App Bundle Builder
# Creates a proper .app bundle from the SPM binary.
# UNUserNotificationCenter requires a .app bundle with Info.plist to function.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MACOS_DIR="$PROJECT_ROOT/macos"
APP_NAME="ChiefOfAgent"
BUNDLE_ID="com.dioatmando.chief-of-agent"
APP_DIR="$HOME/Applications/${APP_NAME}.app"

echo "=== Chief of Agent — macOS App Installer ==="
echo ""

# Step 1: Build release binary
echo "[1/4] Building Swift package (release)..."
cd "$MACOS_DIR"
swift build -c release 2>&1

BINARY_PATH="$MACOS_DIR/.build/release/$APP_NAME"
if [ ! -f "$BINARY_PATH" ]; then
    echo "ERROR: Binary not found at $BINARY_PATH"
    exit 1
fi
echo "  Binary: $BINARY_PATH"

# Step 2: Create .app bundle structure
echo "[2/4] Creating app bundle..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Copy binary and make executable
cp "$BINARY_PATH" "$APP_DIR/Contents/MacOS/$APP_NAME"
chmod +x "$APP_DIR/Contents/MacOS/$APP_NAME"

# Step 3: Write Info.plist
echo "[3/4] Writing Info.plist..."
cat > "$APP_DIR/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>Chief of Agent</string>
    <key>CFBundleDisplayName</key>
    <string>Chief of Agent</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.2.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSUserNotificationAlertStyle</key>
    <string>banner</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright 2026 Dio Atmando. MIT License.</string>
</dict>
</plist>
PLIST

# Step 4: Verify and report
echo "[4/4] Verifying..."

if [ -f "$APP_DIR/Contents/MacOS/$APP_NAME" ] && [ -f "$APP_DIR/Contents/Info.plist" ]; then
    echo ""
    echo "=== SUCCESS ==="
    echo "App installed to: $APP_DIR"
    echo ""
    echo "To launch:"
    echo "  open '$APP_DIR'"
    echo ""
    echo "To set launch at login:"
    echo "  Open the app -> Settings -> Toggle 'Launch at login'"
    echo ""
    echo "Notes:"
    echo "  - LSUIElement=true means no Dock icon (menu bar only)"
    echo "  - First launch will ask for notification permission"
    echo "  - Grant permission in System Settings > Notifications > Chief of Agent"
else
    echo "ERROR: Bundle verification failed"
    exit 1
fi
