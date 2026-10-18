# DEEP DOWN — Development Roadmap

Milestones are only marked done when their acceptance criteria are checked (see TEST_REPORT.md).

## M0 — Environment and foundation ✅
- Environment assessment; engine decision (Unity/Godot unavailable here, see TECHNICAL_ARCHITECTURE.md).
- Voxel storage, chunk mesher with AO, colored flood-fill light + lantern visibility volume,
  procedural pixel-art texture array, terrain shader, HDR post chain, screenshot tooling.

## M1 — Vertical slice: "The Lantern Hollow" (current)
Scope: one zone, one camp, one crafting station, three recipes, five resources.

Acceptance criteria (all must be verified):
1. Boots to an English main menu over a live 3D scene; New Expedition and Continue work.
2. Touch controls: floating joystick, drag-to-look, press-and-hold-to-mine, jump, use, bag,
   pause. Desktop: WASD/mouse equivalents.
3. Mining: per-material durability, 10 crack stages, impact punch, cubic debris, dust,
   distinct sounds for stone / metal / crystal, tier gating with clear feedback.
4. Resources: stone, copper ore, glimmer shards (iron ore visible but gated) drop and fly
   into a tiny 6-slot backpack; pickup notifications; "backpack full" handling.
5. Environment: camp → lantern-marked tunnel → ledge reveal over the Hollow → ancient
   stairs → pillared hall, crystal formations, violet chasm, hidden shrine, sealed gate.
   Every critical place is reachable (automated reachability test).
6. Camp: entering banks the backpack, refills the lantern, heals. Workbench crafts the
   Copper Pickaxe (+60% mining speed, breaks Hardened Slate and iron), Sturdy Backpack,
   Copper Lantern. The difference after upgrading is measurable in tests.
7. Discoveries: Lantern Hollow, Glimmer Crystals, Sealed Shrine, Ancient Tablet, Iron Vein,
   Deep Gate — each with a banner, a journal entry, and the discovery audio cue.
8. Risk: lantern fuel, fall damage, death loses the unbanked backpack, respawn at camp.
9. Persistence: versioned two-slot save with checksum, autosave on camp/craft/discovery/
   background; resume restores position, inventory, equipment, mined tunnels, journal.
10. HUD: health, lantern, backpack capacity, depth, camp compass, objective, target info.
11. VisualLab: isolated, repeatable views of materials, crystal light, lantern light, crack
    stages, particles, pickup effects, UI, character.
12. Quality: zero console errors in the e2e run; unit + e2e tests green; screenshots
    inspected; performance measured and recorded.

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
- On-device profiling on the target device classes; adaptive quality.
- Android release build (signed AAB, targetSdk current), immersive mode, back button,
  lifecycle/audio focus handling; iOS WKWebView wrapper.
- Accessibility review (text scale, contrast, motion, controls remapping, haptics).

## M6 — Content completion and polish
- Full narrative, achievements, balancing passes, audio/music variety, store assets.
