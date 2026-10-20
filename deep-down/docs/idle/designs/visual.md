# DEEP DOWN — Idle Descent: the technical-art design (KEY: visual)

Angle: technical art direction. That covers the camera in portrait, the cut-face material and lighting,
the parallax caverns, glow, bloom and grade per biome, particles, block-break shaders, UI motion and the
60 fps budget. The design covers the whole game. §5, §8, §9 and §10 go deepest.

Read with `TECHNICAL_ARCHITECTURE.md` (the engine map) and `ART_DIRECTION.md` (the brand this design
extends). The economy numbers come from a pacing sim:
`/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/idle/final.mjs`
and `sim2.mjs` in the same folder. It is a row-level model with a greedy buyer, and §11 restates its numbers as
checks. The economy specialist owns the final tuning. This document fixes the structure and the
pacing the visuals are built for.

---

## 0. Thesis, diagnosis, pillars

**One sentence.** You tap apart a living geological cross-section. The cut is drawn as a clean, crisply lit
section. The depth behind it holds the wonder. The deeper you go, the brighter, richer and more absurd it gets.

### 0.1 What the director felt, and its cause in today's renderer

| Director's complaint | Cause in the current build (code or capture) | Fix in this design |
|---|---|---|
| "Nothing is indicated" | Only a small objective chip during play. Captures are either dark or flat. Measured on six `artifacts/final-pass` captures: mean sRGB luminance 0.105–0.355, luminance std only 0.093–0.140. The tunnel is 0.105 with 21.6 % of pixels under 0.03. Copper mining is grey haze: 0.334 mean, saturation 0.25 | An objective chip that is always on screen, a depth ruler aligned to the dig face, an exposure ladder from 2.1 to 2.8, clear air for 15 m around the dig face, a contrast target of luminance std ≥ 0.16 (§11 V-1) |
| "Mining is horrible" | Hold to mine (230 ms), damage on the swing's strike frame, aim from a third-person ray, a camera kick of about 0 | A tap lands damage on pointerdown on a 50 px cell. Pop, cracks, number and chips appear in the same frame (§2, §9) |
| "Controls are unpleasant" | Joystick, drag to look, hold | Taps only; no camera control at all |
| "The caverns are horribly empty" | One authored zone, a budget of 120 cyan emitters, the "Restraint" pillar (few particles) | A fill budget per cavern: 1 hero, 8–16 medium props, 30–80 small props, creatures, 3–8 treasures, a liquid and light cones (§5.6) |
| "Nothing satisfying or addictive" | 220 CPU particles on Balanced, bloom threshold 1.2 at strength 0.4, loot that walks to a backpack | 2048–4096 GPU particles, bloom pulses, hit-stop, chain breaks, loot that flies to the counters (§9) |
| "Not beautiful, not HD" | 16 texels/m becomes a 5 px texel at this framing; the near-lens grain only starts above 5 px per texel; flat grey fog | 32 texels/m HD section layers, an emboss tap, CAS sharpening, a LUT grade per biome, clear near air (§5.4, §10) |

### 0.2 Visual pillars

These replace ART_DIRECTION pillars 1 and 5 for the idle game. Pillars 2–4 stay as vocabulary.

1. **The deeper, the brighter.** Exposure, saturation, bloom and the number of emitters per screen rise
   with each biome (§5.4). The descent starts with lamplit earth at 0 m and ends at an underground sun at 2,200 m.
2. **The section is the stage.** The cut plane at z = 0 is flat and lit like an illustration. It shows the
   strata, ores, fossils and treasure silhouettes. Behind it is deep 3D space with real parallax.
3. **Every action pays out on screen in the same frame,** through at least 3 channels: motion, particles,
   and number, sound or haptic.
4. **Démesure is visible.** Tools, crew, props and numbers grow on screen as you progress. By tool tier 8
   the tool is a fist bigger than the screen.
5. **One focus.** The dig face is always the brightest band on screen, with the most contrast. The UI frames it
   from above and below.

Colour registers stay from the brand: amber means people, kit and your own actions; cyan means minerals and the
builders' script; violet means the unknown, relics and prestige; red means danger only. Each biome adds
exactly one accent hue (§5.4).

---

## 1. Core loop at three scales

### 1.1 Ten seconds: the tap loop

1. Tap a cell. Early on a cell takes 3 taps; from about the first minute one tap breaks one or more cells.
2. The cell pops, cracks, shows a number and throws chips.
3. On a break: a burst, and 1–6 loot tokens fly to the gold counter. The counter bumps.
4. An upgrade card lights up when you can afford it. One tap buys it.
5. The next tap is visibly stronger: a bigger number, a bigger spray, and later a new tool model.
6. Early on a row clears every 5–8 s. The floor drops 1 m, the camera lands with a thunk, and "+1 m" shows.

### 1.2 Three minutes: the descent loop

| Every | What happens on screen |
|---|---|
| 5–8 s | A row clears and the floor drops (early game) |
| 15–40 s | An upgrade milestone (×2 at levels 10/25/50/100/150/200/300…) or a new unlock in the first 60 m |
| 25–40 m (30–120 s) | A cavern crosses the shaft. You spend 30–90 s inside it, with treasures, creatures and its light |
| 60–150 s | An event: chest, crawler, swarm, gold rush, cave-in, rune echo (§6.3) |
| Each biome gate (40, 100, 180, 280 m…) | A gate row, then a reveal ceremony. It brings a new LUT, a new cell mechanic, a new creature and a new specimen drawer |
| 75 Pick levels | A tool tier jump: a new model and a new strike effect (§5.9) |

Sim (greedy buyer, 3 taps/s): 40 m at 0:50, 100 m at 2:00, 180 m at 3:20, 280 m at 6:20.
At a casual 2 taps/s: 40 m at 1:10, 100 m at 2:50, 180 m at 4:30. A first-time player is about
0.6× the sim (reading, exploring), so biome 2 comes around 1:20–2:00.

### 1.3 Three days: the delve loop (sim: 4 sessions of 8 min a day at 3 taps/s, offline gaps of 3 h / 4 h / 9 h)

| Day | Depth record across the day | Prestiges ("Delve Anew") | Pick level at the end of the last session | What the player sees for the first time |
|---|---|---|---|---|
| 1 | 295 → 473 → 617 → 763 m | 4 (heartstones 104 → 2.9 M) | 363 | Biomes 1–8 (to Titan's Ribs); tool tiers 1–5 (Steam Hammer); the surface camp grows from tents to a headframe to a stone lift tower |
| 2 | 907 → 1,046 → 1,174 → 1,303 m | 4 | 639 | Biomes 9–10 (Crystal Cathedral, Abyssal Sea); tiers 6–9 (Gravity Well); the brass lantern tower |
| 3 | 1,421 → 1,490 → 1,585 → 1,636 m | 4 | 819 | The depths of the Abyssal Sea, with the leviathan crossing the vista; tiers 10–11 (Star Driver, then the first "Absurd" echo tier); the Lighthouse beam down the shaft |

### 1.4 What keeps it endless

- **Authored biomes** run to 2,800 m, where the Lantern Heart gate closes the main mystery.
- **Fathomless cycles** follow, one every 600 m. Each remixes biome `2 + (k mod 11)` with its hue +60° per cycle in the LUT,
  emission ×1.25 per cycle, prop scale ×1.15 per cycle (capped at 3×) and creature counts ×1.2. Its name gets
  a cycle suffix ("Copper Galleries — Second Fathom").
- **Tool tiers** come every 75 Pick levels, without end. Past tier 10 the scale grows ×1.6 per tier, visually capped at a
  40 m tool. Beyond that only the tool's shadow sweeps the shaft before the impact.
- **Numbers** have no ceiling. They use letter notation up to 1e2031, then scientific notation (§8.5).
- **Prestige compounds.** Heartstones ∝ (lifetime gold)^0.3, so each run reaches 50–165 m deeper than the last
  (sim, the first 12 prestiges). Every run has the same rhythm: a rush, then a slog, then the prestige ceremony (§2.4).

---

## 2. The tap

### 2.1 Input rules (`ui/idle/TapSurface.ts`)

- **Where a tap counts.** A tap anywhere in the world window (y 163–642 px at 390×844) hits a target. The order is:
  1. a treasure or creature under the finger (screen hit radius of at least 28 px);
  2. the exposed cell under the finger;
  3. the nearest exposed cell within 75 px (1.5 cells);
  4. the exposed cell in the tapped column.

  **A tap never misses.**
- **Timing.** Damage lands on `pointerdown`, not on release. The target is 1 rendered frame from touch to visible feedback.
- **Multi-touch.** Up to 4 simultaneous pointers each count as a tap. Two-finger drumming is the frenzy technique.
- **Hold.** Holding a finger down 400 ms auto-taps at 4 taps/s, with frenzy capped at level 1. This is for comfort and
  accessibility, and the economy does not need it.
- **No other input.** There is no drag, no camera control and no joystick (`TouchControls.ts` and `touchMath.ts`
  joystick code are deleted).

### 2.2 What one tap does

```
dmg  = (1 + L_pick) · 2^milestones(L_pick) · 25^floor(L_pick / 75) · M · frenzy · crit
M    = (1 + 0.1 H) · 1.5^(biomes reached) · Π relics
frenzy: combo c counts taps with gaps < 0.45 s. Level 1 at c ≥ 15 (×1.25), level 2 at c ≥ 40 (×1.5),
        level 3 at c ≥ 90 (×2). One level drops after 0.8 s without a tap.
crit:   chance min(50 %, 5 % + 1 % · L_crit), multiplier 3 + 0.1 · L_crit
blast:  every max(4, 12 − floor(L_blast / 10)) taps, (2 + 0.25 · L_blast) · dmg on 3 / 5 / 7 cells
        (L_blast < 25 / < 75 / ≥ 75). Shapes: a 1×3 row, a plus, then 7 cells as a row plus the 3 below.
```

**Overkill pierces.** Damage left over after a cell breaks flows to the next unbroken cell in the row (nearest first,
alternating left and right). From there it flows into the newly exposed row below, for up to 3 rows per tap. This
matches the sim's row-pool model, and it turns strength into visible multi-cell chain breaks (§9, "chain").

### 2.3 How the tap scales, as the player sees it

| Phase | Typical tap | What it looks like |
|---|---|---|
| 0–40 s | 3 taps per cell | Crack stages 3 → 6 → break; 6 chips and 8 dust per hit |
| 40 s – 10 min | 1 tap ≈ 1 cell, piercing 1–3 cells | A white-hot crack line runs cell to cell at 40 ms per cell; 2–3 tokens per tap |
| First 1–3 min after a prestige | 1 tap = 1–3 rows | Row-clear bursts back to back. Above 5 m/s sustained for 1.5 s, the screen switches to the Plunge renderer (§5.2) |
| At the wall, at the end of each run | 2–6 taps per cell | Crack stages are back. Blasts and crits matter. The prestige prompt appears |

Visual tool tiers multiply what is drawn per strike, not only the numbers (§5.9).

### 2.4 One run's rhythm, for the visuals

A run has a **rush**, then a **climb**, then a **wall**:

1. **Rush.** A Plunge with bursts through the depths you already know.
2. **Climb.** Every tap breaks something.
3. **Wall.** Cells take several taps again, and the Delve Anew button glows violet in the top bar.

The art needs all three to stay readable: the Plunge, the chain breaks and the crack stages.

---

## 3. Idle and offline

- **Crew.** Each miner is a figure that works one cell of the dig row at 1.5 dps (base). The figure is visible. Up to 24
  figures are drawn; past 24, each figure carries a "×N" squad plate. The **Drill** is a visible rig on the
  shaft's left wall that grinds the whole row (40 dps per level, on all 7 cells).
- **Online idle.** Crew and drill damage keeps running. Loot collects itself. Tokens still fly to the counter, but bundled,
  at most 6 flights a second.
- **The lift cage.** It carries the economy on screen. A cage on the right-hand wall runs between the dig face and the top of
  the screen on a 6 s loop with ore sacks. Its speed is 1 + 0.25·log10(idle dps) loops per 6 s, capped at 3×.
- **Offline.** On return, the time away is simulated:
  - the cap is 8 h, plus 2 h per Lift perk, up to 24 h;
  - efficiency is 50 %, plus 10 % per perk, up to 100 %;
  - it uses the same row model as the sim, solved in closed form per row, in less than 5 ms for 10,000 rows;
  - it pays gold and metres.
- **The return sequence** (2.5–4 s; one tap skips it):
  1. A plate: "While you were away · 6 h 12 min", in the Lintel display face at 22 px.
  2. A Plunge time-lapse of the metres gained (1.2–3.0 s), with the biome bands rushing past and the depth counter spinning.
  3. Landing at the new face. The gold counter rolls like an odometer from the old value to the new one over 1.2 s, while 30
     loot bundles fly in.
  4. The best affordable card pulses (the shine sweep at 1.5×), with the hint "Spend your haul".
- In the sim the first offline gap (3 h) paid 15 m. At the wall, the offline gold matters more than the metres:
  it pays for the return spree, which is what makes the return feel good.

---

## 4. Economy

### 4.1 Cells

| Quantity | Formula (d = depth in m = row index) | At 0 m | 100 m | 300 m | 1,000 m |
|---|---|---|---|---|---|
| Cell HP | 3 · 1.056^d | 3 | 697 | 3.8e7 | 1.4e24 |
| Gold per cell (average over the mix) | 0.6 · 1.051^d · 1.6 | 0.96 | 139 | 2.9e6 | 3.9e21 |

Cell mix in every biome: base rock 74 % (×1 gold), hard rock 10 % (×3 HP, ×2 gold), ore A 9 % (×3), ore B 4 % (×6),
gem 1.5 % (×20), treasure 0.5 % (×50 plus a relic chance), the biome's special 1 % (§5.5). Ores are veins of 2–6 cells
(thresholded 3D noise), so one vein gives a chain of rich breaks.

### 4.2 Upgrades (the dock)

| Upgrade | Unlocks at | Base cost | Growth | Effect per level | Milestones and tiers |
|---|---|---|---|---|---|
| **Pick** (tap) | 0 m | 4 | ×1.16 | tap dmg = 1 + L | ×2 at L 10, 25, 50, 100, 150, 200, 300, 400… (every 100 after 200); **tool tier ×25 every 75 L** (new model) |
| **Crew** (auto) | 4 m | 15 | ×1.15 | +1 miner, 1.5 dps | ×2 at the same levels; **crew tier ×10 every 75 L** (new look) |
| **Blast** | 30 m | 900 | ×1.20 | Blast frequency and strength (§2.2) | Radius steps at L 25 and 75 |
| **Lamps** (gold) | 15 m | 300 | ×1.24 | gold × (1 + 0.25 L) | Each level hangs one more lamp in the shaft: brighter, more halos |
| **Crit** | 45 m | 2,000 | ×1.22 | chance 5 % + 1 %/L (cap 50 %), ×(3 + 0.1 L) | Crit numbers grow +10 % in size every 25 L |
| **Drill** (row) | 60 m | 5,000 | ×1.19 | +40 dps on each of the 7 cells | The rig's look changes at L 25, 75 and 150 |

Buy modes are ×1, ×10 and Max (a segmented chip on the dock).

### 4.3 Multipliers, prestige, perks

- **Biome mastery.** ×1.5 permanent for each biome first reached. It survives prestige, and the gate ceremony shows it.
- **Heartstones (prestige "Delve Anew").** H = floor((lifetime gold / 1e4)^0.3), giving all damage and gold
  ×(1 + 0.1 H). The option appears at 150 m. The button glows when H_new ≥ 2 · H_current.
  - On a prestige, the upgrades, depth and gold reset. Mastery, heartstones, relics, collections, tablets and perks are kept.
  - Each prestige grows the surface camp by one visual stage (§6.4).
- **Lantern Tree perks** are bought with heartstones. There are 12 nodes; the existing `ui/screens/board.ts` tree layout is
  reused. They cover: offline cap +2 h ×8; offline efficiency +10 % ×5; start 25 m deeper ×8; auto-buy; frenzy decay
  0.8 → 1.6 s; treasure value ×2; crew walk speed; event frequency +25 %; Plunge landing gift; and more.
- **Relics.** 1 per biome, found in that biome's treasure cells and Vista. Each is ×1.5 on one stat, permanent.
  Specimen drawers give ×2 gold on that biome's cells (§6.1).

### 4.4 Pacing targets (sim)

These come from the final model (mastery and tool tiers included). The bot buys one level at a time; with the ×10 and Max
modes a player makes about 10× fewer card taps for the same levels. The sim models frenzy only as ×1.25 at ≥ 4 taps/s,
and does not model crits per tap, pierce waste, events or treasures. The §2.2 frenzy levels and the events are upside on
top of these numbers.

| Check (greedy buyer) | 2 taps/s | 3 taps/s | 5 taps/s |
|---|---|---|---|
| First purchase | 6 s | 4 s | 1.5 s |
| Level-ups in the first 3 min | 126 | 237 | 472 |
| 40 m / 100 m / 180 m / 280 m | 1:10 / 2:50 / 4:30 / 9:00 | 0:50 / 2:00 / 3:20 / 6:20 | 0:30 / 1:10 / 2:00 / 3:40 |
| Longest gap between level-ups, first 30 min | 32 s | 36 s | 31 s |
| Depth at 20 min / 30 min, first run | 321 / 335 m | 334 / 345 m | 349 / 417 m |

---

## 5. The descent and the world in the voxel engine

### 5.1 What the world is

- **The logical grid** is 7 columns (x = −3…3) by an infinite number of rows. Row `r` is depth r m; world `y = −r − 1 … −r`.
  - One **cell** is 1 m wide, 1 m tall and **3 m deep**: the voxels (x, y, z) for z ∈ {0, 1, 2}.
  - Breaking a cell removes 3 voxels, so one break is big chunks of debris.
  - The game logic stays 2D (`world/descent/grid.ts`, pure), while the voxel engine keeps the sculpting, light, debris and
    remeshing it is good at.
- **The shaft** covers |x| ≤ 3.5 and z ∈ [0, 3). Its back wall at z = 3 is rock, and lamps, ladder and cables hang on it.
- **The cut plane** is z = 0. There is no world in front of it (z < 0 reads as AIR), so every solid voxel at
  z = 0 shows its front face to the camera as the **section**.
- **Caverns** are carved volumes that the shaft crosses. Their cross-section at z = 0 opens across the whole
  screen width, and you look deep into them (far walls at z = 18–60 m). **Windows** are 3–6 m holes in
  the back wall that look into caverns behind the shaft (z 6–50), 1–3 per biome. **Vistas** are one grand cavern per biome,
  whose far wall opens onto the backdrop layers (§5.7).
- **The screen composition:**
  - Above the dig face is the shaft you dug: crew, lamps, the lift cage, windows. This is the history.
  - The dig face is the action.
  - Below it is the section: ore veins, treasure glints, the outline of the next cavern. This is the promise.

### 5.2 Streaming: a ring window in y (`world/descent/RingWorld.ts`)

| Item | Value |
|---|---|
| Window | x ∈ [−32, 32) (64), z ∈ [0, 64) (64), y: a **160-row ring** (10 slabs of 16 rows) |
| Placement | Top of the window = dig face + 48 m; bottom = dig face − 112 m (3 slabs above, 7 below) |
| Memory | Blocks 655 KB; light RGBA8 2.6 MB (the old zone was 3.3 MB and 13 MB) |
| Indexing | storage row = ((y mod 160) + 160) mod 160. `get()` returns AIR for z < 0 and for y ≥ 0 (the sky), and STONE outside the window otherwise |
| Light texture | The same 64×160×64 RGBA8 3D texture with `wrapT = RepeatWrapping`, so `samplePos / uWorldSize` wraps by itself. The filtering seam sits on the dead slab, at least 48 m from the camera |
| Dead slab | The slab being recycled is filled with BEDROCK and its light is zeroed **before** reuse. A solid slab is a perfect light barrier, so `LightField` propagation needs no ring checks |
| New slab | The worker (`slabWorker.ts`) gets the seed, run and slab index, plus the 16 context rows above it. It returns blocks, light and openness for slab + context, and the 64×16 section distances. The main thread writes the slab, **max-merges** the context rows (additive light, nothing to remove) and uploads one sub-box with `texSubImage3D` (64×32×64×4 = 524 KB, about 1 ms) |
| Meshing | Chunks are keyed by world chunk coordinates (cy is unbounded). The 16 chunks of a recycled slab are disposed, and the new slab's 16 chunks go to the mesh workers. Solid interiors give no faces; a cavern chunk takes about 1 ms on a worker |
| Speed cap | At most **6 rows/s** of physical descent (a slab every 2.7 s; the worker needs about 50 ms per slab on a phone). Above 5 m/s sustained for 1.5 s, the **Plunge** renderer takes over (§5.10) until the rate falls below 3 m/s. The economy keeps simulating at full speed |
| Float precision | Render positions are rebased by +8,192 m during a biome gate's white flash, once 8,192 m have been crossed. Every world-space period must divide 8,192: macro noise 1/190 becomes 1/256, boundary wobble 1/3.1 becomes 1/4, masonry macro 1/38 becomes 1/32, inscription erosion 1/18 becomes 1/16, material period 8 m. At 8,192 m the float32 ULP is 1 mm, and `sharpUv` keeps 0.016-texel precision |
| Save | v3 holds no voxel delta. The world is a pure function of (seed, run, depth): everything in the shaft columns above the current row is air, plus 7 cell HPs and a harvested-treasure bitset per cavern id. A save is under 4 KB (the old one was a 3.3 MB word-compare scan) |

### 5.3 The camera in portrait (`render/descent/DescentCamera.ts`, pure math, unit-tested)

| Parameter | Value |
|---|---|
| **Width lock** | Visible width at the cut plane W = clamp(cssWidth / 50, 7.2, 8.6) m, so **1 m = 50 CSS px** on every phone from 360 to 430 px (360 → 7.2 m, 390 → 7.8 m, 412 → 8.24 m). The 7 dig cells measure 50 × 79 px (front face plus top face) |
| Distance | D = 12.6 m in front of the cut plane (camera z = −12.6). hFOV = 2·atan(W/2/D) = 34.4° at 390 px |
| Height and pitch | The eye is 3.0 m above the dig face's top edge, with **pitch 0** and an **off-axis vertical shift** (projection element [9]) that puts the face edge at the centre of the world window. Verticals stay parallel (no keystone), the section reads as an illustration, and cells keep the same size up and down the screen |
| Floor ledge | The 3 m-deep top face of the dig row shows as a **29 px** ledge at 390×844 (3.0/12.6 − 3.0/15.6 = 0.0458 tan × 630 px per tan unit) |
| Visible height at the cut | 16.9 m (390×844), 14.8 m (360×740), 18.3 m (412×915) |
| Parallax (screen scale against the cut) | z = 3 back wall 0.81; z = 10 0.56; z = 30 0.30; z = 60 0.17; backdrop layers at z = 110 / 190 / 320 m: 0.10 / 0.062 / 0.038 |
| Clip planes | near 2 m, far 420 m (ratio 210) |
| Follow | When the floor drops, the camera y follows with an underdamped spring (ω = 9 rad/s, ζ = 0.7): 0.10 m overshoot, settled to 95 % in 0.5 s. That gives a "thunk" per row |
| Cavern dive | When the dig face falls more than 3 m (breaking into a cavern): hold 0.25 s, fall with ease-in to a cap of 30 m/s with motion streaks, then land with a 0.18 m squash and trauma 0.35 |
| Shake | Trauma model: offset = 0.18 m · trauma² · noise(25 Hz), roll = 0.8° · trauma², decay 1.8 /s. Off under reduced motion; the hit pops and flashes remain |
| Vista reveal | Dolly back from D 12.6 to 24 m over 1.2 s (ease-in-out cubic), hold 1.6 s, return in 0.9 s. The width lock relaxes to 14.9 m during the shot. Taps are still accepted |
| Surface and menu | Camera at y = +6 with the shaft mouth at 62 % of the height, the headframe and sky (§5.8). The same rig, no separate MenuCamera |

### 5.4 The biome ladder and its look (`config/biomeLooks.ts`, driven by `render/descent/BiomeLook.ts`)

Each look sets the atmosphere uniforms (the `atmosphere()` GLSL is kept), the section light, bloom and a 16³ LUT. Two
looks blend over **1.6 s**; the LUT pair is mixed in the composite. Hex values are sRGB.

| # | Biome | Depth (m) | Section ramps (palette.ts) | Accent light | Fog / pooled fog | Open fill | Exposure | Bloom thr / str | Saturation | Shadow → highlight tint | Hue shift |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rootworks | 0–40 | SOIL, PEBBLE, STONE + new ROOT | Sky shaft #9fc3e6 (fades out by 30 m), lamps #ffb35c | #2a2420 / #17130f | #6f7f96 | 2.3 | 1.10 / 0.45 | 1.05 | #1a1e2a → #fff1d8 | 0° |
| 2 | Copper Galleries | 40–100 | STONE, COPPER, VERDIGRIS | Copper glint #ff8a3d | #1f1b1a / #121011 | #5a6a84 | 2.1 | 1.00 / 0.50 | 1.08 | #141a26 → #ffe2c0 | 0° |
| 3 | Glimmer Grotto | 100–180 | DEEP, CRYSTAL | Cyan #2fb6cc / #8fe3ee | #203046 / #121638 | #8a9ab5 | 2.25 | 0.95 / 0.60 | 1.10 | #0e1530 → #e8fbff | −4° |
| 4 | Mycelium Gardens | 180–280 | DAMP, LICHEN + new CAP | Bio-teal #5dffc8, violet gills #b98cff | #14261f / #0c1a1e | #6fa293 | 2.2 | 0.90 / 0.65 | 1.15 | #0b1a1a → #f0ffe8 | +8° |
| 5 | Sunken Halls | 280–400 | ASHLAR, JOINT, SEAL | Rune cyan #2fb6cc + braziers #ff9a48 | #1b2030 / #10121e | #7c8aa8 | 2.2 | 1.00 / 0.55 | 1.00 | #101428 → #ffe9c8 | 0° |
| 6 | Magma Veins | 400–550 | new OBSIDIAN, EMBER | Lava #ff5a1f → #ffb347 | #2a140c / #1a0a06 | #8a4a30 | 1.7 | 0.85 / 0.80 | 1.20 | #1a0a0a → #fff0c0 | −6° |
| 7 | Frostdeep | 550–750 | new ICE #0d1c2a…#cfefff, DEEP | Glacier #7fd8ff, aurora #9dffd8 | #1a2a3a / #0e1826 | #a8c4e0 | 2.4 | 1.00 / 0.55 | 0.95 | #0c1626 → #f4fbff | +4° |
| 8 | Titan's Ribs | 750–1,000 | new BONE #1f1a14…#e6dcc4, new RESIN | Resin amber #ffb000, ghost light #d0c8ff | #221e1a / #15110e | #8f8070 | 2.1 | 1.00 / 0.50 | 0.95 | #16120e → #fff4dc | 0° |
| 9 | Crystal Cathedral | 1,000–1,300 | new PRISM | Spectral: hue from the view angle, white cores | #1c1830 / #120e24 | #b0a8e0 | 2.5 | 0.90 / 0.80 | 1.25 | #120c26 → #ffffff | 0° |
| 10 | Abyssal Sea | 1,300–1,700 | DEEP + new CORAL | Biolum #3fa8ff, jelly pink #ff7ad9 | #08162a / #040c1a | #3a6a9a | 2.0 | 0.85 / 0.70 | 1.10 | #04081a → #dff4ff | −8° |
| 11 | Clockwork Core | 1,700–2,200 | new BRASS, IRON | Brass #e2b673, forge #ff7a2a, steam white | #1e160e / #120c08 | #9a8060 | 2.1 | 0.95 / 0.60 | 1.05 | #140e08 → #fff0d0 | +3° |
| 12 | Hollow Sun | 2,200–2,800 | new SUNSTONE | Sun #fff2c0 → #ffb040 | #3a2a10 / #20160a | #e0c080 | 2.8 | 1.10 / 0.90 | 1.10 | #201408 → #ffffff | 0° |
| 13 | The Lantern Heart (gate) | 2,800 | new HEARTSTONE | The lantern-rune glow #ffd29a + violet #b9a2ff | #1a1226 / #0e0a18 | #a090c0 | 2.6 | 0.90 / 0.90 | 1.15 | #0e0a18 → #fff4e0 | 0° |
| ∞ | Fathomless k | 2,800 + 600 k | those of biome 2 + (k mod 11) | that biome's accent, hue +60°·k | that biome's | that biome's | +0.05 k (cap 3.0) | −0.02 k / +0.05 k | +0.03 k | that biome's | +60° k |

**Fog everywhere:** density chosen so fog is 50 % at 45 m from the camera (z ≈ 32 m behind the cut) and 90 % at 70 m.
It is 0 within 15 m of the camera, so the dig face is always in clear air. Pool levels follow the floor of the cavern
nearest the camera, not a world height.

**The cut-plane light (section path, §10.3).** The key is the biome's open fill × 0.9.
- **Rim.** 0.15 m along every outline where the section meets air, coloured by the accent × 1.6.
- **Depth into rock.** mix(1.0, 0.35, 1 − e^(−0.45·d)), where d is the distance in cells to the nearest open cell of the cut. Rock near
  the shaft and caverns glows, the rock mass between them goes dark, and the outlines pop.
- **Fog of rock.** Rows more than 6 m below the face fade to a deep tint (×0.7 by 9 m), but treasure and gem
  emission passes through. That is the tease.
- **Shine sweep.** Every 3.2 s a 45° band 0.6 m wide crosses the screen at 9 m/s, and ore and gem texels inside it get
  +1.6 emissive (the "collect me" glint).

**The dig-face lantern.** The existing `LanternField` (32³) follows the foreman at (x, face + 1.6, z 1.0), with radius 9 m
and intensity 1.35. It makes the warm pool that pins the focus.

**A camera-facing fill** (`uCamFill`) of 0.25 × the open fill reaches faces turned toward the camera, so the
shaft interior is never black. The old darkness-with-intent made sense for exploring; a tapper has to be readable.

### 5.5 Strata and cells (`world/descent/SlabGenerator.ts`, pure, deterministic)

- **Strata.** Bands 3–9 m thick, dipping 0–6°, cycling through the biome's 3 section ramps. Hard rock appears as
  darker lenses (1–3 m). Ore veins come from a 3D noise threshold, so the cut plane shows them as branching seams across the screen,
  not as isolated cubes.
- **Gate row.** At each biome's start depth, 7 cells of carved builders' stone with HP ×5. The existing `script` material
  layer draws a frieze across the row. Breaking it starts the ceremony (§9).
- **Special cells**, 1 % of each biome:

| Biome | Special cell (look in the section) | On break |
|---|---|---|
| Rootworks | Root knot (a twisted root in the soil) | 3 golden seeds pop out and fly up to the counter |
| Copper Galleries | Buried mine cart (a cart outline on rails) | The cart rolls out of the section (prop), ×8 gold spray |
| Glimmer Grotto | Glimmer geode (a crystal-lined hollow) | A cyan glass shatter frees 6–12 moths, each tappable |
| Mycelium Gardens | Spore pod (swollen and pulsing) | A spore cloud: ×2 gold for 10 s, a teal tint on the screen edges |
| Sunken Halls | Rune stone (a glyph block) | A tablet (lore) plus ×20 gold; the nearest frieze wakes |
| Magma Veins | Magma pocket (a crack glowing orange) | A lava burst breaks the 3×3 around it (a free Blast) |
| Frostdeep | Frozen relic (an object in clear ice) | An ice shatter (refraction flash) and a relic shard |
| Titan's Ribs | Fossil vertebra (a bone cross-section) | A specimen item plus ×25 gold |
| Crystal Cathedral | Prism (a clear crystal) | The next 10 taps split into 3 rainbow beams (×3) |
| Abyssal Sea | Pearl clam | It opens: a pearl worth ×40 |
| Clockwork Core | Gear cog | The cog spins away and starts a 5 s auto-blast |
| Hollow Sun | Sunshard | A flash, ×100 gold, and the next 7 cells are heated to half HP |

### 5.6 Caverns and what fills them (`caverns.ts`, `cavernFill.ts`)

**Spacing and size**
- A cavern starts every 22–38 m.
- Grotto: 10–14 m tall. Hall: 16–22 m. Vista: 40–56 m, once per biome, 35 % of the way into the biome.
- 24–48 m wide in x and 18–60 m deep in z.

**Shape**
- A union of 3–6 ellipsoids, with noise displacement at 2.6 m and 7.3 m (the mesher's sculpting does the rest).
- A floor stage, flattened 12–20 m wide around x = 0 for z 3–25.
- Stalactites: cones from the ceiling, 6–20 per cavern. Stalagmites: 4–12.
- The shaft cells of the cavern floor are the next dig face. At least 3 rows of rock separate it from the next cavern.

**Coverage target.** A cavern interior is visible on screen at least **60 %** of the time. It counts from when its ceiling enters the
preview rows until its floor is 8 m above the face (a 20 m cavern stays on screen for about 33 m of descent).

**Fill budget per cavern:**

| Slot | Count | Built with | Example (Glimmer Grotto) |
|---|---|---|---|
| Hero | 1 | A unique `PropRenderer` model or a `StructureRenderer` piece | A 14 m crystal spire with uplight; the Glimmerfall (`Waterfall`) |
| Medium props | 8–16 | `CavernProps` instanced, 2–4 kinds | Crystal clusters 1–3 m, stalagmites |
| Small props | 30–80 | `CavernProps` instanced, 1–3 kinds | Shards, pebbles, drips |
| Creatures | 1 flock (8–24) + 0–2 solo | `Creatures` / `LumenMoths` | Glimmer moths, one crawler |
| Treasures | 3–8, tappable | `PropRenderer` (chest, geode, urn) with a halo | Glint chests; the crew harvests them in 10 s |
| Key lights | 2–4 emitter voxels with halos | `LightField` | Cyan under the spire, one warm lamp (the human counterpoint) |
| Light cones | 1–3 | `LightCones` | From ceiling cracks |
| Ambient particles | 1 emitter | `GpuParticles` | Glimmer dust drifting up |
| Liquid | 0–1 plane | `LiquidPlane` | A dark mirror pool |

**Per-biome fill (hero / medium / creature):**

| Biome | Hero | Medium props | Creatures (tappable) | Liquid |
|---|---|---|---|---|
| Rootworks | A tree-root chandelier from the ceiling, 12 m | Hanging roots, mushrooms 1 m | Earthworms (3, solo) ×5 cell gold | — |
| Copper Galleries | The old miners' headgear and ore chute (timber, rails) | Carts, crates, barrels, lantern posts (existing props) | Tinker beetles (2–4) carrying copper ×10 | Seep water |
| Glimmer Grotto | Crystal spire / Glimmerfall | Crystal clusters | Glimmer moths (flock of 24) ×50 when the swarm is caught | Mirror pool |
| Mycelium Gardens | A giant mushroom, 18 m, with a glowing cap | Mushrooms 2–5 m, shelf fungi | Spore drifters (16, bell-shaped) ×15 | — |
| Sunken Halls | A colossal head of a builder, 16 m, rune eyes | Columns, stairs, gates (structures) | Lantern wisps (4) with a relic chance | Flooded floor |
| Magma Veins | A lava fall, 30 m | Obsidian spikes, basalt columns | Ember salamanders (3) ×30 | Lava river (emissive, flowing) |
| Frostdeep | A frozen waterfall, 25 m | Icicles, ice pillars | Rime owls (2) ×40 | Ice sheet (glossy) |
| Titan's Ribs | A rib cage 60 m tall (Vista) / a skull 14 m | Bones, resin lumps | Bone crawlers (6) with a fossil | — |
| Crystal Cathedral | A prism rose window, 20 m | Prisms that split light into rainbow cones | Prism birds (flock of 12) ×60 | — |
| Abyssal Sea | A sunken builder ship | Coral, kelp (sway) | Lantern jellies (20) ×80; the leviathan (backdrop silhouette only) | The sea (big plane) |
| Clockwork Core | A gear wall, 30 m, turning | Pistons, gears, pipes (steam) | Clock spiders (4) ×100 | Molten brass |
| Hollow Sun | The small sun itself, 12 m sphere, with additive corona | Floating islands, sunstone shards | Sun moths (flock of 40) ×200 | — |

**Creature budgets.** A flock member is at most 60 triangles; a solo creature at most 300. Animation is all in the vertex shader (flap,
undulate, walk cycle from a per-instance phase), and the CPU only steers. Creatures and ambient particles **avoid the dig
rectangle** (within 4 m of the face, z < 3) so the focus stays clean.

### 5.7 Vista backdrops (`render/descent/VistaBackdrop.ts`)

- **Where.** In a Vista cavern, `get()` returns AIR for z ≥ 64 inside the Vista's y range (a per-storage-row flag). The cavern's far
  side is then open, and behind it three **analytic silhouette layers** are drawn at z = 110, 190 and 320 m.
- **Geometry.** One quad each, 400 × 160 m, drawn after the opaque pass with depth test on, so they only fill pixels seen through the
  opening.
- **The skyline function.** Fragment shader: a 1D skyline h(x) = Σ 3 noise octaves + a shape term per biome:

| Biome | Shape term |
|---|---|
| Glimmer Grotto | Spires: \|sin\| peaks |
| Sunken Halls | City blocks: stepped rectangles with lit window cells (hash) |
| Titan's Ribs | Ribs: arcs |
| Clockwork Core | Gears: circles with teeth, rotating 0.05 rad/s |
| Hollow Sun | Floating islands: inverted mounds |

- **Colour.** Layer k mixes the fog colour with the silhouette colour at [0.55, 0.35, 0.2]. Emissive accents are hashed veins and windows.
- **Light.** One soft additive radial glow sits behind layer 2: the biome's mystery light.
- **Cost.** About 30 ALU per pixel, 3 draw calls, only while a Vista is in view. High draws 3 layers, Balanced 2, Battery 1.
- **The Abyssal leviathan** is a fourth card at z = 150: a long body silhouette with lit photophores, crossing in 40 s every 3 min.

### 5.8 Shaft dressing and the surface (`render/descent/ShaftDressing.ts`, `SurfaceSky.ts`)

- **Lamps.** The crew hangs one lamp every 6 m, 4 m above the face, alternating x = ±2.6, on the back wall (prop) with a `LIGHT_LAMP`
  emitter voxel at z = 2 and a halo. Each Lamps level adds one lamp between the existing ones.
  - The trail of lamps receding up the shaft is the visual record of progress.
  - At most 30 lamps are on screen, as instanced meshes.
- **Per-biome fixtures.** Timber sets every 10 m (Copper), rope ladders, brass pipes (Clockwork), ice anchors (Frost). All instanced.
- **The lift cage and its cable** run on the right-hand wall (§3). The drill rig sits on the left wall.
- **The surface.** It shows for 0–40 m and on the menu.
  - Above y = 0 is open sky: a dawn gradient #f2b27a → #3a4a6a, a sun glow and a hills silhouette card at z = 200.
  - The headframe and winch (existing `hoistWinch`, `lanternPost` and `campfire` props) stand over the shaft mouth.
  - A cool sky light falls down the shaft. It is an additive cone 7 m wide that fades over 30 m, so the circle of daylight
    shrinks above you as you descend.
- **The surface camp grows with heartstones (§6.4).** It is the menu screen and the prestige landing.

### 5.9 Foreman, crew and tools (`ToolRig.ts`, `CrewRenderer.ts`)

**The foreman.** The existing `ExplorerModel` is reused: swing and dash poses only, no walking controller. On each tap they dash to
the tapped column at up to 8 m/s, with a 0.08 s smear, then swing. The swing animation is cosmetic: the damage has already
landed. From tool tier 5 on, the foreman points and the machine strikes.

**Tool tiers** (×25 tap damage every 75 Pick levels):

| Tier | Pick L | Tool | Model | Strike VFX (per tap) | Trauma |
|---|---|---|---|---|---|
| 1 | 0 | Pick | Iron pick, 0.55 m | 6 chips, 8 dust | 0.06 |
| 2 | 75 | Brass Pick | Brass head, 0.7 m, warm glint trail | +10 velocity-streak sparks | 0.08 |
| 3 | 150 | Twin Picks | Two picks, strikes alternate | 2 impacts 60 ms apart | 0.09 |
| 4 | 225 | Rock Drill | Pneumatic drill in hand | 4 rattles at 30 ms, a spiral of dust | 0.10 |
| 5 | 300 | Steam Hammer | A 2.5 m piston arm on the shaft wall extends to the cell | 24 steam puffs, a shockwave ring | 0.18 |
| 6 | 375 | Charge Launcher | Lobs a glowing charge, 0.25 s fuse | Fireball (32 glow + 20 smoke), flash 0.25 | 0.30 |
| 7 | 450 | Lumen Lance | A beam 0.12 s long from a lantern turret at the top of the screen | Cyan ribbon (`Beams`), glowing slag drips | 0.14 |
| 8 | 525 | Titan Arm | A 9 m stone-and-brass fist from above the screen | A shockwave the width of the screen, debris ×2 | 0.45 |
| 9 | 600 | Gravity Well | A violet singularity | The 3×3 cells are drawn in (vertex pull, 0.15 s), then implode and burst; chromatic punch | 0.50 |
| 10 | 675 | Star Driver | A pillar of starlight down the whole shaft, 0.2 s | White beam, bloom pulse +0.5 | 0.55 |
| 11+ | +75 each | Absurd: the earlier models | Scale ×1.6 per tier, hue rotation +40°, a ring of satellite tools, +1 echo strike | — | 0.60 |

**Crew tiers** (×10 crew dps every 75 Crew levels):

1. Helmeted miners
2. Brass-suited miners
3. Lamp-golems (stone, with glowing chests)
4. Lantern spirits (translucent, additive)
5. Mini-titans (4 m tall; 3 at a time fill the shaft)
6. and on: the previous looks ×1.3 in size and recoloured

---

## 6. Discovery, collections, events, the mystery thread

### 6.1 Collections

- **Specimen drawers.** One per biome, with 6 specimens: 3 minerals, 1 fossil, 1 creature sample, 1 relic. The existing
  specimen icons in `ui/sprites.ts` `itemRaster` are extended.
  - A specimen drops from the biome's special cells and treasures, with a guaranteed first copy of each within the biome's first 60 % of depth.
  - A full drawer gives ×2 gold on that biome's cells, permanently. Its ornament is added to the menu camp.
- **The bestiary** has one entry per creature, unlocked by its first tap. The card shows the creature lit in its biome's look.

### 6.2 Discovery moments

| Moment | Frequency | Visual |
|---|---|---|
| Cavern breakthrough | Every 22–38 m | The cavern dive (§5.3); the halos of its treasures pulse three times |
| Window glimpse | 1–3 per biome | A 3–6 m hole in the back wall; the cavern behind is lit by its hero light |
| Vista | 1 per biome | The dolly-back reveal (§5.3), title plate "The Rib Cathedral", the backdrop layers |
| Gate | 1 per biome | The ceremony (§9) |
| First creature | 1 per biome | The camera tracks it for 0.6 s, slowed to 50 % for 0.4 s; the bestiary card slides in |

### 6.3 Events (`gameplay/idle/Events.ts`)

At least one event is active or upcoming every 60–150 s. Each event shows in the left event stack with a timer ring.

| Event | First at | Interval | Lasts | Visual | Reward |
|---|---|---|---|---|---|
| Glint Chest | 20 m | Every 25–40 m | Until mined | A chest silhouette glows in the preview rows; a ping ring every 2 s | ×50 gold, 15 % relic chance |
| Crawler | 40 m | 90–150 s | 12 s | A creature runs along the section or the back wall with a glinting gem | ×10–200 (by biome) |
| Swarm | 100 m | 120–200 s | 10 s | 24 moths spiral across the screen; tap them | Each moth gives gold; all of them gives ×50 plus a specimen |
| Gold Rush | 60 m | 150–240 s | 10 s | A vein lights up gold across 8–14 cells (emissive pulse at 2 Hz) | ×5 gold on those cells |
| Cave-in | 180 m | 180–300 s | 15 s | 6–10 boulders fall from the top of the screen; tap them | ×8 each; anything missed lands as extra HP on the row |
| Rune Echo | 280 m | 240–360 s | 20 s | Three runes light up on the back wall; tap them in order | A tablet fragment, ×30 |
| Lost Miner | 100 m | 300–600 s | 20 s | A figure waves from a window | +1 crew level, free |
| Overdrive | After a prestige | — | Until 3 m/s | The Plunge with bursts | — |

### 6.4 The mystery thread: "The Lantern Heart"

- **The story.** The builders carried a sun under the earth. Twelve gate friezes and 24 rune tablets (2 per biome, in Rune
  Echoes, special cells and Vistas) tell it in the `Journal` screen (reused). The text goes through `src/i18n/en/idle.ts`.
- **The visual arc.** Lamplight in the earth, then cold crystal, then the builders' halls, then fire and ice, then bones,
  then prisms, then sea, then the machine, then **the Hollow Sun at 2,200 m**, then the Heart at 2,800 m. There, the
  lantern-rune O of the wordmark appears as a 30 m geode that beats at 0.5 Hz.
- **After the Heart**, the Fathomless cycles begin, with a new tablet set: "the other lanterns". The mystery never closes;
  it widens.
- **The surface camp grows with lifetime heartstones.** It is visible on the menu and at every prestige landing:

| Stage | Heartstones | Camp |
|---|---|---|
| 1 | 0 | Tents and the winch |
| 2 | 100 (sim: first prestige, day 1) | Timber headframe |
| 3 | 1e5 (sim: third prestige, day 1) | Stone lift tower |
| 4 | 1e9 (sim: sixth prestige, day 2) | Brass lantern tower |
| 5 | 1e12 (sim: ninth prestige, day 3) | The Lighthouse, whose beam shines down the first 100 m of the shaft |
| 6 | 1e16 (day 4 or later) | The Lantern City silhouette on the horizon card |

---

## 7. Guidance

### 7.1 Tutorial script, first 3 minutes (progressive disclosure: UI parts appear when introduced)

| t (3 taps/s player) | Trigger | On screen | Hint text (i18n) |
|---|---|---|---|
| 0:00 | Boot | Dawn surface, headframe, the foreman on the first soil row in the lamp pool. Only the gold counter shows. A hand pulses over the centre cell | "Tap the rock to dig" |
| 0:01 | First tap | Pop, crack, "1", chips | — |
| 0:02 | First break | The first loot token flies to the counter, which bumps in with a 0.3 s ceremony | — |
| 0:04 | 4 gold | The dock slides up with **only** the Pick card, glowing; the hand points to it | "Upgrade your pick" |
| 0:05 | First buy | The card press and level flip; the next number is visibly "2" | — |
| 0:07 | Row 1 cleared | The floor drops, "+1 m"; the depth meter appears | "Dig down!" |
| 0:10 | 4 m | Crew card unlocks; a miner abseils down from the top of the screen | "Hire a miner. Miners dig even while you're away" |
| 0:15 | 15 taps in a row | The combo ring appears at level 1 | "Tap fast for Frenzy" |
| 0:20 | 15 m | Lamps card; the first lamp is hung in the shaft | "Lamps: more gold" |
| 0:25 | 20 m | The first Glint Chest appears in the preview rows, with a ping | "Treasure below. Dig to it!" |
| 0:40 | 30 m | Blast card; the first blast fires on the 12th tap after it | "Every 12th tap: BOOM" |
| 0:50 | 40 m | **First gate**: Copper Galleries ceremony | — |
| 0:55 | 45 m | Crit card | "Crits hit ×3" |
| 1:10 | 60 m | Drill card; the rig drops in on the left wall | "The drill grinds the whole row" |
| 1:30 | First Gold Rush | The vein lights up; event bubble | "Gold Rush! Tap the glowing vein" |
| 2:00 | 100 m | Glimmer Grotto gate; first cavern dive with moths | — |
| 2:30 | First swarm | Moths cross the screen | "Catch the glimmers" |
| 3:00 | — | The objective chip moves to generated goals (§7.2) | — |

### 7.2 The objective chip (always visible)

- **The first 12 goals, in order:**
  1. Dig 3 blocks
  2. Buy a pick upgrade
  3. Reach 5 m
  4. Hire a miner
  5. Reach 15 m
  6. Open the chest
  7. Reach 40 m: Copper Galleries
  8. Own 10 miners
  9. Trigger a Blast
  10. Reach 100 m: Glimmer Grotto
  11. Catch a glimmer swarm
  12. Complete the Copper drawer
- **After goal 12**, a generator always shows the nearest of these:
  - the next gate;
  - the next ×2 milestone of the cheapest upgrade;
  - the next missing specimen of the current biome;
  - the prestige, once H_new ≥ 2 · H.
- **Never empty** (tested).
- **Completing a goal.** The chip flips (rotateX 90°, 240 ms), the reward flies from the chip to the counter, and the next goal flips in.
- **The progress bar** (the "next-goal bar") runs 4 px along the chip's bottom edge, in amber400. For depth goals it fills in real
  time as the floor drops.

### 7.3 Hints (`ui/idle/hints.ts`)

| Condition | After | Hint |
|---|---|---|
| An upgrade is affordable and nothing has been bought | 5 s | The card pulses (shine sweep ×1.5) and the hand points to it |
| No tap, nothing affordable | 8 s | The hand appears over the most valuable exposed cell |
| A treasure or creature is in view and untapped | 6 s | A ping ring over it (2 rings, 0.6 s) |
| Frenzy is about to drop (combo ≥ 15) | 0.5 s before | The combo ring flashes |
| Prestige ready and the run is at the wall (depth rate < 1 m/min for 90 s) | — | The Delve Anew lantern glows violet, and the chip shows "Delve Anew: ×N power" |

Each hint shows at most 3 times. A hint never covers the dig row.

### 7.4 The depth ruler

- **Placement.** The right edge, x 362–382 px, from y 175 to the dock top. Its "you are here" notch is aligned with the dig face's screen y,
  so the ruler is part of the world.
- **Scale.** ±50 m at 1 tick per 10 m. Gate markers carry the biome icon (20 px).
- **The next gate** glows, with its name and the metres left (e.g. "Glimmer Grotto · 37 m").
- **Events in the preview** (chests) show as small markers on the ruler.

---

## 8. Portrait UI layout (brand: slate plates, brass rims, the Lintel display face; no blur)

### 8.1 390 × 844 CSS px (safe top 47, bottom 34)

```
y=0    ┌──────────────────────────────────────┐
       │  status bar / notch          (47)    │
y=47   │ [◆ 1.23M ▴45.6K/s]   [ 312 m ▾ ][⚙]  │ top bar 64: gold Lintel 26 px tabular, rate 13 px; depth 22 px
y=111  │ [▶ Reach 400 m · Magma Veins ▮▮▮▮▯]   │ objective chip 44 (x 16–374) + 8 gap
y=163  │ ┊ev┊                              ┊ru┊│
       │ ┊56┊   SHAFT (history): crew,     ┊le┊│ world window 163–642 (479 px)
       │ ┊px┊   lamps, lift cage, windows  ┊r ┊│
y=402  │ ═══════════ DIG FACE (7×50 px) ══◀═══ │ face edge at the window's centre
       │      SECTION (promise): ore veins,   │ 4.8 rows of preview
       │      treasure glints, next cavern    │
y=590  │            ( combo ring 80 )         │
y=642  ├──────────────────────────────────────┤ 60 px gradient scrim above, slate-950 0 → 0.85
       │ [Pick  ][Crew  ][Blast ]   [×1 ▾]     │ dock 168: 2 rows of 3 cards 116 × 64, 8 px gaps
       │ [Drill ][Lamps ][Crit  ]              │
y=810  │  home indicator               (34)   │
y=844  └──────────────────────────────────────┘
```

| Element | Rect (x, y, w, h) | Content and type |
|---|---|---|
| Gold counter | 16, 55, 200, 48 | Icon 28 px; value Lintel 26 px tabular (bone100); rate 13 px (verdigris300) |
| Depth meter | 238, 55, 92, 48 | Value 22 px (amber300); biome name 12 px (brass300) |
| Settings | 338, 55, 44, 44 | Gear; the Delve Anew lantern takes this slot's left neighbour when ready (violet deep300) |
| Objective chip | 16, 119, 358, 44 | Icon 20 px, text 15 px bone100, bar 4 px amber400 |
| Event stack | 8, 175, 56, up to 4 × 64 | Bubbles 56 px with a timer ring |
| Depth ruler | 362, 175, 20, 467 | Ticks, gate icons, the notch at the face |
| Combo ring | 155, 560, 80, 80 | Level arcs 1/2/3 in amber, flames at level 3 |
| Dock cards | 11 + i·124, 650 / 722, 116, 64 | Icon 40, name 13 px, level 12 px, cost 15 px (amber300 when affordable, bone500 when not), affordability fill 3 px |
| Buy mode | 330, 616, 48, 28 | ×1 / ×10 / Max |

### 8.2 Other viewports

| Viewport (safe areas) | Top bar | Chip | Dock | World window | Face y | Preview rows |
|---|---|---|---|---|---|---|
| 360 × 740 (24 / 16) | 60 | 40 + 8 | 156 (cards 108 × 60) | 132–568 | 350 | 4.4 |
| 390 × 844 (47 / 34) | 64 | 44 + 8 | 168 | 163–642 | 402 | 4.8 |
| 412 × 915 (40 / 24) | 64 | 44 + 8 | 176 (cards 122 × 66) | 156–715 | 435 | 5.6 |

Cells are 50 px on all three (§5.3). Every tap target is at least 48 px. Landscape is locked to portrait
(`ui/screenFormat.ts`, which previously locked to landscape). On a tablet or desktop, the 9:19.5 column is centred with slate side plates.

### 8.3 Readability on bright biomes

- **Scrims.** A 60 px gradient (slate-950, 0.85 → 0) sits under the top bar and above the dock. All HUD text has the brand's 2 px carve outline.
- **Vignette.** The portrait vignette is weighted 0.30 at the top, 0.25 at the bottom and 0.10 at the sides, which frames the dig face.
  The Hollow Sun (exposure 2.8) is the checked worst case (§11).

### 8.4 UI motion (only transform and opacity; the motion tokens in `ui/brand/motion.ts`)

| Element | Motion |
|---|---|
| Affordable card | Amber rim on, plus a shine sweep every 2.4 s (pseudo-element translateX, 600 ms) |
| Card press / buy | Scale 0.94 over 60 ms, then 1.06 → 1.0 over 120 ms; the level number flips (rotateX, 160 ms) |
| Tier jump on a card | `DURATION.ceremony` (1.1 s): the old icon shatters into 8 sprites, the new icon rises and stamps |
| Counter on loot arrival | Scale 1.0 → 1.18 → 1.0 over 140 ms (at most once per 90 ms); odometer roll over 250 ms |
| Objective flip | rotateX 90° → new goal, 240 ms |
| Biome title card | Rises 8 px with a fade over 240 ms, holds 1.6 s, fades 140 ms; Lintel display 28 px plus subtitle 15 px |
| Event bubble | Pops in at scale 0.6 → 1.08 → 1 over 200 ms; the timer ring is a stroke-dashoffset on one SVG |

The DOM is pooled: no per-tap element creation (the existing `ui-check` "no DOM churn" check stays).

### 8.5 Numbers (`ui/fx/numberFormat.ts`, pure)

- **Notation.** `1,234`, then `12.3K 456K 1.23M … B T`, then `aa ab … zz` (1e15 … 1e2031), then `1.23e2034`.
- **Digits.** 3 significant digits, with tabular Lintel digits.
- **The rate line.** It shows "/s" with the same notation.

---

## 9. Juice and feel

### 9.1 Event → response table (`config/juice.ts`, applied by `render/fx/Impact.ts`)

Columns:
- **Particles:** GPU dust / sparks / glow.
- **Debris:** CPU cubes with voxel collision.
- **Flash:** the composite's `uFlash`.
- **Bloom+:** a pulse added to the bloom strength.
- **Haptic:** `navigator.vibrate` ms.

Battery halves the particles and debris.

| Event | Hit-stop | Trauma | Flash | Bloom+ (ms) | Particles | Debris | Number | Sound | Haptic |
|---|---|---|---|---|---|---|---|---|---|
| Tap hit | — | +0.06 | — | — | 8 / 0–10 / 0 | 6 | 18 px bone100, +4 px per decade above the median, cap 40 | Material hit ±6 % pitch | 8 |
| Crit | — | +0.18 | 0.10 amber | +0.15 (100) | 8 / 12 / 6 | 8 | ×1.35 size, amber300, "!" | Crit crack | 14 |
| Cell break | 30 ms (heavy cells only) | +0.25 | — | — | 24 / 0 / 0 | 12–27 | Loot tokens 1–6 | Break + loot tick | 20 |
| Ore / gem break | 40 ms | +0.25 | 0.08 accent | +0.2 (120) | 24 / 16 / 12 | 18 | Tokens; gem in rune200 | Chime (pitch from value) | 24 |
| Chain (pierce) | — | +0.04 per cell | — | — | A crack line (`Beams`) at 40 ms per cell | 6 per cell | Chain counter "×7" | Rising arpeggio | 10 |
| Row clear | — | +0.30 | — | — | A dust skirt along the row (48) | — | "+1 m" on the ruler | Thunk | 18 |
| Blast | 50 ms | +0.45 | 0.20 | +0.3 (150) | 60 / 30 / 32 + 20 smoke | 30 | Big number at the centre | Boom | 35 |
| Frenzy level up | — | — | Screen-edge amber 0.15 | +0.1 (sustained) | Pick trails | — | "FRENZY ×1.5" | A percussion layer joins the music | 12 |
| Upgrade bought | — | — | — | — | Card sparkle (overlay) | — | — | Ka-ching ±3 % pitch | 10 |
| Milestone ×2 | 60 ms | +0.15 | 0.12 amber | +0.2 (200) | The tool flares | — | "×2!" over the tool | Stinger | 30 |
| Tool tier jump | 120 ms | +0.4 | 0.3 white | +0.4 (400) | 120 glow around the new tool | — | Plate with the new tool's name | Fanfare | 40, 30, 60 |
| Cavern breakthrough | — | +0.35 on landing | — | — | 64 dust falling with the floor | 40 | — | Rumble + reveal pad | 30 |
| Biome gate | 120 ms | +0.5 | 0.35 white → fade 0.6 s | +0.5 (600) | 160 glow from the frieze | 40 | Title card | Gate theme | 50, 40, 80 |
| Vista reveal | — | — | — | +0.2 (1,600) | Ambient up ×2 | — | Vista plate | Choir pad | 20 |
| Creature tap | 40 ms | +0.12 | — | +0.1 (100) | 0 / 12 / 12 | — | ×N gold | Creature chirp | 16 |
| Event start | — | — | — | — | Bubble pop | — | — | Bell | 12 |
| Offline return | — | — | — | — | Plunge streaks | — | Odometer | Whoosh, then cash roll | 30 |
| Delve Anew (prestige) | 200 ms | +0.6 | 0.4 violet | +0.5 (800) | Heartstone rain (violet glow 200) | — | Heartstones counter | Deep bell | 60, 40, 120 |

**Caps (photosensitivity).**
- At most 3 flashes per second, and flash intensity ≤ 0.35 (0.4 for the prestige, with a 200 ms ramp).
- Red is never full-screen.
- Under reduced motion: no shake, no radial blur, no chromatic aberration, flashes ×0.5. Numbers, tokens and pops stay.

### 9.2 The block-break shader, step by step (terrain shader plus FX)

1. **Pop** (vertex). Faces of the hit cell (up to 4 cells animate at once, `uPop[4]`) move along their own normal: the front face toward the
   camera, the top face up. The move is +0.08 m on hit, back over 70 ms with ease-out.
   - Nothing is in front of the cut, so it never z-fights.
   - The owning voxel is decoded from the lattice corner, the face index and the (u, v) bits (the mesher's face-corner table), in a pure function
     mirrored by a unit test.
2. **Cracks** (fragment). The existing `fracture()` is reused, centred on the tap point, with the 10 stages driven by damage. The reach is
   0.14 + 0.66 · dmg on both visible faces. The crack core goes to 22 % of the stone tone, with a lit lip ×1.25. Heat cracks glow
   (accent × 2) on Magma and Hollow Sun cells.
3. **Flash.** +0.2 warm white over the spot for 60 ms (`uTargetFx.x`, kept).
4. **Break.** The voxels are removed, and the remesh arrives 1 frame later on the workers. The **same frame** spawns:
   - 12–27 debris chunks coloured from the cell's ramp (instance colours from `palette.ts`, not grey);
   - dust;
   - 1–6 loot items popping in 3D;
   - one shockwave ring (`uShock`, ring radius 7 m/s · t, 0.5 m wide, 0.45 s, in the accent colour × 0.6 on every terrain and entity
     fragment within 4 m).

   The 1-frame gap is covered by the debris, which fills the cell's volume at the moment of the break.
5. **Chain.** A cell broken by pierce gets the same treatment, delayed 40 ms per cell. A white-hot `Beams` ribbon (6 px, 120 ms)
   links the cells.

### 9.3 Loot flight: from 3D to the HUD (`game/effects/LootBurst.ts` + `ui/fx/FxOverlay.ts`)

| Phase | Time | Motion |
|---|---|---|
| Pop (3D, lit by the light volume, emissive rim) | 0–0.32 s | Velocity (±1.5, 4.5, −2.0 toward the camera) m/s, spin 6 rad/s; scale 0 → 1.15 → 1 |
| Handoff | 0.32 s | Projected to the screen. The 3D mesh hides and an overlay sprite (`itemRaster`, 28 CSS px at native DPR) carries on from the same point |
| Flight | 0.48 s + 0.03 s × index | A quadratic Bézier to the counter, control point 120 px to the side (alternating), ease-in t², 4 ghost trails at 20 % alpha |
| Arrival | — | Counter bump; 6 sparkles; a tick whose pitch rises 1 semitone per arrival within 0.6 s (cap +12) |

**Tokens per break** = clamp(1 + floor(log2(2 · value / median value)), 1, 6). **Bundling:** above 12 tokens/s, the tokens merge into bundles (a bigger icon labelled ×N).

### 9.4 Damage numbers

- **Font.** Drawn in the overlay with the Lintel face (`FontFace('Lintel')` is already registered), in a pool of 32.
- **Motion.** Each number spawns at the tap point ±12 px, rises 46 px over 0.62 s with ease-out-cubic, pops 0.6 → 1.15 → 1.0 in the first 90 ms
  and fades over its last 0.2 s.
- **Outline and glow.** The outline is the carve colour #04070b, 3 px. Crits also get a second, wide amber stroke at 30 % alpha behind the text,
  which costs less than `shadowBlur`.

---

## 10. Technical plan (reusing the engine)

### 10.1 Files

**Add**

| File | Responsibility |
|---|---|
| `src/world/descent/RingWorld.ts` | VoxelWorld subclass: the 160-row y ring, out-of-window rules (§5.2), dirty marking per ring chunk, `recycleSlab()` |
| `src/world/descent/grid.ts` | The logical 7-column cell grid ↔ voxels, cell types and HP; pure |
| `src/world/descent/biomes.ts` | The biome table: depths, ramps, cell mix, cavern templates, creatures, look id; the Fathomless remix |
| `src/world/descent/SlabGenerator.ts` | Pure and deterministic: (seed, run, slab) → blocks, shaft cells, caverns, props, creatures, treasures, emitters |
| `src/world/descent/caverns.ts`, `cavernFill.ts` | Cavern shapes, stage, windows, Vista flags; the fill budgets and placement (§5.6) |
| `src/world/descent/slabWorker.ts`, `slabLoader.ts` | Module worker: slab + light + openness + section distances, transferred buffers; main-thread fallback |
| `src/render/descent/DescentCamera.ts` | Width lock, off-axis shift, follow spring, trauma, dolly, plunge camera; pure math |
| `src/render/descent/SectionField.ts` | R8 64×160 ring texture of distance to air on the cut plane; incremental chamfer (3-4 weights) over a 17×17 window per break (≈ 0.02 ms); `texSubImage2D` per row |
| `src/render/descent/BiomeLook.ts`, `src/render/post/lut.ts` | Looks, 1.6 s blends, LUT building (16³, ≈ 1 ms in JS); the LUT builder is pure and tested |
| `src/render/descent/CavernProps.ts` | Instanced prop batches (entity material + sway/pulse instance attributes), ≤ 24 batches |
| `src/render/descent/Creatures.ts` | Instanced creatures with vertex animation and tap bounds |
| `src/render/descent/CrewRenderer.ts` | Instanced miners (9 parts, a part-id attribute, poses in the vertex shader), squad plates |
| `src/render/descent/ToolRig.ts` | Tool tier models and strike timelines (§5.9) |
| `src/render/descent/ShaftDressing.ts`, `SurfaceSky.ts` | Lamps, fixtures, cage, drill rig, headframe; sky gradient, sun, hills card, daylight cone |
| `src/render/descent/LiquidPlane.ts` | Water / lava / brass: fresnel, a reflection from the light volume at the mirrored point (1 3D fetch), 2 scrolling noise fetches, shore foam from per-vertex depth baked from the voxels (32×32 grid) |
| `src/render/descent/LightCones.ts` | Instanced additive cones (16 segments), soft edges from \|n·v\|², motes inside |
| `src/render/descent/VistaBackdrop.ts` | Three analytic silhouette layers, glow, the leviathan card |
| `src/render/descent/PlungeTunnel.ts` | Fast-descent impostor: a 7 m cylinder 200 m long (48 × 64 segments). Its shader paints strata bands from the BiomeLook ramps at the scrolled depth, ore glints, passing lamps every 6 m and streaks; radial blur in post |
| `src/render/fx/GpuParticles.ts` | Ring of 1024/2048/4096 analytic particles (origin, velocity, spawn time, life, size0/1, colour RGBA8, flags: 40 B each). The vertex shader evaluates p = o + v(1 − e^(−kt))/k + ½gt². Sparks stretch along their screen velocity. Light is sampled per vertex. Spawns upload ranges (`addUpdateRange`). 2 draw calls (premultiplied + additive). Replaces `game/effects/Particles.ts`; the mote field moves in as a small instanced set |
| `src/render/fx/Beams.ts`, `Shockwave.ts`, `Impact.ts` | Additive ribbons; the 2 shock rings (uniforms shared by the terrain and entity materials); the juice orchestrator driven by `config/juice.ts` |
| `src/ui/fx/FxOverlay.ts`, `numberFormat.ts` | Canvas2D overlay at native DPR (pointer-events none, between the canvas and `#ui`): numbers, loot sprites, sparkles, the hand, the combo ring. Pooled. Cleared and `visibility:hidden` after 0.5 s idle |
| `src/ui/idle/*` | `IdleHud`, `ObjectiveChip`, `DepthRuler`, `EventStack`, `Dock`, `BiomeCard`, `OfflineReport`, `DelveScreen`, `TapSurface`, `hints`, `idle.css` |
| `src/gameplay/idle/*` | Pure economy: `Economy`, `Upgrades`, `Crew`, `Prestige`, `Offline`, `Goals`, `Events`, `Collections` (owned by the economy and gameplay specialists) |
| `src/config/idle.ts`, `juice.ts`, `biomeLooks.ts`; `src/i18n/en/idle.ts` | Every tunable number from §4, §5.4 and §9; all text |

**Change**

| File | Change |
|---|---|
| `render/Renderer.ts` | Portrait presets (§10.4), Battery at 60 fps (a manual "Saver" setting keeps 30), dynamic resolution through a sub-viewport, the new preset fields |
| `render/PostFX.ts` | LUT pair + mix (this replaces the hard-coded split grade with one 3D fetch), CAS sharpening (4 extra luminance taps, only when the render scale is below the device DPR), bloom pulse, `RADIAL` and `CHROMA` defines (explosions, tiers 8–10), heat shimmer (Magma, 1.5 px), portrait vignette, a UV scale for the sub-viewport |
| `render/lighting.ts` | `ATMOSPHERES` and `updateAtmosphere` are replaced by BiomeLook-driven uniforms (the GLSL `atmosphere()` is kept); `uCamFill`, `uShock`; `lightTex.wrapT = Repeat`; the lantern at radius 9, intensity 1.35 |
| `render/terrainMaterial.ts` | The section path (§10.3), pop displacement, the valuable shine sweep (`uValuable[layer]`), fog of rock, shockwave, cam fill; the section samples the HD layers |
| `render/terrainRig.ts` | An array of 16 HD layers (256², 32 texels/m: the current and the next biome's 8 layers), `setTargets()` for 4 cells, section uniforms |
| `render/mesher.ts` | `copyPadded` reads through RingWorld (z < 0 is AIR). At lattice z = 0: no z offset, normal (0, 0, −1), xy offsets at 50 %, AO 1, so the cut is flat with an organic outline. Still a pure function of the lattice (crack-free tests stay) |
| `render/ChunkRenderer.ts` | Ring chunk keys, slab recycling, per-chunk AABB frustum culling (the portrait frustum is not a distance sphere) |
| `render/materials/*` | A size parameter (128 or 256); new painters for ROOT, CAP, OBSIDIAN, MAGMA, ICE, BONE, RESIN, PRISM, CORAL, BRASS, SUNSTONE, HEARTSTONE; ramps in `palette.ts`. HD layers are painted in the slab worker during the previous biome (~100 ms each, mips computed in the worker, uploaded level by level) |
| `render/QualityGovernor.ts` | Adds a fine controller: the median frame interval over 1 s. Above 17.5 ms the scale steps −0.05; below 14.5 ms for 4 s it steps +0.05; within the preset's range; at most 1 change per 2 s. No reallocation (sub-viewport) |
| `world/light.ts` | Storage-row indexing, the dead-slab barrier, max-merge of worker light |
| `game/effects/Debris.ts`, `Halos.ts`, `LumenMoths.ts`, `Waterfall.ts` | Ramp-coloured 1×1×3 cell debris; biome halo colours and treasure pulses (cap 48); moths as swarm and flock; a pool of 3 waterfalls |
| `render/props/*`, `render/structures/*` | New prop kinds (chest, geode, urn, mushroom, stalagmite, root, bone, gear, coral, sunshard, lamp, cage); ruins for the Sunken Halls |
| `entities/character/ExplorerModel.ts` | The foreman: swing and dash only; a tool slot driven by `ToolRig` |
| `ui/screenFormat.ts`, `ui/UI.ts` | Portrait lock; the idle screens; Journal and board (tree) reused |
| `game/Game.ts` | IdleGame: a fixed 60 Hz sim step and the pipeline of §10.2. `FrameGuard`, saves, settings and the crash shell are kept |
| `save/*` | v3 (§5.2). v2 saves start fresh with a "Veteran" gift (×2 gold for 10 min) |
| `lab/VisualLab.ts` | Becomes the Biome Lab: every look, cavern template and FX trigger, side by side |
| `tools/capture.mjs`, `perf.mjs`, `ui-check.mjs` | Portrait presets and the checks in §11 |

**Delete** (kept in git history):
- the authored zone and its pipeline: `world/gen/generateWorld.ts`, `world/gen/features/*`, `architecture.ts`, `progression.ts`, `zoneLoader.ts`, `zoneWorker.ts`;
- the zone analyses: `world/analysis/{homeField, reachability, economy}.ts`. `fingerprint.ts` becomes a slab fingerprint;
- the old game loop: `game/{CameraRig, PlayerController, TapController, aimAssist, touchCamera, ropeRide, runeDoor, WorldFeatures, Survey, Stations, Progression, MenuCamera, Drops}.ts` and `game/effects/TargetMarker.ts`;
- the old controls and HUD: `ui/TouchControls.ts`, the joystick in `ui/touchMath.ts`, `ui/hud/Hud.ts`;
- the old gameplay modules: `gameplay/{Cold, Lantern, Expedition, CacheSpot, Crafting, Storage, Equipment, Health, NextStep}.ts` and `config/recipes.ts`;
- their tests.

`Inventory`, `Records` and `Objectives` either fold into `gameplay/idle` or go.

### 10.2 Frame pipeline

1. **Input** → `TapSurface` queues taps with screen coordinates.
2. **Sim** (fixed 1/60 s steps, at most 4 per frame): taps → `DigController` (picking: a screen point → the cell rectangles, analytic, because the
   cut is axis-aligned; treasures and creatures by sphere) → damage, pierce, events → `Impact` queues the FX.
3. **World:** apply at most one finished slab per frame; recycle; `world.set` for broken cells (3 voxels each); incremental light (0.06–0.1 ms
   per opened voxel); SectionField update.
4. **Uploads:** light sub-box, section rows, particle spawn ranges, instance buffers (dirty only).
5. **Camera:** follow, trauma, dolly, or plunge.
6. **Look:** BiomeLook blend → lighting uniforms and post params (exposure × pulse, bloom, LUT mix).
7. **Animate:** crew, creatures, props (uniform time), debris (CPU, ≤ 400), loot 3D, lift cage.
8. **Render:**
   1. Opaque, front to back by `renderOrder`: section/terrain chunks, structures, props, crew, foreman, creatures, debris, loot.
   2. Liquids.
   3. Vista layers (depth test, behind).
   4. Additive: cones, beams, halos, particles, motes.
   5. Post: bright, 3 down, 3 up, composite (tone map → LUT → vignette → CAS → dither).
9. **Overlay** (`FxOverlay`, Canvas2D), then the DOM HUD (it writes to the DOM only on change; the existing pattern is kept).

**Shader warm-up.** Every material variant is compiled during loading with `renderer.compileAsync(scene, camera)` (KHR_parallel_shader_compile
where present, with a synchronous fallback behind the loading bar), with one hidden instance of each material and each post variant.
**A biome change only touches uniforms and textures, never defines.**

### 10.3 The terrain shader's section path (the biggest pixel share)

The branch is uniform per face (a flat varying), so it stays coherent on tile GPUs. The section covers about 45 % of the screen below the face.

```glsl
flat out int vSection;                    // vertex: vFace == 5 && |g.z| < 0.01
// fragment, section path: 3 fetches + ~60 ALU (the full path has 6-9 fetches incl. 2-3 3D)
vec2 uv  = vec2(-vWorldPos.x, -vWorldPos.y) * (1.0 / MAT_PERIOD);       // face projection
vec4 tex = matGrad(uv, hdLayer, dFdx(uv), dFdy(uv), SOFT_CUT);           // 32 texels/m HD layer
float hE = textureGrad(uMatHD, vec3(uv + uEmboss, hdLayer), ...).a;      // emboss: 1 tap toward the key light
float d  = texture(uCutDist, (vec2(vWorldPos.x + 32.0, ringRow) + 0.5) / vec2(64.0, 160.0)).r * 8.0;
float rim = 1.0 - smoothstep(0.45, 0.62, d);                             // bilinear outline band, ~0.15 m
vec3 key = uSectionKey * mix(1.0, 0.35, 1.0 - exp(-0.45 * d)) * (1.0 + (tex.a - hE) * 1.8);
vec3 col = tex.rgb * (key + lanternLight(...face normal (0,0,-1)...)) + uSectionRim * rim;
col = mix(col, uSectionDeep, 0.7 * smoothstep(5.0, 9.0, uDigY - vWorldPos.y)); // fog of rock
col += tex.rgb * uValuable[layer] * sweep(vWorldPos.xy, uTime) * 1.6;           // shine sweep
// + cracks/pop/flash (existing uTarget code) + shockwave ring + emissive (gems, glyphs) unfogged
```

### 10.4 Quality presets (portrait) and budgets

| | Battery | Balanced (default) | High |
|---|---|---|---|
| DPR cap × scale (dynamic range) | 1.25 × 0.85 (0.60–0.85) | 1.6 × 0.9 (0.70–0.90) | 2.2 × 1.0 (0.80–1.00) |
| Pixels at 390×844 (top of the dynamic range) | 372 K | 683 K | 1.59 M |
| Frame cap | 60 (manual Saver: 30) | 60 | 60 |
| Bloom levels | off (halos only) | 4 | 5 |
| GPU particles / debris | 1024 / 120 | 2048 / 220 | 4096 / 400 |
| Cavern prop instances / creatures | 192 / 24 | 384 / 48 | 512 / 96 |
| Vista layers / light cones | 1 / 8 | 2 / 24 | 3 / 64 |
| HD section + emboss | 128² layers, no emboss | on | on |
| CAS / LUT | on / on | on / on | off at scale 1 / on |
| Radial blur / chromatic | off / off | on / off | on / on |
| `USE_BLEND`, `LAMP_DIR` | off / off | on / on | on / on |
| Fog end (z behind the cut) | 40 m | 56 m | 64 m |

**Frame budget on the reference device** (Balanced, Adreno 642L / Mali-G68):

| Area | Item | Budget |
|---|---|---|
| GPU | Total | ≤ 12 ms |
| GPU | Opaque | ≤ 7 ms (terrain ≤ 4.5) |
| GPU | Transparent | ≤ 1.5 ms |
| GPU | Post | ≤ 3 ms (bloom 1.2, composite 1.0) |
| GPU | Overlay composition | ≤ 0.5 ms |
| Main-thread CPU | Total | ≤ 6 ms |
| Main-thread CPU | Sim | ≤ 1 ms |
| Main-thread CPU | Render submit | ≤ 2.5 ms |
| Main-thread CPU | Particle spawns | ≤ 0.1 ms |
| Main-thread CPU | Debris | ≤ 0.3 ms |
| Main-thread CPU | Overlay | ≤ 0.8 ms |
| Main-thread CPU | HUD | ≤ 0.3 ms |

**Draw calls** (Balanced, a cavern frame) total about **90**, against a cap of **110** (High 140, Battery 80):

| Pass | Draw calls |
|---|---|
| Terrain chunks | ~28 |
| Structures | 4 |
| Cavern props | 16 |
| Creatures | 4 |
| Crew | 1 |
| Foreman + tool | 8 |
| Shaft dressing | 4 |
| Debris | 2 |
| Loot | 1 |
| Liquids | 2 |
| Vista | 2 |
| Cones | 1 |
| Beams | 1 |
| Halos | 1 |
| Particles | 2 |
| Motes | 1 |
| Post | 8 |

**Triangles** ≤ 160 K: terrain ≤ 90 K, props ≤ 40 K, creatures 8 K, crew 6 K, particles 8 K, debris 5 K.

**Memory:**

| Item | Size |
|---|---|
| Blocks | 0.66 MB |
| Light | 2.6 MB |
| Material array (30 × 128²) | 2.6 MB with mips |
| HD array (16 × 256²) | 5.6 MB |
| LUTs | 2 × 16 KB |
| Particles | 160 KB |
| Render targets (Balanced, 683 K px: HalfFloat colour 8 B + depth 4 B per pixel, bloom levels and their scratch twins) | ≈ 12 MB (High 28 MB) |
| Terrain and prop geometry | ≈ 4 MB |
| **Total GPU on Balanced** | **≤ 30 MB**. For comparison, the old zone's light volume alone was 12.5 MiB |

### 10.5 Measured or derived costs per operation

| Operation | Cost (source) |
|---|---|
| Light fill when a voxel opens | 0.06–0.1 ms (TEST_REPORT, mining) |
| Remesh of a dirty chunk | 0.66–0.88 ms on a worker; main thread 0.82 ms median per mined block (perf.mjs) |
| Slab: generation + light (64×32×64) in the worker | Estimated at 0.085 µs per voxel from the zone's 280 ms over 3.3 M voxels: ≈ 11 ms light + ≈ 10 ms generation on the container, ≈ 50 ms on a phone; one slab every ≥ 2.7 s |
| Light upload of a slab | 524 KB `texSubImage3D` ≈ 1 ms |
| LUT build | ≈ 1 ms (4096 texels), only at a biome change |
| HD layer paint | ≈ 100 ms each in the worker (4× the 128² cost), 8 per biome during the previous biome |
| GPU particle spawn burst (200) | ≤ 0.05 ms CPU (a range write) |

### 10.6 Risks

| Risk | Mitigation | Proof |
|---|---|---|
| Light seam or ghost light at the ring seam | Dead-slab barrier, max-merge | Unit test: the ring after 200 recycles equals a fresh full compute of the window |
| Workers fall behind at high dig rates | 6 rows/s physical cap, then the Plunge; slabs prefetched 7 ahead | Soak test (§11 S-1) |
| float32 precision deep down | Rebase at 8,192 m in a gate flash; periods that divide 8,192 | Capture before and after a rebase: pixel-identical except the masonry region hash |
| Shader compiles mid-play | `compileAsync` at load; looks never change defines | `renderer.info.programs.length` constant over a 13-biome teleport tour |
| Mali overdraw (particles, cones, beams) | Size caps (dust ≤ 48 px, sparks 4 × 28 px), counts per preset, a fill stress scene in `perf.mjs` | GPU timer query (`EXT_disjoint_timer_query_webgl2` where available) on the device protocol |
| Cost of compositing the overlay canvas | Hidden when idle; a WebGL SDF-number fallback (atlas from the Lintel polygons in `strokeFont.ts`) behind a flag | Device frame test with 30 numbers and 60 tokens on screen |
| Busy caverns hide the dig face | The focus rule: creatures and ambient particles avoid the dig rectangle; clear air within 15 m; the lantern pool | Capture metric V-7 |
| Chromium 88 WebView | No WebGL2 features beyond what the build already uses; OffscreenCanvas 2D in workers (Chrome 69+) only for the HD paint, with a main-thread idle-time fallback | apk-sim boot |

### 10.7 Build order (matches the lead's 3 waves)

1. **Wave 1 — the feel:**
   - RingWorld, slab worker (biomes 1–3 shapes), DescentCamera, the section path, SectionField;
   - tap, pop and cracks, GpuParticles, Debris colours;
   - FxOverlay numbers and loot, IdleHud, dock, chip, ruler, the tutorial;
   - LUT post, presets.
2. **Wave 2 — the wonder:**
   - looks and painters for biomes 4–8, cavern fill, CavernProps, Creatures, LiquidPlane, LightCones, ShaftDressing;
   - events, Vista with 2 layers;
   - tool tiers 1–6, crew tiers 1–3.
3. **Wave 3 — the démesure:**
   - biomes 9–13 and Fathomless, the full Vista;
   - Plunge, offline return, prestige and camp stages;
   - tool tiers 7–11+;
   - dynamic resolution, perf and device pass.

---

## 11. Acceptance metrics (each one a test, a capture metric or a sim check)

**Render and performance** (`tools/perf.mjs` portrait at 390×844; device protocol for the GPU numbers)

| ID | Check | Target |
|---|---|---|
| P-1 | Draw calls, every capture preset, Balanced | ≤ 110 (High ≤ 140, Battery ≤ 80) |
| P-2 | Triangles drawn | ≤ 160 K |
| P-3 | Main-thread CPU per frame during 5 taps/s with blasts (SwiftShader, CPU side) | avg ≤ 4 ms, p95 ≤ 6 ms |
| P-4 | Shader programs after loading, during a 13-biome teleport tour | constant (0 compiles) |
| P-5 | GPU frame on the reference device (timer query), Balanced, Vista with a Blast | ≤ 12 ms; ≥ 58 fps median over 60 s |
| P-6 | Burst of 4,096 GPU particles | ≤ 0.4 ms CPU |
| P-7 | GPU memory estimate (textures + buffers + targets), Balanced | ≤ 30 MB |

**Visual** (`tools/capture.mjs`: 13 biome presets at the dig face plus one Vista each, at 360×740, 390×844 and 412×915; metrics via `tools/png.mjs`)

| ID | Check | Target |
|---|---|---|
| V-1 | Mean sRGB luminance and luminance std of the world window | Mean 0.20–0.38 **and** std ≥ 0.16. The six old `final-pass` captures measured mean 0.105–0.355 with std 0.093–0.140: dark or flat, never both bright and contrasted |
| V-2 | Pixels below 0.03 luminance in the world window | ≤ 10 % (the old tunnel capture: 21.6 %) |
| V-3 | Clipped pixels (all channels > 0.98) | ≤ 0.8 % (Hollow Sun included) |
| V-4 | Accent pixels (saturation > 0.6, luminance > 0.5) | 1–6 % (sparkle present, not noise) |
| V-5 | Biome distinctness: mean graded colour of a fixed neutral ramp through each LUT, ΔE2000 between consecutive biomes | ≥ 8 |
| V-6 | Dig row cell size (camera unit test, all three viewports) | 50 ± 1 CSS px wide, ledge ≥ 24 px |
| V-7 | Focus: mean luminance of the dig band (±1 m around the face) against the window mean | ≥ 1.25× in every biome |
| V-8 | HUD text contrast on its scrim over the brightest biome capture | ≥ 4.5:1 (brand test extended) |
| V-9 | Section rim present: pixels on cavern outlines brighter than the rock 1 m inside | ≥ 1.3× luminance |

**Feel** (unit tests on `config/juice.ts` and `Impact`; e2e through `__DD__.idle`)

| ID | Check | Target |
|---|---|---|
| F-1 | Every dig event kind maps to ≥ 3 feedback channels | 100 % of kinds |
| F-2 | Tap to feedback: after a `pointerdown` the same rendered frame has `uPop.w > 0`, a number in the overlay pool and ≥ 6 particles spawned | 1 frame |
| F-3 | Every break emits ≥ 1 loot flight that reaches the counter rect | 0.48–0.9 s |
| F-4 | Flashes per second | ≤ 3; flash intensity ≤ 0.4 |
| F-5 | Reduced motion: trauma, radial blur and chromatic aberration | 0, while numbers and tokens remain |
| F-6 | Tap never misses: 1,000 random taps inside the world window resolve to a target | 100 % |

**Guidance** (sim with a scripted new-player bot that follows the hand hint at 2 taps/s and buys whatever the hint points at)

| ID | Check | Target |
|---|---|---|
| G-1 | Bot depth | ≥ 40 m by 2:00, ≥ 100 m by 5:00 |
| G-2 | Objective chip text over a 2 h sim | never empty |
| G-3 | Hint system | each hint ≤ 3 times; never overlaps the dig row rect |
| G-4 | Time from an affordable unlock appearing to the bot buying it via hints | ≤ 8 s |

**Economy and endlessness** (`gameplay/idle` sim, the numbers of §4.4)

| ID | Check | Target |
|---|---|---|
| E-1 | First purchase | ≤ 10 s at 2 taps/s |
| E-2 | 40 / 100 / 180 m at 3 taps/s | 0:50 / 2:00 / 3:20 ± 25 % |
| E-3 | Longest gap between purchases, first 30 min, 2 taps/s | ≤ 45 s |
| E-4 | Novelty cadence (purchase, unlock, cavern, event, gate, creature, milestone), 30 min sim | max gap ≤ 20 s |
| E-5 | 3-day sim | depth record at the end of each day ≥ 700 / 1,200 / 1,500 m (sim: 763 / 1,303 / 1,636); over the first 12 prestiges every run ≥ 50 m deeper than the last (sim: +51 to +163 m) |
| E-6 | Numbers | format monotonically to 1e2031 and beyond; property test |

**Streaming and stability**

| ID | Check | Target |
|---|---|---|
| S-1 | Soak: 20,000 m in Plunge and normal mode alternately (SwiftShader). Every 1,000 m, the ring light equals a fresh full compute | identical |
| S-2 | JS heap growth over S-1 | ≤ 5 MB; 0 crash-panel events |
| S-3 | Slab pipeline at 6 rows/s for 120 s | no visible missing chunk (every chunk in the frustum meshed within 2 frames of its slab being applied) |
| S-4 | Save size | ≤ 4 KB; round-trip property test over 500 random states; offline closed form matches the stepped sim within 1 % |
| S-5 | UI layout (`ui-check`), 3 viewports | 0 overlaps between the dock or top bar and the dig row; every target ≥ 48 px; no text below 12 px; no DOM nodes created per tap |
