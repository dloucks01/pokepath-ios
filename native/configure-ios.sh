#!/usr/bin/env bash
# Customises the Capacitor Xcode project (ios/) for PokéPath TD.
# Run from the repo root on a Mac after `npx cap add ios` (the CI workflow does this).
# Safe to run more than once.
set -euo pipefail

APP=ios/App/App
PLIST="$APP/Info.plist"
PB=/usr/libexec/PlistBuddy
VERSION="${1:-$(node -p "require('./package.json').version")}"

# --- Landscape only (phone + iPad) -----------------------------------------
for KEY in UISupportedInterfaceOrientations "UISupportedInterfaceOrientations~ipad"; do
  $PB -c "Delete :$KEY" "$PLIST" 2>/dev/null || true
  $PB -c "Add :$KEY array" "$PLIST"
  $PB -c "Add :$KEY:0 string UIInterfaceOrientationLandscapeRight" "$PLIST"
  $PB -c "Add :$KEY:1 string UIInterfaceOrientationLandscapeLeft" "$PLIST"
done

set_value () { $PB -c "Delete :$1" "$PLIST" 2>/dev/null || true; $PB -c "Add :$1 $2 $3" "$PLIST"; }
set_value UIRequiresFullScreen bool true
set_value UIStatusBarHidden bool true
set_value UIViewControllerBasedStatusBarAppearance bool true   # GameViewController decides (hidden)
set_value CFBundleDisplayName string "PokéPath"
set_value CFBundleShortVersionString string "$VERSION"
set_value ITSAppUsesNonExemptEncryption bool false
set_value UIFileSharingEnabled bool false

# --- App icon ----------------------------------------------------------------
for ICON in "$APP"/Assets.xcassets/AppIcon.appiconset/*.png; do
  cp www/ios/icons/icon-1024.png "$ICON"
done

# --- Launch screen -----------------------------------------------------------
if [ -f native/splash-2732.png ]; then
  for SPLASH in "$APP"/Assets.xcassets/Splash.imageset/*.png; do
    cp native/splash-2732.png "$SPLASH"
  done
fi
# Match the launch screen's background so there's no white flash on rotation.
sed -i '' 's/<color key="backgroundColor"[^>]*>/<color key="backgroundColor" red="0.1647" green="0.1686" blue="0.1765" alpha="1" colorSpace="custom" customColorSpace="sRGB"\/>/' \
  "$APP/Base.lproj/LaunchScreen.storyboard" || true

# --- Game view controller ----------------------------------------------------
if ! grep -q "class GameViewController" "$APP/AppDelegate.swift"; then
  grep -q "^import WebKit" "$APP/AppDelegate.swift" || sed -i '' 's/^import Capacitor$/import Capacitor\
import WebKit/' "$APP/AppDelegate.swift"
  cat native/GameViewController.swift >> "$APP/AppDelegate.swift"
fi
sed -i '' 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="GameViewController" customModule="App" customModuleProvider="target"/' \
  "$APP/Base.lproj/Main.storyboard"
grep -q 'customClass="GameViewController"' "$APP/Base.lproj/Main.storyboard" || { echo "Main.storyboard not patched"; exit 1; }

echo "iOS project configured (version $VERSION)."
