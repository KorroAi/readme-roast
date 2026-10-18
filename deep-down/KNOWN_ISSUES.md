# DEEP DOWN — Known Issues and Limitations

Honest list of what is not done, not verified, or knowingly imperfect. Updated with every milestone.

## Environment limitations (not defects in the game)

| Topic | Status |
|---|---|
| Unity | Not available here: no editor, no .NET, `download.unity3d.com` blocked by network policy (403), and activation needs the owner's Unity account. The game is built on TypeScript + Three.js (WebGL 2) instead. See TECHNICAL_ARCHITECTURE.md. |
| Real Android device | No device or emulator is available (Google's SDK host `dl.google.com` is blocked, so no emulator images). The APK is **built and signature-verified, never installed or run**. |
| GPU performance | All rendering here is SwiftShader (CPU). FPS numbers in TEST_REPORT.md are not phone GPU numbers. CPU-side costs (JS frame time, remesh, light updates, saves) are measured and meaningful. |
| Audio | Every sound is measured offline (peak, RMS, spectral centroid) but **nobody has listened to it**. A by-ear mix pass on a phone speaker and headphones is still needed. |

## Android build

- The verified build path (`android/build-apk.sh`) uses Ubuntu's packaged SDK: compile SDK 23,
  build-tools 29, `dx`. `targetSdkVersion` is set to 34 in the manifest, but the app is compiled
  against API 23. Google Play requires a build with a current compile/target SDK through Gradle and
  Android Studio. That path is not set up here because the official SDK cannot be downloaded.
- The APK is signed with a locally generated debug key (`android/debug.keystore`, not committed).

## Gameplay / content

- One zone only (the Lantern Hollow). The Deep Gate leads to a balcony over the rift; the rift itself
  is the end of the vertical slice.
- Creatures and active hazards (falling rocks, gas) are not in the slice; the only risks are falls,
  the lethal chasm, and running out of lantern fuel.
- Drops left on the ground (backpack full) are not saved; they disappear if you quit before picking
  them up.
- Mined crystal light is gone for good (crystals do not regrow).

## Technical

- World generation and the first full light computation run on the main thread during the loading
  screen (~0.9 s in this container; expect 2–3 s on a mid-range phone, with the progress bar paused
  meanwhile). A Web Worker would remove the pause.
- The light volume is a full-world RGBA8 3D texture (13 MB of GPU memory for 160×128×160). Larger
  zones should switch to a camera-centered window.
- No positional (3D) audio except drips and rumbles.
