#!/usr/bin/env bash
# Build an installable smoke-test APK of DEEP DOWN without Gradle, using the Ubuntu-packaged
# Android SDK (platform 23, build-tools 29) and dx. This is the path verified in containers where
# Google's SDK downloads are unavailable. The Play bundle (AAB) comes from Gradle in CI instead:
# see android/README.md and .github/workflows/deep-down-android.yml.
#
# Environment:
#   DD_BUILD=N        build number (0-99) for the versionCode, default 0 (tools/version.mjs)
#   DD_RELEASE=1      release web build: only index.html (no Visual Lab, no UI sandbox), and the
#                     APK is not marked debuggable (no WebView remote debugging)
#   DD_WEB_OUT=dir    where the web build goes (default dist/); use another directory while an
#                     e2e run is serving dist/
#   SKIP_WEB_BUILD=1  package the existing web build as is (it is still checked)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SDK="${ANDROID_SDK:-/usr/lib/android-sdk}"
PLATFORM="$SDK/platforms/android-23/android.jar"
BT="$SDK/build-tools/29.0.3"
OUT="$HERE/build"
WEB="${DD_WEB_OUT:-$ROOT/dist}"
case "$WEB" in /*) ;; *) WEB="$ROOT/$WEB" ;; esac
PACKAGE="com.korroai.deepdown"
MIN_SDK=24
TARGET_SDK=36
VERSION_NAME="$(node "$ROOT/tools/version.mjs" name)"
VERSION_CODE="$(node "$ROOT/tools/version.mjs" code)"

for tool in "$BT/aapt2" "$BT/zipalign" "$BT/apksigner" "$PLATFORM"; do
  [ -e "$tool" ] || { echo "missing: $tool (apt-get install android-sdk android-sdk-platform-23 android-sdk-build-tools)"; exit 1; }
done
DX="$BT/dx"; [ -x "$DX" ] || DX="$(command -v dalvik-exchange || true)"
[ -n "$DX" ] && [ -x "$DX" ] || { echo "missing: dx (apt-get install dalvik-exchange)"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/compiled" "$OUT/gen" "$OUT/classes" "$OUT/stub-classes" "$OUT/assets/www"

KIND="smoke test"; [ "${DD_RELEASE:-0}" = "1" ] && KIND="release"
echo "== web build ($VERSION_NAME, versionCode $VERSION_CODE, $KIND)"
if [ "${SKIP_WEB_BUILD:-0}" != "1" ]; then
  (cd "$ROOT" && npx tsc --noEmit && npx vite build --logLevel warn --outDir "$WEB" --emptyOutDir)
fi
# Refuse to package a stale or placeholder build: every script/style index.html loads must exist,
# and the build must carry this versionCode (dist/version.json, written by vite.config.ts).
[ -f "$WEB/index.html" ] || { echo "$WEB/index.html missing: run npm run build"; exit 1; }
REFS="$({ grep -oE '(src|href)="\./assets/[^"]+"' "$WEB/index.html" || true; } | sed -E 's/^(src|href)="\.\///; s/"$//')"
[ -n "$REFS" ] || { echo "$WEB/index.html references no bundled assets (placeholder build?)"; exit 1; }
for f in $REFS; do [ -f "$WEB/$f" ] || { echo "web build is stale: missing $f"; exit 1; }; done
ls "$WEB"/assets/zoneWorker-*.js >/dev/null 2>&1 || { echo "web build is missing the world-generation worker"; exit 1; }
BUILT_CODE="$(node -p "require('$WEB/version.json').versionCode" 2>/dev/null || echo none)"
[ "$BUILT_CODE" = "$VERSION_CODE" ] || { echo "web build is stale: it was built for versionCode $BUILT_CODE, packaging $VERSION_CODE"; exit 1; }
if [ "${DD_RELEASE:-0}" = "1" ] && { [ -e "$WEB/visuallab.html" ] || [ -e "$WEB/src/ui/dev/sandbox.html" ]; }; then
  echo "DD_RELEASE=1 but the web build contains the Visual Lab or the UI sandbox (built without DD_RELEASE=1?)"; exit 1
fi
cp -R "$WEB/." "$OUT/assets/www/"

echo "== resources"
node "$HERE/make-icon.mjs" "$OUT/icon-res" --play "$OUT/play-icon-512.png" >/dev/null
# aapt2 needs the package in the manifest; Gradle takes it from `namespace` instead.
sed "s|<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">|<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\" package=\"$PACKAGE\">|" \
  "$HERE/app/src/main/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"
grep -q "package=\"$PACKAGE\"" "$OUT/AndroidManifest.xml" || { echo "could not set the package in the manifest"; exit 1; }
DEBUG_FLAG="--debug-mode"; [ "${DD_RELEASE:-0}" = "1" ] && DEBUG_FLAG=""
"$BT/aapt2" compile --dir "$HERE/app/src/main/res" -o "$OUT/compiled/res.zip"
"$BT/aapt2" compile --dir "$OUT/icon-res" -o "$OUT/compiled/icons.zip"
"$BT/aapt2" link -I "$PLATFORM" \
  --manifest "$OUT/AndroidManifest.xml" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" $DEBUG_FLAG \
  -A "$OUT/assets" --java "$OUT/gen" \
  -o "$OUT/unsigned.apk" "$OUT/compiled/res.zip" "$OUT/compiled/icons.zip"

echo "== java"
# Compile-only stubs for classes newer than API 23 that MainActivity names in a signature.
javac -nowarn -Xlint:-options --release 8 -classpath "$PLATFORM" -d "$OUT/stub-classes" $(find "$HERE/stubs" -name '*.java')
javac -nowarn -Xlint:-options --release 8 -classpath "$PLATFORM:$OUT/stub-classes" -d "$OUT/classes" \
  $(find "$HERE/app/src/main/java" "$OUT/gen" -name '*.java')
"$DX" --dex --min-sdk-version="$MIN_SDK" --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)

echo "== align + sign (debug key)"
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KEY="$HERE/debug.keystore"
if [ ! -f "$KEY" ]; then
  # The standard, public Android debug-key credentials: this key only signs local smoke tests.
  keytool -genkeypair -keystore "$KEY" -storepass android -keypass android -alias androiddebugkey \
    -dname "CN=DEEP DOWN Debug, O=DEEP DOWN, C=US" -keyalg RSA -keysize 2048 -validity 10000 >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KEY" --ks-pass pass:android --key-pass pass:android --out "$OUT/deep-down-debug.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs "$OUT/deep-down-debug.apk" | head -3
"$BT/aapt2" dump badging "$OUT/deep-down-debug.apk" | grep -E "^package:|application-icon-65534|sdkVersion|targetSdkVersion" || true
ls -la "$OUT/deep-down-debug.apk" "$OUT/play-icon-512.png"
