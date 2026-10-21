# DEEP DOWN, round 2: the lead's brief (overrides BRIEF.md where they differ; BRIEF §5 rules still apply)

## 0. The director's verdict on 1.0.0 (2026-10-21)

> "Lots of bugs and visual glitches. Instead of being able to mine everything, only what is interesting: interesting ores, not
> everything destructible, and highlighted, with a different highlight for each rarity. The pointer, the dot on the screen, is
> badly made; the selection is not pleasant: rework and improve all of that. The lantern: everything to redo. It's horribly
> empty, not vast enough, too linear, not enough events. I'd also like special mobs: beautiful, stylish, atypical. I want our
> game to have real charm."

This round answers each point. The gameplay stays the first version's (3D first-person exploration, the camp, trips with the
lantern, crafting, discoveries), with these changes. **The "no creatures" rule is lifted: the director now wants mobs.**

**The decisions:**

1. **Bugs and glitches first.** Each specialist hunts and fixes the bugs in their area before building anything new (method in
   §2). The bar: zero visible glitches in a 40-shot capture tour and a scripted play-through.
2. **Only interesting things are minable.** Ordinary rock, bedrock, dirt and masonry are indestructible. These can be broken:
   - ore veins and nuggets: copper, iron, crystal and echo shards, glimmer, lanternstone, gems;
   - crystal clusters;
   - rubble and loose-stone piles, the source of stone for recipes;
   - cracked walls hiding secrets;
   - Halden crates and caches;
   - the progression seals and plugs (hardened slate, ironbound and ember glass), by tier.

   The world must be fully traversable without free digging (§3).
3. **Rarity highlights.** Every minable or collectable shows a highlight in its rarity colour:

   | Rarity | What | Colour |
   |---|---|---|
   | common | stone rubble, copper | soft warm white `#f2e6cf` |
   | uncommon | iron | green `#6fe08a` |
   | rare | crystal, echo shards | blue `#5fb7ff` |
   | epic | glimmer, gems | violet `#b98cff` |
   | legendary | lanternstone, relics, rare chests | gold `#ffcf5a`, with a slow shimmer |

   - The highlight is a crisp thin outline or rim plus a faint inner glow. It is visible within about 14 m and brightens when
     the object is targeted.
   - It pulses at most once every 2.5 s: calm, never flashing.
   - The legend appears once, in the first-time card, and in the journal.
4. **Selection without the dot.**
   - The centre dot is gone. You tap the thing itself.
   - Hit-testing is generous: snap to the nearest minable or usable thing within 56 px of the finger, preferring higher
     rarity, then the nearest.
   - The selected target gets a clear selection outline (rarity colour, brighter) and a small progress ring anchored on the
     object in the world, not at the screen centre.
   - Hold to keep mining. A tap on something out of reach walks you there, then acts.
   - A tap on plain rock gives a soft "tunk" with a tiny chip and does nothing else; never a broken block.
   - Feedback: a pleasant strike sound, a light haptic, and the crack stages on the object.
5. **The lantern, redone.**
   - The model is a beautiful brass lantern: glass panes, a cage, a handle, a real flame that flickers softly.
   - It is held lower left with natural sway when walking, and still at rest.
   - The light is warm, with soft shadows, a gentle flicker, and clear reach.
   - The oil reads in the world (the flame shrinks as it drains) and in the HUD (one simple gauge).
   - A tap on darkness raises the lantern to look.
   - Lantern upgrades change the model and the light.
6. **Vast, open, non-linear.**
   - Grow the world, around 2× the floor area where performance allows.
   - Big caverns with verticality: balconies, chasms with bridges, shafts with ropes and ladders, an underground lake.
   - Branches, loops and side areas; hidden places; landmarks visible from afar.
   - Keep the first version's main route and progression, and make everything around it rich.
7. **Events.** Something happens every 2–4 minutes of exploration, calm but exciting:
   - a tremor that opens a hidden pocket;
   - a crystal bloom glowing for 60 s;
   - a glow-moth migration;
   - a fleeing treasure mob;
   - a Halden "echo light" leading to a secret;
   - a gust that dims the lantern until you light a brazier;
   - a spore geyser;
   - falling rocks to step away from (mild).
8. **Mobs (the director, clarified):**

   > "When I talk about charm, it is not warmth: it is visual quality. Take into account the tokens and credits we have left,
   > and improve the visuals as much as you can. Create unsettling monsters in the caves, and also small endearing beings; vary
   > the size. Offer weapons a bit later in the game. A real feeling a bit like Minecraft, between survival and wonder."

   Two families, sizes from tiny to huge. All are procedural, beautiful and atypical, of high visual quality (smooth sculpted or
   bevelled forms, emissive details, subsurface-like glow, good animation), never cheap boxes.

   **Unsettling monsters** (survival tension; they live where the light is not):

   | Monster | Size | Behaviour |
   |---|---|---|
   | Crawlers | small to medium | pale, eyeless, too many legs; they skitter on walls and ceilings at the edge of the lantern light, attack in the dark and recoil from bright light; packs of 2–4 deeper down |
   | Gnasher | medium | a boulder that is not a boulder: it opens a ring of crystal teeth when you come close; an ambush, telegraphed by a faint breathing |
   | Shade wisp | medium | a drifting smoke shape; it drains lantern oil and dims the light; dispersed by hits or by bright light |
   | Hollow Stalker | large, about 3 m | thin and tall; seen standing at the edge of the light; it approaches only when the lantern is dim, and flees a full flame; rare, dreadful |
   | Stone Sentinel | large mini-boss | a Halden automaton that wakes when you take its relic; strike its glowing core between its slow sweeps |
   | The Deep Worm | huge | a glimpse only: it passes through a far chasm or the lake; awe and dread; never fightable |

   **Small endearing beings** (wonder):

   | Being | Size | Behaviour |
   |---|---|---|
   | Lumen moths | tiny | they gather at your lantern |
   | Lamplings | tiny | lantern-bodied sprites that follow you for a while and light the way, then return to their nest |
   | Glimmerkin | small | crystal-backed scurriers; catch one for gems |
   | Shellback | big but gentle | a geode-shelled snail; harvest its crystals, which regrow |
   | Drift jelly | medium | a translucent glowing jelly that floats in the big caverns; tap it for light spores that boost the lantern |
   | Burrower | small | a cheeky ore thief |

9. **Survival and wonder, a bit like Minecraft.**
   - Danger is real but fair. Health is the hearts the first version already has. Monsters deal damage, darkness breeds
     monsters beyond the lantern's reach, and the lantern is your safety.
   - Death is the first version's black-out: your pack stays as a cache, you respawn at the camp, and you recover the pack
     later.
   - Telegraph every attack (a sound, a glint, a wind-up). Monsters never spawn in the lantern pool or at the camp.
   - Monsters appear from the Hollow down, and their density rises with depth.
   - Wonder comes from the endearing beings, the vistas, the events and the deep.

10. **Weapons, a bit later in the game.**
    - The pickaxe can always strike a monster, weakly.
    - After the first iron, the Forge offers weapons:
      - the **Iron Machete**: melee, fast;
      - the **Glimmer Spear**: melee, reach 3 m, strong;
      - the **Flare Sling**: ranged; it throws light shards that also scare crawlers;
      - **Flash Charges**: a consumable burst of light that clears a group.
    - Input: tapping a monster attacks it with the best equipped weapon. A tap on ore always uses the pick, so there is never a
      mode switch. Ranged fire aims at the tapped monster.
    - Each weapon has its own first-person viewmodel and a satisfying attack: a wind-up, a hit stop of 40 ms on a monster,
      a hit flash on the monster only, never the screen.

11. **Visual quality is the charm.**
    - Improve the visuals as much as the budget allows: materials, lighting, atmosphere, the mobs' look and animation, the
      viewmodels, and the details everywhere.
    - Every screen should look like a premium game.
    - The calm and readability rules still apply (BRIEF §2): quality, not clutter.

## 1. Ownership (disjoint; anyone may read anything)

| Specialist | Port | Owns |
|---|---|---|
| **FP** (feel, selection, lantern, weapons in hand) | 4174 | the weapon viewmodels and attack animations, the tap-a-monster attack input (it calls `MobSystem.hit` with the damage from `config/weapons.ts`); as BRIEF §4 FP: `src/game/{CameraRig,PlayerController,TapController,touchCamera,MenuCamera,MiningController,aimAssist,ropeRide,FrameGuard,GameUi}.ts`, `src/game/fp/**` (the lantern model is here), `src/input/**`, `src/ui/**` (except text tables), `src/entities/**`, `src/main.ts`, `index.html`, `tests/e2e/**` except `mobs.spec.ts`, `tools/{apk-sim,ui-check,play}.mjs`; the Game.ts hub |
| **VIS** (look, glitches, highlights) | 4175 | as BRIEF §4 VIS: `src/render/**` except `src/render/mobs/**`, `src/world/light.ts`, `src/game/effects/**`, `src/lab/**`, `tools/{capture,png,perf,fp-shots,vis-*}.mjs`. The **rarity highlight** rendering (outline and glow per rarity, and the selection outline API FP calls) and the lantern **light** |
| **WORLD** (vast world, minability, events) | 4176 | `src/world/**` except `light.ts`, `src/gameplay/**`, `src/config/**`, `src/save/**`, `src/i18n/**` (except `src/i18n/en/mobs.ts`), `src/game/{Progression,WorldFeatures,WorldSession,Guidance,Drops,Stations,Survey,Runes,runeDoor}.ts`, new `src/game/events/**` (the event director and the world events), world tools and their tests. **The minability rules** (which blocks break; rarity tiers as data, in `src/config/rarity.ts`), and the **weapons as items and recipes** (`src/config/weapons.ts`: damage, reach, rate, ranged; the Forge recipes after iron; Flash Charges) |
| **MOBS** (monsters, beings, combat) | 4177 | new `src/game/mobs/**` (the system, spawner, AI and behaviours, combat: mob hp and damage dealt to the player through `gameplay/Health`, drops), new `src/render/mobs/**` (models, animation, materials, high visual quality), `src/game/moths.ts`, `src/audio/**` (mob and weapon sounds; keep the existing audio working), new `src/i18n/en/mobs.ts`, new `tests/unit/mobs*.test.ts` and `tests/e2e/mobs.spec.ts` |

**Shared hub `src/game/Game.ts`:** FP owns it. Others make small, surgical hook edits only, each in a marked block (`// VIS:`,
`// WORLD:`, `// MOBS:`): re-read the file right before each edit, never rewrite it, and keep tsc green.

**The seams** (publish them in the first 45 minutes):
- `src/config/rarity.ts` (WORLD): `Rarity` = common | uncommon | rare | epic | legendary; `rarityOf(blockId | propKind)`;
  `RARITY_COLOR`; `isMinable(blockId, tier)`.
- `src/render/highlight.ts` (VIS): `HighlightSystem`, with `setTargets(list)` for the ambient highlights near the player,
  `select(target | null)` and `progress(target, 0..1)`, drawn in world space.
- `src/game/mobs/types.ts` (MOBS): `Mob` = {id, kind, position, bounds, hp?, state}; `MobSystem` = {update(dt, ctx),
  pick(ray) → Mob | null, hit(mob, dmg), list()}.
  - FP's tap resolution asks `MobSystem.pick` first.
  - `HighlightSystem` can highlight mobs too: a catchable mob gets its rarity colour.
- `src/config/weapons.ts` (WORLD): `Weapon` = {id, damage, reach, rate, ranged?, projectile?}; `bestWeapon(inventory)`.
- `src/game/events/types.ts` (WORLD): `GameEvent` = {id, kind, start, end, anchor}. The `EventDirector` emits on the bus;
  MOBS spawns event mobs (the migration, the treasure mob) when asked.

## 2. Bug and glitch hunt (each specialist, first 60–90 minutes, in their own area)

- **VIS:**
  - Run a 40-shot first-person tour at 390 × 844 @2 (every space, near walls, looking up and down, in tunnels, at props, at
    the viewmodel, mid-mining and mid-ride).
  - Crop at 100 % and list every glitch: z-fighting, cracks or holes in meshes, floating or intersecting props, light leaks,
    texture swimming or streaks, flicker, viewmodel clipping, blown or black areas, aliasing crawl, wrong sorting of
    transparents, halos through walls.
  - Fix them all.
- **FP:**
  - A scripted play-through with real touches (boot, tutorial, mine, walk, bag, camp, craft, rope, hoist, rune door, the deep)
    with a capture after each step.
  - List and fix every input, camera, HUD or state bug: stuck states, mis-taps, overlapping UI, wrong hints, the camera
    entering geometry, viewmodel pops.
- **WORLD:** after the minability change, prove every place is reachable without free digging (a walk-and-ride reachability
  test over the walkable field) and that no player gets trapped. Fix holes, unreachable finds and broken gen.
- **MOBS:** none at first. Your mobs must not create glitches: they never clip through rock, never float, and never block a
  path permanently.

Report the bug list with before and after evidence.

## 3. The minability change (WORLD with FP)

- WORLD:
  - `isMinable(block, tier)` returns false for ordinary rock.
  - Recipes that needed stone take it from rubble piles and loose stone (dense enough near the camp and along routes).
  - Every progression step that relied on digging (tunnels, the Hollow descent, plugs) becomes a path, a seal or a breakable
    plug.
  - Update the guidance and the tutorial ("Tap a glowing vein", not "Tap a rock wall").
  - Re-balance the material supply (`world/analysis/economy.ts`).
- FP: taps on non-minable rock "tunk" (no damage, no crack ring). `MiningController` uses `isMinable`. Update the e2e specs
  that dug through rock.

## 4. Proof and the gate

- Every specialist: tsc green, unit tests, the full vitest once, their e2e on their own port, and captures opened with Read.
- MOBS: unit tests for AI, combat and spawning rules: none in the lantern pool or at the camp, and density rising with depth.
  `tests/e2e/mobs.spec.ts` with real touches:
  - catch a Glimmerkin;
  - harvest a Shellback;
  - fight off crawlers with the machete;
  - shoot a wisp with the sling;
  - defeat the Sentinel;
  - survive a Stalker by raising the flame;
  - the black-out and recovery after dying to monsters.

  Captures of every mob, at three sizes in frame.
- WORLD: the reachability test, `poi-density`, and the events director tested (cadence, no overlap).
- VIS: the glitch list closed with before and after crops; the rarity highlights shown in captures for all 5 tiers; the
  rubric.
- FP: e2e green; ui-check; apk-sim.
- The lead runs the gate (the full suites on a quiet machine, the APK, apk-sim, a capture review) and delivers.

**Budget:** about 4–5 hours each. Be efficient: MUST items first, no busywork, concise reports.
