# DEEP DOWN — Final Pass Plan (FINAL_PASS_PLAN.md)

Producer synthesis of the four final-pass audits (loop and progression, UI and brand, feel and juice, publish), 2026-10-19. Read it alongside GAME_DESIGN.md, ART_DIRECTION.md and TECHNICAL_ARCHITECTURE.md. Numbers marked *measured* come from the auditors' runs on the real generator and build: BFS over standable cells, SwiftShader captures at 915×412, probes on the packaged APK. Every other number is a target that a test or a capture has to prove.

---

## 0. Verdict

The slice has a beautiful route, but no loop, no identity, no payoff for a trip, and no build Play would accept.

- **The loop ends early.**
  - It runs out at minute 8 to 20 with "All objectives complete".
  - The 3 recipes cost 18 Cu, 28 St and 3 Gl in total. One 4-minute tunnel trip pays for all of them (*measured*: 33 sight-minable copper voxels in the tunnel).
- **Nothing is at risk.**
  - The 300 s lantern never threatens the longest round trip, which is 124 s.
  - An empty lantern costs nothing.
  - A black-out deletes the pack.
  - A 6-slot pack holds 180 copper, about the whole zone's supply.
- **The best area is locked away.** The rift floor (850 standable cells, the monolith, a 20 m clear air column under the balcony) is already built and unreachable.
- **The UI reads as a stock dark template.** The home page shows a "Visual Lab" button and "Vertical slice 0.1.0". The logo is a 5×7 pixel font.
- **Mining has no physical weight.**
  - The camera kick on a pick hit is 1e-5 rad, which is invisible.
  - Dust renders as glowing orange or cyan discs.
  - Footsteps land mid-swing.
  - The explorer floats on lit floors.
- **It cannot be published.**
  - The shell compiles against API 23, targets API 34 and builds an APK. Play needs an AAB targeting API 36.
  - An exception inside the frame loop freezes the game with no message (*measured*: 2,408 console errors in 3 s).
  - Saves have no world-generator version.

This pass ships **"One more trip"**:
- A 3–6 minute expedition loop. The lantern is the clock, and the dark is cold.
- Your pack waits where you fell.
- Every return pays out: a report, a record, an upgrade.
- The camp grows, and the Hollow regrows every night.
- Eight runes wake the monolith at about minute 55–70.

The game wears one identity, **"Lamplight on the Lintel"**, and every swing, step and pickup has weight. The work is built in **4 waves × 2 specialists**: 8 workstreams of about 4 h each, with file ownership that never overlaps inside a wave.

## 1. Pillars (sentences the player can repeat)

1. Trips are 3–6 minutes. The lantern is the clock; in the dark the cold hurts.
2. If you black out, your pack waits where you fell — once.
3. Every return home pays out: a report, a record, something new to build.
4. Every night the Hollow regrows, and the Survey Table hears of fresh seams.
5. Find the eight runes and wake the monolith.

Simplicity rules:
- The HUD has one hero number: lantern time.
- There is one "Next" line.
- There is one compass needle: camp, your pack, or a seam you picked.
- No currency, no XP, no levels, no menus inside menus.

---

## 2. Loop spec (single source of truth for W1–W3)

### 2.1 Materials

| id | rarity | source | drop | stack | first seen |
|---|---|---|---|---|---|
| stone | common | slate, umber, deep slate (gravel 50%) | 1 | 30 | min 0 |
| rootFibre (NEW) | common | cave soil (449 reachable voxels, *measured*; drops nothing today) | 1 at 45% | 20 | min 1 |
| copperOre | uncommon | copper veins | 1–2 | 15 | min 1 |
| ironOre | uncommon, tier 2 | iron veins (drop raised from 1 to 1–2) | 1–2 | 10 | ~min 8 |
| glimmerShard | rare | crystal 1–2, clusters 1–2 (shrine 2–3) | – | 10 | min 2 |
| echoShard (NEW) | rare, tier 3 | Echo crystal (block 34), rift clusters 2–3 | 1 | 5 | ~min 35 |
| 8 runes | relic | rune stones; key items, never lost | – | – | min 3 |

Check: a 4-minute Hall trip (~60 blocks: 35 St, 10 Cu, 6 Fe, 6 Gl, 4 Fi) fills exactly 6 slots, and fits 8 slots with 2 free. That is the "push on or go home" moment.

### 2.2 Pack, fuel, cold, cache

**Pack**
- Slots grow Tiny 6 → Sturdy 8 → Expedition 10.
- On the Expedition Pack, the last 2 slots are the **Sealed Pouch**; whatever is in it survives a black-out.
- Long-press Drop (SHOULD).
- Loose drops fade after 90 s and dim over the last 10 s (SHOULD).

**Lanterns**

| lantern | burn time | radius | other |
|---|---|---|---|
| Oil | 300 s | 11 | – |
| Copper | 600 s | 14.5 | – |
| Attuned | 900 s | 16 | ember 0.38 → 0.7; immune to the cold |

The low-fuel warning stays at 20%.

**Cold**
- Starts 8 s after the flame dies, then −10 hp every 5 s.
- From full health that is a black-out 58 s after the flame dies. With the Miner's Coat (140 hp, half damage) it is 148 s.
- Never at camp.
- Shown with a frost edge and a heartbeat.

**Walk-home field**
- D = BFS steps to camp over standable cells. Ride edges are added once built: winch 4 s, lift 3 s.
- walkHome = D × 1.35 / 4.6 s.
- Recompute on camp exit, every 25 mined blocks, and after a ride is built. Target ≤ 15 ms, done off-frame.

**Turn-back mark and compass**
- The lantern bar carries a mark at (walkHome × 1.25 + 10 s) of fuel.
- Crossing the mark, once per trip: "Turn back — about {s} s to camp", a chime and a haptic.
- At walkHome × 1.0 the bar pulses red.
- The compass follows the field's steepest descent 6 cells ahead and shows walking metres. This replaces the straight-line distance (Game.ts:990, *measured* 152 m shown against a 208 m walk at the balcony) and the guide polyline that stops at the stairs foot (Game.ts:169–172).

**Cache**
- **What goes in:** on a black-out, the pack minus the pouch, plus any loose drops, goes into one satchel prop with an ember glow.
- **Where it lands:** the last cell where the explorer stood grounded for ≥ 0.3 s that is also in the boot reachable set. A chasm fall leaves it at the brink.
- **One at a time:** a second black-out first destroys the old cache and says how many items were lost.
- **Pickup:** walk within 1.6 m and the items fly back; anything that doesn't fit stays.
- **Shown and saved:** compass marker "Your pack — 84 m". The cache is written in the same save as the death.
- **Abandoning:** the pause menu's "Return to Camp" means "leave your pack here as a cache".

### 2.3 Upgrade tree — 14 nodes

| # | id | place | cost | effect (behaviour sentence) | prereq | prio | built in |
|---|---|---|---|---|---|---|---|
| 1 | copperPickaxe | Workbench | 8 Cu 12 St | power 1.6, tier 2: breaks Hardened Slate and iron | – | MUST | W2 data |
| 2 | sturdyPack | Workbench | 16 St 4 Cu 4 Fi | 6 → 8 slots | – | MUST | W2 |
| 3 | copperLantern | Workbench | 6 Cu 3 Gl | 600 s, radius 14.5 | – | MUST | W2 |
| 4 | surveyTable | camp plot (37,101,48) | 12 St 4 Cu 2 Gl | records board; nightly seam rumours; pick a seam as the compass target | – | MUST | W2 prop, W3 rumours |
| 5 | forge | camp plot (42,101,33) | 24 St 6 Cu 3 Fe | opens Forge recipes; warm forge glow (LIGHT_EMBER) | 1 | MUST | W2 |
| 6 | relicShelf | camp plot (31,101,33) | free; appears with the first rune (the Ancient Tablet counts) | shows x/8 runes and lights each one | – | MUST | W2 |
| 7 | ironPickaxe | Forge | 8 Fe 6 Cu 10 St | power 2.4, tier 3, swing 0.40 s: breaks Echo crystal and Ironbound | 5 | MUST | W2 |
| 8 | expeditionPack | Forge | 6 Fe 8 Fi 10 St | 10 slots including the 2-slot Sealed Pouch | 2, 5 | MUST | W2 |
| 9 | riftWinch | field site on the balcony (≈133.5,25,124.5), paid from the pack | 6 Fe 10 Fi 2 Gl | 4 s ride down the clear column x 131, z 124 to (131.5,7,124.5): opens the Rift | 7 | MUST | W3 |
| 10 | attunedLantern | Forge | 8 Gl 3 Ec 4 Fe | 900 s, radius 16, ember 0.7, no cold | 3, 9 | MUST | W2 data |
| 11 | gripBoots | Workbench | 8 St 6 Fi 3 Cu | jump 1.14 → 2.1 m (jumpVelocity 10.1); safe fall 3.5 → 7 m (safeFallSpeed 18.3) | – | MUST | W2 incl. effect |
| 12 | minersCoat | Forge | 6 Fi 4 Fe | 5 → 7 hearts (maxHealth 140); cold damage halved | 5 | MUST | W2 incl. effect |
| 13 | glimmerPickaxe | Forge | 6 Gl 6 Fe 4 Ec | power 3.4, tier 4, swing 0.38 s; Vein Strike (also breaks 1–2 connected voxels of the same ore, 0.12 s apart) is a W4 SHOULD | 7, 9 | MUST (tier); Vein Strike SHOULD | W2 / W4 |
| 14 | haldenLift | field site at the stairs foot (≈122.5,42,104), paid from the pack | 8 Fe 4 Cu 16 St | 3 s ride between the stairs foot and the camp mouth; camp → balcony drops from 61 s to ~20 s | 5 | SHOULD | W3 |

**Budget**
- All 14 nodes: St 108 · Cu 41 · Fi 34 · Gl 21 · Fe 45 · Ec 7.
- Supply targets (sight-minable voxels × 1.5 average drop):
  - Cu ≈ 72.
  - Gl ≈ 50 including the rift.
  - Fe ≥ 1.3 × 45. That needs ≥ 40 sight-minable iron voxels after W2: gateIron 8 → 12, a new galleryIron box (x 139–151, z 98–103), 8 at the balcony, and riftIron 6 → 8. Today there are 21 (*measured*).
  - Ec: ≥ 12 voxels plus clusters.
  - Fi ≈ 200.
- MUST nodes are affordable with the Bloom off. The economy test enforces this.
- No node needs more than 2 trips' worth of one resource.
- Field-site costs fit in 3 pack slots, so carrying them to the site is itself a mini-mission.

**Rules**
- Camp nodes are paid from storage plus the pack.
- Field sites are paid from the pack only.
- Locked rows say why ("Build the Forge first").
- No node ships without its effect. If an effect is not finished, the node is removed.

### 2.4 Expedition, report, records

**Expedition**
- Runs from leaving camp until camp entry, black-out or abandon.
- Tracked: number, duration, deepest depth, items found, banked, lost or cached, damage taken, fuel at return, discoveries and runes.

**Expedition Report**
- **When it shows:** after a trip of ≥ 45 s, or when anything was banked, or after a discovery or rune. It opens only after the camp autosave, never over another open screen, and a tap skips it.
- **Header:** "Expedition 7 · 4:12".
- **Ledger:** Deepest, with a ★ / NEW BEST stamp; Time out; Blocks mined; Lantern left.
- **Banked:** item icons counting up over 0.6 s.
- **Found:** discoveries and runes.
- **Lost / Cached:** the black-out variant.
- **Overnight:** the Bloom result.
- **Next card:** the closest-to-affordable node, with its missing chips.
- **Buttons:** [Open Workbench] when something is craftable, otherwise [Head Out Again].

**Records**
- Tracked: deepest (max 144 m at the rift floor), biggest haul, expeditions, black-outs, best no-black-out streak.
- They only ever go up.
- Shown on the report, the Survey Table and the menu's Continue card.

### 2.5 The Bloom

**When it runs**
- Every completed expedition (camp entry after ≥ 60 s outside) is a new day.
- It is applied while the report is open: one batched setBlock pass and one light/mesh update.

**Regrowth**
- Applies only to cells where all of these hold:
  - the generated id was ore and the cell is now air;
  - in the generated world, the cell was a wall pocket (≥ 3 of its 6 generated neighbours solid);
  - it was mined ≥ 1 day ago;
  - it is ≥ 8 m from the player and the cache.
- Chance per day: Cu 25% · Fe 20% · Gl 15% · Ec 10%.
- It only restores the generated id, so it can never block a generated route.

**Seams**
- The generator computes `layout.seamSites` deterministically (from a forked rng): wall rock patches of 5–8 voxels next to reachable standable air, ≥ 10 m apart, each tagged with its area (tunnel, hall, beyond the seal, rift).
- 3 seams are active at a time, 4 once the rift is open.
- Ore weights by area:
  - tunnel: Cu 80 / Gl 20
  - hall: Cu 40 / Fe 30 / Gl 30
  - beyond the seal: Fe 70 / Gl 30
  - rift: Ec 50 / Gl 30 / Fe 20
- Rock always turns into ore, never air into ore.
- At most 2 glimmer seams of ≤ 5 voxels are active.
- A seam lasts 2 days or until 75% of it is mined.

**Rumours**
- Shown on the Survey Table (once it is built), in the report's Overnight section, and as a compass target: "An iron seam below the bridge — 38 m".

### 2.6 Runes and finale

| # | rune | where | gate |
|---|---|---|---|
| 1 | Descent | tunnel crystal pocket back wall (≈77,96,53), around minute 3 | – |
| 2 | Eye | ledge brink crags | – |
| 3 | Star | landing pylon recess, mid-stairs | – |
| 4 | Lantern | the existing Ancient Tablet in the shrine (item id `ancientTablet` kept for save compatibility) | crumbling wall |
| 5 | Spire | Spindle foot, by its lamp post | – |
| 6 | Gate | Ironbound niche off the corridor beyond the seal | tier 3 |
| 7 | Waves | Glimmerfall foot on the rift floor (113.5,8,128.5) | winch |
| 8 | Chasm | Ironbound niche in the rift wall | tier 3 + winch |

**Each rune**
- Is a key item, never lost.
- Adds a journal page with one short line. Mystery rules apply: show, don't explain; never state what glimmer is.
- Lights a socket on the Relic Shelf.

**Discoveries**
- 6 → 9: + The Rift, Echo Crystal, The Answer.
- 10 if the Halden Lift ships.

**Finale**
- At 8/8 the monolith niche turns from violet to cyan.
- Standing within 4 m shows "The Answer" (one line), once.
- Then the end card: "THE LANTERN HOLLOW — COMPLETE · Expeditions N · Deepest 144 m · h:mm · The Hollow keeps growing." [Continue].
- No promise of future content.
- After that, the Bloom and the records carry the post-game.

### 2.7 The Next line (objective pill)

The 6-step tutorial chain stays: mineStone, findCopper, returnToCamp, craftPickaxe, breakSeal, goDeeper. After it, the pill always shows one actionable line, in this priority:
1. A cache exists → "Recover your pack — 84 m".
2. The pack holds a field site's cost → "Carry it to the winch frame — 61 m".
3. The cheapest MUST node whose prereqs are met → "Next: Forge — Iron 1/3".
4. Runes < 8 → "Find the runes — 5/8".
5. A rumoured seam → "Fresh iron seam — 38 m".

The string `objective.done` is deleted. The pill is never empty and never says "done".

### 2.8 The first five minutes (target experience; the scripted tour tools/tours/first-five.json checks it at every wave close)

| t | the player sees | built by |
|---|---|---|
| 0–0.5 s | system splash (the emblem on #05080C), then the HTML boot mark breathing | W1-B, W2-B |
| ~1–5 s | the headline carves, the letters hang down, the lantern-O lights over a brass loading groove | W4-B |
| then | the veil lifts on the explorer at the ledge lip, lantern lit, looking into the Hollow; a Continue card or "Your first descent" | W4-B |
| 0:05 | New Expedition → camp at night; one hint at a time | existing + W4-B |
| 0:30 | tunnel lamps; Next: "Mine copper in the tunnel — 0/8" | existing chain |
| 1:00 | first copper: visible kick, sparks, grey dust, crack growth, the drop pops and arcs in, rising pickup notes, a haptic; Bag 1/6 | W4-A |
| 2:00 | crystal pocket: Glimmer Crystals (compact strip) and the Descent rune (1/8, journal page, the shelf appears at camp) | W3-A, W4-B |
| 3:00 | the lantern gauge shows m:ss and the HOME mark; the mark creeps closer the farther you go | W1-A, W4-B |
| 4:00 | camp: banked → the report counts up: "Expedition 1 · 3:52 · Deepest −58 m ★" · Next card: Copper Pickaxe — ready | W1-A, W3-B |
| 4:30 | Craft in the tree: the node lights, sparks run down the groove; Next: "Build the Survey Table" | W3-B, W2-A |

### 2.9 First-hour pacing (walk times *measured*: crystal pocket 16 s, ledge 27, stairs foot 44, seal 47, shrine 60, balcony 61)

| min | trip | goal | gets | built on return |
|---|---|---|---|---|
| 1–5 | E1 tunnel + pocket | 12 St, 8 Cu | ~20 St 10 Cu 4 Fi 3 Gl · Crystals · Descent | Copper Pickaxe · Relic Shelf |
| 5–10 | E2 ledge → hall → seal → balcony | break the seal | Hollow, Deep Gate · Eye · first full pack, first turn-back mark | Copper Lantern + Sturdy Pack |
| 10–15 | E3 hall, stairs, shrine | Table + Forge materials | Shrine, Tablet (Lantern), Star | Survey Table + Forge |
| 15–21 | E4 beyond the seal, iron gallery | 8 Fe | Spire | Iron Pickaxe |
| 21–27 | E5 Ironbound niche + iron | – | Gate | Expedition Pack · Grip Boots (· Halden Lift) |
| 27–34 | E6 balcony with the winch kit | build the winch, descend | The Rift · 144 m record | Miner's Coat |
| 34–42 | E7 rift | Echo | Echo Crystal · Waves | Attuned Lantern |
| 42–55 | E8–E9 rift + seams | Chasm | Ec, Fe | Glimmer-edged Pickaxe |
| 55–70 | E10+ | last rune | 8/8 | The Answer → end card; then the nightly Bloom |

Cadence targets: a node every 1–2 trips, a trip every 4–7 minutes, and a discovery or rune in each of the first 8 trips.

---

## 3. Identity spec — "Lamplight on the Lintel"

**Two registers** (they never mix):
- **Expedition kit** — everything the player owns or does: buttons, gauges, pack, tree, reports. Dark slate plates, oiled brass rims, amber light, ledger typography (dotted leaders, tabular numbers).
- **Builders' script** — only discoveries, lore, runes and the logo's O. Cyan ink carved in stone.

Violet means the unknown: locked entries, records, relics. Red means danger only.

**Shape and ornament**
- The octagon (45° chamfer) replaces every rounded rectangle and pill. `--cut` is 9 px for panels, 8 for buttons, 6 for chips and 4 for bar caps.
- The 1 px brass rim comes from layered backgrounds (clip-path clips outlines and shadows).
- Signature device: the **lintel**, a carved headline that things hang from. It is a 3 px groove (1 px #04070b over 1 px brass at 55%) with 2×7 px pendant ticks at both ends.
- Ledger rows: label · brass-700 dotted leader · tabular value.
- Focus ring: an amber-300 octagon drawn on ::after.
- No glassmorphism, no backdrop-filter, no neon (#5ff0ff is removed), no isometric cubes.

**Tokens** (CSS custom properties on `.dd-ui`, mirrored in `src/ui/brand/tokens.ts`)

| group | values |
|---|---|
| slate | 950 #070a0f · 900 #0c1118 (panel) · 800 #131a24 · 700 #1d2632 · 600 #2a3544 |
| bone (text) | 100 #efe7d8 · 300 #c9bfae · 500 #948b7d |
| brass | 300 #e2b673 · 500 #b0823f · 700 #5e4220 |
| amber | 300 #ffd29a · 400 #ffb35c · 500 #f39c45 · 700 #8a4f1c · ember #d8722a |
| rune cyan | 200 #8fe3ee · 400 #2fb6cc · 900 #072a33 |
| deep violet | 300 #b9a2ff |
| danger | 400 #ff6b5e · 700 #6a1712 |
| verdigris | 300 #8fc4a4 |
| rarity | common bone-300 · uncommon #e58444 · rare rune-200 · relic deep-300 |

Panel alpha is 0.94. Every text token is ≥ 4.5:1 on its surface (*measured* on #0c1118: bone-100 15.4, bone-300 10.4, bone-500 5.6, brass-300 10.1, rune-200 13.0, deep-300 8.7, danger-400 6.8, verdigris 9.6).

**Type**
- UI text uses the system stack. No font files.
- Display face **Lintel**, a procedural stroke face:
  - 4×7 unit grid, 1.0-unit strokes in 8 directions, chamfered corners;
  - covers A–Z, 0–9 and − . · / ? ';
  - built as filled polygons.
  - Used for the wordmark, title plates, discovery titles, depth numerals and report numbers.
- Scale: Display L 28 · Display M 22 · Title 17/700 · Body 15/500 · Label 13/700 tabular · Eyebrow 12/800 caps, 0.24em tracking · floor 12 px.
- Buttons use mixed case.

**Logo**
- DEEP DOWN, each word hanging from its own headline with pendant ticks.
- The O of DOWN is the builders' lantern rune: a diamond on a stem, in cyan ink (#8fe3ee → #2fb6cc), with an amber flame inside (#fff4dc → #ffc785 → #d8722a).
- Stone letters with a #04070b outline and a top-left highlight. The flame's warm light reaches D, W and N; DEEP stays cold.
- Lockups:
  - a landscape line (330–420 px);
  - a portrait stack (250 px);
  - the **emblem** (a lintel segment plus the hanging lantern) for the boot mark, favicon, launcher icon and splash;
  - an optional subtitle line, ready for the title decision (§11, trademark).
- Tagline: **"FOLLOW THE LIGHT DOWN"**.

**Motion**
- Durations: micro 90 · short 160 · medium 240 · exit 140 · long 480 · ceremony 900–1400 ms.
- An enter is an 8 px rise plus a fade; an exit is a fade only, and shorter than the enter.
- Only transform and opacity animate. At most one infinite loop on screen.
- Reduced motion means opacity fades of ≤ 150 ms only.

**Stable hooks** (they never change; e2e and ui-check depend on them)
- `.dd-pill` (text n/N), `.dd-compass`, `.dd-hearts .dd-heart.f2`, `.dd-lantern[role=meter]` aria-valuenow, `.dd-bar-fill`, `.dd-tb-bag`, `.dd-tb-pause`, `.dd-objective`, `.dd-discovery-title`, `.dd-target-name`, `.dd-perf`, `.dd-stick`, `.dd-jump`.
- `.dd-depth-value` keeps the text "-N m".
- data-keys `craft:{id}`, `respawn`, `resume`, `settings`, `camp`, `quit`, plus the new `summary-close`.

## 4. Feel spec

**Architecture**
- One module, `src/game/effects/Juice.ts`, subscribes to the EventBus and drives the systems that already exist: ParticleSystem, DebrisSystem, CameraRig, PostFX params, `src/ui/haptics.ts`, AudioSystem.
- No second particle or haptic system.

**Rules**
- Presentation never touches aim: `CameraRig.rayThrough` uses the un-shaken basis.
- Every amplitude is multiplied by `settings.cameraShake`.
- Under reduced motion: kicks are 0, flashes × 0.5; hit-stop stays.

**Budget**
- ≤ +0.3 ms CPU per frame and ≤ +2 draw calls.
- Every shader addition is branch-gated or behind a define that the Battery preset compiles out. The contact shadow is the exception and runs on all presets.

The exact numbers are in workstream W4-A.

## 5. Release spec (true at upload time)

**Required at upload**
- An AAB targeting and compiled against API 36, signed with the upload key and built by CI. The local `build-apk.sh` stays as the smoke-test APK path.
- The API-36 shell behaviours: predictive Back, edge-to-edge and cutouts, the game category, renderer-crash recovery, explicit lifecycle, volume keys.
- versionCode = (MAJOR·10000 + MINOR·100 + PATCH)·100 + BUILD, with 1.0.0 → 1000000.
- Adaptive icon (background, foreground, monochrome), a 512 px Play icon and the splash.
- A crash panel with Restart.
- Automatic low-end quality.
- The three.js MIT notice and a privacy statement, both bundled (and the privacy statement hosted).
- Honest store copy.

**Already true (*measured*)**
- Offline by construction: no INTERNET permission, 0 refused requests.
- APK size 399,281 B; web bundle ≈ 330 KB gzipped.
- Logo visible at 0.44–0.48 s; menu at 3.3–4.2 s in the simulation.
- Recovery after a WebGL context loss works.
- 75/75 save tests pass.

---

## 6. Rules for every agent in this pass

1. **Ownership.**
   - Edit only the files listed for your workstream, plus new files under your own paths. You may read anything.
   - If you need a change in a file you don't own, write the exact request in your report.
   - Two agents never edit one file in the same wave. The few hand-offs are listed in §7.
2. **Shared working tree.**
   - Keep `npx tsc --noEmit` passing at every save point.
   - While working, run vitest on your own files. Run the full suite before you report.
   - Run e2e only on your own port once W1 makes it configurable: agent A uses `DD_E2E_PORT=4173`, agent B uses 4174.
   - Never run two e2e jobs on the same port, and never run them during the other agent's capture runs.
3. **Commits and docs.**
   - Agents do not commit. The orchestrator commits at wave close.
   - CHANGELOG.md, PROJECT_STATUS.md, KNOWN_ISSUES.md, TEST_REPORT.md, GAME_DESIGN.md and TECHNICAL_ARCHITECTURE.md are written only at wave close, from the deltas in your report. Exceptions are named in your workstream.
4. **Text.**
   - All player-facing English lives in `src/i18n`.
   - `en.ts` stays the one table `t()` reads. It assembles the section files in `src/i18n/en/` (core, loop, world, release, brand, screens, hud, feel).
   - Edit only your own section. A unit test rejects duplicate keys.
5. **CSS.** New screens bring their own CSS file, imported by their TS module. Only the wave's owner edits `ui.css` and `styles.css`.
6. **Assets and packages.** Everything is procedural. No new packages, no external assets or fonts.
7. **No placeholders.**
   - A node, station, site, discovery or screen that is not finished is removed before wave close, never stubbed.
   - Internal scaffolding is allowed inside the pass only. Examples: the W1 interim cache prop, the W2 functional Workbench list, empty views returned before W3 data exists. Name it in your report; it must be replaced before the release gate.
8. **Preserve the working game.**
   - Every existing test stays green, unless a behaviour change is intended. Then you update the test in the same workstream; for example, world.spec "death loses the backpack" becomes "death leaves a cache".
   - Every hook in §3 stays.
9. **Round-4 lighting and lens.**
   - Do not change exposure, grade, the lantern model, LAMP_DIR, key lights or the camera framing constants.
   - A/B every shader or camera edit against the G1 tour baseline.
10. **Worldgen.**
    - New random draws come from a forked rng appended after the existing calls, so existing placements and ids do not move.
    - Once the first external build exists (from W1 close), every change to the world fingerprint bumps `WORLD.genVersion`.
11. **Never claim untested.**
    - Each acceptance line needs evidence: a test name, command output, or a screenshot path you actually read.
    - Phone feel, audio mix and real-device behaviour are labelled "unverified".

## 7. Contracts fixed by this plan

**Ids**

| kind | ids |
|---|---|
| materials | `stone`, `rootFibre`, `copperOre`, `ironOre`, `glimmerShard`, `echoShard` |
| key items | `ancientTablet` (the Lantern rune), `runeDescent`, `runeEye`, `runeStar`, `runeSpire`, `runeGate`, `runeWaves`, `runeChasm` |
| blocks | `ECHO_CRYSTAL = 34` (tier 3, hardness 6, crystal tile tinted pale cyan-white, glow in the shader only, zero light-volume emission); `IRONBOUND = 35` (tier 3, hardness 12, seal-stone look with a rune band) |
| nodes | the 14 ids in §2.3; `RecipeId` becomes an alias of `NodeId` |
| places | `workbench`, `forge`, `camp`, `field` |

**Seams (created in W1)**
- `src/game/Progression.ts`: `update(dt)`, `onCampEntered()`, `onCampLeft()`, `onBlackout()`, `onAbandon()`, `interact(spec)`, `interactLabel(spec)`, `hud(out)`, views, `toSave()`, `fromSave()`. Game.ts delegates to it, so W2 and W3 extend Progression, not Game.
- `src/game/MenuCamera.ts`: the menu camera pose, the explorer's menu pose with the lantern lit, and a 30 fps menu cap.
- `src/version.ts`: VERSION, BUILD and VERSION_CODE from a vite define.
- The window event `dd:crash` (detail: the error).
- `window.deepDownLifecycle('pause'|'resume')`.
- `DeepDownAndroid.setBackHandled(bool)`.

**Events** (in `src/core/events.ts`)
- `expedition:started {n}`
- `expedition:ended {report}`
- `cache:created {x,y,z,count,replaced}`
- `cache:recovered {count,left}`
- `lantern:turnBack {seconds}`
- `player:cold {damage}`
- `record:depth {depth}`
- `station:built {id,x,y,z}`
- `ride:started {id}` and `ride:ended {id}`
- `relic:found {id,count,total}`
- `finale:reached {}`
- `bloom:applied {day,regrown,seams}`
- `item:picked` gains an optional `{sx,sy}`: the drop's point on screen, 0–1.
- `DiscoveryNotice` gains `{index,total,major}`. Major discoveries are hollow, shrine, gate, rift and answer.

**HudState additions (W1)**
- `fuelSeconds`, `fuelCapacity`
- `homeSeconds` (null at camp), `turnBackFraction` (null at camp)
- `fuelState`: ok | tight | critical | empty
- `cold`: 0..1
- `compass {kind: camp|cache|seam|site, bearing, distance}` in walking metres. `campBearing` and `campDistance` keep mirroring the primary target for compatibility.
- `objectiveText`, which now carries the Next line
- `bestDepth`, `newBest`, `packFull`, `pouchSlots`

**UiActions and views**

| when | additions |
|---|---|
| W1 | `getSaveSummary()`, `getReport()`, `dismissReport()` |
| W2 | `craft(NodeId)`, `getCraftTree()`, `openCrafting(place)`, `openBoard()`, `getSurvey()`, `setCompassTarget(t)`, `openJournal()`, `getJournal()`, `openAbout()`, `continueAfterEnding()`, `dropStack(slot)` |
| W2 view types | `CraftTreeView`, `ExpeditionReport`, `SurveyView`, `JournalView`, `SaveSummary` (plus sandbox fixtures for each) |
| ScreenIds | + `summary`, `board`, `journal`, `ending`, `about` |

The UI opens the summary on `expedition:ended` and the ending on `finale:reached` by subscribing to the bus. No Game.ts change is needed for that.

**Save v2**
- `version` 2, `genVersion`.
- `progression {day, expeditions, trip, records, cache, stations[], gear[], relics[], seams[], minedDay, hintsShown[], finale, compassTarget}`.
- Fields added after W1 are optional with defaults filled by normalize, with no version bump.
- v2 is frozen as the 1.0 format at W3 close. Every change after that needs a migration and a test.

**Shared data moved in W2.** The rune glyph data moves from `render/textures.ts` (private `RUNES`) to `src/config/runes.ts`. From then on the renderer, the rune props and the UI all read it from there.

**Hand-offs**
- W1-A creates the empty section stubs `src/i18n/en/{release,brand,world,screens,hud,feel}.ts` in its first 20 minutes. From then on each stub belongs to its stream; W1-B owns `release.ts`.
- W1-B creates `src/version.ts` in its first 10 minutes. W1-A imports it.

## 8. Gates and wave close

**G0 (now, before W1)**
- Task #39 ("fun & variety: world variety, play variety, content") stops. Its intent (ores, variety, renewal) is folded into W2/W3: Echo, iron gallery, Bloom, seams, rift. Whatever it already changed is committed or reverted. This avoids duplicate systems.
- W1 does not touch:
  - the round-4 files: lighting.ts, PostFX.ts, Renderer.ts, entityMaterial.ts, terrainMaterial.ts, CameraRig.ts, `src/lab/**`;
  - generateWorld.ts and worldgen.test.ts (task #30, warm practicals);
  - TouchControls.ts, aimAssist.ts and haptics.ts (task #40).

**G1 (before W2)**
- Round-4 wave 2 (lighting and lens) is committed and green: tsc, vitest, e2e.
- Its tour frames are captured as the A/B baseline in `artifacts/final-pass/baseline/`.
- The world fingerprint is re-recorded on that commit.

**G3 (before W4)** Task #40 (mobile controls) is committed: TouchControls, aimAssist, haptics.

**Wave close** (orchestrator, every wave)
1. Collect both reports with their evidence.
2. Run one verification:
   - `npx tsc --noEmit`
   - `npx vitest run`
   - one e2e run
   - `node tools/ui-check.mjs --game`
   - `./android/build-apk.sh` then `node tools/apk-sim.mjs` (from W1 on)
   - `node tools/play.mjs tools/tours/first-five.json`, with the screenshots actually read
3. Fix anything red before the next wave starts.
4. Update the docs from the agents' deltas.
5. Commit "Final pass W<n>: …".
6. If a MUST slipped, move it to the next wave's owner of those files and cut a SHOULD to make room.

---

## 9. Waves

| wave | agent A (owns Game.ts) | agent B |
|---|---|---|
| **W1** | **Loop core:** materials and stacks, pouch, cold, walk-home field + turn-back + compass, cache, trip and records, save v2 + genVersion, Progression and MenuCamera seams, crash guard | **Release infrastructure:** version source, Gradle + CI AAB (API 36), API-36 shell, adaptive icon and splash pipeline, crash panel, quality governor, licences and privacy, release checklist |
| **W2** | **Tree and camp:** 14 nodes, Crafting with places and prereqs, camp stations rising in place, iron economy, Echo and Ironbound blocks, gear effects, Next line, economy test | **Brand identity:** tokens, octagon and lintel restyle, Lintel wordmark and emblem, boot mark, specimen icons, launcher art, Visual Lab hidden, exit transitions |
| **W3** | **Rift, runes, Bloom:** winch ride, rift content, 8 runes + shelf + finale, regrowth + seams + rumours, v2 freeze | **Progression screens:** upgrade tree, Expedition Report, Survey board, Journal collection, ending card, About / Licences |
| **W4** | **Feel:** kick and hit-stop without aim drift, dust and sparks, footsteps on the feet, landing weight, pickup pop and pitch ladder, lantern impulses, contact shadow, haptics | **Home, opening, HUD:** hero home screen + Continue card, carve-in opening, lantern gauge with the HOME mark, pause and death, toasts and banner |

### W1-A — Loop core (owns Game.ts)
- **Goal:** every trip becomes a risk/reward decision, progress becomes durable, and later waves get the seams they need to work in parallel.
- **Owns:**
  - `src/game/{Game,Guidance,WorldSession,Drops,GameUi}.ts`, new `src/game/{Progression,MenuCamera}.ts`
  - `src/gameplay/**`, new `src/gameplay/{Cold,Records}.ts`
  - `src/world/analysis/**`, new `homeField.ts`
  - `src/config/{items,balance,blocks}.ts`, `src/core/events.ts`
  - `src/save/{types,saveData,SaveSystem,worldDelta}.ts`
  - `src/ui/types.ts`, `src/ui/hud/Hud.ts`, `src/ui/screens/inventory.ts`, `src/ui/screens/menu.ts` (only the death and pause text paths), `src/ui/dev/sandbox.ts`
  - `src/debug/DebugApi.ts`
  - `src/i18n/{en,index}.ts`, `src/i18n/en/{core,loop}.ts`
  - tests: gameplay-*, save-*, session, new cold / homeField / cache / records / genVersion / menuCamera / i18n tests; e2e world, slice, desktop and dd.ts
- **Tasks and acceptance:** listed in the workstream entry.
- **Effort:** 4–4.5 h. Cut order: drop fade → HUD tick styling → compass gradient (fall back to field distance with a straight bearing).

### W1-B — Release infrastructure
- **Owns:**
  - `android/**` (incl. `make-icon.mjs`, `build-apk.sh`, new Gradle files and the Gradle manifest overlay)
  - `/home/user/readme-roast/.github/workflows/deep-down-android.yml`
  - `package.json` (the version field only)
  - `tools/{version,icon-masks}.mjs` (new), `tools/apk-sim.mjs`, `tools/tours/first-five.json` (new)
  - `vite.config.ts`, `playwright.config.ts`
  - `src/main.ts`, `src/version.ts` (new), `src/render/QualityGovernor.ts` (new), `src/ui/styles.css`, `src/i18n/en/release.ts`
  - `docs/{release-checklist,store-listing,device-test-protocol,ios-plan}.md`
  - tests: version and governor unit tests; e2e `release.spec.ts`
- **Effort:** 4–4.5 h. Cut order: ios-plan → context-loss notice → icon-masks tool → store-listing polish.

### W2-A — Tree and camp stations (owns Game.ts)
- **Owns:**
  - `src/config/{recipes,balance,items,blocks,tiles}.ts`, new `src/config/runes.ts`, `src/render/textures.ts` (only for the RUNES move)
  - `src/gameplay/{Crafting,Equipment,Objectives,Expedition,Records,Health}.ts`, new `NextStep.ts`
  - `src/game/{Game,Progression,WorldSession,PlayerController}.ts`, `src/core/events.ts`
  - `src/world/gen/{generateWorld,types,architecture}.ts`
  - `src/render/props/{models,PropRenderer,shapes,palette}.ts`
  - `src/render/terrainMaterial.ts` and `src/render/materials/{minerals,index}.ts` (additive changes for blocks 34/35 only)
  - `src/save/{types,saveData}.ts`, `src/ui/types.ts`, `src/ui/screens/inventory.ts`, `src/ui/dev/sandbox.ts`, `src/debug/DebugApi.ts`
  - `src/i18n/en/{loop,world}.ts`
  - tests: crafting, worldgen, props, genVersion, terrainMaterials, camera, new economy and stations tests; e2e new `progression.spec.ts`, slice and dd.ts
- **Effort:** 4–4.5 h. Cut order: stake-sign text → rise dust → Survey Table opens records only.

### W2-B — Brand identity
- **Owns:**
  - `src/ui/{styles.css,ui.css,UI.ts,icons.ts,sprites.ts,notices.ts}`; deletes `src/ui/pixelFont.ts`
  - new `src/ui/brand/**`, `src/ui/hud/hearts.ts`, `src/ui/screens/{menu,settings,widgets,host}.ts`
  - `index.html`, `android/make-icon.mjs`, `vite.config.ts`
  - `src/i18n/en/{brand,core}.ts`
  - tests: ui and new brand unit tests
  - `ART_DIRECTION.md` (the UI section)
- **Effort:** about 4 h. Cut order: motion/veil (moves to W4-B) → ART_DIRECTION section → subtitle lockup.

### W3-A — Rift, runes, Bloom (owns Game.ts)
- **Owns:**
  - `src/game/{Game,Progression,WorldSession,PlayerController,Guidance}.ts`
  - `src/gameplay/{Journal,NextStep,Expedition,Crafting}.ts`, new `Bloom.ts`
  - `src/core/events.ts`, `src/world/gen/{generateWorld,types}.ts`, `src/world/analysis/**`
  - `src/render/props/{models,PropRenderer,monolith,shapes}.ts`
  - `src/config/{balance,blocks,items,recipes}.ts`, `src/save/**` (except settings.ts), `src/debug/DebugApi.ts`
  - `src/i18n/en/{world,loop}.ts`
  - tests: worldgen, genVersion, economy, camera, props, new bloom / rift / runes tests; e2e progression, world and dd.ts
- **Effort:** 4–4.5 h. Cut order: Halden Lift → seam glint → rumours show distance only.

### W3-B — Progression screens
- **Owns:**
  - `src/ui/UI.ts`, `src/ui/types.ts`
  - new `src/ui/screens/{workbench,summary,board,journal,ending,about}.ts` with their `.css`
  - `src/ui/screens/{inventory,settings,widgets,host}.ts`, `src/ui/dev/sandbox.ts`, `tools/ui-check.mjs`
  - `src/i18n/en/{screens,core}.ts`
  - tests: ui and new ui-screens unit tests; e2e `slice.spec.ts`
- **Effort:** 4–4.5 h. Cut order: Drop and pouch restyle → groove sparks → stat bars.

### W4-A — Feel (owns Game.ts)
- **Owns:**
  - `src/game/{Game,CameraRig,MiningController,Drops,PlayerController}.ts`
  - `src/game/effects/{Particles,Debris,TargetMarker}.ts`, new `Juice.ts`
  - `src/entities/character/**`
  - `src/render/{terrainMaterial,terrainRig,PostFX,entityMaterial}.ts`, `src/render/structures/structureMaterial.ts`
  - `src/audio/{sfx,eventMap,AudioSystem}.ts`, `src/ui/haptics.ts`
  - `src/config/blocks.ts`, `src/core/events.ts`
  - `src/save/{types,settings}.ts` and `src/ui/screens/settings.ts` (only for the SHOULD "Reduce flashes")
  - `src/i18n/en/feel.ts`
  - tests: camera, character, audio, audioSystem, player, gameplay-mining, new juice and haptics tests; e2e desktop, world and dd.ts
- **Effort:** 4–4.5 h. Cut order: lantern shadow S2 → body reactions → screen FX → Vein Strike.

### W4-B — Home, opening, HUD
- **Owns:**
  - `src/game/MenuCamera.ts`
  - `src/ui/{UI.ts,types.ts,notices.ts,TouchControls.ts,ui.css,styles.css}`, `src/ui/screens/menu.ts`, `src/ui/hud/{Hud,hearts}.ts`, `src/ui/brand/**`
  - `index.html`, `src/ui/dev/sandbox.ts`, `tools/ui-check.mjs`
  - `src/i18n/en/{hud,core}.ts`
  - tests: ui and new hud unit tests; e2e `slice.spec.ts`
- **Effort:** about 4 h. Cut order: coach marks → fly-to → portrait pose falls back to the cropped landscape pose.

Each workstream's full task list (MUST first, then SHOULD) and its acceptance criteria are in the workstream entries delivered with this plan. They are the contract each specialist works to.

---

## 10. Cut (not in this pass)

- **Contracts board** (HAUL / DEPTH / EMBER / CLEAN / SEAM / RESCUE): post-launch. The Survey Table carries records and seam rumours instead.
- **Four tree nodes:** Prospector's Lens, Beacon Kit, Delver's Pack, Surveyor's Compass.
- **Systems:**
  - the specialization choice;
  - generic ropes, grapnel and a climb mode;
  - rebreather, gas, electrical hazards and creatures;
  - currency, XP and levels.
- **More world:** a deeper procedural layer or a second zone (there is no room under the rift: floor y 5–6, bedrock y 0); Halden supply crates and logs; rockfall.
- **Juice extras:**
  - lumen moths;
  - visible drips and rumble dust;
  - crystals answering the lantern;
  - the signature shaders (crystal glitter, heat shimmer, Glimmerfall caustics, lamp breathing);
  - props as occluders in the LanternField;
  - the pick trail, idle variations, low-fuel nerves.
  - The explorer's lantern shadow S2 survives only as a W4 COULD.
- **UI extras:** the lantern-iris transition; Extra-large text; a native haptics bridge; hold-to-craft (tap-to-craft keeps the keyboard and e2e paths simple). Coach marks are a W4 SHOULD only.
- **Platform extras:** a native save mirror; audio-focus handling beyond `setVolumeControlStream`; the IndexedDB material-layer cache; the iOS wrapper (a plan document only).
- **Store screenshots and feature graphic:** moved to the release gate (task #38), captured on an idle machine after W4.
- **Removed from the shipped build:**
  - the Visual Lab button on the home page (kept behind `?dev=1`) and the "Vertical slice" label;
  - `objective.done`;
  - death and abandon deleting the pack;
  - the 10-slot Sturdy Pack;
  - `pixelFont.ts` and the voxel-cube item icons;
  - "brick" and "Glowmoss" in player text.

## 11. Risks and mitigations

1. **Capacity.** Eight streams of about 4 h, each with a heavy MUST core.
   - Every stream has a cut order.
   - An unfinished node, site or discovery is removed, never stubbed.
   - Wave close re-plans when a MUST slips.
2. **Shared tree and the Game.ts hub.**
   - One owner per file per wave.
   - The W1 seams (Progression, MenuCamera, i18n sections, version.ts, `dd:crash`).
   - The contracts frozen in §7.
   - Only the orchestrator commits.
3. **Round-4 work landing at the same time.** W1 avoids those files, G1 gates W2, and every later shader or camera edit is A/B'd against the G1 baseline.
4. **Save and world compatibility.** Closed-test saves exist from W1 on.
   - Defences: genVersion with a fingerprint test, a normalize step that drops unknown ids instead of rejecting the save, the v1 → v2 migration with stack overflow moved into storage, and the v2 freeze at W3.
   - Cost: mined tunnels are lost after a world change; a toast explains it.
5. **Balance is proven only in simulation.**
   - Cold deaths may feel unfair, or the tree may feel grindy.
   - Mitigations: the turn-back mark at walkHome × 1.25 + 10 s, the 8 s grace, the cache, the economy test, the first-five tour, and every number in balance.ts.
   - A human plays the first hour before release.
6. **Phone performance is unmeasured** (GPU frame time, thermals, 3 GB devices). Mitigations: a downshift-only governor, the Battery preset, a cheap and gated contact shadow, and the director's device protocol.
7. **The Play AAB cannot be built in this container** (dl.google.com returns 403).
   - Gradle and CI stay unverified until the first CI run.
   - `build-apk.sh` stays as the smoke path.
   - API-36 behaviours (predictive Back, edge-to-edge) can only be checked on a device.
8. **Trademark.** Capcom has repeatedly renewed a "Deep Down" registration. The wordmark has a subtitle lockup ready; the title is decided before the listing exists.
9. **The closed-test gate** (12 testers × 14 days for personal accounts) is the calendar long pole. Upload the internal and closed tracks right after the first W1 AAB.
10. **The CSS overhaul.** clip-path clips focus rings and glows, and Large text can clip. Mitigation: ui-check must report zero problems in every variant, and the hooks don't change.
11. **The cyan budget and the "amber = people" rule.** Echo glows in the shader only, at most 2 glimmer seams are active, the emission test (≤ 120; 103 today) must pass, and the forge glow is warm.
12. **The Bloom's setBlock batch** (light and mesh updates) can spike on phones. It runs behind the report and is measured.
13. **Mystery tone.** Rune lines and the finale must show, not explain, and never state what glimmer is. They are reviewed at wave close.
14. **Grip Boots** can open sequence breaks or camera clipping. Reachability and the camera fuzz are re-run with the boots.
15. **SwiftShader slowness** makes apk-sim and captures time out under load. Timeouts are raised and captures run on an idle machine.
16. **Feel can't be measured here.** Haptics, kick strength and the audio mix stay labelled "unverified" until a phone and human ears check them.
17. **Legal.** The copyright line (korroai vs KORROCORP), the game's licence and the support email are the director's decisions. The About screen shows only what has been decided, never a placeholder email.

## 12. Director-only tasks (start now; none can be done from code)

1. **Account.**
   - Pick the Play account type. An organization account (D-U-N-S number) skips the 12 testers × 14 days gate. A personal account needs 15–20 testers who stay opted in for 14 continuous days.
   - Pay the $25 registration and complete identity verification.
2. **Trademark and title.**
   - Search USPTO and EUIPO for "Deep Down" in classes 9 and 41, before the listing exists.
   - Decide the title. "DEEP DOWN: Lantern Hollow" is the candidate.
3. **Upload key and secrets.**
   - Create the upload key on your own machine (keytool, PKCS12, RSA 4096, ≥ 25 years validity).
   - Keep it in a password manager plus an offline backup; never in git or chat.
   - Add the GitHub secrets `DD_UPLOAD_KEYSTORE_B64`, `DD_UPLOAD_STORE_PASSWORD`, `DD_UPLOAD_KEY_ALIAS`, `DD_UPLOAD_KEY_PASSWORD`.
   - Enrol in Play App Signing.
4. **After W1.** Run the CI workflow, upload the AAB to internal testing, read the pre-launch report, and start the closed test as early as your account type requires.
5. **Confirm:**
   - the package name `com.korroai.deepdown` (permanent after the first upload);
   - the legal entity and copyright line;
   - the game's licence (MIT as today, or "all rights reserved");
   - a support email.
6. **Listing forms.**
   - Host `privacy.html` publicly (for example with GitHub Pages).
   - Content rating (expected PEGI 3 / ESRB E).
   - Data safety: no data collected.
   - Ads: no. Target audience: 13+.
7. **Device runs.** Use one 2022 mid-range phone (Adreno 642L or Mali-G68 class) and one 3 GB phone (Adreno 610 or Mali-G52 class), following `docs/device-test-protocol.md`. Listen to the mix and feel the haptics.

## 13. Release gate after W4 (task #38; not a workstream here)

1. Full checks: tsc, vitest, e2e, `ui-check --game`, and apk-sim passing 3 out of 3 runs.
2. Re-measure `tools/perf.mjs` on the final build and re-date every TEST_REPORT number. The current table is stale: the camp is now 124 draws / 88,689 triangles / 58 MB heap, against the reported 62 / 21k / 40 MB.
3. Write and run `tools/store-assets.mjs` on an idle machine:
   - 6–8 screenshots at 1920×1080 (aspect ≤ 2:1);
   - a 1024×500 feature graphic without alpha;
   - the 512 px icon.
4. A truthfulness pass over the docs.
5. A critic review of the first five minutes, the report → craft loop and the finale.
6. The AAB from CI, the director's device protocol, and a pre-launch report with 0 crashes.

**Publish-ready means:**
- every MUST acceptance line is green, with evidence;
- no developer or prototype label is visible to the player;
- nothing is a placeholder;
- the AAB comes from CI;
- the device results are recorded.
