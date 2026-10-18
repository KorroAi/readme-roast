#!/usr/bin/env bash
# Build an installable debug APK of DEEP DOWN without Gradle, using the Ubuntu-packaged
# Android SDK (platform 23, build-tools 29) and dx. This is the path verified in CI-like
# containers where Google's SDK downloads are unavailable. See android/README.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SDK="${ANDROID_SDK:-/usr/lib/android-sdk}"
PLATFORM="$SDK/platforms/android-23/android.jar"
BT="$SDK/build-tools/29.0.3"
OUT="$HERE/build"
VERSION_NAME="$(node -p "require('$ROOT/package.json').version")"

for tool in "$BT/aapt2" "$BT/zipalign" "$BT/apksigner" "$PLATFORM"; do
  [ -e "$tool" ] || { echo "missing: $tool (apt-get install android-sdk android-sdk-platform-23 android-sdk-build-tools)"; exit 1; }
done
DX="$BT/dx"; [ -x "$DX" ] || DX="$(command -v dalvik-exchange || true)"
[ -n "$DX" ] && [ -x "$DX" ] || { echo "missing: dx (apt-get install dalvik-exchange)"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/compiled" "$OUT/gen" "$OUT/classes" "$OUT/assets/www"

echo "== web build"
if [ "${SKIP_WEB_BUILD:-0}" != "1" ]; then (cd "$ROOT" && npm run build --silent); fi
# Refuse to package a stale or placeholder build: every script/style index.html loads must exist.
[ -f "$ROOT/dist/index.html" ] || { echo "dist/index.html missing: run npm run build"; exit 1; }
REFS="$({ grep -oE '(src|href)="\./assets/[^"]+"' "$ROOT/dist/index.html" || true; } | sed -E 's/^(src|href)="\.\///; s/"$//')"
[ -n "$REFS" ] || { echo "dist/index.html references no bundled assets (placeholder build?)"; exit 1; }
for f in $REFS; do [ -f "$ROOT/dist/$f" ] || { echo "dist is stale: missing $f"; exit 1; }; done
ls "$ROOT"/dist/assets/zoneWorker-*.js >/dev/null 2>&1 || { echo "dist is missing the world-generation worker"; exit 1; }
cp -R "$ROOT/dist/." "$OUT/assets/www/"

echo "== resources"
node "$HERE/make-icon.mjs" "$OUT/icon-res" >/dev/null
"$BT/aapt2" compile --dir "$HERE/app/src/main/res" -o "$OUT/compiled/res.zip"
"$BT/aapt2" compile --dir "$OUT/icon-res" -o "$OUT/compiled/icons.zip"
"$BT/aapt2" link -I "$PLATFORM" \
  --manifest "$HERE/app/src/main/AndroidManifest.xml" \
  --min-sdk-version 23 --target-sdk-version 34 \
  --version-code 1 --version-name "$VERSION_NAME" \
  -A "$OUT/assets" --java "$OUT/gen" \
  -o "$OUT/unsigned.apk" "$OUT/compiled/res.zip" "$OUT/compiled/icons.zip"

echo "== java"
javac -nowarn -Xlint:-options --release 8 -classpath "$PLATFORM" -d "$OUT/classes" \
  $(find "$HERE/app/src/main/java" "$OUT/gen" -name '*.java')
"$DX" --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)

echo "== align + sign (debug key)"
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KEY="$HERE/debug.keystore"
if [ ! -f "$KEY" ]; then
  keytool -genkeypair -keystore "$KEY" -storepass android -keypass android -alias androiddebugkey \
    -dname "CN=DEEP DOWN Debug, O=DEEP DOWN, C=US" -keyalg RSA -keysize 2048 -validity 10000 >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KEY" --ks-pass pass:android --key-pass pass:android --out "$OUT/deep-down-debug.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs "$OUT/deep-down-debug.apk" | head -3
"$BT/aapt" dump badging "$OUT/deep-down-debug.apk" | head -6 || true
ls -la "$OUT/deep-down-debug.apk"
