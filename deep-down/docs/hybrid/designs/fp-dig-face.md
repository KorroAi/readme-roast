# DEEP DOWN, hybrid design: "The Face" (first-person dig face and breakthroughs)

A design proposal for the hybrid pivot, written from the angle "first-person dig face and breakthroughs". It is one entry for
the design panel, not the SPEC. Date: 2026-10-20.

**Inputs, all read in full:** `docs/hybrid/research/{lumi-master,hybrids,look,reuse}.md`. Also read: `docs/idle/SPEC.md` §0–§8
(tap, economy, seals, events, Codex, Feats, tutorial, goals), `src/idle/config/{biomes,gear}.ts`, `src/idle/model/state.ts`
(`COLS = 7`, `CENTRE_COL = 3`, `SHAFT_WINDOW = 12`) and `src/idle/model/shaft.ts` (`breakthroughs()`, `TUTORIAL_CROSSING`).
Screenshots looked at: `artifacts/world-w2/r1/f17-first-crystals-moths.png` (the best frame of v1),
`artifacts/final-pass/first-five-w2/02-camp-start.png` and `04-copper-mining.png`,
`artifacts/idle/w2/look/r4-biome-04-412x915.png` and `r5-biome-02.png`, and the APK frame `scratchpad/peek-2.png`.

**Hard constraints this design obeys:**
- **First person.** The player's body is never shown. Only the lantern (lower left) and the tool (lower right) are in view.
- **Tap or hold only.** No joystick, no swipe, no drag, no pinch, no aiming button, no free look.
- **Lumi Master** is a reference only for its look and for how it presents exploration: you move *into* the picture, with
  restraint, few tones, one focal event and short reward beats.
- **No creatures.** No collecting, taming, companions, pets, battles or trading. No animal is ever tappable, counted or
  rewarding. Cave life (roots, fungus, drifting spores, old bones) is decoration only.
- **DEEP DOWN's identity stays:**
  - the lantern-lit descent through the 14 biomes;
  - mining rock, ores and gems;
  - chests and relics;
  - sealed gates;
  - the hired crew and machines, digging offline too;
  - upgrades up to démesure;
  - the mystery at the bottom;
  - the "Lamplight on the Lintel" brand.
- **Platform:** Android WebView, Three.js r186 WebGL2, TypeScript and Vite. Procedural assets only, English through
  `src/i18n`, offline, no store, no ads.

**Marks:**
- **est.** = an estimate or design target that the face-paced simulation or a phone test must confirm.
- **[M]** = needs a change in the pure model (`src/idle/**`). Anything unmarked uses the model as it is.

---

## 0. The pitch

### 0.1 Genre and one-line pitch

**Genre: the first-person breakthrough clicker.**

**One line:** *By lantern light you hammer a wall of real rock three steps ahead. It gives way block by block and slice by
slice. Light starts leaking through the cracks, then the wall breaks into a hidden cavern full of treasure and your view
drifts in. Meanwhile your crew and their machines dig beside you, and keep digging while you sleep.*

Short form for the store and the title card: **Tap the rock. Break through. Look. Dig on.**

### 0.2 The design in twelve lines

1. **The screen is a face.** In front of you, 3 m away, a heading ends in a wall of seven real rock blocks, laid in a 2-3-2
   bond under a timber lintel. Each block is 0.73 m square, 1 m deep, and about 97 px wide on a phone. The blocks are the
   pure model's seven cells. One face slice is one model row, which is one metre of depth.
2. **The world is the button.** A tap strikes the block under your thumb. A hold keeps striking it and bores in behind it.
   Nothing else is needed to play.
3. **Breaks are physical and in 3D.** A block fractures into lit shards that fall out of the face into your lantern pool. The
   hole shows the next block, a metre deeper and darker. Ore is made of real nuggets that roll out.
4. **The face recedes.** When five of the seven blocks are gone, the rest crumble, the slice falls and your view creeps one
   metre forward. A heading is a run of 25–40 slices.
5. **You can see into the rock.** Your lantern "senses" a few slices ahead: tiny warm, cyan or violet glints on the face
   promise gold, gems or a hollow. In the last three slices before a cavern, light from the other side leaks through
   hairline cracks.
6. **The breakthrough is the payoff.** The last slice falls *away* from you. The cavern's light floods in and your view
   glides inside: a treasure grotto, a relic niche, a crystal hall, once per biome a Vista with its set piece. You harvest
   3–6 treasures with taps, then tap the lit mouth of the next heading.
7. **Some faces go down.** About a third of the runs are sumps: you stand in a hoist cage and dig the floor of a pit. When the
   floor gives way you look straight down into the cavern below, and the hoist lowers you into it.
8. **The crew is in the frame.** The two newest crew lines work the edges of your face: a Shovel Hand at the lower left, a
   Pick Crew on a scaffold, a Steam Drill bit grinding the right-hand block. Caverns show the whole roster at work on the side
   walls. While you are away they dig ahead, and when you come back the camera glides through what they opened.
9. **Each biome ends at a sealed gate, a mechanism.** It is a hatch, a lock wheel, a bell or a runed lintel, never a monster.
   It is the objective you can always see coming. Breaking it plays the biome reveal through the broken doorway.
10. **Démesure is the tool in your hand, then the size of the hole.** The pick changes shape at every tier, from a rusty pick
    to the Void Cleaver and then Lantern Edge I, II and on. Every three tiers your heading grows a size class: Heading, Drift,
    Gallery, Tunnel, Great Bore. The blocks stay 97 px on screen, but the world around them becomes enormous, the crew turns
    tiny, and shards become boulders.
11. **Everything is calm by rule.** The camera never moves on a tap. At most three things move in the foreground. One
    objective line sits on the lintel. The HUD is two thin opaque bands. One ceremony plays at a time, never longer than
    1.2 s (3 s for a biome reveal).
12. **The economy is the model's, unchanged.** HP curves, the cell mix, crew, gear, chests, seals, events (creatures purged),
    the Codex, Feats, Rank and the three prestige layers are kept as they are. The face is a new *view* of the same seven
    cells.

### 0.3 Why this angle

- **It is the clicker the director already understands** (tap, crack, burst, buy), with the one thing that was wrong fixed:
  the flat wall of painted tiles becomes a real wall of rock, in light, with depth behind it.
- **The 3D pays for itself in play, not only in looks:**
  - holes show you the next block;
  - light leaks through the rock before a breakthrough;
  - the face recedes as you push;
  - a breakthrough is a real camera move into a real space (Lumi Master's "moving into the picture", done properly).
- **Comfort and legibility come almost free.** About 90% of the time the camera stands still, and the thing to touch is one
  lit object in the middle of the frame (Lumi Master's "one focal event per beat").

### 0.4 What it is not

- Not free exploration: there are no footholds and no walking. Not a node map: there are no roads to plan, only an
  occasional fork, chosen with one tap.
- Not a cutaway or side view. The model's columns become blocks in front of you, not strips on a wall.
- No creatures, energy, timers that block taps, store, ads or gacha.
- No body: no foreman, no explorer model, no hands larger than the tool.

---

## 1. Controls

### 1.1 Gestures: the complete list

| Gesture | Where | Result |
|---|---|---|
| **Tap** | a block of the face | A strike on that block. The hit shows in the next frame (SPEC L1). |
| **Hold** (≥ 250 ms, finger moved ≤ 12 px) | a block | Auto-strike on the block under the thumb: 5/s, +0.5/s per Steady Hand level up to 8/s, 10/s during a Surge. When the block breaks, the hold strikes the block behind it, so a hold **bores in**. If the finger drifts more than 24 px, the hold re-aims at the block now under it. This is forgiving, and never required. |
| **Tap** | something that glows: a chest lid in the face, a find in an opened hollow, an event object, a seal's weak point while lit, a tool on the rack (skills), a planted lantern, a cavern treasure | A priority hit (§1.2). |
| **Tap** | a lit heading mouth in a cavern | Choose it and glide to its face (1.2–1.8 s). |
| **Tap** | a raised find (the focus pop) | Opens a chest, or stops the needle of a Strike ring. |
| **Tap** | anywhere outside an open focus pop | Closes it. This tap never strikes, so nobody breaks a block by accident. |
| **Tap / hold** | a bottom card (Pick, BEST, Crew) | Buy. Holding a card buys repeatedly: 8/s, then 16/s after 1.5 s (SPEC §5.5). |
| **Tap** | the ≡ Ledger plate, the depth plate, the objective line | Opens the Ledger at the right page. The objective line opens the place where its goal is done. |
| **Any tap** | during a ceremony, a glide, a rope ride or the return glide | Skip to its end with a 0.25 s cross-fade. |

**Never used:** swipe, drag, pinch, double tap, joystick, aim button, free look, tilt.

**The two-step ceiling** (Lumi Master's rule): every action reachable in the game is at most 2 taps from the dig view. Quick
buys take 1 tap; any other purchase takes Ledger + card; a chest takes lid + open; a fork takes 1 tap; a skill takes 1 tap on
its tool.

### 1.2 Tap resolution (`game/hybrid/FaceController.ts`, pure; the first match wins)

1. **HUD plates** are DOM elements. Their taps never reach the world.
2. **An open focus pop:** the raised object, or "close".
3. **Screen-space entities**, hit radius `max(32 px, projected bound + 10 px)`:
   - event objects (the Lucky Ember, falling crystals, a rolling geode, a runaway cart, Cave-in boulders, the supply crate);
   - the seal's weak point while it is lit;
   - a chest lid exposed in the face;
   - a find inside an opened hollow;
   - the tools on the rack;
   - planted lanterns;
   - cavern treasures;
   - heading mouths.
4. **The ray:** camera ray → the front-most live block along it. This is an AABB test against the face's live blocks (at most
   7 × 8), then a voxel raycast for walls. A tap that lands in a hole hits the deeper block it sees.
5. **Fat finger:** the nearest exposed live block within 30 px (v1's `TapController` rule).
6. **Never a miss** (SPEC L2):
   - At a face, any other tap in the world region strikes the suggested block: the one with the amber rim, or else the
     weakest front block.
   - In a cavern, a stray tap goes to the nearest treasure within 80 px. If there is none, the next heading's mark brightens
     for 0.4 s, which is guidance, not a penalty.

Input contract kept from SPEC §3.1 and `TapSurface.ts`:
- a tap fires on `pointerdown`, handled in the same frame;
- at most 3 pointers;
- a ring buffer of 32 taps with no allocation;
- at most 15 counted taps per second (extra taps merge their damage into the previous hit on that block).

The 7 column strips are deleted.

### 1.3 The strike, the hold and the rhythm layer

- **Frame 0 after `pointerdown`:**
  - the tool is drawn already at its contact pose, its head over the tapped point, with a short smear arc behind it (no
    wind-up);
  - the crack grows from the tapped point;
  - chips fly, the sound plays and the haptic fires.

  Recovery takes 220 ms. A new tap during recovery restarts from the contact pose. At 8 hits per second the tool reads as a
  steady hammering, not a twitch.
- **The aim illusion.** The tool is drawn by its own fixed 58° camera, after the world. Its contact pose is solved per tap so
  that its head lands on the tap's screen position. The face is 3 m away, but its blocks are drawn at arm's-length size
  (97 px), so the strike reads as a hit. This is the standard first-person melee convention. It is checked on the phone (R3).
- **The hold:**
  - a 44 px brass ring with a 2 px stroke draws under the thumb over 250 ms;
  - then the tool settles into its beat;
  - the ring fades 0.5 s later. Nothing else marks a hold (no 450 px donut as in `peek-2`).
- **Combo** (model, unchanged): +1 per tap within 0.6 s; the multiplier is ×(1 + 0.02 × min(combo, 50)).
  - It is shown on the tool: the head warms from bone to amber at 10, cyan at 25 and violet at 50.
  - From 10, the HUD's one contextual number shows "×1.6".
- **Crit** (model): 5% + Lucky Strike, ×5.
  - A brief "×5" is stamped on the struck block for 0.4 s, with a brighter flash and a ringing overtone.
  - It is part of the break's own effect group, not a separate one.
- **Lantern Surge** (model: the meter fills by 1 per tap and 4 per crit, up to 240; it lasts 10 s, ×3).
  - It is diegetic: the lantern's flame grows in five visible steps as the meter fills.
  - When it is full, the lantern blazes for 10 s: its radius ×1.6, the face lit gold, the drum layer enters on the next bar.
  - No UI ring.

### 1.4 What is automatic, and what never is

**Automatic:**
- the crew and machines dig, on screen, on a shared beat;
- selling: gold is credited the moment a block breaks, and carts carry the rest; there is no backpack and no trip back;
- the leftover crumble at 5 of 7 blocks;
- the creep forward;
- the glide into a cavern after a breakthrough;
- collecting any find you left in a slice when it falls (at 100%, flown to its counter);
- offline digging and the return glide;
- ceremonies.

**Auto-advance** (a setting, unlocked at Seal 1, on by default): when a cavern holds no manual item (no chest, relic or event
left), the view glides to the next heading after 4 s without a tap.

**After the first Rekindle**, the model's Ember perks add auto-buy (pick, then crew lines), auto-skills and auto-facets.

**Never automatic:**
- the first sight of a biome and of its Vista (SPEC L10 extended);
- opening chests and relics;
- choosing at a fork;
- breaking a seal never opened before;
- spending gems.

The crew digs; the player discovers ("automate travel, not discovery", `hybrids.md` T2).

### 1.5 Inputs per minute (est.)

| Phase | Inputs per minute | What carries the action |
|---|---|---|
| At a face, tapping | 180–300 (3–5 taps/s) | the clicker core |
| At a face, holding | 2–8 (re-anchoring holds, purchases) | hold plus crew |
| Cavern harvest (10–20 s) | 10–25 in the window | specials: 1–4 taps each |
| Choosing a heading, forks | 1 per 60–150 s | — |
| Purchases | 2–15 early (one tap on BEST is always right) | cards |
| Idle | 0 | crew, offline |

Lumi Master's manual rate is about 15–40 taps per minute (`lumi-master.md` §3.3). The face lets the player choose their
intensity: a frantic clicker with taps, or a calm watcher with a hold and the crew. Both are always available.

### 1.6 The tutorial: three steps, three verbs

Taught by doing. There are no OK buttons, nothing pauses, and no step can be failed. The pure step machine
`src/idle/model/tutorial.ts` is kept, with its semantic targets (`cell`, `card:pick`, `chest`, `seal`) remapped.

| # | Verb | Trigger | In the world | Line (≤ 8 words, `idle.tut.*`) | Done when | Fallback |
|---|---|---|---|---|---|---|
| **1** | **Tap** | first launch, 1.2 s after the lantern lights | One block carries a calm amber rim. Its HP is 100, the level-1 pick's damage, so it breaks in one tap. | "Tap the rock" | It breaks. The line becomes "Clear the face" with 7 pips. The slice falls and the view creeps 1 m forward: the lesson that the face recedes. | After 4 s a 36 px brass outline of a thumb taps the block once. It never returns for this verb. |
| **2** | **Hold** | after 12 taps, or on the 2nd slice | The rim moves to one block. A thin ghost ring fills under it. | "Hold to keep digging" | 1.5 s of hold. The block breaks and the hold bores into the one behind. | After 8 s the line repeats once. Tapping keeps working. |
| **3** | **Tap what glows** | the chest at slice 6 (centre block) | A warm rim on the lid showing in the rock | "Tap what glows" | The chest rises into the light; a tap opens it (scripted Wood → Copper roll-up). The same verb comes back at the first breakthrough as "Tap the light to go on" on the heading mouth. | The Shovel Hand taps it open after 6 s. |

**Buying is not a gesture lesson.** It is a goal line between steps 1 and 2:
- at 30 gold the Pick card rises with an amber rim: "Upgrade your pick";
- at 50 gold the Crew card follows: "Hire a Shovel Hand. He digs while you're away."

The world answers in the same frame: the tool flexes, and a miner climbs down a ladder into the lower left of the frame.

**After 3:00**, contextual hints take over (SPEC §8.7, kept with three changes):
- the "no tap for 6 s" hint moves the amber rim instead of showing a hand;
- there is never a pointing hand after step 1;
- at most one hint is shown at a time, inside the world.

---

## 2. Camera

### 2.1 Lens and rules (`look.md` §4.1, adopted)

| Parameter | Value |
|---|---|
| Eye height | 1.60 m above the floor |
| Lens | **Horizontal FOV locked at 52°.** The vertical FOV follows the aspect: 93.1° at 390 × 844, 90.1° at 360 × 740, 94.6° at 412 × 915, 81.9° at 16:9. This reuses v1's `lockedVerticalFov`. |
| Roll | 0, always |
| Head bob, sway, breathing | none on the world camera; at most ±0.15° at 0.2 Hz on the viewmodel, off in reduced motion |
| Taps | **never move the camera** |
| Shake | Only when a seal breaks or a big geode opens: rotational, ≤ 0.4°, ≤ 120 ms, one decaying swing. Off with the shake setting. |
| Near plane | 0.08 m. The eye stays ≥ 0.5 m from any rock, and walls within 0.7 m darken their facets instead of clipping. |
| Viewmodel | Its own pass and its own camera (vertical FOV 58°), drawn last before the HUD. The lantern sits lower left and the tool lower right. Together they cover ≤ 12% of the screen and stay out of the central 50% column at rest. |
| Reduced motion | Every glide becomes a 0.25 s cross-fade. The creep becomes a 0.15 s cross-fade. No shake, no breathe. |

### 2.2 Poses: where the camera can be

| Pose | Use | Placement | Pitch | Frame |
|---|---|---|---|---|
| **Face** | about 85–90% of play | on the heading axis, 3.0 m from the front slice (Heading class; §4.12 scales it) | −8° | The face spans 34–67% of the height and 12–88% of the width. The tap zone is the lens's least-stretched band (≤ ×1.28). |
| **Sump** | about 30% of face runs, from biome 1 on | in the hoist cage at the pit's lip: eye 3.3 m above the pit floor, set 1.6 m back | −58° | The floor face sits in the same 34–67% band. Sump blocks are 0.8 m so that foreshortened cells stay ≥ 92 px. |
| **Stand** | caverns | 3–6 m inside the breach, raised 0.5 m on the rubble or a ledge | −4° to +6° | Treasures within 30–70% of the height and 15–85% of the width. The next heading mouths on the far wall at 40–55%. |
| **Focus pop** | chests, relics, geodes, the Royal Chest | The camera does not move. The object rises out of its block or niche to a point 1.8 m ahead and 1.4 m up, centred at about 49% of the height. | — | The world dims 30% around it. A tap outside closes it. Everything comes to you, so the camera never has to turn. |
| **Seal** | a seal fight | the face pose | −8° | the mechanism fills the heading |

### 2.3 Motions: the only ones the camera ever makes

| Motion | When | Profile | Comfort |
|---|---|---|---|
| **Creep** | the front slice clears | Forward along the axis (downward in a sump) by the metres cleared: 0.1 s acceleration, a 2.5 m/s cruise, 0.1 s deceleration, so 0.5 s per metre. Slices clearing faster than one per 0.5 s merge into one continuous track at a constant ≤ 2.5 m/s. | Translation only, never rotation; the viewmodel stays fixed. It is triggered by a slice, not by a tap. |
| **Breakthrough glide** | the last slice before a cavern falls | A 0.3 s hold (let the light land), then 3–6 m inward in 1.2–1.8 s at ≤ 2.5 m/s. A Vista adds a pitch-up of ≤ 15° over 1.2 s after the dolly stops. | rotate before translating, never both at once |
| **Rope ride** | a sump breakthrough | A 0.4 s hold at the lip looking down. The hoist lowers 4–6 m at ≤ 2.5 m/s (≤ 2.4 s; v1 `ropeRide.ts`). Pitch eases from −58° to −8° only after landing (0.4 s). | vertical only |
| **Heading glide** | a tap on a heading mouth | Turn ≤ 35° of yaw in ≤ 0.3 s, then translate to the face pose in ≤ 1.8 s | rotate, then translate |
| **Return glide** | coming back after ≥ 30 min away | Up to 3 glimpses (0.7 s each at ≤ 2.5 m/s, through caverns the crew opened) joined by 0.25 s cross-fades, ending at the new face. ≤ 3 s in total; any tap skips. | each piece is a normal glide |
| **Plunge** | Dynamite, Head Start, absurd hits | Up to 3 m: an ordinary creep (≤ 1.4 s). More: a 0.4 s straight track at 5 m/s, then a 0.25 s cross-fade to the new face. "Comfort: high" or reduced motion: the cross-fade only. | The only motion above 2.5 m/s. It is ≤ 0.4 s and dead straight. Validate on the phone (R2). |

The comfort unit tests in `tests/unit/hybrid/firstPersonCamera.test.ts` (pure camera maths) assert, for every motion type:
- roll is 0;
- the view matrix is identical across 100 taps with no slice cleared;
- angular velocity ≤ 120°/s and linear speed ≤ 2.5 m/s, except the Plunge's 0.4 s;
- no glide rotates and translates in the same frame;
- the FOV is constant;
- reduced motion produces cross-fades only.

### 2.4 Portrait framing at 390 × 844 CSS px (safe insets 47 px top, 34 px bottom)

The world renders edge to edge, under the system insets too. The two HUD bands total 150 px (17.8%), so the world keeps 82%
of the screen.

```
  y px  ┌────────────────────────────────────────┐
     0  │ (status-bar inset: dark ceiling shows) │
    47  ├────────────────────────────────────────┤
        │ [38 m · Topsoil]  [◇ 1.23K +45/s]  [≡] │ top plates, 44 px, opaque octagons
        │ > Break the Halden Hatch · 12 m  ▬▬▬▭  │ the objective line on the lintel, 26 px
   123  ├────────────────────────────────────────┤ ← HUD top band ends (9.0%)
   132  │ ═══ near timber lintel (1.5 m) ═══     │ dark, cool frame layer
        │ ║                                    ║ │
   253  │ ║   ══ face lintel (3 m) ══          ║ │
   284  │ ║ ┌tool┐   [ T1 ][ T2 ]      ┌crew┐  ║ │ the FACE: 34–67% of the height
        │ ║ │rack│ [ M1 ][ M2 ][ M3 ]  │rig │  ║ │ blocks 97 × 95 px; middle row x 49–341
        │ ║ └────┘   [ B1 ][ B2 ]      └────┘  ║ │ the single brightest area (lantern pool)
   568  │ ║  shovel  ~ rubble, floor pool ~      │ warm mids, rail at left
   610  │  (lantern)                      (tool) │ viewmodel corners, static at rest
   736  ├────────────────────────────────────────┤ ← HUD bottom band (8.8%)
        │   [ Pick ]   [  BEST ★  ]   [ Crew ]   │ three cards, 74 px, no digits
   810  │ (gesture inset: floor shows)           │
   844  └────────────────────────────────────────┘
```

The geometry behind it (Heading class):
- the face is 2.19 m wide and 2.19 m tall at 3.0 m;
- the eye is 1.6 m up, with pitch −8°;
- the face's top edge is at y 284 (33.6%), its bottom at y 568 (67.3%), its centre at y 433 (51.3%);
- the drift's vanishing point is at y 366 (43.3%), behind the face, where the timber sets and rails converge.

### 2.5 Everything on screen at a face (the complete inventory)

| Layer | Element | Moves? |
|---|---|---|
| World | the 7 front blocks; any exposed deeper blocks; cracks | only when struck |
| World | timber sets (near at 1.5 m, face set at 3 m) with the lintel; side walls; floor; rubble mound | static |
| World | lantern-sense glints (≤ 6 pinpricks of 2–4 px) | static (no pulsing) |
| World | the crew: ≤ 2 featured rigs at the face's edges, plus the cart on the left rail once owned | one ambient group, on a shared 0.9 s beat |
| World | the tool rack (skills) on the left post: dynamite crate, bell, whistle, plunger, as they unlock | static; dims while cooling down |
| World | ≤ 20 dust motes in the lantern beam | the second ambient group |
| Viewmodel | lantern (lower left; its flame is the Surge gauge); tool (lower right; its head heat is the combo) | only on strikes and level changes |
| HUD | depth plate, gold and rate, ≡ Ledger; the objective line; three cards | still unless a value changes |
| Transient | at most one first-time card (2.5 s, under the objective line); one hint (an amber rim in the world); the hold ring | — |

Numbers on screen, at most five:
1. depth;
2. gold;
3. rate;
4. the objective's number;
5. one contextual number: the combo multiplier, a seal timer, or a gem delta for 2 s.

The cards carry no digits: the fill bar is the price, and pips show the next milestone. Exact costs live in the Ledger.

---

## 3. The world

### 3.1 The descent: the Deep Spiral

- **Depth is the model's metres** (1 slice = 1 row = 1 m), counted along the descent. World height is not depth. The player
  sees "depth" climb exactly as the model says, so every economy constant and the offline closed form stay exact.
- **The path is a pure function**, `pathAt(runSeed, d)`, in a new file `world/hybrid/deepPath.ts`. It returns, for every depth:
  - a world position and a direction;
  - the run kind (heading, sump, cavern or seal);
  - the slice index inside the run.

  Runs end where the model already places breakthroughs (`breakthroughs()`: one every 25–40 rows, 3–5 open rows) and seal
  rows (each biome's first row).
- **Shape.** Headings run nearly level, declining 6°. Sumps go straight down. Each cavern turns the next heading ±90° and
  drops it 6–10 m. The turn direction is chosen so the path stays inside RingWorld's 64 × 64 m footprint, which makes it a
  square spiral with sides of 25–40 m.
  - One lap is about 4 runs, which is about 130–160 m of depth and 40–60 m of world height.
  - RingWorld's 160 m y-window holds about 3 laps.
  - A unit test keeps ≥ 12 m of rock between a lap's floor and the ceiling of the lap below.
- **RingWorld is unchanged** (a y-ring of 10 slabs of 16 m). The slab worker generates in path space:
  - pass 1 picks each voxel's biome from the depth of the nearest path point, instead of from y;
  - passes 2–3 (strata, veins) are kept;
  - passes 4–9 are rewritten as the run and cavern grammar (§3.3, §3.5).
- **The face is not terrain.** The drift's cross-section ahead of the face is filled with *plug* voxels: solid for light and
  picking, never meshed. A dedicated `FaceRenderer` draws the 7 × N blocks in that plug. When a slice clears, its plug voxels
  open through LightField's incremental `openMany`, so the lantern light pours a metre deeper.
- **Seams are never seen from a face.** Every turn and every joint between runs happens inside a cavern, where the breach
  frames the view.

### 3.2 The face: anatomy

- **The bond.** Seven blocks per slice: 2 on top, 3 in the middle, 2 at the bottom, filling an octagonal heading (the brand's
  octagon) under a timber lintel (the brand's lintel). The trim rock in the octagon's corners belongs to the slice and
  crumbles with it.
- **The model map.** The model's columns run as a snake through the bond, so every model neighbour (col ±1, used by Shockwave
  and Quake splash) is a visual neighbour:

  | col | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
  |---|---|---|---|---|---|---|---|
  | block | middle-left | top-left | top-right | **centre** (`CENTRE_COL`: chests) | middle-right | bottom-right | bottom-left |

- **Pierce is depth.** The model's overkill flows down a column. Here it flows *into* the face, behind the same block, to
  `1 + floor(pickTier/3)` slices (max 8). A strong hit bores a short tunnel you can see down.
- **Crew damage** lands on the weakest block of the front slice, on the rig's impact frame, so the screen and the numbers
  agree (`CrewRenderer` already does this).
- **Size and light:**
  - the front of a block is 0.73 m square, and a block is 1.0 m deep;
  - joints are 5 cm, darkened by AO to about 0.35 of the lit value, so every block reads as a separate thing to tap;
  - a block exposed behind a hole is 1 m further from the lantern, which makes it about 45% darker by the inverse-square
    falloff. That gives a natural depth and value hierarchy with no effect at all.
- **The drawn window.** The front slice plus up to 7 behind, within the model's `SHAFT_WINDOW = 12`.
- **Lantern Sense** (presentation only, no economy effect):
  - Valuables within N slices behind the front show as ≤ 6 pinpricks on the front surface: warm for gold and chests, cyan for
    gems, runes and relics, violet for a hollow or a cavern.
  - N = 4 at the start, +1 per biome Lantern gear card owned this run, max 10.
  - Brightness falls with distance.
  - In the last 3 slices before a breakthrough: hairline light leaks in the cavern's key colour, the knock turns hollow, and a
    little dust sifts from the joints.
  - In the last 40 m before a seal: the leaks take the next biome's key colour.

### 3.3 Heading and sump

| | Heading (about 70% of runs; 100% in Topsoil and at seals) | Sump (about 30% of runs, from Glowroot) |
|---|---|---|
| You dig | the wall ahead | the floor of a pit below your hoist cage |
| Creep | 1 m forward per slice | the cage lowers 1 m per slice (the winch clanks) |
| Frame | timber sets, lintel, rail and cart on the left | the pit's rim, chains, the cage's brass rail across the bottom of the frame (a static anchor) |
| Breakthrough | the window: the slice falls *away* into a cavern beyond | the drop-in: the floor collapses and you look straight down into a cavern 6–10 m below, then the hoist lowers you |
| Why | readable, framed, the default | variety; the strongest feeling of *descent*; a vertigo wonder shot that costs nothing |

The generator never puts two sumps in a row, and never puts a sump directly before a seal (seals are doors).

### 3.4 The breakthrough ladder, from small to huge

| Scale | What breaks through | How often (run 1) | The moment |
|---|---|---|---|
| **Crack-through** | any block: the block behind it shows | every break | the next block's kind, seen in the hole |
| **Hollow** | A rare cell (gem, fossil or geode: 1% of cells) or a note cell. Its front shell cracks open on a small lit cubby inside its own volume, with the find inside. | about every 8–14 m (rare cells about 1 in 14 slices, 3 notes per biome, fossil slabs) | Tap the find: it rises into the light, and flies to its counter or its Codex page. |
| **Chest** | the chest cell (centre block, every 25 slices) | every 25 m | an iron-banded lid in the rock; tap → it rises; tap → the roll-up |
| **Grotto** | the face falls into a cavern (the model's open rows) | every 25–40 m, which is about 60–150 s | glide in; harvest 10–20 s; choose the next heading |
| **Vista** | the grotto nearest 35% into each biome, enlarged to 32–48 m with the biome's set piece | 1 per biome | the window shot; ≤ 3 s pitch-up; the Royal Chest and the relic shrine |
| **Seal** | the biome's first row: a mechanism door | 1 per biome | a 30 s fight; the reveal through the broken door (≤ 3 s) |
| **Geode** (secret) | a geode cell: its hollow holds a Strike ring, and inside the geode a tiny starry sky | 1 per 80–120 m from 120 m | perfect Strike: a rare Find + 5 gems |
| **Through** (démesure) | one tap clears every slice to the next cavern | late game, at absurd power | §4.12 |

### 3.5 Caverns: anatomy, the roll, and forks

**Anatomy** (generated in the slab worker; the fill contract checks it from the stand):
- **The breach.** The broken face frames the view: a dark foreground covering 30–40% of the frame, the window shot (r1/f17).
- **The stand,** on the rubble, raised 0.5 m.
- **In the stand's frame:**
  - 3–6 treasures (gem clusters, ore crusts, crates, urns, a chest, notes, a relic niche);
  - one hero object;
  - 6–12 medium props;
  - 2–3 biome emitters;
  - **one warm practical** (a Halden lamp; every cold space keeps one, v1's rule).
- **The crew roster** at work on the side walls as dressing: every owned line is visible here, unlike at the face.
- **The far wall,** with the next heading mouth(s): an octagon timber set with a hanging lantern. The crew has already cut its
  first slice.

**The cavern roll** (seeded per grotto; this is P5 of `hybrids.md`; est.). Rewards are priced in seconds of income, as the
Director prices events, so the calibration can hold them:

| Cavern | Share | What it holds |
|---|---|---|
| Plain grotto | 46% | 3–4 treasures (about 15 s of income in total) |
| Rich hall | 14% | ore crusts all over the walls: 5–6 ore treasures (about 30 s) |
| Treasure cache | 12% | a Copper-floor chest plus 2 treasures |
| Relic niche | 8% | a relic on a plinth (a Strike ring rolls its condition) |
| Cart depot | 8% | a Halden depot: +5 free levels on a random owned crew line (the SPEC's Copper chest extra) |
| Crystal pocket | 6% | gem clusters: a gem each 5% |
| Halden camp | 4% | a lore note, a mural, 2 crates, a cold campfire |
| Collapse | 2% | The floor gives way: you drop 8–12 m and skip that many slices, which still pay their gold. |

Pity: a cache or a relic niche at least every 4 grottos.

**Forks** (from the Crystal Grotto on, at about half of the grottos, est.) answer Lumi Master's most-criticised trait, its
linear route:
- The far wall shows **two heading mouths**. Each is tagged by the colour of its first face's glints, seen from the stand, and
  by a small octagon tag over the mouth.
- The three tags (each keeps the expected value at 1.00):

  | Tag | Effect |
  |---|---|
  | **Rich** | ore shares ×2, rock gold lowered (the "Rich" mutator's rule) |
  | **Finds** | rare cells ×2 and one guaranteed hollow; ore halved |
  | **Short** | the next breakthrough comes 8–12 m sooner |

- One tap chooses (the two-step rule holds). [M] `rowKinds` and `breakthroughs` take a branch salt, and the save keeps the
  branch history (one entry per grotto). Offline, the crew takes the tag the player chose last.

### 3.6 How it stays full (the fix for "horribly empty")

Hard rules, checked by `tools/fill-scan.ts` re-keyed to face windows and stand frustums on every generated run of the first
two cycles:

1. **Face:** inside the Lantern Sense window there is always ≥ 1 glint, meaning a find within 8 slices (the SPEC's "≥ 1 find
   per 8 m", now *visible*).
2. **Boredom breaker** (the Director, kept): no special block broken for 25 s while tapping → the next 2 slices get one; no
   beat for 70 s → an event is dealt now.
3. **Cavern stand frame:**
   - ≥ 3 treasures and 1 hero;
   - ≥ 1 warm practical and ≥ 1 biome emitter;
   - ≥ 1 prop per 6 m² of visible floor, with an empty-floor share ≤ 35%;
   - vein or crystal cover on ≥ 8% of the walls;
   - 1 particle emitter for caverns of 50 m³ or more.
4. **Clear air:** no decoration inside the face's rectangle or within 1 m in front of it. Crew rigs never overlap it.
5. **Light:** every frame has ≥ 2 light sources in ≥ 2 hues (the warm lantern and the biome accent).
6. **Nothing floats:** every prop rests on geometry (a contact test). There are no billboard cards: what you see beyond a
   breach is geometry fading into fog.

### 3.7 The 14 biomes as faces and caverns (creatures replaced; colour script in §7.5)

| # | Biome (start) | Face blocks | Ore as objects (common / rich) | Heading frame | Vista set piece | Seal (weak point) | Signature event (inanimate) |
|---|---|---|---|---|---|---|---|
| 0 | Topsoil Roots (0 m) | soil, gravel, umber; root-wood ribbons through the joints | copper nuggets / amber lumps | timber sets, roots hanging through the lintel | the Root Cellar grotto at 24 m (the tutorial crossing): a root chandelier | the Halden Hatch: a timber door barred with chains (the padlock) | Root Pull (Mash a root in the face) |
| 1 | Glowroot Caverns (40 m) | moss, slate, glowroot blocks with emissive veins | tin / jade | root arches | the Rootheart: an 18 m root tangle that brightens as your lantern passes | the Root Knot (three knots light in turn) | Seed Fall (Catch drifting glowroot seed pods) |
| 2 | Crystal Grotto (120 m) | slate, deep slate, crystal | quartz prisms / sapphire | crystal ribs instead of timber | the Hand in the Crystal | the Prism Lock (facets glint clockwise) | Crystal Bloom (Mash) |
| 3 | Halden Works (240 m) | deep slate, brick, timber, brass | iron / silver | Halden steel arches, rails, plaques | the Crusher Hall: 12 m gear wheels under the hoist tower | the Crusher (the pressure valve) | Pressure Valves (Catch) |
| 4 | Fungal Deep (400 m) | umber, moss, cap, mycelium | gold / spore pearl | caps on the lintel | the Mother Cap: a 60 m mushroom raining spores (decor) | the Spore Valve (valve wheels light in turn) | Spore Burst (Catch spore pods) |
| 5 | Drowned Ruins (600 m) | tile, glyph stone, masonry in real courses | pearl / lapis | stone arches, braziers | the Drowned Procession (statues carrying lanterns into the water) and the Ember Shrine | the Drowned Bell (the clapper on each toll) | Pearl Bubbles (Catch) |
| 6 | Magma Veins (900 m) | basalt, obsidian, magma (emissive cracks) | ruby / fire opal | basalt columns | the Forge of the Bearers: a 15 m anvil over a lava river | the Forge-Heart (cooling cracks) | Lava Surge (Mash) |
| 7 | Fossil Halls (1,300 m) | bone, resin, umber | bone gold / insect amber | rib arches | the Leviathan's ribcage with a lantern hung in its eye socket (old bones) | the Bone Organ (the pipe that sounds the high note) | Bone Rattle (Sequence) |
| 8 | Frost Hollow (1,800 m) | ice, frost slate | rime silver / frost diamond | ice ribs, icicles | the Frozen Waterfall and a Halden crew frozen mid-step, lamps raised | the Rime Lock-Wheel (the frozen pawl) | Ice Shatter (Strike) |
| 9 | the Loom (2,400 m) | pale ashlar, glyph stone | lumen crystal / loomstone | carved lintels | the Archive of Light: shelves of identical crystals | the Thread Lock (thread knots) | Thread Weave (Sequence) |
| 10 | Iron Core (3,100 m) | ironbound, gear metal | mythril / magnetite | riveted plates | the Loom's Heart: a lodestone winding light into thread (Weave) | the Escapement (the tooth at 12 o'clock) | Gear Lock (Strike) |
| 11 | Star Heart (3,900 m) | star glass, gold rock | star shard / plasma pearl | floating stones, radial | the Buried Star | the Astral Geode (stars brighten in turn) | Star Fall (Catch) |
| 12 | Void Sea (4,800 m) | void stone, echo crystal | void pearl / null glass | almost nothing: islands | the Upward Falls over a starless horizon | the Mirror Gate: it shows your tool, and its weak point is the block you hit last | Gravity Flip (Catch) |
| 13 | the Gate (5,800 m) | glyph stone, bedrock, black stone | gate stone / sigil ore | the Lintel itself | the Last Gate, open from the other side | the Last Lintel (the flame core) | Rune Lock (a Sequence of 8) |
| 14+ | Echo strata (every 1,100 m) | the base biome, hue-rotated, with a mutator ("Inverted" loses its creature clause) | Echo variants | as the base | the base Vista with the mutator's overlay | the base mechanism, re-tinted | the base event plus the mutator's |

The Wardens become mechanisms as `reuse.md` §4 lists; the 7 already mechanical ones are kept. Crew renames: `fossilGolem`
becomes the **Bone Press** (a Halden press built from fossil ribs), and `voidMaw` becomes the **Void Engine**.

### 3.8 Wonder: set pieces and their cadence

| Cadence (run 1) | Wonder | How it is shown |
|---|---|---|
| every tap | a crack, a block coming apart, the next block in the hole | light on form, no effects |
| every 10–30 s | a glint becomes a find (a nugget, a gem, a hollow) | the find rises into the lantern light |
| every 25 m | a chest | the lid, the rise, the honest roll-up |
| every 60–150 s | a breakthrough | the window or the drop-in, the glide, a lit room |
| every biome, about 35% in | the Vista | the window plus a slow pitch-up: the only time the camera lingers (≤ 3 s, skippable) |
| every biome end | the seal and the reveal | light seams widen through the cracked door; the new biome's rim light fills the space over 1.5 s |
| rare | the geode's inner sky; the Other Lantern seen far below in a Vista | a focus pop; a 1 s glimpse |

**First sight is the player's.** A biome's reveal and the first view of each Vista always play in full and by hand. On later
runs below your record, they shorten to a 1.2 s title flash, and charted gates break like a hard slice.

### 3.9 The mystery: the Other Lantern, seen through the rock

The SPEC §7.8 chain is kept, with its creature beats removed (the Void Sea's Watcher becomes the Upward Falls). This angle
shows it in three ways:

1. **Behind the face.** Once per biome, Lantern Sense shows one warm glint deeper than any other, one that never comes closer.
   The Ledger's Ladder sheet calls it "−600 m": it is always 600 m below your record.
2. **Beyond every Vista.** Far past the set piece, a warm point of light pulses at 0.25 Hz with the music's root.
3. **In the rock itself.** Halden notes wait in hollows and caverns (3 per biome), seal cards play on the first break of each
   seal (4 lines, 6 s, skippable), and the prestige shrines tell the rest. The very first hollow, at slice 12, holds a Halden
   lamp still burning in the rock and the note "Day 40. Lamp seen below the lift. Nobody of ours is down there."

`src/i18n/en/idleLore.ts` (today a 4-line stub) must be written: 42 notes, 14 murals and 14 seal cards (fragments for later).

---

## 4. Loops, from the second to the week

### 4.0 The nested clocks (run 1; est. where not from the model)

| Clock | Loop | What closes it |
|---|---|---|
| 0.2 s | **Strike** | crack, chips, tock |
| 0.3–2 s | **Block** (p50 3.2 taps, p90 5.2: SPEC §5.12) | fracture, loot rolls into the pool |
| 1.4–3.6 s | **Slice** | the crumble, the creep, a new slice under the light |
| 0.5–5 s | **Purchase** | a card fills, one tap, the world answers |
| 10–40 s | **Find** | a glint becomes a hollow, a seam, a chest |
| 40–70 s | **Event** | the Director deals one (§4.9) |
| 60–150 s | **Breakthrough** | glide, harvest, choose, glide |
| 3–10 min | **Biome** | the seal, the reveal, new gear, a new crew line, new event types |
| 10–15 min | **Size** | a pick tier (a new tool in hand), a bore class (a bigger hole), a session hook |
| 25–35 min | **Rekindle** | the first prestige at the Ember Shrine (600 m) |
| hours | **Away** | offline crew, the return glide, the Rack |
| days | **Cycles** | Rekindles, Weave (day 1), Breach (day 2), Echo strata (day 3) |
| week | **Mastery** | Breach tiers, Codex pages, Feat tiers, records |

### 4.1 Strike (the model's `tap.ts`, unchanged)

- Damage:
  `pickDmg(L) = 100 × L × 2.5^floor(L/25) × gearPick × M_all`, plus `rally × crewDPS`, times combo, crit, Surge and skills.
- HP(0) = 100, which equals the level-1 pick, so **the first tap of a new game always breaks a block**. After Pick 2 (about
  0:20 here), every block of the first 5 m still breaks in one tap (HP(5) = 193).
- The feel per material: the rock family picks the tock's pitch and timbre (soil thud, slate clack, crystal ping, brick
  crunch, ice crack, metal clang). A crit adds an overtone. A pierce raises the pitch 2 semitones per block it bores through.

### 4.2 Block and slice

- **Block break:**
  - 9–12 lit shards (BSP fracture, `Shards.ts`) fall out of the face into the lantern pool;
  - ore drops 1–4 nugget objects that roll into the light, then streak to the gold plate as ≤ 6 tokens in ≤ 0.45 s (SPEC L8:
    gains travel);
  - the hole shows the next block.
- **Slice:** at 5 of 7 blocks the remaining two crack, shake on their own for 0.3 s (the blocks shake, not the camera) and
  fall as one burst. Then the creep. κ = 0.86, the leftover crumble calibrated in `curves.ts`, holds exactly.
- **Rows take 1.4–3.6 s for the first 40 minutes** (SPEC §5.12), so the face never stalls. A wall shows on the objective line
  ("Upgrade or Rekindle to go faster").

### 4.3 The find

| Find | Source (model unless marked) | Payout |
|---|---|---|
| Common ore (10% of cells, veins of 2–6 blocks) | `cells.ts` | ×2.5 gold, nuggets |
| Rich ore (4%) | `cells.ts` | ×4, bigger lumps catching the light (no pulsing) |
| Rare (1%): gem / fossil / geode, shown as a hollow | `cells.ts` | ×8; a gem; a Find roll; a Strike |
| Chest (every 25 slices, centre block) | `chests.ts` | honest roll-up from Wood (Copper+ 40%, Crystal+ 12%, Reliquary+ 2.4%, Lintel 0.24%); pity Crystal+ within 12, Reliquary+ within 40, Lintel within 300 |
| Note cell (3 per biome) | generator | a Lore entry and a 2-line plate |
| Cavern treasures | generator, priced in seconds of income | §3.5 |

### 4.4 Upgrades: pick, crew, gear, and skills as tools on the rack

All the prices and effects come from SPEC §5.4–§5.6, unchanged. What changes is how they show up in first person.

| Line | Price and effect (model) | In first person |
|---|---|---|
| **Pick** | `30 × 1.2^(L−1)`; a tier every 25 levels (×2.5) | **The tool in your hand changes shape at every tier:** Rusty, Copper, Iron, Steel, Gilded, Crystal, Obsidian, Mythril, Sunsteel, Thunder Maul, Plasma, Comet Hammer, Star Breaker, Planet Cracker, Void Cleaver, then Lantern Edge I, II, III… (`TOOL_FORMS`). A tier plays a 1.2 s ceremony: the tool turns once in the light. A level flexes the tool (squash 1.06, 160 ms). |
| Rally, Lucky Strike, Steady Hand, Shockwave, Bellows | as SPEC | Shockwave splashes visual neighbours (the snake map); Steady Hand speeds the hold beat; Bellows lengthens the lantern blaze |
| **Crew**: 15 lines, then Echo lines | Line 0 costs 50; lines 0–5 are priced at their unlock depth; lines 6+ are a ×1e4 geometric ladder; ★ ×2 every 10 levels; a crown every 50 | A hire is visible: a miner climbs down a ladder into the frame, or a machine is wheeled in on the rail (1.2 s). A ★ gives the rig a helmet lamp, ★3 gold trim, a crown a glow. The two newest lines are featured at the face; all of them work in caverns. |
| **Gear**: 4 cards per biome (Tools, Rigging, Edge, Lantern) | one-shot ×3 / ×3 / ×3 / ×2 | The Lantern card also upgrades the lantern viewmodel (tin lamp → brass → crystal → sunstone) and Lantern Sense (+1 slice). |
| **Skills** | as SPEC: Dynamite (30 m; 60 s cooldown), Gold Rush (180 m), Overdrive (320 m), Earthquake (600 m), Cataclysm (all four within 5 s) | **Diegetic tools on the rack** on the left timber post: a dynamite crate (sticks reappear one by one as it cools down), a brass bell (Gold Rush), a steam whistle (Overdrive), a blasting plunger (Earthquake). A tap uses one. "Ready" is a calm amber rim, shown only if no other hint is up. There is no skill row in the HUD. |
| **BEST** | lowest payback: `cost/Δincome + max(0, cost − gold)/income` | the centre card; one tap on it is always right |
| Buy modes | ×1, then ×10 / NEXT ★ / MAX after the first ★ | in the card's long-press menu and the Ledger |

### 4.5 The breakthrough loop (60–150 s)

1. **Tells:** violet glints in the Sense window; then, within 3 slices, light leaks, a hollow knock and dust. The objective line
   reads "Breakthrough · 3 m" when it is the best near goal.
2. **Collapse:** the last slice falls *away* from you into the cavern as large chunks, with a deep rumble and a 40 ms haptic.
   The cavern's lights rise from 0 to full over 0.6 s. No shake (it is frequent).
3. **Glide in** (a 0.3 s hold, then 1.2–1.8 s), or the drop-in and rope ride for a sump.
4. **Harvest** 3–6 treasures (1–4 taps each; 8–20 s). The crew starts the next heading meanwhile.
5. **Choose** a heading mouth (or the only one); a fork offers two.
6. **Glide out** to the new face. Auto-advance does this for you after 4 s if nothing manual is left.

Cavern rewards are about 15–40 s of income each (est.). The harvest is not dead time for the economy: the crew keeps digging
the next face while you harvest.

### 4.6 The biome loop: seal and reveal (3–10 min early)

- **The approach.** Within 40 m of a seal never opened before, the objective line reads "Break the Root Knot · 32 m" and the
  face's leaks take the next biome's colour.
- **The fight** (first time ever, model `seals.ts`):
  - HP = 20 s × (crew DPS + 4 × tap damage without crit), ×0.5 for the tutorial Halden Hatch;
  - a 30 s timer, drawn as a ring around the objective's icon, never over the world;
  - the weak point (the padlock, a valve, the clapper…) lights every 5 s for 1 s and takes ×5;
  - at 25% HP a Strike finisher appears on it: a perfect stop hits ×10;
  - an active player wins in about 12–20 s; the crew alone cannot.
- **Fail:** "The seal holds · 64 %". It keeps 50% of the damage dealt, the BEST card glows, and nothing is lost (SPEC L11).
- **Win:**
  - a 60 ms hit-stop, one 0.4° / 120 ms shake, the door splits into ≤ 40 large shards;
  - one 0.12 full-frame light lift for 150 ms;
  - light spills through the doorway, the camera glides through it, and the reveal plays (≤ 3 s, skippable): the biome title
    carved in light on the far lintel;
  - rewards: the seal's relic (a Find), a Crystal-floor chest, 5 gems, and a facet hand from the second seal on (a 30%-high
    sheet; the face stays tappable above it);
  - arrival: 4 gear cards fly into the Ledger (one badge), a new crew blueprint, new event types.
- **Charted gates** (seals opened in an earlier run): a slice of 7 carved builders' blocks at ×3 HP. Breaking one plays a
  1.2 s title flash with the split time ("Crystal Grotto · 1:12 · −4:40").

### 4.7 Collection: the Codex of objects (creatures removed)

- **Per biome, 11 entries:**
  - 6 Finds: 2 minerals, 2 fossils, 2 relics, each +3% to one stat of its biome;
  - 5 Lore: 3 Halden notes, 1 mural, 1 seal card.
- 14 biomes × 11 = **154 entries**, plus Echo variants. A complete page grants a **Biome Seal** (+10% gold and +10% power,
  permanent).
- **Relics have rolled traits** (the Dig-style idea from `hybrids.md` P8):
  - an era (Halden, Drowned, Loom, Star);
  - a condition from the Strike ring (A perfect, B–C good, D–E miss);
  - a rare variant: **gilded** (1 in 20) or **star-touched** (1 in 200), each its own shiny entry.

  A duplicate adds +1 level (+1%). A better condition replaces the old one.
- Every 10 entries pays a Codex chest (Crystal floor). Pity: 6 minutes with no new entry in an incomplete biome plants a geode
  or a fossil cell within the next 6 slices.
- [M] The side-multiplier budget (SPEC §5.6: ≤ ×10 by day 3) loses the Bestiary factor, which gives headroom for the relic
  traits.

### 4.8 Idle, the crew, the camp

- **Where the crew digs.**
  - At the face: the two newest lines, on a shared 0.9 s beat. One rig works the bottom-left block from the floor, one the
    right-hand blocks from a scaffold; machines grind side blocks (the Steam Drill bit, the Borer's head).
  - Everywhere else: the whole roster works the side walls of caverns.
  - Deep lines are machines, not beings: Crystal Resonator, Magma Lance, Bone Press, Rime Auger, Loom Weaver (a loom of light
    threads), Gravity Well, Star Forge, Void Engine, Gate Engine.
- **Offline** (`offline.ts`, unchanged; SPEC §4.2):
  - efficiency 50% of crew DPS, rising to 75% at 250 Embers and 100% at 1e5;
  - a cap of 3 h, rising to 24 h;
  - an exact closed form;
  - the crew stops at the first seal never opened (L10) and pays the rest as gallery gold.
  - Caverns passed offline keep their manual items (chests, relics, Royal keys) on the **Chest Rack** (holds 10).
- **The return:**
  - the return glide (§2.3) passes up to three caverns the crew opened;
  - then one opaque plate: "While you were away · 5 h 12 m · +168 m · +4.2e15 gold · 7 chests on the rack";
  - one tap on **Collect**: the counter rolls, then the rack opens one chest per tap.
  - If the crew waits at a seal, the seal is right there in front of you: the objective reads "Break the Drowned Bell!".
- **Time Crystals and Lantern Oil** (gems; earned only, never sold): as SPEC §5.7.
- **The camp.** The surface Halden camp at the adit mouth is the menu (from the second launch) and the landing of every
  Rekindle, seen in first person at dawn. It grows with lifetime Embers through the six SPEC stages (tents and winch →
  headframe → stone lift tower → brass lantern tower → the Lighthouse → the Lantern City on the horizon). It is where the
  démesure of the account shows.

### 4.9 Events (the Director: `director.ts`, kept; creatures purged)

Cadence U(40, 70) s of active play, never two at once, never during a seal or a T4–T5 ceremony. The deck rules, rotation pity,
the find guarantee and the boredom breaker are kept. After 20 s without a tap, only waiting events are dealt. Each event happens
**in the face frame**:

| Event | From | In first person | Verb | Reward |
|---|---|---|---|---|
| **Lucky Ember** (replaces the Lucky Moth) | first scripted at about 4:50 (after the first Surge), then every 90–180 s of active play | an ember drifts out of a crack and floats across the face for 7 s | tap once | Gold Shower 55% (60 s of income) / Ember Frenzy 20% (×7 for 20 s) / 3 gems 15% / skill refresh 10% |
| Golden Vein | 30 m | the next 5 slices show 3 gold-leaf blocks each, glinting | dig | ×20 gold |
| Glimmerfall | 40 m | crystals fall from a ceiling crack in front of the face | Catch 5–9 | 3 s of income each; 1 in 5 is a gem |
| **Seed Fall** (replaces the Moth Swarm) | 40 m | glowroot seed pods drift down | Catch 6–10 | 8 s of income each |
| **Rolling Geode** (replaces the Treasure Mole) | 80 m | a geode tumbles out of a joint and rolls across the floor pool | tap 3 times | a Copper-floor chest |
| Cave-in | 120 m | 3–5 boulders drop in front of the face | 1–3 taps each | 10 s of income each; ignored ones become boulder blocks (×3 HP, ×3 gold), never a loss |
| Supply Rope | 180 m | a crate is lowered from the ceiling into the frame | tap, then Pick 1 of 3 boosts | §5.11 boosts |
| **Runaway Cart** (replaces the Mimic) | 240 m | a loose cart with a chest in it rolls down the rail | tap 5 times to brake it | a Crystal-floor chest (ignored: it stops further on and leaves a Wood chest) |
| Treasure Map | 320 m | a chalk mark appears on a block 6 slices deep, seen through the Sense | dig to it | a Crystal-floor chest |
| Ancient Echo | 400 m | runes carved in the heading's side wall light in order | Sequence | a Lore fragment, 10 gems |
| Geode | rare cell, 120 m | a hollow with a Strike ring | Strike | perfect: a rare Find + 5 gems |
| Biome signature | per biome (§3.7) | a themed widget | Mash, Catch, Strike or Sequence | 60 s of income and a Find roll |

All the widgets (Catch, Mash, Strike, Sequence, Pick) are kept. They are skippable, never block digging outside their target,
and never take anything away when missed.

### 4.10 Achievements, rank, records

- **Feats:** 20 families with tiers I–X, then endless. Each tier gives +1 Mark (+1% damage and gold), gems and XP.
  - **Kindred** (creatures caught) is replaced by **Wayopener** (breakthroughs opened: 1, 10, 50, 150, 400, 1K, 2.5K, 5K, 10K,
    25K). Its tier X perk: every cavern holds one more treasure.
  - The secret **Moth Friend** is replaced by **Through and Through**: one tap clears a whole heading to its cavern.
  - The rest are kept as SPEC §7.6 (Delver, Breaker, Spark, Rhythm, Tinkerer, Starwright, Forgemaster, Foreman, Lockpick, Lucky
    Lamp, Démesure, Kindler, Ember-born, Collector, Wayfinder, Overseer, Wonderstruck, Swift, Contractor).
  - Target: ≥ 12 tiers in the first 30 minutes.
- **Rank** (never resets): `need(r) = 120 · r^0.78` XP. A breakthrough is worth 25 XP and a Vista 60. Ranks bring +0.5% to
  everything, gems, a Copper chest every 5 and a title every 25.
- **Records and races:**
  - splits per biome;
  - the **ghost lantern**: a pale blue glint *behind the face* at the depth your previous run had reached at this run time
    ("+42 m ahead" in the contextual slot when you pass it, and it bursts into blue sparks);
  - **planted lanterns**: every Rekindle leaves your lantern set into the rock where you stopped, and later runs pass it in
    the drift wall. A tap gives +2% damage for the run.

### 4.11 Prestige (the model's three layers, kept with their formulas)

- **Rekindle → Embers.** At the Ember Shrine (the Drowned Ruins Vista, 600 m):
  - `EmbersTotal(R) = floor(25 × 2^((R − 600)/200))`: "every new 200 m of record doubles your Embers";
  - each Ember is +10% damage;
  - Ember perks at 1, 10, 25, 50, 100 (Head Start Plunge), 250, 500, 1,000…
  - **Staging:** a 0.6 s hold on REKINDLE (a brass ring fills); your lantern is set into the face and stays as a warm emitter;
    a cross-fade to dawn at the grown camp; then the Head Start Plunge into the first face.
- **Weave → Threads.** At the Loom's Heart (3,100 m), with live Ember kindling on the re-climb.
- **Breach → Sigils.** At the Last Gate (5,800 m): eight challenge runs with endless tiers (+500 m per tier). "Blind" now means
  no Lantern Sense and no events.
- **Re-climbs stay fast:**
  - below your record, caverns without manual items are passed by auto-advance with a 1.2 s glide;
  - charted gates break like hard slices;
  - Head Start Plunges cover 10–30% of the record.

### 4.12 Démesure, and how it stays readable

Escalate the **quality and scale** of things, never their **quantity** (`look.md` §4.5).

**1. The tool in hand.** 15 named forms, then Lantern Edge I, II, III… forever.
- Each changes its silhouette and material (steel, brass, crystal, obsidian, rune-lit, star metal).
- From Lantern Edge I, a faint aura grows logarithmically (`toolAura`, capped).

**2. Bore classes: the hole itself grows** (est.; prototype after the slice). Every three pick tiers, the next heading cut out
of a cavern is one size class bigger. The camera's distance scales with the block size, so **blocks stay about 97 px wide on
screen**. The world around them is what grows:

| Class | From | Block | Heading | Face distance | What sells the scale |
|---|---|---|---|---|---|
| Heading | start | 0.73 m | 2.4 m octagon | 3.0 m | timber sets, a hand-pushed cart |
| Drift | pick tier 4 (Steel, L75) | 1.1 m | 3.6 m | 4.5 m | a centred double rail; two carts side by side |
| Gallery | tier 7 (Obsidian, L150) | 1.8 m | 5.9 m | 7.4 m | a crew figure stands about one block tall; brass floodlamps on tripods light the face (two of the four per-pixel practicals); machines on gantries |
| Tunnel | tier 10 (Thunder Maul, L225) | 3.0 m | 9.9 m | 12.3 m | a crew figure is about half a block tall; shards are boulders; the sound drops an octave |
| Great Bore | tier 13 (Star Breaker, L300) | 5.0 m | 16.4 m | 20.5 m | a crew figure is a third of a block; the face is a cliff; carts are toys; the lantern's pool lights only the gantry at your feet |

- **The pose scales with the class.** From Gallery up you stand on the crew's gantry, with the eye at about half the face's
  height, so the framing of §2.4 holds exactly; the drop to the floor below adds to the sense of scale. The block-to-distance
  ratio stays 0.244, which is what keeps blocks at about 97 px.
- The size grows only at a breakthrough, so geometry never jumps. A pick-tier ceremony says it: "Your next heading: a
  Gallery."
- A Rekindle shrinks the bore again, and a re-climb regrows it within minutes, which replays the progression on every run.
- Great Bore is the cap: a 16 m heading plus the caverns it opens onto still fits RingWorld's 64 × 64 m footprint.

**3. Clean big events, not more of them:**
- a whole slice shattering in one tap (Shockwave L9+);
- a bore 8 slices deep;
- at absurd power, **Through**: one tap clears every slice to the next cavern, the line collapses in a 0.6 s wave of large
  chunks, and the Plunge carries you into the cavern.

The particle cap never moves.

**4. Numbers.**
- `Big` runs to 1e2091 with letter pairs, then scientific.
- Counter colours follow the suffix tier.
- The first appearance of each suffix is a T4 milestone; 1e100, the "Googol", is a T5 fanfare at about 31 h.

**5. The crew and the camp.**
- Machines escalate: a magma beam, a bone press, a loom of light, a gravity lens, a star furnace, the Gate Engine.
- Echo lines scale ×1.15 each.
- The camp grows into the Lantern City.

### 4.13 Pacing targets (first person, est.) and the week

The model's base calibration (SPEC §5.12, 5 taps/s, no side systems) reaches 40 m at 1:09, 120 m at 3:12, 240 m at 7:42 and
600 m at 24:18. First person adds overhead:
- breakthroughs: about 13 s each, every 25–40 m;
- seal fights: about 18 s;
- Vistas and focus pops;
- tutorial prompts.

Meanwhile the full model with every W2 system on already runs **4–5× too fast** (`reuse.md` §1: 600 m at 4–5 min, four
`it.fails`). The calibration must therefore be redone with a **face-paced bot**: 4 taps/s, glide and harvest times modelled,
caverns harvested at their roll. Trim the side multipliers (E25) first; never touch the curves first.

| Milestone | Target (first person) | Model base sim |
|---|---|---|
| first purchase / first crew | ≤ 25 s / ≤ 40 s (tutorial-paced) | 5 s / 5 s |
| first breakthrough (the Root Cellar, 24 m) | 1:30–2:00 | — |
| Halden Hatch (40 m) | 2:00–3:00 | 1:09 |
| Crystal Grotto (120 m) | 5:00–7:00 | 3:12 |
| Halden Works (240 m) | 10–14 min | 7:42 |
| Ember Shrine, first Rekindle (600 m) | 25–35 min | 24:18 |
| first wall (Frost Hollow, 1,800 m) | > 90 min | 1:57 |

**The week**, on the SPEC session model (40 min first, then 6 min every 2 h, offline at 50%); est., to be re-run:

| When | What |
|---|---|
| day 1 | about 10–12 biomes, 5–7 Rekindles, the first Weave, the Tunnel class |
| day 2 | Void Sea and the Gate; Breach unlocks; the Googol fanfare |
| day 3 | Echo I |
| week 2 | Breach tiers add ≥ 600 m a day (SPEC E10); a new Echo stratum every ≤ 2 days |

---

## 5. The always-shown objective

**One line, on the lintel, in every frame of play.** It shows an icon, ≤ 32 characters, a 3 px progress bar and a reward chip.
It is visible during sheets, ceremonies and glides. A tap on it opens the place where the goal is done.

**The selection** (`goals.ts`, kept; re-evaluated every 0.5 s; the first match wins):
1. a tutorial step;
2. something to claim (the offline haul, a finished Path step);
3. a seal never opened, within 40 m: "Break the Root Knot · 32 m";
4. Rekindle (or Weave) recommended: "Rekindle: +273 Embers · ×6.5";
5. the current Path step, if its ETA ≤ 120 s or it is ≥ 50% done;
6. **new:** a breakthrough within 8 m: "Breakthrough · 6 m";
7. the best near goal (progress in [0.15, 1) and ETA ≤ 90 s): the next ★, a gear card, a 20 m mark, a Feat tier, a Rank;
8. the fallback: the next 20 m mark, or when walled: "Upgrade or Rekindle to go faster".

**Rules kept:**
- the line stays at least 4 s unless it completes;
- on completion the reward flies and the next goal **slides in without emptying**;
- median fill ≥ 0.55 (SPEC E12).

**Path changes.** The creature goals ("Catch a creature", "Catch the Lucky Moth") become "Open 3 caverns" and "Catch the Lucky
Ember". The "tap the heading" step is added after "Open the chest".

**One hint at a time, in the world:** a calm static amber rim on the thing to touch (look.md rule 4), with no pulse loop. The
only UI loop allowed is the objective's "ready to claim" state.

**First-time cards** (kept): one opaque plate under the objective line for 2.5 s, no button, e.g. "NEW · Golden Vein — gold in
the next 5 slices!". Every first-time card is listed in the Codex under Guide.

---

## 6. The first 10 minutes on a phone, minute by minute (est. timings)

The player holds the phone in one hand, portrait, thumb low. Each row says what is seen, what the thumb does and what it
should feel like.

**0:00–1:00 — "Tap the rock."**
- **0:00** First launch skips the menu. Black, then a match flares low left and the lantern catches (the wordmark's lantern-O
  match-cuts into your flame, 900 ms).
- **0:01** Warm light fills a small timbered heading. Behind you a cool shaft of dusk falls through the adit mouth onto the
  floor. Three steps ahead is a wall of seven umber blocks under a lintel. One wears a soft amber rim. "Tap the rock".
- **0:03** The thumb lands. The pick is already at contact, a smear behind it. The block splits into eight clods that tumble
  into the lantern pool, and one copper-coloured coin streaks up. The gold plate fades in: 1.
  - Feeling: *that was solid, and it was mine.*
- **0:05–0:15** "Clear the face" with 7 pips. Four more taps, each block a different clack. At the fifth break the last two
  crumble, the slice drops and the view eases one metre forward. The depth plate fades in: "1 m". Through the next slice,
  two copper glints.
- **0:20** 30 gold. The Pick card rises with a rim: "Upgrade your pick". One tap: the pick flexes, and the next block breaks
  in one hit.
- **0:35** 50 gold. "Hire a Shovel Hand". One tap: a miner climbs down a ladder into the lower left and starts swinging at the
  bottom-left block, on a slow steady beat.
- **0:50** Copper at slice 3: nuggets roll out, and the gold climbs faster.

**1:00–2:00 — "Something is behind the rock."**
- **1:00** After 12 taps: "Hold to keep digging". The thumb rests; a thin brass ring closes; the pick settles into a rhythm,
  bores into a block, then the one behind it.
- **1:05** Slice 6: an iron-banded lid shows in the centre of the face. "Tap what glows". Tap: the chest slides out and rises
  into the lantern light. Tap: it opens, steps Wood → Copper honestly, coins and two gems fly. The gem chip appears for 2 s.
- **1:25** Slice 12: a block's front cracks open on a tiny lit hollow. Inside, a Halden lamp still burns on a scrap of
  paper. Tap: "Day 40. Lamp seen below the lift. Nobody of ours is down there."
  - Feeling: *someone was here.*
- **1:35** 16 m: the Pick Crew line unlocks. Hire it: two miners take a scaffold on the right. Shovel Hand level 10: the first
  ★ ("×2"), and its helmet lamp lights.
- **1:45** 22 m: violet glints in the face. Within three slices, green-gold light leaks through the joints, the knock turns
  hollow, dust sifts down. The objective line: "Breakthrough · 2 m".
- **1:55** The last slice falls away from you. Light floods in. After a 0.3 s beat the view glides into the **Root Cellar**: a
  chandelier of roots hung with crystals, a cold Halden campfire, three crystal clusters, a crate.
  - Feeling: *wonder; the first real space.*

**2:00–3:00 — "The Hatch."**
- **2:00** First the three crystal clusters (2–3 taps each, each a chime of the biome's scale), then the crate. Then "Tap the
  light to go on" appears, with a rim on the lit heading mouth across the cellar. Tap: the view turns, glides, and arrives at
  a new face, where the Shovel Hand is already at work.
- **2:20** 30 m: a dynamite crate appears on the rack at the left post, rimmed. "Dynamite: blast 3 slices". Tap: three charges
  hiss into the face, then a deep thump (sub-bass, a 60 ms haptic, the lantern flickers). Three slices blow out, and the view
  creeps 3 m.
- **2:35** 36 m: the leaks turn green. The objective line: "Break the Halden Hatch · 4 m".
- **2:45** 40 m: the face is a timber door barred with chains and a padlock. "Break the hatch!" A 30 s ring around the
  objective's icon, a drum layer. The padlock glows every 5 s: tap it for ×5. At 25%, a needle sweeps the padlock: tap,
  perfect.
- **2:58** A 60 ms freeze, one small jolt. The hatch splits, light pours through the doorway, the view glides through.
  "GLOWROOT CAVERNS", carved in light on the far lintel. Roots brighten as your lantern passes (≤ 3 s; any tap skips).

**3:00–4:00 — "Bigger."**
- **3:05** Four gear cards fly into the Ledger and one badge appears: "New gear: one tap, big boost". The Mine Cart blueprint
  arrives.
- **3:20** The first Glowroot face: moss-slate blocks with tin seams glinting. "Fill the lantern" (the flame is pre-filled to
  140/240). Keep tapping: the flame grows in steps.
- **3:40** **SURGE**: the lantern blazes, the face goes gold, the drums enter. Ten seconds of ×3.
- **3:50** Pick 25: the **Copper Pick**. The new tool turns once in the light (1.2 s), with a deeper strike sound.

**4:00–5:00 — "The Rootheart."**
- **4:00** Hire the Mine Cart: a rail appears along the left wall, and carts trundle in, fill, and roll away on the crew's
  beat.
- **4:25** A breakthrough into the Glowroot **Vista**. The view glides in and tilts up 12° over 1.2 s: the Rootheart, an 18 m
  tangle of glowing roots, brightens toward your lantern. Far beyond it, for one second, a warm point of light far below.
- **4:35** The relic shrine: a Halden lamp-badge rises into the light, and a needle sweeps a brass arc. Tap: condition B. "NEW
  · Relics have traits". A Royal Chest waits, with a 10-gem key: the player has 12 gems. Open it: Reliquary.
- **4:50** The first **Lucky Ember** drifts out of a crack across the next face. Tap: Gold Shower.

**5:00–6:00 — "The Root Knot."**
- **5:10** The Seed Fall event: glowing seed pods drift down in front of the face. Tap six of them.
- **5:30** "Break the Root Knot · 12 m"; the leaks turn cyan.
- **5:45** The first real mechanism seal: a tangle of roots with an amber heart, three knots lighting in turn. Won in about
  16 s.
- **5:55** The Crystal Grotto reveal. Then the first **facet hand**: a 30%-high sheet with 3 cards ("Pick one: it lasts this
  run"). The face stays tappable above it.

**6:00–7:00 — "Down."**
- **6:10** The Steam Drill blueprint. Once hired, a side-mounted drill grinds the middle-right block.
- **6:30** **The first sump.** A cavern's far exit is a pit with a hoist cage. Tap it: the view moves into the cage and looks
  down at a floor of seven slate blocks. Dig down: each cleared slice lowers the cage a metre, and the winch clanks.
- **6:50** The Glimmerfall event: crystals fall through the cage's light. Catch them.

**7:00–8:00 — "The drop."**
- **7:10** The sump's floor thins: cyan light from *below*.
- **7:20** The floor gives way. The view holds at the lip, looking straight down into a crystal grotto 8 m below. The hoist
  lowers you, slowly (2.2 s), past crystal spires.
  - Feeling: *vertigo, then delight.*
- **7:40** The first **fork**: two heading mouths, one glinting warm (Rich), one cyan (Finds). The player chooses.

**8:00–9:00 — "The Hand in the Crystal."**
- **8:15** A Treasure cache grotto: a Copper chest, rolled up to Crystal.
- **8:40** The Crystal Grotto **Vista**: a 20 m crystal with a human outline inside, lit from within, framed by the dark breach.
  The camera lingers (2.6 s). The relic shrine; a Find for the Codex page.

**9:00–10:00 — "The hook."**
- **9:10** Pick 50: the **Iron Pick**. The cards fill faster than the player can tap them; BEST is always the answer.
- **9:30** Feats toasts (Delver II, Breaker II, Lockpick I); Rank 6.
- **9:50** The objective line: "Reach Halden Works · 240 m". The Other Lantern's glint deep in the Sense window: "−600 m".
- **10:00** If the player locks the phone, the crew keeps digging. The next launch opens on the return glide through what
  they opened.

**What the first 10 minutes contain** (est.):
- about 185 m dug, 3 biomes seen, 2 seals, 2 Vistas, 6–7 breakthroughs, 6–8 chests;
- 3 tools in hand (Rusty, Copper, Iron) and 4 crew lines;
- 1 relic, 1 fork, 1 sump, 4 events, 1 Surge.

Never more than one new mechanic per 40 s, and never two prompts at once. The tutorial sequencer holds a prompt until the
previous one completes.

---

## 7. Visual direction: the answer to "horrible, glitchy, illegible"

### 7.1 Each verdict, its cause and the rule that answers it

| The director said | What caused it (`look.md` §1) | The rule here | Automatic check (`look.md` §6) |
|---|---|---|---|
| **Horrible, very ugly** | Ores painted as flat glowing stickers (L1); pixel textures smeared across sculpted rock (F1); mud (F2); exposure at 1.85–2.6× with saturation boosted (L2) | No textures on the world: shape, facets and vertex colour carry the material (rule 1). Valuables are 3D objects in the rock (rule 2). Light the scene, never raise exposure (rule 5). Darks are hued, never brown. 60/30/10 palette. | sampler lint; no planar-quad valuables; clipped pixels ≤ 1.5%; saturation histogram |
| **Lots of visual glitches** | Seams where two painters met (L3); a crate floating in a vista; an orb inside rock (L6); backdrop cards (L5); slivers (L7) | One material path per surface. No billboards: what lies beyond a breach is geometry fading into fog. The face is one closed instanced set. Every joint of the spiral is hidden inside a cavern. Contact tests for props. | face-ID flicker test; sprite occlusion test; ≤ 2% pixel change outside a broken block's footprint and its debris |
| **Animations far too present; screen illegible** | 240–650 particles, a shock ring and a shake on every break, a permanent sway, chroma, iris (L9); a third of the screen as glass HUD (L10) | Camera never moves on a tap; ≤ 3 foreground moving groups, ≤ 2 ambient; ≤ 80 particles over ≤ 6%; one ceremony at a time ≤ 1.2 s; no post-process theatrics; HUD bands ≤ 18%, opaque; ≤ 5 numbers; one focal object per frame: the face in the lantern pool | FX director asserts; view matrix identical over 100 taps; DOM HUD measure; count of visible numbers |
| (v1) *Nothing indicated; empty caverns* | No guidance; empty floors (F2); the body hiding the path (F5) | The objective line; one amber rim; Lantern Sense; the fill contract from every stand; no body | `fill-scan` from stand frustums; objective present in 100% of play frames |

**The stillness rule:** 0.6 s after the last tap, the screen is still except for the ≤ 2 ambient groups (the crew beat and the
motes). UI elements animate only when a value changes.

### 7.2 The look in one line, and what is taken from Lumi Master

> A wall of faceted, hand-made-looking stone in a warm lantern pool, three steps away. A glint of what lies behind it. Every
> thing else quiet and cool.

**From Lumi Master (look and presentation only):**
- few tones per form;
- warm, lifted mid-tones with no crushed blacks and no neon;
- one focal event per beat (here: the face);
- the next thing visible before it arrives (glints and leaks);
- forward motion *into* the picture (the creep, the breakthrough glide);
- short reward beats (its post-test lesson);
- one hero control that never moves (here the world itself, plus the BEST card);
- a colour script per region.

**Not taken:**
- its painted 2D presentation (DEEP DOWN's edge is real 3D light);
- its daylight palette;
- edge icon clutter and small text.

### 7.3 The face shot: its value recipe

| Zone | Display value | Saturation |
|---|---|---|
| Front blocks, lit side (the tap target: the brightest large area, ≥ 1.6× the frame mean) | 0.62–0.75 | host stone ≤ 25% |
| Front blocks, shadow side, and joints | 0.18–0.30 | — |
| Blocks behind holes (1 m deeper) | 0.30–0.42 | — |
| Timber sets, walls, floor pool | 0.20–0.45, warm | ≤ 30% |
| Ceiling, frame edges | 0.05–0.15, the biome's hued dark | — |
| Glints | ≤ 6 points of ≤ 4 px, ≤ 0.5% of the frame | accent |
| Ore nuggets, gems | one highlight each; a gem's body ≤ 1.5 HDR | accent, ≤ 10% of the frame in total |

**The squint test:** at 25% scale in greyscale, a stranger finds "where do I tap" in under 1 s.

### 7.4 Light (`look.md` §4.2, applied to the face)

- **Key: the lantern.** A point light at the viewmodel lantern (about −0.30, −0.45, +0.35 m from the eye), `#ffe6c6` at the
  core shifting to amber `#ffb35c`, with v1's windowed inverse-square falloff (radius 9 m).
  - Held low and left, so the face's blocks get a lit upper-left and a shadowed lower-right.
  - The lantern **is** the face's light: no flash, no ring light.
  - In Gallery class and above, two floodlamps take over the key on the face; the lantern keeps the floor pool.
- **Fill:** hemispheric, in the biome's cool colour, at 20–35% of the key at the face.
- **Rim:** at a face, from the cavern ahead through the leaks only (an authored emissive on the last 3 slices); in caverns, the
  far rim light in the next biome's accent.
- **Practicals:** the nearest 4 lit per pixel (lamps, braziers, crew lamps, floodlamps); all others baked into vertex colour.
- **AO:** per vertex, baked by the mesher and into the block variants (0.5–0.7). No SSAO, no shadow maps on Balanced.
- **Shading:** wrapped Lambert (wrap 0.3), quantised softly into 3 steps. Specular only on metal, crystal, ice and wet stone
  (one value-capped lobe).
- **Grade:**
  - exposure 1.0 ± 0.15;
  - bloom threshold ≥ 1.0, strength 0.15–0.25 (off on Battery);
  - saturation ≤ 1.0;
  - one LUT pair per biome;
  - vignette 0.15, dither on;
  - no chromatic aberration, lens flare, grain or motion blur.
- **Emission:** ≤ 4% of the frame during a dig, ≤ 10% in a Vista.

### 7.5 Palette and the colour script

**Global rules (`look.md` §4.4):**
- **60 / 30 / 10:** cool dark stone, warm lantern-lit mids, ≤ 10% accent.
- Host stone saturation ≤ 25%.
- Two accent hues per biome, plus amber, which is constant everywhere: it is the brand and "you are here".
- Hued darks.
- **One value peak per frame**, on the tap target.
- Red only for danger: magma is orange and yellow.
- Neighbouring biomes alternate low key and high key.
- Never neon over more than 0.5% of the frame.

**Colour script** (`look.md` §4.4's table, adopted, with what this angle adds):

| # | Biome | Key | Darks / fog | Accents | The face reads as | The breakthrough reads as |
|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | mid | blue-dusk / `#2a2a33` | amber `#ffb35c`, sky `#9fc3e6` | warm umber clods, root ribbons | a root chandelier against dusk blue |
| 1 | Glowroot Caverns | low | green-black / `#142226` | `#9be7a8`, `#5fe0c0` | moss slate with glowing veins | root threads brightening toward you |
| 2 | Crystal Grotto | low, cyan rim | blue-black / `#1e2a3a` | `#2fb6cc` / `#8fe3ee`, violet gems | slate with protruding prisms | the r1/f17 frame: dark mouth, cyan cathedral |
| 3 | Halden Works | mid, warm | warm black / `#231a12` | brass `#e2b673`, steam `#6fd6c4` | brick and timber courses | a hall of gears lit by its own furnace |
| 4 | Fungal Deep | low | violet-black / `#1a0f22` | `#c58cff`, `#a8ff6a` (decor glow only) | plum stone, caps on the lintel | caps glowing from below |
| 5 | Drowned Ruins | mid-low, wet | blue / `#0a2236` | `#5fb7ff`, braziers `#ff9a48` | masonry blocks with wet sheen | a sunken procession in still water |
| 6 | Magma Veins | high contrast | red-brown / `#2a140c` | `#ff6a2a` → `#ffc04a`, underlight | basalt with glowing cracks | a lava river under a bridge |
| 7 | Fossil Halls | high | warm umber / `#221e1a` | resin `#ff9a2a`, `#c0b4ff` | bone-ivory blocks | a ribcage arching over the drift |
| 8 | Frost Hollow | high, cold | steel blue / `#1a2a3a` | `#7fd8ff`, `#9dffd8` | big flat ice facets | light through an ice ceiling |
| 9 | the Loom | mid | violet / `#1e1c18` | `#fff4d0`, `#b9a2ff` | pale ashlar | the archive of light threads |
| 10 | Iron Core | low | blue-steel / `#141820` | `#8fb8ff`, white-hot `#ff7a2a` | riveted plates | an escapement turning in the dark |
| 11 | Star Heart | high, inverted | star glass / `#3a2a10` | `#fff1c2`, `#ff8ac8` | gold beds in black glass | the only place brighter than the lantern |
| 12 | Void Sea | lowest | near-black violet / `#0c0820` | `#7a6cff`, `#d8e0ff` | almost bare stone | maximum calm, minimum detail |
| 13 | the Gate | low | rune stone / `#1a1226` | rune cyan against amber, gold `#e2b673` | carved glyph blocks | the Lintel: lantern meets lintel |

### 7.6 Materials: "Lamplit Faceted" (the look spike's recommended primary)

| Family | Geometry | Colour and shading | Never |
|---|---|---|---|
| **Face blocks** | Instanced faceted prisms: 6–10 variants per rock family, with a jittered front of 8–14 facets of 0.2–0.35 m, chamfered edges, and a slightly irregular silhouette inside the bond. Per-instance rotation and mirror, so no two neighbours match. | Vertex colour from the biome's 5-stop ramp (by stratum, slice and low-frequency noise); AO baked per variant; 3-step ramp | textures, painted patterns, glowing tiles |
| **Cracks** | A procedural groove pattern in the block shader, radiating from the stored tap points; 3 stages; resolution-free | dark grooves with a warm hit light for ≤ 80 ms | decals that stretch |
| **Hollows** | a cubby carved inside the block variant, with its own tiny practical | the find on a plinth or in a niche | — |
| **Ore** | instanced nuggets and vein ribbons (6–20 cm angular lumps, 3–12 per block, partly sunk) | metal response: one crisp highlight in the tier's glint colour | a coloured square |
| **Gems and crystals** | instanced faceted prisms in clusters of 3–9 | opaque body with a fake inner glow (≤ 1.5 HDR) and an edge highlight | alpha-blended glass |
| **Chests, relics, the tool, the lantern, carts, machines, timber** | bevelled boxes and lathes (v1's prop language: chamfers of 0.02–0.04 m) | wood and brass in vertex colour; value-capped specular | a glowing tile |
| **Walls, drifts, caverns** | faceted surface over the voxel field (`mesher.ts` with flat normals and bigger relief, per the spike); strata as real ledges | as face blocks; walls closer than 0.7 m darken | 16 texels/m pixel paint |
| **Seals** | authored mechanism models: timber, chains, a carved slab, a bell, a wheel, a lintel | grooves 2–4 cm deep with emission only at the bottom (rune cyan `#2fb6cc` / `#8fe3ee`) | floating rune sprites (F6) |
| **Shards** | BSP fracture of the block variant (`fracture.ts`), sharing the block's vertex colour | lit by the scene | section-painted shards |

**Budgets:**
- 8–16 triangles per m² within 3 m; ≤ 220k visible triangles;
- ≤ 120 draw calls (the face is 1–2 instanced draws, nuggets and crystals are instanced, and static geometry is merged per
  chunk);
- at most 56 face blocks drawn (7 × 8).

### 7.7 The FX budget (a hard cap, counted by the FX director and asserted in tests)

**Global caps:**
- **Foreground:** ≤ 3 moving groups: the tool, the break burst, the loot flight or a counter roll.
- **Ambient:** ≤ 2: the crew on its shared beat, and the motes.
- **Particles:** ≤ 80 live, covering ≤ 6% of the screen, none over 32 px. They are lit by the scene: dark chips and a low dust
  puff, no cream discs.
- **Shards:** ≤ 36 live, none over 48 px.

**Per-event specs** (tiers T0–T5 of `juiceBudget.ts`):

| Event | Tier | Spec |
|---|---|---|
| Tap, no break | T1 | Tool contact plus a 220 ms recovery. The crack grows a stage. The struck facet brightens by +0.4 for ≤ 80 ms. 4 chips and 1 dust puff (≤ 0.4 m). A material tock, a 10 ms haptic. **No number, no camera motion.** |
| Block break | T2 | 9–12 shards out and down (0.5–1.5 m/s, spin, gravity), landing in the pool and fading within 0.6 s; ≤ 12 particles; 1–4 nuggets, then ≤ 6 tokens to the gold plate (≤ 0.45 s); a crunch, then the clatter 0.3 s later; a 20 ms haptic |
| Crit | T2 | as a break, plus "×5" stamped on the block (0.4 s) and a +0.6 flash (80 ms) |
| Pierce (2–8 deep) | T2 | the blocks behind break in sequence 40 ms apart along the struck line; +2 semitones each |
| Slice crumble | T2 | the remaining blocks shake for 0.3 s (the blocks, not the camera) and fall as one burst (≤ 24 shards); then the creep |
| Breakthrough | T3 | the slice falls inward as ≤ 30 large chunks; the cavern's lights rise over 0.6 s; a rumble and a 40 ms haptic; no shake; then the glide |
| Chest / relic focus pop | T3 | rise 0.3 s; the roll-up 0.6–1.0 s (honest steps); loot to counters; ≤ 1.2 s in total |
| Dynamite | T3 | charges set (0.5 s fuse, one spark each), 3 slices out as one burst (≤ 36 shards, ≤ 40 particles); sub-bass, a 60 ms haptic, the lantern flickers; creep 3 m; no shake (it recurs every 60 s) |
| Surge | T3 | the lantern blazes (radius ×1.6), a 0.1 warm edge vignette, drums. No extra particles. |
| Seal win | T4 | a 60 ms hit-stop; one 0.4° / 120 ms shake; ≤ 40 shards; a 0.12 full-frame lift for 150 ms; light spilling through the doorway |
| Biome reveal | T5 | a window composition and a pitch-up ≤ 15°; the title carved in light; ≤ 3 s, skippable |

**Never:** shock rings, iris wipes, chromatic aberration, light rays as a post effect, bloom pulses, a camera kick on taps,
idle sway, a glass HUD.

**Escalation by quality, never by quantity:**
- higher tiers change the tool's silhouette, the chunk size (bore classes), the sound's depth and the counter's speed;
- the caps never rise.

### 7.8 UI calmness ("Lamplight on the Lintel", applied to first person)

1. **The world keeps ≥ 80% of the screen.** HUD top ≤ 9% (76 px), bottom ≤ 9% (74 px), at 390 × 844. These are the lens's
   most-stretched bands anyway.
2. **Opaque octagon plates**, slate-900 at 0.94 with a brass rim and Lintel numerals. No glass, no blur, no pills, no rounded
   rectangles.
3. **≤ 5 numbers** (§2.5). The cards carry no digits.
4. **One objective line, one hint (an in-world rim), one badge at a time.** Never a ribbon, dot, pulse and ring on one card
   (`peek-2`).
5. **Still when idle.** Enter: an 8 px rise plus fade over 160–240 ms. Exit: a 140 ms fade. A value pop: 160 ms. A card's ready
   ping at most once per 3 s. At most one looping UI animation, and only the objective's "claim" state.
6. **Text:** body ≥ 15 sp, labels ≥ 13 sp, never under 12. Contrast ≥ 4.5:1, on an opaque plate, never directly over the 3D
   scene.
7. **Sheets** (the Ledger) cover the bottom ≤ 55% and dim the world by 30%. A facet hand covers ≤ 30%, so the face stays
   tappable.
8. **Two registers, never mixed:**
   - expedition kit (amber and brass) for what you own and do;
   - builders' script (cyan) for discoveries and lore;
   - violet for the unknown or locked;
   - red for danger only.
9. **The HUD never moves with the camera,** never shakes and never flashes.
10. **The diegetic first.** The Surge gauge is the lantern flame, the combo is the tool's heat, skills are tools on the rack,
    the next find is a glint. The HUD keeps only what the world cannot say.

### 7.9 Capture tests specific to the face (added to `look.md` §6's ten)

All captures are taken on the rig at 390 × 844, DPR 2, Balanced, from every authored pose.

| # | Check | Pass |
|---|---|---|
| F1 | the tap target's brightness | the mean luminance of the target block ≥ 1.6× the frame mean |
| F2 | depth hierarchy | the exposed second-slice blocks' lit value ≤ 0.65× the front's |
| F3 | glints | ≤ 6, total area ≤ 0.5%, none brighter than the target's lit side |
| F4 | taps don't move the camera | identical view matrices over 100 taps with no slice cleared |
| F5 | a break stays local | ≤ 6% of pixels changed outside the block's footprint plus its debris |
| F6 | stillness | 0.6 s after the last input, mean ΔL ≤ 0.01 outside the two ambient regions |
| F7 | block size | every live front block ≥ 92 px on its short screen axis, at 360 × 740 too |
| F8 | the frame band | the 7 blocks inside 30–70% of the height and 10–90% of the width, at all three viewports |

The meta-rule above all of these: **the director's phone is the reference display.** Every look round ends with an APK and
three on-phone screenshots, read at arm's length.

---

## 8. What code is reused (from `reuse.md`, applied to this angle)

### 8.1 Kept as is, or with small changes

| Area | Files | Use here |
|---|---|---|
| Engine | `VoxelWorld`, `raycast`, RingWorld (minus the cut and its apron), `slabWorker` / `slabLoader` / `slabLight`, LightField (`openMany` for each cleared slice), LanternField (its source moved to the viewmodel lantern), mesher and workers (`section` off; flat normals per the spike), `ChunkRenderer` | the drift, the caverns and the light |
| Render | `Renderer`, `PostFX` (iris and shock removed, the vignette re-weighted), `QualityGovernor`, `GpuParticles` (the z-60/57 planes become a depth fade), `Shards` / `fracture` / `rigidBatch`, `PropRenderer` (with its raycast), `StructureRenderer`, set pieces (re-lit and re-framed as Vista geometry), `Lanterns.ts` (planted lanterns, the Other Lantern) | breaks, props, Vistas |
| Model | all of `src/idle/**`: curves, cells, crew, gear, chests, seals, director, widgets, offline, codex, feats, rank, records, prestige, facets, goals, tutorial, sim | the whole economy |
| Shell | the boot, modes, fixed step, autosave, lifecycle and crash handling of `IdleGame.ts` (by copy); `FrameGuard`; `main.ts`; `SaveSystem`; settings; the brand kit; `displayLedger`, `press`, `Ticker`; `layout.ts`; audio synthesis (`eventMap` remapped); haptics; Android; `tests/e2e/touch.ts`; `apk-sim.mjs` | — |
| UI pieces | `TopBar`, `GoalBar`, `QuickBuy` / `Card` (digits removed), `Sheet`, `FirstTimeCard`, `ReturnFeast` (the return plate), `SealHud` (the ring on the objective icon) | the calm HUD |

### 8.2 Mined from v1 (`9eb4166`)

- `ropeRide.ts`: the rope ride, the glides and the creep profile.
- `MiningController.pick()` (screen → voxel and prop ray) and `TapController`'s 30 px fat-finger rule.
- `lockedVerticalFov`.
- `runeDoor.ts`: hold-to-wake for the Gate's runed lintel.
- `generateWorld.ts`'s architecture vocabulary: columns, stairs, the portal gate, the arched bridge, `crystalSeam`, the
  lamp-at-every-landmark rule.

### 8.3 New for this angle (est. lines)

| File | What it does | Lines |
|---|---|---|
| `world/hybrid/deepPath.ts` | the pure spiral path: `pathAt(seed, d)`, run kinds, turns, sump choice, branch salts | 350 |
| `world/hybrid/runGrammar.ts` (replaces slab passes 4–9) | the drift tube with its plug voxels, timber sets, caverns from the roll, Vistas, forks, sumps, crew anchors, the rack anchor | 900 |
| `render/hybrid/FaceRenderer.ts` | instanced faceted blocks for 7 × 8 slices, cracks, hollows, Lantern Sense glints, leaks, block-level shake and drop | 700 |
| `render/hybrid/DepthScene.ts` | the facade, copying `DescentScene`'s API (`applyBreaks`, `strike`, `burst`, `pickEntity`, `bindBus`, `frame`) | 700 |
| `render/hybrid/Viewmodel.ts` | the lantern (the Surge gauge) and the tool (tier forms, the per-tap contact pose, combo heat) | 350 |
| `render/hybrid/StationCrew.ts` | `CrewRenderer` rigs at face anchors and on cavern walls, on the shared beat | 250 |
| `game/hybrid/FirstPersonCamera.ts` | poses, creep, glides, rope ride, focus pop, Plunge, cross-fades | 400 |
| `game/hybrid/FaceController.ts` | the hit-test order of §1.2, hold boring, never a miss | 300 |
| `game/hybrid/HybridGame.ts` | the face → breakthrough → cavern → heading state machine; the return glide | 900 |
| HUD changes, the rack, the focus pop | — | 450 |
| Save v4 | the face state (the model's rows), run and cavern index, harvested bits, branch history; v3 meta migrated (R10) | 200 |
| Tests | `firstPersonCamera` (comfort), `faceController` (no miss), `deepPath` (determinism, lap separation, footprint), `runGrammar` (fill from stands), `hybrid-slice.spec.ts` | 900 |

Total about 6.4k lines, against about 65k kept: one wave of three specialists, as `reuse.md` §7 plans, with about 1.5k
lines more than its station slice because of the face renderer and the path grammar.

### 8.4 Model changes [M] (no curve or price changes)

- **The creature purge** (`reuse.md` §4, one pass with a grep gate).
- **Renames:** the Wardens become mechanisms; the Bone Press and the Void Engine; the Lucky Moth → the Lucky Ember (same
  reward table); the event replacements of §4.9.
- **The bus:** `face:slice`, `face:creep`, `cavern:enter` / `leave`, `heading:choose`, `focus:open` / `close`, `breakthrough`.
- **Goals:** a breakthrough candidate; Path steps reworded; Feats: Wayopener, Through and Through.
- **Later:**
  - a branch salt in `rowKinds` and `breakthroughs` for forks;
  - cavern-roll rewards in seconds of income, added to the sim;
  - a face-paced bot in `tools/econ-sim.ts`.

---

## 9. Risks (ranked, with mitigations)

| # | Risk | Why it is real | Mitigation |
|---|---|---|---|
| R1 | **Monotony at the face** | The same framing for 60–150 s per run. A face has no far view. | A find within every Sense window. A breakthrough every ≤ 150 s, capped by the generator. Sumps and forks. Events in the face frame. Crew hires that change the frame. Tool tiers and bore classes. The boredom breaker. Measure the "longest gap between rewards" (SPEC L4: ≤ 30 s). |
| R2 | **Creep and Plunge comfort** | A 1 m forward move every 1.4–3.6 s is a regular optic-flow pulse, and the Plunge runs at 5 m/s | A trapezoid profile at ≤ 2.5 m/s, translation only, a static viewmodel anchor; a "Comfort: high" setting (cross-fade creeps); unit tests; an early device test with three people. |
| R3 | **The reach read** | The face is 3 m away; a hand tool "hitting" it relies on a screen-space convention | Solve the contact pose per tap; give the tool a little lunge (≤ 0.1 m on the viewmodel); test on the phone in week 1. Fallback: a 2.4 m face with 0.6 m blocks (78 px) and wider fat-finger radii. |
| R4 | **The surface at first-person distance** (`reuse.md` R1) | rock fills 40–70% of the frame | Faceted instanced blocks with baked AO; the look spike (#81) decides the walls; the face blocks are authored variants, so they can be art-directed one by one. |
| R5 | **Taps missing** | 97 px blocks are near the 88 px floor; holes reveal deeper, smaller targets | the §1.2 order; a 30 px fat finger; never a miss; an e2e of 1,000 random taps with 0 misses (SPEC L2) |
| R6 | **Spiral generation and seams** | a new path grammar inside RingWorld; laps must not collide | `deepPath` is pure and unit-tested (determinism, footprint, lap gap); joints only inside caverns; face-ID and contact capture tests |
| R7 | **Over-juice relapse** | the cue tables and ceremonies were built for spectacle | the caps of §7.7 are asserted in CI; tiers per event; the stillness test F6 |
| R8 | **Economy pacing** | already 4–5× too fast with all systems; first person adds overhead | the face-paced bot; trim the side multipliers first; keep the `it.fails` honest; ship the slice with lines 0–2 only |
| R9 | **Bore classes break the proportions** | caverns must outgrow the face; a 16 m heading takes a quarter of the footprint's width, and its caverns more | cap at Great Bore; grow only at breakthroughs; prototype after the slice; can be cut without touching the economy |
| R10 | **Performance** | first person sees volumes, caverns, set pieces; never measured on a phone | the face is 1–2 instanced draws; 4 per-pixel lights; the governor; Battery preset; a first-person scene in `tools/perf.mjs`; a device run in the slice gate |
| R11 | **The director's v3 save** | his phone holds a cutaway save | migrate the meta (gems, records, Feats, Finds, rank, settings) to v4 and start the descent fresh with a one-line notice |
| R12 | **Half-done creature purge** | about 40 files | one owner, one pass, a grep gate in CI |

---

## 10. The slice, decisions taken, open questions

### 10.1 The vertical slice for this angle (one wave, three workstreams as in `reuse.md` §7)

- **Scope:** an APK, portrait, one thumb, first person. The Halden adit at dusk → Topsoil Roots → the Root Cellar breakthrough
  (24 m) → the Halden Hatch (40 m) → the Glowroot reveal → two Glowroot faces and one grotto.
- **In it:**
  - tap, hold and boring on the face, with the crumble and the creep;
  - Lantern Sense glints and the breakthrough leaks;
  - Pick tiers 1–3 modelled in hand;
  - Shovel Hand, Pick Crew and Mine Cart visible at work;
  - the Pick, BEST and Crew cards;
  - the dynamite crate;
  - a chest focus pop with an honest roll-up;
  - a hollow with the burning-lamp note;
  - one relic with a Strike ring;
  - the Hatch fight and the reveal;
  - the objective line and the three-step tutorial;
  - the offline return glide;
  - save v4.
- **Not in it:** sumps, forks, Vistas beyond the Root Cellar, bore classes, the Surge (dormant), events other than Golden Vein,
  Rekindle and the sheets beyond Dig and Crew.
- **Gate:**
  - `tsc` clean, Vitest green (known `it.fails` only), the slice e2e and `apk-sim` green;
  - the creature grep empty;
  - the comfort tests;
  - 0 misses in 1,000 taps;
  - captures F1–F8 at three viewports;
  - one director phone run.

### 10.2 Decisions this design takes

1. The face is the model's seven cells in a 2-3-2 bond with a snake column map. One slice is one row, which is 1 m. No
   economy constant changes.
2. Depth is metres along a Deep Spiral inside the unchanged RingWorld. The face is a dedicated instanced renderer over plug
   voxels.
3. The camera never moves on a tap; the creep is the only motion while digging.
4. Everything comes to you (the focus pop): no look-at turns at a face.
5. Skills, the Surge and the combo are diegetic (rack, flame, tool heat); the HUD keeps two thin bands.
6. Creatures are purged; Wardens become mechanisms; the Lucky Moth becomes the Lucky Ember.

### 10.3 Open questions (for the panel and the first device test)

1. **Face distance:** 3.0 m with 0.73 m blocks, or 2.4 m with 0.6 m blocks (R3)? Decide on the phone.
2. **Creep feel:** a smooth trapezoid on every slice, or a 2 m catch-up every two slices? An A/B test with three players.
3. **Sumps in wave 2,** or only after the forks? Both add variety; sumps are cheaper (no model change).
4. **Bore classes:** keep the five classes, or stop at Gallery and push démesure into the Through moment and the camp?
5. **The Lumi Master frame review** (`lumi-master.md` §5.9): 20 minutes on its trailers before the grade is locked (tone steps,
   fog, HUD area).
6. **Left-handed mirror:** swap the lantern and tool sides, and the rack and the crew, in one setting? It is cheap, so propose
   it in the slice.
