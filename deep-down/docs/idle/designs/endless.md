# DEEP DOWN: the endless descent (design KEY `endless`)

Angle: endless progression and late game. This document covers the whole game, with the
most depth on what makes hour 10 and day 30 as gripping as minute 1: prestige layers that change
how you play, mechanics that keep unlocking, a world that never stops escalating, and absurd power
that you can see on screen.

All economy numbers below come from a headless calibration simulator I ran for 40 in-game days
(log10 arithmetic, 1 s steps while playing, 60 s steps while away, a greedy buyer, and a player
model with 3 sessions a day). Section 4.10 gives its results and Appendix A gives its rules, so the
build team can re-implement it as `tools/sim-economy.ts` and keep it as an acceptance test.

---

## 0. The pitch in one paragraph

You tap the rock at the bottom of a lit shaft. Blocks burst, numbers fly, and ore streams into
your counter. A crew appears on the shaft walls and digs with you, even when the phone is in your
pocket. Every 100 m the rock changes into a new biome, and a Guardian blocks the way. Breaking it
gives you a Boon (choose 1 of 3) and opens a living cavern behind the shaft. Pushing deeper pays
off in four nested loops: **Run** (minutes), **Rekindle** (tens of minutes), **Collapse** (hours)
and **Ascend** (days). The descent never ends. You dig through the Earth's crust, the mantle and
the core. Then each Ascension takes you through a bigger world: Neptune, Jupiter, the Sun, blue
and red giants, a black hole, the heart of the galaxy, and finally the Lantern at the end of the
mystery. The depth counter goes from metres to light-years, and the damage numbers go past
`e800`.

---

## 1. Core loop at three scales

### 1.1 The 10-second loop (always available, one finger)

| Second | What happens | Feedback |
|---|---|---|
| 0.0 | Tap or hold on the front row of the shaft | Pickaxe ghost slams, chip sparks, a damage number |
| 0.0-0.5 | The block breaks (1-3 hits early) and extra damage carries into the next blocks | Hitstop of 35 ms, a burst of debris, ore chunks fly to the counter in 0.45 s |
| 0.5-3 | A row of 7 clears and the camera eases down 1 m | A light sweeps along the row, "ROW" text, pitch-rising clack |
| 3-10 | A special block (vein, chest, geode, golden vein) or an event (mole, moths, cave-in) appears within 3 rows of the front | A glint, a ping, and a ring around the block on screen |

The rule that makes it "punchy": **damage overflows**. Damage left over after a block breaks
moves on to the next block in dig order. A strong tap therefore clears several blocks, then whole
rows, then hundreds of rows. The scaling becomes visible without any new rule.

### 1.2 The 3-minute loop (one run segment)

1. Buy upgrades with the best-buy card. Simulated: 7 level-ups in minute 1 and 160 in the first
   10 minutes (one every 3.8 s). The card bundles them "to the next milestone", so the player taps
   BUY about every 8-20 s.
2. Reach the next 100 m: a Guardian appears, you break it, and you pick a Boon (1 of 3). The
   biome reveal plays (1.5 s), and the Lantern Path gives one Wick, a permanent reward.
3. Every 25 m inside a biome there is a "stratum gate": a guaranteed chest row.
4. An event fires every 45-75 s.

### 1.3 The 3-day loop (prestige layers)

| Layer | Button | First available (sim) | Cadence once unlocked | Resets | Gives | Changes how you play |
|---|---|---|---|---|---|---|
| Run | none | 0:00 | continuous | none | Ore, Boons, Wicks | tap, buy, choose boons |
| Rekindle | flame chip, top right | 17 min (400 m) | 8-20 min manual, then automatic | depth, Ore, shop levels, Boons | Embers (+10 % power each) | short sprints, Lantern Path milestones |
| Collapse | the Lintel Gate at 1,000 m | day 3 (session 2) | about 3 a day | Embers too | Echoes (x1.04 power each, compounding; x(1+Echoes) Embers) | Guilds (playstyle), Trials (challenges), automation Laws |
| Ascend | the Core of each world | day 9 | every 3-5 days, settling at 3 | Embers, Echoes, Guild | Stars, a new world, a Constellation perk | each world adds a permanent new mechanic; depth units grow |

Days are calendar days of play: day 1 is the day of install. "Day 3, session 2" means the
afternoon of the third day.

### 1.4 What keeps it endless

1. **HP is set by biome, not by metre.** Block HP is multiplied by 10 for every biome
   (`H = 4 x 10^b` on Earth), and biomes get longer with depth (100 m up to 400 km on Earth). Late
   power therefore turns into huge speeds. A dive of thousands of rows per tap is the normal late
   game, not a bug.
2. **Compounding at exactly one layer.** Echoes multiply by 1.04 each, compounding, and are the
   only exponential lever. Every other layer is polynomial (Embers +10 % each, additive) or capped
   (the Lantern Path: x1.05 per Wick for 84 Wicks, then x1.005). The simulation never runs away
   and never stalls: across 40 days, the deepest biome reached grows by at least 1 biome every day.
3. **Worlds repeat the structure and raise the stakes.** Each Ascension resets you into a bigger
   world with the same 84-biome ladder. HP growth is 4 % steeper per biome in each new world, Star
   perks speed you up, and the time per world settles at about 3 days (simulated: 8.4, 5.0, 4.6,
   4.0, 3.4, 3.6, 3.2, 3.0, 3.0 days).
4. **Something new unlocks forever.** There is a Lantern Path reward every new biome (84 per
   world). Crew tiers are endless: on day 1 a new one arrives every 4-25 minutes; from day 3 each
   run climbs 16 to 46 tiers, so every run replays the escalation from a Digger to a Galaxy
   Engine in minutes. There is also a new Guild,
   Trial tier, Law or Constellation every session, and a new world mechanic every Ascension.

### 1.5 What a session looks like at minute 1, hour 10 and day 30

| When | The player opens the game and... | The thrill |
|---|---|---|
| Minute 1 | taps, breaks 1-hit blocks, buys the pickaxe from the first chest, hires a Digger at 0:52 | punchy feedback, a counter that never stops moving |
| Hour 1 (day 1) | pushes run 4 past 500 m, picks Boons at each Guardian, buys the Cart Crew and the Lantern Sprites, Rekindles for x2 | short runs, every 100 m a permanent Wick, the record line |
| Hour 4 (day 3, session 2) | reaches the Lintel Gate at 1,000 m, Collapses for the first time, picks a Guild (Strikers for an active session) | the rebuild is fast: with Ember gain x16, the second run after the Collapse already reaches 738 m in 8 minutes, and the next session opens at 1,600 m, past the old record |
| Hour 10 (day 6) | collects the return screen (Gold Rush, 6 chests, about 40 Auto-Rekindles done while away), dispatches 3 Expeditions, attempts Trial 3 Rush (5 minutes), Collapses (+33 Echoes), switches to the Crew Union Guild for the night | after the Collapse, run 2 reaches biome 29.7 (10 km) in 8 minutes and run 3 reaches biome 36.3 (17.7 km) in 9 minutes: rows clear per tap, Dives cross whole biomes, and the crew climbs to about 46 tiers; the Ember Sea Wonder (76 km) |
| Day 10 (world 2, Thalassa) | Ascended the evening before with a Constellation pick (Ember Heart): the first 3 runs on Neptune reached biomes 8.5, 12.1 and 14.2 in 24 minutes, where Earth needed 2 days to pass biome 9. This morning: a Collapse, then runs to biomes 10.3, 18.0 and 22.3 in 24 minutes, with the new Water mechanic (currents carry loot to eddies worth x5) | everything known looks new: drowned palette, Diver Eels crew, depth now in units of 3.86 m per row |
| Day 30 (world 7, Stephenson 2-18) | the shaft is 11 blocks wide (Vastness), with 36 crew models on screen; Auto-Collapse and Echo Dive handle the base loop; the session is about choosing the Guild Pact, pushing a Trial gold tier and opening the last relic doors of the stratum set | numbers past e600, depth in AU, Titan Hand blows from off-screen, 9 Collapses per world instead of 19 |

### 1.6 Unlock calendar (sim plus the unlock rules of section 4)

| Day | New things the player meets |
|---|---|
| 1 | tap and hold, pickaxe tiers 1-4, crew tiers 0-3, Shockwave, Dynamite, Expeditions, Rekindle, Frenzy, Night Shift, Boon reroll, Magnet, events (Golden Vein, Mole, Moths, Cave-in), ghost race |
| 2 | Daily Delve and daily quests, relic set bonuses (Wick 9), crew tier 4, Ember Wisps |
| 3 | the Lintel Gate (1,000 m), first Collapse, Guilds, Foreman autobuy, offline 100 % and 24 h, the Glimmer Cathedral Wonder (1,200 m), Resonance I, Long Shift, Trials |
| 4 | Auto-Rekindle, +1 Expedition slot, Guild Pact, Meteors, the Sunken Lintel City (4,200 m) and the Titan's Skull (16,200 m), the Kola marker, Resonance II, Golden Touch |
| 5 | +1 Boon choice, the Moho marker, Resonance III |
| 6 | Echo Dive, the Ember Sea (76 km) |
| 7 | Auto-Collapse, the Frozen Ocean of the Mantle (376 km) |
| 8 | the Clockwork Heart (1,576 km), the outer core |
| 9 | the Core Lantern Wonder, Ascend, world 2, the first Constellation, skills auto-cast |
| 10-40 | a new world every 3-5 days (each with its mechanic, crew tier, palette set, relic set and real-scale markers), a Constellation each, Law 1,000 on day 26, Guilds 4-6 from Trial gold tiers |

---

## 2. The tap

### 2.1 What one tap does

| Step | Rule | Number |
|---|---|---|
| Target | The diggable block under the finger. Within 36 CSS px it snaps to the nearest block in the front band (the lowest 2 open rows). A tap on air in the shaft hits the front-row block in the same column. | No tap is ever wasted |
| Hit rate | Each tap = 1 hit, up to 12 taps/s counted. Press and hold = 6 hits/s on the block under the finger; sliding the finger moves the target. | The sim assumes 4 hits/s on average during a session |
| Damage | `hit = (4 + 2L) x 2^m(L) x M_tap x M_all x combo x crit + tau x crewDPS` | L = pickaxe level, `m(L) = [L>=10] + floor(L/25)` |
| Crit | 5 % chance, x10 (Lantern Path raises both) | gold number, 60 ms hitstop |
| Combo | A hit within 0.6 s of the previous one adds 1, up to 50; multiplier `1 + 0.02 x combo` (max x2); it ends after 1.2 s without a hit | The combo meter sits under the pickaxe icon |
| Overflow (pierce) | Leftover damage moves on in dig order: the rest of the front row, nearest to the target first, then the next row down starting under the tapped column | Unlimited inside the loaded shaft |
| Area (Shockwave upgrade) | Neighbours take `f x hit` on top of it (not subtracted from it) | f and radius in 4.2 |
| Dive | If one step's damage would clear more than 96 rows, the game computes the landing depth in closed form and plays a Dive (5.7) | Late game: 10^3 to 10^9 rows per tap |
| Resonance (tau) | From Lantern Path Wick 12: each hit also deals tau seconds of crew DPS (Wick 12: 0.05 s, Wick 25: 0.2 s, Wick 40: 1 s) | Keeps tapping relevant at any depth |

### 2.2 How the visible effect scales

`R = hit damage / HP of the target block` picks the tier of the visual.

| R | What you see | Hitstop | Shake (px) | Haptic |
|---|---|---|---|---|
| < 1 | Chip, crack stage +1..+9 (TargetMarker 10 stages driven by remaining HP) | 0 | 0 | 8 ms |
| 1-7 | Break, pierce flashes jump to the next blocks | 35 ms | 1.5 | 18 ms |
| 7-70 | The whole row shatters left-right in 120 ms | 45 ms | 3 | 30 ms |
| 70-7,000 | Multi-row blast: rows collapse with a 0.25 s drop and "x12 ROWS" text | 60 ms | 6 | 40-20-40 ms |
| > 7,000 | Dive: speed lines, FOV kick 50 to 58 degrees, biome names flash by, the depth counter spins | 0 (motion instead) | 4 sustained | pattern [30,40,30,40,60] |

### 2.3 The tool grows on screen

The pickaxe ghost that slams at the tap point grows with the pickaxe tier. There is one tier every
25 levels, 13 named tiers, then recoloured "+n" tiers forever.

| Tier (levels) | Name | Ghost length | Material | Extra on hit |
|---|---|---|---|---|
| 1 (0-24) | Tin Pick | 0.6 m | iron grey | sparks |
| 2 (25-49) | Copper Pick | 0.7 m | copper | warm sparks |
| 3 (50-74) | Iron Pick | 0.8 m | dark iron | |
| 4 (75-99) | Steel Mattock | 1.0 m | steel | short trail |
| 5 (100-124) | Glimmer Pick | 1.1 m | cyan crystal | cyan flash |
| 6 (125-149) | Rune Pick | 1.3 m | glyph-inlaid stone | rune ring decal |
| 7 (150-174) | Ember Maul | 1.5 m | glowing ember | heat shimmer |
| 8 (175-199) | Frost Cleaver | 1.7 m | ice | frost burst |
| 9 (200-224) | Echo Hammer | 2.0 m | pale echo crystal | ghost double-hit |
| 10 (225-249) | Star Mattock | 2.4 m | starfield | small nova |
| 11 (250-274) | Void Pick | 2.9 m | black, violet rim | inward implosion |
| 12 (275-299) | Titan Hand | 3.5 m | stone fist | the screen dips 2 % |
| 13 (300+) | Lantern Maul | 4.5 m, then +0.3 m per further tier up to 8 m | the lantern rune | white-gold flare |

Late tiers no longer fit the shaft. The ghost is drawn from off-screen, so only the head lands,
which reads as a colossal blow.

---

## 3. Idle and offline

### 3.1 The crew digs while you watch

Crew DPS is applied to the front row as real hits. Each visible crew unit swings at 1-2 Hz with
its share of the DPS, so the work is visible. When crew DPS per second is more than 7 rows' HP,
the crew switch to area visuals: drill beams, golem slams that clear whole rows, wyrm lunges.

Visible units: the 6 highest tiers owned are drawn as models, up to `min(level, cap)` per tier
(cap 3 for tiers 0-2, 2 for tiers 3-5, 1 for higher tiers), 24 crew models on screen at most.
Every lower tier becomes a swarm of instanced lights on the walls (up to 256 sprites). A badge
"x143" sits on each tier's leader. The models stand on scaffolds anchored to the side walls in
the 4 rows above the front, and the scaffolds move down with the front.

### 3.2 Offline

| Item | Rule |
|---|---|
| What runs | Crew DPS x efficiency; it digs rows and earns Ore exactly as online. There are no taps. Autobuy runs if unlocked. Auto-Rekindle runs if unlocked (Law 40). Collapse and Ascend never run offline. |
| Efficiency | 50 %; 75 % at Wick 6 (Night Shift); 100 % after the first Collapse (Law 15) |
| Cap | 2 h; 8 h at Wick 16 (Long Shift); 24 h after the first Collapse; 72 h with the Long Night constellation |
| Method | Closed form per biome segment with constant DPS: clearing biome coordinate `b0 -> b1` inside biome i (length `l` m) costs `7 x 4 x l x (10^b1 - 10^b0) / ln 10` (Earth exponent). Invert it for `b1`. With autobuy or auto-Rekindle on, it steps in 60 s blocks (8 h = 480 steps). Budget: 50 ms on the target phone. |
| Crew Finds | 1 unopened chest per 20 min away (max 24). Each holds 2 min of current income, 10 % relic chance and 5-20 Glimmer. |
| Return screen | "While you were away (3 h 12 min)": +depth (m and biomes), +Ore, chests in a row to tap open one by one, and new records with fanfare. Then one button: **Collect**, or **Collect x2: Gold Rush**. |
| Gold Rush (x2 claim) | 15 s minigame: golden blocks spawn at 3/s in the shaft and 20 taps doubles the offline Ore. Anyone can reach it, and it gives an active start to every session. |

---

## 4. Economy

Units: Ore for the run, Embers, Echoes and Stars for prestige, Wicks from the Lantern Path,
Glimmer as the rare currency, Relics for the collection. Big numbers live in log space (10.4).

### 4.1 The rock

| Quantity | Formula (world n = 0 for Earth) | Notes |
|---|---|---|
| Biome coordinate b | biome index + fraction travelled inside it | 84 biomes per world, 7 strata of 12 |
| Block HP | `4 x 10^(b x (1 + 0.04 n))` | Earth: x10 per biome; each later world is 4 % steeper |
| Displayed HP | the value above x `10^(D_n)`, with `D_n = sum over j < n of 84 (1 + 0.04 j)` | D = 0, 84, 171, 262, 356, 454, 554, 659, 766, 877. Star power multiplies by exactly `10^(D_n)`, so the displayed numbers keep growing while the difficulty stays the same |
| Row | 7 blocks | |
| Ore per block | HP / 4 x ore multipliers | 1 Ore per block at 0 m |
| Guardian | full row width x 3 rows; HP = 30 blocks of that biome; drops a chest worth 30 s of income plus a Boon pick | in the overflow chain it counts as one target |
| Special blocks | Vein x5 Ore (8 % of blocks), Rich vein x25 (1 %), Golden vein (event), Chest (1 per 25 m), Geode (1 per 40 rows: 20-60 Glimmer), Relic block (1 per biome, 50 % chance) | all with distinct silhouettes |

Biome lengths on Earth (metres per biome for each stratum of 12): 100, 250, 1,000, 5,000,
25,000, 100,000, 400,000 (the last biome is 394,800 m, so the core sits at exactly 6,371,000 m).

| Stratum (Earth) | Biomes | Depth | Name |
|---|---|---|---|
| S1 | 0-11 | 0-1,200 m | The Shallows |
| S2 | 12-23 | 1.2-4.2 km | The Old Mines |
| S3 | 24-35 | 4.2-16.2 km | The Deep Crust |
| S4 | 36-47 | 16.2-76.2 km | The Moho |
| S5 | 48-59 | 76.2-376 km | The Upper Mantle |
| S6 | 60-71 | 376-1,576 km | The Transition |
| S7 | 72-83 | 1,576-6,371 km | The Core |

### 4.2 The run shop (Ore)

| Upgrade | Unlock | Base cost | Growth per level | Effect | Milestones |
|---|---|---|---|---|---|
| Pickaxe | start | 125 | x1.08 | tap damage `4 + 2L` | x2 at Lv 10, 25, 50, 75, then every 25; a new ghost tier every 25 |
| Crew tier k | see 4.3 | see 4.3 | x1.07 | `5^k` DPS per level | x2 at Lv 10, 25, 50, 75, then every 25 |
| Shockwave | Wick 1 (100 m) | 1,000 | x10 | Lv1: 4 neighbours at 25 %; Lv3: 3x3 at 35 %; Lv6: whole row at 50 %; Lv10: 3 rows at 60 %; +1 row per 5 levels after | |
| Crit Edge | 150 m | 2,500 | x4 | +2 % crit chance (25 levels, cap 55 %) | |
| Crit Force | 250 m | 10,000 | x6 | crit multiplier +2 (from x10) | |
| Dynamite (skill) | Wick 2 (200 m) | 5,000 | x8 | blast 3 rows x (1 + 0.5 Lv) of full-HP damage; cooldown 30 s, -1 s per level, minimum 10 s | |
| Frenzy (skill) | Wick 5 (500 m) | 50,000 | x8 | 10 s: tap x(3 + Lv), auto-hits 10/s at the front; cooldown 60 s | |
| Magnet (skill) | Wick 8 (800 m) | 500,000 | x8 | 15 s: Ore x(2 + 0.5 Lv), every drop pulled at once; cooldown 90 s | |

Purchase modes: x1, x10, x25-to-milestone and MAX. The **best-buy card** always shows the
affordable purchase with the highest `(power gain) / cost`, and that is the one the AI buys.

### 4.3 The crew (endless tiers)

| k | Crew | Unlock cost | DPS / level | Visual on screen | Late-power visual (crew DPS > 7 rows/s) |
|---|---|---|---|---|---|
| 0 | Digger | 190 | 1 | small miner with a pick, on scaffolds | flurry of picks |
| 1 | Cart Crew | 2,250 | 5 | rail cart along the wall, two pushers | carts dump rows away |
| 2 | Lantern Sprites | 27,000 | 25 | flying lights that dart and peck | sprite swarm, cyan streaks |
| 3 | Steam Drill | 324,000 | 125 | big drill on a tripod | drill beam, steam jets |
| 4 | Stone Golem | 3.89 M | 625 | golem punches the front | row slam with dust ring |
| 5 | Blast Crew | 46.7 M | 3,125 | throws dynamite | chain blasts |
| 6 | Rune Engine | 560 M | 15,625 | glyph machine with a laser | laser sweeps rows |
| 7 | Deep Wyrm | 6.72 B | 78,125 | worm head bursting through the wall | lunges through 20 rows |
| 8+ | procedural (names below) | `6.72 B x 20^(k-7)` | `5^k` | cosmic models built with VoxBuilder | the model scales x1.15 per tier, up to 3x screen width |

The next tier shows as a silhouette with "???" once Ore reaches 10 % of its cost, and is
revealed at 50 %. On day 1 a new tier arrives every 4-25 minutes (sim: tier 1 at 4:37, tier 2 at
12:08, tier 3 at 35:19). Later, one run climbs many tiers: 16 at the end of day 3 and 46 on day
6 (sim). The screen draws the 6 highest tiers owned as models (24 at most) and every lower tier
as a swarm of instanced lights on the walls (up to 256 sprites, brightness by DPS share). The
crowd itself shows the scale. Names: the 8 above, then Star Forge, Comet Hammer, Titan Hand,
Sun Drill, Void Maw, Event Horizon, Galaxy Engine, Lantern Choir, then the 16 names again with
"II", "III", and so on.

### 4.4 Boons (roguelite picks, reset on Rekindle)

You pick one at every Guardian (once per biome). There are 3 choices (4 with Boon Sight), and
one free reroll per run from Wick 7. The sim models the best pick as x1.15 power.

| Boon | Rarity (weight) | Effect | Stacks |
|---|---|---|---|
| Sharp Edge | common 20 | tap x1.4 | yes |
| Crew Rations | common 20 | crew x1.4 | yes |
| Rich Seam | common 18 | Ore x1.5 | yes |
| Steady Hands | common 16 | all damage x1.15 | yes |
| Keen Eye | uncommon 10 | crit chance +4 % | to 75 % |
| Brutal | uncommon 10 | crit multiplier +5 | yes |
| Chain Reaction | uncommon 8 | +1 Shockwave level | yes |
| Fuse Cutter | uncommon 8 | Dynamite cooldown -25 % | to x0.25 |
| Gold Fever | rare 4 | golden veins twice as often | x4 cap |
| Echo Swing | rare 4 | every 5th hit strikes twice | no |
| Deep Pockets | rare 3 | chests x3 | yes |
| Avalanche | rare 3 | each row cleared deals 10 % of its HP to the next row | no |
| Second Crew | epic 1 | the 2 highest crew tiers x3 | yes |
| Lantern Heart | epic 1 | all x2 | yes |

### 4.5 Lantern Path (Wicks, permanent, no choices)

You earn 1 Wick the first time you ever reach each biome, so 84 per world. The path lights up by
itself: a permanent reward every 100 m early on, and the early milestones double as the feature
unlock schedule. Minor steps give x1.06 power. The sim models x1.05 per Wick up to 84, then
x1.005 per extra Wick.

| Wick (Earth depth) | Reward |
|---|---|
| 1 (100 m) | Shockwave in the shop |
| 2 (200 m) | Dynamite skill |
| 3 (300 m) | Expeditions (6.3) |
| 4 (400 m) | **Rekindle unlocked** |
| 5 (500 m) | Frenzy skill |
| 6 (600 m) | Night Shift: offline 75 % |
| 7 (700 m) | 1 free Boon reroll per run |
| 8 (800 m) | Magnet skill |
| 9 (900 m) | Relic set bonuses become active |
| 10 (1,000 m) | Foreman: autobuy for pickaxe and crew, plus the Lintel Gate (**Collapse unlocked**) |
| 12 (1,200 m) | Resonance I (tau 0.05 s) |
| 16 (2,200 m) | Long Shift: offline cap 8 h |
| 20 (3,200 m) | Boon Sight: 4 Boon choices |
| 25 (5,200 m) | Resonance II (tau 0.2 s) |
| 30 (10,200 m) | Golden Touch: golden veins x2 |
| 40 (36.2 km) | Resonance III (tau 1 s) |
| 48, 60, 72 | +1 Expedition slot each |
| 84 (the Core) | Ascend unlocked |
| every other step | x1.06 power |

### 4.6 Rekindle (layer 1): Embers

| Item | Value |
|---|---|
| Unlock | Wick 4 (first time at 400 m) |
| Gain | `floor(10 x 1.7^(b - 4)) x (1 + Echoes) x (1 + 0.5 Stars)` with b = deepest biome coordinate of this run. Earth: 400 m 10, 500 m 17, 800 m 83, 1,000 m 241, 1,200 m 697 |
| Effect | Power x(1 + 0.1 x Embers), additive |
| Resets | depth to 0, Ore to 250, shop levels, Boons |
| Keeps | Wicks, Relics, Feats, Glimmer, Expeditions |
| Button | The flame chip glows when the gain at least doubles your Embers, and it shows the power ratio `(1 + 0.1 (E + gain)) / (1 + 0.1 E)` ("+17 Embers: power x1.85"). The hint fires when the gain is at least half your Embers and the descent has been below 0.3 rows/s for 60 s. |

### 4.7 Collapse (layer 2): Echoes, Guilds, Trials, Laws

| Item | Value |
|---|---|
| Unlock | Reach 1,000 m (b = 10): the Lintel Gate, a carved door that spans the shaft |
| Gain | `floor(5 x sqrt(b_era - 1) x (1 + 0.5 Stars))`, b_era = deepest biome this era. First Collapse at 1,000 m = 15 Echoes. The sim sees 15, 17, 21, 24, 26, 29, ... per Collapse |
| Effect | Power x1.04^Echoes (compounding) and Ember gain x(1 + Echoes) |
| Resets | everything Rekindle resets, plus Embers |
| Keeps | Echoes, Laws, Guild unlocks, Trial rewards, plus everything Rekindle keeps |

**Echo Laws** unlock when your highest Echo total ever reaches the threshold. They are
permanent, so automation survives Ascension.

| Echoes | Law | First reached (sim) |
|---|---|---|
| 15 | Guilds; offline efficiency 100 %, cap 24 h | day 3 |
| 25 | Trials | day 3 |
| 40 | Auto-Rekindle (rule: at x2 Embers, or after 60 s with no progress) | day 4 |
| 60 | +1 Expedition slot; Boon auto-pick by a set preference | day 4 |
| 100 | Guild Pact: 2 Guilds at once | day 4 |
| 150 | +1 Boon choice | day 5 |
| 250 | Echo Dive: runs start at 10 % of the era's record biome | day 6 |
| 400 | Auto-Collapse (rule set by the player: at Echo gain >= X) | day 7 |
| 600 | Skills auto-cast | day 9 |
| 1,000 | +1 Constellation choice | day 26 |

**Guilds** (choose one at each Collapse; this is what changes how you play):

| Guild | Unlock | Bonus | Malus | On-screen identity |
|---|---|---|---|---|
| Strikers (active) | Law 15 | tap x10, combo cap 100, crit x2 | crew x0.5 | gold fist trails, louder impacts |
| Crew Union (idle) | Law 15 | crew x10, offline Ore x2 | tap x0.5 | twice as many crew models, worker songs |
| Delvers (events) | Law 15 | events x3 as often, chests x5, relic chance x3 | Ore from blocks x0.7 | treasure glints, map overlay of upcoming specials |
| Blasters | Trial 3 gold | every 10th hit is a 3x3 explosion; Dynamite cooldown x0.5 | crit disabled | fuse sparks, orange flashes |
| Lamplighters | Trial 5 gold | lit blocks (inside the light radius) take x5 | unlit blocks x0.5 | the lantern radius becomes the damage zone |
| Wyrmtamers | Trial 8 gold | Deep Wyrm tier x100; wyrm lunges every 8 s | Pickaxe x0.5 | a giant pet wyrm coils in the back wall |

**Trials** (challenge runs, 3 tiers each: bronze, silver and gold depth targets; the reward is
permanent):

| Trial | Rule | Bronze / Silver / Gold | Reward (per tier) |
|---|---|---|---|
| 1 Bare Hands | no crew | 300 / 600 / 1,000 m | tap x2 |
| 2 Silent Crew | no taps | 400 / 800 / 1,500 m | crew x2 |
| 3 Rush | 5-minute run | 300 / 500 / 800 m | +1 Guild choice (Blasters at gold) |
| 4 Brittle Deep | HP x100, Ore x100 | 400 / 900 / 1,500 m | Ore x2 |
| 5 Dark Descent | light radius 3 m, blocks hidden beyond it | 300 / 700 / 1,200 m | relic finds x1.5 (Lamplighters at gold) |
| 6 One Shot | a block heals fully if not broken within 1 s | 250 / 500 / 900 m | crit x1.5 |
| 7 No Boons | Guardians give no Boon | 500 / 1,000 / 2,000 m | +1 Boon choice |
| 8 Deep Night | offline only: you may open the game just once in 8 h | 600 / 1,200 / 2,400 m | offline x2 (Wyrmtamers at gold) |

### 4.8 Ascend (layer 3): Stars and worlds

| Item | Value |
|---|---|
| Unlock | Break the Core Guardian at the bottom of the world (b = 84) |
| Gain | 1 Star |
| Effect | power x`10^(D_n)` (cancels the next world's displayed HP offset); Echo gain and Ember gain each x(1 + 0.5 Stars); pick 1 of 3 Constellation perks |
| Resets | Embers, Echoes (Laws stay), Guild choice; the world changes |
| Keeps | Wicks (each new world has 84 more), Relics, Feats, Laws, Trial rewards, Constellations |

**Worlds.** The depth unit grows; the difficulty curve stays normalised. In a world of scale s,
each row is s metres of that world.

| # | World | Radius | Scale (m per row) | Permanent new mechanic |
|---|---|---|---|---|
| 1 | Earth | 6,371 km | 1 | base game |
| 2 | Thalassa (Neptune) | 24,622 km | 3.86 | Water: flooded rows; currents carry loot sideways to "eddy" pockets worth x5; Diver Eels crew tier |
| 3 | Jove (Jupiter) | 69,911 km | 10.97 | Storms: lightning chains through 3 rows every 20 s; tap the storm eye for x10 for 5 s |
| 4 | Sol | 696,340 km | 109.3 | Heat: the combo builds heat; at max heat the next tap is a Flare that clears 1 % of the current biome |
| 5 | R136a1 (blue giant) | 2.9e7 km | 4.6e3 | Gravity wells: drops orbit and must be tapped to collect (x3 value) |
| 6 | Betelgeuse | 5.3e8 km | 8.3e4 | Pulse: the world breathes; HP swings +/-50 % on a 30 s cycle, and pushing on the low phase pays |
| 7 | Stephenson 2-18 | 1.5e9 km | 2.35e5 | Vastness: the shaft widens to 11 blocks, with +50 % crew models |
| 8 | TON 618 | 1.94e11 km | 3.05e7 | Event horizon: time dilation, offline time counts x3 |
| 9 | The Galactic Heart | 4.7e17 km | 7.4e13 | Starfall: stars are blocks; breaking one ignites the next 10 rows |
| 10 | The Lantern | the observable universe | 6.9e19 | The reveal (6.4); after it the "Beyond I, II, ..." worlds, each x10^(20+3k), with mixed mechanics |

**Constellations** (choose 1 of 3 at each Ascension from 12): Long Night (offline cap +48 h);
Second Guild slot; Boon Sight (+1 choice); Ember Heart (Embers x10); Echo Heart (Echo gain x1.5);
Kindling Star (runs start with crew at 25 % of your best levels); Swift Star (the Dive threshold
drops from 96 to 48 rows); Hoard Star (Ore x1,000); Midas (golden veins x3); Collector (relics
x2); Wyrm Star (adds the Star Wyrm crew tier at k = 9); Lantern Star (light radius +50 %, plus
lantern sprites).

### 4.9 Total power, all multipliers in one place

`M_all = Boons x (1 + 0.1 Embers) x LanternPath x 1.04^Echoes x 10^(D_n) x Relics x Feats x Guild x Trials x Constellations`

with `crewDPS = sum over k of 5^k x L_k x 2^m(L_k) x M_all x M_crew` and
`tapDPS = hits/s x hit`.

Side multipliers (Relics, Feats, Trials, Constellations, events) are **not** in the calibration
sim. They are budgeted at x10 at most by the end of each world (Relics up to x8.8, Feats up to
x2.2, the rest small), so they speed the curve up by less than 1 biome. The shop extras
(Shockwave, Crit Edge, Crit Force, skills) are not in the sim either. They are budgeted at x3 on
tap damage by the end of a run, so read the sim's pickaxe line as "pickaxe plus extras".

### 4.10 Pacing (calibration sim, core systems only)

Player model: 4 hits/s while playing; day 1 sessions of 45, 20 and 30 min (at 0:00, 3:45,
8:05); days 2+ sessions of 25, 20 and 30 min; greedy best-buy; Rekindle when the gain at least
doubles the Embers (8 min minimum run) or after 2 minutes of stagnation; Collapse when the gain is at least
15 Echoes and the run is stalled or 20 min long.

**First hour (first run, then runs 2-4):**

| Minute | Depth | Hits per block | Pickaxe Lv | Crew levels (by tier) | Embers | Wicks | Event |
|---|---|---|---|---|---|---|---|
| 1 | 65 m | 1.1 | 6 | 1 | 0 | 0 | first crew at 0:52 |
| 2 | 112 m | 0.7 | 13 | 5 | 0 | 1 | biome 1 at 1:50 |
| 3 | 161 m | 1.5 | 21 | 17 | 0 | 1 | |
| 5 | 241 m | 2.1 | 41 | 39, 2 | 0 | 2 | Cart Crew at 4:37 |
| 8 | 301 m | 2.5 | 57 | 55, 18 | 0 | 3 | |
| 12 | 355 m | 7.0 | 70 | 73, 36 | 0 | 3 | Lantern Sprites at 12:08 |
| 17 | 400 m | 8.2 | 81 | 84, 48, 12 | 0 | 4 | **Rekindle 1: +10 Embers** |
| 25 | 397 m | 3.8 | 81 | 84, 47, 12 | 10 | 4 | Rekindle 2 (+10) |
| 40 | 515 m | 10.0 | 113 | 120, 84, 47, 12 | 20 | 5 | Steam Drill at 35:19 |
| 42 | | | | | 40 | 5 | Rekindle 3 (+20) |
| 60 | 592 m | 14.8 | 134 | 145, 109, 73, 36 | 40 | 5 | |

The core loop alone has gaps of up to 411 s without a new biome, crew tier or Rekindle (minutes
8 to 15 of run 1). Events (every 45-75 s), chests (every 25 m), crew milestones (every 25
levels) and pickaxe tiers fill those gaps, which gives the novelty target of 11.1.

**Days (record = deepest point ever; Earth until day 9):**

| Day | Record (biome / depth) | Rekindles (total) | Collapses (total) | Ascensions | Highlight |
|---|---|---|---|---|---|
| 1 | 8.1 / 810 m | 4 | 0 | 0 | Magnet, Night Shift |
| 2 | 9.6 / 960 m | 7 | 0 | 0 | the Lintel Gate is in sight |
| 3 | 19.8 / 3,150 m | 13 | 2 | 0 | **first Collapse at day 3 04:25** (session 2), Guilds |
| 4 | 36.0 / 16.2 km | 62 | 5 | 0 | Auto-Rekindle (40 Echoes), past the Kola borehole (12,262 m) |
| 5 | 46.0 / 66.2 km | 113 | 8 | 0 | through the Moho |
| 6 | 56.6 / 291 km | 161 | 11 | 0 | |
| 7 | 68.3 / 1,206 km | 209 | 14 | 0 | the 660 km transition zone |
| 8 | 80.0 / 4,776 km | 262 | 17 | 0 | the outer core |
| 9 (session 3) | the Core, 6,371 km | 292 | 19 | **1** | Ascend: Thalassa (8.4 days after install) |
| 14 (session 3) | Neptune's core, 24,622 km | 508 | 14 in world 2 | 2 | Jove |
| 19 (session 1) | Jupiter's core, 69,911 km | 694 | 12 in world 3 | 3 | Sol |
| 23 (session 1) | the Sun's core, 696,340 km | 869 | 11 in world 4 | 4 | R136a1 |
| 26 (session 3) | R136a1's core | 1,033 | 10 in world 5 | 5 | Betelgeuse |
| 30 (session 1) | Betelgeuse's core | 1,168 | 9 in world 6 | 6 | Stephenson 2-18; displayed HP 1e554 to 1e658; depth counted in AU |
| 33 / 36 / 39 | | 1,317 / 1,449 / 1,580 | 9 per world | 7 / 8 / 9 | TON 618, the Galactic Heart, the Lantern |

After automation (day 4+): about 3 manual Collapses a day (one per session) and 30-50
Auto-Rekindles a day. The deepest biome reached grows by at least 1 biome on every simulated day
from 1 to 40.

### 4.11 Milestones and real-depth markers (Earth)

Real-world depth markers are free wonder. Each one is a Feat with a fanfare and a Codex entry:
300 m (the Eiffel Tower, upside down), 828 m (the Burj Khalifa), 2,212 m (Veryovkina, the deepest
known cave), 3,900 m (Mponeng, the deepest mine), 8,849 m (Everest, upside down), 10,935 m
(Challenger Deep), 12,262 m (the Kola Superdeep Borehole, deepest human hole), 35 km (the
continental Moho), 410 km and 660 km (the mantle transition), 2,890 km (the core-mantle
boundary), 5,150 km (the inner core), 6,371 km (the centre). Later worlds use their own markers
(Neptune's atmosphere-mantle boundary, Jupiter's metallic hydrogen, the Sun's tachocline, ...).

---

## 5. The descent and the world in the voxel engine

### 5.1 The shaft volume (ring buffer, not an authored zone)

| Item | Value |
|---|---|
| World volume | X 32 x Y 128 x Z 32 voxels (131 KB of blocks, 524 KB of light), 2 x 8 x 2 = 32 chunks of 16^3 |
| Cutaway | z = 0 is a permanent air layer: the cutaway gap. The rock starts at z = 1, so its z = 1 faces toward the camera are meshed as a cross-section, like an ant farm. Static light and openness flow into the z = 0 layer, so the front faces sample real light (`position + normal x 0.5` lands in open space); no mesher change is needed |
| Shaft | x 13-19 (7 wide), z 1-3 (3 deep) |
| Back wall | z >= 4, holds the caverns seen through openings in the shaft's back wall |
| Ring | Y is a ring of 128 rows: storage row = absolute row mod 128. The front is kept 40 rows below the ring top, so there are 88 rows of look-ahead |
| Streaming | When (generated bottom - front) < 64 rows, the worker generates the next 16-row band (32 x 16 x 32) and recycles the band 48+ rows above the front. Generation 1-3 ms, light for the band about 1 ms, 4 chunks meshed in the mesh workers |
| Absolute coordinates | Absolute row R (float64; int32 used for hashing, wrapped mod 2^20 for mesher noise). Mesher noise and world-space textures take `R - originRow` plus an integer origin offset that is a multiple of 64 m, so texture periods (8 m) stay continuous. The floating origin rebases at each band (the scene root's y), so float32 never holds large coordinates |
| Light texture | `uLightTex` keeps its layout with `wrapT = RepeatWrapping`; the shader samples `(y_local mod 128)`. The ring seam is always 40+ rows above the camera top, out of view |
| Dive teleport | If more than 96 rows must pass within one step: the camera plays the Dive (5.7), the worker regenerates all 128 rows at the destination (about 10 ms generation, 10 ms light, 32 chunks in 2 mesh workers, about 30 ms), and the ring swaps in when ready (>= 0.35 s Dive minimum, 1.2 s maximum). Rows that are skipped are never generated |
| Determinism | Every band is a pure function of (seed, world n, absolute row). Rows that have been dug are not stored: everything above the front is air by definition |

### 5.2 Portrait camera (fixed, follows the descent)

| Item | Value |
|---|---|
| Lens | perspective, vertical FOV 50 degrees (58 during a Dive), near 0.5, far 90 |
| Position | x = 16 (shaft centre), z = -20 m (in front of the cutaway), y = front + 2.5 m, looking at (16, front - 1.5, 4): about -11 degrees pitch, so the top faces of the front row read |
| Framing | the distance adjusts per aspect so the dig-face plane always spans 8.6 m across: blocks are 41.9 px at 360, 45.3 px at 390 and 47.9 px at 412 CSS px wide |
| Front on screen | 42 % from the top (354 px at 844): 5.5 rows of dug shaft above and 6.3 rows of upcoming rock below in the clear playfield, plus 4 more dim rows under the dock (the look-ahead shows the chest 5 rows down) |
| Follow | critically damped spring on y, omega = 9 /s (settles in 0.5 s); no x motion, no roll |
| Wonder pull-back | at a stratum boundary hall: distance 20 to 34 m over 1.2 s, hold 3 s, return in 0.8 s |
| Shake | screen-space offset only, never the world camera (keeps light and picking stable); capped by the camera-shake setting |
| The Lantern | the player's presence: a floating lantern inside the cutaway gap (z = 0.5), 1.2 m above the front row, and the engine's one dynamic light (the existing LanternField follows it; the flame stays in open space, so its visibility pass works as now). It bobs +/-0.08 m at 0.5 Hz, swings 0.2 m toward each tap, and its radius grows with the Lantern Star constellation. It keeps the dig face warm in every biome |

### 5.3 The biome ladder: 12 archetypes x 7 strata x worlds

Each stratum is one lap of the 12 archetypes. The stratum and the world shift the palette (hue
+/-25 degrees per stratum), emission (+15 % per stratum), cavern size (+20 % per stratum),
creature size (+10 %) and names ("Deep Glimmer Seams II"). Existing material layers are reused;
6 new painted layers are added (magma, ice, fungus cap, bone and amber, gear metal, root wood).

| # | Archetype | Blocks and ores (existing layers, then new) | Light (emitters) | Atmosphere (from ATMOSPHERES) | Creatures (instanced) | Cavern dressing (existing props first) | Special |
|---|---|---|---|---|---|---|---|
| 0 | Rootworks | soil, gravel, copper vein; root wood (new) | LIGHT_LAMP lanterns of old miners | camp (warm umber) | moles, root grubs | lanternPost, crate, barrel, ropeCoil, brokenCart | Treasure Mole x2 frequency |
| 1 | Slate Galleries | slate, deep slate, iron vein | LIGHT_AMBER | tunnel | bats | hangingLantern, pickaxeRack, satchel, timber props | mine-cart rail along the wall (crew Cart route) |
| 2 | Glimmer Seams | crystal, weathered stone | LIGHT_CYAN clusters | hollow | Lumen Moths (existing) | crystalCluster x4 variants | Geodes x2 |
| 3 | Fungal Hollow | moss, damp stone; fungus cap (new) | soft green emitters (new LIGHT_SPORE) | hollow, tinted green | spore snails, glow frogs | giant mushrooms (new prop) | spore drifts (particles) |
| 4 | Lintel Ruins | masonry, glyph stone, crumbling brick | glyph glow | rift-lite violet | stone sentinels (still, then they turn their heads) | columns, monolith, runeStone, tablet, relicShelf | Ancient Doors x2, lore tablets |
| 5 | Ember Veins | hardened slate; magma (new) | LIGHT_EMBER | warm red haze | fire salamanders | forge, lava falls (Waterfall effect recoloured) | Cave-in becomes Ember Rain |
| 6 | Frost Deep | ice (new), echo crystal | pale cyan | blue-white | ice wyrmlings | ice spires (crystalCluster with ice material) | frozen chests (2 taps to thaw) |
| 7 | Drowned Vaults | damp stone, sealStone | caustic cyan | deep teal | eels, pale fish | waterfall, pools, sunken crates | pearls (Glimmer) |
| 8 | Bone Fields | gravel; bone and amber (new) | amber glow | dusty ochre | skeletal fish, bone crabs | giant ribs (new prop), fossil blocks | Fossil relics x2 |
| 9 | Echo Rift | echo crystal, ironbound | LIGHT_ABYSS | rift | floating rocks, wisps | abyssMonolith, floating shards | Ember Wisp x2 |
| 10 | Clockwork Undercity | ironbound; gear metal (new) | LIGHT_AMBER pylons | tunnel, brass tint | brass beetles | pylons, gears (new), stairs and bridges (structure meshes) | Rune Engine crew x2 in this biome |
| 11 | Lantern Root | root wood, crystal | white-gold | warm-gold haze | lantern birds | a giant glowing root through the back wall | mystery tablet per lap |

Stratum boundaries are **Wonders**: a 24-row tall, 32 m wide, 24 m deep hall the shaft breaks
into. Earth: 1,200 m the Glimmer Cathedral, 4,200 m the Sunken Lintel City, 16,200 m the Titan's
Skull, 76,200 m the Ember Sea, 376 km the Frozen Ocean of the Mantle, 1,576 km the Clockwork
Heart, 6,371 km the Core Lantern. Each Wonder uses the structure system (columns, stairs, bridges)
and 1 key light per 6 m.

### 5.4 What fills the caverns (fixes "horribly empty")

A content budget is enforced per 16-row band by the generator and checked by a unit test:

| Content | Minimum per 16-row band | Where |
|---|---|---|
| Lit cavern pocket in the back wall (5-12 m wide, 4-8 m tall, 6-20 m deep) | 1 per 24 rows (so at least 0.66 per band) | z 4-31, opening into the shaft's back wall, visible through the cutaway |
| Props in each pocket | 3-8 (from the archetype list) | pocket floor and walls |
| Light emitters | 1 per pocket plus 1 per 8 rows on the shaft walls | keeps every screen lit |
| Creatures | 1 animated group per pocket (2-12 instances) | pocket |
| Ore blocks in the dig column | 8-15 % of blocks | shaft |
| Special block (chest, geode, relic, golden vein, tablet) | >= 1 per 12 rows | shaft or wall face |
| Wall dressing (roots, crystals, rails, scaffold anchors) | >= 4 per band | z = 4 wall face and side walls |

Measure: any 19-row screen contains at least 1 pocket or Wonder, 2 light sources, 1 creature
group and 1 special block (11.2).

### 5.5 Above the front

The dug shaft is not empty. Crew scaffolds sit in the 4 rows above the front; the ghost of your
previous run (a translucent lantern) races beside the shaft at the depth that run had at the same
run time ("+42 m ahead"). A glowing **record line** sits at your record depth, and crossing it
gives "NEW RECORD" with a fanfare. Depth marker plaques are bolted to the wall every 100 m.

### 5.6 Band generation recipe (worker; a pure function of seed, world and absolute row)

1. **Biome per row**: archetype = biome mod 12, stratum = floor(biome / 12). Across the 8 rows at
   a biome boundary, each voxel picks the old or the new biome by a 3D hash against its position
   in the blend, so the boundary is ragged rather than a flat line.
2. **Host rock**: 3 materials per archetype: base 70 %; secondary 20 % in dipping strata of 2-5
   rows at an 8-15 degree dip; accent 10 % as noise blobs. Ore veins come from a 3D noise
   threshold (8-15 % of shaft blocks), with rich veins at 1 %.
3. **Shaft column** (x 13-19, z 1-3): all solid. Special blocks follow a schedule: a chest every
   25 rows (centre column), a geode every 40 rows, 1 relic block per biome in the first half, and
   the Guardian on the first 3 rows of each biome (full width; a prop overlays the cells).
4. **Walls** (x <= 12, x >= 20, z >= 4): solid, with pockets placed by Poisson sampling with at
   least 18 rows between them. Pocket = an ellipsoid carved with noise (radius 3-6 m across, 2-4 m
   tall, 3-10 m deep, +20 % per stratum), opening onto the shaft's back wall through a 3-5 m mouth,
   with a flattened floor. It gets 3-8 props on floor cells, 1-2 emitter voxels (LIGHT_*) and a
   creature anchor.
5. **Wall dressing**: crystal seams along exposed faces (the existing `crystalSeam` idea), roots,
   rails (per archetype), and scaffold anchors every 4 rows on the side walls.
6. **Wonders**: at a stratum boundary, 24 rows are replaced by the Wonder template (carve plus
   structure specs).
7. **Light budget**: at most 24 emitter voxels per band, and at least 1 warm wall lamp per 8 rows
   beside the shaft, so the front is never dark.
8. **Output** to the main thread: blocks (16 x 32 x 32 = 16 KB, transferred), prop specs,
   creature anchors, the special-block list and the light emitters.

### 5.7 The Dive (the late-game visual signature)

When rows per second exceed 15, the camera leads the front by 2 m and the FOV eases from 50 to 54
degrees. Above 96 rows in one step, the world swaps to a Dive: radial streaks in the biome palette
(a post-process pass on the existing PostFX chain), biome names stacking and fading at 6 per
second, the depth counter spinning, a bass swell, and "SHATTERED x12 GUARDIANS" counting up. The
landing is a white-gold flash, hitstop 80 ms, and the new depth's band appears.

---

## 6. Discovery, collections, events, the mystery

### 6.1 Events (active play)

| Event | Unlock | Frequency | Interaction | Reward |
|---|---|---|---|---|
| Golden Vein | 15 m | every 45-75 s | tap the gold block within 3 rows | 15 s Gold Rush: Ore x7 |
| Treasure Mole | 50 m | every 3-5 min | 5 taps on the mole crossing the face in 8 s | chest: 2 min of Ore, 30 % relic |
| Lumen Moths | biome 2 | every 4-6 min | tap moths (12, for 10 s) | +1 Glimmer each; all 12 = +1 Boon reroll |
| Cave-in | 300 m | every 6-9 min | tap falling rocks for 6 s | each = x3 its Ore |
| Ember Wisp | after Rekindle 1 | every 8-12 min | tap once | +5 % Embers on the next Rekindle |
| Ancient Door | biome 4 lap | 1 per biome | 3 taps | lore tablet + 50 % relic |
| Lost Miner | 1 per stratum | guaranteed | tap to rescue | a named Expedition miner (24 to collect) |
| Meteor | after Collapse 1 | every 10-15 min | tap within 4 s | blasts 30 x (1 + Collapses) rows free |
| Rival Ghost Race | after Rekindle 2 | each run | beat your previous run to the next 100 m | chest x2 |

Event timers run only while the game is in front. At most 1 event is live at a time
(Guardian > Meteor > others).

### 6.2 Collections (the Codex)

| Collection | Size | Source | Bonus |
|---|---|---|---|
| Relics | 84 per world (1 per biome) | Ancient Doors, relic blocks, Expeditions, chests | +1 % power each (additive); a complete stratum set of 12 = x1.25 power |
| Bestiary | 12 archetypes x 7 tiers of creatures | tap a creature 3 times in a pocket | Feat + Codex art |
| Biomes | 84 per world | reach them | Wick (the Lantern Path) |
| Lore tablets | 1 per biome (Ancient Doors) | | the mystery thread |
| Feats | 120 | milestones, real-depth markers, records | +1 % power each (additive) |
| Lost Miners | 24 | 1 per stratum | Expedition crew with traits (+relic, +speed, +Glimmer) |
| Lantern styles | 20 | Glimmer, Feats | cosmetic: the lantern rune glow colour and the pickaxe ghost trail |

### 6.3 Expeditions (the idle side loop)

Unlocked at Wick 3. Send rescued miners into side caverns: 15 min, 1 h, 4 h or 8 h. The reward is
chests scaled to your record depth, with relic chance 10/25/50/80 % and Glimmer 5-200. There is 1
slot at first (+1 at Wicks 48, 60 and 72, +1 at Law 60). Dispatch and collect are one tap each.
The return screen lists finished expeditions.

### 6.4 Daily

3 daily quests ("Break 2,000 blocks", "Catch 2 moles", "Reach biome 6 in one run"; rewards
Glimmer and chests). The **Daily Delve**: a seeded 3-minute shaft with a fixed loadout, scored by
depth against your own best, with a streak counter (day 7 of a streak = a relic). It works
offline: the seed is the local date.

### 6.5 The mystery thread: "Who lit the lintels?"

Every biome holds one tablet left by Halden, the first lamplighter, and by the people before
him. They run across the 10 worlds:

1. Earth S1-S2: carved lintels over sealed doors, each marked with the lantern rune. Halden: "The
   rune is not a warning. It is a signature."
2. Earth S3-S5: the builders went down, not up. Their cities are lit from below.
3. Earth S6-S7: at the core, a lantern the size of a moon, almost out. The Core Guardian is its
   keeper. Breaking it is not destruction: it opens the lantern's door, and your own lantern
   flares (Ascension).
4. Thalassa to Sol: every world has the same rune at its heart, each lantern dimmer than the last.
   Someone is lighting them in order.
5. The giants and TON 618: the lanterns are links in a chain. The black hole is a lantern turned
   inside out, and it has been calling.
6. The Galactic Heart: the tablets are in your handwriting.
7. The Lantern: the reveal. The descent is a light going down to wake itself; the rune on every
   lintel is your lantern's mark. After it come the Beyond worlds and a new tablet set per
   world (procedural verses from a 400-line pool), so the thread never closes completely.

---

## 7. Guidance

### 7.1 Tutorial script: the first 3 minutes (every step on screen, no text wall)

| Time | Beat | Screen | Ends when |
|---|---|---|---|
| 0:00 | Title card fades. The camera sits on the first row of a shaft under a village well, with 2 lanterns. | A ghost finger taps the middle block; "Tap the rock" (objective bar) | first block broken (1 hit: HP 4, damage 4) |
| 0:02 | Ore flies to the counter, the counter bumps | "Keep digging: 0 / 10 blocks" | 10 blocks |
| 0:06 | Hint: "Hold to dig faster" (ghost finger holds) | the hold ring fills under the finger | 1 s of hold |
| 0:10 | 3 m: the first chest row. The chest glints. | "Break the chest" | the chest breaks: +250 Ore (enough for Pickaxe Lv 1 + 2) |
| 0:15 | The best-buy card slides up and pulses: "Pickaxe Lv 1: 125" | arrow points at BUY | first purchase |
| 0:25 | The pickaxe ghost visibly grows a notch; damage numbers go up | "Reach 25 m" + progress bar | 25 m |
| 0:52 | Digger affordable (190): the card shows a silhouette that becomes the Digger | "Hire a Digger" | first crew bought |
| 0:55 | The Digger drops onto a scaffold and starts swinging | "Your crew digs even when you're away" (2.5 s toast) | auto |
| 1:00-1:30 | Golden Vein event (forced first at 1:10) | ring + "Tap the gold!" | tapped or 6 s |
| 1:50 | 100 m: the Guardian rises (camera shake, roar) | HP bar over it; "Break the Guardian" | broken |
| 1:55 | Boon pick, 3 cards, 1 forced highlight on "Sharp Edge" | "Choose a Boon" | picked |
| 2:00 | Biome reveal: "Slate Galleries", the back wall opens onto a lit cavern with bats | the Lantern Path gives Wick 1: "Shockwave unlocked" | auto (1.5 s) |
| 2:10-3:00 | Free play. The objective is now "Reach 200 m: Dynamite" | the next-goal bar | tutorial complete flag |

The tutorial cannot be failed. Every step has a 6 s fallback that does it for the player
(forced golden vein, auto-buy on the card) so nobody gets stuck.

### 7.2 The objective bar (always visible, 1 line, 40 px)

Exactly one objective is shown, chosen in this priority order:

1. A tutorial step.
2. A new system just unlocked (first time only): "Try Dynamite" until used once.
3. Prestige is clearly worth it: "Rekindle: +17 Embers = power x1.85" (gain doubles the Embers and descent
   slowed below 0.3 rows/s for 60 s).
4. The best buy has been affordable for more than 8 s: "Buy Pickaxe Lv 12".
5. The next Lantern Path step: "Reach 500 m: Frenzy" with a progress bar (depth / target).
6. The next record: "New record in 34 m".

The bar shows an icon, the text, a % fill and a reward icon. Tapping it opens what it points at.

### 7.3 Hints (contextual, at most 1 per 20 s)

| Trigger | Hint |
|---|---|
| No input for 8 s while playing | ghost finger on the front |
| A skill ready and unused for 30 s | the skill button pulses once |
| A crew milestone (x2) is 3 levels away and affordable | "x2 at Lv 25" chip on the card |
| Guardian HP > 60 s of your damage | "Use Dynamite" pointer |
| First time the descent drops below 0.3 rows/s | "The rock is getting tough. Upgrades or Rekindle make you stronger." |
| Offline earnings capped | "Your crew rested after 2 h. Upgrade Night Shift" (once) |

---

## 8. Portrait UI layout (390 x 844 CSS px; safe areas added on top)

| Band (y px) | Content | Notes |
|---|---|---|
| 0-56 | **Top bar**: left the Ore counter (32 px digits, roll-up, income/s under it at 12 px); centre the depth "412 m" (24 px) and the biome name (12 px); right the Embers and Echoes chip, then the prestige flame (48 x 48) when available | Lintel face, brass plate style from `ui/brand` |
| 56-96 | **Objective bar** (7.2): 358 x 40 px, 16 px gutter | always visible, including in menus |
| 96-640 | **Playfield**: the shaft; the front at y 354; event toasts appear at y 110-160 | numbers and loot fly over the playfield |
| 640-700 | **Skill row**: Dynamite, Frenzy, Magnet (56 x 56, radial cooldown), with the combo meter on the left | hidden until unlocked |
| 700-780 | **Best-buy card**: icon, name, "Lv 12 -> 13", effect "+18 % tap", cost, BUY button 96 x 64 | one tap = progress |
| 780-844 | **Tabs** (5 x 78 px): Pick, Crew, Boons, Path, Codex; a sixth "Era" tab appears with Collapse | 60 px touch height |
| drawer | a tab opens a sheet over y 300-780; the dig continues above it, and the shaft stays tappable above y 300 | buy x1 / x10 / to milestone / MAX toggle at the top of the sheet |

Small and large phones: at 360 x 740 the playfield is 96-546 and the front moves to 40 % (296
px); at 412 x 915 the playfield gains 71 px and blocks are 47.9 px. Every touch target is at least
48 x 48 px, and nothing scrolls horizontally. All text goes through `t()` with new keys in
`src/i18n/en/idle.ts`.

Number formatting: up to 999,999 with thin separators; then K, M, B, T, Qa, Qi, Sx, Sp, Oc, No,
Dc (to 1e33); then `4.21e57`; from e1,000,000 on, `e1.20M`. 3 significant digits everywhere.

---

## 9. Juice and feel

| Event | Visual | Audio (existing synth) | Haptic | Budget |
|---|---|---|---|---|
| Hit (chip) | spark puff 4-6 particles, crack stage, number pop (white, 18 px, rises 24 px over 0.5 s) | stone, metal or crystal click, pitch +0.5 semitone per 5 combo (max +7) | 8 ms | 24 live numbers; above that numbers merge ("x14") |
| Break | debris 6-14 chunks (DebrisSystem), 35 ms hitstop, a brief block flash on `uTargetHit` | break thump | 18 ms | particles per the quality preset (120 / 220 / 400) |
| Crit | gold number 1.6x size, 60 ms hitstop, star burst | high ping | 25 ms | |
| Ore pickup | chunks arc to the Ore counter in 0.45 s (screen space); counter scales x1.15 for 80 ms | coin tick, rate-limited to 20/s | none | up to 24 flying drops; beyond that, "ore streams" of 1 sprite per 10 drops |
| Row clear | horizontal light sweep 120 ms, "ROW" text, the camera eases down | rising clack | 30 ms | |
| Multi-row | rows collapse with 0.25 s drop, dust ring, "x12 ROWS" | bass drop | 40-20-40 | |
| Guardian hit | the Guardian flinches, chunks fall, the HP bar shakes | grunt, scaled pitch | 20 ms | |
| Guardian break | 80 ms hitstop, white flash, chest pop, the Boon cards fly in | fanfare (existing discovery cue) | [40,30,60] | |
| Biome reveal | the back wall crumbles into a lit cavern, the name card in the Lintel face, music layer change | music key change | 30 ms | 1.5 s |
| New crew tier | the crew model drops in with a dust puff and a nameplate | jingle | 20 ms | |
| Prestige | the shaft fills with light from below; ore flies up into the flame; white-out 0.6 s; a new shaft fades in | swelling chord | long [60,40,120] | |
| Dive | 5.7 | bass swell, whoosh | sustained pattern | |

Feel rules: hitstop never stacks beyond 80 ms per 0.5 s. Shake follows the camera-shake setting
and is screen space only. The numbers' colour shows the source: white (tap), gold (crit), cyan
(crew), orange (Dynamite), violet (Resonance). Bloom gets +0.2 strength for 0.3 s on crits and
row clears.

### 9.1 Visual quality bar ("much more beautiful, HD")

| Item | Value |
|---|---|
| Internal resolution | Balanced: pixel ratio cap 2.0 x render scale 1.0 (780 x 1688 at 390 x 844), up from 1.75 x 0.9. The shaft scene is 32 chunks instead of a 160 m zone, which pays for it. High: 2.5 x 1.0 with MSAA 4x. Battery: 1.5 x 0.85, no bloom. The QualityGovernor still steps down at a 22 ms median |
| The cut face | the z = 1 cross-section faces get a 3 cm warm rim along their outer edges and 8 % darker albedo, so the slice reads as a deliberate diorama cut, not missing geometry |
| Depth | no depth of field (cost). The existing atmosphere haze deepens the back caverns, and pockets are lit from inside, so they read as windows into bigger spaces |
| Emission restraint | per screen at most 3 strong emitters, and cyan at most 25 % of the lit area (the existing art direction); warm wall lamps every 8 rows carry the base light |
| Density | at least 12 props and 1 creature group visible on every screen (5.4) |
| Biome change | ATMOSPHERES preset and material palette blended over 8 rows, so a boundary is seen coming 6 rows ahead in the look-ahead |
| Motion | crew, creatures, moths, drops and number pops animate at the frame rate; the economy ticks at 10 Hz underneath |

---

## 10. Technical plan (reusing the engine)

### 10.1 Add

| File | Contents |
|---|---|
| `src/core/big.ts` | log-space number (`{ l: number }` = log10, sign-free), add/sub/mul/pow/compare, `geometricSum`, `format()` (8 above); pure, unit-tested |
| `src/idle/economy.ts` | rock HP, shop items, crew tiers, costs, bulk buy, best buy, milestones (4.1-4.3) |
| `src/idle/prestige.ts` | Rekindle, Collapse, Ascend gains and resets (4.6-4.8) |
| `src/idle/boons.ts`, `path.ts`, `laws.ts`, `guilds.ts`, `trials.ts`, `stars.ts`, `worlds.ts` | the tables of section 4 as data plus pure functions |
| `src/idle/offline.ts` | closed form plus 60 s stepping (3.2) |
| `src/idle/events.ts`, `collections.ts`, `daily.ts`, `expeditions.ts`, `objective.ts`, `tutorial.ts` | sections 6 and 7 |
| `src/idle/sim.ts` + `tools/sim-economy.ts` | the calibration sim (Appendix A) as a library plus a CLI; it runs in Vitest |
| `src/world/shaft/ShaftWorld.ts` | ring-buffer adapter over `VoxelWorld` (row mapping, band recycling, origin rebase) |
| `src/world/shaft/shaftGen.ts`, `biomes.ts`, `shaftWorker.ts` | band generator per archetype and stratum, the content budget (5.4), Wonders |
| `src/game/ShaftCamera.ts` | 5.2 |
| `src/game/DigController.ts` | tap to hit, overflow, area, Dive detection (2.1); uses `MiningController.pick()` |
| `src/game/Crew.ts` | instanced crew models (VoxBuilder), scaffolds, hit scheduling |
| `src/game/effects/NumberPop.ts`, `LootStream.ts`, `DiveFx.ts`, `PickGhost.ts` | 9 |
| `src/ui/idle/*` | top bar, objective bar, skill row, best-buy card, tabs, drawers, prestige screens, return screen |
| `src/i18n/en/idle.ts` | every string of this document |

### 10.2 Replace

| Current | Becomes |
|---|---|
| `game/Game.ts` modes and frame loop | the idle loop: input, dig, economy tick (fixed 10 Hz for economy, render at frame rate), events, autosave |
| `game/Progression.ts`, `gameplay/Records.ts` | `idle/prestige.ts` plus records of depth, run time and gains |
| `ui/hud/Hud.ts` | `ui/idle` HUD |
| `ui/TouchControls.ts` | tap and hold only (no joystick, no look) |
| `render/lighting.ts` ATMOSPHERES | 12 archetype presets x stratum tint, blended over 8 rows at biome boundaries |
| `render/Renderer.ts` quality presets | Balanced 2.0 x 1.0, High 2.5 x 1.0 with MSAA 4x, Battery 1.5 x 0.85 (9.1); view distance drops to 90 m (the camera far plane) |
| `save/types.ts` | save v3: economy state as log10 numbers, shaft seed and absolute row, prestige, collections; a migration from v2 grants a "Veteran" lantern style and starts fresh |

### 10.3 Delete (or leave unused)

`world/gen/generateWorld.ts` and `features/*`, `game/PlayerController.ts`, `CameraRig.ts`,
`touchCamera.ts`, `aimAssist.ts`, `ropeRide.ts`, `runeDoor.ts`, `world/analysis/homeField.ts` and
`reachability.ts`, `gameplay/Cold.ts`, `Expedition.ts` (old), `Lantern.ts` (fuel), `Crafting.ts`
and recipes, the workbench and journal screens (the Codex replaces the journal), and the entities
of the explorer (kept only for the menu scene if wanted).

### 10.4 Kept as they are

Mesher (unchanged: the cutaway is an air layer), mesh workers, LightField (with Y wrap), terrain materials (plus 6
layers), PostFX (plus the Dive streak pass), Particles, Debris, Drops (screen-space fly mode),
TargetMarker, PropRenderer and the prop library, structures for Wonders, audio, haptics, the brand
UI, the QualityGovernor, release tooling and the crash panel.

### 10.5 Performance budget (2022 mid-range Android, Balanced)

| Item | Budget |
|---|---|
| Chunks drawn | <= 32 terrain chunks (2 x 8 x 2) |
| Triangles | <= 120 k (terrain 60 k, props 30 k, crew 20 k, effects 10 k) |
| Draw calls | <= 90 |
| Main thread per frame | <= 6 ms CPU (economy tick 0.2 ms, dig 0.3 ms, crew 0.5 ms, number pops 0.3 ms) |
| Band streaming | <= 4 ms main thread per band (copy, light upload of a 32 x 16 x 32 sub-box) |
| Dive regeneration | first frame of the new depth <= 400 ms after the Dive starts |
| Memory | world plus light < 1 MB; total JS heap < 150 MB |
| Offline 8 h | <= 50 ms |

### 10.6 Risks and answers

| Risk | Answer |
|---|---|
| Float precision at enormous depths | floating origin rebased every band; textures and noise use local plus offset coordinates; the absolute row is only a seed |
| Meshing cannot keep up with fast descent | look-ahead of 88 rows, at most 2 bands per second streamed; beyond that the Dive teleport takes over |
| Numbers overflow | log-space everywhere in the economy; no `number` holds a raw value above 1e300 (lint test) |
| The economy runs away or stalls after tuning | `tools/sim-economy.ts` in CI with the curve of 4.10 (11.1); only one compounding lever |
| Light at the ring seam | the seam is always 40 rows above the view; light propagation never crosses the seam (bands are computed with the 1-band context below) |
| Too many systems for "ultra simple" | progressive unlocks (4.5): the first 10 minutes show only tap, one card and the crew; each system arrives with a 1-line objective and is optional |
| Mid-range GPU fill rate with bloom and the Dive pass | the Dive pass runs only during Dives; the QualityGovernor drops to Battery (bloom off) as now |

---

## 11. Acceptance metrics (checked by tests or the simulator)

### 11.1 Economy (tools/sim-economy.ts, player model of 4.10)

| Metric | Target |
|---|---|
| First purchase | <= 15 s (with the 3 m chest) |
| First crew | <= 60 s (sim 52 s) |
| 100 m (first Guardian) | 1:30-3:00 (sim 1:50 at 4 hits/s) |
| Hits per block, median over the first 10 minutes | 1-3 |
| First Rekindle available | 12-22 min (sim 17 min) |
| Rekindles in the first 45-minute session | 2-4 (sim 3) |
| Record at the end of day 1 | 600-1,200 m (sim 810 m) |
| First Collapse | day 3 or 4 (sim: day 3, session 2) |
| First Ascension | day 8-12 (sim: day 9, session 3) |
| Worlds 2-6 | 2.5-6 days each (sim 5.0, 4.6, 4.0, 3.4, 3.6) |
| No stall | the record biome grows by >= 1 every simulated day, days 1-40 |
| No runaway | no world finished in < 2 days within the first 40 days |
| Novelty, first 45 min | gap between consecutive new things (crew tier, biome, Wick, Rekindle, Boon, event, crew milestone, pickaxe tier) <= 90 s; core-only gap <= 420 s (sim 411 s) |
| Offline | 2 h away with Night Shift and no autobuy gives >= 30 % of the biome gain of 2 h of active play from the same state (sim: +0.85 vs +2.32 biomes = 37 %) |

### 11.2 Runtime and world

| Metric | Target | Test |
|---|---|---|
| Content per screen | every 19-row window has >= 1 pocket or Wonder, >= 2 lights, >= 1 creature group, >= 1 special block | `shaftGen.test.ts` over 10,000 rows of each world |
| Determinism | a band is byte-identical for the same (seed, world, row) | unit |
| Ring correctness | after 1,000 rows streamed, meshes equal a fresh mesh of the same rows (existing meshCheck) | e2e |
| Dive | new depth visible <= 400 ms; no frame > 50 ms during the swap | perf.mjs |
| Frame time | p95 <= 16.7 ms on Balanced in perf.mjs; draw calls <= 90; triangles <= 120 k | perf.mjs |
| Tap response | first visual (chip or number) in the frame after the touch | e2e with CDP touch |
| Tap targets | >= 48 x 48 px effective (block plus 36 px snap) at 360, 390, 412 widths | ui-check |
| Objective bar | visible in every state (play, drawer open, prestige screens, return screen) | ui-check |
| No horizontal scroll | at 360 x 740, 390 x 844 and 412 x 915 | ui-check |
| i18n | no literal player-facing strings in `src/ui/idle` and `src/idle` | lint test |
| Number format | 1e3 "1.00K", 1e33 "1.00Dc", 1e57 "1.00e57", log 1e6 "e1.00M" | unit |
| Save | v3 round-trip; v2 migration; offline 8 h computed in <= 50 ms | unit |
| Never dark | in a `capture.mjs` shot of each archetype at 390 x 844, the mean luminance of the 6 rows around the front is 0.20-0.50 and no 64 px horizontal band is more than 40 % near-black | capture + png.mjs |
| Variety | consecutive biomes differ in mean hue by >= 25 degrees or in mean luminance by >= 0.08 in those shots | capture + png.mjs |

---

## Appendix A. Calibration simulator rules (to re-implement)

```
state: run {b, ore(log10), pickL, crew[k] levels, boons}, Embers E, Wicks W, Echoes Ec,
       Collapses, Stars S, world n
M (log10) = log(1 + 0.1 E) + min(W,84) log 1.05 + max(0,W-84) log 1.005
          + Ec log 1.04 + boons log 1.15                      (+ D_n, which cancels HP's offset)
tapDPS   = 4 hits/s x (4 + 2 pickL) x 2^m(pickL) x 1.45 (crit 5 % x10) x 10^M  [+ tau x crewDPS]
crewDPS  = sum_k 5^k x L_k x 2^m(L_k) x 10^M
cost     pick: 125 x 1.08^L; crew k: 190 x 12^min(k,7) x 20^max(0,k-7) x 1.07^L  (doc units)
ore/s    = DPS / 4 (one Ore per 4 HP)
depth    7 blocks per row; HP(b) = 4 x 10^(b (1 + 0.04 n)); dD/dt = DPS / (7 HP(b));
         b advances by rows / (biome length in rows)
buy      every second, repeat: best affordable of {+1 level, +to next milestone} by
         (DPS gain)/cost (pickaxe only while active)
Wick     +1 at each biome reached for the first time ever (84 per world)
Rekindle at b >= 4: E += floor(10 x 1.7^(b-4) x (1+Ec) x (1+0.5 S)) when gain >= max(10, E)
         and run >= 8 min, or stalled 2 min and gain >= 0.1 E
Collapse at b_era >= 10: Ec += floor(5 sqrt(b_era - 1) (1 + 0.5 S)) when gain >= 15 and
         (stalled or run >= 20 min); resets E
Ascend   at b = 84: S += 1, n += 1; resets E, Ec
offline  60 s steps, crew only, efficiency 0.5 / 0.75 (W>=6) / 1 (after Collapse 1);
         cap 2 h / 8 h (W>=16) / 24 h (after Collapse 1); autobuy from W>=10;
         auto-Rekindle offline from Ec >= 40
tau      0.05 (W>=12), 0.2 (W>=25), 1 (W>=40)
sessions day 1: 0:00-0:45, 3:45-4:05, 8:05-8:35; days 2+: 0:00-0:25, 4:25-4:45, 9:45-10:15
```

Sensitivity found while calibrating (keep these as design rules):

1. Per-biome feedback (Boons, Wicks, Embers per biome, amplified about x2.2 by reinvestment) must
   stay below about 50 % of the HP growth per biome. In an earlier model, Boons of x1.4 per biome
   made the first run explode to 25 km in 4 minutes, and x1.2 with steeper HP stalled for good at
   10 km.
2. Exactly one compounding lever (Echoes). With Echo gain proportional to depth instead of its
   square root, Collapse became exponential in its own output and finished the Earth in 2 days.
3. A world's start must be breakable at once: Star power has to cancel the HP offset exactly.
   Otherwise the first block of world 2 cannot be broken and the game deadlocks (seen in the sim).
4. World size must be display-only (metres per row), not extra rows. Otherwise bigger worlds add
   log10(scale) of difficulty and world 7 stalls.
