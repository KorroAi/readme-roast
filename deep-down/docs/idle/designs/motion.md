# DEEP DOWN — the idle descent, designed from motion and VFX

KEY: `motion`. Author angle: UI motion and VFX direction: easing and springs, the response ladder,
squash and stretch, rolling counters, loot flights, button states, purchase bursts, ceremonies (milestones,
tool tiers, chests, achievements, biome reveals), screen transitions, shader effects, GPU particles, shake
and hit-stop, the crisp-HD pipeline, the performance budget and the reduced-motion levels. The document
still covers the whole game, so the lead can merge it with the other angles.

**Sources.** Numbers marked **(sim)** come from
`/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/idle/motion/sim.mjs`.
It models 7 columns with a per-column dig depth, pierce overflow, leftover crumble, crew damage on the floor,
chests, and a greedy BEST buyer (one purchase per 0.6 s at most). The parameters are
`g2=1.085 lc=150 lb=40 gc=10 ec=3 eb=0.5 g3=1.05`. The logs in the same folder are
`final-run1-t4.log` and `final-run1-t3.log` (run 1 at 4 and 3 taps/s) and `final-run2-t4.log` (run 2: 72 Embers and a
Dive Start at 340 m). Spring numbers come from `springs.mjs`, and rank pacing from `rank.mjs`.

**Units.** The portrait camera maps 1 m at the cut face to 50 CSS px on every phone width. This is the same width lock as
the `visual` angle, so a cell is 50 px wide. Every px value below is in CSS px. Device px = CSS px × DPR.
Times are in ms at 60 Hz. At a 30 fps cap every duration rounds up to whole frames, and every one-frame effect still
shows for at least 1 frame.

---

## 0. Thesis, diagnosis and the motion rules

### 0.1 What the director felt, measured from the motion angle

| Felt | Cause in today's build (code) |
|---|---|
| "Nothing satisfying" | A hit does only four things: a crack stage, a 9 ms vibration (`ui/haptics.ts`), 3–6 grey debris cubes, and a 0.35-alpha flash on the cell (`TargetMarker`). Breaks show no number, no loot flight and no counter. Pickups fly to the explorer's back in 3D (`game/Drops.ts`), then print a text line in a left-side feed (`PickupFeed`) |
| "Nothing is shown" | The UI motion language (`src/ui/brand/motion.ts`) was built for calm exploration. An enter is an 8 px rise plus a fade, at most one infinite loop is allowed on screen, and the longest token is 1,100 ms. It has no impact register at all: no springs, no squash, no stamps, no rolls |
| "Not HD" | The world renders at 1.575 effective DPR on Balanced (1.75 × 0.9), and the browser stretches that canvas to native (2.6–3.0 on target phones), so the world shows 52–60 % of native linear resolution. Icons are pixel rasters rounded to non-integer texel scales (`iconPx`) |
| (hidden) | `ui.css` has **18 rules** that use the individual transform properties `rotate:`, `scale:` and `translate:`, and `notices.ts` animates `{ scale }` with WAAPI. **Chromium shipped those properties in version 104.** The stated floor is WebView 88 (`KNOWN_ISSUES.md`), so on WebView 88–103 the brand's diamond marks draw as unrotated squares and the press offsets do nothing |

**Thesis.** Dopamine comes from **timing**: anticipation, then an impact in the same frame, then a reward that travels, then a
counter that rolls over a threshold. This design keeps the brand's calm register for menus, text and settings. It adds an
**impact register** for everything the player earns, with exact curves, budgets and a motion setting.

### 0.2 The ten motion rules (each has a test in §11)

| # | Rule | Hard number |
|---|---|---|
| M1 | **Impact first.** The frame after `pointerdown` shows the hit: flash, crack, number spawn and strike pose. A wind-up never delays a tap. The swing that "already happened" is drawn as a smear | input → first changed frame ≤ 1 frame (16.7 ms at 60 Hz) |
| M2 | **The peak lands with the sound.** The visual maxima (pop, number scale) fall 2 frames after the tap, where Android Web Audio output arrives (typically 20–60 ms) | pop peak at 31–40 ms |
| M3 | **Gains travel.** Every gold, gem, XP, specimen and Ember gain moves from where it was earned to where it is kept. The counter changes when the gain **arrives** | 100 % of gains have a flight or a stream |
| M4 | **Counters roll, never jump** | a displayed value changes by at most ×1.5 per frame, except during a scripted count |
| M5 | **The more frequent, the smaller.** Every response belongs to one tier of the ladder (§0.3) and stays inside its tier's caps | trauma ≤ 0.06 and no hit-stop for anything faster than 1/s |
| M6 | **Anticipation scales with rarity.** Anything rarer than once per 10 s gets a 120–1,800 ms wind-up. Anything more common gets none | table §0.3 |
| M7 | **Never block the thumb.** No animation swallows input. A tap during a hit-stop ends it in the same frame, and every ceremony can be skipped from 400 ms | 0 dropped taps |
| M8 | **Every purchase shows in the world** within 1 frame: the pick grows, the crew cheers, the lantern flares | 100 % of upgrade ids have a world reaction |
| M9 | **Crisp at any DPR.** Text is vector (Lintel in the DOM, SDF in WebGL). Icons are vector, or pixel art at integer texel scale. The final image is composed at native resolution | text edge ≤ 1.2 device px; every icon texel the same integer size |
| M10 | **Respect.** Three motion levels, a flash setting and the existing shake slider. Full-screen flashes are ≤ 2/s, never red. Reduced motion means a still camera | §9.22 |

### 0.3 The response ladder (every effect in the game belongs to exactly one tier)

| Tier | Name | Typical rate | Max duration | Screen footprint | Wind-up | Hit-stop | Trauma | Full-screen flash | Blocks input | Examples |
|---|---|---|---|---|---|---|---|---|---|---|
| T0 | Ambient | continuous | loops | anywhere, ≤ 2 % luminance swing | — | — | — | — | no | motes, ore glint sweeps, BEST breathing, crew loops |
| T1 | Tick | ≥ 2/s | 150 ms | ≤ 60 px radius | 0 | 0 | ≤ 0.06 (taps use kick only) | — | no | tap crack, coin arrival, digit roll |
| T2 | Pop | 0.2–2/s | 400 ms | ≤ 160 px radius | 0 | ≤ 40 ms, rate-limited | ≤ 0.25 | — | no | cell break, crit, purchase, ready ping, row clear |
| T3 | Burst | 1 per 10–60 s | 1,400 ms | ≤ half screen | 0–450 ms | ≤ 60 ms | ≤ 0.45 | ≤ 0.12 | no | ★ milestone, rank-up, common–rare chest, Feat toast, combo tier, Lantern Bomb |
| T4 | Ceremony | 1 per 2–10 min | 2,400 ms | full screen, the world dims | 300–1,800 ms | ≤ 120 ms | ≤ 0.6 | ≤ 0.30 | skippable from 400 ms | tool tier, relic/mythic chest, number milestone, guardian break |
| T5 | Spectacle | 1 per 5–30 min | 4,000 ms | full screen, the camera moves | 0–600 ms | ≤ 160 ms | ≤ 0.8 | ≤ 0.35 (Rekindle 0.4, ramped) | digging resumes after 1,200 ms | biome reveal, Rekindle, offline feast, Dive Start |

Exclusivity: one T4 or T5 runs at a time. Others queue for at most 6 s, then play in their T3 form. While a T4 or T5
runs, T1–T2 effects play at 50 % particle counts and toasts wait.

---

## 1. Core loop at three scales, and what keeps it endless

### 1.1 Ten seconds: tap, crack, burst, fly, roll, buy

At 4 taps/s, 10 s gives 40 taps **(sim, run 1, first 25 min)**:
- **54–61 %** of taps crack a cell without breaking it (T1 tick);
- **26–36 %** break one cell (T2 pop);
- **6–14 %** break 2–3 cells (pierce crack line, chain counter);
- **0–5 %** break 4–7 (column burst);
- **0–4 %** break 8 or more (row wipe).

This mix is a variable-ratio schedule that comes for free from the HP and damage curves. Each break launches 1–6
coins, which land on the gold counter 0.5–0.8 s later. Each landing rolls the digits and moves the BEST card's fill bar.
Something is always affordable: the longest stretch with nothing affordable is **4.9 s at 4 taps/s and 7.9 s at
3 taps/s (sim)**, and only in the first 8 s. 1–2 rows clear in the 10 s, and each one drops the camera with a 4.5 %
overshoot "thunk" (§5.2).

### 1.2 Three minutes: a slice of discoveries

First 3 minutes **(sim, 4 taps/s)**: two biome reveals (25 m at 0:57, 75 m at 2:40), about 90 m of depth, ranks 1→3,
4–6 chests, 2–3 objectives, the first ★ milestone (Digger L10) and the first Lantern Surge.

A later 3-minute window (10–25 min) contains:
- 0.3–0.7 biome reveals (400 m at 10:56, 600 m at 15:02, 850 m at 23:53);
- 1 rank-up (every 2–4 min at ranks 5–15);
- 3–4 chests, one per 25 rows after 50 m;
- 2–3 events and 2 objectives;
- 2–6 ★ milestones;
- a tool tier every 25 Pick levels (Pick L61 at 3 min, L97 at 10 min, L139 at 20 min).

### 1.3 Three days: the Rekindle ladder

- **Rekindle.** It is available from 400 m and recommended when Embers per minute fall below half of their peak. Run 1
  reaches 850 m at about 24 min, which gives 72 Embers (×8.2) **(sim)**.
- **Dive Start.** Run 2 opens with an 11 s plunge to 40 % of the record, then a "spend spree". It passes run 1's 850 m at
  **12:39 instead of 23:53**, and walls at about 1,200 m for 145 Embers **(sim)**.
- **One day.** Typically 3–6 sessions of 5–15 min, each opened by the offline feast (§3.3). One daily lantern chest, a
  streak, 3–8 Feat tiers and 2–4 Delver ranks.
- **Three days.** Rank 20–35, 6–12 Rekindles, the first Echo biome for a heavy player, about 30 % of the Specimen Cabinet.

### 1.4 What keeps it endless

| Endless track | How it never ends | Its ceremony |
|---|---|---|
| Biomes | 14 authored biomes, then Echo strata every +900 × 1.2^k m (palette, creature and mutator remixes) | T5 reveal |
| Crew lines | One new line per biome, forever (cost ×3, output ×0.5 per line after the 6th, so lines stay meaningful without running away) | Line arrival (T3) |
| Tool tiers | Every 25 Pick levels. 11 authored models, then generated names and an aura that grows | T4 |
| Number suffixes | K, M, B, T, Qa … Vg, then aa…zz. The first time each suffix appears | T4 number milestone |
| Delver Rank | Never resets. `need(r) = 120 · r^0.78` XP | T3 |
| Feats | 20 families × tiers I–X, then endless tiers XI+ | T3 toast |
| Codex | 96 specimens and 12 sets, then shiny variants (1 % per find) | card reveal |
| Rekindle | Embers multiply everything, and Dive Start makes every new run open with a plunge | T5 |

---

## 2. The tap

### 2.1 Input contract (`ui/idle/TapSurface.ts`)

| Step | Rule | Numbers |
|---|---|---|
| Event | `pointerdown` on the world canvas. `touch-action: none`. No `click`, no `pointerup` | up to 3 pointers |
| Queue | A ring of 32 `{x, y, id, t}` entries, drained first in the frame, before the simulation | 0 allocations per tap |
| Entity first | Chests, creatures, event objects and the lantern are hit-tested in screen space | radius max(32 px, projected radius + 10 px) |
| Column | The 7 columns are equal strips between the projected shaft walls at the floor. A tap anywhere in the world window maps to a column by x (vertical position ignored) | 50 px per column |
| Target | The topmost solid cell of that column if it is ≤ 2 rows below the floor, otherwise the nearest column whose top cell is | the dig stays focused on the floor |
| Hold | A finger held still (≤ 12 px) for 160 ms auto-taps its column | 6 taps/s, +0.5/s per Steady Hand level, max 10/s |
| Swipe | A held finger crossing columns hits each new column at once (0.6 column of hysteresis) | ≤ 15 hits/s per finger |
| Cap | Resolved taps/s, for the effects budget. Extra taps merge their damage into the previous hit on that column | 20/s |

### 2.2 What one tap does (resolution order, pure: `gameplay/idle/Tap.ts`)

```
1  combo   = (t − lastTap ≤ 600 ms) ? combo + 1 : 1
2  base    = Pick·2.5^floor(Pick/25) + 0.01·Bond·crewDPS
3  D       = base × 3^Gears × (1 + 0.10·Embers) × (1 + 0.01·FeatTiers) × (1 + 0.005·(Rank−1)) × Boosts
4  crit    : p = min(45 %, 5 % + 2 %·Keen);  on crit D ×= 5 + Heavy
5  combo   : D ×= 1 + 0.01·min(combo, 50)
6  surge   : D ×= 3 while Lantern Surge runs
7  apply D to the target cell. The overflow after a break flows into the next cell down the same column,
   up to 1 + DeepStrike cells, and never more than 8 cells below the floor
8  leftover crumble: once 5 of 7 columns are below the floor row, the rest crumble 300 ms later with full loot
9  Lantern Bomb (from 100 m): every 25th tap blasts 3×3 cells at 10× D (levels 2–5: 3×5, 5×5, 7×5, 7×7)
10 events : the Surge meter += 1 (crit +4), XP, combo tier and Feat counters
```

**The first three rows are the tutorial's free win:** HP 1, 2 and 3, so every first tap breaks a cell.

### 2.3 How a tap scales: the VFX escalation tier comes from the cells it breaks

The tier is picked per tap from **what the tap broke**, so the spectacle grows with power without any extra rule. When a
new biome raises HP, it falls back, and climbs again as the player grows (the sawtooth).

| Tier | Trigger | Share of taps, run 1, 0–25 min (sim, 4 taps/s) | Added on top of the tier below |
|---|---|---|---|
| E0 Crack | no break | 54–61 % | cell flash 0.6, face pop 0.08 m, crack stage, 4 dust and 2 chips, damage number, camera kick 2 px |
| E1 Break | 1 cell | 26–36 % | shatter (8 shards), 16 dust and 6 sparks, world shock ring 0.45 s, 1–6 loot tokens |
| E2 Pierce | 2–3 cells | 6–14 % | crack line through the column (120 ms ribbon), chain counter "×3", arpeggio +2 semitones per cell |
| E3 Column | 4–7 cells | 0–5 % | vertical light pillar 180 ms (HDR amber ×4), trauma +0.15, screen shock 0.004 |
| E4 Row wipe | 8+ cells, or one tap clears the row | 0–4 % | row ripple from the tapped column outward (30 ms per column), trauma +0.30, chroma 0.003 |
| E5 Plunge | ≥ 6 rows/s for 1.5 s (Dive Start, bomb cascades, run 2+ early depths) | run 2 dive: 100 % for 11 s | the Plunge renderer (§9.18) |

Breaks per second over the whole run **(sim)**: p50 2, p95 11, max 36. Rows per second: p95 2, max 6–7 (the 6 rows/s
plunge threshold is crossed only by spikes, plus the Dive Start). These rates size every budget in §9 and §10.

### 2.4 The strike ghost (the tool on screen)

The camera is fixed and taps hit any of the 7 columns at up to 10/s, so the foreman cannot walk to each cell. The
**Lantern Pick** is a glowing copy of the tool that appears **at the impact pose** on the tapped cell in frame 0. An
additive **smear arc** (a 90° ribbon, 6 segments, alpha 0.7 → 0 over 90 ms) shows the swing that "already happened".
The tool then follows through 18° over 120 ms (outCubic) and fades over 80 ms. The foreman model (`ExplorerModel`, kept)
stands on the scaffold at the shaft's left wall and mirrors the swing gesture.

| Tier | Pick level | Name (i18n `idle.tool.*`) | Head length | Smear radius | New impact layer |
|---|---|---|---|---|---|
| 1 | 1 | Rusty Pick | 0.6 m (30 px) | 0.7 m | chips |
| 2 | 25 | Bronze Pick | 0.8 m | 0.9 m | + sparks |
| 3 | 50 | Iron Pick | 1.0 m | 1.2 m | + world shock ring on every hit |
| 4 | 75 | Steel Mattock | 1.3 m | 1.5 m | + a crack line on crits |
| 5 | 100 | Runed Pick | 1.6 m (80 px) | 1.9 m | cyan runes glow along the haft (0.7 Hz pulse) |
| 6 | 125 | Lantern Hammer | 2.0 m | 2.4 m | + an ember trail behind the smear |
| 7 | 150 | Drill Lance | 2.5 m | — (it spins: 18 rev/s on contact) | + spiral sparks |
| 8 | 175 | Quake Maul | 3.2 m | 3.6 m | + a row ripple on crits |
| 9 | 200 | Star-forged Pick | 4.0 m | 4.5 m | + light rays on crits (0.3, 300 ms) |
| 10 | 250 | Colossus | 5.5 m | 6.0 m | + a screen-wide shock on crits |
| 11 | 300 | Titan Lantern | 7.0 m (spans the shaft) | 7.5 m | every tap draws a column pillar |
| 12+ | +50 per tier | Echo tiers (generated "Material + Form", e.g. "Abyssal Lance") | 7.0 m cap | 7.5 m | the aura radius grows 0.3 m per tier, and its hue cycles once per 8 s |

Run 1 reaches Pick L139 by 25 min **(sim)**, which is tiers 1–6. Tiers 7+ belong to Rekindled runs.

---

## 3. Idle and offline

### 3.1 The crew on screen (online idle)

Every crew line has visible workers on the shaft walls and the floor. The loops are T0: they repeat and carry no sound
above −24 dB. Each worker's damage is applied at its loop's impact frame, so the screen and the numbers agree.

| Line (unlock depth) | Rig | Loop, impact frame | Instances shown (Balanced) | Level ★ look |
|---|---|---|---|---|
| Digger (0 m) | a miner on the floor ledge | 900 ms swing, impact at 520 ms | 1 + 1 per 10 levels, max 6 | lantern on the helmet from ★1, gold trim from ★3 |
| Cart Crew (12 m) | a cart on a wall rail | 2,400 ms run, dump at 1,900 ms | 1–3 | rails glow at ★2 |
| Drill Rig (25 m) | a bore on a gantry | continuous 30 Hz vibration of 0.01 m, sparks at 8/s | 1–2 | the bit becomes cyan at ★3 |
| Blast Crew (75 m) | a charge setter | 6,000 ms: plant, a 0.8 s fuse with 6 sparks/s, boom (T2 burst at 30 % of the bomb's counts) | 1–2 | — |
| … one line per biome start | a new rig per biome (Steam Bore, Rune Golem, Lantern Swarm, Star Engine…) | 1.2–6 s loops | 1–2 each, 24 crew instances in total | — |

When a line levels, its rig "cheers": a 0.2 m jump with bounce, then a 150 ms speed-up of its loop.

### 3.2 Offline

```
gold_offline = crewDPS × goldPerHP(depth) × t_eff
t_eff        = min(t, 2 h) + 0.5 × min(max(t − 2 h, 0), 6 h)          (cap 8 h; Lantern Charms add +2 h each, max 4)
```

- The crew never crosses a biome seal offline: discoveries always happen with the player watching. The gold the crew
  would have dug past the seal is banked as the **Hoard**, paid on return at 100 %.
- Offline progress is computed in closed form with the same HP and gold curves (pure: `gameplay/idle/Offline.ts`), so it
  costs no simulation steps.

### 3.3 The return feast (T5, 3,200 ms; any tap skips to 2,400 ms)

| t (ms) | Layer | What | Curve |
|---|---|---|---|
| 0 | WebGL | The world fades in from slate-950 | 240 ms outCubic |
| 0–700 | WebGL | The camera plays the offline descent as a plunge (§9.18): 0.4 s at 20 m/s, then decelerates onto the current face | outCubic |
| 300 | DOM | The "While you were away" plate drops in: translateY −40 → 0, scale 0.9 → 1 | snap spring (12.3 % overshoot, 192 ms) |
| 450 | DOM | The time line rolls ("3 h 12 min"), digits roll 90 ms each | outCubic |
| 600 | DOM + FX | The gold total counts up from 0 over `clamp(500 + 220·log10(total), 500, 2000)` ms in log space (§9.8). A coin fountain rises from the plate (40 coins over the count) | outQuart |
| 600 | Audio | A cash roll whose tick rate follows the digits (≤ 24 ticks/s), pitch +1 semitone per 4 ticks, up to +12 | — |
| +count | DOM | The Hoard line stamps in, if any: scale 1.6 → 1 with a −8° → 0 rotation | snap |
| +250 | DOM | The Collect button pops (scale 0.6 → 1, jelly) and breathes (0.5 Hz) | jelly |
| Collect | FX | 24 coin bundles fly to the gold counter (§9.7), and the counter rolls by the total. Gold is credited per landing | — |

### 3.4 On-screen idle (battery)

After 20 s without input, the frame cap drops to 30 fps and only T0 and crew effects play. The FX canvas hides once
it is empty for 300 ms. The next `pointerdown` restores 60 fps in that same frame (M1 still holds: the frame limiter
skips its accumulator on input).

---

## 4. Economy

### 4.1 Cells, HP and gold (sim parameters)

```
HP(d) = 6 · 1.11^d                      for d < 60 m
      = HP(60) · 1.085^(d − 60)         for 60 ≤ d < 400 m
      = HP(400) · 1.05^(d − 400)        for d ≥ 400 m
gold per cell = HP(d) / 3 × kind        (expected kind multiplier 1.00)
```

| Cell kind | Share | Gold × | HP × | Look |
|---|---|---|---|---|
| Rock (biome family) | 84 % | 0.6 | 1 | biome ramp, cracks in the family's tint |
| Ore | 10 % | 2.5 | 1 | vein glyphs, glint sweep every 2.6 s |
| Rich ore | 4 % | 4 | 1.5 | emissive pulse 0.7 Hz, glints |
| Gem / fossil / geode | 1 % | 8 | 2 | rune-cyan or violet light, star glints |
| Chest | 1 per 15 rows to 50 m, then 1 per 25 rows | (contents §6.1) | 3 | brass lid seam |

Expected multiplier: 0.84·0.6 + 0.10·2.5 + 0.04·4 + 0.01·8 = 0.994 (chests carry the rest).

### 4.2 Upgrades (gold, reset by Rekindle)

| Upgrade | Unlock | Base cost | Growth per level | Effect | Cap |
|---|---|---|---|---|---|
| Pick | 0 m | 8 | ×1.13 | tap = L · 2.5^floor(L/25); a tool tier every 25 levels | none |
| Crew line i (i = 0, 1: Digger, Cart Crew; then one per biome start) | Digger 0 m, Cart Crew 12 m, then each biome | Digger 15; others 150 · gold(u) · 3^max(0, i−5) | ×1.10 | output b·L·2^floor(L/10), with b = HP(u)/40 · 0.5^max(0, i−5) (Digger HP(0)/8); a ★ every 10 levels | none |
| Tap Bond | 20 m | 3 rows of gold at 20 m | ×2.2 | each tap adds 1 % of crew DPS per level | 25 |
| Keen Edge | 0 m | 150 | ×3.2 | crit chance +2 % per level (base 5 %) | 20 (45 %) |
| Heavy Head | 15 m | 400 | ×2.6 | crit multiplier +1 (base ×5) | none |
| Deep Strike | 40 m | 5 rows of gold at 40 m | ×7 | pierce +1 cell | 12 |
| Biome Lantern (gear) | each biome start | 10 rows of gold at that start | one-shot | ×3 to all damage | one per biome |
| Steady Hand ¹ | 50 m | 2 rows of gold at 50 m | ×4 | hold auto-tap +0.5/s | 8 (10/s) |
| Lantern Bomb ¹ | 100 m | 8 rows of gold at 100 m | ×12 | every 25 taps a blast (sizes §2.2) | 5 |
| Surge Lens ¹ | 150 m | 6 rows of gold at 150 m | ×6 | Surge +1 s (base 10 s) | 10 |

¹ Not modelled in the sim. Its effect is active play only, so it adds margin, not imbalance. It is calibrated in wave 2.

### 4.3 Milestones

| Milestone | Effect | Tier |
|---|---|---|
| ★ every 10 crew levels | that line ×2 | T3 on the card, plus the rig flash in the world |
| Tool tier every 25 Pick levels | ×2.5 and a new model | T4 |
| 100 m depth record | +10 gems, a wall plaque lights | T2 plus the plaque |
| Biome start | a Biome Lantern card, a new crew line, the reveal | T5 |
| First time a suffix appears (K, M, B…) | cosmetic: the counter's tier colour and frame | T4 number milestone |

### 4.4 The multiplier stack (one formula, shown in the Stats sheet)

```
tap     = (Pick·2.5^⌊Pick/25⌋ + 0.01·Bond·crewDPS) · Gear · Ember · Feat · Rank · Boost · combo · crit · surge
crewDPS = Σ b_i·L_i·2^⌊L_i/10⌋ · Gear · Ember · Feat · Rank · Boost
Gear = 3^gears   Ember = 1 + 0.10·E   Feat = 1 + 0.01·tiers   Rank = 1 + 0.005·(rank − 1)
gold    = HP/3 · kind · goldBoosts            (gold follows HP, so income ∝ damage at any depth)
```

### 4.5 Prestige: Rekindle and Dive Start

- **Embers.** `E = floor((maxDepth/100)²)`, available from 400 m (16 Embers): 72 at 850 m, 145 at 1,205 m. Each Ember
  gives +10 % damage, additively.
- **What resets.** Gold, upgrades and depth. **What stays:** Embers, gems, Charms, Feats, rank, Codex and the cosmetic
  skins.
- **Dive Start.** A run opens at 40 % of the record depth (+5 % per Charm level, max 70 %). The descent is played as an
  11 s plunge (§9.18) that pays the gold of every row it passes. That gold is spent at once in the **spree**: a Max-all
  ceremony where cards light up one after another, 60 ms apart (sim: 603 levels bought at 340 m).
- **Pacing (sim).** Run 1 reaches 850 m at 23:53 (4 taps/s). Run 2, with 72 Embers and a 340 m dive, reaches 600 m at
  5:28 and 850 m at 12:39, and passes 1,150 m at 29:56. **Run 2 matches run 1's record in 53 % of the time and goes 42 %
  deeper.**
- **The Lantern meter** (tab 5) shows "Rekindle now: 72 Embers (+3/min)". It glows (T0) once that rate drops below 50 %
  of its peak. Rekindle itself is T5 (§9.15).

### 4.6 Pacing targets and what the sim gives

| Target | Goal | Sim, 4 taps/s | Sim, 3 taps/s |
|---|---|---|---|
| First purchase | ≤ 6 s | 4.9 s | 7.9 s ² |
| Longest stretch with nothing affordable, 0–30 min | ≤ 10 s | 4.9 s | 7.9 s |
| BEST purchase wait (the fill-bar anticipation) | 5–70 s | up to 62 s | — |
| Biome 2 (25 m) | 0:45–1:30 | 0:57 | 1:20 |
| Biome 3 (75 m) | 2:00–3:30 | 2:40 | 3:10 |
| Biome 5 (250 m) | 5–8 min | 6:08 | 6:51 |
| Biome 7 (600 m) | 13–18 min | 15:02 | 15:30 |
| Biome 8 (850 m), the Rekindle point | 20–30 min | 23:53 | 25:00 |
| Run 2 time to run 1's record | ≤ 60 % | 53 % | — |
| Rank 10 | 12–20 min of play | 15.4 min (`rank.mjs`) | — |

² At 3 taps/s the 6 s goal is missed by 1.9 s. The tutorial rows (HP 1–3) bring both cases under 4 s. The sim does not
model them.

### 4.7 The upgrade mechanic as the player feels it (the director's "improve the upgrades")

1. **The fill bar is the anticipation.** Every card shows `displayedGold / cost` as a 3 px bar under the cost. It moves
   with every coin that lands, so the player **watches** the next purchase arrive. At ≥ 85 % it glows (BEST card only).
2. **BEST.** The badge marks the option with the shortest payback (`cost / Δincome`). It is never hidden: one tap on BEST
   is always the right move.
3. **Buy modes:** ×1, ×10, **Next ★** and Max. **Next ★** buys exactly up to the next milestone, so every press of it
   ends in a ★ ceremony. It is the default once the first ★ is reached.
4. **Hold to repeat:** after 380 ms, 8 buys/s, rising to 16/s after 1.5 s. The pitch climbs a semitone per buy.
5. **Milestone pips:** each card shows the levels left to its ★ as up to 10 pips. Each pip fills with a pop, and the
   10th triggers the ★.
6. **The delta preview.** Under the name: "+12 % → 1.42K / tap". When a purchase lands, the preview's number rolls to
   the new value.
7. **The world reacts** within 1 frame (M8): the Pick upgrade pumps the strike ghost, a crew level makes its rig cheer,
   and gear makes the lantern flare.

---

## 5. The descent and the world in the voxel engine

### 5.1 World size and streaming

The authored 160×128×160 zone is replaced by a **ring window** that follows the dig face. It is 64 (x) × 160 rows (y) ×
64 (z), cut into 10 slabs of 16 rows: 3 above the face and 7 below. Blocks take 0.66 MB and light (RGBA8) 2.6 MB. A
recycled slab is filled with bedrock and its light is zeroed, so `LightField` needs no ring logic. The slab worker
generates 16 new rows plus 16 rows of context. Physical descent is capped at **6 rows/s**. Above 5 m/s held for 1.5 s,
the Plunge renderer takes over (§9.18) while the economy keeps simulating at full speed. The design is the same as the
`visual` angle's RingWorld. This angle adds only the motion hand-offs into and out of the Plunge.

### 5.2 The camera in portrait (`render/descent/DescentCamera.ts`) and its motion

| Parameter | Value |
|---|---|
| Width lock | visible width at the cut = clamp(cssWidth / 50, 7.2, 8.6) m, so 1 m = 50 px |
| Distance and projection | D = 12.6 m. Pitch 0 with an off-axis vertical shift, so verticals stay parallel. The dig face sits at 52 % of the world window's height |
| Row follow | When the floor drops 1 m, camera y follows on the **follow spring** (ω 9, ζ 0.70): 4.5 % overshoot (2.25 px), 661 ms to 2 % — a "thunk" per row |
| Tap kick | 2D kick spring (ω 40, ζ 0.45). Impulse 2.9 m/s toward the tapped cell gives 0.040 m (2 px) at 31 ms. Crits use 5.8 m/s (4 px). Offsets sum, capped at 6 px |
| Shake | Trauma (§9.19): offset 0.4 m · T², roll 1.2° · T² |
| Cavern breakthrough | The face falls more than 3 m: hold 250 ms, fall ease-in to a cap of 30 m/s with streaks, land with a 0.18 m overshoot and trauma 0.35 |
| Vista dolly | D from 12.6 to 24 m over 1,200 ms (inOutCubic), hold 1,600 ms, back in 900 ms (inOutCubic). Taps still dig |
| Reduced motion | No kick, no shake, no dolly (the vista is a 300 ms crossfade). The follow becomes outCubic over 220 ms with no overshoot |

### 5.3 The biome ladder (first cycle), with each biome's reveal signature

| # | Biome | Starts at | Accent (sRGB) | Reveal particle (T5) | Creature (tappable) | Signature treasure |
|---|---|---|---|---|---|---|
| 1 | Rootworks | 0 m | lamps #ffb35c | root dust | root beetle | copper |
| 2 | Glowroot Caverns | 25 m | #9be7a8 | spores rising at 0.6 m/s | glow moth | glowroot amber |
| 3 | Crystal Grotto | 75 m | #8fe3ee | crystal glitter (4-point stars) | crystal crab | geode |
| 4 | Halden Works | 150 m | #ffb35c | brass sparks | clockwork mole | Halden log |
| 5 | Fungal Deep | 250 m | #c58cff | spore puffs | puffcap | spore pearl |
| 6 | Drowned Ruins | 400 m | #5fb7ff | bubbles | lantern eel | tide glass |
| 7 | Magma Veins | 600 m | #ff7a2e | embers | ember newt | fire opal |
| 8 | Fossil Halls | 850 m | #e8d7b0 | bone dust | fossil wyrm (sleeping) | amber fossil |
| 9 | Frost Hollow | 1,150 m | #bfe9ff | ice glitter | frost fox | ice heart |
| 10 | The Loom | 1,500 m | #b9a2ff | thread glints | weaver | rune spool |
| 11 | Iron Core | 1,900 m | #d0d6de | metal flakes | iron beetle | meteor iron |
| 12 | Star Heart | 2,400 m | #fff1c2 | star glints | star jelly | star shard |
| 13 | Void Sea | 3,000 m | #6a5cff | inverse motes (dark cores, violet rims) | void ray | void pearl |
| 14 | The Gate | 3,700 m | #8fe3ee and gold | rune glyph particles | the Keeper | the Black Stone shard |
| 15+ | Echo strata | +900 × 1.2^k m | remixed accents | remixed | remixed and larger | Echo variants |

Each biome starts with a **seal row**. It is an event: a guardian row that breaks in a 20 s window, with no failure state
(§6.5). Its break triggers the reveal (§9.14).

### 5.4 What fills the caverns (density contract, so they are never empty)

Per screen of world window (about 9.8 m of rows):
- **≥ 3 tappables:** a chest, a creature, an event object or a glinting gem;
- **≥ 1 animated light:** glowroots, lava falls or crystals pulsing on T0 0.7 Hz;
- **≥ 40 drifting motes** of the biome kind (T0);
- **one landmark prop** every 2 screens (a statue, a pipe organ or a fossil rib);
- **clear air within 1.5 m of the dig face rectangle**, so the action is never hidden.

Creatures idle on 1.2–3.0 s loops. When tapped they give a T2 or T3 reward and a 40 ms hit-stop.

---

## 6. Discovery, collections, events and the mystery thread

### 6.1 Chests and rarity

| Rarity | Odds | Seam colour | Escalation steps | Ceremony length | Gold (seconds of income) | Gems | Specimen chance | XP |
|---|---|---|---|---|---|---|---|---|
| Common | 62 % | bone300 #c9bfae | 0 | 900 ms (T3) | 20 s | 0 | 10 % | 20 |
| Uncommon | 24 % | #e58444 | 1 | 1,350 ms (T3) | 60 s | 1 | 20 % | 40 |
| Rare | 10 % | rune200 #8fe3ee | 2 | 1,800 ms (T3) | 150 s | 3 | 40 % | 80 |
| Relic | 3.5 % | deep300 #b9a2ff | 3 | 2,400 ms (T4) | 300 s + 1 relic shard | 8 | 100 % | 160 |
| Mythic | 0.5 % | prismatic (hue cycle every 1.2 s) | 4 | 3,200 ms (T4) | 600 s + 1 relic | 20 | 100 % (shiny 10 %) | 320 |

- **Pity.** A rare or better is guaranteed on the 8th chest in a row without one, and a relic or better on the 40th.
- **No fake-outs.** The escalation always lands on the true rarity: the suspense is in waiting to see where it stops,
  never in a near-miss.
- **No paid randomness.** The game has no purchases (§6.7).

### 6.2 Feats (the achievements)

There are 20 families with tiers I–X, then endless tiers XI+ (each next threshold ×3, or ×10 for the counting families).
Every tier gives **+1 % to all damage and gold** (the Feat bucket in §4.4), plus 5 × tier gems. Tiers V and X also
unlock a cosmetic: a trail colour, a pick skin, a counter frame or a title.

| # | Family | Tiers I → X |
|---|---|---|
| 1 | Deeper Still (max depth) | 10, 25, 75, 150, 250, 400, 600, 850, 1,150, 1,500 m |
| 2 | Stonebreaker (cells) | 100, 1K, 5K, 25K, 100K, 500K, 2M, 10M, 50M, 250M |
| 3 | Fortune (lifetime gold) | the first K, M, B, T, Qa, Qi, Sx, Sp, Oc, No |
| 4 | Keen Eye (crits) | 10, 100, 500, 2K, 10K, 50K, 200K, 1M, 5M, 20M |
| 5 | Rhythm (best combo) | 10, 25, 50, 100, 150, 200, 300, 400, 500, 750 |
| 6 | Lockpick (chests) | 1, 5, 15, 40, 100, 250, 500, 1K, 2.5K, 5K |
| 7 | Lucky Lamp (rare+ chests) | 1, 3, 10, 25, 50, 100, 200, 400, 700, 1K |
| 8 | Cabinet (specimens) | 1, 5, 10, 20, 30, 45, 60, 75, 90, 96 |
| 9 | Cartographer (biomes revealed) | biomes 2–11 |
| 10 | Rekindled | 1, 3, 5, 10, 20, 35, 50, 75, 100, 150 |
| 11 | Foreman (total crew levels) | 10, 50, 100, 250, 500, 1K, 2K, 4K, 7K, 10K |
| 12 | Edge (Pick level) | 10, 25, 50, 75, 100, 150, 200, 300, 400, 500 |
| 13 | Starlit (★ milestones) | 1, 5, 15, 30, 60, 100, 150, 250, 400, 600 |
| 14 | Golden Hands (events caught) | 1, 5, 15, 40, 100, 200, 400, 700, 1K, 2K |
| 15 | Kindred (creatures tapped) | 1, 5, 15, 40, 100, 250, 500, 1K, 2K, 5K |
| 16 | Plunger (metres plunged) | 100, 500, 2K, 5K, 10K, 25K, 50K, 100K, 250K, 500K |
| 17 | Lamplighter (Surges) | 1, 5, 20, 50, 100, 200, 400, 700, 1K, 2K |
| 18 | Faithful (days played) | 1, 2, 3, 5, 7, 14, 21, 30, 60, 100 |
| 19 | Homecoming (offline returns) | 1, 5, 15, 30, 60, 100, 200, 350, 500, 1K |
| 20 | Scholar (lore cards) | 1, 3, 6, 10, 14, 18, 22, 26, 30, 36 |

The Feats sheet sorts by **closeness to the next tier**. The top 3 rows carry a progress glow (T0) and a "93 %" label.
This is the "almost there" engine.

### 6.3 Delver Rank (the account level that never resets)

- **XP sources:** cell 1, ore 3, chest 20–320, purchase 1, ★ 10, tool tier 50, biome 100, Feat tier 30, event 15. The
  model assumes 4 XP/s while playing.
- **Requirement:** `need(r) = 120 · r^0.78` XP. Rank 2 comes at 0.5 min, rank 5 at 4.0 min, rank 10 at 15.4 min,
  rank 20 at 55 min, rank 50 at 4.9 h and rank 100 at 16.8 h (`rank.mjs`). The gap between ranks grows from 0.9 min
  (rank 2) to 18 min (rank 100), so a rank-up is always "soon".
- **Rewards.** Each rank: +0.5 % to all and 2–10 gems. Every 5 ranks: a rare chest. Every 10 ranks: a cosmetic.

### 6.4 The Specimen Cabinet (Codex)

There are 96 specimens: 8 per biome × 12 biomes, plus Echo shinies. Each first find plays a card reveal (§9.12, at the
"open" step). A completed set of 8 gives that biome's set bonus (+5 % gold) and translates one lore line (§6.6).

### 6.5 Events: golden moments (`gameplay/idle/Director.ts`, seeded)

One event every 60–90 s while active. Never two at once, never during a T4 or T5, never offline.

| Event | Window | Verb | Reward | Tier |
|---|---|---|---|---|
| Golden Moth | crosses the screen in 5 s on a sine path | tap it | 60 s of income | T3 |
| Crystal Rain | 4 s, 8 crystals fall | tap each | 1 gem per 4 crystals | T2 each, T3 for all 8 |
| Gold Vein | a row turns gold for 8 s | dig it | ×10 gold on that row | T2 per cell |
| Echo Bell | rings 3 times | tap the bell | the next 30 taps crit | T3 |
| Treasure Map | a dotted line to a buried chest 6 rows down | dig to it | a rare+ chest | T3 |
| Cave Gale | 6 s, 3 glowing motes | tap all 3 | a Surge at once | T3 |
| Guardian (seal row) | 20 s | break the row | the biome reveal, plus a relic chest the first time | T4 → T5 |

The seal row has no failure state. If its 20 s run out, the row simply stays, and the crew keeps working on it.

### 6.6 The mystery thread: "Who lit the lintels?"

The thread reuses the existing lore: the Halden logs, the runes and the Black Stone. Each biome has one carved lintel
plate in its vista, carrying 1 line of builders' script (cyan, the brand's builders' register). Completing that biome's
Cabinet set translates the line, and each translation is a 2-line card. The 14 lines lead to the Gate at 3,700 m and the
Keeper. The Echo strata then show the same lintels with new lines ("lit again by someone else").

### 6.7 Guardrails

No purchases, no ads and no paid randomness. No streak loss beyond the daily bonus (missing a day costs nothing earned).
No fake-out reveals. A rare+ chest is guaranteed within 8 chests.

---

## 7. Guidance

### 7.1 Tutorial script: the first 3 minutes (times at 4 taps/s; each UI part enters the first time it is needed)

| t | Trigger | What the player sees | Motion cue |
|---|---|---|---|
| 0.0 s | first launch (no menu) | the shaft mouth at dusk, one glowing cell under the lantern | the wordmark's lantern-O match-cuts into the shaft lantern (§9.15, 900 ms) |
| 1.2 s | no tap yet | ghost hand on the glowing cell, chip "Tap the rock" | a 900 ms press loop: scale 1 → 0.85 → 1, plus a ring 0 → 64 px at 0.6 alpha |
| first tap | — | the cell shatters (HP 1) and a coin flies up | the gold plate drops in **with** the first coin: translateY −64 → 0 on the snap spring |
| ≈ 2 s | gold ≥ 8 | the Pick card rises into the dock, ghost hand on it, chip "Upgrade your pick" | card translateY 96 → 0 (snap). Focus scrim 0.45 with a hole on the card (240 ms). The ready ping |
| purchase | — | the strike ghost grows (0.60 → 0.62 m), "+1 / tap" | the purchase burst (§9.10) and the world pump |
| ≈ 5 s | row 1 clears | the floor drops 1 m | the depth plate drops in, and the follow spring thunks |
| 10 s | — | the objective chip "Reach 10 m" | the chip slides from the top (soft spring). Its bar fills live |
| 20 s | the 12th tap after the first purchase is forced to crit | "CRIT ×5" | T2 crit |
| 30 s | rank 2 | the rank badge and XP bar appear | the rank-up (§9.11) |
| 45 s | Digger affordable | the crew card rises, ghost hand on it | the Digger drops on a rope, lands with a squash (0.75 y), starts its loop |
| 57 s | 25 m | Glowroot Caverns | the first T5 reveal (§9.14) |
| 1:20 | first chest (row 30, forced uncommon) | the chest pops toward the camera | a 1-step escalation (§9.12) |
| 1:40 | Surge meter full (it starts at 140/240) | the lantern pulses, chip "Tap the lantern!" | ghost hand on the lantern. The Surge (§9.11) |
| 2:00 | Digger L10 | "★ ×2" on the card | the ★ ceremony |
| 2:10 | after the chest | the first Feat toast, "Lockpick I", and the Feats tab badge | the Feat toast (§9.13) |
| 2:40 | 75 m | Crystal Grotto | T5 |
| 3:00 | ≥ 6 taps/s for 20 s | "Hold to dig" | a ghost-hand hold loop, 1.2 s |

The ghost hand is an inline SVG (an outlined octagon-joint hand on the Lintel lattice). It moves on quadratic Béziers
over 400 ms (inOutCubic), and leaves the moment the step is done (fade 140 ms).

### 7.2 The always-visible objective (the chip)

The chip holds one goal, with an icon, 15 px text, a 4 px bar and a reward chip. The generator targets an ETA of
45–90 s. On completion:
1. the bar finishes at 1.0 (180 ms outCubic);
2. a check stamps in (scale 1.8 → 1, snap);
3. the reward flies to its counter (§9.7);
4. the chip flips (rotateX 0 → 90° in 120 ms inQuad, swap, −90° → 0° in 160 ms outBack) to the next goal.

At ≥ 85 % the chip's bar breathes (T0, 0.8 Hz).

### 7.3 Hints

At most 1 text hint per 20 s, and each hint at most 3 times in a lifetime. A hint is dismissed by doing it. The rules,
in priority order:
1. affordable BEST unbought for 15 s: the card pings twice;
2. a chest untapped for 6 s: its seam pulses (1.2 Hz);
3. an event about to end: its ring turns amber at 1.5 s left;
4. Rekindle recommended for 3 min: the Lantern tab breathes;
5. a combo lost 3 times in 10 s: "Tap within 0.6 s to keep the combo".

### 7.4 Nested meters (the next-goal bars: one of them is always about to complete)

| Meter | Where | Typical fill time | Completion tier |
|---|---|---|---|
| BEST fill bar | under the card's cost | 5–70 s | T2 ready ping |
| ★ pips | on each card | 30 s–5 min | T3 |
| Objective bar | the chip | 45–90 s | T3 (chip flip) |
| XP bar | top bar, row B | 0.9–18 min | T3 rank-up |
| Depth ruler to the next biome | the right edge | 1–25 min | T5 |
| Lantern meter (Embers) | tab 5 | 20–45 min | T5 Rekindle |
| Feat progress | Feats sheet | hours | T3 |

Every meter moves continuously with `transform: scaleX` on its fill (compositor-only). At ≥ 85 % it gets the "near"
treatment: a brighter fill and, only on the top two meters by closeness, a T0 glow.

---

## 8. Portrait UI layout

### 8.1 390 × 844 CSS px (safe top 47, bottom 34)

```
y=0    ┌──────────────────────────────────────┐
       │ status bar / notch              (47) │
y=47   │ [R7][◉ 12.3K   +45.6K/s][  312 m   ] │ row A 48: rank 48, gold 190, depth 112
y=99   │     [▬▬▬▬▬▬▭▭ rank 7  ][ ◆ 140     ] │ row B 24: XP bar + label, gems
y=131  │ [▶ Reach 400 m · Drowned Ruins ▮▮▮▯] │ objective chip 358 × 44
y=183  │┊ev┊                            ┊ru┊ │ world window 183–674 (491 px)
       │┊  ┊  shaft above: crew, lamps  ┊le┊ │
y=438  │ ══════════ DIG FACE (7 × 50) ═══════ │ face edge at 52 % of the window
       │       section below: ore, chests     │
y=630  │             ( ×24 )        [×1 ▾]    │ combo (SDF, world layer); buy-mode chip
y=674  ├──────────────────────────────────────┤ 40 px scrim above the dock (slate-950, 0 → 0.85)
y=682  │ [  BEST  ][  Pick   ][ Newest crew ] │ quick dock: 3 cards 116 × 72, gaps 8
y=762  │ [Upgr][Crew][Feats][Codex][Lantern]  │ tab bar: 5 × 78 × 48, badges
y=810  │ home indicator                 (34)  │
y=844  └──────────────────────────────────────┘
```

| Element | Rect (x, y, w, h) | Content |
|---|---|---|
| Rank badge | 12, 47, 48, 48 | octagon plate, rank in Lintel 17 px, the XP ring as an octagonal stroke |
| Gold counter | 68, 47, 190, 48 | coin socket 28 px (the flights' target), value in Lintel 26 px tabular, rate 12 px verdigris300 |
| Depth | 266, 47, 112, 48 | value in Lintel 22 px amber300, biome name 11 px… raised to the 12 px floor and set in brass300 |
| XP bar | 68, 103, 190, 6, plus a 12 px label | amber400 fill, near-glow at ≥ 85 % |
| Gems | 266, 99, 112, 24 | gem socket 18 px, value in Lintel 15 px |
| Objective chip | 16, 131, 358, 44 | icon 20, text 15 bone100, bar 4 amber400, reward chip |
| Event bubbles | 8, 191, 56 × 56, stacked 4 max | timer ring (SVG stroke) |
| Depth ruler | 366, 191, 20, 475 | ticks every 10 m, the next-biome icon, the notch at the face |
| Quick dock cards | 11 + i·124, 682, 116, 72 | icon 36, name 13, level 12, cost 15, fill bar 3, pips, BEST badge |
| Buy mode | 318, 646, 64, 28 | ×1 / ×10 / Next ★ / Max |
| Tab bar | i·78, 762, 78, 48 | icon 24, label 12, badge 16 |

Every tap target is at least 48 × 48, except row B (24 px), which is display only. Its taps open the Rank and Gems sheets
through a 48 px hit slop.

### 8.2 Other viewports

| Viewport (safe top / bottom) | Top bar (rows A+B) | Chip | World window | Face y | Cards |
|---|---|---|---|---|---|
| 360 × 740 (24 / 16) | 44 + 22 | 40 | 138–582 | 369 | 3 × 108 × 66 |
| 390 × 844 (47 / 34) | 48 + 24 | 44 | 183–674 | 438 | 3 × 116 × 72 |
| 412 × 915 (40 / 24) | 48 + 24 | 44 | 176–733 | 466 | 3 × 123 × 76 |

### 8.3 The layer stack (bottom to top)

| z | Element | Technology | Holds |
|---|---|---|---|
| 0 | `#dd-world` | WebGL2 canvas at **native DPR** (§8.5) | the scene, the post chain, and the native-resolution overlay pass: SDF numbers, combo, world stamps, SDF titles, sunbursts, focus dim |
| 1 | `.dd-hud` | DOM | top bar, chip, ruler, bubbles, dock, tabs |
| 2 | `.dd-sheets` | DOM | bottom sheets and their scrim |
| 3 | `.dd-ceremony` | DOM | ceremony plates and labels, reveal cards, the offline plate. The accessible text of WebGL titles lives here, sr-only |
| 4 | `.dd-toasts` | DOM | Feat toasts, one at a time |
| 5 | `#dd-fx` | Canvas 2D at native DPR, `pointer-events: none` | coin and gem flights with trails, arrival sparkles, purchase sparks and rings, confetti |
| 6 | `.dd-guide` | DOM | the tutorial focus scrim (an evenodd clip-path hole, static) and the ghost hand |
| 7 | `.dd-crash`, `.dd-gl-notice` | DOM (existing) | system panels |

Tokens fly **above** the HUD (z 5), so a coin lands **on** the counter socket rather than vanishing under the plate.
Ceremony dimming is done in the composite shader (`uDim`), not by a DOM scrim, so a chest drawn in WebGL is not hidden by
its own dimming.

### 8.4 Component specs

**Quick card (116 × 72):**
- octagon plate, `--cut` 8;
- icon 36 px at (8, 8);
- name 13 px, bold, bone100;
- level "Lv 23" in Lintel 12 px;
- milestone pips (10 × 4 px, gap 2) at the bottom;
- cost 15 px: amber300 when affordable, bone500 when not;
- fill bar 3 px at the base;
- BEST badge: a 38 × 16 octagon chip at the top right, amber400 on-amber text 12 px.

The card's states are specified in §9.9.

**Counters** (gold, gems, depth, rank) use the odometer in §9.8. Each has a **socket**, the exact point the flights aim
for, recomputed on resize with `getBoundingClientRect` once (never per frame).

**Sheets:** a bottom sheet 72 % of the height, with a drag handle 36 × 4. Lists are virtualized past 30 rows.

### 8.5 Crisp-HD rules (M9)

1. **Two resolutions.** The scene renders into its target at a dynamic scale `s` of native: Balanced 0.60–0.75, High
   0.80–1.00, Battery 0.45–0.55. The **composite writes the canvas at native DPR** (capped at 3). It upsamples with a
   5-tap Catmull-Rom (5 bilinear fetches) plus CAS at 0.2. Then the **overlay pass** draws the SDF text, sunbursts and
   world stamps at native resolution. So the world is filtered, while every edge the eye tracks (numbers, titles, rays)
   is pixel-exact. The browser no longer stretches a low-resolution canvas.
2. **Text.** DOM text uses the runtime Lintel TrueType (`lintelFont.ts`), which is vector at any DPR. WebGL text uses an
   **SDF atlas built from the same convex parts** as the face (§9.8). There is never a bitmap font, and never
   `fillText` on a transformed canvas.
3. **Pixel-art specimens** stay pixel art at an **integer texel scale**. For a 16-texel sprite meant to be shown at
   `c` CSS px, the device size is `n = round(c·dpr/16)·16` and the CSS size is `n/dpr`. For example, 28 px at
   DPR 2.625 gives 80 device px (5 px per texel) and 30.48 CSS px. Today's `iconPx(28)` gives 74 px, with 4- and
   5-px texels mixed.
4. **UI icons** (tabs, gear, lock, chevrons, upgrade icons) are inline SVG, drawn as strokes on the Lintel 4 × 7
   lattice with `polygonsPath()` from `strokeFont.ts`. Their stroke is 1 unit, the same as the face.
5. **Animated scale.** A scale animation runs as a declarative WAAPI or CSS keyframe animation. Chromium then rasterizes
   at the animation's maximum scale, so the peak frame is sharp. JS never writes a per-frame `scale()` above 1 on text or
   icons, and `will-change: transform` is never set on an element that scales above 1 (it freezes the raster scale). At
   rest, translations snap to `1/dpr` px.
6. **No CSS blur or `filter`** in play (the brand rule, and a cost on Mali).
7. **The FX canvas** sets `width = cssW·dpr` and `height = cssH·dpr` (dpr capped at 3) and draws sprites pre-rendered
   at device size. Its atlas is rebuilt whenever `devicePixelRatio` changes.

---

## 9. Juice and feel

### 9.1 Easing catalogue (`ui/brand/motion.ts` `EASE`, mirrored in `core/ease.ts` for canvas and WebGL)

`core/ease.ts` evaluates `cubic-bezier` by Newton-Raphson (4 iterations, bisection fallback) and matches the browser
to within 1e-3, so DOM, FX canvas and shader timelines agree.

| Token | cubic-bezier | Use |
|---|---|---|
| `enter` (kept) | 0.2, 0.7, 0.2, 1 | panels and text entering (calm register) |
| `exit` (kept) | 0.4, 0, 1, 1 | exits |
| `standard` (kept) | 0.4, 0, 0.2, 1 | state changes |
| `outQuad` | 0.5, 1, 0.89, 1 | presses |
| `outCubic` | 0.33, 1, 0.68, 1 | number rise, digit roll, follow-through |
| `outQuart` | 0.25, 1, 0.5, 1 | count-ups (in log space) |
| `outQuint` | 0.22, 1, 0.36, 1 | title rise, sheet content |
| `outExpo` | 0.16, 1, 0.3, 1 | beams, shock radius, rays onset |
| `outBack` | 0.34, 1.56, 0.64, 1 | lids, flips landing, small stamps |
| `inQuad` | 0.11, 0, 0.5, 0 | token acceleration into a socket |
| `inCubic` | 0.32, 0, 0.67, 0 | exits upward, falls |
| `inBack` | 0.36, 0, 0.66, −0.56 | anticipation pull-backs |
| `inOutCubic` | 0.65, 0, 0.35, 1 | dollies, dims, irises, ghost hand |
| `inOutSine` | 0.37, 0, 0.63, 1 | breathing loops |

### 9.2 Springs (`core/spring.ts`: closed-form damped oscillator; WAAPI keyframes sampled at 60 Hz)

Chromium 88 has no `linear()` easing (it arrived in 113). `springKeyframes(name, from, to)` therefore samples the
closed-form step response at 60 Hz into keyframes, which WAAPI interpolates linearly. Each sample set is cached by spring
name, and its offsets are fractions of the settle time. In JS, `Spring1`/`Spring2` integrate the same oscillator
analytically per frame (camera, tokens, SDF numbers), with no per-frame allocation.

| Token | ω (rad/s) | ζ | Overshoot | Peak at | 2 % settle | Frames | Use |
|---|---|---|---|---|---|---|---|
| `snap` | 30 | 0.55 | 12.3 % | 124 ms | 192 ms | 13 | button release, ready ping, stamps, chip and plate drops |
| `bounce` | 22 | 0.35 | 30.8 % | 151 ms | 496 ms | 31 | chest landing, reward icons, the Collect button |
| `jelly` | 34 | 0.28 | 39.8 % | 95 ms | 403 ms | 26 | counter catch, number pop (0.6 → 1.155 → 1) |
| `soft` | 16 | 0.85 | 0.6 % | 377 ms | 263 ms | 17 | sheets and panels (no visible overshoot) |
| `kick` | 40 | 0.45 | 20.2 % | 87 ms | 205 ms | 14 | camera tap kick: an impulse peaks at 0.0139 · v0 at 31 ms |
| `follow` | 9 | 0.70 | 4.5 % | 488 ms | 661 ms | 41 | camera row follow |
| `heavy` | 12 | 0.50 | 16.2 % | 301 ms | 669 ms | 42 | the tool's return to the hand, big props |

Sampled keyframes (60 Hz) used verbatim:
- `snap`, 0 → 1: 0, .114, .337, .601, .828, .983, 1.081, 1.12, 1.119, 1.096, 1.064, 1.035, 1.01, .995 (then 1).
- `jelly`, 0.6 → 1: .600, .662, .802, .958, 1.082, 1.149, 1.155, 1.117, 1.056, .997, .955, .937, .942, .962, .987,
  1.008, 1.022, 1.025, 1.021, 1.012, 1.002, .994, .990, .990, .993 (then 1).

**Interruption.** A spring that is retriggered keeps its current value and velocity (JS springs), or starts its new
keyframes from the current sampled value (WAAPI, read from the JS-side clock, never from `getComputedStyle`).

### 9.3 Squash and stretch

The rule is volume-preserving: `sy = s`, `sx = 1/√s` (and `sz = 1/√s` in 3D). One animated channel per element:
position on an outer wrapper, squash on an inner one, never `composite: 'add'`.

| Object | Moment | s (y) | Duration and curve |
|---|---|---|---|
| Coin token | flight | stretch along the velocity: s = 1 + min(0.35, |v| / 2,400 px/s) | per frame |
| Coin token | landing in the socket | s 0.7 → 1 | 120 ms outQuad, while it shrinks into the socket |
| Counter socket | catch | sx 1.22, sy 0.82 → 1 | jelly (403 ms). Retriggers ≥ 70 ms apart; faster landings charge the next bump (max 1.35) |
| Chest | anticipation / jump / land | 0.86 (80 ms outQuad) → 1.12 in the air → 0.82 on landing → 1 | bounce spring after landing |
| Tool head | impact | 0.88 along the swing for 50 ms → 1 | outCubic |
| Digger | rope landing | 0.75 → 1 | bounce |
| Buttons and cards | press | uniform 0.94 (no squash: text must stay round) | 70 ms outQuad |
| Damage number, crit | spawn | 1.2 vertical stretch for 60 ms, then the jelly pop | — |
| Stamps ("★ ×2", "NEW") | land | 1.8 → 1 with −8° → 0° rotation | snap |

### 9.4 The master cue table (`config/juice.ts`, played by `game/fx/JuiceDirector.ts`)

Particle counts are Balanced; High ×1.6, Battery ×0.4. G = GPU particles (dust / sparks / glints), Sh = shards. Local
flashes are ≤ 80 × 80 px. "Full" flashes are full-screen and limited by §9.22.

| Event | Tier | Hit-stop | Trauma | Kick | Flash | Bloom + (ms) | Shock | Chroma | Rays | G | Sh | Number | Sound | Haptic (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tap, no break | T1 | — | — | 2 px | local 0.6, 60 ms | — | — | — | — | 4/2/0 | — | 18 px bone100 | material hit ±6 % pitch | 10 (≥ 60 ms apart) |
| Crit | T2 | 30 ms ³ | 0.25 | 4 px | local 0.9 amber, 90 ms | +0.15 (100) | — | — | — | 4/10/4 | 2 | ×1.35 size, amber300, "!" | crit crack | 14 |
| Cell break (rock) | T2 | — | 0.18 | — | — | — | world ring 7 m/s, 0.45 s | — | — | 16/6/0 | 8 | loot tokens | break + 1 tick | 18 |
| Ore / rich break | T2 | 30 ms ³ | 0.20 | — | local 0.5 accent | +0.2 (120) | world ring | — | — | 16/8/10 | 10 | tokens; gold number | chime (pitch from value) | 22 |
| Gem / geode break | T2 | 40 ms ³ | 0.22 | — | local 0.7 rune200 | +0.25 (150) | world ring | — | 0.2, 250 ms | 16/8/18 | 10 | gem in rune200 | crystal chime | 24 |
| Pierce chain (each cell) | E2 | — | +0.04 | — | — | — | — | — | — | 6/4/0 | 6 | "×N" chain counter | +2 semitones per cell | 10 |
| Column burst | E3 | 30 ms ³ | 0.30 | 4 px | pillar HDR ×4, 180 ms | +0.2 (150) | screen 0.004 | — | — | 24/16/6 | per cell | big number | low boom | 26 |
| Row wipe | E4 | 50 ms | 0.40 | — | — | +0.3 (200) | screen 0.007 | 0.003 | — | 48/24/0 | per cell (governed) | row total | boom + rattle | 30 |
| Row clear | T2 | — | 0.12 | — | — | — | — | — | — | dust skirt 32 | — | "+1 m" on the ruler | thunk | 16 |
| Leftover crumble | T2 | — | — | — | — | — | — | — | — | 8 per cell | — (sink and dissolve) | tokens | crumble | — |
| Combo tier 10/25/50/100 | T3 | — | 0.15 | — | — | +0.1 (200) | — | — | — | ring + 24 glints | — | combo stamp | rising chime (a step per tier) | 12 |
| Combo lost (≥ 10) | T1 | — | — | — | — | — | — | — | — | — | — | counter dissolves | soft fizz | — |
| Lantern Surge start | T3 | 60 ms | 0.35 | — | full 0.12 amber | +0.2 (sustained) | screen 0.006 | 0.004 | 0.3, 600 ms | 60 embers | — | "SURGE ×3" stamp | gong + drum layer | 30 |
| Lantern Bomb | T3 | 60 ms | 0.45 | — | local 0.4, r 200 px | +0.3 (150) | screen 0.010 | 0.004 | — | 40/80/0 + 24 embers | per cell (governed) | blast total | boom | 35 |
| Chest landing | T2 | — | 0.15 | — | — | — | — | — | — | 12 dust | — | — | wooden thud | 16 |
| Chest escalation step | T3 | 40 ms | 0.10 · step | — | seam light | +0.1 | — | — | 0.25 · step, 400 ms | ring + 12 glints (tier colour) | — | — | +4 semitones per step | 12 · step |
| Chest open (by rarity) | T3–T4 | 0/40/60/80/120 ms | 0.10–0.55 | — | full 0/0/0.12/0.2/0.3 | +0.1–0.5 | — | 0/0/0/0.004/0.006 | 0/0.25/0.45/0.7/1.0 | 30/60/100/160/240 | — | contents | pop → choir | 16/20/28/40/[40,30,60] |
| Creature tap | T2 | 40 ms | 0.12 | — | local 0.5 | +0.1 (100) | — | — | — | 0/12/12 | — | ×N gold | creature chirp | 16 |
| Event caught | T3 | 40 ms | 0.20 | — | local 0.6 gold | +0.2 (200) | world ring | — | 0.3, 400 ms | 0/20/30 | — | reward | bell | [12, 40, 12] |
| Purchase | T2 | — | — | — | — | — | — | — | — | FX: 14 sparks + ring | — | delta chip | ka-ching, +1 semitone per buy in a chain (cap +12) | 10 (≥ 80 ms apart) |
| Card ready ping | T2 | — | — | — | — | — | — | — | — | — | — | — | tink (pitch by card) | 6 |
| ★ milestone | T3 | 50 ms ⁴ | 0.15 | — | local on the rig | +0.2 (200) | — | — | — | FX 24 gold sparks + ring; world 30 glints on the rig | — | "★ ×2" stamp | stinger (a fifth up) | [20, 30, 30] |
| Tool tier | T4 | 80 ms at 0.05 | 0.55 | — | full 0.30 white | +0.4 (400) | screen 0.012 | 0.006 | 0.6, 900 ms | 120 glints + 40 implode | — | name plate | fanfare | [40, 30, 60] |
| Rank-up | T3 | — | 0.10 | — | — | +0.15 (300) | — | — | — | FX 32 confetti | — | "RANK 12" SDF stamp | rank chime | [16, 40, 24] |
| Feat toast | T3 | — | — | — | — | — | — | — | — | FX 24 confetti | — | — | medal chime (tier pitch) | [12, 40, 18] |
| Number milestone (first M, B…) | T4 | 60 ms | 0.30 | — | full 0.15 amber | +0.3 (500) | — | — | 0.5, 700 ms from the counter | FX 48 confetti + coin burst | — | "1 MILLION" SDF stamp | stinger + cash roll | [30, 40, 50] |
| 100 m record | T2 | — | 0.10 | — | — | — | — | — | plaque rays 0.3, 600 ms | 24 glints at the plaque | — | "+100 m" by the depth | bell | 18 |
| Cavern breakthrough | T3 | — | 0.35 on landing | — | — | — | — | — | — | 64 dust | 24 | — | rumble + reveal pad | 30 |
| Biome reveal | T5 | 120 ms | 0.70 (landing) | — | full 0.35 white → 0 in 600 ms | +0.5 (600) | screen 0.014 | 0.006 | 1.0, 1,400 ms from the title | 200 (biome particle) | 40 | SDF title | gate theme | [50, 40, 80] |
| Rekindle | T5 | 160 ms | 0.80 | — | full 0.40 violet, 200 ms ramp | +0.5 (800) | — | — | 0.8, 1,000 ms | 200 embers | — | Embers count | deep bell | [60, 40, 120] |
| Offline feast | T5 | — | — | — | — | — | — | — | — | FX coin fountain 40 | — | count-up | whoosh + cash roll | 30 |
| Plunge (sustained) | E5 | — | 0.20 held | — | — | +0.15 | — | — | — | streaks 300/s | impostor shards | depth odometer spins | wind roar (pitch ∝ speed) | 20 every 1 s |

³ Hit-stop on T2 events only when the 1 s EMA of breaks is below 3/s, when not holding or in a Surge, and when the last
hit-stop ended at least 300 ms ago. ⁴ Inside a hold-to-buy chain, ★ ceremonies merge into the last one.

### 9.5 Tap and break, frame by frame (60 Hz; F0 is the first frame after `pointerdown`)

| Frame (ms) | Tap without a break (E0) | Tap that breaks (E1) |
|---|---|---|
| F0 (0) | The tap is drained from the queue and resolved. Cell flash +0.6 (`uCellFx`), crack stage set, front face pop starts (+0.06 m). The strike ghost appears at the impact pose, with its smear at 0.7 alpha. Damage number spawned at scale 0.6. Kick impulse 2.9 m/s. Sound and haptic issued now | The same, plus: voxels set to air (the mesh arrives at F1 from the workers); **8 shards spawn filling the cell's front metre** (so the hole never shows a 1-frame gap); dust 16, sparks 6; world shock ring t = 0; loot pops start in 3D |
| F1 (17) | Number 0.80 → (jelly). Pop +0.08 m (peak). Flash 0.35 | The remesh lands. Shards fly at 2.5–4.5 m/s from the tap point, spin 4–9 rad/s |
| F2 (33) | Audio output arrives (typical). Number 1.082. Kick peak 2 px (31 ms) | Shock ring radius 0.23 m |
| F4 (67) | Pop back to 0.02 m, flash 0. Smear gone (90 ms) | — |
| F6 (100) | Number at peak 1.155. Follow-through ends at 120 ms | — |
| F19 (320) | Number rise phase: +46 px over 620 ms, outCubic | 3D loot pops reach the top of their arc and hand off to the FX canvas (§9.7) |
| F27 (450) | — | Shock ring ends (3.15 m). Shards begin to land and bounce (restitution 0.25) |
| F37–F49 (620–820) | Number fades over its last 200 ms | First coins land on the socket (counter catch, digit roll) |
| F48–F60 (800–1,000) | — | Shards dissolve over their last 250 ms (ember rim) |

**Accumulating numbers.** While hits keep landing on the same column within 350 ms, the existing number adds the new
damage instead of spawning another one. It bumps (jelly 1 → 1.18) and its life extends by 200 ms, up to 1.6 s. At
8 taps/s this keeps the screen at ≤ 7 numbers, and the sum climbs like a score.

### 9.6 Shatter and dissolve (`render/fx/Shards.ts`, `render/fx/fracture.ts`)

- **Fracture.** At boot, a unit box is split into convex pieces by 3 BSP levels of random planes. Each plane passes
  within 0.2 m of its piece's centroid, with its normal drawn uniformly. This gives 9–12 shards per variant, 3 variants
  (deterministic seed). A unit test checks that the shard volumes sum to 1 ± 1e-6 and that every shard is convex.
- **Material.** `shardMaterial` uses the terrain's material-layer array and lighting (`LIGHTING_GLSL`). A shard is mapped
  in the **spawn-time world space** of its cell (its local position + the cell origin, at the same 1/8 m⁻¹ period), so
  it shows exactly the texture its cell had. Its emissive `aHeat` starts at the break flash and decays as e^(−t/40 ms).
- **Physics.** CPU, Balanced cap 192 shards live (High 320, Battery 72). The ballistics and voxel collision come from
  today's `Debris.ts`: gravity 9.8 m/s², restitution 0.25, friction 0.6. One InstancedMesh per variant, 3 draws.
- **Dissolve.** Over the last 250 ms of life, `discard` where `noise(local·6) < t` (t 0 → 1.05), with an ember rim
  `#ff8a3a × 3.0` in a 0.06 band above the threshold. This is the only `discard` in play. Shards cover ≤ 2 % of the
  pixels, so the terrain's early-Z rule (no discard in the opaque pass) stands.
- **Variations.** Leftover crumble cells sink 0.15 m and dissolve into dust over 300 ms, staggered 40 ms outward from the
  last broken cell. Ore cells add 4 glowing crystal shards (additive). The Plunge uses impostor shards (§9.18).

### 9.7 Loot flight with trails (`game/effects/LootPop.ts` 3D → `ui/fx/FxCanvas.ts` 2D)

| Phase | Time | Motion |
|---|---|---|
| Pop (3D, lit, rim emissive) | 0–320 ms | velocity (±1.5, 4.5, −2.0 toward the camera) m/s, spin 6 rad/s, scale 0 → 1 on the bounce spring |
| Hand-off | 320 ms | The token's screen position is projected. The 3D mesh hides and an FX-canvas sprite (the same icon at device size) takes over at the same pixel, with the same scale and velocity |
| Flight | 420 + 40 × i ms (i = index in its burst, ≤ 6) | A quadratic Bézier from P0 to the socket P1. The control point is P0 + (±120, −160) px, alternating sides. Progress u = t^2.2 (an "inQuad-plus" pull), stretched along the velocity (§9.3) |
| Trail | during the flight | Coins: 6 ghost copies at 16 ms spacing, alpha 0.45 → 0.05, scale 0.9 → 0.4, `lighter` blending in the tier colour. Gems: a 4-point star every 40 ms that hangs for 300 ms and fades |
| Arrival | last 120 ms | The token shrinks 1 → 0.7 into the socket. Socket catch (jelly). 4–6 sparkles burst at the socket. One tick sound, pitched +1 semitone per landing within 600 ms (cap +12). **The counter credits this token's share now** |

- **Tokens per break** = clamp(1 + floor(log2(2 · value / medianValue)), 1, 6), where the median is over the last 30
  breaks.
- **Bundling.** If more than 12 tokens would launch within 1 s, the new ones merge into bundles: a coin stack drawn at
  scale 1 + 0.15 · log2(n), with a "×n" digit sprite.
- **Caps.** At most 24 tokens in flight. Beyond that the stream turns into a **coin river**: 30 sprites/s along one
  jittered Bézier ribbon, used by the Plunge and the offline feast.
- **The display ledger** (`ui/fx/displayLedger.ts`, pure). `shown = actual − inFlight`. Purchases check `actual`. A card
  turns affordable when **`shown`** passes its cost, so the "ready" ping happens the moment a coin lands.
- **Reduced motion:** a straight line over 300 ms (outCubic), no trail, no stretch.

### 9.8 Numbers: SDF damage numbers and rolling counters

**SDF atlas (`render/fx/sdfAtlas.ts`, pure, unit-tested).**
- **The shapes.** Every Lintel glyph is a union of convex polygons: a rectangle per stroke and an octagon per node
  (`strokeFont.ts`). For each texel, `sd = min over parts of (max over each part's edges of the signed distance to that
  edge's line)`. The half-plane form gives **mitred** offsets, so outlines and glows keep the face's 45° chamfers.
- **Resolution.** 6 texels per lattice unit, a 42 px cap height, and a spread of ±2 units.
- **Layout.** Glyph cells of (width + 3) × 10 units, holding 0–9, A–Z (titles), a–z (suffixes), `. , + − × ! ? / : ★ m`.
  That is 74 glyphs in a **1024 × 256 R8** atlas (256 KB).
- **Build.** ≈ 40 ms in a worker at boot; the digits and suffix glyphs are built first (12 ms).
- **The test.** The sign at each texel centre matches the polygon coverage of `lintelGlyph()`, and every glyph's
  advance matches the TrueType hmtx.

**SDF shader (overlay pass, premultiplied output):**

```glsl
float sd   = (0.5 - texture(uSdf, vUv).r) * 4.0;          // units; < 0 inside (SPREAD 2)
float aa   = fwidth(sd) * 0.7;
float fill = 1.0 - smoothstep(-aa, aa, sd);
float edge = 1.0 - smoothstep(0.45 - aa, 0.45 + aa, sd);  // carve outline 0.45 unit, #04070b
float glow = exp(-max(sd - 0.45, 0.0) * 2.2) * vGlow.a;   // crits: amber300 at 0.35
vec3  rgb  = mix(vOutline.rgb, vFill.rgb, fill) * edge + vGlow.rgb * glow * (1.0 - edge);
fragColor  = vec4(rgb, max(edge, glow)) * vAlpha;
```

**Damage number style.**
- **Size:** cap height 18 px × (1 + 0.22 · clamp(log10(damage / biomeMedian), 0, 5)), so 18–38 px. Crits ×1.35, with a
  48 px ceiling.
- **Colour:** bone100 normal, amber300 crit, rune200 gem, deep300 relic, a prismatic hue cycle for mythic.
- **Pool:** 48 numbers × 8 glyphs, one instanced draw. Each number lies on the cut plane (z −0.1), projected each frame.

**Rolling counters (`ui/fx/Ticker.ts`, DOM).**
1. **Approach.** The value approaches its target in log space: `logD += (logT − logD)·(1 − e^(−dt/τ))`, with τ 90 ms
   for gains (95 % in 270 ms) and τ 60 ms for spending (no sound, no bump).
2. **Scripted count.** For a jump of more than ×1,000 (chests, the offline feast, the spree), the counter plays a count
   over `clamp(500 + 220·log10(T/D), 500, 2000)` ms on outQuart in log space. Ticks follow the digits at ≤ 24/s.
3. **The DOM is touched only when the string changes.** `format()` gives 3 significant digits with tabular Lintel digits.
4. **Digit roll.** Every digit is a strip of 0–9 inside a 1 em mask. On a change the strip translates by −digit em over
   90 ms on outCubic, driven by JS `transform` writes on ≤ 6 strips per counter while rolling. A strip retriggered
   mid-roll continues from its current offset, which is kept in JS.
5. **Suffix change** (999K → 1.00M). The plate flips (rotateX 0 → 90° in 90 ms inQuad, swap, −90° → 0° in 160 ms
   outBack). The new suffix stamps (scale 1.6 → 1, snap), and the counter's **tier colour** changes: K bone, M amber,
   B ember, T rune cyan, Qa violet, Qi and above prismatic, aa and above prismatic with a shine sweep every 3 s. The first
   time ever, the change becomes the T4 number milestone.
6. **Rate line** ("+45.6K/s"): updated 4 times a second with a 120 ms crossfade, so it does not flicker.

### 9.9 Buttons and cards: the state machine (`ui/fx/press.ts`)

| State | Visual | Motion | Sound and haptic |
|---|---|---|---|
| Idle, not affordable | slate fill, bone500 cost, the fill bar at gold/cost | the bar moves with each coin landing (scaleX, 120 ms outCubic) | — |
| Near (≥ 85 %, BEST only) | the bar brightens to amber400 | a glow pseudo-element breathes, opacity 0.35 ↔ 0.8 at 1.2 Hz (inOutSine) | — |
| Became affordable | rim brass500 → amber400, cost amber300 | **ready ping:** snap scale 1 → 1.04 → 1 (192 ms) + a rim flash (pseudo opacity 0 → 1 → 0, 300 ms) | tink, pitch by card (C, E, G), 6 ms. At most 1 ping per card per 3 s, and 1 per 400 ms in total |
| BEST | an octagon "BEST" chip | breathing glow 0.25 ↔ 0.6 at 0.5 Hz, and a **shine sweep** every 2.6 s: a skewed 24 px gradient bar, translateX −120 % → 220 % in 520 ms outCubic, clipped by the plate | — |
| Pressed (`pointerdown`) | face overlay 0.12 darker | scale 0.94 and translateY 2 px, 70 ms outQuad | — |
| Released, bought | — | scale 0.94 → 1 on the snap keyframes (peak 1.007), the level digits roll, a pip pops (0 → 1.3 → 1, 200 ms) | ka-ching + chain pitch, 10 ms |
| Released, cannot afford | the cost flashes danger400 for 300 ms | a "no" shake: translateX 0, −6, 6, −4, 4, −2, 0 px over 280 ms | low buzz 14 ms |
| Held (≥ 380 ms) | — | repeat buys at 8/s, rising to 16/s after 1.5 s. Each repeat is a mini-press (0.97 → 1, 60 ms) | pitch +1 semitone per buy (cap +12), haptic 6 ms ≥ 80 ms apart |
| Disabled (locked) | a lock stroke icon, 50 % opacity | — | — |

**Loop limit.** At most 3 infinite animations run at once: the BEST breathing, the BEST shine and one near-glow. The
brand's rule of one loop is relaxed to three, all on the single most important target.

### 9.10 Purchase burst, ★ milestone and the tool-tier ceremony

**Purchase burst (T2, 450 ms):**
- the press release (§9.9);
- FX canvas: 14 brass sparks from the card centre, speed 180–420 px/s, drag 4/s, gravity 600 px/s², life 300–450 ms;
- a ring sprite from 0.6 to 1.8 × the card width, alpha 0.7 → 0, stroke 3 → 1 px, 320 ms outCubic;
- a DOM delta chip "+12 %" that rises 18 px over 500 ms and fades over its last 150 ms;
- **in the world, in the same frame**: the Pick upgrade pumps the strike ghost (squash 1.18/0.85 → 1, 220 ms), a crew
  level makes that rig cheer, and gear flares the lantern (+0.3 bloom, 300 ms).

**★ milestone (T3, 1,000 ms):**

| t (ms) | Layer | What |
|---|---|---|
| 0 | DOM | The 10th pip pops. The card flashes gold (pseudo opacity 0 → 0.9 → 0 over 300 ms) |
| 0 | WebGL | Hit-stop 50 ms. The line's rigs flash gold (`uFlash` 0.8 → 0 in 250 ms), and 30 glints rise from them |
| 60 | DOM | "★" stamps on the card: scale 1.8 → 1 and rotate −8° → 0° (snap), then "×2" pops beside it (jelly) |
| 60 | FX | 24 gold sparks + a ring from the star |
| 120 | WebGL | An SDF "×2" stamp 28 px over the rigs, which rises 24 px and fades in 700 ms |
| 0–1,000 | Audio | a stinger a fifth above the last purchase pitch |

**Tool-tier ceremony (T4, 1,600 ms; a tap from 400 ms jumps to 1,300 ms):**

| t (ms) | Layer | What | Curve |
|---|---|---|---|
| 0 | WebGL | Hit-stop 80 ms at time scale 0.05. `uDim` 0 → 0.55 over 160 ms. The HUD fades to 0.35 opacity, except the Pick card | inOutCubic |
| 0–400 | WebGL | The strike ghost rises to the screen centre (y 42 %), scale 1 → 1.4, one full spin | soft spring; spin outCubic |
| 400–700 | WebGL | **Charge:** a ±3° shake at 18 Hz, emissive 0 → 3 HDR, 40 sparks implode toward the head (inward velocity 6 m/s) | inQuad |
| 700 | All | **Snap:** full flash 0.30 (1 frame up, 120 ms decay), screen shock (radius 0 → 0.7 of the height over 450 ms, outExpo), chroma 0.006 → 0 in 200 ms, trauma +0.55, haptic [40, 30, 60]. The new model replaces the old one at scale 1.6 → 1 (bounce) | — |
| 700–1,600 | WebGL | Rays from the tool, 0.6 → 0 over 900 ms. 120 glints | outCubic |
| 900 | DOM | The name plate "IRON PICK" (Lintel 28 px) + "Tap damage ×2.5" (15 px): rises 12 px with a fade, 240 ms. The letters stamp in 28 ms apart (scale 1.4 → 1, opacity 0 → 1, 120 ms each) | outQuint |
| 1,300 | WebGL | The tool returns to the strike pose (heavy spring). `uDim` → 0 over 300 ms. The HUD returns over 240 ms | inOutCubic |

### 9.11 Level-ups and milestones

**Rank-up (T3, 1,400 ms; it never blocks):**
1. 0 ms: the XP bar finishes at 1.0 (120 ms) and flashes (opacity pulse 200 ms). The badge's rank number rolls.
2. 120 ms: the badge pops (jelly 1 → 1.25). 32 confetti burst from the badge (FX): brass, amber and rune pieces 6 × 10
   px, gravity 900 px/s², a flutter of scaleX = cos(12 t) and spin 6–14 rad/s, life 900 ms.
3. 200 ms: an SDF "RANK 12" stamp 34 px at y 30 % of the world window: scale 1.6 → 1 (snap), held 600 ms, then rises
   20 px with a fade over 300 ms.
4. 400 ms: the reward chip ("+6 ◆") flies to the gem socket.
5. 1,000 ms: the XP bar empties to the carry-over (240 ms outCubic).

**Depth record every 100 m (T2):** the ruler notch flashes, "+100 m" pops by the depth plate (jelly), and a brass plaque on
the shaft wall lights with rays (0.3, 600 ms) and 24 glints.

**Number milestone (T4, 2,000 ms):** the counter flips to its new tier colour; rays from the counter (0.5, 700 ms); an
SDF stamp "1 MILLION" 44 px at the world-window centre (snap from 2.0); 48 confetti; a 30-coin burst from the stamp into
the counter. The first K, M, B, T and Qa each also grant a Fortune Feat tier.

**Combo tiers (T3):** at 10, 25, 50 and 100 the combo counter (SDF 22 px, world layer at y 630) changes colour (bone →
amber → cyan → violet → prismatic) and emits a ring plus 24 glints. Its idle shake amplitude grows with the tier (0, 0.5,
1, 1.5, 2 px at 14 Hz). A lost combo of 10 or more dissolves in 200 ms (SDF threshold −1.5) with a soft fizz.

**Lantern Surge (T3 start, sustained 10 s):**
- the lantern blazes (radius ×1.6, exposure +0.15, bloom +0.2);
- the screen edges glow amber (vignette tint #ffb35c at 0.12);
- 60 embers swirl around the lantern;
- the music's drum layer enters on the next bar;
- the meter drains in a 10 s linear arc;
- the end: the glow fades over 400 ms and the drum layer leaves on the next bar.

### 9.12 Chest opening and the rarity reveal

The chest cell breaks (3 × HP). The chest pops out of the wall toward the camera to z −2 m, lands on the floor ledge
(squash 0.82 → bounce, two bounces of 0.25 m and 0.08 m) and rests with a T0 seam glow in **common** colour. It opens
on a tap, or by itself after 1.5 s.

**Escalation step (450 ms each, repeated for each tier above common):**

| t within a step (ms) | What | Curve |
|---|---|---|
| 0–80 | anticipation squash (y 0.86, x 1.08) | outQuad |
| 80–240 | jump 0.35 m with a ±6° tilt | outQuad |
| 240–320 | fall | inQuad |
| 320 | landing: squash 0.84, then the bounce spring. **The seam light switches to the next tier's colour**, with a ring burst and 12 glints in that colour, rays 0.25 × step for 400 ms, a sound a major third higher, and a haptic tick of 12 × step ms | — |

**Open (after the last step):**

| t after the open (ms) | Layer | What |
|---|---|---|
| 0 | WebGL | Hit-stop (0–120 ms by rarity). The lid hinges 0 → −115° in 180 ms (outBack). A beam cone (additive, rarity colour × 4 HDR) scales its height 0 → 6 m in 120 ms (outExpo). The full flash by rarity |
| 60 | WebGL | Rays (0–1.0 by rarity) from the chest. `uDim` 0.35 for rare and above |
| 100 | 3D → FX | Contents spray up as icons (bounce pops) and fly to their sockets (§9.7): gold to the gold counter, gems to the gem counter, specimens to the Codex tab |
| 600 (rare+) | DOM + WebGL | **Reveal card** for the best item, 160 × 220. It rotates on Y from 180° (back) to 0° (front) in 360 ms (outCubic), with a sunburst behind it (WebGL overlay: 12 rays turning 12.6°/s, 520 px, rarity colour). "NEW" stamps if first found (snap from 1.8, −8°) |
| total length by rarity | — | 900 / 1,350 / 1,800 / 2,400 / 3,200 ms, including the escalation steps |

**Skip.** A tap after 400 ms jumps to the open's end state: the card shows, and the rewards fly at 2× speed in 350 ms.

### 9.13 Feat toast (T3, 3,000 ms)

| t (ms) | What | Curve |
|---|---|---|
| 0 | The plate (300 × 64, octagon, tier-coloured rim) slides from y −90 to the safe top + 8 | snap spring |
| 120 | The medal (SVG octagon in the tier colour, with the family's stroke glyph) stamps: scale 0 → 1.25 → 1 | bounce |
| 120 | 24 confetti from the medal (FX canvas, above the toast) | — |
| 180 | "FEAT · DEEPER STILL III" (12 px eyebrow, brass300) and the name (15 px bone100) fade and rise 6 px | outQuint, 240 ms |
| 300 | A shine sweep across the plate (520 ms) | outCubic |
| 450 | The reward chip "+1 % all · +15 ◆" pops (jelly). The ◆ flies to the gem socket | — |
| 2,600 | The plate exits upward (translateY −90, 200 ms) | inCubic |

- **Queue.** 700 ms between toasts. With more than 3 waiting, they collapse into one "+N Feats" toast.
- **Exclusivity.** Toasts never show during a T4 or T5 (§0.3).
- **Tap.** A tap opens the Feats sheet on that family.

### 9.14 Biome reveal: the title card and the vista (T5, 3,600 ms; digging resumes at 1,200 ms)

| t (ms) | Layer | What | Curve |
|---|---|---|---|
| 0 | All | The seal row breaks: hit-stop 120 ms (scale 0). Full flash 0.35 white, decaying over 600 ms. Screen shock 0.014. 40 shards | — |
| 120–600 | Camera | **Dive:** the floor gives way and the camera falls 6–14 m, easing in to 30 m/s, with streaks (300/s) and the plunge blur (§9.18) | inQuad |
| 600 | Camera | **Landing:** a 0.18 m overshoot on the follow spring, trauma 0.70, a dust skirt of 64, haptic [50, 40, 80] | — |
| 700–1,900 | Camera + look | Vista dolly D 12.6 → 24 m (inOutCubic). The biome look (atmosphere, LUT pair, bloom) crossfades over 1,600 ms | inOutCubic |
| 900 | WebGL HDR | **Title, carved in light.** "CRYSTAL GROTTO" is drawn in SDF into the **scene target** at emissive 3.0, so it blooms. Each letter **grows from its stroke centreline outward**: the SDF threshold sweeps −1.5 → 0 units over 220 ms, outCubic, 40 ms stagger. Lintel cap height 40 px, centred at y 36 % of the window. 200 biome particles rise from the letters | outCubic |
| 900–2,300 | Post | Rays from the title's centre: strength 1.0 → 0 over 1,400 ms, decay 0.93 | outCubic |
| 1,400 | DOM | Subtitle (15 px): "Depth 75 m · Biome 3". The depth digits roll. The sr-only live region announces the biome name | outQuint, 240 ms |
| 2,600–3,100 | WebGL | The title dissolves into glints: the threshold goes 0 → −1.5 with noise (500 ms), and 120 glints drift upward | inCubic |
| 1,900–2,800 | Camera | Dolly back to D 12.6 m (900 ms, inOutCubic) | — |
| 3,100 | DOM | The Biome Lantern card rises into the dock (snap), and the new crew line's card pings | — |

**Reduced motion:** a 300 ms crossfade to the vista framing, the title as a 240 ms fade, no dive, no shock, a 0.15 flash.

### 9.15 Screen transitions

| Transition | Out | In | Layer | Reduced |
|---|---|---|---|---|
| Sheet open (Upgrades, Crew, Feats, Codex, Lantern) | — | translateY 100 % → 0 on the soft spring (263 ms). Scrim opacity 0 → 0.45 (240 ms). Rows stagger 24 ms (≤ 8 rows) with an 8 px rise and fade | DOM | fade 150 ms |
| Sheet close (or swipe down past 30 % / 0.5 px/ms) | translateY → 100 %, 200 ms inCubic. Scrim 160 ms | — | DOM | fade 120 ms |
| Tab switch inside a sheet | content translateX 0 → ∓24 px, opacity → 0, 120 ms inQuad | ±24 → 0, opacity → 1, 180 ms outCubic | DOM | crossfade 120 ms |
| Modal plate (offline, reveal card) | scale 1 → 0.96 + fade, 140 ms | translateY −40 → 0 and scale 0.9 → 1 (snap) | DOM | fade 150 ms |
| Menu → game | — | the lantern-O of the wordmark scales 1 → 8 and fades (900 ms, inOutCubic) while the post exposure flares +0.4 from the same screen point; the shaft's lantern sits exactly there | DOM + post | fade 150 ms |
| Biome gate | — | §9.14 | camera + post | crossfade 300 ms |
| **Rekindle** (T5, 4,000 ms) | 0–600 ms: the lantern flares, embers stream from the depth plate to the Lantern tab. 600–1,500 ms: an **octagon iris** closes on the lantern (radius 1.2 → 0, inOutCubic) with a brass rim glow. Black hold 300 ms: the world rebuilds | 1,800–2,600 ms: the iris opens at the surface from the shaft mouth (0 → 1.2, outCubic). 2,600–4,000 ms: the Embers counter counts up (outQuart), then the Dive Start (§9.18) | post (iris), DOM, FX | fade to black 300 ms + fade in 300 ms |
| App resume | — | the world fades from slate-950 over 240 ms, then the offline feast | post | the same |

### 9.16 Shader effects

All post effects are uniforms in the composite or a small extra pass. Each one costs only while active, behind a dynamic
uniform branch (coherent on tile GPUs). Every variant is compiled at load (§10.6).

| Effect | Where | How | Cost while active (Balanced) |
|---|---|---|---|
| Cell flash, pop and cracks | terrain section path | `uCellFx[8]` (cell id, flash, pop, crack stage); the pop moves the hit cell's face vertices along their normal (+0.08 m peak); cracks reuse today's `fracture()`, centred on the tap point | +6 ALU per fragment near hits |
| Shard dissolve | `shardMaterial` | noise threshold + ember rim (§9.6) | ≤ 2 % of pixels |
| Glow pulse | terrain emissive (crystal, rich ore, gem) | emissive × (1 + 0.25 · sin(2π · 0.7 Hz · t + 6.28 · hash)) | 3 ALU |
| Glint sweep | terrain section, valuable cells | a diagonal band 0.18 m wide crosses the cell in 350 ms every 2.6 s, phase from the cell hash, +1.6× albedo | 8 ALU |
| World shock ring | terrain + entity shaders, `uShock[4]` (centre, t0, speed, colour) | lighting += accent · 0.6 · ring(d, 7 m/s · t, 0.5 m) · (1 − t/0.45 s), lit side only | 4 × 10 ALU |
| Screen shock | composite, `uShockS[4]` (centre uv, radius, strength) | the scene and bloom fetch UVs are pushed outward by strength · x · e^(−x²), x = (r − R)/0.045 | 0 extra fetches |
| Chromatic flash | composite, `uChroma` (amount, centre) | R and B fetched at uv ± dir · amount · \|dir\|² · 4 (2 extra fetches); amount ≤ 0.006 | ≈ 0.15 ms native |
| Light rays | extra pass on bloom level 1 (¼ scene resolution) | a radial blur toward `uRayCenter`, 12 taps, decay 0.93, length 0.55, added in the composite × `uRays` | ≈ 0.12 ms |
| Dim and focus | composite, `uDim`, `uFocus` (octagon rect) | c *= mix(1 − dim, 1, octagonMask(uv, focus)) | 6 ALU |
| Iris | composite, `uIris` (centre, radius, rim) | oct = max(\|x\|, \|y\|, (\|x\| + \|y\|) · 0.7071) − r; mask and a brass rim e^(−\|d\| · 160) | 8 ALU |
| Plunge blur | composite, `uPlunge` | 4 scene taps along screen y, length = speed · 8 ms in px | 4 fetches, only while plunging |
| Sunburst | overlay quad | 12 stripes from atan2, rotating 0.035 rev/s, radial falloff, additive | ≤ 0.1 ms |
| Beam cone, pillars, crack lines | `render/fx/Beams.ts` (one additive draw) | cones and ribbons with a scrolling noise, HDR colour × 4 | ≤ 0.2 ms |
| SDF text | overlay (numbers) and scene (titles) | §9.8 | ≤ 0.1 ms |

Screen shock and rays, exactly as written in `PostFX.ts`:

```glsl
vec2 shock(vec2 uv) {                                 // uShockS[i] = (centre.xy, radius, strength), aspect-corrected
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  for (int i = 0; i < 4; i++) {
    vec4 s = uShockS[i];
    if (s.w <= 0.0) continue;
    vec2 d = (uv - s.xy) * asp; float r = max(length(d), 1e-4);
    float x = (r - s.z) / 0.045;
    uv += (d / r) / asp * s.w * x * exp(-x * x);
  }
  return uv;
}
// rays pass (¼ resolution), input = bloom level 1
vec2 stepUv = (vUv - uRayCenter) * (uRayLength / 12.0);
vec3 sum = vec3(0.0); float w = 1.0; vec2 p = vUv;
for (int i = 0; i < 12; i++) { p -= stepUv; sum += texture(tBright, p).rgb * w; w *= uRayDecay; }
fragColor = vec4(sum / 6.0, 1.0);
```

### 9.17 GPU particles (`render/fx/GpuParticles.ts`)

Particles are **stateless**: the vertex shader computes each one's position from its spawn data and the FX clock. The
CPU writes only new spawns (`addUpdateRange` on a ring buffer) and never re-uploads live particles. One instanced quad
(4 vertices) per particle, and **one draw call** for every kind. Quads, not points, because a GPU drops a whole point
once its centre leaves the screen (the existing note in `Halos.ts`).

| Item | Value |
|---|---|
| Ring capacity | 4,096. Live caps: Battery 384, Balanced 1,024, High 2,048 |
| Instance layout (52 B) | `aP0T` vec4 (spawn xyz, t0) · `aV0L` vec4 (v0 xyz, life) · `aSzDG` vec4 (size0, size1, drag, gravity) · `aCK` u8 × 4 (rgb, kind) |
| Motion (exact, with drag k and gravity g) | p = p0 + v0·(1 − e^(−kt))/k + g·(t − (1 − e^(−kt))/k)/k, and v = v0·e^(−kt) + g·(1 − e^(−kt))/k for the streaks; k ≥ 0.05 |
| Death | age < 0 or age > life → `gl_Position = vec4(2, 2, 2, 1)` (clipped: no fill) |
| Life curve | alpha = smoothstep(0, 0.08, u) · (1 − smoothstep(f, 1, u)), with f per kind (dust 0.45, spark 0.6, glint 0.5) |
| Blend | premultiplied `ONE, ONE_MINUS_SRC_ALPHA`. Additive kinds write alpha 0, so alpha-blended and additive kinds share the one draw |
| Hit-stop | particles read `uFxTime`, the FX clock, so a hit-stop freezes them for free |
| Spawn CPU cost | ≤ 0.05 ms for a burst of 200 (typed-array writes plus one range) |

| Kind | Shape | Size | Life | Gravity / drag | Colour over life | Lit |
|---|---|---|---|---|---|---|
| dust | soft disc | 0.25 → 0.6 m | 0.7–1.4 s | 1.2 down / 2.5 | the cell's ramp tone × 0.9 → × 0.6 | yes (1 light-volume fetch) |
| chip | square | 0.04–0.08 m | 0.3–0.6 s | 9.8 / 1.0 | the cell tone | yes |
| spark | velocity-aligned streak (stretched over 40 ms of motion) | 0.03 m wide | 0.25–0.5 s | 6 / 1.5 | white → amber300 → ember → 0 | no |
| glint | 4-point star | 0.10–0.22 m | 0.5–0.9 s | −0.5 (rises) / 3 | accent × 3 HDR | no |
| ember | hot core | 0.05 m | 0.8–1.6 s | −1.0 / 0.8 | #fff1c2 → #ff8a3a → #8a2a0a → 0 | no |
| ring | ring sprite | radius 0 → 2.5 m | 0.35 s | 0 / 0 | accent | no |
| streak | long vertical streak | 0.02 × 0.6–2.4 m | 0.25 s | 0 / 0 | biome accent × 1.5 | no |
| mote | soft disc | 0.02–0.04 m | wraps a 14 m box (today's mote field) | — | warm bone | yes |

**Density governor.** Live particles are never killed early (today's `puffs.shift()` makes old puffs pop). Each spawn
request is instead scaled by `k = min(1, cap / (live + requested))` and by a screen-area budget. The live screen area of
all particles must stay ≤ 1.0 × the screen on Balanced (High 1.5, Battery 0.5), estimated at spawn from the mid-life size.
On-screen size caps: dust ≤ 64 px, glints ≤ 48 px, sparks ≤ 6 × 40 px.

**Budget check (sim rates, Balanced):** spawns = 4 taps × 6 + 3 crits × 10 + 11 breaks × 22 = 296/s at p95, so about 222
live. At the maximum of 36 breaks/s: 846/s, about 635 live, under the 1,024 cap. Shards at 36 breaks/s would be 288/s and
230 live, so the governor trims them to 192.

### 9.18 The Plunge renderer (E5: Dive Start, cavern dives, bomb cascades, run 2+ early depths)

| Item | Value |
|---|---|
| Enter | rows/s ≥ 6 for 1.5 s, or a scripted dive. 300 ms hand-off: a 0.15 flash hides the swap from voxels to the plunge view |
| Walls | 3 quads (back wall, left, right), scrolling at the plunge speed. Their shader paints the strata ramps of the biome being crossed (from `palette.ts`), with banding every 2 m and a ±0.3 m noise warp |
| The face | every 33 ms an instanced row of 7 impostor shards breaks at the face line (no voxel edits) |
| Streaks | 300/s (Balanced), length = speed × 50 ms |
| Blur | `uPlunge`: a vertical 4-tap blur in the composite |
| Coins | the coin river to the gold counter, 30 sprites/s |
| Depth | the odometer rolls continuously. Each biome boundary crossed flashes its name as an SDF line (300 ms) |
| Speed | visual 30 m/s cap (an 11 s dive to 340 m) |
| Exit | decelerates over 1.2 s (outCubic) to 4 m/s. The voxel window at the target depth snaps in under a 120 ms 0.15 flash, then the camera settles on the follow spring |
| Sound | wind roar, pitch ∝ speed (0.8–1.4), gain −12 dB |
| Reduced motion | no streaks and no blur. The dive becomes a 400 ms crossfade with the depth counting up |

### 9.19 Shake, kick and hit-stop (`game/fx/CameraFx.ts`)

**Trauma shake.**
- T ∈ [0, 1], added per cue and capped at 1, decaying linearly at 1.6/s (T 0.5 is gone in 0.31 s).
- Offset (x, y) = 0.40 m · T² · (n1, n2) at 22 Hz, and roll = 1.2° · T² · n3. n is 1D gradient noise from `core/noise`.
- Resulting peaks: break 0.65 px, crit 1.25 px, bomb 4 px, tool tier 6 px, biome landing 9.8 px, Rekindle 12.8 px.
- Multiplied by the existing Camera Shake slider (`settings.cameraShake`).

**Kick.** A 2D spring (kick: ω 40, ζ 0.45) on the camera offset, driven by impulses toward the hit cell (tap 2.9 m/s,
crit 5.8 m/s). Offsets superpose and are capped at 6 px. Taps never add trauma, only kick, so tapping at 10/s never
blurs the view.

**Hit-stop.**
- A separate **FX clock**: `fxDt = dt · scale` while a stop runs (scale 0, or 0.05 for "heavy" stops).
- **Frozen:** shards, GPU particles (`uFxTime`), number rise, crew loops, chest physics and the camera follow.
- **Running:** flash decay, shake, kick, UI, audio and tokens already in flight.
- **Rules:** ≤ 120 ms (T5 ≤ 160 ms); ≥ 300 ms between stops; never on T1; never while the 1 s break EMA is ≥ 3/s, while
  holding, or in a Surge; overlapping stops take the max, never the sum; **a new `pointerdown` ends the stop in that
  frame** (M7).

### 9.20 Sound and haptics in sync

- **Alignment.** Visual peaks are authored at +2 frames (M2). Ceremonies schedule their audio **ahead**: the snap's sound
  starts at `ctx.currentTime + (tSnap − now) − baseLatency − 0.02 s`. Chromium 88 has `baseLatency` but not
  `outputLatency` (102+), so a fixed 20 ms estimate is added.
- **Pitch ladders** (`audio/cues.ts`): the purchase chain (+1 semitone per buy, cap +12, reset after 1.2 s), coin
  landings (+1 per landing within 600 ms), chest steps (major thirds), pierce chains (+2 per cell), combo tiers (a step
  per tier). The same ladder never runs twice at once: a new chain restarts it.
- **Variation.** Every hit picks one of 4 material samples, ±6 % pitch and ±1.5 dB, never the same sample twice in a row.
- **Haptics** (`ui/haptics.ts`, extended; patterns in §9.4). The minimum pulse is 10 ms: shorter pulses are not felt
  on many ERM motors. Rate limits: tap 60 ms, purchase 80 ms, landings 120 ms. `navigator.vibrate` needs the VIBRATE
  permission, which the shell already declares.

### 9.21 Anti-habituation, and escalation over a lifetime

- **Freshness damping.** The same cue repeated within 2 s plays at −15 % intensity per repeat (min 50 %) on flash, bloom
  and particle counts, but never on the number or the sound. A combo's every 10th break gets an **accent**: +30 %
  particles and a bigger pop, like a drum pattern.
- **Seeded variation.** 3 shard sets, 4 crack orientations, the spark cone jittered ±20°, the token side alternating.
- **Lifetime escalation (the démesure):**
  - the tool grows from 0.6 m to 7 m and gains a layer per tier (§2.4);
  - the number size follows log10 of damage over the biome median (18–38 px);
  - the counter's tier colour climbs through the suffixes;
  - the E-tier mix shifts upward in run 2+ (run 2's first 5 min: 3 % of taps break 8+ cells, 0 % in run 1, sim);
  - the Plunge becomes common.
- **Restraint.** The calm register stays calm. Menus, the settings, the Codex text and the lore cards use only
  `enter`/`exit` fades, so the impact register keeps its contrast.

### 9.22 Motion levels and photosensitivity (Settings → Motion, Flashes; the shake slider is kept)

`Settings.motion: 'full' | 'reduced' | 'off'` defaults to `'reduced'` when `prefers-reduced-motion: reduce` matches.
`Settings.flashes: 'on' | 'soft' | 'off'` defaults to `'soft'` when motion is reduced.

| Feature | Full | Reduced | Off (static) |
|---|---|---|---|
| Camera shake, kick, dolly, dive | on | none (the camera is at its rest pose every frame) | none |
| Hit-stop | on | none | none |
| Springs | as specified | outCubic over the same duration, no overshoot | instant |
| Number pop and rise | jelly + 46 px rise | fade only, 20 px rise | static, 600 ms |
| Token flights | Bézier + trails | straight, 300 ms, no trail | none: the counter ticks with a 120 ms highlight |
| Particles | 100 % | 60 % | ≤ 20 per event, no streaks |
| Chromatic, radial blur, plunge blur | on | off | off |
| Full-screen flash | ≤ 0.35 | ≤ 0.15 | none (Flashes Off is honoured at every level) |
| Infinite loops (BEST breathing, near-glow) | on | static highlight | static highlight |
| Ceremonies | full | fades; same total time ÷ 2 | a static card for 1.2 s |

**Photosensitivity** (WCAG 2.3.1, enforced by `JuiceDirector`, unit-tested):
- at most **2 full-screen flashes per second** (≥ 500 ms apart);
- flash intensity ≤ 0.35 (Rekindle 0.40 with a 200 ms ramp);
- **never a saturated-red flash**;
- any effect faster than 3 Hz stays under 6,400 px² (80 × 80 px), far below the 25 %-of-field area of the general flash
  threshold;
- breathing and shine loops change luminance by ≤ 10 %.

---

## 10. Technical plan (reusing the engine)

### 10.1 Frame pipeline (one `requestAnimationFrame`, in this order)

1. Input: drain the tap ring.
2. Simulation (fixed 1/60 s steps, ≤ 4 per frame): the tap resolver, crew, events → cue requests.
3. `JuiceDirector`: apply the budgets and pick the cues. Advance the FX clock (hit-stop).
4. World: voxel edits (3 per broken cell), incremental light, slab recycling (§5.1).
5. FX state: shards (CPU), spawn writes (GPU particles), number pool, `CameraFx` (shake, kick, follow, dolly, dive).
6. Render:
   1. scene at scale `s`: opaque, then shards, then additive (beams, halos, particles), then SDF titles;
   2. post: bright, bloom levels, rays when active, then the native composite (upsample, CAS, shock, chroma, dim, iris,
      grade);
   3. overlay pass: SDF numbers, combo, stamps, sunbursts.
7. `FxCanvas.draw()`: tokens, trails, sparks and confetti, in the same rAF, so it stays in step with the WebGL canvas.
8. DOM: tickers and card states. Writes happen only on change, as today's `Hud` does.

### 10.2 Files

**Add**

| File | What to build | How it stays crisp and fast |
|---|---|---|
| `src/core/ease.ts` | the cubic-bezier evaluator, `EASE` in JS | matches CSS within 1e-3 (unit test) |
| `src/core/spring.ts` | closed-form damped spring, `Spring1`/`Spring2`, `springKeyframes()` | no allocation per step; cached keyframes |
| `src/ui/brand/motion.ts` (extend) | the `EASE`, `SPRING` and `TIER` tables, `MotionLevel`, `playDuration()` per level | mirrored as `--ease-*` and `--spring-*` in ui.css (brand test) |
| `src/config/juice.ts` | the cue table of §9.4 as data | a test checks every cue against its tier's caps |
| `src/game/fx/JuiceDirector.ts` + `src/game/fx/juiceBudget.ts` (pure) | listens to the bus and plays cues under the budgets: flashes, hit-stop, trauma, particles, tokens, toasts, ceremony exclusivity | the pure budget core is unit-tested in Node |
| `src/game/fx/Timeline.ts` | a deterministic keyframe timeline (tracks with start, duration, ease and callbacks), `step(dt)`, `skipTo(t)` | lets the ceremonies run under tests at fixed times |
| `src/game/fx/ceremonies/{ToolTier,Chest,BiomeReveal,Rekindle,Milestone,RankUp,NumberMilestone,OfflineFeast,DiveStart}.ts` | the timelines of §9.10–9.15 | each exposes `skip()` and a fixed-time capture hook |
| `src/game/fx/CameraFx.ts` | trauma, kick, follow, dolly, dive, the FX clock | outputs offsets to `DescentCamera` |
| `src/render/fx/GpuParticles.ts` | §9.17 | quads at native-correct sizes; one draw |
| `src/render/fx/fracture.ts` (pure), `src/render/fx/Shards.ts`, `src/render/fx/shardMaterial.ts` | §9.6 | the terrain texture, so it is HD; dissolve without a full-screen discard |
| `src/render/fx/sdfAtlas.ts` (pure), `src/render/fx/SdfText.ts` | the atlas from `strokeFont`, instanced glyph quads, the threshold reveal | 6 texels/unit, `fwidth` antialiasing, exact at any scale |
| `src/render/fx/Overlay.ts` | the native-resolution pass after the composite: numbers, stamps, sunbursts | draws at device pixels |
| `src/render/fx/Beams.ts` | beam cones, pillars, crack lines, smears | one additive draw |
| `src/render/fx/Plunge.ts` | §9.18 | no voxel edits during a plunge |
| `src/game/effects/LootPop.ts` | the 3D loot pop and its screen-space hand-off | replaces `Drops.ts`'s fly-to-backpack |
| `src/ui/fx/FxCanvas.ts`, `src/ui/fx/spriteAtlas.ts` | the z-5 Canvas 2D: flights, trails, sparks, rings, confetti, the coin river | sprites pre-rendered at device size, integer texel scale; hidden after 300 ms empty |
| `src/ui/fx/Ticker.ts`, `src/ui/fx/displayLedger.ts` (pure), `src/ui/fx/format.ts` (pure) | odometers, `shown = actual − inFlight`, number notation | JS transforms only while rolling; DOM writes only on string change |
| `src/ui/fx/press.ts`, `src/ui/fx/waapi.ts` | card and button states (§9.9); `play(el, frames, opts)` maps the motion level and cancels on replay | `transform` and `opacity` only (lint, §10.3) |
| `src/ui/idle/*` | `TopBar`, `ObjectiveChip`, `DepthRuler`, `Dock`, `Card`, `Sheets`, `FeatToast`, `TitleCard` (sr-only text), `OfflinePlate`, `RevealCard`, `GhostHand`, `TapSurface` | vector icons through `polygonsPath()`; layout from §8 |
| `src/audio/cues.ts` | the pitch ladders and latency-aligned scheduling | — |
| `src/i18n/en/idle.ts` | every new string: tool tiers, biomes, Feats, ceremonies, settings | — |
| `tools/fx-stress.mjs` | the worst-case scene: a plunge + a mythic chest + a Feat toast + 10 taps/s for 30 s | prints CPU ms p50/p95, live particles, tokens, draws |
| `tools/fx-capture.mjs` | captures each ceremony at fixed `Timeline` times (e.g. tool tier at 0, 400, 700, 900, 1,300 ms) for review | deterministic seeds |

**Replace**

| Today | With |
|---|---|
| `game/effects/Particles.ts` (CPU puffs, 5 attribute re-uploads per frame, `shift()` pops) | `GpuParticles` (the motes become one of its kinds) |
| `game/effects/Debris.ts` (grey cubes) | `Shards` (its voxel collision is kept) |
| `game/Drops.ts` (fly to the backpack) | `LootPop` + `FxCanvas` flights |
| `game/effects/TargetMarker.ts` | `uCellFx[8]` in the terrain's section path (the crack code is kept) |
| `CameraRig` shake | `CameraFx` |
| `ui/notices.ts` `PickupFeed` | tokens and counters (§9.7). `Toasts` becomes `FeatToast` plus a small info toast |
| `ui/hud/Hud.ts` | `ui/idle/*` |
| `render/PostFX.ts` composite | the native-resolution composite with upsample, CAS, shock, chroma, rays, dim, iris and plunge blur (its tone map and grade are kept) |
| The 18 individual-transform rules in `ui.css` and the `{ scale }` WAAPI frames in `notices.ts` | `transform: rotate(45deg)` etc. (§10.3) |

**Delete once the switch is green:** `PlayerController`, the third-person `CameraRig`, the joystick and look-drag in
`TouchControls`, `aimAssist.ts`, `touchCamera.ts`, `TapController`'s path walking, `MenuCamera` (the surface shot
replaces it), and the authored zone (`world/gen/generateWorld.ts` and the features pass). Their unit tests go with them.
`ExplorerModel` (the foreman), `LightField`, the mesher, the materials, the audio synth, the save pipeline, the crash panel
and the governor stay.

### 10.3 Chromium 88 rules (WebView 88 is the floor)

| Do not use | Shipped in | Use instead |
|---|---|---|
| `rotate:`, `scale:`, `translate:` (individual transforms), including inside WAAPI keyframes | Chrome 104 | `transform: …`; nested wrappers when two channels must animate independently |
| `linear()` easing | 113 | sampled spring keyframes (§9.2) |
| `:has()`, `@container` | 105 | classes set from JS |
| `AudioContext.outputLatency` | 102 | `baseLatency` + 20 ms |
| WAAPI `composite: 'add'`, `commitStyles()` | not relied on | one channel per element; set the final state inline before playing |

`tests/unit/compat.test.ts` greps `src/**/*.css` and `src/**/*.ts` for these patterns and fails on any hit.

### 10.4 FX quality presets

| | Battery | Balanced | High |
|---|---|---|---|
| Scene scale of native (dynamic) | 0.45–0.55 | 0.60–0.75 | 0.80–1.00 |
| Composite and overlay | native, DPR cap 2 | native, DPR cap 3 | native, DPR cap 3 |
| GPU particles, live | 384 | 1,024 | 2,048 |
| Shards, live | 72 | 192 | 320 |
| Tokens in flight | 16 | 24 | 32 |
| Rays / chroma / plunge blur | off / off / off | on / on / on | on / on / on |
| Screen shock | on (0 extra fetches) | on | on |
| Bloom | off (halos only) | 4 levels | 5 levels |
| FX sprite atlas | 512 × 512 | 1024 × 1024 | 1024 × 1024 |
| FX LOD under thermal throttling (governor step 1, before resolution) | — | particles × 0.6, shards × 0.5, rays and chroma off | the same |

### 10.5 Performance budget (Balanced, 390 × 844 at DPR 2.75, Adreno 642L / Mali-G68)

| Area | Item | Budget |
|---|---|---|
| GPU | Total | ≤ 12.0 ms |
| GPU | Opaque scene at s = 0.65 (≈ 1.1 Mpx) | ≤ 6.5 ms |
| GPU | Shards + particles + beams + halos | ≤ 1.2 ms |
| GPU | Bloom (4 levels) | ≤ 1.0 ms |
| GPU | Composite at native (2.5 Mpx: 5 upsample taps, a bloom tap, ALU) | ≤ 1.6 ms |
| GPU | Overlay (numbers, stamps, sunburst) | ≤ 0.3 ms |
| GPU | Rays + chroma + plunge blur, only while active | ≤ 0.3 ms |
| GPU | Browser composite of the DOM + FX canvas layers | ≤ 0.8 ms |
| CPU (main thread) | Total | ≤ 6.5 ms |
| CPU | Simulation | ≤ 0.8 ms |
| CPU | `JuiceDirector` + `CameraFx` + timelines | ≤ 0.2 ms |
| CPU | Spawn writes | ≤ 0.1 ms |
| CPU | Shards (192) | ≤ 0.3 ms |
| CPU | `FxCanvas` (≤ 150 `drawImage` calls) | ≤ 0.7 ms |
| CPU | Tickers + DOM | ≤ 0.3 ms |
| CPU | three.js submit | ≤ 2.5 ms |
| CPU | Per-tap allocations | 0 |
| Draw calls | Added by this angle | ≤ 8: particles 1, shards 3, beams 1, SDF 2, sunburst 1, plus the rays pass |
| Memory | SDF atlas | 256 KB |
| Memory | FX sprite atlas | 4 MB (Battery 1 MB) |
| Memory | Particle ring | 213 KB |
| Memory | Shard instances | 26 KB |
| Memory | Composite target | 0: it is the canvas |
| DOM | Concurrent WAAPI animations | ≤ 16 |
| DOM | Infinite loops | ≤ 3 |
| DOM | Elements created per tap | 0 (pools) |

### 10.6 Risks

| Risk | Answer | Proof |
|---|---|---|
| Native-resolution composite costs more than the browser's upscale | it replaces that upscale (the browser no longer scales the canvas); Battery caps DPR at 2; the governor lowers `s` first | device protocol: a composite-only frame at 2.5 Mpx ≤ 1.6 ms |
| The FX canvas layer adds compositing every frame | hidden after 300 ms empty; sprites only (no paths or text per frame) | `fx-stress.mjs`; a device frame test with 60 tokens and 100 sparks |
| Shader compile hitches in the middle of a ceremony | every FX material and post variant is compiled at load with `renderer.compileAsync()` (r186); effects switch by uniforms, never defines | `renderer.info.programs.length` constant through a scripted run of every ceremony |
| Blurry stamps at peak scale | declarative keyframes; no `will-change` on scaling elements (§8.5 rule 5) | capture at a stamp's peak frame: edge ≤ 1.2 device px |
| GC pauses from FX | pools for numbers, tokens, shards and particles; typed arrays; no closures per tap | heap delta ≤ 64 KB over 1,000 taps (`performance.memory` in Chromium) |
| Audio drifts from visuals on slow devices | pre-scheduled ceremony audio; tap peaks authored at +2 frames | MX-2 |
| Over-stimulation and fatigue | tier caps, freshness damping, the calm register, three motion levels | MX-9, the playtest protocol |
| Motion sickness on dives and dollies | the Reduced level makes the camera still; dives last ≤ 600 ms of travel | MX-15 |
| Thermal throttling over long sessions | the FX LOD step comes before resolution and preset steps (§10.4) | a 20-minute soak on the device protocol |
| WebView 88–103 compatibility | §10.3 lint; today's 18 rules fixed in wave 1 | `compat.test.ts`; an apk-sim boot with a forced Chrome 88 user agent |

### 10.7 Build waves (aligned with the lead's 3 waves)

1. **Wave 1, the feel:**
   - `ease`, `spring`, `motion` tokens, `JuiceDirector` and budgets;
   - `GpuParticles`, `Shards`, `SdfText` numbers, `CameraFx` with kick and hit-stop;
   - `LootPop`, `FxCanvas` flights, `Ticker` and ledger, `press.ts` card states;
   - the purchase burst, the ★ ceremony, the native composite, the compat fix and lint.
2. **Wave 2, the wonder:**
   - the shock, chroma, rays, dim and iris uniforms;
   - chest escalation and the reveal card, Feat toasts, rank-up, the biome reveal with the SDF title;
   - the tool tiers 1–6 ceremony, events.
3. **Wave 3, the démesure:**
   - the Plunge renderer and Dive Start, Rekindle, the offline feast, the number milestones;
   - tool tiers 7–12+, the FX LOD, the device pass.

---

## 11. Acceptance metrics (each one a unit test, an e2e check, a capture metric or a sim check)

| ID | Metric | Threshold | How |
|---|---|---|---|
| MX-1 | Input → first changed frame | ≤ 1 frame for 100 % of 500 scripted taps | e2e: CDP touch, then `__DD__.fx.lastTapFrames` |
| MX-2 | Pop and number peaks after a tap | 31–40 ms | unit: `Timeline` + spring sampling |
| MX-3 | Taps dropped during hit-stops and ceremonies | 0 of 1,000 | e2e: taps every 37 ms through a scripted tool-tier and a biome reveal |
| MX-4 | A tap during a hit-stop ends it | in the same frame | unit: `juiceBudget` |
| MX-5 | Hit-stops | ≤ 120 ms (T5 ≤ 160); ≥ 300 ms apart; never on T1; never at break EMA ≥ 3/s | unit over a 30 min sim event stream |
| MX-6 | Every gain has a flight or stream | 100 % of gold, gem, XP, specimen and Ember credits go through the ledger | unit: `displayLedger` + e2e count |
| MX-7 | Counters never jump | displayed value ratio per frame ≤ 1.5 outside scripted counts | e2e: sample the gold counter every frame for 60 s |
| MX-8 | Card affordability flips when `shown` passes the cost | 100 % | unit |
| MX-9 | Every cue within its tier's caps | 100 % of `config/juice.ts` | unit |
| MX-10 | Full-screen flashes | ≤ 2 in any 1 s window; intensity ≤ 0.35 (Rekindle 0.40); no red | unit over the sim event stream + a mythic chest + a biome reveal |
| MX-11 | Live GPU particles, shards and tokens | ≤ the preset caps at every frame of `fx-stress.mjs` | tool |
| MX-12 | SDF text edge width | ≤ 1.2 device px at 18 px and 48 px, DPR 2 and 3 | capture metric (10–90 % ramp) |
| MX-13 | Icon texel evenness | every pixel-art icon's device texel size is an integer | unit: the icon size rule over DPR 1, 1.5, 2, 2.625, 2.75, 3 |
| MX-14 | Stamp sharpness at the peak frame | edge ≤ 1.5 device px | capture metric |
| MX-15 | Reduced motion keeps the camera still | the camera position equals its rest pose in every frame of a scripted run with taps, chests and a biome reveal | e2e |
| MX-16 | Motion Off | no token flights, no particles beyond 20 per event, no flashes | e2e |
| MX-17 | Chromium 88 compatibility | 0 matches of §10.3 patterns | `compat.test.ts` |
| MX-18 | No DOM churn | 0 element creations over 200 taps (MutationObserver) | e2e (extends `ui-check`'s check) |
| MX-19 | No per-tap allocation | heap delta ≤ 64 KB over 1,000 taps | e2e in Chromium |
| MX-20 | No shader compiles after load | `renderer.info.programs.length` constant across every ceremony | e2e |
| MX-21 | Frame budget | CPU p95 ≤ 6.5 ms in `fx-stress.mjs` (SwiftShader: CPU only); GPU ≤ 12 ms on the device protocol | tool + device |
| MX-22 | Ceremonies are skippable | a tap from 400 ms reaches the end state within 350 ms | e2e per ceremony |
| MX-23 | Pacing | first purchase ≤ 6 s; nothing-affordable ≤ 10 s (0–30 min); biome 2 in 0:45–1:30; biome 8 in 20–30 min; run 2 reaches run 1's record in ≤ 60 % of its time | sim (`sim.mjs` with the tutorial rows) |
| MX-24 | E-tier mix (run 1, 0–25 min) | E0 ≤ 65 %, E1+ ≥ 35 %, E2+ ≥ 6 % | sim |
| MX-25 | Something to watch fill | at every second of the first 30 min at least one meter of §7.4 is at ≥ 50 % | sim + HUD model |
| MX-26 | Never two T4/T5 at once; a toast never shows during one | 100 % | unit |
| MX-27 | Text contrast | every new text token pair ≥ 4.5:1 | extends `brand.test.ts` |
