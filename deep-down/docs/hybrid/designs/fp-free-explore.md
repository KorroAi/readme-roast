# DEEP DOWN, hybrid design: "First-person lantern explorer, free tap-to-go"

Design panel entry, angle **fp-free-explore**. Date: 2026-10-20. No code was edited for this document.

Inputs: `docs/hybrid/research/{lumi-master,hybrids,look,reuse}.md` (read in full), `docs/idle/SPEC.md` (the pure model this
design keeps), the v1 screenshots (`artifacts/final-pass/*`, `artifacts/world-w2/r1/*`), the latest build's captures
(`artifacts/idle/w1`, `artifacts/idle/w2/look`) and the APK frame the director hated (`scratchpad/peek-2.png`).

**The hard constraints, newest first, and how this design honours them**

| Constraint (director) | Answer here |
|---|---|
| No creature side: no collecting, taming, companions, pets, battles or trading. Lumi Master is a reference **only** for its 3D look and how it presents exploration | Nothing alive is ever a mechanic. Seals are mechanisms, the Lucky Moth becomes a **Drifting Ember**, the Bestiary becomes **Lamps** (old Halden lamps you relight). Ambient life is limited to inanimate motion (drips, motes, spores, steam). §3.6, §4.5 |
| Keep DEEP DOWN's identity | The lantern-lit descent through the 14 biomes, mining rock, ore and gems, chests and relics, sealed gates, the hired crew and machines that dig while you are away, upgrades to démesure, the mystery of the Other Lantern, and the "Lamplight on the Lintel" brand. §3, §4, §7 |
| First person; you no longer see the character | Eye at 1.6 m, no body. Only the tool (lower right) and the lantern (lower left) are in view, as the upgrade showcase and the comfort anchor. §2 |
| Every interaction is a tap or a hold; no joystick, no aim buttons | The world is the button. Tap the floor to go, tap the stone to strike, hold to keep mining, hold the floor to let the lantern walk. No swipe, drag, pinch or free look. §1 |
| A new hybrid of v1's 3D exploration and the latest tap-only idle clicker; a big visual upgrade | Real 3D caverns you explore by tapping what you see, a crew that keeps digging the way down, and the latest build's idle economy underneath, unchanged in its maths. The look is "Lamplit Faceted" with a storybook grade. §0, §7 |
| Android first, Three.js r186 WebGL2, TypeScript, Vite; English via `src/i18n`; no external assets; offline; no store | Everything is procedural (faceted rock, bevelled props, synthesized audio), all strings are `idle.*` keys, and there is nothing to buy. §8 |

---

## 0. The pitch

**One line.** *DEEP DOWN is a first-person lantern crawl for one thumb: tap the dark to walk into it, tap the stone to
break it, and let your hired crew dig the way down, even while you sleep.*

**The genre: a "lantern crawl".** It is a tap-to-explore idle crawler:

- From v1 it takes **real 3D spaces you move through**.
- From the latest build it takes **tap-only digging, a crew that works for you, and upgrades that climb to absurdity**.
- From Lumi Master it takes only the presentation: **moving into the picture in first person**, a calm, few-tone frame, one
  focal thing per beat, and short reward beats.

**The bet of this angle (against a pure station-hop design).** You are free inside each cavern:

- Tap any lit spot on the floor and you glide there.
- Tap any stone and you strike it.
- Tap something far away and you walk to it and strike it on arrival.

Freedom is what v1 promised and failed to make pleasant, and the one thing Lumi Master is criticised for lacking ("linear,
no choice of where to go"). This design makes it pleasant by never asking the thumb to *steer*:

- Every move goes to a **visible target**.
- Every move is an authored, eased glide: rotate first, then translate, at walking speed.
- The tool and lantern stay still in the lower corners as an anchor.

**Two economies, one picture.**

- **The crew digs the way down.** That is the idle core: the existing model's rows, its closed-form offline progress and
  its numbers.
- **The lantern discovers.** That is the active core: ore seams, crystals, chests, relics, keystones and lamps that only
  your light reveals and only your taps take.

An active explorer earns about **1.8×** what the crew earns alone. The crew earns about **1×** while you are away. Nothing is
lost if you skip anything (§4.6).

**Fallback built in.** If free tap-to-go fails the comfort test on the director's phone, one setting
(`explore.vantageSnap`) restricts footholds to 3–5 authored vantage points per cavern. The game becomes a station hop with
the same caverns, loops, look and code. The risk is bounded (§9, R1).

---

## 1. The control scheme

### 1.1 Gestures (all of them)

| Gesture | Where | Result | Unlock |
|---|---|---|---|
| **Tap** | stone within reach (≤ 4.0 m from the eye): an ore seam, a crystal, the wall skin, a face cell, a boulder | **Strike** at the tapped point: the tool swings, a crack grows where you touched, chips fly away from the camera, a material *tock* plays. 1–4 taps break a cell | 0:03 |
| **Tap** | stone beyond reach | **Approach and strike**: glide to a stand-off spot 2.4–3.2 m in front of it, facing it; the strike lands on arrival | 0:10 |
| **Tap** | lit floor (any visible walkable surface) | **Go**: a warm footprint ring appears where you tapped in the same frame, then the camera glides there | 0:10 |
| **Tap** | an object: chest, relic, keystone, lamp, Halden note, haul cart, event object, seal weak point, drift mouth | its verb (open in the focus view, pry, relight, read, tip, catch, strike, go through). Beyond reach you approach first | 0:50 |
| **Tap** | dark or unminable surface (ceiling, masonry, bedrock, nothing within 30 m) | **Glance**: the view turns toward that point by up to 26° of yaw and 15° of pitch, in 0.3 s | 0:10 |
| **Tap** during a glide | stone within reach | strikes without stopping (a "drive-by" strike) | — |
| **Tap** during a glide | floor or a far target | **re-targets** the glide from the current position, with continuous velocity | — |
| **Tap** during a drift glide or a ceremony | anywhere | skips: a 0.25 s cross-fade to the end state | — |
| **Hold** (still ≥ 250 ms, ≤ 12 px) | stone | **Keep mining**: a hold stream of 3 strikes/s (+1/3 per Steady Hand level up to 5/s; 8/s in a Surge) on whatever is under the finger. When it breaks, the stream moves on to the next cell of the same seam, then to the nearest stone within 40 px. It stops on release | 0:15 |
| **Hold** during a glide | stone within reach | stops the glide (0.3 s deceleration) and keeps mining | — |
| **Hold** (≥ 600 ms; a brass ring fills under the thumb from 250 to 600 ms) | floor | **Lantern Walk**, the autopilot (§1.4). It continues after release; any tap cancels it and acts normally | 5:00 (cavern T3) |
| **Tap / hold** | the BEST plate | buy / hold to buy (8 buys/s after 380 ms, 16/s after 1.5 s; the model's rule) | 0:25 |
| **Tap** | a plate (Tools, Crew, Skill, Ledger) | opens its sheet (≤ 55% of the screen, world dimmed 30%); a tap outside closes it | progressive |
| **Tap** | your lantern (lower left) | turns the **Wick** up a notch (×1 → ×3 → ×10…, §4.4). Before the unlock, taps there pass through to the world | 240 m |
| **Android Back** | — | closes a sheet, then exits the focus view, then opens the pause menu | always |

**Never:** swipes, drags, pinches, a joystick, aim or move buttons, free look, double taps, or long presses on UI other than
hold-to-buy.

### 1.2 Tap resolution (pure, `game/hybrid/WorldTap.ts`; the first match wins)

1. **HUD rectangles** (top band, bottom band, open sheet). Never reaches the world.
2. **The lantern viewmodel**, only once the Wick is unlocked.
3. **Entities**, hit-tested in screen space with radius `max(30 px, projected bound + 10 px)`. Order: event objects, seal
   weak point, chest, relic, keystone, lamp, note, haul cart, planted lantern, drift mouth.
4. **The camera ray** (`raycastVoxels` plus `PropRenderer.raycast`), first hit:
   - minable within reach → strike at the hit point (the face cell maps to the model's `(col, row)`);
   - minable beyond reach → approach and strike;
   - floor (normal·up > 0.7) → snap to the nearest foothold within 0.75 m → path → glide;
   - unreachable floor → "blocked": the ring shows dimmed at the point with a soft thud, plus a glance (shown, never
     silently ignored);
   - anything else → glance.
5. **Fat finger** (the ray hit nothing useful). The nearest minable within 30 px and within reach gets the strike. Failing
   that, the nearest foothold ring within 40 px gets the move.

**No tap is wasted** (the SPEC's law L2). Every point of the world region resolves to a strike, a move, an object or a glance.
The test is 1,000 random taps on generated caverns: 0 no-ops.

**Disambiguation rule players can feel:** *"Near stone breaks, far stone walks you to it, floor walks you, darkness turns
your head."* The strike reach is shown once by the tutorial (the lantern pool's warm ring is roughly the reach) and is never
a UI element afterwards.

### 1.3 Hold and the strike rhythm

- **Strike animation:** 90–120 ms down-swing, a contact frame matched to the impact and the sound to within one frame, and
  200–260 ms recovery (≤ 380 ms in total).
- **Fast strikes:** above 3 strikes/s, a shorter "flurry" swing is used.
- **Swing direction:** it leans toward the target, choosing one of three arcs (left, centre, right). The tool head enters
  the central 50% column for at most 120 ms.
- **The cap:** the model's global cap of **8 counted hits/s** across all pointers stays (`TapSurface`). Extra taps show a
  flash and merge into the previous hit.
- **Multi-touch:** up to 3 pointers; two thumbs alternating is the "fast" style.
- **Combo** (model, ×1 → ×2 at 50): no on-screen counter. It is heard (each strike's pitch rises a step through the biome's
  scale) and seen (the tool head warms from bone to amber to cyan at 10, 25 and 50). A first-time card explains it the first
  time it reaches 10.

### 1.4 Lantern Walk: the autopilot (Lumi Master's "hold the compass", made to stop at the right moments)

Hold the floor for 0.6 s. A brass plate replaces the goal line's icon ("Lantern Walk"). The lantern then:

1. mines the lit seams and crystals of this cavern in order of value ÷ distance, at the hold rate;
2. relights unlit lamps it passes;
3. helps at the face, or glides through an open drift mouth to the next cavern.

**It stops by itself** (the player gets every first sight and every choice):

- at a chest, relic, keystone or legendary lamp;
- at a Halden note the first time;
- at an event;
- at a fork;
- at a seal;
- at the reveal of a new biome;
- at the first sight of a Vista;
- optionally, when a BEST purchase has been affordable for 20 s (a setting, off by default).

**Rules:**

- Lantern Walk is free.
- It never opens, chooses or reads for you.
- Its strikes are hold strikes, so a player's own taps on specials stay worth more: crits, combo, and the Wick's choices
  are yours.
- On re-climbs below your record it is the comfortable way to plunge.

### 1.5 What is automatic

- Walking along the path once you have tapped where to go.
- Arrival framing (§2.3).
- The step forward at the face when it recedes.
- Crew digging and hauling.
- **Selling:** gold is credited when it lands; there is no backpack and no trip back.
- Sweeping: finds left behind are swept at 25% when you leave a cavern (§4.6).
- Chests and keystones left behind go to the Chest Rack.
- Autosave.

### 1.6 Inputs per minute (est.)

| Phase | Discrete inputs/min | Strikes/min (incl. hold stream) | Notes |
|---|---|---|---|
| Tutorial (0:00–3:00) | 40–80 | 40–90 | taps taught first, the hold at 0:15 |
| Active exploring | 10–25 (moves 4–10, objects 1–4, buys 2–6, holds 3–6) | 120–300 | the comfortable norm; a hold covers the high end |
| Fast tapper | 60–200 | up to 480 (cap) | two thumbs; combo and crits reward it |
| Seal fight (30 s) | 20–60 | 180–300 | the most intense beat |
| Lantern Walk | 0–4 | 120–300 (automatic) | stops for chests, keystones, forks, reveals |
| Idle on screen / away | 0 | 0 | the crew digs; carts haul |

### 1.7 How the tutorial teaches it: three steps, each one done, never read

| Step | Prompt (≤ 8 words, `idle.tut.*`) | What the world does | Done when | Fallback |
|---|---|---|---|---|
| **1. Tap = strike** | "Tap the copper" | a three-nugget copper seam 2 m ahead, in the brightest part of the lantern pool, with a calm amber rim | the seam's first cell breaks (pick 100 against HP 100: one tap) | after 4 s a ghost hand taps it once; after that the hand never returns for this verb |
| **2. Tap the floor = go** | "Tap the light to walk" | a warm footprint ring glows on the floor by a lamp post 5 m away | you arrive | after 5 s the ring brightens once (static, no pulse loop) |
| **3. Hold = keep going** | "Hold to dig" | the 7-cell face of the way down, rim lit; a hold ring appears under the thumb on contact | 6 cells broken by a hold | after 6 s the ghost hand presses and holds |

Everything after that (BEST, hire, chest, fork, Lantern Walk) arrives as a goal line with an in-world rim. The rules from
SPEC §8.1 hold: no modal in the first 3 minutes, the world is never paused, and nothing can be failed.

---

## 2. The camera

### 2.1 Lens and pose (from `look.md` §4.1, kept)

| Parameter | Value |
|---|---|
| Eye height | 1.60 m (1.45 m crouched in low drifts; never below 1.2 m) |
| Lens | **horizontal FOV locked at 52°** (tunable 48–56; `lockedVerticalFov` from v1's CameraRig): vertical FOV 93.1° at 390 × 844, 90.1° at 360 × 740, 94.6° at 412 × 915 |
| Pitch | **−8° walking** (the vanishing point at 43% from the top; the floor 4 m ahead at 62%, 8 m ahead at 53%). **−6° at the face station** (3.2 m from the face: the face spans 26–65% of the height, its centre cell at 46%) |
| Roll | 0, always |
| Bob, sway, breathing | none on the world camera. A ±0.15° / 0.2 Hz breathe on the *viewmodel* only, off in reduced motion |
| Taps | **the camera never moves on a tap**. The tool, the stone and the sound carry the hit |
| Shake | only structural events (a seal breaking, Earthquake, a vault collapse): ≤ 0.4° rotational, ≤ 120 ms, one decaying oscillation; off with the Camera Shake setting |
| Near plane | 0.08 m. Footholds keep the eye ≥ 0.6 m from rock; walls closer than 0.7 m darken their facets rather than clip |
| Viewmodel | its own pass and camera (vertical FOV 58°, depth cleared, drawn last before the HUD). **Tool lower right, lantern lower left**, together ≤ 12% of the screen area, nothing in the central 50% column at rest, perfectly still at rest |

Measured scale at this lens: the screen shows 0.975 m of width per metre of distance. That is 125 px per metre at 3.2 m, 100
at 4 m and 67 at 6 m (390 px wide).

- A face cell (1.0–1.1 m) is 125–140 px.
- A seam (0.8–1.4 m) is 80–140 px at 4 m.
- Both pass the ≥ 88 px rule (reuse R3) at strike distance.

Far seams are tapped to *approach*, so their size does not matter.

### 2.2 Glides: tap-to-go made comfortable (`game/hybrid/FirstPersonCamera.ts`; path from `footholds.ts`)

| Rule | Value | Why |
|---|---|---|
| Rotate first | to face the destination: duration `0.12 + 0.007 s × |Δyaw|°` (≤ 0.30 s, because anything visible is within ±26°), smoothstep ease-in-out (peak ≈ 1.5× the mean rate, ≤ 130°/s); pitch eases to −8° at the same time | turns happen before the dolly, never during (hybrids §4.2) |
| Then translate | the path is a string-pulled polyline over footholds, ridden with v1's `ropeRide` (constant acceleration over 0.6 m at each end). **Cruise 2.5 m/s** | ≤ 2.5 m/s (look.md); continuous arc length that never runs backwards |
| Durations | 2 m 1.3 s · 3 m 1.7 s · 4 m 2.1 s · 6 m 2.9 s · 8 m 3.7 s · **12 m 5.3 s (the maximum single glide)** | caverns are sized so most moves are 3–6 m |
| Yaw while moving | **eyes on the destination** (yaw aims at the target point, not the path tangent), rate cap 30°/s | the bearing to a target changes slowly, so yaw barely moves |
| Path legs | if the path's bearing change would exceed 30° (around a pillar), the glide splits into two legs with a 0.15 s pause and a ≤ 0.3 s rotate between them | never rotate and translate a lot at once |
| Height | the eye follows the floor through a critically damped spring (ω 6/s); vertical speed ≤ 1.2 m/s; stairs and ramps are ridden as smooth slopes | no bob on steps |
| Destination ring | a 0.6 m warm ring at the target, appearing in the frame of the tap, static, fading on arrival (160 ms) | the visible target that Myst DS lacked; it is the glide's one foreground moving group |
| Re-target | a new floor tap during a glide re-paths from the current position, keeping the velocity (no stop and start) | freedom without dead time |
| Reduced motion | glides become a 0.25 s cross-fade; the rotate is hidden inside the fade | Myst legacy, Xbox AG 117 |

### 2.3 Look-at, arrival framing, re-orient, glance

- **Arrival framing.** When a glide ends, if an unmined lit target lies within 4 m and ±40°, the view eases toward it:
  ≤ 0.35 s, ≤ 35° of yaw, ≤ 15° of pitch, then holds. An approach glide always ends framing its target at 45–55% of the height.
- **Re-orient (never strand the player facing blank rock).** When an action completes and nothing tappable remains in view,
  the view turns ≤ 60° over 0.6 s toward the nearest unmined lit target or the open drift mouth.
- **Glance:** see §1.1 (≤ 26° yaw, ≤ 15° pitch, 0.3 s).
- **Turning around is never needed.** Caverns are composed as a forward fan from their entrance (§3.2), the descent only
  goes forward and down, and everything left behind is swept. The Map can travel back to a charted cavern of this run with
  a 0.25 s cross-fade.

### 2.4 The focus view (chests, relics, keystones)

Tapping one opens the focus view:

- the camera eases in 0.35 s to 1.3 m from the object;
- the object is centred at 50% of the height;
- pitch is ≤ −20°, because valuables sit at 0.6–1.4 m: on ledges, in niches, on crates, never on the floor;
- the world behind dims 30%.

**The verbs:**

- a chest opens with one tap;
- a relic takes one **Strike ring**: hold, then release inside the gold band (§4.5);
- a keystone is pried out with one tap.

The view exits by itself 0.6 s after the payoff, or on a tap outside the object.

### 2.5 Special camera moves (all short, all skippable)

| Move | Shot | Length |
|---|---|---|
| Drift glide (cavern → cavern) | the "drift ahead" composition: timber sets every 2.5–3 m, lamps every 8–12 m, the crew's cart rail. It is a rail at 2.5 m/s, pitch −8° | 3–6 s (6–14 m authored); a tap skips |
| Breakthrough first light | arriving at the mouth of a dark cavern: your lantern pool leads in and the cavern's fill rises over 1.2 s (§3.5) | part of the glide |
| Seal break and reveal | a **window** shot: the gate's frame dark at 30–40% of the screen, a lit midground, the next biome's glow far away; the only slow pitch-up (≤ +15° over 1.2 s); the biome title carved in light | ≤ 3 s; a tap skips |
| Hoist cage (Rekindle, Head Start, the return beat) | cross-fade cuts, never a long vertical ride beside a wall | ≤ 2.5 s |
| Camp view (menu, Ledger › Camp) | a first-person view at the shaft head, at dusk on first visits and at dawn after a return | static |

### 2.6 Portrait framing at 390 × 844 CSS px (safe insets 47 top and 34 bottom), and everything that is on screen

```
   0 ┌──────────────────────────────────────────┐
     │ (status bar: the world shows, dark ceiling) │ 47 safe
  47 ├[◉ 12.3K  +45/s][ 32 m · Topsoil ][≡]────┤ 46   top row: gold+rate · depth+biome · Ledger
  93 ├[⬡ Break through · 62% ▮▮▮▮▮▮▯▯  +5◆ ]───┤ 30   the objective line (every frame of play)
 123 │ ceiling · timber head · the far glow     │      frame layer: dark, cool
     │        glint of the next find (tease)    │
 365 │ ─ ─ ─ ─ ·  vanishing point ≈ 43% ─ ─ ─ ─ │
     │  ┌───────── tap zone 35–68% ─────────┐   │ 295–574  the face, seams, chest, lamp:
     │  │   the target: brightest large area │   │          the only rim highlight
     │  └────────────────────────────────────┘   │
 600 │ floor pool · footprint ring · rail       │      warm mid-values
 640 │ 🏮 lantern                     pick ⛏    │ 640–750  viewmodel corners, still
 754 ├[Tools][   BEST · Pick 7 · 1.2K   ][Crew][✷]┤ 56   one row of opaque octagon plates
 810 │ (home indicator)                         │ 34 safe
 844 └──────────────────────────────────────────┘
```

- **The world:** 123–754 px, unobstructed during play (75% of the height). With the status and home-indicator strips, which
  also show the world, the **3D view is 84% of the screen's pixels** (712 of 844 rows). The HUD bands are 76 px top (9.0%)
  and 90 px bottom including the inset (10.7%).
- **Numbers on screen: five at most.** They are gold, rate, depth, the goal's percentage and the BEST cost. The drift
  mouth's carved plate repeats the goal's percentage in the world.
- **Plates:**
  - Tools (pick, lantern, skills, gear);
  - BEST, the one-tap right move, wide, its own progress bar;
  - Crew;
  - Skill, showing the next ready skill only;
  - Ledger ≡ at the top right, holding Map, Codex, Feats, Camp, Lantern (prestige), Board and Settings.

  Every upgrade, hire and sheet is ≤ 2 taps from play (Lumi Master's two-step rule).

### 2.7 Comfort tests (unit, pure camera maths; R2)

- Peak yaw rate ≤ 130°/s in a rotate and ≤ 30°/s while translating.
- Translation ≤ 2.5 m/s; vertical ≤ 1.2 m/s.
- Roll exactly 0.
- The view matrix is identical before and after 100 taps.
- No glide longer than 12 m.
- The eye stays ≥ 0.6 m from solid voxels along every generated path, over 2,000 paths per biome.
- Reduced motion: no interpolated camera motion at all.

---

## 3. The world

### 3.1 The descent: camp → shaft → caverns linked by drifts → seals → endless

- **The camp** sits at the surface, around the Halden headframe (§3.8). The shaft drops to **the Landing**.
- From there the descent is a chain:
  - a **cavern**, where you explore;
  - a **drift**, the way down, which the crew digs;
  - the next **cavern**, and so on.
- Each biome ends in a **Seal Hall**.
- After the Gate, the **Echo strata** follow every 1,100 m, as in SPEC §6.5.

**One slice of the face = one model row = 1 m of depth.**

- The face of the way down is a **7-cell rosette**: a centre cell and six around it, an octagon-friendly silhouette with
  cells of 1.0–1.1 m.
- It is exactly the model's `COLS = 7` row, so `curves.ts`, κ = 0.86, the crumble, the pierce and the offline closed form
  are all unchanged (reuse §3.9).
- A drift is **K(b) slices**. Breaking the last slice opens the next cavern.

| Biome | Length (m) | Caverns N(b) | K(b) slices per drift |
|---|---|---|---|
| Topsoil Roots | 40 | 5 (authored) | 8 |
| Glowroot Caverns | 80 | 8 | 10 |
| Crystal Grotto | 120 | 10 | 12 |
| Halden Works | 160 | 10 | 16 |
| Fungal Deep | 200 | 10 | 20 |
| Drowned Ruins | 300 | 12 | 25 |
| Magma Veins → the Gate | 400–1,100 | 12 each | 33 → 92 |
| Echo strata | 1,100 | 12 | 92 |

- **Visual drift length is capped.** Drifts are 6–14 m long on screen whatever K is.
- **The face recedes `min(1, 12/K)` m per slice.** The camera at the face re-steps (a 0.5 s glide) whenever the face is
  more than 3.6 m away.
- **Depth is metres dug.** The counter rolls; the real vertical drop per cavern is 6–10 m, stacked as a descending
  corkscrew inside RingWorld's 64 × 64 m footprint (caverns alternate sides). Players read depth from the counter, the
  biome changes and the light, never from geometry.

**The lantern leash (the crew and the explorer stay together).**

- The crew digs at most **3 caverns ahead of your lantern**. *Survey Lamps* adds 1 per level, up to 8.
- It never digs through a seal you have not opened (L10, first sight).
- Work beyond the leash pays **gallery gold** at the same gold per damage, exactly as SPEC §4.2 already does at a seal. The
  offline closed form only gains a stop depth.
- **Caverns the crew breaks into are left dark.** The crew hauls the rock and ore of the drift, but a cavern's lantern finds
  wait for your light. That is the identity rule: **the crew digs, the lantern discovers.**

### 3.2 A cavern: anatomy (`world/descent/cavern.ts`, generated in the slab worker)

| Part | Spec |
|---|---|
| Size | 12–20 m wide, 14–22 m deep, 4–8 m tall (a Vista is 32–48 m). Explorable floor ≤ 20 m from the entrance; 1–3 levels joined by stairs and ramps |
| **Entrance view** | the composed "picture-book plate" from the entry foothold: a dark foreground frame (an arch, roots or timber), the lit midground (the first finds in the lantern pool) and a far glow (the drift mouth with crew lamps, or a biome emissive). Generated rooms must pass a capture test of this shot (§7.8, rule 3) |
| **Forward fan** | every tappable sits within ±70° of the entrance direction, so nothing important is ever behind you |
| **Footholds** | a 0.5 m grid of walkable floor cells with headroom ≥ 2.0 m, clearance ≥ 0.6 m and no drop > 1 m within 0.5 m. Each foothold stores an *interest yaw* (what to face on arrival). Positions whose view is ≥ 80% blank wall are culled |
| **Sockets** | every tappable sits 0.2–3.0 m above a foothold and ≤ 4 m from one (inside the reach envelope) |
| **The drift mouth** | the way down, with its carved octagon plate (breakthrough %, Lintel numerals), the face crew working inside, and a cart rail running out across the cavern floor |
| **Wall skin** | plain rock walls are minable 1 cell (≤ 1 m) deep: up to 40 cells per cavern, at the cavern's depth, paying rock gold (0.6×). 12% of skin cells hide a pocket: a nugget, a gem or a note. Behind the skin is "deep rock": the pick bounces with a dull *tunk*, which is still a response, not a miss. Footholds never change, so mining cannot break the navigation |
| **Contents of a plain gallery** | 4–7 ore seams (2–5 cells each); 2–4 old Halden lamp posts (unlit); 0–1 Halden note; 0–1 cracked-wall pocket; one haul cart; the cavern's roll content (§3.3) |
| **Dressing** | the biome kit (`biomeKits.ts`), v1's architecture vocabulary (octagonal columns, stair flights on piers, the corbelled shrine, the arched bridge, `crystalSeam()`, dripstone), and a warm practical at every landmark |

### 3.3 Every breakthrough rolls the next cavern (Lumi Master's "each step rolls something", with agency and pity)

The roll is seeded by `runSeed + cavernIndex` in the world grammar, so the world and the model always agree.

| Cavern kind | Share | What makes it | Tease colour leaking through the last 2 slices |
|---|---|---|---|
| Gallery | 52% | the plain contents | pale lantern-white |
| Rich Vein Hall | 12% | 8–12 seams, 3 of them rich (4×) | warm amber |
| Treasure Cache | 8% | a Copper-floor chest on a plinth, 2 seams | gold |
| Crystal Pocket | 7% | 3–6 crystal clusters (rare: 8×, a gem chance) | the biome's gem hue |
| Relic Niche | 6% | a relic in a carved niche (Strike ring), a mural 30% | builders' cyan |
| Cart Depot | 5% | a Halden depot: a crate of "+5 levels" for a random owned line, a free Supply Rope | brass |
| Lamp Hall | 4% | one of the biome's 3 legendary lamps (§4.5) | soft flame |
| Halden Camp | 3% | a cold camp: 2 notes, a planted-lantern plinth, a bedroll and stove (lore) | dim warm |
| Collapse Shortcut | 2% | the next drift is already half dug (K/2) | dust grey |
| Golden Vein | 1% | the Golden Vein event in place (§4.7) | bright gold |

**Fixed placements and pity:**

- **Fixed rooms:**
  - the **Vista** (the biome's Wonder, an authored set piece) at cavern `round(0.35 × N)`;
  - the **Seal Hall** as the last cavern.
- **Keystones** (§4.9): 3 per biome from Glowroot on, spread over caverns `[N/4, N/2, N−2]` and never inside a fork branch.
- **Pity:**
  - a cache at least every 6 caverns;
  - a relic at least every 10;
  - a legendary lamp at least every 5 caverns until the biome's 3 are found;
  - the type never twice in a row, except Gallery.

**Forks (the answer to Lumi Master's "linear" complaint).** From Glowroot on, every 3–5 caverns the far wall has **two
drift mouths**, each lit by its tease colour. For example: left glows amber (Rich Vein), right glows cyan (Relic Niche).

- One tap on a mouth tells the crew to dig that way, and the goal line says "Choose your way".
- The other mouth caves in politely once you pass. The crew salvages a Wood chest from it, so the choice never costs you.
- From Crystal Grotto on, a fork can offer a dust-grey **Collapse Shortcut** (speed) against a gold **Treasure Cache**
  (greed): a real decision.

### 3.4 How caverns stay full (the fix for "horribly empty")

SPEC §6.6's fill contract stays, **re-expressed as what the camera sees from each foothold** (frustum samples), not what a cut
face shows. `tools/fill-scan.ts` checks every generated cavern of the first two cycles.

1. From the entrance foothold: **≥ 3 tappables in view** within 1 s of arrival, the target among them in the tap zone.
2. From **every** foothold: ≥ 1 tappable in view and ≥ 1 more within one glide (≤ 6 m).
3. ≥ 2 light sources in ≥ 2 hues: the warm human light (a lamp, crew lamps or your lantern) plus the biome accent.
4. Empty-floor share ≤ 35% (floor farther than 2 m from any prop or tappable).
5. Vein or crystal cover ≥ 8% of the wall faces seen from the entrance.
6. One hero prop per cavern (the biome kit's medium or hero), and one per 6 m² of dressing on large floors (cap 12 medium).
7. An ambient group in every cavern of ≥ 50 m³: drips, motes, spores, steam or embers. **Inanimate only.**
8. Nothing decorative inside a foothold's 0.6 m clearance, and clear air within 1 m of any tappable, so the action is never
   hidden.

Generation runs in two layers:

- **Authored kits:** 12–20 cavern templates per shape language (organic, angular, built), each with its entrance plate
  composed by hand in the Biome Lab.
- **Procedural variation:** footprint jitter, the dressing, the roll contents and the seam veins.

The kits are what keep the "picture from every spot" promise (R2).

### 3.5 Discovery is lantern-gated: first light, lamps, glints

- **First light.** Every cavern starts dark: fog, the biome's cool fill at 60%, and its emissives (glowroot, crystal, magma
  cracks).
  - Silhouettes and glints read; nothing else does.
  - As you glide in, your lantern pool leads, and the cavern's fill rises from 60% to 100% over 1.2 s.
  - It is the smallest wonder beat, and it happens every 30–60 s. It is done with light, not effects.
- **Relighting lamps.** Each cavern has 2–4 old Halden lamp posts. One tap relights one: a soft *whoomp*, a warm pool, and
  the LightField opens an emitter.
  - The cavern stays lit **for the rest of the run**.
  - Relight them all and the cavern is **charted**: a brass check on the Map, +20 XP and, the first time ever, 1 gem.
  - Looking back through a drift mouth, you see the warm trail of the caverns you lit: your progress drawn in light.
- **Glints tell the tier before the strike** (Lumi Master's colour rarity, our palette):

  | Glint | Tier |
  |---|---|
  | pale | common ore |
  | amber | rich |
  | the biome's gem hue | rare |
  | cyan, builders' script | relic or keystone |
  | gold | Golden Vein |

  A glint is a small highlight on a real 3D object, never a coloured square.
- **Lantern sight.** Lantern upgrades widen the pool (radius 6 m → 9 m → 12 m…) and from Lantern 5 on show **hidden
  pockets** as a faint warm glint through the wall skin, a reason to knock on walls.
- **The tease ahead.** In every frame, one glint of the next find waits a step ahead in the dark (Lumi Master's "the next
  thing is visible before it arrives").

### 3.6 The biomes in this design (identity kept; the creature column replaced)

| # | Biome | Cavern feel and dressing | Signature event (inanimate) | Seal mechanism (weak point) | Vista Wonder (real geometry, window shot) | Legendary lamps (Codex) |
|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | timbered root cellars, Halden crates, the shaft's dusk sky circle | Root Pull (Mash) | the Halden Hatch (the padlock) | the headframe seen from below, the cold camp | the Lift Lamp, the Foreman's Lamp, the Crate Lamp |
| 1 | Glowroot Caverns | root curtains that brighten as your lantern passes, dark mirror pools | Root Bloom (Catch: glowing seed pods drop) | the Root Knot (three amber knots in turn) | the Rootheart, an 18 m glowing root tangle | the Root Lamp, the Pool Lamp, the Hanging Lamp |
| 2 | Crystal Grotto | crystal spires with uplight, the Glimmerfall | Crystal Bloom (Mash) | the Prism Lock (facets glint clockwise) | the Hand in the Crystal | the Prism Lamp, the Echo Lamp, the Spire Lamp |
| 3 | Halden Works | rails, gantries, ore chutes, the foreman's office | Pressure Valves (Catch) | the Crusher (the pressure valve) | the Crusher Hall, 12 m gears under the hoist tower | the Office Lamp, the Furnace Lamp, the Hoist Lamp |
| 4 | Fungal Deep | 2–5 m caps, gills glowing from below (decor only) | Spore Burst (Catch: pods, not animals) | the Spore Valve (sacs pulse in turn) | the Mother Cap, raining spores | the Cap Lamp, the Overgrown Lamp, the Ring Lamp |
| 5 | Drowned Ruins | stepped masonry, arches, still water | Pearl Bubbles (Catch) | the Drowned Bell (the clapper on each toll) | the Drowned Procession; **the Ember Shrine** | the Procession Lamp, the Bell Lamp, the Tide Lamp |
| 6 | Magma Veins | basalt columns, an underlight from lava far below | Lava Surge (Mash) | the Forge-Heart (cooling cracks) | the Forge of the Bearers over a lava river | the Anvil Lamp, the Rack Lamp, the Slag Lamp |
| 7 | Fossil Halls | ribs and vertebrae arching over the floor | Bone Rattle (Sequence) | the Bone Organ (the pipe on the high note) | the Leviathan, a lantern in its eye socket | the Rib Lamp, the Eye Lamp, the Resin Lamp |
| 8 | Frost Hollow | big flat ice facets, light through an ice ceiling | Ice Shatter (Strike) | the Rime Lock-Wheel (its spokes) | the Frozen Waterfall and the frozen Halden crew, lamps raised | the Frozen Lamp, the Aurora Lamp, the Lost Lamp |
| 9 | the Loom | looms, shelves, light threads | Thread Weave (Sequence) | the Thread Lock (thread knots) | the Archive of Light | the Archive Lamp, the Thread Lamp, the Shelf Lamp |
| 10 | Iron Core | heavy plates, pistons, gears turning | Gear Lock (Strike) | the Escapement (the tooth at 12 o'clock) | the Loom's Heart (**Weave**) | the Piston Lamp, the Gear Lamp, the Core Lamp |
| 11 | Star Heart | floating rocks, star glass, gold beds | Star Fall (Catch) | the Astral Geode (stars brighten in turn) | the Buried Star | the Sun Lamp, the Nova Lamp, the Orbit Lamp |
| 12 | Void Sea | islands, upward falls, almost nothing | Gravity Flip (Catch) | the Mirror Gate (it copies your last strike's cell) | the Upward Falls under an aurora | the Island Lamp, the Null Lamp, the Horizon Lamp |
| 13 | the Gate | rune pillars, monoliths, the Lintel | Rune Lock (Sequence of 8) | the Last Lintel (the flame core) | the Last Gate, open from the other side (**Breach**) | the Lintel Lamp, the Black Lamp, your own lamp |

Ores per biome, crew unlocks, music and the colour script stay as in SPEC §6.5 and look.md §4.4. The crew lines `fossilGolem` and
`voidMaw` are renamed as machines: the **Bone Ram** (a bone-framed pile driver) and the **Void Engine**.

### 3.7 Set pieces and wonder moments (frequency ladder)

| Clock | Wonder | How (light and composition, never effects) |
|---|---|---|
| every strike | a glint's tier, a crit's deeper sound | a highlight on a real object |
| every 5–15 s | a seam bursts and its nuggets roll into the lantern pool, then fly to the counter | lit chips, one burst |
| every 30–60 s | **first light** of a new cavern; relighting its lamps | the cavern's fill rises; lamps open emitters |
| every 2–4 min | a chest, a relic, a keystone, a legendary lamp; a fork | the focus view; tease colours |
| every biome (6–25 min early) | **the Vista**: the room opens onto the biome's Wonder at true scale (an 18 m root tangle, a 200 m leviathan) | the window shot, the only slow pitch-up |
| every biome | **the seal and the reveal**: light through the cracking gate, then the next biome's balcony | ≤ 3 s, skippable |
| always, far below | **the Other Lantern**: a warm point in the haze through every shaft, vista and crack, 600 m below your record | a halo pulsing at 0.25 Hz with the music's root (SPEC §7.8) |

### 3.8 The surface camp grows with your fortune

**Fortune** = the number of digits of lifetime gold. It never resets and is shown on the Camp view as "Fortune 24".

| Stage | Fortune | The camp |
|---|---|---|
| 1 | 3 | tents, a campfire, the hand winch over the shaft |
| 2 | 6 | a timber headframe; the first ore shed |
| 3 | 12 | a stone lift tower; rail yard; bunkhouses |
| 4 | 24 | a brass lantern tower; the Relic Cabinet house |
| 5 | 48 | **the Lighthouse**: its beam shines down the shaft (seen from the Landing) |
| 6 | 100 (Googol) | **Lantern City** on the horizon |
| 7 | 303 | **the Lantern Constellation**: the camp's lights rise into the sky |
| 8+ | every +100 digits | a new ring of lights |

**Per-system growth on top of the stages:**

- the Forge chimney grows with pick tier;
- each crew line parks its machine at the camp (a cart, a drill rig, a borer shed, the Gate Engine);
- the Lamp House grows with the lantern;
- the Relic Cabinet shows your relics with their traits;
- the Ember Shrine's flame grows with Embers;
- a lantern garden gains one lantern per Rekindle.

**Where you see it:**

- the menu, from the second launch;
- the return beat;
- every Rekindle (you ride up and the camp has grown);
- Ledger › Camp.

The camp never asks for a chore. It is the trophy room of démesure.

### 3.9 The mystery

SPEC §7.8 is kept whole: who carried light down, and what is the light below? This design delivers it through what an explorer
finds:

- Halden notes on crates and walls;
- the murals in Relic Niches;
- the frozen crew;
- the procession;
- the legendary lamps (each with a one-line plate, 3 per biome);
- the Other Lantern always below.

`src/i18n/en/idleLore.ts` must be written: 42 notes, 14 murals, 14 seal cards, 42 lamp plates and 60 Echo fragments.

---

## 4. The loops, from the second to the week

### 4.1 Strike (≤ 1 s)

Tap → the impact in the next frame (L1) → a crack at the touch point → 1–4 taps → the cell breaks.

**What the break shows:**

- the face splits into 9–12 lit BSP shards (`Shards`);
- dark chips and one low dust puff;
- nuggets roll into the pool;
- 1–6 tokens fly to the gold counter, which rolls on arrival (L8).

**Ore pays more:** copper 2.5×, rich 4×, crystal 8×. HP and gold come from the model (`HP(d)`, gold = HP/100 × kind, L6), so
"harder rock is richer rock" holds everywhere, including in cavern finds.

### 4.2 Seam and step (5–15 s)

- A seam is 2–5 cells. Clearing it pops a final "seam burst": a deeper *clunk* and the seam's last nuggets.
- Then the next glint draws the eye, and one tap glides you 3–6 m (1.7–2.9 s).
- The rhythm is **strike, strike, burst, step**: the go/act binary that carries Archero, made calm.

### 4.3 The cavern (30–60 s in the first run; 10–20 s on re-climbs)

1. Enter: first light.
2. Mine 4–7 seams.
3. Relight 2–4 lamps.
4. Take the roll's prize.
5. Meanwhile the crew digs the drift: the mouth's plate climbs "Breakthrough 62%".
6. Help at the face if you are done (your taps there are the model's tap damage; Rally adds crew DPS on every tap anywhere).
7. Breakthrough: the last slice collapses inward and the tease colour spills out. Tap the mouth.

**The economy's split** (calibration starting values; R6):

- **The face:** K rows of the model (its full cell mix: ore and rare cells appear in the face as embedded nuggets, the latest
  build's 1-in-25-rows chest cell moves to the caverns).
- **Cavern finds** ≈ **0.8 × the face drift's gold**:
  - seams ≈ 70% of that;
  - crystals and pockets ≈ 20%;
  - the wall skin ≈ 10%.
- **Seam cells per cavern:** `min(2.4 K, 48)`. Above that, cells grow "richer lenses", with HP and gold both × K/20, so L6
  still holds.
- **Chests:** about 1 per 2.5 caverns, plus Treasure Caches. Tiers, roll-ups and pity are the model's (`chests.ts`, SPEC §5.8).
- **Value of your taps:** a player's damage on a rich seam pays 4/0.6 ≈ **7× the gold per damage of the crew's rock**, and a
  crit, combo, Surge and Wick stack on top (×10–×100 a crew strike). The crew earns the floor; the player earns the treasure
  (hybrids T2).

### 4.4 The upgrade loop (0.5–5 s between purchases early; démesure late)

**The BEST plate** (the model's payback rule `cost/Δincome + max(0, cost − gold)/income`) is always one tap.

- It is its own progress bar: the fill moves as coins land.
- At 100% it turns amber with one ready ping (at most once per 3 s).
- A hold buys repeatedly with a rising pentatonic arpeggio. A spree sounds like a fanfare.
- Modes: ×1 until the first ★, then NEXT ★ by default, MAX after the first Rekindle.

**The sheets (two taps away):**

- **Tools:**
  - Pick: damage, and a new tool form every 25 levels;
  - **Lantern** (new): light radius 6 → 7.5 → 9 → 10.5 → 12 m…, glint sight from L5, lamps relight from 6 m away from L10;
  - Lucky Strike: crit;
  - Rally: taps add crew DPS;
  - Steady Hand: hold rate;
  - Splash (the model's Shockwave): a strike chips the neighbouring cells;
  - Bellows: Surge length;
  - **Survey Lamps** (new): leash +1;
  - **Sweepers** (new): left-behind sweep +15 pt, from 25% to 100%;
  - gear cards (4 per biome, one-shot ×2/×3);
  - skills (Dynamite, Gold Rush, Overdrive, Earthquake; Cataclysm).
- **Crew:** the 15 lines, then Echo lines. A ★ every 10 levels (×2), a crown every 50.

**The world answers in the same frame:**

- the tool head shines on a pick level, and its **silhouette changes** at every tier;
- a crew rig cheers (a 0.2 m hop and a faster loop for 1 s);
- the lantern's pool breathes once on a lantern level.

**The Wick** (Lumi Master's multiplier with the energy gate removed; unlocks at 240 m, Halden Works):

- Crew carts bring up **lamp oil** as well as gold, offline too, capped at 4 h of oil.
- Tap your lantern to set the Wick: ×1 / ×3 / ×10, with ×25 and ×100 at later biomes.
- A higher wick multiplies **cavern-find** yield ×N, raises glint tiers (rich and rare shares ×1.5 at ×10) and widens the pool
  ×1.25, but burns oil per find broken × N.
- **Empty oil drops the Wick to ×1 by itself. It never blocks a tap.** Greed without a gate: bank the night's oil, then turn
  the wick up in a Rich Vein Hall.

**Lantern Surge** (the model's rhythm meter, made diegetic): no ring on the HUD. The lantern's flame grows with every strike.
When full it blazes for 10 s: taps ×3, the pool ×1.6, a drum layer.

**Démesure without noise** (escalate quality, never quantity; look.md §4.5):

| Tier (pick) | What one tap does at that tier |
|---|---|
| 1–4 | breaks a cell; chips, dust |
| 5 (Gilded) | **Seam Splitter**: a strike on a seam's first cell splits the whole seam in one clean 0.3 s burst |
| 10 (Thunder Maul) | **Cavern Breaker**: a strike on any seam pops every lit seam in the cavern in one 0.6 s chain of large chunks |
| 15 (Void Cleaver) | **Plug Cleaver**: one strike at the face shears the whole drift plug: breakthrough in one hit, when the damage covers it |
| 16+ (Lantern Edge I, II…) | each strike washes the cavern white-gold for 0.2 s; the numbers do the rest |

**The lantern ladder (the viewmodel, lower left):** Tin Lamp → Brass Lantern → Storm Lantern → Glowroot Lamp → Crystal Lantern →
Furnace Lamp → Drowned Lamp → Forge Lantern → Bone Lantern → Rime Lantern → Loom Lantern → Core Lantern → **Sunstone** (its pool
fills a whole cavern at once) → Dawnbringer (it lights the Vista like daylight) → Lantern Flame I, II…

**The tool ladder (lower right):** the model's 15 forms (`TOOL_FORMS`, Rusty Pick → Void Cleaver), then Lantern Edge n. In first
person the viewmodel keeps a fixed size (≤ 12% of the screen). The **impact** shows the head's real scale: from tier 10 the head
lands on the target from off-screen, drawn at its true length.

### 4.5 Collection: the Codex of objects (no creatures)

Each biome page has **14 entries**, as in the SPEC:

| Column | Per biome | Where it comes from |
|---|---|---|
| **Finds** | 6: 2 minerals, 2 fossils, 2 relics | minerals from crystals and geodes; fossils from fossil seams and pockets; relics from Relic Niches, Reliquary+ chests and the seal |
| **Lamps** (replaces the Bestiary) | 3 legendary lamps | Lamp Halls and fixed rooms; relight one to collect it, with its one-line plate |
| **Lore** | 3 Halden notes, 1 mural, 1 seal card | walls and crates; Relic Niches; the first seal break |

**Effects and rewards:**

- A Find gives +3% to one stat of its biome, and each duplicate +1% with no cap.
- A legendary lamp gives **+2% gold**, and each relight in a later run +1 level.
- A complete page grants a **Biome Seal**: +10% gold and power, stamped on the Map.
- Every 10 entries: a Crystal-floor chest.
- Pity (SPEC §7.5): if a page has had no new entry for 6 minutes of active play there, the next cavern rolls one.

**Relics have rolled traits** (Roblox *Dig*'s depth, without the gacha):

- **era:** Halden, Drowned, Bearers', Loom or Star;
- **condition:** Worn, Fine or Pristine, set by the Strike ring (release inside the gold band, 8% of the arc, for Pristine;
  the 25% band for Fine);
- **variant:** Gilded (1/20) or Star-touched (1/200), at ×2 and ×5 effect.

Relics show in the camp's Relic Cabinet.

### 4.6 Idle, the crew and the camp

- **On screen.** Each cavern shows **at most two crew groups at work**:
  - the face crew in the drift mouth (the newest one or two lines, striking on the model's impact frames, so the screen
    and the numbers agree, `CrewRenderer`);
  - one gallery crew or a cart run.

  Other lines are heard (drills, borers) and seen as their machines at the camp. Each hire walks a new worker or machine
  into view. **One rate** (+45/s) sits under the gold. There are no crew numbers on screen (P4, look.md §8 Q5).
- **Haul carts.** A cart stands at each cavern's rail end, filling with nuggets. Tap it to tip it into the counter: +10% of
  the crew's output since you arrived, one token stream. Leave it and it is auto-collected when you leave. A free tap
  reward, never a chore.
- **Offline** (the model's `offline.ts`, exact closed form):
  - efficiency 50% → 75% → 100%; cap 3 h → 24 h (SPEC §4.2);
  - the crew digs up to the leash or the next unopened seal; the rest is gallery gold;
  - chests met go to the Chest Rack;
  - oil accrues once the Wick is unlocked.
- **Sweeping.** Finds you leave in a cavern are swept at 25% of their gold when you leave (Sweepers raise it to 100%).
  Chests, relics and keystones go to the rack. Legendary lamps stay for the run and come back in the next. **Nothing is ever
  lost** (L11).
- **The return beat** (≤ 3 s, skippable by any tap):
  - one calm plate: "While you were away · 5 h 12 m · +3 caverns · +4.2e15 gold · 2 chests on the rack";
  - behind it, the camp at dawn showing its new stage, then a cut to the drift the crew dug;
  - you arrive at the **mouth of the first unlit cavern**, so its first light is yours (P10 without spoiling first sight);
  - one tap on **Collect**: the tokens fly, the rack opens one chest per tap, and the BEST plate lights up.

### 4.7 Events (the Director: `director.ts`, cadence U(40, 70) s of active play, inanimate only)

**First-person placement rule:** an event spawns inside the current view's tap zone, within 6 m, and never behind you. It
is announced by a sound from its side and a glint. **The first time each type appears**, a one-line first-time card explains
it.

| Event | Unlock | Window | Verb (widget) | Reward |
|---|---|---|---|---|
| **Drifting Ember** (replaces the Lucky Moth) | 1:40 scripted, then every 90–180 s | 7 s | an ember rides the cavern's draught; tap it (Catch) | Gold Shower 55%, Ember Frenzy (×7 for 20 s) 20%, 3 gems 15%, skill refresh 10% |
| Golden Vein | 30 m | the next cavern | its seams turn gold-leafed | ×20 gold |
| Glimmerfall | 40 m | 4 s | 5–9 crystals fall from a ceiling crack in front of you (Catch) | 3 s of income each; 1 in 5 is a gem |
| Cave-in | 120 m | a 1 s rumble, then 6 s | 3–5 boulders drop into the pool; tap each 1–3 times | 10 s of income each; leftovers stay as ×3 boulders, never a loss |
| Supply Rope | 180 m | waits 20 s | a crate lowered on a rope; tap it, then pick 1 of 3 boosts (Pick widget) | SPEC §5.11 |
| **Treasure Map** | 320 m | — | chalk arrows appear on this cavern's walls toward a buried chest behind the wall skin; follow them and dig | a Crystal-floor chest (exploration as the reward) |
| Ancient Echo | 400 m | 6 s | 3–4 runes light on the wall in order; tap them back (Sequence) | a Lore fragment and 10 gems |
| Geode | rare from 120 m | while exposed | 3 needles (Strike) | perfect: a rare Find + 5 gems |
| Biome signature | per biome (§3.6) | 6–10 s | a themed widget | 60 s of income and a Find roll |
| Meteor | Starlit mutator | 3 s | tap it as it falls through the cavern | a ×20 blast and 2 gems |

The Director rules stay:

- never two events at once, never during a seal or a ceremony;
- rotation pity;
- after 20 s idle, only waiting events are dealt;
- the **find guarantee**: if nothing new has entered the view for 10 s of active play, a micro-surfacing appears within
  1 s (a glint in the wall skin, a nugget rolling from a crack).

The Mimic and the Treasure Mole are deleted. The Mimic's slot becomes a **Wedged Chest**: a chest caught in a crack that is
slowly closing; five taps on the crack free it before it shuts. It is purely mechanical, with a Crystal floor.

### 4.8 Achievements, rank and records

- **Feats** (`feats.ts`): 20 families with tiers I–X then endless, +1 Mark each (+1% damage and gold).
  - **Kindred** becomes **Lamplighter**: lamps relit at 5, 25, 100, 300, 1K, 3K, 10K, 30K, 100K and 300K. Its tier X perk:
    lamps relight themselves within 6 m.
  - A 21st family is added, **Cartographer**: caverns charted at 3, 15, 50, 150, 400, 1K, 2.5K, 5K, 10K and 25K. Its tier X
    perk: charted caverns are swept at 100%.
- **Secret feats** (12): Moth Friend becomes **Every Flame** (relight every lamp in one biome in one run). **First Light**
  (enter a Vista with the Wick at ×10 or higher) and **Dark Walker** (break a seal without relighting a single lamp in that
  biome) are added; Patience, Night Owl, Clean Sweep and the others stay.
- **Rank:** the model's rank (XP from everything, never resets; +0.5% per rank, chests every 5, titles from Scratcher to
  Lanternlord). It sits behind the Ledger: a badge on the Ledger plate only on a rank-up.
- **Records:** splits per biome ("Crystal Grotto 18:12 · −4:40", green splits pay 5 gems).
  - The **ghost lantern** of your previous run burns pale blue at a drift mouth when you are behind it ("+2 caverns ahead").
    Overtake it and it bursts into blue sparks.
  - **Planted lanterns** from Rekindles burn in the caverns at the depths you reached. Tap one for +2% damage for the run.
- **Contracts and the daily:** after the slice, the model's 3-card Board (90–240 s contracts; one always points at an unused
  mechanic, which here includes "chart a cavern", "relight N lamps" and "take a fork"). The Daily Lantern Chest and the
  7-day calendar pause on a missed day and never reset.

### 4.9 The biome loop: keystones, the seal, the reveal (6–25 minutes each early on)

- **Keystones** (Lumi Master's zone tracker, made physical):
  - from Glowroot on, each seal shows **three empty sockets**;
  - three keystones (cyan builders' glints) hide in the biome's caverns at fixed fractions (§3.3);
  - pry each one out in the focus view; it flies to the goal line ("Root Knot · keystones 2/3");
  - the Lantern Walk stops at keystones, and swept ones go to the rack, so a keystone can never be missed;
  - charted gates (a seal opened in an earlier run) need none.
- **The seal fight** (SPEC §7.1, kept):
  - the gate mechanism fills the frame at 30–70% of the height;
  - HP = 20 s × (crew DPS + 4 × tap); the crew hammers it too;
  - the weak point lights every 5 s for 1 s (×5);
  - at 25%, a Strike ring (a perfect release is a ×10 hit);
  - the goal line becomes the seal's bar and timer ("Halden Hatch ▮▮▮▮▯ 0:22");
  - a fail keeps 50% and you can start again at once.
- **The win:**
  - a 60 ms hit-stop;
  - one 0.4° / 120 ms shake;
  - one full-frame lift of 0.12 for 150 ms (the only full-frame flash in the game);
  - light pours through the widening cracks;
  - you glide through into the reveal (§2.5).
- **What it unlocks:** a new crew line blueprint, 4 gear cards, a new event type, the biome's Codex page and, from the second
  seal on, a facet hand (SPEC §5.10, after the slice).

### 4.10 Prestige up to démesure (the model's three layers, kept with their formulas)

- **Rekindle at the Ember Shrine** (600 m, Drowned Ruins):
  - `EmbersTotal(R) = floor(25 × 2^((R − 600)/200))`: "every new 200 m of record doubles your Embers";
  - each Ember is +10% damage;
  - perks from 1 to 1e8 Embers (auto-buy, Head Start, offline caps), as in SPEC §5.9.

  In first person you hold your lantern to the Shrine's flame (a 0.6 s hold on the brass ring). The flame passes into it,
  you ride up (a cross-fade montage), and the camp has grown. Your lantern is planted at the depth you reached. The next
  run re-rolls every cavern.
- **Head Start:** a cage drop to 10–30% of your record (a cross-fade with the depth counter rolling); the passed caverns are
  charted and swept.
- **Weave at the Loom's Heart** (3,100 m, Threads, Loom nodes).
- **Breach at the Last Gate** (5,800 m, eight challenge runs with endless tiers). One Breach challenge is reinterpreted:
  - **Blind** becomes "no lantern sight": glints show only within 2 m.
  - **Lanternless** is added: no lamps can be relit, and the Sigil is lantern radius.
- **Echo strata** (6,900 m + 1,100 m n) replay a biome hue-rotated with a mutator. The "Inverted" mutator loses "creatures
  walk on ceilings" and keeps debris and set pieces upside down.
- **Démesure:**
  - numbers to 1e2091 with letter pairs, then scientific (`big.ts`);
  - tool forms to the Void Cleaver, then Lantern Edge ∞;
  - the lantern to the Sunstone, then Lantern Flame ∞;
  - machines from the Shovel Hand to the Gate Engine;
  - the camp from tents to the Lantern Constellation.

### 4.11 The clocks and the pacing targets (first run; recalibrate with an explorer bot)

| Clock | What completes |
|---|---|
| ≤ 1 s | a strike; a cell |
| 5–15 s | a seam; a glide; a purchase |
| 30–60 s | a cavern: first light, lamps, finds, the breakthrough |
| 2–4 min | a chest or relic, a ★, an event, a fork, a keystone |
| 6–25 min (early) | a biome: the Vista, the seal, the reveal, a new crew line and gear |
| a session (5–15 min) | the return haul, 0–3 unlit caverns, the daily chest, contracts |
| a day | 2–4 biomes; Rekindles from 600 m; a camp stage |
| a week | Weave (3,100 m), Breach (5,800 m), Echo strata, Feat tiers, Codex pages |

| Milestone | Target (active play) | Why |
|---|---|---|
| first cell | ≤ 5 s | Lumi Master's immediacy |
| first purchase / first hire | ≤ 30 s / ≤ 45 s | — |
| the Halden Hatch (40 m) / Glowroot reveal | 5:30–6:30 / ≤ 7:00 | a biome in the first 10 minutes, with time to *explore* it |
| Crystal Grotto (120 m) | 15–22 min | one biome per 10–15 min early (hybrids P9) |
| Halden Works (240 m) | 30–45 min | the Wick arrives |
| the Ember Shrine (600 m) | 90–150 min of play, plus offline | the first prestige in the second or third session |
| longest gap between completions (first 30 min) | ≤ 30 s | SPEC L4, kept |

**Calibration note.** The model already runs 4–5× too fast (reuse §1, the four known gaps). Removing the creature and moth
income and adding exploration time both slow it. **The curves stay**. The knobs, in order:

1. `K(b)`;
2. the cavern-find factor (0.8);
3. the leash;
4. the Ember constant 25.

`tools/econ-sim.ts` gets an **explorer bot**: it glides 25% of its time, taps seams first, helps at the face when the seams
are done, and buys BEST.

---

## 5. The always-shown objective

**One line, in every frame of play**: the top band's second row, with an icon, ≤ 32 characters, a 3 px progress bar and the
reward chip. It is shown with a sheet open and during ceremonies too. It follows the model's `goals.ts` selection
(re-evaluated every 0.5 s, the first match wins, a 4 s hysteresis), re-worded for exploration:

1. a tutorial step ("Tap the copper", "Tap the light to walk", "Hold to dig");
2. something to claim ("Collect your haul", "Open the rack · 2");
3. a choice ("Choose your way": a fork);
4. a keystone or seal in this biome ("Root Knot · keystones 2/3", "Break the Root Knot · 30 s");
5. Rekindle recommended ("Rekindle: +273 Embers · ×6.5");
6. the Path step (SPEC §8.5's 30 objectives, re-worded: "Relight 3 lamps", "Chart a cavern", "Take a fork");
7. the best near goal (progress in [0.15, 1), ETA ≤ 90 s): the next ★, a gear card, the next Feat tier, a contract;
8. fallback: "Break through · 62%" (the face) or "Explore · 3 finds left".

**Every goal has a world anchor**, and only one in-world hint shows at a time:

- a calm **static amber rim** on the target object, or
- the warm footprint ring for a place.

No 450 px pulsing rings and no pointing hand after the tutorial. Tapping the goal line does one of two things:

- it glances toward its anchor (≤ 26°, rimming it for 2 s);
- or it opens the right sheet at the right card.

**On completion** the bar fills with one flash, the reward flies to its counter, and the next goal **slides in without
emptying** (median fill ≥ 0.55 in the first hour, SPEC E12).

---

## 6. The first 10 minutes on a phone, minute by minute

Topsoil's five caverns are **authored**:

| Cavern | Depth | Contents |
|---|---|---|
| T0 the Landing | 0–8 m | the ladder foot under the dusk sky circle, a copper seam, the first face, 1 lamp |
| T1 the Root Cellar | 8–16 m | a chest, 3 seams (1 amber), note #1, 2 lamps |
| T2 the Fork | 16–24 m | two mouths, a cracked-wall pocket, 2 lamps |
| T3 the Glimmer Pocket | 24–32 m | 3 crystal clusters, the first relic niche, 3 lamps; Dynamite and the Lantern Walk unlock |
| T4 the Hatch Hall | 32–40 m | the Halden Hatch in the floor, green light through the planks |

One ceremony at a time; steps never overlap. Times assume an average player at 2–3 taps/s.

| Time | What the player sees and does | Feeling |
|---|---|---|
| 0:00 | Fade from black: the camp at dusk, the headframe, a lantern-O match-cut, a cross-fade down the shaft (skippable, 3 s). | "Where am I going?" |
| 0:03 | **The Landing.** You stand at the ladder foot, the dusk sky circle 20 m above. Your lantern (lower left) throws a warm pool; a copper seam glints 2 m ahead. Goal line: "Tap the copper". | calm, inviting |
| 0:05 | Tap: the pick swings from the lower right, the nugget cracks and bursts, one coin flies up and **the gold plate drops in with it**. Two more taps: the seam is gone with a deeper *clunk*. | the first dopamine at second 5 |
| 0:10 | A warm footprint ring on the floor by a lamp post 5 m ahead: "Tap the light to walk". Tap: the view turns 12°, then glides 2.6 s. No bob. The lantern and pick stay still. | "Oh, I can go anywhere I see" |
| 0:13 | You arrive facing the **face of the way down**: 7 cells, rim lit, a Halden plaque "Lift 1 · 8 m". The lamp post beside it: one tap relights it (*whoomp*), and the Landing warms. | the lamplighter's joy |
| 0:15 | "Hold to dig": a hold ring under the thumb; strikes at 3/s; cells break in 1–2. Slices peel and the depth plate drops in ("1 m"). | the clicker rhythm |
| 0:25 | Gold ≥ 30: the **BEST** plate rises, amber, "Pick · 30". Goal: "Upgrade your pick". Tap: the pick head shines and "+100 / strike" rolls in. | the first upgrade felt in the hand |
| 0:45 | Gold ≥ 50: BEST shows "Hire a Shovel Hand · 50". Tap: a miner climbs down the ladder at the left edge, walks to the face and shovels beside you. "He digs while you're away." | not alone anymore |
| 0:50–1:05 | You and he dig the face; Pick 3–4. Goal: "Break through · 70%". | — |
| ≈ 1:05 | **Breakthrough**: the last slice collapses inward and cool air leaks from the dark. "Tap the passage." Tap: a 3 s drift glide down a timbered ramp, timber sets passing overhead. | anticipation |
| 1:10 | **First light: the Root Cellar.** Your pool leads in; hanging roots, Halden crates and an amber chest glint on a ledge resolve out of the dark over 1.2 s. "Tap the chest." | wonder, small and frequent |
| 1:15 | The focus view eases in. One tap: the lid opens, Wood → **Copper** (scripted), coins and 3 gems fly; the gem chip appears. | a payoff |
| 1:20–2:30 | **Free exploring**: two copper seams, one **amber** seam (rich, 4×: a jackpot *clunk*), Halden note #1 ("Day 40. Lamp seen below the lift. Nobody of ours is down there."), two lamps. Relight both: the cellar is **charted** (a brass check, +1 gem). BEST every few seconds: Pick 5–8, Shovel Hand 2–9. The crew digs on in the far mouth. | freedom, a lot to touch |
| 2:00 | Shovel Hand level 10: the first **★** (×2). The card flips once, and the miner gains a helmet lamp you can see. | progression made visible |
| 2:20 | 16 m: the **Pick Crew** blueprint. Two miners walk in and take a ledge by the face, swinging in turn. The rate under the gold doubles. | the crew grows |
| 2:45 | Breakthrough. Glide into **the Fork**: two mouths on the far wall, the left glowing **amber** (Rich Vein Hall), the right **gold** (Treasure Cache). "Choose your way." | agency |
| 2:55 | A cracked wall near the entrance: one tap, and the skin breaks open on a **hidden pocket** with a gem. "Some walls hide things." | curiosity rewarded |
| 3:00 | Delver I (20 m), one quiet toast at a time; Rank 2 badges the Ledger. You tap the right-hand mouth and the crew starts digging there. | — |
| 3:10–4:00 | Explore the Fork's seams; the BEST plate offers Lucky Strike; the first crit (a deeper sound, a wider crack). Breakthrough at about 3:50 into the **Treasure Cache**: a chest on a plinth. Copper floor, rolled honestly: Crystal! | greed, satisfied |
| 4:10 | Next cavern: **the Glimmer Pocket**. Cyan crystal clusters glint at the back. "Tap the crystals." Each break chimes a note of the biome's scale; the first gem cell pays a gem. | beauty |
| 4:25 | A carved niche: the first **relic**. The focus view: "Hold… release in the gold." A brass ring closes; you release: **Fine**. "Halden Lamp Hook · Halden era · Fine." The Codex badges the Ledger. | skill, collection |
| 4:40 | 30 m: **Dynamite**. The Skill plate appears with one free charge: "Dynamite: blast 3 m". Tap: the Shovel Hand sets a charge, a 0.8 s fuse, a *whump* and a dust puff. No shake. 3 slices gone. | power |
| 5:00 | **The Lantern Walk** unlocks: "Hold the floor to walk on." Hold: the ring fills, and the lantern mines the last seams by itself and stops at the open mouth. | relief, idle comfort |
| 5:20 | Breakthrough into **the Hatch Hall**. Green light seeps between the planks of a timber hatch in the floor, chained, with a brass padlock. The crew gathers round. "Break the Halden Hatch." | tension |
| 5:30 | **The seal fight**: the goal line becomes "Halden Hatch ▮▮▮▮▮ 0:30" and a tension drum enters. The padlock lights every 5 s (×5). At 25%: the Strike ring. You release in the gold: ×10. | the thrill |
| 5:50 | **The win**: a 60 ms hit-stop, one small shake, the planks burst, and green light floods up. A glide down through the hatch onto a root balcony: the **window shot** of **the Rootheart**, an 18 m glowing tangle far below, with a slow pitch-up. "GLOWROOT CAVERNS" carved in light (≤ 3 s). | **the wonder beat** |
| 6:00 | Four gear cards fly to the Tools plate (one badge); the Mine Cart blueprint arrives. Goal: "New gear: one tap, big boost". | a new chapter |
| 6:10–7:00 | Stairs lead down from the balcony. Roots brighten as your lantern passes (the deep "remembers" light). Tin and **jade** seams, glowroot lamps. Hire the **Mine Cart**: a rail lays across the cavern, and carts rattle past the mouth every 6 s. | a different world |
| 7:00 | The lantern's flame has been growing: **SURGE**. It blazes, your pool widens to 1.6×, taps ×3 for 10 s, the drums enter. | a rush |
| 7:30 | The first event: **Glimmerfall**. A ceiling crack sheds 7 crystals into the pool in front of you; tap them as they fall. A first-time card explains it. | play |
| 8:00 | Cavern G2: a cyan builders' glint in a niche, the first **keystone**. Pry it out, and it flies to the goal line: "Root Knot · keystones 1/3". | a clear medium goal |
| 8:30 | A **Drifting Ember** rides the draught across the cavern; tap it: Gold Shower. | a surprise |
| 9:00 | G3 is a **fork**: amber (Rich Vein) against cyan (Relic Niche). You choose the relic. | a decision |
| 9:30 | Through a crack in G3's floor, far below in the green haze: **a single warm point of light**. A Halden note: "The roots lean toward the lamp. Like they remember one." | the mystery begins |
| 10:00 | The goal line reads "Root Knot · keystones 1/3 · 4 caverns". The crew is a cavern ahead. The player knows four verbs (strike, go, hold, the Lantern Walk) and has seen two biomes, 9 caverns, 3 chests, a relic, a seal, a Vista tease and the Other Lantern. If they close the app now, the crew will dig 3 caverns and wait in the dark for their light. | "one more cavern" |

---

## 7. Visual direction: answering "horrible, glitchy, illegible"

### 7.1 The look in one line, and what we take from Lumi Master

**"Lamplit Faceted, with a storybook grade."** A warm lantern pool on faceted, hand-made-looking stone, the next treasure
glinting in the dark ahead, and everything else quiet (look.md §3).

From Lumi Master we take only its **visual grammar**, which the research describes but nobody here has seen: read the frames
in `lumi-master.md` §5.9 before the grade is locked. That grammar is:

- moving *into* the picture in first person;
- few tones per form;
- warm, lifted mid-tones;
- soft but layered colour;
- one focal event per beat;
- calm grounds with small accents;
- short reward beats.

We do *not* take its flat painted 2D. DEEP DOWN's edge is **real 3D light**: a real lantern that lights real caverns, which is
the director's "REAL 3D".

### 7.2 Camera (summary of §2)

- First person, eye 1.6 m, hFOV 52° locked, pitch −8° (−6° at the face), roll 0.
- No bob or sway, and zero camera motion on taps.
- Glides rotate first, then translate at ≤ 2.5 m/s.
- The viewmodel is drawn with its own fixed 58° camera, ≤ 12% of the screen.
- Tappables stay in the central 15–70% of the height, where the lens stretches ≤ 1.3×.
- The HUD sits in the most-stretched top and bottom bands.

### 7.3 Light (look.md §4.2, applied to free exploration)

| Light | Spec |
|---|---|
| **Key: your lantern** | a point light at the lantern viewmodel (≈ −0.30, −0.45, +0.35 m from the eye), held low and left so it is not a camera flash. `#ffe6c6` at the core shifting to amber `#ffb35c`; windowed inverse-square over the lantern radius (6 m at the start, an upgrade line); the lit side of a mid-albedo face at 1.5 m reads 0.65–0.75. The existing `LanternField` (32³ visibility, real wall shadows) moves its source to the hand |
| **Fill** | hemispheric, the biome's cool "open" colour, 20–35% of the key at the face. **60% in an unlit cavern, 100% after first light.** Darks never below display 0.04 over large areas |
| **Rim / far light** | the next drift mouth or the next biome's accent at the far end, lighting only back-facing edges: it separates silhouettes and leaks what is ahead |
| **Practicals** | relit Halden lamps, crew helmet lamps, crystals, magma. The **4 nearest are per pixel**; the rest are baked into vertex colour and the `LightField` volume. Every cold space keeps one warm practical |
| **AO** | per-vertex, baked by the mesher; no SSAO |
| **Shading** | wrapped Lambert (wrap 0.3), softly quantised into 3 steps. Specular only on metal, crystal, ice and wet stone |
| **Grade** | exposure **1.0 ± 0.15** (raise the lights, never the exposure); saturation ≤ 1.0; bloom threshold ≥ 1.0 at strength 0.15–0.25; a LUT pair per biome; vignette 0.15; dither. **No** chromatic aberration, lens flare, grain, motion blur, iris or shock passes |

### 7.4 Palette rules and the colour script

- **60/30/10:**
  - 60% cool dark stone (value 0.05–0.25, saturation ≤ 25%);
  - 30% warm lantern-lit mids (0.30–0.65);
  - **≤ 10% accent** (glints, gems, runes, the next biome's glow).
- **Amber is constant across all 14 biomes**: the lantern, the crew, the BEST plate, "you are here".
- **Darks are hued per biome** (blue-black, green-black, violet-black), never grey or brown.
- **One value peak per frame**: the current target is the brightest large area, ≥ 1.6× the frame mean and ≥ 1.3× any other
  window of the same size. Neighbouring tappables are ≥ 20% dimmer until they become the suggestion.
- **Red is for danger only**; magma is orange and yellow.
- **Neighbouring biomes alternate their value key** (low-key, high-key), so every gate opens onto a visibly different world.
- **Never neon**: no hue at full saturation and value over more than 0.5% of the frame.
- **Two registers, never mixed**:
  - amber and brass for what you own and do;
  - cyan builders' script for discoveries, relics and keystones;
  - violet for the unknown and locked.
- The 14-biome colour script (key, fog, accents, shape language, wonder) is look.md §4.4's table, adopted as is.

### 7.5 Materials (no texture that can stretch, crawl or seam)

| Family | Treatment |
|---|---|
| Natural rock | faceted low poly (0.25 m facets within 3 m, 0.6–1 m on far walls), flat normals, deterministic vertex jitter per world position (neighbours never jump when a cell breaks), vertex colour from the biome's 5-stop ramp (warm at the top, cool in shadow: the "painted gradient across form"), baked AO. Strata are real ledges |
| Ore seams | **instanced 3D nuggets** (6–20 cm angular lumps, 3–12 per cell) half-sunk in a darker matrix lens, metal response with one crisp highlight that carries the tier glint. Legible by silhouette and highlight before hue |
| Crystals and gems | instanced faceted prisms in clusters of 3–9, opaque bodies with a fake inner glow ≤ 1.5 HDR |
| Chests, relics, keystones | authored bevelled boxes (v1's prop language, 0.02–0.04 m chamfers), brass bands; a soft amber rim only when it is the current target |
| Timber, rails, carts, machines, the camp | bevelled boxes and lathed cylinders (`render/props/*`, `render/structures/*`); grain as 2–3 vertex-colour stripes |
| Masonry (Halden Works, Drowned Ruins, the Loom, the Gate) | real blocks in courses with 1–2 cm joints in AO |
| Runes and builders' script | **carved grooves**, 2–4 cm deep, emissive only at the bottom of the groove, waking over 0.6 s as the lantern approaches |
| Halden lamps | a bevelled lamp body; unlit it is dark glass, lit it is a warm emitter with a capped halo card (no bloom blob) |

The only textures allowed: 1D ramps, one low-frequency value-noise tint (features ≥ 0.5 m, ±4%) and the brand's UI.

### 7.6 The FX budget (a hard cap, counted by the FX director and asserted in tests)

| Budget | Exploring and digging | Glide | Ceremony (one at a time) |
|---|---|---|---|
| Foreground moving groups (tool, debris burst, token flight, counter roll, destination ring) | **≤ 3** | ≤ 2 (the ring, the counter) | ≤ 3 (owned by the ceremony) |
| Ambient groups (the face crew, a cart run, motes, a lamp flicker) | **≤ 2** | ≤ 2 | 0–1 |
| Live particles | **≤ 40 per burst, ≤ 80 total** (High ×1.5, Battery ×0.5) | ≤ 20 (motes only) | ≤ 120 |
| Particle screen area | **≤ 6%**, any particle ≤ 32 px, lit by the scene (dark chips, a low dust puff, never cream discs) | ≤ 2% | ≤ 12% |
| Camera motion from FX | **0** | 0 | ≤ one 0.4° / 120 ms shake (seal, Earthquake, vault only) |
| Hit-stop | 0 | 0 | 50–70 ms (seal, vault, geode) |
| Flashes | local only: the struck facet +0.4 for ≤ 80 ms | none | one 0.12 full-frame lift ≤ 150 ms (seal opening only) |
| Post theatrics (iris, shock ring, chroma, rays, bloom pulse) | **none, ever** | none | none: use light (a seam of light widening) |
| Floating numbers | ≤ 1 (an accumulating number on the current target, off by default) | 0 | the ceremony's own |
| Length | — | ≤ 5.3 s (12 m) | **≤ 1.2 s** (a chest, a ★); a biome reveal ≤ 3 s; all skippable |
| UI loops (pulse, breathe) | **≤ 1**: the objective's ready state | 0 | 0 |

**Upgrades escalate quality, never quantity:**

- the tool's silhouette and material change;
- chunks get bigger (a cell, then a seam, then a cavern's seams in one chain);
- sounds get deeper;
- the counter rolls faster;
- the depth numbers get absurd.

The particle cap never moves. A late-game strike that clears a cavern is **one** big, clean event.

### 7.7 UI calmness rules ("Lamplight on the Lintel", first person)

1. **The 3D view takes ≥ 80% of the screen** unobstructed in play. The HUD bands are top ≤ 9% and bottom ≤ 11% (76 px and
   90 px at 390 × 844).
2. **Opaque octagon plates, no glass.** Slate-900 at 0.94, a brass rim, Lintel numerals. "No rounded rectangles, no pills, no
   glass, no backdrop blur." This reverses the latest build's glass HUD.
3. **≤ 5 numbers** in play; **one objective line**; **one in-world hint** (a static rim or the footprint ring); **one badge**
   at a time.
4. **Still when idle.** The UI animates only on a state change: enter is an 8 px rise plus fade in 160–240 ms; exit is a
   140 ms fade. A counter pops for 160 ms on arrival. Nothing on the HUD shakes or moves with the camera.
5. **Text:** body ≥ 15 sp, labels ≥ 13 sp, never under 12. Contrast ≥ 4.5:1 on an opaque plate, never directly over the 3D
   scene.
6. **Sheets** cover the bottom ≤ 55% and dim the world 30%. The world behind keeps going without effects.
7. **No offer icons, no edge clutter.** There is nothing to sell, which turns Lumi Master's biggest UI complaint into our
   advantage.
8. **Progressive reveal** (SPEC §8.3, re-timed to §6):

   | Element | Appears at |
   |---|---|
   | goal line | 0:00 |
   | gold | the first break |
   | depth | the first slice |
   | BEST | 30 gold |
   | Tools and Crew plates | the first purchase |
   | gem chip | the first gem |
   | Skill plate | 30 m |
   | Ledger badges | as each sheet unlocks |

### 7.8 The verdict, answered complaint by complaint (each with an automatic capture test, look.md §6)

| The director said | Root cause in the old builds | The rule here | Automatic check |
|---|---|---|---|
| "Visually horrible, very ugly" | pixel textures smeared on sculpted rock (v1); sticker tiles on a cut plane (latest); mud in one value band | (1) no texels on the world; (2) valuables are 3D objects; faceted rock with painted vertex gradients and baked AO; 60/30/10 values | a sampler lint on terrain materials; a streak detector; "≥ 6 silhouette edges per valuable"; a value histogram per biome |
| "Lots of visual glitches" | seams where two painters meet; billboards floating in vistas; an orb inside rock; near-plane slicing; the camera inside walls (v1) | (9) geometry hygiene: one material path per surface, vistas as real geometry, every sprite depth-tested, footholds ≥ 0.6 m from rock, facet vertices stable when a neighbour breaks | face-ID flicker capture; a sprite occlusion test; a post-break pixel difference ≤ 2% outside the cell; a near-plane test over 2,000 paths |
| "The animations are far too present" | 240–650 particles, a shock ring and shake on every break, a permanent sway, chroma, iris | (6) the motion budget of §7.6; zero camera motion on taps; no sway or bob; (7) one ceremony at a time, ≤ 1.2 s; no post theatrics | the FX director asserts live groups; the camera matrix is identical after 100 taps; a lint on post params |
| "The screen is illegible" | about ten things competing; a third of the screen HUD; exposure at 1.85–2.6× clipping every valuable | (3) one value peak, on the target; (5) light, don't expose; (8) the world ≥ 80%, ≤ 5 numbers, one hint | target luminance ≥ 1.6× the mean; clipped pixels ≤ 1.5%; DOM measure of HUD rects; a 25% grayscale thumbnail "where do I tap?" read in < 1 s by a human |
| v1: "nothing is indicated, the caverns are horribly empty" | no guidance; sparse props; empty floors | the objective line in every frame with a world anchor; the fill contract from every foothold (§3.4); the tease glint ahead | `fill-scan` over frustum samples; a goal coverage test (100% of 0.5 s samples) |
| v1: "mining is horrible, the controls are unpleasant" | joystick plus a Mine button; aiming; the body hiding the target | tap the thing itself; reach-based strike or approach; hold to keep mining; no body | e2e real touches: 0 misses in 1,000 taps; impact in the next frame |

**Meta-rule.** Every look round ends with a side-loaded APK and three screenshots taken **on the director's phone** at arm's
length. A round never passes on desktop captures alone.

---

## 8. What code is reused (and what is new for this angle)

Verdicts follow `reuse.md` §3; only the decisions specific to this design are spelled out.

| Area | Reuse | New or changed for fp-free-explore |
|---|---|---|
| Pure idle model `src/idle/**` | **keep** the economy whole: `curves`, `cells`, `shaft` (rows → the face rosette, κ, crumble, pierce), `tap`, `run` (BEST), `crew`, `offline` (closed form), `chests`, `seals`, `director`, `widgets`, `goals`, `tutorial`, `hints`, `codex`, `feats`, `rank`, `records`, `prestige`, `facets`, `contracts`, `daily`, `big` | **new pure modules:** `model/cavern.ts` (the seeded cavern roll, its find ledger as cells with HP(d) × kind, keystones, legendary lamps, forks, pity) and `model/explore.ts` (lantern finds, sweep, leash, Wick oil, charted state). `offline.ts` gains the leash stop depth. **Purge** (reuse §4): creatures, the Moth, the Bestiary → Lamps, the Kindred feat → Lamplighter, Wardens → mechanisms, `fossilGolem`/`voidMaw` → the Bone Ram and the Void Engine |
| World | **keep** `VoxelWorld`, `raycast`, RingWorld's y ring (drop `RING_CUT_Z` and `openBack`), `slabWorker`/`slabLoader`/`slabLight`, `slab.ts` passes 1–3, `biomeKits` (purged), `LightField` + `LanternField` (source moved to the hand) | **new:** `world/descent/cavern.ts` (the cavern grammar: kits, the corkscrew stack, drifts, sockets, the entrance plate), `world/descent/footholds.ts` (a 0.5 m walk grid, A*, string-pulling, interest yaw; built in the worker, immutable per cavern). **Mine** v1 `generateWorld.ts`'s architecture vocabulary. **Adapt** `caverns.ts` dressing and `fill.ts` to foothold frustum samples |
| Meshing and render | **keep** the mesher (flat-normal faceted variant per the spike), `meshPool`/`meshWorker`, `ChunkRenderer`, `Renderer`, `PostFX` (re-tuned: iris, shock and chroma off), `QualityGovernor`, `GpuParticles` (remove the z 60/57 planes), `Shards`/`fracture`, `PropRenderer` (already has `raycast`), `StructureRenderer`, `setPieces` (re-lit as Vista rooms), `Lanterns` (the planted lanterns and the Other Lantern) | **new:** `render/hybrid/DepthScene.ts` (a facade with DescentScene's API: `applyBreaks`, `strike`, `burst`, `pickEntity`, `frame`), `render/hybrid/Viewmodel.ts` (tool and lantern, own camera, the tier ladders), `render/hybrid/StationCrew.ts` (from `CrewRenderer`: the face crew, gallery crews, cart runs), `render/hybrid/CampScene.ts` (from `SurfaceSky` rewritten + props + structures, camp stages) |
| Camera and input | **mine** v1 `ropeRide.ts` (the glide), `lockedVerticalFov`, `MiningController.pick()`, `TapController`'s 30 px fat finger, `runeDoor.ts` (hold-to-wake for the Shrine and the seals); **adapt** `TapSurface` (keep the ring, hold stream and 8/s cap; drop the columns), `core/spring` and `ease` | **new:** `game/hybrid/FirstPersonCamera.ts` (rotate-then-translate glides, look-at, arrival framing, re-orient, glance, focus view, reduced-motion cross-fades, comfort tests), `game/hybrid/WorldTap.ts` (§1.2), `game/hybrid/LanternWalk.ts` (autopilot with stop rules) |
| Shell, juice, UI | **adapt by copy** `IdleGame` → `game/HybridGame.ts` (boot, modes, fixed step, autosave, lifecycle, offline return, Back, crash); **turn down** `JuiceDirector`/`juiceBudget` (taps T1, breaks T2, T3+ only for chests, seals and reveals); **re-stage** the ceremonies (Chest, BiomeReveal, PickTier, Rekindle) as focus views and window shots; **keep** the brand kit, the display ledger, `Ticker`, `layout.ts`, haptics, `GoalBar`, `QuickBuy`/`Card` (BEST), `Sheet`, `FirstTimeCard`, `ReturnFeast` (calmer), `SealHud` | **new:** a calm HUD restyle (`ui/hybrid/*`: 4 plates + the Ledger, opaque plates, no glass), the Map tab (caverns, lit trail, crew front, keystones, seal, record, the Other Lantern), the Camp tab |
| Save | **keep** `SaveSystem`, `settings.ts` | **v4:** the cavern index; per-cavern bits for the ~10 caverns in the ring (mined cells, lamps lit, finds taken, keystones); face slices and fractions; the leash front; Wick oil; Fortune; the camp stage. Decide the v3 migration (reuse R10) |
| Audio | **keep** the synth, `MusicScheduler` and SFX recipes | remap `eventMap.ts`: footsteps-free glide hush, lamp *whoomp*, seam *clunk*, cart rattle, breakthrough rumble, focus open |
| Tests and tools | **keep** the pure unit tests, `tests/e2e/touch.ts`, `release.spec.ts`, `apk-sim.mjs`, `perf.mjs`, `econ-sim` | **new:** `firstPersonCamera.test` (§2.7), `worldTap.test` (0 no-ops; reach and approach), `footholds.test` (every socket reachable within 4 m; a path from the entrance to every foothold; clearance), `cavern.test` (determinism; the roll and pity; fill from footholds), an explorer bot in `econ-sim`, a first-person scene in `perf.mjs`, an e2e `hybrid-slice.spec.ts` |
| Delete | v1's CameraRig, PlayerController, TouchControls/joystick, survival, inventory and crafting, walk-home BFS fields; the tree's foreman ExplorerModel, `Creatures.ts`, creature models, `look.ts` section paint, `SectionField`, `DescentCamera` (keep the spring maths) | — only after the slice gate passes; `main.ts` switches once |

**Size estimate for this angle's slice:** about 5–6k new or adapted lines. That is about 1k more than reuse §7.3's station
slice, for the footholds, WorldTap and the Lantern Walk.

---

## 9. Risks (ranked, with mitigations)

| # | Risk | Why it is real here | Mitigation |
|---|---|---|---|
| R1 | **Free tap-to-go makes people sick or lost** in portrait first person | Tap-to-destination is the hybrids study's "model E": medium comfort, disorienting without a visible target; free-roam Myst on touch "sends you flying" | Rotate-then-translate; eyes on the destination; ≤ 2.5 m/s; legs at > 30° bearing change; the static viewmodel anchor; the destination ring in the tap frame; reduced-motion cross-fades; unit comfort tests (§2.7). **A device test in week 1.** The **vantage-snap fallback** turns it into a station hop without touching the content |
| R2 | **Generated caverns look composed from the entrance but ugly from other spots** | Free footholds expose every angle; v1's "horribly empty" came from exactly this | Authored kits per shape language; footholds culled when ≥ 80% blank wall; the forward fan; the fill contract from *every* foothold; capture tests from 5 random footholds per cavern; vantage-snap as the floor |
| R3 | **Tap ambiguity** (did I want to walk or strike?) | Stone is everywhere, and the floor meets walls | One reach rule (≤ 4 m strikes, beyond it walks you to it); feedback in the tap frame (a ring, or a crack); approach-and-strike means a "wrong" reading still does the useful thing; e2e intent tests on authored poses |
| R4 | **Dead time in glides** | 3–6 m glides take 1.7–2.9 s; long ones 5 s | Compact caverns (≤ 20 m of floor); dressed glides; drive-by strikes; re-targeting; the Lantern Walk; target ≤ 25% of active time gliding (econ bot metric) |
| R5 | **"I can't look around"** | No free look is a constraint | Forward-fan composition, arrival framing, re-orient, glance taps, Map travel. If playtests still ask, add an *optional* "edge glance" (a tap within the outer 10% of the width turns 26°), never a button |
| R6 | **Economy recalibration** | A new income term (cavern finds), K(b), the leash, the Wick; the model is already 4–5× fast | The curves stay; the knobs are ordered (§4.11); the explorer bot; the slice exposes only Topsoil and the first Glowroot caverns, where the sim is closest to target |
| R7 | **Performance** | Caverns 12–48 m wide seen in depth, versus a thin cut | Fog at 85% by 25–35 m doubles as culling; chunk view-distance culling; 4 per-pixel practicals; instanced nuggets; ≤ 220k triangles and ≤ 120 draws; the Balanced preset; a first-person scene in `perf.mjs`; **the first device measurement in the slice gate** |
| R8 | **Exploration against idle** | If the crew carries all progress, exploring feels optional; if exploring gates progress, idle stalls | Cavern finds ≈ +80% income; keystones gate only the player's seal fight (and cannot be missed); the leash keeps crew and lantern together; nothing is lost when skipped |
| R9 | **Navigation bugs** (stuck camera, clipping, walking through thin walls) | Pathing in generated voxel space | Footholds are immutable per cavern (wall skin never touches floors); clearance radius; path tests on 2,000 generated caverns; a teleport-safe cross-fade if a glide is ever blocked for > 0.5 s |
| R10 | **Scope creep** | Caverns + footholds + Lantern Walk + forks + keystones + camp + Wick + Lamps | The slice is phased (§10). The Wick, contracts, facets, prestige, camp stages above 2 and forks beyond the authored one stay dormant |
| R11 | **Over-juice regression** | The juice machinery's habits | §7.6 caps enforced by the FX director with asserts; a "pixels changed per tap" capture metric with a ceiling |
| R12 | **The crew is invisible when you are far from the face** | First person hides what is behind you or down a drift | Crew lamps and sound from the mouth; the cart run through the cavern; the mouth's breakthrough plate; one hire = one figure walking in |
| R13 | **Save state and the v3 save** | Per-cavern bits; a v3 save on the director's phone | v4 stores only the ~10 caverns in the ring as bitsets (≤ 2 KB); a v3 meta migration or the legacy notice, decided on day 0 |
| R14 | **Unverified Lumi Master visuals** | No frame was ever seen by the research | Spend 20 minutes on the `lumi-master.md` §5.9 links before locking the grade; the look is built on our own principles first |

---

## 10. Slice and open questions

**The vertical slice (one wave, three workstreams, reuse §7.2 adapted).**

- **Scope:** the camp at dusk (stage 1–2) → Topsoil's 5 authored caverns → the Halden Hatch → the Glowroot reveal → 3
  generated Glowroot caverns (one keystone, one fork).
- **Systems shown:**
  - tap and hold strike; tap-to-go; approach;
  - the Lantern Walk;
  - BEST, Pick and Lantern;
  - Shovel Hand, Pick Crew and Mine Cart visible at work;
  - a chest focus view; one relic with its Strike ring;
  - lamps and charting;
  - Dynamite;
  - the seal fight; the reveal window shot;
  - the goal line and the 3-step tutorial;
  - an offline return to the first unlit cavern;
  - an APK.
- **Dormant:** the Wick, Rekindle, Weave, Breach, facets, contracts, the daily, events other than Glimmerfall and the
  Drifting Ember, and camp stages above 2.

**The slice gate:**

- `tsc` clean and Vitest green, apart from the known `it.fails`;
- the comfort tests;
- 0 tap no-ops;
- fill from footholds;
- captures at 360 × 740, 390 × 844 and 412 × 915 from 5 footholds per cavern;
- §7.8's metrics;
- one Android device run (frame time, touch feel, audio);
- **the director plays the first 10 minutes on his phone.**

**Open questions for the panel:**

1. **Free footholds or vantage-snap by default?** This design says free, with snap as the fallback. A 15-minute A/B on the
   device decides.
2. **K(b) and the leash.** Are 3 caverns enough of an offline "dug ahead" image, or should the leash start at 4?
3. **Wick placement.** Tapping the lantern (diegetic, proposed) or a toggle in the Tools sheet (safer, less charming)?
4. **Keystones from Glowroot on, or from Crystal Grotto** (letting players learn the seal fight once without them)?
5. **Lantern on the left, tool on the right**: add a left-handed mirror setting (cheap: mirror the viewmodel and the light
   offset)?
6. **The face crew's visibility** when the leash front is two caverns ahead: show a "crew far ahead" lamp trail in the
   drift, or only the plate?
