# DEEP DOWN — the vertical descent (design, feel & onboarding angle)

KEY: `feel`. Author angle: game feel and onboarding: the tap itself, the first 3 minutes, juice,
haptics, sound, readable portrait UI, and the loops that bring players back. This document still
covers the whole game, so the lead can merge it with the other angles.

Numbers marked **(sim)** come from the pacing simulation in
`/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/idle/feel-sim2.mjs`.
That script is an aggregated 7-cell-row model with a "BEST badge" buyer that makes at most one
purchase every 0.8 s. Its logs are `final-t3.log`, `final-t4.log`, `final-t6.log` and `final-idle.log`
in the same folder. Camera numbers come from `camera.py`, and offline examples from `offline.mjs`.
All prices in this document are 10× the sim's units. Only the ratios matter, so the sim is
unchanged by that scale.

---

## 0. Pitch and the eight feel rules

**Pitch.** You hold the phone upright and tap the rock. Every tap cracks a cell with a punch you can
see, hear and feel. Coins and ore fly into your counters, the row gives way, and the floor drops a
metre. Through the cut face you can already see what is coming: a copper seam, a chest, the glow of
a cavern. A crew you hire keeps digging when you look away, and while the app is closed. The pick
grows from a rusty tool into a seven-metre star-forged one that ploughs through a hundred rows per
tap. Every few minutes the shaft opens onto a new world: crystal halls, the builders' colonnades,
fungal gardens, forges, frozen vaults and floating ruins. A mystery runs through all of them, down
to the Black Stone at 128 km and beyond.

The feel rules are pillars. Each one has a test in section 11.

| # | Rule | Hard number |
|---|---|---|
| F1 | **Impact in the same frame.** A tap is resolved in the first simulation step after `pointerdown`. Its crack, flash, pop and sound start in that frame. | input → first changed frame ≤ 1 frame (≤ 17 ms at 60 Hz) |
| F2 | **No tap is wasted.** Every point of the world region maps to one of the 7 columns, and a tap always lands on a solid cell. | 100 % of world-region taps produce a `cell:hit` |
| F3 | **A cell breaks fast.** An active player never needs many taps per cell. | taps per cell (TPC) ≤ 6 until the run's wall: sim 1.5–5.2 up to 3,500 m (24 min) at 4 taps/s, 1.5–5.6 over all 35 min at 3 taps/s. At the wall (4–6 km), 7.6–11.1, which is where Rekindle is recommended. Taps to clear a row ≤ 20 (sim 2.8–19.4) |
| F4 | **Something to buy, always.** | longest stretch without an affordable purchase or a chest, first 30 min: ≤ 30 s (sim: 18.2 s at 4 taps/s, 23.4 s at 3 taps/s) |
| F5 | **Something new every 2–3 minutes** for the first 45 minutes: a new mechanic, miner, biome or event (schedule in §7.7). A tappable bonus (chest, creature, event object) at least every 20 s. | gaps measured by the cadence test (§11) |
| F6 | **The more frequent, the smaller.** Hits get a small reaction, breaks a medium one, crits more again, and chests, seals and biomes get a huge one (table §9.2). | trauma ≤ 0.06 for anything faster than 1/s |
| F7 | **No punishment, only pull.** Nothing is ever lost. The only failure is a seal timer, and a retry costs nothing. | 0 resources lost on any failure |
| F8 | **Discoveries are never made offline.** The crew stops at the next seal and waits for you, so every biome is revealed with the player watching. | offline settlement never crosses a seal |

---

## 1. Core loop at three scales, and what keeps it endless

### 1.1 The 10-second loop (the tap loop)

```
tap (4–8/s) → crack + pop + tick → cell breaks (every 1.5–5 taps) → loot flies to the counter
   → the row clears (every 2–3 s early) → the floor drops 1 m → the next row shows its ore
   → the counter crosses a price → the BEST button lights → one tap buys → the pick grows
```

In 10 s at 4 taps/s the player makes 40 taps. Taps and crew together break about 25–55 cells and
clear 4–8 rows (sim: 0.42–0.82 rows/s in the first 5 min). It reveals at least 1 ore cell (ore share 9 % of cells,
see §4.4), and at least 1 purchase is affordable (F4).

### 1.2 The 3-minute loop (the goal loop)

In each 3 minutes of the first session the player gets:
- **2–4 goals completed.** The Goal Card generator aims for an ETA of 45–90 s per goal (§7.4).
- **1–3 depth milestones.** There is one every 25 m up to 100 m, then every 50 m, 100 m and 500 m
  (§7.5). Each one gives a chest.
- **2–3 Surges.** The meter fills in about 46 s of active tapping, and each Surge lasts 10 s (§2.6).
- **1–2 events** (Glimmerfall, Treasure Mole and the others in §6.4).
- **A biome or a seal every 3–7 minutes in run 1** (sim, 4 taps/s): B1 3:42, B2 3:56, B3 4:19,
  B4 5:10, B5 3:06, B6 6:44.
- **6–40 purchases**, done as 4–10 button presses with ×MAX.

### 1.3 The 3-day loop (the return loop)

| Day | What happens | Numbers |
|---|---|---|
| Day 1, session 1 (35 min) | Run 1 goes from the surface to Biome 7 (the Rime Vault). The Lintel Seal at 1,000 m unlocks Rekindle. The run hits a soft wall at 4–6 km. Rekindle #1. | (sim, 4 taps/s) 1,000 m at 17:07, 4,000 m at 26:57, 5,896 m at 35:00 → 60 Lumen → ×10 damage |
| Day 1, session 2 (20–35 min) | Run 2 goes back through B1–B6 at 3–4× the speed (the "power fantasy" lap), reaches B8 and buys the first Lumen talents. Daily chest, streak day 1. | (sim) 1,000 m at 4:52, 4,000 m at 8:08, 8,000 m at 15:32 |
| Night 1 (8 h offline) | The crew digs at 50 % efficiency up to the next seal, then mines side galleries for gold. Up to 5 chests are queued. | example (`offline.mjs`): from 1,500 m at 1e7 DPS, 8 h → it stops at the 2,000 m seal after 2 h; the other 6 h pay gallery gold, 4.0e12 gold in all |
| Day 2 | The return fanfare, the crew waiting at the seal, the 3 daily quests and runs 3–5 (B8–B9 by run 5). Relics start dropping from Reliquary chests. | (sim) run 3 12.3 km, run 4 13.8 km, run 5 15.0 km |
| Day 3 | Runs 6–10 reach B9, the Sunken City (16 km), which unlocks **Starfall**, the second prestige layer. Specimen sets near completion. Streak day 3 reward. | (sim) run 7 first reaches 16,000 m at 33:22, run 10 at 23:51 |

### 1.4 What keeps it endless

1. **Depth has no bottom.** Biome lengths double (100, 150, 250, 500 … 128 km). Past B12 come the
   "Deep Beyond" cycles (Echo I, II, …). Each cycle reuses the 12 biome kits with the palette hue
   rotated 40°, adds one seal tier and multiplies HP by 1.0004 per metre.
2. **Numbers have no ceiling.** Costs and HP use a mantissa/exponent `Num` type (§10.2). The
   display runs K, M, B, T, then aa…zz (676 suffixes, enough for 10^2043), with scientific
   notation optional.
3. **Four nested reset layers:** run → Rekindle (Lumen) → Starfall (Stars, from 16 km) → cycles.
   Each layer pushes the soft wall about one biome deeper (sim chain: 5.9 → 10.0 → 12.3 → 13.8 →
   15.0 → 15.7 → 16.1 km).
4. **Collections with long tails:** 72 specimens, 24 relics with 10 levels each, 36 Halden logs,
   8 runes and 120 achievements in endless tiers (§6).
5. **Daily, weekly and event layers** run on the local clock (§6.5).

---

## 2. The tap

### 2.1 From finger to cell (input contract)

| Step | Rule | Numbers |
|---|---|---|
| Event | `pointerdown` on the world canvas fires the tap. `pointerup` is never used for this. `touch-action: none` on the canvas, so there is no 300 ms delay and no scroll. | up to 3 simultaneous pointers |
| Queue | The pointer handler pushes `{x, y, pointerId, timeStamp}` into a fixed ring of 32. `IdleGame.step` drains it first thing, before any simulation. | 0 allocations per tap |
| Entity first | Hit-test the tappable entities in screen space: exposed chests, creatures, falling crystals, event objects and seal runes. | hit radius = max(32 px, projected bound radius + 10 px) |
| Column | Otherwise the column comes from the screen x. The 7 columns are equal vertical strips between the projected shaft walls at the floor row (`shaftLeftPx`, `shaftRightPx`, recomputed on resize and camera move). A tap left of the shaft maps to column 0, a tap right of it to column 6. **The vertical position is ignored**, so the whole world region (y from the top-bar bottom to the dock top) acts as a 7-key keyboard. | column width 36 px (360×740), 39 px (390×844), 41.2 px (412×915) |
| Target | The topmost solid cell of that column. If that cell is more than 2 rows below the floor row (the column has been dug ahead), the tap goes to the nearest column, by distance, whose top cell is within 2 rows of the floor. | the dig always focuses on the floor |
| Hold | A finger held still (≤ 12 px movement) for 160 ms auto-taps its column. | 5 taps/s, +0.5/s per Steady Hand level, max 10/s |
| Swipe | A held finger that moves across columns hits each new column it enters at once. It needs 0.6 column widths of travel to change column (hysteresis). | ≤ 15 hits/s per finger |
| Cap | Total resolved taps per second, for the effects budget. Extra taps merge into the previous hit on the same column, adding their damage. | 20/s |

Taps pass through the explorer, the crew and particles. These never block a tap.

### 2.2 What one tap does (resolution order)

```
1  combo:   if (t - lastTap) <= comboWindow (0.60 s, + relics): combo++ else combo = 1
2  D = (1 + PickLevel) × 2^PickMilestones × LumenMult × RelicMult × (1 + 0.01 × Medals) × Boosts
3  crit:    p = min(50 %, 5 % + 1 % × KeenEdge);  if crit: D ×= 5 + 0.5 × HeavyHead
4  combo:   D ×= 1 + 0.01 × min(combo, 20 + 3 × Rhythm)        (max ×1.5 at Rhythm 10)
5  surge:   D ×= 3 while Lantern Surge is active
6  bond:    D += 0.01 × CrewBond × CrewDPS                       (added after crit, never crit-multiplied)
7  apply D to the target cell; overkill flows into the next cell down the same column,
   up to Pierce = 1 + 2 × DeepStrike cells                       (overkill is never wasted below the limit)
8  Wide Swing: cells c±1 (L1), c±2 (L2), c±3 (L3) at the floor take 50 % of D
9  Lantern Bomb: charge++; at 20 the tap also blasts (table §2.5) with 8 × D
10 Surge meter += 1 (crit +4); at 240 → Surge
```

`PickMilestones` counts the Pick levels reached among 10, 25, 50, 75 and 100, plus one for every
50 levels after 100.

### 2.3 How a tap scales (what it looks like in play)

Rows marked (sim) come from the 4 taps/s run (`probe-run.mjs`).

| When (run 1) | Depth | Tap damage (no crit) | Cell HP | Taps per cell | Taps per row | What the player sees |
|---|---|---|---|---|---|---|
| 0:00 | 0 m | 1 | 1 | 1.0 | 7 | Every tap shatters a cell: the tutorial's free win |
| 0:25 | 10 m | 22 | 40 | 1.5 | 10.6 | 2 cracks, then a pop (sim) |
| 0:56 | 25 m | 132 | 250 | 1.6 | 11.0 | First crits (×5 gold numbers) (sim) |
| 3:43 | 100 m | 464 | 2,000 | 2.1 | 14.8 | Seal 1; Wide Swing arrives next (sim) |
| 11:58 | 500 m | 1,456 + bond | 100,000 | 4.7 | 10.9 | 3–7 cells crack per tap, so the row crumbles in waves (sim) |
| 17:08 | 1,000 m | 1,552 + bond | 800,000 | 3.0 | 5.2 | Lantern Bomb: 3×3 blasts every 20 taps (sim) |
| 20:14 | 2,000 m | 3,712 + bond | 2e7 | 2.4 | 4.1 | First Plunges: > 12 rows/s for seconds at a time (sim) |
| Run 2+ | 2–8 km | TPC < 1 | — | 0.3–0.7 | 0.5–0.6 | One tap ploughs 3–21 cells down a column |
| Pick L500 "Colossal" | any | — | — | ≪ 1 | ≪ 1 | The pick is drawn 3 m long. A tap smashes the whole row and pierces |
| Pick L1000 "Titan" | any | — | — | ≪ 1 | ≪ 1 | The pick is drawn 7 m long and spans the shaft. Each tap is a plunge |

### 2.4 The cell

- A cell is 1 m wide (x) × 1 m tall (y) × 3 m deep (z = 1..3), so 3 voxels. It is
  one gameplay unit: a break sets all 3 voxels to air.
- **Crack stages.** There are 10 stages (`CRACK_STAGES`), drawn on the sculpted surface by the
  terrain shader (§10.2: up to 8 damaged cells at once).
- **Heal.** Damage never heals. The `MINING.holdSeconds` / `fadeSeconds` healing in
  gameplay/Mining.ts is removed, because a clicker must never undo work.
- **Leftover crumble.** When at least 5 of a row's 7 cells are broken, the rest crack and fall
  0.30 s later with full loot. This ends the "last block hunt", the most common clicker
  annoyance. The threshold drops to 4 of 7 at Wide Swing L2.
- **Row clear.** When all 7 cells are gone the floor row is done: depth +1 m and the camera
  follows (§5.3).

### 2.5 Area tools (the escalation ladder)

| Tool | Unlock | Effect per level |
|---|---|---|
| Wide Swing | 100 m | L1: 3 cells; L2: 5 cells; L3: all 7. Side cells take 50 %. |
| Deep Strike | 250 m | Pierce +2 cells per level (L10: 21 cells, L25: 51). Overkill flows down the column. |
| Lantern Bomb | 1,000 m | Every 20 taps: L1 3×3 cells, L2 3×5, L3 3×7, L4 7×5, L5 7×7, at 8× tap damage. Pierce applies to each blasted column. |
| Cataclysm (Lumen talent) | after Rekindle 3 | Every 200 taps the bomb clears 7 × (10 + 5 × level) rows. |
| Titan Pick (Pick L1000) | any | Every tap applies to all 7 columns at 100 % (Wide Swing L3 becomes 100 %). |

### 2.6 Combo and Lantern Surge (the rhythm layer)

- **Combo.** A tap within 0.60 s of the previous one adds 1, otherwise the combo resets. The
  multiplier is +1 % per hit up to the cap (20 + 3 × Rhythm level, max 50, so ×1.5). Tiers at 10,
  25, 50 and 100 hits change the colour (bone, amber, cyan, violet) and play a rising chime.
  Losing the combo plays a soft fizz and costs nothing.
- **Lantern Surge.** The meter fills by 1 per tap and 4 per crit, up to 240. At 4 taps/s with a
  10 % crit chance it fills in 240 / 5.2 ≈ 46 s. A Surge lasts 10 s (+1 s per Surge Lens level,
  max 20 s). During a Surge:
  - tap damage is ×3;
  - hold auto-taps at 10/s;
  - the combo does not decay;
  - the lantern blazes (radius ×1.6, exposure +0.15, bloom +0.2);
  - the music drum layer comes in.

  The very first Surge is scripted: the meter starts at 140 of 240, so it fires after about
  20 s of tapping.
- Average effect for an active player: about 18 % Surge uptime gives ×1.36, and the combo averages
  about ×1.35, so ×1.8 combined. The sim folds this into its combo factor (max ×2).

---

## 3. Idle and offline

### 3.1 The crew (online idle)

| # | Miner | Base cost | Growth | Base DPS | Unlock | What you see (rendered instances, max) |
|---|---|---|---|---|---|---|
| 1 | Apprentice | 250 | ×1.15 | 1 | 10 m | Small miners with picks on the floor and ledges (4) |
| 2 | Drill Bot | 4,000 | ×1.15 | 10 | 5 Apprentices | Wall-mounted drill arms that spit sparks (4) |
| 3 | Burrow Mole | 60,000 | ×1.15 | 85 | 5 Drill Bots | Moles that pop out of the walls with dirt plumes (3) |
| 4 | Steam Borer | 1.0e6 | ×1.15 | 700 | 5 Moles | A big drill rig hanging on chains, venting steam (1) |
| 5 | Rune Golem | 2.0e7 | ×1.15 | 7,000 | 5 Borers | A stone golem whose fists glow with cyan runes (2) |
| 6 | Magma Auger | 5.0e8 | ×1.15 | 80,000 | 5 Golems | A glowing screw with lava drips (1) |
| 7 | Rift Engine | 1.5e10 | ×1.15 | 1.0e6 | 5 Augers | A violet tear that swallows cells (1) |
| 8 | Star Drill | 6.0e11 | ×1.15 | 1.6e7 | 5 Rift Engines | A white-gold beam from above (1) |
| 9 | Lintel Colossus | 3.0e13 | ×1.15 | 3.0e8 | 5 Star Drills | A colossal stone hand that scoops whole rows from the side (1) |

- Each miner type doubles its DPS at counts 10, 25, 50, 75 and 100, then every 50.
- **Targeting.** Crew damage goes to the floor row's weakest cell first, then the next row. It is
  shown as small bone-500 pops, one per miner type every 0.5 s, aggregated so the player's taps
  stay the stars.
- **Foreman** (Lumen talent, 5 Lumen) automates buying. When it is on, it buys the BEST option
  every 3 s if it costs at most 25 % of current gold. It is off by default.
- **Idle player (sim).** 5 min active, then 0 taps: 250 m at 16:01, 500 m at 30:58, 1,000 m at
  50:53. An active player (4 taps/s) is about 3× faster: 1,000 m at 17:07. Tapping always pays,
  and idling is real progress.

### 3.2 Offline settlement

| Rule | Value |
|---|---|
| Starts after | The app is hidden ≥ 60 s (`visibilitychange`, `pagehide`, or the Android shell's `deepDownLifecycle('pause')`) |
| Cap | 8 h. Long Night talent raises it to 12, 16 and 24 h |
| Efficiency | 50 % of crew DPS. Night Shift talent raises it to 65, 80 and 100 %. Taps, Surge and combo do not count |
| Depth | Integrate the descent with the real HP table. **Stop at the next seal.** |
| After the seal | The remaining time pays gallery gold: 0.5 × DPS × seconds × gold-per-damage at the current depth (3 × biome value × ore average). |
| Chests | Chests passed are queued (max 5) and opened on return, one by one with full fanfare. |
| Clock safety | If `now < lastSeen − 5 min`, the settlement is 0 and the daily timers hold until the clock catches up. Nothing is ever taken away. |
| Examples (`offline.mjs`, crew DPS the sim run actually has at that depth) | 120 m, 450 DPS, 8 h: +110 m, 4.4e7 gold. 1,100 m, 2.6e6 DPS, 30 min: +211 m, 4.8e10. 1,100 m, 2.6e6 DPS, 8 h: +873 m (to 1,973 m, just short of the seal), 7.8e11. 1,500 m, 1e7 DPS, 8 h: stops at the 2,000 m seal, 4.0e12. 2,300 m, 8.5e7 DPS, 8 h: +969 m, 3.6e13 |

### 3.3 The return (it must be a feast)

1. **The away card**, 0 s. It covers the dock and keeps the world visible. It reads "While you
   were away (7 h 12 min)" and lists depth +N m, gold, gems and chests. Each line rolls up in
   0.5 s, one after another, with a coin-cascade tick. It ends with one button,
   **COLLECT** (48 px tall), and a secondary **×2 for 10 gems**.
2. **The catch-up descent**, 2.5 s. This is a Plunge (§5.6) from the old depth to the new one,
   with strata streaking past and the depth counter spinning. It ends with a thud and a dust ring.
3. **Chest queue.** Each queued chest drops in from above onto the floor and is opened with 1 tap
   (not 3, so the return stays fast). A chest is opened every 0.8 s at most.
4. **Seal waiting.** If the crew stopped at a seal, the seal card appears: "Your crew waits at
   the edge of the Glimmer Hollow. Break the seal!" with the 30 s timer button. This is the hook:
   the player's first action on return is the biome reveal.
5. **Purchase burst.** The BEST button and every affordable quick-buy light up. The usual result
   is 10–40 purchases in the first 20 s.

### 3.4 Battery while idle on screen

- Normally the frame cap is 60.
- After 15 s with no input the cap drops to 30 fps. After 60 s it drops to 20 fps.
- Any pointer event returns to 60 fps in the same frame.
- Behind the away card and sheets the cap is 30 fps.
- The screen is kept awake (`keepScreenOn`) only while input arrived in the last 5 minutes.

---

## 4. Economy

### 4.1 Cell HP (anchors, geometric interpolation between them)

| Depth (m) | Cell HP | Stone cell gold (= 3 × HP × biome value) | Row gold (7 cells × ore avg 1.5) |
|---|---|---|---|
| 0 | 1 | 3 | 31.5 |
| 10 | 40 | 120 | 1,260 |
| 25 | 250 | 750 | 7,880 |
| 50 | 450 | 1,350 | 14,200 |
| 100 | 2,000 | 9,000 | 94,500 |
| 250 | 26,000 | 1.72e5 | 1.80e6 |
| 500 | 1.0e5 | 9.6e5 | 1.01e7 |
| 1,000 | 8.0e5 | 1.10e7 | 1.16e8 |
| 2,000 | 2.0e7 | 3.96e8 | 4.16e9 |
| 4,000 | 3.0e9 | 8.55e10 | 8.98e11 |
| 8,000 | 1.0e12 | 4.05e13 | 4.25e14 |
| 16,000 | 3.0e15 | 1.71e17 | 1.80e18 |
| 32,000 | 3.0e19 | 2.43e21 | 2.55e22 |
| 64,000 | 3.0e24 | 3.42e26 | 3.59e27 |
| 128,000 | 3.0e30 | 4.86e32 | 5.10e33 |
| > 128,000 | × 1.0004 per m | — | — |

Biome value multiplies gold only: B1 1, B2 1.5, B3 2.2, B4 3.2, B5 4.6, B6 6.6, B7 9.5, B8 13.5,
B9 19, B10 27, B11 38, B12 54, then ×1.4 per Deep Beyond cycle.

**Seal HP** = 12 × (7 × cell HP at the boundary). The timer is 30 s (+2 s per Rune of Descent
level).

### 4.2 Upgrades (gold)

| Upgrade | Base cost | Growth | Effect per level | Unlock | Max |
|---|---|---|---|---|---|
| Pickaxe | 100 | ×1.13 | +1 tap damage; ×2 at L10, 25, 50, 75, 100, then every 50. The model changes every 25 levels (§9.9) | 0 m | ∞ |
| Keen Edge | 5,000 | ×1.6 | +1 % crit chance (base 5 %) | 25 m | 45 (→ 50 %) |
| Heavy Head | 7,500 | ×1.5 | +0.5 crit multiplier (base ×5) | 25 m | ∞ |
| Steady Hand | 20,000 | ×1.8 | hold rate +0.5 taps/s (base 5) | 25 m | 10 |
| Rhythm | 10,000 | ×2.5 | combo cap +3 hits (base 20, +1 % per hit) | 50 m | 10 |
| Surge Lens | 30,000 | ×2.2 | Surge +1 s (base 10 s) | 50 m | 10 |
| Wide Swing | 50,000 / 1.5e7 / 6.0e9 | — | 3 / 5 / 7 cells per tap | 100 m | 3 |
| Crew Bond | 200,000 | ×3 | each tap adds 1 % of crew DPS (not crit-multiplied) | 100 m | 10 |
| Prospector | 100,000 | ×2.4 | ore share ×(1 + 0.1 × level), a gold multiplier | 100 m | 20 |
| Deep Strike | 2.0e6 | ×12 | pierce +2 cells | 250 m | ∞ |
| Lantern Bomb | 3.0e9 | ×40 | blast table §2.5 | 1,000 m | 5 |

The sim covers Pickaxe, Keen Edge, Heavy Head, Rhythm (as the combo factor), Wide Swing, Crew Bond,
Deep Strike, Lantern Bomb and the crew. Steady Hand, Surge Lens and Prospector are quality-of-life
or small multipliers, outside the sim. The economy angle must fold Prospector into its run.

### 4.3 The BEST badge (it makes the economy simple)

Every 0.5 s the game computes, for each visible option:

payback = cost / (Δgold per second from buying it) + max(0, cost − gold) / current gold per second

The lowest payback gets the **BEST** badge. The middle quick-buy slot always shows the BEST option
(§8.3). This is the same rule the sim's buyer follows, so the sim's pacing is what a player who
only ever taps BEST gets.

### 4.4 Cell types (per-row shares in Biome 1; later biomes swap the materials)

| Cell | Share | HP × | Gold × | Notes |
|---|---|---|---|---|
| Host rock (stone) | 80 % | 1 | 1 | The biome's rock family |
| Soft (soil, gravel, fungus) | 8 % | 0.5 | 0.6 | Breaks in half the taps: free speed |
| Ore I (copper, …) | 6 % | 1.5 | 4 | From row 3 (scripted) |
| Ore II (iron, …) | 3 % (from B2) | 2 | 10 | |
| Crystal node | 1 % | 1.2 | 6 | A light emitter: the cyan lookahead glow |
| Gem cell | 0.7 % | 2 | 0 | +1 gem (+1 per 10 % Glimmer Heart) |
| Motherlode | 0.25 % | 3 | = 60 s of income | A gold cell. Its section face shimmers 5 rows ahead |
| Specimen (fossil, …) | 1 per about 40 m | 2 | 5 | Fills the cabinet (§6.1) |
| Chest | every 25 m (wood), 100 m (iron), biome entry (crystal), rare (Reliquary) | 3 taps, fixed | §6.4 | Embedded and visible through the section 7 rows ahead |

Ore average ≈ 0.8 + 0.048 + 0.24 + 0.3 + 0.06 = 1.45, so the model uses 1.5.

### 4.5 Multiplier stacking (one formula, shown in the stats sheet)

```
damage = base × 2^milestones × LumenMult × 2^BrighterFlame × Π relics × (1 + 0.01 × medals) × boosts × surge × combo
gold   = 3 × HP × biomeValue × materialMult × (1 + 0.1 × Prospector) × Π relics × goldBoosts
LumenMult = 1 + 0.10 × unspent Lumen
```

### 4.6 Prestige: Rekindle (Lumen)

- **Unlock.** Breaking the Lintel Seal at 1,000 m. The story beat is in §6.6.
- **Gain** = floor((max depth this run / 250)^1.3):

  | Max depth | 1,000 m | 2,000 m | 4,000 m | 5,896 m | 10 km | 16 km | 32 km | 128 km |
  |---|---|---|---|---|---|---|---|---|
  | Lumen | 6 | 14 | 36 | 60 | 120 | 222 | 548 | 3,326 |

- **Kept:** Lumen, talents, relics, specimens, logs, runes, achievements, gems, the daily streak and
  the lantern tower at the camp. **Reset:** gold, upgrades, crew and depth.
- **Recommended badge.** The Lumen tab glows when the gain would at least multiply damage by 1.5,
  and descent has been under 1 row/s for 120 s.
- **Lumen talents** (cost in Lumen; spending them removes their +10 % each):

| Talent | Cost | Effect |
|---|---|---|
| Brighter Flame | 20 × 2^n | ×2 all damage per level (the sim buyer takes it whenever it beats the lost +10 %s) |
| Foreman | 5 | auto-buy BEST (§3.1) |
| Head Start | 10 / 30 / 90 / 270 | start each run at 100 / 250 / 500 / 1,000 m, already sealed |
| Long Night | 15 / 45 / 135 | offline cap 12 / 16 / 24 h |
| Night Shift | 20 / 60 / 180 | offline efficiency 65 / 80 / 100 % |
| Keen Eye | 25 / 75 | event frequency +20 % / +40 % |
| Deep Pockets | 30 / 90 | chest gold ×2 / ×4 |
| Cataclysm | 120 × 3^n | §2.5 |

- **Run chain (sim, 35 min per run, Brighter Flame bought greedily):**

| Run | Start Lumen | Damage mult | Depth at 35 min | 1,000 / 4,000 / 8,000 m at |
|---|---|---|---|---|
| 1 | 0 | ×1 | 5,896 m | 17:07 / 26:57 / — |
| 2 | 60 | ×10 | 9,966 m | 4:52 / 8:08 / 15:32 |
| 3 | 180 | ×52 | 12,338 m | 4:10 / 7:37 / 11:57 |
| 5 | 521 | ×370 | 15,001 m | 3:05 / 6:46 / 9:51 |
| 7 | 941 | ×1,059 | 16,114 m | 2:27 / 6:21 / 9:07 (16 km at 33:22) |
| 10 | 1,646 | ×3,315 | 17,632 m | 1:46 / 6:01 / 8:36 (16 km at 23:51) |

- **Starfall** (second layer) unlocks on first reaching 16 km. It resets Lumen and talents for
  Stars, and each Star gives ×1.25 Lumen gain. The economy angle owns its curve. This design only
  requires that Starfall #1 makes run 1 after it reach 16 km in ≤ 30 min.

### 4.7 Gems (earned only; there are no purchases in this game)

| Source | Gems |
|---|---|
| Gem cells | 1 each; about 2–3 per minute in early play |
| Chests | wood 1–3, iron 5, crystal 15, Reliquary 25 |
| Achievements | 5–50 |
| Daily chest | 10–30 |
| Streak | days 1–7: 10, 15, 20, 30, 40, 60, 100 |
| Daily quests | 10 / 15 / 25 |
| Events | 2–10 |

| Sink | Gems |
|---|---|
| ×2 gold boost, 10 min | 25 |
| ×2 tap boost, 5 min | 15 |
| Instant Surge | 10 |
| Time Warp (1 h of crew gold, instantly) | 60 |
| Offline collect ×2 | 10 |
| Relic reroll | 50 |
| Lantern flame cosmetics | 200–1,000 |

### 4.8 Pacing targets and what the sim gives

| Target | Goal | Sim 3 taps/s | Sim 4 taps/s | Sim 6 taps/s |
|---|---|---|---|---|
| First purchase | 5–12 s | 9.2 s | 6.9 s | 4.6 s |
| 25 m | 0:45–1:20 | 1:14 | 0:56 | 0:38 |
| 100 m (B2 reveal) | 2:20–5:10 | 5:06 | 3:42 | 2:19 |
| 250 m (B3) | 4:40–11:00 | 10:35 | 7:38 | 4:44 |
| 500 m (B4) | 7:30–17:00 | 16:13 | 11:57 | 7:32 |
| 1,000 m (Lintel, Rekindle unlock) | 10:00–24:00 | 23:03 | 17:07 | 10:41 |
| 4,000 m | — | not reached (3,545 m at 35:00) | 26:57 | 15:16 |
| Longest gap with nothing to buy or open (first 30 min) | ≤ 30 s | 23.4 s | 18.2 s | 19.1 s |
| Taps per cell before the wall | ≤ 6 | 1.5–5.6 (35 min) | 1.5–5.2 (to 3,500 m, 24 min); 7.6–11.1 at 4–6 km | — |
| Run 2 (60 Lumen) reaches run 1's 35-min depth (5,896 m) | ≤ 40 % of 35 min | — | 10:26 = 30 % | — |

---

## 5. The descent and the world in the voxel engine

### 5.1 The world window (a streamed slab)

| Item | Value |
|---|---|
| `VoxelWorld` | **32 (x) × 128 (y) × 16 (z)**, chunk 16, so 2 × 8 × 1 = **16 chunks**, 65,536 voxels (64 KB) |
| Light volume | `LightField` over the window: 256 KB RGBA8 3D texture, about 2 % of the old zone's 13 MB. Height 128 stays under WebGL2's guaranteed `MAX_3D_TEXTURE_SIZE` of 256 |
| Glass layer | z = 0 is always air. The cells' front faces at z = 1 are therefore meshed, which gives the **section cut** look: a geological cross-section seen through glass |
| Shaft | x = 12..18 (7 columns), cells at z = 1..3 |
| Back wall | z = 4..15: alcoves, dioramas and veins, seen behind the open shaft and wider at the back of the frustum |
| Absolute depth | `depth = yBase + (127 − localY)`, with `yBase` a multiple of 32. Every world-space function gets absolute coordinates through `yBase`: mesher noise, terrain textures (a `uYBase` uniform), macro noise and atmosphere. A rebase is then invisible |
| Rebase | When the floor passes local row 72 (from the top), shift by 32 rows: memmove blocks and light, re-key the chunk meshes 2 layers up (no remesh), generate 32 new rows (pre-generated in the strata worker), mesh the 2 new chunk layers plus the 2 seam layers (8 chunks in the mesh workers), and upload the light (texSubImage3D 256 KB). Budget ≤ 3 ms on the main thread, once per 32 rows |
| Edits | A cell break is 3 `world.set` calls (1–2 dirty chunks, worker remesh, drawn 1 frame later; ghost cells hide that frame, §9.2) and the incremental light fill (0.06–0.1 ms per voxel, measured). More than 24 voxels in one frame (blasts) batches the light: one window recompute in the light worker (about 2 % of the measured 280 ms zone pass, so about 6 ms off the main thread), uploaded the next frame |

### 5.2 Generation (`idle/world/strata.ts`, deterministic from (seed, absolute row))

- **Rows 0–30 are authored** for the tutorial (§7.2):
  - row 0: surface turf;
  - rows 0–2: soil, HP 1;
  - row 3: copper at columns 2 and 5;
  - row 6: a gem at column 3;
  - row 10: a wooden chest;
  - rows 14–17: a cavern crossing (a 4 m freefall);
  - row 18: a glow-grub creature alcove;
  - row 24: an iron chest. The 25 m milestone follows.
- **Rows 31 and on are procedural, per biome table:**
  - cell types by weighted hash;
  - ore veins as 3D value-noise blobs, thresholded so 65 % of veins are 2–5 cells (the old zone
    measured 65 % single voxels, which read as noise);
  - caverns are 3D worm noise. One crosses the shaft every 15–30 m (B1) to 10–20 m (B5+). A
    crossing leaves 2–6 rows mostly open: free speed and a freefall;
  - back-wall alcoves: 3–6 m wide, 2–4 m tall, 3–8 m deep, one every 5–7 m, alternating left and
    right of the shaft centre, each with a diorama kit from its biome (§5.5);
  - chests every 25 m;
  - a seal at every biome boundary;
  - a vista cavern at each biome entry: 24 m tall, x 2..30, z 1..15, holding the biome's set
    piece.
- The light budget per window is at most 160 emitter voxels, so the flood fill stays under 6 ms in
  the worker.

### 5.3 The camera (portrait, fixed, follows the descent)

These numbers are from `camera.py`. The floor row's top face is at y = 0 and the cell fronts at
z = 1.

| Parameter | Value |
|---|---|
| Position | (shaft centre x, floorY + 9.0, −28.0) |
| Look-at | (shaft centre x, floorY − 1.0, 2.0), so the pitch is 18.4° down |
| Lens | Horizontal extent fixed at **10.0 m at the cell front plane**, so the 7 columns plus 1.5 m of wall on each side always fill the width. The vertical FOV follows the aspect: 37.4° (360×740), 39.2° (390×844), 40.2° (412×915) |
| Framing | The floor's front edge sits at 52 % of the world region (between the top-bar bottom and the dock top), recomputed on resize. That is 397 px on 390×844. The floor's top face shows as a 29–34 px strip. The section below shows 6–7.5 rows of lookahead |
| Follow | A critically damped spring on y, ω = 10 rad/s (settles in about 0.35 s). A row clear adds a 60 ms "squash" offset of −0.08 m before the spring |
| Sheets open | The framing target moves so the floor sits at 50 % of the visible world above the sheet. **Digging continues while shopping** |
| Shake | Trauma model reused from CameraRig (trauma², decay 1.8/s). Max 0.25 m offset and 1.2° roll at trauma 1. Scaled by the Camera Shake setting; 0 with reduced motion |
| Reveal pull-back | The camera dollies back to z = −46 and up by 6 m over 0.6 s, holds 1.3 s, then returns in 0.6 s, with the FOV unchanged |
| Plunge | Over 12 rows/s the camera locks to the floor and the speed lines take over (§5.6) |

### 5.4 The biome ladder

| # | Biome | Depth (m) | Air (fog / exposure) | Rock (layers; ★ = new painter) | Ores (gold ×) | Gem | Light | Dioramas (alcove kits) | Creatures | Ambient | Seal | Music |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rootwork | 0–100 | warm umber #1b1a1c / 1.8 | soil, gravel, moss, umber | copper ×4, tin★ ×6 | amber nugget | Halden route lamps (LIGHT_LAMP) every 12 m, glow-worm dots | roots, Halden timbering (structure timber), crates, barrels, rope coils, a buried cart | glow-grub, burrow beetle | dust motes | Halden Hatch | D major pentatonic |
| 2 | Slate Galleries | 100–250 | tunnel grey #161a20 / 1.36 | slate, deep slate, hardened slate | copper ×4, iron ×10 | smoky quartz | hanging lanterns | rail galleries, hoist winch, Halden notes, broken carts | rock crab, cave bats | drips, dust | Iron Grate | D dorian |
| 3 | Glimmer Hollow | 250–500 | hollow blue #203046 / 2.25 | slate, crystal seams | glimmer ×6 (+light), iron ×10 | glimmer heart | crystal clusters (cyan) | geodes, carved walkways, the Glimmerfall waterfall | lumen moths, crystal snail | cyan sparkles | Crystal Lattice | E lydian |
| 4 | Builder's Lintel | 500–1,000 | umber plus glyph cyan | ancient brick, glyph stone, crumbling brick (minable here) | echo crystal ×12, iron ×10 | rune garnet | glyph stones, braziers | colonnades (columns), stairs, statues, rune doors | stone sentinels (statues that blink), dust wisps | drifting script motes | **The Lintel Seal** (boss → Rekindle) | A aeolian + choir |
| 5 | Fungal Deep | 1,000–2,000 | teal-green #10241e / 2.0 | mycel★, moss, spongy soft cells (HP ×0.5) | verdigris ×14, spore pearl ×20 | spore opal | bioluminescent fungi (new green emitter, 0.2 / 0.7 / 0.5) | giant mushrooms, spore pools | cave grazer, spore puff | floating spores | Root Knot | F mixolydian |
| 6 | Ember Forge | 2,000–4,000 | ember #2a120a / 1.6 | basalt★, magma vein★ (emissive), obsidian★ | gold ×18 | fire opal | lava (LIGHT_EMBER), forges | builders' forges, anvils, chains, lava falls | ember salamander, magma beetle | rising embers, heat shimmer (post) | Forge Door | C phrygian + drums |
| 7 | Rime Vault | 4,000–8,000 | ice #1a2a36 / 2.1 | ice★ (glassy), frost slate★ | silver ×20 | frost diamond | pale blue (0.4 / 0.6 / 0.8) | frozen archive shelves, ice columns, a frozen Halden crew | frost moth, ice wyrmling | snowfall | Frozen Gate | B minor + celesta |
| 8 | Rift of Echoes | 8,000–16,000 | rift violet #1e1a36 / 2.1 | echo crystal, void stone★ | echo shard ×24 | void pearl | LIGHT_ABYSS | floating ruins, upside-down waterfalls | echo wisps, rift ray | violet motes rising | Echo Lock | whole-tone |
| 9 | Sunken City | 16,000–32,000 | teal-brass #14201f / 1.9 | masonry (course libraries), tiles | brass ×28 | sea glass | city lamps (amber) | towers, bridges, plazas, homes | lantern fish (swim in air), city wardens | slow light motes | City Gate (Starfall unlock) | E♭ major |
| 10 | Leviathan Bones | 32,000–64,000 | bone-red #22140f / 1.8 | fossil stone★, bone★ | ivory ×32, insect amber ×40 | blood amber | phosphor bones | giant ribs, skulls; a leviathan swims past in the backdrop every 3 min | bone crawler | ash | The Jaw | low drones |
| 11 | Starheart | 64,000–128,000 | gold-white #26201a / 1.5 | star glass★, gold rock★ | star metal ×40 | sun diamond | new white-gold emitter | crystal spires, orbiting stones | star sprites | golden rays | Heart Ward | bright major |
| 12 | The Black Stone | 128,000–256,000 | near black + cyan runes | black stone, glyph | lumenite ×54 | lantern pearl | runes | the Lantern-bearers' last hall, 8 rune doors, the monolith | the watchers | script motes | The Black Stone (finale) | all 8 rune motifs |
| ∞ | Deep Beyond: Echo I, II, … | 256 km and on, doubling | B1–B12 kits, hue +40° per cycle | — | ×1.4 per cycle | — | — | — | — | — | +1 seal tier | biome theme + cycle key change |

The atmosphere presets extend `ATMOSPHERES` (camp, tunnel, hollow, rift) with one preset per
biome. Across 20 m on each side of a boundary they blend with the existing
`LightingRig.updateAtmosphere` mixing. **The fog starts at the glass plane:** the haze distance is
`max(0, rayLength − distanceToPlane(z = 0))`, so the 28 m of camera air in front of the glass adds
no fog.

### 5.5 What fills the caverns (density contract)

The director's complaint was "horribly empty". These are hard minimums per 20 m screen of
descent, checked by a generator test (§11).

| Element | Minimum per 20 m screen |
|---|---|
| Lit alcove dioramas in the back wall | 3 |
| Animated things (creature, waterfall, moths, embers, swinging lantern, steam) | 2 |
| Light sources visible (emitters, lamps, crystals) | 3, and at least 2 hues (warm + biome accent) |
| Ore or crystal cells visible in the section lookahead | 4 |
| Chest visible in the lookahead | one every 25 m, shown 7 rows ahead |
| Tappable bonus (creature, chest, event object) | 1 per 20 s of active play (cadence director) |
| Cavern crossing the shaft | one per 15–30 m (B1–B4), 10–20 m (B5+) |
| Vista cavern | one per biome entry, with its set piece |

Diorama kits reuse PropRenderer kinds:
- campfire, crate, barrel, lanternPost, hangingLantern, crystalCluster, tablet, ropeCoil,
  brokenCart, abyssMonolith, haldenNote, hoistWinch;
- structures (columns, stairs, bridge) for B4 and B9;
- the Waterfall effect and LumenMoths.

New prop kinds are the creatures and these biome props: mushroom, anvil, ice shelf, bone rib,
floating rock, star spire, city tower.

### 5.6 Plunge mode (démesure made visible)

- **Enter.** Measured descent above 12 rows/s for 0.5 s.
- **During:**
  - stop per-cell voxel edits;
  - fade in over 0.3 s a full-screen strata streak shader: biome palette bands scrolling up at
    speed × 39 px/m, 24 speed lines and sparks;
  - break cells analytically (gold, chests and specimens are rolled per row and shown as
    aggregate fountains);
  - the depth counter spins with motion blur;
  - a wind roar bed plays, its level following the speed.
- **Exit.** Speed below 6 rows/s for 1 s, a seal reached, or a biome boundary.
- **Landing.** Regenerate the voxel window at the new depth (in the worker, ≤ 1 frame of
  latency hidden by the streak), then land: dust ring, trauma 0.4, 80 ms hitstop and a "+412 m"
  pop.
- **Cost.** One full-screen pass, about 0.4 ms GPU at 1 MP.

### 5.7 The opening image (surface)

The first screen is the surface at dusk:
- turf and the camp (campfire, tent, lantern post) on both sides of an old Halden shaft mouth
  (timber frame and hoist winch);
- a gradient sky (a new full-screen quad shader, behind everything) with 60 stars;
- the explorer standing on row 0.

As the player digs, the surface scrolls up and away. By 6 m the sky is gone, by 12 m only the
lamp-lit shaft remains. Each Rekindle returns here at dawn, and the camp's **lantern tower** has
grown by one lantern (visible progress for the reset layer).

---

## 6. Discovery, collections, events, the mystery thread

### 6.1 The Specimen Cabinet (72)

- Each biome holds 6 specimens: 2 ores, 2 gems, 1 fossil or artefact, and 1 creature (tap it).
- **First find.** A card flips in at the top right (1.2 s, no pause, specimen raster from
  `sprites.ts`, "NEW"). The cabinet tab gets a dot.
- **A complete biome set** gives +10 % gold in that biome permanently and lights its cabinet
  shelf. All 72 give a ×2 gold relic ("Curator's Lens").

### 6.2 Relics (24 Builders' relics, levels 1–10)

- Relics drop from Reliquary chests (1 per biome on average) and from seals (first break: a
  guaranteed relic).
- A duplicate adds a level: level n needs n copies.

| Relic | +per level | Relic | +per level |
|---|---|---|---|
| Halden Lamp | offline efficiency +3 % | Builder's Chisel | crit chance +0.5 % |
| Echo Bell | combo window +0.03 s | Glimmer Heart | gem chance +10 % |
| Rune of Descent | seal timer +2 s | Eye Rune | chest chance +5 % |
| Star Rune | Surge +0.5 s | Miner's Locket | crew DPS +10 % |
| Iron Crown | Pick milestones ×1.05 each | Chain of Waves | Wide Swing side cells +3 % |
| Spire Shard | pierce +1 | Gate Key | seal HP −3 % |
| Chasm Stone | freefall gold +20 % | Lantern Glass | Surge meter +5 % per tap |
| Ember Anvil | Lantern Bomb charge −1 tap (min 10) | Rime Compass | offline cap +30 min |
| Void Pearl | event frequency +4 % | Brass Cog | upgrade cost −1 % |
| Bone Flute | creature rewards +15 % | Sun Diamond | motherlode chance +4 % |
| Curator's Lens | gold ×2 (all specimens, 1 level) | Watcher's Eye | all damage +5 % |
| Lintel Shard | Lumen gain +2 % | Halden Ring | daily chest +10 % |

### 6.3 Achievements (120, in endless tiers)

There are 12 families of 10 tiers each. Each tier gives gems (5–50) and **+1 % damage**, called a
medal (additive, shown on the stats sheet).

| Family | Tiers |
|---|---|
| Depth | 25 m, 100 m, 250 m, 500 m, 1 km … doubling |
| Cells broken | 100, 1K, 10K, … |
| Crits | 10, 100, … |
| Best combo | 10, 25, 50, 100, 150, … |
| Chests opened | 5, 25, … |
| Seals broken | 1, 3, 6, … |
| Specimens | 6, 12, … |
| Relic levels | 5, 15, … |
| Events | 5, 25, … |
| Purchases | 50, 250, … |
| Rekindles | 1, 3, 10, … |
| Gold earned | 1e4, 1e8, … (×1e4 per tier) |

Tiers past the 10th keep doubling, so the list never ends.

### 6.4 Events (the "golden moments")

The cadence director runs only while the player is active (input in the last 10 s). The first
event comes at 50 m (scripted). After that one event comes every U(45, 90) s, never two at once,
and never during a seal, a reveal or the first second of a Surge.

| Event | Weight | Duration | What to do | Reward |
|---|---|---|---|---|
| Glimmerfall | 25 | 3 s | 5–9 crystals fall from the top of the screen; tap them | each: 1 gem or 5 s of income; uncaught ones shatter on the floor for 25 % |
| Treasure Mole | 20 | 4 s | a mole pops out of a wall niche; tap it 3 times | an iron chest |
| Golden Vein | 15 | next 6 rows | 3 gold cells per row light up in the section | ×20 gold cells |
| Moth Swarm | 15 | 6 s | tap the swarm once | ×2 gold for 30 s |
| Ancient Echo | 10 | 3 s | a rune glows on the back wall; tap it | a lore fragment + 10 gems |
| Cave Quake | 10 | 4 s | 4 boulders loosen; tap them | 1 gem each; untapped ones crash into the floor and crack 3 cells (a free bonus, no penalty) |
| Supply Line | 5 | 5 s | a crate drops on a rope; tap it | a random boost (×2 tap 60 s, instant Surge, 30 gems) |

Chests:

| Chest | Frequency | Gold | Gems | Relic chance |
|---|---|---|---|---|
| Wood | every 25 m | 15 s of income | 1–3 | 0 % |
| Iron | every 100 m | 60 s of income | 5 | 2 % |
| Crystal | every biome entry | 5 min of income | 15 | 25 % |
| Reliquary | 1 per biome, random | — | 25 | 100 % |

### 6.5 Daily, streak and weekly loops (local clock)

- **Daily Chest.** Ready every 20 h. The first one is free at 75 m in session 1, so the player
  learns the loop. Contents: 30 min of income, 10–30 gems and a 10 % relic chance.
- **Streak.** A 7-day calendar paying 10, 15, 20, 30, 40, 60 and 100 gems; day 7 also gives a
  relic. Missing a day pauses the streak and does not reset it (F7: no punishment). A paused
  streak never advances.
- **Daily Digs.** 3 quests from a pool of 20 (for example "Break 500 cells", "Get a 50-hit combo",
  "Open 3 chests", "Catch 10 Glimmerfall crystals", "Break a seal"). Rewards are 10, 15 and
  25 gems. Quest targets scale with the current rates so each takes 3–8 minutes.
- **Deep Event.** Every 7 days, for 48 h, from local Friday 18:00. The modifiers rotate:
  - Glimmer Rain: ×3 gem cells;
  - Golden Hour: ×2 gold;
  - Migration: ×3 creatures;
  - Quakes: ×2 events;
  - Echo Week: ×2 Lumen gain.

### 6.6 The mystery thread (the reason to go deeper)

This uses the existing lore from GAME_DESIGN.md: the Lantern-bearers (the builders and their 8
runes), the Halden Concern (the crews who vanished) and the Black Stone. Each biome holds:
- 3 Halden logs (36 in all), found as haldenNote props in alcoves, in story order;
- from B2 to B9, one rune tablet (8 runes);
- a seal whose first break plays a 4-line story card (text only, 6 s, can be skipped with a tap).

| Biome | Beat (the seal card's last line) | The new question |
|---|---|---|
| B1 Rootwork | "Halden's shaft. They dug it in a year, then stopped." | Why did they stop? |
| B2 Slate Galleries | "The lamps burn warmer the deeper we go." (rune of Descent) | What feeds the flame? |
| B3 Glimmer Hollow | "The crystals grew along their walkways, after them." (rune of the Eye) | Did the builders seed them? |
| B4 Builder's Lintel | **The Lintel Seal:** "They carried light down. Something carried it back up." The Rekindle unlocks (the lantern is relit with the builders' flame) | What is down there that wants light? |
| B5 Fungal Deep | the builders' gardens (rune of the Lantern) | Who tended them? |
| B6 Ember Forge | they forged lanterns, not weapons (rune of the Spire) | Lanterns for whom? |
| B7 Rime Vault | the frozen Halden crew, still holding their lamps (rune of the Waves) | What froze them mid-step? |
| B8 Rift of Echoes | the voices are the builders' own, delayed (rune of the Chasm) | How old is an echo down here? |
| B9 Sunken City | their homes, empty and tidy (rune of the Gate). Starfall unlocks | Where did a whole city go? |
| B10 Leviathan Bones | something enormous died carrying light in its ribs (rune of the Star) | Was it the carrier? |
| B11 Starheart | the light at the core is the same as your lantern's | Is your lantern theirs? |
| B12 The Black Stone | the 8 runes on the stone light in the order you found them. The finale card, then "The Lintel opens: the Deep Beyond" | The cycles: each Echo biome adds one log (endless story drip) |

---

## 7. Guidance: tutorial, objective, hints, next goal

### 7.1 Principles

1. Teach by doing: one verb at a time, one line of text, and the action is always possible right
   away.
2. There is never a modal in the first 3 minutes. No "OK" buttons, and the world is never paused.
3. Reveal the UI in order (table §7.3). At 0:00 the screen shows the world, the gold counter and
   one prompt.
4. Every hint can be dismissed by doing the thing. Text hints come at most once per 20 s, and
   never during a seal, a reveal or a Surge start.
5. A first-time player skips the menu entirely: the first launch goes straight into the shaft
   (§7.2). The menu exists from the second launch (Continue, Settings, About).

### 7.2 The first 3 minutes (script; times are at 4 taps/s)

| Time | Trigger | Shown | Player does | Done when | Fallback |
|---|---|---|---|---|---|
| 0:00 | First launch, boot finished | The surface at dusk. The wordmark descends into the shaft and fades (1.2 s). A pulsing hand over the centre cell, and "TAP TO DIG" (display 22 px) | taps anywhere | first `cell:break` (HP 1, so the first tap always breaks) | after 4 s with no tap, the hand taps the cell itself, showing a ghost break |
| 0:01 | First break | Big burst; 1 coin flies to the newly revealed **gold counter** (slides in from the top, 250 ms) | keeps tapping | — | — |
| 0:02 | 3 breaks | Prompt becomes "Clear the row" with 7 pips filling | taps | row 0 cleared | if 5 s pass with no tap, the hand points at the nearest solid cell |
| 0:05 | Row clear | Floor drops 1 m with a thud. The **depth readout** slides in ("1 m") | taps | — | — |
| 0:07 | Gold ≥ 100 | The **Pickaxe** quick-buy rises from the bottom (300 ms, overshoot), amber with a bouncing arrow. "Upgrade your pick" | taps the button | Pick L2 | if it is ignored for 8 s, the arrow bounces again (at most 2 times); taps on the world keep digging |
| 0:08 | Pick bought | The pick model brightens, "+1 TAP" flies from the button to the pick. Prompt clears | taps | — | — |
| 0:10 | Row 3 | First copper in the section (twinkling). "Copper is worth 4×" (one line, 2.5 s) | taps | copper broken | — |
| 0:16 | Row 6 | A gem cell. It breaks into a gem that flies to the new **gem counter** | — | — | — |
| 0:24 | 10 m | A wooden chest is exposed: "TAP THE CHEST" ring. Rope sound, an Apprentice climbs down a rope | taps the chest 3 times | chest open | the chest shakes every 2 s; the crew starts hitting it after 6 s |
| 0:28 | Chest opened | Loot fountain. The **Hire Apprentice** quick-buy appears (slot 3) with "Helpers dig for you, even when you're away" | buys | Apprentice ×1 | arrow after 8 s |
| 0:35 | Rows 14–17 | The cavern crossing: the floor gives way, a 4 m freefall with a whoosh, "+4 m" | — | — | — |
| 0:40 | The 30th tap of the session | Crit **guaranteed** on this tap: "CRIT!" lesson by doing (35 ms hitstop, amber pop) | — | — | — |
| 0:45 | Row 18 | A glow-grub in an alcove. A sparkle ring around it (no text) | taps it | grub collected (gold + specimen card) | the ring pulses for 6 s, then the grub crawls away (rewarding nothing; no penalty) |
| 0:56 | 25 m | Milestone: banner "25 m", an iron chest, unlocks Keen Edge and Heavy Head. The **Goal Card** appears with its first goal ("Hire 3 Apprentices") | opens the chest | — | — |
| 1:10 | First 10-hit combo | The combo counter appears for the first time: "×1.10 · 10 HITS — keep the rhythm!" | — | — | not shown if no 10-hit combo happens before 3:00; then shown on the first one |
| 1:54 | 50 m | The **Surge gauge** appears (left wall), pre-filled to 140/240. "Fill the lantern" | taps | Surge fills (about 20 s) | — |
| 2:05 | 50 m + 2 rows | First event, scripted: Glimmerfall. "Catch the crystals!" | taps the crystals | event over | — |
| 2:15 | Surge full | **SURGE ×3**: first Surge, 10 s, drums | taps like mad | — | — |
| 2:55 | 75 m | The Daily Chest intro: "A gift from the camp — every day" (the first one is free) | taps | claimed | it waits in the tab with a dot |
| 3:10 | 80 m | The next-goal bar shows "SLATE GALLERIES · 20 m" with the seal icon. The bar pulses as the player nears it | — | — | — |
| 3:42 | 100 m | **Seal 1: the Halden Hatch.** Timer ring, 30 s. Estimate "~11 s" (green). Drums | taps | seal broken, then the B2 reveal | the first seal's HP is ×0.5 (cannot fail at the scripted power); if it fails anyway, "Try again" at once |

### 7.3 Progressive UI reveal

| UI element | Appears at |
|---|---|
| Gold counter | first break |
| Depth readout | first row clear |
| Quick-buy slot 1 (Pickaxe) | gold ≥ 100 |
| Gem counter | first gem |
| Quick-buy slot 3 (crew) | 10 m chest opened |
| Goal Card | 25 m |
| Quick-buy slot 2 (BEST) | 25 m (first time 2 upgrades compete) |
| Combo counter | first 10-hit combo |
| Surge gauge | 50 m |
| Tab bar: Dig, Upgrades, Crew | 25 m |
| Tab: Collection | first specimen |
| Tab: Lumen | 1,000 m |
| Next-goal bar | 10 m |
| Blast pips (right wall) | Lantern Bomb L1 |
| Menu button | always (top right; it is never a barrier) |

### 7.4 The Goal Card (the always-visible objective)

- Exactly **one goal** is shown at a time (44 px strip, §8). It shows an icon, a one-line text, a
  4 px progress bar and the reward. When complete, the card glows amber and **tapping it claims**
  the reward; it auto-claims after 6 s. It then flips to the next goal (180 ms).
- **Goals 1–30 are scripted:**
  1. Tap the rock
  2. Clear the row
  3. Upgrade your pick
  4. Reach 10 m
  5. Open the chest
  6. Hire an Apprentice
  7. Break 3 copper
  8. Reach 25 m
  9. Land a critical hit
  10. Pick level 10 (the first ×2)
  11. 10-hit combo
  12. Hire 5 Apprentices
  13. Reach 50 m
  14. Fill the Surge
  15. Hire a Drill Bot
  16. Catch 5 crystals
  17. Reach 75 m
  18. Open the Daily Chest
  19. Crew 100/s
  20. Break the Halden Hatch
  21. Buy Wide Swing
  22. Find 3 Slate Galleries specimens
  23. 25-hit combo
  24. Reach 160 m
  25. Tap a Treasure Mole
  26. Pick level 25
  27. Break the Crystal Lattice
  28. Buy Deep Strike
  29. Hold 25 gems
  30. Reach 500 m
- **After 30, a generator** cycles through goal types: depth, buy, crew count, combo, chest,
  creature, event, specimen and seal. It picks the target so the ETA at current rates is 45–90 s,
  and it never repeats a type twice in a row. Rewards: gold = 20 s of income, plus 1–5 gems on
  every 3rd goal.

### 7.5 The next-goal bar (always on screen, under the top bar)

- **Content.** The next seal if it is ≤ 150 m away, otherwise the next depth milestone:
  - every 25 m up to 100 m;
  - every 50 m up to 500 m;
  - every 100 m up to 2 km;
  - every 500 m up to 10 km;
  - every 1 km after that.

  Example: "▼ SLATE GALLERIES · 72 / 100 m · ~38 s" with a fill bar and the reward icon (chest
  type or seal).
- **ETA.** Updated at 2 Hz from a 10 s moving average of the descent speed. If the ETA is over
  3 minutes, the bar turns violet and shows "Upgrade to go faster" once per milestone, and the BEST
  button pulses once.
- The **lookahead tag** at the right wall margin shows "chest 4 m" when a chest is within 7 rows.

### 7.6 Contextual hints (at most 1 text hint per 20 s)

| Id | Trigger | Shown | Cooldown |
|---|---|---|---|
| H1 | no tap for 5 s in the first 60 s | pulsing hand on the floor centre, "Tap to dig" | 10 s |
| H2 | an affordable upgrade not bought for 8 s | BEST button wiggle + arrow (no text) | 3 times per session |
| H3 | the combo is lost 3 times between 7 and 9 hits | "Keep tapping to keep the combo" | once ever |
| H4 | a seal appears | "Break the seal in 30 s · estimate ~18 s", coloured green, amber or red by the estimate | every seal |
| H5 | a seal fails | "The seal holds. +18 % power needed" + BEST highlight | every fail |
| H6 | Rekindle recommended | one card "Rekindle: start over ×7.0 stronger" + glow on the Lumen tab | once per run |
| H7 | visible but no input for 30 s | "Your crew keeps digging. Tap to speed up!" | once per session |
| H8 | an event object untapped for 2 s | sparkle ring (no text) | per object |
| H9 | return with the crew waiting at a seal | the seal card (§3.3) | per return |
| H10 | a tab unlocks | a dot on the tab, plus a 1-line toast "New: Collection" | once per tab |

### 7.7 The unlock drip-feed (anti-boredom backbone; times at 4 taps/s, sim)

| Time | Depth | New thing |
|---|---|---|
| 0:00 | 0 | tap to dig |
| 0:07 | 2 | Pickaxe upgrade |
| 0:10 | 3 | ore (copper ×4) |
| 0:24 | 10 | first chest, Apprentice, next-goal bar |
| 0:35 | 14 | freefall through the first cavern |
| 0:45 | 18 | first creature |
| 0:56 | 25 | crits (Keen Edge, Heavy Head), Steady Hand, Goal Card, tabs |
| 1:10 | — | combo |
| 1:54 | 50 | Surge, Rhythm, Surge Lens, Drill Bot, events |
| 2:55 | 75 | Daily Chest, achievements |
| 3:42 | 100 | **Seal 1, Biome 2 reveal**, Wide Swing, Crew Bond, Prospector, specimen cabinet |
| 5:00 | about 160 | Burrow Mole, Treasure Mole event |
| 7:38 | 250 | **Biome 3 Glimmer Hollow**, Deep Strike, boosts shop (gems) |
| 9:30 | about 330 | Golden Vein event, Steam Borer |
| 11:57 | 500 | **Biome 4 Builder's Lintel**, rune tablets, Reliquary chests (relics) |
| 14:00 | about 700 | Rune Golem, Supply Line event |
| 17:07 | 1,000 | **The Lintel Seal (boss) → Rekindle + Lumen tab, Biome 5**, Lantern Bomb |
| 20:13 | 2,000 | **Biome 6 Ember Forge**, Magma Auger, first Plunge |
| 26:57 | 4,000 | **Biome 7 Rime Vault**, Rift Engine; the wall begins and Rekindle is recommended about 30–35 min |

### 7.8 Returning players

- The **second launch** shows the menu (Continue big, plus Settings and About), then the away card
  (§3.3).
- After more than 3 days away, a one-line "Welcome back" reminds the player of the current goal
  and the BEST button.
- Old v2 saves (the third-person game) migrate to a fresh descent. They get +100 gems and the
  relic "Halden Ring" (a veteran badge). The old world deltas are dropped.

---

## 8. Portrait UI layout

### 8.1 Layout at 390 × 844 CSS px (safe insets `t`, `b` from `--safe-*`; values below for t = b = 0)

```
y=0   ┌──────────────────────────────────────────────┐
      │[DEPTH 127 m ][  ◉ 12.4K   +3.4K/s ][◆ 37][≡]│  top bar 8..56 (plates 48 px)
 62   │▼ SLATE GALLERIES · 72/100 m · ~38 s  [🜲]   │  next-goal bar 62..86 (24 px)
 90   ├──────────────────────────────────────────────┤
      │▌     ×1.24 · 24 HITS                       ▐│  combo at floor −150 px
      │▌S       (dug shaft, crew, pops rise)       B▐│  S = Surge tube (x 6..26, y 200..560)
      │▌U                                          L▐│  BL = blast pips (x 364..384)
      │▌R   ═══════ FLOOR ROW (y ≈ 397) ═══════    A▐│  7 columns, x 58..331 (39 px each)
      │▌G   section lookahead: ores, chest, glow   S▐│  6–7 rows visible below the floor
      │▌E                               chest 4 m  T▐│  lookahead tag (right margin)
660   ├──────────────────────────────────────────────┤
      │ ◆ Hire 3 Apprentices      ▓▓▓▓░░ 2/3   🎁50 │  Goal Card 664..708 (44 px)
714   │┌──────────┐┌──────────┐┌──────────┐          │
      ││PICKAXE   ││ ★ BEST   ││APPRENTICE│          │  quick-buy 714..790 (3 × 118 × 76)
      ││Lv 12 +3  ││Keen Edge ││×8  +8/s  │          │
      ││◉ 1.2K    ││◉ 5.0K    ││◉ 340     │          │
796   │└──────────┘└──────────┘└──────────┘          │
      │  DIG   UPGRADES   CREW   COLLECTION   LUMEN  │  tab bar 796..844 (48 px, 5 × 73 px)
844   └──────────────────────────────────────────────┘
```

| Element | Position / size (390×844) | Type and colour (brand tokens) | Behaviour |
|---|---|---|---|
| Depth plate | x 12–122, y 8–56 | Lintel 26 px amber-300 value, 12 px brass-300 biome label; plate slate-900 at 0.72 alpha, octagon cut 8 | rolls on change (120 ms); bumps on a milestone |
| Gold plate | x 130–282, y 8–56 | coin 24 px, Lintel 22 px bone-100, rate 12 px verdigris-300 | rolling counter 250 ms ease-out; punch ×1.12 on each loot arrival |
| Gem chip | x 288–334, y 8–56 | gem 20 px, 15 px rune-200 | punch on arrival |
| Menu | x 338–382, y 8–56 (48 × 48 hit) | octagon icon | opens the settings sheet |
| Next-goal bar | x 12–378, y 62–86 | 13 px brass-300 label, 6 px fill amber-400, reward icon 20 px | §7.5 |
| World region | y 90–660 | — | every tap here digs (§2.1) |
| Surge tube | x 6–26, y 200–560 | lantern-glass tube, amber fill, white-gold when full | the fill rises with taps; it bursts on Surge |
| Blast pips | x 364–384, y 200–560 | 20 pips, ember | — |
| Combo | centre, floor − 150 px | Lintel 28 px + 13 px label, drain ring 36 px | §2.6 |
| Pops and flights | over the world | WebGL overlay (§9.3) | — |
| Goal Card | x 12–378, y 664–708 | 15 px bone-100 text, 4 px bar | tap to claim |
| Quick-buy ×3 | x 12 / 136 / 260, y 714–790, 118 × 76 each | eyebrow 12 px, level 17 px Lintel, effect 13 px, cost 15 px | §8.3 |
| Tab bar | y 796–844 (+ b), 5 × 73 px | 12 px labels + 24 px icons | opens sheets |

**Other sizes.** At 360×740 every element keeps its size. The world region becomes 90–556, the
floor 332 px and the column 36 px. At 412×915 the world region is 90–731, the floor 423 px and
the column 41.2 px. The dock is always 184 px + b. The quick-buy buttons scale their width to
(w − 36)/3. The 48 px minimum target (ui-check) holds at all three sizes. Text is 12 px or larger
everywhere.

### 8.2 Sheets (tabs)

- A sheet slides up to a top edge at 36 % of the screen height (304 px at 844) in 220 ms
  (`motion.ts` tokens). The world stays visible above it, **the floor re-frames above the sheet,
  and taps there keep digging** (§5.3). Tapping the open tab again, or swiping the sheet down,
  closes it.
- **Upgrades:**
  - a segmented ×1 / ×10 / MAX control at the top;
  - 64 px rows: icon 40, name, level, effect delta ("+12 → +14 tap"), and a cost button 96×48,
    amber when affordable;
  - BEST first, then unlocked items in unlock order;
  - locked teasers in violet ("Unlocks at 250 m") so the player always sees what is coming.
- **Crew.** The same rows, plus a total DPS header and the Foreman toggle once it is owned.
- **Collection.** Sub-tabs Specimens (6 × 12 grid), Relics, Logs (readable, 15 px body text) and
  Achievements.
- **Lumen:**
  - a big Rekindle button, 64 px: "REKINDLE · +60 Lumen · ×10.0";
  - a confirmation is a second tap within 3 s on the same button (no modal);
  - the talents list.
- **Settings** (menu): sound, music, ambience, haptics (Off / Light / Normal / Strong), camera
  shake (0–100 %), flashes (Normal / Reduced), number format (Letters / Scientific), quality
  (Battery / Balanced / High + Auto), text size, and left-handed (mirrors the Surge tube and blast
  pips).

### 8.3 Quick-buy buttons (the three most important buttons in the game)

| Slot | Content |
|---|---|
| 1 (left) | Pickaxe, always: tap upgrades are the stars |
| 2 (centre) | BEST, the lowest payback of everything else (§4.3), with a ★ badge |
| 3 (right) | the best crew purchase |

Button states:
- **Affordable:** amber gradient (brand primary), a slow 1.6 s breathing glow, and a shimmer
  sweep every 3 s on BEST.
- **Not affordable:** slate-800, with a 4 px fill bar showing the progress to the price (a
  micro-goal).

Interactions:
- Press: scale 0.94 in 60 ms. Release: 1.06 then 1.0 over 120 ms.
- **Long press = buy repeatedly.** 4 buys/s at first, accelerating to 20/s after 1.5 s, with a
  rising pitch.
- When the purchase changes the slot's item (a new BEST), the label flips in 160 ms.

### 8.4 Brand application ("Lamplight on the Lintel")

- Octagon brass plates (`CUT` tokens) and slate fills: 0.72 alpha for HUD plates over the world,
  0.94 for sheets. Amber means values and buying; cyan means discoveries and builders' script;
  violet means locked or unknown; red is only for a seal timer under 5 s.
- Numbers use the Lintel display face (tabular digits). Specimen icons come from `sprites.ts`.
- All text pairs keep WCAG AA (the existing `TEXT_PAIRS` test). Plates over the world get a 1 px
  carve outline (#04070b) and a 12 px soft dark halo behind numbers.

---

## 9. Juice and feel

### 9.1 Rules

1. **Order of feedback in the impact frame:** crack stage, then cell flash, then pop, then sound,
   then haptic, then chips, then shake. Every one of them starts in the same frame (F1).
2. **Impact first, animation catches up.** The explorer jumps straight to the strike pose on the
   tap (no wind-up), then recovers over 140 ms. The old MiningController's 55 % wind-up delay is
   removed.
3. **Size follows significance; frequency shrinks it** (F6).
4. **Hitstop freezes the world FX** (debris, particles, crew, camera follow) for its duration, and
   never the UI, the input or the audio.
5. **Three flashes a second at most** (WCAG 2.3.1). Full-screen flash intensity ≤ 0.35, except the
   seal and biome reveals at 0.6. Reduced flashes multiplies them by 0.3.

### 9.2 The juice table

| Event | Typical rate | Visual | Pop | Trauma | Hitstop | Flash (PostFX `uFlash`) | FOV punch | Haptic (ms) | Sound |
|---|---|---|---|---|---|---|---|---|---|
| Tap hit (no break) | 4–10/s | terrain flash 60 ms on the cell, crack stage +, 3 chips (Debris), 1 dust puff | white value, 18 px | 0.03 | 0 | — | — | 8 (≥ 50 ms apart) | `hit.<material>`, pitch +8 % × progress |
| Cell break (stone) | 2–5/s | **ghost cell** (instanced lit box with the cell's mean albedo) 1.0 → 1.12 → 0 in 110 ms, so the 1-frame mesh latency is hidden; 10 debris, 5 dust; 1 coin flight | "+3", 15 px brass-300 | 0.06 | 0 | — | — | 14 | `break.<material>` on the pentatonic ladder (§9.7) |
| Ore break | about 1 per 11 cells | + 14 glowing debris in the ore colour, 10 sparkles, 2–4 coin flights + 1 ore icon flight | "+120" 18 px with the ore icon | 0.08 | 0 | — | — | 18 | metal break + ladder chime |
| Gem | about 1 per 140 cells | prismatic burst 18, gem flight to the gem chip | "+1 ◆" 20 px rune-200 | 0.10 | 20 ms | — | — | 10, 30, 18 | crystal ring |
| Crit | 5–50 % of taps | white-gold impact star sprite 160 ms, +6 chips | "CRIT 1.2K" 28 px amber-300 | 0.16 | 35 ms | 0.18 amber, 80 ms | −1 % 80 ms | 22 | crit shing + 55 Hz thump |
| Row clear | every 1.2–3 s early | amber light sweep across the row (180 ms), floor drop: explorer and crew fall 1 m in 0.2 s, land squash, dust ring | — | 0.10 | 0 | — | −1.5 % 120 ms | 20 | row chord + low thunk |
| Leftover crumble | per row | the cracked leftovers shake 0.3 s, then fall with full loot | — | 0.05 | 0 | — | — | 10 | gravel slide |
| Freefall (cavern) | every 15–30 m | the explorer falls with arms out, wind whoosh, landing puff | "+4 m" | 0.15 on land | 30 ms on land | — | +2 % in the fall | 24 on land | whoosh + land |
| Combo tier (10/25/50/100) | every 15–60 s | combo scale 1.6 → 1.0, colour step, ring burst | "×1.25!" | 0.08 | 0 | — | — | 10, 25, 14 | rising chime |
| Combo lost | — | the text drops 20 px and fades in 300 ms | — | 0 | 0 | — | — | — | soft fizz at −18 dB |
| Surge start | about every 56 s | lantern ×1.6 radius, exposure +0.15, screen edges glow amber, rising sparks, the tube bursts | "SURGE ×3" 34 px | 0.30 | 50 ms | 0.30 amber, 200 ms | −3 % 200 ms | 20, 30, 20, 30, 40 | whoosh; the drum layer enters |
| Surge end | — | glow fades over 600 ms | — | 0 | 0 | — | — | — | down-sweep |
| Lantern Bomb | every 20 taps | shock-ring shader expanding 0.35 s over the cells, 30–60 debris, smoke | summed value 32 px | 0.45 | 60 ms | 0.35 white, 120 ms | −4 % 150 ms | 30, 20, 40 | 45 Hz boom + noise burst |
| Chest exposed | every 25 m | wobble, light leaking from the seam, "TAP" ring | — | — | — | — | — | 10 | creak + sparkle |
| Chest open (3rd tap) | every 25 m | lid pops, gold light beam 1.2 s, loot fountain of 8–24 icons flying to the counters, coin rain | "+4.2K", "+3 ◆" | 0.25 | 60 ms | 0.25 gold | −3 % | 14, 40, 24, 40, 40 | 1.1 s brass arpeggio |
| Motherlode | 1 per 400 cells | gold cell bursts, 36 coin flights, gold rain particles for 2 s | "MOTHERLODE +60 s" 34 px | 0.35 | 70 ms | 0.30 gold, 150 ms | −4 % | 30, 40, 30, 40, 60 | jackpot jingle 1.6 s |
| Purchase | per buy | button squash and overshoot, brass ring sweep, the stat flies to its HUD target | "+1 Lv" | 0 | 0 | — | — | 8 | ka-chunk (brass) |
| Milestone level (×2) | Pick L10/25/50 … | "×2" stamp on the button, light burst from the pick; the model swaps at tiers (§9.9) | "×2!" | 0.12 | 0 | 0.10 | — | 14, 30, 22 | short fanfare |
| Depth milestone | every 25 m – 1 km | banner slides from the top ("50 m"), chest drops in | — | 0.10 | 0 | — | — | 16, 40, 24 | horn |
| Seal appears | biome boundary | the floor becomes a carved slab across 7 cells with chains, runes glow, 30 s timer ring, tension layer | — | 0.20 rumble | 0 | — | +3 % pull back | 40 | drone + drums |
| Seal hit | taps | rune cracks; the HP bar chunks | values | 0.05 | 0 | — | — | 8 | low stone gong |
| Seal break | per biome | slow motion 0.25× for 350 ms, the slab shatters into 60 large debris, light floods up from below | "SEAL BROKEN" | 0.70 | 120 ms | 0.60 white → biome colour, 400 ms | −8 %, then the reveal pull-back | 40, 60, 40, 60, 120 | shatter + choir stinger |
| Biome reveal | every 3–7 min (run 1) | pull-back to the vista cavern (2.5 s), title card (biome name 34 px, depth, one line of flavour), palette crossfade 1.5 s | — | 0 | — | — | (pull-back) | 20, 60, 30 | biome stinger 3 s, music crossfade |
| Event appears | every 45–90 s | banner "GLIMMERFALL!" 0.9 s + the entity's entrance | — | 0.05 | 0 | — | — | 12 | event sting |
| Plunge start / land | rows/s > 12 | speed lines and the strata tube; landing dust ring | "+412 m" | 0.40 on land | 80 ms | 0.20 | −6 % | 30, 30, 60 | wind roar, then impact |
| New specimen | per find | card flips in at the top right, 1.2 s | — | — | — | — | — | 12, 40, 20 | discovery bell |
| Achievement | per tier | toast from the top right, 2.4 s | — | — | — | — | — | 10, 30, 10 | chime |
| Offline return | per session | roll-ups (§3.3) | — | — | — | — | — | 20, 40, 20, 40, 40 | coin cascade |

### 9.3 Number pops (`idle/fx/NumberPops.ts`)

| Item | Value |
|---|---|
| Rendering | WebGL overlay pass after the composite. One instanced draw of glyph quads from an SDF atlas built at boot from the Lintel stroke-font polygons (`strokeFont.ts`): 48 glyphs `0-9 . , K M B T a-z + − × ◆ ◉ !` at 64 px with an 8 px spread (CPU brute-force SDF, about 30 ms, in a worker) |
| Capacity | 64 pops alive, 10 glyphs each (640 quads). The oldest is recycled. 0 allocations per spawn |
| Sizes | hit 18 px, gold 15 px, crit 28 px, merged up to 36 px, crew 12 px, big events 32–34 px |
| Motion | pop-in: scale 0 → 1.3 → 1.0 in 120 ms (ease-out-back). Rise 50 px over 700 ms (ease-out-cubic) with ±12 px drift. Fade over the last 220 ms. Life 0.75 s (crit 1.0 s). The motion is in screen space from the projected spawn point, so camera shake never jitters the text |
| Style | 2 px carve outline #04070b and a 6 px soft shadow. Colours from tokens: hit bone-100, gold brass-300, crit amber-300, gem rune-200, crew bone-500, Surge white-gold with a bloom-like halo |
| Merge | more than 6 pops in 100 ms on one column merge into one pop with the summed value, 1.2× size |
| Formatting | `Num.format`: 3 significant digits (1.23K, 12.3K, 123K), letters K M B T aa … zz, or scientific |

### 9.4 Loot flights (`idle/fx/LootFlight.ts`, replaces `game/Drops.ts`)

| Phase | Value |
|---|---|
| A, burst (90 ms) | From the cell's screen point. Speed 120–260 px/s, biased upward, spinning |
| B, homing (380–620 ms, staggered 30 ms per item) | Quadratic Bézier to the counter icon's centre (cached rect, updated on resize). Control point = start + (±60, −140) px. Ease t^1.7. Scale 1.0 → 0.7 |
| Arrival | the counter punches (×1.12, 100 ms), the coin flips (rotateY 180°, 140 ms, at most 8 a second), a 4-sparkle ring, and a tick on the ladder: pitch rises 1 semitone per arrival within a 400 ms streak, up to +12 |
| Capacity | 24 icons alive. Extra value is added to icons already in flight (they grow to 1.3×) |
| Icons | 24 px: coin, gem, and the ore and specimen rasters from `sprites.ts`, packed in one atlas |

### 9.5 Counters

- The gold counter rolls (250 ms ease-out to the new value, continuously while income ticks).
- The rate line ("+3.4K/s") updates at 2 Hz.
- The depth readout rolls per metre, and spins with blur during a Plunge.
- DOM writes happen only on a change of the displayed string. This is the existing Hud pattern
  of cached primitives, which keeps a steady frame free of style and layout work.

### 9.6 Visual escalation by tier (upgrades must look démesuré)

| Pick level | Model (VoxBuilder) | Trail and impact |
|---|---|---|
| 1–24 | Rusty, 0.6 m | dust |
| 25–49 | Copper, 0.7 m | warm sparks |
| 50–74 | Iron, 0.8 m | white sparks |
| 75–99 | Glimmer, 0.9 m, cyan glow | cyan arcs |
| 100–149 | Ember, 1.0 m, emissive head | fire trail |
| 150–199 | Rime, 1.2 m | frost burst |
| 200–299 | Rift, 1.5 m, violet | void ripples |
| 300–499 | Star, 2.0 m, rays | golden rays |
| 500–999 | **Colossal**, 3 m, swung in two hands | screen-wide shock line per tap |
| 1,000+ | **Titan**, 7 m, spans the shaft | every tap ripples the whole row |

- The crew follows §3.1. Each miner type also gets a "×2 milestone" look at count 25 (gold trim)
  and 100 (glowing).
- Lantern Bomb levels grow the shock ring: 3 m, 5 m, 7 m, then full shaft width with a
  column-deep pillar of light.

### 9.7 Sound design (synthesised, `audio/sfx.ts` recipes)

- **The pentatonic ladder.** Consecutive breaks step up a 2-octave major pentatonic scale in the
  biome's key, with offsets 0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24 semitones. It resets after 1.0 s
  with no break. Row clears play a chord on the current step (root + 5th + octave). This
  rising-pitch reward makes fast tapping musical.
- **New recipes:**
  - `tap.<material>`: short, bright, the existing `hit.*` at 0.8× length;
  - `coin.tick`;
  - `row.clear`;
  - `crit`;
  - `combo.tier`, `combo.lost`;
  - `surge.start`, `surge.end`;
  - `bomb`;
  - `chest.creak`, `chest.open`;
  - `motherlode`;
  - `buy`, `buy.milestone`;
  - `seal.appear`, `seal.hit`, `seal.break`;
  - `reveal.<biome>` (a 3 s stinger);
  - `event.sting`;
  - `plunge.wind`, `plunge.land`;
  - `discovery`, `achievement`.
- **Mix.**
  - Voice cap 24. Priorities, high to low: reveal, seal, chest, crit, break, hit, coin, ambience.
  - Breaks are limited to 6 voices per 100 ms.
  - Above 15 breaks/s a continuous rockfall roar bed (filtered noise, level following the rate)
    replaces individual breaks, and the ladder plays every 3rd break.
  - Music ducks −4 dB under stingers.
- **Music.** Per biome there are 3 layers on the existing MusicScheduler: a pad (always), a pluck
  melody (when there was a tap in the last 5 s) and drums (combo ≥ 25 or Surge). Tempo is 96 BPM.
  At biome boundaries the layers crossfade over 4 s.

### 9.8 Haptics (`ui/haptics.ts`, new patterns and rate limiter)

| Pattern | ms | Min gap |
|---|---|---|
| tap | 8 | 50 ms |
| break | 14 | 70 ms |
| ore | 18 | 90 ms |
| crit | 22 | 120 ms |
| row | 20 | 150 ms |
| gem | 10, 30, 18 | 200 ms |
| combo tier | 10, 25, 14 | — |
| purchase | 8 | 60 ms |
| chest | 14, 40, 24, 40, 40 | — |
| milestone | 16, 40, 24 | — |
| surge | 20, 30, 20, 30, 40 | — |
| bomb | 30, 20, 40 | — |
| seal break | 40, 60, 40, 60, 120 | — |
| biome | 20, 60, 30 | — |
| plunge land | 30, 30, 60 | — |
| motherlode | 30, 40, 30, 40, 60 | — |

- **Strength setting:** Light ×0.7, Normal ×1.0 (default), Strong ×1.4. Pulses under 6 ms are
  dropped, since many LRA motors cannot render them.
- **Global limits:** at most 20 `vibrate` calls per second and at most 40 % duty over any 1 s
  window. Priority, high to low: biome, seal, chest, crit, row, break, tap.
- **Gating** keeps the current rules (setting on, last input touch, playing), plus off while the
  page is hidden. The Android shell already declares `VIBRATE`.

### 9.9 Aggregation at démesure (when hundreds of cells break per second)

| System | Rule |
|---|---|
| Pops | merge per column per 100 ms (§9.3) |
| Coin flights | cap 24 alive, values add up |
| Debris | burst count × min(1, 40 / breaks per second) |
| Particles | budget from the preset: 120 / 220 / 400 |
| Sound | the roar bed (§9.7) |
| Haptics | limiter (§9.8) |
| Trauma | capped at 0.5, except seal break and plunge landing (0.7) |
| Over 12 rows/s | Plunge mode (§5.6) |

### 9.10 Comfort and accessibility

- **Reduced motion** (`prefers-reduced-motion` or the setting): shake 0, hitstop 0, FOV punch 0,
  flashes ×0.3, the reveal pull-back becomes a crossfade, pops do not scale in.
- **Left-handed:** the Surge tube and blast pips swap sides. The dock order stays the same, since
  it is centred.
- **Large text:** HUD text ×1.15. The dock grows by 12 px and the world region shrinks.
- **High contrast:** HUD plate alpha 0.9, outlines 2 px.

---

## 10. Technical plan (reusing the engine)

### 10.1 Keep (unchanged or with small changes)

| Module | Change |
|---|---|
| `core/*` (events, math, noise, rng) | add the idle events to `GameEvents` |
| `config/blocks.ts`, `tiles.ts` | add new block ids from 41: tin, mycel, basalt, magma, obsidian, ice, frost slate, void stone, fossil, bone, star glass, gold rock, gem cell, motherlode, seal stone (unbreakable except by seal rules), and emitters GREEN, ICE, STAR |
| `render/mesher.ts`, `meshWorker.ts`, `meshPool.ts` | a `yBase` parameter so the noise uses absolute y |
| `render/ChunkRenderer.ts` | `shiftY(layers)`: re-key the chunk entries, dispose the top layers, queue the new bottom ones |
| `world/light.ts` (LightField, LanternField) | used on the window. Add `shift(rows)` (memmove of the data) and a worker recompute entry |
| `render/lighting.ts` | 12 biome presets; `uYBase`; fog starts at the glass plane |
| `render/terrainMaterial.ts` + `materials/*` | about 12 new painters (★ in §5.4). Layer count 29 → 41, about 0.8 MB more. **Multi-cell damage:** `uCells[8]` (vec4 cell + damage) and `uCellFlash[8]` replace the single `uTarget`, so 8 cells crack and flash at once; cost is 8 compares per fragment. **Section mode:** faces with normal −z at z = 1 get higher strata contrast and crisp mineral inclusions, plus a 1 px bevel highlight on the cut edge. **Ore glint:** hash twinkle on ore texels (period 2–4 s, HDR 3.0, ≤ 6 visible a second) |
| `render/PostFX.ts` | an FXAA pass folded into the composite on Balanced and High (about 0.3 ms at 1 MP); per-biome grade parameters (lift, gain, split colours) blended at boundaries; heat shimmer (B6) as a 2-tap UV offset under a mask; `uFlash` already exists |
| `render/Renderer.ts` | portrait presets. **Balanced:** maxDpr 2.0 × 0.9 (1.07 MP at 390×844), FXAA on. **High:** 2.5 × 1.0, MSAA 4×. **Battery:** 1.5 × 0.8, 30 fps. An overlay scene pass after the composite (pops, flights) |
| `render/QualityGovernor.ts` | add dynamic resolution steps 1.0 / 0.9 / 0.8 / 0.7 with hysteresis (down after an 8 s median over 18 ms, up after 30 s under 12 ms) on top of the preset steps |
| `render/props/*`, `render/structures/*` | diorama kits; new prop kinds (§5.5) |
| `game/effects/{Debris, Particles, Halos, Waterfall, LumenMoths}` | reused. `TargetMarker` → `CellMarker` (8 cells) |
| `entities/character/*` | the explorer on the floor: a strike-pose snap, a fall and a land |
| `audio/*` | new recipes (§9.7), the ladder, the roar bed, per-biome music |
| `ui/brand/*`, `ui/dom.ts`, `ui/icons.ts`, `ui/sprites.ts` | reused; the SDF atlas builder reads `strokeFont.ts` |
| `ui/haptics.ts` | new patterns, strength setting and limiter (§9.8) |
| `save/SaveSystem.ts` (two-slot, checksums) | `SaveData` v3 (§10.5) with a v2 → v3 migration |
| `game/FrameGuard.ts`, `main.ts` release shell, Android shell | reused |
| `i18n` | new section `src/i18n/en/idle.ts` (all text in §7 and §9) |

### 10.2 Add

| File | Responsibility | Pure (Node-tested)? |
|---|---|---|
| `src/idle/num.ts` | `Num` {m in [1,10), e: int}: add, mul, pow, compare, log10, format, toJSON | yes |
| `src/idle/economy.ts` | HP anchors, gold, biome values, materials, seals, Lumen gain | yes |
| `src/idle/upgrades.ts` | upgrade table (§4.2), costs, buy ×1/×10/MAX, BEST payback | yes |
| `src/idle/crew.ts` | miner table, DPS, milestones, targeting | yes |
| `src/idle/shaft.ts` | the shaft model: rows of 7 cells (type, HP, damage), floor row, row clear, crumble rule, pierce | yes |
| `src/idle/tap.ts` | `resolveTap(state, column)` → hits[] (§2.2); combo; Surge; bomb charge | yes |
| `src/idle/offline.ts` | settlement (§3.2) | yes |
| `src/idle/prestige.ts` | Rekindle, talents, Starfall hook | yes |
| `src/idle/director.ts` | the event cadence director and event state machines (§6.4) | yes |
| `src/idle/goals.ts` | the scripted ladder plus generator (§7.4); the next-goal bar | yes |
| `src/idle/tutorial.ts` | the first-3-minutes script as a step machine (§7.2) | yes |
| `src/idle/daily.ts` | daily chest, streak, quests, Deep Event | yes |
| `src/idle/collection.ts`, `relics.ts`, `achievements.ts` | §6 | yes |
| `src/idle/biomes.ts` | the ladder table (§5.4) as data | yes |
| `src/idle/world/strata.ts` + `strataWorker.ts` | row generation (§5.2), 32 rows ahead in a worker | yes |
| `src/idle/world/ShaftWorld.ts` | the window, rebase, edits → VoxelWorld/LightField/ChunkRenderer | no |
| `src/idle/ShaftCamera.ts` | §5.3; exposes `rayThrough`, `columnAt(px)`, `project` | partly (`columnAt` is pure) |
| `src/idle/input/TapInput.ts` | pointer queue, hold, swipe, multi-touch | partly |
| `src/idle/fx/NumberPops.ts`, `LootFlight.ts`, `GhostCells.ts`, `SpeedLines.ts` (plunge), `Shockwave.ts`, `Backdrop.ts` (3 parallax silhouette layers behind the vista caverns), `SkyDome.ts` (surface) | §9 | no |
| `src/idle/feel/juice.ts` | **every number in §9.2, §9.8 and §9.9 as one config table** | yes |
| `src/idle/feel/hitstop.ts`, `shake.ts` | world-FX time scale; the trauma model | yes |
| `src/idle/IdleGame.ts` | modes (boot, intro, playing, away, reveal, plunge, rekindle), the frame loop (frame cap, idle fps steps), wiring | no |
| `src/ui/idle/TopBar.ts`, `GoalBar.ts`, `Dock.ts`, `QuickBuy.ts`, `Sheets/*.ts`, `AwayCard.ts`, `RevealCard.ts`, `TutorialLayer.ts` (hand, prompts, rings) | §8 | no |
| `src/idle/sim/pacing.ts` | the headless sim (a port of feel-sim2.mjs on the real tables) for CI | yes |
| `src/debug/idle.ts` | `__DD__.idle`: `state()`, `tap(col)`, `setDepth(m)`, `give(gold)`, `forceEvent(id)`, `fx()` (counts of pops, flights, debris), `lastTapLatency()`, `sim(min, taps)` | — |

### 10.3 Replace

| Old | New |
|---|---|
| `game/Game.ts` | `idle/IdleGame.ts` (keeps FrameGuard, the frame cap and the lifecycle hooks) |
| `game/CameraRig.ts` | `idle/ShaftCamera.ts` (keeps the trauma math) |
| `ui/TouchControls.ts` + `ui/touchMath.ts` | `idle/input/TapInput.ts` |
| `ui/hud/Hud.ts` | `ui/idle/TopBar.ts` + `GoalBar.ts` + `Dock.ts` |
| `game/MiningController.ts` + `gameplay/Mining.ts` | `idle/tap.ts` + `idle/shaft.ts` + `CellMarker` |
| `game/Drops.ts` | `idle/fx/LootFlight.ts` |
| `world/gen/generateWorld.ts`, `features/*`, `zoneWorker.ts`, `zoneLoader.ts` | `idle/world/strata.ts` + `strataWorker.ts` (keep `architecture.ts` builders for B4/B9) |
| `gameplay/Objectives.ts`, `NextStep.ts`, `game/Guidance.ts` | `idle/goals.ts` + `idle/tutorial.ts` |
| `gameplay/Journal.ts`, `discoveries.ts` | `idle/collection.ts` |

### 10.4 Delete (after the idle build passes its tests)

- `game/PlayerController.ts`, `TapController.ts`, `aimAssist.ts`, `touchCamera.ts`, `ropeRide.ts`,
  `runeDoor.ts`, `WorldFeatures.ts` (moth anchors move into strata), `Stations.ts`, `Survey.ts`,
  `Runes.ts` (the rune config stays), `Progression.ts`, `MenuCamera.ts` (the menu is the surface
  scene).
- `world/analysis/{homeField, reachability, economy}.ts`.
- `gameplay/{Cold, Health, Lantern, Inventory, Storage, Crafting, Equipment, Expedition, CacheSpot,
  Tree, Records, counts}.ts`.
- `ui/screens/{inventory, workbench, board, summary}.*` (ending stays as the finale card).
- `config/recipes.ts`.
- Their unit and e2e tests.

### 10.5 Save v3 (JSON, two-slot, unchanged pipeline)

```
idle: { seed, depth, yBase, rows: [{types: 7×u8, dmg: 7×f32}] × 4 (floor + 3),
        gold: Num, gems, lumen, lumenSpent, stars, talents: {id: lvl}, upgrades: {id: lvl},
        crew: {id: n}, combo: 0, surge, bombCharge, goal: {index, progress}, tutorial: step,
        daily: {lastClaim, streak, quests[3], eventWeek}, collection: {specimens: bitset72,
        relics: {id: lvl}, logs: bitset36, runes: bitset8}, achievements: {family: tier},
        stats: {taps, cells, crits, chests, seals, maxDepth, rekindles, playSeconds},
        lastSeen: epoch ms, monotonic: performance-time guard }
```

Autosave every 30 s, 2 s after a purchase burst, on a seal, a Rekindle or a reveal, and on
`visibilitychange` / `pagehide` (the existing hooks).

### 10.6 Frame flow

1. `TapInput.drain()` → `resolveTap` for each tap. This mutates `shaft` and emits `cell:hit`,
   `cell:break`, `crit`, `combo:*`, `surge:*` and `bomb`.
2. `crew.step(dt)`, then `director.step(dt)`, then `goals.step()` and `tutorial.step()`.
3. `shaft` row clears → `camera.target`. Rebase if needed.
4. `ShaftWorld.flush()`: voxel edits → light (incremental or batched) → dirty chunks → mesh
   workers.
5. FX listeners on the bus: pops, flights, ghost cells, debris, particles, shake, hitstop, flash,
   audio, haptics. Hitstop scales `dt` for the world FX only.
6. Render the scene → PostFX → the overlay pass (pops, flights).
7. UI diff writes (only changed strings).

### 10.7 Budgets (target: Adreno 642L / Mali-G68, 60 fps, Balanced)

| Budget | Value |
|---|---|
| JS main thread per frame | ≤ 5 ms typical, ≤ 8 ms p95 during 10 taps/s + Surge |
| GPU | ≤ 12 ms at 1.07 MP |
| Draw calls | ≤ 90: 16 chunks, ≤ 8 structure cells, about 20 props (instanced), about 12 explorer parts, crew instanced ×9, 2 debris, 2 particles, 1 ghost, 1 backdrop, 1 pops, 1 flights, 6 post |
| Triangles | ≤ 150k |
| Allocations | 0 per tap in steady state (pools: pops 64, flights 32, ghosts 32, debris 400, particles 320, tap ring 32) |
| Cell break | ≤ 0.3 ms light + ≤ 1 ms main-thread mesh bookkeeping |
| Rebase | ≤ 3 ms main thread, once per 32 rows |
| Blast (49 cells) | ≤ 2 ms main (light batched to the worker) |
| Memory | voxels 64 KB, light 256 KB, materials about 3.4 MB, JS heap ≤ 120 MB |
| Boot to first tap | ≤ 2.5 s on the target phone (no zone generation: 32 rows generate in about 1 ms) |

### 10.8 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tap latency in the WebView (event coalescing, a compositor frame) | handle `pointerdown`, `touch-action: none`, no DOM work in the handler, drain at the step start; measure on the device protocol with a 240 fps camera (target ≤ 50 ms touch-to-photon) |
| Weak or late haptics on some phones | strength setting; drop pulses under 6 ms; never rely on haptics alone |
| 1-frame mesh latency on a break | ghost cells (§9.2) |
| Light seams and pops at rebase | shift the light data with the blocks and recompute in the worker; absolute `yBase` everywhere |
| Economy runaway or walls (the sim showed both while tuning: a crit-multiplied Crew Bond and early cheap blasts ran away) | Crew Bond is not crit-multiplied; the bomb unlocks at 1,000 m; CI pacing tests (§11) on the real tables |
| Number overflow | `Num` for gold, HP and costs from day one; saves store strings |
| Audio voice explosion | voice cap, per-100 ms limits, roar bed |
| Battery and thermal | idle fps steps (§3.4), dynamic resolution, governor |
| Pop readability over busy scenes | carve outline + shadow, contrast check in captures |
| Clock tampering | monotonic guard; no reward is ever taken away |
| Scope (12 biomes, 72 specimens) | biome kits are data on shared painters and props; waves ship B1–B6 first |

### 10.9 Build order (task #42: 3 waves)

1. **Wave 1, the core feel:**
   - `num`, `economy`, `upgrades`, `crew`, `shaft`, `tap`;
   - ShaftWorld (window and rebase), ShaftCamera, TapInput;
   - strata B1–B3 with the authored rows 0–30;
   - pops, flights, ghosts, CellMarker, juice table, haptics, the core sfx;
   - TopBar, GoalBar, Dock, QuickBuy, Upgrades sheet;
   - the tutorial (§7.2), save v3, the pacing sim in CI.

   Exit when F1–F4 pass and the first 3 minutes play as scripted.
2. **Wave 2, the loops:**
   - offline and away card, crew visuals;
   - combo, Surge, Lantern Bomb, seals and reveals B1–B6;
   - director events, goals generator, collection, daily;
   - music layers, B4–B6 painters, Plunge.
3. **Wave 3, the démesure and HD:**
   - B7–B12 and Deep Beyond;
   - Rekindle, talents, relics, achievements, Starfall hook;
   - section shading, ore glint, backdrop, FXAA, dynamic resolution, biome grades;
   - device perf tuning, APK.

---

## 11. Acceptance metrics (checkable by a test or simulation)

### 11.1 Pacing (Vitest, `src/idle/sim/pacing.ts` on the real tables; a BEST buyer, one purchase per 0.8 s)

| Id | Check | Pass |
|---|---|---|
| P1 | First purchase (4 taps/s) | 5–12 s |
| P2 | 100 m at 4 taps/s | 3:00–4:30 |
| P3 | 1,000 m at 4 taps/s | 14:00–22:00 |
| P4 | 100 m at 3 taps/s, and at 6 taps/s | ≤ 5:30, and ≥ 2:00 |
| P5 | Longest stretch without an affordable purchase or a chest, first 30 min, at 3 and 4 taps/s | ≤ 30 s |
| P6 | Taps per cell for the bot (4 taps/s), sampled every 25 m | ≤ 6 at every sample before 24 min; ≤ 12 up to 35 min |
| P7 | Idle after 5 active minutes: 250 m reached | ≤ 20 min |
| P8 | Run 2 with run 1's Lumen reaches run 1's 35-min depth | ≤ 40 % of 35 min |
| P9 | Rekindle chain of 5 runs: depth strictly increases | every run deeper than the last |
| P10 | Offline: 1,000 settlements with random (depth, DPS, hours) | 0 cross a seal; gold is finite and ≥ 0; capped at the talent cap |
| P11 | Biome durations in run 1 (4 taps/s), B1–B6 | each 2–8 min |

### 11.2 Feel (Playwright e2e, touch through CDP, 390×844, 360×740, 412×915)

| Id | Check | Pass |
|---|---|---|
| T1 | `pointerdown` → `cell:hit` emitted in the same `step()` as the drain (frame index from `__DD__.idle.lastTapLatency()`) | 200 of 200 taps within 1 frame |
| T2 | The pop, crack-stage uniform and sound request exist in the frame of the hit | 100 % |
| T3 | Column mapping: 20 random points per column across the whole world region | 100 % correct, at all 3 sizes |
| T4 | Taps in the wall margins | map to column 0 or 6 |
| T5 | The very first tap of a new game | breaks a cell and starts a coin flight |
| T6 | Tutorial bot (taps the centre at 4/s, and any `[data-tutorial-target]` when shown) | 25 m, Pick L2, 1 Apprentice and the 10 m chest opened within 90 s of the first tap |
| T7 | Random tapper (3 taps/s at random world points, never reads) | 10 m within 60 s |
| T8 | Hold for 2 s on one column | 9–11 hits (5/s); swipe across 7 columns in 0.5 s → 7 hits |
| T9 | Sheet open | taps above the sheet still produce `cell:hit` |
| T10 | 10 s burst at 15 taps/s plus a Surge | pops ≤ 64, flights ≤ 24, debris ≤ budget, particles ≤ budget, 0 console errors |
| T11 | Haptics limiter over that burst (vibrate stub) | ≤ 20 calls/s, duty ≤ 40 % |
| T12 | Reduced motion | trauma, hitstop and FOV punch all 0; flash ≤ 0.3 × normal |

### 11.3 UI (ui-check)

| Id | Check | Pass |
|---|---|---|
| U1 | Target size, 3 viewports, every interactive element | ≥ 48 px |
| U2 | Text size | ≥ 12 px |
| U3 | Text contrast | AA (`TEXT_PAIRS` extended with the HUD plates over the world) |
| U4 | The floor row's screen y | between the next-goal bar bottom + 120 px and the dock top − 150 px, at all sizes and with a sheet open |
| U5 | Overlap: top bar, goal bar, dock, sheets, cards | no overlap; nothing outside the safe insets |
| U6 | Steady frame DOM writes (no state change) | 0 |

### 11.4 World and visuals (generator test + captures)

| Id | Check | Pass |
|---|---|---|
| W1 | Density contract (§5.5) over 2,000 generated rows per biome | 100 % of 20 m windows meet every minimum |
| W2 | Determinism | the same (seed, row) gives identical rows; a rebase gives byte-identical meshes to a fresh window (reuse `meshCheck`) |
| W3 | Captures of each biome's dig view and reveal at 390×844 | mean luminance of the floor row ≥ 0.12 (display-linear); ore cells' contrast vs host rock ≥ 1.6:1; during a crit < 5 % of pixels clipped |
| W4 | Light budget per window | ≤ 160 emitter voxels |

### 11.5 Performance (`tools/perf.mjs`, portrait, production build)

| Id | Check | Pass |
|---|---|---|
| R1 | Draw calls and triangles, each biome capture | ≤ 90 and ≤ 150k |
| R2 | JS frame time p95 during 10 taps/s (SwiftShader, relative to the old game's camp baseline) | ≤ 1.0× the baseline |
| R3 | Allocations per tap (instrumented pool counters) | 0 new objects after warm-up |
| R4 | Rebase main-thread time | ≤ 3 ms (Node + browser) |
| R5 | Boot to first tap on the production build | ≤ 2.5 s in headless Chromium |
| R6 | Device protocol (`docs/device-test-protocol.md`, extended) | 60 fps median on Balanced on the 2022 mid-range class; touch-to-photon ≤ 50 ms |

---

## Appendix: simulation files

All files are in `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/idle/`:

| File | Contents |
|---|---|
| `feel-sim2.mjs` | the pacing model. `node feel-sim2.mjs fixed <taps/s> <minutes> <lumen>`; `ACTIVE=<min>` makes the bot stop tapping after that many minutes. `calibrate` mode prints the HP that would hold the target speed |
| `probe.mjs` → `probe-run.mjs` | state at each depth mark (taps per cell, taps per row, crew DPS) |
| `final-t3.log`, `final-t4.log`, `final-t6.log`, `final-idle.log` | the runs quoted above |
| `offline.mjs` | offline settlement examples |
| `camera.py` | the portrait camera projection numbers |

`feel-sim.mjs` is the first, superseded model, kept for comparison.
