# DEEP DOWN — Game Design

The design for the full game. It is a plan, not a claim: what exists today is listed in
PROJECT_STATUS.md, and each stage below lists the acceptance criteria that must be met (and
tested) before it is called done.

## The feeling we are building

"Just one more expedition." The player discovers something incredible, realises how much they are
carrying and how far camp is, decides whether to push on, comes home to a camp that has visibly
grown, and suspects the next depth holds something even stranger.

Core loop: **explore → discover → mine → collect → decide → return or descend → craft → upgrade →
unlock new depths.** Every system must feed this loop; a system that does not is cut.

## The mystery

### Premise
Long before any miner, a people we call the **Lantern-bearers** carried light down into the earth.
Their stonework and their script (eight recurring runes: descent, eye, lantern, chasm, spire,
waves, gate, star) are everywhere below the camp. The player's own expedition company is the
second to come here: the camp sits on the bones of an earlier human venture, the **Halden
Concern**, whose crews vanished a generation ago.

### What the player gradually learns (discovery progression)

| Depth | What the player finds | What they now believe | The new question |
|---|---|---|---|
| Roots (camp, Lantern Hollow) | the Halden crews' abandoned camp; carved runes that answer lantern light; crystals that hum near the explorer | someone built down here, long ago, and the crystals react to light | who were they, and why build *down*? |
| Crystal Veins | crystal formations grown around carved walkways; a crystal with the outline of a hand inside; the "eye" rune repeated at every vein | the crystals grew *after* the builders, along their paths | are the crystals something the builders left behind? |
| Forgotten Works | Halden rails, pumps and crystal crushers; foreman's logs: harvest quotas, then "the singing", then silence | the Halden Concern mined glimmer for profit and stopped abruptly | what made them stop, and where did they go? |
| Buried Sea | a drowned Lantern-bearer city; murals of a procession carrying lanterns into the water, figures turning into light | the builders went somewhere deliberately, not in flight | where were they going, and are they gone? |
| Hollow Core | the **Loom**: an enormous mechanism that draws light into crystal; archive halls of identical crystals | the crystals *are* the Lantern-bearers — kept as light. Every glimmer shard the player has used was one of them | what did they need to become, to go deeper still? |
| Abyss | violet light that is not mineral; the builders' last gate, open from the other side | they were answering a call from below, and something is answering the player now | (the ending, and the reason to come back) |

Rules: plant clues early (the hand in the crystal is visible long before the Loom explains it);
never explain in text what the world can show; every major discovery changes how earlier ones read.
The moral weight of glimmer is never lectured: the player simply learns what it is and keeps
choosing how to use it (a late recipe lets them *return* shards to the Loom for a different reward).

### Narrative delivery
Environment first (murals, ruins, machinery, arrangement of bodies-less camps), then short found
texts (Halden logs: 2–4 lines each), then rune panels the player learns to read at the research
desk (each decoded rune makes the rune's meaning appear when its carvings wake). No cutscenes
that take control away for more than a few seconds.

## Progression

Upgrades must change *how* the player explores, not only numbers.

| Line | Tiers | What changes |
|---|---|---|
| Pickaxe | rusty → copper → iron → glimmer-edged | new materials (hardened slate, iron, crystal walls), speed |
| Specialization (choose at the iron tier, switchable at camp for a cost) | **Prospector** (lantern pulse reveals veins through rock), **Delver** (breaks reinforced rock, faster on stone), **Surveyor** (map fills further, compass shows discoveries) | play style |
| Lantern | oil → copper → attuned lens → beacon kit | radius and burn time; the lens wakes runes from far away and reveals rune doors; the beacon kit places permanent light posts (shortcuts you build yourself) |
| Pack | 6 → 10 → 16 slots, + a sealed pouch that survives a black-out | how long an expedition lasts |
| Traversal | rope (safe descent of one ledge), climbing picks (scale marked rock), grapnel (cross chasms) | new routes, shortcuts back up |
| Survival | rebreather (gas pockets, the Buried Sea), insulated boots (electrical anomalies in the Works) | new regions |
| Camp | workbench → forge → research desk → expedition board → lift | crafting tiers, lore, planning, fast travel down |

Balance target: a new tier every 1–3 expeditions in the first hour; no recipe needs more than two
trips' worth of one resource; nothing exists only to lengthen play.

## The camp

The emotional anchor: safe, warm, personal, visibly growing. Every station is a real object in
the world, built in place when crafted (with a short build animation and sound), and each adds
light and life: strung lanterns along the deck, a forge glow, a desk with spread journals, an
expedition board that shows the explored map and the player's best depth, a shelf where relics
are displayed. Returning home banks the backpack, refuels, heals and plays a warm music cue.

## Risk and extraction

- Inventory is small; the compass always shows the distance home; the lantern burns.
- Danger rises with depth; so does value. The HUD warns before major risks (low fuel, a
  creaking ceiling, gas haze).
- A black-out drops the unbanked backpack *where it happened* as a recoverable cache (marked on the
  compass) instead of deleting it: losses are understandable and recoverable, but the trip back
  is itself a choice.
- Shortcuts (ropes, beacons, the lift) make deeper starts possible without grinding the same path.

## The place itself (final pass W2)
- **The route now has a beat at most every 22 m.** Max sight gaps:
  - camp→ledge 18 m
  - ledge→stairs foot 18 m
  - seal→balcony 18 m
  - balcony→stone 10 m
  - stairs foot→reliquary 12 m
  - ledge→yard 15 m
  - yard→adit 16 m
- **Survey Office**, 22 m from camp: the first Halden log. The Halden were the survey crew who came before; four logs (office, landing post, Face 3 in the yard, the last page at the rift camp) tell how they dug down to the black stone and stopped.
- **Secrets behind barriers**:
  - Shrine (already in the game).
  - Moth Grotto: moths tap at a cold slit; mine the gravel plug, crawl the squeeze, and find a geode.
  - Reliquary: Rune Door 1 wakes to any lit lantern held near it for 1.2 s.
  - Lamp Gallery: Rune Door 2 wakes only to the copper lantern and gives the copper lantern a purpose in the world.
- **Shortcut**: the Halden Hoist from the yard floor up to the ledge. It is chained from below, so the player first walks down, releases it, then rides it home; from then on it runs both ways.
- **Climax**: the rope from the balcony to the rift floor, the Halden's last camp, and the black stone. The stone is cold and silent below 8 runes; W3's finale wakes it.
- **Replay, 'the deep breathes'**: every expedition into the Hollow (a trip below 70 m) re-rolls the Halden face and the rift walls, regrows what was mined and grows one glimmer bloom somewhere new. Coming back is worth it, and W3's rumours point at these sites.
- **Ambient life**: lumen moths. They gather at secrets (a hint without text), come to a well-fuelled lantern and scatter at the pick.

## The trip loop as built (final pass W1)

- The lantern is the clock: Oil 300 s, Copper 600 s, Attuned 900 s. Empty, the light shrinks to an ember (0.38; Attuned 0.7).
- Cold: 8 s of grace after the flame dies, then 2 hp/s (10 hp per 5 s). Never at camp; Attuned immune; the Miner's Coat (W2) halves it.
- Walk home: the compass shows walking metres along the walkable route. The turn-back mark sits at walkHome x 1.25 + 10 s of fuel, announced once per trip; critical at walkHome x 1.0.
- Black-out or abandoning a trip: the pack minus the Sealed Pouch (and loose drops) stays as one cache where the explorer last stood safely. Walk within 1.6 m to get it back; what does not fit stays. A second black-out destroys the older cache. Abandoning with an empty pack keeps the older cache.
- Packs: Tiny 6, Sturdy 8, Expedition 10 (the last 2 slots are the Sealed Pouch). Stacks: stone 30, fibre 20, copper 15, iron 10, glimmer 10, echo 5.
- The Next line, in order: recover your pack, then the tutorial chain, then the closest upgrade ('Next: X — Material have/need'), then 'Go deeper — your best is -N m'.
- Records: deepest (depths stood on during an expedition), biggest haul, expeditions, black-outs, best streak; they only go up. Depth records every 10 m (toast from the second expedition on).

## Creatures and hazards (few, memorable, readable)

| Name | Where | Behaviour | Purpose |
|---|---|---|---|
| Lumen moths | Roots onward | harmless; drift toward lantern light, gather around hidden crystals | guide curiosity |
| Gloomcrawler | Crystal Veins onward | light-averse; circles at the lantern's edge; if the lantern dies it knocks the pack loose (items scatter, recoverable) | makes light management matter without combat |
| Stoneback | Forgotten Works | sleeps across passages; mining noise wakes it; it shifts slowly and blocks the way | stealth, route choice |
| Rockfall | everywhere | heavy mining under cracked ceilings: dust trickle and creak first, then a fall | read the environment |
| Gas pockets | Roots/Works | green haze, drains health; rebreather needed | gear gates |
| Deep water | Buried Sea | swimming drains the lantern; rebreather and floats | traversal |

No combat system unless a creature clearly needs one.

## Biomes (one at a time, each a complete, distinct zone)

Each zone is a separate voxel volume entered through a descent point, with its own material set,
silhouette language, lighting/atmosphere table, soundscape, resources, hazards, discoveries and
one landmark visible from far away.

1. **Roots** — damp stone, roots, soil, early minerals, the Halden camp ruins (the current zone
   grows into this).
2. **Crystal Veins** — monumental formations, refracted cyan, fragile crystal floors.
3. **Forgotten Works** — rails, supports, machinery, collapsed infrastructure, electrical anomalies.
4. **Buried Sea** — vast water, reflective shores, drowned ruins, strange organisms.
5. **Hollow Core** — impossible architecture, the Loom, archive halls.
6. **Abyss** — its own visual rules (violet, inverted gravity pockets), the last gate.

## Replayability (after the core works)

Seeded expedition variants of each zone's side areas (the authored spine stays fixed), rare
resource variants, hidden relic sets, optional challenge rooms, and the specialization choice.

## Execution plan and acceptance criteria

| Stage | Done when (all tested) |
|---|---|
| V. Visual foundation | critic panel scores ≥ 7 for geometry, materials, transitions, emission, originality on fresh screenshots; no regression in tests; frame cost measured |
| E1. One exceptional expedition (Roots) | a first-time player path from camp to the Hollow and back with ≥ 6 discoveries, 1 secret, 1 shortcut, 1 hazard, readable landmarks; e2e covers it |
| E2. Moment-to-moment polish | mining feedback per material (sound, particles, damage, break), pickups, movement and camera comfort; measured input latency unchanged |
| E3. Progression and camp | forge + research desk + expedition board built in the camp; specialization choice; every upgrade changes a behaviour (tested) |
| E4. Risk and extraction | recoverable black-out cache, rockfall and gas hazards with warnings; tests for fairness rules |
| E5. Zone system + Crystal Veins | second zone generated and reachable by a descent point, own materials/atmosphere/sound; save/load across zones |
| E6. Creatures | Lumen moths + Gloomcrawler with readable behaviours and tests |
| E7–E9 | Forgotten Works, Buried Sea, Hollow Core, Abyss, each on the reusable zone system |
| E10 | long-session soak, device profiling, store build |

## Stage E1 in detail — "The Lantern Hollow", one exceptional expedition

Built on the existing zone (camp → tunnel → ledge → stairs → hall → seal/gate → shrine → bridge →
balcony). What it adds, each item testable:

| # | Element | Design | Test |
|---|---|---|---|
| 1 | First-time path | the tunnel's warm lantern pools lead to the ledge; the ledge frames the Hollow (reveal); the stairs read as the obvious way down | route-walk test (exists) + a tour screenshot judged by the panel |
| 2 | Secret | the shrine behind crumbling masonry: hinted by a thin light leak and a rune band that wakes as the lantern passes | e2e: crumbling wall breaks, shrine discovery (exists) |
| 3 | Shortcut | once the hall floor is reached, a rope ledge (unlocked by mining a loose block) drops the explorer back toward the tunnel end, so returning to camp is faster than the way in | route test: hall → camp distance with the shortcut < without |
| 4 | Hazard | rockfall under cracked ceilings in the hall: dust trickle + creak warns 1.5 s before a fall; standing still under it costs half a heart, never a death | unit test: warning always precedes damage; damage never lethal from full health |
| 5 | Landmarks | the glimmerfall, the temple facade and the gate frieze readable from the ledge; the camp's warm glow visible from the stairs top on the way back | screenshot panel |
| 6 | The decision | a rich glimmer pocket beyond the bridge with the lantern below half: the HUD shows fuel vs. distance home so the choice is informed | unit test of the fuel/distance estimate |
| 7 | Black-out cache | dying drops the unbanked backpack as a cache marked on the compass; picking it up restores the items | unit + e2e: die, return, recover |
| 8 | Return | camp banks, refuels, heals, plays the home cue; the expedition summary lists found / banked / lost | e2e |

## The finished game: content (first-person round)

- **Beyond the rift** (world/gen/features/deep.ts), carved into the rock under the Hollow and reached from the rift floor's west edge through the Rootway:
  - the **Glowroot Cavern** (open): hanging roots, moss that gives a green-gold light of its own, soil banks, copper, the first lanternstone, a builders' tablet;
  - the **Crystal Choir** (behind an Ironbound seal, tier 3): echo-crystal spires round a builders' dais, cyan and violet, echo and iron;
  - the **Ember Deep** (behind ember glass, tier 4, so the Glimmer-edged Pickaxe opens new rock): red fissures, lanternstone, rich iron, the builders' hearth and the last relic; its floor at 148 m is the deepest point. Its walls breathe like the Halden Face.
- **Lanternstone**: warm-veined stone; breaking it frees an ember that adds 30 s to the lantern on the spot (the lantern gamble: push on to that warm glint, or turn home).
- **Never empty** (world/gen/content.ts): no reachable floor is more than 10 m from a find. The pass adds ore of the depth's tier, Halden supply crates and caches with loot, glimmer clusters, and 10 secret alcoves behind loose masonry (3 high, 4 in the Hollow, 3 deep), each with a cache and a warm lamp whose light spills out when the wall breaks.
- **Relics**: five key items with one line each (the reliquary's lens, the gallery's lamp, and one in each cavern beyond the rift).
- **Feats** (gameplay/Feats.ts): 29 milestones (firsts, depths, labour, finds, story), each with a calm toast, a small reward paid into camp storage, and a Journal page with lifetime numbers.
- **Guidance**: the chain now starts by doing (look round, then walk); a hint comes when the objective line has not moved for 75 s; after the finale the Next line leads to each cavern beyond the rift in turn.
- **No creatures**: the lumen moths are now glow spores, drifting motes of light that carry no gameplay.
