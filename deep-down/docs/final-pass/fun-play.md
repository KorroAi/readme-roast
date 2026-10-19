# Fun spec — play-variety

## Pitch
Today each block is the same 1.07 s hold for 1 stone, and the zone runs out of goals at about minute 6, when the HUD says "All objectives complete". This plan changes three things. First, mining gets a skill and some luck. A spark flashes after every impact, and tapping again inside that window lands a clean strike: 2.5x damage and +1 ore. It works with a finger tap, the new Mine button or the mouse, and holding never triggers it. A lucky strike pays x3, is guaranteed on the 5th ore break of a new game and never comes more than 16 breaks apart. A clean or lucky break on a vein sets off a vein rush that breaks the connected ore. About 13 walls in ordinary rock knock hollow when hit; cracking one reveals a glowing geode or a copper/iron nest. Second, every trip gets a purpose: from the first return with the copper pickaxe, an Expedition Board offers 3 contracts, one each for haul, explore and skill ("Bring back 3 glimmer", "Reach 108 m down and be back within 2:30", "Crack 2 hollow pockets"), paid into camp storage. Third, every return is a small celebration: an Expedition Report shows the deepest point and records, about 25 one-time firsts, the ore banked and the contract result, then offers the next choice. A small cadence director makes sure the player never goes 60 s outside camp without something new: when it goes quiet, a hollow wall knocks, a vein glints or a speck of copper flashes in plain rock. In a model of a first-time player on the real map, notable moments rise from 21 to 83 over 15 minutes, and the longest quiet stretch drops from 297 s to 54 s.

## Measured today
Measured with read-only scripts on the real generated zone (measure.ts, pockets-proto.ts, cadence-sim.ts, iron-check.ts in /tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fun-design/, with .log files beside them) and 3 captures in /home/user/readme-roast/deep-down/artifacts/fun-design-moment/ (m01, m02, m03, all read).

Mining time per block, counting the first impact at 0.55 of the 0.42 s swing:
- Rusty pick: soil/gravel 0.65 s; slate/umber 3 hits, 1.07 s; deep slate, copper and crystal 4 hits, 1.49 s.
- Copper pick: slate 0.65 s; copper 1.07 s; iron 1.49 s; hardened slate 1.91 s.
- Every block gives exactly 1 item (copper 1-2). Nothing varies, no bonus, no event.

Ore:
- Copper: 119 voxels in 89 clusters, 65 % of them single voxels, max size 3.
- Iron: 49 voxels in 35 clusters; only 3 are in reach before the seal.
- Crystal: 35 voxels in 19 clusters, plus 12 minable crystal props.
- 19 exposed copper voxels within reach of the tunnel route.

Walking:
- The whole critical path, camp to balcony, is 216 m: 47 s at full speed, about 63 s in practice.
- BFS cells from camp: ledge 85, stairs foot 145, seal 156, balcony 205, shrine 204.
- 36 points of interest lie along the route, 6 m apart on average; the largest gap is 38 m (the stair flights).
- So the problem is not empty space. It is time: one action, the same walk, and no goals.

Progression and fuel:
- All 3 recipes together need 18 copper, 28 stone and 3 glimmer: about 45 block breaks, or 2-3 minutes of mining.
- The lantern holds 300 s of oil against at most about 60 s to walk home, so an efficient player never runs low.

First-session cadence (model on the real map; first-timer profile at 2.3 m/s and 1.8 s of aiming per block):
- Before: 21 notable moments in 14.3 min. Per minute: 3 2 4 2 1 3 2 1 1 1 0 0 0 0 1.
- The objective chain is done at 5.9 min. The longest quiet stretch is 297 s, with other gaps of 95 s and 100 s.
- A fast-player profile gives 20 moments in 9.5 min, with a longest gap of 204 s.
- About 1 real decision per trip.

Bug found: the Iron Vein discovery only fires when the pick is too weak for iron. The seal must be broken with the copper pick, which can mine iron, and only 3 iron voxels are reachable before it. So in a normal run the 6th discovery never fires.

Pocket prototype: 424 valid hollow-pocket sites. A seeded pass keeping sites 10 m or more apart picks 13, four of them on the tunnel route at 26, 40, 67 and 91 m.

After (same model with this spec): 83 notable moments in 15.6 min (75 for the fast profile); longest quiet stretch 54 s (41 s fast); every minute has at least 1.

## Spec
# DEEP DOWN — Moment-to-moment fun (systems, not places)

Full spec file: /tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fun-design/spec-moment-to-moment.md (about 46 KB). This is a condensed copy of the same spec; the file has the complete event list, i18n key list, feel tables and per-minute pacing tables.

## 0. Pitch
Today each block is the same wait: hold for 1.07 s, get 1 stone. The zone runs out of goals after about 6 minutes. This pass changes three things:

1. **Mining gets a skill and some luck.**
   - Tap in rhythm with the spark for a *clean strike* (works with the finger, the Mine button and the mouse).
   - Rare *lucky strikes* pay x3, with a pity timer.
   - A clean or lucky break on a vein sets off a *vein rush* through the connected ore.
   - Ordinary rock sometimes *knocks hollow*; cracking it reveals a geode or an ore nest.
2. **Every trip gets a purpose.** An Expedition Board offers 3 contracts, one each for haul, explore and skill, paid into camp storage.
3. **Every return is a small celebration.** An Expedition Report shows records, firsts, banked ore and the contract result, then offers the next choice.

A small cadence director makes sure the player never walks 60 s without something new: a hollow wall knocks, a vein glints, or a speck of copper flashes in plain rock.

## 1. Measured today
Sources: read-only scripts measure.ts, pockets-proto.ts, cadence-sim.ts and iron-check.ts in the scratch folder, with .log files; captures artifacts/fun-design-moment/m01, m02, m03; artifacts/arch4-4/a12-balcony.png.

- **Mining time** (first impact at 0.55 x 0.42 s):
  - Rusty pick: slate/umber 3 hits, 1.07 s; deep slate, copper and crystal 4 hits, 1.49 s.
  - Copper pick: slate 0.65 s; copper 1.07 s; iron 1.49 s; hardened slate 5 hits, 1.91 s.
  - Always 1 item per block (copper 1-2). No variation, no bonus, no event.
- **Ore:**
  - Copper: 119 voxels in 89 clusters (65 % single voxels, max 3).
  - Iron: 49 voxels in 35 clusters; only 3 are in reach before the seal.
  - Crystal: 35 voxels in 19 clusters, plus 12 cluster props.
  - 19 exposed copper voxels within reach of the tunnel route.
- **Walking:**
  - Critical path 216 m: 47 s at full speed, about 63 s in practice.
  - BFS cells from camp: ledge 85, stairs foot 145, seal 156, balcony 205, shrine 204.
  - 36 points of interest on the route, 6 m apart on average, largest gap 38 m. The problem is not empty space; it is time: one action, the same walk, no goals.
- **Progression and fuel:**
  - All 3 recipes: 18 copper, 28 stone, 3 glimmer, about 45 breaks, or 2-3 minutes of mining.
  - Lantern 300 s of oil against at most about 60 s home: an efficient player never runs low.
- **Bug:** the Iron Vein discovery only fires when the pick is too weak for iron. The copper pick is needed to pass the seal and can mine iron, so the discovery never fires in a normal run.
- **Cadence model, first-timer profile:**
  - Before: 21 notable moments in 14.3 min. Per minute: 3 2 4 2 1 3 2 1 1 1 0 0 0 0 1.
  - Chain done at 5.9 min; longest quiet stretch 297 s; about 1 real decision per trip.
  - Fast profile: 20 moments in 9.5 min, longest gap 204 s.

## 2. Rules for this pass
- **Inputs.** The lead is adding touch aim assist and a Mine button, so the aim no longer follows a finger. Clean strikes are therefore timing-based: a fresh press (rising edge of input.mining) inside a window after the last impact. Holding never counts.
- **RNG.** Fun systems use hash-based rolls on saved counters, never the shared drop rng.
- **Saving.** Fun systems never call saveNow; they ride on existing saves. Contract rewards go into storage before banking and the 'camp' save.
- **UI.** The report never blocks input. Button names stay e2e-safe ('Take', 'Onward'). No hyphen directly before digits and ' m' in my texts.
- **World generation.** The pocket pass runs last in generateWorld, with its own Rng and pocket_<n> ids. It adds no emitters.
- **Performance.** No per-frame allocation; 2 Hz scans over precomputed lists; at most 2 raycasts per second; 0.15 ms per frame or less.

## 3. Systems
- **M1 Rhythm strikes (MUST).**
  - Window: impact +0.14 to +0.34 s. The first press after an impact decides; an early press fizzles. Rhythm carries across blocks if the last impact is 0.6 s old or less.
  - Clean strike: x2.5 power, +1 ore on a clean break (stone 25 %), gold burst, 40 ms hit-stop.
  - Resulting times: rusty slate 0.65 s (was 1.07); copper-pick hardened slate 1.07 s (was 1.91).
- **M2 Lucky strike and vein rush (MUST).**
  - Lucky: p = 0.06; guaranteed on the 5th eligible break of a new save and after 16 without one; x3 drops; 140 ms hit-stop.
  - Rush: a clean or lucky ore break cracks up to 4 connected same-id voxels, 0.11 s apart.
- **M3 Hollow pockets (MUST).**
  - Placement: 424 valid sites on the real map; 12-14 chosen, 10 m or more apart. The tunnel route gets pockets at 26/40/67/91 m.
  - Contents: geode (an emissive crystal prop, glimmer 2-4) 60 %, or ore nest (3-5 ore wall voxels, a guaranteed rush) 40 %.
  - Knock sound and dust when hit; reveal callout. No new save fields.
- **M4 Streak, records, firsts (MUST).**
  - Ore streak: 6 s window; bonus at x5.
  - Depth marks 60/75/100/125 m.
  - 25 firsts, including the 4 inscriptions waking under the lantern.
  - Iron Vein fix.
- **M5 Contracts (MUST).**
  - 3 offers (haul, explore, skill); 12 templates with L0/L1/L2 numbers; rewards into storage.
  - Stars set the board level; a contract chip on the HUD; once the chain is done, the HUD shows the contract.
- **M6 Report and notice budget (MUST).**
  - The report is non-blocking and hides itself after 12 s.
  - One center callout at a time, with priorities; FIRST ribbons rate-limited.
- **M7 Cadence director (MUST).**
  - At 40 s of quiet it fires knock, glint or fleck, or a special event registered by the content agent; then resets to 15 s.
  - Without the fleck nudge, the model still has a 69 s quiet walk home.
- **M8 Measurement (MUST).** The cadence tool and test, the capture tour f01-f11, full regression.
- **S1 Turn-back estimate (SHOULD).** Fuel against a BFS distance home: amber below 1.5 x home + 15 s, red below home. The model fires it on the balcony at 6.1 min.
- **S2 Black-out cache (SHOULD).** Skip if progression owns E4.
- **C1 Rune lock and C2 supply crates (COULD).** Handoffs.

## 6. Pacing, first 20 min
- **Before:** 21 notable moments; none in minutes 10-14; longest quiet stretch 297 s.
- **After:** 83 moments in 15.6 min; every minute at least 1; longest quiet stretch 54 s.
  - Minute 1-2: streak, lucky, pocket P0 copper nest with a vein rush.
  - Minute 2-3: first report, pickaxe crafted, the Board opens.
  - Minute 6-7: the turn-back choice on the balcony.
  - Minute 10-15: Hollow pocket sweep and the first contract complete.
  - Minute 15-20: the timed run and board level 1.

## 7-11. Ownership, needs from others, tests, acceptance, budget
See the file. Time budget: MUST about 3 h 55 min; SHOULD +55 min. If time runs short, cut S2, then S1, then the lean and ember templates, then the rush animation.

## Items

### [MUST] M1 Rhythm strikes (clean strikes)

- **what:** After any impact that does not break the block, a warm spark flashes at the strike point. The first fresh press after an impact decides: inside the window, the next swing is a clean strike; before it, the chance is spent and the spark fizzles. Rhythm carries across blocks if the last impact is 0.6 s old or less. A clean strike deals power x2.5, with a gold burst, a 40 ms hit-stop and a chain pitch. If the breaking hit is clean, ore and crystal drop +1 (stone +1 at 25 %). Holding never triggers it, so hold-only players and every e2e hit count stay exactly as today. A one-time hint appears after the 3rd block. Eligible blocks are derived (hardness 2.5+, breakable, has a drop), so new ores join automatically.
- **where:** Every mined stone, ore or crystal block in the zone. Works with finger tap, the Mine button and the mouse, because it is timing-based rather than aimed (the lead is adding touch aim assist).
- **numbers:** Window opens at impact +0.14 s and closes at +0.34 s; previous impact must be 0.6 s old or less. Power x2.5. Spark #FFE7A8 x1.6, 0.22 m. 8 gold particles, 40 ms hit-stop, trauma +0.04. Rusty pick: slate 2 hits / 0.65 s (was 1.07 s). Copper pick: copper ore 0.65 s (was 1.07 s), iron 1.07 s (was 1.49 s), hardened slate 3 hits / 1.07 s (was 1.91 s). Mashing every 150 ms lands about 7 %; a rhythm tapper about 70-80 %. 5 clean in a row = the 'steady' first.
- **files:** ["src/gameplay/Strikes.ts", "src/game/effects/Spark.ts", "src/config/fun.ts", "src/gameplay/Mining.ts (hit mult param)", "src/game/MiningController.ts (press edge, swingStart, mult)", "tests/unit/fun-strikes.test.ts"]
- **test:** Unit: 10,000 simulated holds give 0 clean strikes; a press at +0.2 s always lands; a press at +0.05 s fizzles and blocks; 150 ms mashing lands at most 10 %; a clean break gives +1 ore; rusty pick on slate takes 3 hits held and 2 with one clean strike. Regression: e2e hit counts unchanged. Capture: f01 (spark) and f02 (burst).

### [MUST] M2 Lucky strike with pity + vein rush

- **what:** Every ore or crystal break, cluster-prop break or rush break can be lucky. The roll is hash-based on counters saved with the game, so it never touches the drop RNG. A lucky strike gives x3 drops, a 140 ms hit-stop, a gold flash and a 'LUCKY STRIKE! x3 Copper Ore' callout. A clean or lucky break of an ore voxel with same-id neighbours (6-connected) sets off a vein rush: up to 4 connected voxels crack and break in sequence, each with normal drops and a normal block:broken event.
- **where:** All ore/crystal breaks. In the first-timer model, the guaranteed first lucky strike lands at about 1:10 in the tunnel copper stretch. Ore nests (M3) guarantee rushes in the first expedition.
- **numbers:** p = 0.06. Guaranteed once 16 eligible breaks pass without one; the 5th eligible break of a new save is always lucky. x3 drops (clusters x2). Flash 0.22, trauma 0.35, 28 sparkles. Rush: up to 4 voxels, 0.11 s apart, pitch +0.06 per step. 24 of 89 copper clusters can rush today.
- **files:** ["src/gameplay/Strikes.ts", "src/game/MiningController.ts (rush queue, breakBonus hook)", "src/config/fun.ts", "tests/unit/fun-strikes.test.ts"]
- **test:** Unit: over 10,000 eligible breaks the gap never exceeds 16; the 5th break of a new save is lucky; total rate 7-10 %; rollDrop sequences identical with and without fun systems; rush stays on the same id, at most 4, never touches unbreakable or structure cells, and each break emits block:broken. Capture: f03 (lucky) and f05 (rush).

### [MUST] M3 Hollow pockets: geodes and ore nests with the knock

- **what:** A deterministic pass, run last in generateWorld with its own Rng, carves 12-14 sealed 2-voxel cavities behind a 1-voxel rock skin next to walkable ground. Contents: a geode (an emissive crystalCluster prop, no light voxels) or an ore nest (3-5 cavity wall voxels turned to copper or iron, a guaranteed vein rush). Any block next to an unrevealed cavity sounds hollow when hit: a knock sound, dust, and the target name 'Slate · hollow' (first time: a hint). Breaking it reveals the pocket with a hit-stop, sparkles and a 'Geode!' or 'Copper nest!' callout. No new save fields: revealed state is derived from the world.
- **where:** Prototype on the real zone: 424 valid sites; 13 chosen. Tunnel route at 26/40/67/91 m (skins 60,100,41 · 69,99,49 · 79,93,65 · 96,87,66); the rest 9-13 m off the paved way across the Hollow floor and beyond the seal.
- **numbers:** Skin = slate, deep slate or umber at foot or chest height; cavity = 2 voxels deep and fully enclosed. Rules: nothing built within 2 m, 4 m or more from props, outside camp +2 m, within 6 m of a walked path in the tunnel or 14 m in the Hollow, pockets 10 m or more apart. Quotas: tunnel 4, upper 1, Hollow floor 6, beyond seal 3. Geode 60 % (glimmer 2-4), nest 40 % (copper above y 60 or before the seal, iron beyond). Reveal: 150 ms hit-stop, trauma 0.3, 36 sparkles. Generation cost 30 ms or less; cyan emitter budget unchanged.
- **files:** ["src/world/gen/pockets.ts", "src/world/gen/types.ts (pockets field)", "src/world/gen/generateWorld.ts (1 hook line before bedrock re-assert)", "src/game/FunDirector.ts", "tests/unit/fun-pockets.test.ts"]
- **test:** Unit: 12-14 pockets, deterministic; each cavity enclosed; each skin next to a cell reachable from spawn with barriers open; 10 m or more apart; no built form within 2 m; at least 4 within 6 m of the first 100 m of the critical path; cyan emitters still 120 or fewer; worldgen.test green. Capture: f04 (knock dust at P0), f05 (nest), f06 (geode).

### [MUST] M4 Ore streak, depth records, journal of firsts, Iron Vein fix

- **what:** Ore streak: each eligible break within 6 s of the previous one adds 1, shown as an xN badge by the pickup feed; the pickup chime climbs a semitone per step; x5 and every +5 gives +1 of that ore. Depth records at 60/75/100/125 m, saved, each with a callout once. 25 one-time firsts, each a gold ribbon and a line in the report: copper, glimmer, iron, clean, steady, lucky, rush, pocket, geode, nest, streak x3, streak x5, the four depth marks, first contract, the four inscriptions waking under the lantern (gate frieze, shrine-door lintel, shrine band, balcony runes), home on an ember, a full pack home, home with under 10 % oil. Fix: the Iron Vein discovery also fires on the first iron hit or break.
- **where:** Everywhere; the inscriptions are the 4 existing glyph-stone groups.
- **numbers:** Streak window 6 s; bonus at x5, x10, ...; pitch cap +7 semitones. Depth marks 60/75/100/125 m (camp is at 49 m). Inscription wake radius 6 m with the vertical distance scaled by 0.35 (as in the shader). Record text 'New depth record · 108 m' (no hyphen before digits, for e2e safety).
- **files:** ["src/gameplay/ExpeditionLog.ts", "src/config/fun.ts", "src/i18n/en.ts", "src/game/Game.ts (ironVein one-liner)", "tests/unit/fun-log.test.ts"]
- **test:** Unit: the streak window and the x5 bonus; each record mark fires once; each first fires once per save; the report snapshot has the expected shape; Iron Vein discovery fires on a copper-pick iron hit. Capture: f07 (HUD badge and ribbon).

### [MUST] M5 Expedition contracts (the Board)

- **what:** Unlocks when the Copper Pickaxe is crafted. Always 3 offers, one each from haul, explore and skill, picked by hash from eligible templates (gated by tier, discoveries and remaining pockets). One active contract at a time, free to swap at camp, never fails. Haul: copper, glimmer, iron in one trip. Explore: reach a depth, stand at a place, timed run, lean run (come home with a given % of oil). Skill: clean strikes, streak, pockets, ember run home, lucky strikes. Explore and skill contracts complete on the spot ('Reward waiting at camp'); hauls complete at camp. Rewards go into storage at the next camp entry, before banking and the 'camp' save. Stars set the board level. A contract chip sits under the objective; once the chain is done, both hudState and snapshot show the contract.
- **where:** Camp, via the Expedition Report card and a Contracts pill at camp. If progression builds an Expedition Board station (E3), it opens the same board view.
- **numbers:** L0 (0-2 stars) / L1 (3-6) / L2 (7+). Haul copper 6/10/14 for glimmer 2/3/4. Haul glimmer 3/5/7 for copper 6/8/10. Haul iron 3/6/9 for glimmer 3/4/5. Depth 100/115/125 for copper 4/6/8. Place for glimmer 2. Timed run 100 m in 3:00 / 108 m in 2:30 / 125 m in 3:00 for copper 6/8/10. Lean run 100 m with 45 % oil / 115 m with 40 % / 125 m with 35 % for glimmer 3/4/5 (L1+). Clean strikes 12/25/40 for copper 4/6/8. Streak x4/x6/x8 for glimmer 2/3/4. Pockets 1/2/3 for glimmer 3/4/5. Ember run for glimmer 4/5/6 (L1+). Lucky 1/2/3 for copper 6/8/10 (L1+). Copper yield per ore block rises from 1.5 to about 2.1.
- **files:** ["src/gameplay/Contracts.ts", "src/config/fun.ts", "src/game/FunDirector.ts", "src/game/Game.ts (reward before bank, objectiveText fallback)", "src/ui/types.ts (optional takeContract)", "tests/unit/fun-contracts.test.ts"]
- **test:** Unit: always 3 offers from distinct families; gating holds (no iron at tier 1, no lean run at L0); each template completes from synthetic events; rewards land in storage before the 'camp' save; save round trip; a save without the fun field loads. e2e stays green (pill 0/6 after banking; 'camp' save reason unchanged).

### [MUST] M6 Expedition Report + notice budget

- **what:** On camp entry, after a trip of 25 s or more where something happened, a card appears that does not block input: 'Expedition 3 · 4:12', deepest point with a Record! badge, banked items as icons, a line of counts (mined, clean, lucky, rushes, pockets, best streak), up to 6 firsts, the contract result, the 3 offers with Take buttons when no contract is active, and an Onward button. It hides itself after 12 s, on leaving camp or on opening a screen. Data travels on the bus (expedition:report), so GameUi needs no new method. The notice budget stops pile-ups in the busy first minutes: one center callout at a time with priorities, merged sub-lines, rate-limited FIRST ribbons, and callouts waiting while a discovery banner shows.
- **where:** Camp on return; the callout layer on the HUD.
- **numbers:** Threshold: trip of 25 s or more and (3+ blocks, a new depth or any notable moment). Auto-hide 12 s. Callout 1.4 s each, queue of 3. Priority: lucky 5 > pocket 4 = contract 4 > record 3 = rush 3 > first 2 > nudge 1. Ribbons at most 1 per 1.2 s, queue of 4. Button names 'Take' and 'Onward' (never Close/Continue/Craft/Workbench, for e2e safety).
- **files:** ["src/ui/screens/report.ts", "src/ui/hud/FunHud.ts", "src/ui/fun.css", "src/ui/UI.ts (3 mount lines)", "src/game/FunDirector.ts"]
- **test:** Unit: report shape and threshold; the notice queue merges same-moment events and respects priorities. e2e: the 4 specs stay green (non-blocking card, safe names). Capture: f08 (report with record, firsts, finished contract and 3 offers) and f03/f07 (no pile-up).

### [MUST] M7 Cadence director (knock / glint / fleck + register API)

- **what:** Tracks seconds outside camp since the last notable moment. At 40 s it fires one nudge by weighted hash: knock (the nearest unrevealed pocket within 8 m knocks 3 times with dust), glint (a visible exposed ore voxel within 10 m in front sparkles for 12 s; breaking it gives the clean-break bonus), fleck (a visible plain-rock voxel within 6 m sparkles for 15 s and drops 1 copper/iron or glimmer), or a special event registered by the content agent. The counter is then set to 15 s. The fleck is what removes the last quiet walk home in the model.
- **where:** Outside camp; never during a discovery banner or the first 20 s of a trip.
- **numbers:** Threshold 40 s; reset to 15 s after a nudge (so the next comes 25 s or more later). Weights and cooldowns: knock 4 / 40 s, glint 3 / 50 s, fleck 2 / 30 s. Fleck loot: 70 % copper (iron below 100 m once the pick is tier 2), 30 % glimmer, hash-based. Scans at 2 Hz over precomputed lists (about 150 ore voxels, 14 pockets); at most 2 raycasts per second. Model: longest quiet stretch 69 s without the fleck, 41 s (fast) / 54 s (first-timer) with it.
- **files:** ["src/game/FunDirector.ts", "src/config/fun.ts", "src/game/effects/Spark.ts"]
- **test:** Unit: the director fires at 40 s and resets to 15; it never fires in camp; register() lets a test nudge fire; fleck loot is deterministic. Cadence test (see M8). Capture: f10 (fleck on Hollow rock).

### [MUST] M8 Cadence tool + test, capture tour, regression

- **what:** tools/fun-cadence.ts ports my cadence-sim.ts onto the real modules (config/fun.ts, layout.pockets, Strikes.luckyRoll, Contracts, the director's pick). It walks real BFS paths for a fast and a first-timer profile, printing before/after per-minute tables and the longest quiet stretch; tests/unit/fun-cadence.test.ts asserts the targets. Capture tour tools/fun-tour.json runs through tools/play.mjs at 915x412 into artifacts/fun-moment-after/ (f01-f11), every image read and described. Then tsc, vitest, build and the 4 e2e specs.
- **where:** Whole first session on the real map.
- **numbers:** Targets (first-timer profile): longest quiet stretch outside camp 60 s or less (today 297); 60+ notable moments in 15 min (today 21); every minute at least 1; breaks carrying an extra at least 35 % for a tapping profile and 12 % hold-only (today 0 %). FunDirector 0.15 ms per frame or less on average, no per-frame allocation.
- **files:** ["tools/fun-cadence.ts", "tests/unit/fun-cadence.test.ts", "tools/fun-tour.json", "src/debug/DebugApi.ts (__DD__.fun state/force/report/pockets)", "tests/unit/fun-save.test.ts"]
- **test:** The cadence test itself; the save sanitizer test (garbage in gives defaults out; round trip); capture images read; full suite green.

### [SHOULD] S1 Turn-back estimate (fuel vs distance home)

- **what:** A BFS distance field from camp over standable cells, rebuilt at load and on every camp entry (cells x 0.33 s). An amber tick on the lantern bar and a one-time hint when oil drops below 1.5 x the time home + 15 s ('Oil for the way home is running short. Turn back soon.'); red when it drops below the time home. It makes the GAME_DESIGN E1 #6 decision informed, and lean-run contracts build on it.
- **where:** Lantern bar while outside camp. In the first-timer model it fires on the balcony at 6.1 min (77 s of oil against 60 s home).
- **numbers:** 3.0 m/s home pace; 'soon' threshold 1.5 x home + 15 s; 'short' below home. One BFS over about 6,100 cells, under 5 ms. Lookup at 2 Hz. HudState.fuelHomeFraction feeds the tick.
- **files:** ["src/game/HomeDistance.ts", "src/game/FunDirector.ts", "src/ui/types.ts (fuelHomeFraction)", "src/ui/hud/FunHud.ts (fallback tick)"]
- **test:** Unit: the distance field matches BFS cell counts at landmarks (ledge 85, balcony 205, plus or minus 3); thresholds fire once per trip; off-field fallback works. Capture f09.

### [SHOULD] S2 Black-out cache (skip if progression owns E4)

- **what:** On death, the unbanked pack plus loose drops become one cache at the last safe grounded position (sampled every 0.5 s, so a chasm death leaves it on the edge). One cache per save: a newer death replaces it ('Your earlier pack is gone for good.'). It is a voxel duffel marker with a warm halo and a 'Pack 37 m' compass pip. Walking within 1.6 m recovers the items into the backpack; any overflow stays in the cache. Saved in the fun save data; emits cache:dropped and cache:recovered.
- **where:** Wherever the player dies; HUD compass.
- **numbers:** Safe-position sampling 0.5 s; recovery radius 1.6 m; one cache at a time.
- **files:** ["src/game/effects/CacheMarker.ts", "src/game/FunDirector.ts", "src/game/Game.ts (die hook)", "src/gameplay/FunState.ts"]
- **test:** Unit: die, then recover restores the exact counts; overflow stays; a second death replaces the cache; save round trip. Capture f11.

### [COULD] C1 Rune lock (handoff)

- **what:** A stone door in the shrine's first bay with three rune dials; each dial cycles the 8 builders' runes. The answer is the three runes in the balcony parapet at the far end of the route, so the player has to remember them and come back. Solving it opens a vault: 4 glimmer plus a relic for progression's attuned lens. I build the rules (RuneLock.ts, state saved, rune:solved event, debug hook); the world agent builds the niche and door, and the content agent builds the runeDial prop.
- **where:** Shrine first bay; clue at the balcony parapet runes (visible in artifacts/arch4-4/a12-balcony.png).
- **numbers:** 3 dials x 8 runes; door = 3 ancient-brick cells set to air on solve; reward 4 glimmer + relic.
- **files:** ["src/gameplay/RuneLock.ts"]
- **test:** Unit: cycling, check, save; e2e-style debug solve opens the door cells.

### [COULD] C2 Halden supply crates loot rule

- **what:** Crates outside camp become minable (wood sound). Loot: lantern oil, copper or glimmer. Placement belongs to the content agent; I build the loot rule and the crate:broken event.
- **where:** Wherever the content agent places crates (6-8 along side passages suggested).
- **numbers:** Hardness 1.5, tier 1. Loot 60 % oil +45 s, 40 % copper 2-3, 15 % glimmer 1 (hash-based).
- **files:** ["src/game/FunDirector.ts", "src/config/fun.ts"]
- **test:** Unit: the loot table is deterministic per crate id; oil refuel is capped at capacity.

## Ownership (as designed)
- New files I own: src/config/fun.ts, src/gameplay/Strikes.ts, src/gameplay/ExpeditionLog.ts, src/gameplay/Contracts.ts, src/gameplay/FunState.ts, src/gameplay/RuneLock.ts (C1)
- New files: src/world/gen/pockets.ts (pocket placement pass, own Rng seed ^ 0x9e0de, prop ids pocket_<n>)
- New files: src/game/FunDirector.ts (glue: bus listeners, rewards, sparks, callouts, hit-stop, FunSave), src/game/HomeDistance.ts (S1), src/game/effects/Spark.ts, src/game/effects/CacheMarker.ts (S2)
- New files: src/ui/hud/FunHud.ts (callouts, FIRST ribbons, streak badge, contract chip, Contracts pill), src/ui/screens/report.ts, src/ui/fun.css
- New tests: tests/unit/fun-strikes.test.ts, fun-log.test.ts, fun-contracts.test.ts, fun-pockets.test.ts, fun-save.test.ts, fun-cadence.test.ts
- New tools: tools/fun-cadence.ts, tools/fun-tour.json; captures in artifacts/fun-moment-after/
- Small hook edits in shared files: src/game/Game.ts (about 25 lines: construct/update FunDirector; hit-stop dt scale; save/restore/reset of fun state; contract rewards and report before bank() and the 'camp' save; objectiveText falls back to the contract once the chain is done; HudState extras; Iron Vein one-liner; die() calls the cache for S2)
- Small hook edits: src/game/MiningController.ts (about 35 lines, kept away from the lead's findTarget/aimAssist work: press-edge hook, swingStart clean flag, damage multiplier into rules.hit, clean/hollow flags on block:hit, breakBonus hook around drops.spawn, rush queue in update); src/gameplay/Mining.ts (hit gets an optional mult parameter, default 1)
- Append-only edits: src/core/events.ts (new events plus optional clean/hollow/lucky/rush fields on block events), src/audio/eventMap.ts (fallbacks onto existing sfx), src/i18n/en.ts (a '// Fun systems' block)
- Optional fields: src/save/types.ts (fun?: FunSave, no version bump), src/world/gen/types.ts (pockets?: PocketSpec[]), src/ui/types.ts (optional HudState fields: contract, streak, depthRecord, fuelHomeFraction, cache; optional UiActions.takeContract)
- One-line hooks: src/world/gen/generateWorld.ts (placePockets just before the bedrock re-assert), src/ui/UI.ts (mount FunHud and the report, import fun.css), src/debug/DebugApi.ts (__DD__.fun state/force/report/pockets)

## Needs from others
- Progression/economy: approve the contract reward table, with rewards going into camp storage at the next camp entry.
- Progression/economy: give iron a use (an iron-tier recipe); otherwise iron contracts and iron nests reward something with no purpose.
- Progression/economy: decide whether contract stars unlock anything (by default they only raise the board level); re-check recipe costs now that copper per ore block goes from 1.5 to about 2.1.
- Progression/economy: decide who builds the black-out cache (E4); I build it (S2) unless you do. Agree that the objective chip shows the active contract once the chain is done.
- Progression/economy: consider oil lantern 300 -> 240 s so the turn-back decision also reaches efficient players; if you build a physical Expedition Board station (E3), its Use should open my board view.
- UI: slots for the contract chip (under .dd-objective), the streak badge (beside the pickup feed), the center callout layer and the lantern-bar tick; I mount my own until you restyle them. Style the report card.
- UI: add showDeath(lost, { cached }) for the cache line (S2). Keep the e2e button-name rules: no visible button named Close, Continue, Craft*, Workbench, Resume, New Expedition, Ancient Tablet or Wake Up at Camp during play; no hyphen directly before digits and ' m' in my texts.
- Juice/audio: dedicated sfx for strike.clean, strike.fizzle, lucky, vein.rush (pitch), pocket.knock (panned), pocket.reveal, streak, first, record, contract, report.tick, nudge. My eventMap fallbacks use existing sounds until then, so nothing ships silent.
- Juice/audio: make sure the pitch parameter is honoured by pickup.* and break.metal; own the per-material feel table in the spec; one shared hit-stop API (I add Game.freeze otherwise).
- Lead (mobile controls/haptics): the Mine button must set input.mining on press and clear it on release, so each press is a fresh rising edge; an input.minePressed edge is welcome. Haptic patterns: clean 12, lucky [20,40,20,40,30], reveal [30,50,30], contract [15,40,15,40,15].
- Content agent (assets, events, ores): register special events through FunDirector.register({id, weight, cooldown, canFire, fire}) and call director.notable() when one plays.
- Content agent: new ore ids need no table entry; anything whose drop is not stone gets lucky, rush, streak and clean-break bonuses. Grow veins (copper 4-7 connected voxels in the Hollow, iron 3-5) so vein rushes also land outside nests.
- Content agent (optional): crate placements for C2 and a runeDial prop for C1.
- World/variety agent: keep my pocket pass as the last step of generateWorld (it adapts to whatever you build); do not renumber existing prop ids (saves remember removed props by id); reserve a shrine niche if the rune lock (C1) goes ahead.

## Acceptance
- Clean strikes land from a finger tap, the Mine button and the mouse inside the 0.14-0.34 s window after an impact. Holding never produces one (0 in 10,000 simulated holds), and the e2e slate hit counts are unchanged.
- The 5th eligible ore break of a new save is a lucky strike (x3), and over 10,000 eligible breaks no gap exceeds 16. The drop RNG sequence is identical with and without the fun systems.
- A vein rush breaks at most 4 connected same-id ore voxels, 0.11 s apart, each emitting block:broken, and never touches unbreakable or structure cells.
- 12-14 hollow pockets are generated deterministically: enclosed, reachable, 10 m or more apart, nothing built within 2 m, at least 4 on the first 100 m of the tunnel route. Each knocks hollow when hit and reveals a geode or an ore nest. The cyan emitter budget is unchanged, generation costs 30 ms or less extra, and worldgen tests pass.
- Ore streak (6 s window, bonus at x5), depth records (60/75/100/125 m) and 25 firsts each fire once and appear in the report; the Iron Vein discovery fires on the first iron hit with the copper pick.
- The Expedition Board offers 3 contracts from distinct families from the first camp visit after crafting the pickaxe. Contracts complete from real events, rewards land in storage before the 'camp' save, saves round-trip, and saves without the fun field load.
- A non-blocking Expedition Report appears on returns that pass the threshold, celebrates records, firsts and contracts, and hides itself. The notice budget never stacks more than one center callout at a time.
- Cadence tool, first-timer profile: longest quiet stretch outside camp 60 s or less (today 297 s); 60+ notable moments in the first 15 minutes (today 21); every minute has at least 1; at least 35 % of breaks carry an extra for the tapping profile and 12 % hold-only (today 0 %).
- FunDirector costs 0.15 ms per frame or less on average, allocates nothing per frame, and makes at most 2 raycasts per second.
- tsc --noEmit, the full vitest suite, npm run build and the 4 Playwright e2e specs pass. Capture tour f01-f08 (plus f09-f11 if the SHOULD items are done) is saved under artifacts/fun-moment-after/, and every image is read and described.