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

- The game needs Android System WebView / Chrome 88 or newer (January 2021): the brand's `:where()`/`:is()` selectors, CSS `inset` and `replaceChildren`. Older engines see an 'update your WebView' message instead of the game. The WebView updates itself through the Play Store on Android 7+, so only un-updated devices hit this.
- The Play bundle (Gradle, compile/target SDK 36) and the CI workflow are written but **unverified until their first CI run**: Google's SDK and Gradle downloads are blocked in this container. The smoke-test APK (`android/build-apk.sh`, API 23 toolchain, targetSdk 36) is the verified path.
- The native API 28+/30+/33+ behaviours (predictive Back, cutouts, WindowInsetsController, renderer recovery, lifecycle timers, the API 31 splash, themed icon) are reflection-based and **untested on a device or emulator**.
- The smoke-test APK has no manifest overlay. On API 33–35 it uses the legacy onBackPressed path (Android 16 forces the callback path, which the shell also registers) and it lacks the API 31 splash theme.
- The crash panel waits for the frame guard's 3 failed frames: under SwiftShader (about 2 fps) that is 0.4–2.3 s; on a phone it should be about 0.1 s (unverified).
- Governor thresholds (22 ms / 40 ms medians) are set by reasoning, not tuned on phones.
- The store title is pending the trademark check (Capcom holds 'Deep Down'); the support email, copyright line and game licence are director decisions.

## Gameplay / content

- World W2: the explorer has no climb or hold pose during the hoist and rope rides (requested from feel W5).
- The reliquary's 6 and the gallery's 8 lamp niches are empty until content's stoneLamp prop lands.
- The relics give only their discovery until the bearerLens and firstLamp key items exist.
- Camera (lens, read-only for W2):
  - the boom collapses and the explorer fades inside the 1 m grotto squeeze;
  - the boom collapses at the rope foot when looking away from the wall;
  - on the adit approach the camera rests against a pre-existing brick pillar, so 21 % of the tour frame f13 is an unlit face.
- Ride, door, note and stone sounds re-pitch existing voices and have not been listened to.
- The first breath of a session costs 15–18 ms plus 10–11 ms the next frame under SwiftShader, and up to about 38 ms per frame was seen at load average 4 or more. Phone timing is unmeasured.
- The HALDEN LOG banner label, the rune-door progress ring and journal grouping of the logs wait for screens (W3).
- Cold is continuous (2 hp/s) rather than discrete 10 hp hits, so both acceptance lines hold (first damage at 8 s, black-out at 58 s). The heartbeat event 'player:cold' fires every 5 s of cold.
- The cache uses an interim crate model with an ember halo until the W2 satchel. The turn-back tick, cache chip and fuel-state classes have only inline styles until W4-B.
- The discovery banner does not show index/total yet, and the Expedition Report has no screen yet (W2/W3).
- 25 reachable cells (pits) have no walk home; caches are never placed there (the nearest cell with a way home is used).
- v1 saves migrate with genVersion 0, so their world edits are dropped on first load (the world they were made in is unknown).
- Memory: walk-home field 13 MB (Int32), reach set 3.3 MB, plus 13 MB for the cache field while a cache exists.
- Phone feel of the turn-back and cold haptics: unverified.
- One zone only (the Lantern Hollow). The Deep Gate leads to a balcony over the rift; the rift
  is the end of the vertical slice.
- Creatures and active hazards (falling rocks, gas) are not in the slice; the risks are falls,
  the lethal chasm and running out of lantern fuel.
- Drops left on the ground (backpack full) are not saved, and they fade after 90 s. A black-out
  sweeps loose drops into the cache.
- Mined crystal light is gone for good (crystals do not regrow).
- Balance (hardness, fuel, recipe costs) is tuned by tests and play-throughs in a desktop
  browser, not by players.

## Technical

- The cache chip in Hud.ts still carries an inline pill style. ui.css overrides it with !important until home-hud (W5) moves it to CSS.
- The Lintel face has caps only, so lower case shows as caps: the depth readout renders '-128 M' while its DOM text stays '-128 m' (the stable hook).
- The boot mark is 919 B, not ~600 B.
- The crash panel and the context-loss notice sit outside .dd-ui. Their rim is an inset box-shadow, so their chamfered corners carry no brass line.
- Range-slider focus is a rectangular amber outline, not an octagon.
- Untested on devices: real-device font rendering of the runtime TrueType, phone feel, and the WebView.
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
