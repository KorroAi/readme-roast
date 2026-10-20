# DEEP DOWN: the idle descent, designed from the economy

KEY: `economy`. A complete design for the new DEEP DOWN, written from the incremental-economy angle
(curves, pacing, offline, layered prestige, the next goal always nearly done). It covers the whole
game, with the most depth on the numbers. Every pacing figure marked **sim** comes from the calibration
model described in §4.11 and Appendix A: a greedy bot taps 5 times a second, buys the best payback
it can afford within 60 s, and Rekindles by rule. Figures marked **target** are requirements that the
build must meet. They are checked in §11.

---

## 0. The game in one breath

The screen is portrait: a cutaway of the earth. You tap the rock at the bottom of a shaft, the cells
crack and burst, and gold flies into your counter. Gold buys a bigger pick and a crew that digs while you
are away. Every few minutes the shaft breaks into a new biome, and the camera pulls back on a cavern
full of light, treasure and creatures. When the rock turns too hard, you **Rekindle**: you go back to
the surface carrying Embers, which make the next descent faster and deeper. The numbers climb from 1 to
1e100 and keep going. The game never ends.

**Six economy laws** (each is tested in §11):

1. **Something completes at most every 30 s** in the first 30 minutes: a purchase, chest, biome, event
   or contract. Sim: the longest gap is 27.5 s and the median is under 1 s.
2. **The goal on screen is always at least 15 % done and at most 90 s away** (goal selector, §7.3).
3. **A tap always matters.** Taps deal about half of active damage (the tap carries 14 % of crew DPS,
   §2.2). Sim: over the first 45 minutes a cell takes 2.2 / 5.7 / 9.4 taps (p10 / p50 / p90), before
   Shockwave and Frenzy, which cut those numbers further.
4. **Harder rock is richer rock.** A cell's gold equals its HP / 100 times its cell multiplier, so
   income depends only on damage dealt, never on depth. That makes offline progress an exact closed
   form (§3.3).
5. **A reset always pays.** After a recommended Rekindle (×2), the new run passes the old record within
   7 minutes of play or 30 % of the previous run, whichever is larger (§4.8). Sim, day 1: 11 of 12
   Rekindles pass it, in 31–381 s.
6. **No dead ends, no store, no ads.** Gems are earned by playing. Nothing can be bought with money.
   Nothing expires or punishes absence.

---

## 1. Core loop at three scales

### 1.1 Ten seconds: tap, crack, burst, buy

| Beat | Numbers (first 30 min, sim) |
|---|---|
| Taps | 5 per second (the model's average; bursts reach 8–10) |
| Cell breaks | a cell takes 2–9 taps (median 5.7); the floor row has 7 cells; one row every 1.4–8 s |
| Burst | 6–14 chunks and 1–5 coins per cell; coins reach the counter in 0.45 s |
| Purchase | the first at 4 s, the first crew at 5.5 s; then one about every 4–15 s |
| Combo | taps less than 0.7 s apart raise the combo; ×1.0 → ×2.0 at 50 |

### 1.2 Three minutes: a biome slice

**The first three minutes** (depth and purchases from the sim; the rest is the tutorial script in §7.1):
- Reach 91 m.
- Two biome reveals: Glowroot Caverns at 0:40 and Crystal Grotto at 2:06.
- About 200 purchases across 4 crew lines and 7 gear cards.
- 3 chests (one every 15 rows).
- The first Lucky Moth at 1:40.
- Dynamite unlocked at 15 m and used twice.
- The first contract done.

**Any later three-minute slice contains, by construction:**
- At least one depth mark (every 10 m, each paying +1 gem on a new record).
- 2–4 chests.
- About one Lucky Moth (they come every 90–180 s).
- 1–2 skill uses.
- 6–20 purchases, at least one of them a ★ milestone (×2).
- Contract progress.
- A guardian every second biome slice.

### 1.3 Three days: the Rekindle ladder

**Session model (sim):**
- One 40-minute first session.
- Then a 6-minute session every 2 h while awake (08:00–24:00).
- Offline at 50 % efficiency, capped at 3 h (6 h at 25 Embers, 12 h at 250).

| Time | Record depth (sim) | Biomes seen | Gold in the bank (display) | Rekindles / Weaves so far |
|---|---|---|---|---|
| 0:22 | 300 m (Rekindle unlocks) | 6 | 1e12 | 0 / 0 |
| 1:00 | 1,399 m | 10 | 1e53 | 3 / 0 |
| 4:00 | 1,535 m | 10 | 2e58 | 4 / 0 |
| 12:00 | 2,125 m | 12 | 2e80 | 7 / 1 |
| day 1 (24 h) | 2,623 m | 13 | 1e99 (1e100 at about 25 h) | 8 / 3 |
| day 2 | 3,384 m | 14 | 3e127 | 15 / 6 |
| day 3 | 3,855 m | 15 | 1e145 | 20 / 9 |
| day 7 | 4,407 m | 16 | 2e165 | 29 / 12 |

Breach (Layer 3, from 2,900 m at about 29.5 h) is **not** in this sim, so these days 2–7 figures
are a floor (§4.10).

### 1.4 What keeps it endless

1. **HP has no ceiling.** HP(d) grows ×1.09 per metre past 1200 m, and numbers are stored as `Big`
   (mantissa plus exponent up to 9e15), so 10,000 m means 1e375 HP, and so on forever.
2. **The content keeps coming.** After 14 authored biomes, an *Echo* stratum arrives every 550 m
   (recombined palette, kit and creatures, numbered I, II, III…). After 15 authored crew lines, an
   *Echo* line arrives every 550 m, built by the same formula.
3. **Three prestige layers stack:** Rekindle (Embers), Weave (Threads), Breach (Sigils, through
   challenges whose goals rise by 250 m per tier, forever).
4. **Collections never cap.** Relic duplicates level relics (+1 % each, no cap), and bestiary tiers
   go up ×10 forever (1, 10, 100, 1000…).
5. **Records boards:** the fastest time to each 100 m mark in a run, so later runs race earlier ones.

---

## 2. The tap

### 2.1 What one tap does

1. **Hit.** The touch point is projected on the cut face (z = 0). The target is the exposed cell
   nearest the projection within 1.2 m. With none in range, the target is the floor cell in the
   tapped column, and if the column is clear, the nearest floor cell. **A tap on the world can never
   miss.** A tap on a creature, chest or relic in a side cavern collects it instead (§6).
2. **Damage.** `tap = (pickDamage + rally × crewDPS) × combo × crit × skillMult`.
3. **Overkill is never lost.** Damage beyond the cell's remaining HP spills to the nearest living
   cell in the same row, then into the next row. Total damage is conserved exactly, so the model and
   the view agree.
4. **Feedback** (numbers in §9): impact flash, 2–4 chips, a crack stage (TargetMarker's 10 stages
   follow the HP fraction), a damage number, an 8 ms vibration, and a pitch that rises 1 semitone per
   10 combo.

### 2.2 How the tap scales

| Term | Formula | Start | Grows by |
|---|---|---|---|
| Pick damage | `100 × L × 2.5^floor(L/25)` | 100 (L1) | levels (cost ×1.2 each); a tier-up every 25 levels (×2.5); gear ×3 per biome |
| Rally (tap share of crew DPS) | `0.14 + 0.01 × rallyLevel` | 14 % | Rally upgrade, +1 % per level, 20 levels, cost ×4 per level from 2 rows of gold |
| Combo | `1 + 0.02 × combo`, combo ≤ 50 | ×1.0 | +1 per tap within 0.7 s; −5 per 0.5 s idle; held average ≈ ×1.5 (model) |
| Crit | chance 5 %, ×5 | ×1.2 expected | Lucky Strike +1 %/level to 30 %; gear Crit ×2 steps |
| Shockwave (60 m) | each tap also deals k × damage to the 2 side neighbours | k = 0 | 25 % / 50 % / 100 %, then radius 2 at level 10 |
| Skills | Frenzy ×2 taps plus 15 auto-taps/s; Gold Rush; Overdrive; Dynamite; Earthquake | – | §4.4.5 |

**Why the tap stays relevant forever:** Rally makes each tap worth 14 % (to 34 %) of crew DPS, so tap
damage grows with the whole economy, not only with the pick. Taps per cell then follow the row time:
`taps per cell ≈ 1.3 × seconds per row` (derived from the model). While the descent is lively, 3–6 taps
break a cell. When rows slow down at a wall, taps per cell rise above 15. That is the honest signal to
Rekindle, and the HUD says so ("The rock is hardening: Rekindle for ×N").

**The pick ladder** (a visible model change every 25 levels; the model grows 15 % per tier up to 3×
on screen; past tier 10, a giant "ghost pick" swings through the frame on each crit):

| Level | Name | Damage ×tier | Level | Name | Damage ×tier |
|---|---|---|---|---|---|
| 1 | Rusty Pick | 1 | 200 | Sunsteel Pick | 1,526 |
| 25 | Copper Pick | 2.5 | 225 | Thunder Maul | 3,815 |
| 50 | Iron Pick | 6.25 | 250 | Plasma Pick | 9,537 |
| 75 | Steel Pick | 15.6 | 275 | Comet Hammer | 2.4e4 |
| 100 | Gilded Pick | 39 | 300 | Star Breaker | 6.0e4 |
| 125 | Crystal Pick | 98 | 325 | Planet Cracker | 1.5e5 |
| 150 | Obsidian Pick | 244 | 350 | Void Cleaver | 3.7e5 |
| 175 | Mythril Pick | 610 | 375+ | Lantern Edge I, II, III… | ×2.5 per 25 levels |

---

## 3. Idle and offline

### 3.1 The crew is visible
Each owned crew line adds a rig to the shaft walls just above the floor (§5.5). A rig strikes a floor
cell every 0.4–1.5 s, and its hits carry that line's DPS. A line shows 1 rig at level 1, 2 at level 25
and 3 at level 100. Crew damage spills the same way as taps.

### 3.2 Offline rules
| Rule | Value |
|---|---|
| Efficiency | 50 % of crew DPS (taps and skills count 0) → 75 % at 250 Embers → 100 % with the Loom node *Night Shift* (or 1e5 Embers) |
| Cap | 3 h → 6 h at 25 Embers → 12 h at 250 Embers → 24 h with *Night Shift* level 3 |
| Chests passed offline | go to a **Chest Rack** (holds 10); you open them by tapping on return, each a full burst |
| Biomes crossed offline | each is logged in the Album; the deepest one plays its reveal on return (one reveal at most) |
| Lucky Moths, guardians, contracts | do not happen offline (they are active-play rewards) |
| Clock | `elapsed = clamp(now − savedAt, 0, cap)`; a negative or absurd clock gives 0, and nothing is punished |

### 3.3 The closed form (exact)
HP is piecewise geometric: a constant ratio `g` per metre inside each segment, with segments split at
the slope changes. With crew DPS `A` and offline time `T`, the work is `W = A × T × eff`. Walk the
segments: within a segment that starts at depth `a`, the k rows after it cost
`7·H(a)·(g^k − 1)/(g − 1)`. If W covers the whole segment, subtract and move on. Otherwise solve
`k = floor(log_g(1 + W(g−1)/(7·H(a))))` and leave the remainder as row progress. Gold equals the HP
dug divided by 100 (the cell mix averages ×1.0 by construction), plus `chests × 30 s × income` on the
rack. The cost is O(number of segments), so microseconds.
**Verified in calibration:** against a 1-second step integration over 7 cases (1–24 h, depth 0 to
3,089 m, DPS 1e1 to 1e80), the depth error is ≤ 1e-12 m and the gold error ≤ 4e-13 in log10.

### 3.4 Return screen ("While you were away")
One card, shown before play resumes:

> **5 h 12 m away: your crew dug 84 m** (412 m → 496 m)
> + 4.2e15 gold · 7 chests on the rack · New biome: **Magma Veins**
> [ **Collect** ]

On Collect:
1. The gold counter rolls up for 1.2 s.
2. The rack slides in, and each chest opens with one tap.
3. If auto-buy is unlocked (Ember perk), it spends immediately, each purchase popping its card.
4. The reveal plays.

**Time Crystals** (from contracts and Grand chests) are a stored hour of 100 % crew output: you can
"Warp" one at any time for instant progress.

---

## 4. Economy

### 4.1 Units and notation
- **Depth:** 1 row = 1 metre. Shown as `128 m` up to 9,999 m, then `12.48 km`.
- **HP and damage:** a 0 m cell has 100 HP, and the level 1 pick deals 100.
- **Gold:** a cell pays `HP / 100 × cellMult`. The first cell pays 1.
- **Big numbers:** `Big = { m: float64 in [1,10), e: int }`.
  - Display: integers below 1,000, then 3 significant digits with K, M, B, T, Qa, Qi, Sx, Sp, Oc, No,
    Dc, UDc, DDc, TDc, QaDc, QiDc, SxDc, SpDc, OcDc, NoDc, Vg (1e63).
  - Past 1e63: letter pairs aa, ab… (1e66, 1e69…).
  - Settings offer Scientific (`1.23e45`) and Engineering.
- **Per-second rates** sit next to every counter (`+4.5K/s`).

### 4.2 Depth curves

`HP(d) = 100 × Π slope(m)` for m < d.

| Segment | Slope per metre | Why |
|---|---|---|
| 0–19 m (Topsoil) | 1.30 | the tutorial: the pick lags, so each upgrade is felt |
| 20–119 m | 1.09 | the comfort zone: crew lines arrive every 40–60 m |
| 120–449 m | 1.08 | the long first push; Rekindle unlocks at 300 m |
| 450–1199 m | 1.085 | the first run walls here (sim: 650 m at 42 min, 900 m at 1:42) |
| 1200 m + | 1.09 | the deep game, pushed by prestige |

| Biome start | Depth | HP per cell | Gold per average cell | Row HP (×7) |
|---|---|---|---|---|
| Topsoil Roots | 0 m | 100 | 1 | 700 |
| Glowroot Caverns | 20 m | 1.90e4 | 190 | 1.33e5 |
| Crystal Grotto | 60 m | 5.97e5 | 5.97e3 | 4.18e6 |
| Halden Works | 120 m | 1.05e8 | 1.05e6 | 7.36e8 |
| Fungal Deep | 200 m | 4.96e10 | 4.96e8 | 3.47e11 |
| Drowned Ruins | 300 m | 1.09e14 | 1.09e12 | 7.64e14 |
| Magma Veins | 450 m | 1.13e19 | 1.13e17 | 7.88e19 |
| Fossil Halls | 650 m | 1.37e26 | 1.37e24 | 9.60e26 |
| Frost Hollow | 900 m | 9.88e34 | 9.88e32 | 6.92e35 |
| The Loom | 1,200 m | 4.20e45 | 4.20e43 | 2.94e46 |
| Iron Core | 1,550 m | 5.28e58 | 5.28e56 | 3.70e59 |
| Star Heart | 1,950 m | 4.94e73 | 4.94e71 | 3.46e74 |
| Void Sea | 2,400 m | 3.43e90 | 3.43e88 | 2.40e91 |
| The Gate | 2,900 m | 1.77e109 | 1.77e107 | 1.24e110 |
| Echo I / II | 3,450 / 4,000 m | 6.8e129 / 2.6e150 | ÷100 | ×7 |
| (6,000 m / 10,000 m) | | 1.9e225 / 9.5e374 | | |

The **1e100 gold milestone** (the bank, not a cell) is reached at about 2,650–2,700 m of depth.
It is the "démesure" banner, the Googol fanfare (§9).

### 4.3 The cell mix (what a row is made of)
Each biome draws cells from a table whose expected multiplier is exactly 1.0, so the curves above hold.
Biomes differ in what appears, not in average value.

| Cell kind | Share | Gold × | HP × | Notes |
|---|---|---|---|---|
| Rock (biome family) | 84 % | 0.6 | 1 | the background; crack tint per family |
| Common ore (copper → star shard, per biome) | 10 % | 2.5 | 1 | glints through the depth fog in the next 6 rows ("preview") |
| Rich ore | 4 % | 4 | 1.5 | glows; its break is the "jackpot" burst |
| Rare (gem / fossil / geode) | 1 % | 8 | 2 | gem: +1 gem; fossil: 5 % relic roll; geode: 5-tap mini burst, 1–3 gems |
| Chest | 1 per 15 rows | – | 3 | pays 30 s of income (rack offline); 8 % relic, 25 % 1–3 gems |
| Hard band (decor) | 1 row per 25 | 1 | 1 | a visible stratum line with a depth marker every 10 m |

Expected value: 0.84·0.6 + 0.10·2.5 + 0.04·4 + 0.01·8 = 0.994. The other 0.6 % comes from chests and
gems (counted separately). The HP multipliers on rich and rare cells are offset by their gold
(a rich cell pays 4/1.5 = 2.7 gold per unit of damage).

### 4.4 Gold upgrades (in-run, reset by Rekindle)

#### 4.4.1 Formulas
- **Level cost:** `cost(L → L+1) = c0 × r^L` (the pick uses `L−1`, because it starts at level 1).
- **Crew output:** `out(L) = b × L × 2^floor(L/10)`, with a **★ milestone every 10 levels** (×2).
- **Pick:** tier-up every 25 levels, ×2.5.
- **Buy buttons:** ×1, ×10, ×100, Max (Max buys `floor(log_r(1 + G(r−1)/c))` levels).

#### 4.4.2 The pick
| Upgrade | c0 | r | Effect |
|---|---|---|---|
| Pick | 30 gold | 1.20 | damage `100·L·2.5^floor(L/25)` |
| Rally (unlocks at 20 m) | 2 rows of gold at the unlock depth | 4.0 | +1 % tap share per level, 20 levels |
| Lucky Strike (15 m) | 1.5 rows of gold | 2.5 | +1 % crit chance per level, 25 levels |
| Shockwave (60 m) | 4 rows of gold | 6.0 | splash 25 / 50 / 75 / 100 % … radius 2 at level 10 |

#### 4.4.3 The crew (15 authored lines, then Echo lines)
A line unlocks when you first reach its depth. The blueprint is kept forever after (Ember perk at 1 Ember).

**Lines 0–5 are priced fairly at their unlock depth `u`:**
- Cost: `c0 = 186 × goldPerCell(u)`, about 26.6 rows of gold.
- Output: `b = HP(u) / 44.4` per level.
- In words: at its unlock depth, a level-1 line breaks one cell every 44 s. At level 10 (with the ★)
  it breaks one cell every 2.2 s.
- Line 0 is the exception: it costs 50.

**Lines 6+ continue geometrically:** each costs ×1e4 and produces ×1e4 the previous line. They are
*not* indexed to HP.
- This is the most important structural rule in the economy. Lines priced fairly at every depth form a
  self-sustaining ladder: in calibration, once any multiplier passed about ×300, a single run swept
  through all 24 lines to 8,800 m in under 30 minutes.
- With the geometric ladder, depth past 300 m is pushed by multipliers (Embers, gear, relics,
  Threads, Sigils) at a steady 110–170 m per decade of multiplier (measured). The shallow lines still
  make early re-runs fly (the first ×10 is worth about 685 m).

`r = 1.10` for every line. The asymptotic DPS-per-gold exponent is `ln 2 / (10 ln 1.10) = 0.73`.

| # | Line | Unlock | c0 (gold) | Damage/s per level | Rig |
|---|---|---|---|---|---|
| 0 | Shovel Hand | 0 m | 50 | 2.25 | miners at the floor edge |
| 1 | Pick Crew | 8 m | 1.52e3 | 18.4 | two miners on a ledge |
| 2 | Mine Cart | 20 m | 3.54e4 | 428 | rail and cart |
| 3 | Steam Drill | 60 m | 1.11e6 | 1.34e4 | gantry drill |
| 4 | Blast Team | 120 m | 1.96e8 | 2.36e6 | floor charges |
| 5 | Tunnel Borer | 200 m | 9.23e10 | 1.12e9 | side-mounted borer |
| 6 | Crystal Resonator | 300 m | 9.23e14 | 1.12e13 | tuning forks |
| 7 | Magma Lance | 450 m | 9.23e18 | 1.12e17 | heat beam |
| 8 | Fossil Golem | 650 m | 9.23e22 | 1.12e21 | a bone fist |
| 9 | Rime Auger | 900 m | 9.23e26 | 1.12e25 | ice drill |
| 10 | Loom Weaver | 1,200 m | 9.23e30 | 1.12e29 | light threads |
| 11 | Gravity Well | 1,550 m | 9.23e34 | 1.12e33 | a lensing sphere |
| 12 | Star Forge | 1,950 m | 9.23e38 | 1.12e37 | a star furnace |
| 13 | Void Maw | 2,400 m | 9.23e42 | 1.12e41 | a void mouth |
| 14 | Gate Engine | 2,900 m | 9.23e46 | 1.12e45 | the Gate's engine |
| 15+ | Echo line *n* (Mk II…) | 3,450 + 550·(n−15) m | ×1e4 per line | ×1e4 per line | Echo recolour of line n−15 |

#### 4.4.4 Gear (one-shot gold cards, four per biome)
Gear appears on reaching each biome start `u`. Costs are in rows of gold at `u` (one row of gold =
`7 × HP(u)/100`). Each card is a single tap for a big, visible jump: arriving in a new biome means
**new gear**.

| Card | Cost (rows of gold at u) | Effect |
|---|---|---|
| *Biome* Tools: the newest line | 2.5 | that line ×3 |
| *Biome* Rigging: the second-newest line | 3.7 | that line ×3 |
| *Biome* Edge | 3.1 | pick ×3 |
| *Biome* Lantern | 7.5 | everything ×2 (crew and taps) |

Examples:
- Glowroot gear at 20 m costs 3.3e3 / 5.0e3 / 4.2e3 / 1.0e4 gold.
- Halden Works gear at 120 m costs 1.8e7 / 2.8e7 / 2.3e7 / 5.5e7.

The gear series never ends: every Echo stratum brings its four cards.

#### 4.4.5 Skills (active, with cooldowns; levelled with gold)
| Skill | Unlock | Effect | Duration | Cooldown | +1 level (cost ×5, from 3 rows of gold) |
|---|---|---|---|---|---|
| Dynamite | 15 m | destroys the next 3 rows at once, paying their gold | instant | 60 s | +1 row (to 12) |
| Frenzy | 40 m | 15 auto-taps/s on the floor, and taps ×2 | 15 s | 120 s | +2 s |
| Gold Rush | 90 m | gold ×5 | 20 s | 180 s | +×1 |
| Overdrive | 160 m | crew ×10 | 30 s | 300 s | +×2 |
| Earthquake | 300 m | instantly applies 60 s of total DPS as damage; the whole screen shakes | instant | 600 s | +15 s worth |

**Cataclysm:** all unlocked skills used within 5 s → everything ×2 for 10 s, plus a full-screen
flash. It is the active player's reward and costs idle players nothing.

**Model check:** Dynamite alone adds 3 rows every 60 s, which at 3 s per row is +15 % active descent.
The sims omit skills, so real active play runs 20–40 % ahead of the sim tables. That is margin, not
a balance risk: skills are capped by cooldowns.

### 4.5 Milestones
| Milestone | Effect | Feedback |
|---|---|---|
| ★ every 10 crew levels | ×2 that line | a star fills on the card, fanfare, the rig flashes gold |
| Pick tier every 25 levels | ×2.5 and a new model | a 1 s spotlight on the pick, the name banner |
| Depth mark every 10 m | +1 gem the first time each mark is passed (lifetime) | a wall plaque lights up |
| Depth record every 100 m | +10 gems; the records board | a banner |
| Biome start | gear cards, a crew blueprint, the reveal | the reveal shot (§9) |
| Number scales: K, M, B… up to Vg (1e63), and 1e100 "Googol" | cosmetic title and counter skin | the counter font changes colour per tier |

### 4.6 The multiplier stack (order of application)

```
lineDPS  = b·L·2^floor(L/10) · gearLine · gearAll · (1 + 0.10·Embers)·kindling · relics · bestiary · threads · sigils · boosts
tapDmg   = (100·L·2.5^floor(L/25) · gearPick + rally·Σ lineDPS) · gearAll · (1+0.10·Embers) · combo · crit · skills
cellGold = HP/100 · cellMult · relicsGold · goldWeave · goldRush · boostGold
```

- Groups multiply with each other. Inside a group, bonuses add (relic +3 % each, summed).
- **Embers multiply DPS, not gold.** This is deliberate: a multiplier on both gold and DPS roughly
  doubles the depth bought per decade of multiplier (measured 250 m against 125 m in an earlier
  configuration), and that made Rekindle chain into runs a few seconds long. Gold multipliers exist
  (relics, Golden Vein, Gold Rush, Boost), but they are bounded or slow.

### 4.7 Gems (earned only)

| Source | Gems | Rate (target, active play) |
|---|---|---|
| New 10 m depth mark | 1 | ~25/h in the first hour, then about 5–10/h |
| New 100 m record | 10 | |
| Chest | 1–3 (25 %) | about 3/h |
| Geode / gem cell | 1–3 / 1 | about 4/h |
| Guardian defeated | 5 | about 2–4/h |
| Contract | 3–8 | about 10/h |
| Relic set complete | 25 | |
| Lucky Moth "Gems" outcome | 2 | |

| Sink | Cost | Effect |
|---|---|---|
| Boost | 25 | everything ×2 for 30 min (stacks duration to 4 h) |
| Time Warp | 40 | 1 h of crew output at 100 % now |
| Skill refresh | 5 | all cooldowns end |
| Contract reroll | 2 | new contract |
| Royal Chest key | 10 | opens a Royal Chest (one per biome, in a side cavern): relic guaranteed |
| Relic focus | 100 | the next relic drop comes from the chosen biome's set |

### 4.8 Prestige

#### 4.8.1 Layer 1: Rekindle → Embers (unlocks at 300 m, the Ember Shrine in the Drowned Ruins)
- **Total, a function of the record:** `EmbersTotal(R) = floor(25 × 2^((R − 300)/100))`, where `R`
  is the deepest point reached since the last Weave (lifetime, not per run). A Rekindle pays
  `EmbersTotal(R) − EmbersOwned`, the Cookie-Clicker rule.
  - Examples of the total: 300 m → 25, 400 m → 50, 500 m → 100, 650 m → 282, 900 m → 1,600,
    1,200 m → 1.28e4, 1,550 m → 1.45e5, 2,000 m → 3.2e6, 3,000 m → 3.3e9.
  - The rule a player can repeat: **"every new 100 m of record doubles your Embers."**
- **Effect:** each Ember gives +10 % DPS (crew and taps), additively. 25 Embers = ×3.5. Embers are
  never spent.
- **Reset:** depth, gold, levels, gear and skill levels. **Kept:** blueprints, relics, bestiary,
  gems, records, perks and the Album.
- **Why base 2 per 100 m, on the record:**
  - A ×10 DPS multiplier buys 110–250 m of depth (measured; the most at 1,000–2,000 m). Stability
    needs `gain per decade × log10(base) / 100 < 1`.
  - At base 2 the worst case is 0.75: a Rekindle that doubles power carries the next run 42–75 m past
    the record, and the remaining 25–58 m must be pushed, so runs lengthen naturally.
  - Calibration of the alternatives:
    - Base 3 (1.19): chains of 17–34 s runs through 1,000–2,000 m.
    - Embers per run instead of per record: chains of 15–80 s.
    - Base 1.8: day 1 ends 150 m shallower, with no gain in stability.
- **The "recommend" rule** (the button pulses, and the goal bar shows it) fires in two cases:
  - gain ≥ Embers owned (×2 or better) **and** the descent has slowed (rows slower than 8 s), or the
    gain is ≥ 10× owned;
  - the run is walled (rows slower than 45 s, after more than 10 min) and gain ≥ 25 % of Embers owned.
  - The "slowed" condition matters: without it (and without the live re-climb, §4.8.2), the re-climb
    after a Weave triggers a Rekindle at every new 100 m, a chain of up to 15 runs shorter than 3
    minutes (seen in calibration). With both rules, the 7-day sim has no such chain, and a fast run is
    simply left running.
- **The Rekindle screen** shows: deepest m, Embers +N, "Power ×A → ×B", "You will pass {record} m in
  about {eta}" (from the sim function, §10), the perks unlocked by the new total, and one big
  [Rekindle] button that needs a 0.6 s hold.

**Ember perks** (thresholds on the **highest Ember total ever held**, so a Weave never takes them
away; never spent; the Lantern Tree shows them as a vertical vine with the next one lit):

| Embers | Perk |
|---|---|
| 1 | Keep blueprints (crew lines stay unlocked) |
| 10 | Start each run with Shovel Hand 10 and Pick 10 |
| 25 | Offline cap 6 h |
| 50 | Auto-buy: pick (toggle) |
| 100 | Head Start: begin at 10 % of your record (those rows are dug instantly and pay their gold) |
| 250 | Offline cap 12 h, efficiency 75 % |
| 500 | Auto-buy: crew lines (toggle, best payback first) |
| 1,000 | Auto-skills (toggle) |
| 1e4 | Head Start 20 % |
| 1e5 | Offline efficiency 100 % |
| 1e6 | Auto-gear |
| 1e8 | Head Start 30 % |

#### 4.8.2 Layer 2: Weave → Threads (unlocks at 1,550 m, the heart of the Loom)
- **Gain:** `Threads = floor(10 × 2^((cycleRecord − 1550)/150))`, where `cycleRecord` is the deepest
  point since the last Weave. Each Weave adds this to the Threads owned.
- **Recommended** when the gain is ≥ the Threads owned (doubling).
- **Why doubling every 150 m:** calibration over 7 days (the Loom spend modelled as Crew Weave, ×3 per
  doubling of Threads):
  - Every 200 m: the record flattened at 3,380 m from day 4, with no new biome after day 2.
  - ×2 per doubling instead of ×3: 2,740 m by day 7.
  - Every 150 m with ×3: 4,407 m by day 7 and a new stratum on days 2, 3 and 5.
  - Without Weave at all: 1,950 m by day 3, a drought.
- **Reset:** everything Rekindle resets, plus Embers to 0. **Kept:** perks (quality of life is never
  taken away), relics, bestiary, gems, records.
- **Live re-climb:** after a Weave, until you pass your previous best depth, Embers kindle *live*
  during the run (each new 100 m doubles them at once, no Rekindle needed). The first run of a cycle is
  one long snowball back to the record, not a chore of 7 Rekindles in 2 minutes (what calibration
  showed without this rule).
- **Spending:** Threads buy **Loom nodes** (choices, the long-term build). Node level costs grow ×2.

| Node | Per level | Max |
|---|---|---|
| Kindling | +1 % per Ember on the Ember bonus (10 % → 11 %…) | ∞ |
| Crew Weave | crew ×3 | ∞ |
| Steady Hands | Rally base +2 % | 10 |
| Golden Vein | gold ×2 | ∞ |
| Deep Lungs | every slope −0.0005 per m (1.09 → 1.085 at 10) | 10 |
| Night Shift | offline +10 % efficiency and +2 h cap | 5 |
| Head Start | +5 % of record | 6 |
| Chest Weave | chests 1 row more often (15 → 8 at 7) | 7 |
| Skill Weave | cooldowns −8 % | 5 |
| Ember Forge | Ember gain ×1.5 | ∞ |

Deep Lungs is the strongest late lever. At 10 levels it divides HP by 100 for every 1,000 m of depth
(log10(1.09/1.085) = 0.002 per metre).

#### 4.8.3 Layer 3: Breach → Sigils (unlocks at 2,900 m, the Last Gate)
Eight challenge runs. Each starts a fresh Weave cycle with a rule. Tier n requires reaching
`goal_n = base + 250·(n−1)` m. Each tier gives that challenge's Sigil +1, and each Sigil is a
permanent ×2 on its stat, kept forever.

| Challenge | Rule | Base goal | Sigil (×2 per tier) |
|---|---|---|---|
| Bare Hands | no crew | 600 m | taps |
| Sleepless | no offline, no skills | 900 m | offline efficiency (+10 %), cap +1 h |
| Granite | slopes +0.01 | 700 m | crew |
| One Crew | a single line of your choice | 800 m | the newest line |
| Blind | no preview, no events | 1,000 m | gold |
| Sprint | reach the goal within 15 min | 500 m | skills (cooldown −10 %) |
| Pauper | gold ×0.01 | 900 m | gold |
| Cold Start | Embers off | 1,200 m | Ember gain |

### 4.9 Contracts (always three on the board)
Contracts are generated from templates, with targets scaled to the current pace so that each takes
2–6 minutes:
- "Break {25 × tier} ore cells"
- "Reach {record + 30} m"
- "Use Dynamite 3 times"
- "Catch 3 Lucky Moths"
- "Defeat a guardian"
- "Open 4 chests"
- "Hit a 50 combo"
- "Buy {25} crew levels"
- "Find a relic"

**Rewards:** 3–8 gems plus 2 min of income. Every 5th contract is a **Grand Contract**: a relic,
15 gems and a Time Crystal. A finished contract is replaced at once, so there is never waiting and
no daily timers.

### 4.10 Pacing targets and the first run (sim)

| Depth | Biome | Target | Sim (5 taps/s, greedy) |
|---|---|---|---|
| 10 m | Topsoil | 0:15–0:40 | 0:15 |
| 20 m | Glowroot Caverns | 0:40–1:15 | 0:40 |
| 60 m | Crystal Grotto | 2:00–3:30 | 2:06 |
| 120 m | Halden Works | 5–8 min | 5:30 |
| 200 m | Fungal Deep | 10–15 min | 12:18 |
| 300 m | Drowned Ruins (Rekindle) | 18–28 min | 21:54 |
| 450 m | Magma Veins | 25–40 min | 30:36 |
| 650 m | Fossil Halls | 35–60 min | 41:30 |
| 900 m | Frost Hollow | > 90 min (the first wall) | 1:42 |

**First run, inside the shape (sim):**
- First purchase at 4 s, first crew at 5.5 s.
- Depth 990 m and gold 2e37 at 2 h.
- Taps per cell 2.2 / 5.7 / 9.4 (p10 / p50 / p90) over the first 45 min.
- The longest gap between rewards in the first 30 min is 27.5 s.

A human buys less optimally than the bot. **Target band:** a tester at 3–5 taps/s reaches every first-run
mark within ×1.0–×1.6 of the sim time.

**Prestige cadence** (sim, 7 days, Rekindle and Weave only; Breach not modelled):

| Day | Rekindles | Weaves | Typical run | Record at the end of the day | New biomes that day |
|---|---|---|---|---|---|
| 1 | 8 | 3 | 2 h (one session gap) | 2,623 m | 13 (Topsoil → Void Sea) |
| 2 | 7 | 3 | 2 h | 3,384 m | 1 (The Gate, at 29.5 h) |
| 3 | 5 | 3 | 2 h | 3,855 m | 1 (Echo I) |
| 4 | 2 | 1 | 4 h | 3,923 m | 0 |
| 5 | 4 | 1 | 2 h | 4,223 m | 1 (Echo II) |
| 6 | 2 | 1 | 6 h | 4,299 m | 0 |
| 7 | 1 | 0 | 8 h | 4,407 m | 0 |

**What the table says:**
- **Rekindle chains:** zero runs of under 3 minutes in a row over 7 days (E9). After a recommended
  Rekindle, the next run passes the old record in 33–381 s (15 of 15 over 2 days, law 5).
- **The first session is the fireworks:** Rekindles at 22.5 min (300 m), 33.9 min (646 m) and
  40 min (1,079 m), so 10 biomes in 42 minutes, one about every 4 minutes. This is deliberate (the
  first Rekindle should feel like magic). The knob is the 25 in the Ember formula: 10 slows the
  first session to about 650 m.
- **The long tail must come from Breach.** Without Sigils, the record flattens to +70–300 m a day on
  days 4–7. **Target with Breach:** at least +300 m a day and one new Echo stratum at least every
  2 days in week 2. Verify it by adding Sigils to the same harness before shipping.

### 4.11 Why the curves have this shape (the design math)
- Gold per cell is proportional to HP, so **income = damage per second / 100**, whatever the depth.
  Depth is then the logarithm of total damage dealt this run, so offline is exact (§3.3).
- Within a phase without new content, depth grows like `S × log10(time)` with
  `S = 1 / ((1 − α) × log10(slope))`, where α is the shop's DPS-per-gold exponent. Lines with
  r = 1.10 and ×2 per 10 levels give α ≈ 0.73. New lines and gear raise it in steps. That is the
  staircase: wall → new biome → gear and blueprint → burst.
- Comfortable taps per cell (3–6) need a row every 2.5–5 s (§2.2). The run is lively while
  content arrives, then turns stiff (the cue to Rekindle).
- Prestige stability: total Embers are 2^(record/100), and a ×10 DPS multiplier gives 110–250 m. A
  Rekindle that doubles power lands the next run 42–75 m past the record, against the 100 m needed for
  the next doubling. There is no runaway, and the time spent pushing always counts.
- **Deep crew lines (6+) are a geometric ladder (×1e4 per line), not HP-indexed:**
  - Lines priced fairly at their unlock depth make a self-sustaining ladder: past a ×300 multiplier, a
    single run swept to 8,800 m.
  - A compounding penalty (×100 cost and ÷10 output per line) made deep lines worthless, and days 2–3
    stalled.
  - A constant penalty (×30 / ÷3) still ran away.
  - Only the geometric ladder gives a steady 110–170 m per decade.

---

## 5. The descent and the world in the voxel engine

### 5.1 The camera (portrait, fixed, follows the descent)

**Lens and framing**
- Perspective camera with a vertical FOV of 30°: a near-orthographic diorama with little distortion.
- It looks along +z at the cut face (z = 0), pitched 6° down so the tops of the floor cells read.
- The face spans **10.0 m across** at 390 px (39 px per metre; the 7-cell shaft takes 273 px),
  9.2 m at 360 px and 10.5 m at 412 px.
- The camera distance follows from the aspect so that the width is constant.

**Vertical placement and follow**
- The floor sits at **42 %** of the visible world band (between the goal bar and the sheet).
  - Sheet at its normal detent (band y 94–620, 526 px = 13.5 m): 5.7 m of dug shaft above (rigs,
    the explorer, wall plaques) and 7.8 m of rock below.
  - Mini detent (band 94–732): 6.9 m above and 9.5 m below.
- The next 6 rows are fully readable: ores glint and chests show their silhouettes. Further rows fade
  into a depth fog. This is anticipation: you always see the next reward coming.
- Follow: a critically damped spring on y, half-life 0.18 s. A row break never jerks the frame.

**Gestures**

| Gesture | Effect |
|---|---|
| Horizontal drag | pans ±14 m into the side caverns (rubber band past that); after 4 s without touch it eases back |
| Vertical drag up | looks back up the shaft, up to 60 m (your rigs and the depth plaques), then eases back |
| Pinch | zoom 0.85–1.5× |
| Double-tap the depth counter | recentre |

**Reveal shot:** on a new biome the camera pulls back to 2.4× width in 0.8 s, holds 2.2 s with the
biome title, then returns in 0.6 s. A tap skips it.

### 5.2 World window (streaming, never a giant volume)

**The voxel window**
- `VoxelWorld(64, 96, 16)`: 98,304 voxels, 24 chunks. The light texture is 393 KB, against 3.3 MB of
  voxels and 13 MB of light today.
- **Shaft:** x 28–34 (7 columns), voxels z 0–5. A gameplay cell is a 1 × 1 × 6 stack, and breaking
  it sets 6 voxels to air.
- **Back wall:** z ≥ 6, never mined; it carries murals, crystals and lamps.
- **Side rock:** x 0–27 and 35–63. Caverns are carved into the face as open dioramas, 4–12 voxels
  deep.

**Recentring every 16 rows** (when the floor passes window row 48):
1. memmove the voxels by 16 rows (98 KB) and the light by the same (393 KB). Light is exact under a
   shift except in the new band.
2. Generate the new bottom 16 rows in the zone worker (deterministic per `runSeed, layer`).
3. Flood the new band's light locally and upload the light texture whole (393 KB, about 0.5 ms).
4. Move the chunk meshes up one layer, dispose the top layer, and mesh 4 new chunks plus 4 seam
   chunks in the mesh workers.
5. Shift props, creatures and the camera by 16 m in the same frame, so the shift is invisible.

**Hyper descent (visual cap):** above 12 rows per second the view stops simulating each cell.
- Rows break as one burst every 1/12 s.
- Above 40 rows per second, the shaft becomes a streak shader (cached layer meshes scrolled) with
  debris rain. The depth counter spins and the window regenerates only when the speed drops below
  12 rows/s or at a biome change.
- The economy is always the analytic model, so visuals never limit it.

### 5.3 What a layer contains (generator, per 16 rows)

**Shaft cells:** drawn from the cell mix (§4.3), with ores clustered in veins of 3–9 cells
(2D noise threshold per biome).

**Side caverns: at least one in every 16-row layer, alternating left and right**

| Cavern | Size (w × h × depth) | Frequency | Contents |
|---|---|---|---|
| Pocket | 3–5 × 2–4 × 4 | 2 per layer | 1–3 props, a 30 % chest, a 40 % creature |
| Grotto | 8–14 × 6–9 × 8 | 1 per layer | the biome's kit: 6–12 props, 1–2 creatures, a 50 % chest, a 15 % relic shrine |
| Hall (biome start) | 40 × 18 × 12 | 1 per biome | the **Wonder** (§6.3), a Royal Chest, a relic shrine, 3+ creatures, key lights |
| Guardian lair (biome midpoint) | 16 × 10 × 10 | 1 per biome | the guardian (§6.4) |

**Light budget per layer:** at most 6 emitter clusters (crystals, fungi, lava, lamps), with a warm
practical in every grotto, so caverns always read. The existing LightField and atmosphere presets
blend per biome.

**Back wall:** a mural every 30 m and a Halden note every 40–60 m (tap to read, §6.5).

### 5.4 The biome ladder

| # | Biome | Start | Rock families (existing layers) | Light | Ores (common / rich) | Creatures | Wonder | Unlocks |
|---|---|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | 0 | soil, gravel, umber | warm lamps | copper / amber | worm, mole | the Halden camp sign | Shovel Hand, Pick Crew (8 m), Lucky Strike (15 m), Dynamite (15 m) |
| 1 | Glowroot Caverns | 20 | moss, slate | cyan roots | tin / jade | lumen moth, root crawler | the Rootheart (a glowing tangle 18 m wide) | Mine Cart, Rally |
| 2 | Crystal Grotto | 60 | slate, crystal | cyan crystal | quartz / sapphire | echo bat, crystal beetle | the Geode (walk-in, faceted) | Steam Drill, Shockwave, Frenzy (40 m), Gold Rush (90 m) |
| 3 | Halden Works | 120 | deep slate, ancient brick, timber | amber lamps | iron / silver | rail rat, cart ghost | the Hoist Tower and crushers | Blast Team, Overdrive (160 m) |
| 4 | Fungal Deep | 200 | umber, moss | violet-green fungi | gold / spore pearl | spore toad, cap snail | the Mother Cap (a 30 m mushroom) | Tunnel Borer |
| 5 | Drowned Ruins | 300 | ancient tile, glyph | cold blue water glow | pearl / lapis | glass eel, lamp fish | the Ember Shrine (Rekindle) | Crystal Resonator, Earthquake, **Rekindle** |
| 6 | Magma Veins | 450 | hardened slate, ember | lava orange | ruby / obsidian | salamander, ash beetle | the Lava Falls | Magma Lance |
| 7 | Fossil Halls | 650 | umber, ironbound | amber | bone gold / amber | fossil crab, bone wyrm | the Titan Skeleton | Fossil Golem |
| 8 | Frost Hollow | 900 | echo crystal, slate | ice white | sapphire / rime | ice moth, frost wyrm | the Frozen Waterfall | Rime Auger |
| 9 | The Loom | 1200 | glyph, ancient brick | threads of light | lumen crystal / loomstone | thread spider, lantern-bearer echo | the Loom engine | Loom Weaver; **Weave at 1,550 m** |
| 10 | Iron Core | 1550 | ironbound, deep slate | magnetic blue | mythril / magnetite | iron mite, core ray | the Lodestone | Gravity Well |
| 11 | Star Heart | 1950 | crystal, ember | white-gold plasma | star shard / plasma pearl | star sprite, nova moth | the Buried Star | Star Forge |
| 12 | Void Sea | 2400 | bedrock, echo crystal | violet abyss | void pearl / null glass | void ray, drift jelly | the Floating Islands | Void Maw |
| 13 | The Gate | 2900 | glyph, bedrock | abyss violet and gold | gate stone / sigil ore | gatekeeper, echo of you | the Last Gate | Gate Engine; **Breach** |
| 14+ | Echo strata I, II… | +550 each | biome k mod 13 with a hue shift and roman numerals | shifted | tier-scaled | recombined | a recombined Wonder | an Echo line (Mk II…) |

Biome themes reuse the existing material layers and prop kinds (crystal, glyph, monolith, fire,
lantern, timber, masonry, the moth renderer), so the art cost is palettes and kits, not new systems.

### 5.5 What fills the space (the fix for "empty caverns")

**Content density (targets for the generator test)**
- Every screen at rest shows at least 8 interactive or animated things: rigs, the explorer,
  creatures, chests, glints, moths, plaques, a mural.
- At least 1 tappable reward is visible or one swipe away **at all times**.
- No 16-row layer is without a cavern.

**Crew rigs**

| Line | Rig on screen | Animation |
|---|---|---|
| Shovel Hand | small miners at the floor edge | each one strikes its cell every 1.0 s |
| Pick Crew | two miners on a ledge | alternating swings |
| Mine Cart | a rail along the left wall | the cart descends, unloads, climbs back up |
| Steam Drill | a gantry over the centre column | the drill head plunges; steam puffs |
| Blast Team | charges placed on the floor | a 3×3 blast every 6 s |
| Tunnel Borer | a side-mounted cylinder | rotates and grinds |
| Crystal Resonator | tuning forks on the walls | rings that shatter cells |
| Deep lines | escalating spectacle | a magma beam, a bone fist, a light loom, a gravity lens, a star furnace, a void mouth, the Gate's engine |

**The explorer** (the existing ExplorerModel): stands on the floor and swings toward each tapped cell.
The swing is shortened to 0.12 s, and taps faster than the swing queue a "flurry" pose.

---

## 6. Discovery, collections, events, the mystery thread

### 6.1 Relics (permanent, never reset)
- **Sets:** 6 relics per biome, so 84 authored, plus 6 per Echo stratum (generated names and icons
  from the specimen-icon system).
- **Effects:** each relic +3 % to its biome's stat (crew, taps, gold, crit, offline or chest), additive
  within a stat. A complete set gives +25 % to everything, 25 gems and a lore page.
- **Duplicates:** each duplicate raises the relic +1 level (+1 % per level), with no cap.

**Sources:**

| Source | Chance |
|---|---|
| Chest | 8 % |
| Guardian chest | 35 % |
| Grotto relic shrine | 15 % per grotto |
| Royal Chest (gem key) | 100 % |
| Grand Contract | 100 % |
| Fossil cell | 5 % |

**Pity:** if no relic has dropped in 25 chests, the next one drops a relic.

### 6.2 Bestiary
- **Species:** 3 per biome (42 authored, plus Echo recolours).
- **Appearance:** creatures appear in caverns and on the face: each grotto has 1–2, each pocket a
  40 % chance. Some cross the shaft above the floor.
- **Catching:** tap a creature 3 times. Each catch pays 10 s of income.
- **Tiers:** catch counts 1 / 10 / 100 / 1,000 / … each give +2 % gold (per species, no cap).

### 6.3 Wonders
One per biome, in its start Hall:
- the first sight plays the reveal and pays 10 gems;
- each Wonder has one tappable secret (a glyph, a socket, a lever) that pays a relic once per
  lifetime.

### 6.4 Events (active play only)

| Event | Trigger | Window | Interaction | Reward |
|---|---|---|---|---|
| Lucky Moth | every 90–180 s (the first is scripted at about 1:40) | 8 s on screen | 1 tap | one of: Gold Shower (60 s of income), Moth Frenzy (DPS ×7 for 20 s), Gems (2), Skill Refresh |
| Vein Rush | 1 in 40 rows | 10 s | break the glowing vein | ore cells ×10 gold |
| Cave-in | every 4–6 min after 60 m | 6 s | 3–6 falling boulders, 1 tap each | 10 s of income each; all caught = +1 gem |
| Guardian | each biome's midpoint (and every 100 m in Echo strata) | 30 s timer | tap it; HP = 25 s of total DPS | Guardian chest: 3 min of income, 5 gems, 35 % relic, a bestiary entry. Failure: it retreats and returns on the next row press; no penalty |
| Gold Seam | 1 in 200 rows | – | a whole row of gold | ×20 row gold |
| Geode | 1 in 40 rows (rare cell) | – | 5 taps | 1–3 gems and 20 s of income |
| Echo Call (5+) | 1 per biome | 12 s | a glyph sequence of 4 taps on the back wall | a lore page fragment and 5 gems |

### 6.5 The mystery thread
- **The question:** who carried light down here, the Lantern-bearers, and what is answering from below?
- **Delivery, in order:**
  1. Environment: murals every 30 m, Wonders.
  2. **Halden notes** of 2–4 lines (40 authored, about 3 per biome; tap one on the back wall).
  3. **Lore pages** from relic sets (14).
  4. **Prestige beats:** the Ember Shrine (why the Embers?), the Loom (the crystals were the
     Lantern-bearers, kept as light), the Gate (it opens from the other side).

**The arc, beat by beat:**

| Depth | Find | Belief | New question |
|---|---|---|---|
| 0–120 m | Halden camp, rails, notes about quotas | a mining company dug here | why did they stop? |
| 120–300 m | the Halden Works abandoned mid-shift; "the singing" | something below frightened them | what sings? |
| 300 m | the Ember Shrine: Lantern-bearer murals of a procession carrying lights down | they went down on purpose | where were they going? |
| 900–1550 m | the Loom: archive halls of identical crystals | the crystals *are* them | what did they need to become? |
| 2900 m+ | the Gate, open from the other side; Echo strata start to echo your own descent | it is calling you, and every Rekindle is you answering | (it never closes: Echo notes keep coming, procedurally recombined from 60 fragments) |

---

## 7. Guidance

### 7.1 Tutorial script, first three minutes (beat → trigger → what the player sees)

All text comes from `src/i18n/en/idle.ts`. A hint never blocks: it is a pulsing ring plus one line.
It disappears on the first correct action, and returns after 6 s of doing nothing.

| t (sim depth times) | Trigger | Screen | Text key / English |
|---|---|---|---|
| 0:00 | boot | the surface: grass, a sign, the shaft mouth; a pulsing hand on the centre cell | `tut.tap` "Tap to dig" |
| 0:01 | first tap | the cell bursts (100 HP, 100 damage); 1 gold flies; the counter appears | – |
| 0:02 | combo hits 5 | the combo ring appears | `tut.combo` "Keep tapping for a combo!" |
| 0:04 | 30 gold | the bottom sheet rises with **one** card: Pick; the arrow pulses | `tut.pick` "Upgrade your pick" |
| 0:05 | 50 gold | the Shovel Hand card appears; the rig drops in on hire | `tut.crew` "Hire a Shovel Hand: digs even while you're away" |
| 0:06 | 3 m | an ore vein in the next row is highlighted | `tut.ore` "Ore! Worth 2.5×" |
| 0:09 | row 6 | a chest in the floor | `tut.chest` "A chest! Break it open" (+5 gems; the gem counter appears) |
| 0:12 | 8 m | Pick Crew card; **the goal bar appears** | `goal.depth` "Reach 20 m: a new cavern" |
| 0:25 | 15 m | the Dynamite button lights; a ring on it | `tut.dynamite` "Dynamite: blast 3 rows" |
| 0:40 | 20 m | **Reveal: Glowroot Caverns.** Gear tab unlocks; a blueprint card flies into Crew | `biome.glowroot` / `tut.gear` "New gear: one tap, big boost" |
| 0:50 | after the reveal | the arrow points at the side cavern (relic shrine) | `tut.swipe` "Swipe to look around" → tap the shrine → Relic 1/6 |
| 0:55 | first gear bought (Rally unlocks at 20 m) | Rally card | `tut.rally` "Rally: each tap adds 14 % of your crew's power" |
| 1:09 | 40 m | Frenzy lights | `tut.frenzy` "Frenzy: the floor shakes for 15 s" |
| 1:40 | scripted | **the first Lucky Moth** crosses slowly (10 s) | `tut.moth` "Catch the moth!" |
| 2:00 | 2 contracts possible | the contract board slides in (3 cards) | `tut.contracts` "Contracts: goals with gem rewards" |
| 2:06 | 60 m | **Reveal: Crystal Grotto.** Shockwave unlocks | `tut.shock` "Shockwave: every tap hits its neighbours" |
| 2:54 | 90 m | Gold Rush lights | `tut.goldrush` "Gold Rush: ×5 gold for 20 s" |
| 3:00 | – | tutorial done; contextual hints only from now on | – |

The tutorial introduces one new thing every 10–25 s for three minutes, then lets the loop breathe.

### 7.2 Contextual hints (after the tutorial; each shown at most 3 times in a lifetime)

| Condition | Hint |
|---|---|
| no tap for 6 s while taps per cell ≤ 8 | the hand pulses over the floor |
| an affordable card unbought for 20 s | the card's buy button pulses; best payback card marked ▲ |
| a skill ready and unused for 30 s | the skill ring pulses |
| a chest, creature or relic visible for 5 s untouched | a soft arrow |
| rows slower than 45 s and Rekindle recommended | the goal bar switches to Rekindle; `hint.rekindle` "The rock is hardening. Rekindle for ×{n} power" |
| returning after more than 1 h | the return card (§3.4) |

### 7.3 The always-visible goal bar (the "next goal is nearly done" engine)
The bar is always visible: one goal, its progress bar and its reward icon. Tapping it opens a list of
the 3 best goals.

**Candidates** (re-evaluated every 0.5 s):
1. Tutorial step (until 3:00).
2. Next depth target: the next biome start if its ETA is ≤ 90 s, otherwise the next 10 m mark.
3. The cheapest unbought card with cost ≤ 3 min of income ("Steam Drill: 72 %").
4. The next ★ on any line within 2 min.
5. The contract nearest completion.
6. Rekindle when recommended.

**Choice:**
- Highest progress fraction in [0.15, 1) with an ETA ≤ 90 s. Ties go tutorial > Rekindle > depth >
  card > ★ > contract.
- Hysteresis: a goal stays at least 4 s unless it completes.
- **Fallback:** if no candidate qualifies, show the next 10 m mark. At ≥ 1 row every 9 s that is always
  ≤ 90 s away. When walled, Rekindle is recommended instead.

**On completion:** the bar fills with a flash, the reward flies to its counter, and the next goal slides
in from the right within 0.3 s.

### 7.4 Card helpers
- Every unaffordable card shows "in 12 s" (time to afford at the current income).
- The best-payback card carries a green ▲.
- The Max button previews "+37 levels".

---

## 8. Portrait UI layout (390 × 844 CSS px; the 360 × 740 and 412 × 915 variants scale by width)

```
 y=0    ┌────────────── safe-area inset (--safe-top) ──────────────┐
 +0     │ ◉ 1.23 M gold   +4.5K/s      128 m      ◆ 37 gems    ⚙   │ 64 px HUD (Lintel 28/36 px)
 +64    │ [▮▮▮▮▮▮▮▯▯] Reach 150 m: Halden Works        ▸ 72 %      │ 30 px goal bar (16 px gutters)
 +94    │                                                          │
        │          WORLD (full-bleed underneath everything)        │ tappable: +94 … 560
        │    rigs · explorer · floor at 42 % · 6-row preview       │
 560    │  ( Dyn )( Frz )( Gold )( Ovr )( Qk )      combo ×1.6 ◯   │ 60 px skill dock, 52 px buttons
 620    ├──────────────────────────────────────────────────────────┤
        │ Pick │ Crew │ Gear │ Skills │ Album │ ⋯      ×1 ×10 Max  │ 40 px tab strip
        │ ┌──────────────────────────────────────────────────────┐ │
        │ │ [icon] Steam Drill  Lv 37  ★7/10   +1.2M/s  [ 4.5B ]│ │ 72 px cards (2.5 visible)
        │ └──────────────────────────────────────────────────────┘ │
 844    └──────────── safe-area inset (--safe-bottom) ─────────────┘
```

**Areas**
- **Bottom sheet:** three detents.
  - Mini: 112 px (tabs plus the best-buy card).
  - Normal: 224 px.
  - Browse: 70 % of the height, still scrollable.
  - The world stays tappable above it.
- **All touch targets ≥ 48 px** (the existing ui-check audit). Buy buttons are 96 × 56 px.
- **Overlays** (octagon plates, "Lamplight on the Lintel" brand): Rekindle, Lantern Tree, Loom,
  Album (Biomes / Relics / Bestiary / Notes), Records, Settings, the return card. Each opens in one
  tap from ⋯ or from its trigger, and closes with Back (Android bridge) or a swipe down.

**Updates and accessibility**
- Counters change the DOM at most 10 times per second, and only on change (the existing Hud rule).
- Floating numbers and coin flights are WebGL instanced sprites, not DOM.
- Text size Large scales the HUD by 1.2 and keeps the sheet's card height.
- Left-handed mode mirrors the skill dock.

---

## 9. Juice and feel

| Event | Visual | Audio (synth) | Haptic | Camera |
|---|---|---|---|---|
| Tap hit | flash 60 ms; 2–4 chips; crack stage; damage number (white, 18 px, rises 24 px in 0.5 s) | biome sound kind, pitch +1 st per 10 combo | 8 ms | – |
| Crit | gold number 26 px with a pop; spark ring | bright ping | 14 ms | kick 0.6° |
| Cell break | 6–14 chunks (Debris) plus dust puffs; 1–5 coins arc to the counter in 0.45 s; the counter bumps ×1.15 for 120 ms | crunch plus coin tick (ticks merged above 12/s) | 10 ms | – |
| Rich ore / gem | 2× chunks; glow burst; coins ×3 | chime chord | 20 ms | – |
| Row cleared | the floor drops; a dust curtain | thud | – | follow spring |
| ★ milestone | the card star fills; the rig flashes gold | 3-note fanfare | 25 ms | – |
| Pick tier | spotlight on the explorer; name banner 1.2 s | rising arpeggio | 40 ms | zoom 1.08 |
| Dynamite / Earthquake | a 3-row blast: 120 chunks (capped by the preset), flash, light bloom | boom with low end | 60 ms | shake 0.25 m for 0.4 s |
| Chest | lid pops, loot fountain | coin cascade | 20 ms | – |
| Biome reveal | pull-back shot; title in Lintel 44 px; a new atmosphere preset blends over 1.5 s | biome theme sting, then music stem change | 40 ms | §5.1 |
| Rekindle | the whole shaft collapses upward into embers that stream into the Lantern; white-out to the surface | swelling chord | 80 ms | – |
| 1e100 (Googol) | the gold counter turns white-gold; confetti of digits | choir pad | 60 ms | – |

**Rules and budgets**
- Coins merge into bigger coins when more than 30 are in flight.
- A chunk is capped by the preset's particle budget (High 400, Balanced 220, Battery 120).
- No hit-stop on ordinary breaks (it would fight 5 taps/s). Crits and blasts get 30 ms.
- **Music:** the existing MusicScheduler gets one stem set per biome group (4 groups) plus an
  intensity layer driven by rows per second.

---

## 10. Technical plan (reusing the engine)

### 10.1 Add

| File | Content |
|---|---|
| `src/idle/num/Big.ts` | mantissa/exponent number: add, sub, mul, div, pow, log10, cmp, fromLog10, toJSON |
| `src/idle/num/notation.ts` | suffixes, letters, scientific; `depthText` |
| `src/idle/econ/curves.ts` | slopes, `lH(d)` (log10 HP), segment list, biome index |
| `src/idle/econ/tables.ts` | pick, Rally, Crit, Shockwave, lines (formula plus authored names), gear, skills |
| `src/idle/econ/Run.ts` | run state; damage (taps, crew, spill); buy (×1/×10/Max); gear; skills |
| `src/idle/econ/Meta.ts` | Embers, perks, Threads, Loom, Sigils, relic and bestiary multipliers |
| `src/idle/econ/offline.ts` | the closed form (§3.3) |
| `src/idle/econ/prestige.ts` | gain formulas, the recommend rule, the "you will pass X in about Y" estimate |
| `src/idle/econ/goals.ts` | the goal selector (§7.3) |
| `src/idle/econ/sim.ts` | the headless bot (Appendix A), shared by tests and the tool |
| `src/idle/content/{biomes,cells,relics,creatures,notes,contracts,events}.ts` | data tables with i18n keys |
| `src/idle/world/ShaftWindow.ts` | the 64×96×16 window, recentring, the cell ↔ voxel map |
| `src/idle/world/shaftGen.ts`, `shaftWorker.ts` | layer generation (cells, veins, caverns, props, emitters) in a worker |
| `src/idle/game/IdleGame.ts` | frame loop and modes (boot, menu, playing, paused, crashed), replacing Game.ts for this mode |
| `src/idle/game/ShaftCamera.ts` | §5.1 |
| `src/idle/game/DigController.ts` | tap → cell, crew strikes, spill, crack stages, Hyper mode |
| `src/idle/game/{CrewRigs,Creatures,EventDirector,Reveal,Explorer}.ts` | view systems |
| `src/idle/ui/{Hud,GoalBar,Sheet,Cards,SkillDock,ReturnCard,RekindleScreen,Album,LanternTree,Loom}.ts` | DOM UI on the brand plates |
| `src/idle/ui/FloatSprites.ts` | instanced digit and coin sprites (1 draw call each) |
| `src/i18n/en/idle.ts` | all new text |
| `src/save/v3.ts` | the schema (below); `migrateV2` |
| `tools/econ-sim.ts` | prints the tables in §1.3 and §4.10 (`node tools/run-ts.mjs tools/econ-sim.ts`) |
| `tests/unit/idle-*.test.ts` | §11 |

### 10.2 Reuse as is (or nearly)
- VoxelWorld, the mesher, ChunkRenderer, meshPool and meshWorker.
- LightField, with whole-texture upload on recentring.
- terrainMaterial and materials, StructureRenderer (for Halden timber and Gate masonry).
- PropRenderer and its prop kinds.
- Debris, Particles, Halos, LumenMoths (the Lucky Moth renderer).
- TargetMarker, driven by the cell HP fraction.
- PostFX, the QualityGovernor, AudioSystem, sfx and the MusicScheduler.
- Haptics, with new event names.
- The brand (tokens, the Lintel font, wordmark, sprites), screenFormat (portrait lock instead of
  landscape), the crash panel, main.ts and the Android bridge.

### 10.3 Replace
| Old | New |
|---|---|
| Game.ts | IdleGame.ts; Game.ts deleted after the switch |
| CameraRig | ShaftCamera |
| TouchControls | joystick and look removed; tap, drag and pinch reporting kept |
| TapController | DigController |
| Hud.ts | idle Hud |
| `save/types.ts` v2 | v3 |

### 10.4 Delete (after the switch is green)

**world/**
- `world/gen/generateWorld.ts`, `world/gen/features/*`, `world/gen/architecture.ts`,
  `world/gen/progression.ts`
- `world/analysis/{homeField,reachability,economy}.ts`

**game/**
- `game/{PlayerController,aimAssist,touchCamera,Progression,WorldFeatures,ropeRide,Survey,Stations,Runes,MenuCamera}.ts`

**gameplay/** (`gameplay/Mining.ts` keeps only `rollDrop`, moved)
- `gameplay/{Inventory,Crafting,Cold,Lantern,Expedition,CacheSpot,Objectives,Tree,Storage,Equipment,Health}.ts`

**config/**
- `config/recipes.ts` and most of `config/items.ts`

**Tests and fixtures**
- The tests and fixtures for all of the above, and `tests/unit/genVersion.test.ts` (replaced by a
  shaftGen fingerprint).

### 10.5 Save v3 (JSON, about 6–20 KB)
```
{ version: 3, savedAt, playTime, seed,
  run:  { depth, rowProg, cells: [7 hp fractions], gold: "m,e", pick, rally, crit, shock, lines: [L…],
          gear: [ids], skills: {id: {lvl, cd}}, combo: 0, rack: n, dmaxRun },
  meta: { embers: "m,e", threads, loom: {node: lvl}, sigils: {id: tier}, perks: auto-derived,
          relics: {id: lvl}, bestiary: {id: count}, biomesSeen: [], notes: [], records: {…},
          gems, timeCrystals, lifetime: {taps, cells, gold:"m,e", dmax} },
  settings }
```
- **Cell HP:** remaining fractions (float64 in [0,1]), never absolute Big values. Damage applies as
  `dmg / HP(d)` in log space, so precision is exact at any depth.
- **Autosave:** every 30 s, on pause or visibilitychange, after a Rekindle, and 2 s after a burst of
  purchases.
- **migrateV2:** a v2 save starts a fresh v3 game plus a "Veteran" gift: 50 gems, 1 relic (the Halden
  Lamp) and the Album entry for the old Hollow.

### 10.6 Performance budget (2022 mid-range, Balanced preset)

| Item | Budget |
|---|---|
| Draw calls | ≤ 90 (24 chunks + structures + props ≤ 30 + rigs ≤ 12 instanced + FX ≤ 8) |
| Triangles | ≤ 120 k |
| Economy tick | 10 Hz logic, ≤ 0.2 ms; Big operations ≤ 300 per frame |
| Recentre | ≤ 2 ms on the main thread (memmoves plus the upload); meshing in workers; never 2 shifts in a frame |
| Main-thread JS | ≤ 5 ms per frame at 12 rows/s |
| GPU memory | light 393 KB + lantern 32 KB + chunk buffers ≤ 6 MB |
| Save | ≤ 3 ms stringify |

### 10.7 Risks and answers

| Risk | Answer |
|---|---|
| Recentre hitch | memmoves of 98 + 393 KB measure about 0.1 ms; mesh in workers; the old meshes stay until the new ones land (the existing job-id rule) |
| Particle storms at high rates | Hyper mode (§5.2) plus coin merging plus preset caps |
| Big precision | cell HP stored as fractions; Big only for totals and costs; tests at 1e300 and 1e5000 |
| DOM churn from counters | ≤ 10 Hz text writes; FloatSprites in WebGL |
| The bot is not a human | the §11 bands are wide (×1.6), and an e2e "human" script taps at 3/s with a 2 s buy delay |
| Clock tampering | clamp; single player; no anti-cheat beyond that |
| Early content too fast | the slope and pick knobs are in one table (`curves.ts`); `tools/econ-sim.ts` reprints the pacing in under 30 s |

---

## 11. Acceptance metrics (a test or the simulation can check each one)

**Run in Vitest** with `src/idle/econ/sim.ts`, the bot at 5 taps/s, greedy within a 60 s horizon,
no skills or events (so these are conservative):

| # | Metric | Pass |
|---|---|---|
| E1 | the first tap breaks the first cell | HP(0) = pick(1) = 100 |
| E2 | first purchase | ≤ 6 s |
| E3 | first crew hire | ≤ 10 s |
| E4 | first-run depth times | 20 m ≤ 1:15; 60 m 2:00–3:30; 120 m 5–8 min; 200 m 10–15 min; 300 m 18–28 min; 650 m 35–60 min; 900 m > 90 min |
| E5 | the longest gap between rewards (purchase, chest, biome, moth) in the first 30 min | ≤ 30 s |
| E6 | taps per cell over the first 45 min | p50 ≤ 7, p90 ≤ 12 |
| E7 | offline closed form vs 1 s steps (7 cases, 1–24 h, depth 0–3,000 m) | depth error ≤ 1e-6 m, gold error ≤ 1e-9 in log10 |
| E8 | after a recommended (×2) Rekindle, the next run passes the old record | within max(7 min of active play, 30 % of the previous run) |
| E9 | no Rekindle chains | over 3 sim days, no 3 consecutive Rekindles with runs < 3 min |
| E10 | 3-day session sim | record ≥ 3,500 m (sim 3,855 m); ≥ 1 new biome on each of days 2 and 3 |
| E11 | 1e100 gold | reached by day 3 in the session sim (sim: about 25 h, near 2,650 m) |
| E12 | the goal bar always has a goal ≥ 15 % done with an ETA ≤ 90 s, or the 10 m fallback | 100 % of 0.5 s samples over a 2 h sim |
| E13 | the cell mix's expected multiplier | 1.00 ± 0.01 for every biome table |
| E14 | Big arithmetic | add, mul and pow round-trip vs log10 within 1e-12 relative; formats match the notation table up to 1e3000 |
| E15 | the save round-trips | v3 ↔ JSON identical; v2 migrates; a corrupt slot falls back (existing two-slot rule) |
| E16 | law 6: no store, no ads, nothing timed against absence | a static scan of `src/` finds no payment or ad API; Playwright's request log is empty during 10 min of play; no reward depends on wall-clock days |

**Run in Playwright** (390 × 844, touch, SwiftShader):

| # | Metric | Pass |
|---|---|---|
| U1 | every tap on the world area hits a cell or an object | 0 misses in 500 random taps |
| U2 | all touch targets | ≥ 48 px (ui-check) |
| U3 | the goal bar is visible and non-empty | in every frame of a 5 min scripted play |
| U4 | the return card appears after a simulated 2 h offline with the correct closed-form depth | ±1 row |
| U5 | at least 8 interactive or animated things on screen, and 1 reward in view or one swipe away | sampled every 2 s |
| P1 | frame time on the Balanced preset at 12 rows/s (perf.mjs) | median ≤ 16.7 ms, p95 ≤ 22 ms on the reference profile; recentre adds ≤ 2 ms |
| P2 | draw calls / triangles | ≤ 90 / ≤ 120 k |

---

## Appendix A: the calibration model (what the numbers above come from)

- **Files** (scratch, to be ported to `src/idle/econ/sim.ts`), all in
  `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/idle/economy/`:
  - the model: `m4.mjs`, with the final configuration in `k_g4.json`
  - the runner and table printer: `showk.mjs`, `tables.mjs`
  - Rekindle and Weave over days: `weave.mjs`, plus `weave_pass.mjs` for law 5
  - offline verification: `offline.mjs`
  - multiplier leverage: `cmeasure2.mjs`
- **State per run:** depth, row progress, gold, pick level, line levels, gear bought.
- **Step:** 0.5–1 s active, 60 s offline.
- **Damage:**
  `DPS = Σ lines + 5 taps/s × min(tapDmg, cellHP)` with
  `tapDmg = (pick + 0.14·crew) × combo 1.5 × crit 1.2`.
  Taps never deal more than one cell's HP in the model (overkill spill is conservative).
- **Gold:** HP dug / 100. Chest every 15 rows = 30 s of income. Lucky Moth every 150 s = 40 s of
  income (the first at 100 s).
- **Bot:**
  - every step it buys the item with the best `ΔDPS / cost` among items affordable within 60 s of
    income, with crew valued at 1.3× (they work offline);
  - it hires the first Shovel Hand as soon as possible after 15 s (the tutorial);
  - it follows the §4.8.1 recommend rule exactly: gain ≥ owned with rows > 8 s (or gain ≥ 10×), or
    walled (rows > 45 s, run > 10 min, gain ≥ 25 %). It never Rekindles in the last 3 minutes of a
    session (a player would not reset just before leaving);
  - it Weaves when the cycle's Thread gain is at least the Threads owned (and ≥ 6 h after the last
    Weave). The Loom spend is modelled as Crew Weave only: ×3 per doubling of Threads.
- **Session schedule:** 40 min, then 6 min every 2 h from 08:00 to 24:00. Offline 50 % with the
  3 / 6 / 12 h cap.
- **Knobs that were tuned** (coordinate descent against the §4.10 targets plus comfort, then by hand):
  slopes 1.30 / 1.09 / 1.08 / 1.085 / 1.09, Q = 0.01 gold per HP (display), pick c0 30 and r 1.2,
  tier ×2.5, Rally 14 %, line r 1.10, line cost 26.6 rows and output HP/44.4 at unlock (lines 0–5),
  the ×1e4 geometric ladder for lines 6+, gear 2.5–7.5 rows, total Embers 25·2^((record−300)/100), and
  Threads.
- **Rejected along the way** (the reasons are kept so nobody re-tries them):
  1. Gold growing faster than HP: a runaway to 300 m in 3 min, then a hard wall.
  2. The pick at ×2 per 10 levels: the first 2 min were limited by tap rate at 1 tap per cell, with no
     crack feel.
  3. Crew lines too generous at unlock (HP/2.5): a runaway to 8,800 m in 10 min.
  4. Deep lines priced fairly at their unlock depth: a phase transition, sweeping all lines once the
     multiplier passes ×300.
  5. A compounding penalty on deep lines: days 2–3 stalled.
  6. A constant penalty: runaway on day 1.
  7. Embers on gold as well as DPS, or Embers computed per run: Rekindle chains of 15–80 s runs.
  8. A first Rekindle of 5 Embers: the second run was slower than the first, and no new biome for 24 h.
  9. A bot that saves for the "best ratio" item regardless of price: purchases froze for days. Real
     players buy what they can afford (60 s horizon).
