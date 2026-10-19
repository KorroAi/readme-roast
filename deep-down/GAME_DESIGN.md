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
