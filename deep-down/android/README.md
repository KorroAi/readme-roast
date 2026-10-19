# DEEP DOWN: Android shell

A minimal native wrapper: one `Activity` hosting a `WebView` that runs the production web build
from `assets/www`. Files are served from the virtual origin `https://appassets.androidplatform.net/`
(the scheme AndroidX `WebViewAssetLoader` uses) because ES module scripts, module workers and
persistent `localStorage` are unreliable from `file://`. Every other request is refused: the
game is fully offline and the manifest has no INTERNET permission.

There are two builds of the same sources:

| | Play bundle (AAB) | Smoke-test APK |
|---|---|---|
| Built by | Gradle, in CI (`.github/workflows/deep-down-android.yml`) | `./android/build-apk.sh`, here |
| SDK | compileSdk 36, targetSdk 36, minSdk 24 (AGP 8.11.1, Gradle 8.14.3, JDK 17) | platform 23 + build-tools 29 (Ubuntu packages), targetSdk 36, minSdk 24 |
| Signed with | the upload key from GitHub secrets (`DD_UPLOAD_*`) | `android/debug.keystore` (public debug credentials, git-ignored) |
| State | **unverified until the first CI run** (Google's SDK and Gradle downloads are blocked in the container it was written in) | built, aligned, signed, checked by `tools/apk-sim.mjs` |

## Behaviour

- **Version.** `tools/version.mjs` is the one rule: versionName = package.json `version`,
  versionCode = (MAJOR × 10000 + MINOR × 100 + PATCH) × 100 + BUILD, BUILD = `DD_BUILD` (0–99).
  1.0.0 → 1000000. The web build carries the same numbers (`src/version.ts`, `dist/version.json`),
  and both builds refuse to package a web build made for another versionCode.
- **Back.** API 33+: predictive Back. The page reports `DeepDownAndroid.setBackHandled(bool)`
  (src/main.ts, polled every 250 ms: false only at the main menu root and on the crash panel). While
  true, an `OnBackInvokedCallback` (a `java.lang.reflect.Proxy`, so it compiles against API 23)
  asks `window.deepDownBack()`: true = handled, false = leave (move the task back), nothing = go back
  in history (Visual Lab). While false the system plays its back-to-home animation. API 32 and
  below: `onBackPressed` asks the page the same way.
- **Display.** Edge to edge into the cutout (`LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`, API 28+),
  immersive through `WindowInsetsController` on API 30+ (system UI flags below). The cutout's safe
  insets are written to the page as `--dd-inset-*` CSS variables; `styles.css` uses the larger of
  them and `env(safe-area-inset-*)`, which older WebViews report as 0.
- **Renderer crash recovery.** `onRenderProcessGone` (API 26+) replaces the dead WebView and reloads
  the game (its autosave is intact). Three losses within a minute close the activity instead of
  looping. The override is compiled against a compile-only stub (`android/stubs`) by build-apk.sh.
- **Lifecycle.** `onPause` calls `window.deepDownLifecycle('pause')` (save, pause, audio off; at most
  one save per second), then `pauseTimers()` once the page answered (or after 500 ms).
  `onResume` calls `resumeTimers()` and `deepDownLifecycle('resume')`.
- **Screen on** only while playing: the game calls `DeepDownAndroid.keepScreenOn(bool)`.
- **Volume keys** change the media volume (`setVolumeControlStream(STREAM_MUSIC)`).
- **Links**: `https:` and `mailto:` links outside the app origin open in the browser or mail app
  (`ACTION_VIEW`); nothing else leaves the WebView.
- **Debugging**: WebView remote debugging only when the APK is debuggable (`FLAG_DEBUGGABLE`):
  the smoke-test APK unless built with `DD_RELEASE=1`; never the Play build.
- **Gradle-only overlay** (`app/src/modern`): `android:appCategory="game"`,
  `android:enableOnBackInvokedCallback="true"`, `density` in `configChanges`, and the API 31+
  splash theme (`windowSplashScreenBackground` #05080C). The API 23 platform cannot link these.
- **Icon and splash** (`make-icon.mjs`, procedural): adaptive icon (background, foreground and
  monochrome layers, 108–432 px) with the mark inside the 66/108 safe circle, the legacy
  rounded-square icon, the 512 px Play icon, and the pre-API-31 splash (a layer-list window
  background with the mark). `node tools/icon-masks.mjs` previews the circle, squircle, rounded
  square and teardrop masks and fails if any of them cuts the mark.
- Text zoom is pinned to 100% (the game has its own Large Text setting).

## Smoke-test APK (verified here)

```bash
# Ubuntu packages (Google's SDK host is not reachable from this container):
apt-get install android-sdk android-sdk-platform-23 android-sdk-build-tools dalvik-exchange
./android/build-apk.sh                     # tsc + vite build into dist/, then aapt2 / javac / dx / zipalign / apksigner
DD_RELEASE=1 ./android/build-apk.sh        # release web build (no Visual Lab, no UI sandbox), not debuggable
DD_WEB_OUT=.apk-dist ./android/build-apk.sh  # build the web files elsewhere (dist/ is in use by an e2e run)
node tools/apk-sim.mjs                     # serve the APK's files the way MainActivity does, play, check
adb install -r android/build/deep-down-debug.apk
```

Outputs: `android/build/deep-down-debug.apk` and `android/build/play-icon-512.png`.

## Play bundle (CI)

The workflow runs on `workflow_dispatch` (input: build number) and on tags `deep-down-v*`
(the tag must match package.json, e.g. `deep-down-v1.0.0`). It runs tsc, vitest and a
`DD_RELEASE=1` web build, decodes the upload key into `$RUNNER_TEMP`, runs
`gradle :app:bundleRelease :app:assembleRelease`, checks the APK's badging, and uploads the AAB and
APK as artifacts. The key is read from the secrets `DD_UPLOAD_KEYSTORE_B64`,
`DD_UPLOAD_STORE_PASSWORD`, `DD_UPLOAD_KEY_ALIAS` and `DD_UPLOAD_KEY_PASSWORD` only; without them
the outputs are unsigned. Steps for the director: `docs/release-checklist.md`.

Locally, with a current Android SDK and Gradle 8.13+: `DD_RELEASE=1 npx vite build` in
`deep-down/`, then `gradle -p android :app:bundleRelease`.

## Verified / not verified

- Smoke-test APK: built, aligned, signed, signature verified; `aapt dump badging` shows
  versionCode 1000000, versionName 1.0.0, targetSdk 36 and the adaptive icon
  (`application-icon-65534: res/mipmap-anydpi-v26/ic_launcher.xml`). `tools/apk-sim.mjs` boots it,
  generates the world in the worker, plays, saves, offers Continue after a reload, opens the
  bundled privacy statement and licences offline, and shows the crash panel after a simulated GPU
  failure.
- **Not verified**: the Gradle build and the CI workflow (until their first run); every native
  behaviour above (Back, cutouts, immersive mode, renderer recovery, lifecycle, splash, themed
  icon) on a device or emulator. See `docs/device-test-protocol.md`.
