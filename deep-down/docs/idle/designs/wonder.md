# DEEP DOWN — Idle Descent design, angle: WONDER (art direction + level design)

KEY: `wonder`. One complete design for the vertical-descent idle clicker, written from the angle of
"every metre is full, every biome is a reveal, and a light below keeps calling". It covers the whole
game so the lead can merge it; the world, the biome ladder, what fills the caverns, the visual
upgrade and the mystery are the parts written in the most depth (sections 5, 6, 9 and 10).

Pacing numbers in section 4 come from a greedy-buyer simulation (scratch script, 5 and 3 taps/s,
15-block layers). They are starting constants for `tools/idle-sim.ts` (section 10), not final tuning.

## 0. The thesis and the director's demands

**Thesis: the Lamplight Cutaway.** The screen is a lit cross-section of the earth, like a museum
diorama or an ant farm. The camera looks straight into a 32 m slab of rock whose front face is cut
open. You tap the layer at the bottom of the shaft; under it, in the cut face, you can already see
what is coming: an ore vein 4 m down, a chest 9 m down, the dark mouth of a cavern 14 m down with
something glowing inside, and at the very bottom of the screen, in the haze, a warm light that you
did not plant. Seeing it before you reach it is the engine of the whole design. Wonder comes from
anticipation, then the payoff.

| Director's demand | Answer in this design | Section |
|---|---|---|
| Nothing is indicated | Objective strip always on screen; a Depth Ruler down the right edge that shows icons for the next 60 m (chests, vaults, seals, your old lanterns); one hint at a time | 7, 8 |
| Mining is horrible, controls unpleasant | Tap anywhere: the strike lands on the nearest block of the current layer. No hold, no aim, no joystick. 1 tap breaks a block at the start | 2 |
| Caverns horribly empty | Fill rules with hard minimums (≥1 tappable per cavern, ≥1 prop per 6 m² of floor, ≥1 light, ≥8 % vein cover). A test scans every generated slice | 5.6, 11 |
| No fun, nothing satisfying | Big bursts, loot that flies to the counters, a 3-tier combo (Frenzy), dynamite, breakthroughs where the floor collapses into a cavern | 2, 9 |
| No help, no tutorial | A 3-minute scripted tutorial, second by second, with no text wall | 7 |
| Vertical descent, portrait, fixed camera | Cutaway camera locked to the dig layer, framed for 390×844 | 5.2, 8 |
| Auto miners, offline earnings | A visible crew in the shaft (12 tiers, from a miner with a pick to a Starcutter machine); offline digging up to 24 h | 3 |
| Exponential upgrades: giant pickaxes, drills, explosions | Tool Ascension: a new tool form every 100 Pick levels (12 forms named, then procedural); Swing area up to 25 blocks, then Quake hits extra layers | 2, 4 |
| A spectacular biome at every depth milestone | 12 authored biomes, each with 3 Vaults whose back wall opens onto a giant set piece; then endless Echo Cycles | 5.4, 5.5 |
| Truly addictive, never bored | Something new enters the view at least every 10 s (a test checks this); an event every 45–75 s | 6.3, 11 |
| Endless, upgrades up to démesure | Numbers stored as log10 (no ceiling); the crew grows to 12 tiers plus 4 new tiers per cycle; the tool grows from a 0.6 m chip to a 6 m impact | 4 |
| Many loops, varied | 5 nested loops: tap → layer → find → biome → Rite, plus collections, events, the mystery | 1 |
| Big visual upgrade, HD | 12 atmosphere presets, a per-biome light budget that grows with depth, cut-face section shading, vista backdrops, god rays, creature life, a sharper render path | 5.8, 9, 10 |

## 1. Core loop at three scales

### 10 seconds — "tap, burst, see the next thing"
1. Tap (any point on the world). The strike lands on the nearest unbroken block of the current layer.
2. The block cracks or breaks: debris, a number pop, loot pellets arc to the Gold counter (0.5 s).
3. The last block of the layer breaks: the shaft drops 1 m, the camera eases down (critically damped, 0.25 s).
4. One metre more of the cut face slides into view at the bottom. Something new is in that strip
   on average every 2.5 m (a vein, a gem, a chest, a fossil edge, a cavern mouth, a critter).
5. Repeat. The crew digs alongside you, so the layer keeps breaking even between taps.

### 3 minutes — "a purchase, a find, an event, a milestone"
- 4 to 12 upgrade purchases (cards glow when affordable).
- 1 to 3 caverns broken into: the floor collapses, the shaft falls 6–14 m into a lit room with 3 to 8 tappable things.
- 1 to 3 time-based events (Gem Shower, Treasure Mole, Cave-in, Moth Bloom…).
- A Lantern Post milestone every 25 m (a lamp is planted in the shaft wall, a chest drops).
- In the first run's first 25 minutes: a biome reveal at about 2, 5 and 25 minutes, and a Vault at a third and two thirds of every biome.

### 3 days — "Rites, collections, the mystery, the crew"
- Lantern Rites (prestige) every 20–90 minutes of active play. Each one plants your lantern at your
  record depth, where it glows forever, and multiplies all damage on the next run.
- The Codex: 72 fossils, 48 relic pieces (12 sets, each set unlocks a permanent power), 36 creatures,
  12 gem kinds × 5 cuts, 36 Halden logs, 12 murals, then 1 constellation per Echo Cycle.
- 3 to 4 returns a day from offline: the "Night Shift" montage plays back what the crew dug.
- The mystery: one chapter per biome. Target: biomes 1–6 on day 1, 7–9 on day 2, 10–12 on day 3,
  the first Echo Cycle from day 4.

### What keeps it endless
| Engine | Without end because… |
|---|---|
| Biome ladder | 12 authored biomes to 4,300 m, then Echo Cycles: the same 12 biome grammars at 600 m each, with one of 8 Echo modifiers each and a hue rotation of the emissive keys of +37° per cycle (96 biome × modifier combinations before any repeat, never the same palette) |
| Tool Ascension | A new tool form every 100 Pick levels: 12 named forms, then procedural "Aeon" forms (the impact radius keeps growing on a log scale, the colours cycle) |
| Crew | 12 tiers, then 4 Echo tiers per cycle. Each tier has its own milestones (×3 at 10, 25, 50, 100, 150, 200, 300 units, then every 100) |
| Numbers | Gold, damage and HP are stored as log10 doubles. Names go K, M, B, T, aa…zz (up to 10^2043), then 1.23e2050 |
| Rites | Echo power is ×1.007 per metre of your deepest lantern, with no cap; the second layer (the Ember Pact, unlocked at 4,300 m) multiplies the Echo exponent |
| Mystery | The Other Lantern is always 300 m below your record. Each Echo Cycle lights one more constellation in the Sky Beneath |

## 2. The tap

### Input contract
- **pointerdown** on the world canvas is a tap. No hold, no drag threshold, no aim. Up to 3 fingers at
  once, each counts. Taps are counted at most 15 per second (an anti-autoclicker cap); above 15 they
  still animate but deal no extra damage.
- **Target resolution**, in priority order, inside 1 frame:
  1. A tappable object (chest, crystal, critter, fossil, relic, event object) within 40 CSS px of the
     finger and inside the reach band (dig layer +6 m … −10 m): strike it.
  2. A block of the current layer under the finger (`MiningController.pick()` on the ray): strike it.
  3. Otherwise the block of the current layer whose projected centre is nearest the finger, with no
     distance limit. **A tap is never wasted.**
- A vertical drag of more than 24 px pans the camera up the shaft by up to 60 m (to admire the trail
  of lanterns); it springs back over 0.4 s on release. That is the only gesture.

### What one tap does
`hit = PickDamage × crit × frenzy × momentum`, applied to the struck block and to `Swing − 1` more
blocks of the same layer, chosen in a fixed pattern around it:

| Swing level | Blocks hit per tap | Pattern (5×3 layer) | Visual |
|---|---|---|---|
| 0 | 1 | struck block | pick chip |
| 1 | 2 | + the next block in x | short arc |
| 2 | 3 | row of 3 | wide arc |
| 3 | 5 | plus sign | ring shockwave 1.5 m |
| 4 | 7 | plus + 2 diagonals | ring 2 m |
| 5 | 9 | 3×3 | ring 2.5 m, dust skirt |
| 6 | 13 | 3×3 + 4 arms | double ring |
| 7 | 15 | whole 5×3 layer | layer flash |
| 8 | 21 | whole 7×3 layer (Shaft Width 1) | layer flash + rim sparks |
| 9 | 25 | 25 (whole 9×3 layer needs 27) | quake ring |
| Quake n | whole layer + n layers below | | the next n layers flash and crack |

- **Crit**: 5 % base chance (+1 % per Crit level, cap 50 %), ×5 damage (+0.5× per 10 Crit levels). A
  crit number is gold, 1.4× the size, with a 35 ms hit-stop.
- **Frenzy** (combo): each tap within 0.6 s of the previous one adds 1 to the combo; a 0.6 s gap ends it.
  At 20 combo: Frenzy ×2 damage for 5 s. At 50: ×4 for 5 s, the screen edges glow amber. At 100:
  Overdrive ×10 for 3 s, every tap hits the whole layer. The combo also raises the hit sound by
  1 semitone every 5 combo (up to +12).
- **Momentum**: each layer cleared within 4 s of the previous one gives +5 % damage, up to +100 %
  (20 layers in a row). It decays at −10 % per second once broken. It rewards keeping the rhythm.
- **Block HP**: `HP(d) = 10 × 1.025^d × material` (material: soft 0.5, host 1, hard 3, ore1 1.5,
  ore2 2, gem 3; seals in section 5.3). At 0 m a host block has 10 HP and the starting pick deals 10:
  **the very first tap breaks a block**.

### How the tap scales visually (Tool Ascension)
The avatar (the existing jointed explorer, `ExplorerModel`) stands on the layer and strikes the column
you tapped. Over the struck block a "ghost tool" (an additive mesh, 120 ms) is drawn at the tool form's
scale. The tool form changes every 100 Pick levels. Each form also multiplies Pick damage by ×4.

| Pick levels | Form | Ghost tool size | Impact effect | Shake trauma per break | Voice |
|---|---|---|---|---|---|
| 0–99 | Rusty Pick → Iron Pick (head colour changes every 25) | 0.6 m | chip + dust | 0.04 | stone hit |
| 100–199 | Twin Picks (both hands) | 0.9 m | two chips | 0.05 | doubled hit |
| 200–299 | Mattock | 1.2 m | crater puff | 0.06 | low thud |
| 300–399 | Steam Drill | 1.4 m | spiral sparks, steam | 0.07 | drill whine |
| 400–499 | Thunder Hammer | 1.8 m | blue arc flash, ring | 0.09 | crack + rumble |
| 500–599 | Grand Auger | 2.2 m | corkscrew debris | 0.10 | grind |
| 600–699 | Quake Gauntlet | 2.6 m | ground ripple | 0.12 | sub boom |
| 700–799 | Meteor Call | 3.2 m | a meteor falls from above the screen (0.25 s) | 0.15 | whoosh + boom |
| 800–899 | Sunlance | 3.8 m | vertical beam, heat shimmer particles | 0.17 | choir hit |
| 900–999 | Star Forge | 4.5 m | star-shaped burst, gold sparks | 0.19 | bell + boom |
| 1000–1099 | Comet Fist | 5.2 m | comet trail across the screen | 0.21 | roar |
| 1100–1199 | Event Horizon | 6.0 m | a black disc that inhales debris, then a violet ring | 0.23 | reverse swell |
| 1200+ | Aeon forms (procedural: shape = hash(form) over 6 shapes, hue + 37° each) | 6.0 m × (1 + 0.1 × log2(form − 11)) | the shape's burst | 0.25 cap | the shape's voice |

## 3. Idle and offline

### The crew (visible automatic miners)
Every crew unit deals its DPS to the current layer, spread as strikes: one strike per unit every
`interval` seconds on a random unbroken block. The crew is drawn in the shaft (section 10: one
instanced draw per visible tier).

| Tier | Name | Drawn as | Interval | Visible units | Unlock |
|---|---|---|---|---|---|
| 1 | Digger | small miner with pick | 1.0 s | 6 | 600 g (the first one is free, section 7.1) |
| 2 | Shovel Pair | two miners, one shovels debris up | 1.2 s | 4 | tier 1 ×1 |
| 3 | Rock Driller | pneumatic drill on a tripod | 0.5 s | 4 | tier 2 ×1 |
| 4 | Pony Rig | cart + drill on rails along the shaft wall | 0.8 s | 3 | … |
| 5 | Blast Team | crate of dynamite, small blasts | 2.0 s | 3 | … |
| 6 | Steam Bore | a boiler on legs, rotating head | 0.4 s | 2 | … |
| 7 | Clockwork Mole | brass mole that tunnels the side wall | 0.6 s | 2 | … |
| 8 | Thunder Ram | pistoned ram hung on chains | 1.5 s | 2 | … |
| 9 | Magma Auger | glowing auger head | 0.3 s | 1 | … |
| 10 | Crystal Resonator | tuning-fork crystal, shatters by sound | 1.0 s | 1 | … |
| 11 | Loom Spinner | threads of light cut the rock | 0.2 s | 1 | … |
| 12 | Starcutter | a star-shaped engine that eats a layer at a time | 3.0 s | 1 | … |
| 13+ | Echo tiers (4 per cycle) | the tier 1–12 rigs, with an Echo glaze (hue of the cycle) and ×1.5 scale | | 1 | Echo Cycle n |

Beyond the visible count a tier shows a brass plate "+37" on its last model. A tier's model gains a
part at each milestone (10: a lamp, 25: a second tool, 50: a gilded trim, 100: double size).

### Offline
- On return, `T = min(now − lastSeen, cap)`. Base cap 2 h; +1 h per Night Shift level, up to 24 h.
- Offline DPS = crew DPS × efficiency (50 % base, +5 % per Night Shift level, up to 100 %). Tap damage does not count.
- Offline depth is computed in closed form. With `m` the mean HP factor of a layer (≈ 1.3) and `B` the
  blocks per layer, digging whole layers d0 … d1 − 1 costs
  `Σ B × m × 10 × 1.025^d = B × m × 10 × 1.025^d0 × (1.025^(d1−d0) − 1) / 0.025` damage, so
  `d1 = d0 + log(1 + 0.025 × DPS × T / (B × m × 10 × 1.025^d0)) / log(1.025)`, then clamped by the
  first-sight rule below. `idle/Offline.ts` does this in log10 arithmetic, then the partial layer.
- **First sight is always yours.** The crew never digs deeper than your record + 25 m, and never
  through a Seal you have not opened. Past that line it works the side galleries: gold at the same
  rate, no depth. Biomes, Vaults and fossils are revealed by the player, never by the crew.
- Offline finds: the crew opens up to 10 ordinary chests (summed in the report). Fossils and relic
  pieces it uncovers are left in the shaft wall, marked with a glint, waiting for your tap.
- **The Night Shift montage** (3.0 s, skippable): the camera dives through the metres gained at up to
  40 m/s (section 5.1 Plunge mode), the depth counter rolls, then a plate: "While you were away:
  +214 m, +3.4 aa gold, 7 chests, 2 fossils are waiting in the wall." One tap collects.

## 4. Economy

### Currencies
| Currency | Source | Use | Kept through a Rite |
|---|---|---|---|
| Gold | every block (`V(d) = 1 × 1.025^d × value × 1.25^biome`), chests, events | upgrades | no |
| Gems ◆ | gem blocks (5 % chance of 1), chests (0–5), every 25 m (1), each Seal first time (25), events | Charms (permanent) and short boosts | yes |
| Echoes | a Rite: Echoes = your record depth in metres | Echo power ×1.007 per Echo; Echo Tree nodes unlock at thresholds | yes (they are your record) |

Value multipliers of blocks: soft ×0.8, host ×1, hard ×3, ore1 ×3, ore2 ×8, gem ×30. The layer mix
(section 5.3) gives a mean of ≈ ×1.5.

### Upgrade table (gold)
Units: a host block at 0 m has 10 HP and is worth 1 gold. The simulation ran in units where that
block has 1 HP and is worth 0.08 gold, so every cost below is the simulated cost × 12.5, rounded.

| Upgrade | Base cost | Growth per level | Effect | Milestones |
|---|---|---|---|---|
| Pick | 120 | ×1.10 | dmg = 10 × (1 + L) × 2^⌊L/25⌋ × 4^⌊L/100⌋ | ×2 every 25 levels; a new Tool Form every 100 (×4) |
| Swing | 1.8K, 75K, 3M, 120M, 5B, 200B, 8T, 330T, 12aa | table | blocks per tap: 1→2→3→5→7→9→13→15→21→25 | then Quake n: base 1.2ab, ×1,000 per level |
| Crit | 2.5K | ×1.6 | +1 % crit chance (cap 50 %); +0.5× crit damage every 10 levels | |
| Lantern | 6K | ×6 | all gold ×1.3 | |
| Dynamite | 12K | ×3 | blast radius 1.5 m +0.25 m per level (cap 6 m); recharge 60 s −2 s per level (min 20 s) | |
| Night Shift | 30K | ×4 | offline cap +1 h, efficiency +5 % | cap 22 levels |
| Shaft Width | 600K, 600M | table | W 5 → 7 → 9 (15 → 21 → 27 blocks per layer, gold per metre ×1.4, ×1.8); the camera pulls back | 2 levels |
| Crew tier i (1–12) | 600 × 12^(i−1) | ×1.10 | DPS per unit 8 × 7^(i−1) | ×3 at 10, 25, 50, 100, 150, 200, 300 units, then every 100 |
| Echo crew tier (cycle n, k = 0…3) | 600 × 12^(11 + 4(n−2) + k) | ×1.10 | 8 × 7^(11 + 4(n−2) + k) | same |

The first Digger is free: it comes out of the tutorial's second chest (section 7.1), so the crew is on
screen from 0:35 even though a payback-greedy buyer would not hire one before minute 3.

Buy ×1 / ×10 / Max toggle on the dock. "Max" never spends more than 95 % of the gold on one line.

### Gem Charms (permanent, survive Rites)
| Charm | Cost ◆ | Effect |
|---|---|---|
| Auto-Tapper | 250 | 3 taps/s while the app is open and no finger is down (+1 per 250 more ◆, max 8) |
| Golden Haft | 60 | tap damage ×1.5 (5 levels, ×2.5 cost per level) |
| Crew Boots | 80 | crew DPS ×1.25 (5 levels) |
| Lucky Lamp | 120 | find chance ×1.2 (chests, fossils, critters) (5 levels) |
| Second Charge | 150 | Dynamite holds 2 charges |
| Overdrive Flask | 40 | consumable: ×3 all damage for 10 min |

### Milestones and multipliers (summary)
- Crew milestones ×3; Pick ×2 every 25, ×4 every 100.
- Biome ore richness ×1.25 per biome index (gold only).
- Relic set powers (section 6.2), fossil luster (+2 % gold per distinct fossil, ×1 per luster tier).
- Echo power ×1.007^Echoes on all damage (tap and crew). It does not multiply gold directly: gold
  comes from blocks, so it is set by depth. This stops the runaway loop (damage → gold → damage) the
  simulation found when Echoes multiplied both.

### Prestige: the Lantern Rite
- Available from a record of 300 m. The button glows when the next Rite gives ≥ ×2 the current Echo
  power (record +100 m since the last Rite), or when the median descent over 60 s is < 0.1 m/s.
- The Rite: the avatar plants its lantern on the layer (a permanent warm emitter at that depth), the
  screen flares, the run resets: gold, Pick, Swing, Crit, Lantern, Dynamite, Shaft Width and crew go
  back to 0. Gems, Charms, the Codex, Echoes, opened Seals and the Echo Tree stay.
- The next run starts with **the Plunge**: the dig head falls at up to 40 m/s through known biomes
  until 85 % of the record (each tap adds +5 m/s for 1 s), collecting gold by depth on the way.
- Echo Tree (unlocked by total Echoes, nothing to spend): 300 Plunge start; 500 Auto-buy the best card
  every 5 s; 800 +1 offline hour; 1,200 Frenzy +2 s; 1,800 crew milestones ×4 instead of ×3;
  2,500 Swing starts at level 3; 3,500 Rite keeps 1 % of gold; 4,300 the Ember Pact (second prestige layer).
- **Ember Pact** (from 4,300 m): reset Echoes too; gain Embers = ⌊record / 1,000⌋²; each Ember adds
  +0.0005 to the Echo exponent base (×1.007 → ×1.0075 …).

### Pacing targets (first run, sim at 5 taps/s and at 3 taps/s)
The simulation is a greedy payback buyer with no tutorial chests, no events and no Seals, so real
first-minute numbers are better than the sim (the tutorial chests add 60 + 200 gold).

| Milestone | Target | Sim 5 taps/s | Sim 3 taps/s |
|---|---|---|---|
| First block | tap 1 | tap 1 | tap 1 |
| First purchase | ≤ 15 s with the tutorial chest | 14 s | 24 s |
| Purchases in minute 1 | ≥ 6 | 11 | 4 |
| First Swing | ≤ 2 min | 74 s | 123 s |
| First crew | 0:35 (free Digger); first bought one ≤ 4 min | 218 s | 345 s |
| Biome 2 (120 m) | 2–3 min | 1.8 min | 3.0 min |
| Biome 3 (300 m), Rite available | 5–9 min | 5.2 min | 8.6 min |
| Biome 4 (520 m) | 25–35 min | 24.9 min | 35.5 min |
| Biome 5 (780 m) | 85–100 min | 88 min | 100 min |
| Longest gap between purchases | ≤ 60 s to 5 min; ≤ 4 min to 60 min | 31 s; 247 s | |
| Median descent, minutes 1–5 | ≥ 0.6 m/s | 0.89 m/s | 0.7 m/s |
| Median descent, minutes 5–30 | ≥ 0.12 m/s | 0.13 m/s | |
| First Rite | 40–90 min | | |
| Rites after that | every 20–40 min active, record +15–35 % each, until 4,300 m | | |
| Days | biomes 1–6 on day 1, 7–9 on day 2, 10–12 on day 3 | not met yet (below) | |

**The calendar is not solved yet, and the lead should know how it fails.** A 3-day simulation (4
sessions a day of 10–30 min, offline crew at 50 % between them, a Rite whenever the descent stays
under 0.08 m/s for a minute) gave:
- Echo multiplying damage *and* gold: the record doubles every Rite, 146 biomes in 3 days. Hence the rule above: Echo multiplies damage only.
- Echo = ×1.007 per metre (log10 power = 0.003 × record), damage only, HP growth 1.025 / 1.03 / 1.035
  per metre in 0–1,080 / 1,080–2,220 / 2,220+ m: 8 biomes after the second session of day 1, then a
  stall at ≈ 2,840 m (biome 10) for days 2 and 3. It front-loads and then plateaus.
The knobs are the Echo exponent, the HP growth per band, the offline efficiency and the first-time
Seal multipliers `H_b` (section 5.3). `tools/idle-sim.ts` must reach the day targets before wave 1
ships, and the Echo Tree nodes (below) are where the late plateau is broken.

## 5. The descent and the world in the voxel engine

### 5.1 World size and streaming: the Shaft Window
- One `VoxelWorld(32, 128, 32)`: x across the screen, y up, z away from the camera. 131,072 voxels
  (128 KB), light 512 KB, 2 × 8 × 2 = 32 chunks of 16³. Tiny compared with today's 160×128×160 zone (3.3 MB).
- **Open front.** `VoxelWorld` gains `openFront`: reads at z < 0 return AIR (other out-of-bounds reads stay
  BEDROCK). So the mesher emits the front faces at z = 0: the cut face of the whole slab is drawn.
- **The shaft**: columns x = 13…17 (W = 5; 12…18 at W = 7; 11…19 at W = 9), rows z = 0…2. The current
  layer is the top solid row of that footprint. Only it is diggable; the rest of the slab is scenery
  and bonus targets.
- **Rows**: window row 127 is the top. The dig layer stays in window rows 64–96. When it goes below 64
  the window **shifts up by 32 rows** (two chunk rows):
  1. `blocks.copyWithin` per z-slab (32 calls, 96 KB moved), the same for the light data (×4).
  2. Rows 0–31 come from the slice worker, which always has the next two 16-row slices ready.
  3. Light: a local recompute over rows 0–49 (32 new + `LIGHT_REACH` 18), then one full
     `texSubImage3D` of 512 KB. One shift every 32 m: every 32 s at 1 m/s, every 2.7 s at 12 m/s.
  4. Chunks: rows 0–5 keep their meshes and move up by 32 m (`mesh.position.y += 32`). Rows 6–7 are
     recycled. New rows 0–1 are queued, plus row 2 (its padding below changed). 12 chunk meshes per shift.
- **Absolute coordinates**: the window carries `originY` (absolute world y of window row 0, a multiple of
  32). The mesher's relief noise, jitter and seam keys take `originY` (a new argument of
  `meshPadded`), so a chunk meshed before and after a shift is byte-identical. The shaders get
  `uOrigin`; world-space texture coordinates use `vGrid + vec3(0, mod(originY, 7600), 0)`. 7,600 m is a
  multiple of the 8 m material period and of the 190 m macro noise, so the wrap is invisible and
  GLSL floats never go above 8,000 (precision 0.0005 m).
- **Speed envelope**: 0–12 m/s rendered as voxels. Above 12 m/s (the Plunge, the Night Shift montage,
  late Quake bursts), **Plunge mode**: the voxel window is hidden behind a procedural tunnel shader
  (rock streaks in the biome palette, passing Lantern Posts as halos), and the window is rebuilt at the
  destination (generate 8 slices ≈ 20 ms + light ≈ 11 ms + 32 meshes in the workers) while the tunnel
  plays. At least 0.6 s of tunnel, so the rebuild is never seen.

### 5.2 The camera in portrait
- Perspective, vertical FOV 46°, no roll, yaw 0 (looking +z into the cut). Pitch −18°.
- Framing rule: the visible width at the dig layer is exactly 11.5 m on every aspect, solved per frame:
  `L = 11.5 / (2 × tan(23°) × aspect)` along the view ray to the aim point.

| Viewport (CSS px) | Aspect | Distance L | Visible height at the layer | px per metre |
|---|---|---|---|---|
| 360×740 | 0.486 | 27.9 m | 23.7 m | 31.3 |
| 390×844 | 0.462 | 29.3 m | 24.9 m | 33.9 |
| 412×915 | 0.450 | 30.1 m | 25.6 m | 35.8 |

- The aim point is the shaft centre (x 15.5, z 1.5), 2.6 m below the layer top, so the layer sits at
  40 % of the framed area (section 8, y ≈ 333 px at 390×844): about 10 m of shaft above it and 15 m of
  preview below it on the full screen, of which the dock covers the lowest 5 m (10 m always clear).
- At the back of the slab (z = 31, ≈ 59 m from the lens) the view is 23 m wide, so the slab's sides
  (32 m) are never seen.
- Shaft Width 7 / 9: the framing width becomes 13.5 / 15.5 m (the camera pulls back over 1.5 s).
- Follow: the aim point follows the layer with a critically damped spring (ω = 9 rad/s, a 1 m drop
  settles in 0.35 s); a breakthrough uses ω = 6 plus a 0.12 m bounce on landing.
- Life: a slow ±1.5° yaw sway (period 23 s) and ±0.15 m bob (period 9 s), so the parallax of the deep
  cavern backs is always alive. Off in Battery mode.
- Vault framing (section 5.4): for 3.5 s the camera eases to L = 52 m, pitch −8°, to show the whole
  Vault and its backdrop, then returns over 1.2 s. Time runs at 0.4× for the first 0.6 s.
- Seal framing: L −15 % (closer) during the 30 s challenge.

### 5.3 Generation grammar (per 16-row slice, deterministic)
`sliceGen(seed, sliceIndex)` produces 32 × 16 × 32 voxels plus prop specs, critter anchors, light
emitters and Depth Ruler icons. It is a pure function, run in the slice worker
(`world/shaft/sliceWorker.ts`). Order of passes:

1. **Strata**: the biome's host rocks A and B in dipping beds (dip 4–12°, thickness 2–6 m, from
   world noise), with 1 marker bed per slice of the soft or hard layer.
2. **Veins**: 3 to 5 tubes per slice (radius 0.6–1.2 m, length 6–16 m) of ore1 / ore2, at least one
   crossing the cut plane z = 0 and one crossing the shaft footprint.
3. **Gem nests**: 1 to 3 per slice, 1–4 gem blocks, always with one face on the cut face or a cavern.
4. **Caverns** (section 5.6): pockets, galleries, geodes, vaults, carved by the cavern grammar.
5. **Ruins and fossils**: biome structures (Halden timber, Lantern-bearer masonry through the existing
   `StructureRenderer` kinds: columns, stairs, bridge, coping) and fossil slabs in the cut face.
6. **Fill** (section 5.6): props, critter anchors, emitters, particle emitters, under the fill rules.
7. **Shaft guarantee**: no unbreakable cell inside the shaft footprint, ever (tested).
8. **Seal**: in the last slice of each biome, a Seal slab 2 m thick across the footprint plus a 1 m rim.

Layer composition targets (inside the shaft footprint, per 1 m layer): host 60–75 %, soft or hard
10–20 %, ore1 8–12 %, ore2 2–5 %, gem 0.5–1.5 %. Mean value ≈ ×1.5.

**Seals**: HP = `40 × H_b × layer HP(d)`, a 30 s timer, the crew helps. The first time only; once
open, a Seal stays open (saved). Failure keeps 50 % of the damage dealt; "Challenge the Seal" can be
pressed again at once. `H_b` (first-time multiplier) per biome: 0.6, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16.
Breaking a Seal in 30 s takes the damage of `40 × H_b / 30 = 1.33 × H_b` m/s of descent at that depth.
The first Seal (120 m, H_b 0.6) needs 0.8 m/s: the sim's player arrives there at 1.07 m/s (3 taps/s)
to 1.79 m/s (5 taps/s), so the tutorial's Seal is always won on the first try. Later Seals usually
need 2–10× the arrival DPS: a few minutes of upgrades, or a Frenzy at the right moment.
The opening uses the rune-door animation (`runeDoor.ts`: rows sink top to bottom, 0.3 s per row),
the next biome's key light floods up through the gap, and the title card appears.

**The glow below**: in the last 40 m above a Seal, the next biome's key colour leaks up: 4–8 emitter
voxels of that colour in hairline fissures of the cut face, and the fill tint of the window rows
blends toward the next biome (section 5.8). The player sees the next biome coming in the light
before the Seal is even on screen.

### 5.4 The biome ladder (first cycle, 0–4,300 m)

Look and light (atmosphere values in the existing `AtmospherePreset` format; pool level relative to
the vault floor; bloom threshold / strength; grade = shadow tint / highlight tint):

| # | Biome | Band (m) | Host rock ramp (dark → light) | Key emitters (linear rgb) | Fog / low fog | Ambient / open fill (gain) | Exposure | Bloom | Grade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Rootsoil — the Halden Diggings | 0–120 | soil 1d1815→5c4839, umber | lamp (1.0, 0.70, 0.36), amber nodule (1.0, 0.55, 0.20) | 1b1714 / 100d0c | 16120f (1.2) / 4a4036 (0.9) | 1.7 | 1.20 / 0.35 | 0d1018 / ffd9a8 |
| 2 | Slate Galleries | 120–300 | STONE 151920→717784 | crystal (0.10, 0.38, 0.48), quartz (0.50, 0.55, 0.60) | 161a20 / 0e1014 | 141c2e (0.7) / 5a6a84 (0.9) | 1.6 | 1.15 / 0.40 | 0a1220 / e8f4ff |
| 3 | Verdigris Grottos | 300–520 | grey-green 13201c→6a8a7c | turquoise (0.10, 0.60, 0.50) | 10201e / 0a1614 | 0f2220 (0.7) / 4f8a7c (0.9) | 1.8 | 1.10 / 0.45 | 061614 / d8fff0 |
| 4 | Glimmer Hollows | 520–780 | DEEP 0f1217→595f6c | cyan (0.13, 0.51, 0.66), violet (0.40, 0.25, 0.90) | 0e1a2a / 101638 | 101c34 (0.7) / 6a9ac0 (1.0) | 2.1 | 1.00 / 0.55 | 0a0c24 / c8f8ff |
| 5 | Forgotten Works | 780–1080 | rust-grey 1c1a18→6c625a | sodium (1.0, 0.60, 0.25) | 231a12 / 140e0a | 1e140c (1.0) / 7a6048 (0.8) | 1.7 | 1.05 / 0.50 | 120c10 / ffc880 |
| 6 | Fungal Undergrove | 1080–1420 | violet-brown 1a1220→5e4a66 | magenta (0.90, 0.25, 0.75), lime (0.55, 0.95, 0.30) | 1a0f22 / 0c1a12 | 160c1c (0.8) / 7a5a9a (0.85) | 2.0 | 0.95 / 0.60 | 100818 / e8ffc8 |
| 7 | Buried Sea | 1420–1800 | blue limestone 0c1820→5a7486 | aquamarine (0.15, 0.55, 0.95) | 0a2236 / 061628 | 0a1c30 (0.8) / 3f86b0 (1.0) | 2.0 | 1.00 / 0.55 | 04101e / c0f0ff |
| 8 | Ember Deep | 1800–2220 | basalt 100c0c→4a3c38, obsidian | lava (1.0, 0.35, 0.08) | 2a100a / 3a1206 | 200a06 (0.9) / 8a4a30 (0.7) | 1.6 | 0.90 / 0.65 | 14060a / ffb060 |
| 9 | Bone Cathedral | 2220–2680 | pale bone 2a2622→d8ccb6 | violet (0.55, 0.35, 1.0), bone (0.90, 0.85, 0.75) | 1c1826 / 120e1e | 1a1624 (0.8) / 9a8ab0 (1.0) | 2.2 | 1.00 / 0.50 | 0e0a1a / fff0d8 |
| 10 | Geode Cathedral | 2680–3180 | amethyst host 1a1226→6a5a86 | violet (0.60, 0.30, 1.0), gold (1.0, 0.80, 0.35) | 1a0e2a / 22103a | 180c28 (0.8) / 9a6ad0 (1.0) | 2.1 | 0.90 / 0.70 | 12082a / ffe8b0 |
| 11 | The Loom | 3180–3720 | pale ashlar 2a2824→a8a090 | white-gold (1.0, 0.92, 0.70), thread cyan (0.30, 0.80, 1.0) | 1e1c18 / 0e1420 | 1c1a14 (1.0) / b0a888 (1.1) | 2.3 | 0.85 / 0.70 | 0a1020 / fff4d0 |
| 12 | The Starless Gate | 3720–4300 | void rock 0b0b0f→2f2c3d (BEDROCK ramp) | abyss violet (0.50, 0.32, 1.0), star (0.85, 0.90, 1.0) | 0c0820 / 1a0c3a | 0a0818 (0.8) / 5a4a9a (0.9) | 2.4 | 0.85 / 0.75 | 06041a / e8e0ff |

Content (blocks: ore1 ×3, ore2 ×8, gem ×30; three Vaults per biome at ⅓, ⅔ and the Seal):

| # | Ores / gem / special block | Cavern skin | Vault set pieces (⅓ · ⅔ · Seal hall) | Creatures (tap to catch) | Ambient particles | Fossil family (6) | Music |
|---|---|---|---|---|---|---|---|
| 1 | copper, tin, amber nodule; roots | root cellars, Halden tunnels with rails | the Halden Headframe (timber tower + winch over a 60 m gallery) · the Collapsed Camp (tents, crates, a cold hearth) · the Lift Cage hanging over the Seal | lumen moth, root mole, lamp beetle | dust motes, falling grit | fern, trilobite, ammonite, root cast, amber gnat, shell bed | D dorian, 84 bpm |
| 2 | iron, quartz, glimmer crystal | slate halls, crystal seams | the Colonnade Cistern (lathed columns standing in black water) · the Stair of Kings (stair flights into the dark) · the Lintel Gate (carved lintel over the Seal) | glass newt, slate crab, lumen moth | cold drips | crinoid, sea lily, orthocone, brachiopod, graptolite, coral head | A aeolian, 80 |
| 3 | malachite, native copper, turquoise; stalactites | dripstone grottos, turquoise pools | the Drip Organ (a wall of stalactites; tapping them plays the scale) · the Green Mirror (a still pool reflecting the ceiling) · the Verdigris Bell | drip bat, verdigris snail, pool eel | slow drips with splash rings | cave fish, eurypterid, pterygotus claw, nautilus, coral fan, sponge | E dorian, 88 |
| 4 | glimmer, echo crystal, prism gem | geodes, crystal forests | the Hand in the Crystal (a 20 m crystal with a human outline inside) · the Singing Spire · the Crystal Rose (petals 8 m) | crystal tick, shard hermit, cyan moth | rising glimmer motes | crystal-cast shell, frozen moth, glass fern, ammonite in glass, prism coral, the Hand fragment | F# lydian, 76 |
| 5 | gold vein, brass scrap, lamp-oil pocket; rails | Halden machine rooms, pump chambers | the Crusher Hall (gear wheels 12 m, turning) · the Pump Cathedral (pistons, steam) · the Foreman's Office (the last log) | rust mite, steam wisp, cart rat | steam puffs, sparks | rusted trilobite, coal fern, iron ammonite, pick-scarred bone, the foreman's tag, boiler fish | C mixolydian, 96 |
| 6 | glowcap, mycelium amber, spore gem | mushroom groves, spore caves | the Mother Cap (a 60 m mushroom whose gills rain spores) · the Ring of Caps · the Root Throne | spore puff, cap snail, glow toad | drifting spores (magenta, lime) | fungus fossil, giant spore, mycelium net, beetle in amber, puffball, stromatolite | G lydian, 72 |
| 7 | pearl, aquamarine, coral stone; air pockets | drowned streets, flooded halls | the Drowned Procession (statues carrying lanterns into the water) · the Lantern Market · the Sunken Harbour Gate | lantern fish, glass jelly, shell crawler | bubbles rising, caustic light | sea dragon vertebra, giant ammonite, ray wing, shell city tile, plesiosaur tooth, sand dollar | B♭ aeolian, 70 |
| 8 | obsidian, fire opal, sun iron; lava falls | lava tubes, basalt columns | the Forge of the Bearers (an anvil 15 m, a river of lava) · the Basalt Organ · the Ember Throne | magma slug, ember moth, salamander | embers, heat sparks | fire salamander, obsidian fern, ember beetle, molten shell, lava-cast tree, dragon egg | D phrygian, 100 |
| 9 | ivory, ancient amber, void pearl | rib-vaulted halls | the Leviathan (a 200 m skeleton in the backdrop) · the Skull Chapel · the Spine Bridge | bone mite, marrow worm, ghost ray | pale ash, slow | leviathan rib, giant skull, tusk, claw, vertebra, the eye socket | C# aeolian, 66 |
| 10 | amethyst, diamond, prism heart | giant geodes | the Prism Nave (an 80 m geode, light beams splitting into rainbows) · the Diamond Stair · the Heart Geode | prism moth, geode turtle, facet spider | prism glints | crystal skull, diamond fern, prism ammonite, quartz tree, geode egg, starstone | E lydian, 74 |
| 11 | loomthread, starglass, Bearer crystal | archive halls, thread looms | the Archive of Light (shelves of identical crystals receding to the horizon) · the Great Loom (threads of light weaving) · the Hall of Faces | thread spinner, archivist wisp, loom moth | light threads drifting | Bearer mask, loom shuttle, thread spindle, crystal hand, lantern of glass, the Name stone | A lydian, 68 |
| 12 | void stone, star shard, null gem | floating rock islands, upward falls | the Upward Falls (debris falls up) · the Watcher (an aurora with an eye) · the Sky Beneath (the rock ends; a sky of stars below) | void ray, star mote, the Watcher's eye (once) | star dust falling upward | star fossil, void shell, comet fragment, the Bearer's lantern, a constellation key, the last rune | B lydian, 60 |

Block ids: 41–63 shared gems and specials, 64–159 biome blocks (8 per biome: host A, host B, soft,
hard, ore1, ore2, gem, special), 160–175 new light emitters (teal, magenta, lime, aqua, lava, violet,
gold, white-gold, star, sodium), 176–191 seals and Echo specials. The existing ids 1–40 stay (biomes 1
and 2 reuse SLATE, UMBER, SOIL, COPPER_ORE, IRON_ORE, CRYSTAL, ECHO_CRYSTAL). 256 ids are enough until
the end of the first cycle; Echo Cycles reuse the same ids with a palette rotation.

### 5.5 Echo Cycles (4,300 m → ∞)
- Cycle n ≥ 2 replays the 12 biome grammars at 600 m each (7,200 m per cycle), in the order
  `perm(seed, n)` (a Fisher-Yates shuffle that never puts the same biome first twice in a row).
- Each biome of the cycle gets one Echo modifier, `mod = hash(seed, n, biome) % 8`, never the same
  modifier on the same biome in two consecutive cycles:

| Modifier | What changes in the generator | What changes in the look |
|---|---|---|
| Inverted | stalagmites hang, pools on ceilings | debris and particles fall upward; critters walk on ceilings |
| Overgrown | glowcaps from biome 6 on every floor | magenta / lime added to the light budget |
| Frozen | an ice crust (new material) over host rock, icicles | aurora ribbons in vaults; fog +20 % lighter |
| Drowned | water to 40 % of every gallery height | caustics; bubbles |
| Molten | lava veins replace 30 % of ore1 | ember particles; lava falls in vaults |
| Crystallized | 3× crystal and gem nests | cyan / violet budget ×2 |
| Hollowed | caverns 2× larger, 1.5× more frequent | more vista, haze density −30 % |
| Starlit | star motes, a strip of sky in every vault backdrop | the constellation of the cycle in the backdrop |

- Emissive keys rotate in hue by +37° × (n − 1) (rock albedos keep their ramps, so stone still reads as stone).
- Vault set pieces combine the biome's piece with the modifier overlay (the Leviathan, Frozen; the
  Drip Organ, Drowned), 96 combinations.
- Creature variants: a new palette and one part swap per cycle (2 more segments, a second pair of
  wings, glowing spots) from the same rigs (section 10).

### 5.6 What fills the caverns

Cavern grammar (the counts are per biome cycle and checked by `tools/fill-scan.ts`):

| Kind | Size w×h×d (m) | Frequency | Placement | Contents (minimum) |
|---|---|---|---|---|
| Pocket | 3–6 × 3–5 × 3–6 | 1 per 6–10 m | beside the shaft (x < 13 or x > 17), always cutting the front face | 1 hero (chest 40 %, gem cluster 40 %, fossil edge 20 %) + 2–4 dressing props + 1 emitter |
| Gallery (breakthrough) | 12–24 × 6–12 × 10–20 | 1 per 22–40 m | under the shaft: the floor collapses into it | 1 hero (big chest, creature nest or ruin) + 3–6 tappables + 6–12 dressing + 2–3 emitters + 1 particle emitter + 1–3 critters |
| Vault | 32 × 20–28 × 32 | 3 per biome | across the whole slab; back wall z = 31 opened onto the backdrop | the set piece + 8–14 tappables + 1 relic piece + 1 fossil slab + 4–6 halos + god rays + creatures |
| Geode (secret) | sphere r 2–3.5 | 1 per 50–80 m | behind the cut (z 4–12), touching no other cavern | lining of 20–40 gem blocks; revealed by Lantern Pulse or when the shaft passes within 1 block |
| Seam | tube r 0.6–1.2, 6–16 long | 3–5 per slice | crossing the cut face and the footprint | ore1 / ore2 |
| Ruin | 6–14 m | 1 per 60 m | in pockets and galleries | biome structure (Halden timber, masonry, machines) + 1 Halden log or mural |
| Fossil slab | 4–10 m outline | 1 per 40–60 m | in the cut face (z = 0), drawn as a relief with a pale emissive outline | tap 5× when within reach → Codex |
| Pool | floor of galleries | 1 in 3 galleries | water (biomes 2, 3, 7), lava (8), spore mist (6) | ripple plane + emitter |

Tappable objects (all reachable inside the reach band; each gives a burst, loot and a sound):

| Object | Taps | Reward | Notes |
|---|---|---|---|
| Chest: wood / iron / gold / crystal / relic | 3 / 5 / 8 / 12 / 20 | 20 / 60 / 200 / 800 / 3,000 × V(d) gold; gems 0–5; relic chest = 1 relic piece | lid flies, coins fountain (24–60 pellets) |
| Gem cluster (existing crystalCluster prop, recoloured per gem) | 2–4 | gem value ×30, 5 % ◆ | shard burst |
| Ore node | 2 | ore2 value ×3 | |
| Critter | 1–5 (moves) | 15 × V(d), Bestiary count | flees after 6 s |
| Fossil slab | 5 | Codex entry or luster +1 | dust, then the fossil lifts out and flies to the Codex button |
| Relic piece | 1 | relic piece | the piece floats, the screen tints the biome key for 0.4 s |
| Glowcap / stalactite / urn / Halden crate | 1–3 | small gold, music note (stalactite), spores (luck +10 % for 20 s) | |
| Halden log / mural | 1 | Codex entry, 2-line text plate | |
| Your old lantern (from a Rite) | 1 | +1 % Echo power for this run | "Rite #3 — 812 m" |

**Fill rules** (hard minimums, tested on every generated slice):
1. No open volume ≥ 27 m³ visible from the camera without at least 1 dressing prop or 1 tappable in it or on its walls.
2. Every cavern floor ≥ 9 m² has ≥ 1 dressing prop per 6 m² (cap 12).
3. Every cavern has ≥ 1 emitter of the biome's key colour and ≥ 1 tappable.
4. Vein or crystal cover ≥ 8 % of a cavern's wall faces.
5. Every cavern ≥ 50 m³ has 1 ambient particle emitter.
6. In any 8 m of the cut face below the layer there is ≥ 1 find (vein crossing, gem, chest, fossil edge, cavern mouth).
7. Dressing props never sit inside the shaft footprint (they would hide blocks you must tap).

Dressing props (per biome skin, 6 each, from the existing builders where they exist): rocks and rubble,
crystal clusters, bones, roots / cables / chains, Halden crates and barrels, lantern posts and hanging
lanterns, mushrooms, shells, rails and carts, statues, banners, gears.

### 5.7 Density targets (what the player sees per screen)
| Measure | Target |
|---|---|
| Caverns visible on screen (25 m tall view) | 1.5–3 on average, never 0 for more than 16 m of descent |
| Finds in the 14 m preview below the layer | ≥ 3 at any time |
| Lit points (emitters + halos) on screen | biome 1: 4–8; biome 4: 10–18; biome 12: 16–30 |
| Moving things on screen (crew, critters, particles groups) | ≥ 4 at any time |
| Empty-floor share in caverns (floor cells farther than 2 m from any prop or tappable) | ≤ 35 % |

### 5.8 The light budget grows with depth ("restraint first, then démesure")
The art direction's restraint stays the rule of biome 1, and depth spends it:

| Biome | Emitter voxels per 16 m slice | Halos per slice | Key light reach (LIGHT falloff) | Bloom threshold / strength |
|---|---|---|---|---|
| 1 | 4–8 | 2–4 | 0.85 (today) | 1.20 / 0.35 |
| 2 | 6–10 | 3–5 | 0.85 | 1.15 / 0.40 |
| 3 | 8–14 | 3–6 | 0.86 | 1.10 / 0.45 |
| 4 | 14–24 | 5–8 | 0.87 | 1.00 / 0.55 |
| 5 | 10–16 | 4–7 | 0.86 | 1.05 / 0.50 |
| 6 | 18–30 | 6–10 | 0.87 | 0.95 / 0.60 |
| 7 | 14–24 | 5–8 | 0.87 | 1.00 / 0.55 |
| 8 | 20–34 | 6–10 | 0.88 | 0.90 / 0.65 |
| 9 | 12–20 | 4–8 | 0.87 | 1.00 / 0.50 |
| 10 | 24–40 | 8–12 | 0.88 | 0.90 / 0.70 |
| 11 | 28–48 | 8–14 | 0.88 | 0.85 / 0.70 |
| 12 | 16–30 (+ backdrop stars) | 6–10 | 0.88 | 0.85 / 0.75 |

- Per-row tint: 9 `vec4 uRowTint` uniforms (one per 16 m chunk row of the window + 1), read in the
  terrain shader by `floor(vGrid.y / 16)` (no extra fetch). rgb = fill tint, a = blend toward the next
  biome. This gives the glow from below near Seals and blends biomes across a boundary.
- Atmosphere: `LightingRig.updateAtmosphere` blends the presets of the two biomes nearest the camera
  depth (the 40 m around a boundary) instead of the four zone boxes.
- The dig lamp: the existing lantern (the only dynamic light, `LanternField` 32³) hangs 2.2 m above
  the layer and follows it. Dynamite and Seal breaks borrow it: for 0.3 s it jumps to the blast point,
  ×4 intensity, colour (1.0, 0.6, 0.3), then returns.

### 5.9 Vista backdrops (the jaw-dropping reveal)
- Built only for Vaults: the back wall z = 31 is opened, and a backdrop scene is drawn behind the slab
  (z 32–250 m): cave walls as 3 large sculpted heightfield sheets (64×32 vertices each), the set piece
  (VoxBuilder / structure builder, 2–8k triangles), haze cards, and 20–60 halos.
- Lighting is baked into the vertex colours at build time (AO + 4–8 coloured point lights per set
  piece, computed on the CPU in the slice worker), plus the shared `atmosphere()` haze, so the
  backdrop costs no light-volume fetch and no dynamic light.
- God rays: 1–3 additive cones per Vault (16 segments, scrolling noise, depth-faded), 1 draw call.
- Moving set pieces: gear wheels turn (biome 5), the Loom's threads slide (11), the Watcher's aurora
  waves (12), the Leviathan's ribs breathe glow (9): vertex-shader motion only.
- The Other Lantern (section 6.4) is placed in every backdrop, far below, for 1 s of the reveal.

### 5.10 The surface (depth 0)
The very first screen: the slab's top 6 m are the surface at night: the Halden camp (existing props:
campfire, tents, crates, lantern posts, the hoist winch as a headframe over the shaft), a star field
behind, the soil crust below. The first block of the shaft glows warm with "TAP" over it. The
wordmark fades in at the top. No menu before the first tap.

## 6. Discovery, collections, events and the mystery

### 6.1 What counts as a discovery
Every first of something (a biome, a Vault, a creature kind, a fossil, a relic piece, a gem kind, a
log) shows a discovery plate for 2.2 s (the existing discovery notice with index/total), plays the
discovery sound and adds a Codex entry. Repeats raise a counter or a luster.

### 6.2 Collections (the Codex)
| Collection | Size | How | Reward |
|---|---|---|---|
| Fossils | 72 (6 per biome) | fossil slabs in the cut face, galleries | +2 % gold each; repeats raise luster: bronze, silver, gold, radiant, prismatic, void, then +1 star each; each luster tier adds +2 % again |
| Relic sets | 12 × 4 pieces | one piece in each Vault (3) + the Seal hall (1) | a permanent power per set (below) |
| Bestiary | 36 (3 per biome) | tap critters | 1 / 10 / 50 caught → bronze / silver / gold: +5 % find chance per gold |
| Gems | 12 kinds × 5 cuts | gem blocks; the cut is the luster of the block (rough 70 %, cut 20 %, faceted 7 %, brilliant 2.5 %, star 0.5 %) | each first cut +1 ◆ ×cut rank |
| Halden logs | 36 (3 per biome) | ruins | story |
| Murals | 12 | Vault set pieces (tap the mural) | story; a mural pans in the Codex |
| Constellations | 1 per Echo Cycle | completing all 12 biomes of a cycle | lights a constellation in the Sky Beneath; +10 % Echo exponent per constellation |

Relic set powers: 1 Halden Foreman's Kit: offline cap +2 h · 2 Lintel Carvings: Swing +1 level ·
3 Drip Organ Chimes: Frenzy +2 s · 4 the Hand: crit chance +5 % · 5 Foreman's Seal: crew ×2 ·
6 Spore Crown: find chance ×1.5 · 7 Procession Lantern: the Other Lantern's light reveals geodes within 6 m ·
8 Bearer Anvil: Dynamite radius +1 m · 9 Leviathan Eye: Momentum cap +50 % · 10 Prism Heart: gem value ×2 ·
11 Loom Shuttle: Auto-Tapper +2 taps/s · 12 the Last Rune: Echo power ×1.0075 per Echo instead of ×1.007.

### 6.3 Events: the Wonder Director
The Wonder Director (`idle/Director.ts`, pure) schedules time-based events on top of the generated
content so the screen never goes quiet:

- **Find guarantee**: if no new tappable or find has entered the view in the last 10 s of active
  play, it spawns a micro-surfacing within 1 s (a gem glints out of the side wall, a critter crawls
  out of a crack, an ore pebble rolls down the shaft).
- **Events**: one every 45–75 s of active play (uniform), never two at once, the next one announced on
  the Depth Ruler 10 s before:

| Event | Duration | What the player does | Reward |
|---|---|---|---|
| Gem Shower | 8 s | gems pop from the walls; tap them in the air | 6–14 gems' value, 1–3 ◆ |
| Treasure Mole | 6 s | a mole tunnels through the cut face; tap it 5× before it escapes | a gold chest |
| Cave-in | 10 s | boulders fall down the shaft; each tap breaks one | ×3 gold each |
| Moth Bloom | 15 s | a swarm of lumen moths; each moth tapped = +10 % gold (stacks to +100 %) for 20 s | |
| Golden Layers | next 5 layers | the layers turn to gold ore | ×10 value |
| Rune Door | until done | a carved door in a pocket; tap 20× | a relic chest or 10 ◆ |
| Ore Meteor (from biome 4) | 12 s | a meteor falls and embeds in a gallery; tap 15× | a crystal chest |
| Biome special | 10–20 s | 3 Stalactite Song (tap the lit stalactites in order, 4 notes) · 5 Pressure Valves (tap 3 valves before they blow: ×2 crew 30 s) · 6 Spore Burst (tap puffballs: luck) · 7 Pearl Bubbles (tap rising bubbles) · 8 Lava Surge (tap to cool the flow into obsidian) · 9 Bone Rattle (tap the dancing bones) · 10 Prism Alignment (tap 3 crystals to align the beam: ×5 gold 20 s) · 11 Thread Weave (tap the threads in order) · 12 Star Fall (tap falling stars) | listed |

- **Daily Deep Current**: a deterministic daily modifier (seed = the local date) on the current biome
  (one Echo modifier from section 5.5 plus ×2 on one event kind), shown on the title plate. No network.

### 6.4 The mystery: the Other Lantern
**The image**: at the bottom edge of the world view, deep in the haze, there is always a warm point of
light: a halo with a soft pool, pulsing at 0.25 Hz in time with the music's root. It is the Other
Lantern. It is always 300 m below your record, so you never reach it. It is drawn as a halo past the
window, its colour absorbed by the haze of the biome between (so it is amber in biome 1 and pale
gold through the violet of biome 12).

**The rule that ties it to the prestige**: each Rite plants *your* lantern at your record. In every
later run you pass your own lanterns (warm emitters in the wall, "Rite #3 — 812 m", +1 % Echo power).
The Depth Ruler shows them. So the screen holds the trail of your past selves above and the one
lantern you did not plant below. Players will ask whose it is.

**Delivery**: environment first (Vault set pieces, murals), then Halden logs (2 lines each), then the
Codex. No cutscene longer than 3.5 s (the Vault framing).

| Biome | What the player sees | A Halden log (one of three) | What they now believe | The new question |
|---|---|---|---|---|
| 1 Rootsoil | the Halden headframe; a cold camp; a lamp left burning on a crate | "Day 40. Lamp seen below the lift. Nobody of ours is down there." | someone dug here before | whose lamp? |
| 2 Slate | carved lintels; columns built *down* | "The masonry is older than the rock around it. That cannot be." | someone built down here, long ago | who built down? |
| 3 Verdigris | the Drip Organ: stalactites tuned to a scale | "Hit one and the light below answers. Same note." | the deep answers sound | what is answering? |
| 4 Glimmer | the Hand in the Crystal | "The crystals grew after the builders. Along their paths." | crystals grew from the builders | are the crystals them? |
| 5 Works | Halden crushers full of glimmer; the foreman's office | "Quota doubled. The crushers sing now. Men walk down at night and do not come up." | the Halden mined the crystals for profit | where did the Halden go? |
| 6 Undergrove | lanterns grown over by mushrooms, still lit | "Fourteen lamps planted at the Mother Cap. One of them moves." | someone keeps lamps alive down here | who tends them? |
| 7 Buried Sea | the Drowned Procession: figures carrying lanterns into the water, the last ones made of light | "They were not fleeing. They were walking home." | the builders went down on purpose | where is home? |
| 8 Ember | the Forge: lanterns forged, thousands, in racks | "They made a lamp for every one of them." | each builder had a lantern | why a lantern each? |
| 9 Bone | the Leviathan, with a lantern hung in its eye socket | "Even the great bones carry a light." | everything down here carries light | — |
| 10 Geode | the Prism Nave: one light split into many | "One light becomes many. Many become one?" | the lights are joined | — |
| 11 Loom | the Archive: shelves of identical crystals; every glimmer shard was one of them | "We crushed them. We crushed them for lamp oil." | the crystals are the builders, kept as light | what did they become next? |
| 12 Starless Gate | the rock ends; below is a sky of stars; the Other Lantern is a star, held by a figure of light | the last page: "It is not a lamp. It is a door, held open." | they became stars, and one waits for you | (cycle 2) what is below the stars? |

**Echo Cycles**: each cycle the Other Lantern is again 300 m below the record, now among the stars of the
Sky Beneath backdrop. Completing a cycle lights one constellation (named after a rune: Descent, Eye,
Lantern, Chasm, Spire, Waves, Gate, Star, then procedural names). The Codex shows the sky filling. One
new mural line per cycle. There is no last line.

## 7. Guidance

### 7.1 Tutorial script (first 3 minutes)
The tutorial is the game. One instruction at a time, never more than 6 words on screen, a pulsing
finger, and nothing is locked except the dock tabs that are not explained yet.

| Time | Trigger | On screen | Player action | Result |
|---|---|---|---|---|
| 0:00 | launch | the surface at night; the first block glows; finger over it; "Tap to dig" | tap | the block breaks in 1 tap; 1 gold flies up; the Gold counter appears with "+1" |
| 0:02 | 3 blocks broken | "Clear the layer" over the remaining blocks | taps | the layer clears; the shaft drops 1 m; the objective strip slides in: "Open the chest" |
| 0:05 | the wood chest (fixed at 2 m) is in the layer | finger on the chest | tap 3× | coins fountain; 60 gold; first ◆ |
| 0:12 | 120 gold | the Pick card rises from the bottom, glowing; finger on Buy | buy | the pick head turns copper; "10 → 20" pops over the avatar |
| 0:20 | the iron chest (fixed at 8 m) enters the preview | its icon on the Depth Ruler; "Treasure ahead" | dig | |
| 0:35 | iron chest in reach | finger on it | tap 5× | 200 gold, and a Digger slides down a rope out of the chest's light and starts swinging; plate: "Your crew digs even when you're away" |
| 0:45 | 4 taps/s for 2 s | the Frenzy bar lights on the left edge; "Tap fast!" | fast taps | at 20 combo: FRENZY ×2, amber edges |
| 1:00 | pocket with 3 crystals in reach (fixed at 14 m) | sparkle outlines; "Tap the crystals" | taps | shard bursts, bonus gold |
| 1:15 | Swing affordable (1.8K) | Swing card glows | buy | strike hits 2 blocks; a short arc |
| 1:30 | | the Dynamite button appears with one free charge; finger | tap | a 1.5 m blast, shake, 3 layers gone |
| 1:45 | 25 m | a Lantern Post is planted with a chime; plate: "Every 25 m: a reward" | | a chest drops on the layer |
| 2:00 | 40 m (first Vault, tutorial slice) | the floor cracks; "Something below…" | taps | breakthrough: the floor collapses into the Halden Headframe Vault; Vault framing 3.5 s; title plate "The Halden Headframe" |
| 2:20 | in the Vault | sparkles on the relic piece and 4 tappables | taps | the first relic piece; the Codex button appears |
| 2:40 | | objective: "Reach 120 m"; the Depth Ruler shows the Seal icon at 120 m | dig | |
| ~3:00 | Seal (at 3–5 taps/s with the crew) | "Break the Seal! 0:30" | tap fast | the Seal sinks, cyan light floods up, "SLATE GALLERIES — 120 m"; the tutorial ends; every dock tab is open |

The tutorial slices (0–45 m) are generated with fixed placements (wood chest at 2 m, iron chest with
the Digger at 8 m, crystal pocket at 14 m, Vault at 40 m) under the normal grammar, so the first run
always has the same rhythm. The "Hire a Digger" objective comes at 1:20, when 600 gold is in hand.

### 7.2 The always-visible objective
- The objective strip (section 8) always shows exactly one objective: icon, ≤ 32 characters, a progress
  bar, the reward chip. Completing it pops the reward and slides the next one in (0.3 s).
- Objectives 1–30 are scripted (the tutorial, then: own 10 diggers, reach the first Vault of biome 2,
  find 3 fossils, catch a creature, open a Seal, use Frenzy at 50 combo, buy Shaft Width…).
- After 30, the generator rotates 7 kinds so two in a row are never the same kind: reach depth (the
  next Lantern Post, Vault or Seal), buy N levels, own N crew of the newest tier, find K things in this
  biome, catch a creature, finish an event, complete a relic set. Rewards: 1–5 ◆ or a chest.

### 7.3 The Depth Ruler (next-goal bar)
A vertical ruler down the right edge (8 px wide plus icons), covering the next 60 m below the layer:
ticks every 5 m, labels every 25 m, icons for what the generator placed: chest, Vault, Seal,
Lantern Post, an event (10 s ahead), your old lanterns, and at the bottom the Other Lantern's dot. The
next milestone is highlighted with a bar filling toward it. It answers "what's next" without words.

### 7.4 Hints (one at a time, priority order)
| Condition | Hint |
|---|---|
| No tap for 8 s while the layer is not clear | the finger pulses over the layer |
| An upgrade affordable for 6 s and not bought | its card glows and lifts 4 px; the dock opens if collapsed |
| A tappable in reach for 5 s and not tapped | sparkle ring around it |
| An event running and not touched for 3 s | arrow from the screen edge |
| Descent median < 0.1 m/s for 60 s and a Rite gives ≥ ×2 | the Rite tab glows: "Plant your lantern?" |
| A Seal failed | "Seal 64 % — try again stronger" + the best card glows |
Hints never stack and never cover the layer.

## 8. Portrait UI layout (390×844 CSS px; others scale)

| Region | Box (x, y, w, h) at 390×844 | Contents |
|---|---|---|
| Safe top | 0, 0, 390, inset | |
| Top bar | 0, inset, 390, 56 | Gold (left: coin icon 22 px + number in Lintel 24 px), Depth (centre: "1,284 m" Lintel 30 px, biome name 11 px under), Gems (right: 18 px) + settings octagon 36 px |
| Objective strip | 12, inset+60, 366, 40 | octagon plate: icon 24, text 15 px, progress bar 6 px, reward chip |
| Frenzy meter | 6, 150, 10, 360 | vertical, fills amber; ticks at 20 / 50 / 100 |
| Depth Ruler | 370, 150, 14 (+ icons 22 px to its left), 360 | section 7.3 |
| World region | full screen behind; framed area 104 → 676 | the layer at 40 % of the framed area (y ≈ 333) |
| Ability buttons | right column at x 318: Dynamite 60 px octagon at y 530, Lantern Pulse 52 px at y 462 | cooldown sweeps |
| Event / discovery plates | 24, 190, 342, 64 | fade 0.2 s |
| Dock | 0, 676, 390, 168 + safe bottom | tab row 40 px (Tools, Crew, Lantern, Codex, Rite) with ×1 / ×10 / Max on the right; 3 cards 118 × 116 px (icon, name, level, effect delta "+40 dps", Buy button 102 × 40 with the price) |
| Dock collapsed | 0, 780, 390, 64 | the best card only; opens on tap or when a card becomes affordable |

Rules: every button ≥ 48 × 48 px (the existing ui-check audit); no UI inside the shaft column
(x 120–270) between y 230 and 500, so the layer is never covered; numbers right-aligned and tabular
(the Lintel face's digits are tabular); the dock collapses after 6 s without dock input while the
player taps the world; it never collapses while a card is affordable and unbought for the first time.
360×740: the dock is 152 px, cards 108 px wide. 412×915: cards 126 px wide; the framed area is taller
(more preview). Landscape is not supported (the shell locks portrait).

## 9. Juice and feel

| Moment | Visual | Camera | Hit-stop | Sound | Haptic (ms) |
|---|---|---|---|---|---|
| Tap, no break | 3–6 chips, dust puff, crack stage +1 (TargetMarker, 10 stages), white number 18 px rising 40 px in 0.6 s | — | 0 | hit by material, pitch +1 semitone per 5 combo | 9 (min gap 60) |
| Block break | 10–18 debris, a 0.4 m flash, 3–8 loot pellets arcing to the counter (0.45–0.7 s, ease-in), counter pulses 1.15× | trauma +0.04…0.25 (tool form) | 0 (35 on crit) | break by material | 18 |
| Crit | gold number 26 px, star spark | +0.05 | 35 | bright tick | 18 |
| Layer clear | the layer's floor flashes 0.15 s, dust skirt | spring down 1 m | 0 | short chord (biome mode, degree by depth mod 7) | 25 |
| Breakthrough | the floor collapses: every block left above the cavern falls as debris (≤ 60), dust wave, the cavern's emitters fade in over 0.5 s | drop with ω 6 + 0.12 m bounce; trauma +0.6 | 80 | rumble + low boom + rising choir | [30, 40, 60] |
| Vault reveal | the back wall's last rock crumbles, god rays fade in, title plate in the Lintel face, letter by letter (40 ms each) | 3.5 s framing, 0.4× time for 0.6 s | — | the biome's motif, 4 bars | [20, 60, 40] |
| Seal break | the Seal's rows sink 0.3 s apart, the next biome's light floods up, white flash 0.2, ring shockwave 6 m | trauma +0.8 | 120 | fanfare + choir | [40, 60, 40, 60, 80] |
| Chest open | lid flips, 24–60 coins fountain, the biggest gem spins in the air 0.6 s | +0.1 | 40 | coin cascade | 22 |
| Frenzy start / Overdrive | amber edge glow 0.3 → 0.6 alpha; Overdrive: screen-edge sparks, bloom strength +0.2 | +0.1 | 0 | rising whoosh | [15, 30, 15] |
| Dynamite | flash, fireball (12 additive quads), 40 debris, ring | trauma +0.45, FOV +2° for 0.25 s | 60 | boom | [50, 30, 40] |
| Purchase | the card flashes, "+1" flies from the card to the target (pick, crew) | — | 0 | ui click + up-tick | 12 |
| Tool Ascension | the avatar raises the new tool, light burst, plate "MATTOCK" | push-in 10 % for 1 s | 150 | anvil + choir | [30, 50, 30, 50, 90] |
| Rite | the lantern is planted; whiteout 0.5 s; then the Plunge tunnel | — | — | bell, then rushing wind | [60, 100, 60] |

- Trauma model: offset = trauma² × 0.35 m, roll = trauma² × 1.2°, decay 1.6 per second; shake off at 0
  with the Reduce Motion setting (flashes halved, no FOV kick).
- Loot pellets: screen-space instanced quads (1 draw), up to 96 alive; above that, pellets merge (each
  carries more), so 40 breaks per second still read as a stream into the counter.
- Breaks per frame: more than 6 breaks in one frame (high Swing, Quake, Overdrive) become one "layer
  burst" (one dust wave, 24 debris, 3 gem pops) so the particle budget holds.
- Numbers: instanced glyph quads from a digit atlas rasterised from the Lintel stroke font
  (`strokeFont.ts`) at boot, 1 draw call, up to 64 numbers; big numbers abbreviated (3 significant digits).
- Music: per-biome mode and tempo (section 5.4 table) through the existing `MusicScheduler`; the
  Frenzy adds a percussion layer; a Seal fight doubles the tempo of the percussion.

## 10. Technical plan (reuse the engine)

### Keep as is
`VoxelWorld` (+ `openFront`), `LightField` (local recompute and partial upload), `LanternField`
(the dig lamp), the mesher and mesh workers (+ `originY`), `ChunkRenderer`, terrain material system
and painters, `StructureRenderer` and builders (columns, stairs, bridge, coping for Lantern-bearer
ruins), `PropRenderer` and prop builders, `ParticleSystem`, `DebrisSystem`, `HaloSystem`,
`TargetMarker`, `PostFX`, `QualityGovernor`, `FrameGuard`, audio (synth, sfx, music scheduler),
haptics, the brand (`src/ui/brand/**`, `ui.css` plates, the Lintel face, wordmark, item icons),
`SaveSystem` (two slots, checksums), the crash panel, the Android shell, release tooling.

### Add
| File | Role |
|---|---|
| `src/idle/lg.ts` | log10 numbers: add, sub, mul, compare, format (K…T, aa…zz, then e-notation) |
| `src/idle/Economy.ts`, `src/config/idle.ts` | formulas and every number of section 4 |
| `src/idle/Upgrades.ts`, `Crew.ts`, `Charms.ts`, `Rite.ts`, `EchoTree.ts` | pure state and rules |
| `src/idle/Offline.ts` | closed-form offline digging with the first-sight rule |
| `src/idle/Director.ts` | the Wonder Director: find guarantee, event scheduler, daily current |
| `src/idle/Objectives.ts`, `Tutorial.ts`, `Hints.ts` | section 7 |
| `src/idle/Codex.ts` | collections, lusters, set powers |
| `src/world/shaft/ShaftWindow.ts` | the 32×128×32 window, shift, origin, slice requests |
| `src/world/shaft/sliceGen.ts`, `strata.ts`, `veins.ts`, `caverns.ts`, `fill.ts`, `seals.ts` | section 5.3 and 5.6 |
| `src/world/shaft/biomes.ts` | the biome table (look and content), Echo Cycles and modifiers |
| `src/world/shaft/sliceWorker.ts` | generation + backdrop vertex-light bake off the main thread |
| `src/render/materials/biomes.ts` | painters for the new layers (≈ 40: 8 per biome for the biomes that do not reuse today's layers, minus shared) |
| `src/render/backdrop/Backdrop.ts`, `setPieces/*.ts` (36 pieces), `godRays.ts`, `plungeTunnel.ts`, `skyBeneath.ts` | section 5.9 |
| `src/render/props/idleModels.ts` | chest tiers, gem clusters per gem, fossil slab, relic pieces, ore node, glowcap, stalactite, urn, seal |
| `src/game/creatures/rigs.ts`, `CritterSystem.ts` | 4 rigs (crawler, flyer, swimmer, floater) × part grammar → 36 kinds + cycle variants, instanced, ≤ 12 alive |
| `src/game/crew/CrewView.ts`, `crewModels.ts` | 12 instanced crew models, a per-instance swing phase attribute |
| `src/game/IdleGame.ts` | the frame loop and flow (replaces Game.ts) |
| `src/game/ShaftCamera.ts` | section 5.2 |
| `src/game/DigController.ts` | tap resolution (section 2), Swing patterns, Frenzy, Momentum |
| `src/game/effects/LootFlight.ts`, `NumberPops.ts`, `Shockwave.ts`, `GhostTool.ts` | section 9 |
| `src/ui/idle/TopBar.ts`, `ObjectiveStrip.ts`, `DepthRuler.ts`, `Dock.ts`, `Codex.ts`, `RiteScreen.ts`, `WelcomeBack.ts`, `TitlePlate.ts` | section 8 |
| `src/i18n/en/idle.ts` | every string (biome names, logs, events, cards) |
| `src/save/idleSave.ts` | save v3 |
| `tools/idle-sim.ts`, `tools/fill-scan.ts`, `tools/descent-capture.mjs` | section 11 |

### Replace
- `Game.ts` → `IdleGame.ts`; `CameraRig.ts` → `ShaftCamera.ts`; `TapController.ts` → `DigController.ts`.
- `MiningController.ts`: keep `pick()` and the debris/drop hooks; drop reach, aim assist and hold mining.
- `gameplay/Mining.ts`: keep `MiningProgress` per block key, damage as lg numbers, no tiers.
- `WorldSession.ts`: built on `ShaftWindow` instead of a zone layout.
- `LightingRig.updateAtmosphere`: biome blend by depth (section 5.8). `ATMOSPHERES` → 12 biome presets.
- `Drops.ts` → `LootFlight` (world-to-screen pellets).
- `ui/TouchControls.ts`: world taps and the vertical pan only; the joystick, look drag and buttons go.
- `save/types.ts`: v3 (`MIGRATIONS[2]` turns a v2 save into a v3 save with 500 gold and the Halden
  Foreman's Kit compass piece as a welcome-back gift; nothing else carries over).

### Delete
`PlayerController.ts`, `touchCamera.ts`, `aimAssist.ts`, `ropeRide.ts`, `WorldFeatures.ts`,
`Stations.ts`, `Survey.ts`, `Progression.ts`, `MenuCamera.ts` (the surface replaces the menu),
`gameplay/{Cold, Health, Lantern, Expedition, CacheSpot, Inventory, Storage, Crafting, Equipment, Tree, NextStep, Records}`,
`world/gen/{generateWorld, progression, zoneLoader, zoneWorker}`, `world/gen/features/*`,
`world/analysis/{homeField, reachability, economy}`, the UI screens workbench, inventory, board,
summary, ending, and their tests. Keep `runeDoor.ts`'s row-sink timing (move it to `seals.ts`) and
`moths.ts` (lumen moths become biome 1–4 critters and the Moth Bloom event).

### Performance budget (Balanced, 390×844, Mali-G68 / Adreno 642L class)
| Item | Budget | Basis |
|---|---|---|
| Frame | 16.6 ms; CPU ≤ 6 ms | |
| Render resolution | DPR cap 2.0 × scale 0.9 (≈ 702 × 1519) + a 5-tap contrast-adaptive sharpen in the composite (strength 0.35); High: 2.5 × 1.0 + MSAA 4×; Battery: 1.5 × 0.85, no bloom, 30 fps | today's Balanced is 1.75 × 0.9; the world is 25× smaller, so the saved vertex work pays for the pixels |
| Draw calls | ≤ 120 | 32 chunks + ≤ 60 props + ≤ 4 crew + critters 1–3 + particles 3 + halos 1 + loot 1 + numbers 1 + backdrop 2–6 + post 6 |
| Triangles | ≤ 160k | chunks 60–110k, backdrop ≤ 30k, props ≤ 20k |
| Light | local update ≤ 0.3 ms per break; window shift ≤ 6 ms (once per 32 m) | today: 0.06–0.3 ms per edit, 280 ms for 3.3 M voxels → ≈ 11 ms for 131 k |
| Slice generation | ≤ 8 ms per 16-row slice in the worker | |
| Mesh | ≤ 1.4 ms per chunk in the workers (today 0.66–1.4) | |
| Particles | High 400 / Balanced 220 / Battery 120 (unchanged), layer bursts above 6 breaks per frame | |
| Memory | world + light + meshes ≤ 40 MB | |

### Risks
| Risk | Mitigation |
|---|---|
| Window-shift hitch | spread over 2 frames (copy + light on frame 1, upload + chunk moves on frame 2), run while the camera eases; `__DD__.idle.shiftMs` measured in e2e |
| Seam cracks after a shift | `originY` in the mesher; the existing seam-key test extended to shifted windows (byte-identical) |
| Float precision at depth | the 7,600 m shader wrap; lg numbers for the economy |
| Break storms at high Swing / Overdrive | per-frame batching into layer bursts; loot pellet merging |
| Content volume (12 biomes, 36 set pieces, 36 creatures, ≈ 40 material layers) | grammars (cavern, creature rig × parts, set piece = shared builders); delivered in 3 waves: biomes 1–4, 5–8, 9–12 + Echo Cycles |
| Material atlas size (30 → ≈ 70 layers: 4.6 MB) and paint time | paint a biome's layers when the record comes within 300 m of it, upload them into reserved layers (`texSubImage3D` on the array) |
| Tiny back-row targets (the 2 back rows of the layer) | nearest-block snapping: a tap is never wasted |
| Cut-face readability | section shading in the terrain shader: front faces at z = 0 get albedo ×1.2 and a contour hairline every 4 m of depth, so the cut reads as a drawn section |
| Runaway or stalled prestige | `idle-sim` day targets in CI |

## 11. Acceptance metrics (each one a test or a simulation)

| # | Metric | Threshold | How |
|---|---|---|---|
| 1 | First tap breaks a block | 1 tap at 0 m | unit (Economy) |
| 2 | First purchase | ≤ 15 s at 3 taps/s with the tutorial chest | `idle-sim --tutorial` |
| 3 | Purchases in minute 1 | ≥ 6 at 3 taps/s with the tutorial chests | `idle-sim --tutorial` |
| 4 | Biome 2 / 3 / 4 reached | 2–3 / 5–9 / 25–35 min at 3–5 taps/s | `idle-sim` |
| 5 | Longest purchase gap | ≤ 60 s in min 0–5; ≤ 240 s in min 5–60 | `idle-sim` |
| 6 | Median descent | ≥ 0.6 m/s min 1–5; ≥ 0.12 m/s min 5–30 | `idle-sim` |
| 7 | 3-day calendar | biomes 1–6 on day 1, ≤ 9 by day 2, ≤ 12 by day 3 (4 sessions/day of 10–30 min) | `idle-sim --days 3` |
| 8 | Rite growth | record +15–35 % per Rite until 4,300 m; never 2× | `idle-sim` |
| 9 | A tap is never wasted | 1,000 random taps over the world region all damage something | e2e (CDP touch) |
| 10 | Find cadence | a new tappable or find enters view at least every 10 s of active play, 30 min run | e2e with `__DD__.idle.findsLog` |
| 11 | Events | one every 45–75 s, never overlapping | unit (Director, 10 h simulated) |
| 12 | Fill rules 1–7 | 0 violations over 2 full cycles (8,600 m + 7,200 m) | `tools/fill-scan.ts` |
| 13 | Shaft guarantee | 0 unbreakable cells in the footprint; every layer breakable | unit over 10,000 slices |
| 14 | Determinism | the same slice bytes for the same seed and index, in Node and the worker | unit |
| 15 | Window shift | blocks, light and meshes equal a fresh build of the same depth (byte-identical) | unit |
| 16 | Shift cost | ≤ 6 ms main thread (SwiftShader ×3 tolerance) | `tools/perf.mjs` |
| 17 | Frame | ≤ 16.6 ms p95, ≤ 120 draw calls, ≤ 160k triangles over a 5 min descent through biomes 1–4 | `tools/perf.mjs` + `descent-capture.mjs` |
| 18 | Offline | 8 h away → depth and gold equal to the step simulation ±1 %; never past record + 25 m or an unopened Seal | unit |
| 19 | Tutorial | an e2e bot tapping 4 taps/s and buying every glowing card reaches the Seal at 120 m in ≤ 4 min with every step shown in order | e2e |
| 20 | Objective | exactly one objective visible at every frame after the first tap | e2e |
| 21 | Layout | every control ≥ 48 px; nothing over the shaft column between y 230 and 500; no overlap at 360×740, 390×844, 412×915 | `tools/ui-check.mjs` |
| 22 | Light budget | emitters per slice inside the section 5.8 range per biome | `tools/fill-scan.ts` |
| 23 | Visual | captures of the 12 Vault reveals and 12 Seals; luminance and hue checks (key-light hue within ±12° of the biome key, no clipped area > 3 %) | `descent-capture.mjs` |
| 24 | Big numbers | format and arithmetic correct to 3 significant digits up to 10^5000 | unit (`lg.ts`) |
| 25 | Save | v2 → v3 migration; v3 round-trip; offline timestamp survives a crash | unit |
