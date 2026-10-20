# DEEP DOWN — Project Status

_Milestone M1 (vertical slice "The Lantern Hollow"): **feature-complete; verified in this
environment by unit, end-to-end, UI and packaging tests plus screenshot review** (evidence per
acceptance criterion in DEVELOPMENT_ROADMAP.md; what is only checked by hand is listed in
TEST_REPORT.md → "Not covered by automated tests"). Not yet verified on a real phone: no Android
device or emulator was available._

## Play it

```bash
cd deep-down
npm install            # .npmrc sets legacy-peer-deps
npm run dev            # http://localhost:5173  (Visual Lab: /visuallab.html)
npm run build          # production build in dist/
./android/build-apk.sh # debug APK (see android/README.md)
```

Desktop controls: WASD move, mouse look (click to capture), hold left button to mine, Space
jump, E use, I / Tab bag, Esc pause. Touch (landscape; a phone browser goes fullscreen and
locks landscape on Start): left half a floating joystick that follows the thumb, right half drag
to look, a large Mine button (hold; aim assist picks the block you face) or press and hold on a
block, buttons for jump / use / bag / pause, short vibrations on strikes, breaks and pickups.

## Systems

| System | State | Evidence |
|---|---|---|
| Voxel world, chunks, mesher (AO) | ✅ Done | unit tests (geometry, winding, AO, chunk borders) |
| Colored flood-fill light, light removal, openness, lantern visibility | ✅ Done | property tests vs full recompute; lantern agrees with ray tracing; perf numbers |
| Procedural textures (34 tiles), terrain shader, HDR post FX | ✅ Done | Visual Lab + in-game screenshots; float-target fallback |
| World generation (camp → tunnel → Hollow → stairs → hall → shrine → gate → rift), in a Web Worker | ✅ Done | determinism, reachability, walk-the-route simulation, material supply |
| Player controller, camera (collision, shoulder swap), desktop input | ✅ Done | physics and camera tests (incl. a fuzz over the real zone); desktop e2e with real keyboard and mouse |
| Mining (swing timing, tiers, 10 crack stages, debris, dust, drops) | ✅ Done | e2e through the touch controls |
| Props (14 kinds) + jointed explorer character | ✅ Done, reviewed | module tests, Visual Lab renders |
| Audio (46 synthesized sounds, ambience, music, reverb) | ✅ Done, reviewed | tests + offline spectral analysis; **not heard by a human** |
| Gameplay rules (inventory, storage, crafting, lantern, health, objectives, journal) | ✅ Done, reviewed | unit tests, e2e |
| Save system (two slots, checksum, migrations, recovery) | ✅ Done, reviewed | unit tests, e2e save → reload → Continue |
| UI (menu, HUD, touch controls, inventory, workbench, settings, pause, death, discoveries) | ✅ Done, reviewed | 60 UI checks, e2e (every HUD element is asserted to follow the game) |
| Settings (quality, render scale, glow, brightness, FPS, sensitivity, invert, left-handed, 4 volumes, camera shake, large text, high contrast) | ✅ Done | applied at boot and live; sanitized |
| Visual Lab (materials, crystal light, lantern light, damage stages, particles, pickup, character, props, UI readability) | ✅ Done | screenshots written to artifacts/ (git-ignored); inspection log in TEST_REPORT.md |
| Trip loop (lantern clock, cold, walk-home compass, turn-back mark, black-out cache, records, Next line) | ✅ Done (final pass W1) | unit tests (cold, homeField incl. every reachable cell, cache fuzz over 200 lethal falls, records, save v2); e2e world.spec (death → cache → reload → recovery) |
| World variety (final pass W2): Survey Office, Moth Grotto, Halden Yard and hoist, Reliquary and Lamp Gallery behind rune doors, rope to the rift floor, black stone, 4 Halden logs, lumen moths, living rock and a bloom per expedition | ✅ Done (UI labels, niche lamps, relic items and the finale wait for W3/W4) | worldFeatures/livingRock/moths/ropeRide/runeDoor/guidance unit tests (35); e2e world.spec 'Halden log … black stone'; tools/poi-density.ts; tour f01–f20 read |
| Brand identity (final pass W2): carved wordmark with the lantern-rune O, octagon brass plates, lintel headers, Lintel stroke face, specimen icons, one emblem for boot mark, favicon, web/Android icons and splash | ✅ Done (the W3 screens build on its primitives) | brand.test.ts (18), ui.test.ts, ui-check 64/64 over 5 viewports with a 48 px target floor, icon-masks 4/4 |
| Save v2 (progression block, world genVersion + fingerprint, v1 migration) | ✅ Done | save-v2 and genVersion tests |
| Crash panel + context-loss notice | ✅ Done | e2e release.spec (6 tests) |
| Automatic quality governor | ✅ Done | governor unit tests (9), e2e with CPU throttling ×6; thresholds unverified on phones |
| Versioning (`tools/version.mjs`, 1.0.0 → versionCode 1000000) | ✅ Done | version unit tests (7), aapt badging |
| Android shell + APK | ✅ Smoke-test APK builds (API 23 toolchain, targetSdk 36, versionCode 1000000), signed, packaging simulated (apk-sim incl. crash panel, privacy, licences) | Play AAB via Gradle + CI written, **unverified until the first CI run**; **never installed on a device** |

## Definition of success (from the brief)

Checked by `tests/e2e/slice.spec.ts` on a 915×412 touch viewport. Touch input is real (joystick,
hold-to-mine, buttons); the walks between places are debug teleports and the rest of the recipe
is granted, so the test proves each step works, not that a player finds the way (the route itself
is proven walkable by `routeWalk.test.ts`).

| Step | Verified by |
|---|---|
| 1. Start the game | menu → New Expedition |
| 2. Go underground | depth HUD in metres below the surface |
| 3. Move naturally with mobile controls | floating joystick drag moves the explorer > 1.5 m |
| 4. Mine and collect resources | press-and-hold mines copper; the ore lands in the backpack |
| 5. Discover something unexpected | (teleport to the ledge) Lantern Hollow banner; all six discoveries in `world.spec.ts` |
| 6. Return to camp | (teleport) backpack banked into camp storage, autosaved |
| 7. Craft an upgrade | (teleport to the bench) Use → Workbench → Craft Copper Pickaxe |
| 8. Feel the difference | fewer hits on slate; Hardened Slate now breaks |
| 9. Save and resume | reload → Continue restores pickaxe, position, mined seal, journal |

## What remains before calling it shippable

1. Run it on real Android devices (mid-range 2022 class and a low-end one): FPS, thermals,
   touch latency, audio, Back / lifecycle behaviour. Nothing here could measure those.
2. A by-ear audio mix pass.
3. The first CI run of the Play bundle (`.github/workflows/deep-down-android.yml`; Gradle,
   compile/target SDK 36, upload key from secrets). It is written but cannot run here.
4. The director-only release steps in `docs/release-checklist.md`: Play account, trademark
   and title check, upload key and secrets, listing forms, device runs
   (`docs/device-test-protocol.md`).
5. The rest of the final pass (`docs/final-pass/MERGE.md`): waves 2–5.

See KNOWN_ISSUES.md for limitations and DEVELOPMENT_ROADMAP.md for what comes next.
