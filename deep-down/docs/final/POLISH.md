# Polish round (about 2–2.5 hours; the same owners and rules as BRIEF.md §4–§5)

The first round is done and committed (tsc clean, vitest 621/621, e2e 18/18, apk-sim 14/14, ui-check 82/82). This round closes
every cross-request and the lead's visual notes, so the game ships finished. MUST items only. Work efficiently.

## The lead's visual notes (from the captures)

Read these captures with the Read tool:
- `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/vis/r3.png`
- `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fp/final/grid.png`
- `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/content/deep-*.png`

1. **Close walls wash out.** Walls and veins within 1–2.5 m of the lantern go pale cream or pink-white (`r3/03b-copper`, and
   the grid's copper frame). Roll the lantern's near-field term off so lit stone peaks at about 0.75 display at 1 m, and keep the
   colour and texture visible there. *(VIS)*
2. **The viewmodel is a bit large.**
   - The pickaxe covers about a quarter of the lower right, and its head reads as a stair-stepped pixel shape.
   - Scale both tools down about 15–20 %, keep them out of the central 50 % column, and give the pick head a bevelled, forged
     silhouette that matches the stone's quality, not a pixel stack.
   - The lantern's sleeve or arm from the left reads as a brown pipe. Make it a clear glove and cuff, or crop it out of frame.

   *(FP)*
3. **Some spaces are monotone or too dark:**
   - the gate (purple-grey);
   - the rift floor (flat violet);
   - Ember Deep (empty brown);
   - Glowroot (a green wash).

   Each needs one warm counterpoint and one lit focal point; see BRIEF §2's rules. *(VIS, with CONTENT for focal props)*
4. **The Choir's floor rune blocks** read as large glowing glyph boxes. Make them dimmer and smaller in emission, so the spires
   and the dais are the focus. *(VIS / CONTENT)*

## Cross-requests

### To VIS
- The viewmodel (`userData.viewmodel`, layer 5) must stay out of any depth, AO, shaft or shadow pass.
- At 1–2 m the mining crack decal (TargetMarker) reads as a big black star. Make it finer and lighter up close.
- Debris near the eye shows as large unlit dark cubes. Light it like the rock, and cull or fade any chunk within 0.6 m of the
  camera.
- Check that roofs still read in 2 m tunnels, with the lantern at `LANTERN_LIGHT_CAM` (−0.24, −0.40, −0.30).
- The Ember Deep fissures are too weak to be a focal point. Add a brighter emissive vein, or halos for LIGHT_MAGMA and
  LIGHT_GLOWROOT.
- Draw CONTENT's ambient anchors (`layout.content.ambient`: drips and glow caps) within the calm-FX rules.
- Recapture every space, including the 3 deep caverns. Final rubric: every criterion ≥ 3, mean ≥ 4, Light ≥ 4.5.

### To FP
- The too-hard hint: tier ≥ 4 (ember glass) says `hint.tooHardGlimmer`.
- The journal gets a **Feats** tab from `progression.journalView().feats`. The new 'beyond' zone header and the 5 relic rows lay
  out cleanly.
- The Expedition Report shows the optional `report.feats`, `report.caches` and `report.secrets` as one calm line.
- The tutorial now starts on the objectives 'look' and 'walk'. Remove the now redundant `Game.ts` tutorial hints for move and
  look, and update the specs that expect 'Mine stone (0/12)' first.
- Opened caches return `Infinity` from `WorldFeatures.focusDistance`, so a tap never walks to an empty chest.
- Desktop landscape: the lantern sits partly off-screen. Fix it only if cheap.
- `settings.cameraFollow`'s label (CONTENT owns the text) reads "Turn the view along tap walks".

### To CONTENT
- `PLAYER.walkSpeed = 3.3` and `HOME.secondsPerStep = 1.35 / 3.3`, so the walk home and the turn-back mark are honest.
- `REACH = 4.2` and the `dy - 1.3` term in `world/analysis/economy.ts` align with first-person reach from the eye.
- Confirm the recipe costs, and the rumours past the seal, against `progression.spec`.
- The `settings.cameraFollow` label text.
- Focal props for the monotone spaces of note 3, if VIS needs them.

## Gate (the lead, after this round)

- `tsc`, the full vitest, and every e2e spec on a quiet machine.
- `apk-sim` and `ui-check`.
- The lead's own captures and rubric.
- The final APK, the docs and the delivery.
