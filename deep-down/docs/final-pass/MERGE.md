# Final pass — merged build plan (read this first)

Two design efforts ran in parallel:

- the producer plan (`plan.md`, with per-workstream contracts in `workstreams.md`);
- three fun/content specs requested by the director: `fun-world.md` (world variety), `fun-play.md` (moment-to-moment play variety) and `fun-content.md` (assets, special events, ores).

They overlap. **This file is the tie-breaker.** Where it disagrees with any other file, this file wins. Everything else in those files stands, including the rules in plan.md §6.

## 1. Waves

The machine has 4 CPUs, so two agents run per wave. Agent A owns `Game.ts` in waves 1–3 and 5. In wave 4 both agents make small hook edits there (see §4).

| wave | agent A | agent B |
|---|---|---|
| W1 | **loop-core** — plan W1-A | **release-infra** — plan W1-B |
| W2 | **world** — fun-world (all MUST; P7 as SHOULD) | **brand** — plan W2-B |
| W3 | **tree-runes** — plan W2-A + W3-A merged, amended in §3 | **screens** — plan W3-B |
| W4 | **play** — fun-play, amended in §3 | **content** — fun-content, amended in §3 |
| W5 | **feel** — plan W4-A | **home-hud** — plan W4-B |
| gate | release verification (plan §13), by the orchestrator | — |

## 2. Settled conflicts

**Block ids**
- 34–38 belong to content: TIN_ORE 34, LANTERNSTONE 35, LIGHT_RESONANCE 36, STATUE_SOLID 37, FOSSIL 38.
- The plan's Echo crystal becomes **ECHO_CRYSTAL = 39**, and Ironbound becomes **IRONBOUND = 40**. Both are owned by tree-runes (W3).
- tree-runes adds 39 and 40 in W3, before content runs in W4. content adds 34–38 in W4. Nobody else adds block ids.

**Rift access**
- The world's rope ride (fun-world P5) is the way down.
- The plan's `riftWinch` node is cut. Prerequisite "9" in the tree becomes "the Rift reached", i.e. the world's undercroft or rift-floor discovery.

**Shortcut** — the world's Halden hoist (fun-world P3) replaces the plan's `haldenLift` node, which is cut.

**Renewal ("the Bloom")**
- The world's "deep breathes" is the only renewal system: living rock re-rolls per expedition, and a glimmer bloom appears.
- The plan's generic regrowth of mined ore cells and its separate seam system are cut.
- tree-runes (W3) builds the Survey Table **rumours** from the world's living and bloom data: area and walking distance, plus picking a compass target.

**Black-out cache, turn-back and walk-home field** — loop-core (W1) builds them. fun-play S1 and S2 are dropped.

**Records**
- loop-core (W1) builds trip tracking and `Records`.
- play (W4) adds firsts, ore streaks and depth marks on top of them. It extends `Records`; it does not create a parallel system.

**Expedition Report**
- screens (W3) builds `summary.ts`: ledger, banked, found, lost/cached, overnight and the Next card.
- play (W4) adds its sections to that same screen: contract result, firsts, strike stats. play's `report.ts` is not created.
- play keeps its notice budget in FunHud.

**Contracts**
- play (W4) owns them. The plan's cut is overruled, because the director asked for variety.
- They show on the Survey board (`board.ts`, built by screens in W3) as a Contracts section that play adds in W4.
- Rewards are paid into camp storage on camp entry.

**Halden supply crates** — content C3. fun-play C2 is dropped. **Rune lock** (fun-play C1) is dropped; runes are tree-runes' job.

**Lumen moths, Halden logs, rune doors** — world (W2). The plan's cut list is overruled for these.

**Runes and finale**
- tree-runes (W3) places the 8 runes at the plan's §2.6 sites. Rune 7 and rune 8 sit on the world's rift floor.
- The plan's Ironbound niches stay, gated at tier 3.
- world (W2) builds the black stone interaction as a discovery. With fewer than 8 runes it stays cold and silent.
- tree-runes (W3) gates the finale on it: 8/8 runes, then the stone wakes, then "The Answer", then the end card. screens (W3) builds the end card.

**Tin needs a sink**
- content (W4) owns `recipes.ts` edits in W4. It adds tin as an input to at least 2 existing nodes, for example the Expedition Pack or Grip Boots as bronze fittings, or a new Bronze Lantern.
- It re-balances so that the W3 economy test still passes, now including tin.

**Lantern Ember (+30 s field refuel, content C1)**
- It stays. It must feed loop-core's fuel model through `Lantern.add()`.
- The turn-back mark recomputes from the new fuel.

**Discoveries**
- The discovery list is one config table: loop-core adds `index`/`total`. Every later wave appends to it.
- Banners show `{index}/{total}`. `total` is computed from the table, never hard-coded.

**Visual Lab button** — it is already hidden in production unless `?lab` is set (commit 1e35c96). Keep that; `?dev=1` is not needed.

**Mobile controls** (task #40, done by the orchestrator: Mine button, aim assist, joystick, haptics, fullscreen, manifest)
- `TouchControls.ts`, `aimAssist.ts`, `haptics.ts` and `screenFormat.ts` are committed.
- feel (W5) may route its haptics through `src/ui/haptics.ts` (it owns that file in W5).
- home-hud (W5) owns `TouchControls.ts` only for visual restyling. It keeps the behaviour and the unit tests of `tests/unit/aimAssist.test.ts` and `ui.test.ts`.

## 3. Amendments per agent

**loop-core (W1)**
- Do everything in plan W1-A.
- Split `en.ts` into section files `src/i18n/en/{core,loop,world,release,brand,screens,hud,feel,play,content}.ts`, assembled in `en.ts`. Keep a unit test that rejects duplicate keys.
- Make the discovery table expose `index`/`total`.
- Keep `DebugApi` additive, so later agents can add `__DD__.features`, `__DD__.fun` and `__DD__.content`.

**release-infra (W1)**
- Do everything in plan W1-B.
- `playwright.config.ts` reads `DD_E2E_PORT`; the default stays 4173.
- The vite `webApp()` manifest plugin (orchestrator, already in `vite.config.ts`) and `android/make-icon.mjs` `iconPng()` exports must keep working. Extend them, don't replace them.

**world (W2)**
- Do fun-world in full, but it must not touch W2-brand files: `ui.css`, `styles.css`, `UI.ts`, `notices.ts`, `screens/menu.ts`, `icons.ts`, `index.html`.
- UI it needs, such as the `HALDEN LOG` label on banners or a progress ring on the interact chip, goes in its report as a request for screens (W3).
- Its i18n goes in `src/i18n/en/world.ts`.
- Rides become edges in loop-core's walk-home field.
- Bump `WORLD.genVersion` and re-record the fingerprint.

**brand (W2)** — do plan W2-B.

**tree-runes (W3)**
- Do plan W2-A's tree (14 nodes minus `riftWinch` and `haldenLift`, so 12 nodes), stations, gear effects, Next line and economy test.
- Do plan W3-A's runes, Relic Shelf and finale, with these changes:
  - no winch, no lift, no generic Bloom;
  - rumours come from the world's living rock and bloom;
  - ECHO_CRYSTAL = 39 and IRONBOUND = 40.
- Blocked from reaching the rift? Prerequisite 9 becomes "the Rift reached". Re-check the economy against world's living rock: it is renewal, so the economy test must pass with it turned off.

**screens (W3)**
- Do plan W3-B: tree screen, Expedition Report (`summary.ts`), Survey board (`board.ts`), Journal (it lists Halden logs and runes), ending card, About/Licences.
- Also do world's UI requests from its report.

**play (W4)**
- Do fun-play M1–M5, M7 and M8, with these changes:
  - M6 becomes "add sections to `summary.ts` + FunHud";
  - S1, S2, C1 and C2 are dropped;
  - records extend loop-core's `Records`;
  - contracts show in `board.ts`.
- Pockets pass order: features, then content, then pockets. Use its own forked rng.

**content (W4)**
- Do fun-content C1–C7, plus the SHOULD items if time allows. Use block ids 34–38.
- Add the tin sink (§2).
- Pass order is features, then content, then pockets.
- Coordinate with play on `MiningController.ts`: content's 3 lines go in a separate spot from play's hooks.

**feel (W5)** and **home-hud (W5)** — do plan W4-A and plan W4-B.

## 4. Shared hub files in W4

play and content both make small, additive hook edits in `Game.ts`, `MiningController.ts`, `events.ts`, `blocks.ts`, `generateWorld.ts` (one call each), `world/gen/types.ts`, `render/props/models.ts` and `DebugApi.ts`.

Rules:
1. Re-read the exact region right before every edit.
2. Never move, reformat or rename existing code.
3. Append to lists and unions; don't rewrite them.
4. Keep `npx tsc --noEmit` passing after every edit.
5. If `tsc` breaks in a file you did not just touch, wait a minute and re-check before acting. The other agent is probably mid-edit.

## 5. Machine and test etiquette

- e2e: agent A uses port 4173, agent B uses `DD_E2E_PORT=4174`. Until W1 lands, only agent A runs e2e.
- Before a capture or an e2e run, check `pgrep -fa "playwright test|play.mjs"`. Don't start a second heavy browser job while two are already running.
- SwiftShader under load makes the e2e time out. A timeout during the other agent's capture run is not a failure of your code. Re-run it once the machine is quiet before you conclude anything.
- Agents never commit. The orchestrator commits at wave close, and may commit tsc-clean checkpoints mid-wave.
