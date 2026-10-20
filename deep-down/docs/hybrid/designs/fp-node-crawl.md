# DEEP DOWN: the Lantern Crawl (first-person node crawler)

A design proposal for the hybrid pivot, written from the angle "first-person node crawler". It is one entry for the design
panel, not the SPEC. Date: 2026-10-20.

Inputs: `docs/hybrid/research/{lumi-master,hybrids,look,reuse}.md` (all read in full), `docs/idle/SPEC.md` (the pure model's
economy, tap, seals, events, codex, feats, tutorial and goals), `src/idle/config/{biomes,gear}.ts`, and screenshots of both builds:
`artifacts/world-w2/r1/f17`, `artifacts/final-pass/first-five-w2/02`, `artifacts/idle/w2/look/r4-biome-04-412x915` and `peek-2.png`.

**Hard constraints this design obeys**:
- First person: no body in view, only the lantern and the tool.
- Tap or hold only: no joystick, no aiming buttons, no swipes, no free look.
- Lumi Master is a reference only for how its visuals and its first-person exploration feel.
- **Nothing about creatures**: no collecting, taming, companions, pets, battles or trading. Cave life may appear as
  decoration; you can never tap it and it is never a system.
- DEEP DOWN keeps its identity: the lantern-lit descent through the 14 biomes, mining, chests and relics, sealed gates, the
  crew and machines, upgrades to absurdity (démesure), the mystery below, and the Lamplight on the Lintel brand.

Marks used: **est.** = an estimate or design target that the node-paced simulation must confirm.

---

## 0. The idea

### 0.1 Genre and pitch

**Genre:** a *first-person node-crawl clicker*.

**Pitch:** *Tap through the rock by lantern light, burst into a hand-made 3D chamber, strip it of its treasures, choose your
road down. Meanwhile the crew you hired bores ahead and works every gallery you leave behind.*

### 0.2 The design in twelve lines

1. **The descent is a chart of nodes.** Each node is a **chamber**, a curated 3D room seen from one fixed stand. Nodes are
   joined by **drifts**, short tunnels you dig through a 7-cell **face**.
2. **Two places alternate every 10–30 s.**
   - **Drift:** tight, warm and close. You tap the face, the camera creeps forward 1 m per slice.
   - **Chamber:** wide, lit, full of tappables. You harvest, then pick an exit.
   - This is compression and release, v1's "narrow to wide through a framed threshold", repeated on every node.
3. **The world is the button.**
   - Tap a cell to strike it. Tap a vein, chest or relic to harvest it.
   - Tap the light leaking through the last slice to break through.
   - Tap an exit to ride down.
   - Hold to keep going.
   - Tap your lantern to Pulse.
   - There is no other input.
4. **The face is the pure idle model's row.** It has 7 cells, 1 slice = 1 m, and pierce, crumble and κ are unchanged.
   Every economy constant survives (reuse §3.9).
5. **The breakthrough is the heartbeat.** The last slice of every drift leaks light in the colour of what lies beyond. One
   strike, the wall falls inward, the camera glides in: the best frame of v1 (r1/f17), on every node.
6. **Chambers are dioramas, seen and harvested, never walked.**
   - Each holds 4–6 tappables within 6 m of the stand: veins, gem clusters, a feature (chest, relic, geode, Halden note,
     depot) and sometimes a hidden secret.
   - Big spaces are backdrops seen through the frame.
7. **Roads.** Every 4–6 chambers a fork offers two lit exits, each showing what it promises: an ore road, a relic road or a
   depot road. One tap chooses. The roads rejoin. This fixes Lumi Master's most criticised trait, its linear route.
8. **The Lantern Pulse.** The model's Surge meter now lives in your lantern. When the meter is full, a tap on the lantern
   sends a ring of light through the space, which does two things:
   - it reveals hidden veins, stashes and passages;
   - it grants Surge ×3 for 10 s.
   You choose where to spend it.
9. **The crew digs ahead and never steals first sight.**
   - Hired crews and machines dig the next drift while you harvest.
   - They always stop one slice short of an uncharted chamber, so every first look is yours.
   - When blocked, they work the old galleries behind you (the **Works**) for gold.
10. **Sealed gates are mechanisms** (hatch, root knot, prism lock, crusher, bell…), one per biome boundary, then a ≤ 3 s reveal.
11. **Démesure through quality, not quantity.** The tool in your hand evolves through 15 forms and then endless Lantern Edges.
    - Early: strikes break cells.
    - Mid game: strikes clear slices, then sweep whole chambers.
    - Late game: one blow bores a whole drift.
    - The particle cap never moves.
12. **Calm screen.**
    - At most 3 moving foreground groups.
    - At most 5 numbers on screen.
    - One objective line, one amber rim on the thing to tap.
    - Opaque octagon plates.
    - Zero camera motion on taps.

### 0.3 What it is not

- No free look, no steering, no walking.
- No energy, no refills, no store.
- No backpack and no trips back.
- No slot bar.
- No combo counter on screen.
- No vista wallpaper cards.
- Nothing alive to tap.

---

## 1. The director's demands, and where each one is met

| Demand (verbatim intent) | Answer in this design | § |
|---|---|---|
| First person, tap on the screen, the character no longer seen | Fixed stands, authored glides, tap and hold on world objects; the lantern (lower left) and tool (lower right) are the only parts of "you" | 2, 3 |
| Lumi Master's visuals for the 3D aspect, its exploration, extreme simplicity | The "drift ahead" composition, forward motion *into* the picture on every breakthrough, few tones per form, one focal object per beat, short reward beats, one hero control (the world itself) | 3, 8 |
| Mix of v1's 3D exploration and the latest's "just tap" | v1's lantern light, space and props; the tree's economy, crew and HUD discipline; exploration as chambers, roads, secrets and vaults instead of walking | 4, 5 |
| A new hybrid genre | Node-crawl clicker: clicker strikes in drifts, crawler choices in chambers, idle crews boring the edges of the graph | 0 |
| "Nothing is indicated, no help, no tutorial" | A 3-step tutorial taught by doing; the objective line in every frame; one amber rim on the suggested target; first-time cards | 2.6, 6 |
| "Mining is horrible to do, controls unpleasant" | The tap lands on the cell under the thumb in the same frame; a tap can never miss; hold auto-strikes; no joystick, no aim | 2 |
| "Caverns horribly empty" | A fill contract per stand (≥ 4 tappables, ≥ 1 warm practical, ≥ 1 accent emitter, a wonder feature), checked by a generator test from each stand's frustum | 4.8 |
| "Visually horrible, glitches, animations far too present, illegible" | Lamplit Faceted look, no world textures, one value peak per frame, hard motion and particle budget, ≤ 5 numbers, no post theatrics, 10 capture tests | 8 |
| Truly addictive, never boring, dopamine, many varied loops | Ten nested clocks from 0.25 s to days; a variable reward on every strike, every breakthrough and every chamber; roads and secrets; the Pulse decision | 5 |
| Endless, upgrades to absurdity, real progression | The model's endless HP, Big numbers, 15 crew lines plus Echo lines, three prestige layers; the tool in hand and the chamber-sweeping strikes make power visible | 5.2, 5.8 |
| Achievements | Feats (20 families, creature family replaced by Cartographer), records, rank | 5.6 |
| Keep DEEP DOWN's identity | 14 biomes, mining, chests, relics, sealed gates, crew and machines, the Other Lantern, Lamplight on the Lintel | all |

---

## 2. Control scheme

### 2.1 The state machine (what the player is "in")

```
        ┌──────────── tap the exit (or hold) ────────────┐
        ▼                                                │
  [DRIFT: face at 4.25 m]  --row cleared-->  creep 1 m   │
        │  K slices; the last one is the BREACH           │
        │  (light leaks through it)                       │
        ▼ breach crumbles                                 │
  [BREAKTHROUGH glide 1.6 s] ──▶ [CHAMBER: stand] ────────┘
                                   │   ▲
                tap chest/relic/   │   │ tap outside, or resolved
                geode/note/depot   ▼   │
                               [FOCUS VIEW]
  Biome boundary: the last chamber's exit is the SEAL (a mechanism); breaking it plays the REVEAL (≤ 3 s).
```

### 2.2 Gestures (the complete list)

`pointerdown` fires everything, in the same frame (law L1). The rules from `TapSurface.ts` still apply: 3 pointers, a
32-slot ring, a cap of 15 counted taps per second.

| Gesture | Where | Result |
|---|---|---|
| **Tap** | A face cell (drift) | Strikes that cell (model `tap.ts`, unchanged: base, rally, crit, combo, Surge, pierce, splash) |
| **Tap** | Anywhere else in the drift's world region | Strikes the nearest live face cell (screen distance). **A tap never misses** (L2) |
| **Hold** ≥ 250 ms, moved ≤ 12 px | The face | Auto-strikes at the tool rate: 5/s, +0.5/s per Steady Hand level (max 8/s), 10/s during a Surge. When the held cell breaks, the hit moves to the weakest live neighbour |
| **Tap** | A strike-type tappable in a chamber: vein nugget, gem cluster, geode shell, loose stash brick | Strikes it from the stand (reach 6 m). Hit radius = projected bound + 16 px (min 44 px). Fat finger: any tap within 72 px of a strike-type tappable lands on the nearest one |
| **Tap** | A focus-type tappable: chest, relic, cracked geode, Halden note or mural, depot cart, Royal Chest | **Focus view** (§3.2). Direct hit only (bound + 16 px), so a fat-finger strike never opens a chest by accident |
| **Tap** | In the focus view | Does the action: open the chest, read the note, tip the cart. A relic uses **hold and release** on its ring (§5.3). A tap outside the object once it is resolved returns (0.3 s) |
| **Tap** | An exit (the mouth or its octagon plate) | **Way Down** ride to the next face (§3.2). At a fork, tapping one exit is the choice |
| **Tap** | The breach (the last slice, leaking light) | A normal strike. The breakthrough plays when the slice crumbles (5 of 7 cells) |
| **Hold** | Anywhere in a chamber (not on a focus-type) | **Sweep:** auto-strikes the strike-type tappables one after another (nearest the screen centre first), with no camera motion. After the Halden Hatch, when nothing is left and no stop condition holds, the hold carries on: down the main exit, through the drift, through the breach (**auto-delve**) |
| **Tap** | Your lantern (viewmodel, lower left, hit box 110 × 150 px) | Meter full: **Lantern Pulse** (§4.6). Not full: the flame flickers once and the meter's fill shows for 1 s (never an error sound) |
| **Tap** | A bottom card | Buys (×1 until the first ★, then the NEXT ★ default) |
| **Hold** ≥ 380 ms | A bottom card | Repeat buy, 8/s rising to 16/s after 1.5 s (SPEC §5.5) |
| **Tap** | The objective line | Goes where the goal is done: opens the right sheet at the right card, or rims the target in the world |
| **Tap** | ≡ (top right) | The sheet hub (Dig, Crew, Codex, Feats, Board, Lantern) in the bottom 55 % |
| **Tap** | During any glide or ride longer than 1 s | Skips to its end (0.15 s fade). The tap is consumed |
| Android **Back** | — | Closes the focus view or sheet, then opens the menu |

**Never:** swipes, drags, pinches, double taps, a joystick, look-drag, aim buttons.

**Desktop (tests only):** keys 1–7 strike the face cells, Space strikes, E takes the main exit, L pulses, B buys BEST.

### 2.3 Hit-test order (every tap, every frame)

1. **HUD plates.** Taps on them never reach the world.
2. **Focus-type entities.** Screen-space bounds, direct hit.
3. **Event objects.** The Drifting Ember, falling crystals, Cave-in boulders, loose bricks. Radius max(44 px, bound + 16).
4. **The lantern viewmodel.**
5. **Exits.**
6. **Face cell** under the finger: camera ray → `raycastVoxels` → slice cell → model `col`. Then
   **strike-type tappable** by `PropRenderer.raycast`.
7. **Fat finger.**
   - In a drift: the nearest live face cell.
   - In a chamber: the nearest strike-type tappable within 72 px.
8. **Nothing.** This can only happen in a fully harvested chamber. The exit's rim brightens for 0.4 s, which is the hint.

Decoration never takes a tap: moths in Glowroot, spores, falling water, crew figures. Taps pass through it.

### 2.4 What is automatic

| Automatic | Manual (always the player's) |
|---|---|
| The crew and machines strike the face on their impact frames, then dig the next drift while you are in a chamber | **First sight:** striking the breach of an uncharted chamber (a hold counts as present) |
| When blocked, the crew works the old galleries behind you (the **Works**) and carts bring the haul | Opening every chest, relic, geode, note and Royal Chest |
| Gold is credited directly, with no pick-up, no backpack and no selling | Choosing a road at a fork |
| Hold: auto-strike (from the start) and auto-delve through plain chambers (after the Hatch) | The Lantern Pulse (when and where) |
| Lamps hung on the trail behind you as the crew moves in | Breaking a seal (the crew helps but cannot win alone, SPEC §7.1) |
| Offline digging (§5.4); auto-buy and auto-skills from Ember perks | Buying, until the Ember perks |

**Auto-delve stops by itself** with a soft chime, the lantern dimming 10 % and the target getting the amber rim. It stops at:
- an unopened chest, relic, geode, note, depot or Royal Chest;
- a fork;
- a secret's hint (a draft) while the Pulse is ready;
- a seal;
- a first Vista;
- the first sight of a new biome;
- an affordable must-buy, if the player turned that setting on.

Expected stop rate: about one chamber in two (est.), so the hold never plays the game alone (trap T2).

### 2.5 Inputs per minute (est.)

| Phase | Taps/min | Holds | Decisions/min | Notes |
|---|---|---|---|---|
| Drift, tapping | 150–300 | 0 | 0–2 (buys) | the clicker layer; optional |
| Drift, holding | 0–4 | 1 | 0–2 | 5–8 strikes/s without effort |
| Chamber, by hand | 15–40 | 0–1 | 1–3 | open, choose, pulse, exit |
| Auto-delve (after the Hatch) | 2–8 | 1 per stop | 1–3 | stops about every other chamber |
| Seal fight (≤ 30 s) | 200–300 | 0–1 | 1 (finisher) | the one frantic beat per biome |
| Away | 0 | 0 | 0 | the crew digs and works the galleries |

Lumi Master runs at about 15–40 taps a minute. Here a player can stay in that range by holding, or go far above it by
tapping. Both are correct.

### 2.6 The tutorial: three steps, taught by doing

Rules: one verb at a time, one line of at most 8 words on the objective line, and one amber rim on the thing itself. The
ghost hand appears only after 4 s without input. No modal and no OK button. Nothing pauses. It cannot be failed.

| Step | Where | Line | Done when | Fallback |
|---|---|---|---|---|
| **1. TAP** | The adit plug at the surface, a 7-cell face of soil and roots; the centre cell is rimmed | "Tap the rock" | The first cell breaks (HP 100, damage 100: the first tap always breaks) | After 4 s the ghost hand taps it |
| **2. TAP THE LIGHT** | The breach of drift 1 leaks dusk light; then, in Chamber 1, the chest in the lantern pool; then the exit | "Tap the light" / "Tap the chest" / "Go deeper" | Breakthrough, then the chest opened, then the ride taken | The rim brightens again after 6 s; the Shovel Hand taps the chest after 10 s |
| **3. HOLD** | Face 2 | "Hold to keep digging" | 2 s of hold | Shown after 6 taps; a static ring on the face, never a pulsing donut |

Everything after that (Pick card, crew card, fork, relic ring, lantern, Dynamite, seal, auto-delve) arrives as a goal line
plus a 2.5 s first-time card, the moment it first matters (§7).

---

## 3. Camera

### 3.1 The lens and its rules

| Parameter | Value |
|---|---|
| Projection | Rectilinear. **Horizontal FOV locked at 52°**, which is about a 25 mm full-frame lens held in portrait. Vertical: 93.1° at 390 × 844, 90.1° at 360 × 740, 94.6° at 412 × 915. Uses `lockedVerticalFov` from v1 |
| Eye | 1.60 m above the floor (1.45 m in low drifts, never below 1.2 m). Near plane 0.08 m; rock is kept ≥ 0.5 m from the eye; walls closer than 0.7 m darken their facets rather than clip |
| Pitch | **Drift −8°** (vanishing point at 43 % from the top). **Chamber 0°** (−4° in low chambers, +4° in tall ones). **Way Down** −15 to −25°. **Seal** −2° (−35° for floor hatches). **Vista** +12°, raised over 1.2 s after arrival and lowered on the next tap |
| Roll, head bob, sway, breathing | **None, ever, on the world camera** |
| Follow | No player-driven look. The camera is authored per shot: still at a stand; following the face during the creep with a critically damped spring (standoff 4.25 m, speed cap 2.5 m/s); riding authored polylines between stands (`ropeRide.ts`: constant acceleration, arc length never runs backwards) |
| Taps | **The camera does not move on a tap.** The tool, the cell, the sound and a 8–15 ms haptic carry the hit |
| Shake | Only structural events: a seal breaking, Dynamite, a vault door. At most 0.4° rotational, ≤ 120 ms, one decaying oscillation, no translation. Off with the shake setting |
| Moves | Rotate first (≤ 0.30 s, ≤ 35° yaw, ease-out), then translate (≤ 2.5 m/s, trapezoid ease). Never a large rotation during a translation. FOV constant |
| Reduced motion | Every glide and ride becomes a 0.25 s cross-fade; the creep becomes a 0.2 s fade step; no shake; no Vista pitch |
| Viewmodel | Its own camera and pass (vertical FOV 58°, depth cleared, drawn before the HUD). **Lantern lower left, tool lower right** (a mirror setting swaps them for left-handed players). Together ≤ 12 % of the screen; nothing in the central 50 % column; perfectly still at rest; still during glides (the static comfort anchor) |
| Strike pose | No wind-up: frame 0 snaps to the contact pose (L1), then a 220 ms recovery. At > 2.6 taps/s each tap restarts from the current pose (flurry) |

### 3.2 The seven shots

| Shot | When | Composition | Motion |
|---|---|---|---|
| **Drift** | 55–65 % of play time (est.) | Face at 4.25 m filling the middle band; timber sets every 2.5 m converging overhead; rails and sleepers below; the lantern pool on the floor | **Creep** 1 m in 0.55 s after each slice (peak 2.33 m/s). If rows clear faster than 0.55 s the spring lets the standoff grow to 6 m; beyond that the drift becomes a **Bore** (§5.8) |
| **Breakthrough** | The last slice crumbles | The window shot: the dark drift frame is 30–40 % of the screen, the lit chamber in the middle, the chamber's light on the far plane | The wall falls inward (10–16 large shards, 0.6 s) while light spills through. Then a glide of 3.5 m in 1.6 s to the stand (the camera creeps to a 3.0 m standoff for the breach slice) |
| **Chamber** | Arrival, harvest | The diorama in §3.3 | Still. Optional **deep stand**: tap its marker for one glide of ≤ 1.2 s to a second stand (a relic across a bridge, a vault door) and back |
| **Focus** | Chest, relic, geode, note, depot, Royal Chest | The object centred at 1.3 m, the world beyond dimmed 30 % through the grade (not a post effect); the lantern key stays | In: ≤ 2.0 m of travel and ≤ 25° of rotation in 0.35 s, ease-out. Out: 0.3 s |
| **Way Down** | Tap an exit | Looking down the stair, ladder, chute or cage toward the crew's lamps at the next face | Rotate ≤ 0.3 s, then ride ≤ 6 m of path in 1.4–2.4 s; vertical ≤ 1.5 m/s; it ends at the drift stand. Dressed so it is never empty: a Halden sign, a lamp, a cart passing |
| **Seal** | The last chamber of a biome | The mechanism fills the middle band; light from the next biome leaks through its seams | Still. One 0.4° / 120 ms shake when it breaks; the reveal follows |
| **Vista / Reveal** | The first chamber after a seal (the **Threshold**), and one **Vista** about 35 % into each biome | The window composition: dark arch frame, lit middle ground, the biome's glowing far plane; real geometry within the 64 × 64 m footprint, no billboard cards | The only slow pitch-up (+12° over 1.2 s). The biome title is carved in light for 1.6 s. Total ≤ 3 s, skippable |

A sixth kind of ride exists for charted ground and the Head Start: the **Hoist**. You stand in a cage whose bars are the
static frame. Lamps on the shaft wall pass at ≤ 3 per second whatever the true speed, while the depth counter rolls at the
true rate (§5.4, §5.7).

**Motion budget per node (est.):**
- breakthrough glide 1.6 s;
- Way Down 1.4–2.4 s;
- creep 0.55 s × K.

That is about 12–18 % of play time with the camera moving, all of it predictable, straight-line and slow.

### 3.3 Framing in portrait (390 × 844 CSS px; same proportions at any size)

The figures below are computed for the lens of §3.1, with the screen-y rows measured from the top.

**Drift shot** (pitch −8°; the face at 4.25 m; a 7-cell hexagonal rosette with cells of about 1.0 m, about 94 px each):

```
y=0    ┌──────────────────────────────────────┐
       │  drift ceiling in the dark (notch 47)│
y=47   │ [42 m · Topsoil]  [◉ 12.3K]      [≡] │ top band, row A (40 px)
y=87   │ ▸ Break through · 3 m  ▮▮▯▯▯     ◆  │ row B: the objective (36 px)
y=123  ├──────────────────────────────────────┤
       │ timber cap, a lamp on it; crew lamps │ frame layer: dark, cool
y=204  │ ╲ ceiling meets the face            ╱│
y=241  │      ╱‾‾‾‾╲╱‾‾‾‾╲                    │
       │    ╱  c0  ╳  c1  ╲   Shovel Hand ▸ │ THE FACE: the 7-cell rosette,
       │   │  c5  │ c3  │ c2 │              │ y 241–498 (30 % of the height),
       │    ╲  c6  ╳  c4  ╱                  │ ≈ 282 px wide (72 % of the width).
       │      ╲____╱╲____╱                   │ The brightest area of the frame.
y=498  │                                      │
       │ rails, sleepers every 0.6 m; cart    │ floor band (3 m → 4 m)
y=600  │ the lantern's ring pool on the floor │ the loot tumbles here
       │ 🏮 lantern                 tool ⛏   │ viewmodel, y 620–790, ≤ 12 % area
y=751  ├──────────────────────────────────────┤
       │ [Pick ▮▮▮▯ 1.2K] [BEST · Pick Crew] [✶]│ bottom band: cards (58 px)
y=810  │            (home indicator, 34)      │
y=844  └──────────────────────────────────────┘
```

- Cell c3 is the model's `CENTRE_COL`, where chests sit.
- The other six cells map to columns 0–2 and 4–6, clockwise from the upper left.
- Crew rigs and machines live in the thin ring between the rosette and the tunnel walls (≈ 0.55 m each side at 4.25 m) and
  in the ceiling band. They never cover a cell.
- When pierce digs one cell 1–2 m deeper than its neighbours, the face shows a hole. That is real depth and it reads well.

**Chamber shot** (pitch 0°; the stand 0.5 m inside the breach; vanishing point at 50 %):

```
y=0    ┌──────────────────────────────────────┐
       │ the vault: root curtains, a crystal  │ the chamber's wonder feature
       │ chandelier, a sky shaft (the ceiling)│ (8–14 m up, slow ambient light)
y=123  ├── top band ───────────────────────────┤
       │      ledge at 5 m: gem cluster ◇     │ y 150–260 (18–30 %)
       │                                      │
y=282  │▒vein▒                       ▒vein▒  │ side veins at 4 m, x 20–90 / 300–370
y=344  │▒ L  ▒   ┌── exit arch, 7 m ──┐ ▒ R ▒  │ y 344–513: exits, far wall, and the
       │▒    ▒   │ [▣ Next ▮▮▯ · ore] │ ▒   ▒  │ next glint in the dark beyond
y=482  │▒▒▒▒▒▒   └────────────────────┘ ▒▒▒▒▒  │
y=513  │                                      │
       │       chest in the lantern pool ▣    │ floor at 3.5 m: y 560–610 (66–72 %)
       │ 🏮                           ⛏      │
y=751  ├── bottom band ────────────────────────┤
y=844  └──────────────────────────────────────┘
```

- Every tappable sits in the central 15–70 % of the height (lens stretch ≤ 1.3×) and within 6 m of the stand.
- Big tappables carry the room: a 2 m vein is ≈ 100 px at 8 m, a chest 0.9 m wide is ≈ 100 px at 3.5 m.
- The smallest tappable projects to ≥ 56 px.

### 3.4 What is on screen during play

| Band | Content | Size |
|---|---|---|
| Top, row A | Depth plate (depth + biome name, small), gold plate, ≡ | 40 px below the 47 px safe inset |
| Top, row B | **The objective line** (§6): icon, one line ≤ 32 characters, a 4 px fill, a reward icon | 36 px |
| World | The 3D view, full-bleed behind every band, including under the notch and the home indicator | everything else |
| Bottom | **Pick** card and **BEST** card (each a progress bar; price in 13 sp); from 30 m one round skill plate (cooldown ring, no number) | 58 px + 34 px safe |
| Viewmodel | Lantern lower left, tool lower right | ≤ 12 % of area |
| Transient | One floating haul number at most (a cart delivering), one first-time card under the objective line (2.5 s), one hint rim in the world | — |

**HUD rules:**
- Plates cover ≤ 17 % of the screen area: 76 px at the top and 58 px at the bottom, gaps between plates included.
- **Numbers visible:** depth, gold, one number in the objective, and the two card prices, so **5**. Rate (+45/s) shows under
  gold for 3 s after a purchase or on return.
- No combo counter, no damage numbers (an accessibility option adds one accumulating number per target), no depth ruler
  strip. The Chart replaces the ruler (§5.3).

---

## 4. World structure

### 4.1 The chart: a graph laid on the depth axis

- **The trunk.** The model's depth axis (1 slice = 1 m) is the trunk. Every metre of the descent is one slice of one drift.
- **Nodes.** Chambers sit between drifts.
  - A **fork** chamber has two exits, and two **roads** of 2–3 chambers each run in parallel to a **confluence** chamber.
  - Both roads have the same number of slices, so depth stays one number.
  - The roads differ in what their chambers hold.
- **Two seeds.**
  - The **layout** (chamber kits, shapes, forks, landmarks, secrets' positions, vaults) comes from a **lifetime world seed**:
    a chamber you have seen stays the same chamber, and is **charted**.
  - The **loot** (vein kinds, chest tiers, relic rolls, events) comes from the run seed. The model's `rowKinds(runSeed, d)`
    gets a road salt: `rowKinds(runSeed ^ road, d)`.
- **First sight is the player's** (law L10, generalised). The crew never breaks the breach of an **uncharted** chamber and
  never opens an unopened seal. Charted ground can be dug through by the crew, offline included.

### 4.2 Node anatomy

| Part | What it is | Numbers |
|---|---|---|
| Face | The 7-cell rosette at the head of a drift; one slice = one model row = 1 m | cells ≈ 1.0 m, ≈ 94 px at 4.25 m |
| Drift | K slices of tunnel, declining 1:6, 3.4 m wide and 3.2 m tall; timber sets every 2.5 m; a lamp every 8–12 m (hung by the crew behind you) | K per biome (§4.3) |
| Breach | The last slice of a drift into an uncharted chamber. Its cracks leak light **in the colour of the chamber's promise** (§8.4); the chamber's sound leaks too (water, hum, wind, a chime) | the crew stops one slice short |
| Chamber | A curated diorama: 10–18 m wide, 8–16 m deep, 6–14 m tall; a stand 0.5 m inside the breach; 4–6 tappables within 6 m; 1–2 exits within 5 m | harvest 8–20 s (est.) |
| Exit (Way Down) | A stair, ladder, chute, ramp or cage that drops 60–80 % of the node's K metres, ending at the next face | ride 1.4–2.4 s |
| Works | Every chamber behind you. The crew moves in, hangs a lamp and works the leftover veins when it is blocked | haul at the seam's average gold per damage |

### 4.3 Drift length per biome

**Rule:** K is set so a drift takes 10–30 s at the median row time a player meets in that biome over the first three days.
That gives a chamber every 25–50 s. The table holds the starting values; the node-paced sim tunes them.

| # | Biome | Depth (m) | K (slices) | Chambers (about) |
|---|---|---|---|---|
| 0 | Topsoil Roots | 0–39 | 5 | 8 (authored) |
| 1 | Glowroot Caverns | 40–119 | 6 | 13 |
| 2 | Crystal Grotto | 120–239 | 8 | 15 |
| 3 | Halden Works | 240–399 | 10 | 16 |
| 4 | Fungal Deep | 400–599 | 12 | 17 |
| 5 | Drowned Ruins | 600–899 | 14 | 21 |
| 6 | Magma Veins | 900–1,299 | 16 | 25 |
| 7 | Fossil Halls | 1,300–1,799 | 18 | 28 |
| 8 | Frost Hollow | 1,800–2,399 | 20 | 30 |
| 9 | the Loom | 2,400–3,099 | 22 | 32 |
| 10 | Iron Core | 3,100–3,899 | 24 | 33 |
| 11 | Star Heart | 3,900–4,799 | 26 | 35 |
| 12 | Void Sea | 4,800–5,799 | 28 | 36 |
| 13 | the Gate | 5,800–6,899 | 30 | 37 |
| 14+ | Echo strata | +1,100 each | 30 | 37 |

### 4.4 Chamber types

Each type is rolled on the chart: the layout from the lifetime seed, the contents from the run seed, with pity floors. Every
type exists in every biome's kit.

| Type | Share | Holds (besides 2–3 veins) | Breach leak | Auto-delve stops? | Pity |
|---|---|---|---|---|---|
| Gallery | 46 % | loose nuggets, a cold lamp hook, dressing | biome fog only | no | — |
| Lode | 12 % | one large vein of rich ore (3–5 rich nuggets, gold ×4) | warm gold | no | — |
| Cache | 9 % | a chest (Wood floor, honest roll-up) and Halden crates | warm gold | yes | ≤ 6 chambers apart |
| Reliquary niche | 6 % | a relic on a plinth in an alcove | rune cyan | yes | ≤ 10 apart; ≥ 2 per biome |
| Geode pocket | 5 % | a geode in the wall: 3 strikes crack it, then the focus view and the Strike ring | violet-cyan sparkle | yes | ≤ 12 apart |
| Depot | 5 % | a Halden cart depot: tip the full cart for 60 s of crew output, or +5 levels on an owned line | brass lamp | yes | — |
| Fork | 8 % (from Glowroot; one authored in Topsoil) | two exits with lit promises | the brighter of the two | yes | ≤ 6 apart |
| Halden camp | 4 % | a note or mural (Lore), a planted-lantern hook, rank XP | warm low amber | yes (note) | ≥ 3 notes per biome |
| Collapse | 2 % | loose rubble: the next drift is HP ×0.3 (a fast run) | dust-grey | no | — |
| Confluence | (follows a fork) | where roads rejoin; often a Pulse hint | per contents | per contents | — |
| **Vista** | 1 per biome, at about 35 % | the biome's Wonder (§4.9), a Royal Chest (10-gem key), a relic shrine, a mural | the biome's far light | yes (first time) | authored |
| **Threshold** | the first chamber after a seal | the reveal composition | the next biome's light through the seal | yes (first time) | authored |
| **Seal hall** | the last chamber of a biome | the mechanism at its exit (§5.1) | the next biome's light | yes | authored |
| **Vault** | 1 per biome from Glowroot, behind a secret passage | a sealed Halden vault: a Reliquary-floor chest, a relic, a mural | (hidden) | yes | authored |

**Anti-repetition:**
- The same template never repeats within 4 chambers.
- Each biome runs 3–4 sub-zones (for example Glowroot: root cellars → glow galleries → the Rootheart → deep roots), and each
  sub-zone changes the dressing, the shape (dome, hall, rift, gallery) and the light.
- Roads differ in sub-zone too.

### 4.5 Roads (the cure for "too linear")

- **Rhythm:** a fork every 4–6 chambers from Glowroot on. The roads rejoin after 2–3 chambers. In Topsoil there is one
  authored fork at 20 m, to teach it.
- **The promise is shown before you choose:**
  - on each exit's octagon plate, as an icon: ore, relic, depot, or "?" for a secret;
  - by the light beyond each exit, in the promise colour.
- **The promise is always true.** Roads differ in content, never in depth.

| Road | Its 2–3 chambers lean toward | Bounded by |
|---|---|---|
| **Vein Road** (amber-gold) | lodes and golden cells (a Golden Vein in the next drift) | rock gold lowered so the cell mix stays ≤ ×1.25 |
| **Builders' Road** (rune cyan) | a reliquary niche, a Halden note, a secret | the Find drop table |
| **Works Road** (brass) | a depot, a crew blueprint early, free crew levels | ≤ 10 free levels a road |
| **Unknown** (violet, rare, only after a Pulse) | a vault | 1 per biome |

- **No wrong answer, no backtracking.** The other road becomes a charted "road not taken". It shows on the Chart, and
  re-climbs can take it.
- **Memory.** Auto-delve takes your last choice at a charted fork unless you tap.

### 4.6 Secrets and the Lantern Pulse

- **The meter.** The model's Surge meter now lives in the lantern: the flame grows. It fills by 1 per tap and 4 per crit, to
  240 (≈ 44 s of tapping at 5/s). **It waits when full.** A full lantern breathes slowly, and that is the one UI loop
  allowed.
- **The Pulse.** Tap the lantern: it rises 300 ms, and a ring of warm light rolls out at 8 m/s to 12 m (1.5 s). Then:
  - **In a chamber:** hidden things in reach light up as the ring passes, and stay revealed:
    - a hidden vein (rich, ×3 a normal vein);
    - a Halden stash behind roots or bricks (Copper-floor chest);
    - a hidden passage outline carved in cyan builders' script, leading to a Vault or an Unknown road;
    - a mural.
  - **In a drift:** the next 3 slices' riches glint through the rock (ore, a chest, a gem) for the Surge's duration.
  - **Everywhere:** Surge ×3 on taps for 10 s (+1 s per Bellows level), hold at 10/s, the lantern radius ×1.6.
    - The light does the work: no screen-edge glow, no bloom pulse.
- **The decision.** Spend it now on ×3 digging, or carry it to a chamber with a hint.
- **Hints.** A chamber holding a secret shows a **draft**: 6 lit motes drifting toward a seam in the wall, plus a faint
  breath of cold air in the sound. One secret in about 3 chambers (pity: ≤ 5 apart). A secret needing a better lantern says
  so in place: "Answers only a Storm Lantern" (§5.2).

### 4.7 Descent geometry (fits `RingWorld`)

- **Footprint.** The trunk spirals down inside the 64 × 64 m ring footprint, turning 90° at most chambers: about 4–6 nodes
  per loop, each node 15–30 m of path.
- **Where the depth comes from.** Each node drops its K metres: about 20–40 % along the drift's 1:6 decline, and the rest on
  the Way Down.
- **Roads.** Forks split into two parallel spirals of the same depth. The chart generator guarantees that no volumes overlap
  and that every stand's frustum is clear.
- **Large spaces.**
  - Vistas use up to 48 × 40 × 60 m of real geometry, within the 64 m footprint and the 160-row window.
  - Their far planes are lit real rock with fog toward the biome colour.
  - `VistaBackdrop` cards are not used.
- **Stamping.** Chamber and drift stamping replaces slab passes 4–9 (the cutaway's shaft, cut face and plaques). Passes 1–3
  (biome per row, strata, veins) stay. The model and the world agree cell for cell, because the face cells are stamped from
  `rowKinds`.

### 4.8 How caverns stay full (the fill contract, checked from every stand)

A generator test renders each stand's frustum on the first two cycles of the chart (the `fill-scan` idea, re-aimed from the
cut face to the camera).

| Rule | Minimum |
|---|---|
| Tappables in frame on arrival | ≥ 4 in a chamber; in a drift, the face itself (≥ 1 special cell in any 4 slices) |
| Light | ≥ 1 warm practical (amber, the human light) and ≥ 1 accent emitter in the biome's key per stand |
| Wonder | ≥ 1 hero dressing feature per chamber (root chandelier, crystal spire, gear wall…) from the biome kit |
| Floor | ≤ 35 % of the floor within 6 m farther than 2 m from any prop or tappable |
| Clear | Nothing decorative in front of a tappable or the face; clear air 1.5 m around the face |
| Tease | The next chamber's promise leaks through the breach in the last 2 slices |
| Rhythm | A tappable reward in view at all times; the Director's find guarantee (10 s, SPEC §7.2) and boredom breaker (25 s) still run |
| Wall cover | Veins or crystals cover ≥ 8 % of the visible wall faces |

### 4.9 The 14 biomes as node kits

These are creature-free. Ambient life (moths in Glowroot, spores in Fungal) is decoration only.

| # | Biome | Chamber kit (shape language) | Way Down | Wonder (Threshold → Vista) | Seal mechanism (its weak point) | Secret flavour |
|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | root cellars, timber galleries, tumbled boulders | rope ladders, timber stairs | the first sky shaft: dusk light falling into the Root Cellar | **Halden Hatch**, a timber floor hatch with chains (the padlock) | stashes behind roots |
| 1 | Glowroot Caverns | rounded halls, root curtains that brighten as your lantern passes | root chutes, root stairs | the Rootheart, an 18 m glowing root tangle seen from a root balcony | **Root Knot** (three knots light in turn) | passages behind root curtains |
| 2 | Crystal Grotto | angular rifts, crystal clusters 1–3 m | crystal ledges | the Hand in the Crystal: a 20 m crystal with a human outline inside | **Prism Lock** (facets glint clockwise) | geodes, mirrored niches |
| 3 | Halden Works | built halls: beams, gears, rails, offices | hoist cages, rail inclines | the Crusher Hall: 12 m gear wheels under the hoist tower | **the Crusher** (the pressure valve) | the foreman's safe |
| 4 | Fungal Deep | domes of caps on stems, shelf fungi | shelf-fungus steps | the Mother Cap: a 60 m mushroom, gills glowing from below | **Spore Valve**, a Halden valve in a mycelium wall (its wheels pulse in turn) | lanterns overgrown, still lit |
| 5 | Drowned Ruins | stepped masonry, arches, still water | sunken stairs | the Drowned Procession: statues carrying lanterns into the water; the Ember Shrine | **Drowned Bell** (the clapper on each toll) | dry rooms behind flooded doors |
| 6 | Magma Veins | cracked basalt columns, an underlight from below | basalt steps, a chain bridge | the Forge of the Bearers: a 15 m anvil over a lava river | **Forge-Heart** in an obsidian cage (cooling cracks) | cooled lava tubes |
| 7 | Fossil Halls | ribs, arcs, vertebrae | rib ramps | the Leviathan's ribcage, a lantern hung in its eye socket | **Bone Organ**, pipes of fossil bone (the pipe that sounds) | resin-sealed niches |
| 8 | Frost Hollow | big flat ice facets, icicles | ice steps (slow, eased) | the Frozen Waterfall; a Halden crew frozen mid-step, lamps raised | **Ice Lock-Wheel** (its teeth) | light through an ice ceiling |
| 9 | the Loom | woven lines, shelves, looms | shelf-stairs | the Archive of Light: shelves of identical crystals | **Thread Lock** (knots of light) | hidden reading rooms |
| 10 | Iron Core | heavy plates, giant gears | gear lifts | the Loom's Heart, a beating lodestone (Weave) | **the Escapement**, a world-clock (the tooth at 12) | maintenance crawlways |
| 11 | Star Heart | floating rocks, radial forms | glides between islands | the Buried Star: a 12 m sun among floating rocks | **Astral Geode** (stars brighten in turn) | inner skies in geodes |
| 12 | Void Sea | almost nothing: islands | upward falls (down is up) | the Upward Falls and the Watcher, an aurora that turns toward your lantern | **Mirror Gate** (it copies your last tapped cell) | islands seen only in the Pulse |
| 13 | the Gate | the Lintel's architecture, rune pillars | the great stair | the Last Gate, open from the other side | **the Last Lintel** (the flame core) | the Black Stone (Breach) |

### 4.10 The discovery ladder (wonder pacing)

| Scale | What surprises you | Frequency (run 1, est.) |
|---|---|---|
| Strike | crit (5 %+), the cell's kind (ore 10 %, rich 4 %, rare 1 %) | every 0.2–0.3 s |
| Slice | the next slice's cells come into view, pierce holes, chest cells (every 25 m on the centre cell) | every 1.4–3.6 s |
| Breach | the leak colour: what is the next chamber? | every 25–50 s |
| Chamber | the room itself: its shape, its wonder, its feature, maybe a secret's draft | every 25–50 s |
| Road | the choice, and the road not taken | every 2.5–4 min |
| Secret | a passage, a vault, a stash revealed by your own light | about 1 in 3 chambers; a vault per biome |
| Biome | seal, reveal, Threshold, then a Vista about 35 % in | 4–10 min early in run 1, 20–60 s on re-climbs |
| Mystery | the Other Lantern: a warm point always visible deep in the haze of every Vista, 600 m below your record; Halden notes; murals | every biome |

---

## 5. Loops, from the second to the week

### 5.0 The nested clocks

| Clock | Loop | Reward | Numbers (run 1, est.) |
|---|---|---|---|
| 0.25 s | strike | crack, chips, sound, a cell breaking every 1–4 taps | taps per cell p50 ≤ 4 (L3) |
| 1.4–3.6 s | slice | the crumble, 1 m, a pentatonic step, the creep | 7 cells; crumble at 5 |
| 0.5–5 s | purchase | Pick, BEST, gear; the world answers in the same frame | ≈ 200 in the first 10 min |
| 10–30 s | drift | the breach, the breakthrough | K = 5–30 |
| 25–50 s | chamber | harvest, feature, exits | 4–6 tappables |
| 40–70 s | event | the Director (§5.5) | never two at once |
| ≈ 45–60 s | lantern | the Pulse: a secret and Surge ×3 | 240 meter |
| 2.5–4 min | road | a fork, a promise, the confluence | every 4–6 chambers |
| 4–10 min | biome | seal, reveal, gear, a crew line, a Vista | 14 then Echo |
| 5–15 min | session | the return haul, contracts, daily chest, the hook "Root Knot in 4 chambers" | — |
| 40–50 min | run | Rekindle at the Ember Shrine (600 m) | Embers ×3.5 at 25 |
| days | layers | Weave (3,100 m), Breach (5,800 m), Echo strata, Feats, Codex pages, the Chart | — |

### 5.1 Core: strike → slice → drift → breakthrough → chamber

- **Strike** (the model's `tap.ts` resolution order, untouched).
  - Same frame: the tool snaps to contact, the struck facet brightens +0.4 for ≤ 80 ms, a crack stage appears, 4–8 lit stone
    chips fly, and the material's *tock* plays (pitched by kind) with an 8 ms haptic.
  - A break adds 6–9 large BSP shards falling into the lantern pool, ≤ 3 gold tokens flying to the counter (0.55 s; the
    counter rolls when they land, L8) and a 15 ms haptic.
  - **Combo** (×1 to ×2 at 50) is felt, not counted. At tiers 10, 25 and 50 the tool head's heat glow shifts (bone → amber →
    cyan) and the strike pitch rises.
- **Slice.** When 5 of 7 cells are down, the rest crack and fall (crumble, κ = 0.86). Then one note up the biome's
  pentatonic scale and the 1 m creep.
- **Drift.** K slices. In the last 2 slices the promise leaks through the cracks. The objective line counts down
  ("Break through · 2 m").
- **Breakthrough** (the most frequent ceremony, so it is cheap and short):
  - the wall falls inward as 10–16 shards (0.6 s) while light spills;
  - a 35 ms haptic and an air-rush sound, then the chamber's ambience;
  - the glide in (1.6 s);
  - no shake, no flash, no post effect;
  - total ≤ 1.2 s of FX, plus the glide.
- **Chamber.** Harvest by tap or hold. Each strike-type tappable takes 1–5 taps.
  - **Chamber gold.** A chamber holds about 10 cell-equivalents of HP (knob `CHAMBER_EQ`, range 8–14) at 2.5–8 gold per
    damage. That is about 3–6 rows of face gold, which makes **harvesting ≈ 3× richer per tap than the face but adds no
    depth**.
  - **Face = depth, chamber = gold.** That is the decision on every node, with no wrong answer, because the crew digs the
    next drift meanwhile.
  - **Specials** are priced like the model's chests and Finds (seconds of income, gems, Find rolls).
- **Seal** (SPEC §7.1, Wardens recast as mechanisms):
  - **First time:** 30 s, with HP = 20 s × (crew DPS + 4 × tap) and ×0.5 for the Hatch.
    - The weak point lights every 5 s for 1 s (×5 damage).
    - At 25 % HP a Strike finisher appears (×10 if perfect).
    - Win: the slab splits, the light floods in, then the reveal.
    - Fail: "The seal holds · 64 %". It keeps 50 % of the damage, and nothing is lost.
  - **Charted** seals break like a hard slice and show the biome title chip with your split time.
  - **Presentation:** the seal's HP and timer live inside the objective line, so the HUD does not grow.

### 5.2 Upgrades (in-run; the model's tables, shown in first person)

| Line | What you buy | What you *see* change |
|---|---|---|
| **Pick** (c0 30, r 1.20; ×2.5 every 25 levels) | damage `100 × L × 2.5^floor(L/25)` | Each level: the tool head brightens for 160 ms and the delta preview "+12 % → 1.42K / strike" rolls. Each **form** (lifetime milestones, `TOOL_FORMS`) is a new viewmodel: Rusty Pick → Copper → Iron → Steel → Gilded → Crystal → Obsidian → Mythril → Sunsteel → Thunder Maul → Plasma Pick → Comet Hammer → Star Breaker → Planet Cracker → Void Cleaver → **Lantern Edge I, II…**. The head is drawn partly off-frame from the Maul on; the viewmodel's area cap never moves |
| **Crew lines** (15 authored, then an Echo line every 1,100 m; ★ every 10 levels ×2; a crown every 50) | DPS | **Lines 0–2:** Shovel Hand, Pick Crew and Mine Cart work at the face edges and on the rail. **Lines 3–14:** machines frame the face, never covering a cell. Steam Drill: a gantry over c3. Blast Team: charges on 3 cells. Tunnel Borer: a rotating drum at the right edge. Crystal Resonator: forks on the walls. Magma Lance: a beam from the right. **Bone Ram** (was "Fossil Golem"). Rime Auger. Loom Weaver: threads of light. Gravity Well. Star Forge. **Void Engine** (was "Void Maw"). Gate Engine: a ring of rune gears around the face, a lintel of machinery. **On screen:** the 1–2 highest lines show as rigs; lower lines show as a trail of their lamps glimmering back down the drift |
| **Gear** (4 one-shot cards per biome: Tools, Rigging, Edge, Lantern) | ×3, ×3, ×3 and ×2 | Each **Lantern** card owned is one **lantern tier**: Tin Lamp → Brass Lantern → Storm Lantern → Carbide Lamp → Crystal Lamp → Ember Lantern (after the first Rekindle) → Thread Lantern (after a Weave) → Sunstone → … Its flame, radius (+0.6 m a tier) and warmth change. **Secrets gate on the tier** (The Forge's visible thresholds): "Answers only a Storm Lantern" |
| **Rally, Lucky Strike, Shockwave, Steady Hand, Bellows** | the model's dig upgrades | Steady Hand speeds up the hold; Bellows lengthens the Pulse; Shockwave is visible as cracks running to neighbour cells |
| **Skills** (Dynamite 30 m, Gold Rush 180 m, Overdrive 320 m, Earthquake 600 m) | the model's actives | Dynamite: three charges planted on the face, a fuse, a boom (the one allowed 0.4° shake), 3 slices gone, a 3 m creep in 1.2 s |

**Buying stays two steps at most.** The two cards are one tap. Everything else is ≡ → sheet → card (two taps after the sheet
opens on the last-used tab). Cards are their own progress bars. BEST follows the payback rule
`cost/Δincome + max(0, cost − gold)/income`. NEXT ★ is the default buy mode after the first ★, and hold-to-buy plays the
rising arpeggio (SPEC §5.5).

### 5.3 Collection: a Codex of objects, relics with traits, and the Chart

- **Codex** (creatures purged): per biome, **6 Finds** (2 minerals, 2 fossils, 2 relics) and **5 Lore** (3 Halden notes,
  1 mural, 1 seal card). That makes 11 entries per biome and 154 across the 14 biomes, plus shiny Echo variants.
  - A complete page grants a **Biome Seal** (+10 % gold, +10 % power).
  - A Codex chest comes every 10 entries.
  - Each Find gives +3 % to one stat of its biome, and every duplicate adds +1 % with no cap.
- **Relics roll traits:**

  | Trait | Values |
  |---|---|
  | Era | Halden, Drowned, Loom, Star |
  | Condition (graded by the ring) | Worn, Sound, Fine, Pristine, Perfect |
  | Variant | Gilded (1 in 20), Star-touched (1 in 200, after Star Heart is reached) |

  - **The ring.** In the focus view, hold on the relic: a brass ring closes from 1.6× to 1.0× over 0.9 s. Release inside the
    gold band (the last 8 %) for Perfect, the next 12 % for Pristine, 25 % for Fine, else Sound. No release within 2 s gives
    Worn.
  - A better grade replaces a worse one (+1 % per grade step).
  - **There is never a loss:** a Worn relic is still the Find.
  - **The first find** of each object is a 0.6 s turntable of its real 3D model in the focus view, with a NEW stamp. It is a
    model, not a sprite.
- **The Chart** (it replaces the Depth Ruler and the Ladder; opened by tapping the depth plate) is a vertical node map of the
  descent:
  - biome bands in their palettes, split times;
  - chambers as octagon dots, charted (brass) or not (dark "?");
  - roads as branches, with "roads not taken";
  - secrets as cyan stars, vaults in violet, the next seal with its mechanism icon;
  - planted lanterns, the ghost lantern, and at the bottom the Other Lantern's dot ("−612 m").
  - Per-biome chart completion (every chamber, both roads, every secret, the vault) pays gems and Feats, not a multiplier,
    to respect the side-multiplier budget (≤ ×10 by day 3).

### 5.4 Idle and camp

- **The crew digs where you see it.**
  - In a drift, its strikes land on the outer cells on their impact frames, so the screen and the numbers agree.
  - In a chamber, it is already at the next face. You see its lamps down the Way Down, and the exit plate shows
    "Next ▮▮▯".
- **The breach rule.** Crew damage never touches the breach row of an uncharted chamber, or an unopened seal. Overflow
  becomes **Works haul**: gold at 1.00 gold per damage (the face's average), delivered by mine cart every ≈ 6 s as one
  floating number. Before you own carts it goes straight into the gold rate.
- **Strong crews change the game.** You arrive at a ready breach, one tap breaks through, and the node rhythm becomes
  chamber → ride → tap → chamber. Power turns digging into exploring.
- **Offline** (`offline.ts` keeps its exact closed form, with one more stop):

  | Rule | Value |
  |---|---|
  | Starts after the app is hidden for | 30 s |
  | Efficiency | 50 % → 75 % at 250 Embers → 100 % at 1e5 Embers or with Night Shift |
  | Cap | 3 h → 6 h at 25 Embers → 12 h at 250 Embers → +2 h per Night Shift level |
  | Charted ground (re-climbs below your record) | the crew digs on through drifts and chambers; their chests go to the **Haul Crate** (holds 10; the rest become gold); their relics stay in place for you |
  | Uncharted ground (always in run 1) | the crew digs to the next breach and waits there; the remaining time is Works haul |
  | Never | an unopened seal, an uncharted breach, events, the Pulse |

- **The return:**
  - 0.24 s fade-in at the breach, where the crew waits with lamps raised;
  - in charted ground, a ≤ 3 s Hoist or return ride through what they cleared (any tap skips);
  - the opaque plate: "While you were away · 4 h 12 m — the crew worked the old galleries: +4.2e15 gold · 2 chests in the
    crate · they wait at the breach";
  - **Collect**: tokens fly for ≤ 1.2 s, the crate opens one chest per tap, then "Spend your haul" lights BEST.
  - Within 5 s the Director deals a Drifting Ember or a Supply Rope.
- **The camp.**
  - **The menu is a first-person view** of the Halden camp at the adit mouth: dusk on first launch, dawn after a Rekindle.
  - It grows with lifetime Embers: tents and winch → timber headframe → stone lift tower → brass lantern tower → the
    Lighthouse → the Lantern City on the horizon.
  - Tap the adit to descend; the Head Start rides the Hoist.

### 5.5 Events (the Director: U(40, 70) s of active play, deck rules, pity, idle-friendly; creatures purged)

| Event | Unlock | Staged in first person | Verb | Reward |
|---|---|---|---|---|
| **Drifting Ember** (replaces the Lucky Moth) | scripted at about 6:20, then every 90–180 s | an ember drifts across the chamber or drift in 7 s, lit, leaving no trail | tap once | Gold Shower (60 s of income) 55 %, Ember Frenzy (×7 for 20 s) 20 %, 3 gems 15 %, skill refresh 10 % |
| Golden Vein | 30 m | 3 cells per slice turn gold leaf for the next 5 slices | dig | ×20 gold |
| Glimmerfall | 40 m | crystals fall from the chamber vault through the lantern pool | catch 5–9 | 3 s of income each; 1 in 5 is a gem |
| **Rattling Bricks** (replaces the Treasure Mole) | 80 m | a Halden stash: bricks loosen one by one in the wall | tap each loose brick (3–5) | Copper-floor chest |
| Cave-in | 120 m | boulders drop in the drift ahead, then settle | tap 3–5 (1–3 taps each) | 10 s of income each; leftovers become boulder cells (×3 HP, ×3 gold) |
| Supply Rope | 180 m | a crate is lowered on a rope down a shaft | tap, then pick 1 of 3 boosts | 60 s boost |
| **Runaway Cart** (replaces the Mimic) | 240 m | a loose ore cart careens down the rail | tap it 5 times to brake it | Crystal-floor chest |
| Treasure Map | 320 m | chalk marks on the face: a chest 6 slices in | dig to it | Crystal-floor chest |
| Ancient Echo | 400 m | runes on the chamber wall light in order | Sequence | Lore and 10 gems |
| Geode | rare cell from 120 m | a cracked geode in the face or a wall | 3 needles (Strike) | gems and a Find roll |
| Biome signature | per biome | Root Pull, Glowroot Bloom (replaces Moth Swarm: root nodes light in turn), Crystal Bloom, Pressure Valves, Spore Burst, Pearl Bubbles, Lava Surge, Bone Rattle, Ice Shatter, Thread Weave, Gear Lock, Star Fall, Gravity Flip, Rune Lock | its widget | 60 s of income and a Find roll |

**Rules:**
- Every event is skippable, nothing is lost if it is ignored, and none ever blocks digging.
- Its objects are lit by the scene and obey the FX budget (§8.6).

### 5.6 Achievements, rank, records

- **Feats.** 20 families with tiers I–X, then endless; +1 Mark (+1 %) per tier; gems 5 × min(tier, 10).
  - Purged: **Kindred** becomes **Cartographer** (chambers charted: 10, 50, 150, 400, 1K, 2.5K, 5K, 10K, 25K, 50K; tier X
    perk: forks offer 3 roads).
  - Lockpick counts chests and vaults; Wonderstruck counts events and secrets.
  - **Secret feats** (the creature one replaced): Moth Friend becomes **Through the Dark** (find a vault). New: **Full Sweep**
    (harvest a whole chamber before the crew reaches it, 10 times) and **First Light** (break 100 breaches).
- **Rank.** It never resets. XP comes from everything (SPEC §7.7) plus a chamber entered (5), a secret (25), a road chosen
  (10) and a vault (100).
- **Records and ghosts.**
  - Records: splits per biome, fastest to 600 m, biggest hit, best relic grade.
  - **The ghost lantern:** a pale-blue glow in the chamber your previous run had reached at the same run time, with a chip
    "+2 chambers ahead".
  - **Planted lanterns:** hung in the chamber where each Rekindle ended. Tap one as you pass for +2 % damage for the run.

### 5.7 Prestige (the model's three layers, staged in first person)

- **Rekindle** (the Ember Shrine, a shrine chamber in the Drowned Ruins at 600 m):
  - `EmbersTotal(R) = floor(25 × 2^((R − 600)/200))`; each Ember is +10 % damage.
  - The sheet offers one big Rekindle button with a 0.6 s hold.
  - **The ceremony** (≤ 1.2 s, then the ride):
    - your lantern is raised to the shrine's old flame and becomes the Ember Lantern;
    - the Hoist ride goes up (2 s);
    - you arrive at the camp at dawn, grown;
    - the Head Start rides the Hoist down to 10 % of your record (from 100 Embers).
- **Weave** (the Loom's Heart, 3,100 m) and **Breach** (the Last Gate, 5,800 m; endless challenge tiers) as specified in the
  model.
- **Re-climbs pass charted ground.**
  - Auto-delve flies through charted chambers. A chest of Copper or better and an unopened relic still stop it.
  - Drifts that would clear in < 1.5 s become **Bores** (§5.8).
  - Uncharted chambers and roads not taken are new.

### 5.8 Démesure: how it gets absurd without getting noisy

**The verbs scale:**
- **Mid game.** A strike breaks a cell, then pierces a slice. From Pick tier 8 a strike on any vein **sweeps** the chamber:
  every strike-type tappable breaks in one 0.6 s cascade, nearest first.
- **Late game.** One strike **bores** a drift: a 0.3 s line of light runs through the rock to the breach, then a 0.25 s cut
  to the breach.
- **Very late.** A strike bores, sweeps and breaches in one gesture. The game becomes pure discovery: roads, secrets, relic
  grades, vaults and records.

**The world scales:**
- chambers grow with the Hollowed mutator;
- the machines framing the face grow: the Gate Engine's ring is a lintel 20 m across;
- the camp becomes a lantern city;
- numbers reach 1e2091 with letters (scientific notation beyond).

**What never scales:**
- the particle cap;
- the number of moving groups;
- the HUD size;
- the ceremony length.

**Quality, not quantity:** bigger and fewer shards, deeper sounds, a richer tool material, faster counter rolls.

### 5.9 The arc over a week (est., to be confirmed by the node-paced sim)

| When | What the player is doing |
|---|---|
| 0–10 min | tapping drifts, learning chambers, the first road, the first relic, the Hatch, the Glowroot reveal |
| 10–40 min | the Root Knot (≈ 12–14 min), Crystal Grotto, Halden Works; Mine Cart and Steam Drill frame the face; roads and secrets become the game |
| 40–50 min | the Ember Shrine and the first Rekindle; the camp gets its headframe |
| day 1 | 4–6 Rekindles; crews bore drifts before you arrive; Magma Veins and Fossil Halls; first vaults |
| day 2–3 | the first Weave; Frost Hollow, the Loom, Iron Core; chamber sweeps; Codex pages complete |
| week 1 | the Gate and Breach challenges; Echo strata with mutators; Cartographer and Lockpick tiers; relic grade hunting |

---

## 6. The objective, always shown

- **Where.** One line in the top band (row B), in every frame of play, including during sheets and ceremonies.
  - It shows an icon, ≤ 32 characters, a 4 px fill, a reward icon and an ETA when one is meaningful.
  - Its target in the world wears **the single amber rim**: a calm, static, constant-width edge on the object.
- **Selection** (re-evaluated every 0.5 s; the first match wins; it holds at least 4 s unless done; on completion the fill
  morphs to the next goal without emptying):
  1. a tutorial step;
  2. something to claim (the return haul, a finished Path step);
  3. a seal within 2 chambers: "Break the Root Knot · 2 chambers", which then becomes the fight's HP and timer;
  4. Rekindle or Weave recommended: "Rekindle: +273 Embers · ×6.5";
  5. a manual feature in this chamber: "Open the chest", "Read the note", "Choose a road";
  6. a ready Pulse with a draft in view: "Raise your lantern";
  7. the current **Path** step (SPEC §8.5, creature steps replaced by node steps) if its ETA ≤ 120 s or progress ≥ 50 %;
  8. the best near goal: the next ★, a gear card, a Feat tier, a contract, the next Rank;
  9. fallback: "Break through · N m" (always ≤ 30 s away in a drift) or "Go deeper" (in a harvested chamber).
- **Path changes** (30 authored steps): "Catch a creature" becomes **"Choose a road"**, "Catch the Lucky Moth" becomes
  **"Catch the ember"**, and new steps are "Break through", "Pulse the lantern", "Find a secret" and "Grade a relic Fine or
  better".
- **Hints** (one at a time, each at most 3 times in a lifetime, never over the face):
  - a still rim on the best target after 6 s without a tap;
  - BEST pings twice if it is affordable and unbought for 15 s;
  - a draft in view with a full lantern for 8 s;
  - nothing left in the chamber gives the exit rim.

---

## 7. Storyboard: the first 10 minutes on a phone

Times are design targets at 3–5 taps a second (est.). Depths follow §4.3 (Topsoil K = 5, Glowroot K = 6).

| Time | Depth | What the player sees and does | New | Objective line |
|---|---|---|---|---|
| 0:00 | surface | First launch skips the menu. Dusk at the Halden camp, in first person. The wordmark's lantern-O becomes the flame in your hand (0.9 s). Ahead, the timbered adit is blocked by a plug of soil and roots: the first face, its centre cell rimmed | lantern and Rusty Pick in view | "Tap the rock" |
| 0:03 | 0 m | One tap, one break: chips, a soft *tock*, one coin arcs to the gold plate, which drops in | gold | — |
| 0:08 | 1 m | 5 cells down, the rest crumble; the camera creeps 1 m; the depth plate drops in | depth | "Break through · 4 m" |
| 0:12 | 1 m | 30 gold: the Pick card rises, amber | Pick card | "Upgrade your pick" |
| 0:20 | 2 m | 50 gold: a crew card; hire the **Shovel Hand**, who walks in from behind at the left edge, his own small lamp swinging, and starts on the left cells | crew | "Hire a Shovel Hand" |
| 0:26 | 3 m | Two cells glint copper: "Copper: worth more" (2 s) | ore | — |
| 0:32 | 4 m | The last slice leaks dusk-blue light through its cracks; tutorial step 2 | breach | "Tap the light" |
| 0:36 | 5 m | **First breakthrough.** The wall falls inward, light spills, glide in. **Chamber 1, the Root Cellar:** a sky shaft lets dusk light fall through hanging roots onto Halden shelves; a Wood chest sits in your lantern pool, rimmed; amber root-knots glint on the left wall | chamber | "Tap the chest" |
| 0:42 | 5 m | Focus view: the lid opens, an honest roll-up Wood → **Copper**, 2 gems, gold | gems, focus | — |
| 0:50 | 5 m | Three amber knots on the wall, 2–3 taps each. Through the trapdoor you see the Shovel Hand's lamp already at the next face | harvest | "Tap what glints" |
| 1:00 | 5 m | The exit (a rope ladder down a hole) is rimmed. Tap: the Way Down ride (1.8 s) | ride | "Go deeper" |
| 1:05 | 6 m | Face 2, one slice already dug by the crew. After 6 taps: tutorial step 3. Hold: the pick swings 5 a second | hold | "Hold to keep digging" |
| 1:15 | 7 m | Shovel Hand level 10: the **first ★** (the card flips, "×2"); NEXT ★ becomes the buy mode | ★ | "Get a ★" |
| 1:25 | 10 m | **Chamber 2, the Copper Lode:** a broad copper vein across the right wall, a gem cluster on a ledge (the first gem) | lode | — |
| 1:55 | 15 m | **Chamber 3, the Halden Lamp Room:** a lamp still burning on a crate. Tap the note: "Day 40. Lamp seen below the lift. Nobody of ours is down there." The Codex appears (Lore) | lore, mystery | "Read the note" |
| 2:10 | 16 m | Pick Crew blueprint: two miners take the right edge, alternating swings | crew line 2 | "Hire the Pick Crew" |
| 2:40 | 20 m | Delver I Feat, Rank 2. **Chamber 4, the first Fork:** two exits. Left: amber glints beyond (Vein Road). Right: cyan chalk on the lintel (Builders' Road) | **roads** | "Choose a road" |
| 3:00 | 25 m | **Builders' Road, a Reliquary Niche:** a relic on a plinth. Focus, hold, the ring closes, release on gold: *Halden Compass · Fine*, a Find, 5 gems. (**Vein Road:** an Amber Gallery and a scripted Golden Vein) | relic, ring | "Grade the relic" |
| 3:25 | 30 m | Dynamite (one free charge): three charges on the face, a fuse, a boom (the first allowed shake), 3 m in one blow | skill | "Use Dynamite" |
| 3:35 | 30 m | **Chamber 6, the Confluence.** The lantern is full (pre-filled for the lesson) and a draft drifts toward the roots. Tap the lantern: a ring of warm light rolls out, a Halden stash glows behind the roots (Copper chest), and **Surge ×3** for 10 s | **Pulse**, secret | "Raise your lantern" |
| 3:55 | 35 m | **Chamber 7, the Lift Bottom:** the dead Halden hoist cage, chains, and green light leaking up between floorboards | the tease | "Break the Halden Hatch" |
| 4:05 | 39 m | **Seal 1, the Halden Hatch**, looking down at −35°: chains, a brass padlock, a 30 s ring in the objective line, the drum layer. The padlock glows every 5 s (×5). At 25 %, the Strike finisher | seal | "Break the hatch! 0:30" |
| 4:22 | 40 m | The hatch splits (60 ms hit-stop, the 0.4° shake). The planks fall away into green light, and the camera drops 3 m in 1.0 s onto a root balcony. **Reveal: the Glowroot Caverns.** Glowroots brighten as your lantern passes; the title is carved in light; ≤ 3 s | biome 2 | — |
| 4:35 | 40 m | 4 gear cards arrive (a badge on ≡), with the Mine Cart blueprint and Rally. First-time card: "Hold carries you on. Stops for treasure." **Auto-delve unlocked** | gear, auto-delve | "Buy a gear card" |
| 5:00 | 46 m | Glowroot chamber G1, a Glow Gallery. The Mine Cart is hired: a rail appears in the drifts, the cart rolls in and dumps, and its haul shows as one number | carts | "Hire a Mine Cart" |
| 5:40 | 52 m | G2: the first **Glimmerfall**, crystals dropping through your lantern pool. Tap them | event | "Catch the crystals!" |
| 6:20 | 58 m | G3: the first **Drifting Ember** crosses slowly (Gold Shower). Steady Hand at 60 m speeds up the hold | ember | "Catch the ember" |
| 7:00 | 64 m | G4: a fork (Works Road brass, Vein Road gold). The depot: tip the full cart for +5 Pick Crew levels | road 2 | "Choose a road" |
| 7:40 | 70 m | **The Rootheart Vista:** a dark root arch frames an 18 m tangle of glowing roots in a 40 m cavern; the camera's one slow pitch-up (+12°). A Royal Chest (a 10-gem key), a relic shrine, a Halden mural. Far below in the haze, a warm point of light that is not yours: **the Other Lantern** | wonder, the mystery | "Open the Royal Chest" |
| 8:30 | 76 m | Pick 25: **the Copper Pick** form. The tool in your hand turns copper in a ≤ 1.2 s tier ceremony, and its strikes throw warm sparks | tool form | "Reach the Copper Pick" |
| 9:00 | 82 m | The Board appears with 3 contracts ("Enter 5 chambers", "Open 2 chests", "Pulse twice") | contracts | — |
| 9:40 | 88 m | G7: **Rattling Bricks** (a stash) | event | — |
| 10:00 | ≈ 90–100 m | Session-end hook: "Break the Root Knot · 5 chambers"; the crew keeps working the galleries while you are away | — | "Reach the Crystal Grotto" |

**Check against the director's demands:**
- Something new arrives at least every 60 s, and something completes at least every 30 s (L4).
- The 3D world is in view in every second.
- Every input is a tap or a hold.
- No creature appears.
- The screen never shows more than one ceremony.

---

## 8. Visual direction: the answer to "horrible, glitchy, illegible"

### 8.1 Verdict → cause → rule

| The director's word | What caused it (look.md §1) | The rule here | Test |
|---|---|---|---|
| **Horrible** (ugly) | Pixel textures smeared on smooth rock (v1); flat glowing sticker tiles on a cut plane (the APK); mud of one brown-grey value | **No textures on the world.** Faceted low-poly rock, vertex colour, baked vertex AO. Valuables are 3D objects embedded in rock. Shape and light carry material | a shader lint (no samplers but 1D ramps and one low-frequency noise); a per-capture streak detector; every tappable silhouette has ≥ 6 edges |
| **Glitchy** | Seams between two painters; vista cards with floating crates; an orb inside rock; slivers at the near plane; a permanent sway making edges crawl | **Geometry hygiene and stillness.** One material path; no billboards visible as cards; no sprite drawn through rock; a near-plane guard; vertices stable when a neighbour breaks; a still camera gives still pixels | ID-buffer flicker check; sprite occlusion test; post-break pixel difference outside the footprint ≤ 2 %; two idle frames ΔL ≤ 0.01 |
| **Animations far too present** | 240–650 particles, a shock ring and shake on every break, chroma, iris wipes, ±0.6° sway, a 450 px pulsing tutorial donut, ten things competing | **A hard motion budget** (§8.6): ≤ 3 foreground groups, ≤ 2 ambient, ≤ 80 particles over ≤ 6 % of the screen; zero camera motion on taps; one ceremony at a time ≤ 1.2 s; no post theatrics; one UI loop | the FX director counts and asserts; view matrices identical before and after 100 taps; a lint forbids iris, shock, chroma and rays |
| **Illegible** | Exposure 1.85–2.6×, saturation boosted, bloom from 0.85; a third of the screen glass HUD; small text; no single focal point | **One value peak per frame, on the tap target**; exposure 1.0 ± 0.15; bloom threshold ≥ 1.0; opaque plates ≤ 17 % of the area; ≤ 5 numbers; body text ≥ 15 sp | target luminance ≥ 1.6× the frame mean; a grayscale thumbnail at 25 % passes "where do I tap?" in under 1 s; DOM measurement of the HUD |

**Meta-rule:** every look round ends on the director's phone, at arm's length, in daylight. Desktop captures do not pass a
look round.

### 8.2 The look: "Lamplit Faceted" (look.md §3–4, adopted)

Natural rock:
- flat-shaded facets of 0.25 m near the drift and 0.6–1 m on far walls;
- jittered vertices, deterministic per world position;
- strata as real 0.1–0.3 m ledges;
- biome 5-stop ramps as vertex colour;
- vertex AO at strength 0.5–0.7.

Man-made things (timber, rails, carts, crates, chests, masonry, machines) use v1's bevelled-box prop language. Runes are
carved grooves glowing only at the bottom. From Lumi Master it takes the **restraint**:
- few tones per form;
- warm, lifted mid-tones;
- one focal object per beat;
- forward motion into the picture;
- short reward beats.

It does not take the painted 2D or the daylight. The Storybook spike lends its grade (lifted warm mids, coloured fog), not
its smooth geometry. Lantern Voxel is the fallback, and it suits masonry biomes.

### 8.3 Light

- **Key: the lantern.** It is held low-left in view, so it is never a camera flash.
  - Colour `#ffe6c6` at the core, shifting to amber `#ffb35c` with distance.
  - Windowed inverse-square falloff with a 9 m radius (+0.6 m per lantern tier).
  - A ring-shaped pool on the floor.
  - A mid-albedo face at 1.5 m reads 0.65–0.75.
- **Fill:** cool hemispheric at 20–35 % of the key. Darks are biome-tinted, never brown, and never below 0.04 over large
  areas.
- **Rim:** one per space, the next chamber's or the next biome's accent from the far end. **In a drift, the rim comes
  through the breach**, so the tease is light.
- **Practicals:** the 4 nearest are lit per pixel; the rest are baked into vertex colour. Every cold space keeps one warm
  lamp, and the crew hangs lamps on the trail behind you: the visible record of progress.
- **Shading:** wrapped Lambert (wrap 0.3), quantised softly into 3 steps (smoothstep width 0.08). Specular only on metal,
  crystal, ice and wet stone.
- **Grade and post:**
  - exposure 1.0 ± 0.15 per biome (raise the lights, never the exposure);
  - saturation ≤ 1.0;
  - bloom threshold ≥ 1.0 linear, strength 0.15–0.25, 3 levels from 1/4 resolution (off on Battery);
  - one 32³ LUT pair per biome, vignette 0.15, dither;
  - **no** chromatic aberration, lens flare, grain, motion blur, SSAO or shadow maps on Balanced.

### 8.4 Palette and the node colour language

**Global rules** (look.md §4.4):
- **60 / 30 / 10:** about 60 % cool dark stone, 30 % warm lantern-lit mid-tones, ≤ 10 % saturated accent.
- Host stone saturation ≤ 25 %.
- Two accents per biome, plus amber everywhere.
- Darks are hued.
- **Red only for danger.**
- Neighbouring biomes alternate low-key and high-key.
- Never neon.

The 14-biome colour script of look.md §4.4 applies as written.

**The node colour language** is new and must stay honest. A colour always means the same thing, in the breach leak, in the
road light and on the chest band:

| Colour | Meaning |
|---|---|
| **Amber** `#ffb35c` | you, your lantern, your crew and their lamps (the brand's "you are here") |
| **Warm gold** `#e2b673` | treasure: a cache, a lode, a Golden Vein, the Vein Road |
| **Rune cyan** `#2fb6cc` / `#8fe3ee` | the builders: relics, notes, secrets, the Builders' Road; carved script |
| **Brass** `#c99a52` | the Works: a depot, the Works Road, the crew's machines |
| **Violet** `#b9a2ff` | unknown or sealed: a vault, the Unknown road, a seal, locked items |
| **The biome's far light** (look.md §4.4 accent) | wonder: Vistas, Thresholds, the next biome |

Chest tiers keep `RARITY` (bone, copper, rune, deep violet, the mythic amber-brass). The chest's band colour shows its floor
tier before you open it; the roll-up is honest, with no near-miss.

### 8.5 Materials (summary)

| Family | Geometry | Colour | Never |
|---|---|---|---|
| Rock (face cells too) | facets over the dig field; face cells are faceted plugs with 2–4 cm joints in AO so the 7 read as 7 | biome ramp by stratum, 3-step shading | texels, painted cracks (cracks are geometry and `uTarget` grooves) |
| Ores | instanced 6–20 cm angular nuggets, 3–12 per seam, sunk in the cell or vein | one crisp metal highlight; tier glint on the highlight only | a coloured square |
| Gems, crystals | instanced 6–8-sided prisms in clusters of 3–9 | opaque body, fake inner glow ≤ 1.5 HDR, edge highlight | alpha glass |
| Chests, relics, notes | authored bevelled models (chamfer 0.02–0.04 m), brass bands | wood and brass vertex colour; the amber rim only when it is the suggestion | a glowing tile |
| Timber, rails, carts, machines | bevelled boxes, lathed cylinders (v1 props, StructureRenderer) | 2–3 grain stripes; value-capped specular | — |
| Masonry, seals | real blocks in courses (Lantern Voxel language) | ±6 % value per block | painted courses |
| Fungal caps, roots (decor) | low-poly caps and tubes | underglow ≤ 1.2 HDR, never brighter than an ore highlight | being tappable |

**Budgets:**
- 8–16 triangles per m² within 3 m, 2–4 per m² on far walls;
- ≤ 220k visible triangles, ≤ 120 draw calls (instance nuggets, crystals and props);
- 60 fps in glides, ≥ 45 fps in dig beats on Adreno 610–642 / Mali-G57–G68 (Balanced);
- cut effects before frames.

### 8.6 The FX budget (hard caps, enforced by a director, tested in CI)

A **moving group** is anything the eye tracks on its own: the tool swing, one debris burst, a loot stream, a working crew
rig, a cart, the mote field, a UI pulse, the Pulse ring.

| Budget | Drift or chamber beat | Ceremony (one at a time) |
|---|---|---|
| Foreground and HUD moving groups | **≤ 3** (tool, debris, loot stream) | ≤ 3, owned by the ceremony |
| Ambient groups | **≤ 2** (one crew rig *or* the cart, plus the motes or the chamber's one slow wonder animation) | 0–1 |
| Live particles | **≤ 40 per burst, ≤ 80 total** (High ×1.5, Battery ×0.5), all lit by the scene, darker than the face, ≤ 32 px each | ≤ 120 |
| Particle screen area | **≤ 6 %** | ≤ 12 % |
| Particle life | 0.25–0.6 s | ≤ 1.2 s |
| Shards | 6–9 per cell break, 10–16 per breakthrough | ≤ 60 (a seal) |
| Camera motion from FX | **0** | one 0.4° / 120 ms shake: seal, Dynamite, vault door only |
| Hit-stop | 0 on taps, breaks and breakthroughs | 50–70 ms: seal and vault only |
| Flashes | local only: the struck facet +0.4 for ≤ 80 ms | one 0.12 full-frame lift ≤ 150 ms when a seal opens |
| Post effects (shock, iris, chroma, rays, bloom pulse) | **none** | **none**: use light |
| Floating numbers | **≤ 1** (a cart's haul) | the ceremony's own |
| Ceremony length | — | **≤ 1.2 s**, a tap skips; a biome reveal ≤ 3 s |
| UI loops | **≤ 1** (a full lantern breathing, or a ready card) | 0 |

**Ceremonies and their length:**

| Ceremony | Length |
|---|---|
| Breakthrough | FX ≤ 1.2 s, plus the glide |
| Chest roll-up | 0.25 s per step, ≤ 1.2 s |
| Relic ring | 0.9 s, plus a 0.6 s turntable on a first find |
| Pulse | 1.5 s ring |
| ★ | 0.6 s on the card and a rig flash |
| Tool form | ≤ 1.2 s |
| Seal | ≤ 1.2 s, then the reveal ≤ 3 s |
| Return | ≤ 3 s, skippable |

### 8.7 UI calmness rules (Lamplight on the Lintel, applied to first person)

1. **The world dominates.** HUD plates cover ≤ 17 % of the screen; the top band is ≤ 9 % of the height below the safe
   inset, the bottom band ≤ 11 %. These are the lens's most stretched zones anyway.
2. **Plates.** Opaque octagon plates: slate-900 at 0.94, a brass rim, Lintel numerals. No glass, no blur, no pills, no
   rounded rectangles.
3. **Numbers.** ≤ 5 numbers in play; the rate only contextually.
4. **One of each.** One objective line, one hint (the static amber rim in the world), one first-time card, one badge. Never
   a ribbon, a dot, a pulse and a ring on the same card (peek-2).
5. **Still when idle.** UI animates only on a state change: enter is an 8 px rise plus a fade over 160–240 ms, exit is a
   140 ms fade. Counters pop 160 ms when tokens land.
6. **Text.** Body ≥ 15 sp, labels ≥ 13 sp; contrast ≥ 4.5:1 on an opaque plate, never on the 3D scene.
7. **Sheets** cover the bottom ≤ 55 % and dim the world 30 %; the world keeps playing without effects.
8. **Two registers.** The expedition kit (amber and brass) is what you own and do; the builders' script (cyan) is only for
   discoveries and lore.
9. **The HUD never shakes, flashes or moves with the camera.**
10. **Accessibility.** Three motion levels (reduced motion = cross-fades), a shake slider, a flash setting, a left-handed
    mirror.

### 8.8 Composition rules per shot

- **Drift.**
  - The face is the single brightest large area: ≥ 1.6× the frame mean, ≥ 1.3× any other window of its size.
  - Its cells sit at 29–59 % of the height.
  - At least 4 depth cues: timber rhythm, rail sleepers, lamp pools, fog toward the biome colour (starting at 4–6 m, about
    85 % at 25–35 m).
- **Chamber.**
  - The current suggestion (feature or exit) is brightest, and the other tappables are ≥ 20 % dimmer.
  - The wonder feature lives in the top third and is lit by its own practicals, never brighter than the suggestion.
- **Breakthrough, Threshold, Vista.** The window composition (look.md §5.2): a dark cool frame covering 30–40 %, a lit
  middle ground, a glowing far plane. The light widens through the crack; nothing explodes.
- **Seal.** The mechanism's weak point is the frame's peak whenever it is lit. Between lights, the peak is the seal's
  largest face.

### 8.9 Capture tests (on the rig, 390 × 844 at DPR 2, Balanced; from every authored stand)

Each test runs on every authored stand, and on 200 generated stands per biome:
- look.md's 10 rules, with these node-specific checks added:
- "one peak" measured on the arrival frame of every chamber;
- the fill contract (§4.8) from the stand's frustum;
- "pixels changed per tap" ≤ 8 % of the frame outside the face;
- the breach leak hue matches the chamber's promise class;
- every tappable's projected bound ≥ 56 px;
- frame-to-frame view matrix identity during a hold.

---

## 9. What code is reused (from `reuse.md`, for this design)

| System | Reuse | Verdict | New work for the node crawl |
|---|---|---|---|
| Pure idle model `src/idle/**` | everything: Big, curves, cells, shaft (`rowKinds`, `applyHit`, crumble), tap, run, crew, offline closed form, chests, seals, director, codex, feats, rank, goals, tutorial, hints, prestige, contracts, daily, sim | KEEP / ADAPT | §10's model changes; the creature purge (reuse §4) |
| World ring | `RingWorld` (minus `RING_CUT_Z` and `openBack`), slabWorker, slabLoader, slabLight, fingerprint | KEEP / ADAPT | — |
| Slab generation | `slab.ts` passes 1–3, `biomeKits.ts` (creatures purged), `caverns.ts` dressing grammar, `fill.ts` concept | ADAPT | **New:** `world/descent/chart.ts` (the lifetime node graph: K, types, roads, secrets, vaults); `nodeKits.ts` (chamber templates per biome); `nodeStamp.ts` (stamps drift, face, chamber, Way Down into slabs; replaces passes 4–9); `fill-scan` re-aimed at stands |
| v1 architecture | `generateWorld.ts` vocabulary (columns, stairs, portal gate, corbelled shrine, arched bridge, `crystalSeam`, dripstone, a lamp at every landmark) | MINE | into `nodeKits.ts` |
| Light | `LightField`, `LanternField` (source moved to the viewmodel lantern), `lighting.ts` with a 3-step wrap ramp | KEEP / ADAPT | lantern tiers (radius, warmth); the Pulse ring as a light |
| Meshing | `mesher.ts` (section off, `DIG_BAND_*` deleted; flat normals for Faceted), meshPool, meshWorker, ChunkRenderer | ADAPT | the look spike decides the surface |
| Renderer and post | `Renderer`, `PostFX` (iris, shock, chroma and rays off), LUT pair, `QualityGovernor` | KEEP, re-tune | — |
| FX | `GpuParticles` (z planes removed), `Shards`/`fracture`/`rigidBatch`, `CameraFx` (no tap kick) | ADAPT | breakthrough shard fall; caps of §8.6 |
| Props and structures | `PropRenderer` (has `raycast`), `models`, `descentModels` (chests, crystals, crates, runes; creatures deleted), `biomeProps`, `StructureRenderer` and builders, `setPieces/*` (re-lit for real Vistas), `SealRenderer` (Wardens removed), `Lanterns` (planted, ghost, the Other Lantern), `ShaftDressing` (lamp trail, rails) | KEEP / ADAPT | chamber tappable instancing with the rim highlight |
| Crew | `CrewRenderer` figures and impact-frame phases | ADAPT | anchors at the face ring and on chamber walls (`render/hybrid/NodeCrew.ts`) |
| Camera | v1 `ropeRide.ts` (the glide and the ride), `lockedVerticalFov`, `core/spring.ts`, `core/ease.ts` | MINE / KEEP | **New:** `game/hybrid/FirstPersonCamera.ts` (shots, creep spring, glides, focus, Hoist, reduced-motion cross-fade; unit tests on the comfort limits) |
| Input | `TapSurface.ts` (column strips removed), v1 `MiningController.pick()`, `TapController` fat finger, `DigController` batching and F1 records | ADAPT / MINE | **New:** `game/hybrid/NodeController.ts` (hit-test order of §2.3; drift, chamber, focus and ride states; hold sweep and auto-delve stops) |
| Gate interaction | v1 `runeDoor.ts` (hold-to-wake) | MINE | vault doors and Unknown roads |
| Tool and lantern | `TOOL_FORMS`, `toolHead`, `lanternEdge` (`config/gear.ts`), `VoxBuilder` | KEEP | **New:** `render/hybrid/Viewmodel.ts` (a solid tool and lantern, own camera, contact-pose strike, forms 1–3 for the slice) |
| Shell | `IdleGame.ts` boot, modes, fixed step, autosave, lifecycle, offline return, Back, crash, save glue; `FrameGuard`, `main.ts` | ADAPT by copy | **New:** `game/HybridGame.ts`, which owns the node state machine |
| Scene facade | `DescentScene` API (`applyBreaks`, `cellFx`, `strike`, `burst`, `pickEntity`, `bindBus`, `frame`) | REWRITE behind the same API | **New:** `render/hybrid/DepthScene.ts` |
| UI | brand kit (tokens, Lintel, emblem), `layout.ts`, `TopBar`, `GoalBar`, `QuickBuy`/`Card`, `Sheet`, `FirstTimeCard`, `ReturnFeast`, `SealHud` (merged into the objective line), `displayLedger`, `press`, `Ticker`, haptics | KEEP / ADAPT | the calm restyle; the Chart sheet (from `DepthRuler`/Ladder data); a focus-view panel |
| Ceremonies | `Timeline`, `CeremonyDirector`, Chest, BiomeReveal, PickTier, Rekindle | ADAPT, shorten | Breakthrough, Pulse, relic ring |
| Audio | synth, sfx, MusicScheduler, `eventMap` | KEEP, remap | breach whump, Way Down creaks, chamber ambience layers, the Pulse swell |
| Save | `SaveSystem` | KEEP | **v4:** current node id, phase, slice index, chamber harvested bits, roads this run, lifetime chart bits, secrets and vaults; migrate the v3 meta (gems, records, Feats, Finds minus bestiary, rank, settings) |
| Tests and tools | pure unit tests, `tests/e2e/touch.ts`, `release.spec`, `apk-sim.mjs`, `perf.mjs`, `econ-sim.ts`, Visual Lab | KEEP / ADAPT | `chart.test` (determinism, no overlap, ring bounds, the fill contract from stands, road depth equality), `firstPersonCamera.test`, `nodeController.test` (no miss, focus needs a direct hit), e2e `hybrid-slice.spec` |
| Delete | v1 `CameraRig`, `PlayerController`, `TouchControls`, survival, inventory, crafting, walk-home fields; the tree's `DescentCamera`, `look.ts`, `SectionField`, `ToolRig` ghosts, `VistaBackdrop` (for Vistas), the foreman `ExplorerModel`, `Creatures.ts` and every creature system | DELETE (after the slice gate) | — |

---

## 10. Model changes this design needs, and the calibration

All of these are pure and testable in `src/idle/**`.

1. **Nodes.** A new `model/nodes.ts`. It holds:
   - the current node id and phase (drift, chamber, focus, ride);
   - the slice index in the drift;
   - K from the chart;
   - chamber tappables as extra cells with kind and HP multipliers, harvested bits, and the gold per damage law (L6) intact;
   - the road choice;
   - the lifetime chart bits;
   - secrets and vaults.

   It adds the bus events `node:arrive`, `node:breach`, `node:harvest`, `node:road`, `ride:start`, `ride:end`, `focus:*` and
   `pulse`.
2. **The breach rule.** Crew damage stops at the breach row of an uncharted chamber. The overflow becomes Works haul at 1.00
   gold per damage (the same accounting as the offline "gallery gold"). `offline.ts` gains that stop in uncharted ground and
   the Haul Crate for charted ground.
3. **Road salt** in `rowKinds(runSeed ^ road, d)`, with the Vein Road's cell table bounded (EV ≤ ×1.25).
4. **The Surge becomes the Pulse:** tap to fire, it waits when full; the reveal and ×3 behaviour are otherwise unchanged.
5. **Purge and recast:**
   - the Lucky Moth becomes the Drifting Ember (same outcome table);
   - Moth Swarm, Treasure Mole and Mimic become Glowroot Bloom, Rattling Bricks and Runaway Cart;
   - Wardens become mechanisms (§4.9);
   - `fossilGolem` and `voidMaw` become Bone Ram and Void Engine;
   - the Bestiary, Kindred and Moth Friend go (§5.6);
   - the mutator "Inverted" loses its creatures;
   - a new mutator, **Braided**, has forks every 2–3 chambers with 3 roads.
6. **Codex:** 11 entries per biome; relic traits and grades.
7. **Calibration** with a node-paced bot that taps 3–5/s in drifts, harvests chambers to 80 %, takes the Pulse at the first
   hint and picks roads at random. The targets (est.) are below. The knobs are `CHAMBER_EQ`, K per biome and the 25 in the
   Ember formula.

   | Milestone | Target |
   |---|---|
   | first purchase | ≤ 15 s |
   | first chamber | ≤ 40 s |
   | 40 m (the Hatch) | 3:45–4:45 |
   | 120 m | 11–14 min |
   | 240 m | 20–26 min |
   | 600 m (Rekindle) | 40–50 min |
   | chamber gold | 25–35 % of run gold |
   | longest gap between completions in the first 30 min | ≤ 30 s |
   | Rekindle chains | none (E9) |

   Today's full model runs 4–5× too fast (600 m in 4–5 min). Chamber time and gold-only offline in run 1 are the intended
   brakes. Keep the four `it.fails` honest until the sim passes.

---

## 11. Risks

| # | Risk | Why it is real | Mitigation |
|---|---|---|---|
| R1 | **The surface fails at first-person distance** | rock fills 40–70 % of the drift frame at 1.5–5 m; both previous surfaces failed there | the look spike (#81) decides before slice art; judge at 390 × 844 from a real drift stand and a chamber stand on the director's phone; spend detail on face joints, nuggets and props, not rock micro-relief |
| R2 | **Motion sickness** | the camera moves about 12–18 % of the time (creep, breakthrough, Way Down, focus) | every move is straight, eased, ≤ 2.5 m/s, rotation before translation, no roll or bob, a still viewmodel as the anchor; unit tests on velocity and angular caps; reduced-motion cross-fades; a tap skips any ride > 1 s; device test in the first week |
| R3 | **Chamber taps miss at 3–6 m** | perspective shrinks objects; several tappables share the frame | big tappables (≥ 56 px projected), entity-first, fat finger only for strike-type, focus-type needs a direct hit; e2e real-touch hit rate ≥ 99 % |
| R4 | **Chambers feel samey** over 15–37 per biome | procedural kits repeat | templates × sub-zones × shapes, anti-repetition (4 chambers), roads with different sub-zones, a thumbnail-diversity capture metric, re-climbs flying through charted ground, authored Thresholds, Vistas and vaults per biome |
| R5 | **The economy changes shape** | chamber gold, node time and gold-only offline in run 1 all move the curve | the node-paced bot before any table change; knobs `CHAMBER_EQ` and K; keep side multipliers ≤ ×10 by day 3 |
| R6 | **Offline feels weak in run 1** (the crew waits at the breach) | first sight blocks depth offline in uncharted ground | a generous Works haul shown proudly ("the crew worked the old galleries"); a buy spree on return; charted ground from run 2 restores depth offline; H12 hint |
| R7 | **Over-juice creeps back** | the breakthrough happens every 25–50 s and wants to be a ceremony | it is light, not FX (≤ 1.2 s, no shake, no flash, no post); the FX director asserts the caps in CI; any new cue must name the group it replaces |
| R8 | **Performance** | chambers show 10–14 m of space; Vistas up to 60 m | RingWorld's 160-chunk bound, view-distance culling, fog hides the far LOD, instancing, the dynamic scene scale, Battery preset; add a chamber and a Vista scene to `perf.mjs`; a device run in the slice gate |
| R9 | **The chart geometry does not fit** the 64 × 64 ring | spirals, roads and Vistas compete for volume | the chart generator is a pure function with a test: no overlaps, ring bounds, every stand's frustum clear, roads of equal depth; Vistas take a whole loop of the spiral |
| R10 | **The hold plays the game alone** | auto-delve exists from minute 4 | stops at every manual feature, fork, draft, seal and first sight (about one chamber in two); a player's tap on a special pays 10–100× a crew strike |
| R11 | **Roads feel meaningless** | both rejoin and reach the same depth | promises are visible, honest and different in kind (ore, relic, crew); the Chart shows roads not taken; the Cartographer feat; the Unknown road and vaults reward the Pulse |
| R12 | **Scope** | 14 kits × 11 types, plus 30 model systems wanting UI | slice = Topsoil (8 authored nodes, 1 fork, 1 secret, 1 relic) + the Hatch + the Glowroot Threshold, 2 Glowroot nodes and the Rootheart Vista; everything else dormant |
| R13 | **Lumi Master's frames were never seen** | all research came from text extracts | before locking the grade, a human spends 20 minutes on the trailers in lumi-master.md §5.9: tone steps per form, fog or not, HUD area |
| R14 | **Purge and save** | about 40 files to purge; a v3 save on the director's phone | one owner, one pass, the grep gate (reuse §7.2 C2); save v4 migrates the v3 meta with a one-line notice |

---

## 12. Decisions this design takes, and what to prototype first

**Answers to reuse.md §8:**
- Face mapping: a 7-cell rosette, with zero economy change.
- Descent geometry: chambers linked by drifts and Way Downs, spiralling in the footprint; Hoist rides for charted ground.
- K: per biome (§4.3).
- Where the crew digs: your face, then the next drift ahead of you, never the breach.
- The station roll: lives in the world grammar (the chart: layout lifetime-seeded, loot run-seeded with pity).
- v3 saves: migrate the meta.
- The menu: the first-person camp at dusk.

**First prototype (one wave, three workstreams, files beside the old ones):**

| Workstream | Builds |
|---|---|
| WS-A | chart + nodeStamp + the Topsoil kit, DepthScene, Viewmodel, NodeCrew |
| WS-B | FirstPersonCamera, NodeController, HybridGame, the calm HUD, the objective line, Breakthrough and focus ceremonies |
| WS-C | `nodes.ts`, the breach rule, the Pulse, the purge, save v4, the node-paced bot, tests, the APK |

**The gate:**
- **Comfort:** camera tests hold the limits.
- **Taps:** 1,000 random world taps produce 0 misses; focus needs a direct hit.
- **Look:** captures pass §8.9.
- **Pacing:** the Hatch between 3:45 and 4:45 in the bot.
- **Device:** the director plays the first 10 minutes on the phone.
