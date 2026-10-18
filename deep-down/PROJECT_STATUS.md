# DEEP DOWN — Project Status

_Milestone M1 (vertical slice "The Lantern Hollow"): **feature-complete and verified in this
environment.** All 12 acceptance criteria pass their automated checks (DEVELOPMENT_ROADMAP.md).
Not yet verified on a real phone: no Android device or emulator was available._

## Play it

```bash
cd deep-down
npm install            # .npmrc sets legacy-peer-deps
npm run dev            # http://localhost:5173  (Visual Lab: /visuallab.html)
npm run build          # production build in dist/
./android/build-apk.sh # debug APK (see android/README.md)
```

Desktop controls: WASD move, mouse look (click to capture), hold left button to mine, Space
jump, E use, I / Tab bag, Esc pause. Touch: left half joystick, right half drag to look,
press and hold to mine, buttons for jump / use / bag / pause.

## Systems

| System | State | Evidence |
|---|---|---|
| Voxel world, chunks, mesher (AO) | ✅ Done | unit tests (geometry, winding, AO, chunk borders) |
| Colored flood-fill light, light removal, openness, lantern visibility | ✅ Done | property tests vs full recompute; lantern agrees with ray tracing; perf numbers |
| Procedural textures (34 tiles), terrain shader, HDR post FX | ✅ Done | Visual Lab + in-game screenshots; float-target fallback |
| World generation (camp → tunnel → Hollow → stairs → hall → shrine → gate → rift), in a Web Worker | ✅ Done | determinism, reachability, walk-the-route simulation, material supply |
| Player controller, camera (collision, shoulder swap), desktop input | ✅ Done | physics and camera tests |
| Mining (swing timing, tiers, 10 crack stages, debris, dust, drops) | ✅ Done | e2e through the touch controls |
| Props (14 kinds) + jointed explorer character | ✅ Done, reviewed | module tests, Visual Lab renders |
| Audio (46 synthesized sounds, ambience, music, reverb) | ✅ Done, reviewed | tests + offline spectral analysis; **not heard by a human** |
| Gameplay rules (inventory, storage, crafting, lantern, health, objectives, journal) | ✅ Done, reviewed | unit tests, e2e |
| Save system (two slots, checksum, migrations, recovery) | ✅ Done, reviewed | unit tests, e2e save → reload → Continue |
| UI (menu, HUD, touch controls, inventory, workbench, settings, pause, death, discoveries) | ✅ Done, reviewed | 60 UI checks, e2e |
| Settings (quality, render scale, glow, brightness, FPS, sensitivity, invert, left-handed, 4 volumes, camera shake, large text, high contrast) | ✅ Done | applied at boot and live; sanitized |
| Visual Lab (materials, crystal light, lantern light, damage stages, particles, pickup, character, props, UI readability) | ✅ Done | screenshots in TEST_REPORT.md |
| Android shell + APK | ✅ Builds, signed, packaging simulated | **never installed on a device** |

## Definition of success (from the brief)

| Step | Verified by |
|---|---|
| 1. Start the game | e2e: menu → New Expedition |
| 2. Go underground | e2e: depth HUD in metres below the surface |
| 3. Move naturally with mobile controls | e2e: floating joystick drag moves the explorer > 1.5 m |
| 4. Mine and collect resources | e2e: press-and-hold mines copper; ore flies into the backpack |
| 5. Discover something unexpected | e2e: Lantern Hollow banner; all six discoveries in `world.spec.ts` |
| 6. Return to camp | e2e: backpack banked into camp storage |
| 7. Craft an upgrade | e2e: Workbench → Craft Copper Pickaxe via the Use and Craft buttons |
| 8. Feel the difference | e2e: fewer hits on slate; Hardened Slate now breaks |
| 9. Save and resume | e2e: reload → Continue restores pickaxe, position, mined seal, journal |

## What remains before calling it shippable

1. Run it on real Android devices (mid-range 2022 class and a low-end one): FPS, thermals,
   touch latency, audio, Back / lifecycle behaviour. Nothing here could measure those.
2. A by-ear audio mix pass.
3. A Play-Store-grade build (current compile SDK via Gradle, release signing, AAB).

See KNOWN_ISSUES.md for limitations and DEVELOPMENT_ROADMAP.md for what comes next.
