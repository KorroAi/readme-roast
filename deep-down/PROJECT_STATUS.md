# DEEP DOWN — Project Status

_Version 2.0.0, round 3 "Le Grand Gouffre": a random open world of 6 strata and 12 biomes plus the Heart, 74 kinds of
creatures, a real goal (relight the Heart), a mobile action layout, menus and crafting for everything, and French. It is
**verified in this environment** by unit, end-to-end, UI and packaging tests, plus captures opened by the lead and a
playtester (TEST_REPORT.md → "2.0.0 gate"). It is **not yet verified on a real phone**: no Android device or emulator was
available, so the feel, the frame rate and the sound by ear are unverified._

## Play it

```bash
cd deep-down
npm install            # .npmrc sets legacy-peer-deps
npm run dev            # http://localhost:5173  (Visual Lab: /visuallab.html)
npm run build          # production build in dist/
./android/build-apk.sh # debug APK (see android/README.md)
```

**The goal.** The Heart of the deep has gone dark. Go down through 6 strata, each with 2 biomes:
- I: Amber Hollows and the Mushroom Forest;
- II: the Root Galleries and the Flooded Grottoes;
- III: the Crystal Geode and the Old Halden Mines;
- IV: the Frost Caverns and the Glowroot Jungle;
- V: the Sulphur Bog and the Sunken City;
- VI: the Magma Veins and the Obsidian Abyss.

Each biome's guardian holds a Heart Shard, and a stratum's 2 shards open its Gate to the next. At the bottom, the 12 shards
relight the Heart, then come its guardian, the ending and free play. The tracker at the top always shows the next step, and a
compass arrow points to it. Quests (J) holds the main chain, biome tasks, camp orders and feats.

**Touch, upright phone** (390 × 844 is the reference):
- **Move and look.** The left lower third is a floating joystick; push it to its edge to sprint. Drag anywhere else to look.
- **Buttons on the right:**
  - Action: mine the find or strike the creature under the reticle, hold to continue;
  - Jump;
  - Dash: a dodge with a moment of invulnerability;
  - Interact: appears next to chests, stations, beings and gates;
  - Sonar: shows ores, chests and lairs through rock for a moment;
  - Place: appears when a torch, block, ladder or rope is in the hand.
- **Taps.** A tap on a target in reach still acts on it.
- **Hotbar.** The bottom has 6 slots: tap a slot to select it, long-press it to assign.
- **Top bar.** Health and the flame, depth, the biome and the stratum, the minimap, and the Bag, Craft, Map, Quests and ≡
  buttons.

**Craft everything.** The Workbench, Furnace, Forge and Alchemy Table make:
- picks I–VI;
- weapons: the machete, sword, great axe, spears, the sling, crossbows and bombs;
- armour sets that guard against cold, gas and heat;
- lanterns and consumables;
- building pieces: torches, ladders, ropes, planks, bricks and doors;
- the Outpost Kit: a bank, fast travel, a respawn bed and a light.

The camp can be upgraded, and a trader barters. The Map shows the explored stratum and its markers, with fast travel. Only finds
break: ores, crystals, gems, rubble and roots. Plain rock holds, and each find glows in its rarity colour.

**Desktop:**
- WASD to move, Shift to sprint, the mouse to look (click to capture it);
- the left button for Action and the right button to Place;
- Space to jump, Ctrl to dash, E to interact, Q for the sonar, F for a flash charge;
- 1–6 for the hotbar;
- I or Tab for the Bag, C for Craft, M for the Map, J for Quests, B for the Bestiary;
- Esc to pause.

**Language.** English or French, from Settings → Accessibility, or the device's language.

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
| Round 3 world: 6 random strata of about 256 × 96 × 256 blocks, 12 biomes + the Heart, vistas, rivers, structures, lairs, gates, outposts | ✅ Done | strata, strata-traps and world-r3 unit tests; 16 seeds × 6 strata = 96/96 plans pass on the first attempt, 0 trapped cells, every route reachable; props probe 0 flagged on 6 seeds |
| Round 3 creatures: 49 monsters, 12 beings, 13 guardians (the Dark Heart in 3 phases), the Lampling companion | ✅ Done | mob unit tests; duel simulator per guardian; e2e mobs.spec (a fight in 3 biomes, 36 creatures of 12 kinds drawn, a guardian beaten end to end, the companion tamed) |
| Round 3 loop: the main chain (24 steps), side tasks, camp orders, Bestiary, feats, an 11-step tutorial, hazards, 121 items, 96 recipes, 4 stations, outposts | ✅ Done | LOOP unit tests; economy sim 136–142 min to the Heart on 3 seeds; the whole chain driven in the real game (stratum I to the ending and free play) |
| Round 3 controls, HUD and menus (joystick sprint, Action, Jump, Dash, Interact, Sonar, Place, hotbar, minimap, tracker, compass; Bag, Craft, Map with fast travel, Quests, Bestiary, Settings) | ✅ Done | r3 e2e specs with real CDP touches at 390 × 844 (first five minutes, menus, controls, build, descent, travel, cards, tap, desktop); ui-check 124/124 |
| French (about 2,300 lines; device language or Settings) | ✅ Done | i18n-fr guard (0 missing, 0 stale), loop-text guard, seen in the browser at 390 × 844 |
| Save v4 + the 1.x card (feats, records and lifetime stats kept) | ✅ Done | save unit tests; a real 1.1.0 save loaded by QA in the 2.0.0 build |

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
5. A balance pass with real players. The guardians are tuned by a duel simulator and one scripted playtester, and the run to
   the Heart (about 136–142 minutes in the economy simulator) has not been timed by a person.

See KNOWN_ISSUES.md for limitations and DEVELOPMENT_ROADMAP.md for what comes next.
