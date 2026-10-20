# DEEP DOWN: the vertical descent (SPEC)

**Status.** This is the single source of truth for the new DEEP DOWN. It merges the eight designs in `docs/idle/designs/`
(`economy`, `endless`, `wonder`, `visual`, `feel`, `loops`, `progression`, `motion`) into one game. When a design and this
document disagree, this document wins. When this document is silent, the build team asks the lead; it does not fall back to
a design file. `BUILD.md` (same folder) is the plan that builds it.

**What the game is.** DEEP DOWN becomes a portrait, one-thumb, vertical-descent idle clicker. The screen is a lit cutaway of the
earth. You tap the floor of a shaft, cells crack and burst, gold flies into the counter, a crew digs with you (and while you are
away), and every few minutes the shaft breaks into a new biome. It never ends: the rock has no bottom, the numbers have no
ceiling, and three prestige layers keep the descent getting faster.

**What is reused.** The voxel engine (VoxelWorld, mesher, mesh workers, ChunkRenderer), the LightField and LanternField, the
terrain material system and painters, StructureRenderer and PropRenderer, Halos, LumenMoths, Waterfall, PostFX and the
QualityGovernor, the synth audio and MusicScheduler, haptics, the "Lamplight on the Lintel" brand (tokens, the Lintel face,
wordmark, emblem, sprites), the two-slot SaveSystem, FrameGuard, the release shell in `src/main.ts`, the Android shell and the
release tooling.

**What is replaced and deleted.** The authored zone and its generator, the third-person camera, the player controller, the
joystick and look drag, free walking, the expedition and crafting game, and their screens and tests. Nothing of the old game
remains as a second mode.

Units: CSS px unless marked "device px"; times at 60 Hz; depth in metres (1 row = 1 m); "gold" values in display units.

---

## 0. The director's demands, and where each one is met

| Demand | How it is met (and the test that proves it) | Sections |
|---|---|---|
| Truly addictive; never bored | Six reward clocks run at once (strike 0.25 s, break 0.3–2 s, purchase 0.5–5 s, ★ 10–60 s, event 40–70 s, biome 3–10 min). A new mechanic at least every 4 min for 40 min. A minor beat at least every 70 s while tapping. Every run differs (facets, mutators, challenges). E5, E17, E23 | 2, 5.10, 7 |
| Ultra simple: one thumb, portrait, no joystick | Taps only. A tap anywhere in the world digs the column under the thumb and can never miss. Every control except the top-bar plates and the goal bar sits in the bottom 45 % of the screen. No drag, no pinch, no camera control. F2, F3, U4 | 3, 9 |
| Punchy and fast (nerveux), thrilling (palpitant) | Impact in the same frame. 2–5 taps per cell, a row every 1.4–3.6 s in the first run. Seal fights against a 30 s timer, Lantern Surge, Cataclysm, chest roll-ups, crits and chain breaks. F1, E6 | 3, 7.1, 10 |
| Endless and evolving; upgrades up to démesure | HP grows forever, numbers go to 1e2091 with letters and beyond in scientific notation, 15 crew lines then an Echo line every 1,100 m, pick tiers forever (a 7 m Void Cleaver, then Lantern Edge I, II…), Echo strata with mutators, three prestige layers, endless Feat tiers and ranks | 3.3, 5, 6.5 |
| Many more things to do; varied loops | Tap, buy, hire, skills, Surge, seals and wardens, 11 events with 5 mini-game widgets, chests, contracts, Codex, Feats, rank, facets, Rekindle, Weave, Breach challenges, daily chest and calendar, records and the ghost race | 2, 7 |
| Guided tutorial; objective always shown; nothing unexplained | A 3-minute scripted tutorial taught by doing. One goal bar is on screen in every frame of play. Every new system shows a one-line first-time card. Locked items say when they unlock. G1, G2, G5 | 8 |
| Caverns never empty; wonder and discovery | A hard fill contract checked by a generator test on every slab: alcoves every 6–8 m, a grotto every 25–40 m, a Vista per biome, a tappable always in view. The next 5–6 rows of the cut face show what is coming. The Other Lantern glows below, always out of reach. W1, W2 | 6.6, 6.7, 7.8 |
| Big visual upgrade: beautiful, HD, polished | A drawn geological section, 14 biome looks with LUT grades, HD material layers (32 texels/m), a native-resolution composite with CAS, vista backdrops, GPU particles, shards, light cones, a light budget that grows with depth. V1–V10 | 11 |
| A real feeling of progression, improved in depth | The goal bar is always nearly full, the BEST card fills as coins land, ★ every 10 levels, crowns every 50, pick tiers every 25, gear per biome, a rank that never resets, a Ladder map with the next three rewards, ghost race and planted lanterns, prestige that visibly speeds the next run. E8, E12, E19 | 5, 7.7, 8.4 |
| An addictive upgrade mechanic | Cards that are their own progress bars, a 10-pip ring per card, NEXT ★ buy mode, hold-to-buy with a rising arpeggio, BEST badge, one-shot gear, facets with set bonuses | 5.4, 5.5, 5.10 |
| Achievements | Feats: 20 families with tiers I–X then endless, 12 secret feats, each tier a permanent +1 % | 7.6 |
| Better UI with real, high-quality animation and effects | A response ladder T0–T5, springs, odometer counters, loot that travels to its counter, card states, ceremonies with timelines, motion levels | 10 |
| It triggers dopamine while you play | The timing of the next reward is always shown, its size is a surprise (crits, cell kinds, chest roll-ups, facet rarities), and the payoff arrives through at least three channels in the frame it is earned | 2, 10 |

### 0.1 The laws (each one has a test in §13)

| # | Law | Hard number |
|---|---|---|
| L1 | **Impact first.** The frame after `pointerdown` shows the hit. Nothing winds up before damage. | input → first changed frame ≤ 1 frame |
| L2 | **No tap is wasted.** Every point of the world region resolves to a target. | 0 misses in 1,000 random taps |
| L3 | **A cell breaks fast while the run is lively.** | taps per cell p50 ≤ 4, p90 ≤ 7 in the first 45 min |
| L4 | **Something completes at most every 30 s** in the first 30 minutes (purchase, chest, biome, event, contract, Feat). | longest gap ≤ 30 s |
| L5 | **The goal on screen is at least 15 % done and at most 90 s away**, or it is the 20 m fallback. | 100 % of 0.5 s samples |
| L6 | **Harder rock is richer rock.** Gold per cell = HP / 100 × kind multiplier, so income depends only on damage dealt. Offline progress is an exact closed form. | closed form within 1e-6 m of a stepped sim |
| L7 | **A recommended reset always pays.** After a recommended Rekindle the next run passes the old record within max(10 min of active play, 40 % of the previous run). | sim |
| L8 | **Gains travel.** Every gain flies from where it was earned to its counter, and the counter changes when it arrives. Counters roll, never jump. | ratio ≤ 1.5 per frame |
| L9 | **The more frequent, the smaller.** Every effect belongs to one tier of the response ladder (§10.2) and stays inside its caps. | trauma ≤ 0.06 for anything faster than 1/s |
| L10 | **First sight is the player's.** The crew never opens a seal offline; biomes are revealed with the player watching. | 0 offline seal crossings |
| L11 | **No punishment, no store.** Nothing is lost on failure or absence. Missed days pause streaks. No ads, no purchases, no network. | static scan + request log empty |
| L12 | **Respect.** Three motion levels, a flash setting, a shake slider. At most 2 full-screen flashes a second, never red. | unit test on the cue budget |

---

## 1. Decisions: how the eight designs were merged

| Question | Options in the designs | Decision | Why |
|---|---|---|---|
| Economy backbone | `economy` (7-day calibrated, 3 prestige layers), `endless` (40 days, worlds), `progression` (HP derived from a target curve), `loops`, `motion`, `feel`, `visual`, `wonder` (uncalibrated beyond day 1) | **`economy`'s curves, cell mix, crew ladder, gear, skills and prestige**, with the depth axis scaled ×2 | It is the only model proven stable over 7 days (no Rekindle chains, a new biome every day). The ×2 depth scale (slopes square-rooted, every depth doubled) was re-run in the same model (§5.12): it halves taps per cell (5.7 → 3.2) and row time with the same minute-by-minute pacing |
| Prestige layers | Rekindle + Weave + Breach (`economy`); Rekindle + Collapse + Ascend worlds (`endless`); Rekindle + Lintel Rite (`progression`); Ascension + Starfall (`loops`); Rekindle + Starfall (`feel`) | **Rekindle (Embers) → Weave (Threads) → Breach (Sigils, endless challenge tiers)** | Calibrated; Breach provides the long tail with rule variety (the role `endless` gave to Trials). Worlds and planets are cut for scope |
| Depth of each biome | 20 m … 2,900 m (`economy`); 100 m and doubling (`loops`); fixed 100 m (`endless`) | 14 authored biomes at **0, 40, 120, 240, 400, 600, 900, 1,300, 1,800, 2,400, 3,100, 3,900, 4,800, 5,800 m**, then an **Echo stratum every 1,100 m** | `economy`'s ladder ×2; a reveal every 1–10 minutes in run 1 |
| World storage | Shifted windows (`economy`, `wonder`, `feel`, `loops`, `progression`) or a ring (`visual`, `endless`, `motion`) | **`visual`'s RingWorld**: 64 × 160 × 64 voxels, a ring of 10 slabs of 16 rows | No memmove or full light re-upload, a recycled slab is a light barrier, and 64 m of z depth gives real parallax |
| Camera | FOV 24°–50°, widths 7.2–11.5 m, pitch 0 to −18° | **`visual`'s DescentCamera** (pitch 0, off-axis vertical shift, width lock), at **44 CSS px per metre** | Verticals stay parallel, cells keep their size up and down the screen, the cut reads as a drawn section. 44 px (not 50) leaves 0.9 m of wall each side for rigs and lamps |
| Gestures | Pan and pinch (`economy`), vertical drag (`wonder`), none (`visual`, `loops`, `motion`) | **None.** Taps (and holds) only | Ultra simple. The Ladder sheet replaces looking back up the shaft |
| Tap targeting | Nearest cell to the touch (`economy`, `wonder`, `visual`), column strips (`feel`, `motion`) | **Entity first, then the column under the thumb (vertical position ignored)** | A miss is impossible and a 44 px column is a full-height target |
| Overkill | Spill in the row (`economy`), pierce down the column (`feel`, `motion`), dig order (`endless`) | **Pierce down the column, then the floor row, then the next row; total damage conserved** | Visible chain breaks; conservation keeps the closed forms exact |
| Last cells of a row | — | **`feel`'s leftover crumble** at 5 of 7 cells | Ends the "last block hunt" |
| Active abilities | Skills with cooldowns (`economy`), abilities (`wonder`), blasts every N taps (`visual`, `feel`, `motion`), Surge meter (`feel`, `progression`, `motion`) | **4 skills (Dynamite, Gold Rush, Overdrive, Earthquake) + the Lantern Surge meter.** Frenzy is replaced by the Surge | Skills give decisions; the Surge rewards rhythm without a button |
| Bosses | Guardians mid-biome (`economy`, `endless`, `loops`), Seals at boundaries (`feel`, `wonder`, `motion`) | **One Seal per biome boundary, held by a Warden.** First time ever: a 30 s fight; afterwards a "charted gate" that breaks like a hard row | One thrilling beat per biome without slowing re-climbs |
| Chests | Clash-style timers and slots (`loops`), instant roll-up (`progression`), escalation (`motion`) | **Instant, honest roll-up** with visible pity and no near-miss fake-outs | No timers, no waiting, no manipulation |
| Run-scoped choices | Boons (`endless`), Facets (`progression`), Rift boons (`loops`) | **Facets**, one hand of 3 at every Seal broken (from the second) | Every run differs; builds and set bonuses |
| Achievements | 120 (`feel`), 80 + 12 secret (`progression`), 20 × X (`motion`), 120 Feats (`endless`) | **Feats: 20 families × tiers I–X, then endless; 12 secret** | One system, endless, +1 % per tier |
| Account level | Rank (`motion`), Renown (`progression`), Might (`progression`) | **Rank** (XP from everything, never resets) with Might titles | One meter that is always "soon" |
| Collections | Relics, bestiary, fossils, specimens, logs, murals, gems… | **Codex: Finds (6 per biome), Bestiary (3), Lore (5); a Biome Seal per complete page** | One cabinet, one completion reward |
| Currencies | Gold, gems, Glimmer, Embers, Echoes, Stars, Lumen, Heartstones… | **Gold (run), Gems (permanent, earned only), Embers, Threads, Sigils** | Fewest that still carry three layers |
| Cut for scope | Forge combinations, Camp buildings, Rift Dives, Expeditions, Guilds, Laws, worlds, chest slots and keys, Glimmer, Lantern Pulse, daily quests, weekly Deep Event | **Cut** | Tight set done brilliantly. The surface camp still grows visually with lifetime Embers |
| Numbers on screen | DOM, WebGL SDF, Canvas 2D | **A native-DPR Canvas 2D FX layer** for numbers, tokens, sparks and confetti; **WebGL SDF only for biome titles carved in light** (W3) | Crisp at any DPR, one system, cheap |
| Render resolution | DPR cap × scale (`visual`, `feel`), two resolutions + native composite (`motion`) | **Two resolutions**: the scene at a dynamic fraction of native, composited at native with Catmull-Rom + CAS | The browser no longer stretches a low-resolution canvas |
| Save | v2 → v3 migrations with gifts (all designs) | **Save v3; v1 and v2 saves are ignored with a one-line notice**; settings are kept | The director's rule; the old game is a different game |

---

## 2. Core loop at three scales

### 2.1 Ten seconds: tap, crack, burst, fly, roll, buy

| t | What happens | Feedback (same frame unless noted) |
|---|---|---|
| 0.00 s | The thumb lands anywhere in the world region. The topmost solid cell of that column takes the hit | flash, crack stage, face pop, damage number, strike ghost with its smear, 2 px kick, 10 ms haptic, material hit sound |
| 0.25–1.2 s | 1–5 taps break a cell; leftover damage pierces into the cell below | shards fill the cell's front metre, 16 dust and 6 sparks, a world shock ring, loot tokens pop |
| +0.5–0.8 s | 1–6 tokens land on the gold counter socket | counter catch (jelly), digits roll, a tick whose pitch rises per landing, the BEST card's fill bar moves |
| every 1.4–3.6 s | The 7-cell row clears (or the last 2 crumble) | the floor drops 1 m, the camera lands with a 4.5 % overshoot "thunk", a chord on the pentatonic ladder |
| always | The next 5–6 rows of the cut face show what is coming: ore veins, a chest silhouette, a cavern mouth, the next biome's glow | the shine sweep crosses valuables every 3.2 s |
| every 0.5–5 s | Something becomes affordable; one tap buys | ready ping, purchase burst, the world answers in the same frame (the pick grows, the crew cheers) |

### 2.2 Three minutes: a slice of the descent

Run 1, first three minutes (5 taps/s, §5.12): 20 m at 0:28, 40 m at 1:09 (Seal 1 and the Glowroot Caverns reveal), 80 m at
2:00, about 200 purchases, 3 chests, the first Surge, the first Lucky Moth, Dynamite twice, the first contract, Rank 3, two
Feat tiers, the first ★.

Any later three-minute window of active play contains, by construction:
- 2–4 minor events (one every 40–70 s);
- 2–4 chests (a chest cell every 25 rows, plus events);
- at least one ★ or crown and 6–40 purchases;
- one goal-bar completion and contract progress;
- a cavern breakthrough or a Vista (one every 25–40 m);
- a biome or a seal every 3–10 minutes in run 1, every 20–60 s while re-climbing after a Rekindle.

### 2.3 Three days: the prestige ladder

Session model: one 40-minute first session, then 6 minutes every 2 hours from 08:00 to 24:00; offline at 50 % (§4).

| Played | Record (sim) | What happened |
|---|---|---|
| 0:25 | 600 m | the Ember Shrine; Rekindle 1 (+25 Embers, power ×3.5) |
| 0:41 | 1,292 m | Rekindle 2; 7 biomes seen, the 8th (Fossil Halls) at 0:43 |
| 4 h | 2,799 m | the Loom; 3 Rekindles; first auto-buy perks |
| 12 h | 3,887 m | Iron Core; the first Weave at 8.7 h |
| day 1 (24 h) | 4,545 m | 12 biomes; 7 Rekindles; gold in the bank 1e86 |
| day 2 | 6,343 m | Void Sea and the Gate (Breach unlocks); 1e100 gold at about 31 h (the Googol fanfare) |
| day 3 | 7,375 m | Echo I; 17 Rekindles, 8 Weaves |
| day 7 | 8,336 m (floor, without Breach) | Breach must add ≥ 600 m a day in week 2 (E10) |

### 2.4 What keeps it endless

1. **HP has no ceiling.** It grows ×1.044 per metre past 2,400 m; numbers are `Big` (mantissa and an integer exponent up to
   9e15), so 20 km is 1e375 HP and the game keeps going.
2. **Content keeps coming.** After 14 authored biomes an Echo stratum arrives every 1,100 m (a re-tinted biome with a
   mutator, numbered I, II, III…). After 15 crew lines an Echo line arrives every 1,100 m. Every stratum brings 4 gear cards,
   a warden, 6 Finds and 3 creatures.
3. **Three prestige layers stack**, and Breach has endless tiers (+500 m per tier).
4. **The pick never stops growing**: a tier every 25 levels, forever.
5. **Collections and achievements never cap**: Find duplicates level up (+1 % each), bestiary tiers ×10 forever, Feat tiers
   past X, rank past 100.
6. **Records race you**: the ghost lantern of your previous run, split times per biome, planted lanterns at every Rekindle.

---

## 3. The tap

### 3.1 Input contract (`src/ui/idle/TapSurface.ts`, `src/game/DigController.ts`)

| Step | Rule | Numbers |
|---|---|---|
| Event | `pointerdown` on the world canvas fires the tap; `pointerup` and `click` are never used. `touch-action: none` | up to 3 simultaneous pointers |
| Queue | The handler pushes `{x, y, id, t}` into a fixed ring of 32; `IdleGame.frame` drains it first, before the simulation | 0 allocations per tap |
| World region | From the goal bar's bottom + 4 px to the skill row's top (§9). Taps on HUD plates never reach the world | — |
| Entity first | Hit-test tappables in screen space: chests popped out, creatures, event objects, warden weak points, planted lanterns, the Lucky Moth | radius max(32 px, projected bound + 10 px) |
| Column | Otherwise the column comes from screen x: 7 equal strips between the projected shaft walls at the floor row (`shaftLeftPx`, `shaftRightPx`, recomputed on resize and camera move). Left of the shaft maps to column 0, right of it to column 6. **Vertical position is ignored** | 44 px per column at every width |
| Target | The topmost solid cell of that column if it is ≤ 2 rows below the floor row; otherwise the nearest column (by distance) whose top cell is | the dig stays on the floor |
| Hold | A finger held still (≤ 12 px) for 250 ms auto-taps its column | 5 taps/s, +0.5/s per Steady Hand level (max 8/s), 10/s during a Surge |
| Swipe | A held finger that crosses into another column hits it at once (0.6-column hysteresis) | ≤ 15 hits/s per finger |
| Cap | Counted taps per second (anti-autoclicker and FX budget). Extra taps merge their damage into the previous hit on that column | 15/s |
| Desktop | A mouse click is a pointer event. Keys 1–7 tap a column, Space taps the last column, B buys BEST, Esc is Back | — |

Taps pass through the foreman, the crew and particles; nothing decorative ever blocks a tap.

### 3.2 What one tap does (resolution order; pure: `src/idle/model/tap.ts`)

```
1  combo  : +1 if (t − lastTap) ≤ 0.60 s; after 1.2 s without a tap it falls by 5 every 0.5 s (§3.4); holds count as taps
2  base   : pickDmg(L) = 100 × L × 2.5^floor(L/25) × gearPick × M_all
3  rally  : D = base + rally × crewDPS                      (crewDPS already includes M_all; rally = 0.14 + 0.01 × RallyLv)
4  crit   : p = min(30 %, 5 % + 1 % × LuckyLv) + facet bonus; on a crit D ×= 5 (facets raise the ×)
5  combo  : D ×= 1 + 0.02 × min(combo, 50)                 (×2.0 at 50; Crescendo facet raises the cap)
6  surge  : D ×= 3 while the Lantern Surge runs
7  skills : D ×= Moth Frenzy, Cataclysm and other active multipliers
8  apply D to the target cell (cells store remaining HP as a fraction of HP(d); damage applies as D / HP(d) in log space)
9  pierce : overkill flows into the next cell down the same column, up to `pierce` = 1 + floor(pickTier / 3) cells (max 8 below
            the floor), then into the nearest living cell of the floor row, then the next row. Total damage is conserved exactly
10 splash : Shockwave deals splash × D to side neighbours in the floor row (on top of D, not subtracted)
11 meters : Surge meter += 1 (+4 on a crit); XP, Feat counters, combo tier events
```

**Leftover crumble.** When at least 5 of a row's 7 cells are broken, the rest crack, shake for 0.3 s and fall with full loot.
The sim models a row as costing κ × 7 × H(d), with κ = 0.86 measured by the cell-level test (`tests/unit/idle/shaft.test.ts`,
tolerance ±0.03). The offline closed form uses the same κ, so it stays exact.

**The first row is a free win.** HP(0) = 100 = the level-1 pick, so the first tap of a new game always breaks a cell; after the
first upgrade (Pick 2: 200 damage at about 0:05) every cell of the first 5 m still breaks in one tap (HP(5) = 193).

### 3.3 How a tap scales on screen

**VFX escalation tier from what the tap broke** (it grows with power by itself and falls back when a new biome raises HP):

| Tier | Trigger | Share of taps, run 1, 0–25 min (target) | Added on top of the tier below |
|---|---|---|---|
| E0 Crack | no break | 45–65 % | cell flash 0.6, face pop 0.08 m, crack stage, 4 dust and 2 chips, damage number, 2 px kick |
| E1 Break | 1 cell | 25–40 % | shatter (8–12 shards), 16 dust, 6 sparks, world shock ring 0.45 s, 1–6 loot tokens |
| E2 Pierce | 2–3 cells | 6–14 % | crack line down the column (120 ms ribbon), chain counter "×3", +2 semitones per cell |
| E3 Column | 4–7 cells | 0–4 % | vertical light pillar 180 ms (HDR amber ×4), trauma +0.15, screen shock 0.004 |
| E4 Row wipe | 8+ cells, or one tap clears the row | 0–1 % (run 2 early: 3 %) | row ripple from the tapped column outward (30 ms per column), trauma +0.30, chroma 0.003 |
| E5 Plunge | ≥ 6 rows/s for 1.5 s | re-climbs, Head Start, Dynamite chains | the Plunge renderer (§6.2) |

**The pick ladder.** A tier every 25 Pick levels multiplies pick damage ×2.5 and changes the model. The strike ghost (the
Lantern Pick: a glowing copy of the tool) appears at the impact pose on the tapped cell in frame 0, with an additive smear arc
(90°, alpha 0.7 → 0 over 90 ms); it follows through 18° over 120 ms and fades over 80 ms.

| Tier | Pick level | Name (`idle.tool.*`) | Ghost head length | New impact layer |
|---|---|---|---|---|
| 1 | 1 | Rusty Pick | 0.6 m | chips and dust |
| 2 | 25 | Copper Pick | 0.7 m | warm sparks |
| 3 | 50 | Iron Pick | 0.8 m | a world shock ring on every crit |
| 4 | 75 | Steel Pick | 1.0 m | a crack line on crits |
| 5 | 100 | Gilded Pick | 1.2 m | gold flecks; from here the foreman points and the ghost strikes |
| 6 | 125 | Crystal Pick | 1.4 m | cyan arcs and runes along the haft (0.7 Hz) |
| 7 | 150 | Obsidian Pick | 1.7 m | an ember trail behind the smear |
| 8 | 175 | Mythril Pick | 2.0 m | a silver frost burst |
| 9 | 200 | Sunsteel Pick | 2.4 m | light rays on crits (0.3, 300 ms) |
| 10 | 225 | Thunder Maul | 2.9 m | a lightning chain flash to 3 cells |
| 11 | 250 | Plasma Pick | 3.5 m | a column pillar on every tap |
| 12 | 275 | Comet Hammer | 4.2 m | a comet trail across the screen on crits |
| 13 | 300 | Star Breaker | 5.0 m | a screen-wide shock on crits |
| 14 | 325 | Planet Cracker | 6.0 m | a row ripple on every tap |
| 15 | 350 | Void Cleaver | 7.0 m (spans the shaft) | an inward implosion, then a violet ring |
| 16+ | 375 + 25 n | Lantern Edge I, II, III… | 7.0 m cap; the aura grows 0.3 m per tier and its hue cycles once per 8 s | the tool is drawn from off-screen, so only the head lands |

A purchase that crosses several tiers plays one ceremony for the highest tier ("+12 tiers").

### 3.4 Combo and the Lantern Surge (the rhythm layer)

- **Combo.** +1 per tap within 0.60 s. After 1.2 s without a tap it falls by 5 every 0.5 s (it does not reset at once). The
  multiplier is ×(1 + 0.02 × min(combo, 50)), so ×2.0 at 50. Tiers at 10, 25 and 50 change the colour (bone, amber, cyan) and
  play a rising chime; the counter keeps counting past 50 for Feats (100, 250…, violet then prismatic). Losing a combo of 10
  or more plays a soft fizz and costs nothing.
- **Lantern Surge.** The meter (the ring around the combo counter) fills 1 per tap and 4 per crit, to 240. At 5 taps/s with
  10 % crits it fills in about 44 s. A Surge fires by itself when full and lasts 10 s (+1 s per Bellows level, max 20 s).
  During it: taps ×3, hold auto-taps at 10/s, the combo is frozen, the lantern blazes (radius ×1.6, exposure +0.15, bloom
  +0.2), the screen edges glow amber and the drum layer enters on the next bar. The very first Surge is scripted: the meter
  appears pre-filled to 140.

---

## 4. Idle and offline

### 4.1 The crew digs where you can see it

Each owned crew line has visible rigs on the shaft walls and the floor (§6.9). A rig's damage lands on its loop's impact
frame, so the screen and the numbers agree. Crew damage goes to the floor row's weakest cell first, then pierces like a tap.
Crew numbers are small and grey (bone-500, 12 px), at most 6 a second, merged per column, so the player's taps stay the stars.
When crew DPS exceeds 7 rows of HP per second, rigs switch to area visuals (drill beams, golem slams, wyrm lunges).

**Idle on screen.** With no input for 20 s the frame cap drops to 30 fps and only T0 effects and crew loops play; after 90 s
it drops to 20 fps. The next `pointerdown` restores 60 fps in that frame. The screen is kept awake (`keepScreenOn`) only while
there was input in the last 5 minutes.

### 4.2 Offline rules (pure: `src/idle/model/offline.ts`)

| Rule | Value |
|---|---|
| Starts after | the app is hidden ≥ 30 s (`visibilitychange`, `pagehide`, or the Android shell's `deepDownLifecycle('pause')`) |
| Elapsed | `T = clamp(now − savedAt, 0, cap)`. A clock that moved back gives 0; a monotonic guard catches forward jumps inside one session; nothing is ever taken away |
| Efficiency | 50 % of crew DPS (taps, skills, Surge and combo count 0) → 75 % at 250 Embers → 100 % at 1e5 Embers or with the Night Shift Loom node |
| Cap | 3 h → 6 h at 25 Embers → 12 h at 250 Embers → +2 h per Night Shift level (to 24 h) |
| Depth | Exact closed form over the HP segments (§4.3), with the row cost κ × 7 × H |
| **First sight** | The crew stops at the next Seal it has never opened (L10). The remaining time pays **gallery gold** at the stop depth, at the same gold per damage, and banks it |
| Chests | Chest cells passed go to the **Chest Rack** (holds 10; the rest become their gold). Each opens with one tap on return, with its full roll-up |
| Biomes crossed | Only biomes already opened before can be crossed offline; they are logged; the return shows a short gate flash for the deepest one |
| Not offline | Lucky Moths, events, contracts, seals, facets and Feats needing taps |
| Time Crystals | a stored hour of 100 % crew output from Grand Contracts and Lintel chests; "Warp" spends one at any time |

### 4.3 The closed form (exact)

HP is piecewise geometric: a constant ratio `g` per metre inside each segment (§5.2). With crew DPS `A` (×efficiency) and
time `T`, the work is `W = A × T`. Walk the segments: within a segment starting at depth `a`, the next `k` rows cost
`κ·7·H(a)·(g^k − 1)/(g − 1)`. If `W` covers the segment, subtract and move on; otherwise solve
`k = floor(log_g(1 + W(g − 1)/(κ·7·H(a))))` and leave the remainder as row progress. Stop at the first unopened seal; convert
the rest of `W` to gold at that depth. Gold = HP dug / 100 (the cell mix averages ×1.00) plus gallery gold plus the rack.
Cost: O(number of segments), microseconds. Verified against a 1-second step integration (E7).

### 4.4 The return feast (T5, 3.2 s; any tap skips to 2.4 s)

| t (ms) | Layer | What |
|---|---|---|
| 0 | WebGL | the world fades in from slate-950 over 240 ms |
| 0–700 | camera | a Plunge plays the metres gained (0.4 s at speed, then a deceleration onto the current face) |
| 300 | DOM | the plate drops in (snap spring): "While you were away · 5 h 12 m" |
| 450 | DOM | lines roll in one after another: "+168 m (824 → 992 m)", "+4.2e15 gold", "7 chests on the rack", "Your crew waits at the Drowned Bell" |
| 600 | DOM + FX | the gold total counts up in log space over `clamp(500 + 220·log10(total), 500, 2000)` ms; 40 coins rise from the plate; a cash roll whose ticks follow the digits |
| +250 | DOM | **Collect** pops (jelly) and breathes |
| Collect | FX | 24 coin bundles fly to the gold counter, credited per landing; the rack slides in (one tap per chest, ≥ 0.8 s apart); if the crew waits at a seal, the seal card follows: "Break the seal! 0:30"; the BEST card and every affordable quick-buy light up ("Spend your haul") |

Within 5 s of the feast closing the Director deals a Lucky Moth or a Supply Rope, so the first 10 seconds back are rewarding.

---

## 5. Economy

All numbers live in `src/idle/config/*.ts` and are read by both the game and the sim. The calibration of §5.12 holds for the
values below; changing one requires re-running `tools/econ-sim.ts` and keeping §13's E-metrics green.

### 5.1 Units and number notation (`src/core/big.ts`, `src/idle/num/notation.ts`)

- **Depth:** 1 row = 1 m. Shown as `128 m` up to 9,999 m, then `12.48 km`.
- **HP:** a 0 m cell has 100 HP; the level-1 pick deals 100.
- **Gold:** a cell pays `HP / 100 × kindMult`; the first cell pays 1.
- **Big:** `{ m: float64 in [1, 10), e: integer }`, exponent up to 9e15. Add, sub, mul, div, pow, log10, cmp, fromLog10,
  in-place variants for the hot path, `toJSON` as `[m, e]`. Cell HP is stored as a remaining fraction, never as an absolute Big.
- **Display:** integers below 10,000 (`1 234`, a thin space), then 3 significant digits with the suffix of the table below
  (`12.3K`, `4.56M`). Rates sit next to counters (`+4.5K/s`), updated 4 times a second.

| Range | Suffix | Range | Suffix |
|---|---|---|---|
| 1e3 | K | 1e36 | UDc |
| 1e6 | M | 1e39 | DDc |
| 1e9 | B | 1e42 | TDc |
| 1e12 | T | 1e45 | QaDc |
| 1e15 | Qa | 1e48 | QiDc |
| 1e18 | Qi | 1e51 | SxDc |
| 1e21 | Sx | 1e54 | SpDc |
| 1e24 | Sp | 1e57 | OcDc |
| 1e27 | Oc | 1e60 | NoDc |
| 1e30 | No | 1e63 | Vg |
| 1e33 | Dc | 1e66 … 1e2091 | aa, ab, … zz (676 letter pairs, +3 exponent each) |
| ≥ 1e2094 | `1.23e2094` | ≥ 1e1,000,000 | `e1.20M` |

Settings offer Letters (default), Scientific (`1.23e45`) and Engineering (`12.3e44`). **Counter tier colours** follow the
suffix: K bone, M amber, B ember, T rune cyan, Qa violet, Qi and up prismatic, letter pairs prismatic with a shine sweep every
3 s. The first time each suffix appears is a T4 number milestone; 1e100 ("Googol") is a T5 fanfare.

### 5.2 Depth curve

`HP(d) = 100 × Π slope(m)` for m < d.

| Segment | Slope per metre | Why |
|---|---|---|
| 0–39 m (Topsoil) | 1.140 | the tutorial: the pick lags just enough for each upgrade to be felt |
| 40–239 m | 1.0440 | the comfort zone: a crew line every 40–120 m |
| 240–899 m | 1.0392 | the long first push; Rekindle at 600 m |
| 900–2,399 m | 1.0416 | the first run walls here (1,800 m at about 2 h) |
| 2,400 m + | 1.0440 | the deep game, pushed by prestige; forever |

| # | Biome start | Depth | HP per cell | Gold per average cell | Row HP (×7) |
|---|---|---|---|---|---|
| 0 | Topsoil Roots | 0 m | 100 | 1 | 700 |
| 1 | Glowroot Caverns | 40 m | 1.90e4 | 190 | 1.33e5 |
| 2 | Crystal Grotto | 120 m | 5.97e5 | 5.97e3 | 4.18e6 |
| 3 | Halden Works | 240 m | 1.05e8 | 1.05e6 | 7.36e8 |
| 4 | Fungal Deep | 400 m | 4.96e10 | 4.96e8 | 3.47e11 |
| 5 | Drowned Ruins | 600 m | 1.09e14 | 1.09e12 | 7.64e14 |
| 6 | Magma Veins | 900 m | 1.13e19 | 1.13e17 | 7.88e19 |
| 7 | Fossil Halls | 1,300 m | 1.37e26 | 1.37e24 | 9.60e26 |
| 8 | Frost Hollow | 1,800 m | 9.88e34 | 9.88e32 | 6.92e35 |
| 9 | The Loom | 2,400 m | 4.20e45 | 4.20e43 | 2.94e46 |
| 10 | Iron Core | 3,100 m | 5.28e58 | 5.28e56 | 3.70e59 |
| 11 | Star Heart | 3,900 m | 4.94e73 | 4.94e71 | 3.46e74 |
| 12 | Void Sea | 4,800 m | 3.43e90 | 3.43e88 | 2.40e91 |
| 13 | The Gate | 5,800 m | 1.77e109 | 1.77e107 | 1.24e110 |
| 14 | Echo I | 6,900 m | 6.81e129 | 6.81e127 | 4.77e130 |
| 15 | Echo II | 8,000 m | 2.62e150 | 2.62e148 | 1.83e151 |
| — | (12 km / 20 km) | | 1.87e225 / 9.48e374 | | |

Biomes differ in what appears, never in average value: every biome's cell table has an expected multiplier of 1.00.

### 5.3 The cell mix (what a row is made of; `src/idle/config/cells.ts`)

| Cell kind | Share | Gold × | HP × | Notes |
|---|---|---|---|---|
| Rock (the biome's host families) | 84 % | 0.6 | 1 | crack tint per family; soft and hard lenses are look only |
| Common ore | 10 % | 2.5 | 1 | veins of 2–6 cells (thresholded 3D noise); glints through the section 6 rows ahead |
| Rich ore | 4 % | 4 | 1.5 | glows and pulses at 0.7 Hz; its break is the jackpot burst |
| Rare: gem / fossil / geode | 1 % | 8 | 2 | gem: +1 gem; fossil: a Find roll (§7.5); geode: a Strike widget (§7.3) |
| Chest cell | 1 per 25 rows (centre column) | — | 3 | a chest (§5.8); its lid shows in the section 6 rows ahead |
| Golden cell | event only (Golden Vein) | 20 | 1 | gold leaf, a sparkle every 0.7 s |
| Gate row | the first row of each biome | 1 | 3 | carved builders' stone with a frieze; it is the Seal on the first visit (§7.1) |
| Boulder | Cave-in leftovers | 3 | 3 | a fallen boulder that landed on the floor |
| Marker band | 1 row per 50 | — | — | look only (the cells keep their kinds): a visible stratum line; a brass depth plaque every 20 m |

Expected value: 0.84·0.6 + 0.10·2.5 + 0.04·4 + 0.01·8 = 0.994; chests and gems carry the rest (`tests/unit/idle/cells.test.ts`
holds every biome at 1.00 ± 0.01). Ores per biome are listed in §6.5.

### 5.4 Gold upgrades (in-run; reset by Rekindle)

**Formulas.** Level cost `cost(L → L+1) = c0 × r^L` (the pick uses `L − 1`). Crew output `b × L × 2^floor(L/10)` (a ★ every 10
levels). Buy ×1, ×10, NEXT ★ and MAX (MAX buys `floor(log_r(1 + G(r − 1)/c))` levels, closed form). "Rows of gold at u" means
`7 × HP(u)/100`.

#### The pick and its cards (the **Dig** sheet)

| Upgrade | Unlock | c0 | r | Effect | Cap |
|---|---|---|---|---|---|
| Pick | 0 m | 30 gold | 1.20 | damage `100 × L × 2.5^floor(L/25)`; a tier and a new model every 25 levels (§3.3) | none |
| Rally | 40 m | 2 rows of gold at 40 m (2,660) | 4.0 | each tap adds `0.14 + 0.01 × L` of crew DPS | 20 levels (34 %) |
| Lucky Strike | 30 m | 1.5 rows at 30 m (535) | 2.5 | crit chance +1 % (base 5 %) | 25 levels (30 %) |
| Shockwave | 120 m | 4 rows at 120 m (1.67e5) | 6.0 | splash to side neighbours: L1–L4 ±1 cell at 25/50/75/100 %; L5–L8 ±2 cells at 25–100 %; L9+ the whole row at 25 % + 25 % per 4 levels (cap 100 %) | none |
| Steady Hand | 60 m | 2 rows at 60 m (6,300) | 4.0 | hold auto-tap +0.5/s (base 5/s) | 6 levels (8/s) |
| Bellows | 180 m | 6 rows at 180 m (3.3e6) | 6.0 | Lantern Surge +1 s (base 10 s) | 10 levels |

#### Skills (active; cooldowns; levelled with gold in the Dig sheet; the skill row in §9)

| Skill | Unlock | Effect | Duration | Cooldown | +1 level (cost ×5 per level, from 3 rows of gold at the unlock depth) |
|---|---|---|---|---|---|
| Dynamite | 30 m | destroys the next 3 rows at once, paying their gold | instant | 60 s | +1 row (to 12) |
| Gold Rush | 180 m | gold ×5 | 20 s | 180 s | +×1 (to ×15) |
| Overdrive | 320 m | crew ×10 | 30 s | 300 s | +×2 (to ×30) |
| Earthquake | 600 m | applies 60 s of total DPS as damage at once; the whole screen shakes | instant | 600 s | +15 s worth |
| **Cataclysm** | all four owned | using all four within 5 s: everything ×2 for 10 s, one full-screen flash | 10 s | — | — |

Skills are margin on top of the calibration (they are capped by cooldowns): real active play runs 20–40 % ahead of the sim's
depth curve, which the bands of §5.12 allow for. Auto-skills come at 1,000 Embers.

#### The crew (the **Crew** sheet): 15 authored lines, then Echo lines

A line unlocks when you first reach its depth; its blueprint is kept forever from 1 Ember. Lines 0–5 are priced at their unlock
depth `u`: `c0 = 186 × goldPerCell(u)` (about 26.6 rows of gold) and `b = HP(u)/44.4` (a level-1 line breaks one cell every
44 s at its unlock depth; at level 10 one every 2.2 s). Line 0 costs 50. **Lines 6+ are a geometric ladder**: each costs ×1e4
and produces ×1e4 the previous line, not indexed to HP. This is the most important structural rule in the economy (lines
priced fairly at every depth form a self-sustaining ladder and run away). `r = 1.10` for every line.

| # | Line | Unlock | c0 (gold) | DPS per level | Rig on screen |
|---|---|---|---|---|---|
| 0 | Shovel Hand | 0 m | 50 | 2.25 | small miners at the floor edge; 0.9 s swing, impact at 0.52 s |
| 1 | Pick Crew | 16 m | 1.52e3 | 18.4 | two miners on a ledge, alternating swings |
| 2 | Mine Cart | 40 m | 3.54e4 | 428 | a rail on the left wall: the cart descends, dumps at 1.9 s, climbs back (2.4 s loop) |
| 3 | Steam Drill | 120 m | 1.11e6 | 1.34e4 | a gantry over the centre column; the bit plunges, steam puffs |
| 4 | Blast Team | 240 m | 1.96e8 | 2.36e6 | a charge setter: plant, a 0.8 s fuse, a 3×3 blast every 6 s |
| 5 | Tunnel Borer | 400 m | 9.23e10 | 1.12e9 | a side-mounted cylinder that rotates and grinds |
| 6 | Crystal Resonator | 600 m | 9.23e14 | 1.12e13 | tuning forks on the walls; rings that shatter cells |
| 7 | Magma Lance | 900 m | 9.23e18 | 1.12e17 | a heat beam from the right wall |
| 8 | Fossil Golem | 1,300 m | 9.23e22 | 1.12e21 | a bone fist that slams rows |
| 9 | Rime Auger | 1,800 m | 9.23e26 | 1.12e25 | an ice drill hung on chains |
| 10 | Loom Weaver | 2,400 m | 9.23e30 | 1.12e29 | threads of light that cut the rock |
| 11 | Gravity Well | 3,100 m | 9.23e34 | 1.12e33 | a lensing sphere that draws cells in |
| 12 | Star Forge | 3,900 m | 9.23e38 | 1.12e37 | a star furnace above the shaft |
| 13 | Void Maw | 4,800 m | 9.23e42 | 1.12e41 | a mouth of void in the back wall |
| 14 | Gate Engine | 5,800 m | 9.23e46 | 1.12e45 | the Gate's engine, a ring of rune gears |
| 15+ | Echo line n (Mk II…) | 6,900 + 1,100 (n − 15) m | ×1e4 per line | ×1e4 per line | the Echo recolour of line n − 15 at ×1.15 scale |

#### Gear (one-shot gold cards, four per biome start, the top row of the Dig sheet)

| Card | Cost (rows of gold at u) | Effect |
|---|---|---|
| *Biome* Tools | 2.5 | the newest line ×3 |
| *Biome* Rigging | 3.7 | the second-newest line ×3 |
| *Biome* Edge | 3.1 | pick ×3 |
| *Biome* Lantern | 7.5 | everything ×2 (crew and taps) |

At 40 m: 3.3K / 5.0K / 4.1K / 10K gold. At 240 m: 1.8e7 / 2.8e7 / 2.3e7 / 5.5e7. Every Echo stratum brings its four cards.
Arriving in a biome means new gear: the cards fly into the Dig tab with a badge.

#### Milestones

| Milestone | Effect | Presentation |
|---|---|---|
| ★ every 10 crew levels | that line ×2 | T3 on the card; the rig flashes gold; NEXT ★ buys exactly to it |
| Crown every 50 crew levels | the ★ at 50, 100, 150… is a crown: still ×2, plus a new rig look (lantern, gold trim, glow) | T3+ banner "MINE CART CROWNED" |
| Pick tier every 25 levels | ×2.5 and a new tool model | T4 tool-tier ceremony |
| Depth mark every 20 m | +1 gem the first time ever | a brass wall plaque lights |
| Depth record every 200 m | +10 gems; a records split | T2 |
| Biome start | gear, a crew blueprint, the reveal (T5 first time, T3 later) | §10.8 |

### 5.5 How buying feels (the upgrade mechanic; `src/ui/idle/Card.ts`)

1. **The button is a progress bar.** Every card shows `shown gold / cost` as a fill that moves with each coin that lands
   (`shown` is the display ledger, §10.6). At ≥ 85 % the BEST card's fill brightens and breathes. At 100 % the card turns amber
   and plays the **ready ping** (snap 1 → 1.04 → 1, a rim flash, a tink pitched per card), at most once per card per 3 s.
2. **The pip ring.** Each card has a ring of pips to its next milestone (10 for a crew line, 25 for the pick shown as 5 groups
   of 5). Each pip pops as it fills; the last one fires the ★ (or the tier).
3. **BEST.** The option with the lowest payback, `cost / Δincome + max(0, cost − gold) / income`, wears a brass "BEST" chip
   and sits in the middle quick-buy slot. One tap on BEST is always the right move. The sim's buyer follows the same rule.
4. **Buy modes.** ×1 until the first ★ (about 0:20); then the segmented control appears with ×1 / ×10 / **NEXT ★** / MAX and
   NEXT ★ becomes the default; MAX becomes the default after the first Rekindle. Every press of NEXT ★ ends in a ★ ceremony.
5. **Hold to buy.** After 380 ms, 8 buys a second, rising to 16/s after 1.5 s; each repeat is a mini-press; ★ ceremonies inside
   a hold merge into the last one.
6. **The purchase arpeggio.** Each purchase plays the next note of a major pentatonic scale in the biome's key on the brass
   voice; the step resets 1.5 s after the last purchase; the 10th consecutive note moves up an octave with a shimmer; ×10,
   NEXT ★ and MAX play a 4-note run. A spree sounds like a fanfare.
7. **The delta preview.** Under the name: "+12 % → 1.42K / tap" (verdigris); it rolls to the new value when the purchase lands.
8. **The world answers within one frame** (L1): a Pick level pumps the strike ghost (squash 1.18/0.85 → 1, 220 ms), a crew level
   makes its rig cheer (0.2 m hop and a faster loop for 1 s), gear flares the lantern (+0.3 bloom, 300 ms).
9. **Locked teasers** sit at the bottom of each sheet in violet: a silhouette, "Unlocks at 240 m".

### 5.6 The multiplier stack (one formula, shown in the Stats panel of the Lantern sheet)

```
M_all    = (1 + 0.10 × Embers × kindling) × threadsCrew × sigils × finds × bestiary × (1 + 0.01 × Marks)
           × (1 + 0.005 × (Rank − 1)) × biomeSeals × facets × boosts
lineDPS  = b × L × 2^floor(L/10) × gearLine × gearAll × M_all
crewDPS  = Σ lineDPS × Overdrive
tapDmg   = (100 × L × 2.5^floor(L/25) × gearPick × gearAll × M_all + rally × crewDPS) × combo × crit × surge × skills
cellGold = HP / 100 × kindMult × goldFinds × goldenVein × goldRush × goldFacets × boostGold
```

- Groups multiply; inside a group, bonuses add (Finds +3 % each, summed).
- **Embers multiply damage, not gold.** A multiplier on both roughly doubles the depth bought per decade and made Rekindle
  chain into runs a few seconds long in calibration. Gold multipliers exist (Finds, Golden Vein, Gold Rush, Boost, Greed facets)
  but are bounded or run-scoped.
- **Side multipliers** (Finds, Bestiary, Marks, Rank, Biome Seals, facets) are budgeted: their product stays ≤ ×10 by the end of
  day 3 and ≤ ×30 by day 7 at the expected earn rates. The sim includes them at those rates (Appendix A).

### 5.7 Gems ◆ (earned only; there is no store)

| Source | Gems |
|---|---|
| New 20 m depth mark (lifetime first) | 1 |
| New 200 m record | 10 |
| Chests | Wood 0–1, Copper 2–4, Crystal 8–12, Reliquary 25–40, Lintel 100 |
| Gem cell / geode | 1 / 3–12 |
| Warden broken (first time) | 5 |
| Contract / Grand Contract | 3–8 / 15 |
| Lucky Moth (gems outcome) | 3 |
| Feat tier | 5 × min(tier, 10) |
| Rank up | 2 + floor(rank / 5), max 10 |
| Codex chest, daily chest, calendar | per §5.8, §7.4 |
| Green split (a biome reached faster than ever) | 5 |

| Sink | Cost | Effect |
|---|---|---|
| Lantern Oil (boost) | 25 | everything ×2 for 30 min (stacks duration to 4 h) |
| Time Warp | 40 | 1 h of crew output at 100 % now |
| Skill refresh | 5 | all cooldowns end |
| Contract reroll | 2 | a new contract |
| Facet reroll | 10 | a new hand (1 free per run) |
| Royal key | 10 | opens the Royal Chest of a Vista (Reliquary floor) |
| Find focus | 100 | the next Find drop comes from the chosen biome's page |
| Cosmetics | 100–600 | pick skins, trails, lantern flames, counter frames |

### 5.8 Chests (instant, honest roll-ups; `src/idle/model/chests.ts`)

| Tier | Colour token | Gold (seconds of current income) | Gems | Extras |
|---|---|---|---|---|
| Wood | `RARITY.common` bone #c9bfae | 8 s | 0–1 | — |
| Copper | `RARITY.uncommon` #e58444 | 20 s | 2–4 | 15 %: +5 free levels on a random owned crew line |
| Crystal | `RARITY.rare` rune #8fe3ee | 90 s | 8–12 | 1 Find roll (new 60 %), 1 free facet reroll |
| Reliquary | `RARITY.relic` deep #b9a2ff | 5 min | 25–40 | 1 relic Find (or 5 levels on an owned one) |
| Lintel | new `RARITY.mythic`: amber → brass gradient with cyan glyph sparks | 20 min | 100 | 1 relic Find, a cosmetic, a Time Crystal, and a 20 s Lantern Storm (everything ×10) |

**Roll-up.** A chest starts at its floor tier and tries up to 4 steps; each step is one honest roll: Wood → Copper 40 %,
Copper → Crystal 30 %, Crystal → Reliquary 20 %, Reliquary → Lintel 10 % (from Wood: Copper+ 40 %, Crystal+ 12 %, Reliquary+
2.4 %, Lintel 0.24 %). The animation always lands on the true result; there is no near-miss flicker and no fake-out.

| Source | Floor |
|---|---|
| chest cells, events, the Chest Rack | Wood |
| Treasure Mole, every 200 m record, Rank every 5 | Copper |
| Warden (first break), Mimic, Treasure Map, Codex chests, the daily chest, Grand Contracts | Crystal |
| Royal Chest (Vista, gem key), calendar day 7 | Reliquary |

**Pity** (three small gauges in the chest info card): Crystal+ within 12 chests, Reliquary+ within 40, Lintel within 300. A
gauge above 80 % puts a violet "!" on the next chest. Expected chest gold is about 28 s of income per chest cell, which is what
the calibration assumes (30 s).

### 5.9 Prestige

#### Layer 1: Rekindle → Embers (the Ember Shrine, 600 m, Drowned Ruins)

- **Total, a function of the record:** `EmbersTotal(R) = floor(25 × 2^((R − 600) / 200))`, R = the deepest point since the last
  Weave. A Rekindle pays `EmbersTotal(R) − EmbersOwned`. The rule a player can repeat: **"every new 200 m of record doubles your
  Embers."** Examples: 600 m 25 · 800 m 50 · 1,000 m 100 · 1,300 m 283 · 1,800 m 1,600 · 2,400 m 1.28e4 · 3,100 m 1.45e5 ·
  4,000 m 3.2e6 · 6,000 m 3.3e9.
- **Effect:** each Ember is +10 % damage (crew and taps), additive; Embers are never spent. 25 Embers = ×3.5.
- **Reset:** depth, gold, levels, gear, skill levels, facets. **Kept:** blueprints, Finds, bestiary, lore, gems, Feats, rank,
  records, perks, cosmetics, opened seals.
- **Recommended** (the Lantern tab glows, the goal bar shows it): gain ≥ Embers owned **and** rows slower than 8 s, or gain ≥ 10×
  owned; or walled (rows slower than 45 s, run > 10 min) and gain ≥ 25 % of owned.
- **The Rekindle screen:** deepest metres, "Embers +N", "Power ×A → ×B", "You will pass 1,624 m in about 3 min" (a 30 ms run of
  the pure sim), the perks the new total unlocks, one big REKINDLE button that needs a 0.6 s hold (a brass ring fills).
- **What the next run shows:** your lantern is planted at the depth you reached ("Rekindle #3 · 1,624 m", a warm emitter and a
  plaque; tapping it as you pass gives +2 % damage for the run, stacking); the ghost lantern of this run races beside the shaft;
  splits per biome (§7.7).

**Ember perks** (thresholds on the highest Ember total ever held, so a Weave never takes them away):

| Embers | Perk |
|---|---|
| 1 | keep crew blueprints |
| 10 | start each run with Shovel Hand 10 and Pick 10 |
| 25 | offline cap 6 h |
| 50 | auto-buy: pick (toggle) |
| 100 | Head Start: open each run with a Plunge to 10 % of your record (those rows pay their gold, then a MAX spree) |
| 250 | offline cap 12 h, efficiency 75 %; auto-pick facets (toggle) |
| 500 | auto-buy: crew lines (best payback first) |
| 1,000 | auto-skills (toggle) |
| 1e4 | Head Start 20 % |
| 1e5 | offline efficiency 100 % |
| 1e6 | auto-gear |
| 1e8 | Head Start 30 % |

#### Layer 2: Weave → Threads (the Loom's Heart, 3,100 m)

- **Gain:** `Threads = floor(10 × 2^((cycleRecord − 3,100) / 300))`, cycleRecord = the deepest point since the last Weave.
  Recommended when the gain ≥ Threads owned.
- **Reset:** everything Rekindle resets, plus Embers to 0. **Kept:** perks, Finds, bestiary, Feats, rank, gems, records, Threads.
- **Live re-climb:** after a Weave, until you pass your previous best, Embers kindle live (each new 200 m doubles them at once),
  so the first run of a cycle is one long snowball, not a chore of Rekindles.
- **Loom nodes** (level costs ×2):

| Node | Per level | Max |
|---|---|---|
| Kindling | +1 % per Ember on the Ember bonus (10 % → 11 %…) | ∞ |
| Crew Weave | crew ×3 | ∞ |
| Steady Hands | Rally base +2 % | 10 |
| Golden Vein | gold ×2 | ∞ |
| Deep Lungs | every slope −0.00025 per metre | 10 |
| Night Shift | offline +10 % efficiency and +2 h cap | 5 |
| Head Start | +5 % of record | 6 |
| Chest Weave | chest cells 2 rows more often (25 → 11 at 7) | 7 |
| Skill Weave | cooldowns −8 % | 5 |
| Ember Forge | Ember gain ×1.5 | ∞ |

#### Layer 3: Breach → Sigils (the Last Gate, 5,800 m)

Eight challenge runs, each a fresh Weave cycle with a rule. Tier n requires `goal_n = base + 500 × (n − 1)` m. Each tier gives
that challenge's Sigil +1; each Sigil is a permanent ×2 on its stat. There is no last tier.

| Challenge | Rule | Base goal | Sigil (×2 per tier) |
|---|---|---|---|
| Bare Hands | no crew | 1,200 m | taps |
| Sleepless | no offline, no skills | 1,800 m | offline efficiency +10 % and cap +1 h |
| Granite | every slope +0.005 per metre | 1,400 m | crew |
| One Crew | a single line of your choice | 1,600 m | the newest line |
| Blind | no section preview, no events | 2,000 m | gold |
| Sprint | reach the goal within 15 minutes | 1,000 m | skills (cooldown −10 %) |
| Pauper | gold ×0.01 | 1,800 m | gold |
| Cold Start | Embers off | 2,400 m | Ember gain |

### 5.10 Facets: a hand of three at every seal (run-scoped; `src/idle/model/facets.ts`)

From the second Seal of a run on (120 m), breaking a Seal or a charted gate offers a hand of **3 facet cards**; the player keeps
1. Facets last for the run (Rekindle clears them). The hand is a T2 overlay: the world keeps digging behind it. Pending hands
queue (a "Facet ×2" chip in the skill row and a badge on the Dig tab), so a fast re-climb never stacks modal choices.
Auto-pick (250 Embers) takes the highlighted card after 6 s.

- **Rarity of an offered card:** Common 70 % (×1 value), Rare 25 % (×1.5), Relic 5 % (×2.5, violet frame). No duplicate in a hand.
- **Rerolls:** 1 free per run, then 10 gems.
- **Tags unlock with the biomes:** Spark and Quake at 120 m, Greed at 240 m, Crew at 400 m, Rhythm at 600 m, Fortune at 900 m.
- **Set bonuses** at 2, 4 and 6 facets of one tag; the facet belt (in the Dig sheet header) shows 6 tag gems with notches.

| Tag | Facets (common values) | Set 2 | Set 4 | Set 6 |
|---|---|---|---|---|
| Spark | Hot Edge (crit +4 pt) · Split Spark (crits splash 1 neighbour at 50 %) · Static (every 10th tap crits) · Overcharge (crit ×5 → ×7) | crit +5 pt | crits chain to 2 cells | 10 % of crits become mega crits (×10, 3×3 ring) |
| Quake | Wide Swing (Shockwave +25 %) · Aftershock (a broken cell deals 20 % of its HP to neighbours) · Fault Line (1 tap in 8 hits the whole row at 50 %) · Charge Pack (every 25th tap: a 3×3 blast at ×5) | area +50 % | blast radius +1 | every cleared row blasts the next at 30 % |
| Greed | Gilded Edge (gold +30 %) · Midas (Golden Veins twice as often) · Assay (ore gold ×2) · Treasure Nose (chest cells 1 per 17 rows) | gold +50 % | every 50th cell golden | gold ×3 |
| Crew | Whistle (crew +40 %) · Shared Pick (Rally +4 pt) · Apprentice (the newest line ×3) · Union (+5 % crew per hired line) | crew +60 % | crew strikes hit 2 cells | crew ×3 |
| Rhythm | Tempo (combo window 0.6 → 0.9 s) · Crescendo (combo cap 50 → 75) · Battery (Surge +3 s) · Drumline (+1 auto-tap/s per 25 combo) | combo builds ×2 | Surge ×4 instead of ×3 | combo never drops below 25 |
| Fortune | Four-Leaf (chest steps +5 pt) · Geode Sense (rare cells ×2) · Lucky Find (Find drops ×1.5) · Second Look (10 % double chest) | rare drops ×1.5 | chests start one tier higher | every 10th chest is Reliquary+ |

**Duo facets** (gold frame) appear only when the player owns ≥ 2 facets of each of two tags (12 % per offer slot): Thunderclap
(Spark + Quake: every crit triggers a 3×3 blast at 50 %), Payday (Spark + Greed: crits pay ×4 gold), Golden Hour (Greed +
Fortune: golden cells ×3, chests +1 card), Work Song (Crew + Rhythm: crew +1 % per 2 combo, cap +50 %), Foreman's Luck (Crew +
Fortune: the crew finds a chest per 40 rows it clears), Rolling Thunder (Quake + Rhythm: at 50 combo every 10th tap blasts the
row). The sim's bot picks the facet with the highest ΔDPS; E-metrics hold with facets on (E24).

### 5.11 Lucky Moth and boosts

The **Lucky Moth** (a golden moth that crosses the shaft on a sine path in 7 s; the first is scripted at 1:40, then one every
90–180 s of active play on its own clock) pays one of: Gold Shower (60 s of income, 55 %), Moth Frenzy (all damage ×7 for 20 s,
20 %), 3 gems (15 %), Skill refresh (10 %). The **Supply Rope** event offers a Pick of 3 boosts for 60 s: crew ×2, crit +25 pt,
ores ×3, combo never decays, Golden Touch (every 10th tap is a ×20 crit).

### 5.12 Pacing targets and the calibration result

The calibration model is `economy`'s greedy bot (Appendix A) re-run with every depth ×2 and every slope square-rooted
(scratch files: `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/idle/merge/m5.mjs`,
`showk5.mjs`, `weave5.mjs`, `tables5.mjs`; run with `DSCALE=2 CHEST=25`). It taps 5 times a second, buys the best payback
affordable within 60 s and Rekindles and Weaves by rule. It does not model seals, skills, the Surge, events, facets or the side
multipliers, which are margin; `tools/econ-sim.ts` (the TypeScript port) adds them.

**First run (sim, 5 taps/s; target band; a human at 3–5 taps/s must land within ×1.0–×1.6 of the sim time):**

| Depth | Biome | Target | Sim |
|---|---|---|---|
| first purchase | — | ≤ 6 s | 5 s |
| first crew | — | ≤ 12 s | 5 s (the tutorial orders it at 0:08) |
| 20 m | Topsoil | 0:20–0:45 | 0:28 |
| 40 m | Glowroot Caverns (Seal 1) | 0:50–1:40 | 1:09 |
| 80 m | | 1:40–3:00 | 2:00 |
| 120 m | Crystal Grotto | 2:30–4:30 | 3:12 |
| 240 m | Halden Works | 6–10 min | 7:42 |
| 400 m | Fungal Deep | 12–18 min | 15:00 |
| 600 m | Drowned Ruins, Rekindle unlocks | 20–30 min | 24:18 |
| 900 m | Magma Veins | 28–40 min | 33:42 |
| 1,300 m | Fossil Halls | 38–55 min | 45:48 |
| 1,800 m | Frost Hollow | > 90 min (the first wall) | 1:57:30 |

Taps per cell over the first 45 min: p10 / p50 / p90 = 1.2 / 3.2 / 5.2 (the unscaled model gave 2.2 / 5.7 / 9.4). Rows take
1.4–3.6 s for the first 40 minutes. The longest gap between rewards in the first 30 min is 25 s.

**Session model (sim):** one 40-minute first session, then 6 minutes every 2 h from 08:00 to 24:00, offline at 50 % with the
3 / 6 / 12 h caps.

| Time | Record | New biomes | Rekindles / Weaves |
|---|---|---|---|
| 25 min | 600 m | 6 | 1 / 0 |
| 41 min | 1,292 m | 7 (8 at 43 min) | 2 / 0 |
| 4 h | 2,799 m | 10 | 3 / 0 |
| 12 h | 3,887 m | 11 | 6 / 1 |
| day 1 | 4,545 m | 12 | 7 / 2 |
| day 2 | 6,343 m | 14 (Void Sea at 28.7 h, the Gate at 36.8 h) | 13 / 5 |
| day 3 | 7,375 m | Echo I at 2.53 d | 17 / 8 |
| day 7 | 8,336 m | — | 26 / 12 |

- **No Rekindle chains:** zero runs of < 3 minutes in a row over 7 days. After a recommended Rekindle the next run passes the old
  record in 40 s – 33 min (17 of 17 inside L7; the first, at 600 m, takes 9 min after a 25-minute run).
- **The first session is the fireworks:** 8 biomes and 2 Rekindles in 45 minutes. The knob is the 25 in the Ember formula.
- **The long tail must come from Breach and the side systems.** Without Breach the record flattens to +100–350 m a day on days
  4–7. Target with Breach: ≥ +600 m a day and a new Echo stratum at least every 2 days in week 2 (E10).

**Rejected during calibration** (keep the reasons so nobody re-tries them): gold growing faster than HP (a runaway then a hard
wall); the pick at ×2 per 10 levels (one tap per cell, no crack feel); crew lines too generous at unlock (a runaway to 17 km in
10 min); deep lines priced fairly at their unlock depth (a phase transition); compounding or constant penalties on deep lines
(stalls or runaways); Embers on gold as well as damage, or Embers per run (Rekindle chains of 15–80 s runs); a first Rekindle of
5 Embers (the second run slower than the first); a bot that saves for the best ratio regardless of price (purchases froze).

---

## 6. The descent and the world

### 6.1 The engine approach and the camera: decided, and why

| Option | For | Against | Decision |
|---|---|---|---|
| Keep the voxel engine, render a **cutaway diorama** (a geological section at z = 0, deep 3D caverns behind it), perspective camera with a parallel-vertical off-axis projection | reuses the sculpted mesher, real colored light (LightField), the lantern, materials, structures, props, debris, post; real parallax and depth; breaking a cell is real geometry | the world must stream (it is endless) and the old 160 × 128 × 160 zone is too big | **Chosen** |
| A 2D sprite or tile renderer on a canvas | simple, cheap | throws away the engine's whole art investment; flat; no light | rejected |
| An orthographic camera on the voxel scene | no distortion | no parallax: caverns read as flat cut-outs, vistas lose their scale | rejected (the off-axis perspective keeps verticals parallel and cells the same size, which was ortho's only advantage) |
| Keep the third-person camera, add tapping | — | the director rejected it: joystick, free walking, unreadable targets | rejected |

**Why the cutaway works for an idle clicker.** The cut face below the floor is the *promise* (ore veins, chest silhouettes, the
dark mouth of a cavern, the next biome's glow), the dug shaft above is the *history* (the crew, the lamp trail, the plaques, your
planted lanterns), and the floor between them is the *action*. Anticipation is built into the image.

### 6.2 The world window: a ring in y (`src/world/descent/RingWorld.ts`)

| Item | Value |
|---|---|
| Volume | x ∈ [0, 64), z ∈ [0, 64), y a **ring of 160 rows** (10 slabs of 16), 16³ chunks (4 × 10 × 4 = 160, most solid inside, so faceless) |
| The shaft | 7 cells at storage x 28–34. A **cell is 1 m wide, 1 m tall and 3 m deep** (voxels z 0, 1, 2); breaking it sets 3 voxels to air, so a break throws big chunks. The game logic stays 2D (rows of 7 cells) |
| The cut plane | z = 0. Reads at z < 0 return AIR, so every solid voxel at z = 0 shows its front face to the camera as the section. The shaft's back wall is z = 3; alcoves, windows and caverns lie behind it up to z = 63 |
| Rows | depth d occupies world y ∈ [−d − 1, −d); storage row = ((y mod 160) + 160) mod 160; `get()` returns AIR for z < 0 and for y ≥ 0 (the sky), and STONE outside the window |
| Placement | window top = floor + 48 m (3 slabs above), bottom = floor − 112 m (7 below) |
| Memory | blocks 655 KB; light RGBA8 2.6 MB (the old zone: 3.3 MB and 13 MB) |
| Light | the same 64 × 160 × 64 RGBA8 3D texture with `wrapT = RepeatWrapping`. The slab being recycled is filled with BEDROCK and its light zeroed **before** reuse: a solid slab is a perfect light barrier, so LightField needs no ring logic. The slab worker returns blocks, light and openness for the slab plus 16 context rows; the main thread writes the slab, max-merges the context and uploads one sub-box (64 × 32 × 64 × 4 = 524 KB, about 1 ms) |
| Meshing | chunks are keyed by world chunk coordinates (cy unbounded). The 16 chunks of a recycled slab are disposed; the new slab's 16 go to the mesh workers. The mesher reads through RingWorld (`copyPadded`) |
| Edits | a break is 3 `world.set` calls (1–2 dirty chunks; the worker remesh lands a frame later; shards fill that frame, §10.5) and the incremental light fill (0.06–0.1 ms per voxel). More than 24 voxels in a frame batch the light (`LightField.openMany`: one BFS for all opened voxels, ≤ 1.5 ms) |
| Speed envelope | physical descent ≤ **6 rows/s** (a slab every 2.7 s; the worker needs about 50 ms per slab on a phone). Above 6 rows/s held for 1.5 s the **Plunge** renderer takes over until the rate falls below 3 rows/s for 1 s, a never-opened seal comes, or a biome boundary is crossed; the economy keeps simulating at full speed |
| Float precision | render positions rebase by 8,192 m during a gate flash once 8,192 m have been crossed. Every world-space period divides 8,192: macro noise 1/190 → 1/256, boundary wobble 1/3.1 → 1/4, masonry macro 1/38 → 1/32, inscription erosion 1/18 → 1/16, material period 8 m (a unit test lists them) |
| Determinism | a slab is a pure function of (runSeed, slab index); Node and the worker produce byte-identical slabs. `runSeed = hash(saveSeed, runIndex)`: every run has new veins and caverns, while biome starts, seals, Vistas (35 % into each biome) and planted lanterns stay at fixed depths |
| Save | no voxel delta. Everything above the floor in the shaft is air by definition; the save holds the floor row and the 3 rows below it (cell kinds and remaining fractions) and a harvested bitset per cavern id |

**The Plunge renderer** (`src/render/descent/PlungeTunnel.ts`): a 0.15 flash hides the hand-off; three wall quads (back, left,
right) scroll at the plunge speed and paint the strata ramps of the biome being crossed (bands every 2 m, a ±0.3 m noise warp);
every 33 ms an instanced row of 7 impostor shards breaks at the face line (no voxel edits); 300 streaks a second; a vertical
4-tap blur in the composite; the coin river (30 sprites/s) flows to the gold counter; the depth odometer spins; each biome
boundary crossed flashes its name (300 ms); visual speed capped at 30 m/s. Exit: decelerate over 1.2 s to 4 m/s; the voxel window
at the landing depth (generated during the plunge: 8 slabs ≈ 20 ms + light ≈ 11 ms + meshes in the workers; at least 0.6 s of
tunnel, so the rebuild is never seen) snaps in under a 120 ms 0.15 flash; the camera settles on the follow spring; dust ring,
trauma 0.4, "+412 m".

### 6.3 The camera in portrait (`src/render/descent/DescentCamera.ts`; pure math, unit-tested)

| Parameter | Value |
|---|---|
| Width lock | the visible width at the cut plane is `W = clamp(cssWidth / 44, 8.2, 9.6)` m, so **1 m = 44 CSS px** from 360 to 422 px wide (360 → 8.2 m, 390 → 8.86 m, 412 → 9.36 m). The 7 dig cells are 44 px wide and the shaft fills 308 px of 390, leaving 0.9 m of wall each side for rigs, lamps and plaques |
| Distance | D = 12.6 m in front of the cut plane; hFOV = 2·atan(W / 2D) = 38.7° at 390 px |
| Height and pitch | the eye is 3.0 m above the floor row's top edge, **pitch 0**, with an off-axis vertical shift (projection element [9]) that puts the floor's front edge at **52 % of the world region** (y ≈ 400 at 390 × 844). Verticals stay parallel and cells keep their size up and down the screen |
| The floor ledge | the 3 m-deep top face of the floor row shows as a 25 px ledge |
| What is visible | the world renders full-bleed behind the HUD; the world region (taps dig) shows about 5.2 m of dug shaft above the floor and 4.8 m of section below, plus 1.5 m more under the semi-transparent skill row |
| Parallax (screen scale vs the cut) | z = 3 back wall 0.81; z = 10 0.56; z = 30 0.30; z = 60 0.17; backdrop layers at z = 110 / 190 / 320 m: 0.10 / 0.062 / 0.038 |
| Clip planes | near 2 m, far 420 m |
| Row follow | the **follow spring** (ω 9 rad/s, ζ 0.70): a 4.5 % overshoot (2 px), 661 ms to 2 %: a "thunk" per row |
| Tap kick | a 2D **kick spring** (ω 40, ζ 0.45): an impulse of 2.9 m/s toward the tapped cell peaks at 2 px 31 ms later (crit 5.8 m/s, 4 px); offsets superpose, capped at 6 px. Taps never add trauma |
| Shake | trauma T ∈ [0, 1]: offset 0.40 m · T², roll 1.2° · T², 22 Hz gradient noise, linear decay 1.6/s; scaled by the Camera Shake setting; screen-space only (light and picking stay stable) |
| Cavern breakthrough | the face falls more than 3 m: hold 250 ms, fall easing in to a 30 m/s cap with streaks, land with a 0.18 m overshoot and trauma 0.35 |
| Vista dolly | D 12.6 → 24 m over 1,200 ms (inOutCubic), hold 1,600 ms, back in 900 ms; the width lock relaxes to 16.9 m during the shot; taps still dig |
| Sheet open | the target re-frames over 250 ms (soft spring) so the floor sits at 60 % of the strip still visible above the sheet; digging continues |
| Life | a slow ±0.6° yaw sway (period 23 s) and ±0.12 m bob (9 s) keep the parallax of deep caverns alive; column strips are recomputed every frame; off in Reduced motion and on Battery |
| Surface and menu | the camera sits 6 m above the ground with the shaft mouth at 62 % of the height (the same rig; no separate MenuCamera) |
| Reduced motion | no kick, no shake, no dolly (the Vista is a 300 ms crossfade), no breakthrough fall; the follow becomes outCubic over 220 ms with no overshoot |

### 6.4 What one slab contains (`src/world/descent/slab.ts`, run in `slabWorker.ts`)

Passes, in order (a pure function of runSeed and slab index):

1. **Biome per row**, with ragged boundaries: across the 8 rows at a biome boundary each voxel picks the old or new biome by a 3D
   hash against its position in the blend.
2. **Strata:** the biome's 3–4 rock families in dipping beds 3–9 m thick (dip 0–8°), soft and hard lenses (look only), a marker
   bed every 50 m.
3. **Veins:** a 3D noise threshold shapes common and rich ore into seams of 2–6 cells; at least one seam crosses the cut face and
   one the shaft footprint per slab.
4. **Shaft cells:** kinds from the cell table (§5.3); a chest cell every 25 rows on the centre column; the gate row at each
   biome start; rows 0–39 authored for the tutorial (§8.2).
5. **Caverns** (§6.6): alcoves, pockets, grottos, the biome's Vista, geodes, with Poisson spacing; flattened floors; stalactites
   (6–20) and stalagmites (4–12) as cones; at least 3 rows of rock between a grotto floor and the next cavern.
6. **Ruins and structures:** Halden timber and Lantern-bearer masonry (StructureRenderer kinds: columns, stairs, bridge, coping)
   in pockets, grottos and Vistas.
7. **Fill** (§6.6): props, creature anchors, emitters, particle emitters, tappables, under the fill rules.
8. **Shaft dressing:** a lamp every 6 m, rails per biome, a brass depth plaque every 20 m, scaffold anchors every 4 rows.
9. **The glow below:** in the last 40 m above a seal, 4–8 emitter voxels of the next biome's key colour in hairline fissures of
   the cut face, and the row tint blends toward the next biome, so the player sees the next biome coming in the light.
10. **Light budget** per slab (§11.2) and the shaft guarantee: no unbreakable voxel in the shaft footprint, ever.

Output to the main thread: blocks (64 × 16 × 64, transferred), light and openness for slab + context, prop specs, creature
anchors, the tappable list, emitters, the 64 × 16 section-distance rows, Depth Ruler icons and the finds map (for anticipation
glints).

**Block ids.** The existing 1–40 stay. 41–63: shared cells and specials (gem cell, golden cell, chest shell, geode, fossil,
boulder, gate stone, seal stone, rune seal). 64–175: biome blocks, `64 + 8·b + slot` for b = 0…13 with slots hostA, hostB, soft,
hard, oreCommon, oreRich, gem, special. 176–191: new emitters (glowroot green, spore magenta, lime, aqua, lava, resin amber,
ice, white-gold, steel blue, star, void violet, rune cyan, sodium, coral pink, gold, ember red). Echo strata reuse their base
biome's ids with a palette rotation through uniforms.

### 6.5 The biome ladder (`src/idle/config/biomes.ts`)

Looks (accent, fog, exposure, bloom, LUT tint) are in §11.2. ★ marks a new material painter.

| # | Biome | Depth | Rock families | Ores (common / rich) | Creatures (tap 3× to catch) | Signature event | Vista Wonder |
|---|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | 0–39 m | soil, gravel, umber, root wood★ | copper / amber | root grub, burrow beetle, lamp beetle | Root Pull (Mash) | the Halden headframe over the shaft mouth and the cold camp |
| 1 | Glowroot Caverns | 40–119 m | moss, slate, root wood★, glowroot★ (emissive) | tin / jade | glow moth, root crawler, glow toad | Moth Swarm (Catch) | the Rootheart: a glowing root tangle 18 m wide |
| 2 | Crystal Grotto | 120–239 m | slate, deep slate, crystal, echo crystal | quartz / sapphire | echo bat, crystal crab, shard hermit | Crystal Bloom (Mash) | the Hand in the Crystal: a 20 m crystal with a human outline inside |
| 3 | Halden Works | 240–399 m | deep slate, ancient brick, timber, brass★ | iron / silver | rail rat, cart ghost, steam wisp | Pressure Valves (Catch) | the Crusher Hall: 12 m gear wheels turning under the hoist tower |
| 4 | Fungal Deep | 400–599 m | umber, moss, cap★, mycel★ | gold / spore pearl | spore toad, cap snail, puffcap | Spore Burst (Catch) | the Mother Cap: a 60 m mushroom raining spores |
| 5 | Drowned Ruins | 600–899 m | ancient tile, glyph stone, masonry, coral★ | pearl / lapis | glass eel, lamp fish, glass jelly | Pearl Bubbles (Catch) | the Drowned Procession: statues carrying lanterns into the water; the Ember Shrine |
| 6 | Magma Veins | 900–1,299 m | basalt★, obsidian★, magma★ (emissive) | ruby / fire opal | salamander, ash beetle, ember newt | Lava Surge (Mash) | the Forge of the Bearers: a 15 m anvil over a lava river |
| 7 | Fossil Halls | 1,300–1,799 m | bone★, resin★, umber | bone gold / insect amber | fossil crab, bone wyrm, marrow worm | Bone Rattle (Sequence) | the Leviathan: a 200 m skeleton with a lantern hung in its eye socket |
| 8 | Frost Hollow | 1,800–2,399 m | ice★, frost slate★, echo crystal | rime silver / frost diamond | ice moth, frost fox, ice wyrmling | Ice Shatter (Strike) | the Frozen Waterfall and a Halden crew frozen mid-step, lamps raised |
| 9 | The Loom | 2,400–3,099 m | pale ashlar★, glyph stone, ancient brick | lumen crystal / loomstone | thread spider, archivist wisp, loom moth | Thread Weave (Sequence) | the Archive of Light: shelves of identical crystals to the horizon |
| 10 | Iron Core | 3,100–3,899 m | ironbound, deep slate, gear metal★ | mythril / magnetite | iron mite, core ray, clockwork beetle | Gear Lock (Strike) | the Loom's Heart: a beating lodestone winding light into thread (Weave) |
| 11 | Star Heart | 3,900–4,799 m | star glass★, gold rock★, crystal | star shard / plasma pearl | star sprite, nova moth, star jelly | Star Fall (Catch) | the Buried Star: a 12 m sun with a corona among floating rocks |
| 12 | Void Sea | 4,800–5,799 m | void stone★, echo crystal, bedrock | void pearl / null glass | void ray, drift jelly, the Watcher's eye (once a run) | Gravity Flip (Catch) | the Upward Falls and the Watcher: an aurora with an eye |
| 13 | The Gate | 5,800–6,899 m | glyph stone, bedrock, black stone★ | gate stone / sigil ore | gatekeeper, echo of you, rune moth | Rune Lock (Sequence of 8) | the Last Gate, open from the other side, and the Black Stone (Breach) |
| 14+ | Echo strata I, II… | +1,100 m each | the base biome's families, hue-rotated | the base biome's ores as Echo variants | variants (new palette, one part swap) | the base biome's event + the mutator's | the base Wonder with the mutator's overlay |

| # | Warden (holds the seal at the biome's exit) | Weak point (glows every 5 s for 1 s) | Crew line and systems that unlock on entry | Music (mode, bpm) |
|---|---|---|---|---|
| 0 | the Halden Hatch (no Warden: a timber hatch with chains; the tutorial seal at 40 m, HP ×0.5) | the padlock | Shovel Hand, Pick Crew (16 m), Lucky Strike and Dynamite (30 m), Golden Vein event | D major pentatonic, 84 |
| 1 | the Root Knot (a tangle with an amber heart) | three knots light in turn | Mine Cart, Rally, Steady Hand (60 m), gear, Glimmerfall and Moth Swarm, Treasure Mole (80 m), the Lantern Surge | D dorian, 86 |
| 2 | the Prism Warden (a crystal golem) | facets glint clockwise | Steam Drill, Shockwave, Spark and Quake facets, Cave-in, geodes, Gold Rush (180 m), Bellows (180 m), Supply Rope (180 m) | E lydian, 76 |
| 3 | the Crusher (a Halden ore crusher with a boiler) | the pressure valve | Blast Team, Greed facets, Mimic, Overdrive (320 m), Treasure Map (320 m), Halden logs | C mixolydian, 96 |
| 4 | the Mother Spore (a giant puffcap) | spore sacs pulse in turn | Tunnel Borer, Crew facets, Ancient Echo; the Lantern tab shows its teaser ("The Ember Shrine waits at 600 m") | G lydian, 72 |
| 5 | the Drowned Bell (a bronze bell in a water pocket) | the clapper on each toll | Crystal Resonator, Earthquake, Rhythm facets, **Rekindle** | B♭ aeolian, 70 |
| 6 | the Forge-Heart (a magma heart in an obsidian cage) | cooling cracks | Magma Lance, Fortune facets | D phrygian, 100 |
| 7 | the Singing Skull (a titanic fossil skull) | the jaw opens on the high note | Fossil Golem | C♯ aeolian, 66 |
| 8 | the Rime Wyrm (a coiled ice wyrm) | its eyes | Rime Auger | B minor + celesta, 74 |
| 9 | the Loom Keeper (an archive spider of light threads) | thread knots | Loom Weaver | A lydian, 68 |
| 10 | the Escapement (a world-clock) | the tooth at 12 o'clock | Gravity Well, **Weave** | E♭ major, 90 |
| 11 | the Astral Geode (a geode with a sky inside) | stars brighten in turn | Star Forge | E lydian, 74 |
| 12 | the Reflection (a mirror image of your tool) | it copies your last tap column | Void Maw | whole-tone, 60 |
| 13 | the Keeper (a giant lantern-bearer of light) | the flame core | Gate Engine, **Breach** | all eight rune motifs, 64 |
| 14+ | the base Warden re-tinted, with its mutator | as the base | an Echo crew line | the base theme with a key change per cycle |

**Echo strata.** Echo n (n ≥ 1) starts at 6,900 + 1,100 (n − 1) m and replays base biome `1 + ((n − 1) mod 13)` (Echo I is
Glowroot Caverns · Echo I). Emissive keys and the LUT rotate in hue by +37° × n (rock albedos keep their ramps, so stone still
reads as stone); exposure +0.05 n (cap 3.0); bloom strength +0.05 n (cap 1.0). Each stratum carries one **mutator**; a second
stacks from the second cycle (n ≥ 14), a third from the third. The same mutator never lands on the same base biome in two
consecutive cycles. Each stratum brings an Echo crew line, 4 gear cards, a Warden, 6 shiny Finds, 3 creature variants and one
Echo note from a 60-fragment pool.

| Mutator | Rule | Look |
|---|---|---|
| Hollowed | caverns ×2 size, ×1.5 as often | haze −30 %, more vista |
| Rich | ore shares ×2, rock gold lowered so the mix stays at 1.00, rock HP ×1.5 | glints everywhere |
| Molten | 5 % of rock cells are lava: tap to cool (×3 gold); Cave-in becomes Ember Rain | embers, lava falls in the Vista |
| Frozen | a break cracks its neighbours by 20 % (chain shatters) | an ice crust, aurora ribbons |
| Drowned | galleries flooded to 40 %; Catch events twice as often | caustics, rising bubbles |
| Overgrown | glowcaps on every floor; tapping one gives luck (Find drops ×1.5 for 20 s) | magenta and lime in the light budget |
| Inverted | debris and particles fall upward; creatures walk on ceilings; Cave-in becomes Up-fall | upside-down set pieces |
| Starlit | Meteor events (tap within 3 s: a 5×5 blast ×20, 2 gems) | a strip of starry sky in every Vista |

### 6.6 What fills the caverns (the fix for "horribly empty"; `src/world/descent/caverns.ts`, `fill.ts`)

| Kind | Size w × h × d (m) | Frequency | Placement | Contents (minimum) |
|---|---|---|---|---|
| Alcove (back-wall diorama) | 3–6 × 2–4 × 3–8 | 1 per 6–8 m, alternating left and right of centre | in the shaft's back wall (z 3–11), seen through the open shaft above the floor | 2–4 props of the biome kit, 1 emitter, a creature 30 %, a tappable crate or urn 20 % |
| Pocket | 3–6 × 3–5 × 3–6 | 1 per 10–14 m | beside the shaft, cutting the cut plane, so it shows in the section before you reach it | 1 hero tappable (chest 40 %, gem cluster 40 %, fossil 20 %), 2–4 dressing props, 1 emitter |
| Grotto (breakthrough) | 12–24 × 6–12 × 10–30 | 1 per 25–40 m | under the shaft: the floor collapses into it (a 3–12 m freefall) | 1 hero, 3–6 tappables, 6–12 medium and 30–80 small dressing props (instanced), 2–3 emitters, 1 particle emitter, a creature flock or 1–3 critters, a liquid 30 % |
| Vista (the biome's Wonder) | 32–48 × 24–40 × 40–60, its back opened onto the backdrop | 1 per biome, 35 % into it | across the slab | the set piece, 8–14 tappables, a Royal Chest (gem key), a relic shrine, 4–6 halos, god rays, creatures |
| Window | a 3–6 m hole in the back wall | 1–3 per biome | looks into a lit cavern behind the shaft (z 6–50) | the cavern's hero light |
| Geode (secret) | sphere r 2–3.5 | 1 per 80–120 m | behind the cut (z 4–12), touching no other cavern | 20–40 gem cells; a crack glint gives it away; breaking in opens a Strike widget |
| Seal hall | 7 × 3 rows plus a 1 m rim | each biome start | the shaft | the Seal and its Warden; the next biome's glow leaks up in the last 40 m |

**Tappables** (each gives a burst, loot and a sound; all inside the reach band from 6 m above to 10 m below the floor):

| Object | Taps | Reward |
|---|---|---|
| Chest popped out of a chest cell | 1 (opens the roll-up) | §5.8 |
| Gem cluster (`crystalCluster`, recoloured per gem) | 2–4 | rare-cell gold ×8, a 5 % gem |
| Creature | 3 (it moves; flees after 6 s) | 10 s of income, a Bestiary count |
| Fossil slab in the cut face | 5 | a Find (or a level) |
| Halden note / mural | 1 | a Lore entry and a 2-line plate |
| Glowcap, stalactite, urn, Halden crate | 1–3 | small gold; a stalactite plays a note of the biome's scale |
| Your planted lantern | 1 | +2 % damage for this run (stacks) |
| Royal Chest | 1 + a 10-gem key | a Reliquary-floor chest |

**Fill rules** (hard minimums, `tools/fill-scan.ts` checks every generated slab of the first two cycles):
1. No open volume ≥ 27 m³ visible from the camera without a dressing prop or a tappable in it or on its walls.
2. Every cavern floor ≥ 9 m² has ≥ 1 dressing prop per 6 m² (cap 12 medium per cavern).
3. Every cavern has ≥ 1 emitter in the biome's key colour and ≥ 1 tappable.
4. Vein or crystal cover ≥ 8 % of a cavern's wall faces.
5. Every cavern ≥ 50 m³ has an ambient particle emitter.
6. In any 8 m of the cut face below the floor there is ≥ 1 find (a vein crossing, gem, chest, fossil edge or cavern mouth).
7. Nothing decorative inside the shaft footprint, and clear air within 1.5 m of the dig-face rectangle (creatures and particles
   avoid it), so the action is never hidden.

**Density targets per screen** (any 20 m window of descent; W1 checks 2,000 generated rows per biome):

| Measure | Target |
|---|---|
| Caverns, Vistas or windows on screen | ≥ 1 at all times, or ≥ 3 lit alcoves |
| Light sources | ≥ 2, in ≥ 2 hues (the warm human light plus the biome accent) |
| Moving things (crew, creatures, particle groups, falls) | ≥ 4 |
| Interactive or animated things | ≥ 8 |
| Special cells (ore, rare, chest) in the shaft plus exposed walls | ≥ 1 in every 4 rows |
| A tappable reward | in view or within the next 6 rows at all times |
| Empty-floor share in caverns (floor farther than 2 m from any prop or tappable) | ≤ 35 % |

**Per-biome fill** (hero / medium props / liquid):

| # | Hero | Medium props | Liquid |
|---|---|---|---|
| 0 | a tree-root chandelier, 12 m | hanging roots, mushrooms 1 m, Halden crates and barrels | seep water |
| 1 | the Rootheart's offshoots | glowroot curtains, root arches | a dark mirror pool |
| 2 | a 14 m crystal spire with uplight; the Glimmerfall (`Waterfall`) | crystal clusters 1–3 m, stalagmites | a mirror pool |
| 3 | an ore chute, timber headgear and rails | carts, crates, barrels, lantern posts, pickaxe racks | — |
| 4 | an 18 m glowing mushroom | mushrooms 2–5 m, shelf fungi | spore pools |
| 5 | a 16 m builder's head with rune eyes | columns, stairs, gates (structures), urns | a flooded floor |
| 6 | a 30 m lava fall | obsidian spikes, basalt columns | a lava river (emissive) |
| 7 | a 14 m skull, ribs | bones, resin lumps | — |
| 8 | a 25 m frozen waterfall | icicles, ice pillars | an ice sheet |
| 9 | a crystal shelf wall | glass lanterns, looms, threads | — |
| 10 | a 30 m gear wall, turning | pistons, gears, pipes with steam | molten brass |
| 11 | a sunstone shard field | floating islands, star spires | — |
| 12 | floating rock islands | null-glass shards, drifting jellies | an upward fall |
| 13 | rune pillars | monoliths (`abyssMonolith`), rune stones, tablets | — |

### 6.7 Vistas and set pieces (`src/render/descent/VistaBackdrop.ts`, `setPieces/*.ts`)

- **Where:** in a Vista cavern, `get()` returns AIR for z ≥ 64 inside the Vista's rows, so its far side is open; behind it three
  analytic silhouette layers sit at z = 110, 190 and 320 m (High 3, Balanced 2, Battery 1).
- **Geometry:** one quad each (400 × 160 m), drawn after the opaque pass with the depth test on, so they only fill pixels seen
  through the opening. A 1D skyline `h(x)` = 3 noise octaves + a shape term per biome (spires for the Grotto, stepped rectangles
  with lit windows for the Drowned Ruins, arcs for the Fossil Halls, toothed circles turning 0.05 rad/s for Iron Core, inverted
  mounds for the Void Sea).
- **The set piece:** one hero model (VoxBuilder or the structure builders, 2–8k triangles) with light baked into vertex colours
  in the slab worker (AO plus 4–8 coloured point lights); moving parts animate in the vertex shader (gears turn, threads slide,
  ribs breathe glow, the aurora waves).
- **Light:** one soft additive radial glow behind layer 2 (the biome's mystery light); 1–3 god-ray cones (16 segments, scrolling
  noise, depth-faded, one draw); haze cards.
- **The Other Lantern** is placed in every backdrop, far below, for one second of the reveal (§7.8).
- **Cost:** about 30 ALU per pixel, 2–6 draws, ≤ 30k triangles, only while a Vista is in view. The Fossil Halls add a fourth
  card at z = 150: the leviathan silhouette with lit photophores crossing in 40 s every 3 min.

### 6.8 The shaft and the surface (`src/render/descent/ShaftDressing.ts`, `SurfaceSky.ts`)

- **Lamps:** one every 6 m, 4 m above the floor when hung, alternating x ±2.6 on the back wall (a prop, a `LIGHT_LAMP` emitter
  voxel at z 2 and a halo). The receding trail of lamps up the shaft is the visual record of progress; at most 30 lamps on
  screen, instanced.
- **Fixtures per biome:** timber sets every 10 m (Halden Works), rope ladders (Topsoil, Glowroot), brass pipes (Iron Core), ice
  anchors (Frost Hollow), all instanced.
- **The lift cage** runs on the right-hand wall between the floor and the top of the screen with ore sacks, on a 6 s loop whose
  speed is `1 + 0.25·log10(crew DPS)` loops per 6 s (capped at ×3): the economy on screen.
- **Brass plaques** every 20 m; **planted lanterns** at each Rekindle depth; the **ghost lantern** of the previous run beside the
  shaft; the **record line** (a violet hairline across the section).
- **The surface** (0–40 m and the menu): open sky above y = 0 (a dusk gradient on the first launch, dawn after a Rekindle), a sun
  glow, a hills card at z = 200; the Halden camp around the shaft mouth (`campfire`, `bedroll`, `crate`, `barrel`,
  `lanternPost`, `hoistWinch` as the headframe); a cool daylight cone falls down the shaft and fades over 30 m, so the circle of
  daylight shrinks above you. By 12 m only the lamplit shaft remains.
- **The camp grows with lifetime Embers** (visible on the menu and at every Rekindle landing):

| Stage | Lifetime Embers | Camp |
|---|---|---|
| 1 | 0 | tents and the winch |
| 2 | 25 (first Rekindle) | a timber headframe |
| 3 | 1e4 | a stone lift tower |
| 4 | 1e8 | a brass lantern tower |
| 5 | 1e12 | the Lighthouse, whose beam shines down the first 100 m of the shaft |
| 6 | 1e16 | the Lantern City on the horizon card |

### 6.9 The foreman, the crew and the tool on screen

- **The foreman** (the existing `ExplorerModel`, kept): stands on the floor row. On each tap it dashes to the tapped column at up
  to 8 m/s with a 0.08 s smear and snaps to the strike pose (no wind-up), recovering over 140 ms; taps closer than 0.12 s apart
  play the flurry pose; when the row drops it falls with it (arms out on a cavern freefall) and lands with a squash. From pick tier
  5 it points and the ghost tool strikes. Its lantern, on a pole 1.6 m above the floor, is the engine's one dynamic light (the
  existing `LanternField`, radius 9 m, intensity 1.35): it pins the warm pool on the dig face in every biome.
- **The crew** (`src/render/descent/CrewRenderer.ts`): the 6 highest owned lines are drawn as instanced models, `1 + floor(L/25)`
  per line up to a cap (lines 0–2: 4, lines 3–5: 3, lines 6+: 2), 24 at most, on scaffolds and ledges in the 4 rows above the floor
  and on the side walls; every lower line becomes a swarm of instanced lights on the walls (≤ 256 sprites, brightness by its DPS
  share). Each line's leader carries a brass "×143" plate. Rigs gain a lantern on the helmet at ★1, gold trim at ★3, a glow at
  each crown. Deep lines escalate into spectacle (a magma beam, a bone fist, a loom of light, a gravity lens, a star furnace, a
  void mouth, the Gate's engine), scaling ×1.15 per Echo line. Rigs never cover the dig-row rectangle.
- **Creatures** (`src/render/descent/Creatures.ts`): 4 rigs (crawler, flyer, swimmer, floater) × a part grammar give 42 kinds
  and their Echo variants; instanced with vertex animation from a per-instance phase; flock members ≤ 60 triangles, solo ≤ 300;
  tap bounds for picking; at most 12 solo and 2 flocks alive on Balanced; they avoid the dig rectangle.

---

## 7. Discovery, collections, events and the mystery

### 7.1 Seals and Wardens (the thrill at every biome boundary; `src/idle/model/seals.ts`)

- **First time ever** (lifetime, saved per biome): the floor becomes a carved slab across the 7 cells with chains, its rune band
  lit and its Warden bound into it; a 30 s timer ring, an HP bar and a tension drum layer. **Seal HP = 20 s × (crew DPS + 4 ×
  tap damage without crit) measured on arrival**, × 0.5 for the tutorial Halden Hatch. Taps and the crew both apply; skills and
  the Surge count. The weak point glows every 5 s for 1 s (×5 damage while lit). At 25 % HP a **Strike** finisher appears
  (perfect = a ×10 hit). An active player at 4–5 taps/s wins in about 12–20 s; the crew alone cannot (about 45 s), so the seal
  waits for the player.
- **Win:** hit-stop 120 ms, slow motion 0.25× for 350 ms, the slab shatters into 60 large shards, light floods up from the next
  biome, then the T5 reveal (§10.8). Rewards: the Warden's relic (a Find), a Crystal-floor chest, 5 gems, +150 XP, a facet hand
  (from the second seal on).
- **Fail:** "The seal holds · 64 %" — it keeps 50 % of the damage dealt, the BEST card glows, and tapping the seal starts again at
  once. Nothing is lost (L11). Offline, the crew stops here (L10).
- **Charted gates** (a seal already opened in a previous run): a gate row of 7 cells at ×3 HP with the frieze; breaking it plays a
  T3 gate flash (1.2 s): the biome title chip with the split time ("Crystal Grotto · 1:12 · −4:40"), and a facet hand. Digging
  never stops.

### 7.2 Events: the Director (`src/idle/model/director.ts`, pure and seeded)

The Director schedules beats on top of the generated content so the screen never goes quiet:

- **Cadence:** one event every U(40, 70) s of active play (input in the last 10 s), never two at once, never during a seal, a T4
  or T5 ceremony or the first second of a Surge. Relics and Feats can shorten it to 25 s minimum.
- **Deck rules:** biome weights (below); the same type never twice in a row; every unlocked type at least once in any 10
  consecutive events (rotation pity); a type unseen for 12 events gets weight ×3.
- **Idle-friendly:** after 20 s without a tap only waiting events are dealt (Supply Rope, Treasure Map, Geode); catch events are
  held back.
- **Find guarantee:** if no new tappable or find has entered the view for 10 s of active play, a micro-surfacing spawns within
  1 s (a gem glints out of the wall, a critter crawls out of a crack, an ore pebble rolls down the shaft).
- **Boredom breaker:** no special cell broken for 25 s while tapping → the next 2 rows get one; no beat for 70 s → the deck is
  dealt now.
- **Announced:** an upcoming event shows on the Depth Ruler 10 s before; the first time a type spawns, a first-time card says
  what to do (§8.8).

| # | Event | Unlock | Window | Verb (widget) | Reward | If ignored |
|---|---|---|---|---|---|---|
| 1 | Lucky Moth | its own clock: scripted at 1:40, then every 90–180 s of active play; it waits (≤ 10 s) for a live event to end | 7 s | tap once (Catch) | §5.11 | it flies off |
| 2 | Golden Vein | 30 m | the next 5 rows | dig (passive) | 3 cells per row turn golden: ×20 gold | — |
| 3 | Glimmerfall | 40 m | 4 s | catch 5–9 falling crystals (Catch) | each 3 s of income; 1 in 5 is a gem | they shatter on the floor for 25 % |
| 4 | Moth Swarm | 40 m | 8 s | tap 6–10 moths on curved paths (Catch) | each 8 s of income; all = ×3 and a Bestiary stamp | they leave |
| 5 | Treasure Mole | 80 m | 5 s | tap the mole 3–5 times as it pops between wall niches | a Copper-floor chest | it hides |
| 6 | Cave-in | 120 m | 1 s warning + 6 s | tap 3–5 falling boulders, 1–3 taps each | each 10 s of income; all = 1 gem | they land as boulder cells (×3 HP, ×3 gold): never a loss |
| 7 | Supply Rope | 180 m | waits 20 s | tap the crate, then Pick 1 of 3 boosts (60 s) | §5.11 | it is winched away |
| 8 | Mimic Chest | 240 m | 6 s | tap the hopping chest 5 times | a Crystal-floor chest | it burrows, leaving a Wood chest |
| 9 | Treasure Map | 320 m | — | a dotted line to a buried chest 6 rows down; dig to it | a Crystal-floor chest | — |
| 10 | Ancient Echo | 400 m | 6 s | tap 3–4 runes on the back wall in the order they lit (Sequence) | a Lore fragment and 10 gems | they fade |
| 11 | Geode | a rare cell from 120 m | while exposed | 3 needles (Strike) | perfect: a rare Find + 5 gems; good: a Find roll; miss: 2 gems | it waits in the rock |
| 12 | Biome signature | per biome (§6.5) | 6–10 s | a themed widget | 60 s of income and a Find roll | — |
| (13) | Meteor | Starlit mutator | 3 s | tap it as it falls | a 5×5 blast ×20 and 2 gems | it lands harmlessly |

| Weights | B0 | B1 | B2 | B3 | B4 | B5+ |
|---|---|---|---|---|---|---|
| Golden Vein | 14 | 12 | 12 | 10 | 10 | 10 |
| Glimmerfall | — | 16 | 14 | 10 | 10 | 10 |
| Moth Swarm | — | 18 | 8 | 6 | 6 | 6 |
| Treasure Mole | — | 10 | 12 | 12 | 10 | 10 |
| Cave-in | — | — | 12 | 14 | 10 | 10 |
| Supply Rope | — | — | 10 | 14 | 10 | 10 |
| Mimic / Treasure Map | — | — | — | 12 | 10 | 10 |
| Ancient Echo | — | — | — | — | 10 | 10 |
| Signature | 10 | 12 | 12 | 12 | 14 | 14 |

### 7.3 Mini-game widgets (5 reusable widgets, one-tap verbs, `src/idle/model/widgets.ts` + `src/ui/idle/widgets/*`)

| Widget | Mechanic | Numbers | Used by |
|---|---|---|---|
| **Catch** | targets cross on curves; tap each | 44 px hit radius, 0.9–2 s on screen each | moths, crystals, boulders, bubbles, stars, the Lucky Moth |
| **Mash** | tap the target as fast as possible | 4–5 s; tiers at 15 / 25 / 40 taps | Root Pull, Crystal Bloom, Lava Surge |
| **Strike** | a needle sweeps a brass arc (0.9 s per pass); tap to stop it | perfect zone 8 % (×5), good 25 % (×2), else ×1; up to 3 needles | geodes, seal finishers, Ice Shatter, Gear Lock |
| **Sequence** | 3–8 marks light in order; tap them back in order | 0.5 s per mark shown; a wrong tap restarts the sequence once | Ancient Echo, Bone Rattle, Thread Weave, Rune Lock |
| **Pick** | 1 of 3 cards flip in; tap one | rarity-weighted | Supply Rope boosts, facets |

Every widget is skippable, never blocks digging outside its target, and never removes anything when missed.

### 7.4 Contracts and daily (`src/idle/model/contracts.ts`, `daily.ts`)

- **Contracts:** always 3 on the Board. Each is generated from a template so that it takes 90–240 s at the player's live rates
  (cells/s, ore/s, events/min, rows/s), and one of the three always points at a mechanic not used in the last 15 minutes
  (guidance in disguise). Templates: break N cells; break N ore of a kind; reach depth; catch N; open N chests; land N crits; reach
  a combo; buy N levels; use a skill N times; break a seal; catch a creature; find a Find; earn gold; perfect Strike; pass your
  planted lantern. **Rewards:** 3–8 gems and 2 min of income. Every 5th contract is a **Grand Contract**: a Crystal-floor chest,
  15 gems and a Time Crystal. A finished contract is replaced at once (no waiting, no timers); a reroll costs 2 gems.
- **The Daily Lantern Chest:** a Crystal-floor chest on the first launch of each local day (the first one is free at 75 m in
  session 1, so the player learns the loop).
- **The 7-day Lantern Calendar:** Copper chest · 30 gems · Crystal chest · 2 facet rerolls · Lantern Oil · 60 gems · Reliquary
  chest. **A missed day pauses the calendar; it never resets.**
- **Clock safety:** if the clock moved back, daily items hold until it catches up; nothing is taken away. No network, no
  server time.

### 7.5 The Codex (collections; `src/idle/model/codex.ts`)

| Section | Per biome | Source | Effect |
|---|---|---|---|
| **Finds** | 6: 2 minerals, 2 fossils, 2 relics | minerals from rare cells and geodes; fossils from fossil cells, slabs and Cave-ins; relics from Reliquary+ chests, the Warden, the Vista's relic shrine | +3 % to one stat of its biome (crew, taps, gold, crit, offline or chests); each duplicate is +1 level (+1 %), no cap |
| **Bestiary** | 3 creatures | tap a creature 3 times (caverns, alcoves, events) | catch tiers 1 / 10 / 100 / 1,000 / …, each +2 % gold (per species, no cap) |
| **Lore** | 3 Halden notes, 1 mural, 1 seal card | notes on the back wall (tap to read), the Vista's mural, the first seal break | the mystery (§7.8) |

- **A complete biome page** (6 Finds, 3 creatures, 5 Lore = 14 entries) grants a **Biome Seal**: +10 % gold and +10 % power,
  permanent, stamped on the Ladder.
- **Codex chests:** every 10 entries a Crystal-floor chest; the header always shows "Next chest at 70 (3 to go)".
- **Pity:** if a biome page is incomplete and no new entry has dropped in 6 minutes of active play there, the Director plants a
  geode or a fossil cell in the next 6 rows.
- **Drop odds per eligible break:** common entries 1/40, uncommon 1/250, rare 1/1,500 (Lucky Find and Fortune facets multiply).
- **Presentation:** a grid of octagon plates per biome; undiscovered entries are dark silhouettes with a hint ("Crystal Grotto ·
  geodes"); a first find plays a 0.6 s turntable of the specimen sprite (`ui/sprites.ts` `itemRaster` style, procedural) with a
  NEW stamp. 14 biomes × 14 = 196 entries, plus shiny variants per Echo stratum.

### 7.6 Feats (the achievements; `src/idle/model/feats.ts`)

20 families with tiers I–X; past X every family continues forever (each threshold ×3, or ×10 for counting families). **Every
tier gives +1 Mark** (+1 % damage and gold, the Feats group of §5.6), gems (5 × min(tier, 10)) and 30 XP. Tier V unlocks a
cosmetic (a trail, a pick skin, a counter frame or a lantern flame). Tier X unlocks the family's permanent perk. The Feats sheet
sorts by closeness to the next tier; the top three rows carry a progress glow and a "93 %" label (the "almost there" engine).

| # | Family (counter) | Tiers I → X | Tier X perk |
|---|---|---|---|
| 1 | Delver (deepest depth) | 20, 80, 240, 600, 1,300, 2,400, 3,900, 5,800, 8,000, 10,000 m (then +2,000 m) | Head Start +5 % |
| 2 | Breaker (cells broken) | 100, 1K, 10K, 50K, 250K, 1M, 5M, 25M, 100M, 1B | broken cells splash 10 % to neighbours |
| 3 | Spark (crits) | 10, 100, 1K, 5K, 25K, 100K, 500K, 2M, 10M, 50M | crit chance +3 pt |
| 4 | Rhythm (best combo) | 10, 25, 50, 75, 100, 150, 200, 300, 400, 500 | combo window +0.2 s |
| 5 | Tinkerer (levels bought) | 25, 250, 1K, 5K, 20K, 50K, 100K, 250K, 500K, 1M | upgrade costs −5 % |
| 6 | Starwright (★ earned) | 1, 10, 50, 150, 400, 1K, 2.5K, 5K, 10K, 25K | each ★ also gives +1 % gold for the run |
| 7 | Forgemaster (pick tier in one run) | 2, 3, 4, 5, 6, 8, 10, 12, 14, 16 | start every run at pick tier 2 |
| 8 | Foreman (crew lines hired in one run) | 2, 4, 6, 8, 10, 11, 12, 13, 14, 15 | crew ×1.5 |
| 9 | Lockpick (chests opened) | 5, 25, 100, 250, 500, 1K, 2.5K, 5K, 10K, 25K | +1 card per chest |
| 10 | Lucky Lamp (chest rarities) | Copper+, 5 Crystal+, Reliquary+, 10 Crystal+, 5 Reliquary+, Lintel, 25 Reliquary+, 3 Lintel, 10 Lintel, 25 Lintel | chest steps +2 pt |
| 11 | Démesure (gold in one run) | 1e6, 1e12, 1e24, 1e33, 1e48, 1e63, 1e100, 1e150, 1e200, 1e303 | gold ×2 |
| 12 | Kindler (Rekindles) | 1, 3, 5, 10, 20, 35, 50, 75, 100, 150 | Embers +10 % |
| 13 | Ember-born (Embers ever held) | 25, 100, 1K, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15 | the Ember bonus 10 % → 11 % |
| 14 | Collector (Codex entries) | 10, 25, 50, 75, 100, 125, 150, 175, 196, 250 | each entry +0.5 % power |
| 15 | Wayfinder (biomes revealed) | 2, 4, 6, 8, 10, 12, 14, Echo I, Echo III, Echo V | every reveal grants a Crystal chest |
| 16 | Overseer (crew hours offline) | 1, 8, 24, 72, 168, 336, 720, 1,500, 3,000, 6,000 | offline efficiency +25 pt |
| 17 | Wonderstruck (events caught) | 5, 25, 75, 200, 500, 1K, 2K, 4K, 7K, 10K | events 25 % more often |
| 18 | Kindred (creatures caught) | 1, 10, 50, 150, 400, 1K, 2.5K, 5K, 10K, 25K | creature rewards ×2 |
| 19 | Swift (fastest to 600 m in a run) | 20, 12, 8, 5, 3, 2 min, 90, 60, 45, 30 s | Head Start +5 % |
| 20 | Contractor (contracts done) | 3, 15, 50, 150, 400, 1K, 2.5K, 5K, 10K, 25K | a 4th contract slot |

**Secret feats** (shown as "???" with a one-line hint; 5 Marks and 25 gems each): Lamplighter (open your first chest),
Overkill (one hit of 1,000× a cell's HP), Clean Sweep (one tap clears a row), Patience (return after 8 h or more away), Night
Owl (play between 00:00 and 04:00 local), Bare Hands (reach 240 m in a run without hiring crew), Hands Free (gain 50 m with no
tap for 10 minutes), Full Set (a 6-facet set), Moth Friend (catch every moth of a swarm), Cataclysm (all four skills within 5 s),
Echo of Halden (read all 42 Halden notes), The Answer (break the Keeper's seal at the Gate).

**Earn rate targets** (sim session model): ≥ 12 tiers in the first 30 minutes, ≥ 25 by the end of day 1, ≥ 50 by the end of day
3; Lintel-grade tier X from about day 3 (Delver, Wayfinder) to months (Breaker, Lockpick).

### 7.7 Rank, records, the ghost race and planted lanterns

- **Rank** (`src/idle/model/rank.ts`; never resets): XP from everything (cell 1, ore or rare 3, chest 20/40/80/160/320 by tier,
  purchase 1, ★ 10, pick tier 50, first biome 100, charted gate 20, first seal 150, Feat tier 30, event 15, contract 40).
  `need(r) = 120 · r^0.78` XP, so rank 2 comes at about 0:30, rank 5 at 4 min, rank 10 at 15 min, rank 20 at 55 min, rank 50 at
  5 h and rank 100 at 17 h of play; the gap grows from 0.9 min to 18 min, so a rank-up is always "soon". **Rewards:** +0.5 % to
  all per rank, 2–10 gems, a Copper-floor chest every 5 ranks, a cosmetic every 10, and a title every 25 Might ranks (Scratcher,
  Digger, Delver, Tunneler, Excavator, Deepwright, Stonebreaker, Quakemaker, Starbreaker, Voidwalker, Lintelbearer, Lanternlord,
  then Lanternlord II, III…).
- **Records** (`records.ts`): deepest; fastest to each biome (splits) and to each 500 m mark in a run; biggest single hit; best
  combo; most cells in one tap; best chest; best offline haul; most Embers in one Rekindle. A broken record stamps a violet "NEW
  RECORD" on the relevant HUD element (T1) with a 2-note chime; the Records panel shows the old value struck through.
- **The ghost lantern:** a pale blue lantern on the shaft wall at the depth your previous run had reached at the same run time; a
  chip says "+42 m ahead" (verdigris) or "−8 m" (bone); overtaking it bursts it into blue sparks.
- **Splits:** every biome title shows the run time against your best ("Crystal Grotto 1:12 · −4:40" in green); a green split
  pays 5 gems.
- **Planted lanterns:** every Rekindle plants your lantern at the depth it reached ("Rekindle #3 · 1,624 m"); in later runs you
  pass the trail of your past selves (tap one for +2 % damage for the run).

### 7.8 The mystery: who carried light down, and what is the light below?

**The image.** At the bottom edge of the world view, deep in the haze, there is always a warm point of light: a halo with a soft
pool, pulsing at 0.25 Hz in time with the music's root. It is **the Other Lantern**. It is always **600 m below your record**, so
you never reach it; its colour is absorbed by the haze of the biomes between (amber through Topsoil, pale gold through the violet
of the Void Sea). The Depth Ruler pins its dot at the bottom ("−612 m"). Your planted lanterns are the trail of your past selves
above; the one lantern you did not plant waits below. Players will ask whose it is.

**Delivery,** in this order: the environment first (Vista set pieces, murals, the frozen crew, the procession); Halden notes (2–4
lines, 3 per biome, on the back wall; tap to read); the seal card (4 lines, 6 s, skippable, on the first break of each seal);
prestige beats (the Ember Shrine, the Loom's Heart, the Gate). No cutscene is longer than the 3.6 s reveal.

| Biome | What the player sees | One Halden note (of three) | What they now believe | The new question |
|---|---|---|---|---|
| Topsoil Roots | the Halden headframe; a cold camp; a lamp left burning on a crate below the lift | "Day 40. Lamp seen below the lift. Nobody of ours is down there." | someone dug here before | whose lamp? |
| Glowroot Caverns | roots that brighten as your lantern passes; carved lintels in the root cellars | "The roots lean toward the lamp. Like they remember one." | the deep reacts to light | what are they reaching for? |
| Crystal Grotto | the Hand in the Crystal | "The crystals grew after the builders. Along their paths." | crystals grew from the builders' paths | are the crystals something they left? |
| Halden Works | crushers full of glimmer; the foreman's office | "Quota doubled. The crushers sing now. Men walk down at night and do not come up." | the Halden mined the crystals for profit | what made the Halden stop? |
| Fungal Deep | lanterns overgrown with mushrooms, still lit | "Fourteen lamps planted at the Mother Cap. One of them moves." | someone keeps lamps alive down here | who tends them? |
| Drowned Ruins | the Drowned Procession: figures carrying lanterns into the water, the last ones made of light; the Ember Shrine | "They were not fleeing. They were walking home." | the builders went down on purpose; Rekindle relights your lantern from their flame | where is home? |
| Magma Veins | the Forge of the Bearers: lanterns forged by the thousand, in racks | "They made a lamp for every one of them." | each builder carried a lantern | why a lantern each? |
| Fossil Halls | the Leviathan with a lantern hung in its eye socket | "Even the great bones carry a light." | everything down here carries light | who hung a lamp in a skull? |
| Frost Hollow | a Halden crew frozen mid-step, lamps raised toward the deep | "We heard our own voices below. Walking ahead of us." | the Halden followed something | what were they following? |
| The Loom | the Archive of Light: shelves of identical crystals | "We crushed them. We crushed them for lamp oil." | the crystals are the Lantern-bearers, kept as light | what did they become next? |
| Iron Core | the Loom's Heart, a beating lodestone winding light into thread (Weave) | "It pulls the lamps down. It always did." | the deep draws the light down | what pulls? |
| Star Heart | a buried star | "The light at the bottom is the colour of ours." | the light below is your lantern's | is your lantern theirs? |
| Void Sea | the rock ends; falls run upward; the Watcher, an aurora with an eye | "The rock ends. Under it, a sky." | the descent is not into rock but toward something | what is the Other Lantern? |
| The Gate | the Last Gate, open from the other side; the Other Lantern is a lantern held by a figure of light with your shape (Breach) | "It is not a lamp. It is a door, held open. By you." | every Rekindle is you answering yourself | (it never closes) |
| Echo strata | the biomes return re-tinted; your planted lanterns appear in them as someone else's | one Echo note per stratum, recombined from 60 fragments | the deep remembers your descent | what remembers? |

The Halden notes, murals, seal cards and Echo fragments (42 + 14 + 14 + 60) live in `src/i18n/en/idleLore.ts`.

---

## 8. Guidance: the tutorial, the always-visible objective, nothing unexplained

### 8.1 Principles

1. **Teach by doing.** One verb at a time, one line of text (≤ 8 words), a ghost hand or a glow on the thing itself; every
   instruction completes by doing it, never by an OK button.
2. **No modal in the first 3 minutes,** the world is never paused, and a first launch skips the menu (it goes straight to the
   shaft). The menu exists from the second launch.
3. **Reveal the UI in order** (§8.3). At 0:00 the screen shows the world, the goal bar and one prompt.
4. **Every step has a fallback** after a few seconds of inaction, so nobody gets stuck, and the tutorial cannot be failed.
5. **Nothing unexplained:** every new system, event type and tab shows a first-time card; every locked item says when it unlocks;
   every card has a one-line effect and a delta preview; the Stats panel lists every multiplier.

### 8.2 The first three minutes (`src/idle/model/tutorial.ts`, a pure step machine; times at 5 taps/s)

Rows 0–39 are authored (`src/world/descent/tutorialRows.ts`): copper at row 3 (columns 2 and 5), a chest at row 6, a gem at
row 9, a fossil slab beside the shaft at row 14, a 4 m cavern crossing with three crystal clusters at rows 24–27, a creature
alcove at row 30, the Halden Hatch seal at 40 m.

| t | Trigger | On screen | Text (`idle.tut.*`) | Done when | Fallback |
|---|---|---|---|---|---|
| 0:00 | first launch | the surface at dusk, the Halden camp; the wordmark's lantern-O match-cuts into the shaft lantern (900 ms); one glowing cell; a ghost hand presses it | goal bar: "Tap the rock" | the first cell breaks (HP 100, damage 100) | after 4 s the hand taps it and a ghost break plays |
| 0:01 | first break | burst; one coin flies up; the gold plate drops in with it (snap) | — | — | — |
| 0:02 | 3 breaks | 7 pips on the goal bar | "Clear the row" | row 0 cleared | after 5 s idle the hand points at the nearest cell |
| 0:04 | row cleared | the floor drops 1 m with a thunk; the depth plate drops in ("1 m") | — | — | — |
| 0:05 | gold ≥ 30 | the Pick card rises into quick-buy slot 1 (snap), amber; a focus scrim (0.45) with a hole on it; the hand | "Upgrade your pick" | Pick L2 | the arrow bounces again after 8 s (twice at most); world taps keep digging |
| 0:06 | bought | the strike ghost pumps; "+100 / tap" flies from the card to the pick | — | — | — |
| 0:08 | gold ≥ 50 | the Shovel Hand card in slot 3; the hand | "Hire a Shovel Hand. He digs while you're away" | hired: a miner rappels down, lands with a squash and swings | arrow after 8 s |
| 0:10 | row 3 | two copper cells glint | "Copper! Worth 2.5×" (2.5 s) | — | — |
| 0:14 | row 6 | the chest lid shows; a TAP ring | "Tap the chest" | the chest opens (scripted Wood → Copper step); the gem chip appears | the crew starts hitting it after 6 s |
| 0:20 | Shovel Hand L10 | the first ★: the card flips, "×2"; the buy-mode control appears with NEXT ★ selected and a tooltip | "Every 10 levels: ×2" | — | — |
| 0:28 | 20 m | the first Feat toast (Delver I) and the Feats tab appear; Rank 2 | — | — | — |
| 0:32 | 15 taps in a row | the combo ring appears around the thumb's column | "Tap fast: combo up to ×2" | — | shown on the first 15-combo before 3:00 |
| 0:38 | rows 24–27 | the floor gives way: a 4 m freefall into a lit grotto with 3 crystal clusters | "Tap the crystals" | 3 broken | sparkle rings for 6 s |
| 0:45 | 30 m | Lucky Strike in the Dig sheet; the skill row appears with Dynamite and one free charge; the hand | "Dynamite: blast 3 rows" | used | the button pulses for 10 s |
| 0:55 | 36 m | green light leaks from fissures below; the ruler shows the seal | goal: "Break the Halden Hatch · 4 m" | — | — |
| 1:09 | 40 m | **Seal 1:** chains, a 30 s timer ring, the HP bar, drums | "Break the hatch!" | broken (HP ×0.5) | on failure "Again!" at once; it keeps 50 % |
| 1:12 | broken | **T5 reveal: Glowroot Caverns** (dive, Vista dolly, the title, the light floods up) | — | — | — |
| 1:18 | after the reveal | 4 gear cards fly into the Dig tab (badge); Rally and the Mine Cart blueprint arrive | "New gear: one tap, big boost" | a gear card bought | the Dig tab pulses |
| 1:25 | — | the Surge ring appears around the combo counter, pre-filled to 140/240 | "Fill the lantern" | — | — |
| 1:40 | scripted | the first Lucky Moth crosses slowly (8 s) | "Catch the moth!" | tapped | it crosses once more |
| 1:45 | Surge full | **SURGE ×3**, drums | — | — | — |
| 2:00 | — | the Board tab appears; the contract board slides in with 3 cards | "Contracts: goals that pay gems" | seen (2 s) | — |
| 2:20 | 80 m | the first event, scripted: Glimmerfall | "Catch the crystals!" | over | — |
| 2:40 | the fossil Find | the Codex tab appears with the card turntable | "Finds make you stronger forever" | — | — |
| 3:00 | — | the tutorial ends; the goal bar shows "Reach 120 m: Crystal Grotto"; contextual hints take over | — | — | — |

At about 3:12 the Root Knot seal is the first Warden fight, followed by the first facet hand ("Pick one: it lasts this run").
Steps never overlap: the sequencer holds a prompt until the previous step completes and holds T1–T2 rewards for up to 2 s
around a prompt.

### 8.3 Progressive UI reveal

| Element | Appears |
|---|---|
| goal bar | at 0:00, always |
| gold counter | the first break |
| depth plate | the first row cleared |
| quick-buy slot 1 (Pick) | gold ≥ 30 |
| quick-buy slot 3 (crew) | gold ≥ 50 |
| gem chip | the first gem |
| quick-buy slot 2 (BEST) | when two options first compete (about 0:20) |
| buy-mode control | the first ★ |
| Depth Ruler | 10 m |
| Feats tab, rank badge and XP bar | the first Feat tier / Rank 2 |
| combo ring | the first 15-combo |
| skill row | Dynamite at 30 m |
| Dig and Crew tabs | the first purchase / Pick Crew at 16 m |
| Surge ring | 1:25 (after Seal 1) |
| Board tab | 2:00 |
| Codex tab | the first Find |
| event bubbles | the first event |
| Lantern tab | a teaser at 400 m ("The Ember Shrine waits at 600 m"), live at 600 m |
| menu ≡ | always |

### 8.4 The goal bar (the always-visible objective; `src/idle/model/goals.ts`)

One bar under the top bar, on screen in **every frame of play**, including with a sheet open and during ceremonies: an icon,
one line (≤ 32 characters), a 4 px progress bar, the reward chip and an ETA ("~14 s"). Tapping it goes where the goal is done
(opens the right sheet at the right card, points the ruler at the seal, opens the Codex page).

**Selection** (re-evaluated every 0.5 s; first match wins):
1. a tutorial step (until 3:00);
2. something to claim: the offline haul, a finished Path step ("Claim: Copper chest", auto-claimed after 6 s);
3. a never-opened seal within 40 m: "Break the Root Knot · 32 m";
4. Rekindle (or Weave) recommended: "Rekindle: +273 Embers · ×6.5";
5. the current **Path** step (§8.5) if its ETA ≤ 120 s or its progress ≥ 50 %;
6. the best **near goal**: highest progress in [0.15, 1) with an ETA ≤ 90 s among the next ★ on any card, an affordable-soon gear
   card, the next 20 m mark, the contract nearest completion, the next Feat tier, the next Rank;
7. fallback: the next 20 m mark (always ≤ 90 s while rows take ≤ 4.5 s); when walled, "Upgrade or Rekindle to go faster".

Hysteresis: a goal stays at least 4 s unless it completes. **On completion** the bar fills with a flash, the reward flies to its
counter, and the next goal **slides in without emptying**: the fill morphs from the old value to the new goal's real fill, which
the selection keeps high. Target: median fill ≥ 0.55 and fill ≥ 0.5 for ≥ 65 % of the first hour (E12).

### 8.5 The Path: 30 authored objectives, then Survey Orders

| # | Objective | Reward | # | Objective | Reward |
|---|---|---|---|---|---|
| 1 | Tap the rock | — | 16 | Pick a facet | 10 gems |
| 2 | Clear the row | — | 17 | Catch 5 crystals | 5 gems |
| 3 | Upgrade your pick | 5 gems | 18 | Reach Rank 5 | Copper chest |
| 4 | Hire a Shovel Hand | Wood chest | 19 | Collect 3 Finds | 10 gems |
| 5 | Open the chest | 5 gems | 20 | Reach the Copper Pick (Pick 25) | 10 gems |
| 6 | Reach 20 m | 5 gems | 21 | Reach Halden Works (240 m) | Crystal chest |
| 7 | Get a ★ | 5 gems | 22 | Open a Crystal chest | 15 gems |
| 8 | Use Dynamite | 5 gems | 23 | Crown a crew line (level 50) | Crystal chest |
| 9 | Break the Halden Hatch | Copper chest | 24 | Reach Fungal Deep (400 m) | Crystal chest |
| 10 | Buy a gear card | 5 gems | 25 | Catch a creature | 10 gems |
| 11 | Fill the Surge | 5 gems | 26 | Complete a biome page | Crystal chest |
| 12 | Catch the Lucky Moth | 5 gems | 27 | Reach the Ember Shrine (600 m) | Crystal chest |
| 13 | Hire a Mine Cart | 10 gems | 28 | Rekindle | Reliquary chest |
| 14 | Complete a contract | 10 gems | 29 | Pass your planted lantern | 15 gems |
| 15 | Reach the Crystal Grotto (break the Root Knot) | Crystal chest | 30 | Reach Magma Veins (900 m) | Reliquary chest |

After step 30, **Survey Orders** are generated: the types rotate (depth, buy N levels, own N of the newest line, a Find in this
biome, a creature, an event, a seal or gate, a chest tier), never the same type twice in a row, targeted to an ETA of 60–180 s
at current rates; rewards are 2–5 gems, a Copper-floor chest every third order.

### 8.6 The Depth Ruler and the Ladder (`src/ui/idle/DepthRuler.ts`, `sheets/LadderSheet.ts`)

- **The Depth Ruler** runs down the right edge (x 366–386 at 390 px wide), from 10 m above the floor to 80 m below it; its "you
  are here" notch is aligned with the floor's screen y, so it is part of the world. Ticks every 10 m, labels every 20 m. Icons for
  what the generator placed: chest cells, the next seal (Warden icon and name, "Root Knot · 32 m"), gear and crew blueprints at
  biome starts, Vistas, events announced 10 s ahead, your planted lanterns, the record line, the ghost lantern; at the bottom the
  Other Lantern's dot ("−612 m"). The next milestone glows. It answers "what's next?" without words.
- **The Ladder** (a sheet opened by tapping the depth plate): a vertical, scrollable map of the shaft drawn as a carved stone
  ruler. Header gauges: depth (current and record), Might (`floor(10 × log10(DPS))`) with its title, Codex %. Biome bands in their
  palettes with names and split times; nodes every 20 m (done = brass check, upcoming = bright with the distance, past the record =
  silhouettes with "?"); markers for the lantern (now), the record, the ghost, the planted lanterns and Ember thresholds ("×2 Embers
  at 1,824 m"). The next 3 rewards are pinned at the bottom as chips ("6 m · chest", "14 m · Rock Drill", "39 m · Crystal Grotto").

### 8.7 Contextual hints (`src/idle/model/hints.ts`)

At most one text hint per 20 s; each hint at most 3 times in a lifetime; doing the action retires it; never during a seal, a
reveal or a Surge start; a hint never covers the dig row.

| Id | Condition | Hint |
|---|---|---|
| H1 | no tap for 6 s in the first 30 minutes | the hand pulses over the best target |
| H2 | an affordable BEST card unbought for 15 s | the card pings twice and the hand points at it |
| H3 | a skill ready and unused for 30 s | its ring pulses once |
| H4 | a tappable (chest, creature, event object) in view for 5 s untouched | a sparkle ring around it |
| H5 | a seal appears | "Break it in 30 s · estimate ~14 s" (green, amber or red by the estimate) |
| H6 | a seal fails | "The seal holds · 64 %. Upgrade, then try again" + the BEST glow |
| H7 | Rekindle recommended | the goal bar switches; the Lantern tab glows: "The rock is hardening. Rekindle for ×N power" |
| H8 | a combo lost 3 times between 7 and 12 | "Tap within 0.6 s to keep the combo" (once) |
| H9 | a return with the crew waiting at a seal | the seal card (§4.4) |
| H10 | a tab unlocks | a dot on the tab and a first-time card |
| H11 | offline time capped | "Your crew rested after 3 h. Embers raise the cap" (once) |
| H12 | 45 minutes of continuous play (setting, on by default) | "Your crew keeps digging while you rest: +38 m in 4 h" |

### 8.8 First-time cards

The first time a system, event type, tab, widget, facet tag, mutator or prestige layer appears, a one-line plate slides in under
the goal bar for 2.5 s (no pause, no button): "NEW · Golden Vein — gold in the next 5 rows!". Tapping it opens the matching
Codex "How it works" entry (one illustration and three lines). Every first-time card is listed in the Codex under Guide, so
nothing seen once is lost.

---

## 9. Portrait UI layout

### 9.1 390 × 844 CSS px (safe top 47, bottom 34)

```
y=0    ┌──────────────────────────────────────────┐
       │ status bar / notch                  (47) │
y=47   │ [R7][◉ 12.3K  +45.6K/s][ 312 m  ][≡]     │ top bar row A, 48: rank 48, gold 160, depth 104, menu 44 (48 hit)
y=99   │     [▬▬▬▬▬▭ rank 7 ][◆ 140  ✶ 25 Embers] │ row B, 22: XP bar under gold; gems and Embers chips
y=125  │ [▶ Reach 400 m · Fungal Deep ▮▮▮▮▯ ~38 s]│ goal bar 44 (x 16–374)
y=173  │┊ev┊                                ┊ru┊  │ world region 173–610: taps dig
       │┊  ┊   dug shaft: crew, lamps,      ┊le┊  │ event bubbles x 8–56; Depth Ruler x 366–386
y≈400  │ ════════════ FLOOR ROW (7 × 44) ══════◀  │ the floor at 52 % of the world region
       │      section: ore veins, a chest, glow   │
y=614  │ (×24◔)  [Dyn][Rush][Over][Quake] [Facet×2]│ skill row 56 over the world: combo + Surge ring, 4 skills 52 px
y=674  │ [ PICK  ][ ★ BEST   ][ CREW   ]          │ quick-buy 76: 3 cards 118 × 72, gaps 8
y=754  │ [Dig][Crew][Board][Feats][Codex][Lantern]│ tab bar 56: 6 × 65 px, badges
y=810  │ home indicator                      (34) │
y=844  └──────────────────────────────────────────┘
```

| Element | Rect (x, y, w, h) | Content and type |
|---|---|---|
| Rank badge | 12, 47, 48, 48 | octagon plate, rank in Lintel 17 px, the XP ring as an octagonal stroke; tap → the Rank panel |
| Gold counter | 66, 47, 160, 48 | coin socket 28 px (the flights' target), value Lintel 24 px tabular bone-100, rate 12 px verdigris-300 |
| Depth plate | 232, 47, 104, 48 | value Lintel 22 px amber-300, biome name 11 px brass-300; tap → the Ladder |
| Menu | 342, 49, 44, 44 (48 hit) | settings, records, about |
| XP bar / gems / Embers | 66, 99, 160, 22 / 232, 99, 142, 22 | display; 48 px hit slop opens their panels |
| Goal bar | 16, 125, 358, 44 | §8.4; icon 20, text 15 px bone-100, bar 4 px amber-400, reward chip, ETA 12 px |
| First-time card / toasts | 24, 173, 342, 52 | slides down from under the goal bar |
| Event bubbles | 8, 181, 48 × 56, ≤ 3 stacked | timer ring (SVG stroke-dashoffset) |
| Depth Ruler | 366, 181, 20, 425 | §8.6 |
| Skill row | 0, 614, 390, 56 | combo counter (Lintel 22 px) in the Surge ring (56 px) on the left; 4 skill buttons 52 px with cooldown sweeps; the facet chip on the right |
| Quick-buy | 11 + i·124, 674, 118, 72 | [PICK] [★ BEST] [CREW]: icon 36, name 13, level 12, cost 15, fill bar 3, pips, BEST chip |
| Tab bar | i·65, 754, 65, 56 | icon 24, label 12, badge 16 |

**Rules.** Every tap target is ≥ 48 × 48 px (display rows have 48 px hit slop). Nothing interactive overlaps the shaft column
between the goal bar and the skill row except world entities. Every control except the top-bar plates, the goal bar and ≡ is in the
bottom 45 % of the screen (thumb rule); both top controls are optional shortcuts to things the tabs also reach. Numbers are right-aligned and tabular. Text is ≥ 12 px everywhere. The world renders full-bleed
behind the HUD; a 40 px gradient scrim (slate-950, 0 → 0.85) sits above the quick-buy row and below the goal bar.

### 9.2 Other viewports (stack from the bottom: tab bar 56, quick-buy 76 (68 at 360), skill row 56 (48 at 360), 4 px gaps)

| Viewport (safe top / bottom) | Top bar A + B | Goal bar | World region | Floor y | Quick-buy cards |
|---|---|---|---|---|---|
| 360 × 740 (24 / 16) | 44 + 20 | 40 | 138–540 | 347 | 3 × 108 × 64 |
| 390 × 844 (47 / 34) | 48 + 22 | 44 | 173–610 | 400 | 3 × 118 × 72 |
| 412 × 915 (40 / 24) | 48 + 22 | 44 | 166–691 | 439 | 3 × 124 × 72 |

Cells are 44 px wide on all three. Landscape is not supported in play (the shell locks portrait; `screenFormat.ts` asks for a
portrait lock on the first tap in a mobile browser). On a tablet or desktop the 9:19.5 column is centred with slate side plates.

### 9.3 The layer stack (bottom to top)

| z | Element | Technology | Holds |
|---|---|---|---|
| 0 | `#dd-world` | WebGL2 canvas at native DPR | the scene, the post chain, biome titles carved in light (W3) |
| 1 | `.dd-hud` | DOM | top bar, goal bar, ruler, bubbles, skill row, quick-buy, tabs |
| 2 | `.dd-sheets` | DOM | bottom sheets and their scrim |
| 3 | `.dd-ceremony` | DOM | ceremony plates, reveal cards, the offline plate, the facet hand, widget overlays; sr-only text of WebGL titles |
| 4 | `.dd-toasts` | DOM | Feat toasts and first-time cards, one at a time |
| 5 | `#dd-fx` | Canvas 2D at native DPR, `pointer-events: none` | damage numbers, coin and gem flights with trails, arrival sparkles, purchase sparks and rings, confetti, the combo and Surge flourishes |
| 6 | `.dd-guide` | DOM | the tutorial focus scrim (an evenodd clip-path hole) and the ghost hand |
| 7 | `.dd-crash`, `.dd-gl-notice` | DOM (existing) | system panels |

Tokens fly **above** the HUD (z 5), so a coin lands on the counter socket rather than under the plate. Ceremony dimming is done in
the composite shader (`uDim`), not by a DOM scrim.

### 9.4 Sheets (the tabs)

A sheet rises to a top edge at 42 % of the screen height (354 px at 844) on the soft spring (263 ms); rows stagger 24 ms with an
8 px rise. The world stays visible above it, the floor re-frames into that strip and **taps there keep digging**. Tapping the
open tab again, a swipe down (optional, never required) or Back closes it. Lists are virtualised past 30 rows. The header (44 px)
holds the buy-mode control ×1 / ×10 / NEXT ★ / MAX where it applies.

| Tab | Contents |
|---|---|
| **Dig** | the facet belt (6 tag gems); gear cards of the current biome; Pick, Rally, Lucky Strike, Shockwave, Steady Hand, Bellows; the 4 skills' levels; locked teasers |
| **Crew** | a total DPS header; every unlocked line (rows 72 px: icon, name, level, ★ pips, "1.2M → 1.5M DPS", the buy button 96 × 48); the next line's silhouette ("Unlocks at 240 m"); auto-buy toggles once owned |
| **Board** | the 3 contracts; the Daily Lantern Chest; the 7-day calendar; the Chest Rack; Time Crystals (Warp) |
| **Feats** | Feats sorted by closeness; secret feats as "???"; the Rank track with its next rewards; Claim All |
| **Codex** | biome pages (Finds, Bestiary, Lore), Biome Seals, "Next Codex chest at 70 (3 to go)", the mystery ("The Deep Calls: 42 %"), the Guide (how each system works) |
| **Lantern** | Rekindle (projection, perks vine), the Loom (Weave and nodes), Breach (challenges and Sigils), Records, the Stats panel (every multiplier, sorted by size), Ladder shortcut |

**Settings** (≡): sound, music, ambience; haptics (Off / Light / Normal / Strong); camera shake (0–100 %); motion (Full / Reduced /
Off); flashes (On / Soft / Off); number format (Letters / Scientific / Engineering); quality (Battery / Balanced / High, Auto);
brightness; text size (Normal / Large); high contrast; left-handed (mirrors the skill row and the ruler); break reminder; auto-pick
facets and auto-buy toggles (when unlocked); replay hints; About; privacy.

### 9.5 Brand and accessibility

- "Lamplight on the Lintel": octagon brass plates (`CUT` tokens), slate fills at 0.72 alpha over the world and 0.94 for sheets, the
  Lintel display face (tabular digits), the `RARITY` tokens plus `mythic`. **Registers:** amber = values, kit and buying; cyan =
  discovery and the builders' script; violet = records, relics, prestige and the unknown; red = only a seal timer under 5 s, never
  "can't afford" (that is bone-500).
- All text pairs keep WCAG AA (the `TEXT_PAIRS` test, extended with the HUD over the brightest biome capture and `mythic`). HUD text
  has a 2 px carve outline (#04070b).
- Large text scales the HUD ×1.15 (the dock grows 12 px, the world region shrinks). High contrast: plate alpha 0.9, 2 px outlines.
- An `aria-live` region announces biome reveals, Feats and purchases of milestones; every button has an accessible name.

---

## 10. Juice and feel

### 10.1 Rules

1. **Impact first** (L1): the frame after `pointerdown` shows the hit: flash, crack, number spawn, strike pose and smear, kick
   impulse, sound and haptic issued. The swing that "already happened" is drawn as a smear.
2. **The peak lands with the sound:** the face pop and the camera kick peak 2 frames after the tap (31–40 ms), where Android Web
   Audio output arrives; the number's own pop peaks at 95 ms as the follow-up beat. Ceremonies schedule their audio ahead:
   `start = ctx.currentTime + (tPeak − now) − baseLatency − 0.02 s` (WebView 88 has `baseLatency`, not `outputLatency`).
3. **Gains travel** (L8): gold, gems, XP, Finds and Embers move from where they were earned to where they are kept; the counter
   changes when they **arrive** (the display ledger, §10.6).
4. **Counters roll, never jump:** a displayed value changes by at most ×1.5 per frame, except during a scripted count.
5. **The more frequent, the smaller** (L9): every response belongs to one tier of the ladder (§10.2) and stays inside its caps.
6. **Anticipation scales with rarity:** anything rarer than once per 10 s gets a 120–1,800 ms wind-up; anything more common gets
   none.
7. **Never block the thumb:** no animation swallows input; a tap during a hit-stop ends it in that frame; every ceremony can be
   skipped from 400 ms; digging resumes under a T5 after 1,200 ms.
8. **Every purchase shows in the world** within one frame (§5.5).
9. **Crisp at any DPR:** text is vector (Lintel in the DOM, glyph sprites rasterised at device size on the FX canvas, SDF for
   WebGL titles); pixel-art icons at an integer texel scale; the final image is composed at native resolution (§11.3).
10. **Respect** (L12): three motion levels, a flash setting, the shake slider; ≤ 2 full-screen flashes a second, never red.

### 10.2 The response ladder (`src/game/fx/juiceBudget.ts`, pure)

| Tier | Name | Typical rate | Max duration | Footprint | Wind-up | Hit-stop | Trauma | Full-screen flash | Blocks input | Examples |
|---|---|---|---|---|---|---|---|---|---|---|
| T0 | Ambient | continuous | loops | anywhere, ≤ 2 % luminance swing | — | — | — | — | no | motes, glint sweeps, BEST breathing, crew loops |
| T1 | Tick | ≥ 2/s | 150 ms | ≤ 60 px radius | 0 | 0 | kick only | — | no | tap crack, coin arrival, digit roll |
| T2 | Pop | 0.2–2/s | 400 ms | ≤ 160 px radius | 0 | ≤ 40 ms, rate-limited | ≤ 0.25 | — | no | cell break, crit, purchase, ready ping, row clear |
| T3 | Burst | 1 per 10–60 s | 1,400 ms | ≤ half the screen | 0–450 ms | ≤ 60 ms | ≤ 0.45 | ≤ 0.12 | no | ★, crown, rank-up, Wood–Crystal chests, Feat toast, combo tier, Surge, charted gate, facet hand |
| T4 | Ceremony | 1 per 2–10 min | 2,400 ms | full screen, the world dims | 300–1,800 ms | ≤ 120 ms | ≤ 0.6 | ≤ 0.30 | skippable from 400 ms | pick tier, Reliquary and Lintel chests, number milestones, Warden break |
| T5 | Spectacle | 1 per 5–30 min | 4,000 ms | full screen, the camera moves | 0–600 ms | ≤ 160 ms | ≤ 0.8 | ≤ 0.35 (Rekindle 0.40, ramped) | digging resumes after 1,200 ms | first biome reveal, Rekindle, Weave, the return feast, Googol |

Exclusivity: one T4 or T5 at a time; others queue for at most 6 s, then play in their T3 form. While one runs, T1–T2 effects play
at 50 % particle counts and toasts wait. T2 events are rate-limited to one hit-stop per 300 ms; T3 to 1 per 1.5 s (excess merges:
"×3 ★"); T4 to 1 per 30 s (queued; a small stack icon shows the queue).

### 10.3 The master cue table (`src/game/fx/juice.ts`, played by `src/game/fx/JuiceDirector.ts`)

Particle counts are Balanced (High ×1.6, Battery ×0.4). G = GPU particles (dust / sparks / glints); Sh = shards. Local flashes are
≤ 80 × 80 px; "full" flashes obey §10.13. Haptic patterns are in ms.

| Event | Tier | Hit-stop | Trauma / kick | Flash · bloom + | G | Sh | Number / UI | Sound | Haptic |
|---|---|---|---|---|---|---|---|---|---|
| Tap, no break | T1 | — | kick 2 px | local 0.6, 60 ms | 4/2/0 | — | 18 px bone-100, +4 px per decade over the biome median, cap 38 | material hit ±6 % pitch, +1 semitone per 5 combo (cap +12) | 10 (≥ 60 ms apart) |
| Crit | T2 | 30 ms ¹ | 0.25, kick 4 px | local 0.9 amber 90 ms · +0.15 (100) | 4/10/4 | 2 | ×1.35 size, amber-300, "!" | crit crack + 55 Hz thump | 14 |
| Cell break (rock) | T2 | — | 0.18 | — | 16/6/0 | 8 | loot tokens | break on the pentatonic ladder + a tick on arrival | 18 |
| Ore / rich break | T2 | 30 ms ¹ | 0.20 | local 0.5 accent · +0.2 (120) | 16/8/10 | 10 | tokens; the gold number | chime pitched from the value | 22 |
| Gem / geode break | T2 | 40 ms ¹ | 0.22 | local 0.7 rune-200 · +0.25 (150); rays 0.2 | 16/8/18 | 10 | the gem in rune-200 | crystal ring | 10, 30, 18 |
| Pierce (per cell) | E2 | — | +0.04 | — | 6/4/0 | 6 | "×N" chain counter | +2 semitones per cell | 10 |
| Column burst | E3 | 30 ms ¹ | 0.30, kick 4 px | pillar HDR ×4 180 ms · +0.2 (150) | 24/16/6 | per cell | the big number | low boom | 26 |
| Row wipe | E4 | 50 ms | 0.40 | +0.3 (200); screen shock 0.007; chroma 0.003 | 48/24/0 | governed | the row total | boom + rattle | 30 |
| Row clear | T2 | — | 0.12 | — | a dust skirt of 32 | — | "+1 m" on the ruler | a chord on the ladder + a low thunk | 16 |
| Leftover crumble | T2 | — | — | — | 8 per cell | sink and dissolve | tokens | gravel slide | — |
| Cavern breakthrough | T3 | — | 0.35 on landing | — | 64 dust | 24 | — | rumble, then a reveal pad | 30 |
| Combo tier 10 / 25 / 50 | T3 | — | 0.15 | +0.1 (200) | a ring + 24 glints | — | the combo stamp | rising chime, a step per tier | 12 |
| Combo lost (≥ 10) | T1 | — | — | — | — | — | the counter dissolves | soft fizz −18 dB | — |
| Lantern Surge start | T3 | 60 ms | 0.35 | full 0.12 amber · +0.2 sustained; rays 0.3 600 ms | 60 embers | — | "SURGE ×3" stamp | gong; the drum layer enters | 20, 30, 20, 30, 40 |
| Dynamite / Earthquake | T3 | 60 ms | 0.45 / 0.6 | local 0.4 r 200 px · +0.3 (150); screen shock 0.010 | 40/80/0 + 24 embers | governed | the blast total | 45 Hz boom + noise burst | 30, 20, 40 |
| Cataclysm | T4 | 80 ms | 0.55 | full 0.30 white | 120 glints | — | "CATACLYSM ×2" | all four skill sounds as a chord | 40, 30, 60 |
| Lucky Moth / event caught | T3 | 40 ms | 0.20 | local 0.6 gold · +0.2 (200); rays 0.3 | 0/20/30 | — | the reward | bell | 12, 40, 12 |
| Creature caught | T2 | 40 ms | 0.12 | local 0.5 · +0.1 (100) | 0/12/12 | — | "×N gold" | creature chirp | 16 |
| Chest exposed | T2 | — | — | the seam leaks light | — | — | a TAP ring | creak + sparkle | 10 |
| Chest roll-up step | T3 | 40 ms | 0.10 × step | seam light; rays 0.25 × step 400 ms | a ring + 12 glints (tier colour) | — | — | +4 semitones per step | 12 × step |
| Chest open (Wood → Lintel) | T3–T4 | 0/40/60/80/120 ms | 0.10–0.55 | full 0/0/0.12/0.20/0.30 | 30/60/100/160/240 | — | contents fly | pop → choir | 16/20/28/40/[40, 30, 60] |
| Purchase | T2 | — | — | — | FX: 14 sparks + a ring | — | the delta chip | brass ka-ching on the purchase arpeggio | 8 (≥ 80 ms apart) |
| Card ready ping | T2 | — | — | — | — | — | — | tink, pitch by card | 6 |
| ★ milestone | T3 | 50 ms ² | 0.15 | local on the rig · +0.2 (200) | FX 24 gold sparks; 30 glints on the rig | — | "★ ×2" stamp | stinger a fifth up | 20, 30, 30 |
| Crown | T3 | 50 ms | 0.20 | +0.25 (300) | 40 glints | — | "MINE CART CROWNED" banner | 5-note fanfare with timpani | 20, 40, 20, 40, 60 |
| Pick tier | T4 | 80 ms at ×0.05 | 0.55 | full 0.30 white · +0.4 (400); shock 0.012; chroma 0.006; rays 0.6 900 ms | 120 glints + 40 implode | — | the name plate | forge sequence: hammer hits, a rising choir, a crash | 40, 30, 60 |
| Rank-up | T3 | — | 0.10 | +0.15 (300) | FX 32 confetti | — | "RANK 12" stamp | rank chime | 16, 40, 24 |
| Feat toast | T3 | — | — | — | FX 24 confetti | — | the toast (§10.8) | medal chime pitched by tier | 12, 40, 18 |
| Number milestone (first M, B…) | T4 | 60 ms | 0.30 | full 0.15 amber · +0.3 (500); rays 0.5 from the counter | FX 48 confetti + a coin burst | — | "1 MILLION" stamp | stinger + cash roll | 30, 40, 50 |
| Depth record (200 m) | T2 | — | 0.10 | plaque rays 0.3 600 ms | 24 glints at the plaque | — | "+200 m" by the depth plate | bell | 18 |
| Seal appears | T3 | — | 0.20 rumble | — | dust from the chains | — | the timer ring | drone + drums | 40 |
| Seal / Warden hit | T1 | — | kick 3 px | the rune band cracks | — | — | the HP bar chunks | low stone gong | 8 |
| Seal break (first time) | T4 → T5 | 120 ms, slow-mo 0.25× 350 ms | 0.70 | full 0.35 white → biome colour 600 ms | biome particles 200 | 60 large | "SEAL BROKEN" | shatter + choir stinger | 40, 60, 40, 60, 120 |
| Biome reveal (first time) | T5 | §10.8 | 0.70 on landing | §10.8 | 200 | 40 | the title | the biome stinger 3 s; the music crossfades | 50, 40, 80 |
| Charted gate | T3 | 40 ms | 0.30 | full 0.12 · +0.2 (300) | 60 biome particles | 20 | the title chip with the split | gate chord | 20, 40, 30 |
| Facet hand | T2 | — | — | the world dims 20 % | — | — | 3 cards fly up and flip | card flips; a low chime for a Relic card | 12 |
| Plunge (sustained) | E5 | — | 0.20 held | +0.15 | streaks 300/s | impostor shards | the odometer spins | wind roar, pitch ∝ speed | 20 every 1 s |
| Rekindle | T5 | 160 ms | 0.80 | full 0.40 violet with a 200 ms ramp · +0.5 (800); rays 0.8 | 200 embers | — | the Ember count | deep bell, then rushing wind | 60, 40, 120 |
| Offline return | T5 | — | — | — | FX coin fountain 40 | — | the count-up | whoosh + cash roll | 20, 40, 20, 40, 40 |

¹ Hit-stop on T2 events only when the 1 s average of breaks is below 3/s, when not holding and not in a Surge, and when the last
hit-stop ended ≥ 300 ms ago. ² Inside a hold-to-buy chain, ★ ceremonies merge into the last one.

### 10.4 Eases and springs (`src/core/ease.ts`, `src/core/spring.ts`, `src/ui/brand/motion.ts`)

`core/ease.ts` evaluates `cubic-bezier` by Newton-Raphson (4 iterations, bisection fallback) to within 1e-3 of the browser, so the
DOM, the FX canvas and the shaders agree. Chromium 88 has no `linear()` easing, so `springKeyframes(name, from, to)` samples the
closed-form step response at 60 Hz into WAAPI keyframes; JS springs integrate the same oscillator analytically with no per-frame
allocation. A retriggered spring keeps its current value and velocity.

| Ease | cubic-bezier | Use |
|---|---|---|
| `enter` (kept) | 0.2, 0.7, 0.2, 1 | panels and text entering (the calm register) |
| `exit` (kept) | 0.4, 0, 1, 1 | exits |
| `standard` (kept) | 0.4, 0, 0.2, 1 | state changes |
| `outQuad` | 0.5, 1, 0.89, 1 | presses |
| `outCubic` | 0.33, 1, 0.68, 1 | number rise, digit roll, follow-through |
| `outQuart` | 0.25, 1, 0.5, 1 | count-ups (in log space) |
| `outQuint` | 0.22, 1, 0.36, 1 | title rise, sheet content |
| `outExpo` | 0.16, 1, 0.3, 1 | beams, shock radius, ray onset |
| `outBack` | 0.34, 1.56, 0.64, 1 | lids, flips landing, small stamps |
| `inQuad` | 0.11, 0, 0.5, 0 | token acceleration into a socket |
| `inCubic` | 0.32, 0, 0.67, 0 | exits upward, falls |
| `inOutCubic` | 0.65, 0, 0.35, 1 | dollies, dims, irises, the ghost hand |
| `inOutSine` | 0.37, 0, 0.63, 1 | breathing loops |

| Spring | ω (rad/s) | ζ | Overshoot | Peak | 2 % settle | Use |
|---|---|---|---|---|---|---|
| `snap` | 30 | 0.55 | 12.3 % | 124 ms | 192 ms | button release, ready ping, stamps, chip and plate drops |
| `bounce` | 22 | 0.35 | 30.8 % | 151 ms | 496 ms | chest landing, reward icons, Collect |
| `jelly` | 34 | 0.28 | 39.8 % | 95 ms | 403 ms | counter catch, number pop (0.6 → 1.155 → 1) |
| `soft` | 16 | 0.85 | 0.6 % | 377 ms | 263 ms | sheets and panels |
| `kick` | 40 | 0.45 | 20.2 % | 87 ms | 205 ms | the camera tap kick |
| `follow` | 9 | 0.70 | 4.5 % | 488 ms | 661 ms | the camera row follow |
| `heavy` | 12 | 0.50 | 16.2 % | 301 ms | 669 ms | the tool's return, big props |

**Squash and stretch** is volume-preserving (`sy = s`, `sx = 1/√s`), one animated channel per element (position on an outer
wrapper, squash on an inner one): coin tokens stretch along their velocity (s = 1 + min(0.35, speed / 2,400 px/s)) and shrink
0.7 → 1 into the socket; the counter socket catches with sx 1.22 / sy 0.82 → 1 on the jelly spring (≥ 70 ms apart; faster landings
charge the next bump, max 1.35); the chest squashes 0.86 → 1.12 in the air → 0.82 on landing; the tool head squashes 0.88 along
the swing for 50 ms; buttons press uniformly to 0.94 (text stays round); stamps land 1.8 → 1 with −8° → 0°.

### 10.5 A tap, frame by frame (F0 = the first frame after `pointerdown`)

| Frame (ms) | A tap that cracks (E0) | A tap that breaks (E1) |
|---|---|---|
| F0 (0) | the tap is drained and resolved; cell flash +0.6 (`uCellFx`), crack stage set, the front face pop starts (+0.04 m); the strike ghost at the impact pose with its smear at 0.7 alpha; the number spawns at scale 0.60; kick impulse 2.9 m/s; sound and haptic issued | the same, plus: voxels set to air (the mesh lands at F1 from the workers); **8–12 shards spawn filling the cell's front metre**, so the hole never shows a 1-frame gap; 16 dust and 6 sparks; the world shock ring starts; loot pops start in 3D |
| F1 (17) | number 0.66 (jelly); pop +0.07 m; flash 0.35 | the remesh lands; shards fly at 2.5–4.5 m/s from the tap point, spinning 4–9 rad/s |
| F2 (33) | audio arrives (typical); **pop peak +0.08 m and kick peak 2 px** | shock ring radius 0.23 m |
| F4 (67) | pop back to 0.02 m; flash 0; the smear is gone at 90 ms | — |
| F6 (100) | the number peaks at 1.155 (95 ms); follow-through ends at 120 ms | — |
| F19 (320) | the number rises 46 px over 620 ms (outCubic) | loot pops reach the top of their arc and hand off to the FX canvas |
| F27 (450) | — | the shock ring ends (3.15 m); shards land and bounce (restitution 0.25) |
| F37–F49 | the number fades over its last 200 ms | the first coins land on the socket (catch, digit roll) |
| F48–F60 | — | shards dissolve over their last 250 ms with an ember rim |

**Accumulating numbers:** while hits keep landing on the same column within 350 ms, the existing number adds the new damage instead
of spawning another (it bumps 1 → 1.18 on the jelly spring and its life extends by 200 ms, up to 1.6 s). At 8 taps/s the screen
keeps ≤ 7 numbers and the sum climbs like a score.

### 10.6 Loot flights, the ledger, numbers and counters

| Phase | Time | Motion |
|---|---|---|
| Pop (3D, lit, emissive rim; `src/game/effects/LootPop.ts`) | 0–320 ms | velocity (±1.5, 4.5, −2.0 toward the camera) m/s, spin 6 rad/s, scale 0 → 1 on the bounce spring |
| Hand-off | 320 ms | the token's screen position is projected; the 3D mesh hides and an FX-canvas sprite at the same pixel, scale and velocity takes over |
| Flight | 420 + 40 × i ms (i = index in its burst, ≤ 6) | a quadratic Bézier from P0 to the socket; control point P0 + (±120, −160) px, alternating sides; progress u = t^2.2; stretched along the velocity |
| Trail | during the flight | coins: 6 ghost copies 16 ms apart, alpha 0.45 → 0.05, scale 0.9 → 0.4, `lighter` blending in the tier colour; gems: a 4-point star every 40 ms that hangs 300 ms |
| Arrival | last 120 ms | the token shrinks into the socket; the socket catches; 4–6 sparkles; one tick pitched +1 semitone per landing within 600 ms (cap +12); **the counter credits this token's share now** |

- **Tokens per break** = clamp(1 + floor(log2(2 × value / median value)), 1, 6), the median over the last 30 breaks. Above 12
  tokens launched within 1 s, new ones merge into bundles (a coin stack at scale 1 + 0.15·log2(n) with a "×n" sprite). At most 24
  in flight; beyond that the stream becomes a **coin river** (30 sprites/s on one jittered ribbon), used by the Plunge and the feast.
- **The display ledger** (`src/ui/fx/displayLedger.ts`, pure): `shown = actual − inFlight`. Purchases check `actual`; a card turns
  affordable when **`shown`** passes its cost, so the ready ping happens the moment a coin lands.
- **Damage numbers** are drawn on the FX canvas from glyph sprites rasterised at device size from the Lintel face (one atlas per
  size bucket, rebuilt when `devicePixelRatio` changes): a pool of 48, 3 significant digits, sizes 18–38 px by log10(damage / biome
  median) (crits ×1.35, max 48), colours bone-100 (tap), amber-300 (crit), rune-200 (gem), deep-300 (relic), bone-500 at 70 % (crew),
  a prismatic cycle for mega crits; a 3 px carve outline (#04070b) and, for crits, a wide amber stroke at 30 % behind.
- **Rolling counters** (`src/ui/fx/Ticker.ts`, DOM): the displayed value approaches its target in log space,
  `logD += (logT − logD)·(1 − e^(−dt/τ))`, τ 90 ms for gains, 60 ms for spending (no sound, no bump), clamped to ×1.5 per frame. A
  jump of more than ×10 (a chest, the feast, a spree) plays a scripted count over `clamp(500 + 220·log10(T/D), 500, 2000)` ms on
  outQuart in log space with ticks ≤ 24/s. Digits are 0–9 strips in a 1 em mask that translate on change (90 ms outCubic). A suffix
  change (999K → 1.00M) flips the plate (rotateX 0 → 90° in 90 ms, swap, −90° → 0° in 160 ms outBack), stamps the new suffix and
  moves the counter's tier colour (§5.1). The DOM is touched only when the string changes (≤ 15 writes a second per counter).

### 10.7 Buttons, cards and purchases (`src/ui/fx/press.ts`)

| State | Visual | Motion | Sound and haptic |
|---|---|---|---|
| Not affordable | slate fill, bone-500 cost, the fill bar at shown gold / cost | the bar moves with each landing (scaleX, 120 ms outCubic) | — |
| Near (≥ 85 %, BEST only) | the bar brightens to amber-400 | a glow breathes 0.35 ↔ 0.8 at 1.2 Hz | — |
| Became affordable | rim brass-500 → amber-400, cost amber-300 | the ready ping: snap 1 → 1.04 → 1 and a rim flash (300 ms) | tink pitched C, E or G by slot; ≤ 1 per card per 3 s, ≤ 1 per 400 ms overall; 6 ms |
| BEST | the octagon "BEST" chip | breathing glow 0.25 ↔ 0.6 at 0.5 Hz and a shine sweep every 2.6 s (a skewed 24 px bar, 520 ms) | — |
| Pressed | face 0.12 darker | scale 0.94 and translateY 2 px, 70 ms outQuad | — |
| Bought | — | snap back to 1 (peak 1.007); the level rolls; a pip pops 0 → 1.3 → 1 | ka-ching on the arpeggio, 10 ms |
| Cannot afford | the cost flashes danger-400 for 300 ms | a "no" shake: 0, −6, 6, −4, 4, −2, 0 px over 280 ms | low buzz, 14 ms |
| Held ≥ 380 ms | — | repeats at 8/s rising to 16/s after 1.5 s; each a mini-press (0.97 → 1, 60 ms) | +1 semitone per buy (cap +12), 6 ms ≥ 80 ms apart |
| Locked | a lock stroke icon at 50 % | — | — |

At most 3 infinite animations run at once (the BEST breathing, its shine and one near-glow), all on the single most important target.

**The purchase burst** (T2, 450 ms): the release; 14 brass sparks from the card centre (180–420 px/s, drag 4/s, gravity 600 px/s²);
a ring from 0.6 to 1.8 × the card width; a DOM delta chip "+12 %" that rises 18 px; **in the world, the same frame**: the reaction of
§5.5 item 8.

**The ★ milestone** (T3, 1,000 ms): the 10th pip pops and the card flashes gold (0 ms); a 50 ms hit-stop and the line's rigs flash
gold with 30 glints rising (0 ms); "★" stamps on the card (1.8 → 1, −8° → 0°, snap) and "×2" pops beside it (60 ms); 24 gold sparks
and a ring (60 ms); a "×2" stamp over the rigs rises 24 px and fades (120–820 ms); a stinger a fifth above the last purchase pitch.

### 10.8 Ceremonies (timelines in `src/game/fx/ceremonies/*.ts`, each with `skip()` and a fixed-time capture hook)

**Pick tier (T4, 1,600 ms; a tap from 400 ms jumps to 1,300 ms):** hit-stop 80 ms at time scale 0.05; `uDim` 0 → 0.55 over 160 ms and
the HUD fades to 0.35 except the Pick card (0 ms) · the strike ghost rises to the screen centre (y 42 %), scale 1 → 1.4, one full spin
(0–400 ms) · charge: a ±3° shake at 18 Hz, emissive 0 → 3 HDR, 40 sparks implode toward the head (400–700 ms) · **snap** at 700 ms: a
0.30 full flash (one frame up, 120 ms decay), a screen shock to 0.7 of the height over 450 ms, chroma 0.006 → 0, trauma +0.55, haptic
[40, 30, 60]; the new model replaces the old one at 1.6 → 1 (bounce) · rays 0.6 → 0 over 900 ms and 120 glints (700–1,600 ms) · the
name plate "IRON PICK" (Lintel 28 px) and "Tap damage ×2.5" rise 12 px, the letters stamping 28 ms apart (900 ms) · the tool returns
to the strike pose on the heavy spring and `uDim` → 0 (1,300 ms).

**Chest reveal (T3–T4):** the chest cell breaks; the chest pops toward the camera to z −2 m, lands on the floor ledge (squash 0.82,
two bounces of 0.25 and 0.08 m) and rests with its seam glowing in Wood colour. It opens on a tap, or by itself after 1.5 s. Each roll-up
step is 450 ms: an anticipation squash (0–80 ms), a 0.35 m jump with a ±6° tilt (80–240 ms), the fall (240–320 ms), and at 320 ms the
landing, where **the seam light switches to the next tier's colour** with a ring burst, 12 glints, rays 0.25 × step for 400 ms, a sound a
major third higher and a haptic tick of 12 × step ms. A failed step ends the roll: grey sparks puff and the lid unlatches. **Open:**
the lid hinges 0 → −115° in 180 ms (outBack), a beam cone in the tier colour scales up in 120 ms (outExpo), the full flash and rays by
tier (60 ms), the contents spray up and fly to their sockets (100 ms); for Crystal and better a **reveal card** (160 × 220) for the best
item rotates in from its back over 360 ms with a sunburst behind it, and "NEW" stamps if it was a first find. Lengths: 900 / 1,350 /
1,800 / 2,400 / 3,200 ms by tier. A tap after 400 ms jumps to the end state and the rewards fly at 2× speed.

**Feat toast (T3, 3,000 ms):** the plate (300 × 64, tier-coloured rim) slides from y −90 to the safe top + 8 (snap) · the medal stamps
0 → 1.25 → 1 (bounce) with 24 confetti (120 ms) · "FEAT · DELVER III" and the name rise 6 px (180 ms) · a shine sweep (300 ms) · the reward
chip "+1 % all · +15 ◆" pops and the gem flies (450 ms) · exit upward (2,600 ms). 700 ms between toasts; with more than 3 waiting they
collapse into one "+N Feats"; never during a T4 or T5; a tap opens the Feats sheet on that family.

**Rank-up (T3, 1,400 ms; never blocks):** the XP bar finishes and flashes; the badge pops (jelly 1 → 1.25) with 32 confetti; a "RANK 12"
stamp at 30 % of the world region (snap from 1.6, held 600 ms, then rises with a fade); the reward chip flies to the gem socket; the bar
empties to the carry-over.

**Number milestone (T4, 2,000 ms):** the counter flips to its new tier colour; rays from the counter; a "1 MILLION" stamp (44 px) at the
world-window centre; 48 confetti; a 30-coin burst from the stamp into the counter. The first K, M, B, T and Qa each also grant a
Démesure progress tick. **Googol** (1e100, T5): the counter turns white-gold and a confetti of digits rains for 2.4 s with a choir pad.

**Biome reveal (first time; T5, 3,600 ms; digging resumes at 1,200 ms):**

| t (ms) | Layer | What |
|---|---|---|
| 0 | all | the seal breaks: hit-stop 120 ms; a 0.35 white flash decaying over 600 ms; screen shock 0.014; 40 shards |
| 120–600 | camera | **the dive:** the floor gives way and the camera falls 6–14 m into the Vista, easing to 30 m/s with streaks and the plunge blur |
| 600 | camera | **landing:** a 0.18 m overshoot, trauma 0.70, a dust skirt of 64, haptic [50, 40, 80] |
| 700–1,900 | camera + look | the Vista dolly (D 12.6 → 24 m); the biome look (atmosphere, LUT pair, bloom) crossfades over 1,600 ms |
| 900 | title | "CRYSTAL GROTTO" in the Lintel display face, letter by letter (40 ms each); from W3 it is **carved in light**: SDF drawn into the scene target at emissive 3.0 so it blooms, each letter growing from its stroke centreline (threshold −1.5 → 0 over 220 ms) with 200 biome particles rising from the letters |
| 900–2,300 | post | rays from the title's centre, 1.0 → 0 over 1,400 ms |
| 1,400 | DOM | the subtitle "Depth 120 m · Biome 3 · 3:12 (split)"; the sr-only live region announces the name |
| 1,900–2,800 | camera | the dolly back (900 ms) |
| 2,600–3,100 | title | it dissolves into glints drifting upward |
| 3,100 | DOM | the gear cards rise into the Dig tab (badge); the new crew line's card pings; the facet hand follows (from the second seal) |

Reduced motion: a 300 ms crossfade to the Vista framing, the title as a 240 ms fade, no dive, no shock, a 0.15 flash.

**Rekindle (T5, 4,000 ms):** 0–600 ms the lantern flares and embers stream from the depth plate to the Lantern tab · 600–1,500 ms an
**octagon iris** closes on the lantern (radius 1.2 → 0, inOutCubic) with a brass rim glow; your lantern is planted at the depth you
reached · a 300 ms black hold while the world rebuilds · 1,800–2,600 ms the iris opens at the surface (at dawn, the camp one stage
bigger if a threshold was crossed) · 2,600–4,000 ms the Embers counter counts up (outQuart), then the Head Start Plunge (if owned) and
the MAX spree (each card lights once with its levels, 60 ms after the previous). **Weave** reuses it with threads of light instead of
embers and the Loom's Heart instead of the shaft.

**Screen transitions:** sheet open (translateY 100 % → 0 on the soft spring, scrim 0 → 0.45); sheet close (200 ms inCubic); tab switch
inside a sheet (±24 px slide, 120/180 ms); modal plates (snap in, 140 ms out); menu → game (the wordmark's lantern-O scales 1 → 8 and
fades over 900 ms while the exposure flares +0.4 from the same point, where the shaft lantern sits); app resume (fade from slate-950
in 240 ms, then the feast). Reduced: fades of ≤ 150 ms.

### 10.9 Shake, kick and hit-stop (`src/game/fx/CameraFx.ts`)

- **Trauma** (§6.3): peaks are break 0.65 px, crit 1.25 px, Dynamite 4 px, pick tier 6 px, biome landing 9.8 px, Rekindle 12.8 px;
  multiplied by the Camera Shake setting.
- **Kick:** taps add kick impulses only, never trauma, so tapping at 10/s never blurs the view.
- **Hit-stop** runs on a separate **FX clock** (`fxDt = dt × scale`; scale 0, or 0.05 for "heavy" stops). Frozen: shards, GPU particles
  (they read `uFxTime`), number rise, crew loops, chest physics, the camera follow. Running: flash decay, shake, kick, the UI, audio,
  tokens in flight, the simulation. Rules: ≤ 120 ms (T5 ≤ 160 ms); ≥ 300 ms between stops; never on T1; never while the 1 s break
  average is ≥ 3/s, while holding or in a Surge; overlapping stops take the max; **a new `pointerdown` ends the stop in that frame**.

### 10.10 Sound (`src/audio/sfx.ts`, `src/audio/cues.ts`, `src/audio/MusicScheduler.ts`)

- **Ladders** (all in the biome's key, so they harmonise; the same ladder never runs twice at once): breaks climb a 2-octave major
  pentatonic (offsets 0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24; reset after 1 s with no break; a row clear plays a root + 5th + octave chord
  on the current step); purchases climb the arpeggio (§5.5); coin landings +1 semitone each within 600 ms (cap +12); chest steps climb
  major thirds; pierce chains +2 semitones per cell; combo tiers a step per tier.
- **Variation:** every hit picks one of 4 material variants, ±6 % pitch and ±1.5 dB, never the same twice in a row.
- **New recipes:** `tap.<material>`, `break.<material>`, `coin.tick`, `row.clear`, `crit`, `combo.tier`, `combo.lost`, `surge.start`,
  `surge.end`, `dynamite`, `quake`, `chest.creak`, `chest.step`, `chest.open.<tier>`, `buy`, `buy.star`, `buy.crown`, `tool.tier`,
  `seal.appear`, `seal.hit`, `seal.break`, `reveal.<biome>` (a 3 s stinger), `event.sting`, `moth`, `catch`, `strike.perfect`,
  `plunge.wind`, `plunge.land`, `feat.<tier>`, `rank`, `record`, `rekindle`, `weave`, `ui.tap`, `ui.no`.
- **Mix:** a voice cap of 24; priority reveal > seal > chest > crit > break > hit > coin > ambience; breaks limited to 6 voices per
  100 ms; above 15 breaks/s a continuous rockfall roar bed (filtered noise following the rate) replaces single breaks and the ladder
  plays every 3rd break; music ducks −4 dB under stingers and −3 dB under T3+.
- **Music:** per biome (mode and tempo in §6.5) on the existing MusicScheduler: a pad always; a pluck melody while there was a tap in the
  last 5 s; drums at combo ≥ 25, during a Surge, events and the Plunge; a boss layer during a Warden fight; layers crossfade over 4 s at
  biome boundaries; stingers quantise to the next beat.

### 10.11 Haptics (`src/ui/haptics.ts`)

| Pattern | ms | Min gap | Pattern | ms | Min gap |
|---|---|---|---|---|---|
| tap | 10 | 60 ms | ★ | 20, 30, 30 | 200 ms |
| break | 18 | 70 ms | crown | 20, 40, 20, 40, 60 | — |
| ore | 22 | 90 ms | pick tier | 40, 30, 60 | — |
| crit | 14 | 120 ms | chest step | 12 × step | — |
| row | 16 | 150 ms | chest open | 16 → [40, 30, 60] by tier | — |
| gem | 10, 30, 18 | 200 ms | seal break | 40, 60, 40, 60, 120 | — |
| purchase | 8 | 80 ms | biome | 50, 40, 80 | — |
| Surge | 20, 30, 20, 30, 40 | — | plunge land | 30, 30, 60 | — |
| Dynamite | 30, 20, 40 | — | Rekindle | 60, 40, 120 | — |

Strength: Light ×0.7, Normal ×1.0 (default), Strong ×1.4; pulses under 10 ms are raised to 10 (shorter pulses are not felt on ERM
motors). Limits: ≤ 20 `vibrate` calls a second and ≤ 40 % duty over any 1 s; priority biome > seal > chest > crit > row > break > tap.
Gated on the setting, the last input being touch, the page visible and play mode.

### 10.12 Aggregation at démesure and anti-habituation

| System | Rule when hundreds of cells break a second |
|---|---|
| Numbers | merge per column within 350 ms (§10.5) |
| Tokens | ≤ 24 in flight, values add up; then the coin river |
| Shards | burst count × min(1, 40 / breaks per second); live caps per preset (§11.5) |
| GPU particles | each spawn request scaled by `min(1, cap / (live + requested))` and by a screen-area budget (live particle area ≤ 1.0 × the screen on Balanced, 1.5 High, 0.5 Battery); live particles are never killed early |
| Sound | the roar bed |
| Haptics | the limiter |
| Trauma | capped at 0.5, except the seal break and the plunge landing (0.7) |
| Over 6 rows/s | the Plunge |

**Freshness damping:** the same cue repeated within 2 s plays at −15 % intensity per repeat (min 50 %) on flash, bloom and particles,
never on the number or the sound. Every 10th break of a combo gets an **accent** (+30 % particles and a bigger pop), like a drum
pattern. **Seeded variation:** 3 shard sets, 4 crack orientations, the spark cone jittered ±20°, token sides alternating.
**Lifetime escalation:** the tool grows from 0.6 m to 7 m and gains a layer per tier; numbers grow with log10 of damage over the biome
median; the counter's tier colour climbs the suffixes; the E-tier mix shifts upward in later runs; the Plunge becomes common.
**Restraint:** menus, settings, Codex text and lore use only the calm `enter`/`exit` register, so the impact register keeps its contrast.

### 10.13 Motion levels and photosensitivity (`Settings.motion`, `Settings.flashes`)

`motion: 'full' | 'reduced' | 'off'` defaults to `'reduced'` when `prefers-reduced-motion: reduce` matches; `flashes: 'on' | 'soft' |
'off'` defaults to `'soft'` when motion is reduced.

| Feature | Full | Reduced | Off |
|---|---|---|---|
| Camera shake, kick, dolly, dive, sway | on | none (the camera is at its rest pose every frame) | none |
| Hit-stop | on | none | none |
| Springs | as specified | outCubic over the same duration, no overshoot | instant |
| Number pop and rise | jelly + 46 px rise | fade, 20 px rise | static, 600 ms |
| Token flights | Bézier + trails | straight, 300 ms, no trail | none: the counter ticks with a 120 ms highlight |
| Particles | 100 % | 60 % | ≤ 20 per event, no streaks |
| Chromatic, radial and plunge blur | on | off | off |
| Full-screen flash | ≤ 0.35 | ≤ 0.15 | none (Flashes Off is honoured at every level) |
| Infinite loops | on | a static highlight | a static highlight |
| Ceremonies | full | fades; same total time ÷ 2 | a static card for 1.2 s |

**Photosensitivity** (WCAG 2.3.1, enforced in `juiceBudget.ts`): at most 2 full-screen flashes a second (≥ 500 ms apart); intensity
≤ 0.35 (Rekindle 0.40 with a 200 ms ramp); never a saturated-red flash; anything faster than 3 Hz stays under 80 × 80 px; breathing and
shine loops change luminance by ≤ 10 %.

---

## 11. The visual upgrade plan, file by file

### 11.1 Pillars (they replace ART_DIRECTION pillars 1 and 5 for this game; pillars 2–4 stay as vocabulary)

1. **The deeper, the brighter.** Exposure, saturation, bloom and the number of emitters per screen rise with depth; the descent
   starts with lamplit earth and reaches a buried star.
2. **The section is the stage.** The cut plane at z = 0 is flat and lit like an illustration (strata, ores, fossils and treasure
   silhouettes, a warm rim where it meets air); behind it is deep 3D space with real parallax.
3. **Every action pays out on screen in the same frame,** through at least three channels.
4. **Démesure is visible:** tools, crew, numbers and set pieces grow on screen.
5. **One focus:** the dig face is always the brightest, most contrasted band; clear air within 15 m of the camera and within
   1.5 m of the face; the UI frames it from above and below.

Colour registers stay: amber is people, kit and your actions; cyan is minerals and the builders' script; violet is the unknown,
relics and prestige; red is danger only. Each biome adds exactly one accent hue.

### 11.2 Biome looks (`src/idle/config/biomeLooks.ts`, driven by `src/render/descent/BiomeLook.ts`)

Each look sets the atmosphere uniforms (the GLSL `atmosphere()` is kept), the section light, bloom and a 16³ LUT pair; two looks
blend over 1.6 s and across 40 m around a boundary. Fog is 0 within 15 m of the camera (the dig face is always in clear air), 50 %
at 45 m and 90 % at 70 m; the haze distance starts at the glass plane, so the 12.6 m of camera air adds none. Hex values are sRGB.

| # | Biome | Accent light | Fog / pooled fog | Open fill | Exposure | Bloom thr / str | Sat. | Shadow → highlight tint | Emitter voxels per slab |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | lamps #ffb35c; a sky shaft #9fc3e6 to 30 m | #2a2420 / #17130f | #6f7f96 | 2.3 | 1.10 / 0.45 | 1.05 | #1a1e2a → #fff1d8 | 4–8 |
| 1 | Glowroot Caverns | glowroot #9be7a8 | #14261f / #0c1a1e | #6fa293 | 2.2 | 1.00 / 0.55 | 1.12 | #0b1a1a → #f0ffe8 | 6–10 |
| 2 | Crystal Grotto | cyan #2fb6cc / #8fe3ee | #203046 / #121638 | #8a9ab5 | 2.25 | 0.95 / 0.60 | 1.10 | #0e1530 → #e8fbff | 10–18 |
| 3 | Halden Works | sodium #ffa04a, brass #e2b673 | #231a12 / #140e0a | #7a6048 | 2.0 | 1.05 / 0.50 | 1.00 | #120c10 → #ffc880 | 8–14 |
| 4 | Fungal Deep | magenta #c58cff, lime #a8ff6a | #1a0f22 / #0c1a12 | #7a5a9a | 2.1 | 0.95 / 0.60 | 1.15 | #100818 → #e8ffc8 | 18–30 |
| 5 | Drowned Ruins | aquamarine #5fb7ff, braziers #ff9a48 | #0a2236 / #061628 | #3f86b0 | 2.1 | 1.00 / 0.55 | 1.05 | #04101e → #c0f0ff | 14–24 |
| 6 | Magma Veins | lava #ff7a2e → #ffb347 | #2a140c / #1a0a06 | #8a4a30 | 1.8 | 0.85 / 0.80 | 1.20 | #1a0a0a → #fff0c0 | 20–34 |
| 7 | Fossil Halls | resin #ffb000, ghost light #d0c8ff | #221e1a / #15110e | #8f8070 | 2.1 | 1.00 / 0.50 | 0.95 | #16120e → #fff4dc | 12–20 |
| 8 | Frost Hollow | glacier #7fd8ff, aurora #9dffd8 | #1a2a3a / #0e1826 | #a8c4e0 | 2.4 | 1.00 / 0.55 | 0.95 | #0c1626 → #f4fbff | 14–24 |
| 9 | The Loom | white-gold #fff4d0, thread #b9a2ff | #1e1c18 / #0e1420 | #b0a888 | 2.3 | 0.85 / 0.70 | 1.05 | #0a1020 → #fff4d0 | 28–48 |
| 10 | Iron Core | steel blue #8fb8ff, forge #ff7a2a | #141820 / #0c0e14 | #8a96b0 | 2.1 | 0.95 / 0.60 | 1.00 | #0c1018 → #e8f0ff | 16–28 |
| 11 | Star Heart | sun #fff1c2 → #ffb040 | #3a2a10 / #20160a | #e0c080 | 2.6 | 1.10 / 0.90 | 1.10 | #201408 → #ffffff | 24–40 |
| 12 | Void Sea | violet #6a5cff, star #d8e0ff | #0c0820 / #1a0c3a | #5a4a9a | 2.4 | 0.85 / 0.75 | 1.15 | #06041a → #e8e0ff | 16–30 + backdrop stars |
| 13 | The Gate | rune #8fe3ee, gold #e2b673, violet #b9a2ff | #1a1226 / #0e0a18 | #a090c0 | 2.6 | 0.90 / 0.90 | 1.15 | #0e0a18 → #fff4e0 | 24–40 |
| Echo n | the base biome's | hue +37° × n | the base's | the base's | +0.05 n (cap 3.0) | −0.02 n / +0.05 n | +0.03 n | the base's | the base's × 1.15 |

**The cut-plane light (the section path).** The key is the biome's open fill × 0.9. **Rim:** 0.15 m along every outline where the
section meets air, in the accent × 1.6 ("lamplight on the lintel"). **Depth into rock:** mix(1.0, 0.35, 1 − e^(−0.45·d)), d = the
distance in cells to the nearest open cell of the cut (`SectionField`), so rock near the shaft and caverns glows and the mass between
them goes dark. **Fog of rock:** rows more than 6 m below the floor fade to a deep tint (×0.7 by 9 m) while treasure and gem emission
passes through (the tease). **Contour hairline** every 4 m of depth, 25 % darker, one texel. **Shine sweep:** every 3.2 s a 45° band
0.6 m wide crosses the screen at 9 m/s and valuables inside it get +1.6 emissive. **Camera fill** (`uCamFill`): 0.25 × the open fill
on faces turned toward the camera, so the shaft interior is never black. The dig lamp's warm pool pins the focus.

### 11.3 Changes to existing files

| File | Change | Why / cost |
|---|---|---|
| `src/render/Renderer.ts` | portrait presets (§11.5); **two resolutions**: the scene renders into its target at a dynamic scale `s` of native and the composite writes the canvas at native DPR (cap 3; Battery 2); a sub-viewport for dynamic resolution (no reallocation); Battery at 60 fps with a manual "Saver" at 30 | the browser no longer stretches a 1.575-DPR canvas to 2.6–3.0 (today the world shows 52–60 % of native linear resolution) |
| `src/render/PostFX.ts` | the composite becomes: 5-tap Catmull-Rom upsample + CAS 0.2 (4 extra luminance taps, only when `s` < 1) → tone map (kept) → **LUT pair mix** (one 3D fetch replaces the hard-coded split grade) → vignette (portrait weights: top 0.30, bottom 0.25, sides 0.10) → dither; new uniforms: bloom pulse, screen shock (4 rings, 0 extra fetches), chroma flash (2 fetches, ≤ 0.006), `uDim` and `uFocus` (octagon), `uIris` (octagon iris with a brass rim), plunge blur (4 taps, only while plunging), heat shimmer (Magma Veins, 1.5 px under a mask); a rays pass on bloom level 1 at ¼ resolution (12 taps, decay 0.93); every variant compiled at load with `renderer.compileAsync()`; effects switch by uniforms, never defines | ≈ 1.6 ms composite at 2.5 Mpx; rays 0.12 ms and chroma 0.15 ms only while active |
| `src/render/lighting.ts` | `ATMOSPHERES` (4 zones) and `updateAtmosphere` are replaced by BiomeLook-driven uniforms blending the two biomes nearest the camera depth; fog starts at the glass plane; `uCamFill`; `uShock[4]`; `lightTex.wrapT = Repeat` for the ring; the lantern at radius 9, intensity 1.35, following the dig face | readable, never-dark tapper; real per-biome looks |
| `src/render/terrainMaterial.ts` | the **section path** (a flat varying `vSection` for faces with normal −z at z = 0, coherent per face on tile GPUs): HD layer fetch + one emboss tap toward the key light + the cut-distance rim + depth-into-rock key + fog of rock + contour hairline + shine sweep + glow pulse (emissive × (1 + 0.25·sin(2π·0.7 Hz·t + hash))) + glint; `uCellFx[8]` (cell id, flash, pop, crack stage) replaces the single `uTarget`, so 8 cells crack and flash at once (the existing `fracture()` crack code is kept, centred on the tap point); the pop moves the hit cell's face vertices +0.08 m along their normal; the world shock ring; heat cracks glow on Magma and Star Heart cells | 3 fetches + ~60 ALU on the section (the full path has 6–9 fetches); +6 ALU near hits |
| `src/render/terrainRig.ts` | a second `DataArrayTexture` `uMatHD`: 16 layers at 256² (32 texels/m) holding the current and the next biome's 8 slots (slot parity `8·(b mod 2)`); `repaintSlots(biome)`; `setCellFx()`; section uniforms; the legacy 128² array stays for structures, masonry courses and the surface | HD where the eye is; 5.6 MB |
| `src/render/mesher.ts` | `copyPadded` reads through RingWorld (z < 0 is AIR); at lattice z = 0 no z displacement, normal (0, 0, −1), xy offsets ×0.5, AO 1, so the cut is flat with an organic outline; relief noise and jitter take `originY` so a chunk meshed before and after a rebase is byte-identical; still a pure function of the lattice (the crack-free tests stay) | a clean section |
| `src/render/ChunkRenderer.ts`, `meshPool.ts`, `meshWorker.ts` | ring chunk keys (absolute cy), slab recycling, `originY` in jobs, per-chunk AABB frustum culling (the portrait frustum is not a distance sphere) | — |
| `src/world/light.ts` | storage-row ring indexing, the dead-slab barrier, max-merge of worker light context, `openMany()` batch fill | property test: equals a full recompute after 200 recycles |
| `src/render/materials/*` | a size parameter (128 or 256); new painters in `materials/biomes.ts` (root wood, glowroot, brass, cap, mycel, coral, basalt, obsidian, magma, bone, resin, ice, frost slate, pale ashlar, loomstone, gear metal, star glass, gold rock, void stone, black stone) and per-biome ore and gem tints; ramps in `palette.ts`; HD layers painted in the slab worker when the record comes within 200 m of a biome (≈ 100 ms each, mips in the worker, uploaded level by level) | one biome's paint is never on the main thread |
| `src/render/QualityGovernor.ts` | a fine controller on top of the preset steps: the median frame interval over 1 s; above 17.5 ms the scale steps −0.05, below 14.5 ms for 4 s it steps +0.05, inside the preset's range, at most one change per 2 s; under thermal throttling an FX LOD step comes first (particles × 0.6, shards × 0.5, rays and chroma off) | 60 fps first |
| `src/game/effects/Debris.ts` | replaced by `src/render/fx/Shards.ts` (its ballistics and voxel collision are kept) | debris shows the cell's own texture |
| `src/game/effects/Particles.ts` | replaced by `src/render/fx/GpuParticles.ts`; the mote field becomes one of its kinds | 2,048 particles in one draw instead of 220 CPU puffs |
| `src/game/effects/Halos.ts` | biome colours, treasure pulses, the Other Lantern, planted and ghost lanterns; cap 48 | — |
| `src/game/effects/LumenMoths.ts`, `src/game/moths.ts` | swarm, flock and event modes (Moth Swarm, Lucky Moth, glow moths) | — |
| `src/game/effects/Waterfall.ts` | a pool of 3; lava, frozen and upward variants | — |
| `src/game/effects/TargetMarker.ts` | deleted (cell FX live in the terrain shader) | — |
| `src/render/props/*` | new kinds: chest (5 tiers), chest shell, geode, urn, gem cluster per gem, fossil slab, mushroom (3 sizes), stalagmite, root, bone, rib, gear, coral, sunshard, null-glass shard, ice spire, lamp, lift cage, seal slab, Warden models (14), set pieces (§6.7) | — |
| `src/render/structures/*` | ruins for the Drowned Ruins, the Loom and the Gate; the seal frame; geometry helpers moved from `world/gen/architecture.ts` to `structures/geometry.ts`; `StructureSpec` to `structures/types.ts` | the zone generator is deleted |
| `src/entities/character/ExplorerModel.ts`, `pose.ts` | the foreman: strike snap, flurry, dash smear, drop and land, point; a tool slot driven by `ToolRig` | — |
| `src/ui/ui.css`, `src/ui/notices.ts` | the 18 rules using individual transform properties (`rotate:`, `scale:`, `translate:`, unsupported before Chrome 104) and the `{ scale }` WAAPI frames become `transform:`; the idle tokens (`--ease-*`, `--spring-*`, counter tier colours) | the WebView 88 floor |
| `src/ui/sprites.ts` | integer texel scale: a 16-texel sprite shown at `c` CSS px is `n = round(c·dpr/16)·16` device px (28 px at DPR 2.625 → 80 device px, 5 px per texel) | crisp pixel art |
| `src/ui/brand/motion.ts`, `tokens.ts` | the eases, springs, tiers and motion levels of §10; `RARITY.mythic` (≥ 4.5:1 with bone-100 on its plate) | — |
| `src/lab/VisualLab.ts` | becomes the **Biome Lab**: every look, cavern template, set piece and FX trigger side by side (visuallab.html) | the art loop |

### 11.4 New files

| File | Responsibility |
|---|---|
| `src/render/descent/DescentScene.ts` | the one facade the game drives: attach the model, apply breaks, cell FX, bursts, shocks, seals, entities, looks, the sheet re-frame, picking, `columns()`, `floorScreenY()` (BUILD §1) |
| `src/render/descent/DescentCamera.ts` | width lock, off-axis shift, follow, kick and trauma inputs, dolly, dive, plunge camera, `columnAt(px)`, `project()`; pure math |
| `src/render/descent/SectionField.ts` | an R8 64 × 160 ring texture of distance to air on the cut plane; an incremental 3-4 chamfer over a 17 × 17 window per break (≈ 0.02 ms); `texSubImage2D` per row |
| `src/render/descent/BiomeLook.ts`, `src/render/post/lut.ts` | look blending; 16³ LUT building (≈ 1 ms in JS, pure, tested) |
| `src/render/descent/CavernProps.ts` | instanced prop batches with sway and pulse attributes, ≤ 24 batches |
| `src/render/descent/Creatures.ts` | instanced creatures with vertex animation and tap bounds |
| `src/render/descent/CrewRenderer.ts` | instanced crew rigs (parts with a part-id attribute, loops in the vertex shader), wall swarms, squad plates |
| `src/render/descent/ToolRig.ts` | the 16+ tool models, the strike ghost and smear, impact layers |
| `src/render/descent/ShaftDressing.ts`, `SurfaceSky.ts` | lamps, fixtures, the lift cage, plaques; the sky gradient, sun glow, hills card, daylight cone, camp stages |
| `src/render/descent/VistaBackdrop.ts`, `setPieces/*.ts` | §6.7 |
| `src/render/descent/LiquidPlane.ts` | water, lava, brass and ice: fresnel, a reflection from the light volume at the mirrored point (1 3D fetch), 2 scrolling noise fetches, shore foam |
| `src/render/descent/LightCones.ts` | instanced additive cones (16 segments) with soft edges and motes inside |
| `src/render/descent/PlungeTunnel.ts` | §6.2 |
| `src/render/descent/SealRenderer.ts` | the seal slab, chains, rune band, the Warden and its weak point |
| `src/render/fx/GpuParticles.ts` | a ring of 4,096 stateless particles (52 B each: spawn xyz + t0, v0 + life, size0/size1/drag/gravity, rgb + kind); the vertex shader evaluates the exact drag-and-gravity motion from the FX clock; quads, not points; one draw for every kind (premultiplied; additive kinds write alpha 0) |
| `src/render/fx/fracture.ts`, `Shards.ts`, `shardMaterial.ts` | 3 BSP-fractured unit boxes (9–12 convex shards each, volumes summing to 1); shards sample the terrain layer array in the spawn-time world space of their cell, decay a heat glow, and dissolve over their last 250 ms with an ember rim (the only `discard` in play, ≤ 2 % of pixels) |
| `src/render/fx/Beams.ts` | beam cones, pillars, crack lines, smears: one additive draw |
| `src/render/fx/SdfTitle.ts`, `sdfAtlas.ts` (W3) | biome titles carved in light: an SDF atlas built from the Lintel's convex parts (`strokeFont.ts`; mitred half-plane distances keep the 45° chamfers), drawn into the scene target so they bloom |
| `src/ui/fx/FxCanvas.ts`, `spriteAtlas.ts` | the z 5 Canvas 2D at native DPR: numbers, tokens, trails, sparks, rings, confetti, the coin river; sprites pre-rendered at device size; hidden after 300 ms empty |

### 11.5 Quality presets (portrait)

| | Battery | Balanced (default) | High |
|---|---|---|---|
| Scene scale of native (dynamic range) | 0.45–0.55 | 0.60–0.75 | 0.80–1.00 |
| Composite DPR cap | 2 | 3 | 3 |
| Frame cap | 60 (manual Saver: 30) | 60 | 60 |
| Bloom | off (halos only) | 4 levels | 5 levels |
| MSAA | off | off | 4× |
| GPU particles live / shards live / tokens in flight | 384 / 72 / 16 | 1,024 / 192 / 24 | 2,048 / 320 / 32 |
| Cavern prop instances / creatures | 192 / 24 | 384 / 48 | 512 / 96 |
| Vista layers / light cones | 1 / 8 | 2 / 24 | 3 / 64 |
| HD section and emboss | 128² layers, no emboss | on | on |
| CAS / LUT | on / on | on / on | off at scale 1 / on |
| Rays / chroma / plunge blur | off | on | on |
| `USE_BLEND`, `LAMP_DIR` | off | on | on |
| Fog end behind the cut | 40 m | 56 m | 64 m |
| FX sprite atlas | 512² | 1024² | 1024² |

### 11.6 Budgets (reference device: 2022 mid-range Android, Adreno 642L / Mali-G68, Balanced, 390 × 844 at DPR 2.75)

| Area | Budget |
|---|---|
| GPU frame | ≤ 12 ms: opaque ≤ 6.5 (terrain ≤ 4.5), shards + particles + beams + halos ≤ 1.2, bloom ≤ 1.0, composite ≤ 1.6, rays + chroma ≤ 0.3 while active, DOM + FX canvas compositing ≤ 0.8 |
| CPU main thread | ≤ 6.5 ms: simulation ≤ 0.8, JuiceDirector + CameraFx + timelines ≤ 0.2, spawn writes ≤ 0.1, shards ≤ 0.3, FX canvas ≤ 0.7 (≤ 150 `drawImage`), tickers + DOM ≤ 0.3, three.js submit ≤ 2.5 |
| Draw calls | ≤ 110 (High 140, Battery 80): terrain ~28, structures 4, cavern props 16, creatures 4, crew 1–3, foreman + tool 8, shaft dressing 4, shards 3, liquids 2, Vista 2–6, cones 1, beams 1, halos 1, particles 1, post 8 |
| Triangles | ≤ 160k (terrain ≤ 90k, props ≤ 40k, creatures 8k, crew 6k, shards and particles 13k) |
| GPU memory | ≤ 40 MB on Balanced: blocks 0.66 MB, light 2.6 MB, legacy material array 2.6 MB, HD array 5.6 MB, LUTs 32 KB, particles 213 KB, render targets ≈ 12 MB, geometry ≈ 4 MB, FX atlas 4 MB |
| Per tap | 0 allocations (pools: numbers 48, tokens 32, shards per preset, particles 4,096, tap ring 32) |
| Slab apply | ≤ 4 ms main thread (one slab per frame at most) |
| Light per break | ≤ 0.3 ms; a 504-voxel blast ≤ 1.5 ms (`openMany`) |
| Boot to first tap | ≤ 2.5 s on the target phone (no zone generation: the first slabs generate in about 10 ms) |
| Offline settlement | ≤ 5 ms for 24 h |

---

## 12. Technical architecture

### 12.1 Module map (new code; everything not listed keeps its current place)

```
src/core/          big.ts (Big numbers), ease.ts, spring.ts; events.ts (the generic EventBus), math, noise, rng (kept)
src/idle/          the pure game: no Three.js, no DOM; unit-tested in Node
  config/          curves.ts, cells.ts, upgrades.ts, crew.ts, gear.ts, skills.ts, biomes.ts, biomeLooks.ts, chests.ts,
                   events.ts, facets.ts, feats.ts, rank.ts, codex.ts, prestige.ts (perks, Loom, Breach), contracts.ts,
                   path.ts, mutators.ts
  num/notation.ts  suffixes, letter pairs, scientific, engineering, depth text
  model/           state.ts (IdleState), run.ts (costs, buys, DPS, BEST), shaft.ts (rows, pierce, crumble), tap.ts,
                   crew.ts, skills.ts, surge.ts, offline.ts, prestige.ts, seals.ts, director.ts, widgets.ts, chests.ts,
                   contracts.ts, daily.ts, codex.ts, feats.ts, rank.ts, facets.ts, records.ts, goals.ts, tutorial.ts,
                   hints.ts, step.ts (one fixed step of the whole model)
  bus.ts           IdleEvents: every event name and payload (the contract between the model, the world, the FX and the UI)
  sim/             bot.ts, pacing.ts (the headless sim shared by tests and tools/econ-sim.ts)
src/world/descent/ RingWorld.ts, slab.ts, slabWorker.ts, slabLoader.ts, strata.ts, caverns.ts, fill.ts, tutorialRows.ts,
                   biomeKits.ts, fingerprint.ts
src/render/descent/ §11.4;  src/render/fx/ §11.4;  src/render/post/lut.ts
src/game/          IdleGame.ts (replaces Game.ts), DigController.ts (tap → model → world edits), FrameGuard.ts (kept),
                   effects/ (LootPop, Halos, LumenMoths, Waterfall, moths), fx/ (JuiceDirector, juiceBudget, juice, CameraFx,
                   Timeline, ceremonies/*)
src/ui/idle/       TapSurface, TopBar, GoalBar, DepthRuler, EventBubbles, SkillRow, QuickBuy, Card, Sheet, sheets/{Dig, Crew,
                   Board, Feats, Codex, Lantern, Ladder, Settings}, FacetHand, ChestReveal, FeatToast, FirstTimeCard,
                   TitleCard, ReturnFeast, RekindleScreen, SealHud, widgets/{Catch, Mash, Strike, Sequence, Pick}, GhostHand,
                   idle.css
src/ui/fx/         FxCanvas, spriteAtlas, Ticker, displayLedger, press, waapi
src/audio/         cues.ts (ladders, latency-aligned scheduling) + new recipes in sfx.ts; eventMap.ts maps IdleEvents
src/i18n/en/       idleCore.ts (systems, cards, goals, tutorial), idleWorld.ts (biomes, creatures, Finds, Wardens),
                   idleUi.ts (HUD, sheets, settings, ceremonies), idleLore.ts (notes, murals, seal cards, Echo fragments)
src/save/          types.ts (SaveV3), saveData.ts (create, validate, normalize v3), SaveSystem.ts (version 3, legacy detection)
src/debug/         idle.ts (window.__DD__.idle), DebugApi.ts (reduced to the engine helpers that remain)
```

### 12.2 The frame (one `requestAnimationFrame`)

1. **Input:** drain the tap ring (TapSurface), hold and swipe repeats.
2. **Simulation:** fixed 1/60 s steps (at most 4 per frame) of `model/step.ts`: taps → `resolveTap`, crew, skills, Surge, the
   Director, seals, goals, tutorial, hints; it emits IdleEvents. The economy is exact at any speed (analytic rows when > 6 rows/s).
3. **JuiceDirector:** maps events to cues under the budgets; advances the FX clock (hit-stop).
4. **World:** DigController applies cell breaks (3 `world.set` each, or batched with `openMany`), applies at most one finished slab
   per frame, recycles, updates SectionField; DescentCamera targets the floor.
5. **FX state:** shards (CPU), GPU particle spawn writes, CameraFx (shake, kick, follow, dolly, dive), crew, creatures, loot pops.
6. **Render:** the scene at scale `s` (opaque front to back; liquids; Vista layers; additive cones, beams, halos, particles; SDF
   titles) → post (bright, bloom, rays when active, the native composite).
7. **FxCanvas:** numbers, tokens, trails, sparks, confetti, in the same rAF.
8. **DOM:** tickers and card states; writes only on change.

Autosave every 30 s, on pause, `visibilitychange` and `pagehide`, after a Rekindle, Weave or Breach, after a seal or a reveal, and
2 s after a purchase burst. Two-slot writes with checksums (the existing pipeline).

### 12.3 Save v3 (`src/save/types.ts`)

```
SaveV3 {
  version: 3, savedAt: epochMs, monotonicMs, playTime, seed, runIndex,
  run: {
    depth, floor: { kinds: u8[7], left: f64[7] }, below: [{ kinds, left }] × 3,
    gold: Big, pick, rally, lucky, shock, steady, bellows, lines: number[], gear: string[],
    skills: { [id]: { lvl, cdEnd } }, facets: string[], pendingHands, freeReroll, surge, runTime, dmaxRun,
    rack: number, ghost: number[] (depth every 30 s of the previous run), harvested: { [cavernId]: bitset }, breach: null | { id, tier }
  },
  meta: {
    embers: Big, embersMax: Big, threads: Big, loom: { [node]: lvl }, sigils: { [id]: tier },
    record, cycleRecord, sealsOpened: number[] (biome indices), gems, timeCrystals, boostEnd,
    finds: { [id]: lvl }, bestiary: { [id]: count }, lore: string[], biomeSeals: number[],
    feats: { [family]: tier }, secrets: string[], marks, rank: { r, xp },
    records: { deepest, splits: { [biome]: s }, marks500: { [m]: s }, bestHit: Big, bestCombo, bestTapCells, bestChest, bestOffline, bestEmbers: Big },
    planted: [{ depth, n }], contracts: [3 × { tpl, target, progress }], contractCount,
    daily: { lastDay, calendarDay, claimedToday }, pity: { crystal, reliquary, lintel },
    tutorial: { step, done }, path: { step }, hints: { [id]: count }, firstTime: string[],
    cosmetics: { owned: string[], equipped: { [slot]: id } },
    stats: { taps, cells, crits, chests, events, creatures, purchases, stars, rekindles, weaves, offlineHours },
    lifetime: { gold: Big, embersEver: Big }
  }
}
```

- Big values serialise as `[m, e]`; cell HP is stored as remaining fractions; the save is ≤ 16 KB.
- Settings stay under their own key (`deepdown.settings`) and are kept across the switch; `sanitizeSettings` drops the obsolete
  fields (`lookSensitivity`, `invertY`, `cameraFollow`) and adds `motion`, `flashes`, `notation`, `hapticStrength`, `breakReminder`,
  `autoFacets`.
- **Old saves:** `SAVE.version` becomes 3 and `MIGRATIONS` becomes empty. A slot whose version is 1 or 2 is reported as `legacy`:
  it is not loaded, the first screen shows one line once ("Saves from the old cave expedition can't be continued. A new descent
  begins."; the flag `deepdown.legacyNoticeShown`), and the two-slot rotation overwrites the legacy slots with the first v3 saves. A
  version above 3 keeps today's "saved by a newer version" refusal.

### 12.4 The debug and test surface (`window.__DD__.idle`, `src/debug/idle.ts`)

`state()` (a JSON snapshot), `goal()` (the goal bar's text and fill), `fx()` (live counts: numbers, tokens, particles, shards,
flashes in the last second), `lastTapFrames()` (frames from `pointerdown` to the first changed frame), `ledger()` (actual, shown,
in flight), `columns()` (the screen strips of the 7 columns and the floor y), `advance(seconds)` (fast-forward with crew only),
`setDepth(m)`, `give({ gold, gems, embers })`, `forceEvent(id)`, `forceChest(tier)`, `toSeal()` (jump to 2 m above the next
seal), `offline(hours)` (rewind `savedAt` and reload), `perf()` (frame, slab, light timings), `programs()` (shader program count),
`ready` (true once the first frame drew). End-to-end tests drive the game with **real touches** (CDP `Input.dispatchTouchEvent`
through `tests/e2e/touch.ts`) and use the debug surface only to set up a state or to read results.

---

## 13. Acceptance metrics (each one a test, a simulation check or a capture metric)

### 13.1 Economy and pacing (Vitest; `src/idle/sim` on the real tables, the bot of Appendix A, all systems on at expected rates)

| # | Metric | Pass |
|---|---|---|
| E1 | the first tap breaks the first cell | HP(0) = pick(1) = 100 |
| E2 | first purchase | ≤ 6 s at 5 taps/s, ≤ 10 s at 3 taps/s |
| E3 | first crew | ≤ 12 s |
| E4 | first-run depth times (5 taps/s) | every row of §5.12 inside its band; a 3 taps/s run within ×1.6 |
| E5 | the longest gap between rewards (purchase, chest, biome, event, contract, Feat) in the first 30 min | ≤ 30 s |
| E6 | taps per cell over the first 45 min | p50 ≤ 4, p90 ≤ 7 |
| E7 | offline closed form vs 1 s steps (7 cases, 1–24 h, depth 0–6,000 m, DPS 1e1–1e80) | depth error ≤ 1e-6 m, gold ≤ 1e-9 in log10; never past an unopened seal; ≤ 5 ms |
| E8 | after a recommended Rekindle the next run passes the old record | within max(10 min of active play, 40 % of the previous run) |
| E9 | no Rekindle chains | over 7 sim days, never 3 consecutive Rekindles with runs < 3 min |
| E10 | the session sim | day 3 record ≥ 6,500 m; ≥ 1 new biome on days 2 and 3; with Breach on, ≥ +600 m a day in days 8–14 and an Echo stratum at least every 2 days |
| E11 | 1e100 gold | by the end of day 2 |
| E12 | the goal bar | a goal ≥ 15 % done with an ETA ≤ 90 s, or the fallback, in 100 % of 0.5 s samples over a 2 h sim; median fill ≥ 0.55; fill ≥ 0.5 for ≥ 65 % of the first hour |
| E13 | the cell mix | expected multiplier 1.00 ± 0.01 for every biome and mutator |
| E14 | Big and notation | add, mul, pow round-trip within 1e-12 relative; formats match §5.1 from 1 to 1e3000; 0 NaN or Infinity in a 10 h sim |
| E15 | chests | Monte Carlo 1e6 seeded rolls from Wood: Copper+ 40 % ± 0.3, Crystal+ 12 % ± 0.2, Reliquary+ 2.4 % ± 0.1, Lintel 0.24 % ± 0.03 (pity off); pity never exceeded |
| E16 | no store, no punishment | a static scan of `src/` finds no payment, ad or network API; no failure, timeout or absence subtracts anything; missed days pause |
| E17 | novelty | a never-seen mechanic at least every 4 min for the first 40 min (the unlock log of a scripted run) |
| E18 | Feats | ≥ 12 tiers in 30 min, ≥ 25 by the end of day 1, ≥ 50 by day 3; thresholds strictly increase; every tier has a reward |
| E19 | Rank | rank 10 between 12 and 20 min of play |
| E20 | taps matter | active ÷ idle income between 2 and 4 at minutes 5, 30 and 120, and in runs 1, 3 and 6 |
| E21 | seals | an active bot (4 taps/s) breaks every first-time seal on its first try in ≥ 90 % of seeds; a crew-only bot fails it |
| E22 | contracts | ≥ 95 % generated with an ETA of 90–240 s |
| E23 | the Director | intervals in [40, 70] s while active; no type twice in a row; every unlocked type in any 10 consecutive (10,000-event fuzz) |
| E24 | facets | no duplicate in a hand; duos only when eligible; rarity odds ± 0.5 pt; E4–E11 hold with facets on |
| E25 | side multipliers | their product ≤ ×10 at the end of day 3 and ≤ ×30 at day 7 |

### 13.2 Feel and input (Playwright at 390 × 844, touch through CDP, SwiftShader; F2–F5 also at 360 × 740 and 412 × 915)

| # | Metric | Pass |
|---|---|---|
| F1 | `pointerdown` → first changed frame | ≤ 1 frame for 200 of 200 taps (`lastTapFrames`) |
| F2 | a tap never misses | 500 random taps in the world region all resolve to a target |
| F3 | column mapping | 20 random points per column map to it; taps in the wall margins map to columns 0 and 6 |
| F4 | the first tap of a new game | breaks a cell and launches a coin that reaches the counter in 0.5–0.9 s |
| F5 | hold and swipe | a 2 s hold gives 9–11 hits; a swipe across 7 columns in 0.5 s gives 7 hits |
| F6 | never block the thumb | 0 dropped taps of 1,000 tapped every 37 ms through a pick-tier ceremony and a biome reveal; a tap during a hit-stop ends it in that frame |
| F7 | gains travel, counters roll | 100 % of gold and gem credits go through the ledger; the displayed gold changes by ≤ ×1.5 per frame outside scripted counts (sampled every frame for 60 s) |
| F8 | flashes and motion | ≤ 2 full-screen flashes in any second, intensity ≤ 0.35 (Rekindle 0.40), none red; under Reduced the camera equals its rest pose every frame |
| F9 | haptics | ≤ 20 `vibrate` calls a second and ≤ 40 % duty during 10 s of 15 taps/s with a Surge (stubbed vibrate) |
| F10 | no DOM churn | 0 element creations over 200 taps (MutationObserver); 0 DOM writes in a steady frame |
| F11 | sheets | with a sheet open, taps above it still dig |
| F12 | burst budget | 10 s at 15 taps/s + a Surge: numbers ≤ 48, tokens ≤ 24, particles and shards ≤ the preset caps, 0 console errors |

### 13.3 Guidance and UI

| # | Metric | Pass | How |
|---|---|---|---|
| G1 | the tutorial | a bot tapping the centre at 4/s and any highlighted target reaches Seal 1, the Glowroot reveal and the first gear purchase within 2:30, with every step shown in order; no step waits > 25 s | e2e |
| G2 | the objective | the goal bar is visible and non-empty in every sampled frame of a 5 min scripted play, with a sheet open and during ceremonies | e2e |
| G3 | hints | each ≤ 3 times a lifetime; never over the dig row | unit + e2e |
| G4 | a random tapper (3 taps/s at random world points, never reads) | 20 m within 60 s | e2e |
| G5 | nothing unexplained | every system, event type, tab and widget has a first-time card and a Guide entry; every i18n key resolves | unit |
| U1 | touch targets | ≥ 48 px at 360 × 740, 390 × 844, 412 × 915 | `tools/ui-check.mjs` |
| U2 | text | ≥ 12 px; contrast AA (`TEXT_PAIRS` extended) | ui-check + `brand.test.ts` |
| U3 | layout | no overlap between the top bar, goal bar, skill row, quick-buy, tabs and sheets; the floor y within the world region with and without a sheet; no horizontal scroll | ui-check |
| U4 | thumb rule | every control except the top-bar plates, the goal bar and ≡ in the bottom 45 % | ui-check |
| U5 | WebView 88 | 0 matches of individual transform properties, `linear()`, `:has()`, `@container`, `outputLatency`, WAAPI `composite: 'add'` | `tests/unit/compat.test.ts` |

### 13.4 World and visuals

| # | Metric | Pass | How |
|---|---|---|---|
| W1 | density | every 20 m window meets §6.6's targets over 2,000 generated rows per biome and per mutator | `tests/unit/idle/fill.test.ts`, `tools/fill-scan.ts` |
| W2 | fill rules 1–7 | 0 violations over 0–14,000 m | `tools/fill-scan.ts` |
| W3 | determinism | the same slab bytes for the same (runSeed, index) in Node and in the worker | unit |
| W4 | the ring | after 200 recycles (and after 1,000 rows streamed in e2e) the light equals a fresh compute and every chunk equals a fresh mesh (`meshCheck`) | unit + e2e |
| W5 | the shaft guarantee | 0 unbreakable cells in the footprint over 10,000 slabs | unit |
| W6 | light budget | emitters per slab inside §11.2's range for each biome | fill-scan |
| V1 | brightness and contrast | mean sRGB luminance of the world region 0.20–0.38 and std ≥ 0.16 in every biome capture (the old game: 0.105–0.355 and 0.093–0.140) | `tools/descent-capture.mjs` + `tools/png.mjs` |
| V2 | never dark | ≤ 10 % of world-region pixels below 0.03 luminance | capture |
| V3 | never blown | ≤ 0.8 % clipped pixels (Star Heart included); < 5 % during a crit | capture |
| V4 | sparkle | accent pixels (saturation > 0.6, luminance > 0.5) 1–6 % | capture |
| V5 | biome distinctness | ΔE2000 ≥ 8 between consecutive biome LUTs on a neutral ramp | unit (`lut.ts`) |
| V6 | cell size | 44 ± 1 CSS px wide, ledge ≥ 22 px, at all three viewports | unit (DescentCamera) |
| V7 | focus | the dig band (±1 m around the floor) ≥ 1.25 × the world region's mean luminance in every biome | capture |
| V8 | HUD contrast | ≥ 4.5:1 on its scrim over the brightest biome capture | capture |
| V9 | the section rim | cavern outline pixels ≥ 1.3 × the rock 1 m inside | capture |
| V10 | crisp | FX-canvas text edge ≤ 1.2 device px at DPR 2 and 3; every pixel-art icon at an integer texel size | capture + unit |

### 13.5 Performance and stability

| # | Metric | Pass | How |
|---|---|---|---|
| P1 | draw calls / triangles | ≤ 110 / ≤ 160k on Balanced in every biome capture (High ≤ 140, Battery ≤ 80) | `tools/perf.mjs` |
| P2 | main-thread CPU | p95 ≤ 6.5 ms during 5 taps/s with Dynamite (SwiftShader, CPU side) | perf.mjs |
| P3 | no shader compiles after load | `programs()` constant across a 14-biome tour and every ceremony | e2e |
| P4 | slab apply | ≤ 4 ms main thread; the Plunge exit hitch ≤ 8 ms | perf.mjs |
| P5 | memory | heap delta ≤ 64 KB over 1,000 taps; ≤ 5 MB over a 20,000 m soak with 0 crash-panel events | e2e |
| P6 | boot to first tap | ≤ 2.5 s (production build, headless) | perf.mjs |
| P7 | the device | 60 fps median on Balanced on the 2022 mid-range class; GPU ≤ 12 ms; touch-to-photon ≤ 50 ms | `docs/device-test-protocol.md` |
| S1 | save | v3 round-trips (500 random states); a corrupt slot falls back; ≤ 16 KB | unit |
| S2 | old saves | v1 and v2 are ignored with one notice, settings kept, legacy slots overwritten by the first v3 save | unit + e2e |
| S3 | clock | a rollback gives 0 offline time and never a negative value; daily items hold | unit |

---

## Appendix A. The calibration model (port to `src/idle/sim/`)

- **State per run:** depth, row progress, gold, pick level, line levels, gear bought; meta: Embers, Threads, record, cycle record.
- **Step:** 0.5–1 s active, 60 s offline.
- **Damage:** `DPS = Σ lineDPS + 5 taps/s × min(tapDmg, cellHP)` with `tapDmg = (pick + rally × crewDPS) × combo 1.5 × crit 1.2`
  (taps never deal more than one cell's HP in the model, so overkill is conservative). A row costs κ × 7 × H(d).
- **Gold:** HP dug / 100. A chest cell every 25 rows pays 30 s of income. A Lucky Moth every 150 s pays 40 s (the first at 100 s).
- **Bot:** every step it buys the item with the best `ΔDPS / cost` among items affordable within 60 s of income (crew valued ×1.3
  because it works offline); it hires the first Shovel Hand as soon as possible; it Rekindles exactly by the §5.9 rule and never in
  the last 3 minutes of a session; it Weaves when the cycle's Thread gain ≥ Threads owned and ≥ 6 h after the last Weave (the Loom
  spend modelled as Crew Weave, ×3 per doubling of Threads).
- **Sessions:** 40 min, then 6 min every 2 h from 08:00 to 24:00; offline 50 % with the 3 / 6 / 12 h caps.
- **The TypeScript port adds,** each at its expected rate: seals (20 s of active time per first-time seal, paying a Crystal chest),
  the first-sight rule offline, skills on cooldown (an active player uses each when ready), the Surge (18 % uptime), events (one per
  55 s, paying their table value), facets (the bot picks the highest ΔDPS card), Finds, the Bestiary, Marks, Rank and Biome Seals at
  the drop and earn rates of §7, chest roll-ups, Breach (the bot runs the cheapest challenge tier when no Rekindle or Weave is
  recommended at the end of a session), and a "human" profile (3 taps/s, a 2 s delay before each purchase, BEST-only buying).
- **Knobs** (all in `src/idle/config/curves.ts`, `prestige.ts`): the slopes, the pick c0 and r, the tier ×2.5, Rally 14 %, the line r
  1.10, the line cost 26.6 rows and output HP/44.4 at unlock (lines 0–5), the ×1e4 ladder for lines 6+, gear 2.5–7.5 rows, the Ember
  total `25 × 2^((R − 600)/200)`, the Thread total `10 × 2^((R − 3,100)/300)`, κ. `tools/econ-sim.ts` reprints §5.12 in under 30 s.
