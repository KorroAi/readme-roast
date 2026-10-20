# DEEP DOWN — The Lantern Crawl (hybrid SPEC)

The complete specification of the first-person hybrid. It replaces `docs/idle/SPEC.md` for everything a player sees, touches
and hears. The pure idle model's formulas (`docs/idle/SPEC.md` §3–§5, §7, Appendix A) stay valid unless this file changes
them, and every change is listed in §12.3. `BUILD.md` (same folder) is the plan that builds it.

- **Date:** 2026-10-20. **Status:** final design, ready to build.
- **Base:** the panel winner `designs/fp-node-crawl.md`, with grafts from `designs/fp-free-explore.md` and
  `designs/fp-dig-face.md`, and every must-fix of the three judges (traceability in §1).
- **Research used:** `research/lumi-master.md`, `research/hybrids.md`, `research/look.md`, `research/reuse.md`.
- **Evidence looked at:** v1's best frame `artifacts/world-w2/r1/f17-first-crystals-moths.png`; the rejected APK frame
  `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/peek-2.png`; the three look-spike
  sheets in `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/spikes/`
  (`crystal/sheet.png` = Faceted, `lantern/final-sheet.png` = Lantern Voxel, `storybook/sheet.png` = Storybook) and their
  reports; the shipped code (`src/ui/idle/TapSurface.ts`, `src/idle/config/upgrades.ts`, `crew.ts`, `gear.ts`, `skills.ts`,
  `biomes.ts`, `src/idle/model/*`).

**Marks.** **est.** = a design target the node-paced bot (§5.12) or a phone test must confirm. **[W1]…[W4]** = the build wave
that ships the item (BUILD.md). An item with no wave mark ships in W1.

---

## 0. The game in one page

### 0.1 Genre and pitch

**Genre: the first-person lantern crawl** — a clicker you play inside a real 3D descent.

**Pitch (one line):** *Tap through the rock by lantern light, break into a dark chamber and light it with your own lantern,
strip it of its treasure and choose your road down, while the crew you hired digs ahead and keeps digging while you sleep.*

**Store line:** *Tap the rock. Break through. Light the dark. Dig on.*

### 0.2 The design in twelve lines

1. **Two places alternate.** A **drift** (a tight timbered tunnel) ends in a **face** of 7 rock blocks you tap. When the face
   gives way you break into a **chamber**, a composed 3D room you light, explore from 1–3 stands and harvest. An exit takes
   you down to the next drift. A chamber comes every 35–70 s (est.).
2. **The world is the button.** A tap strikes what is under the thumb. A hold keeps striking. Tapping an exit, a lit chalk
   mark or a survey ring moves you. There is no other input, and no tap ever does nothing.
3. **The face is the pure model's row.** 7 blocks, 1 slice = 1 model row = 1 m of depth. Every economy formula survives.
4. **First light is yours.** Every chamber waits dark. Your lantern leads you in and the chamber's light rises 60 % → 100 %
   over 1.2 s. You relight the old Halden lamps one tap each; light every lamp and the chamber is **charted** forever.
5. **The breach tells you what is behind it.** The last slices leak light in the colour of the chamber's promise (gold =
   treasure, cyan = the builders, brass = the works, violet = sealed or unknown).
6. **The crew digs, the lantern discovers.** Hired crews and machines dig while you explore and while you are away, up to
   3 dark chambers ahead (the **leash**). They never light a chamber and never open a seal.
7. **Roads.** Every 4–6 chambers a fork shows two lit exits with honest promises. The roads rejoin. [W2]
8. **The Lantern Pulse.** Your lantern fills as you dig. Spend it: a ring of light reveals hidden veins, stashes and passages
   to vaults, and gives ×3 strikes for 10 s. [W2]
9. **Sealed gates are mechanisms** (a hatch, a root knot, a prism lock…). Three cyan keystones hidden in each biome's chambers
   fill the next seal's sockets; the objective line counts them. [keystones W2]
10. **Démesure by quality, not quantity.** The tool in your hand changes form, the hole you dig grows a size class, strikes
    start sweeping whole chambers, then boring whole drifts; the camp at the surface grows into a lantern city. The particle cap
    never moves.
11. **The screen is calm by law.** The camera never moves on a strike. At most 3 things move in the foreground. One objective
    line, one amber rim on the thing to tap, opaque octagon plates, ≤ 5 numbers.
12. **DEEP DOWN's identity is kept whole:** the lantern-lit descent through 14 biomes, mining, chests and relics, sealed gates,
    the crew and machines, upgrades to absurdity, the mystery at the bottom, *Lamplight on the Lintel*.

### 0.3 The director's hard constraints (newest first; they override everything)

1. **No creature side.** No collection, taming, befriending, companions, pets, monster battles or trading. No animal is ever
   tappable, counted or rewarding. Ambient life is **inanimate only** (drips, motes, spores, steam, embers, roots, old bones):
   no moths, even as decoration. Lumi Master is a reference **only** for its look in 3D and for how it presents exploration.
2. **First person, tap on the screen.** The body is never shown; the lantern (lower left) and the tool (lower right) are the
   only parts of "you". Every interaction is a tap or a hold on the screen: no joystick, no virtual aim buttons, no swipes,
   no drags, no free look.
3. **A new hybrid genre** between v1's 3D exploration and the 2D "just tap" build, with a big visual upgrade.
4. **Not the 2D build's look:** no illegible screen, no visual glitches, animations far less present.
5. **Not v1's failures:** things are indicated, mining feels good, controls are pleasant, caverns are full, there is help, a
   tutorial, simplicity, reward and pull.
6. **Standing demands:** addictive, never boring, one thumb in portrait, punchy, endless and evolving, upgrades to absurdity,
   many varied loops, real progression, achievements, a guided tutorial, an objective always shown, caverns full of treasure
   and wonder, beautiful polished visuals, restrained readable UI animation, dopamine.
7. **Platform:** Android first (WebView shell), iOS later; Three.js r186 WebGL2, TypeScript, Vite; English through `src/i18n`;
   no external assets (procedural models, procedural shading, synthesized audio); no store, ads or payments; offline.

### 0.4 What it is not

No walking or steering, no free look, no backpack or trips home, no energy or refills, no slot bar, no combo counter, no
damage numbers by default, no billboard vista cards, no glass HUD, no creatures, no store.

### 0.5 What Lumi Master gives us, and what it does not

| Take (look and exploration presentation only) | How it shows up here |
|---|---|
| First-person forward motion *into* the picture | The creep step per slice, the breakthrough glide, the Way Down ride |
| The next thing is visible before it arrives | Breach leaks, Lantern Sense glints [W2], the next exit's lit plate, the Other Lantern far below |
| Few tones per form, warm lifted mid-tones, no neon | A 3-step wrapped-Lambert ramp, the storybook grade on faceted rock (§8.2) |
| One focal object per beat | The single value peak and the single amber rim (§8.6, §8.10) |
| One hero control that never moves | The world itself, plus the BEST card in the same place |
| Rarity shown as colour, early | The glint tier language (§4.7) and the promise colours (§8.4) |
| Short reward beats (its post-test lesson) | Ceremonies ≤ 1.2 s, reveals ≤ 3 s, everything skippable |
| A colour script per region | The 14-biome colour script (§8.4) |
| Hold to automate after a manual phase | Hold-to-strike from the start; auto-delve after the Root Knot (§2.5) |

| Do not take | Why |
|---|---|
| Creatures, capture, battles, trading, raids | the director's hard constraint |
| Energy, refills, the slot-bar outcome, gacha | its top complaints; we have no store |
| Its painted 2D presentation and daylight palette | our edge is real 3D lantern light underground |
| Edge icon clutter, small text | its top UI complaint |
| A strictly linear route | its top exploration complaint: we have roads and stands |

### 0.6 The laws (each has a test in §13)

| # | Law | Test |
|---|---|---|
| L1 | A tap's hit shows in the next rendered frame after `pointerdown` | E1 |
| L2 | No tap is wasted: every tap in the world region does something useful or informative (§2.3) | U-NC1, E2 |
| L3 | Taps per face block p50 ≤ 4 over the first 45 min | S3 |
| L4 | Something completes at least every 30 s and something new arrives at least every 60 s in the first 30 min | S4 |
| L5 | The objective line is visible in every frame of play | E21 |
| L6 | Gold per damage is honest: harder rock is richer rock, everywhere (face, skin, veins, Works) | U-M3 |
| L7 | The camera never moves on a strike; only navigation targets and authored ceremonies move it | U-CAM1, E8 |
| L8 | Gains travel: a counter changes when its tokens land | E3 |
| L9 | At most one ceremony at a time, ≤ 1.2 s (biome reveal ≤ 3 s), skippable by a tap | U-FX3 |
| L10 | First light is the player's: no chamber is lit, no Vista is first seen and no seal is opened by the crew | U-M6, E17 |
| L11 | Nothing is ever lost: ignored events, skipped chests, missed keystones and failed seals keep their value | U-M8 |
| L12 | The motion and FX budgets of §8.7–§8.8 hold in every frame | U-FX1, C6 |
| L13 | Outside the opening pair (tap, Pick card), at most one new mechanic per 40 s before 3:00 and per 60 s after; never two prompts at once | S5, U-TUT2 |
| L14 | No creature, bestiary or animal reward exists anywhere in code, config or text | U-PURGE |

---

## 1. Traceability

### 1.1 The director's demands

| Demand | Answer | § |
|---|---|---|
| First person, tap on the screen, the character no longer seen | Authored shots, tap and hold on world objects, lantern and tool viewmodels only | 2, 3 |
| Lumi Master's visuals for the 3D aspect and exploration | Forward motion into the picture, few tones, one focal object, short beats, colour script | 0.5, 8 |
| A mix of v1's 3D exploration and the 2D "just tap" | v1's lantern light, chambers and props; the 2D build's economy, crew and HUD discipline; exploration through stands, lamps, wall skin, roads, secrets | 2–5 |
| A new hybrid genre | Clicker strikes in drifts, crawler choices in chambers, idle crews boring ahead on a leash | 0.1 |
| "Nothing is indicated, no help, no tutorial" | A 6-step tutorial taught by doing, the objective line in every frame, one amber rim, first-time cards, prices shown on cards | 6 |
| "Mining is horrible, controls unpleasant" | The hit lands under the thumb in the next frame, never misses, holds auto-strike, no joystick | 2 |
| "Caverns horribly empty" | A fill contract checked from every stand; wall skin with pockets; lamps; 4–6 tappables near every stand | 4.11 |
| "Visually horrible, glitches, animations far too present, illegible" | Lamplit Faceted look, no world textures, one value peak, hard FX and motion budgets, opaque calm HUD, 10 capture rules and a beauty rubric | 8 |
| Addictive, never boring, many loops | 12 nested clocks from 0.25 s to days, variable rewards on every strike, breach and chamber | 5.0 |
| Endless, upgrades to absurdity, progression | Endless HP curve, Big numbers, 15 crew lines plus Echo lines, three prestige layers, tool forms, bore classes, the growing camp | 5.4, 5.11 |
| Achievements | Feats (21 families), rank, records, ghost lantern, planted lanterns | 5.8 |
| Keep DEEP DOWN's identity | 14 biomes, mining, chests, relics, sealed gates, crew and machines, the Other Lantern, the brand | all |

### 1.2 The judges' must-fixes

| Must-fix | Decision in this SPEC | § | Test |
|---|---|---|---|
| Offline identity (crew "waits at the breach" in run 1) | **The leash:** the crew opens up to 3 unseen chambers ahead (+1 per Survey Lamps level, max 8), leaves them dark; first light is yours; the return glide lands at the first dark chamber | 5.3 | U-M6, E17 |
| Chambers explored, not just aimed at | 1–3 authored stands per chamber reached by survey rings, chalk-arrow turns, wall skin with pockets, cold lamps, side niches, Lantern Raise on far taps: 30–60 s of discovery when wanted | 4.2, 4.6, 4.7 | C3, E13 |
| Face legibility (87 px at 360 px) | Blocks 0.80 m at a 3.0 m standoff: 98 px at 360, 107 at 390, 113 at 412; asserted ≥ 92 px at rest at all three viewports | 3.5 | C7, E22 |
| Minimum chamber tappable 56 px | Drawn silhouette ≥ 72 px, hit area ≥ 88 × 88 px at 360 × 740; fat finger only when exactly one candidate | 2.3 | U-NC3, E22 |
| Strike reach 6 m reads as telekinesis | Strike-type tappables ≤ 3.5 m from the stand they are struck from; the tool's contact pose is solved per tap with a ≤ 0.1 m lunge | 2.3, 3.7 | U-W4, D3 |
| The creep (optic-flow pulse) | Step A (1 m eased in 0.6 s, merged when fast) vs track B (continuous, ≤ 1.2 m/s) A/B-tested in week 1 by 3 people on the director's phone; cross-fade C always available | 3.6 | D2 |
| Auto-delve at 4:35 (the hold plays the game) | Auto-delve unlocks at the Root Knot; it is a **hold on the exit plate** only; it stops at every first light, chest, relic, note, keystone, fork, draft, seal and Vista; bot asserts ≥ 1 stop per 2 chambers | 2.5 | S6 |
| Breakthrough fatigue | Topsoil drifts lengthened (5–8 slices, authored); chambers take 20–45 s; a chamber every 35–70 s; plain Gallery leaks are visibly dull and get a short step-in instead of the window glide | 3.3, 4.4 | S4 |
| Repetition | ≥ 12 templates × 3–4 sub-zones per biome kit; an authored landmark every ~5 chambers; geometry lifetime-seeded but dressing, hero, loot, lamp sockets, secrets and road promises re-rolled per run; a thumbnail-diversity CI metric | 4.12 | C9 |
| Onboarding overload | L13: ≥ 40 s between new mechanics before 3:00, ≥ 60 s after, one prompt at a time; contracts, Royal Chest keys, events, the second fork moved to session 2 | 6.4, 7 | S5 |
| Camera grammar (7 shots) | 5 shots (Drift, Breakthrough, Stand, Way Down, Reveal) plus the cross-fade; the focus pop moves the object, not the camera | 3.3 | U-CAM2 |
| Camera caps contradict | One motion law: translation ≤ 2.5 m/s 3D (vertical ≤ 2.0 m/s), rotation only in rotate phases ≤ 90°/s, FOV constant; every shot-to-shot transition asserted | 3.2 | U-CAM3 |
| The Pulse on the lantern steals taps | Fires only on a pointer that **starts** on the lantern while the meter is full and ≥ 300 ms after the last world pointer ended; never a fat-finger target; left-handed mirror in the slice; one UI loop at a time | 2.4 | E15 |
| "Nothing" hit-test case | Gone: stray chamber taps strike the wall skin (or deep rock with a tunk), relight a lamp, or raise the lantern toward a far point | 2.3 | E2 |
| Tap rates contradict the shipped 8/s cap | All numbers re-derived from the code: 8 counted hits/s cap; hold 3/s → 5/s (Steady Hand), 8/s in a Surge; Pulse meter ≈ 50 s of tapping at 4/s | 2.6 | U-IN1 |
| Chamber framing (keyhole) | Chambers authored deep and tall (8–14 m wide, 10–20 m deep, 6–16 m tall), wonder in the top third, chalk-arrow turns ≤ 35°; captures from 10 stands before any kit is produced | 4.2, 8.6 | C3 |
| Chart geometry unproven | The chart is pure: topology in the model, geometry on a `deepPath` square spiral, unit-tested (no overlap, ring bounds, stand frustum clear, lap gap ≥ 12 m) on day 1; road fallback = shared-node roads | 4.10 | U-W1–U-W3 |
| Drift monotony | Something new visible in the face every ≤ 8 slices (generator test): ore runs, chest lids, hollows [W2], Lantern Sense glints [W2], leaks, sumps [W2], crew hires, bore classes [W3]; every chamber holds ≥ 1 non-strike discovery | 4.15 | U-W5 |
| Re-climbs go stale | Per-run re-roll of dressing, hero, loot, lamp sockets, secret slot, road promises; auto-delve flies through seen plain chambers | 4.12, 5.9 | U-W6 |
| Economy | The node-paced bot is built before any table changes; a player strike on a chamber special pays 10–100× a crew strike; chamber gold 25–35 % of run gold | 5.12 | S1–S2 |
| Grade and surface unsettled | Day-0 look review: the director picks between the three spike sheets on the phone (default Faceted); 20 minutes on the Lumi Master trailers (`lumi-master.md` §5.9) before the grade is locked | 8.2 | D1 |
| Breakthrough light cost | Chambers are generated and lit in the slab worker ≥ 2 drifts ahead and hidden by occlusion; first light is a per-chamber uniform, never a LightField propagation on the breach frame | 4.6, 11 | P4 |
| Crew geometry wrong | Rigs live in the octagon heading's four corner nooks, the ceiling band and the floor band; no rig pixel inside a live block's tap bound (ID-buffer test) | 3.4 | C8 |
| The face reads as a tile grid | Irregular faceted fracture plugs (6–10 variants per rock family, rotated and mirrored), joints that read as cracks, nuggets half-sunk; grayscale 25 % thumbnail must read as rock | 8.5 | B-rubric, C10 |
| Remove all animal decoration | Ambient life is inanimate only; `LumenMoths` deleted | 4.16 | U-PURGE |
| Shared homework | Day 0 in BUILD.md: look review on the phone, trailer review, node-paced bot, creature grep gate, v3 → v4 migration decided (migrate the meta) | BUILD §1 | — |

---

## 2. Controls

### 2.1 What the player is "in"

```
  [CAMP] --tap the adit--> [DRIFT: face at 3.0 m] --slice cleared--> creep 1 m --+
                              |  K slices; the last 2–3 leak light               |
                              |<--------------------------------------------------+
                              v  breach crumbles (or the crew already opened it: dark mouth)
                       [BREAKTHROUGH glide + FIRST LIGHT]
                              v
                       [CHAMBER: stand 1] <--survey ring--> [stand 2/3]   (chalk arrows turn ≤ 35°)
                              |  tap chest/relic/note/keystone -> FOCUS POP (object comes to you)
                              v  tap the exit (hold the exit plate = auto-delve, after the Root Knot)
                       [WAY DOWN ride] --> next DRIFT (or a dug drift: catch-up track --> next dark chamber)
  Biome boundary: the Seal hall's exit is the SEAL (a mechanism) -> fight -> REVEAL (≤ 3 s) -> the Threshold chamber.
```

### 2.2 Gestures (the complete list)

`pointerdown` fires everything in the same frame (L1). From `TapSurface.ts`: up to 3 pointers, a 32-slot ring with no
allocation, **8 counted hits per second** across all pointers (extra taps merge their damage into the previous hit on the same
target), a hold begins after **250 ms** within **12 px**.

| Gesture | Where | Result |
|---|---|---|
| Tap | a face block | strike it (model `tap.ts`: base, Rally, crit, combo, Surge, pierce, splash) |
| Tap | anywhere else in the drift's world region | strike the nearest live face block in screen space (never a miss) |
| Hold ≥ 250 ms, ≤ 12 px | the face | auto-strike the block under the thumb at the hold rate (§2.6); when it breaks the hold moves to the block behind it (boring in), then to the weakest live neighbour; drifting > 24 px re-aims |
| Tap | a strike-type tappable in a chamber (vein, gem cluster, geode shell, loose stash brick, wall-skin cell) | strike it from the stand |
| Tap | a cold Halden lamp | relight it (one tap, a soft *whoomp*) |
| Tap | a focus-type tappable (chest, relic, note, mural, keystone, depot cart, Royal Chest) | **focus pop**: the object rises to 1.8 m in front of you; the camera does not move (§3.3) |
| Tap / hold-release | inside the focus pop | open the chest, read the note, pry the keystone, tip the cart; a relic takes one hold-and-release on its ring (§5.7). A tap outside a resolved object closes it (0.3 s) |
| Tap | an exit (the mouth or its octagon plate) | the **Way Down** ride; at a fork, the tap is the choice [W2] |
| Hold ≥ 450 ms | an exit plate (after the Root Knot) | **auto-delve** until a stop (§2.5) [W2] |
| Tap | a lit survey ring on the floor | glide to that stand (≤ 1.2 s) |
| Tap | a lit chalk arrow at the frame edge | turn ≤ 35° yaw (or ≤ 20° pitch up) in ≤ 0.35 s; the opposite arrow turns back |
| Tap | rock beyond reach, the dark, or open air | **Lantern Raise**: the lantern lifts toward that point and a soft spot of lantern light lands there for 1.4 s (reveals far glints and chalk marks); the camera does not move |
| Hold | anywhere in a chamber except navigation and focus targets | **sweep**: auto-strike the remaining strike-type tappables in reach, nearest the screen centre first; a soft chime and the exit rim when none is left |
| Tap | your lantern (lower left) | the **Lantern Pulse** if the deliberate-gesture rule holds (§2.4) [W2]; otherwise the touch passes to the world under it |
| Tap | a tool on the rack (the drift's lower-left corner nook) | use that skill (Dynamite first) |
| Tap / hold ≥ 380 ms | a bottom card | buy; hold repeats 8/s, then 16/s after 1.5 s, with a rising arpeggio |
| Tap | the objective line | go where the goal is done (open the right sheet at the right card, or rim the target) |
| Tap | ≡ (top right) | the sheet hub (Dig, Crew; Codex, Feats, Chart, Lantern [W2]) in the bottom ≤ 55 % |
| Any tap | during a glide, ride, ceremony or reveal longer than 1 s | skip to its end with a 0.15 s cross-fade; the tap is consumed |
| Android Back | — | close the focus pop or sheet; else open the pause menu |

**Never:** swipes, drags, pinches, double taps, joystick, look-drag, aim buttons, tilt.

### 2.3 Hit-test order (every tap, every frame; `game/hybrid/NodeController.ts`, pure)

1. **HUD plates** (DOM). Taps on them never reach the world.
2. **An open focus pop:** the object, or "outside" (close).
3. **Event objects** (W2: the Drifting Ember, falling crystals, Cave-in boulders, loose bricks, the wedged chest): hit area =
   projected bound padded to ≥ 88 × 88 px.
4. **The lantern viewmodel**, only under the deliberate-gesture rule (§2.4); otherwise skipped.
5. **The rack's tools** (in a drift): hit area ≥ 88 × 88 px; direct hit only.
6. **Navigation targets** (exits and their plates, survey rings, chalk arrows): direct hit on a ≥ 88 × 88 px area; never
   reached by a fat finger, never chosen for a stray tap.
7. **Focus-type tappables:** direct hit on the padded area (≥ 88 × 88 px). A fat finger never opens a chest.
8. **The camera ray:** `raycastVoxels` plus `PropRenderer.raycast` (reach 3.5 m in a chamber; the face in a drift):
   - a face block (slice cell → model `col`; a hole hits the deeper block it shows);
   - a strike-type tappable or a cold lamp;
   - a wall-skin cell (strike it);
   - deep rock within reach (a dull *tunk*, two dark chips, the hint rim on the nearest unharvested tappable for 0.6 s).
9. **Fat finger:**
   - drift: the nearest live face block;
   - chamber: a strike-type tappable or cold lamp whose padded area lies within 48 px of the touch, **only if exactly one does**.
10. **Lantern Raise:** the ray found nothing in reach (far rock, the dark, open air).

Every tap ends in one of: strike, relight, focus, navigation, skill, Pulse, tunk, raise. There is no "nothing" case (L2).

**Target sizes** (asserted from every stand by the generator and in e2e at 360 × 740, 390 × 844, 412 × 915):
- face blocks ≥ 92 px on the short screen axis at rest (≥ 86 px during the creep);
- every chamber tappable's drawn silhouette ≥ 72 px on its short axis; its hit area ≥ 88 × 88 px; two hit areas overlap by
  ≤ 20 % (when they would, the smaller pad shrinks, never below its drawn silhouette);
- every tappable sits in the central 15–72 % of the height and 6–94 % of the width.

**Reach:** strike-type tappables and lamps are ≤ 3.5 m from the stand they are used from (authored in the kits; a tappable
farther away gets a stand of its own). Focus-type objects may be ≤ 4.5 m (they come to you).

### 2.4 Deliberate gestures (the ones that must never fire by accident)

| Target | Fires only when | Otherwise |
|---|---|---|
| **Lantern Pulse** [W2] | the pointer **starts** inside the lantern's hit area (110 × 150 px viewmodel bound, mirrored for left hand), the meter is full, **and** ≥ 300 ms have passed since the last world pointer ended; never a fat-finger target; ignored during a hold stream | the touch passes through to the world under it |
| Auto-delve [W2] | a hold ≥ 450 ms that starts on an exit plate | a tap on the plate is the ordinary Way Down |
| Rack tools | a direct hit; ignored within 150 ms of a strike stream that started outside the rack | passes to the face |
| Rekindle [W3] | a 0.6 s hold on its button (a brass ring fills) | nothing |

### 2.5 Automatic and manual

| Automatic | Always the player's |
|---|---|
| Crew and machines strike the face on their impact frames, and dig ahead while you are in a chamber, up to the leash | **First light** of every chamber; the first sight of every Vista and biome |
| The Works: leftover veins and skin in chambers behind you are mined by the crew as gold | Opening every chest, relic, note, keystone, depot and Royal Chest (the crew carries skipped ones to the Chest Rack) |
| Gold is credited where it breaks; carts haul; no backpack, no selling | Choosing a road [W2] |
| The hold: auto-strike (from the start); sweep in chambers; auto-delve on the exit plate (after the Root Knot) [W2] | The Pulse: when and where [W2] |
| Offline digging (§5.3); auto-buy and auto-skills from Ember perks [W3] | Breaking a seal never opened before (the crew helps but cannot win alone) |

**Auto-delve stops by itself** (a soft chime, the lantern dims 10 %, the target gets the amber rim) at: the first light of an
unseen chamber; any unopened chest, relic, note, keystone, depot or Royal Chest; a fork; a draft while the Pulse is ready; a
seal; a Vista; the first sight of a biome; an affordable must-buy (opt-in setting). It flies through seen chambers that hold
nothing manual. **Bot target: ≥ 1 stop per 2 chambers** on every run (S6).

### 2.6 Rates (from the shipped code)

| Quantity | Value | Source |
|---|---|---|
| Counted hits per second, all pointers | **8** | `TapSurface.ts` `TAP_CAP_PER_S`, `upgrades.ts` `TAP_CAP` |
| Hold stream | 3/s, +1/3 per Steady Hand level up to **5/s**, **8/s** during a Surge | `upgrades.ts` `HOLD` |
| Hold hits | combo +0.5, Pulse meter ×0.5 | `COMBO.holdGain`, `SURGE.holdFactor` |
| Pulse meter | 1 per hit, 4 per crit, full at 240 (≈ 50 s of tapping at 4/s with 5 % crits; ≈ 150 s of holding at 3/s) | `SURGE` |
| Repeat buy | 8/s, 16/s after 1.5 s | idle SPEC §5.5 |

**Inputs per minute (est.):** drift tapping 120–300 taps (or one hold); chamber 15–40 taps and 1–3 decisions; auto-delve
2–8; a seal fight 180–300 taps (3–5/s, never above 8 counted); away 0. Lumi Master runs at 15–40 taps a minute: a player can
stay there by holding, or go far above by tapping.

### 2.7 Desktop keys (tests only)

1–7 strike face blocks (snake order §3.5), Space strikes the suggested target, E takes the main exit, R relights the nearest
cold lamp, L pulses, B buys BEST, Esc is Back.

### 2.8 Accessibility of the controls

Left-handed mirror (lantern, tool, rack, Pulse area and crew nooks swap sides) [W1]; text size large; motion levels (Full,
Reduced = cross-fades, Off = cross-fades and no flights); camera shake slider; flashes On/Soft/Off; haptic strength; an
optional accumulating damage number per target (off by default).

---

## 3. Camera

### 3.1 The lens

| Parameter | Value |
|---|---|
| Projection | rectilinear, **horizontal FOV locked at 52°** (v1 `lockedVerticalFov`): vertical 93.1° at 390 × 844, 90.1° at 360 × 740, 94.6° at 412 × 915, 81.9° at 16:9. The visible width at distance d is **0.9755 · d** metres |
| Eye | 1.60 m above the floor (1.45 m in low drifts, never below 1.2 m); near plane 0.08 m; rock ≥ 0.5 m from the eye; walls closer than 0.7 m darken their facets instead of clipping |
| Pitch | Drift −8° (vanishing point at 43 % from the top); Stand 0° (−4° low rooms, +4° tall rooms); Way Down −20°; floor seal −35°; sump face −55° [W2]; Reveal +12° (raised over 1.2 s after arrival, lowered on the next tap) |
| Roll, head bob, sway, breathing | **none on the world camera, ever** |
| Taps | **the camera does not move on a strike** (L7); the tool, the block, the sound and the haptic carry the hit |
| Shake | structural events only (a seal breaking, Dynamite, a vault door): rotational ≤ 0.4°, ≤ 120 ms, one decaying swing, no translation; scaled by the shake setting |

### 3.2 The motion law (`game/hybrid/FirstPersonCamera.ts`, unit-tested)

1. **Translation** speed ≤ **2.5 m/s** (3D), vertical component ≤ **2.0 m/s**, on a trapezoid profile (accelerate and decelerate
   over 0.2–0.3 s each). Peak speed = distance / (duration − ramp); every authored move is checked against it.
2. **Rotation** happens only in a **rotate phase** before or after a translation, ≤ **90°/s** with ease-out; a translation
   carries at most 2° of residual rotation.
3. **FOV constant.** Roll 0.
4. Rides and glides follow authored polylines (`ropeRide.ts`, ported: constant acceleration, arc length never runs backwards).
5. Any move longer than 1 s is skippable by a tap (0.15 s cross-fade to its end).
6. **Reduced motion:** every glide and ride becomes a 0.25 s cross-fade; the creep becomes a 0.18 s cross-fade step; no shake;
   no Reveal pitch.

### 3.3 The five shots

| Shot | When | Composition | Motion |
|---|---|---|---|
| **Drift** | at a face (55–65 % of play, est.) | the face at 3.0 m filling the middle band; timber sets every 2.5 m converging overhead; rails and sleepers below; the lantern pool on the floor between the hands | the creep (§3.6) |
| **Breakthrough** | the breach crumbles, or you arrive at a dark mouth the crew opened | the window: the dark drift frame covers 30–40 % of the screen, the chamber beyond | the wall falls inward (10–16 large shards, 0.6 s) while the leak widens; 0.25 s hold; glide ≤ 3.2 m in 1.6 s to stand 1 (peak 2.46 m/s); **first light** rises during the glide. A plain Gallery gets a **step-in** (1.6 m in 1.0 s) |
| **Stand** | inside a chamber | the diorama (§3.4); the suggestion is the value peak | still; a survey ring glides ≤ 1.2 s to stand 2 or 3; a chalk arrow turns ≤ 35° yaw / ≤ 20° pitch in ≤ 0.35 s; **the focus pop** raises the object to 1.8 m ahead and 1.4 m up (0.3 s), dims the world 30 % through the grade, and never moves the camera |
| **Way Down** | an exit; a dug drift; the return | looking down the stair, ladder, chute or cage toward the crew's lamps; always dressed (a sign, a lamp, a cart) | rotate to −20° (≤ 0.3 s), ride 3–5 m of path (1.6–2.6 s), rotate to −8° (≤ 0.25 s). Variants: the **catch-up track** through a drift the crew dug (straight, 2.5 m/s cruise, skippable); the **return glimpses** (≤ 3 × 0.7 s joined by 0.25 s cross-fades, ≤ 3 s); the **sump rope ride** [W2] (vertical, ≤ 2.0 m/s, ≤ 2.6 s) |
| **Reveal** | the Threshold after a seal; each biome's Vista | the window composition: dark arch 30–40 %, lit middle ground, the biome's glowing far plane, all real geometry | the only slow pitch-up (+12° over 1.2 s, 10°/s); the biome title carved in light for 1.6 s; ≤ 3 s total; skippable |

The **cross-fade** (0.15–0.25 s) is the universal fallback: skips, reduced motion, the Head Start, Rekindle, the Chart's
travel to a charted chamber [W3].

**Motion budget per node (est.):** creep 0.6 s × K, breakthrough 1.6 s, Way Down ≈ 2 s, optional stand moves ≈ 1 s each.
The camera moves 12–18 % of active play, all of it predictable and straight (explorer-bot metric ≤ 18 %, S7).

### 3.4 Portrait framing (390 × 844 CSS px; safe insets 47 top, 34 bottom; the same proportions at every size)

**Drift shot** (pitch −8°, eye 1.6 m, the face's front surface at 3.0 m):

```
y=0    ┌──────────────────────────────────────┐
       │ (status inset: dark drift ceiling)   │
y=47   │ [42 m · Topsoil]  [◉ 12.3K]     [≡]  │ HUD row A, 40 px opaque octagon plates
y=91   │ ▸ Break through · 3 m  ▮▮▯▯▯     ◆   │ HUD row B: the objective line, 32 px
y=127  ├──────────────────────────────────────┤ top band ends (15 % incl. the inset)
       │ ceiling band: timber cap, a hanging  │ crew gantry here (Steam Drill, line 3)
       │ lamp, the face lintel                │
y=240  │ ┌nook┐  [ T1 ][ T2 ]        ┌nook┐  │ face top at 28 %
       │ │lamp│ [ M1 ][ C  ][ M2 ]   │Pick│  │ THE FACE: 7 blocks, 2-3-2 bond in an
       │ │rack│   [ B1 ][ B2 ]       │Shov│  │ octagon heading, x 7–93 %, y 28–67 %,
y=565  │ └────┘                       └────┘  │ the brightest area of the frame
       │ floor band: rails, sleepers, cart    │ y 67–74 %
y=625  │ 🏮 lantern   (floor pool,     tool ⛏ │ viewmodel y 74–88 %, ≤ 12 % of the area;
       │              loot lands)             │ the pool shows between the hands
y=746  ├──────────────────────────────────────┤
       │ [ Pick ▮▮▮▯ 1.2K ] [ BEST · Pick Crew 3.4K ]│ cards, 64 px
y=810  │ (home indicator: floor shows)        │
y=844  └──────────────────────────────────────┘
```

- The four **corner nooks** of the octagon heading (the trim rock beside the top and bottom rows) hold the rack (lower left),
  a hanging lamp (upper left), the Pick Crew's scaffold plank (upper right) and the Shovel Hand (lower right). The Mine Cart runs
  on the rail in the floor band; machines from line 3 mount in the ceiling band. **No rig pixel inside a live block's tap
  bound** (C8). Left-handed mirror swaps left and right.
- Depth cues (≥ 4 in every drift frame): timber rhythm, sleepers every 0.6 m, lamp pools every 8–12 m behind the crew, fog
  toward the biome colour (starts at 4–6 m, ≈ 85 % at 25–35 m), detail gradient.

**Stand shot** (pitch 0°, vanishing point at 50 %):

```
y=127  ├── top band ends ────────────────────┤
       │ the WONDER in the top third: a sky   │ y 15–35 %: root chandelier, crystal spire,
       │ shaft, a chandelier, a spire, falls  │ gear wall; lit by its own practicals
y=300  │ ledge 2.5 m: gem cluster ◇   lamp ☼  │
       │▒vein▒                       ▒vein▒  │ side veins 2–3.5 m from the stand
y=420  │▒ L  ▒   ┌─ exit arch ─────┐  ▒ R ▒  │ exit plate at 40–60 %: [▣ Way down]
       │▒    ▒   │ next glint ·    │  ▒   ▒  │
       │  ◎ survey ring   ‹ chalk  └─────┘   │ navigation marks, dimmer than the suggestion
y=600  │      chest on a crate in the pool ▣  │ ≤ 70 % of the height; never on the floor < 3 m
       │ 🏮                            ⛏     │
y=746  ├── cards ────────────────────────────┤
```

- Visible width from a stand: 2.9 m at 3 m, 5.9 m at 6 m, 9.8 m at 10 m. Chambers are therefore **deep and tall rather than
  wide**: the near walls frame the shot, the far wall and the wonder fill it.
- Valuables sit at 0.5–1.4 m on ledges, crates, plinths and niches, or ≥ 3 m away on the floor, so they stay inside 15–72 % of
  the height.

### 3.5 The face

- **Bond:** 7 blocks in a **2-3-2 bond** inside an octagonal heading under a timber lintel (the brand's octagon and lintel).
  Nominal block 0.80 m wide × 0.78 m tall × 1.0 m deep; joints 4–6 cm. The trim rock in the octagon's corners belongs to the
  slice and crumbles with it.
- **Snake map** (every model neighbour col ± 1 is a visual neighbour, so Shockwave and splash read correctly):

  | model col | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
  |---|---|---|---|---|---|---|---|
  | block | middle-left | top-left | top-right | **centre** (`CENTRE_COL`, chests) | middle-right | bottom-right | bottom-left |

- **Pixel sizes** (block 0.80 m at 3.0 m):

  | Viewport | px per metre at 3.0 m | Block width | Face width | Face rows (y) |
  |---|---|---|---|---|
  | 360 × 740 | 123 | **98 px** | 85 % (x 7–93 %) | 27–68 % |
  | 390 × 844 | 133 | **107 px** | 85 % | 28–67 % |
  | 412 × 915 | 141 | **113 px** | 85 % | 28–67 % |

- **Pierce is depth:** overkill flows into the face behind the struck block to `1 + floor(pickTier/3)` slices (max 8). A hole
  shows the next block a metre deeper and ≈ 45 % darker by the lantern's inverse-square falloff: free depth, no effect.
- **Crew damage** lands on the weakest block of the front slice on the rig's impact frame (the screen and the numbers agree).
- **The drawn window:** the front slice and up to 7 behind (within the model's `SHAFT_WINDOW = 12`).

### 3.6 The creep (decided by an A/B on the phone in week 1)

| Variant | Behaviour | Status |
|---|---|---|
| **A: the step** (default) | after a slice falls, wait 0.15 s for the debris to land, then step 1 m forward in 0.6 s (0.2 s ramps, peak 2.5 m/s). If the next slice falls before the step ends, steps merge into one constant-speed track (≤ 2.5 m/s) | ships in W1 |
| **B: the track** | the camera's target distance follows the crumble rate through a critically damped spring capped at 1.2 m/s; the standoff floats in 2.8–3.4 m; no pulses | ships in W1 behind a setting for the test |
| **C: the fade** | a 0.18 s cross-fade step | always available (reduced motion, Comfort: high) |

**The test (D2):** three people (the director and two others) play 5 minutes of each of A and B on the director's phone, in
random order, and rate comfort and feel (1–5). The higher mean comfort wins; a tie goes to A. Lumi Master's own grammar is a
forward step per tap; A is that grammar, one step per slice.

Bore classes [W3] keep the block-to-standoff ratio at 0.267, so blocks keep their pixel size while the world grows (§5.11).

### 3.7 The viewmodel

- Its own camera and pass (vertical FOV 58°, depth cleared, drawn after the world and before the HUD). **Lantern lower left,
  tool lower right** (mirrored for left hand). Together ≤ 12 % of the screen; nothing in the central 50 % column at rest.
- **Perfectly still at rest and during every glide** (the static comfort anchor). No breathing.
- **Strike:** no wind-up. Frame 0 shows the contact pose, solved per tap so the tool head lands on the tapped point, with a
  ≤ 0.1 m lunge and a short smear; 220 ms recovery; a new tap restarts from the current pose (at 8 hits/s it reads as steady
  hammering). The contact frame matches the *tock* within one frame.
- **The tool is the upgrade showcase:** the form follows the deepest biome reached (`gear.ts` `toolFormForBiome`: Rusty Pick →
  Copper → Iron → Steel → Gilded → Crystal → Obsidian → Mythril → Sunsteel → Thunder Maul → Plasma Pick → Comet Hammer → Star
  Breaker → Planet Cracker → Void Cleaver → Lantern Edge I, II, …); each pick tier (every 25 levels) adds a temper step (a
  brass band, an edge glint); a level flexes it (160 ms). From the Thunder Maul the head is drawn partly off-frame; the area
  cap never moves. Combo heat colours the head (bone → amber at 10 → cyan at 25 → violet at 50).
- **The lantern is the key light and a gauge:** its flame grows in five visible steps as the Pulse meter fills [W2]; a full
  lantern breathes slowly (the one UI loop allowed). Lantern tiers (one per Lantern gear card) change its model, light radius
  (+0.6 m a tier) and warmth: Tin Lamp → Brass Lantern → Storm Lantern → Carbide Lamp → Crystal Lamp → Ember Lantern (after the
  first Rekindle) → Thread Lantern (after a Weave) → Sunstone → Dawnbringer → Lantern Flame I, II, … [ladder W3].
- **Lantern Raise** lifts the lantern 0.2 s toward the tapped point and eases back after 1.4 s.

### 3.8 Camera tests (`tests/unit/hybrid/firstPersonCamera.test.ts`)

U-CAM1 view matrices identical across 100 strikes with no slice cleared; U-CAM2 exactly five shot kinds plus cross-fade exist;
U-CAM3 every shot-to-shot transition holds §3.2 (speed, vertical speed, rotation rate, rotate-before-translate, FOV, roll 0);
U-CAM4 reduced motion produces only cross-fades; U-CAM5 every authored move > 1 s is skippable; U-CAM6 the creep variants A and
B both keep blocks ≥ 86 px during motion and ≥ 92 px at rest at 360 × 740.

---

## 4. The world

### 4.1 Depth, nodes, and the two seeds

- **Depth is the model's metres:** 1 slice = 1 model row = 1 m, counted along the descent. World height is not depth. Every
  economy constant, the offline closed form and the depth plate stay exact.
- **The descent is a chain of nodes.** A node = a **drift** of K slices ending in a **breach**, then a **chamber**, then an
  **exit** (the Way Down) to the next drift. A chamber sits *between* rows (chamber n is "at" the depth where its drift ends);
  chambers add no depth.
- **The chart** splits in two pure layers:
  - **Topology** (`src/idle/model/chart.ts`, model-owned): node index ↔ depth, K, fixed rooms (Threshold, Vista, Seal hall,
    vault, landmarks), forks and roads, keystone and secret slots, pity. Seeded by the **lifetime world seed**.
  - **Geometry** (`src/world/hybrid/layout.ts` on `deepPath.ts`, world-owned): positions, template choice, stands, exits, Way
    Down polylines. Seeded by the lifetime world seed.
- **What is lifetime and what re-rolls every run:**

  | Lifetime (the same every run) | Re-rolled every run (run seed) |
  |---|---|
  | node count per biome, K, fork positions, fixed rooms and authored landmarks | the contents class of ordinary chambers (Gallery, Lode, Cache, Reliquary, Geode, Depot, Camp, Lamp Hall, Collapse) |
  | template id, stands, exits, Way Down shape | dressing variant, hero feature, which lamp sockets hold lamps, loot, which secret slot is used, road promises |
  | "seen" bits (first light ever done) and "charted" bits (every lamp relit once) | lamps lit, harvested bits, keystones found |

  The model's `rowKinds(runSeed, d)` gets a road salt: `rowKinds(runSeed ^ roadSalt, d)` [W2].

### 4.2 Node anatomy

| Part | What it is | Numbers |
|---|---|---|
| **Face** | the 7-block heading at the head of a drift (§3.5) | blocks 0.80 m, 98–113 px |
| **Drift** | K slices of tunnel declining 1:6, 3.0–3.6 m wide, 3.0 m tall, flaring into the octagon heading at the face; timber sets every 2.5 m; a lamp every 8–12 m hung by the crew behind you; rails and sleepers | K per biome (§4.3) |
| **Breach** | the last slice before a chamber. In the last 3 slices: hairline leaks in the promise colour (§8.4), a hollow knock on strikes, dust sifting from the joints; the chamber's ambience leaks through | crumbles at 5 of 7 like any slice |
| **Chamber** | a composed diorama from a kit template: 8–14 m wide, 10–20 m deep, 6–16 m tall; 1–3 **stands**; 4–6 strike-type tappables within 3.5 m of a stand; 0–1 feature (chest, relic, geode, note, depot); 2–4 cold Halden lamps; wall skin; 1–2 exits | harvest and explore 20–45 s (est.) |
| **Stand** | an authored camera pose (position, yaw, pitch) with 0–2 **chalk-arrow facings**; stand 1 sits 0.5–1.0 m inside the breach | Halls, Vistas, vaults and landmarks have 2–3 stands |
| **Survey ring** | a brass octagon set in the floor, glowing faintly when your lantern is near: tap to glide to its stand | ≤ 1.2 s glide |
| **Chalk arrow** | a Halden chalk mark at a frame edge pointing at something worth turning to (a side alcove, the wonder overhead) | ≤ 35° yaw or ≤ 20° pitch |
| **Exit** | a stair, ladder, root chute, ramp or hoist cage with a carved octagon plate (state of the next drift: "Next · 3 m", "2 dug") | ride 1.6–2.6 s |
| **Works** | every chamber behind you; the crew works its leftover veins and skin when the leash is full | gold at the face's average gold per damage |

### 4.3 Drift length per biome

**Rule:** a drift takes 10–30 s at the median row time of that biome in the first three days, and a node (drift + chamber +
rides) takes 35–70 s (est.; the node-paced bot tunes K). Topsoil is authored.

| # | Biome | Depth (m) | K (slices) | Trunk chambers (about) | Seal (mechanism; weak point) |
|---|---|---|---|---|---|
| 0 | Topsoil Roots | 0–39 | authored: 5, 6, 7, 7, 7, 8 | 6 | **Halden Hatch**, a timber floor hatch with chains (the padlock) |
| 1 | Glowroot Caverns | 40–119 | 7 | 11 | **Root Knot** (three amber knots light in turn) |
| 2 | Crystal Grotto | 120–239 | 9 | 13 | **Prism Lock** (facets glint clockwise) |
| 3 | Halden Works | 240–399 | 11 | 15 | **the Crusher** (the pressure valve) |
| 4 | Fungal Deep | 400–599 | 13 | 15 | **Spore Valve**, a Halden valve in a mycelium wall (its wheels light in turn) |
| 5 | Drowned Ruins | 600–899 | 15 | 20 | **Drowned Bell** (the clapper on each toll) |
| 6 | Magma Veins | 900–1,299 | 17 | 24 | **Forge-Heart** in an obsidian cage (cooling cracks) |
| 7 | Fossil Halls | 1,300–1,799 | 19 | 26 | **Bone Organ**, pipes of fossil bone (the pipe that sounds) |
| 8 | Frost Hollow | 1,800–2,399 | 21 | 29 | **Ice Lock-Wheel** (its frozen pawl) |
| 9 | the Loom | 2,400–3,099 | 23 | 30 | **Thread Lock** (knots of light) |
| 10 | Iron Core | 3,100–3,899 | 25 | 32 | **the Escapement**, a world-clock (the tooth at 12) |
| 11 | Star Heart | 3,900–4,799 | 27 | 33 | **Astral Geode** (stars brighten in turn) |
| 12 | Void Sea | 4,800–5,799 | 29 | 34 | **Mirror Gate** (it copies the block you struck last) |
| 13 | the Gate | 5,800–6,899 | 30 | 37 | **the Last Lintel** (the flame core) |
| 14+ | Echo strata | +1,100 each | 30 | 37 | the base mechanism, re-tinted |

Seal ids in `config/biomes.ts` become mechanism ids: `prismWarden → prismLock`, `motherSpore → sporeValve`,
`singingSkull → boneOrgan`, `rimeWyrm → iceLockWheel`, `loomKeeper → threadLock`, `reflection → mirrorGate`,
`keeper → lastLintel` (the other seven are already mechanisms).

### 4.4 Chamber contents (rolled per run; pity floors; fixed rooms authored)

| Class | Share | Holds (besides 2–3 veins, lamps and skin) | Breach leak | Auto-delve stops? | Pity |
|---|---|---|---|---|---|
| Gallery | 40 % | loose nuggets, a stash brick, dressing | **dull**: biome fog only, no colour | first light only | — |
| Lode | 12 % | one large rich vein (3–5 rich nuggets, gold ×4) | warm gold | first light only | — |
| Cache | 9 % | a chest on a crate (Wood floor, honest roll-up) | warm gold | yes | ≤ 6 chambers apart |
| Reliquary niche | 6 % | a relic on a plinth in an alcove | rune cyan | yes | ≤ 10 apart; ≥ 2 per biome |
| Geode pocket | 5 % | a geode in the wall: 3 strikes crack it, then the focus pop and a Strike ring | violet-cyan sparkle | yes | ≤ 12 apart |
| Depot | 5 % | a Halden cart depot: tip the cart for 60 s of crew output, or +5 levels on an owned line | brass lamp | yes | — |
| Lamp Hall | 4 % | one of the biome's 3 legendary lamps (Codex) | soft flame | yes | ≤ 5 apart until the biome's 3 are found |
| Halden camp | 4 % | a note or mural (Lore), a planted-lantern hook | warm low amber | yes (note) | ≥ 3 notes per biome |
| Collapse | 2 % | loose rubble: the next drift has ×0.3 HP | dust grey | first light only | — |
| Fork | (topology) every 4–6 chambers from Glowroot [W2] | two exits with lit promises | the brighter of the two | yes | — |
| Confluence | (follows a fork) | where roads rejoin; often a draft | per contents | per contents | — |
| **Threshold** | the first chamber after a seal | the reveal composition | the next biome's light through the seal | yes (first time) | authored |
| **Vista** | 1 per biome at about 35 % | the biome's Wonder, a Royal Chest (10-gem key) [W2], a relic shrine, a mural | the biome's far light | yes (first time) | authored |
| **Seal hall** | the last chamber of a biome | the mechanism at its exit | the next biome's light through the seams | yes | authored |
| **Vault** [W2] | 1 per biome from Glowroot, behind a passage only the Pulse reveals | a sealed Halden vault: a Reliquary-floor chest, a relic, a mural | hidden | yes | authored |
| **Landmark** | 1–2 per biome, so an authored room comes every ~5 chambers | biome set dressing at hero scale (e.g. the Lift Bottom, the Rootheart balcony) | per contents | per contents | authored |

Every chamber holds at least one discovery that is not a strike (a lamp, a note, a draft, a keystone, a chalk-marked alcove).

### 4.5 Roads [W2] (the cure for Lumi Master's "too linear")

- A fork every 4–6 chambers from Glowroot on; **the first fork comes after the Hatch** (≈ 9:20, §7). Roads are 1–2 chambers
  long, have the **same K**, and rejoin at a confluence. Depth stays one number.
- The promise is shown before the choice: an icon on each exit's octagon plate (ore, relic, depot, short, "?") and the
  light beyond each exit in the promise colour. **The promise is always true** and differs in kind, never in depth.

| Road | Its chambers lean toward | Bound |
|---|---|---|
| **Vein Road** (warm gold) | Lodes; a Golden Vein in the next drift | rock gold lowered so the cell mix EV stays ≤ ×1.25 |
| **Builders' Road** (rune cyan) | a Reliquary niche, a Halden note, a secret | the Find drop table |
| **Works Road** (brass) | a Depot, an early crew blueprint, free crew levels | ≤ 10 free levels a road |
| **Short Road** (dust grey, from Crystal Grotto) | the next breakthrough 8–12 m sooner, same expected value | — |
| **Unknown** (violet, only after a Pulse reveals it) | the biome's vault | 1 per biome |

- No wrong answer, no backtracking. The other road becomes a "road not taken" on the Chart; re-climbs may take it. Auto-delve
  repeats your last choice at a charted fork unless you tap.
- Keystones never sit on a road branch (§4.9).

### 4.6 First light, lamps, charting

- **First light.** Every chamber waits dark: biome fog, its cool fill at 60 %, its emissives (glowroot, crystal, magma cracks).
  Silhouettes and glints read; nothing else does. As you glide in, your lantern pool leads and the chamber's fill rises from
  60 % to 100 % over 1.2 s. It is done with light, not effects: a per-chamber fill uniform. Chambers are generated and lit in
  the slab worker ≥ 2 drifts ahead and hidden by occlusion, so the breach frame does no light propagation.
- **Seen chambers.** A chamber whose first light you have done in any run is "seen" (lifetime bit). On later runs it still
  starts dark, but its first light plays in passing (1.2 s during the glide) and auto-delve does not stop for it.
- **Halden lamps.** 2–4 cold lamp posts per chamber, each within 2.5 m of a stand, each ≥ 0.55 m across (head, hood and
  bracket). One tap relights one: a soft *whoomp*, a warm pool; the lamp becomes one of the 4 per-pixel practicals while you
  are in the chamber and is written into the LightField in the worker after you leave (≤ 1 incremental open per frame). It stays
  lit for the run.
- **Charting.** Relight every lamp of a chamber and it is **charted** (lifetime): a brass check on the Chart, +20 rank XP, and
  1 gem the first time ever. Lamps darken again on a new run (re-lighting is quick and counts for the Lamplighter feat).
- **The warm trail.** Lit chambers show as warm windows: on the Chart, in the return glimpses, and across the spiral in Vistas
  where earlier chambers' openings face the void (progress drawn in light).
- **Legendary lamps** (3 per biome, objects not creatures): in Lamp Halls and fixed rooms; relight one to collect it into the
  Codex (+2 % gold each; relighting it again in a later run adds a level) [W2].

### 4.7 Wall skin, pockets and the glint language

- **Wall skin:** chamber rock within 3.5 m of the active stand is minable one cell deep (about 40 cells per chamber, faceted
  plugs of 0.5–0.7 m). A skin cell has the chamber's depth HP and pays **0.6×** the rock gold of that depth (L6). Breaking one
  drops 6–9 shards and shows darker deep rock behind it.
- **Pockets:** 12 % of skin cells hide one: a nugget (×4 gold, 80 %), a gem (15 %) or a Halden scrap toward the biome's notes
  (5 %, within the note quota). From Lantern tier 5 a faint warm glint shows a pocket through the skin [W2].
- **Deep rock** (behind the skin, or rock in reach that is not skin) answers with a dull *tunk*, two dark chips and a 0.6 s
  hint rim on the nearest unharvested tappable. It is a response, never a miss.
- **The glint tier language** (a small highlight on a real 3D object, never a coloured square): pale = common ore; amber =
  rich; the biome's gem hue = rare; rune cyan = relic or keystone; gold = Golden Vein.

### 4.8 Secrets, drafts and the Lantern Pulse [W2]

- **The meter** lives in the lantern (§2.6). It **waits when full.**
- **The Pulse:** a tap on the lantern (§2.4). It rises 0.3 s and a ring of warm light rolls out at 8 m/s to 12 m (1.5 s),
  rendered as an expanding shell term in the lantern lighting function (one uniform radius; no particles, no post effect, no
  LightField rebake). Then:
  - **in a chamber**, hidden things within 12 m light as the ring passes and stay revealed (an instance attribute switch): a
    hidden vein (rich, ×3 a normal vein), a Halden stash behind roots or bricks (Copper-floor chest), a passage outline carved in
    cyan builders' script leading to the vault or the Unknown road, a mural;
  - **in a drift**, the next 3 slices' valuables glint through the rock for the Surge's duration;
  - **everywhere**, Surge: strikes ×3 for 10 s (+1 s per Bellows level), hold at 8/s, the lantern radius ×1.6.
- **The decision:** spend it on ×3 digging now, or carry it to a chamber with a hint.
- **Drafts:** a chamber with a secret shows six lit dust motes drifting toward a seam and a breath of cold air in the sound.
  About one secret in 3 chambers (pity ≤ 5 apart). A secret that needs a better lantern says so in place, carved small:
  "Answers only a Storm Lantern".
- **Oil pre-fill:** lamp oil the carts haul while you are away pre-fills the meter (full after ≥ 1 h away), so a return opens
  with a Pulse ready.

### 4.9 Keystones [W2] (the zone tracker, made physical)

- From Glowroot on, each seal shows **three empty sockets**. Three cyan builders' keystones hide in the biome's **main-road**
  chambers at fractions 0.25, 0.5 and 0.85 of its trunk (never on a road branch, never in a vault).
- A keystone glints rune cyan in its niche; tap it: the focus pop; one tap pries it out; it flies to the objective line
  ("Root Knot · keystones 2/3").
- **It can never be missed:** auto-delve stops at it, and a keystone left behind is carried by the crew to the Chest Rack and
  sockets itself when you reach the seal. Charted seals need none.

### 4.10 Descent geometry (fits the unchanged RingWorld)

- **RingWorld** keeps its 64 × 160 × 64 m window (a y-ring of 10 slabs of 16 rows) minus the cutaway (`RING_CUT_Z`, its apron
  and `openBack` go).
- **`deepPath(lifeSeed, d)`** (pure) returns, for every depth, a world position and direction, the run kind (drift, chamber,
  Way Down, seal) and the slice index. The trunk is a **square spiral** inside the 64 × 64 footprint: drifts nearly level
  (1:6), each chamber turning the next drift ±90° and dropping it 3–6 m through the Way Down. A lap is 4–6 nodes. Every turn and
  every joint between pieces is hidden inside a chamber, where the breach frames the view.
- **Unit tests (day 1, before any kit art):** determinism; no two volumes overlap; every volume inside the ring bounds; ≥ 12 m
  of rock between a lap's floors and the ceilings of the lap below; every stand's view frustum to 20 m clear of foreign
  geometry; road branches of equal depth.
- **Roads:** both branches run side by side within one lap (≥ 12 m apart) and rejoin at the confluence. **Fallback** if a
  biome's kit fails the tests: the shared-node road (two exits into two chambers carved off the same trunk segment, merging at
  a shared Way Down).
- **Large spaces:** Vistas take a whole lap and use up to 48 × 40 × 60 m of real geometry; their far planes are lit rock fading
  into fog toward the biome colour. `VistaBackdrop` cards are not used.
- **Stamping:** `world/hybrid/nodeStamp.ts` stamps drift tubes, face plugs (solid for light and picking, never meshed: the
  face is drawn by the FaceRenderer), chamber volumes, skin cells, lamp sockets, survey rings and Way Downs into slabs; it
  replaces slab passes 4–9. Passes 1–3 (biome per depth, strata, veins) stay, keyed by path depth. The face's cells are stamped
  from `rowKinds`, so the model and the world agree cell for cell.

### 4.11 The fill contract (checked from every stand; `tools/fill-scan.ts` re-aimed at stand frustums)

| Rule | Minimum |
|---|---|
| Tappables in frame on arrival | ≥ 4 in a chamber (veins, gems, lamps, feature); in a drift, the face itself with ≥ 1 special block in any 4 slices |
| Light | ≥ 1 warm practical (amber, the human light) and ≥ 1 accent emitter in the biome's key per stand |
| Wonder | ≥ 1 hero dressing feature per chamber in the top third of the frame |
| Floor | ≤ 35 % of the floor within 6 m farther than 2 m from any prop or tappable |
| Clear air | nothing decorative in front of a tappable or the face; 1.0 m clear in front of the face |
| Tease | the next chamber's promise leaks through the breach in the last 3 slices |
| Rhythm | a reward in view at all times; the Director's find guarantee (10 s) and boredom breaker (25 s) still run |
| Wall cover | veins or crystals on ≥ 8 % of the visible wall faces |
| Nothing floats | every prop rests on geometry (contact test); no billboard is visible as a card |
| Something new | a new face feature every ≤ 8 slices (ore run, chest lid, hollow [W2], glint [W2], leak) |

### 4.12 Content volume and anti-repetition

- **Kits:** ≥ 12 chamber templates per biome, each in 3–4 **sub-zones** (e.g. Glowroot: root cellars → glow galleries → the
  Rootheart → deep roots) that change dressing, shape (dome, hall, rift, gallery) and light. W1 ships Topsoil (6 authored) and a
  Glowroot mini-kit of 4 templates × 2 sub-zones; W2 completes Glowroot, Crystal Grotto and Halden Works.
- The same template never repeats within 4 chambers; an authored landmark at least every ~5 chambers.
- **Diversity metric (C9, CI):** per biome, render the stand-1 arrival frame of 40 consecutive generated chambers as 64 × 138
  grayscale thumbnails: mean pairwise SSIM ≤ 0.55, and no two consecutive chambers above 0.75.
- Per-run re-roll (§4.1) keeps re-climbs fresh.

### 4.13 The 14 biomes as node kits (creature-free)

| # | Biome | Chamber kit (shape language) | Way Down | Threshold → Vista wonder | Secret flavour | Legendary lamps |
|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | root cellars, timber galleries, tumbled boulders | rope ladders, timber stairs | the first sky shaft: dusk falling into the Root Cellar; the Lift Bottom | stashes behind roots | Lift Lamp, Foreman's Lamp, Crate Lamp |
| 1 | Glowroot Caverns | rounded halls, root curtains that brighten as your lantern passes, dark mirror pools | root chutes, root stairs | the Rootheart, an 18 m glowing root tangle seen from a root balcony | passages behind root curtains | Root Lamp, Pool Lamp, Hanging Lamp |
| 2 | Crystal Grotto | angular rifts, crystal clusters 1–3 m | crystal ledges | the Hand in the Crystal: a 20 m crystal with a human outline inside | geodes, mirrored niches | Prism Lamp, Echo Lamp, Spire Lamp |
| 3 | Halden Works | built halls: beams, gears, rails, offices | hoist cages, rail inclines | the Crusher Hall: 12 m gear wheels under the hoist tower | the foreman's safe | Office Lamp, Furnace Lamp, Hoist Lamp |
| 4 | Fungal Deep | domes of caps on stems, shelf fungi (decor only) | shelf-fungus steps | the Mother Cap: a 60 m mushroom, gills glowing from below | lanterns overgrown, still lit | Cap Lamp, Overgrown Lamp, Ring Lamp |
| 5 | Drowned Ruins | stepped masonry, arches, still water | sunken stairs | the Drowned Procession: statues carrying lanterns into the water; the Ember Shrine | dry rooms behind flooded doors | Procession Lamp, Bell Lamp, Tide Lamp |
| 6 | Magma Veins | cracked basalt columns, an underlight from below | basalt steps, a chain bridge | the Forge of the Bearers: a 15 m anvil over a lava river | cooled lava tubes | Anvil Lamp, Rack Lamp, Slag Lamp |
| 7 | Fossil Halls | ribs, arcs, vertebrae (old bones) | rib ramps | the Leviathan's ribcage, a lantern hung in its eye socket | resin-sealed niches | Rib Lamp, Eye Lamp, Resin Lamp |
| 8 | Frost Hollow | big flat ice facets, icicles | ice steps | the Frozen Waterfall; a Halden crew frozen mid-step, lamps raised | light through an ice ceiling | Frozen Lamp, Aurora Lamp, Lost Lamp |
| 9 | the Loom | woven lines, shelves, looms | shelf-stairs | the Archive of Light: shelves of identical crystals | hidden reading rooms | Archive Lamp, Thread Lamp, Shelf Lamp |
| 10 | Iron Core | heavy plates, giant gears | gear lifts | the Loom's Heart, a lodestone winding light into thread (**Weave**) | maintenance crawlways | Piston Lamp, Gear Lamp, Core Lamp |
| 11 | Star Heart | floating rocks, radial forms | glides between islands | the Buried Star: a 12 m sun among floating rocks | inner skies in geodes | Sun Lamp, Nova Lamp, Orbit Lamp |
| 12 | Void Sea | almost nothing: islands | upward falls | the Upward Falls under an aurora | islands seen only in the Pulse | Island Lamp, Null Lamp, Horizon Lamp |
| 13 | the Gate | the Lintel's architecture, rune pillars | the great stair | the Last Gate, open from the other side (**Breach**) | the Black Stone | Lintel Lamp, Black Lamp, your own lamp |

Ores per biome, crew unlocks and music modes stay as `config/biomes.ts`. Ambient life is decoration only and inanimate (§4.16).

### 4.14 The discovery ladder (wonder pacing, run 1, est.)

| Scale | What surprises you | How often |
|---|---|---|
| Strike | a crit (5 %+), the block's kind (ore 10 %, rich 4 %, rare 1 %) | every 0.2–0.3 s |
| Slice | the next slice under the light; pierce holes; a chest lid (centre block every 25 rows) | every 1.4–3.6 s |
| Breach | the leak colour: what is behind it? | every 35–70 s |
| Chamber | first light on the room: its shape, its wonder, its feature, maybe a draft | every 35–70 s |
| Stand | a second view, a side alcove, a lamp across the room | most Halls, every Vista |
| Road [W2] | the choice, and the road not taken | every 3–5 min |
| Secret [W2] | a passage, a vault, a stash revealed by your own light | ≈ 1 in 3 chambers; a vault per biome |
| Biome | seal, reveal, Threshold, then a Vista ≈ 35 % in | 5–8 min early in run 1; minutes on re-climbs |
| Mystery | the Other Lantern: a warm point always far below in every Vista and Threshold, 600 m below your record; Halden notes; murals | every biome |

### 4.15 Drift variety (against monotony at the face)

- **Ore runs and chest lids** come from the model's cell mix (veins of 2–6 blocks; the centre block's chest every 25 rows).
- **Breach tells** in the last 3 slices (§4.2).
- **Hollows** [W2]: a rare or note block cracks open on a small lit cubby with its find inside, a micro-breakthrough. The first,
  in Topsoil's drift 4 (row 21), holds a Halden lamp still burning and a Halden badge (a Find).
- **Lantern Sense** [W2]: up to 6 static pinpricks (≥ 8 px, never pulsing) on the face mark valuables 4–10 slices deep (warm =
  gold or chest, cyan = gem or relic, violet = the chamber ahead), +1 slice per Lantern gear card.
- **Sumps** [W2]: from Glowroot on, about 1 drift in 4 digs the **floor** of a pit from a hoist cage (the cage rail is the static
  anchor; pitch −55°; blocks 0.95 m to stay ≥ 92 px foreshortened). The breakthrough is the **drop-in**: the floor gives way and
  you look straight down into the chamber below; the cage lowers 4–5 m (≤ 2.0 m/s, ≤ 2.6 s); the pitch eases to 0° only after
  landing (0.6 s). Never two in a row, never before a seal.
- **Crew hires** visibly change the frame; **bore classes** [W3] change the hole itself.

### 4.16 Ambient life

Inanimate only: drips, falling water, motes, spores, steam, embers, root threads brightening as the lantern passes, old bones.
Decoration never takes a tap; taps pass through it. No animal, insect or moth appears anywhere, decorative or not.

---

## 5. Loops, from the quarter second to the week

### 5.0 The nested clocks (run 1, est.)

| Clock | Loop | Reward |
|---|---|---|
| 0.25 s | strike | crack, chips, a material *tock*, a block breaking every 1–4 taps (p50 ≤ 4, L3) |
| 1.4–3.6 s | slice | the crumble, one note up the biome's pentatonic scale, the step forward |
| 0.5–5 s | purchase | Pick, BEST, a hire: the world answers in the same frame (≈ 150–200 buys in the first 10 min) |
| 10–30 s | drift | the breach tells, then the breakthrough |
| 20–45 s | chamber | first light, harvest, lamps, the feature, a second stand, the exit |
| 40–70 s | event [W2] | the Director deals one (never two at once; first dealt in session 2) |
| ≈ 50 s | lantern [W2] | the Pulse: a secret, or ×3 strikes |
| 3–5 min | road [W2] | a fork, its promise, the confluence |
| 5–8 min early | biome | keystones [W2], the seal, the reveal, gear, a crew line, the Vista |
| 5–15 min | session | the return haul, dark chambers waiting, contracts [W2], the daily chest [W2], the hook ("Root Knot · keystones 1/3") |
| 45–60 min | run [W3] | Rekindle at the Ember Shrine (600 m) |
| days | layers [W3] | Weave (3,100 m), Breach (5,800 m), Echo strata, Feats, Codex pages, the Chart, the camp |

### 5.1 The core loop: strike → slice → drift → breakthrough → chamber

- **Strike** (the model's `tap.ts` resolution order, untouched). Same frame: the tool lands on the contact pose, the struck
  facet brightens +0.4 for ≤ 80 ms, a crack stage grows from the tapped point (procedural grooves), 4 lit chips and one low
  dust puff, the material's *tock* (soil thud, slate clack, crystal ping, brick crunch, ice crack, metal clang; a crit adds an
  overtone; pierce raises it 2 semitones per block bored), an 8–10 ms haptic. **No number, no camera motion.**
- **Block break:** 6–9 lit BSP shards (`Shards.ts`) fall out of the face into the lantern pool and fade within 0.6 s; ore drops
  1–4 nugget objects that roll into the light, then ≤ 3 tokens fly to the gold plate in ≤ 0.55 s (the counter rolls when they
  land, L8); a crunch, then the clatter 0.3 s later; a 15–20 ms haptic. Crit: "×5" stamped on the struck block for 0.4 s.
- **Combo** (×1 → ×2 at 50) is felt, not counted: the tool head's heat (§3.7) and a rising strike pitch.
- **Slice:** when 5 of 7 blocks are down the rest crack, shake on their own for 0.3 s (the blocks, not the camera) and fall as
  one burst (κ = 0.86 holds exactly). Then the creep (§3.6).
- **Drift:** K slices; the last 3 tell (leaks, knock, dust); the objective counts down ("Break through · 2 m").
- **Breakthrough** (the most frequent ceremony, so it is cheap): the wall falls inward as 10–16 large shards (0.6 s) while light
  spills; a 35 ms haptic and an air-rush; the chamber's ambience fades in; the glide and **first light**. No shake, no flash, no
  post effect; FX ≤ 1.2 s.
- **Chamber:** harvest by tap or hold; relight the lamps; open the feature in the focus pop; take a second stand if there is
  one; take the exit. Strike-type tappables take 1–5 taps each.

### 5.2 Chamber economy (the model's honest gold law, L6)

| Item | Value (knob) |
|---|---|
| Chamber HP budget | `CHAMBER_EQ` = 10 cell-equivalents of the chamber's depth HP (range 8–14), spread over 4–6 strike-type tappables |
| Gold per damage | veins 2.5× (common) and 4× (rich), gem clusters 8× with a gem chance, skin 0.6×, deep rock 0 |
| A fully harvested chamber | ≈ 4–8 rows of face gold (est.); its specials (chests, relics, Finds, depots) are priced like the model's chests and events, in seconds of income and gems |
| Face vs chamber | **the face gives depth, the chamber gives gold and discoveries**; the crew digs the next drift meanwhile, so neither is dead time |
| Player vs crew | a player's strike on a chamber special pays **10–100×** a crew strike (rich gold per damage × player damage × crit/combo/Surge); asserted by the bot (S2) |
| Leftovers | when you leave, unharvested veins and skin join the **Works** (the crew mines them later as gold); chests, relics and keystones go to the **Chest Rack** (holds 10; beyond 10 a chest pays its value in gold); nothing is lost (L11) |
| Target share | chamber gold = 25–35 % of run gold (S1) |

### 5.3 The crew, the leash, the Works, offline and the return

- **The crew digs where you see it.** At a face, visible rigs strike the outer blocks on their impact frames (the screen and the
  numbers agree). Visible rigs share one **0.9 s crew bar** (rig periods quantised to multiples of 0.9 s, damage per impact
  rescaled so DPS is unchanged) so they count as **one** ambient group. While you are in a chamber, the crew is already at the
  next face: you hear it, see its lamps down the exit, and the exit plate reads "Next · 4 m".
- **The leash** (L10). The crew may break into at most **L unseen chambers ahead of you** and leaves them **dark**, with every
  vein, lamp, chest, relic and keystone in place. Seen ground (chambers lit in an earlier run) does not count against the leash.

  | Rule | Value |
  |---|---|
  | L in Topsoil Roots | **0**: every first breakthrough of the tutorial biome is yours (the crew stops one slice short) |
  | L from Glowroot on | **3**, +1 per **Survey Lamps** level (Crew sheet, from 120 m, price 10 rows of gold at 120 m ×10 per level), max **8** [Survey Lamps W2] |
  | The crew never opens | an unopened seal; the breach of an unseen Vista; a biome's first sight |
  | When the leash is full | crew damage becomes **Works haul**: gold at the face's average gold per damage (1.00×), first from leftover veins and skin behind you; delivered by mine cart every ≈ 6 s as one floating number (before carts it joins the rate silently) |

  Online, the exit plate shows dark chambers waiting ("2 dug"). Strong crews change the game: you ride down a dug drift on the
  catch-up track, arrive at a dark mouth, and first light is yours. Power turns digging into exploring.
- **Offline** (`offline.ts` keeps its exact closed form with one more stop: the leash):

  | Rule | Value |
  |---|---|
  | Starts after the app is hidden for | 30 s |
  | Efficiency | 50 % of crew DPS → 75 % at 250 Embers → 100 % at 1e5 Embers |
  | Cap | 3 h → 6 h at 25 Embers → 12 h at 250 Embers |
  | Stop depth | the breach of the (L+1)-th unseen chamber ahead, or the next unopened seal, whichever comes first; the rest of the time pays Works haul |
  | Chambers the crew opened | stay dark; everything waits in place |
  | Oil [W2] | carts haul lamp oil (4 h cap) that pre-fills the Pulse meter |

- **The return** (≤ 3 s, any tap skips): a 0.24 s fade-in; up to **3 glimpses** (0.7 s each, joined by 0.25 s cross-fades)
  through what the crew dug, past full carts and crew lamps; you arrive **at the mouth of the first dark chamber**. One opaque
  plate: "While you were away · 4 h 12 m · +3 chambers · +21 m · +4.2e15 gold · 2 chests on the rack". **Collect**: tokens fly
  for ≤ 1.2 s; the rack opens one chest per tap; then BEST lights. The next tap glides you in: first light is yours.
- **Haul carts** [W2]: once Mine Carts are owned, a cart stands at the rail end of each chamber, filling. Tap it to tip it: +10 %
  of the crew's output since you arrived, one token stream. Left alone it is collected when you leave. A gift, never a chore.

### 5.4 Upgrades (the model's tables, shown in first person)

| Line | What you buy (model) | What you see change |
|---|---|---|
| **Pick** | damage `100 × L × 2.5^floor(L/25)`; cost `30 × 1.2^(L−1)` | a 160 ms flex and the delta preview on the card ("+12 % → 1.42K / strike"); a temper step every 25 levels; the tool **form** with each new biome reached (§3.7) |
| **Crew lines** | 15 authored lines then Echo lines: Shovel Hand (0 m, 50 gold), Pick Crew (16 m), Mine Cart (40 m), Steam Drill (120 m), Blast Team (240 m), Tunnel Borer (400 m), Crystal Resonator, Magma Lance, **Bone Ram** (was `fossilGolem`), Rime Auger, Loom Weaver, Gravity Well, Star Forge, **Void Engine** (was `voidMaw`), Gate Engine; ★ every 10 levels ×2; a crown every 50 | each hire walks a worker into a nook or wheels a machine in on the rail (1.2 s); a ★ lights the rig's helmet lamp, ★3 adds gold trim, a crown a circlet; machines from line 3 mount in the ceiling band or the nooks, never over a block; lower lines show as a trail of their lamps down the drift |
| **Gear** | 4 one-shot cards per biome: Tools ×3, Rigging ×3, Edge ×3, Lantern ×2 | each **Lantern** card is one lantern tier (§3.7): new model, +0.6 m radius, warmer light, Lantern Sense +1 slice [W2]; secrets gate on the tier |
| **Dig upgrades** | Rally (taps add crew DPS), Lucky Strike (crit), Shockwave (splash to snake neighbours), Steady Hand (hold rate), Bellows (Surge length) | Steady Hand quickens the hold beat; Shockwave shows cracks running to neighbour blocks |
| **Survey Lamps** [W2] | leash +1 per level, max 8 | a brass lamp is hung at the next dark chamber's mouth per level |
| **Skills on the rack** | Dynamite (30 m, 60 s cooldown), Gold Rush (180 m) [W2], Overdrive (320 m) [W2], Earthquake (600 m) [W3], Cataclysm [W3] | diegetic tools in the drift's lower-left nook (≥ 88 × 88 px each): a dynamite crate whose sticks reappear as it cools down, a brass bell, a steam whistle, a blasting plunger. "Ready" is a calm amber rim, shown only when no other hint is up. **No skill row in the HUD.** Dynamite: three charges hiss into the face (0.5 s fuse), one deep thump (sub-bass, 60 ms haptic, the lantern flickers, one 0.4° shake), 3 slices blow out, the creep 3 m in 1.5 s |

- **BEST** (the model's payback `cost/Δincome + max(0, cost − gold)/income`) is the right-hand card: one tap is always right.
- **Buying is ≤ 2 taps:** the two cards are one tap; everything else is ≡ → card. Cards are their own progress bars and **show
  their price** ("nothing is indicated" was a complaint). Buy modes: ×1 until the first ★, then NEXT ★ by default; ×10 and MAX
  after the first Rekindle. Hold-to-buy plays a rising pentatonic arpeggio.

### 5.5 Seals (the model's `seals.ts`, Wardens recast as mechanisms)

- **The approach:** within 2 chambers of a seal never opened, the objective reads "Break the Root Knot · 2 chambers"; the breach
  leaks take the next biome's colour; from Glowroot the keystone sockets fill as you go [W2].
- **The fight (first time ever):** the mechanism fills the middle band of the Seal hall's stand (the Hatch is a floor hatch seen
  at −35°). 30 s; HP = 20 s × (crew DPS + 4 × tap damage without crit), ×0.5 for the Hatch. The weak point (padlock, knot,
  facet, valve, clapper…) lights every 5 s for 1 s and takes ×5. At 25 % HP a Strike finisher (a needle sweeping an arc) appears
  on it: a perfect stop hits ×10. An active player wins in 12–20 s; the crew alone cannot. The seal's HP and timer live inside
  the objective line (a ring around its icon), never over the world. The drum layer enters.
- **Fail:** "The seal holds · 64 %". It keeps 50 % of the damage, BEST glows, nothing is lost (L11). Tap to start again.
- **Win:** a 60 ms hit-stop, one 0.4° / 120 ms shake, ≤ 40 large shards, one 0.12 full-frame lift for 150 ms (the only
  full-frame flash in the game), light pouring through the seams; the Reveal shot (≤ 3 s). Rewards: the seal's relic (a Find), a
  Crystal-floor chest, 5 gems; the next biome's 4 gear cards (one badge on ≡), a crew blueprint, new event types [W2], the
  biome's Codex page, the next tool form. From the second seal on, a facet hand [W3].
- **Charted seals** (opened in an earlier run) break like a hard slice (×3 HP) with a 1.2 s title chip and the split time
  ("Crystal Grotto · 1:12 · −4:40").

### 5.6 Events [W2] (the Director: U(40, 70) s of active play; deck rules, rotation pity, the find guarantee and the boredom breaker kept; creature events purged)

| Event | From | Staged in first person | Verb | Reward |
|---|---|---|---|---|
| **Drifting Ember** (replaces the Lucky Moth) | first at ≈ 11 min, then every 90–180 s | an ember drifts out of a crack across the frame for 7 s, lit, no trail | tap once | Gold Shower (60 s of income) 55 %, Ember Frenzy (×7 for 20 s) 20 %, 3 gems 15 %, skill refresh 10 % |
| Golden Vein | 30 m (scripted on the first Vein Road) | 3 blocks per slice turn gold leaf for the next 5 slices | dig | ×20 gold |
| Glimmerfall | 40 m | crystals fall from a ceiling crack through the lantern pool | catch 5–9 | 3 s of income each; 1 in 5 is a gem |
| **Seed Fall** (Glowroot signature; replaces the Moth Swarm) | 40 m | glowroot seed pods drift down | catch 6–10 | 8 s of income each |
| **Rattling Bricks** (replaces the Treasure Mole) | 80 m | a Halden stash: bricks loosen one by one in the chamber wall | tap each (3–5) | Copper-floor chest |
| Cave-in | 120 m | boulders drop in the drift ahead | tap 3–5 (1–3 taps each) | 10 s of income each; ignored ones become boulder blocks (×3 HP, ×3 gold) |
| **Wedged Chest** (replaces the Mimic) | 160 m | a chest caught in a slowly closing crack | 5 taps on the crack before it shuts | Crystal-floor chest (if it shuts, a Wood chest drops out) |
| Supply Rope | 180 m | a crate lowered on a rope | tap, then pick 1 of 3 boosts | 60 s boost |
| Runaway Cart | 240 m | a loose ore cart rolls down the rail | tap 5 times to brake it | Crystal-floor chest (ignored: it stops further on and leaves a Wood chest) |
| Treasure Map | 320 m | chalk arrows appear on the chamber walls toward a chest behind the skin | follow and dig | Crystal-floor chest |
| Ancient Echo | 400 m | runes on the wall light in order | Sequence | Lore and 10 gems |
| Geode | rare cell from 120 m | a cracked geode in the face or a wall | 3 needles (Strike) | gems and a Find roll |
| Biome signature | per biome | Root Pull, Seed Fall, Crystal Bloom, Pressure Valves, Spore Burst, Pearl Bubbles, Lava Surge, Bone Rattle, Ice Shatter, Thread Weave, Gear Lock, Star Fall, Gravity Flip, Rune Lock | its widget | 60 s of income and a Find roll |

Rules: an event spawns inside the current view's tap zone within 6 m, never behind you, announced by a sound from its side.
Every event is skippable, never blocks digging, never takes anything away, and obeys the FX budget. Never during a seal or a
ceremony; after 20 s without a tap only waiting events are dealt.

### 5.7 Collection: the Codex of objects, relics with traits, the Chart

- **Codex** [W2] (creatures purged): per biome **14 entries** = 6 **Finds** (2 minerals, 2 fossils, 2 relics) + 3 legendary
  **Lamps** + 5 **Lore** (3 Halden notes, 1 mural, 1 seal card); 196 across the 14 biomes, plus Echo variants. Each Find +3 % to
  one stat of its biome, each duplicate +1 % (no cap); each Lamp +2 % gold; a complete page grants a **Biome Seal** (+10 % gold,
  +10 % power); a Codex chest (Crystal floor) every 10 entries; pity: 6 min of active play with no new entry in an incomplete
  page plants a find within the next 2 chambers. The side-multiplier budget stays ≤ ×10 by day 3.
- **Relics roll traits:** era (Halden, Drowned, Bearers', Loom, Star); condition graded by the ring; variant Gilded (1 in 20) or
  Star-touched (1 in 200, after Star Heart). **The ring:** in the focus pop, hold on the relic: a brass ring closes from 1.6× to
  1.0× over 0.9 s; release inside the gold band (last 8 %) = Perfect, the next 12 % = Pristine, 25 % = Fine, else Sound; no
  release within 2 s = Worn. A better grade replaces a worse one (+1 % per grade step). A Worn relic is still the Find. The first
  find of each object plays a 0.6 s turntable of its real 3D model with a NEW stamp.
- **The Chart** [W2] (opened by tapping the depth plate; replaces the Depth Ruler): a vertical node map of the descent: biome
  bands in their palettes with split times; chambers as octagon dots (seen, charted with a brass check, or a dark "?"); roads
  and roads not taken; secrets as cyan stars, vaults in violet; the next seal with its sockets; planted lanterns; the ghost
  lantern; at the bottom the Other Lantern's dot ("−612 m"). Chart completion per biome pays gems and Feats, never a multiplier.

### 5.8 Achievements, rank, records

- **Feats** [W2]: 21 families, tiers I–X then endless, +1 Mark (+1 % damage and gold) per tier, gems 5 × min(tier, 10). The 19
  kept families: Delver, Breaker, Spark, Rhythm, Tinkerer, Starwright, Forgemaster, Foreman, Lockpick, Lucky Lamp, Démesure,
  Kindler, Ember-born, Collector, Wayfinder, Overseer, Wonderstruck, Swift, Contractor. **Kindred becomes Lamplighter** (lamps
  relit: 5, 25, 100, 300, 1K, 3K, 10K, 30K, 100K, 300K; tier X perk: lamps within 6 m relight themselves). **New: Cartographer**
  (chambers charted: 3, 15, 50, 150, 400, 1K, 2.5K, 5K, 10K, 25K; tier X perk: forks offer 3 roads). Secret feats: Moth Friend
  becomes **Through the Dark** (find a vault); new **First Light** (break 100 breaches yourself), **Full Sweep** (harvest a whole
  chamber, skin included, 10 times) and **Every Flame** (relight every lamp of one biome in one run). Target ≥ 12 tiers in the
  first 30 min.
- **Rank** (never resets): `need(r) = 120 · r^0.78` XP; XP from everything (idle SPEC §7.7) plus a first light 5, a lamp 2, a
  charted chamber 20, a keystone 15, a road 10, a secret 25, a vault 100. +0.5 % to everything per rank, gems, a Copper chest every
  5, a title every 25.
- **Records:** splits per biome, fastest to 600 m, biggest hit, best relic grade. **The ghost lantern** [W3]: a pale-blue glow at
  the node your previous run had reached at the same run time, with a chip "+2 chambers ahead". **Planted lanterns** [W3]: hung in
  the chamber where each Rekindle ended; tap one as you pass for +2 % damage for the run.

### 5.9 Prestige [W3] (the model's three layers, staged in first person)

- **Rekindle** at the Ember Shrine (a shrine chamber in the Drowned Ruins at 600 m): `EmbersTotal(R) = floor(25 × 2^((R − 600)/200))`
  ("every new 200 m of record doubles your Embers"); each Ember +10 % damage; perks at 1, 10, 25, 50, 100 (Head Start), 250, 500,
  1,000…. A 0.6 s hold on the big Rekindle button; your lantern is raised to the shrine's flame and becomes the Ember Lantern
  (≤ 1.2 s); a cross-fade up; you arrive at the camp at dawn, grown (§5.10); the Head Start (from 100 Embers) is a cross-fade
  with the depth counter rolling to 10–30 % of your record.
- **Weave** (the Loom's Heart, 3,100 m, Threads) and **Breach** (the Last Gate, 5,800 m, eight challenge runs with endless tiers;
  "Blind" = no Lantern Sense and no glints beyond 2 m; new "Lanternless" = no lamps can be relit) as the model specifies.
- **Re-climbs pass seen ground fast:** the crew digs seen ground without a leash; auto-delve flies through seen chambers that
  hold nothing manual; a chest of Copper or better and an unopened relic still stop it; drifts that would clear in < 1.5 s become
  **Bores** (§5.11). Unseen chambers and roads not taken are new.

### 5.10 The camp (the menu, and the trophy room of démesure)

- The menu is a first-person view of the Halden camp at the adit mouth: dusk on the first launch, dawn after a Rekindle. First
  launch skips it and goes straight to the plug face; from the second launch it is the menu ("Descend" = tap the adit).
- **It grows with Fortune** (the number of digits of lifetime gold, never reset), so it visibly grows in session 1:

  | Stage | Fortune | The camp |
  |---|---|---|
  | 1 | 3 | tents, a campfire, the hand winch over the adit |
  | 2 | 6 | a timber headframe; the first ore shed |
  | 3 | 12 | a stone lift tower; a rail yard; bunkhouses |
  | 4 | 24 | a brass lantern tower; the Relic Cabinet house |
  | 5 | 48 | the Lighthouse: its beam shines down the shaft |
  | 6 | 100 (the Googol) | Lantern City on the horizon |
  | 7 | 303 | the Lantern Constellation: the camp's lights rise into the sky |
  | 8+ | every +100 digits | a new ring of lights |

- Per-system growth on top [W3]: each crew line parks its machine at the camp; the Relic Cabinet shows your relics with their
  traits; the Ember Shrine's flame grows with Embers; a lantern garden gains one lantern per Rekindle.

### 5.11 Démesure: absurd without noise

**The verbs scale** [W3]:

| Pick tier | One strike… |
|---|---|
| 0–7 | breaks a block, pierces 1–3 slices |
| 8 (Pick L200) | on any vein **sweeps** the chamber: every strike-type tappable in reach breaks in one 0.6 s cascade of large chunks, nearest first |
| 12 (Pick L300) | **bores** a drift when the damage covers it: a 0.3 s line of light runs through the rock to the breach, then a 0.25 s cut to the breach |
| 15+ (Pick L375+) | bores, sweeps and breaches in one gesture: the game becomes roads, secrets, relic grades, vaults and records |

**The hole scales: bore classes** [W3, prototype-gated]. Every 3 pick tiers the next drift cut out of a chamber is one size
class bigger. The standoff scales with the block, so blocks keep their pixel size while the world grows:

| Class | From | Block | Standoff | What sells the scale |
|---|---|---|---|---|
| Heading | start | 0.80 m | 3.0 m | timber sets, a hand-pushed cart |
| Drift | pick tier 3 (L75) | 1.2 m | 4.5 m | a centred double rail, two carts side by side |
| Gallery | tier 6 (L150) | 2.0 m | 7.5 m | crew figures one block tall; brass floodlamps on tripods take the key on the face; machines on gantries |
| Tunnel | tier 9 (L225) | 3.2 m | 12 m | crew half a block tall; shards become boulders; the sound drops an octave |
| Great Bore | tier 12 (L300) | 5.0 m | 18.75 m | crew a third of a block; the face is a cliff; carts are toys; you stand on the crew's gantry |

Blocks stay plates 1.0–1.5 m deep at every class (drift length stays K × 1–1.5 m). The class grows only at a breakthrough; a
Rekindle resets it, so the progression replays every run. Fog start = 1.5 × standoff. If the prototype fails comfort or
legibility, the ladder stops at Gallery.

**The world scales:** machines framing the face grow (the Gate Engine's ring is a lintel 20 m across); the camp becomes a lantern
city; numbers reach 1e2091 with letter pairs, then scientific; the first appearance of each suffix is a milestone, the Googol a
fanfare.

**What never scales:** the particle cap, the number of moving groups, the HUD, the ceremony lengths. Escalate by quality: bigger
and fewer shards, deeper sounds, richer tool materials, faster counter rolls.

### 5.12 Pacing targets and the calibration

The full model already runs **4–5× too fast** with every W2 system on (600 m in 4–5 min; four `it.fails` in
`tests/unit/idle/days.test.ts`). The curves stay. A **node-paced bot** (`src/idle/sim/nodeBot.ts`) is built before any table is
touched. It taps 4/s at faces (or holds), harvests chambers to 80 % (all specials and lamps, half the skin), takes 50 % of second
stands, reads notes, pulses at the first draft [W2], picks roads at random [W2], buys BEST when affordable, models every glide,
ride and ceremony time from §3, models the leash and the Works, and runs the session model (one 40-minute session, then 6 minutes
every 2 h, offline at 50 %).

| Milestone | Target (est.) |
|---|---|
| first purchase / first hire | ≤ 15 s / ≤ 40 s |
| first breakthrough (Root Cellar, 5 m) | 0:35–0:55 |
| the Halden Hatch (40 m) | 5:30–6:45 |
| the Glowroot Vista | 11–14 min |
| the Root Knot / Crystal Grotto (120 m) | 15–19 min |
| Halden Works (240 m) | 28–36 min |
| Ember Shrine, first Rekindle (600 m) | 45–60 min |
| first wall (Frost Hollow, 1,800 m) | > 2 h |
| taps per block p50 (first 45 min) | ≤ 4 |
| longest gap between completions (first 30 min) | ≤ 30 s |
| chamber gold share of run gold | 25–35 % |
| auto-delve stops | ≥ 1 per 2 chambers |
| Rekindle chains (runs < 3 min in a row) | none over 7 days (E9) |
| side multipliers by day 3 | ≤ ×10 (E25) |

**Knobs, in this order:** K per biome; `CHAMBER_EQ`; the leash base; the side multipliers (E25 first); the 25 in the Ember
formula. Never the HP curve first. The four `it.fails` stay honest until the bot passes them.

### 5.13 The week (est., re-run with the bot)

| When | What the player does |
|---|---|
| 0–10 min | taps drifts, lights chambers, the first relic, the Hatch, the Glowroot reveal, the Pulse, the first road |
| 10–60 min | the Rootheart Vista, the Root Knot, Crystal Grotto, Halden Works; the Mine Cart and Steam Drill frame the face; roads and secrets become the game; the first Rekindle at the Ember Shrine |
| day 1 | 4–6 Rekindles; crews bore seen drifts before you arrive; Magma Veins and Fossil Halls; the first vaults; the camp's lantern tower |
| days 2–3 | the first Weave; Frost Hollow, the Loom, Iron Core; chamber sweeps; Codex pages complete |
| week 1 | the Gate and Breach; Echo strata with mutators (new: **Braided**, forks every 2–3 chambers with 3 roads); Cartographer and Lamplighter tiers; relic grade hunting |

---

## 6. The objective, the tutorial, the hints

### 6.1 The objective line (always shown, L5)

- **Where:** HUD row B, in every frame of play, including during sheets, rides, ceremonies and the seal fight.
- **What:** an icon, one line ≤ 32 characters, a 4 px fill, a reward icon, an ETA only when meaningful. Its target in the world
  wears **the single amber rim**: a calm, static, constant-width edge (never pulsing).
- **Tap it:** go where the goal is done: open the right sheet at the right card, or brighten the target's rim for 0.6 s.
- **Rules:** re-evaluated every 0.5 s; the first match wins; it holds ≥ 4 s unless done; on completion the reward flies and
  the fill morphs into the next goal without emptying; median fill ≥ 0.55 (E12 of the idle SPEC).

### 6.2 Selection (`goals.ts`, adapted)

1. a tutorial step or lesson (§6.3–§6.4);
2. something to claim (the return haul, a finished Path step);
3. a seal within 2 chambers: "Break the Root Knot · 2 chambers", which becomes the fight's HP and timer;
4. Rekindle or Weave recommended [W3]: "Rekindle: +273 Embers · ×6.5";
5. a manual feature in this chamber: "Open the chest", "Read the note", "Relight the lamps · 1/3", "Choose a road" [W2],
   "Pry the keystone" [W2];
6. a ready Pulse with a draft in view [W2]: "Raise your lantern";
7. the current **Path** step if its ETA ≤ 120 s or progress ≥ 50 %;
8. the biome's keystones [W2]: "Root Knot · keystones 1/3";
9. the best near goal: the next ★, a gear card, a crew blueprint, a Feat tier [W2], the next rank;
10. fallback: "Break through · N m" (always ≤ 30 s away in a drift) or "Go deeper" (in a harvested chamber).

**Path** (30 authored steps, `config/path.ts`): creature steps replaced: "Catch a creature" → "Relight 5 lamps"; "Catch the Lucky
Moth" → "Catch the ember" [W2]; new steps "Break through", "Chart a chamber", "Grade a relic Fine or better", "Pulse the
lantern" [W2], "Find a secret" [W2], "Choose a road" [W2], "Find a keystone" [W2].

### 6.3 The tutorial: six steps taught by doing (`tutorial.ts`, a pure step machine, rewritten)

Rules: one verb at a time; one line ≤ 8 words; one amber rim on the thing itself; no modal, no OK button; nothing pauses; it
cannot be failed. The ghost hand (a 36 px static brass outline of a thumb) appears only for step 1, after 4 s without input.

| # | Step | Where | Line | Done when | Fallback |
|---|---|---|---|---|---|
| 1 | **Tap** | the adit plug: a 7-block face of soil and roots, the centre block rimmed | "Tap the rock" | the first block breaks (HP 100 = damage 100: the first tap always breaks) | ghost hand after 4 s, once |
| 2 | **Buy** | 30 gold: the Pick card rises (the only card so far), rimmed | "Upgrade your pick" | bought | the rim brightens after 8 s; after 2 fallbacks it buys itself |
| 3 | **Light** | the last slice of drift 1 leaks dusk light; then the chest in the Root Cellar's lantern pool | "Tap the light" → "Tap the chest" | the breakthrough, then the chest opened | rims brighten after 6 s; a first-time card at 12 s |
| 4 | **Go** | the Root Cellar's rope ladder, rimmed once the chest is open (or after 20 s) | "Go deeper" | the Way Down ride taken | the rim brightens after 8 s |
| 5 | **Hire** | 50 gold: the BEST card appears with the Shovel Hand | "Hire a Shovel Hand" | hired | after 2 fallbacks the BEST rim stays |
| 6 | **Hold** | a face, ≥ 40 s after step 5 | "Hold to keep digging" | 1.5 s of hold | shown after 6 taps on that face; a static ring under the thumb (never a pulsing donut) |

If the player does a step before its prompt (e.g. hires from the BEST card on their own), the prompt is skipped.

### 6.4 Lessons and the spacing rule (L13)

Everything after the six steps arrives as an objective line plus one 2.5 s first-time card **at the moment it first matters**.
The **tutorial sequencer** holds a lesson until (a) no other prompt is on screen and (b) the spacing allows it: ≥ 40 s after the
previous new mechanic before 3:00, ≥ 60 s after 3:00 (the opening pair, tap and the Pick card, is exempt).

| Lesson | Earliest | Line | First-time card |
|---|---|---|---|
| Lamps and charting | the Lamp Room (C3) | "Relight the lamps · 0/2" | "Light every lamp to chart the chamber" |
| The relic ring | the Reliquary niche (C4) | "Grade the relic" | "Hold, then let go on the gold" |
| Dynamite | 30 m | "Use Dynamite" | "Dynamite blasts 3 slices · cools 60 s" |
| The seal | the Lift Bottom (C6) | "Break the hatch! 0:30" | "Hit the padlock when it glows" |
| Gear | after the reveal | "Buy a gear card" | "Gear: one tap, a big boost" |
| The Pulse [W2] | a Glowroot chamber with a draft (the meter pre-filled for the lesson) | "Raise your lantern" | "Your lantern shows what hides" |
| Roads [W2] | the first fork | "Choose a road" | "Each road keeps its promise" |
| Keystones [W2] | the first keystone | "Pry the keystone" | "Three keystones open the Root Knot" |
| Auto-delve [W2] | after the Root Knot | "Hold the exit to delve" | "Holding the exit carries you on. It stops for treasure." |
| Events [W2] | session 2 (≥ 11 min) | per event | one per event type |

Contracts, the daily chest, the Royal Chest key, the second fork, the Chart and the Codex sheets all wait until session 2
(≥ 11 min of play) [W2].

### 6.5 Hints and first-time cards

- **Hints** (one at a time, each at most 3 times in a lifetime, never over the face): a still rim on the best target after 6 s
  without a tap; BEST pings once if affordable and unbought for 15 s (suppressed while a full lantern breathes); a draft in view
  with a full lantern for 8 s [W2]; nothing left in a chamber rims the exit; an unvisited survey ring rims after the chamber's
  near tappables are done.
- **First-time cards:** one opaque plate under the objective line for 2.5 s, no button ("NEW · Copper: worth more"). Every card
  is listed in the Codex under Guide [W2].

---

## 7. Storyboard: the first ten minutes on a phone

Times are design targets at 3–5 taps a second (est.; the bot and the device test confirm). Topsoil drifts are 5, 6, 7, 7, 7, 8
slices (C1 at 5 m … C6, the Seal hall, before the gate row at 40 m); Glowroot K = 7. **M** = a new mechanic (L13). Items
marked [W2] are not in the W1 slice.

| Time | Depth | What the player sees and does | New | Objective line |
|---|---|---|---|---|
| 0:00 | surface | First launch skips the menu. Dusk at the Halden camp, seen in first person; the wordmark's lantern-O becomes the flame in your hand (0.9 s). The timbered adit is blocked by a plug of soil and roots; its centre block wears the amber rim | **M1** tap; lantern and Rusty Pick in view | "Tap the rock" |
| 0:03 | 0 m | One tap, one break: clods tumble into the lantern pool, a soft *tock*, one coin arcs to the gold plate, which fades in | gold | "Break through · 5 m" |
| 0:08 | 1 m | 5 blocks down, the rest crumble; the view steps 1 m in; the depth plate fades in | depth | — |
| 0:12 | 2 m | 30 gold: the Pick card rises, rimmed. One tap: the pick flexes; the next block breaks in one hit | **M2** the Pick card | "Upgrade your pick" |
| 0:30 | 4 m | The last slice leaks dusk-blue light through hairline cracks; a hollow knock; dust sifts down | the breach | "Tap the light" |
| 0:40 | 5 m | **First breakthrough.** The wall falls inward; the view glides in; first light rises. **The Root Cellar:** a sky shaft drops dusk light through hanging roots onto Halden shelves; a Wood chest on a crate in your lantern pool, rimmed; three amber root-knot veins on the left wall; two cold lamps | **M3** breakthrough, first light, the chamber | "Tap the chest" |
| 0:48 | 5 m | Focus pop: the chest rises to you. Tap: an honest roll-up Wood → **Copper**, 2 gems, gold | gems | — |
| 0:55 | 5 m | The veins, 2–3 taps each; a stray tap chips the wall skin and a pocket spills a nugget | harvest, skin | "Tap what glows" |
| 1:20 | 5 m | The rope ladder is rimmed. Tap: the Way Down ride (1.8 s) toward a lamp below | **M4** the exit | "Go deeper" |
| 1:25 | 6 m | Face 2. Two blocks glint copper ("NEW · Copper: worth more", 2 s) | ore | "Break through · 6 m" |
| 1:45 | 11 m | **C2, the Copper Lode:** a broad copper vein across the right wall; on a ledge, the first gem cluster beside a faint survey ring (optional) | content | "Tap what glows" |
| 2:00 | 11 m | 50 gold: the BEST card appears: Shovel Hand. Hire him: he climbs down the ladder past you, his small lamp swinging, to the next face | **M5** the crew | "Hire a Shovel Hand" |
| 2:20 | 12 m | Face 3: the Shovel Hand works the lower-right block on a slow beat | — | — |
| 2:40 | 13 m | After 6 taps: "Hold to keep digging". The thumb rests; a thin brass ring closes; the pick settles into its beat and bores into the block behind | **M6** hold | "Hold to keep digging" |
| 2:50 | 15 m | Shovel Hand level 10: the first ★ (the card flips, "×2"); NEXT ★ becomes the buy mode | ★ | "Get a ★" |
| 3:00 | 18 m | **C3, the Halden Lamp Room:** a lamp still burning on a crate after all these years, a note under it. Tap: "Day 40. Lamp seen below the lift. Nobody of ours is down there." | lore, the mystery | "Read the note" |
| 3:40 | 18 m | Two cold lamps; one across the room by a survey ring. Relight the first (*whoomp*), tap the ring (a 1.0 s glide), relight the second: the room warms; a brass check: **charted**, +1 gem | **M7** lamps, survey ring, charting | "Relight the lamps · 0/2" |
| 4:00 | 19 m | The Pick Crew blueprint (16 m): two miners take the upper-right scaffold, alternating swings | crew line 2 | "Hire the Pick Crew" |
| 4:40 | 25 m | **C4, a Reliquary Niche:** a relic on a plinth in a cyan-lit alcove. Focus pop, hold, the ring closes, release on the gold: *Halden Compass · Fine*, 5 gems | **M8** the relic ring | "Grade the relic" |
| 5:40 | 30 m | In drift 5 a dynamite crate appears on the rack in the lower-left nook, rimmed. Tap: three charges hiss into the face, one deep thump, 3 slices gone, a 3 m step | **M9** Dynamite | "Use Dynamite" |
| 6:00 | 32 m | **C5, a Cache:** a Copper-floor chest among collapsed crates; green light leaks from below through cracks in the floor ahead | the tease | "Open the chest" |
| 6:40 | 40 m | **C6, the Lift Bottom:** the dead Halden hoist cage, chains, the **Halden Hatch** in the floor, looked down on at −35°. A 30 s ring in the objective; the drum layer; the padlock glows every 5 s (×5); at 25 % the finisher needle | **M10** the seal | "Break the hatch! 0:30" |
| 7:00 | 40 m | The hatch splits (60 ms hit-stop, the 0.4° shake). The planks fall into green light; the camera drops 3 m onto a root balcony. **Reveal: the Glowroot Caverns.** Root threads brighten as your lantern passes; the title carved in light; far below, a warm point of light that is not yours: **the Other Lantern** (≤ 3 s) | biome 2, the mystery | — |
| 7:05 | 40 m | The Copper Pick: the tool in your hand turns copper in a ≤ 1.2 s form ceremony (queued after the reveal) | tool form | — |
| 7:40 | 41 m | 4 gear cards arrive: one badge on ≡. The Mine Cart blueprint | **M11** gear | "Buy a gear card" |
| 8:10 | 47 m | Glowroot G1, a Glow Gallery: the Mine Cart's rail appears in the drifts; carts roll in and out on the crew bar | carts | "Hire a Mine Cart" |
| 8:40 | 54 m | G2: a draft of lit motes drifts toward a root curtain. The lantern is full (pre-filled for the lesson). Tap the lantern: a ring of warm light rolls out; a Halden stash glows behind the roots (Copper chest); Surge ×3 for 10 s [W2]. *(W1 slice: G2 is a Root Hall with a second stand and the first chalk arrow, M12.)* | **M12** the Pulse [W2] | "Raise your lantern" |
| 9:40 | 61 m | G3: **the first fork.** Left: warm gold glints beyond (Vein Road). Right: cyan chalk on the lintel (Builders' Road). One tap chooses [W2] | **M13** roads [W2] | "Choose a road" |
| 10:00 | 68 m | Vein Road: a scripted Golden Vein in the next drift. Builders' Road: a Halden note and a relic niche [W2] | — | — |
| 10:40 | 75 m | The confluence: in a niche, a cyan keystone. Pry it out; it flies to the objective: "Root Knot · keystones 1/3" [W2] | **M14** keystones [W2] | "Root Knot · keystones 1/3" |
| ~11:00 | — | Session-end hook. If the phone locks, the crew digs on, up to 3 dark chambers ahead; the next launch opens on the return glimpses and a dark mouth waiting for your lantern. The Rootheart Vista and the Crystal Grotto are still ahead, unseen | — | "Root Knot · keystones 1/3" |

**Check against the demands and the laws:**
- New mechanics at 0:00, 0:12 (the opening pair), then 0:40, 1:20, 2:00, 2:40 (≥ 40 s apart), then 3:40, 4:40, 5:40, 6:40,
  7:40, 8:40, 9:40, 10:40 (60 s apart). Never two prompts at once (L13).
- Something completes at least every 30 s and something new arrives at least every 60 s (L4).
- The 3D world is in view every second; every input is a tap or a hold; no creature appears; one ceremony at a time.
- Two biomes seen, the third (Crystal Grotto) and the first Vista teased, not spent.

---

## 8. Art direction: the answer to "horrible, glitchy, illegible"

**The look in one line:** a lantern pool of warm light on faceted, hand-made-looking stone, the next treasure glinting in the dark
ahead, and everything else quiet.

**The meta-rule above every rule here:** the director's phone is the reference display. Every look round ends with an APK and
three screenshots taken on the phone, read at arm's length in daylight. Desktop captures never pass a look round alone.

### 8.1 Verdict → cause → rule → test

| The director's word | What caused it (`look.md` §1) | The rule | Test |
|---|---|---|---|
| **Horrible** | pixel textures smeared on sculpted rock (v1); flat glowing sticker tiles on a cut plane (the APK); one muddy brown-grey value | **No textures on the world.** Faceted low-poly rock, vertex colour, baked vertex AO; valuables are 3D objects in the rock; shape and light carry material | sampler lint; streak detector; every valuable's silhouette ≥ 6 edges (C1) |
| **Glitchy** | seams between two painters; billboard vistas with floating crates; an orb inside rock; near-plane slivers; a permanent sway crawling edges | **Geometry hygiene and stillness:** one material path per surface; no billboard visible as a card; no sprite drawn through rock; a near-plane guard; vertices stable when a neighbour breaks; a still camera gives still pixels | ID-buffer flicker check; sprite occlusion; ≤ 2 % pixel change outside a break's footprint and debris; idle ΔL ≤ 0.01 (C2, C5) |
| **Animations far too present** | 240–650 particles, a shock ring and shake on every break, chroma, iris wipes, ±0.6° sway, a 450 px pulsing tutorial donut, ten things competing | **A hard motion budget** (§8.7–§8.8): ≤ 3 foreground groups, ≤ 2 ambient, ≤ 80 particles over ≤ 6 % of the screen; zero camera motion on strikes; one ceremony at a time; no post theatrics; one UI loop | the FX director counts and asserts; view matrices identical over 100 strikes; a lint forbids iris, shock, chroma and rays (U-FX1–3, C6) |
| **Illegible** | exposure 1.85–2.6×, boosted saturation, bloom from 0.85; a third of the screen glass HUD; small text; no focal point | **One value peak per frame, on the tap target;** exposure 1.0 ± 0.15; bloom threshold ≥ 1.0; opaque plates ≤ 17 % of the area; ≤ 5 numbers; body text ≥ 15 sp | peak ≥ 1.6× frame mean; 25 % grayscale squint test < 1 s; DOM HUD measure (C4, E21) |
| *(v1)* **Empty, nothing indicated** | empty floors, no guidance, the body hiding the path | the fill contract from every stand; the objective line; one amber rim; no body | fill-scan from stands; objective in 100 % of frames (U-W5, E21) |

### 8.2 The look: "Lamplit Faceted" (decided; the director confirms on day 0)

**Evidence from the look spikes** (task #81; sheets in
`/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/spikes/`):

| Spike | What it showed | Cost measured (spike reports) | Verdict |
|---|---|---|---|
| **Faceted diorama** (`crystal/sheet.png`; code in `.claude/worktrees/wf_cd9faf19-b99-1/deep-down/src/spike/`) | clean faceted stone with a soft vertical gradient per facet, faceted crystals, embedded gold nuggets as objects, a bevelled chest, a calm frame with one focal area | 20 draw calls, 18.5k triangles, 8 programs at the arrival scene (`crystal/final-report.json`) | **primary** |
| Lantern Voxel (`lantern/final-sheet.png`) | strong lantern light, but block grids and painted cell patterns read as tiles, and heavy cost | 25–62 draw calls, 62k–294k triangles, a 10.4 s paint pass (`lantern/final-info.json`) | fallback, and the bevel language for masonry |
| Storybook (`storybook/sheet.png`) | the softest, warmest grade; rounded blocks read as toy tiles; weak stone | — | take its **grade** (lifted warm mids, coloured fog), not its geometry |

**Decision:** Faceted geometry + Storybook grade + Lantern-Voxel bevels on built things (masonry, timber, machines). If the
director picks another spike on day 0, only the material and mesher files change (BUILD.md seams hold). All three spikes used
rounded pill cards and a sans-serif face: that HUD is **off-brand** and is not adopted (§8.9).

**From Lumi Master** (restraint only, §0.5): few tones per form, warm lifted mids, one focal object per beat, forward motion into
the picture, short reward beats. Before the grade is locked, a person spends 20 minutes on the trailers listed in
`research/lumi-master.md` §5.9 and notes three things: tone steps per form, fog or not, HUD area (BUILD.md day 0).

### 8.3 Light

- **Key: the lantern.** A point light at the viewmodel lantern (≈ −0.30, −0.45, +0.35 m from the eye), `#ffe6c6` at the core
  shifting to amber `#ffb35c` with distance; windowed inverse-square falloff, radius 9 m (+0.6 m per lantern tier); a ring-shaped
  pool on the floor. A mid-albedo face at 1.5 m reads 0.65–0.75 display value. Held low and left, it gives faces a lit
  upper-left and a shadowed lower-right; it is never a camera flash. From the Gallery bore class, floodlamps take the key on the
  face [W3].
- **Fill:** cool hemispheric at 20–35 % of the key. Darks are biome-tinted, never brown, never below 0.04 display over large areas.
- **Rim:** one per space, the next chamber's or the next biome's accent from the far end; **in a drift the rim comes through
  the breach**, so the tease is light.
- **Practicals:** the 4 nearest lamps are lit per pixel; all others are baked into vertex colour or sampled from the LightField.
  Every cold space keeps one warm lamp; the crew hangs lamps behind you.
- **First light:** a per-chamber fill uniform 0.6 → 1.0 over 1.2 s (§4.6). **The Pulse ring:** a shell term in the lantern
  lighting function (§4.8).
- **Shading:** wrapped Lambert (wrap 0.3) quantised softly into 3 steps (smoothstep width 0.08), times vertex colour, times AO
  (0.5–0.7). Specular only on metal, crystal, ice and wet stone: one value-capped Blinn lobe. No SSAO, no shadow maps on Balanced.
- **Grade and post:** exposure 1.0 ± 0.15 per biome (raise the lights, never the exposure); saturation ≤ 1.0; bloom threshold
  ≥ 1.0 linear, strength 0.15–0.25, 3 levels from 1/4 resolution (off on Battery); one 32³ LUT pair per biome; vignette 0.15;
  dither. **No** chromatic aberration, lens flare, grain, motion blur, iris, shock rings, rays, bloom pulses.
- **Emission:** ≤ 4 % of the frame in a dig beat, ≤ 10 % in a Vista.

### 8.4 Palette, the colour script and the node colour language

**Global rules** (each measured on captures): 60 / 30 / 10 (cool dark stone 0.05–0.25 / warm lantern-lit mids 0.30–0.65 /
≤ 10 % accent at saturation ≥ 0.6); host stone saturation ≤ 25 %; two accents per biome plus amber everywhere; darks hued; one
value peak per frame; red only for danger (magma is orange-yellow); neighbouring biomes alternate low key and high key; never
neon (no full-saturation, full-value area > 0.5 % of the frame).

**The colour script** (`research/look.md` §4.4, adopted as written; hues continue `config/biomeLooks.ts`):

| # | Biome | Key | Darks / fog | Accents |
|---|---|---|---|---|
| 0 | Topsoil Roots | mid | blue-dusk / `#2a2a33` | amber `#ffb35c`, sky shaft `#9fc3e6` |
| 1 | Glowroot Caverns | low | green-black / `#142226` | `#9be7a8`, `#5fe0c0` |
| 2 | Crystal Grotto | low, cyan rim | blue-black / `#1e2a3a` | `#2fb6cc` / `#8fe3ee`, violet gems |
| 3 | Halden Works | mid, warm | warm black / `#231a12` | brass `#e2b673`, steam `#6fd6c4` |
| 4 | Fungal Deep | low | violet-black / `#1a0f22` | `#c58cff`, `#a8ff6a` (decor glow only) |
| 5 | Drowned Ruins | mid-low, wet | blue / `#0a2236` | `#5fb7ff`, braziers `#ff9a48` |
| 6 | Magma Veins | high contrast | red-brown / `#2a140c` | `#ff6a2a` → `#ffc04a`, an underlight |
| 7 | Fossil Halls | high | warm umber / `#221e1a` | resin `#ff9a2a`, `#c0b4ff` |
| 8 | Frost Hollow | high, cold | steel blue / `#1a2a3a` | `#7fd8ff`, `#9dffd8` |
| 9 | the Loom | mid | violet / `#1e1c18` | `#fff4d0`, `#b9a2ff` |
| 10 | Iron Core | low | blue-steel / `#141820` | `#8fb8ff`, white-hot `#ff7a2a` |
| 11 | Star Heart | high, inverted | star glass / `#3a2a10` | `#fff1c2`, `#ff8ac8` |
| 12 | Void Sea | lowest | near-black violet / `#0c0820` | `#7a6cff`, `#d8e0ff` |
| 13 | the Gate | low | rune stone / `#1a1226` | rune cyan against amber, gold `#e2b673` |

**The node colour language** (a colour always means the same thing: in the breach leak, the road light, the chest band, the
exit plate icon):

| Colour | Meaning |
|---|---|
| **Amber** `#ffb35c` (`amber400`) | you, your lantern, your crew and their lamps: "you are here" |
| **Warm gold** `#e2b673` (`brass300`) | treasure: a Cache, a Lode, a Golden Vein, the Vein Road |
| **Rune cyan** `#2fb6cc` / `#8fe3ee` (`rune400`/`rune200`) | the builders: relics, notes, keystones, secrets, the Builders' Road, carved script |
| **Brass** `#c99a52` | the Works: a Depot, the Works Road, the crew's machines |
| **Violet** `#b9a2ff` (`deep300`) | unknown or sealed: a vault, the Unknown road, a seal, a locked thing |
| **Dull fog** (no hue) | a plain Gallery |
| **The biome's far light** | wonder: Vistas, Thresholds, the next biome |

Chest tiers keep `RARITY` (bone, copper, rune, deep violet, the mythic amber-brass); a chest's band shows its floor tier before it
opens; the roll-up is honest, with no near-miss.

### 8.5 Materials

| Family | Geometry | Colour | Never |
|---|---|---|---|
| Natural rock | flat-shaded facets of 0.25 m near the eye, 0.6–1 m on far walls; jittered vertices deterministic per world position (stable when a neighbour breaks); strata as real 0.1–0.3 m ledges | vertex colour from the biome's 5-stop ramp by stratum, height and low-frequency noise; 3-step shading; AO | texels, painted patterns, painted cracks |
| **Face blocks** | instanced irregular fracture plugs, 6–10 variants per rock family, a jittered front of 8–14 facets of 0.2–0.35 m, chamfered edges, per-instance rotation and mirror so no neighbours match; joints 4–6 cm read as natural cracks (AO to ≈ 0.35 of the lit value) | as rock, with the slice and stratum in the ramp | a regular grid; square or hexagonal tiles; glowing tiles |
| Cracks | procedural grooves in the block shader radiating from stored tap points, 3 stages, resolution-free | dark grooves, a warm hit light ≤ 80 ms | decals that stretch |
| Ores | instanced 6–20 cm angular nuggets, 3–12 per block or vein, half sunk | one crisp metal highlight; the tier glint colour on the highlight only | a coloured square |
| Gems, crystals | instanced 6–8-sided prisms in clusters of 3–9 | opaque body, fake inner glow ≤ 1.5 HDR, edge highlight | alpha glass |
| Chests, relics, notes, keystones, lamps | authored bevelled models (chamfer 0.02–0.04 m), brass bands, a lock plate | wood and brass vertex colour; the amber rim only when it is the suggestion | a glowing tile |
| Timber, rails, carts, crates, machines | bevelled boxes and lathed cylinders (v1 props, `StructureRenderer`) | 2–3 grain stripes; value-capped specular | — |
| Masonry, seals | real blocks in courses (Lantern Voxel language), gaps 1–2 cm | ±6 % value per block; joints in AO | painted courses |
| Runes, builders' script, chalk marks | carved grooves 2–4 cm deep, emission only at the bottom; chalk as a thin raised stroke | rune cyan; chalk bone-white, dimmer than the suggestion | floating flat strokes |
| Fungal caps, roots (decor) | low-poly caps and tubes | underglow ≤ 1.2 HDR, never brighter than an ore highlight | being tappable |
| Shards | BSP fracture of the broken variant | the parent's vertex colour, lit by the scene | section-painted shards |

### 8.6 Composition per shot

- **Drift:** the face is the single brightest large area: ≥ 1.6× the frame mean and ≥ 1.3× any other window of its size; its
  blocks inside 27–68 % of the height and 7–93 % of the width; ≥ 4 depth cues; second-slice blocks behind holes ≤ 0.65× the
  front's lit value.
- **Stand:** the current suggestion (the feature, a lamp, the exit) is the brightest; other tappables ≥ 20 % dimmer; the wonder
  in the top third, lit by its own practicals, never brighter than the suggestion; the window composition on arrival.
- **Breakthrough, Threshold, Vista:** a dark cool frame covering 30–40 %, a lit middle ground, a glowing far plane; the light
  widens through the crack; nothing explodes.
- **Seal:** the weak point is the frame's peak whenever it is lit; between lights, the seal's largest face is.
- **Before any kit is produced** (W1 world gate): captures from 10 stands of the Topsoil and Glowroot kits prove the chambers do
  not read as keyholes (C3).

### 8.7 The FX budget (hard caps; the FX director asserts them in CI)

| Budget | Drift or chamber beat | Ceremony (one at a time) |
|---|---|---|
| Foreground and HUD moving groups | **≤ 3** (tool, one debris burst, one loot stream or counter roll) | ≤ 3, owned by the ceremony |
| Ambient groups | **≤ 2** (the crew on its shared bar *or* a cart; the motes *or* the chamber's one slow wonder animation) | 0–1 |
| Live particles | **≤ 40 per burst, ≤ 80 total** (High ×1.5, Battery ×0.5), lit by the scene, darker than the face, ≤ 32 px each | ≤ 120 |
| Particle screen area | **≤ 6 %** | ≤ 12 % |
| Particle life | 0.25–0.6 s | ≤ 1.2 s |
| Shards | 6–9 per block, 10–16 per breakthrough, ≤ 36 live | ≤ 60 (a seal) |
| Camera motion from FX | **0** | one 0.4° / 120 ms shake: a seal, Dynamite, a vault door only |
| Hit-stop | 0 on strikes, breaks and breakthroughs | 50–70 ms: a seal and a vault only |
| Flashes | local only: the struck facet +0.4 for ≤ 80 ms | one 0.12 full-frame lift ≤ 150 ms when a seal opens |
| Post effects (shock, iris, chroma, rays, bloom pulse) | **none** | **none**: use light |
| Floating numbers | **≤ 1** (a cart's haul) | the ceremony's own |
| UI loops | **≤ 1** (a full lantern breathing *or* a ready card's single ping) | 0 |

| Ceremony | Length |
|---|---|
| Breakthrough | FX ≤ 1.2 s, plus the glide |
| Chest roll-up | 0.25 s per step, ≤ 1.2 s |
| Relic ring | 0.9 s, plus a 0.6 s turntable on a first find |
| Pulse [W2] | the 1.5 s ring |
| ★ | 0.6 s on the card and a rig's helmet lamp |
| Tool form | ≤ 1.2 s |
| Seal | ≤ 1.2 s, then the Reveal ≤ 3 s |
| Return | ≤ 3 s |

Any new cue must name the group it replaces. Escalation is by quality, never by quantity.

### 8.8 Maximum moving elements (the stillness contract)

- **At rest** (0.6 s after the last input): the screen is still except ≤ 2 ambient regions; mean ΔL ≤ 0.01 elsewhere (C5).
- **Per tap:** pixels changed outside the struck block's footprint and its debris ≤ 6 % in a drift, ≤ 8 % in a chamber (C6).
- **Viewmodel:** still at rest and during glides.
- **HUD:** animates only on a state change: enter = 8 px rise + fade over 160–240 ms; exit = 140 ms fade; a counter pops 160 ms
  when tokens land. A card's ready ping at most once per 3 s.

### 8.9 UI calmness and the HUD ("Lamplight on the Lintel" in first person)

1. **The world dominates.** HUD plates cover ≤ 17 % of the screen area. At 390 × 844: top plates y 47–123 (row A 40 px:
   depth plate, gold plate, ≡; row B 32 px: the objective line), bottom cards y 746–810 (64 px). The bands sit in the lens's most
   stretched zones anyway.
2. **Plates:** opaque octagon plates (`CUT.panel` 9 px corners), slate-900 at `PANEL_ALPHA` 0.94, a brass rim, Lintel numerals
   (`lintelFont.ts`). No glass, no blur, no pills, no rounded rectangles. (The spikes' rounded cards are not adopted.)
3. **Numbers:** ≤ 5 persistent (depth, gold, the objective's number, the two card prices) plus at most 1 transient (the rate
   under gold for 3 s after a purchase or on return; a seal timer inside the objective).
4. **One of each:** one objective line, one hint (the static amber rim in the world), one first-time card, one badge. Never a
   ribbon, a dot, a pulse and a ring on the same card (`peek-2`).
5. **Text:** body ≥ 15 sp, labels ≥ 13 sp, never under 12 (`TYPE`); contrast ≥ 4.5:1 on an opaque plate, never on the 3D scene.
6. **Sheets** cover the bottom ≤ 55 % and dim the world 30 %; the world keeps playing without effects; the objective stays.
7. **Two registers, never mixed:** the expedition kit (amber and brass) for what you own and do; the builders' script (cyan) only
   for discoveries and lore; violet for locked; red for danger only.
8. **The HUD never shakes, flashes or moves with the camera.**
9. **The diegetic first:** the Pulse gauge is the lantern flame, the combo is the tool's heat, skills are tools on the rack, the
   next find is a glint, the next drift's state is the exit plate. The HUD keeps only what the world cannot say.
10. **Accessibility:** motion levels, shake slider, flashes setting, left-handed mirror, large text, high contrast.

### 8.10 Readability tests (automatic; `tools/hybrid-capture.mjs` + `tools/png.mjs`; 390 × 844 at DPR 2, Balanced, every authored stand and 200 generated stands per biome)

| # | Check | Pass |
|---|---|---|
| C1 | No texels; valuables are objects | terrain programs sample only 1D ramps and one low-frequency noise; streak detector (horizontal luminance-edge autocorrelation over 40 px) under threshold; each valuable silhouette ≥ 6 edges |
| C2 | Geometry hygiene | no two IDs flickering on a pixel across 2 frames with ±1e-4 depth jitter; every sprite passes depth occlusion; contact test: no prop floats |
| C3 | Stand framing | from each of 10 W1 stands and every authored stand: the window composition on arrival (dark frame 30–40 %), the wonder in the top third, ≥ 4 tappables in frame |
| C4 | One value peak | the target's mean luminance ≥ 1.6× the frame mean and ≥ 1.3× any equal window; a 25 % grayscale thumbnail passes a human "where do I tap?" in < 1 s |
| C5 | Stillness | 0.6 s after the last input, mean ΔL ≤ 0.01 outside the ≤ 2 ambient regions |
| C6 | A tap stays local | pixels changed outside the struck target's footprint and debris ≤ 6 % (drift) / 8 % (chamber); view matrix identical before and after |
| C7 | Block size | every live front block ≥ 92 px on its short axis at rest at 360 × 740, 390 × 844, 412 × 915; ≥ 86 px during the creep |
| C8 | Clear face | no crew, rack or prop pixel inside a live block's tap bound (ID buffer); the 7 blocks inside 27–68 % of the height, 7–93 % of the width |
| C9 | Diversity | §4.12's thumbnail SSIM metric per biome |
| C10 | Not tiles | the face at 25 % grayscale reads as rock, not a board: block-edge straightness score below threshold and joint luminance variance above threshold (tuned on the spike captures); confirmed in the beauty rubric |
| C11 | Saturation and exposure | ≤ 10 % of pixels with saturation ≥ 0.6; host stone ≤ 0.25; clipped pixels (any channel ≥ 0.98) ≤ 1.5 %; emissive ≤ 4 % (dig) / 10 % (Vista); config lint on `biomeLooks` (exposure 1.0 ± 0.15, bloom threshold ≥ 1.0, strength ≤ 0.25) |
| C12 | Hit targets | every tappable's drawn silhouette ≥ 72 px, hit area ≥ 88 × 88 px, overlaps ≤ 20 %, inside 15–72 % of the height |
| C13 | Temporal stability | no world detail under 2 scene pixels at 1.5 m; AA always on |
| C14 | Breach honesty | the leak hue of the last 3 slices matches the chamber's promise class |

### 8.11 The beauty rubric (judged by eye)

Judged by the lead on the capture sheet **and** by the director on the phone at arm's length (three on-device screenshots per
round). Each criterion scores 1–5:

| # | Criterion | 5 looks like |
|---|---|---|
| 1 | **Focus** | the thing to tap is obvious in under a second, even squinting |
| 2 | **Light** | warm lantern against cool stone; the pool reads; nothing washed out or crushed |
| 3 | **Form and material** | rock reads as cut stone, ore and gems as objects, props as crafted things; nothing reads as tiles or stickers |
| 4 | **Depth** | foreground frame, lit middle ground, fogged far plane; ≥ 4 depth cues |
| 5 | **Fullness** | no empty stretch; something to discover in view; the chamber feels found, not generated |
| 6 | **Calm** | nothing distracting moves; the HUD is quiet; no clutter |
| 7 | **Brand** | Lamplight on the Lintel: amber, brass and cyan registers; octagon plates; Lintel numerals |
| 8 | **Wonder** | the frame makes you want to screenshot it (Reveal, Vista, first light, the Root Cellar) |
| 9 | **Cleanliness** | no glitch, seam, float, clip, sliver or sprite through rock |
| 10 | **Arm's-length legibility** | text, numbers and targets read on the phone without effort |

**Pass:** every criterion ≥ 3, mean ≥ 4.0, Wonder ≥ 4 on every Reveal, Vista and first-light shot; any 1 fails the round. The
shots judged each round: the camp at dusk; the plug face; a drift mid-dig (with crew); the breach leaking; the breakthrough
mid-glide; first light in the Root Cellar; the Copper Lode; the Lamp Room charted; the Reliquary niche with the ring; the focus pop
on a chest; Dynamite mid-blast; the Hatch fight; the Glowroot reveal; a Glowroot chamber; a dark mouth on return; the return plate;
a sheet open; reduced motion; the left-handed mirror; 360 × 740 and 412 × 915 variants of the drift and a stand.

---

## 9. Audio and haptics

Everything is synthesized (`src/audio/*`: synth, voices, sfx, MusicScheduler, drums, layers; kept and remapped through
`eventMap.ts`). Nobody has yet listened to it on a device: the device test (D5) does.

### 9.1 Music

- Per biome: the mode, root and tempo of `config/biomes.ts` (Topsoil D major pentatonic at 84 bpm, Glowroot D dorian at 86,
  Crystal E lydian at 76 …). Layers: a drone bed, a melody that plays sparsely, the drum layer that enters only for the seal fight
  and the Pulse's Surge [W2], the reveal motif (≤ 3 s) at each Threshold.
- Each slice cleared plays one note up the biome's pentatonic scale (resetting per drift), so a drift is a rising phrase that
  resolves on the breakthrough.
- Music ducks 6 dB under ceremonies; ambience ducks under the drift's crew bar.

### 9.2 Sound cues (new or remapped)

| Event | Sound | Notes |
|---|---|---|
| strike | a material *tock* (soil thud, slate clack, crystal ping, brick crunch, ice crack, metal clang), round-robin ±1 semitone | pitch +2 semitones per pierced block; a crit adds an overtone |
| block break | a crunch, then the clatter of shards 0.3 s later | — |
| slice crumble | a low grind and one pentatonic step | — |
| breach tells | a hollow knock replaces the *tock* in the last 3 slices; the chamber's ambience (water, hum, wind, a chime) leaks faintly | the promise is heard as well as seen |
| breakthrough | an air rush and a soft whump, then the chamber's ambience | 35 ms haptic |
| first light | a soft rising chord in the biome's mode, under 1.2 s | never louder than the strike |
| lamp relit | a soft *whoomp* and a brief flame hiss | charting: a small brass chime |
| Way Down | ladder creaks, rope, stair steps, a cage chain, per exit type | — |
| focus pop | a short lift whoosh; chest roll-up steps (one note per tier step) | honest: no fake-out sound |
| relic ring | a tightening brass tick; a bell on the gold band | — |
| Lantern Raise | a soft cloth-and-metal lift | — |
| Pulse [W2] | a swell, then the drum layer for the Surge | — |
| Dynamite | a fuse hiss, one deep sub-bass thump | 60 ms haptic |
| seal | the drum layer; the weak point's chime each time it lights; the split: a deep crack, then silence for 60 ms, then the reveal motif | — |
| crew | a soft shared beat on the 0.9 s crew bar; machines have their own loops at low level | never above the player's strikes |
| buy | a coin click; hold-to-buy plays a rising pentatonic arpeggio | — |

**Mix rules:** ≤ 12 simultaneous voices; the player's strike always wins priority; at most one ceremony sound at a time; no sound
louder than the seal split.

### 9.3 Haptics (`src/ui/haptics.ts`, rate-limited per kind)

strike 8–10 ms; block break 15–20 ms; breakthrough 35 ms; Dynamite 60 ms; seal weak hit 25 ms; seal split two pulses (40 + 60
ms); chest tier step 10 ms each. Strength setting Off / Light / Normal / Strong.

---

## 10. Save

- **`SaveSystem`** is kept as is (two-slot writes with checksums and a pointer flip, corrupt-slot fallback, refusal of newer
  versions). Settings stay in `deepdown.settings` and survive versions.
- **The world is a pure function of the seeds;** no voxel deltas are saved.
- **Save v4** replaces the run's `depth`/`rows` floor model with the node state, and drops creature fields:

| Section | Fields |
|---|---|
| run (new) | `lifeSeed` (in meta), `runSeed`; `node` (the player's node index); `phase` (`drift`, `chamber`, `ride`); `stand` (index) and `facing`; `digDepth` (the crew's dig front, = the model's depth) and its live rows (kinds and remaining fractions, as v3); `leashOpen` (dark chambers opened ahead); per chamber of this run: harvested bits, skin bits, lamps-lit bits, feature state; `rack` (≤ 10 chests, relics and keystones); `roads` taken this run [W2]; `keystones` found [W2]; `pulse` meter [W2]; `oil` [W2]; `works` (unharvested value behind you, as one Big) |
| run (kept from v3) | gold, goldEarned, pick, ups, lines, gear, skills, facets, runTime, dmaxRun, ghost, chests, seal (fight in progress), splits, counters |
| meta (new) | `seen` and `charted` (lifetime bitsets by node id, run-length encoded); `lamps` (legendary lamps found and their levels) [W2]; `fortune` (digits of lifetime gold, for the camp) |
| meta (kept) | embers, threads, sigils, record, sealsOpened, biomesSeen, gems, timeCrystals, finds (minus creatures), lore, biomeSeals, feats (Kindred → Lamplighter, reset to 0), secrets, marks, rank, records, planted |
| meta (dropped) | `bestiary`, `stats.creatures`, `lastUsed.creature`, the moth fields |

- **Migration v3 → v4 (decided):** keep the meta (gems, time crystals, Embers, Threads, Sigils, records, Feats minus Kindred and
  Moth Friend, Finds minus creature entries, lore, rank, settings); start the run fresh at the camp; show one notice once:
  "Your expedition was re-charted. Your finds, gems and rank are safe." v1 and v2 saves stay "legacy" (not loaded; the notice).
- **Autosave:** every 30 s, on pause and hide, after every purchase, on every node change, and after a chest, relic, keystone or
  seal resolves.

---

## 11. Performance budgets

Reference devices: **phone A** (2022 mid-range: Adreno 642L / Mali-G68, 6–8 GB) and **phone B** (3 GB entry: Adreno 610 /
Mali-G52), per `docs/device-test-protocol.md`. Presets Battery / Balanced / High (`Renderer.ts`, `QualityGovernor.ts`).

| Budget | Value |
|---|---|
| Frame rate | Balanced on phone A: **60 fps in glides and rides, ≥ 45 fps in dig beats** with a busy crew; phone B on Battery: ≥ 30 fps everywhere. Cut effects before frames |
| GPU frame (modelled, `tools/perf.mjs`, 390 × 844 @2.75) | ≤ 12 ms total; terrain ≤ 4.5 ms; bloom ≤ 1.0 ms; composite ≤ 1.9 ms |
| Draw calls | ≤ 120 (the face is 1–2 instanced draws; nuggets, crystals, lamps and props instanced; static geometry merged per chunk) |
| Triangles | ≤ 220k visible; 8–16 per m² within 3 m, 2–4 per m² on far walls |
| Lights | the lantern + 4 per-pixel practicals; everything else baked or from the LightField; no shadow maps on Balanced |
| Render scale | DPR capped at 2.0 (Battery 1.5); the scene at a dynamic 0.70–0.85 of that (sub-viewport upsample) |
| Anti-aliasing | MSAA 2× where the profile shows it is cheap, otherwise FXAA before the upsample |
| Main thread | no long task > 8 ms on the breach frame, the first-light frame or a lamp relight; first light is a uniform; chambers are generated and lit in the slab worker ≥ 2 drifts ahead |
| Workers | slab generation ≤ 25 ms per slab in Node (today ≈ 19.5 ms); meshing in 1–2 workers, nearest first |
| Memory | GPU ≤ 80 MB (`perf.mjs`); JS heap ≤ 150 MB after 30 min |
| Boot | cold start to the first tappable frame ≤ 5 s on phone A, ≤ 9 s on phone B |
| Input latency | the hit on screen in the next rendered frame after `pointerdown` (L1) |
| Battery and heat | 30 min on phone A at Balanced: no thermal throttle warning; ≤ 10 % battery (D4) |
| APK | ≤ 20 MB; offline; no INTERNET permission |

---

## 12. Architecture (summary; ownership and order in BUILD.md)

### 12.1 What stays (from `research/reuse.md`)

The pure idle model (`src/idle/**`); `core/*` (Big, springs, eases, RNG, noise, events); `VoxelWorld`, `raycast`; `RingWorld`
(minus the cut), the slab worker, loader and light; `LightField` and `LanternField` (its source moved to the viewmodel lantern);
the mesher, its pool and workers (section off; the facet pass from the spike); `ChunkRenderer`; `Renderer`, `PostFX` (iris,
shock, chroma, rays off), the LUT pipeline, `QualityGovernor`; `GpuParticles` (z planes removed), `Shards`/`fracture`/
`rigidBatch`; `PropRenderer` (with `raycast`), props and structures; set pieces (re-lit as real Vista geometry); `SealRenderer`
(Wardens removed); `Lanterns.ts` (planted, ghost, the Other Lantern); `CrewRenderer`'s figures and impact phases; the brand kit;
`layout.ts`, `TopBar`, `GoalBar`, `Card`/`QuickBuy`, `Sheet`, `FirstTimeCard`, `ReturnFeast`, `displayLedger`, `press`,
`Ticker`, haptics; the ceremony `Timeline`; audio; `SaveSystem`; Android; `tests/e2e/touch.ts`, `release.spec.ts`,
`apk-sim.mjs`, `perf.mjs`, `econ-sim.ts`, the Visual Lab. Mined from v1 (`9eb4166`): `ropeRide.ts`, `lockedVerticalFov`,
`MiningController.pick()`, `TapController`'s fat finger, `runeDoor.ts`, `generateWorld.ts`'s architecture vocabulary.

### 12.2 What is new

| Module | Role |
|---|---|
| `src/idle/model/nodes.ts`, `chart.ts`, `config/chart.ts` | the node state machine (player node, phase, stands), the leash and the Works, chamber tappables and skin as model entities, lamps and charting; the chart topology and contents with pity |
| `src/idle/sim/nodeBot.ts` | the node-paced bot (§5.12) |
| `src/world/hybrid/deepPath.ts`, `layout.ts`, `nodeStamp.ts`, `kits/*` | the spiral path, node placement and stands, slab stamping, chamber templates per biome |
| `src/render/facet/*` | the faceted mesher pass and the single surface material (ported from the spike) |
| `src/render/hybrid/DepthScene.ts` | the scene facade (the API of `DescentScene`, rewritten) |
| `src/render/hybrid/FaceRenderer.ts`, `ChamberProps.ts`, `Viewmodel.ts`, `NodeCrew.ts` | the instanced face, chamber tappables with the rim, the lantern and tool, the crew rigs |
| `src/game/hybrid/FirstPersonCamera.ts`, `NodeController.ts`, `HybridGame.ts` | the shots and motion law, the hit-test order, the game shell (from `IdleGame.ts` by copy) |
| `src/ui/hybrid/*` | the calm HUD: plates, the objective line, two cards, sheets, the focus-pop panel, the return plate |
| `src/debug/hybrid.ts` | `window.__DD__.hybrid` (§13.3) |

### 12.3 Changes to the pure model (all pure and unit-tested)

1. **Nodes** (`nodes.ts`): node id and phase; slice index in the drift; K from the chart; chamber tappables as entities with kind
   and HP multipliers; skin cells; lamps; harvested, skin, lit, seen and charted bits; stands. New bus events: `node:arrive`,
   `node:breach`, `node:firstLight`, `node:leave`, `chamber:harvest`, `skin:strike`, `skin:pocket`, `lamp:relight`,
   `chamber:charted`, `stand:move`, `focus:open`, `focus:close`, `ride:start`, `ride:end`, `drift:slice`, `drift:creep`,
   `lantern:raise`, `leash:full`, `works:haul`; [W2] `pulse:*`, `road:choose`, `keystone:found`, `draft:seen`, `secret:found`.
2. **Two positions:** the crew's dig front (the model's existing depth and rows) and the player's node. The **leash** stops crew
   damage at the breach row of the (L+1)-th unseen chamber ahead; the overflow becomes Works haul at 1.00 gold per damage (the
   offline "gallery gold" accounting). `offline.ts` gains the leash stop.
3. **The model's grottos go:** `breakthroughs()`/`isOpenRow()` (cutaway grottos) are replaced by the chart's node boundaries;
   gate rows stay (seals). `TUTORIAL_ROWS` and `tutorialRows.ts` become the six authored Topsoil nodes.
4. **Rig schedules** quantised to the 0.9 s crew bar (DPS unchanged).
5. **The Surge becomes the Pulse** [W2]: tap to fire; it waits when full; reveal plus ×3; oil pre-fill.
6. **Road salt** `rowKinds(runSeed ^ roadSalt, d)` with the Vein Road's EV bound [W2].
7. **The purge** (`research/reuse.md` §4, one pass, grep gate): `biomes.creatures`; the Lucky Moth → the Drifting Ember (same
   outcome table); `mothSwarm`, `treasureMole`, `mimic` → Seed Fall, Rattling Bricks, Wedged Chest; Warden ids → mechanism ids;
   `fossilGolem`, `voidMaw` → `boneRam`, `voidEngine`; the Bestiary, Kindred (→ Lamplighter) and Moth Friend (→ Through the
   Dark); the creature tappable; the "Inverted" mutator's creature clause; creature income in `sim/pacing.ts`; the strings.
8. **Codex** [W2]: 14 entries per biome (Finds, Lamps, Lore); relic traits and grades; Feats: Lamplighter, Cartographer, the
   new secret feats.
9. **Tutorial and goals:** the six steps and the lesson sequencer with the spacing rule (L13); the node goals; the Path changes.

---

## 13. Acceptance tests

Every claim of done needs its evidence: the test name and its output, the capture path and its metric values, or the device log.
Tests run in Node (Vitest) unless marked e2e. E2e runs the production build in headless Chromium with SwiftShader at **390 × 844**,
`hasTouch: true`, DPR 1, driven by **real touches through CDP** (`tests/e2e/touch.ts`); `window.__DD__.hybrid` only sets up states
and reads results.

### 13.1 Unit (Vitest)

| Id | Test | Pass |
|---|---|---|
| U-NC1 | `nodeController.test`: 1,000 seeded random touches over recorded drift and chamber frames | 0 touches resolve to "nothing"; every result is one of strike, relight, focus, navigation, skill, Pulse, tunk, raise |
| U-NC2 | focus-type objects need a direct hit; navigation targets are never fat-finger results | exact |
| U-NC3 | fat finger in a chamber resolves only when exactly one candidate lies within 48 px | exact |
| U-NC4 | the Pulse fires only under §2.4 (start on the lantern, meter full, ≥ 300 ms after the last world pointer) [W2] | exact |
| U-IN1 | `TapSurface`: 8 counted hits/s across pointers; hold 3/s → 5/s → 8/s in a Surge; 250 ms / 12 px | exact |
| U-CAM1–6 | §3.8 | exact |
| U-M1 | `nodes.test`: node ↔ depth determinism; K per biome; the six authored Topsoil nodes | exact |
| U-M2 | conservation: damage in = HP removed + Works haul + overkill, to 1e-12 | exact |
| U-M3 | L6 everywhere: face, skin (0.6×), veins, Works (1.00×) pay HP × goldPerHp × kind | exact |
| U-M4 | chamber specials: a player strike on a special pays ≥ 10× a crew strike at the same depth (median over seeds) | ≥ 10× |
| U-M5 | lamps: relight → per-run lit bit; all lit → lifetime charted bit, +1 gem only the first time | exact |
| U-M6 | the leash: L = 0 in Topsoil, 3 from Glowroot, +1 per Survey Lamps, max 8; never opens a seal, an unseen Vista or a first sight; seen ground is unleashed | exact |
| U-M7 | offline: the closed form with the leash stop equals a 1/60 s step simulation within 1e-9 relative; the cap; efficiency tiers | exact |
| U-M8 | nothing lost: skipped chests, relics and keystones reach the rack; leftovers join the Works; a failed seal keeps 50 % | exact |
| U-M9 | the chart: contents pity floors (Cache ≤ 6, Reliquary ≤ 10, Geode ≤ 12, Lamp Hall ≤ 5, notes ≥ 3 per biome); keystones at 0.25 / 0.5 / 0.85 on the trunk; per-run re-roll changes contents but not template ids | exact |
| U-W1 | `deepPath.test`: determinism; footprint inside 64 × 64; lap gap ≥ 12 m | exact |
| U-W2 | `layout.test`: no volume overlap; ring bounds; every stand's frustum to 20 m clear; road branches of equal depth [W2] | exact |
| U-W3 | `nodeStamp.test`: every face cell's kind equals `rowKinds(runSeed, d)[col]` under the snake map | exact |
| U-W4 | kits: every strike-type tappable and lamp ≤ 3.5 m from its stand; focus types ≤ 4.5 m; drawn ≥ 72 px and hit ≥ 88 px at 360 × 740 from that stand | exact |
| U-W5 | fill contract (§4.11) from every stand of every generated chamber of the first two cycles; a new face feature every ≤ 8 slices | exact |
| U-W6 | anti-repetition: no template within 4 chambers; a landmark every ≤ 6 chambers | exact |
| U-TUT1 | the six steps advance on the action; fallbacks fire after their delays; a step done early is skipped | exact |
| U-TUT2 | the sequencer never shows two prompts at once and holds lessons to the L13 spacing (simulated 30 min) | exact |
| U-FX1 | the FX director's counters: ≤ 3 foreground groups, ≤ 2 ambient, ≤ 80 particles, ≤ 1 floating number, ≤ 1 UI loop, through a scripted 10-minute run | exact |
| U-FX2 | camera motion from FX: 0 except the three allowed shakes | exact |
| U-FX3 | one ceremony at a time; lengths of §8.7; every ceremony skippable | exact |
| U-SAVE1 | v4 round trip; corrupt slot fallback; newer-version refusal | exact |
| U-SAVE2 | v3 → v4 migration keeps the listed meta and drops creature fields; the notice flag set once | exact |
| U-PURGE | the creature grep gate (below) returns nothing outside an allow-list of comments that state the purge; "Mother Cap" must not match | empty |
| U-I18N | every player-facing string goes through `t()`; no missing keys in `en` | exact |
| U-LOOK | config lint: `biomeLooks` exposure 1.0 ± 0.15, saturation ≤ 1.0, bloom threshold ≥ 1.0, strength ≤ 0.25; terrain programs use no `sampler2D` but the allowed ramps and noise; no iris, shock, chroma or rays parameters | exact |

The creature grep gate (U-PURGE; the same command is the W1 gate in BUILD.md):

```sh
grep -rniE '\bcreatures?\b|bestiary|\bmoths?\b|luckyMoth|mothSwarm|mimic|treasureMole|\bmoles?\b|warden|golem|voidMaw|kindred' \
  src tests --include=*.ts
```

### 13.2 Simulation (the node-paced bot; `npm run sim -- nodes`)

| Id | Check | Pass |
|---|---|---|
| S1 | §5.12 milestones within their bands; chamber gold share 25–35 % | all |
| S2 | a player strike on a special ≥ 10× a crew strike, median over the first 60 min | ≥ 10× |
| S3 | taps per block p50 ≤ 4 over the first 45 min | ≤ 4 |
| S4 | the longest gap between completions in the first 30 min ≤ 30 s; something new ≤ 60 s | both |
| S5 | the tutorial sequencer's lesson times meet L13 | all |
| S6 | auto-delve stops ≥ 1 per 2 chambers on run 1 and on a re-climb [W2] | both |
| S7 | camera moving ≤ 18 % of active time | ≤ 18 % |
| S8 | no Rekindle chains over 7 days; side multipliers ≤ ×10 by day 3 (the `it.fails` turn green) [W3] | both |

### 13.3 End to end with real touches (Playwright, 390 × 844)

The debug surface `window.__DD__.hybrid`: `mode()`, `state()`, `node()`, `phase()`, `faceCells()` (screen rects of live blocks),
`tappables()` (id, kind, screen rect, hit rect), `nav()` (exits, rings, arrows with rects), `camera()` (view matrix, shot,
`moving`), `goal()`, `fx()` (live group counts), `hud()` (plate rects, visible numbers), `events(name?)`, `advance(s)`,
`setNode(i)`, `give({...})`, `offline(hours)`, `toSeal()`, `skipTutorial()`, `settings(patch)`, `timeScale(k)`, `perf()`.

| Id | Scenario (real touches only) | Pass |
|---|---|---|
| E1 | First launch: the camp, then the plug face; the objective reads "Tap the rock"; tap the rimmed centre block | `cell:break` in the next rendered frame (frames between `pointerdown` and the hit ≤ 1) |
| E2 | 300 random touches across the world region over a drift and a chamber | every touch yields a model action (`tap:hit`, `skin:strike`, `lamp:relight`, `focus:open`, `ride:start`, `stand:move`, `lantern:raise`, tunk); 0 nothing |
| E3 | Buy the Pick from its card; hold-to-buy repeats; the gold counter changes only when tokens land | events and counter samples agree |
| E4 | Hire the Shovel Hand from BEST; its impacts land on blocks | `crew:strike` frames match rig impact frames within 1 frame |
| E5 | Break the breach of drift 1 | `node:breach` → the glide → `node:firstLight`; the stand reached; the objective "Tap the chest" |
| E6 | Tap the chest: the focus pop; tap: the roll-up; tap outside: closed | the camera view matrix identical before, during and after |
| E7 | Tap the exit: the Way Down; a tap mid-ride skips | `ride:end` ≤ 0.2 s after the skip tap |
| E8 | Hold the face 2 s; then 100 taps without clearing a slice | hold rate 3/s ± 0.3; view matrices identical across the taps |
| E9 | In the Lamp Room relight two lamps (one via the survey ring) | `lamp:relight` ×2, `stand:move`, `chamber:charted`, gems +1 |
| E10 | The relic ring: hold, release in the gold band | the grade recorded; the turntable on first find |
| E11 | The dynamite crate on the rack | `skill:dynamite`; 3 slices cleared; one shake logged |
| E12 | The Hatch fight to the win; a tap skips the reveal | `seal:break`, `biome:reveal`, the Threshold stand |
| E13 | A chalk arrow turns the view ≤ 35° yaw in ≤ 0.35 s; the opposite arrow turns back | camera log within the motion law |
| E14 | Tap a far wall | `lantern:raise`; the camera unchanged |
| E15 | [W2] A lantern tap ≤ 300 ms after a strike stream does not pulse; a fresh tap with a full meter does | exact |
| E16 | Save and reload mid-chamber | the same node, phase, stand, harvested and lit bits |
| E17 | `offline(2)` from Glowroot, then resume | return glimpses ≤ 3 s; the plate "+N chambers" with 1 ≤ N ≤ 3; arrival at a dark mouth; first light on the next tap |
| E18 | Inject a v3 save | loads with the meta kept; the notice once |
| E19 | Left-handed mirror | lantern right, tool left, rack and Pulse area mirrored; hit areas mirrored |
| E20 | Reduced motion | every glide and ride is a cross-fade (no intermediate camera poses) |
| E21 | HUD audit over a scripted 5-minute run | plates ≤ 17 % of the area; ≤ 5 persistent numbers (+1 transient); body ≥ 15 sp; the objective in 100 % of sampled frames |
| E22 | Repeat E1, E5, E9 at 360 × 740 and 412 × 915 | blocks ≥ 92 px at rest; tappable hit areas ≥ 88 px |
| E23 | `release.spec.ts` (crash panel, Back, lifecycle, context loss) | green |
| E24 | `tools/apk-sim.mjs` on the built APK: launch, a tap breaks a block, the first breakthrough, reload keeps the save | green |

### 13.4 Captures and the beauty rubric

The capture metrics C1–C14 (§8.10) run with `node tools/hybrid-capture.mjs --size 390x844 --dpr 2` (and 360 × 740, 412 × 915
where listed) into `artifacts/hybrid/w<N>/`, printed by `tools/png.mjs`. The beauty rubric (§8.11) is scored on the capture sheet
by the lead and on the phone by the director every look round.

### 13.5 Device (the director's phone, and phone B when available)

| Id | Check | Pass |
|---|---|---|
| D1 | Day 0: the look review of the three spike sheets on the phone; the director's pick recorded | recorded |
| D2 | Week 1: the creep A/B (§3.6) with three people | the winner recorded |
| D3 | The reach read: strikes on chamber veins at 2–3.5 m feel like hits (the director's yes) | yes |
| D4 | 30 minutes on Balanced: fps (in-game counter), heat, battery, no crash | §11 |
| D5 | Audio by ear and haptics by hand: nothing grating, nothing missing | the director's yes |
| D6 | The first ten minutes, cold, on a fresh install | the director's notes; no "nothing is indicated", "ugly", "illegible" or "too much animation" |
| D7 | Three on-device screenshots per look round, scored with the beauty rubric | pass (§8.11) |

### 13.6 The gates

Each wave ends at a gate the lead runs (BUILD.md): `npx tsc --noEmit` clean; `npm test` green apart from the known `it.fails`; the
wave's e2e green on its port; the creature grep empty; the captures pass C1–C14 for the wave's shots and the beauty rubric; the
APK built and passing `apk-sim`; the device checks the wave lists.

---

## Appendix A. The numbers in one place (knobs and constants)

| Name | Value | § |
|---|---|---|
| hFOV / eye / near | 52° / 1.60 m / 0.08 m | 3.1 |
| Pitches | drift −8°, stand 0° (±4°), Way Down −20°, floor seal −35°, sump −55°, Reveal +12° | 3.1 |
| Motion law | ≤ 2.5 m/s (vertical ≤ 2.0), rotation ≤ 90°/s in rotate phases only, FOV constant, roll 0 | 3.2 |
| Face | 2-3-2 bond; block 0.80 × 0.78 × 1.0 m; joints 4–6 cm; standoff 3.0 m | 3.5 |
| Creep A | 0.15 s wait, 1 m in 0.6 s, merge when fast | 3.6 |
| Creep B | spring, ≤ 1.2 m/s, standoff 2.8–3.4 m | 3.6 |
| Breakthrough glide | ≤ 3.2 m in 1.6 s (Gallery step-in 1.6 m in 1.0 s); first light 0.6 → 1.0 in 1.2 s | 3.3, 4.6 |
| Way Down | 3–5 m path, 1.6–2.6 s | 3.3 |
| Survey glide / chalk turn | ≤ 1.2 s / ≤ 35° yaw or ≤ 20° pitch in ≤ 0.35 s | 3.3 |
| Focus pop | object to 1.8 m ahead, 1.4 m up, 0.3 s; world dimmed 30 % | 3.3 |
| Return | ≤ 3 glimpses × 0.7 s, ≤ 3 s | 5.3 |
| Tap cap / hold | 8 counted hits/s; hold 3 → 5/s, 8/s in a Surge; 250 ms, 12 px | 2.6 |
| Pulse meter | 1/hit, 4/crit, hold ×0.5, full at 240; Surge ×3 for 10 s (+1 s per Bellows) | 2.6, 4.8 |
| Reach | strike types ≤ 3.5 m, focus types ≤ 4.5 m | 2.3 |
| Target sizes | blocks ≥ 92 px at rest; tappables drawn ≥ 72 px, hit ≥ 88 × 88 px, overlap ≤ 20 % | 2.3 |
| Fat finger | drift: nearest block; chamber: one candidate within 48 px only | 2.3 |
| K | Topsoil 5, 6, 7, 7, 7, 8; then 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 30, 30 | 4.3 |
| `CHAMBER_EQ` | 10 cell-equivalents (8–14) | 5.2 |
| Gold per damage | veins 2.5× / 4×, gems 8×, skin 0.6×, Works 1.00× | 5.2 |
| Skin | ≈ 40 cells per chamber; 12 % pockets (nugget 80 %, gem 15 %, scrap 5 %) | 4.7 |
| Lamps | 2–4 per chamber, ≤ 2.5 m from a stand, ≥ 0.55 m across | 4.6 |
| Leash | 0 in Topsoil; 3 from Glowroot; +1 per Survey Lamps; max 8 | 5.3 |
| Offline | 30 s start; 50 % → 75 % (250 Embers) → 100 % (1e5); cap 3 h → 6 h (25) → 12 h (250) | 5.3 |
| Rack | 10 | 5.2 |
| Roads | a fork every 4–6 chambers from Glowroot; 1–2 chambers per road; Vein EV ≤ ×1.25; ≤ 10 free levels per Works Road | 4.5 |
| Secrets | ≈ 1 in 3 chambers, pity ≤ 5; a vault per biome | 4.8 |
| Keystones | 3 per biome from Glowroot at 0.25 / 0.5 / 0.85 of the trunk | 4.9 |
| Seal | 30 s; HP = 20 s × (crew DPS + 4 × tap), ×0.5 for the Hatch; weak point every 5 s for 1 s ×5; finisher at 25 % ×10; fail keeps 50 % | 5.5 |
| Events | U(40, 70) s active; first at ≈ 11 min | 5.6 |
| FX | ≤ 3 foreground groups, ≤ 2 ambient, ≤ 80 particles, ≤ 6 % area, ≤ 1 floating number, ≤ 1 UI loop | 8.7 |
| HUD | plates ≤ 17 % of the area; ≤ 5 numbers; body ≥ 15 sp | 8.9 |
| Grade | exposure 1.0 ± 0.15; saturation ≤ 1.0; bloom threshold ≥ 1.0, strength 0.15–0.25 | 8.3 |
| Ember formula | `floor(25 × 2^((R − 600)/200))` | 5.9 |
| Camp | Fortune stages 3, 6, 12, 24, 48, 100, 303, +100 | 5.10 |
| Bore classes | block / standoff = 0.267; Heading, Drift (tier 3), Gallery (6), Tunnel (9), Great Bore (12) | 5.11 |
