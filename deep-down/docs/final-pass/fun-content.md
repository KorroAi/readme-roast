# Fun spec — content

## Pitch
Today the deep side of the Lantern Hollow (the stairs, the hall, the seal and the gate stair) has nothing to mine or use for 112 m of the 245 m critical path, and no new kind of thing for 139 m. 87 % of the props outside camp are lamp posts or crystal clusters, and the lantern can only be refilled at camp. The content pass gives the deep a population and a pulse, with a few strong things rather than many shallow ones. Warm lanternstone seams glow in the darkest walls; mining one feeds your lantern on the spot (+30 s). That turns the oil bar into a gamble ("push on to that warm glint, or turn home?"), and it is the Lantern-bearers' secret: their lamps never needed oil. Tin gives the Hollow and the gate corridor a second metal, dark grains in pale quartz, as copper's partner in bronze. Hollow copper and iron veins grow from specks into veins worth a vein rush. Halden strongboxes appear on the compass ("Cache 34 m") when you read one of the world agent's Halden logs, and branded supply crates full of embers, tin and glimmer lie loose in the hall. Two spectacles reward attention without new geometry. In Resonance, lingering with your lantern by a crystal cluster makes the whole chamber blaze for 16 s, and every shard gives one more. In the Glimmerfall surge, mid-bridge, the fall roars, widens and throws spray you can catch for a shard. The world agent's reliquary and lamp gallery get their Lantern-bearer stone lamps, which stir as your light passes. SHOULD adds statues that wake along the stairs, the vanished miner (an empty coat with upright boots, no body), an upright ore cart, a one-shot tremor that breaks open a glowing pocket, and fossils that foreshadow the Buried Sea.

## Measured today
All read-only, from scripts in /tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fun-design/content/ (content-measure.ts, sites.ts, content-proto.ts, clusters.ts; logs beside them). Captures are in /home/user/readme-roast/deep-down/artifacts/fun-design-content/c01-c08; I read all of them, plus arch4-4 a01/a02/a03/a04/a06/a08/a10/a11/a12/a16, round3/lab-tr-minerals, lens4-lab3/lab-props and fun-design-world w02/w03/w04.

Inventory:
- Blocks: 34 ids, 18 visible, 11 minable.
- Minerals: copper 119 voxels in 89 clusters (65 % single voxels), iron 49 in 35, crystal 35 in 19, plus 12 minable cluster props.
- 5 items, 3 recipes, 29 material layers.
- Props: 14 kinds, 53 instances. Outside camp there are 38, of which 21 are lamp posts and 12 crystal clusters (87 %), and only 7 kinds.
- 57 structure specs, 5 effect systems, 6 discoveries.
- Found text: 1 (the tablet); 87 lore words in all.
- Cyan/violet emitters: 103 (cap 120). Warm light only at lamps and camp. The lantern (300 s oil / 600 s copper) can only be refilled at camp.

Critical path (spawn to balcony, barriers open): 209 cells, 245 m.
- New KINDS of thing: crystal clusters at 52 m, then nothing new until iron at 191 m. That is a 139 m gap: about 30 s at full speed, about 60 s for a first-timer at 2.3 m/s.
- Interactive things (mine, use, loot): longest gap 112 m (78 to 190 m), covering the stairs, the hall and the seal.
- Any non-lamp thing: longest gap 45 m.
- No rock is within mining reach from (108,77,76) to the stairs foot: the flights are free-standing masonry.

Darkness and empty floor:
- 2491 exposed host-rock voxels in the Hollow are more than 12 m from any warm lamp; 37 dark sites at least 12 m apart.
- 23 % of walkable columns are more than 10 m from any prop, landmark or column.

Prototype of my pass (content only, today's world, validated outside the world agent's feature boxes): new-kind gap 139 to 71 m (59 m with SHOULD); interactive gap 112 to 49 m; non-lamp gap 45 to 28 m; prop kinds outside camp 7 to 8 (11 with SHOULD); lamps and clusters 87 % to 72 % (66 %).

## Spec
# DEEP DOWN — Content: ores, assets, special events

A spec for one specialist agent (the author, next step): about **3 h 45 of MUST** work plus about
**1 h 45 of SHOULD** work. Everything is procedural, all player-facing text goes in
`src/i18n/en.ts`, and the existing game and tests keep working. It is written to sit beside the two
sibling specs in this folder, `spec-world.md` (places, rides, rune doors, moths, Halden logs,
living rock, epoch blooms) and `spec-moment-to-moment.md` (strikes, pockets, contracts, report,
director). It claims nothing those specs already own, and it delivers the assets they asked for.

The full text is saved at
`/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fun-design/spec-content.md`
(about 52 KB). Its sections:

0. Pitch
1. Measured today: scripts, captures read, the inventory and route table
2. Rules for this pass:
   - generation order: features, then content, then pockets
   - switches, RNG and ids, the block-id claim 34–38, placement fences
   - light budget (0 new cyan), art, saves (one optional field), performance
3. MUST:
   - C1 Lanternstone and the Lantern Ember: block, painter, tile, halo, item, pickup rule, a 7-seam placement table, tests
   - C2 Tin and vein growth: block, two painters with ramps, item, a 10-cluster placement table, use, growth numbers, tests
   - C3 Halden crates and caches on the compass: 3 variants, the loot table, the cache-to-log table with positions, the waypoint chip, loose crates, tests
   - C4 Resonance: a sites table, linger, swell, hold and fade numbers, harvest, cadence, the transient-light safety rule, tests
   - C5 Stone lamps and the wake system
   - C6 Glimmerfall surge
   - C7 Content pass, layout data, metrics tool and tour
4. SHOULD:
   - S1 Lantern-bearer statues
   - S2 The vanished miner
   - S3 Upright ore cart
   - S4 Tremor pocket reveal
   - S5 Fossils and relic key items
5. COULD: amber inclusions, chalk marks, glimmer motes, desk and runeDial, adit creak, headframe dust, the hand in the crystal, the curio shelf
6. Ideas considered and not taken, with reasons
7. Data, events, audio fallbacks, i18n keys and text, debug API
8. Before and after numbers from the prototype
9. Ownership: new files and hook edits
10. What I need from the other workstreams
11. Tests, tour and metrics
12. Acceptance
13. Build order, time budget and cut order
14. Risks

The items, ownership, needsFromOthers and acceptance fields of this output carry the same content
in structured form. The coordinates in the tables were validated by `content-proto.ts`.

## Items

### [MUST] C1 Lanternstone and the Lantern Ember

- **what:** A warm-glowing mineral. Mining it releases a Lantern Ember that refuels the lantern on the spot instead of entering the pack. Its look: soot-dark deep stone shot through with gold fissures and 'eyes'.
- Halos sit in the open cell in front of each face.
- The first one broken gives the discovery 'lanternstone' ("Stone that holds a flame. The old ones' lamps never needed oil.").
- A full lantern leaves the ember waiting on the ground, with its own hint.
- **where:** 7 seams (9 voxels), all beyond 150 BFS cells from camp, outside the world agent's feature boxes:
- L1 (127,41,120) chasm north rim, d169
- L2 (152,43,105) gate corridor end, d177
- L3 (152,34,113) gate stair east wall, d186 (+1 voxel)
- L4 (152,27,123) gate stair foot, d197 (+1)
- L5 (94,41,123) hall south-west, d193
- L6 (73,41,110) hall west before the shrine, d199
- L7 (83,42,131) darkest south-west corner, d210
Plus living-rock rows: 1 per epoch on haldenFace, 2 per epoch on riftWalls.
- **numbers:** - Block id 35: hardness 3, tier 1 (rusty pick 3 hits 1.07 s; copper pick 2 hits 0.65 s); drop lanternEmber x1; sound crystal.
- Emission [0.55,0.36,0.14] (about 55 % of a route lamp); layer glow 0.8; fissures ≤ 12 % of texels, ≥ 10 emissive texels per 1 m window.
- Ramp LANTERN = [0x2a1406, 0x5a2c0c, 0x96521a, 0xd18a34, 0xffc76f]; halo rgb (1.5,0.95,0.42), size 0.5.
- Ember: +30 s per pickup, clamped. 9 seam embers = 270 s per first clear.
- **files:** ["src/config/blocks.ts", "src/render/materials/ores.ts", "src/render/materials/palette.ts", "src/render/materials/index.ts", "src/config/tiles.ts", "src/render/textures.ts", "src/config/items.ts", "src/ui/icons.ts", "src/game/Drops.ts", "src/gameplay/Lantern.ts", "src/game/Game.ts", "src/world/gen/content.ts", "src/config/livingRock.ts (world agent's file, my rows)"]
- **test:** - content-materials: coverage per window, fissure share, max luma.
- content-gen: 7 seams / 9 voxels, exposed, within 4.0 m reach of a reachable cell with the barriers open, none at d < 150, outside the feature boxes.
- content-ember: Lantern.add clamps and returns the seconds added; the ember is never stored; a full lantern rejects without the 'Backpack full' hint.
- Tour: k01 (the warm seam on the black gate stair, compared with c05) and k02 (the ember pickup).

### [MUST] C2 Tin ore and growing the Hollow's veins

- **what:** A second metal for the deep, painted as dark blocky cassiterite grains in pale quartz stringers: the inverse of copper's bright metal in dark rock. Copper's partner in bronze for progression's mid-tier recipes.
- Hollow and beyond-seal copper and iron clusters grow from specks into real veins, so the moment agent's vein rush lands outside nests.
- Tin is cut if progression gives it no sink.
- **where:** 10 clusters of 3–4 voxels, ≥ 8 m apart, outside the feature boxes:
- T1 (140,43,98) gate corridor start, d164
- T2 (118,41,101) stairs foot, d147
- T3 (128,40,108), d160
- T4 (126,41,83), d167
- T5 (112,40,90), d162
- T6 (112,41,80), d172
- T7 (95,41,112), d179
- T8 (94,41,122), d190
- T9 (107,41,134), d189
- T10 retargeted near (80,42,104)
Vein growth: 15 copper clusters (+57 voxels) and 15 iron (+34) in the Hollow and beyond the seal; never in the tunnel (y ≥ 86) or inside feature boxes. Living rock: tin 4 per epoch on haldenFace.
- **numbers:** - Block id 34: hardness 5, tier 1 (rusty 5 hits 1.91 s; copper 4 hits 1.49 s); drop tinOre x1; about 35 tin from veins.
- Ramps: TIN = [0x15110e … 0x66574a], TIN_GLINT 0xcfc8ba (≤ 3 % of grains), QUARTZ = [0x3b4049, 0x4c525c, 0x606671] (≤ 6 % of texels).
- Grain coverage ≥ 8 texels per 1 m window; tinTop p90 luma ≤ deepTop p90 + 10.
- Proposed sinks: Bronze Lantern t3 (copper 6, tin 6, glimmer 2); Bronze-ribbed Pack t3 (stone 10, tin 8, copper 4).
- **files:** ["src/config/blocks.ts", "src/render/materials/ores.ts", "src/render/materials/minerals.ts (export 4 helpers)", "src/render/materials/palette.ts", "src/render/materials/index.ts", "src/config/tiles.ts", "src/render/textures.ts", "src/config/items.ts", "src/world/gen/content.ts"]
- **test:** - content-gen: ≥ 9 clusters of 3–4 voxels, reachable; growth touches only host voxels adjacent to ore; the tunnel's copper is byte-identical (the e2e target).
- content-materials: grain coverage, quartz share, the dark-floor rule.
- Tour: k03/k04 (tin at the stairs foot and in the corridor).

### [MUST] C3 Halden supply crates and caches on the compass

- **what:** A haldenCrate prop in 3 variants:
- v0: branded crate with iron straps, the Halden ring-H brand, a slipped lid and a lashed oil flask
- v1: crate stack on a sack
- v2: iron-bound strongbox
It is minable, with deterministic hash-based loot.

Each of the world agent's 4 Halden logs reveals a cache:
- the strongbox spawns (it is not in layout.props until revealed)
- the shared HudState.waypoints chip shows 'Cache N m'
- a toast is queued after the note banner
Revealed is derived from journal 'note.<id>' discoveries, looted from removedProps, so there is no new save field.
- **where:** Caches (validated):
- cache 1 (office log): (120.5,65,71.5) landing, d116
- cache 2 (landing log): (126.5,42,105.5) stairs foot, d154
- cache 3 (yard log): (89.5,41,121.5) hall south-west, d195
- cache 4 (rift log): (151.5,42,102.5) gate corridor, d176
Loose crates:
- crate 5 (131.5,41,95.5) seal forecourt
- crate 6 (76.5,42,107.5) hall west
- crate 7 (150.5,25,122.5) gate stair foot
Plus the world agent's office, yard and last-camp crate slots placed as kind haldenCrate.
- **numbers:** - Crate hardness 1.6, tier 1, drop null, wood sound; ≤ 500 triangles, no glow.
- Cache loot: c1 ember 2, tin 2, copper 2; c2 ember 1, tin 3, glimmer 1; c3 ember 2, iron 2, glimmer 2; c4 ember 3, glimmer 3.
- Loose crate: ember 55 %, copper 2–3 45 %, tin 2 35 %, glimmer 1 20 %, iron 1–2 15 % (beyond the seal only), never empty.
- The chip hides within 2 m.
- **files:** ["src/render/props/halden.ts", "src/render/props/models.ts", "src/world/gen/types.ts", "src/game/content/caches.ts", "src/game/content/ContentDirector.ts", "src/game/MiningController.ts (3 lines)", "src/ui/types.ts", "src/ui/hud/Hud.ts (fallback chip)", "src/i18n/en.ts", "src/world/gen/content.ts"]
- **test:** - content-caches (pure): reveal derived from journal ids; nearest selection; a looted cache hides; out-of-order reads; save round trip with no field; loot deterministic and never empty.
- content-gen: every crate is reachable, standable, not on a path cell, outside the feature boxes.
- content-props: bounds and triangles.
- Tour: k05 (cache chip) and k06 (strongbox).

### [MUST] C4 Resonance: the crystals answer your lantern

- **what:** Stand still by a crystal cluster with a lit lantern for 2 s and the site resonates for 16 s:
- swell, hold, fade, with the glow boosted to 3×
- a transient cyan light cell (LIGHT_RESONANCE, block 36, never saved) lights the chamber
- motes rise, a small post flash
- every cluster broken during the hold drops +1 glimmer
Once per site per expedition. The first ever gives the discovery 'resonance', The Crystals Answer. It is distinct from the world agent's epoch glimmer bloom, which also becomes a site.
- **where:** Sites (clusters grouped within 4 m):
- firstPocket: clusters 15–17 at (77.6,96,54.4)
- hollowCrystals: 39–42 at (113.5,43,108.5)
- shrine: 37 at (52.6,42,109.4)
- riftWest / riftEast: 30 and 31–33, once the world agent's rope makes them reachable
- the world agent's grotto clusters
- any bloom_e<epoch> prop at runtime
- **numbers:** - Linger: within 3.2 m, speed < 0.6 m/s, 2.0 s cumulative (decays at 2×); glow 1 to 1.5 while lingering.
- Swell 1.2 s to boost 3.0; hold 12 s at 2.6–3.2, pulsing 0.4 Hz; fade 2.8 s.
- Emission [0.22,0.75,0.92]; ≤ 2 cells; ≤ 50 motes; flash 0.08; trauma 0.05.
- Hint once per save after 4 s within 5 m.
- **files:** ["src/game/content/resonance.ts", "src/game/content/ContentDirector.ts", "src/config/blocks.ts (LIGHT_RESONANCE, TRANSIENT)", "src/save/worldDelta.ts (skip transient ids)", "src/render/props/PropRenderer.ts (setGlowBoost)", "src/config/content.ts", "src/i18n/en.ts"]
- **test:** content-resonance:
- The state machine starts at 2.0 s, cancels on leaving, runs once per expedition, resets at camp, and opens the harvest window.
- LightField in Node: G/B at the hollowCrystals centre rises ≥ 0.2 with the cell and returns exactly to the original after removal.
- encodeWorldEdits with a transient cell returns [].
Tour: k07/k08 (before/during) and k09; measured sampleLight delta ≥ +0.2; saturated cyan ≤ 10 % in those shots.

### [MUST] C5 Stone lamps that remember and the wake system

- **what:** A stoneLamp prop for the world agent's Lantern-bearer niches, in 3 variants:
- v0: octagonal bowl lamp
- v1: caged lantern
- v2: broken, never wakes
Each has a dormant dark-teal crystal and a glow twin. A pure wake system (reused by S1 statues) drives a new PropAnim 'wake': lamps stir to 0.35 within 2.5 m of a lit lantern, then fall back. That fits the world text 'every one of them cold'. The glow mesh is hidden while asleep, so each lamp costs 1 draw call.
- **where:** Placed by the world agent:
- 6 reliquary niches (x 117/127, y 43, z 143/145/147)
- 8 gallery niches
- 5 gate-stair niches if their C-a ships
Also in the Visual Lab props gallery, row 3.
- **numbers:** - ≤ 0.9 m cube, ≤ 300 triangles.
- Wake 0 to 0.35 in 0.8 s; 3 s fall; radius 2.5 m.
- content:wake once per lamp per expedition.
- **files:** ["src/render/props/bearers.ts", "src/render/props/models.ts", "src/render/props/PropRenderer.ts (variant override, 'wake', setGlowBoost)", "src/game/content/wake.ts", "src/lab/VisualLab.ts"]
- **test:** - content-props: every variant builds; size and triangle budgets; glow geometry only on v0/v1.
- Wake curve and hysteresis.
- Tour: k11 (reliquary or Lab); draw calls asleep = 1 per lamp.

### [MUST] C6 The Glimmerfall surge

- **what:** Standing at mid-bridge for 1 s triggers the surge: guaranteed the first time after the 'hollow' discovery, then on 1 in 3 expeditions (hash).
- For 10 s the Glimmerfall widens and brightens through a new uSurge uniform.
- The mist rises, spray motes blow across the deck, the chasm's violet halos pulse, and a roar swells.
Reward: 2 s at the west parapet during the surge drops +1 glimmer, once per surge.
- **where:** Bridge mid-span (122.5,42,128.5) or the world agent's eventSites.bridgeMid; reward zone x ≤ 121.6 within 4 m of mid-span.
- **numbers:** - Sheet ×1.6 width, ×1.8 brightness; mist ×1.5.
- 40 spray motes; halos ×1.4; trauma to 0.12; 10 s.
- Never during a discovery banner.
- **files:** ["src/game/content/surge.ts", "src/game/effects/Waterfall.ts (uSurge, setSurge)", "src/game/content/ContentDirector.ts", "src/i18n/en.ts"]
- **test:** - content-events: the trigger window, the expedition hash (first guaranteed, then 1 in 3), the reward once per surge, no banner overlap.
- Tour: k10.

### [MUST] C7 Content pass, layout data, metrics tool and tour

- **what:** placeContent is a fixed target table plus validation:
- the nearest valid spot within 3 m, else skip and log
- own Rng seed^0xc047e47, prop ids c_<kind>_<n>
- it records the edited voxel indices
It runs after the world agent's features and before the moment agent's pockets, and is switched by generateWorld(seed, {content}). layout.content holds caches, resonance sites, halos, wake entries, event sites and edits. tools/content-metrics.ts ports the prototype measure onto the real layout. A 15-step capture tour is already written.
- **where:** generateWorld: after the key lights and buildFeatures, before placePockets and the bedrock re-assert. Tour script: /tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fun-design/content/content-tour-after.json.
- **numbers:** - Generation +≤ 25 ms; painting +≤ 60 ms; ContentDirector ≤ 0.05 ms per frame, no allocation.
- New props ≤ 22k triangles; ≤ +10 draw calls per tour shot; 0 new generated cyan or violet emitters.
- **files:** ["src/world/gen/content.ts", "src/world/gen/generateWorld.ts (1 call)", "src/world/gen/types.ts", "src/config/content.ts", "src/gameplay/ContentState.ts", "src/debug/DebugApi.ts (__DD__.content)", "tools/content-metrics.ts", "tools/content-tour.json", "tests/unit/content-gen.test.ts", "tests/unit/content-metrics.test.ts"]
- **test:** - content-gen: deterministic; content off vs on differs only in the recorded cells; old props identical; cyan count unchanged; worldgen and routeWalk tests unchanged.
- content-metrics: new-kind gap ≤ 75 m, interactive gap ≤ 50 m, non-lamp gap ≤ 30 m, prop kinds outside camp ≥ 8.
- Regression: tsc, the full Vitest suite, the build, the 4 e2e specs.

### [SHOULD] S1 Lantern-bearer statues

- **what:** A bearerStatue prop, 2 variants:
- v0: standing 2.3 m, an octagonal-slice robe, a faceless cowl, both hands holding a caged stone lantern with a cyan crystal, and an eye rune on the plinth
- v1: weathered, with a broken forearm and the lantern hanging on a chain
Collision comes from 2 STATUE_SOLID cells (block 37, unbreakable). It wakes like the stone lamps but stronger.
- **where:** - landing (122.5,65,76.5), facing west
- stairs foot west (119.5,42,107.5) and east (128.5,42,107.5), facing north
- balcony only if the world agent gives a slot
- **numbers:** - ≤ 2500 triangles.
- Wake radius 7 m, 0.15 to 1.0 in 1.2 s, 4 s fall.
- Effect: new-kind gap 71 to 59 m; prop kinds outside camp to 11.
- **files:** ["src/render/props/bearers.ts", "src/config/blocks.ts (STATUE_SOLID)", "src/world/gen/content.ts", "src/game/content/wake.ts"]
- **test:** - content-props budgets.
- content-gen: stands on unbreakable support; reachability unchanged.
- Tour: k12.

### [SHOULD] S2 The vanished miner (haldenKit)

- **what:** Set dressing, matching GAME_DESIGN's bodies-less camps:
- v0: a long coat laid flat as if a body lay in it, boots standing upright at the foot, a helmet with a dead brass lamp, a canteen
- v1: a pack, a bedroll and a mug at a sitting spot
No interaction: the world agent owns the logs.
- **where:** Old camp (98.5,42,105.5); the world agent's rift-floor last camp near (126.5,6,128.5) if they give a slot.
- **numbers:** ≤ 700 triangles; no glow.
- **files:** ["src/render/props/halden.ts", "src/world/gen/content.ts"]
- **test:** - content-props.
- Tour: k13.

### [SHOULD] S3 Upright ore cart

- **what:** An oreCart prop: the brokenCart bucket upright on 4 flanged spoked wheels, with a coupling hook and the brand plate.
- v0: loaded with copper, tin and stone lumps
- v1: empty with a shovel
The world agent's yard track end uses it instead of their derailed brokenCart fallback.
- **where:** Yard track end (100.8,41,87.2), placed by the world agent; stairs foot (117.5,42,103.5), placed by me (first seen at 172 m).
- **numbers:** ≤ 1400 triangles; the wheels sit at y 0, set on the rail top.
- **files:** ["src/render/props/halden.ts", "src/render/props/models.ts"]
- **test:** - content-props.
- Tour: the world agent's f05 and f06, my k12 frame.

### [SHOULD] S4 Tremor: the wall breaks open

- **what:** A one-shot event after the Deep Gate discovery, when the explorer is on the hall floor 18–50 m from a generated, enclosed pocket. Sequence: a rumble with camera trauma, grit falling from the ceiling at 3 points, then the 4 skin voxels collapse to reveal a 4-voxel lanternstone back wall flooding warm light. A temporary 'Warm light N m' waypoint follows. No damage; saved as tremorDone.
- **where:** - skin (74,43–44,127–128) on the hall south-west wall
- cavity x 72–73
- lanternstone back wall at x 71
- stand cell (75,43,127), d215
All outside the feature boxes.
- **numbers:** - Trauma 0.25 to 0.45 over 1.6 s; 3 × 14 grit puffs; skin removed at t 1.6 s.
- Nothing within 6 m of the explorer changes; once per save.
- **files:** ["src/game/content/tremor.ts", "src/world/gen/content.ts", "src/game/content/ContentDirector.ts", "src/gameplay/ContentState.ts"]
- **test:** - content-events: trigger rules; once per save; no damage path; the 6 m clearance.
- LightField: the enclosed pocket leaks no light before the reveal.
- Tour: k14.

### [SHOULD] S5 Fossils and relics as key items

- **what:** A FOSSIL block (38, 'Fossil Shale', laminated shale with ammonite whorls, belemnites and shell hash, non-glowing). It goes in the world agent's sockets.fossil grotto cells and drops 3 fossil key items, which foreshadow the Buried Sea:
- fossilAmmonite: "A coiled shell in the stone. There was a sea here once."
- fossilSeaLily
- fossilTrilobite
It also defines the relic key items bearerLens and firstLamp for the world agent's reliquary and gallery, unless progression defines them first.
- **where:** The world agent's sockets.fossil: 6 cells around (55, 92–94, 63–65); 2 per fossil kind.
- **numbers:** Hardness 2.5; the first break per kind gives the key item, later breaks give stone; rarity relic for the relics.
- **files:** ["src/config/blocks.ts", "src/render/materials/ores.ts", "src/config/items.ts", "src/i18n/en.ts", "src/world/gen/content.ts"]
- **test:** - content-gen: socket cells converted.
- Key items show in the journal (existing UI); save round trip.

### [COULD] K1 Amber with inclusions

- **what:** Six unique amber nodules in the camp and tunnel umber band, each a key item with one lore line:
- a lumen moth
- a beetle
- a fern
- a bubble of ancient water
- a speck of still-lit glimmer
- a brass button stamped H, 'Amber takes an age to set.' (a mystery hook)
- **where:** Chosen from 482 umber/soil candidates in the roots band, e.g. (33,100,40), (43,100,42), (58,98,44), (75,95,55); outside the world agent's office and grotto boxes.
- **numbers:** 6 nodules, non-glowing honey ramp.
- **files:** ["src/config/blocks.ts", "src/render/materials/ores.ts", "src/config/items.ts", "src/world/gen/content.ts"]
- **test:** content-gen placement; key items in the journal.

### [COULD] K2 Smaller extras

- **what:** - Halden chalk 'H' marks above cache spots
- catchable glimmer motes over the Hollow floor (5 make a shard)
- desk for the world agent's office
- runeDial for the moment agent's C1
- adit creak at eventSites.adit
- headframe dust during the hoist ride
- the hand silhouette inside the hollowCrystals leader shard, visible only during resonance
- a curio shelf at camp
- **where:** Per item, see spec §5.
- **numbers:** —
- **files:** ["src/render/props/halden.ts", "src/render/props/bearers.ts", "src/game/content/ContentDirector.ts"]
- **test:** Lab and tour shots when built.

## Ownership (as designed)
- New files:
- src/config/content.ts: all tunables and target tables
- src/world/gen/content.ts: placeContent
- src/render/materials/ores.ts: tinVein, tinTop, lanternstone, fossilShale painters
- src/render/props/halden.ts: haldenCrate, oreCart, haldenKit
- src/render/props/bearers.ts: stoneLamp, bearerStatue
- src/game/content/ContentDirector.ts plus the pure modules resonance.ts, caches.ts, wake.ts, surge.ts, tremor.ts
- src/gameplay/ContentState.ts: the SaveData.content shape and sanitizer
- Tests: tests/unit/content-gen, content-materials, content-props, content-resonance, content-caches, content-ember, content-events, content-metrics (.test.ts). Tools: tools/content-metrics.ts, tools/content-tour.json.
- Small hook edits in shared files:
- config/blocks.ts: ids 34–38, the TRANSIENT table
- config/tiles.ts and render/textures.ts: tiles appended
- render/materials/index.ts, painters.ts, palette.ts: layers, surfaces, ramps; export 4 helpers from minerals.ts
- config/items.ts: tinOre, lanternEmber, the 'instant' field, the 'ember' icon, S5 key items; ui/icons.ts, game/Drops.ts
- gameplay/Lantern.ts: add()
- world/gen/types.ts and generateWorld.ts: 1 call and the content switch
- More hook edits:
- render/props/models.ts: kinds appended at the end, after the world agent's
- render/props/PropRenderer.ts: variant override, setGlowBoost, the 'wake' anim
- game/MiningController.ts, 3 lines: null-drop guard, kind on prop:hit/prop:broken
- save/worldDelta.ts: skip transient ids
- game/effects/Waterfall.ts: uSurge
- game/Game.ts, about 25 lines: director, instant pickup, ember accept/reject, waypoints, halo refresh, content save
- ui/types.ts and ui/hud/Hud.ts: shared waypoints field and a fallback chip
- core/events.ts, audio/eventMap.ts, i18n/en.ts, debug/DebugApi.ts: appended
- lab/VisualLab.ts: props row 3 and the new blocks in the materials sheet
- my rows in the world agent's config/livingRock.ts
- Not touched:
- the world agent's features, moths, Halden logs and rune doors
- the moment agent's strikes, pockets, director, contracts and report
- recipes, the lighting rig, the camera, the e2e specs
- Block ids 34–38 are claimed by content: TIN_ORE 34, LANTERNSTONE 35, LIGHT_RESONANCE 36, STATUE_SOLID 37, FOSSIL 38. Prop id namespace c_<kind>_<n>; RNG seed^0xc047e47.

## Needs from others
- Progression/economy:
- A tin sink of ≥ 12 tin across ≥ 2 recipes, or tin is cut. Proposed: Bronze Lantern t3 (copper 6, tin 6, glimmer 2; radius 17, 780 s) and Bronze-ribbed Pack t3 (stone 10, tin 8, copper 4; 14 slots), or tin as an input to the iron tier.
- Approve the ember value (+30 s) and the loot. A first clear adds about 20 embers (600 s), about 35 tin from veins plus 9 from crates, about 7 glimmer, about 2.5 iron and about 9 copper; vein growth adds +57 copper and +34 iron voxels.
- Optionally consume bearerLens and firstLamp.
- World agent:
- Block ids 34–38 are content's.
- Pass order: features, then content, then pockets. Each containment test holds the other pass fixed: generateWorld(seed, {features, content}).
- Place kind stoneLamp in the reliquary, gallery and gate niches; oreCart at the yard track end (100.8,41,87.2); haldenCrate for the office's second crate, one yard crate and the last-camp crate.
- More from the world agent:
- Keep the log ids office, landing, yard, rift stable; they reveal caches 1–4.
- Optionally add one cache line to each log body (I supply the 4 lines).
- Accept the living-rock rows: tin 4 per epoch on haldenFace; lanternstone 1 per epoch on haldenFace and 2 on riftWalls.
- Expose eventSites.bridgeMid and sockets.fossil.
- Optional slots for a balcony statue and a rift-floor vanished-miner kit.
- Moment-to-moment agent:
- Content takes over C2 crates: model, placement and loot.
- Register my director nudges: crystalHum (weight 3, cooldown 45 s) and emberGlint (weight 4, cooldown 60 s, when oil is below 35 % and a seam is within 20 m in view).
- Treat content:* events as notable.
- Exclude 'instant' items (lanternEmber) from lucky ×3; tin and lanternstone are otherwise eligible for clean, lucky and rush.
- Run pockets after content and keep cache and crate spots out of the 4 m rule.
- Share the HudState.waypoints field with the black-out pack pip.
- Optional firsts (ember, tin, resonance, cache) and contracts ('Bring back {n} tin', 'Recover {n} Halden caches').
- UI:
- Style the shared waypoint chip ('Cache 34 m', with a bearing arrow; I ship a fallback clone of the camp chip).
- A good-tone toast for '+30 s lantern oil'.
Nothing else: key items and discoveries use the existing journal screens.
- Juice/audio:
- Dedicated sounds (fallbacks are mapped):
  - ember pickup whoosh and crackle
  - resonance drone, swell and shimmer bed
  - stone-lamp tick; statue wake hum and chime
  - crate splinter and rattle
  - surge roar; tremor sub-rumble with grit
- Haptics: resonance [20,40,20], tremor [40,30,60,30,80], ember 12.
- The shared hit-stop API, if any.
- Lighting: approve the LANTERNSTONE emission [0.55,0.36,0.14] with its halo and LIGHT_RESONANCE [0.22,0.75,0.92]; check that a lanternstone pool on the dark gate stair does not read as a route lamp. Lens: the Visual Lab props camera must frame a third row of new kinds.

## Acceptance
- tsc --noEmit, the full Vitest suite (old and new), npm run build and the 4 e2e specs pass. generateWorld with content off vs on differs only in the cells content records; every pre-existing prop id and position is unchanged; worldgen.test.ts and routeWalk.test.ts are unchanged.
- Lanternstone: 7 seams (9 voxels), none within 150 BFS cells of camp, each exposed and within reach, with warm halos. Mining one adds +30 s at once and never enters the pack. A full lantern leaves the ember on the ground with 'Your lantern is full. The ember will wait here.' Lucky never multiplies embers.
- Tin: ≥ 9 reachable clusters of 3–4 voxels; the painter tests pass (grain coverage, quartz ≤ 6 %, dark-floor rule). Hollow veins grew (copper +57, iron +34 voxels; tunnel untouched). Tin ships only with a progression sink.
- Caches: reading each of the world agent's 4 logs spawns its strongbox and shows 'Cache N m' on the waypoint chip. Looting gives the table loot. Reveal and loot survive save and load with no new save field. Loose crates are deterministic and never empty.
- Resonance: it starts after 2.0 s of lingering with a lit lantern at every site (firstPocket, hollowCrystals, shrine, plus grotto, rift and epoch bloom when present). The light at the centre rises by ≥ 0.2 in G/B. +1 glimmer per cluster during the hold. Once per site per expedition. The transient light cell is never saved; encodeWorldEdits returns [] for it.
- Glimmerfall surge: guaranteed the first time at mid-bridge after the 'hollow' discovery, then on 1 in 3 expeditions; it never overlaps a discovery banner; the spray reward is given once per surge.
- Stone lamps in the world agent's rooms stir within 2.5 m and cost 1 draw call while asleep.
- Metrics on the real layout (tools/content-metrics.ts): new-kind gap ≤ 75 m (today 139), interactive gap ≤ 50 m (today 112), non-lamp gap ≤ 30 m (today 45), prop kinds outside camp ≥ 8 (today 7). 0 new generated cyan or violet emitters.
- Performance: generation +≤ 25 ms; painting +≤ 60 ms; ContentDirector ≤ 0.05 ms per frame with no per-frame allocation; new props ≤ 22k triangles; any tour shot ≤ +10 draw calls over its before-shot.
- Capture tour (content-tour.json → artifacts/fun-content-after, 915×412): k01–k10 for MUST, k11–k14 for SHOULD. Every image is read and described against the before-shots c01–c08. Per shot: luma below 12 ≤ 18 %, clipped 0 %, saturated cyan ≤ 3 % (≤ 10 % in the resonance and surge shots), saturated warm ≤ 2 %.