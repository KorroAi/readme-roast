# DEEP DOWN — Android shell

A minimal native wrapper: one `Activity` hosting a `WebView` that runs the production web build
from `assets/www`. Files are served from the virtual origin `https://appassets.androidplatform.net/`
(the scheme AndroidX `WebViewAssetLoader` uses) because ES module scripts, module workers and
persistent `localStorage` are unreliable from `file://`. Every other request is refused: the
game is fully offline.

Behavior:
- Immersive fullscreen, `sensorLandscape`, screen kept on while playing.
- Back button → `window.deepDownBack()` in the game (close screen / pause / resume); at the main
  menu it exits.
- `onPause`/`onResume` forward to the WebView, so the game autosaves and suspends audio on
  `visibilitychange`.

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

## Not verified

The APK has been built, aligned, signed and its signature verified. It has **not** been
installed or run on a device or emulator. See KNOWN_ISSUES.md.
