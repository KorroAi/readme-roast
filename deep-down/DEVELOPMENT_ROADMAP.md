# DEEP DOWN — Development Roadmap

Milestones are only marked done when their acceptance criteria are checked (see TEST_REPORT.md).

## M0 — Environment and foundation ✅
- Environment assessment; engine decision (Unity/Godot unavailable here, see TECHNICAL_ARCHITECTURE.md).
- Voxel storage, chunk mesher with AO, colored flood-fill light + lantern visibility volume,
  procedural pixel-art texture array, terrain shader, HDR post chain, screenshot tooling.

## M1 — Vertical slice: "The Lantern Hollow" ✅ (verified in this environment; device test pending)
Scope: one zone, one camp, one crafting station, three recipes, five resources.

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Boots to an English main menu over a live 3D scene; New Expedition and Continue work | ✅ | e2e both specs; ui-check |
| 2 | Touch: floating joystick, drag-to-look, press-and-hold-to-mine, jump, use, bag, pause. Desktop: WASD / mouse | ✅ | ui-check touch section (joystick, look, hold/tap mine, multi-touch, buttons, left-handed); e2e uses real touch events; `tests/e2e/desktop.spec.ts` (WASD, Space, right-drag look, left-hold mining with and without pointer lock, E / I / Tab / Esc). Captured mouse look: manual only |
| 3 | Mining: per-material durability, 10 crack stages, impact punch, cubic debris, dust, distinct stone / metal / crystal sounds, tier gating with clear feedback | ✅ | gameplay-mining tests; Visual Lab damage stages; audio centroids 2.0 / 3.0 / 5.3 kHz; e2e iron-vein gating |
| 4 | Stone, copper ore, glimmer shards (iron visible but gated) drop and fly into a 6-slot backpack; pickup notices; backpack-full handling | ✅ | e2e copper pickup; inventory tests; UI pickup feed |
| 5 | Camp → lantern tunnel → ledge reveal → stairs → pillared hall, crystals, violet chasm, hidden shrine, sealed gate; every critical place reachable | ✅ | reachability + route-walk tests; e2e visits every discovery |
| 6 | Camp banks, refills the lantern, heals; Workbench crafts Copper Pickaxe (+60 %, breaks Hardened Slate and iron), Sturdy Backpack, Copper Lantern; the difference is measurable | ✅ | e2e bank + craft + fewer hits + seal breaks; crafting / survival tests |
| 7 | Six discoveries, each with a banner, a journal entry and an audio cue | ✅ | `tests/e2e/world.spec.ts`; audio event-mapping tests |
| 8 | Lantern fuel, fall damage, death loses the unbanked backpack, respawn at camp | ✅ | survival tests; `tests/e2e/world.spec.ts` fall damage, lantern burn-down, lethal fall, saved death, respawn |
| 9 | Versioned two-slot save with checksum, autosave on camp / craft / discovery / background; resume restores everything | ✅ | save tests (corruption, interrupted writes, migrations); e2e asserts the `camp`, `craft`, `discovery` and (simulated) `background` autosaves and the saved slot; e2e reload → Continue; death save. The 45 s timer is not tested |
| 10 | HUD: health, lantern, backpack, depth, camp compass, objective, target info | ✅ | e2e asserts each element follows the game (hearts after a fall, fuel, slot count, compass distance, objective changes, target name); mutation-checked |
| 11 | Visual Lab: materials, crystal light, lantern light, crack stages, particles, pickup effects, UI, character | ✅ | 8 3D views + UI-readability scenes; screenshots inspected by eye (manual) |
| 12 | Zero console errors in e2e; unit + e2e green; screenshots inspected; performance measured | ✅ | TEST_REPORT.md (screenshots and performance on SwiftShader, not on a phone) |

Open from M1 (moved to M5): measure on real Android devices; by-ear audio mix.

## M2 — Expedition loop depth
- Expedition summary screen on extraction (what was found, banked, lost).
- First hazard set: falling rocks on heavy mining, unstable ground, a first creature
  (light-averse "Gloomcrawler") that makes the lantern a tool, not just a light.
- Furnace station: smelt copper/iron ingots; iron tools (tier 3); rope/ladder placement so
  vertical shafts become routes. Simple map of explored cells.

## M3 — Second biome: Crystal Caverns (through the Deep Gate)
- New zone volume generated with its own composition rules; descent transition.
- Crystal resonance puzzles, cyan/violet light set, glass-like materials, new ores.

## M4 — The deep biomes and the mystery
- Ancient Ruins, Lava Depths, Frozen Caves, Abyss. Each with one signature mechanic,
  a material set, a lighting set, and lore fragments that build the abyss mystery.
- Camp upgrade tree (permanent progression): lift, forge, cartographer's table.

## M5 — Mobile production
- **First:** install the APK on a 2022 mid-range and a low-end Android phone; measure FPS,
  thermals, touch latency, audio, Back and lifecycle; fix what that finds.
- On-device profiling on the target device classes; adaptive quality.
- Android release build (signed AAB, targetSdk current), immersive mode, back button,
  lifecycle/audio focus handling; iOS WKWebView wrapper.
- Accessibility review (text scale, contrast, motion, controls remapping, haptics).

## M6 — Content completion and polish
- Full narrative, achievements, balancing passes, audio/music variety, store assets.
