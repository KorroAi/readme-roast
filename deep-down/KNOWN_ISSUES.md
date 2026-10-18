# DEEP DOWN — Known Issues and Limitations

Honest list of what is not done, not verified, or knowingly imperfect. Updated with every milestone.

## Not verified (environment limits, not known defects)

| Topic | Status |
|---|---|
| Unity | Not available here: no editor, no .NET, `download.unity3d.com` blocked by network policy (403), and activation needs the owner's Unity account. The game is built on TypeScript + Three.js (WebGL 2) instead. See TECHNICAL_ARCHITECTURE.md. |
| Real Android device | No device or emulator (Google's SDK host is blocked, so no emulator images). The APK is **built, signed and its packaged files simulated in Chromium on the app's origin — never installed or run on a phone.** Android WebView quirks, touch latency, Back / lifecycle behaviour and audio focus on a device are unverified. |
| 60 FPS on the target phone | Unmeasured. All rendering here is SwiftShader (CPU). CPU-side frame cost is 1.1–1.8 ms avg (p95 ≤ 3.8 ms) and scenes are 59–187 draw calls / 21–95k triangles, which is within the budgets set for a 2022 mid-range GPU, but GPU time on a phone has not been measured. The Battery preset (30 FPS cap, no bloom, lower resolution) is the fallback. |
| Audio | Every sound is measured offline (peak, RMS, spectral centroid) but **nobody has listened to it**. A by-ear mix pass on a phone speaker and headphones is needed. |
| iOS | The web build should run in a WKWebView wrapper (WebGL 2 since iOS 15); no wrapper or test exists. |

## Android build

- The verified build path (`android/build-apk.sh`) uses Ubuntu's packaged SDK: compile SDK 23,
  build-tools 29, `dx`. `targetSdkVersion` is 34 in the manifest, but the app is compiled
  against API 23. Google Play needs a build with a current compile/target SDK through Gradle and
  Android Studio (not set up here: the official SDK cannot be downloaded).
- Because of API 23, `density` cannot be listed in `configChanges`: a display-size change while
  the app runs recreates the Activity and reloads to the main menu (progress is autosaved).
- The APK is signed with a locally generated debug key (`android/debug.keystore`, not committed).
- Very old WebViews (Chromium < 80, possible on un-updated Android 6/7 devices) cannot run the
  bundle; they get a message asking to update Android System WebView instead of a black screen.

## Gameplay / content

- One zone only (the Lantern Hollow). The Deep Gate leads to a balcony over the rift; the rift
  is the end of the vertical slice.
- Creatures and active hazards (falling rocks, gas) are not in the slice; the risks are falls,
  the lethal chasm and running out of lantern fuel.
- Drops left on the ground (backpack full) are not saved; they disappear if you quit before
  picking them up.
- Mined crystal light is gone for good (crystals do not regrow).
- Balance (hardness, fuel, recipe costs) is tuned by tests and play-throughs in a desktop
  browser, not by players.

## Technical

- The light volume is a full-world RGBA8 3D texture (12.5 MB of GPU memory for 160×128×160).
  Larger zones should switch to a camera-centred window.
- Dust and sparkle particles are point sprites: a large puff very close to the screen edge can
  blink out when its centre leaves the screen (halos were converted to quads; particles are
  small and short-lived, so they were left as points).
- On devices without renderable float targets the game falls back to 8-bit render targets:
  playable, but with no HDR headroom, so bloom and bright highlights are weaker.
- Building a save scans the whole 3.3 MB voxel volume (~2 ms here, ~8 ms for the whole save
  build); expect a few times that on a phone, on camp entry / craft / autosave.
- No positional (3D) audio except drips and rumbles.
- The UI-readability view of the Visual Lab is the UI sandbox page with a painted backdrop, not
  the 3D cave.
