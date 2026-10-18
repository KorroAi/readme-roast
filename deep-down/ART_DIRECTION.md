# DEEP DOWN — Art Direction

The reference image is a mood target, not a source. Everything is generated in code.

## Pillars

1. **Darkness with intent.** The underground is dark, never unreadable. Big spaces get a
   faint blue haze (openness ambient + fog) so silhouettes read against it.
2. **Warm safety vs. cold mystery.** Amber = people, camp, lanterns, safety. Cyan = minerals
   and the ancient builders. Violet = the deep and the unknown. Faint teal moss is the only
   other glow.
3. **Chunky, deliberate voxels.** 1 m blocks with 16×16 pixel-art faces, a 1-pixel bevel on
   every block, per-vertex AO, per-face directional shading. Props and the explorer use
   smaller boxes (about 1/16 – 1/4 m) so they read as crafted objects against the terrain.
4. **Restraint.** Glow is reserved for things that matter (crystals, glyphs, lanterns, the
   abyss). Particles are short-lived and few. No full-screen effects except bloom, vignette,
   colour grading, and brief flashes on discoveries (cyan) and damage (red).

## Palette (sRGB)

| Role | Colors |
|---|---|
| Slate (base rock) | `#1f242c` `#282e38` `#313844` `#3b4351` `#464f5e` `#535d6d` |
| Deep slate (lower) | `#15181e` … `#313844` with strata |
| Umber strata / soil | `#271f1a` … `#544538` |
| Ancient brick | `#2a2f3a` … `#58606f`, mortar `#1b1e25` |
| Glyph / crystal cyan | `#1f8fa6` `#48d6ea` `#b4fbff` / `#0a3a4c` … `#e2ffff` |
| Copper | `#6b3519` `#a9582a` `#db8547` `#ffc58e`, verdigris `#48b29c` |
| Iron | `#4a3d35` `#7d6857` `#b9a38c` `#ece0cf` |
| Lantern / camp amber | lantern light `#ffd2a6` (×1.6), lantern glass `#ffc58a`, emitters (1.0, 0.70, 0.42) |
| Abyss violet | emitter (0.50, 0.32, 1.0) |
| Fog | `#12263a`; ambient `#0b1220`; openness fill `#2a4a6e` |

## Composition rules for environments

- Every space has one focal light and one silhouette layer.
- Narrow → wide: tunnels open into chambers through a framed threshold (the Hollow ledge).
- Vertical scale: full-height pillars, stalactites, stairs, a chasm with light from below.
- Guidance through light: route lanterns every ~10–15 m (warm pools with dark gaps).
- Secrets are hinted, not hidden: crumbling brick leaks thin cyan light through cracks.

## Light and shadow

- The lantern casts soft shadows: visibility is propagated outward from the flame, so shadow
  edges are crisp near an occluder and widen with distance, like a real flame.
- Placed lights get a soft additive halo so distant lamps read across the dark.
- Warm pools along the route alternate with dark gaps; the eye follows the next pool.

## Camera framing

Over the right shoulder, 3.8 m boom, explorer left of centre so the crosshair stays on the
rock. In tunnels the rig swaps to the left shoulder when the right is walled in, and the
explorer dithers out when the camera gets close, instead of filling the screen.

## Explorer

Chunky proportions (large head, ~1.7 m), brown hood/hair, cream shirt, dark trousers, brown
boots, a big backpack with a bedroll, a lantern in the left hand, the pickaxe in the right.
Readable silhouette from behind at 4 m: backpack shape + lantern glow.

## UI

The title is drawn with a pixel font defined in code: icy gradient, dark outline and bevel,
soft glow, and the first O of DOWN cut as a cyan crystal.

Clean sans-serif in caps with generous letter spacing for headers, mixed case for body.
Dark translucent panels (`rgba(9,14,22,0.82)`) with a thin cool edge. Amber for primary
actions, cyan for discoveries, red only for danger. Touch targets are at least 44 px (48 px
for primary buttons and tabs); button and body text 15 px, scaled up in Large mode;
secondary labels go down to 12 px. Icons are isometric voxel cubes drawn from the same tiles.

## Audio

Original synthesis only. Stone = filtered noise thump; metal = inharmonic ringing partials;
crystal = glassy high partials with shimmer; wood = hollow knock. Cave reverb from a
procedural impulse response. Music: slow, sparse modal pads and plucks; warmer at camp.
