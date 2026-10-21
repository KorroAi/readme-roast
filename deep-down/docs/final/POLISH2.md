# Polish round 2 (about 1.5–2 hours; ROUND2.md ownership and rules)

Round 2 is merged: tsc is clean and vitest is 721/721. This round fixes what the lead and the specialists saw in the captures, so
the APK has no visible glitch. MUST items only. Be efficient: the director asked us to watch the remaining credits.

## VIS

1. **The selection outline is a huge white frame across the whole wall** when you mine a vein (see
   `scratchpad/fp2/final/grid.png`, frame 3, the full path being
   `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/fp2/final/grid.png`).
   - It must hug the struck block or vein only.
   - Clear the leftover outline polygons when a block breaks.
   - Ambient rarity outlines must never draw long lines across the screen.
2. **Close walls wash to flat orange and pink** within 1–2 m while mining: the vein's colours spread as camouflage blobs (same
   frame).
   - The vein reads as metal nuggets in grey rock.
   - Lit stone peaks at about 0.75 display at 1 m.
3. **The camp fire** must read as flames, not a pink stack of cubes. Check it in the real game.
4. **A dark quad floats in the Glowroot.** Find it and remove it.
5. **The Lantern Vault:** the balcony lamps and braziers at y 65 and 92 must read through the haze from the floor at
   (130, 43, 30).
6. **Event visuals**, small and calm, for the `world:event` kinds:
   - dust falling at `event.target` (rockfall);
   - spores rising at `event.anchor` (geyser);
   - a soft glow on blooming crystals;
   - a drifting mote at `game.events.live.light` (echo light).
7. Recapture with `tools/fp-shots.mjs` from the **real camera**:
   - every space;
   - mining a copper vein at 1.2 m with its outline;
   - a selected chest;
   - each weapon in hand.

   Open every capture, and list any glitch that remains.

## FP

1. **Weapon icons in the tree:** the Forge nodes fall back to the coat icon today. Draw machete, sling, spear and flash-charge
   icons in the icon set, or give them a Forge column if that layout fits better.
2. **A tap on plain rock** shows the soft tunk with the text `hint.plainRock`, once in a while (never spam).
3. **The hoist ride:** keep the eye at least 0.45 m off the rope's axis (stand off-centre on the cage), so the rope never fills
   the top of the frame.
4. **The machete blade:** check that the stripes are gone, in a fresh capture.
5. **`TECHNICAL_ARCHITECTURE.md`:** update the Camera and Touch sections. There is no dot on touch; selection snaps within
   56 px by rarity; plain rock tunks; there is a combat section and a Flash chip.
6. **Audio for the world events**: a tremor rumble, a rockfall creak and land, a gust, a geyser, a bloom chime, an echo hum.
   MOBS owned `src/audio/**` last round; FP owns it in this round.
7. **Verify:** tsc, your unit tests, and `tests/e2e/tap.spec.ts` on your port. The lead runs every suite at the gate.
