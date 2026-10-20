# DEEP DOWN: the idle descent, designed from progression and reward psychology (KEY `progression`)

This design answers every demand of the director. Its angle is the progression and reward system: how buying feels, what
the player is chasing at every second, how rewards are scheduled and staged, the achievements, the Ladder map, the unlock
cadence and the long-term pull.

Every number below comes from a calibration model I ran for this document (rules in Appendix A). The model is in the
scratchpad: `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/idle/progression/`
(`econ3.mjs`, `world3.mjs`, `forward3.mjs`, `goalbar.mjs`, `fwdstats.mjs`; run with
`CREWB=3 ECON='{"formMult":2.5}' EP=3 EK=5 RITE=1`). Section 10 ports it to
`tools/sim-progression.ts`, and section 11 turns its outputs into tests.

Reference player: 4 taps/s while playing, buys whenever something good is affordable, saves for an available tool form.
Sensitivity runs at 3 and 2 taps/s are given next to the reference.

---

## 0. Thesis: the game is never further than one bar from a reward

### 0.1 Why the current build has no pull

The current build has three faults, seen from the reward angle:

1. **There is no goal on screen.** The brain's reward system fires on predicted progress, not on effort. With no visible
   target, every tap is effort with no prediction.
2. **There is no reward schedule.** Mining a block pays the same thing every time, and the payoff is a slow walk back.
   Fixed, delayed rewards are the weakest schedule there is.
3. **Nothing compounds.** No purchase visibly changes the next ten seconds, so there is no "I'm getting stronger" loop.

### 0.2 The engine in one sentence

**The timing of the next reward is always shown, but its size is a surprise.** Bars, ETAs and the Ladder tell the
player exactly when the next payoff lands (anticipation, the goal-gradient effect). Crits, cell types, chest roll-ups and
facet rarities make the size uncertain, and uncertain size is what keeps reward prediction from flattening out.

### 0.3 The reward clocks (the contract every system below serves)

| Clock | Period (first hour) | Period (day 3) | What fires | Source |
|---|---|---|---|---|
| Strike | 0.25 s | 0.25 s | number, crack stage, spark | §2 |
| Break | 0.6–2 s | 0.3–1.5 s | burst, coins fly to the counter | §2, §9 |
| Purchase | 0.5–2.5 s (median) | 5–15 s | arpeggio note, level tick, pip fill | §4.3, sim |
| Star ★ (×2) | 10–40 s | 60–70 s | card flip, ×2 stamp | §4.5, sim |
| Chest | 1.5–2.5 min | 1–2 min (charted rock is fast) | roll-up reveal | §4.8 |
| Event | 60–120 s | 60–120 s | golden moment, one tap verb | §6.7 |
| Unlock (new thing) | 1–3 min until 17 min, then 4–18 min | 10–20 min | new form, crew line, biome, system | §4.12 |
| Tool form | 1:11, 2:30, 3:44, 6:07, 8:38, 11:49, 15:12, 23:16, 33:55, 52:44 | every new 100 m | evolution ceremony and a facet pick | sim |
| Achievement tier | about 1 per 2 min (first 30 min) | about 1 per 10 min | medal toast, Marks | §6.2 |
| Record | every run | every run | violet NEW RECORD stamp | §6.5 |
| Rekindle | first at 16–35 min | 2–3 per day | the Rekindle ceremony and a faster next run | §4.10 |
| Lintel Rite | — | first at the start of day 3 | the second layer | §4.11 |

### 0.4 Guard rails

There are no purchases in DEEP DOWN (offline, procedural, no store), so the dopamine design never serves monetization.
That leaves room to be generous and honest:

- **No timers.** Chests open at once, upgrades apply at once.
- **Odds are always shown.** Pity counters are visible, and the near-miss flicker only shows on rolls that really were
  close (§4.8).
- **No loss for being away.** A missed daily pauses the streak instead of resetting it, and offline time only adds.
- **One optional break nudge.** After 45 minutes of continuous play, a toast says "Your crew keeps digging while you rest:
  +38 m in 4 h". It can be turned off in Settings.
- **Reduced motion.** Every shake and flash obeys `prefers-reduced-motion` (`ui/brand/motion.ts`). Fades are capped at
  150 ms, there is no shake, and the bloom spikes are halved.

---

## 1. Core loop at three scales

### 1.1 Ten seconds: tap, crack, burst, coins, buy

1. Tap a cell at the dig front. It cracks one of its 10 stages, shows a damage number and sparks (4% of the time a gold
   CRIT).
2. The cell bursts and coins arc into the gold counter, which punches.
3. A Quick-Buy button fills like a progress bar as gold arrives.
4. When the bar is full the button lights. One tap buys, plays a rising note and ticks a pip on the card's 10-pip ring.
5. The tenth pip is a ★, which doubles that card.
6. Meanwhile the crew hack at the side cells and the row drops away. The camera eases down 1 m and the next row shows
   what is coming (an ore vein, a chest, a gem glint).

### 1.2 Three minutes: a slice of the descent

In the first three minutes of the reference run the player gets:

- 64 pick levels and 16 stars, including the first Star Ladder step at 2:32;
- 2 tool forms (Iron Pick at 1:11, Twin Picks at 2:30) and 1 facet choice;
- 3 crew hires (Digger at 0:21, Mole at 1:01, Ore Cart at 2:44) and the first crown (2:55);
- the first chest (scripted at 6 m), the first achievement tiers, the first biome reveal (Glowroot Caverns at 20 m, 1:50).

The first event follows at 4:00.

Every later three-minute window holds at least one ★, one chest, one event and one goal-bar payout.

### 1.3 Three days: Rekindle, the Lintel Rite, collections

| Played (session model: day 1 is 4 × 15 min, days 2+ are 5 × 10 min) | Record (sim) | What happened |
|---|---|---|
| 0:15 (day 1) | 107 m, then 152 m after 2 h away | crew dug 45 m while offline |
| 0:16 | first Rekindle at 154 m, +18 Embers | Ember power ×2.8 |
| 0:47 | Rekindle 2 at 394 m, +305 Embers | 154 m reached at 7:14 instead of 16:01 |
| 1:00 (end of day 1) | 574 m, then 681 m after the night | 5 biomes deeper than run 1 |
| 1:50 (end of day 2) | 1,117 m, then 1,179 m after the night | 4 Rekindles |
| 1:51 (day 3, first session) | **Lintel Rite 1** at 1,182 m, 6 Stones | the second layer opens |
| 2:40 (end of day 3) | 1,312 m, then 1,417 m after the night; HP 1e45, gold 1e47 | 1 Rite, 6 Rekindles, target ≥ 50 achievement tiers |
| 6:00 (end of day 7) | 2,044 m, gold 1e61 | 3 Rites, 12 Rekindles |

### 1.4 What keeps it endless

1. **Rock has no bottom.** Past the Lintel Gate (840–999 m), Echo strata repeat the biome ladder every 150 m with a
   mutator and a new palette, a new crew line every 140 m and a new tool form every 100 m.
2. **Numbers have no ceiling.** `Big` numbers go past 1e308. Every 1e15 of lifetime gold changes the counter's skin and
   gives a Démesure tier.
3. **Each run is different.** Facets (36 plus 6 duo facets) are picked 1 of 3 at every tool form, and the set bonuses
   change the build.
4. **The two prestige layers each make the next climb visibly faster.** The ghost lantern, charted rock and split times
   are on screen.
5. **Collections hold 208 entries.** Each 10 entries pay a Codex chest, and each finished biome page gives a permanent
   seal.
6. **Achievements continue past the Lintel tier.** Every family keeps going with endless Lintel II, III, … tiers.

---

## 2. The tap

### 2.1 Input

- **Tap.** A press shorter than 230 ms with less than 14 px of movement (the existing `TouchControls` rule) is reported
  as `input.tapPressed` with `tapX` and `tapY`. `MiningController.pick()` casts it.
- **Hold.** On rock, a hold auto-strikes at 5 per second, so tired thumbs can rest. During a hold the combo builds at half
  rate.
- **Target.** A tap selects the exposed cell under the finger. If it hits open space within 36 px of a cell, it snaps to
  the nearest exposed cell. If it hits a crew member, a chest or a creature, it acts on that.
- **Latency.** Feedback starts in the same frame: the number, the crack stage and the flash. Damage is applied in the
  step.

### 2.2 What one tap does (resolution order, all in pure `gameplay/idle/Tap.ts`)

1. `base = pickDmg(L) × 2.5^forms × power × starLadder`, where `pickDmg(L) = L × 2^floor(L/10)`.
2. `share = 0.03 × forms × crewDPS`. Each tool form makes every tap also deliver 3% of the crew's DPS, so tapping stays
   about 60% of an active player's output all game (sim tap share: 0.78 at 1 min, 0.68 at 3, 0.60 at 10, 0.59 at 30,
   0.64 at 60, 0.64 at 120).
3. **Combo.** A tap within 0.6 s of the last one adds +1. After 0.6 s without a tap the combo decays at −10 per second.
   The multiplier is `1 + 0.003 × combo`, up to combo 100 (×1.3). At 100 comes a **Surge**: 5 s of ×2 damage and
   auto-strikes at 5 per second, then the combo resets to 0.
4. **Crit.** 4% chance (facets and relics add more), ×5. **Mega crit** is 4% of crits, ×50, and adds a 3×3 shockwave at
   25%.
5. **Area pattern** of the current tool form (§2.3).
6. **Overkill.** Damage left over after a cell breaks spills into the next exposed cell in the same row at 50%.

Calibration constants: crit EV 1.16 and combo EV 1.15. Surge and mega crits sit on top (about +12% and +7% for a
continuously tapping player), so a fully active player runs ahead of the sim's curve on purpose.

### 2.3 Tool forms (the visible escalation, "giant pickaxes, drills, area explosions")

A **blueprint** is found at a fixed depth: it shows on the Ladder in advance and appears in the rock as a glowing anvil
cell. Tapping it adds the **Evolve** card to the Dock.

- **Evolve cost:** 8 rows of gold at the blueprint depth, `14.56 × HP(d)`, about 45–90 s of income.
- **Effect:** ×2.5 tap damage in total (×2 single-target × about 1.25 from the area pattern), +3% crew share, a new model
  and a facet choice.

| # | Blueprint | Form | Area pattern | Signature visual and sound | Evolve cost | Bought at (sim, 4 / 3 / 2 taps/s) |
|---|---|---|---|---|---|---|
| 1 | 8 m | Iron Pick | 25% splash to 1 neighbour | orange sparks, bright "tink" | 8.4K | 1:11 / 1:31 / 2:10 |
| 2 | 18 m | Twin Picks | 2 strikes per tap (target and an adjacent cell) | two heads cross, double click | 190K | 2:30 / 3:12 / 4:03 |
| 3 | 30 m | Sledge | T of 4 cells | dust ring, 2 px screen kick | 2.6M | 3:44 / 4:38 / 5:39 |
| 4 | 45 m | Rock Drill | column of 3 cells below the target | spiral bit, grinding whine | 170M | 6:07 / 7:41 / 8:55 |
| 5 | 60 m | Blasting Pick | every 10th tap is a 3×3 blast at ×5 | dynamite flash, bass thump | 2.2B | 8:38 / 10:32 / 12:03 |
| 6 | 80 m | Thunder Bore | lightning chains to 3 cells | cyan arcs, crackle | 29B | 11:49 / 14:16 / 16:31 |
| 7 | 100 m | Magma Lance | beam through the whole row at 40% | orange beam, hiss | 440B | 15:12 / 18:18 / 21:38 |
| 8 | 125 m | Quake Hammer | 3×3 on every tap at 35% | ground ring wave | 23T | 23:16 / 27:50 / 33:24 |
| 9 | 150 m | Star Breaker | 3×3, plus a meteor every 25 taps (5×5 at ×10) | meteor streak, boom | 510T | 33:55 / 40:19 / 48:50 |
| 10 | 190 m | Void Maw | row plus the row below at 50% | black swirl, reverse whoosh | 23Qa | 52:44 / 61:33 / 74:37 |
| 11 | 250 m | Echo Hammer | every pattern repeats once at 50% after 0.15 s | ghost double | 1.5Qi | run 2+ |
| 12 | 330 m | Lintel Lantern | every 20 taps, a screen-wide pulse (every visible cell ×3) | lantern nova, choir | 100Qi | run 2+ |
| 13+ | 430 m, then every 100 m | Echo Lantern II, III, … | +1 stacked repeat | prismatic tint, rising choir | 14.56 × HP(d) | endless |

---

## 3. Idle and offline

- **Online idle.** Crew lines (§4.4) are visible miners on the shaft walls. They deal their DPS to the side cells first,
  then to any cell. Their DPS shows on their cards and as small grey numbers (at most 6 a second, merged).
- **Offline.** Settlement is the same pure step function run in 10 s steps (Appendix A), using crew DPS only.
  - **Efficiency:** 40% to start. Constellation nodes raise it to 60% and 80%, the Overseer Lintel perk adds 25%, and
    the Night Lamp relic adds up to 50%.
  - **Cap:** 4 h to start, raised to 8 h and 12 h by Constellation nodes, plus Rook's Eye.
  - Crew keep buying nothing while offline. Gold accumulates, and the player spends it on return: the shopping spree is
    the dopamine.
  - Offline digging **does advance depth.** Coming back deeper is the point.
- **Away chests.** 1 Copper-floor chest per 30 min away, up to 8.
- **The return (it must be a feast).** A 3.2 s Hoard sequence, skippable after 0.4 s:
  - the counters roll up from zero (depth +49 m, gold, cells broken);
  - the away chests burst open together in a cascade (one roll-up each, 0.25 s apart);
  - a single Claim button flies everything into the HUD.
- **Sim check (session model).** After 2 h away at 15 min played: +45 m. After the first night: +107 m.

---

## 4. Economy (the deepest part of this design)

### 4.1 Units and numbers

- **Depth.** 1 row = 1 m. A row is 7 cells.
- **Gold per cell:** `0.2 × HP × kindMult`. The cell mix is in §4.2, and its expected value is 1.36 (the calibration uses
  1.3).
- **Big numbers.** `core/Big.ts`, `{ m: float64 in [1,10), e: int }`, used by every economy value.
  - Display: integers below 1,000, then 3 significant digits with K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, then Ud, Dd, Td,
    Qad, Qid, Sxd, Spd, Ocd, Nod, Vg (1e63).
  - Past Vg: letter pairs aa (1e66), ab (1e69), and so on.
  - Settings offer Scientific (`1.23e45`).
- **Rates.** Every counter shows a rate next to it (`+4.5K/s`).

### 4.2 Rock: the HP table and the cell mix

HP per cell is given as anchors with geometric interpolation between them. I derived it from the reference player so
that the first run lands on the target depth curve (Appendix A), then rounded it and checked it forward (§4.13).

| Biome (start) | Depth | HP per cell at start | Gold per row at start | Slope inside the biome |
|---|---|---|---|---|
| Topsoil Roots | 0 m | 6 | 11 | ×1.517/m (anchors 5 m: 250, 10 m: 1K) |
| Glowroot Caverns | 20 m | 25K | 46K | ×1.280/m (30 m: 180K) |
| Crystal Grotto | 45 m | 12M | 22M | ×1.169/m (60 m: 150M) |
| Halden Works | 70 m | 600M | 1.1B | ×1.139/m (80 m: 2B) |
| Fungal Deep | 100 m | 30B | 55B | ×1.156/m (125 m: 1.6T) |
| Drowned Ruins | 140 m | 10T | 18T | ×1.107/m (150 m: 35T) |
| Magma Veins | 190 m | 1.6Qa | 2.9Qa | ×1.071/m |
| Fossil Halls | 250 m | 100Qa | 180Qa | ×1.055/m |
| Frost Hollow | 330 m | 7Qi | 13Qi | ×1.06/m |
| The Loom | 430 m | 2.4Sx | 4.3Sx | ×1.06/m |
| Iron Heart | 560 m | 4.6Sp | 8.4Sp | ×1.06/m |
| Star Well | 700 m | 16Oc | 29Oc | ×1.06/m |
| The Lintel Gate | 840 m | 56No | 100No | ×1.055/m |
| The Black Stone (Rite altar) | 1,000 m | 300Dc | 540Dc | ×1.055/m forever |
| Echo strata | 1,000 m and down, every 150 m | 1.3e47 at 1,500 m, 5.3e58 at 2,000 m, 9.5e81 at 3,000 m | | ×1.055/m |

Cell kinds (per cell, all biomes; biomes change the look, not the odds):

| Kind | Share | HP × | Gold × | Other | How it reads |
|---|---|---|---|---|---|
| Rock | 80.0% | 1 | 0.6 | — | biome family material |
| Ore | 12.0% | 1 | 3 | — | vein glyph, warm glint |
| Rich ore | 4.0% | 1.5 | 8 | — | glows, pulses every 2 s |
| Golden cell | 0.8% | 1 | 25 | — | gold leaf, sparkle every 0.7 s |
| Gem cell | 1.0% | 1 | 0.6 | +1 gem (+1 per 250 m) | cyan facet glint |
| Chest cell | 1.2% (1 per 12 rows) | 2 | — | a chest (§4.8) | a chest lid shows in the rock |
| Geode | 0.4% | 3 (5 taps) | 2 | 3–12 gems plus a Codex mineral roll | rough sphere, rattles when hit |
| Specimen | 0.1% | 1 | 1 | Codex entry (new specimen 70%, else shards) | fossil outline |
| Anvil (blueprint) | at form depths | 1 | — | Evolve card | bright anvil, beam |
| Relic cell | 1 per biome (second half), +0.1% | 2 | — | a relic | violet seam |

Next-row preview: the 3 rows below the front are always lit enough to read their special cells. Seeing a golden cell two
rows down is the cheapest anticipation there is.

### 4.3 The Dock: how buying feels

**Card anatomy** (every upgrade is a card; 72 px tall in the sheet):

- **Left:** a 48 px icon in an octagon plate. The **ring of 10 pips** around it fills one pip per level, and the 10th
  pip is the ★.
- **Middle:**
  - the name and level ("Digger Lv 37");
  - the effect delta in verdigris green ("+18% dig speed");
  - under it, the **crown track**: 5 small stars; 5 ★ make a crown (×4).
- **Right:** the buy button.
  - It shows the price and fills from left to right with `gold / price`. **The button is itself a progress bar.**
  - At 100% it turns amber (the primary style) and pulses once (1.0 → 1.06 → 1.0, 240 ms).
  - It never pulses twice for the same affordability.

**Buy modes** (a segmented control at the top of the sheet; the default changes when the player is ready):

| Mode | What it buys | Shown on the button | When it is the default |
|---|---|---|---|
| ×1 | one level | price of one | until the first ★ (about 0:16) |
| **NEXT ★** | up to the next ★ (`10 − L mod 10` levels) | "★ in 3 · 1.2K", the fill uses the total | from the first ★ on (goal gradient) |
| ×10 | 10 levels | total | never the default |
| MAX | `floor(log_r(1 + G(r−1)/c))` levels | total and "+n" | after the first Rekindle |

**Hold to buy.** Holding a buy button buys again every 120 ms, speeding up to every 40 ms after 1 s, while gold lasts.

**The purchase arpeggio.**

- Each purchase plays a note of a major pentatonic scale on the brass voice, rising one step per purchase.
- The step resets 1.5 s after the last purchase.
- At the 10th consecutive note the scale moves up an octave and a shimmer plays. A ×10 or MAX purchase plays a 4-note
  run.
- So buying is literally music, and a spree sounds like a fanfare.

**BEST tag.** The card with the most DPS per gold wears a brass "BEST" tag. Quick-Buy's left button always holds that
card.

**What a purchase does on screen** (each step 90–240 ms, transform and opacity only):

1. The button squashes (0.94, 90 ms) and springs back (1.04, then 1.0, 160 ms).
2. 6 coins fly from the gold counter to the card icon along Bézier arcs (0.35 s, staggered 25 ms). It is the reverse of
   income, so the player sees where the gold went.
3. The level number rolls up (vertical tick, 120 ms) and a pip fills with a 1-frame white glint.
4. The world answers within 1 frame:
   - pick levels: the tool model gets a brighter rim for 0.3 s;
   - crew levels: that crew member does a cheer pose and a faster swing for 1 s.

### 4.4 The upgrade table

**The pick** (taps):

| | Value |
|---|---|
| Damage | `L × 2^floor(L/10)` × forms ×2.5 each (§2.3) |
| Cost L → L+1 | `5 × 1.16^(L−1)` (10 levels ≈ ×4.4) |
| ★ every 10 levels | ×2 |
| Sim: level at 1 / 3 / 6 / 10 / 30 / 60 min | 30 / 65 / 93 / 124 / 185 / 223 |

**Crew lines** (idle; a line appears when its depth is first reached; blueprints of lines already found stay in the Dock
on later runs, greyed until their depth):

| # | Line | Unlock | Base cost `c0` | DPS per level `b` | Hired at (sim, 4 taps/s) | Look |
|---|---|---|---|---|---|---|
| 1 | Digger | 3 m | 12 | 3.6 | 0:21 | small miner with a lamp hat |
| 2 | Mole | 12 m | 160 | 27 | 1:01 | burrowing mole, dirt plumes |
| 3 | Ore Cart | 25 m | 2.4K | 225 | 2:44 | cart that rams the wall on rails |
| 4 | Drill Rig | 45 m | 40K | 1.95K | 4:55 | tripod drill, steam |
| 5 | Blaster | 70 m | 800K | 19.5K | 9:18 | dynamite crew, small blasts |
| 6 | Golem | 100 m | 20M | 270K | 14:07 | stone golem punching |
| 7 | Tide Engine | 140 m | 600M | 4.2M | 26:37 | water-jet engine |
| 8 | Magma Worm | 190 m | 22B | 72M | 48:39 | glowing worm through rock |
| 9 | Fossil Titan | 250 m | 1T | 1.5B | run 2 | skeletal giant |
| 10 | Frost Wyrm | 330 m | 60T | 36B | run 2–3 | ice wyrm breath |
| 11 | Loom Spinner | 430 m | 4.5Qa | 1.05T | run 3 | crystal spider weaving |
| 12+ | Echo line k | 560 + 140(k−1) m | 4.5Qa × 90^k | 1.05T × 35^k | endless | prismatic recolours |

Cost of the next level is `c0 × 1.13^L`. Output is `b × L × 2^floor(L/10) × 4^floor(L/50)`, so there is a ★ every 10
levels and a **crown** every 50 (5 ★).

**Utility cards** (one-time gold purchases that appear with the biomes; each is a single big, satisfying tap):

| Card | Appears | Cost (rows of gold at the biome start) | Effect |
|---|---|---|---|
| Biome Lantern | every biome start | 6 | crew and taps ×1.5 |
| Biome Edge | every biome start | 4 | crit chance +1 pt |
| Biome Cart | every biome start | 3 | gold ×1.25 |
| Surge Bellows | 45 m, 190 m, 560 m | 10 | Surge +1 s |

(The calibration run leaves utility cards out, so they are margin: about ×2.8 per biome at a cost of about 13 rows.)

### 4.5 Milestones and multipliers

| Milestone | Effect | Frequency (sim, first run) | Presentation (§9) |
|---|---|---|---|
| ★ on any card (every 10 levels) | ×2 that card | 5.3/min in 0–3 min, 5.7/min in 3–10, 3.2/min in 10–30, 1.5/min in 30–60, 0.9/min in 60–120 | T1 card flip |
| **Star Ladder** (every 10 ★ in a run) | +5% all damage (run) | first at 2:32, then every 2–11 min | T1 HUD star burst |
| Crown (every 50 levels of a crew line) | ×4 that line, new crew look | first at 2:55, about 1 per 3–5 min | T2 banner |
| Tool form | ×2.5 tap, +3% share, facet | §2.3 | T3 ceremony |
| Depth mark every 5 m (to 50 m), every 25 m after | +1 gem the first time ever; a Copper-floor chest at every 25 m | | T1 plaque lights on the wall |
| 100 m marks | Crystal-floor chest, records board | | T2 |
| Biome start | crew line, utility cards, new facet tags, Codex page, biome reveal | §5.4 | T3 reveal |

### 4.6 Facets: branching choices and synergies (Balatro / Hades shape)

At every tool form, a hand of **3 facet cards** is offered and the player keeps 1. Facets last for the run (Rekindle
clears them; the Heirloom branch keeps 1–3).

- **Rarity of an offered card.** Common 70% (×1 value), Rare 25% (×1.5), Relic 5% (×2.5, violet). Each Fortune facet
  owned adds +5 pt to Relic.
- **Rerolls.** 1 free per run, then 10 gems.
- **Tags unlock with the biomes**, so the pool grows: Spark and Quake from the start, Greed at 45 m, Crew at 70 m,
  Rhythm at 100 m, Fortune at 140 m.
- **Set bonuses** activate at 2, 4 and 6 facets of one tag. The belt under the tool icon shows the tag counts as 6 small
  gems with 2/4/6 notches.

| Tag | Facets (common values) | Set 2 | Set 4 | Set 6 |
|---|---|---|---|---|
| Spark | Hot Edge (crit +4 pt) · Split Spark (crits hit 1 neighbour at 50%) · Static (every 10th tap crits) · Overcharge (crit ×5 → ×8) · Thunderhead (mega-crit share ×2) · Lightning Rod (each crit +0.1 s Surge) | crit +5 pt | crits chain to 2 cells | 10% of crits become mega |
| Quake | Wide Swing (side cells take 30%) · Aftershock (a broken cell deals 20% of its HP to neighbours) · Fault Line (1 tap in 8 hits the whole row at 50%) · Charge Pack (every 25th tap: 3×3 ×5) · Rubble Rain (debris deals 5% where it lands) · Deep Fracture (front-row cells take +60%) | area +50% | blasts radius +1 | every cleared row blasts the next row |
| Greed | Gilded Edge (gold +40%) · Midas (golden cells ×2) · Interest (+1% of banked gold per minute, capped at 10 min of income) · Assay (ore ×2 gold) · Treasure Nose (chest cells +50%) · Tithe (crit gold ×3) | gold +50% | every 50th cell is golden | gold ×3 |
| Crew | Whistle (crew +50%) · Overtime (offline +25 pt) · Shared Pick (share +3 pt) · Apprentice (newest line ×3) · Union (+5% per hired line) · Night Lamps (crew crit 5%) | crew +60% | crew strikes hit 2 cells | crew ×3 |
| Rhythm | Tempo (combo window 0.6 → 0.9 s) · Crescendo (combo cap +50) · Drumline (+1 auto-strike/s per 50 combo) · Battery (Surge +2 s) · Metronome (tap +1% per 10 combo) · Encore (a Surge at combo 100+ refills 25%) | combo builds ×2 | Surge ×2 power | combo never drops below 50 |
| Fortune | Four-Leaf (chest step +5 pt) · Geode Sense (geodes ×2) · Lucky Find (gem cells ×2) · Second Look (10% double chest) · Jackpot (1% of cells pay ×100) · Pity Charm (pity counters 30% faster) | rare drops ×1.5 | chests start one tier higher | every 10th chest is Reliquary+ |

**Duo facets** appear only when the player owns 2 or more of each of two tags (12% chance per offer slot). They have a
gold frame and are the build-defining discoveries:

| Duo | Tags | Effect |
|---|---|---|
| Thunderclap | Spark + Quake | every crit triggers a 3×3 blast at 50% |
| Payday | Spark + Greed | crits pay ×4 gold |
| Golden Hour | Greed + Fortune | golden cells ×3; chests +1 card |
| Work Song | Crew + Rhythm | crew +1% per 10 combo (cap +50%) |
| Foreman's Luck | Crew + Fortune | crew find chests (1 per 40 crew-broken rows) |
| Rolling Thunder | Quake + Rhythm | at 100+ combo every 10th tap blasts the row |

**Presentation of an offer (T2, 1.6 s, cannot be missed, but the world keeps digging behind it):**

1. The 3 cards fly up from the anvil and fan out, each flipping face-up 120 ms after the previous one.
2. Rarity frames flash: bone, cyan for Rare, violet for Relic. A Relic card adds a 0.4 s violet shimmer and a low chime.
3. Tags that would complete a set show a pulsing "SET 4!" ribbon.
4. A tap picks: the card flies to the belt and the tag gem fills. When a set completes, the gem bursts and the set
   effect's name stamps over the tool for 0.8 s.

### 4.7 The multiplier stack (one formula, shown in Stats)

```
power    = (1 + 0.10·Embers) · (1 + 0.5·Stones) · (1 + 0.01·Marks·(1 + 0.02·LintelFragmentLv)) · relicPower
           · (1 + 0.05·floor(runStars/10)) · utilityCards · facetSets · biomeSeals
tapDmg   = (L·2^floor(L/10) · 2.5^forms · power + 0.03·forms·crewDPS) · combo · crit · surge · facets
crewDPS  = Σ b_i·L_i·2^floor(L_i/10)·4^floor(L_i/50) · power · crewCards · facets
cellGold = 0.2 · HP · kindMult · goldCards · facets · relics · (1 + 0.1·biomeSeals)
```

Groups multiply each other. Inside a group, bonuses add.

The Stats sheet lists every factor with its current value, sorted by size, so the player sees which system made them
strong.

### 4.8 Chests and variable rewards (Clash-style roll-up, honest near-misses)

**Five tiers**, using the brand's `RARITY` tokens plus one new top tier:

| Tier | Colour | Gold (seconds of current income) | Gems | Cards | Specials |
|---|---|---|---|---|---|
| Wood | bone `#c9bfae` | 20 s | 0–1 | 1 | — |
| Copper | uncommon `#e58444` | 60 s | 2–4 | 2 | 15%: +5 free levels on a random crew line |
| Crystal | rune `#8fe3ee` | 4 min | 8–12 | 3 | 1 Codex roll (new 60%), 1 free facet reroll |
| Reliquary | deep `#b9a2ff` | 15 min | 25–40 | 4 | 1 relic (or 5 shards if owned) |
| **Lintel** | amber-to-brass gradient `#ffb35c → #e2b673` with cyan glyph sparks | 60 min | 100 | 5 | 1 relic, plus a Lintel cosmetic, plus a 20 s Lantern Storm (everything ×10) |

`RARITY.mythic` is the new token. It must reach 4.5:1 for bone-100 text on its dark plate (`tests/unit/brand.test.ts`
gains the pair).

**Roll-up.** A chest starts at its floor tier, then tries up to 4 upgrade steps. Each step is one honest roll:

| Step | Chance | Cumulative from Wood | From a Copper floor | From a Crystal floor |
|---|---|---|---|---|
| Wood → Copper | 40% | 40% | — | — |
| Copper → Crystal | 30% | 12% | 30% | — |
| Crystal → Reliquary | 20% | 2.4% | 6% | 20% |
| Reliquary → Lintel | 10% | 0.24% | 0.6% | 2% |

**Floors** (Ladder chests start higher, which is endowed value):

| Source | Floor |
|---|---|
| chest cells, events | Wood |
| every 25 m, away chests, daily bounties | Copper |
| every 100 m, biome reveals, Codex chests, the 3/3 daily | Crystal |
| the 7-day calendar (day 7) | Reliquary |

**Pity (visible as 3 small gauges in the chest info card):**

| Guarantee | Within | Note |
|---|---|---|
| Crystal or better | 12 chests | — |
| Reliquary or better | 40 chests | — |
| Lintel | 300 chests | Pity Charm: −30% |

When a pity gauge is above 80%, its next chest carries a small violet "!" on the HUD chest icon. That is anticipation
the player has earned.

**Near-miss.** If a step roll fails by less than 5 points (for example 21–25 on a 20% step), the chest flickers the next
tier's colour for 120 ms before settling. It only happens on real close calls, and the secret feat "So Close" (§6.2)
turns a Reliquary-to-Lintel near-miss into a reward.

**Reveal sequence** (T1 for Wood and Copper, T2 for Crystal, T3 for Reliquary and Lintel; skippable after 0.4 s; tap and
hold fast-forwards ×3):

1. **0.00 s.** The chest pops out of its cell onto a stone plinth at the centre of the shaft (a 3D prop). The HUD dims
   to 60%.
2. **0.20 s.** It shakes three times, rising in pitch.
3. **0.50 s.** Steps play 0.35 s apart.
   - **Success:** a ring of the new colour bursts from the chest, a bloom spike (PostFX `flash` 0.15 in that colour), the
     next note of a 4-note fanfare and a light haptic.
   - **Failure:** grey sparks puff and the lid unlatches.
4. **Open.** A light shaft rises (bloom), and cards fan out in screen space (`render/fx/ScreenSprites.ts`). Each card
   flips 150 ms after the previous one with its own rarity flash. A NEW stamp hits new Codex entries.
5. **Claim.** One tap, or auto after 1.2 s. Contents fly to their counters with the coin arcs of §9.3.

Durations: Wood 1.0 s, Copper 1.4 s, Crystal 2.0 s, Reliquary 2.8 s, Lintel 3.6 s (and a 0.5 s white-out).

### 4.9 Gems (earned only)

| Source | Gems | Rate (active, first day) |
|---|---|---|
| Gem cells (1% of cells, +1 per 250 m) | 1+ | about 25 per hour early |
| Geodes | 3–12 | about 12 per hour |
| Chests | §4.8 | about 40 per hour |
| Achievements | 5 / 15 / 40 / 100 per tier, 25 per secret | about 200 on day 1 |
| Depth marks (first time ever) | 1 per 5 or 25 m | about 30 on day 1 |
| Daily | 15 per bounty, 30 on calendar day 2 | about 75 per day |

| Sink | Price | Why it is not a trap |
|---|---|---|
| Facet reroll | 10 | 1 free per run; it is a choice tool |
| Chest Charm (next chest +1 floor) | 40 | at most 1 active |
| Lantern Oil (×2 everything for 10 min) | 50 | 1 at a time; it is also a daily calendar reward |
| Bounty swap | 10 | — |
| Constellation respec outside a Rekindle | 50 | free at every Rekindle |
| Cosmetics | 100–600 | cosmetics only |

### 4.10 Prestige layer 1: Rekindle (Embers)

- **Unlock.** Reaching 100 m reveals the **Ember Shrine** (a carved brazier on the wall at 100 m). The Rekindle tab
  appears with its projection.
- **Embers per Rekindle:** `floor(5 × (maxDepth/100)^3 × (1 + 0.2 × Stones))`:

| Depth | 100 m | 150 m | 200 m | 300 m | 500 m | 700 m | 1,000 m | 1,500 m | 2,000 m |
|---|---|---|---|---|---|---|---|---|---|
| Embers | 5 | 16 | 40 | 135 | 625 | 1,715 | 5,000 | 16,875 | 40,000 |

- **What Embers do.** Each Ember gives +10% to `power` (additive), and Embers are never spent. Lifetime-Ember thresholds
  give **Constellation points**, so spending never costs the player multiplier and nothing can be bought wrong.
- **Thresholds:** 10, 25, 50, 100, 250, 500, 1K, 2.5K, 5K, 10K, 25K, 50K, 100K, 250K, 500K, 1M, then ×10 each.

**The Ember Constellation** (5 branches; a node costs 1–3 points; 2 forks per branch where the player picks 1 of 2;
respec is free at each Rekindle). The nodes the reference build takes in the sim are marked ●.

| Branch | Nodes, in order (cost) |
|---|---|
| Momentum (start fast) | ● Kindled Pick: start pick Lv 25 (1) · ● Charted Rock I: the charted band of every Rekindle (60% of the record at ×0.25 HP) grows to 75% (1) · ● Starter Crew: Digger Lv 25 (1) · ● Quick Forge: start with 2 forms (2) · *fork:* ● Charted Rock II, 90% at ×0.1 HP (2) **or** Plunge: begin at 20% of the record (2) · ● Kindled Pick II: Lv 60 (2) · ● Quick Forge II: 4 forms (3) |
| Lantern (taps) | tap ×1.5 (1) · crit +2 pt (1) · *fork:* mega crit ×2 **or** Surge +2 s (2) · combo window +0.2 s (2) · free reroll +1 (2) · tap ×3 (3) |
| Crew (idle) | ● crew ×1.5 (1) · offline cap 8 h (1) · offline efficiency 60% (2) · *fork:* ● crew ×3 **or** offline 80% (3) · offline cap 12 h (2) |
| Fortune | chest step +3 pt (1) · gem cells ×1.5 (1) · *fork:* pity −25% **or** +1 card per chest (2) · golden cells ×2 (2) · facet Relic +5 pt (3) |
| Heirloom | keep 1 facet (2) · keep the Star Ladder at 25% (2) · *fork:* keep 2 facets **or** start with 1 duo-eligible offer (3) · keep 3 facets (3) |

**"The next run is visibly faster"** (five things on screen):

1. **Projection card on the Rekindle screen.** A run of the pure sim in the browser (Appendix A, 30 ms budget) prints:
   "Next run: 154 m in ~7 min (this run: 16 min) · new record expected: ~390 m".
2. **The ghost lantern.**
   - A pale blue lantern sprite hangs on the shaft wall at the depth the previous run had reached at the same run time.
   - A chip says "+42 m ahead of your last run" in verdigris, or "−8 m" in bone.
   - The moment you overtake it, the ghost bursts into blue sparks (T1).
3. **Charted rock** (built into every Rekindle: 60% of the record; the Constellation raises it).
   - Above the charted fraction of the record, the rock wears faint survey lines (the shader draws a grid in the
     material's glyph channel) and has ×0.25 HP. You blow through it with doubled bursts.
   - Crossing the record line stamps **NEW GROUND** (T2) and the survey lines stop.
4. **Splits.**
   - Every biome reveal shows the run time against the best, as a chip under the biome name: "Crystal Grotto 1:12
     (−4:40)" in green.
   - A green split gives +5 gems. These are speedrun dopamine.
5. **The Run Reel.**
   - The Rekindle ceremony (T3, 3.5 s) lowers the lantern into the brazier.
   - The camera then rockets up through the whole run (the biomes flash past in 1.8 s with their names), the Ember count
     rolls up, and a new run starts at the surface.

**Sim proof.**

| Rekindle | Played | Run time | Depth reached | Embers gained | Previous record reached at |
|---|---|---|---|---|---|
| 1 | 0:16 | 16:01 | 154 m | 18 | — |
| 2 | 0:47 | 31:01 | 394 m | 305 | 7:14 (45% of run 1) |
| 3 | 1:11 | 24:01 | 745 m | 2,070 | 2:02 (7% of run 2) |
| 4 | 1:31 | 20:01 | 964 m | 4,480 | 4:23 |

### 4.11 Prestige layer 2: the Lintel Rite (Lintel Stones)

- **Unlock.** Reach 1,000 m. The Black Stone sits at the floor of the Lintel Gate (840–999 m). The mystery thread pays
  off here (§6.8).
- **Stones:** `floor(4 × (record/1000)^3)`, so 1,000 m gives 4, 1,250 m gives 7, 1,500 m gives 13, 2,000 m gives 32,
  3,000 m gives 108.
- **Each Stone:** +50% `power` (additive group) and +20% Embers per Rekindle.
- **The Rite resets:** Embers, Constellation points (the layout is kept), facets and the run.
- **The Rite keeps:** records, achievements, Marks, Codex, relics, cosmetics, titles and the charted record.
- **Policy shown to the player.** The Rite card lights when the projected Stones are at least 2 times the current Stones,
  which is where the sim's runs re-accelerate.

| Rite | Played | Run time | Record | Stones | After it |
|---|---|---|---|---|---|
| 1 | 1:51 (day 3) | 20:01 | 1,182 m | 6 | run 1: 630 m in 25 min (+2,750 Embers); run 2: 1,241 m in 15 min, a new record |
| 2 | 2:51 (day 4) | 20:01 | 1,479 m | 12 | the third run after it reaches 1,633 m |
| 3 | 4:21 (day 5) | 40:02 | 1,818 m | 24 | day 7 ends at 2,044 m |

### 4.12 The unlock cadence (what is new, when; sim plus the scripted reveals of §7)

| Time (run 1, 4 taps/s) | New thing | Kind | Presentation |
|---|---|---|---|
| 0:00 | tap the glowing cell | tutorial | finger ghost |
| 0:04 | gold counter and the first upgrade | system | Quick-Buy slides up |
| 0:15 | 3 m: Digger blueprint | crew | card with NEW ribbon |
| 0:16 | first ★ (Pick Lv 10) | milestone | ×2 stamp; NEXT ★ mode switches on |
| 0:21 | Digger hired | crew | miner climbs in on a rope |
| 0:30 | first chest (scripted at 6 m, scripted Wood → Copper) | reward | roll-up |
| 0:40 | 8 m anvil, Iron Pick blueprint | form | anvil beam |
| 0:50 | first achievement tier (Tinkerer Bronze, 25 levels); Feats tab | achievements | medal toast |
| 1:01 | Mole (12 m) | crew | |
| 1:11 | **Iron Pick** | form | T3 ceremony |
| 1:50 | **Glowroot Caverns** reveal (20 m); Ladder tab | biome | T3 reveal |
| 2:30 | **Twin Picks** and the first facet hand; Facets tab | form and choice | T3, then T2 |
| 2:32 | first Star Ladder step (10 ★) | milestone | T1 |
| 2:44 | Ore Cart (25 m), first Copper-floor 25 m chest | crew, reward | |
| 2:55 | first crown (Digger 50) | milestone | T2 banner |
| 3:44 | Sledge | form | T3 |
| 4:00 | first event (scripted Glimmer swarm) | event | §6.7 |
| 4:55 | **Crystal Grotto** (45 m), Drill Rig, Greed facets, Codex tab (first specimen) | biome | T3 |
| 6:07 | Rock Drill | form | T3 |
| 8:00 | first daily bounties appear | daily | toast |
| 8:38 | Blasting Pick | form | T3 |
| 9:18 | **Halden Works** (70 m), Blaster, Crew facets, first Halden log | biome, mystery | T3 |
| 11:49 | Thunder Bore | form | T3 |
| 14:06 | **Fungal Deep** (100 m), Golem, Rhythm facets, **Ember Shrine (Rekindle)** | biome, prestige | T3 |
| 15:12 | Magma Lance | form | T3 |
| 16–35 | first Rekindle: the Constellation, the ghost lantern and charted rock | prestige | T3 Run Reel |
| 20:24 | 125 m | depth | T2 |
| 23:16 | Quake Hammer | form | T3 |
| 26:37 | **Drowned Ruins** (140 m), Tide Engine, Fortune facets, first relic cell | biome | T3 |
| 33:55 | Star Breaker | form | T3 |
| 48:39 | **Magma Veins** (190 m), Magma Worm | biome | T3 |
| 52:44 | Void Maw | form | T3 |

| Window | Unlocks (sim) | Longest gap with nothing new |
|---|---|---|
| 0–3 min | 15 | 0:40 |
| 3–17 min | 10 | 2:31 |
| 17–60 min | 6, plus the first Rekindle | 14:44 |
| Run 2 onwards | a new record each run brings 1–3 biomes, 1–4 forms and 1–2 crew lines | 10–20 min of play |
| Day 2 onwards | Rite 1, Echo strata, endless forms every 100 m, Lintel tiers | 10–20 min |

Chests, events and goal-bar payouts fill every gap: none of these windows goes more than 2.5 min without a reward of
T1 or above.

### 4.13 Pacing targets and the sim result (first run, fixed HP table)

| Depth | Target | 4 taps/s | 3 taps/s | 2 taps/s |
|---|---|---|---|---|
| 5 m | 0:30 | 0:24 | 0:33 | 0:48 |
| 10 m | 1:00 | 0:50 | 1:05 | 1:32 |
| 20 m | 2:20 | 1:50 | 2:21 | 3:10 |
| 25 m | 3:00 | 2:43 | 3:28 | 4:16 |
| 45 m | 5:30 | 4:55 | 6:08 | 7:24 |
| 70 m | 10:00 | 9:18 | 11:21 | 13:02 |
| 100 m (Rekindle) | 15:00 | 14:06 | 16:54 | 19:48 |
| 140 m | 27:30 | 26:37 | 31:43 | 38:11 |
| 150 m | 31:40 | 30:13 | 35:54 | 43:16 |
| 190 m | 50:00 | 48:39 | 57:36 | 69:40 |
| 250 m | 86:40 | 81:22 | — | — |

Purchase moments (reference player, eager; gold arrives cell by cell):

| Window | Moments (4 taps/s) | Median gap | 90th percentile | Max | Median gap at 2 taps/s |
|---|---|---|---|---|---|
| 0–3 min | 132 | 0.5 s | 1.5 s | 54 s (saving for Iron Pick, bar shown) | 1.0 s |
| 3–10 min | 287 | 0.5 s | 1.5 s | 76 s | 1.0 s |
| 10–30 min | 568 | 1.5 s | 3.0 s | 172 s | 1.5 s |
| 30–60 min | 402 | 2.5 s | 7.0 s | 245 s (saving for a form, bar shown) | 3.0 s |
| 60–120 min | 472 | 5.0 s | 15 s | 340 s | 5.5 s |

---

## 5. The descent and the world in the voxel engine

### 5.1 World window

- **Window size.** `VoxelWorld` 32 (x) × 96 (y) × 16 (z), a multiple of 16 on every axis: 49,152 voxels (48 KB), with a
  192 KB light volume.
- **The shaft.** It is 7 cells wide (x 12–18) and 4 deep (z 6–9). The dig front is its top solid row.
- **The rock around it** is real voxels. Caverns are carved into x 1–30 and z 1–14.
- **Streaming.**
  - When the front is 48 rows above the window bottom, the window shifts by 32 rows (2 chunk layers).
  - The worker generates the new band as a pure function `(seed, absoluteRow)`.
  - `LightField` runs `computeAll` on the new band plus 8 rows. The meshes of the band that left are disposed.
  - Kept chunks are re-keyed by absolute chunk row and offset, not remeshed. This is a ChunkRenderer change: meshes take
    their origin from `yBase`.
  - Expected cost: about 1 shift per 32 m, so 1 per 30–90 s early and 1 per 2–5 s in charted rock.
- **Plunge and charted rock.** Rows above the charted line are generated without caverns, so the shifts stay cheap.
  Their meshes are built at ¼ rate for 2 frames.

### 5.2 Camera (portrait, fixed, follows the descent)

- **Lens.** Perspective, vertical FOV 24°, 30 m back, tilted 18° down, so the shaft reads as a diorama with depth.
- **Target.** Front row + 2 m, damped follow (time constant 0.25 s), no user control.
- **Framing.**
  - At 390 × 844 the frame shows 11 cells across (7 shaft and 2 of wall each side) and about 22 rows.
  - The front sits 62% down the world view.
  - When a sheet is open, the target shifts so the front sits 28% down: the player keeps digging while shopping.
- **Kicks** (§9) are camera offsets of at most 6 px and never rotate.

### 5.3 What fills the caverns (each one is a treasure room)

- **Frequency.** Every 18–40 m (seeded), the shaft opens into a cavern 3–6 rows tall spanning the full width, plus z
  depth behind.
- **Contents (each cavern has at least 6 tappables):**
  - 2–4 crystal clusters (props, 3 taps, pay ore gold ×5);
  - 1–3 creatures from the biome's bestiary (tap 3 times to study, which gives a Codex entry plus a gem);
  - 1 guaranteed chest (Copper floor);
  - a 25% chance of a Halden cache (log plus gems);
  - a 10% chance of a relic shrine.
- **Living scenery** (`PropRenderer`, existing kinds): glow moths (`LumenMoths`), drips, waterfalls (`Waterfall`), a
  biome emitter budget.
- **The rule:** a cavern is never empty, and its reward is visible before you reach it (glints in the next-row preview).

### 5.4 The biome ladder

| # | Biome | Depth | Unlocks | Codex page | Reveal |
|---|---|---|---|---|---|
| 0 | Topsoil Roots | 0–19 m | Digger, Mole, Iron Pick | roots, beetles | the surface at dawn, lantern lit |
| 1 | Glowroot Caverns | 20–44 m | Ore Cart, Spark and Quake facets | glowroots, moths | blue glow floods up from below |
| 2 | Crystal Grotto | 45–69 m | Drill Rig, Greed, geodes | 4 crystals | crystal ring, prism light |
| 3 | Halden Works | 70–99 m | Blaster, Crew facets, Halden logs | rails, lamps | old timbers, a hanging lamp row |
| 4 | Fungal Deep | 100–139 m | Golem, Rhythm, **Ember Shrine** | caps, spores | spore snow |
| 5 | Drowned Ruins | 140–189 m | Tide Engine, Fortune, relic cells | pearls, eels | columns under water light |
| 6 | Magma Veins | 190–249 m | Magma Worm | obsidian, salamanders | lava river crossing |
| 7 | Fossil Halls | 250–329 m | Fossil Titan, Echo Hammer | bones | a giant skull in the wall |
| 8 | Frost Hollow | 330–429 m | Frost Wyrm, Lintel Lantern | ice, foxes | frozen waterfall |
| 9 | The Loom | 430–559 m | Loom Spinner | threads, spiders | crystal web canopy |
| 10 | Iron Heart | 560–699 m | Echo line 1 | meteor iron | a beating iron core |
| 11 | Star Well | 700–839 m | Echo line 2 | star seeds | a sky of crystals |
| 12 | The Lintel Gate | 840–999 m | the Black Stone, **Lintel Rite** | runes | the carved gate opens |
| E | Echo strata | every 150 m from 1,000 m | mutators (×2 golden cells, ×2 creatures, inverted gravity dust, …) | Echo variants | the biome's palette shifted |

Reveal (T3, 2.2 s):

1. The row breaks into the biome's first cavern.
2. Time slows to 0.35× for 0.6 s.
3. The camera pulls back 20% and the biome's light floods in (atmosphere preset blend 0.7 s).
4. The name stamps in the Lintel display face with a split chip.
5. 3 new-thing chips slide in under it ("New crew: Drill Rig · New facets: Greed · Codex page").

---

## 6. Discovery, collections, events, the mystery thread

### 6.1 The progression map: the Ladder (tab)

A vertical, scrollable map of the shaft, surface at the top, drawn as a carved stone ruler.

- **Header (3 gauges, always the same 3):**
  - **Depth** (record and current);
  - **Might** (`floor(10 × log10(DPS))`, with a rank title every 25 Might);
  - **Codex** %.
- **Left column:** biome bands in their palette, with names and split times.
- **Nodes every 5 m (to 50 m) and every 25 m after.** Node icons: chest floor, anvil (form), crew blueprint, relic cell,
  Ember Shrine, the Black Stone.
  - Done nodes carry a brass check.
  - Upcoming nodes are bright, with the distance ("18 m").
  - Locked nodes past the record are silhouettes with a "?" and the depth. You know something is there.
- **Markers:** the lantern (now), a violet RECORD line, a blue dashed GHOST (last run), the green CHARTED band, and
  amber Ember thresholds ("×2 Embers at 247 m").
- **Next 3 rewards** are always pinned at the bottom as chips: "6 m · Copper chest", "14 m · Rock Drill", "39 m · Crystal
  Grotto".
- **The world view shows the same thing in miniature:** a 14 px depth strip on the right edge shows the next 3 nodes
  sliding up toward the front. It is the Candy Crush map in the corner of your eye.

Might ranks (25 Might each, as titles):

| Rank | Might | Title |
|---|---|---|
| 1 | 0 | Scratcher |
| 2 | 25 | Digger |
| 3 | 50 | Delver |
| 4 | 75 | Tunneler |
| 5 | 100 | Excavator |
| 6 | 125 | Deepwright |
| 7 | 150 | Stonebreaker |
| 8 | 175 | Quakemaker |
| 9 | 200 | Starbreaker |
| 10 | 250 | Voidwalker |
| 11 | 300 | Lintelbearer |
| 12 | 400 | Lanternlord |
| 13+ | +100 each | Lanternlord II, III, … |

In the sim, Might is 32 at 1 min, 70 at 6 min, 129 at 30 min, 174 at 2 h and about 600 on day 7.

### 6.2 Achievements ("Feats"): 80 tiered, plus 12 secret

There are **20 families × 4 tiers** (Bronze, Silver, Gold, Lintel), 80 tiered achievements, plus 12 secret feats: 92 in
total. After the Lintel tier, each family continues with endless **Lintel II, III, …** tiers (×10 the previous
threshold, +2 Marks each).

**Rewards that matter:**

| Tier | Marks | Gems | Also |
|---|---|---|---|
| Bronze | 1 | 5 | — |
| Silver | 2 | 15 | the family's cosmetic |
| Gold | 4 | 40 | the family's title, plus a Crystal chest |
| Lintel | 8 | 100 | the family's permanent perk, plus a Reliquary chest |
| Secret | 5 | 25 | a unique cosmetic |

- **Marks** are a permanent +1% `power` and +1% gold each. The maximum from the 92 is 360 Marks (×4.6). Marks fill the
  **Renown** track (§6.3).
- **Claim is a tap.** The toast or the Feats tab's "Claim" button flies the Marks into the Renown bar. Claim All exists.
  Unclaimed tiers show as a count badge on the tab.

| # | Family (counter) | Bronze | Silver | Gold | Lintel | Lintel perk (permanent) | Silver cosmetic / Gold title |
|---|---|---|---|---|---|---|---|
| 1 | Delver (deepest depth) | 25 m | 100 m | 300 m | 1,000 m | start every run with the first 10% of the record auto-dug | Rope Lamp / "Delver" |
| 2 | Breaker (cells broken) | 300 | 5K | 50K | 1M | broken cells splash 10% to neighbours | Rubble Burst / "Breaker" |
| 3 | Spark (crits) | 25 | 500 | 10K | 250K | crit +3 pt | Spark Trail / "Sparkwright" |
| 4 | Thunder (mega crits) | 1 | 20 | 200 | 2,000 | mega crit ×100 | Storm Pick / "Thunderborn" |
| 5 | Tinkerer (levels bought) | 25 | 500 | 5K | 50K | all upgrade costs −5% | Brass Gears / "Tinkerer" |
| 6 | Starwright (★ in one run) | 5 | 25 | 75 | 200 | each ★ +1% gold (run) | Star Pips / "Starwright" |
| 7 | Forgemaster (forms in one run) | 2 | 5 | 9 | 13 | start with 3 forms | Ember Anvil / "Forgemaster" |
| 8 | Foreman (lines hired in one run) | 2 | 5 | 8 | 12 | crew ×1.5 | Crew Banners / "Foreman" |
| 9 | Chestbreaker (chests opened) | 5 | 75 | 750 | 7,500 | +1 card per chest | Gilded Lids / "Chestbreaker" |
| 10 | Lucky Star (rarities rolled) | 10 Copper+ | 10 Crystal+ | 5 Reliquary+ | 1 Lintel | step chance +2 pt | Lucky Clover / "Fortunate" |
| 11 | Démesure (gold in one run) | 1e6 | 1e15 | 1e33 | 1e66 | gold ×2 | Counter skins / "Démesuré" |
| 12 | Rhythm (best combo) | 50 | 150 | 400 | 1,000 | combo window +0.25 s | Drum Pulse / "Rhythmist" |
| 13 | Kindler (Rekindles) | 1 | 5 | 25 | 100 | Embers +10% | Ember Flame / "Kindler" |
| 14 | Ember-born (Embers owned) | 100 | 1e4 | 1e8 | 1e16 | Ember effect 0.10 → 0.11 | Coal Glow / "Ember-born" |
| 15 | Collector (Codex %) | 10% | 33% | 66% | 100% | each entry +0.5% power | Codex Seal / "Collector" |
| 16 | Wayfinder (biomes revealed) | 3 | 6 | 10 | 13 | every reveal grants a Crystal chest | Compass / "Wayfinder" |
| 17 | Overseer (crew hours while away) | 1 h | 24 h | 168 h | 720 h | offline +25 pt | Night Lamp / "Overseer" |
| 18 | Bounty (daily bounties done) | 3 | 30 | 150 | 600 | a 4th daily bounty | Bounty Board / "Bounty Hunter" |
| 19 | Swift (100 m within one run) | 12 min | 6 min | 3 min | 60 s | charted rock HP ×0.5 more | Speed Lines / "Swift" |
| 20 | Wonderstruck (events caught) | 5 | 50 | 300 | 1,500 | events 25% more often | Moth Halo / "Wonderstruck" |

**Secret feats** (shown as "???" with a one-line hint):

| Feat | Hint | Condition |
|---|---|---|
| Lamplighter | "Something waits under the topsoil" | open the first chest |
| Overkill | "Too much." | one hit of 1,000 × a cell's HP |
| Clean Sweep | "All at once." | clear a whole row with one tap |
| So Close | "Almost gold." | a Reliquary chest fails its Lintel step by under 5 points |
| Patience | "The crew kept going." | return after 8 h or more away |
| Night Owl | "The deep never sleeps." | play between 00:00 and 04:00 local |
| Bare Hands | "Who needs help?" | reach 50 m without hiring a crew line |
| Hands Free | "Let them work." | gain 25 m in one run with no tap for 10 min |
| Full Set | "Six of a kind." | complete a 6-facet set |
| Moth Friend | "They like your light." | catch every moth in one swarm |
| Echo of Halden | "Every page." | read all 26 Halden logs of the first cycle |
| The Answer | "Eight marks sing." | touch the Black Stone holding all 8 runes |

**Earn-rate targets** (sim session model):

| Point | Tiers earned |
|---|---|
| First 30 min | at least 12 (Delver B, Tinkerer B and S, Starwright B and S, Forgemaster B and S, Foreman B and S, Spark B, Thunder B, Rhythm B, Wayfinder B, Démesure B, Chestbreaker B, Lamplighter) |
| End of day 1 | at least 25 |
| End of day 3 | at least 50 |
| Lintel tiers | from about day 3 (Delver, Wayfinder) to months (Breaker, Chestbreaker) |

**Presentation.** The medal toast (T1, 1.2 s):

1. An octagon plate drops from under the goal bar.
2. A 3D-looking medal spins once (CSS `rotateY` on a pre-rendered medal sprite, 600 ms).
3. The tier colour ring bursts, the name shows, and "+2 MARKS" rolls.
4. A 3-note chime plays, pitched up per tier, with a haptic `[12, 40, 24]`.

Lintel tiers are T3 instead: the medal fills the screen, the perk text is carved in rune ink, and a 1.8 s choir plays.

### 6.3 Renown (the Marks track: a free "battle pass" that never expires)

There is a rank every 10 Marks, 36 ranks in all. Functional and cosmetic rewards alternate, so every second rank changes
how the game plays.

| Rank | Reward | Rank | Reward |
|---|---|---|---|
| 1 | title "Novice of the Lamp" | 19 | +1 facet in every hand (3 → 4) |
| 2 | +1 free facet reroll per run | 20 | crew hat: Halden helmets |
| 3 | lantern flame: ember red | 21 | Lantern Oil lasts 15 min |
| 4 | offline cap +1 h | 22 | coin skin: rune coins |
| 5 | pick skin: bronze | 23 | crit +1 pt |
| 6 | chest step +1 pt | 24 | break style: crystal shatter |
| 7 | break style: confetti runes | 25 | pity −10% |
| 8 | Surge +1 s | 26 | pick skin: obsidian |
| 9 | counter frame: brass | 27 | crew ×1.25 |
| 10 | title "Lamplighter" plus a Reliquary chest | 28 | title "Keeper of the Lintel" |
| 11 | Star Ladder +1% per step | 29 | Embers +5% |
| 12 | coin trail: ember sparks | 30 | lantern flame: prismatic |
| 13 | geodes ×1.25 | 31 | tool form ×2.5 → ×2.6 |
| 14 | pick skin: crystal | 32 | trail: aurora |
| 15 | gem cells ×1.25 | 33 | 5th facet in every hand |
| 16 | lantern flame: rune cyan | 34 | frame: Lintel gold |
| 17 | offline efficiency +5 pt | 35 | Stones +10% |
| 18 | trail: moths | 36 | title "The Answer", plus the golden lantern |

### 6.4 The Codex (collection %: 208 entries)

| Section | Entries | Source |
|---|---|---|
| Biome pages | 13 × 10 = 130 | 4 specimens (specimen cells and geodes), 3 creatures (study with 3 taps), 1 wonder (the biome reveal), 2 Halden logs |
| Relics | 24 (levels 1–10) | Reliquary and Lintel chests, relic cells |
| Tool forms | 12 | evolving |
| Facets | 42 (36 + 6 duos) | picking one once |

Rewards:

- Every 10 entries: a **Codex chest** (Crystal floor), 20 in total. The Codex header always shows "next chest at 70 (3
  to go)".
- Completing a biome page gives a **Biome Seal**: +10% gold and +10% `power`, permanent. The seal is stamped on the
  Ladder band.
- Entries are presented the way Pokédex-style collections are: a silhouette until found. Finding one is a 0.6 s
  turntable of the specimen sprite (`ui/sprites.ts` `itemRaster` style, procedural) with a NEW stamp.

**Relics** (permanent, levelled with shards; level n → n+1 costs 2n shards, 90 shards to level 10):

| Relic | Per level | Relic | Per level |
|---|---|---|---|
| Halden's Compass | gold +3%, +1 Ladder preview node at Lv 5 | Magma Core | area patterns +4% |
| Moth Jar | crit +0.5 pt | Fossil Tooth | geodes +6% |
| Glimmer Lens | crit damage +5% | Frost Needle | first strike on a cell ×(1 + 0.1·Lv) |
| Echo Bell | mega-crit share +4% | Loom Thread | Relic facet odds +1 pt |
| Foreman's Whistle | crew +6% | Star Seed | Embers +3% |
| Night Lamp | offline efficiency +5 pt (to +50) | Void Pearl | event frequency +4% |
| Iron Key | chest step +0.5 pt | Lintel Fragment | Marks effect +2% |
| Copper Heart | gold +4% | Lantern Wick | start pick +2 levels |
| Rune of Descent | charted HP −3% | Ore Saint | ore gold +5% |
| Spindle Shard | tool form multiplier +0.05 | Golden Mole | golden cells +5% |
| Black Glass | Surge +0.3 s | Rook's Eye | offline cap +20 min |
| Tide Pearl | combo decay −5% | The Ninth Point (Lintel chests only) | all power +2% |

### 6.5 Records (personal bests, a violet register)

Records tracked: deepest; fastest to 100 m, 300 m and 1,000 m; biggest single hit; best combo; most gold from one tap;
best chest; most cells in one tap; best offline haul (m); longest daily streak; most Embers in one Rekindle; most Stones
in one Rite.

When a record breaks, a violet "NEW RECORD" stamp appears on the relevant HUD element (1.2 s, T1), with a record jingle
(a 2-note violet chime). The Records sheet then shows the old value struck through.

### 6.6 Daily loops (local clock; nothing is lost by missing a day)

- **The Daily Delve chest** opens on the first launch of the day (Crystal floor).
- **3 bounties**, refreshed at local midnight (for example "Open 5 chests", "Hit a 150 combo", "Reach 80 m in one run",
  "Evolve 3 tools", "Catch 4 events").
  - Each one pays 15 gems and a Copper chest. All 3 pay a Crystal chest.
  - 1 swap per day costs 10 gems.
- **The 7-day Lantern Calendar:**

| Day | Reward |
|---|---|
| 1 | Copper chest |
| 2 | 30 gems |
| 3 | Crystal chest |
| 4 | 2 facet rerolls |
| 5 | Lantern Oil |
| 6 | 60 gems |
| 7 | Reliquary chest |

  A missed day pauses the calendar; it never resets.

### 6.7 Events (golden moments; active play only)

- **Timing.** Every U(60, 120) s while the player has tapped in the last 10 s. Never during a T3 ceremony. The first one
  is scripted at 4:00.
- **Form.** Each event is one tap verb, lasts at most 6 s, and pays in seconds of income.

| Event | Weight | Duration | Verb | Reward |
|---|---|---|---|---|
| Glimmer Swarm | 25 | 5 s | tap 5–9 moths drifting across the shaft | each: 3 s of income or 1 gem |
| Gold Vein | 15 | next 5 rows | (none) 3 cells per row turn golden | ×25 gold cells |
| Treasure Mole | 15 | 4 s | tap the mole 3 times before it hides | Copper-floor chest |
| Meteor | 10 | 3 s | tap the meteor as it falls | 5×5 blast ×20 and 2 gems |
| Cave-in | 10 | 4 s | tap 4 falling boulders | each: 1 gem; untapped ones crack 3 cells (a free bonus) |
| Halden Echo | 10 | 4 s | tap the rune on the back wall | a log page and 10 gems |
| Mimic | 10 | 6 s | tap a chest that runs | a Crystal-floor chest |
| Supply Rope | 5 | 5 s | tap the crate on a rope | Lantern Oil for 3 min, a free Surge, or 25 gems |

### 6.8 The mystery thread (the reason to go deeper)

It reuses the existing lore: the Halden logs, the regrowing copper, the runes and the Black Stone ("keep your lantern
lit").

- **The logs.** Each biome holds 2 Halden logs (26 in the first cycle). Every log ends on a question that a log 1–2 biomes
  deeper answers. That is a curiosity gap shown as an open thread in the Codex: "Why did the copper grow back? → answered
  in Fungal Deep".
- **The runes.** 8 runes sit at 45, 100, 190, 330, 430, 560, 700 and 840 m. Each is a relic-cell variant and a socket on
  the Lintel Gate.
- **The Black Stone** at 1,000 m answers with the Rite. Each Rite reveals one more line of "The Answer" (12 lines; the
  last at Rite 12). Echo strata are the deep remembering your lantern: their palettes are your earlier biomes, seen from
  the other side.

---

## 7. Guidance: the tutorial, the objective, hints, the next-goal bar

### 7.1 Principles

- One instruction at a time, always as a ghost finger or a glow on the thing itself, never as a text wall.
- UI parts appear when they first matter (progressive reveal). At 0:00 there is no HUD except the lantern and the rock.
- Every instruction completes by doing, never by tapping "OK".

### 7.2 The first 3 minutes (script; times at 4 taps/s)

| Time | Trigger | What the player sees | Completes when |
|---|---|---|---|
| 0:00 | launch | dawn surface; the lantern sways over a 7-wide pit; one cell glows; a ghost finger taps it | first tap |
| 0:01 | first tap | the cell cracks, "1" pops, sparks; the finger repeats once if no second tap in 2 s | first break |
| 0:03 | first break (scripted ore ×3) | coins arc up and the **gold counter** slides in at the top left with "+3" | 3 cells broken |
| 0:04 | gold ≥ 5 | **Quick-Buy** slides up from the bottom; the Pick button glows full; the finger points at it: "Upgrade your pick" | first purchase |
| 0:05 | bought | "×2 damage!" in verdigris over the next cell; the next tap shows "2" | — |
| 0:10 | 1 m | the **objective chip** drops in: "Dig to 3 m · 1/3" with a bar; the **next-goal bar** appears showing "★ Pick Lv 10" | 3 m |
| 0:15 | 3 m | the Digger blueprint card flies from the rock to Quick-Buy's right slot: "Hire help: he digs even when you're away" | Digger hired |
| 0:16 | Pick Lv 10 | first ★: card flip, "×2"; the buy-mode control appears with **NEXT ★** selected, plus a tooltip pointing at it ("buys to the next star"); the sequencer holds it until the Digger step is done | — |
| 0:21 | Digger hired | the miner rappels in and starts hacking; a grey "3.6/s" floats over him | — |
| 0:30 | 6 m chest cell | the chest lid shows in the rock; the finger points: "Tap the chest" | chest opened (scripted Wood → Copper, which seeds "Lamplighter") |
| 0:40 | 8 m anvil | the anvil glows; tap it and the Evolve card appears with its gold bar: "Save for the Iron Pick" | — |
| 0:50 | Tinkerer Bronze | first medal toast; **Feats** tab appears with a badge; the finger says "Claim" | claimed |
| 1:11 | Evolve bought | the T3 tool ceremony (§9.2) | — |
| 1:50 | 20 m | the Glowroot reveal; **Ladder** tab appears with a pulse: "See what's below" | Ladder opened, or 30 s pass |
| 2:30 | Twin Picks | first facet hand: "Pick one: it lasts this run" | facet picked |
| 2:45 | — | tutorial done; hints switch to contextual (§7.4) | — |

Steps never overlap: a tutorial sequencer holds a step's prompt until the step before it completes, and holds T1/T2
rewards for up to 2 s around a prompt.

### 7.3 The always-visible objective (the Path)

- **The chip.** One line, 36 px, below the goal bar. Tap it and a card opens with the why and the reward.
- **Chain.** A 30-step authored chain covers about the first 2 hours. After that, Survey Orders are generated (3 kinds
  rotating: depth, collection, build).

| Step | Objective | Reward |
|---|---|---|
| 1 | Dig to 3 m | 5 gems |
| 2 | Hire the Digger | Copper chest |
| 3 | Get a ★ | 5 gems |
| 4 | Evolve to the Iron Pick | 10 gems |
| 5 | Reach the Glowroot Caverns (20 m) | Copper chest |
| 6 | Pick a facet | 10 gems |
| 7 | Hire the Ore Cart | 10 gems |
| 8 | Crown the Digger (Lv 50) | Crystal chest |
| 9 | Open 5 chests | 15 gems |
| 10 | Reach the Crystal Grotto | Crystal chest |
| 11 | Break a geode | 10 gems |
| 12 | Complete a set of 2 | 15 gems |
| 13 | Catch an event | 10 gems |
| 14 | Reach the Halden Works | Crystal chest |
| 15 | Read a Halden log | 10 gems |
| 16 | Hire the Blaster | 15 gems |
| 17 | Reach 100 m | Crystal chest |
| 18 | Rekindle once | Reliquary chest |
| 19 | Pick a Constellation node | 20 gems |
| 20 | Beat your record | Crystal chest |
| 21 | Pass the ghost lantern | 15 gems |
| 22 | Reach the Drowned Ruins | Crystal chest |
| 23 | Find a relic | 25 gems |
| 24 | Complete a biome page | Crystal chest |
| 25 | Reach 250 m | Crystal chest |
| 26 | Rekindle with 250+ Embers | Reliquary chest |
| 27 | Get a duo facet | 30 gems |
| 28 | Reach the Frost Hollow | Crystal chest |
| 29 | Reach 500 m | Reliquary chest |
| 30 | Reach the Black Stone | Lintel chest |

### 7.4 Contextual hints (at most 1 per 20 s, each at most 3 times in a lifetime, dismissed by doing)

| Condition | Hint |
|---|---|
| 20 s without a tap while the front has cells | the front pulses once |
| 30 s with an affordable ★ untaken | the NEXT ★ button glows |
| Gold > 10 × the cheapest buy for 20 s | "Spend it: Quick-Buy picks the best" |
| Evolve affordable for 10 s | the anvil beam rises again |
| Rekindle projection ≥ 2× Embers and run > 8 min | the Ember Shrine icon flames: "Rekindle now: next run ~4× faster" |
| A pity gauge > 80% | violet "!" on the chest icon |
| Codex 2 entries from a chest | the Codex tab shows "2 to go" |

### 7.5 The next-goal bar (the goal-gradient engine)

A 24 px bar, full width minus 32 px, directly under the top bar. It always shows the single best near goal.

- **Candidates:**
  - the next ★ on each card (progress = gold spent in the current decade plus gold in hand, over the decade's total);
  - the next depth node;
  - the next form (blueprint distance, then gold for Evolve);
  - the next achievement tier;
  - the next chest cell in view;
  - the next crew line;
  - the Ember ×2 threshold.
- **Selection.**
  - Among candidates with ETA between 8 s and 180 s, take the highest progress. If there is none, take the smallest ETA.
  - Hysteresis: a goal shows for at least 6 s unless it completes.
  - A tap on the bar jumps to that card or node.
- **Display:** icon, label ("★ Digger ×2"), progress ("1.2K / 1.6K") and ETA ("~14 s").
- **Completion:** the bar flashes amber and the reward fires. The bar then **slides to the next goal without emptying**:
  it morphs from the old fill to the new goal's real fill, which the selection rule keeps high.
- **Measured (sim, first hour):**

| Taps/s | Median fill | Time with fill ≥ 50% | 10th-percentile fill |
|---|---|---|---|
| 4 | 0.68 | 72% | 0.37 |
| 3 | 0.70 | 74% | 0.39 |
| 2 | 0.69 | 72% | 0.37 |

  That is "always nearly full", as asked.

---

## 8. Portrait UI layout (390 × 844 CSS px; `t`, `b` = safe insets from `--safe-*`)

| Band | y (from the top inset) | Height | Content |
|---|---|---|---|
| Top bar | 0–52 | 52 | gold and rate (left, 150 px, Lintel 22 px digits) · depth "128 m" (centre, 28 px) with Might and title under it (12 px) · gems and Embers (right, 110 px) |
| Next-goal bar | 52–76 | 24 | §7.5 |
| Objective chip and buffs | 80–116 | 36 | the chip (left, 70%) · active buffs: Surge, Oil, Storm (right, 36 × 36 icons with a ring timer) |
| World view | 116 to 844 − t − b − 196 | about 451 at t=47, b=34 | the shaft; combo meter on the left edge (8 × 200 px, number on top); depth strip on the right edge (14 px, the next 3 nodes) |
| Quick-Buy | bottom −196 to −120 | 76 | 3 buttons 114 × 64: [BEST card] [PICK] [NEWEST CREW]; each shows icon, level, ★ pip ring and the fill-as-progress price |
| Facet belt | bottom −120 to −64 | 56 | tool icon and its form name, 6 tag gems with 2/4/6 notches, the next form chip "Rock Drill · 14 m" |
| Tab bar | bottom −64 to 0 | 64 (48 px targets) | Dock · Crew · Facets · Ladder · Feats · Codex (65 px each, count badges) |

Sheets:

- A sheet rises over the Quick-Buy and the belt to 58% of the screen (about 490 px). The camera re-targets so the front
  stays visible (§5.2).
- Drag down or tap the tab again to close. The Rekindle and Rite screens are full-screen.

Other viewports:

- **360 × 740:** Quick-Buy buttons are 104 × 60, the belt is 48 px, the world is about 360 px.
- **412 × 915:** the world is about 520 px.

Every target stays at least 48 px (`tools/ui-check.mjs` audit).

Brand ("Lamplight on the Lintel"):

- Octagon brass plates, Lintel digits (tabular) and the `RARITY` tokens, plus `mythic`.
- The expedition register (amber) carries the economy. The builders' register (cyan) carries discovery. Violet carries
  records, relics and the unknown. Red is still danger only (it is never used for "can't afford"; that is bone-500).

---

## 9. Juice and feel: how every reward is presented

### 9.1 Ceremony tiers and the Reward Director (`gameplay/idle/RewardQueue.ts`, pure)

| Tier | Length | Scope | Rate limit | Examples |
|---|---|---|---|---|
| T0 | ≤ 0.3 s | in place | none (pooled) | numbers, coins, sparks, pip fills |
| T1 | 0.4–1.2 s | one HUD element or card | 1 per 1.5 s (excess merges: "×3 ★") | ★, Star Ladder step, medal toast, Wood or Copper chest, ghost passed, record |
| T2 | 1.2–2.0 s | dims the world 20% | 1 per 8 s | crown, facet hand, Crystal chest, NEW GROUND, 100 m mark |
| T3 | 2.0–4.0 s | full screen, slow-mo allowed | 1 per 30 s (queued; the queue is shown as a small stack icon) | tool evolution, biome reveal, Reliquary or Lintel chest, Lintel medal, Rekindle, Rite |

- Every T2 and T3 is skippable after 0.4 s, and the world keeps simulating underneath. During a T3, taps feed a "tap to
  skip" counter, not the rock.
- The offline return merges everything queued into one Hoard sequence (§3).

### 9.2 The reward presentation table

| Reward | World (3D) | Screen / UI | Audio (new `audio/rewardSfx.ts` voices on the existing synth) | Haptic | Time |
|---|---|---|---|---|---|
| Strike | crack stage +1, warm flash 60 ms, 6–14 sparks (scale with log10 of damage/HP), 1 px kick | damage number (Lintel digits; size 16 px + 4 px per ×10 of damage/HP, max 40), rises 24 px in 0.5 s | `hit.<kind>` (existing), pitch by crack stage | 9 ms (existing `hit`) | 0.5 s |
| Crit | flash 0.12 (PostFX `flash`), 20 sparks, 3 px kick | gold "CRIT ×5" number at 1.6× size with a 1.25 → 1.0 scale punch | bright "tink" plus a low thump | 14 ms | 0.6 s |
| Mega crit | 80 ms hit-stop (sim continues; render frozen), 3×3 shockwave ring, 6 px kick, bloom spike | screen-edge gold vignette pulse 200 ms, "MEGA ×50" | thunder crack, 0.4 s | [20, 30, 40] | 0.8 s |
| Cell break | debris (`Debris.ts`) in the cell's material, dust puff, light flicker | coins: 1 sprite per cell (ore 3, rich 6, golden 12) fly to the gold counter on Bézier arcs (0.45–0.7 s, staggered 25 ms, max 24 alive, merged after that) | `break.<kind>`; golden adds a coin shower | 22 ms (existing `broken`) | 0.7 s |
| Gold arrives | — | the counter punches 1.0 → 1.12 → 1.0 (120 ms), at most 1 per 120 ms; rate text pulses | coin tick, pitch random ±3% | — | 0.12 s |
| Row clear | the row's dust sweeps sideways; the camera eases down 1 m (0.25 s) | — | low "thoom" | — | 0.25 s |
| Purchase | tool rim or crew cheer (§4.3) | button squash, coins to the card, level roll, pip glint | arpeggio note (§4.3) | 6 ms | 0.25 s |
| ★ (×2) | that card's tool or crew flashes gold | card flips 360° on Y (400 ms), a gold ring bursts, "×2" stamp in 40 px digits, a star flies from the card to the Star Ladder counter | 3-note brass fanfare | [10, 30, 10, 30, 30] | 0.8 s |
| Star Ladder step | — | the counter's star bursts, "+5% ALL" | soft gong | 12 ms | 0.6 s |
| Crown | the crew member's model swaps to its crowned look in a gold puff | banner "DIGGER CROWNED ×4" slides across | 5-note fanfare with timpani | [20, 40, 20, 40, 60] | 1.4 s |
| Tool evolution | screen dims; the old tool rises to the centre (3D model), cracks with light, explodes into sparks; the new one assembles from flying voxel pieces (0.8 s); a 0.35× slow-mo shockwave | name in the Lintel display face (28 px), "×2.5 DAMAGE · NEW: hits 3 cells", the facet hand follows | 2.2 s forge sequence: hammer hits, a rising choir, a crash | [30, 60, 30, 60, 90] | 3.0 s |
| Chest roll-up | §4.8 | §4.8 | 4-note fanfare per step; failure is a muted click | 8 ms per step, rising | 1.0–3.6 s |
| Relic | violet light shaft from the chest | relic sprite turntable 0.6 s, "NEW RELIC", its effect line | low bell plus a shimmer | [18, 60, 28] (existing `discovery`) | 1.6 s |
| Achievement tier | — | §6.2 medal toast | 3-note chime by tier | [12, 40, 24] | 1.2 s |
| Renown rank | — | the Renown bar fills and bursts; the reward card flips | brass swell | 18 ms | 1.0 s |
| Depth mark (5 / 25 m) | a wall plaque at that depth lights up and stays lit | "25 m" chip and the gem fly | single bell | 10 ms | 0.6 s |
| Record broken | — | violet NEW RECORD stamp | 2-note violet chime | 14 ms | 1.2 s |
| NEW GROUND | the survey lines stop at the record line with a violet ripple | stamp | 2-note chime plus wind | 16 ms | 1.4 s |
| Biome reveal | §5.4 | §5.4 | the biome's music stem enters (`MusicScheduler` layers) | [18, 60, 28] | 2.2 s |
| Crew hire | the miner rappels in on a rope from the top of the frame | card NEW ribbon | rope whirr, cheer | 12 ms | 1.0 s |
| Surge | the lantern flares (lantern radius ×1.3), the screen edges warm | combo meter fills and flames; a "SURGE" plate | music adds the drum layer for 5 s | 20 ms | 5 s |
| Event spawn | the event actor enters with a glint | a small "!" chip at its side | event motif | 10 ms | — |
| Ghost passed | the blue lantern bursts into sparks | "+1 m ahead" flips green | airy chime | 10 ms | 0.6 s |
| Rekindle | the lantern lowers into the brazier; the Run Reel (§4.10) | the Ember count rolls, projection card | 3.5 s ember sequence, low choir | [30, 90, 30, 90, 120] | 3.5 s |
| Lintel Rite | the Black Stone cracks, cyan glyphs race up the shaft | Stones count, one line of "The Answer" | 4 s organ chord | long [60, 60, 120] | 4.0 s |
| Offline return | the crew wave | Hoard (§3) | rising count ticks, chest cascade | [12, 40, 12, 40, 40] | 3.2 s |

### 9.3 Coins, numbers and counters (the most-seen juice; it must be cheap)

- **Rendering.** Coins, damage numbers, sparks on UI and card flights are drawn by one instanced quad layer after
  PostFX (`render/fx/ScreenSprites.ts`): at most 256 instances and 1 draw call. The glyph atlas holds Lintel digits,
  suffix letters, ×, ★ and a coin, rasterised once from `brand/strokeFont.ts` polygons into a 512 × 256 R8 texture, so it
  stays procedural.
- **The DOM never animates per frame.** It takes only class toggles and text changes, and only when the formatted string
  changes, at most 15 Hz for counters.
- **Number size encodes value.** `size = 16 + 4 × clamp(log10(damage / cellHP) + 1, 0, 6)` px. Colours: bone (normal),
  amber (crit), gold-white with a cyan rim (mega), grey (crew, 70% opacity).
- **Counter roll.** Displayed values ease toward the true value with a 0.25 s time constant in log space, so a ×1000
  jump visibly rolls through magnitudes, and the suffix changes mid-roll (K → M → B), which is the démesure in a counter.
- **Counter skins.** Every 1e15 of lifetime gold, the counter's rim changes (brass → copper → crystal → violet → Lintel
  gold → prismatic), with a T2 "DÉMESURE: QUADRILLIONS" banner.

### 9.4 Audio and haptics rules

- **Pitch.** It always rises with value or streak (the purchase arpeggio, the chest steps, combo ticks every 10 combo),
  and never falls on a reward.
- **Rate limits.** Each reward voice is limited to 1 per 60 ms. Coin ticks are capped at 12 per second.
- **Ducking.** Music ducks 3 dB under T3.
- **Haptics.** The new kinds go into `HAPTIC_PATTERNS`: crit, mega, star, crown, evolve, chestStep, medal, record, rekindle.
  Gaps: crit 80 ms, chestStep 0, star 200 ms.

---

## 10. Technical plan (reuse the engine)

### 10.1 Add

| File | Purpose |
|---|---|
| `src/core/Big.ts` | mantissa/exponent numbers: add, mul, div, pow, cmp, log10, format; no allocation on the tap path (in-place variants) |
| `src/config/idle/{rock,upgrades,crew,toolForms,facets,chests,achievements,renown,constellation,codex,relics,biomes,objectives,events,daily}.ts` | every number in this document, typed and tunable |
| `src/gameplay/idle/Economy.ts` | the formulas of §4.4 and §4.7, buy-max closed form, the NEXT ★ cost |
| `src/gameplay/idle/Run.ts` | run state: depth, row HP, cells, gold, levels, forms, facets, stars |
| `src/gameplay/idle/Tap.ts` | §2.2 resolution (seeded `core/rng`) |
| `src/gameplay/idle/Rewards.ts` | cell-kind rolls, chest roll-up, pity, near-miss flag (pure, seeded, Monte-Carlo tested) |
| `src/gameplay/idle/Facets.ts` | offers, rarity, sets, duos |
| `src/gameplay/idle/Achievements.ts` and `Stats.ts` | lifetime counters, fed by bus events; tier checks; claim |
| `src/gameplay/idle/Prestige.ts` | Embers, Constellation, Stones, projection (runs the pure sim for 30 ms max) |
| `src/gameplay/idle/Goals.ts` | the next-goal selector of §7.5 |
| `src/gameplay/idle/Objectives.ts` | the 30-step Path plus Survey Orders |
| `src/gameplay/idle/Offline.ts` | settlement in 10 s steps (the same step function) |
| `src/gameplay/idle/Daily.ts`, `Codex.ts`, `Records.ts`, `Ladder.ts`, `Might.ts` | daily loops, collection, records, the map model, the rank |
| `src/gameplay/idle/RewardQueue.ts` | ceremony tiers, rate limits, merging |
| `src/game/idle/IdleGame.ts` | frame loop for the descent: input → Tap → Run → events → FX |
| `src/game/idle/ShaftWorld.ts` | the 32 × 96 × 16 window, band shifts, generation hand-off |
| `src/game/idle/DescentCamera.ts` | §5.2 (pure pose math, unit-tested) |
| `src/game/idle/CrewRig.ts`, `ToolRig.ts`, `ChestProp.ts`, `GhostLantern.ts` | 3D actors built with `VoxBuilder` |
| `src/render/fx/ScreenSprites.ts` and `GlyphAtlas.ts` | the instanced screen layer of §9.3 |
| `src/ui/idle/*` | TopBar, GoalBar, ObjectiveChip, QuickBuy, DockSheet, UpgradeCard, FacetHand, ChestReveal, MedalToast, FeatsScreen, LadderScreen, CodexScreen, RekindleScreen, RiteScreen, ReturnScreen, StatsSheet, numberFormat |
| `src/audio/rewardSfx.ts` | arpeggio, star, crown, evolve, chest steps, medal, record, rekindle voices |
| `src/i18n/en/idle.ts` | every string above (about 600 keys) through `t()` |
| `tools/sim-progression.ts` | port of the scratchpad model (Appendix A) plus the acceptance checks of §11; run by `npm run sim` and in CI |
| `tests/unit/idle/*.test.ts` | economy, Big, rewards, goals, achievements, offline, save |

### 10.2 Replace

| Current | Replacement |
|---|---|
| `gameplay/Objectives.ts`, `NextStep.ts` | Objectives (Path) and Goals |
| `gameplay/Records.ts` | idle Records |
| `gameplay/Journal.ts`, `discoveries.ts` | Codex |
| `gameplay/Crafting.ts`, `Tree.ts`, `config/recipes.ts` | Dock and upgrades |
| `game/Progression.ts` | IdleProgression (the same seam role) |
| `ui/hud/*` | `ui/idle/*` |
| `save/types.ts` | v3: `run`, `perm` (Big as `[m, e]` pairs), `stats`, `feats`, `codex` bitset, `relics`, `daily`, `settings` |

The v2 → v3 migration keeps settings, gives a "Veteran" title and 100 gems, and starts fresh.

### 10.3 Delete (after the idle build is green)

`PlayerController`, `CameraRig`, `touchCamera`, `aimAssist`, TapController's path planner (`findPath`), the joystick in
`TouchControls`, `ropeRide`, `runeDoor`, `Cold`, `Lantern` fuel, `Expedition`, `CacheSpot`, `Health`,
`world/analysis/homeField`, `Stations`, `Survey`, the authored zone and features pass (`world/gen/generateWorld.ts`,
`features/*`). Their material painters, props and lore text are kept.

### 10.4 Reuse as is

- `VoxelWorld`, the mesher and mesh workers, `LightField` (window-sized), the terrain material, `TargetMarker` (10 crack
  stages), `Particles`, `Debris`, `Drops` (the fly-to-target arcs), `PropRenderer`.
- `PostFX`: its `flash` and `flashColor` params drive crits and chest steps.
- The synth and `MusicScheduler` layers, `Haptics` (new kinds), the brand tokens and the Lintel font, `QualityGovernor`,
  the crash panel and the two-slot save.

### 10.5 Performance (2022 mid-range Android, Balanced)

| Item | Budget |
|---|---|
| ScreenSprites | 1 draw call, ≤ 256 quads, ≤ 0.3 ms GPU at 390 × 844 × 1.75 |
| Economy step per frame (tap and crew) | ≤ 0.15 ms (Big ops in place) |
| Goals selector | ≤ 0.05 ms, at 4 Hz |
| Achievements check | event-driven, ≤ 0.02 ms per event |
| Band shift | ≤ 4 ms main thread, spread over 3 frames: re-key, light band, dispose; generation and meshing in workers |
| DOM | ≤ 15 text updates per second, zero layout per frame during play; sheets virtualise cards (only visible ones exist) |
| Particles | the existing budgets (220 Balanced); rewards take from a reserved 60 |

### 10.6 Risks

| Risk | Answer |
|---|---|
| Runaway compounding: my first two models exploded (a multiplier M on damage also multiplies income, so it acts as about M^(1/(1−α))) | Embers grow polynomially in depth (`d³`), never exponentially. CI runs the 7-day sim and fails if the day-7 record leaves 1,500–2,800 m |
| Ceremony overload (18+ medal tiers in the first 30 min) | RewardQueue rate limits and merging; T1 medals merge into "×3 FEATS" |
| HP table mismatch after real features (Surge, utility cards, facets add about 30–60%) | re-derive with `tools/sim-progression.ts --derive` once the real step function exists; acceptance bands of §11 |
| Big precision and speed | float64 mantissa; tested ops; in-place variants on the hot path |
| Save size | Codex bitset (26 bytes), stats as Big pairs; v3 target ≤ 12 KB |

---

## 11. Acceptance metrics (each one a test, a sim check or a capture metric)

**Economy and pacing** (`tools/sim-progression.ts`, reference player, fixed HP table):

1. First upgrade affordable by 0:06; first crew hire by 0:45; Iron Pick bought by 1:45 (sim: 0:04, 0:21, 1:11).
2. Depth times within ±20% of the target column of §4.13 at 4 taps/s. At 2 taps/s, 100 m is reached by 25 min (sim:
   19:48).
3. Tool forms 1–9 land within ±25% of the §2.3 times.
4. Unlock gaps: no gap over 3:15 before 17 min, and none over 20 min before 60 min (§4.12).
5. Purchase moments: median gap ≤ 3 s in 0–30 min, ≤ 8 s in 30–60 min; p90 ≤ 20 s in 60–120 min.
6. ★ rate ≥ 1.0/min over 0–60 min, ≥ 0.5/min over 60–120 min.
7. Tap share of active DPS between 0.4 and 0.85 at 10, 30, 60 and 120 min at 4 taps/s (sim: 0.60, 0.59, 0.64, 0.64),
   and at least 0.25 at 2 taps/s (sim: 0.36 or more).
8. Rekindle: run 2 reaches the run-1 record in ≤ 50% of run 1's time, and run 3 in ≤ 20% (sim: 45% and 7%).
9. Session model: day-1 record ≥ 500 m (sim 681 m); day-3 record between 1,100 and 1,800 m (sim 1,417 m); first Rite by
   the first session of day 3 (sim 1:51 played); day-7 record between 1,500 and 2,800 m (sim 2,044 m); gold ≥ 1e45 by
   the end of day 3 (sim 1e47).
10. Offline: 8 h away at 15 min played yields at least 1 chest and ≥ 10 m.

**Rewards** (unit, Monte Carlo 10⁶ seeded rolls):

11. Chest tiers from Wood: Copper+ 40% ± 0.3, Crystal+ 12% ± 0.2, Reliquary+ 2.4% ± 0.1, Lintel 0.24% ± 0.03 (with pity
    off).
12. Pity is never exceeded: ≤ 12 chests to Crystal+, ≤ 40 to Reliquary+, ≤ 300 to Lintel.
13. The near-miss flicker shows only when the roll is within 5 points.
14. Facet offers: no duplicate in a hand; duos only when eligible; rarity odds ± 0.5 pt.

**Achievements and collection:**

15. 80 tiered plus 12 secret defined, and every one reachable (the sim's 30-day run hits each Bronze).
16. Thresholds strictly increase within a family.
17. Every tier has a reward, and every Lintel tier a perk.
18. Sim earn rates: ≥ 12 tiers in 30 min, ≥ 25 by the end of day 1, ≥ 50 by the end of day 3.
19. The Codex has 208 entries, every 10th pays a chest, and every biome page can be completed in its biome.

**Guidance:**

20. Goal bar (sim selector): median fill ≥ 0.55 and fill ≥ 0.5 for ≥ 65% of the first hour, at 2, 3 and 4 taps/s (sim:
    0.68–0.70 and 72–74%).
21. The objective chip is visible in 100% of play frames (`ui-check`).
22. The tutorial completes with only taps, by 3:30 at 2 taps/s (Playwright touch via CDP).

**Presentation and performance** (Playwright on the production build, plus `tools/perf.mjs`):

23. The first visible feedback of a tap is in the same rendered frame.
24. T3 rate ≤ 1 per 30 s, T2 ≤ 1 per 8 s (RewardQueue unit test); every T2 and T3 is skippable at 0.4 s.
25. ScreenSprites ≤ 1 draw call and ≤ 256 instances; no DOM layout during a 60 s scripted play (Performance timeline).
26. Reduced motion: no camera kick, no hit-stop, fades ≤ 150 ms (capture check).
27. 48 px minimum targets at 360 × 740, 390 × 844 and 412 × 915.
28. `brand.test.ts` covers the `mythic` rarity pair at 4.5:1.

---

## Appendix A. Calibration model (to port into `tools/sim-progression.ts`)

**Step.**

```
dps    = taps/s × tapDamage × 1.16 × 1.15 + crewDPS
damage = dps × dt, applied to rows
row HP = 7 × 1.06 × HP(d), × 0.25 or × 0.1 when charted
gold arrives with damage, pro rata: a row pays 7 × 0.2 × 1.3 × HP(d) in total
```

- Crew lines unlock on reaching their depth. A blueprint at form depth k sets the Evolve cost to `8 × rowGold(d_k)`.
- dt is 0.1 s for runs and 10 s offline. Offline uses crew DPS only, × efficiency, up to the cap.

**Buyer (reference).** Every 0.5 s, repeat:

1. If an Evolve is affordable, buy it.
2. If it is less than 10 min of income away, save for it.
3. Otherwise, buy the option with the best ΔDPS/cost if affordable.
4. Otherwise, buy any affordable option with at least 50% of the best ratio that costs ≤ 20% of the best's price (≤ 5%
   while saving for an Evolve).

**HP derivation.**

1. Run the reference player with a target curve `t(d)`. The anchors are 1 m: 6 s, 3 m: 18 s, 5 m: 30 s, 10 m: 60 s,
   20 m: 140 s, 25 m: 180 s, 45 m: 330 s, 70 m: 600 s, 100 m: 900 s, 140 m: 1,650 s, 150 m: 1,900 s, 190 m: 3,000 s,
   250 m: 5,200 s, 330 m: 9,000 s, with log-linear interpolation.
2. Set `HP(d) = damage dealt during [t(d), t(d+1)] / (7 × 1.06)`.
3. Round to the anchors of §4.2 (monotone), extrapolate at ×1.06/m to 840 m and ×1.055/m after.
4. Check the result forward (§4.13).

This works because income is `0.26 × DPS` whatever the depth, so purchase cadence depends only on costs and gains. The
HP table only maps that DPS growth onto depth, and the two can be tuned separately.

Gold must arrive per cell (or pro rata), not per row. A version of the model that paid each row's gold only when the row
broke ran about 15% slower. It also showed 6–37 s median purchase gaps instead of 0.5–5 s, because late rows take 20–40 s.

**Session model.**

- Day 1: 4 × 15 min with gaps of 2 h, 3 h, 2 h and 9 h. Days 2 and later: 5 × 10 min with gaps of 2, 2, 3, 2 and 9 h.
- Offline efficiency 40%, cap 4 h.
- Rekindle when pending Embers ≥ max(10, owned), the run is over 6 min and progress is under 3 m/min.
- Rite when Stones to gain ≥ max(4, 2 × owned) under the same stall rule.
- Marks accrue as `floor(played/240 s) + floor(record/25)`, capped at 360. Relic power is +2% per 10 min played, capped
  at +120%.
- Constellation reference build: the ● nodes of §4.10.

Sim parameters: `crew b ×3` over the base table (as listed in §4.4), `formMult 2.5`, `formShare 0.03`, Embers
`5 × (d/100)^3`, Stones `4 × (r/1000)^3`.
