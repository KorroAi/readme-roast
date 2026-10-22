# Round 3: "Le Grand Gouffre": the open, random, dense deep (the lead's brief)

## 0. The director's verdict on 1.1.0 (2026-10-21)

> "I'm not really satisfied with the game or the gameplay."
>
> - Add at least 10 biomes.
> - Add lots of different mobs per biome.
> - Make it much better explained and guided, with a real goal.
> - A big improvement of the controls, the buttons and the gameplay.
> - An immense, vast open-world cave, randomly generated.
> - Add buttons and menus, and craft everything.
> - Make the game denser, much more nervous (fast-paced), and less empty and boring.

**What this means.** It is a rebuild of the game on the same engine and look: Three.js voxels, the Lantern Voxel style, first person, the
Android shell. The hand-made 160 × 128 × 160 world and its fixed story are replaced by a seeded, random, layered open world.
- The hand-made story has these parts: the Halden logs at fixed places, the hoist, the rune door, the rift rope and the black-stone finale.
- They stay in git history (`c692bd0`). Their good rooms may come back as procedural set pieces.

Keep what works:
- the renderer and lighting stack;
- the mesher and chunk renderer;
- the viewmodel;
- the rarity highlights;
- mobs, combat and events (generalised);
- the save system;
- the crash and quality machinery;
- the APK pipeline.

**Every claim needs evidence** (a test pass line, a command result, or a capture opened with Read). Phone feel and audio stay
labelled unverified.

### 0.1 The world: strata of random open caves

- A new game rolls a **seed**, shown in Settings, and an optional "seed" field on New Game.
- The world is **6 strata** stacked downward. Each stratum is one generated zone of about **256 × 96 × 256** blocks (WORLD may tune
  within the budgets of §4). It is about 2.5× the floor area of the old world and holds **2 biomes**, laid out as large
  noise/Voronoi regions with transitions.
- One stratum is loaded at a time, through `loadZone`, the worker and the loading screen. Stratum I holds the camp.
- **Descents** connect a stratum to the next: a great sealed shaft, the **Gate of the stratum**. It opens with the 2 Heart Shards of
  that stratum's guardians (§0.3). Natural ravines lead down into dead-end pockets only. Going back up uses the gate's lift.
  Built **outposts** give fast travel (§0.4).
- **Caves.** The caves are 3D noise "spaghetti" tunnels, a few huge caverns (≥ 40 m across) per biome, ravines, underground lakes,
  pillars, bridges of rock, and vertical shafts with ledges.
  - Never a dead, empty corridor: every 10–15 m there is a find, a prop, a light, a creature or a fork.
  - Everything reachable must be walkable or climbable (auto-step, ladders and ropes the player can craft, and generated ropes).
  - The pit rescue stays as a safety net.
- **Structures, placed procedurally per biome:**
  - abandoned mine camps (rails, timber, lamps, chests);
  - Halden's journal pages (lore, numbered);
  - ruined shrines;
  - ore-rich side rooms;
  - treasure vaults behind cracked walls;
  - a **guardian lair** (an arena) per biome;
  - spawner nests;
  - the stratum gate.

  The best rooms of the old world (the Geode, the Still Lake, the Lantern Vault, the Crystal Choir, the Ember Deep) may return
  as set pieces stamped into fitting biomes.
- **Density.**
  - At least 3× the old density of ore veins, with rarity rising with depth.
  - About 1 chest per 25 m of walked tunnel.
  - Ambient props everywhere: fungi, crystals, roots, bones, carts.
  - Light pockets so that darkness is a choice, not a void.

### 0.2 Twelve biomes (two per stratum, in this order; the names are the English text keys' values)

| Stratum | Depth | Biome A | Biome B |
|---|---|---|---|
| I | 0–90 m | **Amber Hollows** (warm limestone, the starter) | **Mushroom Forest** (giant glowing fungi, teal and magenta) |
| II | 90–180 m | **Root Galleries** (roots, earth, green-gold) | **Flooded Grottoes** (lakes, waterfalls, cold blue) |
| III | 180–270 m | **Crystal Geode** (cyan and violet crystal forests) | **Old Halden Mines** (timber, rails, lamps, rust orange) |
| IV | 270–360 m | **Frost Caverns** (blue ice, icicles, cold that drains warmth) | **Glowroot Jungle** (bioluminescent vines, green) |
| V | 360–450 m | **Sulphur Bog** (yellow-green pools, toxic gas) | **Sunken City** (ancient carved halls, gold runes) |
| VI | 450–540 m | **Magma Veins** (lava rivers, red-orange) | **Obsidian Abyss** (black glass, violet void), with **the Heart** at the very bottom |

Each biome has its own:
- **materials:** 2 host rocks, a floor variant, and 2–3 ores or gems of rising rarity;
- **palette, light colour, fog hue and grade;**
- **ambient props and FX;**
- **hazard** (none in I; a gentle one in II and III; real ones from IV: cold, gas, lava, darkness);
- **creature roster** (§0.5);
- **guardian**;
- **music or ambience bed.**

### 0.3 A real goal

**The main quest: "Relight the Heart".** The deep's Heart has gone dark, and every lantern dies with it.
- Each biome guardian holds a **Heart Shard**. There are 12 shards.
- The 2 shards of a stratum open its gate to the next stratum.
- At the bottom, the 12 shards relight the Heart: the final boss, then the ending and free play.

**Always shown:**
- a quest tracker (the main step, plus one optional side task);
- a **compass arrow** to the current objective once it is known;
- a **Quests screen**: the main chain, biome tasks, the camp's orders and the feats.

**Discovery.** A guardian lair is revealed by sonar, by Halden's pages or by entering the biome deeply enough. It is then marked
on the map.

**Side goals (the addictive loop):**
- **camp orders:** 3 at a time, renewed on each return, plus a daily order;
- the **Bestiary**: every creature scanned or defeated gives a page and a bonus;
- journal pages;
- feats;
- depth records.

### 0.4 Crafting everything, and building

- **Stations:**
  - the Workbench (camp);
  - the **Furnace** (ore → ingots, fuel needed);
  - the Forge (weapons and armour);
  - the **Alchemy Table** (potions, bombs);
  - the **Outpost Kit**, craftable and placeable in any stratum. It holds a small bank, a fast-travel node, a bedroll that sets the
    respawn point, and a light.
- **Recipes in categories**, each tier needing the materials of its biome so that progression follows the descent:
  - **Tools:** pick tiers I–VI; each biome's host rock and ores need the matching tier.
  - **Weapons:** 3 kinds per tier band: melee (machete → sword → great axe), reach (spear), ranged (sling → crossbow), plus bombs.
  - **Armour:** helmet, chest and boots per tier band, with set bonuses (warmth vs cold, filter vs gas, heat vs lava).
  - **Lanterns:** brighter, longer and sonar range.
  - **Consumables:** food and healing, oil flasks, antidote, warming tonic, flare, bomb.
  - **Building:** planks, bricks, **torches** (placeable lights), **ladders and ropes** (placeable), doors.
  - **Outposts.**
- **Placing:**
  - the hotbar's block, torch, ladder or rope is placed with the Place action on a face;
  - mined plain rock still does not break, except with tier-gated "soft" host rock where the brief allows;
  - placed blocks save per stratum.

### 0.5 Creatures: lots, per biome

- **Each biome:** at least **3 distinct monsters**, at least **1 endearing being**, and **1 guardian boss**. That makes at least 36
  monsters, 12 beings and 12 guardians.
- Sizes vary from tiny swarmers to huge brutes.
- **The method that makes this feasible:**
  - about 8 behaviour **archetypes**: swarmer, charger, ranged spitter, ceiling ambusher, flyer, burrower, brute/tank, exploder;
  - a **modular procedural body builder**: segments, legs, shells, crystals, eyes and glow;
  - skinned per biome, with names, stats, abilities and sounds.
- **The existing 12 kinds join the rosters:** Crawler, Gnasher, Shade Wisp, Hollow Stalker, Stone Sentinel, Deep Worm, Lumen
  Moths, Lampling, Glimmerkin, Shellback, Drift Jelly, Burrower.
- **Guardians:**
  - big, 2–3 attack patterns with clear telegraphs, a health bar on the HUD, and an arena;
  - their defeat drops the Heart Shard plus loot;
  - **the Heart's final boss** has 3 phases.
- **Spawning:** biome-weighted, density rising with depth, packs and nests, more at night (the existing day cycle) and in the dark.
  Monsters never spawn in the camp, at outposts or in torch light.

### 0.6 Controls, buttons and menus: a real mobile action layout

**Screen layout (portrait, 390 × 844):**
- **Left lower third:** a **movement joystick**, floating and always available. Pushing it to the edge sprints.
- **The rest of the screen:** **drag to look**.
- **Right-thumb buttons:**
  - a big **Action** button: mine or attack the target under the reticle, hold to continue;
  - **Jump**;
  - **Dash** (a short dodge with brief invulnerability and a cooldown);
  - **Interact** (contextual: it appears with the target's icon and verb near chests, stations and beings);
  - **Sonar** (a lantern pulse that reveals ores, chests and lairs through rock for 2 s, with a cooldown);
  - **Place** (when a placeable item is in the hand).
- **A reticle at the centre:**
  - small and stylish;
  - it changes with the target's kind (mine, attack, use);
  - progress on the ring.
- **The tap-to-act accelerator stays:** a tap on a target within reach mines, attacks or uses it.
- **A bottom hotbar** of 6 slots: pick, weapon, bombs, torches, food, and one free slot. Tap to select, long-press to assign.
- **Top HUD:**
  - health and the flame (oil);
  - depth, the biome name and the stratum;
  - a **minimap** (explored caves around you, with markers);
  - the quest tracker;
  - buttons: **Bag, Craft, Map, Quests, ≡**.
- **Menus:**
  - Inventory: a grid with categories, details, and use or equip;
  - **Crafting:** categories, recipe cards with have-and-need counts, craft ×1 or ×5, and a station requirement;
  - **Map:** the explored stratum, with fog of war, markers (camp, outposts, lairs, the gate, journal pages, chests seen) and fast
    travel between outposts;
  - **Quests;**
  - **Bestiary;**
  - **Settings:** look sensitivity, invert Y, button size and opacity, left-handed mirror, the seed, and the old ones.
- **Desktop:** WASD plus Shift (sprint), Ctrl (dash), Space (jump), Q (sonar), E (interact), mouse buttons (action and place),
  1–6 (hotbar), I/C/M/J (menus).
- **Nervous feel:**
  - walking at about 4.2 m/s and sprinting at about 6.5 m/s;
  - faster base mining with a combo: chaining blocks of the same vein speeds it up;
  - snappy hit feedback (hit stop, knockback, damage numbers kept small);
  - loot bursts on breaking ores;
  - creature encounters every 20–40 s in the deep;
  - events every 60–120 s;
  - shorter dead time: auto-pickup and instant banking at outposts.

### 0.7 Guidance

- A **taught-by-doing tutorial** in the first 5 minutes, one step at a time with a highlighted button and a short line:
  look, move, mine, pick up, craft at the Workbench, place a torch, fight, sonar, the bag, the map, the quest. Skippable.
- A **"?" help** on every menu, and a **first-time tooltip** for each new button, item and biome.
- **Hints:**
  - when stuck: no progress for 90 s;
  - when the flame is low, the health is low or the bag is full.
- **Biome arrival cards:**
  - the name and a one-line description;
  - its hazard and the gear that answers it;
  - the guardian's rumour.

### 0.8 Saves

- The save goes to **version 4**. It holds:
  - the seed;
  - the current stratum;
  - per-stratum world edits and removed props;
  - the explored map per stratum;
  - outposts;
  - quests, the bestiary, the inventory, equipment and the hotbar.
- A **1.x save** (v3) cannot map onto the new world. On load it shows one calm card: "The deep has changed. A new expedition
  begins." Its **feats and lifetime stats are kept**, and the explorer gets a starter gift. No crash, no data dump.

## 1. Ownership (disjoint; anyone may read anything)

| Specialist | Port | Owns |
|---|---|---|
| **WORLD** | 4176 | `src/world/**` (the new generator: strata, biome regions, caves, structures, set pieces, ores, chests, lairs, gates, outpost sites, explored map data); `src/config/{blocks,biomes}.ts` (new `biomes.ts`) and the `WORLD`/`LIGHT` parts of `balance.ts`; `src/save/**` (v4 and the v3 card); `src/game/{WorldSession,WorldFeatures,Stratum*}.ts` (new `Stratum*` for loading and switching strata), `src/game/events/**` (events per biome); the world analysis tools; their unit tests |
| **VIS** | 4175 | `src/render/**` except `src/render/mobs/**` (biome materials and painters for every new block, biome light, fog and grade, biome ambient FX and props models, the torch light, the sonar pulse visual, guardian arena dressing, performance for the bigger strata); `src/world/light.ts`; `src/game/effects/**`; `src/lab/**`; the capture and perf tools; their unit tests |
| **MOBS** | 4177 | `src/game/mobs/**`, `src/render/mobs/**`, `src/audio/mobSfx.ts`, `src/i18n/en/mobs.ts`, `tests/e2e/mobs.spec.ts`: the archetype system, 12 biome rosters, 12 guardians plus the Heart's boss, spawning, combat feel on the mob side, bestiary data; their unit tests |
| **UI** | 4174 | `src/game/Game.ts` (the hub), `src/game/{CameraRig,PlayerController,TapController,touchCamera,MenuCamera,MiningController,aimAssist,ropeRide,FrameGuard,GameUi}.ts`, `src/game/fp/**` (incl. new combat input, dash, sonar trigger, place action); `src/input/**`; `src/ui/**` (HUD, buttons, hotbar, minimap, every menu and screen, the tutorial overlay's presentation); `src/entities/**`; `src/main.ts`, `index.html`; `tests/e2e/**` except `mobs.spec.ts`; `tools/{apk-sim,ui-check,play,fp-shots}.mjs`; their unit tests |
| **LOOP** | 4178 | `src/config/{items,recipes,weapons,rarity}.ts` and new `src/config/{armour,stations,quests}.ts`, the `PLAYER`/economy parts of `balance.ts`; `src/gameplay/**`; `src/game/{Progression,Guidance,NextStep,Drops,Stations,Survey,Objectives}.ts` and new `src/game/quests/**`, `src/game/craft/**`; `src/audio/**` except `mobSfx.ts`; `src/i18n/**` except `en/mobs.ts`; the economy and quest tools; their unit tests |

**The retired hand-made systems:** Runes, the rune door, the hoist, the black-stone finale, the fixed Halden logs, the fixed
caches, and the 'living rock' bloom tied to fixed places.
- **WORLD and LOOP** retire or generalise them in their own files, and delete their tests (or rewrite them for the new world)
  instead of leaving them failing.
- **UI** rewrites the e2e specs that walked the old landmarks.

**The shared hub `src/game/Game.ts`:**
- UI owns it.
- The others make small, surgical edits there only, each inside a marked block (`// WORLD:`, `// VIS:`, `// MOBS:`, `// LOOP:`):
  re-read the file right before each edit, never rewrite it wholesale, and keep tsc green.
- **A big integration need** (stratum switching, the quest hooks) goes into the owner's own module, with a one-line call from a
  marked block.

## 2. Seams: publish them first (each owner, within the first 30–40 minutes, types plus working stubs, tsc green)

| Seam file | Owner | What it exposes |
|---|---|---|
| `src/config/biomes.ts` | WORLD | `BiomeId` (12 ids plus `'heart'`), `BIOMES: Record<BiomeId, BiomeDef>`: name and desc text keys, stratum, depth band, host and floor blocks, ores with rarity, `light`, `fog`, `grade` hints, hazard, `mobs: { monsters: MobKind[], beings: MobKind[], guardian: MobKind }` (MobKind strings agreed with MOBS), ambience key. `STRATA` (6) with sizes and their 2 biomes. |
| `src/world/gen/strata/types.ts` | WORLD | `StratumLayout` (extends `WorldLayout`): `biomeAt(x,y,z)`, the region map, `lairs[]` (biome, centre, radius, the guardian spawn), `gate` (position, shards needed), `outpostSites[]`, `pages[]` (journal page spots), `chests[]`, `nests[]`, `spawnPoints`, the camp (stratum I only). `ExploredMap` (a column bitmap and heights per stratum, `markExplored(x,z)`, `serialise`). |
| `src/game/Stratum.ts` | WORLD | `StratumManager`: `current`, `enter(stratum, at?)` (unload, load and attach through the loading screen), `onEnter` hook, the per-stratum save slice. |
| `src/render/highlight.ts` (extended) and `src/render/sonar.ts` | VIS | `HighlightSystem.reveal(cells, seconds)`, `SonarPulse.ping(origin, radius)`, `TorchLights`, biome look API `applyBiomeLook(biomeId, blend)`. |
| `src/game/mobs/types.ts` (extended) | MOBS | `MobKind` (all of them), `MobArchetype`, `RosterEntry`, `GuardianState` (hp, phase, name for the HUD bar), events `mob:guardianDefeated {biome, shard}`, `mob:scanned`, `bestiary(kind)` data. |
| `src/game/craft/types.ts`, `src/config/items.ts`, `src/config/recipes.ts`, `src/config/stations.ts` | LOOP | `ItemId` (all), `ItemDef` with category, stack, use, place (block id) and equip slot; `Recipe` with category, station, inputs, output and unlock; `CraftSystem.can/craft`; `Hotbar` model (6 slots); `Inventory` categories. |
| `src/game/quests/types.ts` | LOOP | `QuestSystem`: `main()` (current step, target position or null, text), `side()`, `orders()`, `track(id)`, events `quest:step`, `quest:done`; tutorial steps with a `highlight` UI target id that UI renders. |
| `src/ui/hud/actions.ts` | UI | the action API the buttons and keys drive: `move`, `look`, `action` (hold), `jump`, `dash`, `interact`, `sonar`, `place`, `hotbar(i)`, `open(screen)`; and `ui.highlight(targetId)` for the tutorial. |

Read the other owners' seams before you build on them, and put what you need in `requests` rather than editing their files.

**The switch-over.**
- **The old world stays bootable** until WORLD switches `loadZone` to the strata generator. WORLD builds the new generator beside
  it, behind `WORLD_GEN = 'strata'`.
- **Switch early**, as soon as stratum I generates, has the camp and is walkable, ideally within the first 1.5–2 hours. Log it in
  `docs/round3/STATUS.md` (one line per milestone, for the whole team; any specialist may append its own milestone lines there).
- **Until then**, the others build against the seams and the debug hooks (`window.__DD__`). They do not walk old landmarks in
  new tests.
- **WORLD exposes debug hooks:** `__DD__.stratum(n)`, `__DD__.biomeHere()`, `__DD__.goto(biomeId | 'lair' | 'gate')`,
  `__DD__.seed(n)`. The others use them in e2e and captures.

## 3. What each specialist delivers (MUST)

- **WORLD:**
  - The strata generator per §0.1 and §0.2, seeded and deterministic per (seed, stratum), generated in the worker.
  - The 12 biomes' blocks and regions.
  - Structures, set pieces, lairs, gates and outpost sites.
  - Density per §0.1.
  - Stratum switching through the loading screen, the explored-map data, and save v4 with the v3 card.
  - Retire the hand-made systems cleanly.
  - **Proof:**
    - reachability per stratum (camp → every lair → the gate, with tier-appropriate gear);
    - density stats per biome;
    - generation time and memory per stratum (budgets in §4);
    - a top-down map image per stratum, opened with Read.
- **VIS:**
  - Every new block painted in the Lantern Voxel quality.
  - Each biome's distinct look: light colour, fog, grade, ambient FX and props models (mushrooms, roots, ice, crystals, ruins,
    lava, obsidian), with smooth biome transitions.
  - Torch lights.
  - The sonar pulse and reveal.
  - Guardian arena dressing.
  - Hazard visuals: frost breath and rim, gas haze in real pockets only, lava glow.
  - Performance on the bigger strata within budget.
  - **Proof:** real-camera captures of each of the 12 biomes plus the Heart, at least 2 each, opened, with a per-biome rubric.
- **MOBS:**
  - The archetype system and the modular body builder.
  - 12 rosters per §0.5 (≥ 3 monsters, ≥ 1 being, 1 guardian each) plus the Heart's boss.
  - Spawning per biome.
  - Guardian fights with telegraphs and the shard drop event.
  - Bestiary data and text.
  - Sounds.
  - Instancing so that 30+ mobs fit the draw-call budget.
  - **Proof:**
    - unit tests;
    - `mobs.spec.ts` updated: a fight in 3 biomes and one guardian beaten end to end;
    - capture sheets of every roster and every guardian, opened.
- **UI:**
  - The control layout of §0.6: joystick, look, the buttons, the reticle, hotbar, the HUD with minimap and tracker.
  - Every menu: Inventory, Crafting, Map with fast travel, Quests, Bestiary, Settings.
  - The tutorial overlay presentation (LOOP owns the steps), the arrival cards, and the guardian health bar.
  - Dash, sprint, sonar trigger and place.
  - The nervous feel numbers in the player and camera.
  - Desktop keys.
  - **Rewrite the e2e** for the new game:
    - the first 5 minutes (tutorial to the first craft);
    - a descent through the first gate;
    - craft, place a torch, place a ladder;
    - fast travel;
    - the menus;
    - the release spec kept green.
  - `apk-sim` and `ui-check` pass.
  - **Proof:** real-touch e2e at 390 × 844, and HUD and menu captures, opened.
- **LOOP:**
  - Items, recipes, stations (including the Furnace with smelting and the Alchemy Table), armour with set bonuses, consumables,
    building items, outposts.
  - The craft system and inventory model, and the hotbar model.
  - The main quest of §0.3, side quests and camp orders, feats updated, and the bestiary rewards.
  - The guidance and tutorial steps of §0.7, and the hints.
  - Hazards' gameplay effects (cold, gas, lava, darkness) with their counters.
  - Economy and balance so that the descent paces at about 15–25 minutes per stratum for a new player.
  - Text for everything, through `t()`.
  - Audio: event, UI and biome ambience beds.
  - **Proof:** unit tests, an economy and quest simulation reaching the Heart with the recipes as written, and the text checks.

## 4. Budgets and rules

- **Performance:**
  - Balanced holds ≥ 45 fps on a 2022 mid-range phone (modelled with `tools/perf.mjs`): ≤ 150 draw calls and ≤ 250k triangles
    visible.
  - Stratum generation plus light ≤ 7 s in the worker on this container.
  - Total heap for a loaded stratum ≤ 2.5× today's.
  - Save size ≤ 1.5 MB.
- **The calm-but-nervous rule.** It is fast and dense, but legible:
  - no screen shake on mining;
  - at most 3 moving foreground effects at once;
  - a telegraph for every attack;
  - the HUD never covers the centre.
- **Process:**
  - no git (the lead commits);
  - `npx tsc --noEmit` green at every save;
  - one heavy browser job at a time on the machine (4 CPUs, SwiftShader), and re-run when quiet before calling a failure real;
  - text through `t()`;
  - no placeholder visible to players.
- **Before the report:**
  - `npx tsc --noEmit`;
  - your unit tests;
  - the full `npx vitest run` once;
  - the e2e you own;
  - exact counts.

  Requests to other owners go in `requests`.

## 5. The gate (the lead, after this round)

- tsc, the full vitest, and every e2e spec on a quiet machine;
- apk-sim and ui-check;
- the lead's own play-through captures: a biome per stratum, a guardian fight, the menus;
- an adversarial release-risk review;
- the APK, the docs, and the delivery to the director in French, with an honest list of what was and was not verified.

## 6. Beyond: the director, 2026-10-22: "go all out, the credits are reset, exceed my expectations"

- **Tokens are no longer a constraint. Quality, completeness and wow are.** These rules stay:
  - one heavy browser job at a time (the machine has 4 CPUs);
  - a bootable game and a green tsc at every save;
  - evidence for every claim;
  - the calm-but-nervous rule.
- **Full scope.** Every role delivers all of its P1 and P2, at a high bar, then as much of its stretch list as it can, in this
  order:
  1. Polish what exists until it is excellent.
  2. Then add the new things.
- **Stretch, per owner** (each still proven: reachable, tested, captured):
  - **WORLD:**
    - one landmark vista per stratum: a huge cavern with a view, a waterfall or a lava fall;
    - secret areas behind cracked walls with rare loot;
    - an underground river to follow;
    - a mini-dungeon per stratum: a Halden mine complex with a lever-and-door or pressure-plate puzzle and a reward vault;
    - the old world's best rooms as set pieces.
  - **MOBS:**
    - **a companion:** a Lampling tamed with glowcaps follows you, lights the way, chirps near rare ores, fights small foes, and
      levels up. LOOP adds the taming item and the feeding; UI adds its HUD chip.
    - smarter packs: they flank, ambush from ceilings, and the beings flee and can be chased;
    - **elite variants** with affixes (glowing, armoured, swift, splitting) and better loot.
  - **LOOP:**
    - camp upgrades that visibly grow the camp: tents, lamps, a forge chimney, a trophy wall of guardian heads (with WORLD and VIS
      for the models and placement);
    - a **trader** at camp (rare recipes, orders);
    - gem sockets on weapons and armour;
    - a daily-challenge seed;
    - a trip summary after each return, with records.
  - **UI:**
    - menu transitions and haptics per action;
    - a beautiful map;
    - a black-out screen;
    - toasts for feats;
    - an animated main menu over a live stratum;
    - accessibility options: text size, colour-blind rarity patterns, reduced motion.
  - **VIS:**
    - one "wow" moment per biome: a vista, a light show, bioluminescent waves on sonar;
    - calm "weather" events: spore drift, ice fog, ember rain, all in real places only;
    - the Heart's relighting finale spectacle.
  - **AUDIO** (a new sixth specialist; port 4179):
    - procedural, layered music per biome whose intensity follows danger and combat;
    - guardian themes and the finale;
    - ambience beds;
    - a sound for every new action, item, creature and event;
    - mixing and ducking.
- **Ownership change, effective now:** `src/audio/**` (except `mobSfx.ts`, which stays with MOBS) and `tests/unit/audio*.test.ts`
  move from LOOP to **AUDIO**. LOOP sends its sound needs (event → sound) to AUDIO as STATUS lines.
- **Coming later in the round, from the lead:**
  - a **QA playtester** after WORLD's switch-over: it plays the real game, and files bugs with captures in STATUS.md, addressed to
    owners;
  - a **French localisation** pass at the end (the director is French): every text in `fr`, with the language following the
    device and a setting to change it.
