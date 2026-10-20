# DEEP DOWN: idle descent design, from the loops angle (KEY: loops)

Author's angle: varied moment-to-moment loops and side activities. This document still covers the
whole game, but sections 1, 6 and 7 (loops, discovery/events, guidance) go deepest. Every number
here is a starting value. They live in `src/config/idle/*.ts`, and the acceptance tests in
section 11 hold them to the pacing targets.

---

## 0. The game in one screen

Portrait, one thumb, no joystick. You look at a **cutaway diorama**: a cross-section of the earth
under the old Halden camp, with your shaft cut into it like an ant farm. Tap rock and it cracks,
bursts and throws loot that flies into your counters. Your crew digs on its own, even while the
phone is locked. Something happens every 30 to 60 seconds: a gold rush, moths to catch, a cave-in,
a crate on a rope, a crawler carrying a sack. Each new biome is a reveal, and each biome is twice
as deep as the last: 100 m, 300 m, 700 m, 1.5 km, and on until you pass the Kola borehole, the
Earth's core, the Moon and the Sun. **Rekindle** relights the lantern and refills the shaft. The
next run then ploughs in 40 seconds through what took 30 minutes.

**Loop pillars (each one is tested, see section 11)**

| Pillar | Rule |
|---|---|
| Constant reward | Tapping steadily never goes more than 2 s without a reward pop (a number, loot or a counter bump). |
| Constant surprise | A *beat* (event, special block, creature) comes every 30 to 60 s. No same event twice in a row. |
| Constant milestone | A *milestone* (contract, chest, cavern, upgrade tier, stratum marker) comes at least every 4 min. |
| Constant novelty in hour 1 | A mechanic the player has never seen arrives at least every 4 min for the first 40 min. |
| One verb | Everything is a tap on something that glows. There are no gestures, no drags and no pinch. |
| Never lost | No system removes currency or progress. Absence is rewarded (offline), never punished. |
| Always a next goal | One objective line and one next-goal bar are on screen at all times in play. |

---

## 1. Core loop at three scales

### 1.1 Ten seconds: tap, crack, burst, fly, bump, drop, see the next treasure

| t | What happens | Feedback |
|---|---|---|
| 0.00 s | Thumb taps the shaft. The cell under it, or the top cell of that column, takes damage. | Crack stage up, spark, damage number, 6 ms haptic, pick swing 0.12 s |
| 0.25–1.0 s | 1 to 4 taps break a normal cell; leftover damage carries into the next cell | Break burst (12 to 24 debris), material sound, combo pitch rising |
| +0.45 s | 1 to 3 loot icons arc from the cell to the Gold counter | Counter digits roll, the counter scales to 1.15 and back |
| row clear | The bottom row of 7 is gone: the explorer drops 1 m and the camera follows (spring, 0.18 s) | Depth odometer ticks, soft "thunk" |
| always | A special cell (ore, chest, fossil, barrel, crystal) is visible ahead in the next 6 rows of rock | It glows on the cut face, so anticipation is built in: "3 more rows to that chest" |

Contract: with 4 taps/s at the frontier, a cell breaks at least every 1.2 s; the median time
between breaks of *special* cells is 4 to 8 s.

### 1.2 Three minutes: the session beat

A typical 3-minute window at minute 20 of play (reference player, 4 taps/s):

| Count per 3 min | Item |
|---|---|
| ~720 | taps |
| ~350 | cells broken, about 45 m dug at the frontier (15 to 40 m/min target) |
| 4 (3 to 6) | events from the Director (section 6.1) |
| 1–2 | contracts completed (3 slots, each tuned to 1.5 to 3 min) |
| 1 found, 1 opened | chests |
| 6–12 | upgrade purchases, at least 1 of them a milestone (×2) |
| 1 | cavern breakthrough (one every 25 to 40 rows) |
| 1 | stratum marker (every 25 m in biomes 1 to 3, then every quarter of a biome): free Iron chest + marker banner |
| ~2 | specimens (codex), about 1 of them new while the biome's set is incomplete |

### 1.3 Three days: the arc

| Day | Sessions (reference) | Reached | New systems met |
|---|---|---|---|
| Day 1 | 3 × 20 min + 1 × 40 min; 8 h offline | Biomes 1–3, first Rekindle (~20 min), 3–4 Rekindles, Camp 3 buildings | tap, crew, events (10 types), contracts, chests, codex, guardian, Rekindle, Freefall, camp, Forge |
| Day 2 | 5 × 12 min + offline | Biomes 4–6 (to 6.3 km), Rift Dives, Altar 2 slots, about 30 % of the codex for biomes 1–6 | Rift (B4), daily contracts, combos in the Forge, Ascension preview |
| Day 3 | 5 × 12 min + offline | Biomes 7–8 (12.7 km, past the Kola borehole), first **Ascension** | Stars, Echo previews, mystery chapter 2 complete |

### 1.4 What keeps it endless

1. **Depth doubles per biome**: biome *b* (0-based) starts at 100·(2^b − 1) m. After the 12
   authored biomes come the **Echo strata**: the same 12 visual families, re-tinted, with
   stacking **mutators** (16 kinds, section 6.12). They never end.
2. **Real-world depth cards** turn the numbers into absurdity (section 6.12): Everest, Mariana,
   Kola, the crust, the Earth's centre (B16), the Moon (B22), the Sun (B31), a light-year (B47),
   the observable universe (B82). The depth display steps through m, km, Mm, AU and ly.
3. **Upgrades never cap**: every upgrade line is endless, with a ×2 milestone every 25 levels
   and a *tool evolution* every 100 pick levels (a new model, ×4).
4. **Three prestige layers**: Rekindle (Embers) from 200 m; Ascension (Stars) on first entry
   to B8; Starfall (Constellations) on first entry to B16.
5. **Collections with stars**: duplicates level codex entries up (1★ to 4★); Echo strata add
   shiny variants.
6. **The Director never runs dry**: decks per biome plus mutators give 16+ event types and 4
   mini-game widgets, recombined.

---

## 2. The tap

### 2.1 What one tap targets (in priority order, resolved in under 0.2 ms)

1. An **event target** within 56 CSS px of the finger (moth, boulder, crawler sack, spark, rift).
2. A **special cell** within 56 px that is exposed (has air on any face in the shaft or the cavern).
3. Otherwise a **column**: x = the shaft column under the finger, clamped to the 7 shaft columns;
   the target is the *top-most solid cell* of that column. A tap anywhere below the floor still
   hits the right block, so a miss is impossible.
4. Taps that land on HUD plates never reach the world.

Hold-to-dig (comfort and accessibility): a finger held for over 250 ms repeats taps at 3/s on the
same target. Tapping is faster (up to 10 counted taps/s; anything above that is ignored as noise),
so tapping always beats holding.

### 2.2 Damage formula

```
D_tap  = (PickDmg(L_pick) + Echo% × CrewDPS) × Combo × CritRoll × Global
PickDmg(L) = (1 + L) × 2^floor(L/25) × 4^floor(L/100)
Combo  = 1 + 0.02 × min(combo, ComboCap)       // ComboCap 50 → ×2.0; upgrades raise it to 150 → ×4.0
combo  += 1 per tap within 0.6 s of the last; resets after 1.2 s without a tap
Crit   = 4 % base chance, ×5 damage (Lucky Strike upgrade: +1 %/level to 50 %, +1× per 10 levels)
Global = (1 + 0.02 × Embers) × Π relics × codex sets × camp × Altar × 1.25^Stars
```

**Overkill carry.** Damage left after a cell breaks passes on to the next cell, in this order:
the cell below, left, right, below-left, below-right, then the next row. A tap can break up to
**28 cells** (7 × 4) at the start. The Pick Leap milestones at 200, 400 and 800 raise that to
56, 112 and 168. Beyond 168 cells, or at more than 12 rows/s, the game switches to **Freefall**
(section 5.6).

**Splash (Shockwave upgrade).** +3 % of tap damage per level goes to the 8 neighbours (cap 60 %).
At level 20 it reaches 5 × 5.

### 2.3 Feedback per tap and per break (detail in section 9)

| Moment | Visual | Audio | Haptic | Time |
|---|---|---|---|---|
| hit | crack stage (10 stages, `uTarget`/`uTargetHit`), 8 sparks, 6 dust puffs, white number | material hit, pitch +1 semitone per 5 combo (to +12) | 6 ms (60 ms min gap) | ≤ 1 frame |
| crit | gold number at 1.4× size, "LUCKY!", 60 ms hitstop, kick 0.06 m | crit ring | [10, 30, 20] | 60 ms |
| break | 12–24 debris in material colours, loot arc 0.45 s to the counter | material break plus a coin tick on arrival | 12 ms | 0.45 s |
| special break | 30 ms hitstop, coloured flash ring, item card pops beside the counter | rarity sting | [14, 30, 14] | 0.6 s |

### 2.4 How the tap scales (tool evolutions)

| Pick level | Tool | Visual | Effect |
|---|---|---|---|
| 1 | Rusty Pick | the current explorer pick | none |
| 25 | Copper Pick | copper head, warm trail | ×2 |
| 50 | Iron Pick | grey steel, bigger sparks | ×2 |
| 100 | Glimmer Pick | cyan edge, cyan trail | ×4 (evolution) |
| 200 | Steam Hammer | piston head, dust ring on impact | ×4, Pick Leap: 56 cells per tap |
| 300 | Rune Drill | 1 m drill head with rune bands | ×4 |
| 400 | Lantern Lance | light spear that pierces 8 rows | ×4, Pick Leap: 112 cells |
| 500 | Quake Gauntlet | shockwave rings across the shaft | ×4 |
| 700 | Star Bore | drill as wide as the shaft (7 m), starfield trail | ×4 |
| 800 | (Leap) | n/a | 168 cells per tap |
| 1000 | Worldbreaker | the whole screen shatters along the strata on a tap | ×4 |
| every +500 | Worldbreaker Mk II, III… | hue shift plus a bigger impact flash | ×4 |

The tool model grows in scale (1.0 → 1.4 → 2.2 → 3.5 → 7 m) until it is bigger than the explorer
and the camera has to frame it. That growth is the *démesure* the director asked for, made literal.

**Taps stay meaningful forever.** *Echo* makes each tap also deal 1 % to 40 % of crew DPS, so at
4 taps/s with combo, active play is **2.5× to 4×** idle at every stage (acceptance metric A8).

---

## 3. Idle and offline

**Crew online.** Crew damage is spread over the exposed cells of the bottom row, 4 hits per
second (gray numbers, at most 4 shown per second). Up to 7 crew models are drawn (instanced
explorer variants at 0.6 scale, one per owned tier, with tier colours and tools) on ledges and a
rope. Further tiers show as a "+N" banner.

**Offline (closed form, no stepping).**
- Elapsed time `Δ = clamp(now − lastSeen, 0, cap)`. The cap is 2 h, and each Lift level adds 2 h,
  up to 24 h. Clock rollback gives 0. Time is measured with wall-clock plus the saved monotonic
  delta.
- Crew digs at **100 %** DPS: no combo, no events. Depth advances along the same HP curve
  (integrated per biome segment), and gold comes from the same `goldPerRow`.
- **Offline stops at the next Guardian.** The crew cannot fight it, which is a reason to come
  back. So at most one biome boundary is crossed offline, and that biome's reveal plays on return.
- Chest timers, the Camp distillery (Glimmer +2/h per level) and daily resets all run offline.
- Return screen (one plate, one button): *"While you were away — 3 h 12 min. Your crew dug 412 m
  (−1,240 m). +4.21 Qa gold · 3 chests found · Contract 'Break 300 iron' complete · Stopped at the
  Crusher."* The button is **Collect**. The optional **Haul ×2** is an 8-second Catch mini-game
  (tap falling sacks; catching at least 12 of 20 doubles the gold). There are no ads, ever.
- **Welcome-back beat**: the Director forces a Lucky Spark or a Supply Crate within 5 s of the
  return screen closing, so the first 10 s back are rewarding.

---

## 4. Economy

### 4.1 Currencies (four, introduced one at a time)

| Currency | Look | Earned from | Spent on | Resets on Rekindle |
|---|---|---|---|---|
| **Gold** | amber coin, `amber400` | every cell (ore ×3/×8/×25), events, chests | upgrades, crew, Forge charges | yes |
| **Glimmer** | cyan shard, `rune200` | crystal cells (0.8 per 100 cells), contracts, chests, events, daily | Camp buildings, Altar talents, chest open-now, contract reroll | no |
| **Embers** | ember flame, `ember` | Rekindle | never spent; each one is +2 % to gold and damage, and totals unlock Altar slots | no (Ascension resets them) |
| **Stars** | violet star, `deep300` | Ascension | never spent: ×1.25 power and +25 % Ember gain each, plus +1 Rift boon choice per 5 | no (Starfall resets them) |

Specimens (codex cards) are collected, never spent. Duplicates add stars.

Big numbers: `BigNum` (float64 mantissa plus int exponent, pooled and allocation-free in the hot
path). Display: 1,234 → 12.3K → 1.23M, then B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, then aa, ab, …, zz,
then aaa. A setting switches to scientific (1.23e45).

### 4.2 Depth, stratum level, HP and gold

Biome *b* (0-based) covers **[100·(2^b − 1), 100·(2^(b+1) − 1)) m**, so its length is 100·2^b
rows (1 row = 1 m = 1 cell tall). The economy runs on the **stratum level** ℓ, which counts
exactly 100 per biome:

```
ℓ(d)      = 100·b + 100·(d − S_b) / L_b
cellHP(d) = 3 × hpScale_b × Π_{i<b} (1.05 + 0.004·i)^100 × (1.05 + 0.004·b)^(ℓ − 100·b)
cellGold  = 0.3 × 1.04^ℓ × materialMult     (normal 1, ore A 3, ore B 8, ore C 25, crystal 5)
rowHP     = 7 × cellHP
guardianHP = 20 × rowHP(end of biome) × guardianScale_b   (30 s timer; guardianScale_b fitted so A24 holds)
```

`hpScale_b` is a per-biome **calibration factor** (1.0 for biomes 0 and 1). `tools/sim-economy.ts`
fits it so the reference player meets the pacing table in 4.6 (see 4.7 for why this is required).

### 4.3 Upgrade table (Gold; levels are endless unless a cap is listed)

| # | Upgrade | Base cost | Growth / level | Effect / level | Milestones |
|---|---|---|---|---|---|
| U1 | **Pick** (tap power) | 5 | ×1.11 | +1 base damage | ×2 every 25; ×4 evolution every 100; Pick Leap at 200/400/800 |
| U2 | **Crew tier k** (k = 0…∞) | 15 · 16^k · 1.03^(k²) | ×1.14 | +0.6 · 9^k DPS | ×2 at every 25 owned; an extra ×2 at 100, 200, 300, 400 |
| U3 | **Echo** | 400 | ×1.55 | +1 % of crew DPS added to each tap | cap 40 (Altar +20); every 10: combo cap +5 |
| U4 | **Prospecting** | 60 | ×1.30 | gold ×1.10 | every 10: ore chance +1 % (absolute) |
| U5 | **Lucky Strike** | 250 | ×1.45 | crit chance +1 % (cap 50 %) | every 10: crit ×+1 |
| U6 | **Shockwave** | 1,000 | ×1.60 | splash +3 % to 8 neighbours (cap 60 %) | level 20: 5×5 |
| U7 | **Combo Cap** | 2,000 | ×2.20 | combo cap +5 (50 → 150) | cap 20 levels |
| U8 | **Lantern Oil** | 5,000 | ×1.90 | event interval −2 %, event rewards +2 % | cap 20 levels |

Crew names: Shoveler, Pickman, Driller, Blaster, Cart Golem, Steam Borer, Moth Swarm,
Loom-wright, Star-eater, Void Drill, Worldbreaker, Deep Sun. Tier 13 onward is "Mk II" of tier 1
onward (re-tinted model), and so on, without end.

Buy modes: ×1 / ×10 / ×MAX (sum of a geometric series, closed form). A row shows its effect as
the before → after *DPS or damage* in BigNum, not abstract levels.

### 4.4 Multipliers (all multiply together)

| Source | Value | Gained |
|---|---|---|
| Embers | 1 + 0.02·E | Rekindle |
| Guardian relics | ×1.5 each, first defeat per biome | 12 authored + 1 per Echo biome |
| Codex sets | Vein set ×1.25 gold; Relic set ×1.5 damage; Creature set +10 % event rewards; Fossil set unlocks a Forge recipe | collections |
| Camp | Bunkhouse +10 % crew/level; others section 6.9 | Glimmer |
| Altar talents | section 4.5 | Glimmer, slots from Embers |
| Stars | ×1.25 each (and +25 % Embers from Rekindle each) | Ascension |
| Temporary | Gold Rush ×2, Frenzy ×5 tap, Overdrive ×10 crew, boons, charges | events |

### 4.5 Prestige

**Rekindle** (unlocks on first reaching 200 m, at the Lantern Shrine cavern in Crystal Veins):
- Embers gained = `floor((ℓ_max − 100)^1.3)`: 200 m → 161, 250 m → 273, 300 m → 398,
  700 m → 980.
- What resets: gold, upgrades U1–U8, crew, depth (back to 0), and the active boons.
  What stays: Embers, Glimmer, codex, relics, camp, Altar, chests in slots, contracts, records.
- Preview, always visible on the Shrine plate: **"Rekindle: +273 Embers → power ×6.5"**.
- The button glows (the "recommended" state) when the gain is at least 50 % of current Embers
  **and** the frontier has fallen below 1 m per 8 s for 60 s. The objective line then reads
  "Rekindle for +273 Embers".
- Cinematic (4 s, skippable after 1 s): the Lift races up, the lantern flares white, the shaft
  refills strata by strata from the bottom, embers rain into the counter. Then **Freefall**
  starts at once (section 5.6): the new run blasts through the old depths.

**Altar of Embers** (in the Camp): slots unlock at total Embers of 10, 100, 500, 2,500, 10k, 50k,
250k and 1M. Each talent's levels cost Glimmer: 5 × 1.5^n.

| Talent | Per level |
|---|---|
| Quick Start | start each run with 10·n levels of crew tier 0–2 |
| Deep Pockets | offline efficiency +10 % (100 % → up to 200 %) |
| Ember Harvest | Embers from Rekindle +5 % |
| Frenzy Heart | combo lasts +0.2 s before decaying |
| Spark Magnet | Lucky Spark rewards +10 %, 1 extra spark per 10 events |
| Freefall Mastery | Freefall auto-collects 10 % more passing treasures |
| Guardian Bane | guardian HP −4 % (cap −40 %) |
| Chest Luck | +3 % chance to upgrade a chest one tier when it drops |
| Board Boss | contract rewards +8 % |
| Event Mastery | event duration +5 % |
| Crew Morale | crew DPS ×1.15 |
| Echo Reach | Echo cap +2 |

**Ascension** (first entry into B8, past the Kola borehole): resets Embers and the Altar levels
(slots and Glimmer spent are refunded as 50 % Glimmer). Grants Stars = `floor(√(lifetimeEmbers / 100))` (about 17 at 30k lifetime Embers).
Each Star is ×1.25 to everything and +25 % to Embers from every later Rekindle, and every 5 Stars
add a Rift boon choice. The Shrine recommends Ascension only when it would grant at least 10 Stars;
the sim calibrates it so the first post-Ascension run regains the old depth within 40 min.
**Starfall** (first entry into B16): resets Stars and grants Constellations, each ×1.5. Their
detailed tuning is deferred to the economy specialist; the hooks exist from wave 3.

### 4.6 Pacing targets (reference player: 4 taps/s while playing; offline is crew-only)

| Milestone | Target (cumulative active time) | Tolerance |
|---|---|---|
| First cell broken | 3 s | ≤ 3 s |
| First upgrade affordable | 10 s | ≤ 15 s |
| First crew | 30 s | ≤ 45 s |
| 25 m | 25 s | ±10 s |
| 100 m: Guardian 1, then the B2 reveal | 2.5 min | ±40 s |
| 200 m: Rekindle unlocked | 9 min | ±3 min |
| First Rekindle (~250–300 m) | 20 min | ±8 min |
| B3 Forgotten Works (300 m) | 30 min | ±10 min |
| B4 Buried Sea (700 m) | 60 min | ±15 min |
| B5 Hollow Core (1.5 km) | 1.6 h | ±25 % |
| B6 Abyss (3.1 km) | 2.5 h | ±25 % |
| B7 Ember Mantle (6.3 km) | 4 h | ±25 % |
| B8 Starlit Geode (12.7 km): Ascension | 6.5 h (day 3) | ±25 % |
| B10 (51 km) | 12 h | ±30 % |
| B12 Lantern Throne (205 km) | 20 h | ±30 % |
| After that | one new Echo biome per 1.5–3 h of play | n/a |

Run-shape targets: **run n+1 reaches run n's maximum depth in at most 35 % of run n's duration**,
and the Freefall part of a run lasts 10 to 60 s.

### 4.7 Simulation evidence (and why calibration is mandatory)

I ran a greedy reference-player simulation (log-space, 4 taps/s, combo 1.6, events +30 %; files in
the scratchpad). Its **run-1 numbers match the targets above**: 25 m at 24 s, 50 m at 49 s, 100 m
at 2.5 min, 150 m at 4.5 min, 200 m at 8.8 min, and a soft wall near 280 m.

Later runs show the classic **knife edge** of exponential idle economies. Small changes in
prestige formulas swing the outcome between a stall and a runaway:

| Variant (otherwise same constants) | Result |
|---|---|
| Embers additive +2 %, gain (ℓ−100)^1.3, relics ×1.5 | run 1 rekindles at 209 m; run 2 leaps to 7.2 km; runs 3–14 crawl from 30 km to 86 km (B9 → B10: a logarithmic stall) |
| Embers multiplicative ×1.004 each, gain ℓ − 150 | ~1 biome per run from run 6 to run 11, then a runaway (10^7 km by run 14) |
| Embers additive, relics ×3 per biome | runaway: 10^27 km by run 8, after 1.7 h |

Conclusion: biome-by-biome difficulty must be **calibrated to target times**, not derived from
hand-picked exponents. `tools/sim-economy.ts` (section 10) runs the reference player with every
multiplier source (relics, codex at expected collection rates, camp at expected Glimmer, Altar,
events). It fits `hpScale_b` for each biome b ≥ 2 so the cumulative times in 4.6 are met, writes
them to `config/idle/biomes.ts`, and a Vitest test fails if any target drifts more than 25 %. For
Echo biomes, `hpScale_b` follows a fitted geometric series, extrapolated so each one takes 1.5 to
3 h.

---

## 5. The descent and the world in the voxel engine

### 5.1 The world window (a streaming ring in y)

| Item | Value |
|---|---|
| `VoxelWorld` | **48 × 128 × 32** (x, y, z): 196,608 voxels, 16³ chunks (3 × 8 × 2 = 48 chunks) |
| Light texture | 48 × 128 × 32 RGBA8 = 786 KB (it was 13 MB for 160×128×160) |
| Shaft | x 20–26 (7 cells), trench z 2–4 (one gameplay cell = 3 voxels deep), back wall z ≥ 5 |
| Cut plane | z = 2. Voxels at z 0–1 are open *void*: air for meshing and rays, ignored by openness so the cut face does not take sky-like fill |
| Caverns | z 2–29, any x; bedrock shell at x 0 and 47, z 30–31 |
| Recenter | when the dig front rises above window y 40, shift everything up **64 rows** (exactly 4 chunk rows) |

**Recenter step (one frame, ≤ 4 ms on the main thread):**
1. `blocks.copyWithin` (98 KB), then `light.copyWithin` and a full re-upload (786 KB, about 1–2 ms).
2. The chunk meshes of the kept rows are *relabelled* (chunk y index +4, group translated); none
   is re-meshed.
3. The explorer, crew, drops, particles, event entities and camera all move +64 m in the same
   frame, so the shift is invisible.
4. The lower 64 rows were already generated by `genBand(seed, row0, 64)` in the band worker
   (~5 ms off-thread) and meshed by the mesh pool (24 chunks × ~0.8 ms in workers) before they
   came into view. Their light is computed in the worker with the shared border row as the seed
   (~6 ms).

Bookkeeping: `depth = windowBaseRow + (windowTopY − y)`. The save stores seed, depth, the window
base and the edits inside the window as a delta against `genBand`, RLE-compressed (≤ 8 KB typical).

### 5.2 Camera (portrait, fixed, follows the descent)

| Parameter | Value |
|---|---|
| Projection | perspective, vertical FOV from the aspect (32° at 390×844), pitch −6°, no yaw |
| Distance to the cut plane | 41.5 m. The lens keeps **11 m of visible width** at every aspect (7 shaft + 2 wall columns each side; the vertical FOV is derived from the aspect, 32° at 390×844): 390×844 sees 23.8 m of height at 35.5 CSS px/m, 360×740 sees 22.6 m at 32.7 px/m, 412×915 sees 24.4 m at 37.5 px/m |
| Follow | critically damped spring on y, ω = 8 /s, max 40 m/s. The dig front sits at 58 % of the play area's height: 8 m of dug shaft above, 5.8 m of upcoming rock below |
| Sheet open | the front eases to 60 % of the remaining visible strip in 0.25 s, so the front and 2 m below stay visible |
| Reveal dolly | caverns ≥ 16 m wide and biome entries: back to 72 m (19 m wide) for 2.4 s with a 0.25 s slow-mo, then return |
| Guardian | the frame centres on the arena, 2.4 s |
| Shake | additive, capped at 0.12 m, decays at 12 /s; the setting scales it, reduced motion turns it off |

The smallest cell is 32.7 px (360-px-wide phones). Snapping (2.1) makes that comfortable: the
effective target is the whole column or a 56-px disc.

### 5.3 What one generated band contains (deterministic per seed and row)

1. **Base rock**: the biome's 3–4 rock families in dipping strata (marker beds every 6 to 14 rows),
   using the existing rock materials re-palettized per biome.
2. **Ore veins**: biome ore table (6.2), noise-shaped lenses 2 to 6 cells long.
3. **Special cells**: drawn from the table in 6.2. A post-pass guarantees **at least one special
   in every 4-row window** of the shaft plus exposed walls.
4. **Caverns**: one every 25–40 rows in B1–B3, every 30–60 rows deeper (scaled by biome). Size
   9–20 m tall, 12–40 m wide, 8–26 m deep in z. Each is one of 8 types (6.3); emitters stay
   within ≤ 40 per 64-row band, in line with the existing light budget.
5. **Stratum marker** every 25 m (B1–B3) or every L_b/4: a carved Halden depth plaque in the wall
   and a free Iron chest cell.
6. **Guardian arena** in the last 14 rows of each biome: a 12 × 12 chamber with the guardian.

### 5.4 Cavern types (each has at least 3 tappable things)

| Type | Weight | Set-piece | Tappables |
|---|---|---|---|
| Treasure vein | 22 | ore-lined walls | 8–20 ore cells in the walls, value ×1.5 |
| Halden camp | 14 | crates, barrels, a broken cart, a lantern post, a satchel (existing props) | crates and barrels break for loot; a Halden log (codex) |
| Ruin hall | 14 | Lantern-bearer masonry: columns, a stair flight and glyph stones (existing structure meshes) | a rune stone (codex), 2 chest cells |
| Crystal garden | 14 | crystal clusters, cyan light | crystal cells (Glimmer), Crystal Bloom more likely |
| Creature nest | 10 | biome creature props | 3–6 critters that wander; tap one for a sack |
| Waterfall grotto | 8 | `Waterfall` effect, a pool | fish/eel event, wet-ore cells ×2 |
| Moth roost | 10 | `LumenMoths` flock | a Moth Swarm triggers on breakthrough |
| Sealed geode | 8 | a crystal shell | a Geode (Strike mini-game) |

**Breakthrough** (the shaft opens into a cavern): 0.25 s slow-mo, reveal dolly, "BREAKTHROUGH"
lintel banner, a shower of loot from the opening edge, and a 30 % chance to start a Treasure Room
event (6.3).

### 5.5 The biome ladder

| # | Depth | Name | Look (atmosphere preset) | Ores A / B / C (×3/×8/×25) | Creature | Signature event | Guardian | Mystery beat |
|---|---|---|---|---|---|---|---|---|
| 1 | 0–100 m | **The Roots** | warm umber, timber, roots (`camp` → `tunnel`) | Copper / Tin / Amber | Lumen moths, root grubs | Moth Swarm | **The Root Knot** | Halden logs 1–3: "we were not the first" |
| 2 | 100–300 m | **Crystal Veins** | cyan seams, geodes (`hollow`, cyan) | Quartz / Glimmer / Amethyst | Gloomcrawler, crystal mites | Crystal Bloom, Geode | **The Prism Warden** | a hand inside a crystal; the Lantern Shrine at 200 m |
| 3 | 300–700 m | **Forgotten Works** | brass, rails, pumps, steam | Iron / Coal / Gold | Stoneback, rail rats | Stoneback Charge, Halden Supply | **The Crusher** | foreman's log: "the singing" |
| 4 | 0.7–1.5 km | **Buried Sea** | drowned city, bioluminescence | Pearl / Cobalt / Sea-glass | Lantern eels, jellies | Eel Run, first Rift | **The Drowned Bell** | mural: a procession into the water |
| 5 | 1.5–3.1 km | **Hollow Core** | impossible architecture, archive halls, the Loom | Lumen / Starsteel / Archive glass | Archivists | Rune Sequence | **The Loom Keeper** | the crystals *are* the Lantern-bearers |
| 6 | 3.1–6.3 km | **The Abyss** | violet, floating rocks (`rift`) | Void opal / Abyss pearl / Gate-stone | Listeners | Gravity Flip | **The Gate** | the gate was opened from below |
| 7 | 6.3–12.7 km | **Ember Mantle** | magma, obsidian, heat haze | Obsidian / Fire opal / Sunstone | Salamanders | Lava Surge | **The Forge-Heart** | the call is heat |
| 8 | 12.7–25.5 km | **Starlit Geode** | starfields inside rock | Stardust / Nebula glass / Comet iron | Star moths | Meteor Shower | **The Astral Geode** | a sky beneath the earth |
| 9 | 25.5–51.1 km | **Bone Choir** | titanic fossils that sing | Ivory / Choir crystal / Marrow gold | Bone wyrms | Choir (tone sequence) | **The Singing Skull** | the singing, at last heard |
| 10 | 51–102 km | **Clockwork Heart** | brass gears, a world-machine | Brass / Gear-gold / Mainspring | Automata | Gear Lock (timing) | **The Escapement** | someone built the deep |
| 11 | 102–205 km | **Mirror Sea** | glass, inverted reflections | Mirror silver / Twin opal / Reflectite | Doubles | Mirror (one tap breaks both sides) | **The Reflection** (your own tool) | you are the next Lantern-bearer |
| 12 | 205–410 km | **The Lantern Throne** | gold-white light | Lantern gold / Ember heart / Dawn glass | Wardens of light | Lantern Lighting | **The First Lantern** | chapter end; the deep has no bottom |
| 13+ | 410 km → ∞ | **Echo strata** | palettes 1–12 re-tinted (hue +37° per cycle) plus mutators | biome ores as "Echo" variants | variants | the base biome's event plus a mutator event | Echo guardians (re-tinted, + mutator) | the Echo cards (section 6.13) |

Every biome is a new atmosphere preset (fog, low pool, ambient, open fill, exposure), blended over
an 8 m transition band. Each also gets 4–6 painted material layers (cut face, top face, ore A/B/C,
crystal or accent). Only the current and next biome's layers are resident (section 10).

### 5.6 Freefall (the power-fantasy mode for re-descents)

- **Starts** when the dig rate stays above 12 rows/s for 1 s, or right after a Rekindle.
- **Ends** when the rate drops below 8 rows/s, at a guardian not yet beaten, at the frontier, or
  at a cavern the player has never seen.
- **Gameplay**: aggregate math only (`rows += dps·dt / rowHP`); no voxel edits. Gold and specials
  are rolled per row in closed form.
- **Visual**: a full-screen *strata tunnel* pass scrolls the biome's cut-face palette bands, with
  speed lines, wind particles and the explorer riding the tool. The depth odometer spins and biome
  bands flash past with their names.
- **Interaction**: passing treasures (chests, specimens, crystals) fly up the screen as glowing
  icons, and tapping one collects it (a Catch mini-game). Untapped ones are auto-collected at
  50 % (Freefall Mastery raises this).
- **Exit**: `genBand` at the landing depth, 48 chunks meshed in workers (about 40 ms) hidden
  behind a 0.3 s "landing" dust burst and a camera thump.

---

## 6. Discovery, collections, events, mystery (the deepest section)

### 6.1 The Director (`gameplay/idle/Director.ts`, pure, seeded)

The Director is the anti-boredom engine. It schedules **beats** in four classes and logs every
one (tested in section 11).

| Class | Target cadence | Examples | How it is guaranteed |
|---|---|---|---|
| Micro | every 3–8 s | a special cell breaks, a crit, a combo tier | generator density post-pass (5.3); combo tiers at 25/50/100 |
| Minor | every 30–55 s (min 21 s with Lantern) | the 16 events (6.3) | the event timer |
| Medium | every 2–4 min | contract done, chest found or opened, cavern, stratum marker, new upgrade tier | contract tuning (6.6), cavern spacing (5.3) |
| Major | every 8–15 min early, 15–40 min later | biome reveal, guardian, Rekindle, new building, new codex set | pacing calibration (4.7) |

**Minor event scheduling**
- Next event at `t + U(30, 55) s × (1 − 0.02 × LanternOil − 0.03 × LanternTower)`, floor 21 s.
- Only one event at a time, except the passive ones (Gold Rush) and one tappable at once.
- **Pauses**: guardian fights, reveal dollies, the Rekindle cinematic, the camp screen. While a
  bottom sheet is open an event can still spawn in the visible strip; tappable events wait up to
  10 s for the sheet to close.
- **Idle-friendly**: if the player has not tapped for 20 s, only events that wait are dealt
  (Supply Crate, Treasure Room, Rift). Catch events are held back.
- **Deck rules**: weights per biome (6.3). The same type never comes twice in a row. Every
  unlocked type appears at least once in any 10 consecutive events (rotation pity), and a type not
  seen for 12 events gets weight ×3.
- **First-time card**: the first time a type spawns, a 1-line plate appears above the objective,
  e.g. "NEW · Gold Rush — ore everywhere for 12 s!" (2.5 s, no pause).
- **Boredom breaker**: if no special cell has broken for 25 s while the player is tapping, the
  next 2 rows get a guaranteed special. If no beat has happened for 60 s, the deck is dealt now.

**Hour-1 novelty schedule (scripted unlocks, cumulative active minutes)**

| min | New thing | min | New thing |
|---|---|---|---|
| 0:00 | tap, crack, loot to the counter | 9:00 | Rekindle unlocked (Lantern Shrine), **Camp opens** (Lift) |
| 0:10 | buy the Pick upgrade | 11:00 | Gloomcrawler Raid |
| 0:30 | hire a Shoveler (crew) | 13:00 | Tremor |
| 0:50 | Lucky Spark (scripted) | 15:00 | Daily contracts and the streak calendar |
| 1:10 | combo ring | 17:00 | Forge: first charge (Blast) |
| 1:30 | contracts (Survey Board) | 20:00 | **first Rekindle → Freefall** |
| 2:00 | Gold Rush (scripted) | 23:00 | Altar: first talent slot |
| 2:30 | Guardian 1: the Root Knot | 26:00 | Treasure Room |
| 2:45 | **B2 reveal** (Crystal Veins) | 30:00 | **B3 reveal**, Stoneback Charge |
| 3:00 | first chest opening (guardian chest) | 35:00 | Mimic Chest |
| 3:30 | Moth Swarm | 40:00 | Forge combos (2nd base charge) |
| 4:30 | first specimen and the Codex | 45:00 | Guardian 2: the Prism Warden |
| 5:00 | Rockfall | 50:00 | Seal stone (Strike) |
| 6:00 | Crystal Bloom | 55:00 | Halden Ghost (mystery) |
| 7:00 | Supply Crate (boon pick) | 60:00 | B4 reveal, Rift Dive |
| 8:00 | Geode (Strike mini-game) | | |

### 6.2 Special cells (per 100 shaft cells, about 14 rows; walls add 1 per 6 rows per side)

| Cell | B1 rate | HP × | Reward | Notes |
|---|---|---|---|---|
| Ore A | 12 | 1.5 | gold ×3 | glints on the cut face |
| Ore B | 4 | 2 | gold ×8 | |
| Ore C | 1 | 3 | gold ×25 | sparkle and a soft chime when it enters the view |
| Crystal | 0.8 | 2 | gold ×5 + 1 Glimmer | emits light (within the budget) |
| Chest cell | 0.35 | 4 | a chest by depth (6.5) | about 1 per 40 rows; the lid glows |
| Fossil | 0.25 | 3 | specimen roll (6.7) | silhouette visible in the rock |
| Supply barrel | 0.6 | 1 | 20 s of income | Halden barrel prop embedded |
| Blast barrel | 0.4 | 1 tap | 3 × 3 explosion of 20× tap damage; chains with other barrels | the best feeling in the game: chains of 3–6 |
| Lantern-stone | 0.3 | 2 | lights a 6 m radius and gives "Lantern" (gold ×2 for 10 s) | warm emitter |
| Seal stone | 0.2 | 10 | Strike mini-game: ×40 / ×15 / ×5 gold | rune band, 1 per ~70 rows |
| Rune stone (walls only) | 1 per 120 rows | n/a | codex rune plus a lore card | the cyan script material |

Deeper biomes multiply the rates by `1 + 0.05·b` (cap ×2) and swap in their own ores. Mutators
can change them.

### 6.3 Events (16; each is one tap verb and at most 20 s)

IPS is income per second: the larger of a 30-s average of gold/s and the crew's gold rate. All
rewards are expressed in IPS so they scale from minute 1 to the 10^300 era.

| # | Event | Unlock | Duration | What the player does | Reward | If ignored |
|---|---|---|---|---|---|---|
| E1 | **Lucky Spark** | 0:50 | 7 s | tap a golden spark floating in the shaft | 60 % 90 s of IPS · 20 % Frenzy (tap ×5, 15 s) · 12 % 5 Glimmer · 8 % Overdrive (crew ×10, 20 s) | fades |
| E2 | **Gold Rush** | 2:00 | 12 s | keep digging: ore chance ×4 in the next 12 rows, all gold ×2 | ≈ 24 s of IPS extra | passive |
| E3 | **Moth Swarm** | 3:30 | 8 s | tap 6–10 moths on curved paths (44 px radius) | 8 s of IPS each; all caught = ×3 bonus and a Moth stamp (codex) | moths leave |
| E4 | **Rockfall** | 5:00 | 1.5 s warning + 6 s | dust trickles, then 3–5 boulders fall; tap each 2–6 times to shatter it in mid-air | each = 4 cells' loot and +1 combo per hit | they land as boulder cells (3× HP, 3× loot) — never a loss |
| E5 | **Supply Crate** | 7:00 | waits 20 s | tap the crate on its rope, then pick 1 of 3 boon cards | a boon for 60 s (table 6.4) | it is winched away |
| E6 | **Crystal Bloom** | B2 | 5 s | Frenzy: tap the cluster as fast as possible | 2 s of IPS per tap, 1 Glimmer per 10 taps | shrinks back |
| E7 | **Gloomcrawler Raid** | B2 / 11:00 | 8 s | a crawler crosses the shaft carrying a glowing sack; tap it 8 times | the sack bursts for 40 s of IPS + a creature stamp | it slips into a crack (nothing lost) |
| E8 | **Tremor** | 13:00 | 1 s shake + 10 s | 3 veins light up in the walls; tap each | each vein = 10 cells' ore loot | the veins dim |
| E9 | **Geode** | B2 / 8:00 | when exposed | Strike mini-game (3 needles) | perfect = rare specimen + 10 Glimmer; good = uncommon; miss = common | the geode waits in the rock |
| E10 | **Mimic Chest** | B3 / 35:00 | 6 s | the chest sprouts legs and hops between 3 spots every 0.8 s; tap it 5 times | 3 chests of the next tier | it burrows (a wooden chest left behind) |
| E11 | **Stoneback Charge** | B3 | 6 s | a stone beast rams in from a side tunnel and breaks 3 rows; tap its 3 glowing back plates | a relic shard (10 = a Golden chest) + the rows | the rows still break (free progress) |
| E12 | **Treasure Room** | B3 / 26:00 | 15 s | after a breakthrough, every ore cell in the cavern walls glows ×5 | ≈ 60 s of IPS | passive |
| E13 | **Rift** | B4 | waits 20 s | tap the violet tear in a wall to enter a Rift Dive (6.10) | Rift chest | it closes |
| E14 | **Eel Run** (B4) / **Meteor Shower** (B8) | biome | 6 s | fast Catch: 5–8 targets, each on screen 0.9 s | 10 s of IPS each, a specimen chance | they pass |
| E15 | **Halden Ghost** | B1–B3 story | waits 15 s | tap the ghost miner; it points at a wall 10 rows down that now glows | a Halden log + a hidden cache (Iron chest) | it fades |
| E16 | **Biome signature** (Rune Sequence, Gravity Flip, Lava Surge, Choir, Gear Lock, Mirror, Lantern Lighting) | per biome | 6–10 s | a Sequence, Catch or Strike widget themed to the biome | 60 s of IPS + biome specimen chance | n/a |

**Event weights by biome** (relative; a biome lists the extra weight for its signatures):

| Event | B1 | B2 | B3 | B4 | B5 | B6+ |
|---|---|---|---|---|---|---|
| Lucky Spark | 20 | 16 | 14 | 12 | 12 | 12 |
| Gold Rush | 14 | 12 | 12 | 10 | 10 | 10 |
| Moth Swarm | 18 | 10 | 6 | 6 | 6 | 6 |
| Rockfall | 14 | 12 | 14 | 10 | 10 | 10 |
| Supply Crate | 12 | 10 | 14 | 10 | 10 | 10 |
| Crystal Bloom | n/a | 16 | 6 | 6 | 8 | 6 |
| Gloomcrawler | n/a | 12 | 10 | 8 | 8 | 8 |
| Tremor | 8 | 8 | 8 | 8 | 8 | 8 |
| Mimic / Stoneback | n/a | n/a | 12 | 8 | 8 | 8 |
| Rift | n/a | n/a | n/a | 8 | 8 | 10 |
| Biome signature | 14 (moths) | 12 | 12 | 14 | 14 | 14 |

### 6.4 Mini-game widgets (4 reusable widgets, all single-tap, at most 8 s except Rift)

| Widget | Mechanic | Numbers | Used by |
|---|---|---|---|
| **Strike** (timing) | a needle sweeps a brass arc, 0.9 s per pass; tap to stop it | perfect zone 8 % of the arc (×5), good 25 % (×2), else ×1; up to 3 needles | Geode, Seal stone, guardian finisher, Gear Lock |
| **Frenzy** (mash) | 5 s, count taps | tiers at 20 / 35 / 50 taps | Crystal Bloom, guardian rage, Haul ×2 |
| **Catch** (moving targets) | targets cross on curves | 44 px hit radius, 0.9–2 s on screen each | Moths, Eels, Meteors, Rockfall, Mimic, Freefall treasures |
| **Pick** (1 of 3 cards) | cards flip in; tap one | rarity-weighted | Supply Crate boons, Rift boons, chest choices |

**Boons (Pick cards, 60 s; Rift boons last the whole dive)**: Crew ×2 · Crit +25 % · Ores ×3 ·
Combo never decays · Splash +30 % · Blast barrels everywhere (+300 % rate) · Spark rain (a spark
every 8 s) · Chest key (−50 % on the slowest chest) · Moth companion (catches 1 moth/s) ·
Golden touch (every 10th tap is a ×20 crit).

### 6.5 Chests (Clash-style, played with one thumb)

4 slots (the Keyring building raises this to 8). Chests unlock in parallel up to the **keys**
count (1 key at the start; the Keyring raises it to 3); the rest queue in their slots.
**Tap to rattle**: each tap on an unlocking chest takes time off, up to 50 % of its timer. Opening
now costs 1 Glimmer per 3 minutes left. A chest found while every slot is full becomes **chest
coins** (gold equal to the chest's gold value), so nothing is lost.

| Chest | Timer | Rattle / tap | Cards | Gold (minutes of IPS) | Glimmer | Specimen odds C/U/R/Relic | Main sources |
|---|---|---|---|---|---|---|---|
| Wooden | 30 s | −0.5 s | 2 | 2 | 0–1 | 85/14/1/0 | chest cells, Mimic leftovers |
| Iron | 3 min | −0.5 s | 3 | 6 | 2–4 | 70/26/4/0 | stratum markers, contract board bonus, Halden Ghost |
| Golden | 15 min | −1 s | 4 | 20 | 6–10 | 50/38/11/1 | guardian repeats, daily 3/5, 10 relic shards |
| Rune | 1 h | −2 s | 5 | 60 | 15–25 | 30/45/22/3 | daily 5/5, Rift gold |
| Abyssal | 4 h | −2 s | 6 | 180 | 40–60 | 0/50/40/10 + 1 guaranteed new | guardian first defeat, streak day 7 |

Opening (2–4 s, every step one tap): the chest slams onto the plate, shakes 3 times (each tap
skips one), the lid bursts, and cards fly out one per tap. Each card flips with a rarity flash
(bone, orange, cyan, violet: the brand's `RARITY` tokens). A new specimen gets a "NEW" stamp and
a 0.6 s turntable. Card kinds: gold, Glimmer, specimen, charge, crew boost (+5 levels of a random
owned tier), key, relic shard.

### 6.6 Contracts (the Survey Board)

- **3 active** (the Survey Board building raises this to 5). Each is generated to take **60–240 s**
  at the player's current measured rates. The generator estimates time from the live rates (cells/s,
  ore/s, events/min) and rejects anything outside that range.
- At least one of the three always points at a mechanic the player has not used in the last 15
  min (this is guidance in disguise).
- **Rewards**: Glimmer 3/5/8 (by difficulty) + gold 60/120/240 s of IPS. Completing all 3 adds an
  **Iron chest** (the "Board bonus").
- **Reroll**: free every 5 min, or 2 Glimmer.

| Template | Example (min 20) | Difficulty |
|---|---|---|
| Break N cells | Break 300 cells | 1 |
| Break N ore of a kind | Break 25 Quartz | 1 |
| Reach depth | Reach 260 m | 2 |
| Catch N | Catch 12 moths | 2 |
| Open N chests | Open 2 chests | 1 |
| Burst a crawler's sack | Burst 1 sack | 2 |
| Land N crits | Land 40 crits | 1 |
| Reach a combo | Reach ×1.8 combo | 2 |
| Buy N upgrades | Buy 10 upgrades | 1 |
| Earn gold | Earn 2.4M gold | 2 |
| Chain barrels | Chain 3 Blast barrels | 3 |
| Strike perfect | Get 1 perfect Strike | 3 |
| Breakthrough | Break into 1 cavern | 2 |
| Find a specimen | Find any specimen | 2 |
| Use a charge | Throw a Blast charge | 1 |
| Defeat a guardian | Defeat the Prism Warden | 3 |
| Collect Glimmer | Collect 6 Glimmer | 2 |
| Tap a spark | Tap 2 Lucky Sparks | 2 |
| Freefall treasures | Catch 8 treasures in Freefall | 2 |
| Rift score | Score Silver in a Rift | 3 |

**Daily contracts**: 5 per day, reset at 04:00 local (less exploitable than midnight), each about
5–10 min (for example "Reach 1,000 m", "Catch 30 moths", "Open 5 chests", "Win 1 Strike perfect",
"Rekindle once"). Rewards: Golden chest at 3/5 and Rune chest at 5/5. The **7-day streak calendar**
gives 10 / 15 Glimmer / Iron / 25 Glimmer / Golden / 40 Glimmer / Abyssal + an exclusive pick
skin. A missed day *pauses* the streak (one free pause per 7 days). Nothing resets to zero on the
first miss.

### 6.7 The Codex: "The Specimen Cabinet"

| Category | Per biome | B1–B12 total | Found by |
|---|---|---|---|
| Minerals | 5 (ores A/B/C + 2 rare: a crystal and a "heart") | 60 | ore cells (common), Geodes, chests |
| Fossils | 3 | 36 | fossil cells, Tremor veins |
| Creatures | 2–3 | 30 | catching or bursting a creature event (stamp) |
| Relics | 3 (1 guardian + 2 hidden) | 36 | guardian first defeat; hidden ones in Ruin halls and through Halden Ghost caches |
| Halden logs | 2 | 24 | Halden camps, Ghost events |
| Lantern runes | (8 total) | 8 | rune stones in the walls |
| **Total** | n/a | **194** | Echo strata add a shiny variant per mineral (+12 per cycle) |

- **Drop rates per eligible special break**: common 1/40, uncommon 1/250, rare 1/1,500, plus the
  guaranteed sources (Geode perfect, Abyssal chest). **Pity**: if a biome still has missing
  entries and no new specimen has dropped in 6 min of active play, the Director plants a Geode in
  the next 6 rows.
- **Stars (duplicates)**: 1★ found; 2★ at 3 duplicates; 3★ at 10; 4★ (shiny frame) at 30. Each
  entry gives **+1 % gold per star in its biome**. Duplicates are never useless.
- **Sets** (complete every entry of a category within a biome): Vein set ×1.25 gold (global,
  permanent); Fossil set unlocks a Forge recipe (6.8); Creature set +10 % event rewards; Relic set
  ×1.5 damage.
- **Presentation**: a grid of octagon plates per biome. Undiscovered entries are dark silhouettes
  with a hint ("Found in Crystal Veins · Geodes"). Tapping one shows a 3D turntable of the
  procedural specimen (`voxModel` + the specimen icons in `sprites.ts`), its name, a 1-line
  flavour, its star bar and its bonus.
- **Target**: the B1 Vein set within about 25 min of active play, all of B1 within about 90 min
  (simulated with pity).

### 6.8 Forge: crafting by combination (discovery without failure)

Unlocked at 17:00 (or B2 entry). There are **6 base charges**, each unlocked by a codex set or a
milestone, and **21 combinations** (every unordered pair, doubles included). **Every pair makes
something**: an unknown pair shows "???" with its cost, and crafting it once reveals it in the
Combo Book. There is no wrong answer, only discovery.

| Base charge | Unlock | Effect when thrown at the dig front |
|---|---|---|
| Blast | Forge open | 5 × 5 explosion, 40× tap damage |
| Flare | B1 Fossil set | reveals specials in the next 50 m: they glow and are worth ×2 |
| Drill Bit | B2 Fossil set | auto-digs 15 m in 3 s |
| Magnet | 1st Rekindle | pulls every wall treasure in view to the counter |
| Hourglass | B3 Fossil set | +60 s of IPS now and +60 s of chest timers |
| Lure | B3 entry | starts an event now (deck rules still apply) |

| Combination | Result |
|---|---|
| Blast + Blast | **Mega Blast**: 9 × 9, 60× |
| Blast + Drill | **Bunker Buster**: drills 40 m, then a 9 × 9 blast |
| Blast + Flare | **Sunburst**: blasts every revealed special on screen |
| Blast + Magnet | **Shrapnel Pull**: 5 × 5 blast and all loot doubled |
| Blast + Hourglass | **Time Bomb**: a blast every 2 s for 10 s |
| Blast + Lure | **Thunder Call**: Rockfall with golden boulders (×10) |
| Flare + Flare | **Beacon**: specials ×3 for the next 100 m |
| Flare + Drill | **Prospector's Bore**: drills 25 m, collecting every special |
| Flare + Magnet | **Treasure Sweep**: Flare reveal + Magnet pull |
| Flare + Hourglass | **Clairvoyance**: the next 3 events are previewed and chosen |
| Flare + Lure | **Moth Lantern**: a Moth Swarm ×3 |
| Drill + Drill | **Twin Auger**: 40 m in 4 s |
| Drill + Magnet | **Vacuum Bore**: 20 m, loot ×3 |
| Drill + Hourglass | **Time Bore**: +5 min of IPS and 30 m |
| Drill + Lure | **Rift Drill**: opens a Rift now |
| Magnet + Magnet | **Lodestone**: every chest cell within 30 rows flies to the slots |
| Magnet + Hourglass | **Gold Tide**: Gold Rush for 30 s |
| Magnet + Lure | **Crawler Bait**: 3 crawler raids in a row |
| Hourglass + Hourglass | **Stopped Clock**: all chest timers −30 min |
| Hourglass + Lure | **Event Storm**: 3 events back to back |
| Lure + Lure | **Guardian Call**: summons a mini-guardian for a Golden chest |

Cost: a base charge costs 120 s of IPS in gold and takes 10 s; a combination costs 300 s of IPS
and takes 30 s. Capacity: 3 per type (Forge level +1). Use: the **Charge button** (bottom right,
56 px) holds the selected charge. Tap it and the charge lands on the dig front. Long-press, or
the small arrow, cycles the type.

### 6.9 The Camp: a surface base that visibly grows

A separate small diorama (a 48 × 48 × 32 voxel scene loaded once): the old Halden camp at the
shaft mouth, built from existing props (campfire, workbench, forge, survey table, relic shelf,
lantern posts, hoist winch, chests). Opened from the **Camp** tab, the camera flies up the shaft
in 0.6 s. Every building has 10 levels, with a visible change at levels 1, 3, 6 and 10 (new
model, lights, an animated worker). Costs are Glimmer only (gold resets, Glimmer does not):
**level n costs 10 × 1.6^(n−1)** (10, 16, 26, 41, 66, 105, 168, 268, 429, 687; 1,816 per building).

| Building | Opens | Effect per level |
|---|---|---|
| **Lift** (Halden Hoist) | 9:00 | offline cap +2 h (2 → 24 h) |
| **Bunkhouse** | 9:00 | crew DPS +10 % |
| **Shrine of Embers / Altar** | first Rekindle | Embers from Rekindle +5 %; talent levels (4.5) |
| **Forge** | 17:00 | charge capacity +1; combination craft time −10 % |
| **Survey Board** | 1:30 (shown in-shaft first) | contract slots 3 → 5 (levels 4 and 8), rewards +10 % |
| **Assay Office** | first specimen | specimen chance +8 %; codex hints show the exact source |
| **Lantern Tower** | B2 | event interval −3 %, event rewards +5 % |
| **Keyring Treasury** | first chest | slots 4 → 8 (levels 2, 4, 6, 8); keys 1 → 3 (levels 5, 10) |
| **Glimmer Still** | B3 | +2 Glimmer per hour, offline included |
| **Observatory** | B6 | previews the next biome's silhouette, unlocks Ascension info |

Glimmer income at the reference: about 200/h active (crystal cells 56, contracts 80, chests 45,
events 15) plus 50/day from dailies. Maxing all 10 buildings (18,160) takes about 85 h of play,
so the long tail is fed.

### 6.10 Rift Dives (the roguelike side mode)

Unlocked in B4. A rift opens as event E13 (every 6–10 min on average there) or with a Rift Key
(from chests or the Forge's Rift Drill).
- **45 seconds** in a palette-shifted shaft (a random remix of biomes seen so far, separate seed).
  Main progress pauses; the crew keeps digging the main shaft.
- **Every 10 m: Pick 1 of 3 boons** (stacking for the dive): every 5th tap crits · ore spawns a
  moth · combo cap +50 · chests ×2 · splash +40 % · barrels chain twice as far · …
- Score = depth in 45 s, relative to the main frontier's row HP. Bronze/Silver/Gold/Crown → Rift
  chest of tier Wooden/Iron/Golden/Rune, plus **Rift variants** of specimens (codex) and pick skins
  at Crown.
- One free dive per rift. It uses the same `genBand` with a rift seed and its own small window, so
  the engine cost equals normal play.

### 6.11 Guardians (one per biome end: the major beat)

- The shaft opens into the guardian's arena. The camera centres on it (2.4 s) and the guardian
  roars (music switches to the boss layer).
- HP = 20 × rowHP at the biome's end × `guardianScale_b` (fitted by the sim so A24 holds). **Timer 30 s.** Taps and crew both apply. A **weak point**
  glows every 5 s for 1 s (×5 damage while lit). At 25 % HP comes the **Finisher**: a Strike
  widget, perfect = ×10 hit.
- **Win**: the relic (×1.5 permanent, first time), an Abyssal chest on the first defeat (Golden on
  repeats), then the next biome's **reveal**.
- **Lose**: the guardian yawns and stays. Nothing is lost. Two big buttons: **Retry** (instant) and
  **Upgrade** (opens the sheet with the best affordable row highlighted). Offline progress stops
  here.
- Guardian HP is tuned so the reference player wins on the first try about 70 % of the time
  (simulated) and within 2 retries 95 % of the time.

| Guardian | Look (voxModel + props) | Weak point pattern |
|---|---|---|
| Root Knot | a tangle of roots with an amber heart | 3 knots light up in turn |
| Prism Warden | a crystal golem | facets glint clockwise |
| Crusher | a Halden ore crusher with a boiler | the pressure valve every 5 s |
| Drowned Bell | a vast bronze bell in a water pocket | the clapper on each toll |
| Loom Keeper | archive spider with threads of light | thread knots |
| The Gate | ring gate with violet light | rune keys in sequence |
| Forge-Heart | a magma heart in an obsidian cage | cooling cracks |
| Astral Geode | a geode with a sky inside | stars that brighten |
| Singing Skull | a titanic fossil skull | the jaw opens on the high note |
| Escapement | a world-clock mechanism | the tooth at 12 o'clock |
| The Reflection | a mirror image of your own tool | it copies your last tap column |
| First Lantern | a giant lantern-bearer of light | the flame core |

### 6.12 Endless content: Echo strata, mutators and depth cards

**Echo strata** (B13+): the cycle repeats biomes 1–12. Each cycle shifts hue by +37° and adds one
**mutator**, and mutators stack (cycle 3 has 3):
Hollow (caverns ×2 size) · Rich (ores ×2, HP ×1.5) · Swarming (event interval −30 %) · Molten
(lava cells: tap to cool, ×3) · Frozen (ice cells shatter in chains) · Inverted (gravity flip:
cells float as targets) · Glass (everything glows; crits ×2) · Overgrown (roots regrow; free
cells) · Starry (meteor events) · Haunted (Halden Ghost frequent) · Clockwork (Strike everywhere) ·
Tidal (water rises: catch fish) · Bone (fossils ×3) · Prismatic (crystal cells ×4) · Echoing
(every 10th break repeats) · Golden (chest cells ×2, HP ×2). Each Echo biome has a re-tinted
guardian with its mutator and gives a new relic (×1.5).

**Depth cards** (a one-time full-width lintel plate with a real-world comparison):

| Depth | Card | Biome |
|---|---|---|
| 828 m | Deeper than the Burj Khalifa is tall | B4 |
| 3.9 km | Deepest mine on Earth (Mponeng) | B6 |
| 8,849 m | Deeper than Everest is tall | B7 |
| 10,935 m | Deeper than the Mariana Trench | B7 |
| 12,262 m | Deeper than the Kola Superdeep Borehole | B7 |
| 35 km | Through the Earth's crust | B9 |
| 2,890 km | Through the mantle | B15 |
| 6,371 km | The centre of the Earth ("now digging *up*") | B16 |
| 12,742 km | Through the planet | B17 |
| 384,400 km | As far as the Moon | B22 |
| 149.6 million km | As far as the Sun | B31 |
| 9.46 × 10^15 m | One light-year | B47 |
| 4.4 × 10^26 m | The edge of the observable universe | B82 |
| beyond | "The deep has no bottom." (every ×1,000 after this) | ∞ |

### 6.13 The mystery thread (from the existing lore, told in 1–3 line cards)

| Chapter | Biomes | Delivery | Question at its end |
|---|---|---|---|
| I. The Halden Concern | 1–3 | 6 Halden logs (camps, Ghost events), the Lantern Shrine at 200 m, the Crusher's plate | "What made the Halden stop digging?" |
| II. The Procession | 4–6 | murals in Ruin halls, 8 rune stones decoded (each rune lights its codex page), guardian relic texts | "Where were the Lantern-bearers going?" |
| III. What Called Them | 7–12 | Bone Choir song cards, the Escapement plate, the Reflection (you), the First Lantern | "Who answers below the Throne?" |
| Echo | 13+ | one Echo card per cycle: the Rekindle loop is the Lantern-bearers' own ritual | (endless) |

In-world framing of the loops: **Rekindle** is relighting the lantern, which makes "the deep
breathe" (the existing W2 idea), so the rock regrows. **Embers** are the Lantern-bearers'
memories. **Ascension** is becoming a Lantern-bearer. A **mystery meter** ("The Deep Calls:
42 %") on the Codex tab fills with the chapter's cards, and the next biome is always shown as a
silhouette with its depth.

### 6.14 Variety guarantees (all logged and tested)

1. No more than 60 s without a minor beat while tapping. Median 35–45 s.
2. No event type twice in a row; every unlocked type at least once in any 10 consecutive events.
3. No 4-row window without a special cell (shaft plus exposed walls).
4. One cavern every 25–40 rows in B1–B3.
5. A never-seen mechanic at least every 4 min for the first 40 min.
6. Contracts take 60–240 s at current rates (95 % of those generated).
7. A new specimen within 6 min while a biome set is incomplete (pity).
8. A Guardian at least every L_b rows, a stratum marker every L_b/4.

---

## 7. Guidance

### 7.1 Tutorial script: the first 3 minutes (no menu first; the game opens on the shaft)

The menu stays reachable from ≡ at any time. A first launch goes straight to play: the wordmark
fades over the shaft mouth while the first cell glows. Each step shows **one** pulsing hand and
**one** line of text (i18n keys `idle.tut.*`). Steps advance on the action, never on a timer, and
the game never pauses.

| # | ~t | Text (en) | Highlight | Advances when |
|---|---|---|---|---|
| 1 | 0:00 | "Tap the rock." | hand over a soft soil cell (HP 1) | the cell breaks |
| 2 | 0:03 | "Copper! Break it." | a copper cell placed under it (3 taps) | it breaks; gold flies to the counter, which pulses ("Gold") |
| 3 | 0:10 | "Spend gold: upgrade your pick." | the Pick tab badge, then the U1 row's BUY | U1 bought; the sheet closes itself once, the pick sparkles |
| 4 | 0:18 | "Dig down. Reach 10 m." | objective bar 0/10 | depth 10 m |
| 5 | 0:30 | "Hire a Shoveler. Your crew digs — even when you're away." | Crew tab, then the Shoveler BUY | a crew model drops in on its rope and starts digging |
| 6 | 0:50 | "A spark! Tap it." | scripted Lucky Spark (gold outcome) | tapped (or after 7 s it repeats once) |
| 7 | 1:10 | "Tap fast for a combo." | combo ring appears at the thumb | combo ≥ 15 |
| 8 | 1:30 | "Contracts pay Glimmer. Here's one." | contract card slides in: "Break 15 copper" | the card is seen (2 s) |
| 9 | 2:00 | "Gold Rush! Ore everywhere." | scripted Gold Rush | passive |
| 10 | 2:30 | "A Guardian blocks the shaft. Beat it in 30 s!" | arena; the weak point pulses | the guardian falls (first guardian HP is scripted to ~12 s at the expected power) |
| 11 | 2:45 | (no text) Reveal: "CRYSTAL VEINS · 100 m" | reveal dolly, lintel title | 2.4 s |
| 12 | 3:00 | "Tap the chest to open it." | the Abyssal chest from the guardian (first one opens instantly) | all cards collected |

After step 12 the tutorial ends and the hint system (7.3) takes over. Steps from the hour-1
schedule (6.1) introduce later systems with their first-time cards.

### 7.2 The always-visible objective (one line, tappable)

A single plate above the chest row: an icon, a short text and a progress bar. **Tapping it goes
to the place where the objective is done** (opens the right sheet and row, centres the camera on
the guardian, opens the Codex page…). Priority, first match wins:

1. a tutorial step;
2. "Collect your offline haul";
3. a guardian ahead within 30 m: "Guardian ahead — the Prism Warden (−300 m)";
4. Rekindle recommended: "Rekindle for +273 Embers (×6.5)";
5. an affordable upgrade not bought for 30 s: "Buy: Driller ×1";
6. the contract closest to done: "Break 25 Quartz · 19/25";
7. a chest ready: "Open your Iron chest";
8. the next biome: "Reach 300 m — Forgotten Works".

The objective text is never empty in play (A15).

### 7.3 Hints (contextual, rare, dismissed by doing)

- At most 1 hint per 45 s. Each hint shows at most 3 times in the save's lifetime, and doing the
  action retires it.
- Idle nudge (only during the first 30 min): no tap for 8 s, and a hand pulses over the best
  target (a special cell, or a chest ready).
- Examples: "Tap the crawler to burst its sack." · "Chests open faster when you tap them." ·
  "Blast barrels chain — break one next to another." · "Tap the objective to go there." · "Hold
  to keep digging." · "Your crew stops at Guardians while you're away."
- **Glow convention**: anything tappable has a 2 px rim pulsing at 1 Hz (amber for
  kit/economy, cyan for discoveries, violet for the unknown). Nothing else pulses.

### 7.4 The next-goal bar

A 240 × 8 px segmented bar under the depth readout: the current position against the next
**milestone**, with icons on it for the stratum marker (chest icon), the guardian (skull),
breakthroughs announced by a Flare, and the biome end. It reads "−287 m · 13 m to the stratum
chest". A second, thin violet tick shows the best-ever depth during re-descents (Freefall aims
for it).

---

## 8. Portrait UI layout (390 × 844 CSS px; safe areas from `--safe-*`)

```
┌──────────────────────────────────────┐  safe top (status bar)
│ [◉ 12.4M  +1.2K/s]   [◆ 86]   [≡]    │  y +8..+52   gold plate 172×44 · glimmer chip 88×36 · menu 44×44
│          −287 m · CRYSTAL VEINS      │  y +56..+80  depth Lintel 22 px + biome 12 px
│        [▮▮▮▮▮▮▮▯▯▯ 13 m ▸ chest]     │  y +82..+92  next-goal bar 240×8
│ ┌ GOLD RUSH ◔ 9s ┐                   │  event banner (only while an event runs), 36 px
│                                      │
│          (the shaft: tap anywhere)   │  play area ≈ 490 px tall (≈ 13.8 m)
│     dig front at 58 % of this area   │
│                                      │
│ [▶ Break 25 Quartz ········ 19/25 ]  │  objective plate 366×44
│ [x1.6]  [▣][▣][▣][▣]        [✸ ×3]   │  quick row 60 px: combo 64×52 · 4 chest slots 52×52 · charge 56×56
│ [Pick][Crew][Board][Codex][Camp]     │  tab bar 5 × 78×64 (badges: amber count dots)
└──────────────────────────────────────┘  safe bottom
```

- **Thumb rule**: every interactive element except ≡ sits in the bottom 45 % or is the shaft
  itself. Every target is at least 48 × 48 px (the existing ui-check floor).
- **Sheets**: a tab opens a bottom sheet over 52 % of the screen (about 440 px), above the tab
  bar. The game keeps running, the visible strip of shaft stays tappable, and the camera lifts the
  dig front into that strip. The header (44 px) has a segmented ×1 / ×10 / MAX control. Rows are
  72 px: icon, name + level, the effect "1.2M → 1.5M DPS", and a BUY plate with the cost (amber
  when affordable, bone-500 when not). A "best buy" badge marks the row with the most DPS per
  gold. Close by tapping the tab again or swiping down (swipe is optional, never required).
- **Tabs**: Pick (U1, U3–U8 and charges), Crew (tiers), Board (contracts, daily, streak), Codex
  (cabinet, combo book, mystery meter), Camp (opens the camp diorama full screen with a big "Back
  to the shaft" plate).
- **Full-screen moments** are reserved for the offline report, the chest opening (over the dimmed
  world), the Rekindle cinematic and reveal titles (non-blocking, 2.4 s).
- **Brand**: the existing "Lamplight on the Lintel" octagon brass plates, the Lintel display face
  for numbers (tabular digits), and slate panels at 0.94 alpha. Rarity colours come from
  `tokens.ts`.
- **Other viewports**: at 360 × 740 the tab bar is 72 px wide per tab and the chest slots 48 px;
  at 412 × 915 the play area gains 70 px. Landscape is not supported in play (portrait lock).

---

## 9. Juice and feel

| Moment | Visual | Audio | Haptic | Time / budget |
|---|---|---|---|---|
| Tap hit | crack stage, 8 sparks + 6 dust, number pop (white) | material hit; pitch climbs with combo | 6 ms | ≤ 1 frame to show |
| Break | 12–24 debris in material colours, 1–3 loot icons arc to the counter | material break + coin tick on arrival | 12 ms | arc 0.45 s, easeInBack |
| Crit | gold number 1.4×, "LUCKY!", kick 0.06 m | crit ring | [10, 30, 20] | hitstop 60 ms |
| Combo tiers 25 / 50 / 100 | the ring turns amber / cyan / violet with a ring burst | rising chord | 8 ms | n/a |
| Blast barrel chain | 3 × 3 flash per barrel, chained 80 ms apart, shake 0.08 m | thump per barrel, pitch rising | 20 ms each (60 ms gap) | at most 6 in a chain |
| Row clear | drop 1 m, dust from the walls | soft thunk | none | camera spring 0.18 s |
| Breakthrough | slow-mo 0.25 s, reveal dolly, loot shower | air whoosh + reverb opens | [20, 40, 30] | 2.4 s |
| Upgrade bought | the row flashes, a +level number on the BUY plate | level chime; milestone ×2 fanfare | 10 ms | n/a |
| Tool evolution | full-width plate, the new tool's 360° turntable, gold sparks | fanfare | [30, 60, 40] | 2 s, skippable |
| Chest open | slam, shake ×3, lid burst, card flips | rarity stings | [20, 40, 40] | per tap |
| Guardian hit | weak-point flash, damage numbers in red-gold | impact + roar | 30 ms | hitstop 30–120 ms |
| Biome reveal | 0.25 s slow-mo, dolly, lintel title, atmosphere blend over 2 s | biome stinger, music switches theme | [30, 80, 60] | 2.4 s |
| Rekindle | lantern flare white-out, refill strata, embers rain | whoosh + choir | [40, 100, 60] | 4 s, skippable after 1 s |
| Freefall | strata tunnel, speed lines, wind particles | wind layer + drums | none | n/a |

**Number hygiene**: tap numbers within 0.25 s merge into one ("+1.2K ×6"). At most 12 numbers
are alive; their lifetime is 0.7 s with a 40 px rise. They are drawn in WebGL as instanced quads
from a digit atlas rasterized at boot with the Lintel face, so the DOM does not churn. Counters
roll like an odometer at up to 10 Hz of DOM writes.

**Music**: the existing `MusicScheduler` gets biome moods and **intensity layers**: base pad
always; plucks at combo ≥ 25; percussion during events and Freefall; a boss layer during guardians.
Event stingers are quantized to the next beat.

**Visual upgrade ("HD", the cutaway look)**
- **Cut-face shading**: faces on the cut plane (normal −z at z = 2) get a "section" mode. Strata
  bands read cleanly from the biplanar rock layers, faces are darkened 12 %, and there is a
  1.5 px ink line where materials meet (reusing the `aNb` boundary data the mesher already
  writes) plus a warm rim on the trench edges. The result looks like a geologist's illustrated
  cross-section.
- **Emissive ores**: ore C and crystals get bloom (threshold 1.2 kept). Each ore family has its
  own glint shader term on the cut face.
- **Depth layering**: caverns behind the cut plane fade into the biome haze (the existing
  `atmosphere()` integration), giving 3D parallax as the camera descends.
- **Dig light**: the existing lantern system, re-centred on the dig front (the "lantern" sits on
  the explorer), keeps the warm pool on the working face. Placed light (flood fill) carries the
  biome colour.
- **Render scale**: Balanced uses pixel ratio 1.75 × 0.9 as today. The smaller world (0.2 MB
  voxels, 0.8 MB light) frees budget for High at 2.0 DPR on capable phones (the governor decides).

Reduced motion turns off shake, slow-mo and camera dollies (cuts instead), and halves particles.

---

## 10. Technical plan (reusing the engine)

### 10.1 Add

| Path | What | Pure / tested |
|---|---|---|
| `src/core/BigNum.ts` | mantissa/exponent numbers, pooled, format (suffixes, scientific) | pure, unit |
| `src/config/idle/{upgrades,crew,biomes,ores,specials,events,boons,chests,contracts,specimens,recipes,camp,altar,guardians,mutators,depthCards}.ts` | every number in this document | data |
| `src/gameplay/idle/economy.ts` | ℓ(d), cellHP, cellGold, DPS, tap damage, buy ×N closed form, offline integral | pure, unit + sim |
| `src/gameplay/idle/Director.ts` | beat scheduler, decks, pity, first-time cards, boredom breaker | pure, unit (10,000-event fuzz) |
| `src/gameplay/idle/events/*.ts` | one file per event: state machine + reward (no rendering) | pure, unit |
| `src/gameplay/idle/{Contracts,Chests,Codex,Forge,Camp,Altar,Prestige,Guardian,Rift,Tutorial,Objective,Hints,Daily}.ts` | the systems above | pure, unit |
| `src/gameplay/idle/IdleState.ts` | one serialisable state, the save block | pure |
| `src/world/gen/band.ts`, `caverns.ts`, `bandWorker.ts` | `genBand(seed, row0, rows)` deterministic, special post-pass, cavern stamps, structure and prop specs | unit (determinism, density) |
| `src/world/ShaftWindow.ts` | the y-ring: recenter, chunk relabel, light shift, band requests | unit + e2e |
| `src/world/light.ts` (+ `openMany`) | batch light fill for multi-cell breaks: one BFS for all opened voxels | property test vs computeAll |
| `src/game/IdleGame.ts` | the play-mode update (it replaces `updatePlaying`): taps → economy → world edits → effects | e2e |
| `src/game/ShaftCamera.ts` | camera in 5.2 | unit (framing) |
| `src/game/TapDig.ts` | tap resolution (2.1), hold-to-dig, overkill carry to cells | unit |
| `src/game/ExplorerPuppet.ts` | slides the explorer to the tapped column, swing and pose; no physics | n/a |
| `src/game/CrewRenderer.ts` | instanced crew models on ledges and ropes | n/a |
| `src/game/effects/{FloatText,LootArc,EventFx,StrataTunnel,GuardianFx}.ts` | numbers, flying loot to screen targets, event entities (boulders reuse Debris, moths reuse `LumenMoths`), the Freefall pass | visual lab |
| `src/ui/idle/{TopBar,NextGoalBar,Objective,QuickRow,TabBar,Sheet,UpgradeRow,ChestSlots,ChestOpen,ContractCard,CodexScreen,ComboBook,CampScreen,OfflineReport,EventBanner,TutorialHand,FirstTimeCard}.ts` + `idle.css` | the UI in section 8, on the brand primitives | ui-check |
| `src/i18n/en/idle.ts` | every string (tutorial, events, codex, cards) | key coverage test |
| `tools/sim-economy.ts` | the reference player; fits `hpScale_b`; prints the pacing table | Vitest wrapper |
| `tools/director-log.ts` | a 10-min scripted session with a beat timeline | Vitest wrapper |

### 10.2 Replace

| Old | New |
|---|---|
| `Game.updatePlaying` flow, `Progression.ts`, `NextStep.ts`, `Objectives.ts` | `IdleGame.ts`, `Objective.ts`, `Tutorial.ts` (keep the frame loop, FrameGuard, pause, the save hooks) |
| `CameraRig.ts`, `MenuCamera.ts` (menu pose) | `ShaftCamera.ts` (the menu shows the shaft mouth) |
| `PlayerController.ts` | `ExplorerPuppet.ts` |
| `TouchControls.ts` (joystick, look, buttons), `TapController.ts` | a single pointer layer in `TapDig.ts` (taps, hold) |
| `Hud.ts` | `ui/idle/*` |
| `ATMOSPHERES` (4 zones) | 12 biome presets + Echo tint, blended by depth |
| `save/types.ts` v2 | **v3** with the idle block; migration v2 → v3 keeps the settings and grants a "Veteran" Golden chest |

### 10.3 Delete (once wave 1 lands)

`world/gen/generateWorld.ts` and the `features/` pass, `world/analysis/{homeField,reachability,economy}.ts`,
`game/{aimAssist,touchCamera,ropeRide,runeDoor,WorldFeatures,Survey,Stations}.ts`,
`gameplay/{Cold,Lantern,Expedition,CacheSpot,Health,Equipment,Inventory,Storage,Crafting,Tree}.ts`,
the old e2e specs (`slice`, `world`, `desktop`), and their unit tests. Keep the *data* worth
reusing first: the Halden log texts and the rune names go into the codex, and the moth flock
moves to the events.

### 10.4 Keep and reuse as is (or nearly)

VoxelWorld, mesher, meshPool and meshWorker, ChunkRenderer, LightField, the terrain material
(adds biome layers and the cut-face mode), StructureRenderer (ruin halls), PropRenderer and models
(crates, barrels, carts, crystal clusters, lanterns, satchel, hoist, forge, survey table, relic
shelf, rune stones), Particles, Debris, Drops (with a screen-target mode), TargetMarker and
`uTarget` cracks, PostFX, AudioSystem + sfx (+ about 20 new sounds), MusicScheduler (+ layers),
Haptics (+ new patterns), brand UI, SaveSystem (two slots), QualityGovernor, crash panel, Android
shell, release tooling.

### 10.5 Build waves

| Wave | Scope | Done when |
|---|---|---|
| W1: core | BigNum, economy, ShaftWindow + genBand (B1–B2), TapDig, crew, offline, top bar + Pick/Crew sheets + objective, tutorial steps 1–8, 3 events (Spark, Rush, Moths), save v3 | A1–A4, A8, A10–A15 green |
| W2: variety | Director (full), events E4–E12, chests, contracts + dailies, codex, guardians, B3–B6, camp (6 buildings), Rekindle + Freefall, cavern types, depth cards | A5–A7, A9, A16–A22 green |
| W3: depth | Forge + Combo Book, Rift, Altar, Ascension, B7–B12 + Echo + mutators, biome signatures, full visual pass (cut face, emissive ores, tool evolutions), music layers | all of section 11 green; perf on device |

### 10.6 Risks and mitigations

| Risk | Mitigation | Budget |
|---|---|---|
| Light cost of mass breaks (up to 168 cells = 504 voxels) | `LightField.openMany`: one BFS seeded with every opened voxel; if over budget, defer the rest to the next frame | ≤ 1.5 ms/frame |
| Remesh churn at 10+ cells/s | coalesce edits per frame; workers; Freefall above 12 rows/s | ≤ 2 ms main thread/frame for chunk work |
| Recenter hitch | relabel instead of remesh; band pre-generated and pre-meshed | ≤ 4 ms |
| Freefall exit | `genBand` + meshing hidden behind a 0.3 s dust burst | hitch ≤ 8 ms |
| Economy knife edge | `hpScale_b` calibration + drift test (4.7) | ±25 % of targets |
| Numbers overflow, NaN | BigNum everywhere; a 10 h sim asserts finiteness | 0 NaN |
| DOM churn | counters ≤ 10 Hz, cached strings; numbers in WebGL | no layout per frame |
| Particle overload in chains | budget per preset (120 / 220 / 400) with oldest-first recycling (exists) | n/a |
| Offline exploits (clock change) | clamp to [0, cap]; monotonic delta; never negative | n/a |
| Save size | window delta RLE; IdleState about 6 KB JSON | ≤ 32 KB |
| Scope | the three waves above; each wave ships playable | n/a |
| Texture memory for 12 biomes | only the current + next biome's layers resident; repaint in a worker on entry (~40 ms) | ≤ 2 MB of layer data |
| Draw calls | chunk meshes ≤ 48, props instanced, crew instanced | ≤ 120 draws, ≤ 120k triangles |

---

## 11. Acceptance metrics (checkable by tests or simulation)

| # | Metric | Threshold | How it is checked |
|---|---|---|---|
| A1 | Time to first broken cell from New Game | ≤ 3 s | e2e (touch at 390×844) |
| A2 | First upgrade affordable | ≤ 15 s at 4 taps/s | sim + e2e |
| A3 | Reward-pop gap while tapping 4/s | max ≤ 2 s over a 10 min session | `director-log` |
| A4 | Special cell visible in the window | ≥ 95 % of sampled frames; 0 four-row windows without a special | band test over 10,000 rows per biome |
| A5 | Minor beat gap | max ≤ 60 s, median 35–45 s (tapping) | `director-log` + Director fuzz |
| A6 | Event repetition | never twice in a row; every unlocked type ≥ 1 in any 10 | Director unit test, 10,000 events |
| A7 | Hour-1 novelty | a new mechanic at least every 4 min for 40 min | scripted bot + log |
| A8 | Active ÷ idle income | 2.5–4.0 at min 5, 30, 120 and in runs 1, 3, 6 | sim |
| A9 | Pacing table 4.6 | every row within its tolerance | `sim-economy` Vitest |
| A10 | Prestige shape | run n+1 reaches run n's max in ≤ 35 % of run n's time; Freefall 10–60 s | sim |
| A11 | Offline closed form | within 1 % of a stepped sim (gold, depth) for 8 h; stops at the guardian | unit |
| A12 | Tap latency | crack and number in the same or the next frame after the pointer event; audio scheduled ≤ 20 ms | e2e via `__DD__.idle.lastTapLatency` |
| A13 | Frame budget | p95 ≤ 16.7 ms on Balanced at 10 breaks/s; recenter ≤ 4 ms; `openMany` ≤ 1.5 ms for 504 voxels | perf.mjs, unit |
| A14 | One-thumb UI | every target ≥ 48 px; all but ≡ in the bottom 45 % or the shaft; 390×844, 360×740, 412×915 | ui-check |
| A15 | Objective always visible | non-empty in 100 % of play frames | e2e sampling |
| A16 | Tutorial | a bot tapping only the highlighted target finishes steps 1–12 in ≤ 200 s; no step waits > 25 s | e2e |
| A17 | Contracts | 95 % of generated contracts estimated at 60–240 s | unit with the rate estimator |
| A18 | Codex | 194 entries; each has a reachable source; B1 Vein set expected ≤ 25 min | data test + drop sim |
| A19 | No punishment | no event, failure or timeout subtracts currency or depth | unit over every event |
| A20 | Chests | overflow converts to coins (nothing lost); timers advance offline | unit |
| A21 | Save | IdleState round-trips; v2 → v3 migration keeps settings and grants the chest | unit + e2e reload |
| A22 | Numbers | formatting is correct from 1 to 1e3000 (suffix and scientific); 0 NaN/Infinity in a 10 h sim | unit + sim |
| A23 | Freefall | no voxel edits above 12 rows/s; exit hitch ≤ 8 ms | perf |
| A24 | Guardian | the reference player wins on the first try 60–80 %, within 2 retries ≥ 95 % | sim |
| A25 | Accessibility | reduced motion turns off shake, slow-mo and dolly; text ≥ 12 px; high contrast passes WCAG AA | ui-check + brand test |
