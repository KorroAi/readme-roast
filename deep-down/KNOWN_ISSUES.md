# DEEP DOWN — Known Issues and Limitations

Honest list of what is not done, not verified, or knowingly imperfect. Updated with every milestone.

## Not verified (environment limits, not known defects)

| Topic | Status |
|---|---|
| Unity | Not available here: no editor, no .NET, `download.unity3d.com` blocked by network policy (403), and activation needs the owner's Unity account. The game is built on TypeScript + Three.js (WebGL 2) instead. See TECHNICAL_ARCHITECTURE.md. |
| Real Android device | No device or emulator (Google's SDK host is blocked, so no emulator images). The APK is **built, signed and its packaged files simulated in Chromium on the app's origin — never installed or run on a phone.** Android WebView quirks, touch latency, Back / lifecycle behaviour and audio focus on a device are unverified. |
| 60 FPS on the target phone | Unmeasured. All rendering here is SwiftShader (CPU). CPU-side frame cost is 1.1–1.8 ms avg (p95 ≤ 3.8 ms) and scenes are 59–187 draw calls / 21–95k triangles; no draw-call or triangle budget has been set or validated, and GPU time on a phone has not been measured. The Battery preset (30 FPS cap, no bloom, lower resolution) is the fallback. |
| Audio | Every sound is measured offline (peak, RMS, spectral centroid) but **nobody has listened to it**. A by-ear mix pass on a phone speaker and headphones is needed. |
| iOS | The web build should run in a WKWebView wrapper (WebGL 2 since iOS 15); no wrapper or test exists. iOS Safari has no web vibration and no fullscreen API on iPhone, so haptics are absent and the address bar stays; adding the page to the home screen uses the manifest's fullscreen display. |
| Touch feel on a phone | The Mine button, aim assist, joystick follow and haptics were checked with real CDP touch events in mobile emulation (844×390, 390×844), not with a thumb on a device. Sizes, the 230 ms hold and the vibration strengths may need tuning by hand. |
| Some input and lifecycle paths | Captured mouse look, real Chrome's Esc-while-captured, the `pagehide` save and the 45 s autosave timer are not covered by automated tests (TEST_REPORT.md → "Not covered by automated tests"). |

## Android build

- The verified build path (`android/build-apk.sh`) uses Ubuntu's packaged SDK: compile SDK 23,
  build-tools 29, `dx`. `targetSdkVersion` is 34 in the manifest, but the app is compiled
  against API 23. Google Play needs a build with a current compile/target SDK through Gradle and
  Android Studio (not set up here: the official SDK cannot be downloaded).
- Because of API 23, `density` cannot be listed in `configChanges`: a display-size change while
  the app runs recreates the Activity and reloads to the main menu (progress is autosaved).
- The APK is signed with a locally generated debug key (`android/debug.keystore`, not committed).
- The build needs Android System WebView / Chromium 87 or newer (Nov 2020: CSS `inset`,
  `replaceChildren`, ES2020 syntax). Older WebViews, possible on un-updated Android 6/7
  devices, get a message asking to update instead of a black screen.

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

- The light volume is a full-world RGBA8 3D texture (13.1 MB / 12.5 MiB of GPU memory for
  160×128×160). Larger zones should switch to a camera-centred window.
- Dust and sparkle particles are point sprites: a large puff very close to the screen edge can
  blink out when its centre leaves the screen (halos were converted to quads; particles are
  small and short-lived, so they were left as points).
- On devices without renderable float targets the game falls back to 8-bit render targets with
  an encoded scene (`?ldr=1` forces it): values above 1 survive, but bloom has less headroom.
- The round-3 renderer (sculpted mesh, per-zone atmosphere, `LAMP_DIR`, course-library masonry)
  has only been timed on SwiftShader (relative A/B within noise). Its GPU cost on a Mali or
  Adreno phone is unmeasured: +1 3D-texture fetch and ~25 ALU per terrain fragment on
  Balanced/High, ~75–90 ALU on masonry fragments. Battery compiles the blend and `LAMP_DIR` out.
- A mined chunk is drawn one frame after the edit (meshing runs in workers); a phone's worker
  latency at 60 fps is unmeasured. The worker-assisted initial build (`?meshbuild=pool`) is
  opt-in until it is measured on a device.
- Lighting (round 4): the camp's cool counterpoint is subtle. The cool-hue share in the camp
  is still 0 %, because the umber rock sits under the fire's warm light. The lows stay lifted
  in the open Hollow (p5 luma 21–36) so the darkest shot stays navigable. a04's
  whole-foreground saturation is 0.22 (target 0.25): the dim charcoal floor neutralises.
  Structure meshes still use the 4-argument `ambientFrom` (no lantern share), so stairs and
  the bridge under the lantern keep slightly more cool fill than rock.
- Camera (round 4): the explorer's size and the lens vary with the space by design (about
  120–125 px and 94° in passages, 165 px and 105° in the shrine). The longer boom can bring a
  newel or a crystal cluster large into the foreground (tour a14, a15). In the look-up shot
  over the bridge approach (a16), a parapet cuts the boom and the explorer is cropped at the
  bottom edge.
- Natural rock is chamfered on the CPU: walkable edges sit up to ≈0.3 m below their collision
  height at convex corners (0 on flat interiors), and rock can reach 0.36 m into voxels the
  physics treats as open (the camera keeps 0.4 m from voxel hits for this reason).
- Only built forms (stairs, columns, bridge, kerbs, copings, camp timber, the monolith) are meshes
  over voxel collision; the temple gate portal, its stepped buttresses, the hall walls and the
  shrine are still 1 m voxel masonry. Terrain faces next to hidden structure cells are still
  meshed (depth-rejected behind the structures, but they cost vertices), and building a
  structure cell can take a few tens of ms in one frame while the menu shows.
- Under heavy machine load (load average 8–13 on 4 cores) the desktop e2e spec's 10 s wait for
  a pointer-lock answer can time out; it passes on an idle machine (4/4 e2e, October 2026).
- Building a save scans the whole 3.3 MB voxel volume (~2 ms here, ~8 ms for the whole save
  build); expect a few times that on a phone, on camp entry / craft / autosave.
- No positional (3D) audio: only ambient drips and rumbles get a random stereo pan.
- The UI-readability view of the Visual Lab is the UI sandbox page with a painted backdrop, not
  the 3D cave.
