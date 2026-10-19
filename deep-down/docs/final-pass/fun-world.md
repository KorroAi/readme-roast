# Fun spec — world-variety

## Pitch
Today the Lantern Hollow is a beautiful corridor that ends at a picture. You can walk from camp to the balcony in 255 m (about 55 s), 30% of the floor you can stand on is more than 10 m from anything, the bridge runs into a blank wall, you can see the monolith but never reach it, and after one clear the zone never changes. This pass turns the place into a route with something new at least every 22 m, and four moments a player will tell a friend about: squeezing through a cracked wall into a grotto full of moths; riding the Halden hoist 47 m up out of the dark; standing at the end of the bridge while the door reads your lantern and sinks into the floor; and climbing down a lost crew's rope to put your hand on the black stone. Lumen moths make the dark feel alive and quietly point at secrets. Four Halden logs tell the crew's story, from tonnage to 'the singing'. And every expedition the deep 'breathes': the Halden face and the rift walls grow new, re-rolled veins, and a fresh glimmer bloom appears at a new site with the moths gathering over it. So each trip has a reason and a small hunt, and the hoist and the rope keep the trip short.

## Measured today
Measured with read-only scripts in /tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fun-design/: route.ts, map.ts, sites.ts, probe2.ts, probe3.ts, proto.ts (before/after), shortcut.ts. Method: BFS walking paths between landmarks, then the first sight of each point of interest with line of sight from eye height.

Today:
- Critical path camp → ledge → stairs → seal → balcony: 255 m, about 55 s walking (legs 99 / 81 / 16 / 59 m). Side legs from the stairs foot: shrine 67 m, bridge end 34 m (a dead end into rock at z 137; capture w03), Spindle 33 m.
- Largest gap with no new sight: tunnel 51 m (1–52 m), stairs 36 m, seal→balcony 40 m, bridge 34 m (nothing new: all of it was seen from the stairs). With ore within 6 m counted: tunnel 25.7 m.
- Minable ore within reach: tunnel 33 voxels; stairs, stairs-foot→seal and bridge 0; gate stair 11 (iron).
- Reachable floor: 5656 columns. 30% (1719) are more than 10 m from any prop, structure or landmark; 650 are more than 15 m.
- Largest empty patch: the north hall under the ledge and stairs, x 69–145, z 59–96, 1112 m² (capture w02: dark and blank). Others: east and south of the chasm (152 and 127 m²), the gate stair (168), the first tunnel segment (74; capture w01).
- Visible but unreachable: the rift floor, a flat bowl at y 6 (x 116–130, z 124–140), and the monolith.
- Repetition: 22 identical lamp posts, 6 columns in 2 sizes, 12 crystal clusters of one kind.
- Content: 6 discoveries, 0 found texts, 1 secret, 0 shortcuts, 0 creatures, 0 replay.
- Cyan/violet emitter voxels: 103 (cap 120).

Prototype of this design as a voxel pass (everything reachable; ride paths swept with 0 hits after one fix):
- Sight gaps: tunnel 51→21 m, stairs 36→20, seal→balcony 40→19, bridge 34→19; new rift leg 11 m.
- Floor more than 10 m from anything: 30%→18% (over 15 m: 650→134). Reachable floor +680 columns.
- Hoist: yard→camp −27% (220→161 m-equivalent), shrine door→camp −16%.

Captures read: artifacts/fun-design-world/w01–w05, artifacts/arch4-4/a01–a17 (most of them), artifacts/round3/a02.

## Spec
# DEEP DOWN — World fun & variety (the place itself)

A spec for one specialist agent (the author, next step). It is about 3 h 15 of MUST work plus
about 45 min of SHOULD work. All art and audio stay procedural, all player-facing text goes in
`src/i18n/en.ts`, and the existing game and tests keep working.

The same text is in the scratch file
`/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fun-design/spec-world.md`.

## 0. Pitch

Today the Lantern Hollow is a beautiful corridor that ends at a picture:
- You can walk from camp to the balcony in 255 m, about 55 s.
- 30 % of the floor you can stand on is more than 10 m from anything.
- The bridge runs into a blank wall.
- The monolith is something you look at but can never reach.
- After one clear, the zone has nothing new to offer.

This pass turns the place into a route with something new every 20 m, and four moments a player
will tell a friend about:
1. Squeezing through a cracked wall into a grotto full of moths.
2. Riding the Halden hoist 47 m up out of the dark.
3. Standing at the end of the bridge while the door reads your lantern and sinks into the floor.
4. Climbing down a lost crew's rope to put your hand on the black stone.

Lumen moths make the dark feel alive and quietly point at secrets. Four Halden logs tell the
crew's story, from tonnage to "the singing". Every expedition, the deep "breathes":
- The Halden face and the rift walls grow new veins.
- A fresh glimmer bloom appears somewhere new, with the moths gathering over it.

So the zone is worth another trip.

## 1. Measured today

Sources: read-only scripts in
`/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fun-design/`.
Run each with `node tools/run-ts.mjs /@fs/<that dir>/<script>.ts [args]`.

| Script | What it measures |
|---|---|
| `route.ts` | BFS walking paths between landmarks, the first sight of every point of interest (POI) with line of sight, minable voxels within reach |
| `map.ts`, `map-after.ts` | Top-down maps (`map.png`, `map-after.png`) and the empty-floor analysis |
| `sites.ts`, `probe2.ts`, `probe3.ts` | Voxel slices, floor heights, rock solidity at candidate sites, ride sweeps |
| `proto.ts` | The proposed voxel pass prototyped as a post-process, with rope links in the BFS and before/after metrics (`before` / `after` argument) |
| `shortcut.ts` | The hoist shortcut |

Current-state captures, all read: `artifacts/fun-design-world/w01…w05`, `artifacts/arch4-4/a01…a17`,
`artifacts/round3/a02`.

| Measure (today) | Value |
|---|---|
| Critical path camp → ledge → stairs → seal → balcony | **255 m ≈ 55 s** walking. Legs: 99 / 81 / 16 / 59 m |
| Side legs from the stairs foot | shrine 67 m · bridge end 34 m (a dead end: w03) · Spindle 33 m · tunnel crystal pocket 8 m |
| Largest gap with no new sight (props, landmarks, columns) | camp→ledge **51 m** (tunnel 1–52 m) · stairs **36 m** · seal→balcony **40 m** · bridge **34 m** (nothing new: it was all seen from the stairs) |
| Largest gap with no new sight *or* ore within 6 m | camp→ledge 25.7 m (24–50 m) · seal→balcony 18.8 m · stairs 36 m · bridge 34 m |
| Minable ore voxels within reach of the path | tunnel 33 · stairs 0 · stairs foot→seal 0 · gate stair 11 (iron) · bridge 0 |
| Reachable floor columns | 5656 (camp/tunnel 990, hall floor 3982, terraces 422, below y 38 262: gate stair + balcony only) |
| Floor > 10 m from any prop, structure or landmark | **30 %** (1719 columns). Over 15 m: 650 |
| Largest empty patches | north hall under the ledge and stairs (x 69–145, z 59–96, **1112 m²**, w02: dark, blank) · east of the chasm (116–139, 110–123) 152 · south of the chasm (96–117, 132–141) 127 · gate corridor/stair 168 · first tunnel segment (55–67, 40–51) 74 (w01: bare walls) |
| Unreachable but shown off | the rift floor (y 6, a 15×17 m flat bowl at x 116–130, z 124–140) with the monolith; the deep crystal formations (110,12,128), (137,16,140) |
| Repeats | 22 identical lantern posts · 6 columns in 2 sizes · 12 crystal clusters of one kind · 2 crate/barrel sets |
| Content inventory | 17 props · 24 lamps · 12 clusters · 6 columns, 4 drums · 6 discoveries · 0 found texts · 1 secret (shrine) · 0 shortcuts · 0 creatures |
| Cyan/violet emitter voxels | **103** (cap 120, `worldgen.test.ts`) |
| Replay | none: after one clear, the HUD says "All objectives complete" and the zone never changes |

Prototype result (`proto.ts after`; every new place reachable, ride paths swept):
- **Sight gaps**: camp→ledge 51 → **21 m** · stairs 36 → **20 m** · seal→balcony 40 → **19 m** ·
  bridge 34 → **19 m** · new balcony→monolith leg **11 m**.
- **Empty floor** (> 10 m from anything) 30 % → **18 %** (over 15 m: 650 → 134).
- **Reachable floor** +680 columns.
- **Hoist savings** (`shortcut.ts`): yard→camp 220 → 161 m-equivalent (−27 %),
  shrine door→camp −16 %.

## 2. Rules for this pass

- **Generation order.** A new pass, `buildFeatures(ctx)`, runs in `generateWorld` *after* the
  key-light pass (section 13) and *before* the moment-to-moment agent's pocket pass and the bedrock
  re-assert. Their pockets must adapt to what is built here. Order: key lights → features →
  pockets → bedrock.
- **RNG.** Use its own stream, `new Rng(seed ^ 0xfea70001)`, never a fork of the layout `rng`:
  a concurrent edit above must not move these features. It never calls the shared `addProp`,
  which draws `rng.int`. It builds `PropSpec`s directly.
- **Prop ids.** Use the namespace `f_<place>_<n>`. No existing prop id, position, RNG draw or
  voxel outside the declared feature boxes changes. A unit test proves this with
  `generateWorld(seed, { features: false })`.
- **New prop kinds** are appended at the *end* of `PROP_VARIANTS`.
  `buildPropModel` hashes `PROP_KINDS.indexOf(kind)`, so inserting a kind would re-roll every
  later model.
- **Light budget.** This workstream adds at most **+14** cyan/violet emitter voxels. The target is
  ≤ 117 at epoch 0 and at every epoch 0–20. If concurrent lighting work pushes the total over 120,
  raise the cap to 130 in `worldgen.test.ts`, with one line in ART_DIRECTION.md: "new spaces
  each get one cold key light". Warm practicals have no cap. Every new navigation point gets a
  warm lamp within 7 m, except the two Lantern-bearer rooms and the grotto, which are cold on
  purpose.
- **Saves.**
  - Opened doors and mined or regrown cells are world edits, already saved as a delta.
  - Unlocks are journal discoveries.
  - The only new field is the optional `SaveData.world?: { epoch: number }`, sanitized as an
    integer 0…1e6, default 0. No version bump: old deltas only touch other cells, and new solid
    cells only appear inside former rock.
- **No placeholders.**
  - If an asset from the content agent is missing at integration time, use the listed fallback
    built from existing kinds.
  - An empty niche stays empty: no box stands in for a missing lamp.
- **Performance.**
  - Generation: +≤ 40 ms.
  - Moths: ≤ 0.15 ms CPU and 1 draw call.
  - Regrowth: ≤ 25 ms of main-thread time once per camp entry.
  - Any tour shot: +≤ 12 draw calls and +≤ 15k triangles over the nearest existing shot.

## 3. The places

Every coordinate is a world voxel coordinate. "walk y" means the explorer's feet: the floor
voxel is at walk y − 1. All of these were validated in `proto.ts`: rock solidity 1.00 in every
box, reachability with barriers open, and ride sweeps.

Each place declares a `box` (used by the containment test). It lists its `pois` (name,
position, `sight` | `pickup` | `landmark`, `mustReach`), its `guide` spur, and its `mothAnchors`.

### P1. The Halden Survey Office — MUST (beat: the first found text, 22 m from camp)

- **Box** x 52–63, y 99–105, z 30–40. It fills the bare first tunnel segment (w01).
- **Room**: x 53–62, z 31–37, walk y 100.
  - Height 3, rising to 4 where `x∈(55,61), z∈(32,36)` or noise > 0.3.
  - Floor: `PLANK` at y 99 (protected).
- **Door**: x 55–56, z 38–39, y 100–101, opening off the tunnel's north wall at z 40.
  - Timber frame (structure `beam`s): posts at (55.0, 100→102.1, 39.9) and (57.0, …), section
    0.24 × 0.28; lintel from (54.8, 102.2, 39.9) to (57.2, 102.2, 39.9).
- **Ceiling**: two `STRUCTURE_TIMBER` runs at y 103 (x 54–61 at z 33 and z 36) with matching
  `beam` specs (0.28 × 0.34).
  - `hangingLantern` at (58.5, 101.2, 34.5), anchor (58, 103, 34), emitter `LIGHT_AMBER` at
    (58, 101, 34). This is the warm practical.
- **Props**:

  | Kind | Position | Rotation / scale | Notes |
  |---|---|---|---|
  | `crate` | (60.5, 100, 33.0) | rotY 0.1, scale 1.0 | the "desk" |
  | `haldenNote` | on the desk top, y 100.82 | — | id `office`; interact `feature` (§4) |
  | `crate` | (61.6, 100, 36.2) | scale 0.8 | |
  | `barrel` | (53.8, 100, 32.0) | — | |
  | `pickaxeRack` | (53.6, 100, 35.5) | rotY π/2 | |
  | `ropeCoil` | (57.5, 100, 36.6) | — | |

- **Collapse**: rubble blob r 1.6 at (62, 100, 31) (`GRAVEL`/`SLATE`, open cells only).
  Fallen beam from (59.0, 100.3, 31.4) to (62.5, 101.8, 32.8), section 0.3 × 0.36, splinter 2,
  roll 0.2.
- **Pickups**: 2 small copper veins of 2–3 voxels grown from exposed wall cells near
  (53, 101, 34) and (62, 101, 35).
- **Guide spur**: [office (58, 100, 35), door (55.5, 100, 40.5)] → joins the trunk at route[1].
- **Moths**: none (warm Halden place).

### P2. The Moth Grotto — MUST (secret #1, at 43–55 m on the tunnel)

- **Box** x 53–71, y 90–100, z 57–71. It sits beside the tunnel, fills its 24–43 m gap and
  rewards a careful look at w05's left wall.
- **The crack (hint)**:
  - Plug: `GRAVEL` at (70, 94, 61) and (70, 95, 61), hardness 1.6, so the rusty pickaxe opens it.
  - Above the plug, `AIR` at (70, 96, 61) and (69, 96, 61): a 1-voxel slit too low for the
    explorer. The grotto's cold light leaks through it into the tunnel. A test asserts the
    light at (71, 96, 61) has blue > red.
  - 3 moths tap at the slit.
- **The squeeze** (traversal variety): carve these cells, each 3 tall (y, y+1, y+2):
  (69,94,61) (68,94,61) (67,94,61) (67,94,62) (66,94,62) (65,93,62) (65,93,63) (64,93,63).
  - It is 4-connected; the first attempt was diagonal and the walk graph could not pass.
  - It is 1 m wide and 3 m tall, so the camera can rise over the explorer.
  - The lens workstream verifies the boom collapse here (§13).
- **The geode**: carve where
  `hypot((x+.5−60.5)/5.2, (y−92)/4.2, (z+.5−64.5)/4.6) + noise3(x·.3, y·.3, z·.3)·0.18 < 1`, for
  y ≥ 92 (walk y 92).
  - Crystal seam: `crystalSeam([58,93,69],[62,94,69], 0.9, 3)` (3 crystal voxels).
  - One `LIGHT_CYAN` key light at the open cell nearest (60, 95, 65).
  - Cyan +4.
- **Props**: 3 `crystalCluster`, minable glimmer 1–2, `emitters: []`:
  - (58, 92, 66.5), scale 1.1
  - (62.5, 92, 61.8), scale 0.8
  - (56.8, 92, 63.2), scale 0.9
- **Sockets for the content agent**: `sockets.fossil` = 6 exposed west-wall cells around
  (55, 92…94, 63…65), which can be turned into a fossil rock.
- **Discovery** `mothGrotto`: region x 55–66, y 91–98, z 59–70.
- **Moth anchors**: `grottoCrack` (70.5, 96.4, 61.5) ×3 (secret); `grotto` (60.5, 94.5, 64.5) ×10.

### P3. The Halden Yard and the Hoist — MUST (the shortcut, Halden industry, fills the 1112 m² dark)

- **Box** x 76–110, y 40–94, z 50–95.
- **Hoist head**, on the ledge's south-west brink:
  - Carve the solid crag cells in x 85–88, z 81–84, y 88–91. The ledge floor at y 87 stays.
  - Headframe (structure `beam`s, 0.26 × 0.26):
    - two legs from (84.9, 87.9, 81.3) and (84.9, 87.9, 83.7) to the apex (85.6, 92.4, 82.5)
    - a back-stay from (87.6, 87.9, 82.5) to the apex
    - a jib from the apex to (85.0, 92.4, 82.5)
  - `hoistWinch` variant 0 (a sheave block) at (85.6, 91.6, 82.5), anchor null.
  - Warm `lanternPost` at (88.5, 88, 80.5).
  - Rope: `beam` 0.07 × 0.07 from (85.6, 91.5, 82.5) to (85.6, 41.3, 82.5).
  - From the ledge reveal (a04/a17), the headframe frames the right edge: a foreground
    silhouette.
- **Hoist foot**, on the hall floor (walk y 41):
  - `deck` x 83–88, z 83–87, y 41.1, along x.
  - `hoistWinch` variant 1 (ratchet drum with chain) at (86.8, 41.1, 85.6): the release and
    ride interact.
  - 2 `crate`s (the counterweights) at (84.0, 41.1, 86.4), a `barrel` at (87.8, 41.1, 83.4).
  - Bright `lanternPost` at (88.6, 41, 87.4).
  - `haldenNote` id `yard`, on a post (`beam` 0.2 × 0.2 from (83.6, 41.1, 85.0) to
    (83.6, 42.6, 85.0)).
- **Link `hoist`**: top stand (87, 88, 82.5) ↔ bottom stand (85.5, 41, 84.5).
  - Ride polyline: (87.0, 88, 82.5) → (85.6, 88.4, 82.5) → (85.6, 41.2, 82.5) → (85.5, 41, 84.5).
  - Sweep: 207 samples, 0 blocked.
  - 9 m/s with 0.6 s easing: about 5.8 s.
- **Track**, 12 m from (88.5, 41, 85.5) east to (99.5, 41, 85.5), following `groundAt` every
  3 m (slopes ≤ 1:2):
  - sleepers every 0.8 m (`beam` 0.22 × 0.12 across z 84.9–86.1)
  - two rails (`beam` 0.07 × 0.09) at z 85.1 and z 85.9, in 3 m segments
  - a buffer stop: 2 posts and a crossbeam at x 99.8
  - the floor under the track becomes `GRAVEL` (ballast)
  - cart at the end: `oreCart` if the content agent ships it, otherwise `brokenCart` derailed
    at (100.8, 41, 87.2), rotY 2.6
- **Spoil heap**: `GRAVEL` blob r 2.4 at (95, 41, 79.5) with 4 copper voxels on its surface
  (pickups).
- **The Halden Face (adit)**:
  - Carve x 102–104, y 43–45, z 53–62 (walk y 43, floor `GRAVEL` where open).
  - It is reached from the yard under flight 1 through bay [2,6] (x 98–101). This is a framed
    passage under the stairs, validated.
  - Timber sets at z 61.6 and z 59.2: posts at x 102.1 and x 104.9 from y 43 to y 45.8; cap from
    (101.9, 45.9) to (105.1, 45.9).
  - A track stub of 3 sleepers and rails over z 56–62.
  - **Living rock** site `haldenFace` (§6): the walls x 101 and x 105 (y 43–45, z 53–61) plus the
    end face z 52 (x 102–104). About 57 cells.
- **Lock**: the hoist is chained from below.
  - Use at the top before release: hint `hint.hoistChained`, no ride.
  - Use at the bottom: label "Release the hoist". This gives discovery `hoist`, autosaves with
    reason `discovery`, then rides up.
  - After that it works both ways. The first descent therefore always takes the grand stairs.
- **Guide**: node `hoistFoot` with parent `stairsBottom` until released, then `hoistTop` → `ledge`.
- **Moths**: `hoistLamp` (88.6, 43.6, 87.4) ×3.
- **Landmarks**: `hoistTop` (87, 88, 82.5), `hoistFoot` (85.5, 41, 84.5), `haldenFace`
  (103.5, 43, 56).

### P4. The Reliquary behind Rune Door 1 — MUST (secret #2: the bridge finally goes somewhere)

- **Box** x 116–128, y 40–50, z 137–151. Today the walk ends at z 137 against rock (w03).
- **Rune door `reliquary`**:
  - door cells (121…123, 42…44, 138) `ANCIENT_BRICK` (unbreakable)
  - frame (120 and 124, 42…45, 138) `ANCIENT_BRICK`
  - lintel (121…123, 45, 138) `GLYPH_STONE` (cyan +3; the shader already wakes it near the
    lantern)
  - threshold `ANCIENT_TILE` at y 41, z 138–141
  - wake point (122.5, 42, 136.6), radius 2.8, hold 1.2 s, any lit lantern
  - the existing deck lamp at (123.4, 42, 137.4) lights it
- **Passage**: z 139–141, x 121–123, y 42–45. Masonry shell x 120/124, y 46.
- **Room**: x 118–126, z 142–149, y 42–48. Corbel vault as in the shrine: spring y 46, a cell is
  masonry when `min(x−118, 126−x) ≤ y − 46`. Shell `ANCIENT_BRICK`, floor `ANCIENT_TILE`.
- **Contents**:
  - 6 niches (1×1×1, open) at x 117 and x 127, y 43, z 143/145/147. Each holds a `stoneLamp`
    (content asset, cold and unlit); with no asset the niches stay empty.
  - Relic plinth: one `ANCIENT_BRICK` cell at (122, 42, 148).
  - Relic prop: kind `tablet` at (122.5, 43, 148.5), interact `feature` relic `reliquary`.
    It gives discovery `reliquary` and key item `bearerLens` if progression defines it.
  - 2 `crystalCluster`s (glimmer 2–3, no emitter) at (118.8, 42, 148.7), scale 1.2, and
    (126.2, 42, 143.3), scale 1.0.
- **Guide spur**: [relic, (122.5, 42, 140), bridge end (122.5, 42, 136), bridge start
  (122.5, 42, 116)] → `stairsBottom`.
- **Moths**: `runeDoor1` (122.5, 44.6, 137.3) ×4 (secret); `reliquary` (122.5, 44.5, 146) ×5.

### P5. The Rift Floor and the Black Stone — MUST (the climax: the end of the slice becomes a place)

- **Box** x 104–144, y 4–30, z 112–152, plus the rope head x 130–136, y 24–30, z 122–127.
- **Link `riftRope`**:
  - Top stand (133.5, 25, 124.5) on the balcony, inside the parapet.
  - Bottom stand: the nearest standable cell to (128.5, 6, 124.5). The rift floor slopes to y 7
    at x 130.
  - Ride polyline: top → (133.5, 26.5, 124.5) → over the coping (131.3, 26.5, 124.5) →
    (131.3, floor(131,124) + 0.6, 124.5) → bottom.
  - Sweep with 0 blocked samples. The prototype's first bottom point clipped the slope;
    `probe3.ts` shows the fix.
  - Speed 4.5 m/s down and 3.5 m/s up, so each ride is ≤ 7 s.
- **Rope head**:
  - `hoistWinch` variant 1 (capstan) at (134.4, 25, 125.8).
  - Warm `lanternPost` (`LIGHT_LAMP`) at (134.5, 25, 123.0).
  - Rope `beam` 0.06 from (131.4, 26.9, 124.5) down to (131.4, 7.2, 124.5), with a tie-back
    `beam` to the capstan.
  - `ropeCoil` at the foot, (130.4, floor, 124.0).
- **The Halden's last camp** (around (126.5, 6, 128.5)):

  | Kind | Position | Rotation / scale | Notes |
  |---|---|---|---|
  | `bedroll` | (126.0, 6, 129.5) | rotY 0.4 | |
  | `crate` | (127.8, 6, 127.4) | scale 0.9 | |
  | `ropeCoil` variant 1 | (125.4, 6, 127.6) | — | grapnel |
  | `lanternPost` | (128.2, 6, 129.8) | — | **`LIGHT_EMBER`** emitter: still smouldering after a generation, a mystery hook, and the warm marker of the way back |
  | `haldenNote` | on the crate | — | id `rift` |

- **The Black Stone**: the existing `abyssMonolith` prop at (123.5, 6, 135.5) gains
  `interact: 'feature'` with `feature: { kind: 'monolith' }`. The spec object is mutated in the
  pass; no id changes. See §4.
- **Already there and now reachable**: the deep formations (110, 12, 128) and (137, 16, 140),
  4 minable clusters plus seams. This is the glimmer-rich deep pocket.
- **Living rock** site `riftWalls` (§6): exposed geology cells at y 6–11 in the bowl. Exclude
  cells within 4 m of the rope bottom, 5 m of the monolith or 3 m of the last camp. Keep one
  third by `hash32(x, y, z) % 3 == 0`, about 126 cells.
- **Discovery** `undercroft`: region x 112–137, y 5–14, z 116–147.
- **Landmarks**: `ropeTop`, `ropeBottom`, `lastCamp` (126.5, 6, 128.5), and `descentHook`
  (117, 6, 141), reserved for the E5 descent point.
- **Guide spur**: [lastCamp, ropeBottom, ropeTop, balcony (136, 25, 127), gate stair foot
  (149.5, 25, 121), gate stair head (149.5, 42, 102), corridor (141, 42, 100.5), seal approach
  (133.5, 42, 100.5)] → `stairsBottom`.
- **Moths**: `monolith` (123.5, 10, 134.5) ×10.
- A fall from the bridge now lands on the rift floor. It is still lethal (34 m), but the
  black-out cache (moment-to-moment S2) can be recovered by the rope.

### P6. The landing survey post — MUST (cheap; closes the stairs' 36 m gap)

- `haldenNote` id `landing` on a short survey post (`beam` 0.18 × 0.18 from (125.6, 65, 77.6) to
  (125.6, 66.3, 77.6), plus a cross-board `block`) on the landing.
- Its log points at the far balcony's rope, which creates intent.
- Prototype: stairs sight gap 36 → 20 m.

### P7. The Lamp Gallery behind Rune Door 2 — SHOULD (secret #3: gated by the copper lantern)

- **Box** x 141–151, y 23–32, z 129–142, at the foot of the gate stair, in the south wall of
  the stair-foot hall. Rock 1.00, validated. It is on the critical path, so it is seen early and
  opened later.
- **Rune door `gallery`**:
  - cells (145…147, 25…27, 130), lintel `GLYPH_STONE` (145…147, 28, 130) (cyan +3), frame
    (144 and 148, 25…28, 130)
  - wake point (146.5, 25, 128.4), radius 2.8, hold 1.2 s, **`minLanternTier: 2`**
  - with the oil lantern: hint `hint.runesWeak`, and the lintel flickers
  - this gives the copper lantern a world purpose (GAME_DESIGN: "upgrades change how the player
    explores")
- **Gallery**: x 143–149, z 131–140, floor `ANCIENT_TILE` y 24 (walk 25), vault spring y 28 to
  top y 31.
  - Niches at x 142 and x 150, y 26, z 132/134/136/138, holding `stoneLamp`s.
  - Relic plinth (146, 25, 139); relic `firstLamp` (discovery `lampGallery`, plus a key item if
    progression defines it).
  - 2 `crystalCluster`s (no emitter).
- **Moths**: `runeDoor2` (146.5, 27.6, 129.3) ×3 (secret).

### COULD (only if time remains)

- **C-a, gate-stair lamp niches.** Carve 5 cells into the west wall x 146 at y = 42 − (z − 103),
  z 106/109/112/115/118, each with a `stoneLamp`. This is a procession leading down to door 2.
  Prototype: seal→balcony gap 40 → 19 m. It is only needed if P7 is cut.
- **C-b, frayed rope at mid-bridge.** A short `beam` rope hanging 8 m from the east parapet at
  (124.6, 43.2, 128.5) and ending frayed (splinter). The tell is "someone tried to climb down
  here", and it is the first hint of P5.
- **C-c, spyglass at the survey post.** Needs a camera API `focusOn(point, hfov, s)` from the
  lens workstream: it frames the rope on the balcony for 2.5 s.
- **C-d, e2e case** in `world.spec.ts`:
  1. Wake door 1.
  2. Ride the rope.
  3. Touch the stone.

## 4. Mechanics (runtime)

All of these live in `src/game/WorldFeatures.ts`, built from `layout.features`. Pure rules sit in
separate files so they can be tested in Node.

- **Rides** (`src/game/ropeRide.ts`, pure):
  - `createRide(link, dir)` gives `{ pts, cum, length, speed, t }`.
  - `stepRide(r, dt)` gives `{ x, y, z, done }`, moving at arc-length speed with smoothstep easing
    over the first and last 0.6 m.
  - In `Game.updatePlaying`, while a ride is active:
    - skip `player.update` and mining
    - set `player.frozen = true`, the position from the ride, and the velocity to 0
    - keep camera look
    - at the end, `teleport` to the end stand cell (so there is no landing, `landedSpeed` stays
      0, and no fall damage)
    - emit `world:ride {id, phase:'start'|'end', kind}`
  - The explorer pose is `idle` facing the rope (or a `climb` pose if the character owner adds
    one).
  - Interact range: within 1.8 m of either stand.
- **Rune doors** (`src/game/runeDoor.ts`, pure):
  - `wakeStep(door, dt, { px, py, pz, lanternLit, lanternTier })` gives
    `{ progress 0..1, state: 'idle'|'waking'|'weak'|'dark'|'open' }`.
  - Progress builds while the explorer is within the radius with a lit lantern of a high enough
    tier. It decays at 2× when they step out.
  - At 1: the door opens. For each row, top to bottom, every 0.3 s, `session.setBlock(...AIR)`
    (incremental light fill), with a dust and debris burst per cell, and
    `world:runeOpen {id}`.
  - While waking: hint `hint.runesWake`, and `world:runeWake {id, progress}` at ≤ 4 Hz (juice may
    pulse the lintel). Dark lantern: `hint.runesDark`. Tier too low: `hint.runesWeak`.
  - "Open" is *derived from the world* (all door cells air), so a save or load needs nothing.
  - `openDoor(id)` is public, so the moment-to-moment C1 rune lock (shrine dials) can reuse the
    door runtime.
- **Notes**:
  - Interact `feature`/`note`, label "Read".
  - It shows the discovery banner with `{ id: 'note.<id>', title, body }` and, if the UI ships
    it, the label "HALDEN LOG".
  - `journal.addDiscovery('note.<id>')`, so the note is listed in the journal. The first read
    autosaves through the existing discovery path. It emits `world:note {id}`.
  - Reading it again shows the text without the flash.
- **The Black Stone**:
  - Interact `feature`/`monolith`, label "Touch the stone", within 3.5 m.
  - First time: discovery `monolith`, `world:monolith {}`, and every moth within 40 m spirals
    upward for 6 s.
  - A fallback violet post flash (0.5, 0.3, 1.0) at 0.22. Juice may replace it.
  - The objective owner may end the chain here (§13).
- **Interaction plumbing**:
  - `PropSpec.interact` gains `'feature'`, plus
    `feature?: { kind: 'rope'|'hoist'|'note'|'relic'|'monolith'; id: string; end?: 'top'|'bottom' }`.
  - In `Game.interact`, `case 'feature'` → `features.interact(spec)`.
  - In `interactLabel`, `case 'feature'` → `features.label(spec)`.
  - Relic: `collect(item)` if the item exists in `ITEMS`, `removeProp`, and the discovery.
- **Guidance tree** (`src/game/Guidance.ts`):
  - It generalizes to nodes with parent pointers: `new Guidance(nodes: {p, parent}[])`. The old
    polyline constructor is kept: parent = i − 1.
  - `next()` returns the parent of the nearest node once within 4 m.
  - `setParent(id, parentId)` handles the hoist release.
  - Today, from the rift floor or the reliquary, the nearest guide point is behind rock, so the
    compass would lie. Every spur in §3 fixes this.

## 5. Ambient life: lumen moths — MUST

- **Simulation** (`src/game/moths.ts`, pure, typed arrays, no per-frame allocation):
  - `MothFlock(anchors, seed, cap)`.
  - `step(dt, lantern {x,y,z,lit,fuelFrac}, player, isOpen(x,y,z))` writes `positions` and
    `phases`.
- **Anchors**:
  - static ones from §3: crack, grotto, first crystals (77, 97.5, 55) ×4, hoist lamp, rune doors,
    reliquary, monolith, and the Glimmerfall's edge (112, 43, 121) ×6
  - plus the epoch's bloom ×8 (§6)
  - each anchor is `{ id, x, y, z, count, radius, secret? }`
- **Behaviour** (all numbers in `config/balance.ts` → `MOTHS`):
  - **Roost**: a Lissajous orbit at r 0.3–1.4 m, ±0.6 m vertical, 0.6–1.3 m/s, with flutter
    jitter. Secret anchors keep 2–3 moths in a tight vertical "tap" against the slit or door.
  - **Drawn**: a lit lantern with fuel ≥ 20 % within 7 m pulls up to 8 moths into a 0.9 m orbit
    around the flame. They drop off beyond 12 m.
  - **Scatter**: on a `block:hit` within 4 m, they get an outward impulse and return in 2–4 s.
  - Low or empty fuel releases them home: a quiet danger cue.
  - Moths never enter solid cells (a target in rock is rejected and the old target is kept).
  - Only anchors within 45 m of the player simulate.
  - Cap 40 / 32 / 16 (High / Balanced / Battery).
- **Render** (`src/game/effects/LumenMoths.ts`):
  - One instanced quad mesh: instance offset, phase and glow. Camera-facing.
  - The wing flap scales the width by |sin(phase · 2π · 22 Hz)|. The fragment shader draws two
    procedural wing lobes, with no texture fetch.
  - Additive, `depthWrite` false. It uses the same `atmosphere()` absorption as the particles,
    so distant moths fade into haze.
  - Colour (0.78, 0.95, 1.0) × 1.4, wingspan 0.16 m. Tiny, so the cyan pixel budget holds.
  - 1 draw call.
- **Why**: the dark feels alive, and the moths *point at secrets* (the crack, the doors, the
  bloom) without a word, as GAME_DESIGN says: "guide curiosity".

## 6. Replay: the deep breathes — MUST

- **Epoch**: the expedition number.
  - It increments on `camp:entered` if the explorer went below y 80 (into the Hollow) since the
    last increment.
  - Stored as `SaveData.world.epoch`. If moment-to-moment's `FunState` exposes an expedition
    counter at integration, use that single source instead.
  - New Expedition resets it to 0.
- **Living rock** (`src/world/gen/features/living.ts` + `config/livingRock.ts`):
  - Each site lists cells (voxel indices plus the host id) and a per-epoch table with *exact*
    counts:
    - `haldenFace` (57 cells): copper 10, iron 6, the rest host rock
    - `riftWalls` (about 126 cells): iron 12, copper 4, crystal 2, the rest host
  - The content agent may add rows (for example a deep ore, 2 per epoch).
  - `rollLiving(site, seed, epoch)` orders the cells by `hash32(seed ^ idx·0x9e37 ^ epoch·0x85eb)`
    and fills the table in order. The generator applies epoch 0.
  - **On increment**, while the player is ≥ 40 m from the site (always true at camp):
    - Write each cell's new id with `world.set`. A mined cell regrows; an intact one may change
      ore.
    - Skip any cell within 1.5 m of a drop or a black-out cache.
    - Then run one `light.recomputeBox(siteBox ± LIGHT_REACH)` per site, `rig.markLightDirty`,
      and let the mesh workers rebuild.
    - Emit `world:regrow {epoch, cells}`.
  - Cells are restored only where the generated world is solid, so reachability can never
    shrink below the generated world's.
  - Saves need nothing new: rolled ids differ from the generated ones, so they ride in the world
    delta (at most about 180 pairs).
- **Glimmer bloom**: one minable `crystalCluster` per epoch (glimmer 2–3, one `LIGHT_CYAN`
  emitter, cyan +1), with prop id `bloom_e<epoch>`.
  - It appears at one of 6 sites, never the same twice in a row:

    | Site | Position |
    |---|---|
    | grotto floor | (61, 92, 66) |
    | adit end | (103, 43, 55) |
    | rift west | (115, 6, 131) |
    | south of the Spindle | (104, 42, 136) |
    | east of the chasm | (128, 42, 114) |
    | the landing | (124, 65, 72) |

  - Epoch 0 uses the east-of-chasm site, visible from the stairs, to teach that moths mean a
    bloom.
  - The previous bloom is removed if still unmined.
  - On load, it is re-added unless its id is in `removedProps`.
  - 8 moths gather over it.
- **Why it is fun and not a grind**: each trip has a "where are the moths tonight?" hunt, and
  the two living faces give fresh, varied ore exactly where the hoist and the rope make the trip
  short. The rest of the zone stays authored and stable.

## 7. Text (`src/i18n/en.ts`, appended block)

```
'discovery.mothGrotto.title': 'The Moth Grotto',
'discovery.mothGrotto.body': 'A hollow of crystal behind a cracked wall, alive with pale moths. They followed your light here.',
'discovery.hoist.title': 'The Halden Hoist',
'discovery.hoist.body': 'The old ore lift still runs. The way back up to the ledge is a short ride now.',
'discovery.reliquary.title': 'The Reliquary',
'discovery.reliquary.body': 'The door knew your lantern. Inside, the builders kept their lamps, every one of them cold.',
'discovery.lampGallery.title': 'The Lamp Gallery',
'discovery.lampGallery.body': 'Only a stronger light could wake this door. Rows of stone lamps, and one that still remembers burning.',
'discovery.undercroft.title': 'The Rift Floor',
'discovery.undercroft.body': 'Violet light, black stone, and a camp that nobody came back to.',
'discovery.monolith.title': 'The Black Stone',
'discovery.monolith.body': 'It is warm under your hand. Far below, something turns toward the light.',
'discovery.note.office.title': 'Halden Log: Survey Office',
'discovery.note.office.body': 'Day 41. Broke into a hall below the tunnel, built by no one on our charts. Copper in every wall. Head office wants tonnage, not questions.',
'discovery.note.landing.title': 'Halden Log: Survey Station 2',
'discovery.note.landing.body': 'The hall is ninety paces across. Six columns still stand, one has fallen. Past the sealed door a balcony drops into the rift. We rig a rope there tomorrow.',
'discovery.note.yard.title': 'Halden Log: Face 3',
'discovery.note.yard.body': 'We worked Face 3 down to bare rock on Tuesday. By Friday the copper had grown back. The foreman says not to write that down. I am writing it down.',
'discovery.note.rift.title': 'Halden Log: The Last Page',
'discovery.note.rift.body': 'The singing comes from the black stone. Rook went down to it without a lamp and came back with light in his eyes. Tonight the rest of us go down to listen. Whoever finds this: keep your lantern lit.',
'hint.interactNote': 'Read',
'hint.ropeDown': 'Climb down',
'hint.ropeUp': 'Climb up',
'hint.hoistRide': 'Ride the hoist',
'hint.hoistRelease': 'Release the hoist',
'hint.hoistChained': 'The hoist is chained from below.',
'hint.touchStone': 'Touch the stone',
'hint.takeRelic': 'Take the relic',
'hint.runesWake': 'The runes answer your lantern…',
'hint.runesDark': 'The runes are dark. They need light.',
'hint.runesWeak': 'The runes stir, but your lantern is too weak to wake them.',
```

Rules for this text:
- The notes use the `discovery.note.*` keys, so the existing journal list
  (`inventory.ts`: `hasText('discovery.<id>.title')`) shows them with no UI change.
- No button text matches the e2e selectors listed in the moment-to-moment spec §2.
- No hyphen goes directly before digits and " m".

## 8. Data and types

- `WorldLayout.features?: FeatureLayout`. It is optional, so the worker's `...rest` carries it
  and old code ignores it.

  ```ts
  interface FeatureLayout {
    boxes: Region[];
    pois: Array<{ id: string; p: V3; kind: 'sight' | 'pickup' | 'landmark'; mustReach: boolean }>;
    links: Array<{ id: 'hoist' | 'riftRope'; kind: 'hoist' | 'rope'; top: V3; bottom: V3; path: V3[]; speedDown: number; speedUp: number; lock?: 'releaseAtBottom' }>;
    runeDoors: Array<{ id: string; cells: V3[]; lintel: V3[]; wake: V3; radius: number; hold: number; minLanternTier: number }>;
    mothAnchors: Array<{ id: string; p: V3; count: number; radius: number; secret?: boolean }>;
    living: Array<{ id: string; cells: Int32Array; host: Uint8Array; table: Array<{ block: number; count: number }>; box: Region }>;
    blooms: Array<{ id: string; p: V3; rotY: number }>;
    guide: Array<{ id: string; p: V3; parent: string }>;
    sockets: { fossil: V3[] };
    eventSites: Array<{ id: string; p: V3; r: number; tag: 'yardCeiling' | 'riftFloor' | 'bridgeMid' | 'adit' }>;
  }
  ```

- `generateWorld(seed, opts?: { features?: boolean })`.
- `reachableCells(w, x, y, z, maxDrop = 3, links?: Array<{ top: V3; bottom: V3 }>)`: an optional
  link jump between the two stand cells.
- New prop kinds (appended): `haldenNote` (2 variants: book on a surface, sheet on a post) and
  `hoistWinch` (2 variants: sheave block, ratchet drum or capstan). Builders go in a new
  `src/render/props/featureModels.ts`, using the `VoxBuilder`, `ring`, `beam` and `disc`
  helpers. Nothing is cyan; Halden timber and iron palette.
- New events (appended in `core/events.ts`): `world:ride`, `world:runeWake`, `world:runeOpen`,
  `world:hoistReleased`, `world:note`, `world:monolith`, `world:regrow`, `world:bloom`,
  `moths:startled`.
- Debug (`src/debug/DebugApi.ts`): `__DD__.features = { state(), ride(id, dir, t?),
  openDoor(id), setEpoch(n), wake(id) }`, for the tour and e2e.

## 9. Build order and time budget

| # | Step | Priority | Time |
|---|---|---|---|
| 1 | Scaffold: `features/index.ts` + types + `generateWorld` hook + `features:false` switch + reachability links + containment test | MUST | 25 min |
| 2 | P1 office, P2 grotto (crack, plug, squeeze, geode), P6 survey post | MUST | 30 min |
| 3 | P3 yard and hoist (head, foot, track, spoil, adit with sets), P4 reliquary + door 1, P5 rift floor + rope + last camp + stone | MUST | 45 min |
| 4 | Runtime: `WorldFeatures` (rides, doors, notes, stone, relic), Game hooks, Guidance tree, i18n, prop models | MUST | 45 min |
| 5 | Lumen moths (flock + renderer + anchors) | MUST | 35 min |
| 6 | Living rock + epoch + bloom | MUST | 25 min |
| 7 | Tests (§11) + `tools/poi-density.ts` | MUST | 25 min |
| 8 | Tour f01–f15 (`tour-world-after.json`) + metrics + fixes | MUST | 20 min, plus SwiftShader time |
| 9 | P7 Lamp Gallery + door 2 (tier 2) | SHOULD | 15 min |
| 10 | Bridge frayed rope (C-b), e2e (C-d) | SHOULD/COULD | 15 min |
| 11 | C-a niches, C-c spyglass | COULD | — |

The cut line, if time runs out: drop steps 9–11. Then trim P3 to the hoist, the foot stage, the
adit and the note (no track or spoil). Moths and replay stay: they are the "alive" and "not
exhausted" answers.

## 10. Ownership

- **New files** (mine):
  - `src/world/gen/features/{index,places,living,types}.ts`
  - `src/config/livingRock.ts`
  - `src/game/WorldFeatures.ts`, `src/game/ropeRide.ts`, `src/game/runeDoor.ts`, `src/game/moths.ts`
  - `src/game/effects/LumenMoths.ts`
  - `src/render/props/featureModels.ts`
  - `tools/poi-density.ts` (a port of `route.ts` / `proto.ts`), `tools/world-tour.json`
  - `tests/unit/worldFeatures.test.ts`, `livingRock.test.ts`, `moths.test.ts`, `ropeRide.test.ts`,
    `runeDoor.test.ts`, `guidance.test.ts`
- **Hook edits in shared files** (small; listed so the others can merge around them):
  - `generateWorld.ts`: about 4 lines, after section 13 and before the pocket pass.
  - `world/gen/types.ts`: the optional fields, appended `PropKind`s, and `interact: 'feature'`.
  - `render/props/models.ts`: append 2 kinds and import the builders.
  - `world/analysis/reachability.ts`: the optional `links` parameter.
  - `game/Game.ts`, about 25 lines: construct and attach features after the session loads; the
    ride branch in `updatePlaying`; `features.update(dt)` after `updateDiscoveries`; the
    `interact` and label cases; guide nodes; `camp:entered` → epoch; the save and restore of
    `world.epoch`; add the moths to the scene and update them.
  - `game/Guidance.ts`: tree nodes, backward compatible.
  - `save/types.ts` and the save sanitizer: optional `world`.
  - `core/events.ts`: append. `i18n/en.ts`: append.
  - `config/balance.ts`: `MOTHS`, `RIDES`.
  - `debug/DebugApi.ts`: the `features` namespace.
  - `worldgen.test.ts`: add `hoistTop`, `hoistFoot`, `ropeTop` and `lastCamp` to the warm-lamp
    list, and the cap note if needed.
- **I do not touch**: materials, the lighting rig, the camera rig, mining rules, recipes or items
  (I only request them), UI screens, audio voices, and the moment-to-moment files (pockets,
  director, contracts, report, cache).

## 11. Tests, tour and metrics

- **`worldFeatures.test.ts`** (generated once):
  - (a) Determinism. With features off vs on, every pre-existing prop is identical (id, kind,
    position) and every voxel outside `features.boxes` is byte-identical.
  - (b) With the barriers open (crumbling, hardened, rune doors, the grotto plug) and both links
    active, every `mustReach` POI is reachable from the spawn. Both rooms are unreachable before
    their doors open. The rift floor is unreachable without the rope link. The balcony and rift
    stay sealed before the seal is mined.
  - (c) Ride sweeps: the explorer's AABB (0.62 × 1.72) along each polyline has 0 solid hits.
    Both stands are standable and reachable.
  - (d) Rune door cells are tier 99, the lintel is glyph stone, and the wake point is standable
    within 3 m.
  - (e) Cyan/violet emitters ≤ the cap at epoch 0. Warm lamps ≤ 7 m from office, `hoistTop`,
    `hoistFoot`, `ropeTop` and `lastCamp`.
  - (f) Spacing: the `poi-density` algorithm (§12-4) on each leg.
  - (g) Light leaks from the grotto: at (71, 96, 61), blue > red and > 0.
  - (h) Every new place's `box` is disjoint from the camp box + 2 m and from the moment-to-moment
    pocket sites (when `layout.pockets` exists).
- **`livingRock.test.ts`**:
  - exact counts per epoch, deterministic
  - ≥ 50 % of ore positions differ between epochs e and e+1 (e = 0…19)
  - only listed cells change
  - no regrowth within 1.5 m of a given drop
  - restored only where the generated world is solid
  - cyan ≤ the cap for epochs 0–20
  - the bloom never repeats consecutively and every bloom site is standable and reachable
- **`moths.test.ts`**:
  - deterministic
  - roosting moths settle within 1.5 m of the anchor
  - a lit lantern at 5 m gets ≥ 4 moths within 2 m in ≤ 4 s
  - lantern off or < 20 % fuel: back within 2 m of home in ≤ 6 s
  - the cap is respected
  - 0 samples inside solid cells over 60 s at 30 fps at the grotto and the monolith
  - step cost: ≤ 0.05 ms for 32 moths in Node
- **`ropeRide.test.ts`**:
  - the position is continuous and the arc parameter monotone
  - the duration is within 5 % of the analytic value and ≤ 7 s
  - at the end, the `PlayerController` stands on the cell with `landedSpeed` 0 over 30 frames
- **`runeDoor.test.ts`**:
  - it opens only after the hold time with a lit lantern in the radius
  - progress decays when the explorer leaves
  - the tier gate holds for door 2
  - open is derived from the cells (a save/load round-trip through `encodeWorldEdits` /
    `applyWorldEdits` stays open)
- **`guidance.test.ts`**:
  - from every feature POI, `next()` reaches camp
  - every tree edge has a BFS path (with links) ≤ 2.2× its straight length
  - after the hoist is released, the yard's next node is `hoistTop`
- **Tour**: `tour-world-after.json`, already written in the scratch folder.
  - Command: `node tools/play.mjs tools/world-tour.json artifacts/fun-design-world/after 915x412`.
  - Shots:
    - f01 office
    - f02 grotto crack
    - f03 grotto
    - f04 ledge reveal with the headframe
    - f05 yard from the stairs
    - f06 hoist foot
    - f07 bridge toward door 1
    - f08 reliquary
    - f09 rope head
    - f10 rift floor and stone
    - f11 last camp
    - f12 gallery door
    - f13 adit
    - f14 hoist mid-ride
    - f15 rope mid-descent
  - Read every shot. Each place must have one focal light, a readable silhouette and no
    placeholder.
  - Per-shot metrics with the existing `metrics.py`: luma below 12 ≤ 18 %, clipped 0 %,
    saturated cyan ≤ 3 %. `__DD__.report()` draw calls and triangles stay within the §2 budget.
- **Perf**: `tools/gen-stats.ts` (generation +≤ 40 ms, light ±5 %). A regrowth timing via
  `__DD__.features.setEpoch(1)` (≤ 25 ms). The moth step and draw are measured in `report()`.

## 12. Acceptance

1. `tsc` is clean, and `vitest` is green (existing and new). `routeWalk.test.ts` is unchanged.
   `worldgen.test.ts` changes only in the documented lamp list and cap line.
2. Containment: features off vs on leaves every old prop and every voxel outside
   `features.boxes` identical.
3. Reachability per §11 (b), both before and after each barrier.
4. Spacing (`tools/poi-density.ts`: BFS path, first sight within 12 m for sights and pickups,
   30 m for landmarks, 25 m for columns, with line of sight from eye height):
   - **max gap between fresh sights ≤ 22 m** on camp→ledge, ledge→stairs foot, seal→balcony,
     balcony→stone, stairs foot→reliquary, ledge→yard and yard→adit (today 51 / 36 / 40 / – /
     34 / – / –)
   - **sight-or-ore gap ≤ 20 m** on camp→ledge and seal→balcony (today 25.7 / 18.8)
5. Empty floor: reachable columns more than 10 m from any prop, structure, landmark or feature
   POI ≤ 20 % (today 30 %, prototype 18 %); more than 15 m ≤ 200 (today 650, prototype 134).
6. Beats: discoveries 6 → ≥ 11; found notes 0 → 4; secrets 1 → ≥ 3 (shrine, grotto, reliquary,
   plus the gallery); shortcuts 0 → 1. With the hoist, yard→camp is ≥ 20 % shorter
   (prototype 27 %).
7. Replay (epochs 0–20): each living site changes ≥ 50 % of its ore positions per epoch with
   exact counts; one new bloom per expedition at a non-repeating site; cyan ≤ the cap at every
   epoch.
8. Rides: 0 sweep hits, ≤ 7 s, no fall damage; the hoist lock behaves as in §3 P3, also after a
   reload.
9. Moths: 1 draw call, ≤ 0.15 ms per frame, never in rock, drawn to the lantern in ≤ 4 s,
   gathered at the secret anchors.
10. Perf within §2; the tour read and judged.

## 13. What I need from the other workstreams

- **Progression and economy**:
  - A sink for the added supply. The first clear adds about 20 glimmer: grotto 3 clusters,
    reliquary 2, gallery 2, rift formations 4 plus seams, bloom 2–3. Each later expedition adds
    about 20 iron, 14 copper, 2 crystal voxels and one bloom. An iron-tier recipe would use the
    iron.
  - Optional key items `bearerLens` (reliquary) and `firstLamp` (gallery). Without them the
    relics are discovery-only.
  - Keep the copper lantern as tier 2, so it is door 2's key.
  - Objectives: after `goDeeper`, optionally `reachRiftFloor` (discovery `undercroft`) →
    `touchStone` (discovery `monolith`) as the end of the slice.
- **UI**:
  - an optional `label` on `showDiscovery` ("HALDEN LOG" for `note.*`)
  - optionally a small progress ring on the interact chip while a rune door wakes (or I keep
    the hint text)
  - keep the journal listing every `discovery.*` with text, which already works
- **Juice and audio**: sounds with my fallbacks in brackets (each is an existing voice re-pitched),
  plus visuals:
  - rope creak loop (`hit.wood` 0.5)
  - hoist ratchet, release clank and whir (`break.metal` 0.7)
  - rune door grind + chime (`break.ancient` + `discovery`)
  - moth flutter, very quiet, near only
  - grotto shimmer ambience bed
  - stone wake: a deep tone + rising shimmer, with a violet flash and camera trauma 0.25
  - paper rustle on Read
  - a `climb` or hang pose for rides
- **Lens / camera**:
  - verify the squeeze (1 × 3 m, 8 cells), the office door (2 × 2) and the hoist ride (camera
    follows a fast vertical move; no snap through the ledge)
  - optionally `focusOn(point, hfov, s)` for C-c
- **Lighting**: accept the +14 emitter allocation; review the rift floor under the rift
  atmosphere preset and the yard's warm pool against the cool Hollow fill.
- **Moment-to-moment (systems)**:
  - Run the pocket pass *after* mine, and add the new places to the walked-path list
    (`features.pois` with `mustReach`), so pockets sit near the rift floor and the yard too.
  - Include `features.links` in the `HomeDistance` BFS: the rope and the hoist change the
    distance home.
  - Treat my `world:*` events as notable moments.
  - The C1 rune lock can open its vault through `features.openDoor(id)`.
  - The shrine is left untouched for C1.
  - One shared expedition counter (theirs or my `world.epoch`).
- **Content (assets, special events, ores)**:
  - Props: `oreCart` (upright), `stoneLamp` (Lantern-bearer niche lamp), `desk` (Halden), each
    appended at the end of `PROP_VARIANTS`.
  - A fossil rock for `sockets.fossil`.
  - Rows for new ores in `config/livingRock.ts` (for example a deep ore, 2 per epoch on
    `riftWalls`).
  - Special events can use `features.eventSites`: a creaking adit ceiling (`adit`), a deep
    tremor (`riftFloor`), a Glimmerfall surge at mid-bridge (`bridgeMid`), dust from the yard
    headframe (`yardCeiling`).
  - Supply crates (moment-to-moment C2) may include my crates in the office, the yard and the
    last camp.

## 14. Risks

- **Concurrent edits to `generateWorld.ts`** (the lighting key-light pass, the pocket pass). My
  hook is one block after section 13. Containment and determinism tests catch drift.
- **Camera in the squeeze.** The fallback is to widen it to 2 cells at the bend; the walk test
  still holds.
- **Cyan budget pressure.** The allocation is +14, with the cap-raise rule in §2.
- **Rides feeling like teleports.** Mitigations: arc-length easing, camera follow, the creak
  sound, and the mid-ride shots f14/f15 to judge them.
- **Regrowth hitch on a phone** (unmeasured): the work is split into two frames, one site each,
  behind the banking toast.
- **Old saves.** A player position that is now inside new rock is caught by the existing rescue.
  New solid cells only appear in former rock (the containment test lists them).


## Items

### [MUST] Feature pass scaffold + containment

- **what:** New deterministic pass buildFeatures(ctx) with its own Rng (seed ^ 0xfea70001), prop id namespace f_<place>_<n>, WorldLayout.features (boxes, pois, links, runeDoors, mothAnchors, living, blooms, guide, sockets, eventSites). generateWorld(seed, {features:false}) switch for tests. Optional links parameter on reachableCells so rope/hoist count in reachability.
- **where:** Runs in generateWorld after section 13 (key lights), before the moment-to-moment pocket pass and the bedrock re-assert
- **numbers:** Generation +<=40 ms. No pre-existing prop id/position/RNG draw changes. Voxels outside features.boxes are byte-identical with features off/on.
- **files:** ["src/world/gen/features/index.ts", "src/world/gen/features/types.ts", "src/world/gen/generateWorld.ts (about 4-line hook)", "src/world/gen/types.ts", "src/world/analysis/reachability.ts"]
- **test:** worldFeatures.test.ts (a) determinism + containment against features:false; existing worldgen and routeWalk tests stay green

### [MUST] P1 Halden Survey Office

- **what:** A timber-lined side room off the bare first tunnel segment: plank floor, ceiling beams, a hanging lantern (warm practical), crate desk with Halden Log 1, crates, barrel, pickaxe rack, rope coil, a collapsed corner with a fallen beam, 2 small copper veins
- **where:** Room x 53-62, z 31-37, walk y 100; door x 55-56, z 38-39 off the tunnel's north wall at z 40 (about 22 m from camp). Box x 52-63, y 99-105, z 30-40
- **numbers:** About 10x7x3-4 m; 1 warm emitter; 6 props + 1 note; 2 copper veins of 2-3 voxels
- **files:** ["src/world/gen/features/places.ts", "src/render/props/featureModels.ts"]
- **test:** Reachable (mustReach); warm lamp <=7 m; tour shot f01

### [MUST] P2 Moth Grotto (secret 1: crack, squeeze, geode)

- **what:** Hidden crystal geode behind a gravel-plugged crack whose 1-voxel slit leaks cold light into the tunnel; an 8-cell 1x3 m squeeze; a geode with a 3-voxel crystal seam, 1 cyan key light and 3 minable clusters; 6 fossil socket cells for the content agent; discovery mothGrotto; moths at the crack and inside
- **where:** Plug (70,94..95,61) gravel; slit air at (70,96,61),(69,96,61); squeeze (69,94,61)(68,94,61)(67,94,61)(67,94,62)(66,94,62)(65,93,62)(65,93,63)(64,93,63), 3 tall; geode centre (60.5,92,64.5), radii 5.2x4.2x4.6, walk y 92. Box x 53-71, y 90-100, z 57-71
- **numbers:** Cyan +4; glimmer 3-6 from clusters; moths 3 (crack) + 10 (grotto); light at (71,96,61) must be blue > red
- **files:** ["src/world/gen/features/places.ts"]
- **test:** Reachable only after the plug is mined; leak-light assertion; squeeze 4-connected; tour f02/f03; lens owner verifies the camera in the squeeze

### [MUST] P3 Halden Yard and the Hoist (shortcut)

- **what:** Fills the 1112 m2 dark under the ledge. A timber headframe on the ledge brink (frames the reveal), a 47 m hoist rope, a foot stage (deck, ratchet drum, counterweight crates, bright lamp, Halden Log 3), a 12 m track with sleepers, rails, buffer and cart, a spoil heap with copper, and the Halden Face adit reached under flight 1 (2 timber sets; living-rock walls). Chained from below: release at the bottom (discovery hoist), then rides work both ways
- **where:** Head: carve crags x 85-88, z 81-84, y 88-91; top stand (87,88,82.5). Foot: deck x 83-88, z 83-87, y 41.1; bottom stand (85.5,41,84.5). Track (88.5→99.5, 41, 85.5). Spoil r 2.4 at (95,41,79.5). Adit x 102-104, y 43-45, z 53-62. Box x 76-110, y 40-94, z 50-95
- **numbers:** Ride polyline swept: 207 samples, 0 blocked; 9 m/s with easing, about 5.8 s. Yard→camp −27%. About 57 living-rock cells (copper 10, iron 6 per epoch). 2 warm lamps
- **files:** ["src/world/gen/features/places.ts", "src/world/gen/features/living.ts", "src/render/props/featureModels.ts"]
- **test:** Ride sweep 0 hits; hoist lock before/after release (also after reload); shortcut ≥20% from the yard; tour f04/f05/f06/f13/f14

### [MUST] P4 The Reliquary behind Rune Door 1 (secret 2)

- **what:** The bridge's dead end becomes a Lantern-bearer door that wakes to any lit lantern held near it for 1.2 s and sinks row by row. Behind it: a passage and a corbel-vaulted room with 6 niches (stone lamps from the content agent, or left empty), a relic on a plinth (discovery reliquary, optional key item bearerLens) and 2 glimmer clusters
- **where:** Door cells (121..123,42..44,138) ancient brick; lintel glyphs (121..123,45,138); frame x 120/124; wake point (122.5,42,136.6) r 2.8. Room x 118-126, z 142-149, y 42-48; relic (122.5,43,148.5). Box x 116-128, y 40-50, z 137-151
- **numbers:** Cyan +3 (lintel); glimmer 4-6; moths 4 (door) + 5 (room); bridge sight gap 34→19 m
- **files:** ["src/world/gen/features/places.ts", "src/game/runeDoor.ts", "src/game/WorldFeatures.ts"]
- **test:** Unreachable before opening, reachable after; runeDoor.test.ts (hold, decay, derived-open save round-trip); tour f07/f08

### [MUST] P5 The Rift Floor and the Black Stone (climax)

- **what:** A Halden rope with a capstan over the balcony parapet leads 19 m down to the rift floor: the Halden's last camp (bedroll, crate, grapnel coil, a lamp still smouldering with an ember, Halden Log 4), the monolith made interactable ('Touch the stone': discovery monolith, moth spiral, violet flash), the deep crystal formations now minable, living-rock walls, and a reserved descentHook for E5
- **where:** Top stand (133.5,25,124.5); bottom = nearest standable to (128.5,6,124.5); ride over the coping at (131.3,26.5,124.5); last camp around (126.5,6,128.5); monolith (123.5,6,135.5); discovery region x 112-137, y 5-14, z 116-147. Box x 104-144, y 4-30, z 112-152
- **numbers:** Ride ≤7 s (4.5 m/s down, 3.5 up); new leg sight gap 11 m; about 430 new reachable columns; about 126 living cells (iron 12, copper 4, crystal 2 per epoch); moths 10
- **files:** ["src/world/gen/features/places.ts", "src/game/ropeRide.ts", "src/game/WorldFeatures.ts"]
- **test:** Unreachable without the rope link and before the seal is mined; sweep 0 hits; no fall damage after the ride; tour f09/f10/f11/f15

### [MUST] P6 Landing survey post + the four Halden logs

- **what:** Four found texts in the Halden arc (office: tonnage → landing: 'we rig a rope there tomorrow' → yard: 'the copper had grown back' → rift: 'the singing'). The landing note gives the player a goal: the rope on the far balcony. Notes are journal discoveries note.<id> (Read; first read autosaves)
- **where:** Office desk (60.5,100.82,33); landing post (125.6,65,77.6); yard post (83.6,41.1,85.0); last camp crate (127.8,6,127.4)
- **numbers:** Found notes 0→4; stairs sight gap 36→20 m
- **files:** ["src/i18n/en.ts", "src/game/WorldFeatures.ts", "src/render/props/featureModels.ts"]
- **test:** Journal lists note.* entries; text keys exist; tour

### [MUST] Runtime: rides, rune doors, notes, stone, relics, guidance tree

- **what:** WorldFeatures runtime. Rides: frozen player, arc-length easing, camera follows, teleport to the end stand (no landing). Rune doors: wake rule, row-by-row opening via setBlock; open state derived from the world; public openDoor(id) for the moment-to-moment rune lock. Notes, the stone, relics through interact 'feature'. Guidance becomes a parent-pointer tree with spurs for every new place, plus setParent when the hoist is released (today the compass would point through rock from the rift floor). Events world:* appended
- **where:** Game.updatePlaying ride branch + features.update after updateDiscoveries; interact/label cases; camp:entered → epoch
- **numbers:** Game.ts about 25 lines; interact range 1.8 m (ropes), 3.5 m (stone)
- **files:** ["src/game/WorldFeatures.ts", "src/game/ropeRide.ts", "src/game/runeDoor.ts", "src/game/Guidance.ts", "src/game/Game.ts (hooks)", "src/core/events.ts (append)", "src/debug/DebugApi.ts (__DD__.features)"]
- **test:** ropeRide.test.ts, runeDoor.test.ts, guidance.test.ts (every POI reaches camp; each edge's BFS path ≤2.2x its straight length)

### [MUST] Lumen moths (ambient life that points at secrets)

- **what:** Pure flock simulation plus a one-draw-call instanced renderer. Moths roost on anchors (crack, grotto, first crystals, hoist lamp, rune doors, reliquary, monolith, Glimmerfall edge, the epoch's bloom). Up to 8 are drawn into an orbit round a lit lantern within 7 m. They scatter at mining hits within 4 m and go home when fuel is under 20%. At secret anchors 2-3 keep tapping the slit or door. Procedural flapping wings, haze-absorbed, pale cyan-white
- **where:** Anchors from layout.features.mothAnchors; simulated within 45 m of the player
- **numbers:** Cap 40/32/16 (High/Balanced/Battery); wingspan 0.16 m; ≤0.15 ms per frame; 1 draw call; drawn to the lantern ≤4 s
- **files:** ["src/game/moths.ts", "src/game/effects/LumenMoths.ts", "src/config/balance.ts (MOTHS)"]
- **test:** moths.test.ts (deterministic, roost ≤1.5 m, lantern draw, release, cap, 0 samples in rock over 60 s at the grotto and monolith, step ≤0.05 ms)

### [MUST] The deep breathes: living rock + glimmer bloom per expedition (replay)

- **what:** The epoch increments on camp entry after going below y 80. Living sites haldenFace (57 cells) and riftWalls (about 126) re-roll with exact per-epoch counts by a hash order: mined cells regrow, others may change ore, only cells solid in the generated world, none within 1.5 m of drops or caches, one recomputeBox per site. One glimmer bloom per expedition at one of 6 sites, never repeated twice in a row; moths gather over it. Saved as SaveData.world.epoch plus the existing world delta
- **where:** Blooms: grotto (61,92,66), adit (103,43,55), rift west (115,6,131), south of the Spindle (104,42,136), east of the chasm (128,42,114) (epoch 0), landing (124,65,72)
- **numbers:** Per epoch: about 20 iron, 14 copper, 2 crystal, 1 bloom (2-3 glimmer); ≥50% ore positions change; cyan ≤ cap at epochs 0-20; ≤25 ms main thread at camp
- **files:** ["src/world/gen/features/living.ts", "src/config/livingRock.ts", "src/game/WorldFeatures.ts", "src/save/types.ts (optional world)"]
- **test:** livingRock.test.ts (exact counts, determinism, change ratio, listed cells only, solid-only restore, drop exclusion, cyan cap per epoch, bloom sites standable and reachable)

### [MUST] POI-density tool, test suite and capture tour

- **what:** Port the prototype metric to tools/poi-density.ts (BFS legs with links, first sight with line of sight, gaps, empty-floor share). Unit test asserting the thresholds. The 15-shot tour (tour-world-after.json, already written) incl. mid-ride shots, read and judged, with per-shot metrics and draw calls
- **where:** artifacts/fun-design-world/after/
- **numbers:** Sight gap ≤22 m on all listed legs; sight-or-ore ≤20 m on tunnel and gate; empty floor ≤20% (>15 m ≤200 columns); per new shot ≤18% luma<12, 0% clipped, ≤3% saturated cyan, +≤12 draw calls, +≤15k triangles
- **files:** ["tools/poi-density.ts", "tools/world-tour.json", "tests/unit/worldFeatures.test.ts"]
- **test:** vitest + node tools/play.mjs tools/world-tour.json artifacts/fun-design-world/after 915x412

### [SHOULD] P7 Lamp Gallery behind Rune Door 2 (copper-lantern gate)

- **what:** A second rune door at the foot of the gate stair. Only the copper lantern (tier 2) wakes it; the oil lantern gets 'The runes stir, but your lantern is too weak'. Behind it: a vaulted gallery with 8 lamp niches, the 'first lamp' relic (discovery lampGallery) and 2 glimmer clusters. Gives the copper lantern a world purpose
- **where:** Door (145..147,25..27,130); lintel y 28; wake (146.5,25,128.4); gallery x 143-149, z 131-140, walk y 25. Box x 141-151, y 23-32, z 129-142 (rock 1.00 verified)
- **numbers:** Cyan +3; glimmer 4-5; moths 3
- **files:** ["src/world/gen/features/places.ts"]
- **test:** Tier gate in runeDoor.test.ts; reachable only after opening; tour f12

### [COULD] Extras: frayed bridge rope, gate-stair lamp niches, spyglass, e2e

- **what:** C-b: a frayed Halden rope hanging off the east parapet at mid-bridge (124.6,43.2,128.5), the first hint of P5. C-a: 5 lamp niches down the gate stair's west wall (x 146, z 106-118), only needed if P7 is cut. C-c: a spyglass at the survey post using a camera focusOn API from the lens workstream. C-d: an e2e case (wake door 1, ride the rope, touch the stone)
- **where:** As listed
- **numbers:** Bridge gap stays ≤19 m; gate gap 40→19 m with the niches
- **files:** ["src/world/gen/features/places.ts", "tests/e2e/world.spec.ts"]
- **test:** poi-density thresholds; e2e when the suite is run

## Ownership (as designed)
- New: src/world/gen/features/index.ts, places.ts, living.ts, types.ts (the deterministic feature pass, own Rng seed ^ 0xfea70001, prop ids f_<place>_<n>)
- New: src/config/livingRock.ts (living-rock tables; the content agent may append ore rows)
- New: src/game/WorldFeatures.ts, src/game/ropeRide.ts, src/game/runeDoor.ts, src/game/moths.ts, src/game/effects/LumenMoths.ts
- New: src/render/props/featureModels.ts (prop kinds haldenNote and hoistWinch, appended at the END of PROP_VARIANTS)
- New: tools/poi-density.ts, tools/world-tour.json; tests/unit/worldFeatures.test.ts, livingRock.test.ts, moths.test.ts, ropeRide.test.ts, runeDoor.test.ts, guidance.test.ts
- Hook edit: src/world/gen/generateWorld.ts, about 4 lines after section 13 and before the moment-to-moment pocket pass and the bedrock re-assert; plus an opts {features?: boolean} parameter
- Hook edit: src/world/gen/types.ts (optional WorldLayout.features, appended PropKinds, interact 'feature', PropSpec.feature)
- Hook edit: src/render/props/models.ts (append 2 kinds and their builders)
- Hook edit: src/world/analysis/reachability.ts (optional links parameter)
- Hook edit: src/game/Game.ts, about 25 lines (attach features, ride branch, update, interact/label cases, guide nodes, epoch on camp:entered, save/restore world.epoch, moths)
- Hook edit: src/game/Guidance.ts (parent-pointer tree, backward compatible constructor)
- Hook edit: src/save/types.ts + sanitizer (optional world: { epoch })
- Append-only: src/core/events.ts (world:*, moths:startled), src/i18n/en.ts (new block), src/config/balance.ts (MOTHS, RIDES), src/debug/DebugApi.ts (__DD__.features)
- Test edit: tests/unit/worldgen.test.ts (warm-lamp list gains hoistTop, hoistFoot, ropeTop, lastCamp; cap line only if concurrent lighting pushes it past 120)
- Not touched: materials, lighting rig, camera rig, mining rules, recipes/items (requested only), UI screens, audio voices, the moment-to-moment files (pockets, director, contracts, report, cache), the shrine (left for their rune lock)

## Needs from others
- Progression/economy: a sink for the new supply. The first clear adds about 20 glimmer; each later expedition about 20 iron, 14 copper, 2 crystal voxels and a 2-3 glimmer bloom. An iron-tier recipe is the obvious one.
- Progression/economy: optional key items bearerLens (reliquary) and firstLamp (gallery) with icons; without them the relics are discovery-only.
- Progression/economy: keep the copper lantern as lantern tier 2, because rune door 2 checks minLanternTier 2.
- Progression/economy: optionally extend the objective chain after goDeeper with reachRiftFloor (discovery undercroft) then touchStone (discovery monolith).
- UI: an optional label on showDiscovery so note.* banners read 'HALDEN LOG'.
- UI: optionally a progress ring on the interact chip while a rune door wakes.
- UI: keep listing every discovery.* entry that has text in the journal.
- Juice/audio: rope creak loop; hoist ratchet, release clank and whir; rune-door grind + chime; very quiet moth flutter; grotto shimmer bed; stone wake (deep tone + rising shimmer, violet flash, trauma 0.25); paper rustle. My fallbacks are existing voices re-pitched.
- Juice/character: a climb or hang pose for rides (fallback: idle facing the rope).
- Lens/camera: verify the 1x3 m squeeze, the 2x2 office door and the fast vertical hoist ride (no snap through the ledge); optional focusOn(point, hfov, seconds) API for the spyglass.
- Lighting: accept the +14 cyan/violet emitter allocation (target ≤117 at epoch 0; raise the cap to 130 only if the lighting work's own additions push the total past 120); review the rift floor under the rift preset and the yard's warm pool against the cool Hollow fill.
- Moment-to-moment: run the pocket pass after my feature pass and add features.pois with mustReach to its walked-path list.
- Moment-to-moment: include features.links in the HomeDistance BFS.
- Moment-to-moment: treat world:* events as notable moments in the cadence director.
- Moment-to-moment: use features.openDoor(id) for the C1 rune-lock vault (the shrine is left for them), and share one expedition counter (theirs or my world.epoch).
- Content (assets/events/ores): props oreCart (upright), stoneLamp (Lantern-bearer niche lamp) and desk, appended at the end of PROP_VARIANTS.
- Content (assets/events/ores): a fossil rock for sockets.fossil in the grotto.
- Content (assets/events/ores): new ore rows in config/livingRock.ts (e.g. a deep ore, 2 per epoch on riftWalls).
- Content (assets/events/ores): special events at features.eventSites (adit ceiling creak, rift-floor tremor, Glimmerfall surge at mid-bridge, yard headframe dust); supply crates may include my office, yard and last-camp crates.

## Acceptance
- tsc is clean and vitest is green (existing and new). routeWalk.test.ts is unchanged; worldgen.test.ts changes only in the documented warm-lamp list and the cap line.
- Containment: with generateWorld(seed, {features:false}) vs on, every pre-existing prop (id, kind, position) and every voxel outside features.boxes is identical.
- Reachability (barriers open: crumbling, hardened slate, rune doors, grotto plug; rope and hoist links on): every mustReach feature POI is reachable from spawn. The reliquary and gallery interiors are unreachable before their doors open. The rift floor is unreachable without the rope link. The balcony and rift floor stay sealed before the seal is mined.
- Spacing (tools/poi-density.ts): the max gap between fresh sights is ≤22 m on camp→ledge, ledge→stairs foot, seal→balcony, balcony→stone, stairs foot→reliquary, ledge→yard and yard→adit (today 51 / 36 / 40 / – / 34 / – / –).
- Spacing: the sight-or-ore gap is ≤20 m on camp→ledge and seal→balcony (today 25.7 / 18.8).
- Empty floor: reachable columns more than 10 m from any prop, structure, landmark or feature POI ≤20% (today 30%, prototype 18%); more than 15 m ≤200 columns (today 650, prototype 134).
- Beats: discoveries 6→≥11; found notes 0→4; secrets 1→≥3; shortcuts 0→1, with yard→camp ≥20% shorter via the hoist (prototype 27%).
- Replay over epochs 0-20: each living site changes ≥50% of its ore positions per epoch with exact counts; one new bloom per expedition at a site never repeated twice in a row; cyan/violet emitters ≤ cap at every epoch.
- Rides: the explorer AABB sweep has 0 solid hits, each ride is ≤7 s and ends with no fall damage; the hoist is chained until released from below, and that survives a save/reload.
- Rune doors open only after 1.2 s near them with a lit lantern (door 2 needs lantern tier 2); open state comes back after a save round-trip.
- Moths: 1 draw call, ≤0.15 ms per frame, never inside rock over a 60 s simulation, drawn to a lit lantern within ≤4 s, gathered at the secret anchors.
- Light budget: ≤+14 cyan/violet emitter voxels (target ≤117 at epoch 0); a warm lamp within 7 m of office, hoistTop, hoistFoot, ropeTop and lastCamp.
- Perf: generation +≤40 ms; light compute ±5%; regrowth ≤25 ms main thread per camp entry.
- Tour: tour shots f01-f15 are captured and every image is read. Each new place has one focal light and a readable silhouette, and nothing is a placeholder. Per shot: luma<12 ≤18%, 0% clipped, saturated cyan ≤3%, +≤12 draw calls and +≤15k triangles over the nearest existing tour shot.