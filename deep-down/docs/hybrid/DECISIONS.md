# DEEP DOWN hybrid: the lead's decisions

## Day 0 (2026-10-20)

**D1: the look.** The director saw the three spike sheets (`scratchpad/spikes/{crystal,storybook,lantern}/sheet.png`) and
picked **B, "Voxel lanterne"** (the Lantern-lit voxel, refined). This overrides SPEC §8.2's "Lamplit Faceted" default. The
amendments are in `W1-LEAD.md` §1; the spike's source is copied, as a reference only, to `reference/spike-lantern/`, outside the
compiled tree.

**Earlier director rulings, in force:**
- First person; the character is never shown. Every interaction is a tap or a hold.
- No creatures of any kind: no collection, taming, companions, pets or monster battles. Lumi Master is a reference for its 3D look
  and how it presents exploration only.
- DEEP DOWN keeps its identity: the lantern-lit descent through underground biomes, mining, treasure and relics, sealed gates, the
  hired crew and machines, upgrades to absurdity, the mystery at the bottom, and the "Lamplight on the Lintel" brand.
- The director's verdict on the last APK was "horrible, glitchy, far too many animations, illegible". SPEC §8's calm rules
  (§8.6–§8.10) stand unchanged.

**0.2 Lumi Master frames.** There was no video access in this environment. W1 proceeds with SPEC §8, as amended. The item stays
open.

**0.4 Save.** Migrate the v3 meta to v4, as SPEC §10 says, with a one-time notice. v1 and v2 saves stay legacy.

**0.5 Purge gate.** `tools/purge-gate.sh` runs the SPEC §13.1 grep. It allows lines that state the purge itself ("purge",
"creature-free", "no creatures") and "Mother Cap". At day 0 it fails, as expected, on the cutaway code that W1 deletes.

**0.6 Flake.** `tests/unit/mesh-worker.test.ts` is known to time out under parallel load and to pass alone. Re-run it alone
before calling it a failure.

**0.7 Baseline.** The state before W1 is commit `06ad4fc` plus this day-0 commit: tsc clean. The last full unit run (2A's report)
gave 537 tests: 529 pass, 4 `it.fails`, and 4 failures in the cutaway's audio, brand and slab tests, which W1 deletes or rewrites.

**The economy.** The recalibration workflow died in a container restart at its judge stage. Its three explorer patches survive in
`scratchpad/econ/{hp-slope,dps-growth,bounded-pushes}.patch`, with their findings. SPEC rule 12 stands: the curves are frozen
until the node-paced bot measures the new pacing. 1A reads those patches as evidence, and applies none of them blindly.
