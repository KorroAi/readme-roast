# DEEP DOWN: device test protocol

What a person checks on real phones before release, because this environment cannot: GPU frame
time and heat, the Android shell's native behaviour, touch feel, haptics and the audio mix.
Record every result (pass / fail / numbers / notes) in TEST_REPORT.md under "Device runs", with
the phone model, Android version, WebView version (Settings → Apps → Android System WebView) and
the build (versionName and versionCode, shown on the menu and in the crash panel's details).

## Phones

| slot | class | examples |
|---|---|---|
| A | 2022 mid-range: Adreno 642L or Mali-G68, 6–8 GB | Galaxy A54, Pixel 6a, Nothing Phone (1) |
| B | 3 GB entry: Adreno 610 or Mali-G52 | Galaxy A13, Redmi 10, Moto G31 |

Phone B is the one the automatic quality governor exists for: it should start on **Battery**
(≤ 3 GB or ≤ 4 cores) and must stay playable there.

## Setup

1. Install the CI build: Play internal testing (preferred, it is what players get), or
   `adb install -r app-release.apk` from the CI artifact. For WebView debugging use the smoke-test
   APK (`./android/build-apk.sh`, debuggable): `chrome://inspect` on a desktop Chrome.
2. Fresh install for the first-launch checks: uninstall first (`adb uninstall com.korroai.deepdown`).
3. Charge above 50 %, screen brightness at 50 %, room temperature, no battery saver, Wi-Fi on (the
   game must not care).
4. Optional frame data: `adb shell dumpsys gfxinfo com.korroai.deepdown reset` before a run and
   `adb shell dumpsys gfxinfo com.korroai.deepdown` after (janky frames, percentiles). Turn on the
   in-game FPS counter (Settings → Show FPS) for a live read.

## 1. Install, launch, splash, icon

- [ ] Launcher icon: the crystal and ember sit whole inside the mask (circle, squircle or rounded
  square, whatever the launcher uses). Long-press → no clipped corners.
- [ ] Themed icons (Android 13+, Wallpaper & style → Themed icons on): the monochrome mark shows,
  readable.
- [ ] Cold start: Android 12+ shows the system splash (icon on #05080C); Android 11 and below the
  dark splash with the centred mark. No white flash at any point. Time from tap to the menu: ___ s.
- [ ] First launch on phone B: Settings → Quality reads Battery. Phone A: Balanced.

## 2. Display, cutouts, system bars

- [ ] Landscape both ways (rotate 180°): the HUD, joystick, Mine and Jump buttons never sit under
  the camera cutout or the rounded corners.
- [ ] Status and navigation bars hidden; a swipe from the edge shows them briefly and they hide again.
- [ ] Gesture navigation and 3-button navigation both tried.

## 3. Back (predictive back on Android 13+)

- [ ] Main menu: Back shows the system back-to-home preview and leaves the app.
- [ ] Settings over the menu: Back closes Settings (no back-to-home preview).
- [ ] Playing: Back pauses. Paused: Back resumes. An open bag or workbench: Back closes it.
- [ ] Android 14+, Developer options → "Predictive back animations" on: same results, and at the
  menu the preview animation plays.

## 4. Lifecycle and recovery

- [ ] Playing → Home → wait 1 min → back: the game is paused, the expedition intact, audio comes
  back after Resume. No double click of sound, no black screen.
- [ ] Playing → lock the screen → unlock: paused, intact.
- [ ] Playing → Recent apps → swipe the app away → relaunch → Continue: the expedition resumes
  from the background save (position within a few metres).
- [ ] The screen stays on while playing (5 minutes without touching), and sleeps normally on the
  menu and the pause screen.
- [ ] Volume keys change the game volume (media), also on the menu.
- [ ] Renderer loss (an emulator or a rooted phone): kill the WebView renderer with
  `adb shell ps -A | grep sandboxed_process` then `adb shell su -c kill -9 <pid>` (on an emulator
  `adb root` first, then `adb shell kill -9 <pid>`). Expected: the game reloads to the menu with
  Continue and the app stays open. Three kills within a minute close the app instead.
- [ ] Crash panel (smoke-test APK, `chrome://inspect` console):
  `Promise.reject(new Error('device test'))`. Expected: "DEEP DOWN hit a problem. Your last
  autosave is safe." with Restart and Copy details. Copy details → paste into a notes app: the
  version, the user agent and the GPU name are there. Back on the panel leaves the app. Restart →
  menu with Continue.
- [ ] Open the privacy statement and licences offline (airplane mode), from the About screen when
  it exists, or in `chrome://inspect`: `location.href = '/privacy.html'`.

## 5. Performance and heat (the governor)

Play the scripted route by hand for 10 minutes: camp → tunnel → mine copper → the Hollow ledge →
down the stairs → the hall → back to camp. Note per phone:

| measure | phone A | phone B |
|---|---|---|
| quality at the start | | |
| FPS on the ledge (looking at the Hollow) | | |
| FPS in the hall | | |
| did the governor step down? when? (toast "Quality set to Battery…") | | |
| render scale after 10 min (Settings) | | |
| back of the phone after 10 min: cool / warm / hot | | |
| battery used in 10 min (%) | | |
| `gfxinfo` 90th / 95th percentile frame time | | |

- [ ] At most one quality toast per install. Changing Quality by hand afterwards: the governor
  never changes it again (also after a restart).
- [ ] Phone B on Battery: the camera turns without stutter; mining responds at once.

## 6. Touch, feel, haptics (unverified until this run)

- [ ] Joystick: starts where the thumb lands, follows it, the explorer walks and runs as expected.
- [ ] Look: right-half drag, sensitivity setting changes it, invert works.
- [ ] Mine button: hold mines the block in front (aim assist), releasing stops at once.
- [ ] Haptics on (Settings → Vibration): a light tick per strike, a stronger one per break,
  a tap per pickup, a longer buzz on damage. Never a continuous buzz. Off: none at all.
- [ ] Left-handed layout swaps the sides.

## 7. Audio mix (unverified until this run)

With headphones, then the speaker, at 50 % volume:

- [ ] Music audible but under the effects; ambience present in the tunnel, larger in the Hollow.
- [ ] Pick strikes and breaks crisp, never harsh; pickups clear; no clipping at full volume.
- [ ] The four volume sliders each do what they say.

## 8. Accessibility

- [ ] Large text: nothing clipped on the HUD, menu, bag, workbench, pause and settings.
- [ ] High contrast: HUD readable over the bright Hollow.
- [ ] System font size at maximum: the game ignores it (text zoom pinned) and stays laid out.

## Reporting

A failing line goes to the team with: phone, Android and WebView versions, build, the steps, what
happened, and for crashes the crash panel's copied details or `adb logcat -d | grep -i -E "deepdown|chromium|AndroidRuntime"`.
