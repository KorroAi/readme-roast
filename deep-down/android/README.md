# DEEP DOWN — Android shell

A minimal native wrapper: one `Activity` hosting a `WebView` that runs the production web build
from `assets/www`. Files are served from the virtual origin `https://appassets.androidplatform.net/`
(the scheme AndroidX `WebViewAssetLoader` uses) because ES module scripts, module workers and
persistent `localStorage` are unreliable from `file://`. Every other request is refused: the
game is fully offline.

Behavior:
- Immersive fullscreen, `sensorLandscape`. The screen is kept on only while playing: the game
  calls `window.DeepDownAndroid.keepScreenOn(bool)` (a `@JavascriptInterface` bridge).
- Text zoom is pinned to 100% (the game has its own Large Text setting sized for the layout).
- Back button → `window.deepDownBack()` (close screen / pause / resume; ignored while loading);
  at the main menu it exits; on a page without a handler it goes back in history. The Visual Lab
  returns to the game.
- `onPause`/`onResume` forward to the WebView, so the game autosaves and suspends audio on
  `visibilitychange`.
- Font-scale and locale changes do not recreate the Activity (density cannot be listed when
  compiling against API 23, see below).

## Build (verified here)

```bash
# Ubuntu packages (Google's SDK host is not reachable from this container):
apt-get install android-sdk android-sdk-platform-23 android-sdk-build-tools dalvik-exchange
./android/build-apk.sh          # runs `npm run build`, then aapt2 / javac / dx / zipalign / apksigner
# -> android/build/deep-down-debug.apk (debug-signed with android/debug.keystore, created on first run)
```

The script compiles against platform 23 and sets `targetSdkVersion` 34 in the manifest. That is
fine for sideloading and testing. **A Play Store release must be built with a current SDK** (for
example by importing `app/src/main` into an Android Studio project with AGP and compileSdk 35)
and signed with a release key.

Install on a device: `adb install -r android/build/deep-down-debug.apk`.

`build-apk.sh` refuses to package a stale or placeholder web build (every script and style that
`dist/index.html` loads, and the world worker, must exist).

## Verified / not verified

- Built, aligned, signed, signature verified (293 KB).
- `node tools/apk-sim.mjs` unpacks the APK's `assets/www` and serves it to headless Chromium the
  way `MainActivity` does (same origin, MIME table and refusal rule): it boots, generates the world
  in the worker, plays, saves and offers Continue after a reload.
- It has **not** been installed or run on a device or emulator. See KNOWN_ISSUES.md.
