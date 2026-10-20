# Look: diagnosis, research and art direction for the first-person hybrid

Scope: why both earlier builds of DEEP DOWN looked wrong, what makes stylized 3D mobile games beautiful *and*
readable at phone size, and a concrete art direction for the new game: first person, portrait, tap-only, 3D,
procedural (no external assets), Three.js r186 WebGL2 on mid-range Android.

Identity is fixed and not up for discussion here. DEEP DOWN is a lantern-lit descent through layered
underground biomes:

- Topsoil Roots → Glowroot Caverns → Crystal Grotto → Halden Works → Fungal Deep → Drowned Ruins → Magma Veins →
  Fossil Halls → Frost Hollow → the Loom → Iron Core → Star Heart → Void Sea → the Gate.
- You mine rock, ores and gems, and find chests and relics.
- Sealed gates separate the biomes.
- A hired crew and machines keep digging while you are away.
- Upgrades go up to absurdity, and there is a mystery at the bottom.
- The brand is "Lamplight on the Lintel": amber lantern light against cool dark stone, octagon plates, the
  Lintel typeface and the emblem.

Lumi Master is a reference **only** for its look and for how it presents exploration. No creatures, taming,
companions, battles or trading. Ambient cave life may decorate a scene, but it is never a mechanic.

Date: 2026-10-20. Researcher: workflow subagent. Companion notes: `lumi-master.md` (the reference itself) and
`hybrids.md` (controls, comfort and loops of tap-driven first-person games). This note does not repeat their
loop analysis.

Confidence tags: **[C]** means confirmed by a primary source or two independent ones. **[S]** means one
secondary source. **[U]** means my own inference or observation, to be treated as a hypothesis.

Method limits:

- Every WebFetch failed with a DNS error (`getaddrinfo ENOTFOUND`), as it did for the earlier notes.
  External facts therefore come from search-engine extracts of the cited pages (§2, §7).
- I could not open screenshots or trailers of the reference games. Where I describe how one *looks*, it
  is tagged [U] and comes from my prior knowledge of the game.
- Our own screenshots were inspected directly: 18 of the first version and 17 of the latest (§1).

---

## 0. Summary (read this if nothing else)

1. **The first version failed on surface and staging, not on light.**
   - Pixel-art textures (16 texels per metre, sharp bilinear, biplanar projection) were laid over sculpted,
     smoothed rock. On every slanted face they stretched into horizontal smears.
   - Half the frame sat in one muddy brown-grey value band.
   - The third-person explorer and a 90–106° lens fought the tunnels: the camera ended up inside walls,
     washed out by fog, with the body covering the path.
   - What it got right is worth keeping: the lantern as the key light, with a real falloff and soft
     shadows; the warm-against-cold rule; framed thresholds and pools of light as guidance; the crafted,
     chamfered props; architecture at true scale; and a calm, on-brand HUD.
2. **The latest version failed on everything a phone screen punishes.**
   - Ores, gems and chests were painted as flat, saturated, glowing squares on a cut plane: stickers,
     not minerals.
   - Exposure ran at 1.85–2.6×, saturation was boosted to 1.1–1.15, and bloom started at a threshold of
     0.85. Everything valuable clipped and haloed.
   - Two painters met at voxel edges, producing hard seams and pattern-scale jumps.
   - The vista billboards and a glowing orb buried in solid rock read as bugs.
   - The juice table allowed 240–650 live particles, a shock ring and a camera shake on *every* break, a
     permanent camera sway, chromatic aberration and iris wipes.
   - About ten things competed in one frame, and about a third of the screen was HUD.
   - The camera, a side cutaway, wasted the 3D: the view read as a wall of tiles.
3. **The research converges on a few principles.**
   - Readable stylized games are *shape-first and value-first*: few tones per form, one focal point, calm
     grounds, small saturated accents.
   - Their wonder comes from **light and composition**, not from effects. That holds for Monument Valley,
     Alto, Sky, Lumi Master and Deep Rock Galactic.
   - Mobile post-processing must be small: MSAA 2× is almost free on Adreno, and bloom is the most expensive
     post effect.
   - First-person comfort means no bob, no sway, short eased glides, and a static anchor in view.
4. **Recommended direction: "Lamplit Faceted".**
   - Natural rock is faceted low poly: flat-shaded triangles of 0.25–0.6 m, vertex colour, baked vertex AO
     and **no textures**.
   - Man-made things are bevelled boxes: timber, rails, carts, crates, masonry, machines.
   - Ores, gems, chests and relics are **3D objects embedded in the rock**, never paint.
   - Light: one warm key (the lantern held low-left, visible in frame), a cool hemispheric fill, an
     occasional biome rim light from the far end of the drift, and fog toward a biome colour.
   - Grade: exposure about 1.0, bloom only on true emitters, saturation never boosted.
   - Camera: first person at an eye height of 1.6 m, with the **horizontal FOV locked at 52°** (93° vertical
     on a 19.5:9 phone).
   - FX: at most 3 moving foreground groups, at most 80 particles, **zero camera motion on a tap**.
   - HUD: 20% of the screen at most.
5. **Ten rules** (§6) that would each have caught the director's verdict ("horrible, glitchy, illegible")
   before an APK shipped. Each one comes with an automatic capture test.

---

## 1. Diagnosis of our two builds

### 1.1 The first version (commit `9eb4166`: third-person voxel caves, joystick plus Mine button)

Inspected:

- `artifacts/final-pass/first-five-w2/` 02, 03, 04, 06 and 07.
- `artifacts/final-pass/w3/` camp-after-north, camp-rising, forge-close, niche-chasm, niche-gate and
  rune-star.
- `artifacts/world-w2/r1/` f05, f10 and f17, plus `r6/f03-grotto`.
- `artifacts/tour/` t2, t4 and t6. These are earlier, before the R3/R4 surface passes.

**What is ugly or glitchy**

| # | Problem | Where you see it | Cause |
|---|---|---|---|
| F1 | **Stretched texel smears.** Long horizontal streaks and "torn paper" bands of pixels across walls and ceilings | 03-tunnel (both walls), forge-close (back wall), camp-after-north (back wall), r1/f05 (side walls), w3/camp-rising | 16 texels per metre pixel art, sampled sharp bilinear (`terrainMaterial.ts` `sharpUv`) and projected biplanar onto chamfered, relaxed rock. Where the surface is oblique to both projection planes, each texel stretches across metres. Crisp pixel edges next to smooth shading also make two art styles in one surface |
| F2 | **Mud.** Large areas of mid-dark brown-grey of similar value and low chroma. Nothing pops, so the caverns read as "horribly empty" even when props are present | 02-camp-start, 06-camp-return, forge-close, r6/f03 | Neutral, toned-down albedo ramps; a lantern that lights everything near it to the same mid; few accents; no value hierarchy per frame |
| F3 | **Crumpled-cardboard rock.** Big soft folds with smooth normals and no small-scale form. The geometry reads neither as voxels nor as rock | 04-copper-mining, r6/f03 ceiling, camp-after-north walls | Dual-cell chamfer and relax at 1 m resolution, smooth-shaded: too coarse for detail, too smooth for facets |
| F4 | **The camera fights the cave.** The lens inside the rock, a fog and whiteout wash, the explorer clipping into the wall | 04-copper-mining (whiteout plus discovery band over it), niche-chasm (flat violet wash, no focal point), 03-tunnel (walls fill 40% of the frame) | Third person on a 90° locked hFOV that opens to 106° while rock holds the boom short; boom collisions in 2 m tunnels |
| F5 | **The body hides the world.** The explorer covers the path or the target | niche-gate (the explorer fills a third of the frame), 03-tunnel, r6/f03 (the pack fills the lower left), f10 | Third-person framing in tight spaces |
| F6 | **Runes as UI sprites.** Flat, unshaded cyan pixel strokes floating in front of rock | niche-chasm, niche-gate | Emissive strokes with no carving depth or light response |
| F7 | **Blown halos.** Lamps and the campfire drawn as fuzzy white discs | rune-star (lamp), camp-rising (hanging lamp), 06 (campfire), f10 (violet orbs) | Additive halo sprites plus bloom on near-white emitters |
| F8 | **The earlier blocks** (tour shots): a 16 px framed tile per block face, glowing cubes with bloom glare, brick and ore-block vocabulary | t2, t4, t6 | Fixed in R3/R4, but this is where the "Minecraft" read came from |
| F9 | **Decoration over the HUD.** White moth sprites overlap the material label | niche-chasm (bottom centre) | Ambient sprites with no HUD-safe zone |

**What it did well (carry these forward)**

- **The lantern is the key light, and it behaves like a flame:**
  - a windowed inverse-square falloff;
  - warm-pale at the core, amber by about 1.8 m;
  - a ring-shaped pool on the floor;
  - soft shadows propagated from the flame.

  The floor pool in 02-camp-start and camp-after-north is the most attractive thing in either build.
  (`ART_DIRECTION.md` at `9eb4166`, "Light and shadow".)
- **Warm safety against cold mystery:**
  - amber means people;
  - cyan means minerals and the builders;
  - violet means the deep;
  - "nothing else glows";
  - every cyan space gets one warm practical.

  This *is* the brand, and the latest build lost it.
- **Composition rules:**
  - one focal light and one silhouette layer per space;
  - narrow to wide through a framed threshold;
  - pools of light every 10–15 m as guidance.

  r1/f17 is the best frame of the project: a dark warm tunnel mouth framing a cyan grotto with crystals.
  It is exactly the "window" shot the new game needs (§5.2).
- **Props.** Chamfered boxes of about 1/16 to 1/4 m: crates, barrels, the workbench, bedroll, lantern posts,
  tools. They are readable, charming and coherent (06, 07, forge-close).
- **Architecture at true scale:** stairs with 0.25 m treads, coping, an arched bridge, timber sets
  (rune-star, r1/f05, camp-after-north).
- **Restraint, written down and tested:** a cyan budget (≤ 120 emitter voxels) and a capture metric
  (≤ 3% saturated cyan pixels).
- **The UI kit:** octagon plates, the Lintel display face, ledger typography, WCAG ≥ 4.5:1. The HUD has
  four corners and nothing in the middle. What was missing was guidance (the director: "nothing is
  indicated"), not calm.

### 1.2 The latest version (the 2D cutaway idle clicker in the working tree; the APK the director hated)

Inspected:

- `scratchpad/peek-2.png`, the APK frame.
- `artifacts/idle/w2/look/`: r5-biome-00, -02, -06, -10 and -12; r5-vista-01; r4-vista-00;
  r4-biome-04-412x915; r6-biome-07; ceremony-shock-biome-04; ceremony-iris-biome-02.
- `artifacts/idle/w1/`: w1-c-hud-20m, w1-c-return-feast, w1-c-dig-sheet, w1-b-grotto-150m, w1-b-cellfx.

**What is ugly, glitchy or illegible**

| # | Problem | Where you see it | Cause (code or doc) |
|---|---|---|---|
| L1 | **Flat colour tiles.** Ores, gems and chests are saturated squares with cartoon blob or Voronoi patterns, glowing, unshaded, with no thickness. They read as stickers or Tetris pieces, not minerals in rock. The scattering has no geological logic (no veins, no lenses) | every r5 shot; worst in r5-biome-02 (pink, blue and red squares), -06, -12 and ceremony-shock-04 | `look.ts` "section" painting: cut-plane faces painted per pixel from a 5-stop ramp with an `ore`/`glow`/`gem` style plus emission. Valuables were tuned to 0.6–0.9 luminance against a host toned to ×0.55 saturation (`LOOK.md` §2), so they *were* designed to be the brightest, most saturated thing on screen |
| L2 | **Clipping and haloes.** Bright tiles and the chest burn to white-yellow with soft glows | r5-biome-06 (chest), -12 (yellow tiles), r4-04-412 | `biomeLooks.ts`: `exposure` 1.85–2.6, `saturation` 0.9–1.15, `bloomThreshold` 0.85–1.1, `bloomStrength` 0.45–0.9; then a +0.05 exposure ramp per Echo cycle. Exposure pushes a dim scene up, and noise, banding and emitters all go with it |
| L3 | **Seams where two painters meet.** Hard vertical lines where cut-plane "section" faces meet "legacy" pixel-painted side faces; pattern scale jumps (0.5 m Voronoi on the floor, 3 m on the back wall) | r5-biome-00 (left column), r5-biome-10 (right edge), r6-biome-07 (back wall against floor), r5-biome-12 | Two material paths on one block (`LOOK.md` §2: "the other faces … keep the legacy painters") |
| L4 | **Stretched texels and scanlines** on faces seen at grazing angles | r5-biome-10 (left and right columns: horizontal scanlines), r5-biome-06 (lower band: red horizontal streaks), w1-b-grotto-150m (smears) | Legacy 128² texel painters on side faces under a 12.6 m perspective camera |
| L5 | **Broken-looking backdrops.** A flat orange card with a black root silhouette floating in it, and a crate hanging on a chain in mid-air; an inverted, mirrored-looking forest of hanging mushrooms | r4-vista-00, r5-vista-01 | `VistaBackdrop` layers at z = 110/190/320 m behind the cut. Their perspective and light do not match the foreground, so they read as wallpaper |
| L6 | **A glowing orb inside solid rock** at the same spot (about 50% width, 69% height) in every capture | r5-biome-00, -02, -10, -12, r4-vista-00, r5-vista-01 | Probably the lantern or mote sprite drawn through the rock [U]. Whatever it is, it reads as a bug |
| L7 | **Geometry slivers.** A diagonal wedge of foreign texture at the left edge | r5-biome-02 (x 0–80, y 1030–1150) | Clipping or a near-plane cut on a side block [U] |
| L8 | **No depth.** A side cutaway with the foreman at about 2% of the frame height. Most of the screen is a flat wall of rows that all look alike. The "3D" pays its cost and gives nothing back | every r5 shot | The camera 12.6 m in front of a cut plane (`DescentCamera.ts` `CAM_DIST`) |
| L9 | **Too many things move at once.** In peek-2 about ten elements compete for a first-time player: a 450 px glowing tutorial ring, a pointing hand, a BEST ribbon, a pulsing card, a dotted progress ring, a combo counter "29 ×1.58", a ? chip with a dot, a floating light mote, dust and shards | peek-2 | `designs/motion.md` §9.4 allows, per break: 16 dust, 6–10 sparks, 8–10 shards, a **world shock ring**, **trauma 0.18–0.22** (shake of 0.40 m × T² and roll of 1.2° × T² at 22 Hz), and local flashes and bloom pulses on ore. The budget allows 240–650 live particles covering up to 1.0× the screen area. On top of that: a permanent ±0.6° yaw sway (`CRITIQUE.md` B13: "every … silhouette edge will crawl"), chromatic aberration, rays, iris and shock post effects (`LOOK.md` §0.2) |
| L10 | **HUD weight.** Top band (gold, depth, gem chip, goal bar) about 15% of the height; bottom (cards, Dig and Crew tabs, combo dial, ? chip) about 18–20%; a depth ruler with labels down the right edge. About a third of the screen is UI, on "glass" plates at ≤ 0.45 alpha over a busy, high-contrast scene | peek-2, w1-c-hud-20m, w1-c-dig-sheet | `2C MUST 0: glass HUD`. The brand says "no glass, no backdrop blur" (`ART_DIRECTION.md` at `9eb4166`) |
| L11 | **Cotton-ball dust.** Big, cream, unlit soft discs that read as popcorn | w1-b-grotto-150m, w1-c-hud-20m, w1-b-cellfx | Particles not lit by the scene (the motion design lit only "dust" with one light-volume fetch) and too large on screen (cap ≤ 64 px) |
| L12 | **Heavy-handed ceremonies.** A black octagon iris that crops the world; a full-frame shock ring | ceremony-iris-biome-02, ceremony-shock-biome-04 | `PostParams.iris` and `shock` |

**What it did reasonably well**

- The UI kit stayed mostly on brand: Lintel numerals, octagons and a clean "While you were away" panel
  (w1-c-return-feast).
- An objective is always shown, and the crew can be seen digging.
- Each biome has a distinct accent pair (`biomeLooks.ts`). Those hues are a useful starting palette (§4.4).
- The middle band of r4-biome-04-412x915 and ceremony-shock-biome-04, with Fungal Deep caps lit from below,
  shows real wonder potential *where it is 3D and lit*.
- The engineering is solid and reusable: two-resolution rendering, FXAA before the upsample, a LUT pair
  per biome, a governor with a fine scale, and programs compiled at load (`LOOK.md` §1).

### 1.3 Root causes common to both

1. **Surface detail was asked to do the job of shape and light.**
   - The first version painted pixel art onto sculpted rock.
   - The latest painted patterns onto a flat cut.
   - In both cases the texture stretched, seamed or shouted.
   - The good frames in either build (the camp pool, r1/f17, the Fungal band) are good because of
     *light on form*.
2. **The tests measured the wrong things.** The latest look-dev had a strong metric culture:
   - ΔE between biomes;
   - luminance bands;
   - V1–V11 scores.

   None of those metrics measured:
   - "how many things move";
   - "are there seams";
   - "is it legible at thumbnail size";
   - "does the frame have *one* focal point".

   Every metric passed, and the APK was still illegible.
3. **Juice was additive and never subtractive.** Every event got its own ring, flash, shake and particle
   burst, with a "density governor" scaling counts, but nothing in the design capped the *number of
   simultaneous independent motions* the eye has to track.
4. **Neither camera served the player's eye.**
   - The first version's camera showed the explorer's back.
   - The latest showed a section diagram.
   - The new game's first-person view is a chance to put the *target* at the centre of the frame and in
     the light, every time.

---

## 2. What the reference games teach

The goal is not to copy any of these games. It is to extract the mechanisms that make them beautiful *and*
legible on a phone.

### 2.1 Lumi Master (bilibili, 2026): the restraint reference

See `lumi-master.md` for the sources.

- **Look:** described everywhere as hand-drawn, a storybook or "a picture book that moves" [C]. Soft but
  layered colours, "macaron" mids, rounded lines; one review says "no complex light and shadow" [S].
- **Exploration presentation:** first person along a route in portrait. You tap, the view advances, and an
  event appears *ahead* [C].
- **What the team learned:** after testers called it slow and monotonous, the developers **cut reward and
  content presentation time sharply** [C]. Players criticise **UI clutter** (event and offer icons) and
  small text [C].
- **The look's mechanism** [U, synthesis]:
  - 2–4 tones per form;
  - warm, lifted mid-tones;
  - no crushed blacks and no neon;
  - one focal event per beat;
  - a static or gently moving background;
  - one hero control that never moves.
- **Take:**
  - the *calm* of the frame;
  - few values per form;
  - lifted, warm mids;
  - the "next thing visible ahead" framing;
  - short reward beats.
- **Do not take:** the painted 2D presentation (DEEP DOWN's edge is *real* 3D light), the daylight
  palette, edge icon clutter, small text.

### 2.2 Monument Valley (ustwo, 2014): one screen, flat planes, colour by face direction

- **Sources:** Ken Wong's GDC talk lists low-poly 3D, Escher, Middle Eastern architecture and Japanese
  flower arrangement as influences [C]. Wong (Architizer) says "everything you need to solve a puzzle is
  contained within a screen", and that the palettes came from freeform tweaking [S].
- **Shading:** community reconstructions light each mesh with **flat colours chosen by the face's cardinal
  direction (3 or 6 directions)**, plus a world-space Y gradient and a tinted shadow [S]. "Shading only
  implies contour, not position: a clear light side and dark side" [S, forum].
- **Take:**
  - shading should **explain form, not imitate photography**;
  - 3 values (top, side and dark side) per material;
  - a vertical gradient for atmosphere;
  - everything the player needs is in one frame.

### 2.3 Alto's Adventure / Alto's Odyssey (Snowman, Harry Nesbitt): palette per area, layered gradients

- **Sources:** a minimalist "moving art" goal [S]; a deliberately limited palette in each area, using shades
  of one colour to say how hot or cold it is [S]; the foreground set apart from the background and kept
  the most prominent [S]; foreground and background scroll at different rates for depth [S]; lighting
  shifts with the time of day and the weather [S]; an aim to be "lighthearted a little more tastefully"
  than bright cartoon mobile styles [S].
- **Take:**
  - one dominant hue family per biome;
  - temperature carried by shades of that hue;
  - the foreground is the darkest and clearest layer, and depth fades into a coloured haze;
  - the "time of day" becomes **depth of day** as we descend.

### 2.4 Sky: Children of the Light (thatgamecompany): light as the subject

- **Sources:** the art talk treats "light" as both a visual and a thematic tool for building emotional
  environments [C, GDC Vault listing]. Hazards read instantly (the dark dragon's red beam), and friend or
  foe is clear at a glance [S, Apple]. Shape language follows the theme: a foggy level of blocky, angular
  shapes stands for uncertainty [S]. A 2026 GDC talk covers its dynamic environment lighting [S].
- **Take:**
  - **light is the reward and the wayfinding.** In DEEP DOWN the lantern pool, the glint ahead and the
    glow of the next biome are the wonder.
  - shape language per biome: rounded and organic for Glowroot and Fungal; angular for Crystal, Magma
    and Iron Core; architectural for Halden, the Loom and the Gate.
  - danger colour is reserved: red appears only for danger.

### 2.5 Pet Simulator 99 (BIG Games): clarity at a glance, and its failure mode

- **Sources:** environments are "bright, colorful, and optimized for clarity", but at top rarity the units
  become "particle-trail-emitting screen-fillers", and busy servers strain low-end devices [S, weak source].
- **Take:**
  - big simple shapes;
  - saturated accents on calm grounds;
  - rarity readable as colour (as in Lumi Master's tiers).
- **Do not take:** spectacle that grows with rarity. It is exactly how the latest build became
  illegible. **Higher tiers change the *quality* of the effect (shape, sound, material), not the
  *quantity*.**

### 2.6 Townscaper (Oskar Stålberg) and Dorfromantik (Toukana): the toy look

- **Sources:** Townscaper began as "a tech and artistic demo" for procedural buildings [S]. Stålberg has
  shown custom Unity lighting built on SDFs, 3D textures and depth-map shadows [S, 80.lv]. Dorfromantik's
  artist credits **Impressionist landscape paintings and wooden toys** as the influences [S,
  GameBusiness.jp].
- **What they look like** [U, observation]: rounded or bevelled edges that catch a highlight; soft contact
  occlusion where pieces meet; vertex or flat colour with almost no texture; slightly desaturated mid-tones
  with a few saturated accents.
- **Take:**
  - **bevels plus contact AO plus flat colour** make procedural geometry look hand-made;
  - the "toy" read is the opposite of the latest build's sticker read: material comes from the
    *edges* of objects, not from patterns on them.

### 2.7 Deep Rock Galactic (Ghost Ship): the closest relative for procedural caves

- **Sources:**
  - the low-poly look "was initially born out of a technical limitation in the way we generate our caves",
    and was kept because a small team gets more variety from lower detail [C, Unreal interview];
  - the bright palette was chosen to avoid "the brown-gray-gritty looking shooters" [C, Unwinnable];
  - caves are pitch black, and the flares are "the star of the show" [C, Game Informer];
  - but "the overriding sense of oppressive darkness can wear thin", and shifting lights make it easy to
    get lost [C, Game Informer].
- **Take:**
  - **faceted low-poly rock is a proven look for procedural, destructible caves**, and it is cheap;
  - light is gameplay;
  - avoid the brown-grey trap (our F2);
  - never leave the player in total darkness: keep a biome-coloured fog and fill, and keep guidance
    lights.

### 2.8 Teardown (Tuxedo Labs): why voxels can look good

- **Sources:** the look rests on ray-traced lighting; "the world goes black" without it [C, TechRadar];
  the team chose voxels for their look first and found the design benefits later [S, Shacknews].
- **Take:** small voxels look good only under very good light: soft shadows, bounce and AO. We cannot ray
  trace on a mid-range phone, so a voxel look must lean on **baked vertex AO** (0fps.net's per-vertex
  method: each vertex's occlusion comes from its two side neighbours and its corner neighbour [C]). That
  is the "Lantern Voxel" spike (§5.10). Without it, voxels read as Minecraft (our F8).

### 2.9 Minecraft Legends (Blackbird / Mojang): a storybook built from blocks

- **Source:** the art dev diary covers "design decisions that gave the Overworld its uniquely magical look"
  and details "hand-painted or procedurally generated" [S, minecraft.net extract only].
- **What it looks like** [U, observation]: blocky forms with painterly vertex-colour gradients, soft warm
  light, saturated but controlled accents, and readable silhouettes at strategy distance.
- **Take:** a blocky world can feel like a picture book if colour comes from **gradients across forms**
  (warm at the top, cool in the shadow) instead of tiled textures.

### 2.10 Genshin-lite toon shading

- **Sources (community reconstructions):**
  - core cel shading is an N·L step with a soft transition, a tint lerp and a multiply by the base colour;
  - a second, harder offset step adds a shadow edge;
  - much of the "shadow" is **painted into the texture** for performance and art control;
  - rim light is a view-angle threshold;
  - outlines depend on tweaked or smoothed normals [S].
- **Take, for environments:**
  - a **2–3 step ramp** on a wrapped Lambert;
  - shadow-side tint toward the biome's cool hue;
  - a constant-width rim only on interactables.
- **Skip:** global outlines. They need an extra pass and get noisy on faceted rock, and Lumi Master
  apparently does without heavy black ink (`lumi-master.md` §5.2).

### 2.11 First-person framing, motion comfort and mobile GPUs (technique sources)

- **Viewmodel:**
  - engines draw the held tool with a **separate, fixed-FOV camera**, because the view model "is
    designed and animated with a very specific FOV in mind";
  - the world FOV stays adjustable [S, Bevy; Valve wiki];
  - mismatched FOVs misalign aiming cues [S, Tarkov dev];
  - a hand that is too large or too close "looks shoved in your face" [S, player threads].
- **Comfort:**
  - Xbox Accessibility Guideline 117 recommends avoiding repetitive side-to-side or up-and-down screen
    motion outside core gameplay (head bob, shake), offering an adjustable FOV, and allowing automatic
    camera movement to be turned off [C];
  - Meta's locomotion guidance: real-world speeds to limit optic flow, and vignettes during movement [C];
  - the evidence on vignettes is mixed: velocity-triggered vignettes *increased* sickness for most
    participants in one study [S];
  - `hybrids.md` §4.2 collects more (Dig VR's "static object in view", the grid-crawler tween model).
- **Wide FOV:** rectilinear perspective stretches the frame edges. Panini projection is a post pass that
  keeps vertical and radial lines straight; it costs a little centre sharpness and some UI alignment
  [C, Unreal and Unity docs].
- **Mobile GPUs:**
  - Adreno does **2× MSAA "without any significant additional cost"**, though higher sample counts get
    expensive [C, Qualcomm];
  - Arm calls **bloom the most expensive post effect** and recommends lower resolution and fewer steps
    [S, Arm deck];
  - community advice is 2–3 iterations, a half-resolution blur and merged passes [S];
  - a Mali-G52 device lost about 3 fps to bloom [S];
  - three.js advice: fewer draw calls beat fewer triangles; instance and merge; cap the pixel ratio at
    1.5–2 [S].
- **Juice:**
  - "juice is seasoning; too much becomes noise" [S];
  - "big shake nauseates" [S];
  - hit-stop works around 50–100 ms on heavy hits only; longer reads as lag [S];
  - offer options to reduce shake and flashes [S].
- **Readability audits:**
  - most readability failures are *value* failures, and the squint or grayscale test is the standard
    check [S];
  - a three-read rule: silhouette at icon scale, then colour blocks at squint distance, then detail
    only if it supports the first two [S, heuristic];
  - HUD: progressive disclosure; players give about 80% of their attention to the play area [S,
    unverified figure]; look at screens on an actual phone [S].
- **Colour scripts:** Pixar's colour scripts map a film's emotional arc through colour *and value*, with
  intensity rising and falling with the emotion [C, MoMA, Hyperallergic]. Our equivalent is the biome
  ladder (§4.4).
- **A portrait first-person precedent:** *Wizardry Variants Daphne* runs a fully first-person 3D dungeon
  with one-handed portrait support on phones [C/S]. The format works commercially.

---

## 3. The look in one line, and three candidates

**One line:** a lantern pool of warm light on faceted, hand-made-looking stone, with the next treasure
glinting in the dark ahead and everything else quiet.

Task #81 is preparing three look spikes. This note scores them against the rules in §6.

| Spike | What it is | Strengths | Risks | Verdict |
|---|---|---|---|---|
| **Faceted** ("Lamplit Faceted") | Natural rock as flat-shaded triangles of 0.25–0.6 m from a jittered surface over the dig field; vertex colour from biome ramps; baked vertex AO; bevelled boxes for man-made things; instanced crystals and nuggets | No texels, so nothing can stretch or crawl. Facets catch the lantern in distinct value steps, which reads as storybook papercraft. Proven for procedural caves (DRG). Cheap to mesh and draw. Breaks into chunks naturally | Can look generic "low-poly asset pack" without colour gradients and AO; facet flicker if the vertices move when a neighbour breaks | **Recommended primary** |
| **Lantern Voxel** | 0.25 m bevelled voxels, vertex AO, colour-ramped per voxel, smooth light from the lantern | Strong "voxel" identity; digging is very legible (cubes vanish) | 16× the cell count of 1 m voxels; reads as Minecraft unless the AO and light are excellent (Teardown's lesson); bevels on every voxel cost vertices | **Fallback**; also good for built biomes (Halden, the Loom, the Gate masonry) |
| **Storybook** | Smooth low-poly with painted gradients, a 2-step soft ramp, lifted mids and heavy aerial perspective | Closest to Lumi Master's softness; very calm | Smooth rock at 1 m looks like the first version's crumpled cardboard (F3); weak material read for stone | **Take its *grade*** (lifted warm mids, coloured fog), **not its geometry** |

Recommended blend: **Faceted geometry + Storybook grade + Lantern Voxel bevel language on built objects.**
The rest of this note specifies that blend.

---

## 4. Art direction (procedural, Three.js r186 WebGL2, mid-range Android)

### 4.1 Camera (first person, portrait, tap-only)

| Parameter | Value | Why |
|---|---|---|
| Eye height | **1.60 m** above the floor (1.45 m when crouched under low drifts, never below 1.2 m) | An adult eye line; makes a 1.2 m cart, a 2.4 m timber set and a 0.3 m nugget read at true scale |
| Drift section | 2.4–3.0 m tall, 2.2–3.2 m wide; squeezes down to 1.8 m (crouched) | Leaves 0.8–1.4 m of ceiling in frame: the timber sets frame the shot |
| Lens | **Horizontal FOV locked at 52°** (tunable 48–56). Vertical follows the aspect: 93.1° at 390 × 844, 90.1° at 360 × 740, 94.6° at 412 × 915, 81.9° at 16:9 | Locking the horizontal keeps the face the same width on every phone. A narrower lens (`lumi-master.md` §8.1 suggested a 62–70° vertical) gives only 31–36° across on 19.5:9: a keyhole. A phone's own camera shows about 41–53° across in portrait [U, computed from 24–26 mm-equivalent lenses], so 52° feels familiar |
| Edge distortion | A rectilinear 93° vertical stretches objects at the top and bottom edge **×2.1**, but only **×1.14** inside the central 35% band and ×1.28 inside the central 50% | **Keep tappables inside the central 15–70% of the height.** The worst-stretched bands are exactly where the HUD sits (§4.6). Evaluate an optional *horizontal-axis* cylindrical (Panini-style) correction at 0.3–0.5 strength, merged into the final pass at near-zero extra cost |
| Pitch | Drift: **−8°** (the vanishing point at about 42% from the top; the floor pool and the face fill the middle). Face low or a winze: −18 to −25°. Vista reveal: up to +15° over 1.2 s, then back | The face and the floor pool are the stage. The ceiling is the frame |
| Roll | **0, always** | Roll is the strongest motion-sickness cue; the horizon never tilts |
| Head bob, idle sway, breathing | **None on the world camera.** At most a 0.2 Hz, ±0.15° breathe on the *viewmodel* only, and off in reduced motion | Xbox AG 117 and `hybrids.md` §4.2. The latest build's ±0.6° sway made every edge crawl (CRITIQUE B13) |
| Taps | **The camera does not move on a tap.** The tool, the face and the sound carry the hit | A camera kick on every tap at 4–8 taps per second is a permanent shake |
| Shake | Only on a rare structural event (gate opening, vault collapse, big geode): rotational ≤ 0.4°, ≤ 120 ms, one decaying oscillation, no translation. Off with the Camera Shake setting | "Big shake nauseates"; the latest shook at trauma 0.18–0.22 on *every* break |
| Glide (move to the next face or station) | Rotate first (≤ 0.30 s, ease-out, ≤ 35° yaw), then translate: **≤ 2.5 m/s**, 0.15 s ease-in and 0.2 s ease-out, constant speed between. 0.35 s for a ≤ 1 m step, ≤ 1.4 s for a station. FOV and pitch constant during the move. Never rotate and translate a lot at once | Short, predictable, slow optic flow (Meta). Grid crawlers tween the view while the logic is instant (`hybrids.md` §4.2) |
| Reduced motion | Glides become a 0.25 s cross-fade; no shake, no breathe | Myst's legacy option; Xbox AG 117 |
| Collision and near plane | World near plane 0.08 m; keep the eye ≥ 0.5 m from any rock; walls closer than 0.7 m fade their facets darker instead of clipping | F4: the first version's camera inside the rock |
| Viewmodel | Its own pass and its own camera (**vertical FOV 58°**, depth cleared, drawn last before the HUD). **Tool lower right** (under the thumb), **lantern lower left**. Together ≤ 12% of the screen area, nothing inside the central 50% column. Strike: 90–120 ms down-swing, contact frame, 200–260 ms recovery; idle completely still | Fixed-FOV viewmodels are the norm (Bevy, Valve); the lantern justifies the key light; both are the "static anchor" against motion sickness (`hybrids.md` §4.2.4); the tool is the upgrade showcase (`hybrids.md` P7) |

Portrait frame anatomy at 390 × 844 CSS px (the same proportions at any size):

```
 0% ┌──────────────────────────────┐
    │ HUD top: depth · gold · goal │  ≤ 9%   darkest band (ceiling, timber head)
 9% ├──────────────────────────────┤
    │ ceiling, timber sets, glint  │         frame layer: dark, cool
    │   ahead in the dark (tease)  │
 30%│        ·  vanishing point ·  │ ~42%    fog colour, the next biome's glow
    │   ┌──────────────────────┐   │
    │   │ THE FACE / TARGET    │   │ 35–68%  brightest area: lantern pool, the ore and the
    │   │ (tap zone)           │   │         chest live here
    │   └──────────────────────┘   │
 70%│ floor pool, rails, cart      │         warm mid-values
    │🏮 lantern          pick ⛏    │ 78–94%  viewmodel corners, static
 88%├──────────────────────────────┤
    │ HUD bottom: 1 row of plates  │  ≤ 11%
100%└──────────────────────────────┘
```

**Depth and scale in narrow caves.** Use these cues in this order of strength; a frame needs at least four:

1. **Rhythm of known-size frames.** Timber sets every 2.5–3 m and rail sleepers every 0.6 m converge
   hard toward the vanishing point. This is the cheapest and strongest depth cue in a drift.
2. **Light pools in sequence.** A warm lamp every 8–12 m, separated by dark gaps (a first-version rule).
   The eye counts the pools and knows the distance.
3. **Aerial perspective.** Exponential fog toward the *biome colour* (never black). It starts at 4–6 m
   and is about 85% at 25–35 m. Far planes get cooler, paler and lower in contrast.
4. **Scale referents:** a cart (1.2 m), a crew member's lamp, a crate, a ladder, a gear wheel.
5. **Detail gradient.** Facets are smaller and denser near you (0.25 m) and larger far away (0.6–1 m).
6. **Motes.** ≤ 20 tiny lit dust motes drifting in the lantern beam at 0.03–0.06 m/s. Parallax of
   particles at different depths sells the air volume. This counts as the one ambient group (§4.5).

### 4.2 The lighting model

Linear HDR, tone-mapped (keep the existing hue-preserving operator), **exposure 1.0 ± 0.15 per biome**. If
a biome looks dark, raise the *lights*, never the exposure. The latest build's 1.85–2.6× exposure is the
mechanism behind L2.

| Light | Spec | Notes |
|---|---|---|
| **Key: the lantern** | A point light at the viewmodel lantern (≈ −0.30, −0.45, +0.35 m from the eye). Colour `#ffe6c6` at the core, shifting to amber `#ffb35c` with distance. Windowed inverse-square falloff with a 9 m radius (about 4× dimmer at 6 m than at 1 m, as in v1). The lit side of a mid-albedo face at 1.5 m reaches **display value 0.65–0.75** | Offsetting it low and left keeps it from being a camera flash. Faces gain a lit upper-left and shadowed lower-right, and the shadows of nuggets and timber point up-right, away from the tool. Light upgrades change radius and warmth (the lantern is an upgrade line) |
| **Fill** | Hemispheric: the "sky" term is the biome's cool `open` colour, the ground term about 50% of it with a warm bias. **20–35% of the key's intensity at the face** | Unlit sides go blue-black or biome-coloured, never brown (v1 rule). Darks never drop below display 0.04 in large areas, or the frame turns black outdoors on a phone |
| **Rim / far light** | One per space, from the far end of the drift or chamber: the next biome's accent at low intensity, lighting only edges facing away from the camera (negative-wrap Lambert, i.e. a back light), plus the fog's in-scatter colour near the vanishing point | Separates silhouettes (timber, crew, stalactites) from the fog, and "leaks" the next biome. This is the wonder tease |
| **Practicals** | Hanging lamps, braziers, crew lamps, crystal clusters, magma cracks. The **nearest 4** are evaluated per pixel; all others are **baked into vertex colour** at mesh time | Practicals are the guidance (pools every 8–12 m) and the human warmth (every cold space keeps one warm lamp) |
| **AO** | Per-vertex AO baked by the mesher: 0fps-style corner rules for voxel and bevelled parts; for faceted rock, 6–8 occupancy samples along the normal hemisphere. Strength 0.5–0.7 (crevices to about 0.35 of the lit value). **No SSAO** | View-independent and free at draw time; it gives the "toy" contact darkening (Townscaper, Teardown lessons). SSAO has depth-buffer artifacts and costs too much on mobile |
| **Shadows** | No shadow maps for practicals. The lantern may reuse v1's propagated visibility volume (soft, flame-like shadows) on High, and fall back to AO only on Balanced | With the light near the eye, most lantern shadows hide behind objects anyway. The offset only needs to show contact shadows on the face |
| **Shading ramp** | A wrapped Lambert (wrap 0.3), **quantised softly into 3 steps** (smoothstep width 0.08), times vertex colour, times AO. Specular only on metal, crystal, ice and wet stone: one Blinn lobe, shininess 24–64, value-capped | Lumi Master's "few tones per form" and Monument Valley's "light side and dark side", in real 3D light |
| **Emission** | Only lanterns and lamps, gems and crystals, rune grooves, magma, and the Star Heart. **Emissive pixels ≤ 4% of the frame** in a dig beat, ≤ 10% in a vista | The v1 cyan budget, generalised |
| **Bloom** | Threshold **≥ 1.0 linear** (only true emitters and the flame core pass), strength **0.15–0.25**, 3 mip levels from 1/4 resolution. Battery: off, replaced by baked additive halo cards on the 4 nearest lamps, with a capped size | Arm calls bloom the costliest post effect, and our F7 and L2 were bloom glare |

**Grade:**

- one 32³ LUT pair per biome, blended (keep the existing pipeline);
- saturation **≤ 1.0** (never boosted; lower it on host stone);
- shadows toward the biome cool hue, highlights toward amber;
- vignette 0.15 at the corners, plus the natural falloff;
- dither on.

There is **no chromatic aberration, no lens flare, no film grain and no motion blur**.

### 4.3 Materials (no textures that can stretch, crawl or seam)

The rule: *shape and vertex colour carry the material. No pixel-art or pattern textures go on the world.*
Allowed textures:

- 1D ramps;
- one small tiling value-noise texture, used only for low-frequency tint variation (features ≥ 0.5 m,
  ±4% value);
- the brand's UI.

| Family | Geometry | Colour and shading | Never |
|---|---|---|---|
| **Natural rock** (all host stone) | Faceted surface over the dig field: jittered vertices (deterministic per world position, so neighbours do not jump when a cell breaks), facets of 0.25 m near the drift up to 0.6–1 m on far walls, flat normals. Strata are **real ledges** (0.1–0.3 m steps) where a biome calls for them | Vertex colour from the biome's 5-stop ramp chosen by stratum, height and low-frequency noise. 3-step ramp shading, AO | Texels, patterns, painted cracks |
| **Wet stone** (Drowned Ruins, Glowroot seeps) | Same | One broad, low specular lobe and a darker albedo | Animated normal maps |
| **Ores** (copper, iron, gold and on) | **Instanced nuggets and vein ribbons** embedded in the face: 6–20 cm angular lumps, 3–12 per seam, partly sunk in the rock | Metal response (one crisp highlight), and a tier glint colour on the highlight only. A seam is legible by **silhouette plus highlight** before it is legible by hue | A coloured square |
| **Gems and crystals** | Instanced faceted prisms (6–8 sides, pointed), in clusters of 3–9, at their own scale | Opaque body with a fake inner glow (`emissive × fresnel⁻¹`) ≤ 1.5 HDR, a bright edge highlight, an accent from the biome's gem hue | Alpha-blended glass (sorting, overdraw) |
| **Chests and relics** | Authored bevelled box models (the v1 prop language: chamfers 0.02–0.04 m), brass bands, a lock plate | Wood and brass vertex colour; a soft amber rim when it is the current target | A glowing tile |
| **Timber, rails, carts, crates, ladders, machines, drills** | Bevelled boxes and lathed cylinders (reuse the v1 props and structure builders) | Grain as 2–3 vertex-colour stripes per plank; brass and iron with a value-capped specular | — |
| **Masonry** (Halden Works, Drowned Ruins, the Loom, the Gate) | **Real blocks** (bevelled boxes, the Lantern Voxel language) laid in courses, with gaps 1–2 cm deep | Each block varies ±6% in value, joints in AO | Painted courses |
| **Runes and builders' script** | **Carved grooves** (geometry, 2–4 cm deep) with emission only at the bottom of the groove | Cyan ink `#2fb6cc` / `#8fe3ee`, waking as the lantern approaches (a 0.6 s fade) | Floating flat strokes (F6) |
| **Ice and glass** (Frost Hollow, obsidian, star glass) | Large facets | Fresnel lightening, one highlight, no refraction | Screen-space refraction |
| **Fungal caps and roots** (decor only) | Low-poly caps and stems, root tubes | A soft underglow on gills and tips (≤ 1.2 HDR), never brighter than an ore highlight | Making them tappable creatures |

**Edge and facet budget:** about 8–16 triangles per m² on the face within 3 m, 2–4 per m² on far walls,
≤ 220k visible triangles, ≤ 120 draw calls (instance the nuggets, crystals and props; merge static
geometry per chunk).

### 4.4 Palette rules and the colour script

**Global rules** (each can be measured on a capture):

1. **60 / 30 / 10.**
   - About 60% of the frame is cool, dark stone (display value 0.05–0.25, saturation ≤ 25%).
   - About 30% is warm, lantern-lit mid-values (0.30–0.65).
   - **≤ 10%** is accent (saturation ≥ 60%): ore glints, gems, runes, the next biome's glow.
2. **Host stone saturation ≤ 25%.** Colour lives in the accents and in the light, not in the rock.
3. **Two accent hues per biome, plus amber.** Amber (the lantern and the crew) is constant across all 14
   biomes. It is the brand and the "you are here".
4. **Darks are hued.** Blue-black, green-black or violet-black per biome, never neutral grey and never
   brown (v1).
5. **One value peak per frame.** The tap target is the brightest *large* area. Its mean luminance is
   **≥ 1.6×** the frame mean and ≥ 1.3× any other region of the same size.
6. **Red only for danger** (brand). Magma uses orange and yellow, not red.
7. **Neighbouring biomes alternate value key** (low-key, then high-key), so every gate opens onto a
   visibly different world (Pixar's colour-script logic, applied to the descent).
8. **Never neon.** No hue at full saturation and full value over an area larger than 0.5% of the frame.

**Colour script.** Hues come from `biomeLooks.ts` (accent pairs kept for continuity). Values and keys are
new. "Key" means low-key (mostly dark) or high-key (mostly light).

| # | Biome | Key | Stone / darks | Fog | Accents (glint and rim) | Shape language | The wonder beat |
|---|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | mid | warm umber soil, root brown; darks blue-dusk | `#2a2a33` dusk blue | amber lamps `#ffb35c`, sky shaft `#9fc3e6` | roots, tumbled boulders | the first sky shaft: dusk light falling in |
| 1 | Glowroot Caverns | low | olive-grey, slate; darks green-black | `#142226` | glowroot `#9be7a8`, teal `#5fe0c0` | rounded, organic, hanging root curtains | a cavern of glowing root threads |
| 2 | Crystal Grotto | low, cyan rim | neutral slate; darks blue-black | `#1e2a3a` | cyan `#2fb6cc` / `#8fe3ee`, violet gems | angular, pointed clusters | the first big crystal cathedral (r1/f17 framing) |
| 3 | Halden Works | mid, warm | soot iron, timber, brick; darks warm-black | `#231a12` | brass `#e2b673`, steam teal `#6fd6c4` | built: beams, gears, ladders | the abandoned works lit by its own furnace |
| 4 | Fungal Deep | low | plum-grey; darks violet-black | `#1a0f22` | magenta `#c58cff`, lime `#a8ff6a` (decor glow only) | soft domes, caps on stems | a hall of caps, gills glowing from below |
| 5 | Drowned Ruins | mid-low, wet | blue-green masonry; darks blue | `#0a2236` | aquamarine `#5fb7ff`, braziers `#ff9a48` | stepped stone, arches, water | a sunken city reflected in still water (one planar reflection, High only) |
| 6 | Magma Veins | high contrast | basalt near-black; darks red-brown | `#2a140c` | lava `#ff6a2a` → `#ffc04a`, an **underlight** from below | sharp, cracked columns | a lava river far below a bridge |
| 7 | Fossil Halls | **high** | bone ivory, ochre; darks warm umber | `#221e1a` | resin `#ff9a2a`, ghost light `#c0b4ff` | ribs, arcs, vertebrae | a leviathan's ribcage arching over the drift |
| 8 | Frost Hollow | **high**, cold | pale blue-white ice; darks steel blue | `#1a2a3a` | glacier `#7fd8ff`, aurora `#9dffd8` | big flat facets, icicles | light through an ice ceiling |
| 9 | the Loom | mid | indigo ashlar; darks violet | `#1e1c18` | white-gold `#fff4d0`, thread violet `#b9a2ff` | woven lines, looms, shelves | the archive of light threads |
| 10 | Iron Core | low | gunmetal, rust; darks blue-steel | `#141820` | steel `#8fb8ff`, white-hot `#ff7a2a` | heavy plates, giant gears | an escapement turning in the dark |
| 11 | Star Heart | **high**, inverted | near-black star glass with gold beds | `#3a2a10` | sun `#fff1c2`, nova `#ff8ac8` | floating rocks, radial | the only place brighter than the lantern |
| 12 | Void Sea | **lowest** | indigo; darks near-black violet | `#0c0820` | violet `#7a6cff`, a faint star `#d8e0ff` horizon | almost nothing: islands | maximum calm, minimum detail |
| 13 | the Gate | low | rune stone, bedrock | `#1a1226` | rune cyan against lantern amber, gold `#e2b673` | the Lintel: a vast arch | the brand climax: lantern meets lintel |

### 4.5 The FX budget (a hard cap, enforced by a director, tested in CI)

A **moving group** is anything the eye tracks independently: the tool swing, one debris burst, one loot
flight, a counter roll, a working crew member, a cart, the mote field, a UI pulse.

| Budget | Dig beat (normal) | Ceremony (one at a time) |
|---|---|---|
| Moving groups in the foreground and HUD | **≤ 3** (tool, debris burst, counter) | ≤ 3 (the ceremony owns them) |
| Ambient groups in the background (crew at work, cart, motes, a lamp flicker) | **≤ 2** | 0–1 (others freeze or fade) |
| Live particles | **≤ 40 per burst, ≤ 80 total** (Balanced); High ×1.5, Battery ×0.5 | ≤ 120 |
| Particle screen area | **≤ 6%** of the frame; any one particle ≤ 32 px | ≤ 12% |
| Particle life | 0.25–0.6 s | ≤ 1.2 s |
| Camera motion from FX | **0** | ≤ one 0.4° / 120 ms shake (rare structural events only) |
| Hit-stop | 0 on taps and normal breaks | 50–70 ms, only for gate, vault and geode breaks |
| Flashes | Local only: the struck facet brightens +0.4 for ≤ 80 ms | One 0.12 full-frame lift ≤ 150 ms (gate opening only) |
| Post effects (shock ring, iris, chroma, rays, bloom pulse) | **none** | none. Use light instead: a gate's seam brightening, then light spilling through |
| Floating numbers | **≤ 1 on screen**: one accumulating number per target (optional; off by default) | the ceremony's own |
| Ceremony length | — | **≤ 1.2 s**, skippable by a tap; a biome reveal ≤ 3 s |
| UI loops (pulses, breathing) | **≤ 1** at a time (the objective's "ready" state) | 0 |

Dust and debris are **lit by the scene** (one lantern term per particle), dark-ish stone chips and a
low dust puff (≤ 0.5 m, alpha ≤ 0.35, darker than the face). They are not cream discs (L11). Sparks come
only from metal on metal and ore.

**How upgrades get to absurdity without noise.** Escalate by *quality*, never by *quantity*:

- the tool's silhouette and material change per tier (steel, brass, rune-lit, star metal);
- breaks remove **bigger chunks** (one face, then a whole wall, then a chamber collapsing in 0.6 s as
  large chunks);
- the sound gets deeper;
- the counter rolls faster;
- the depth numbers get absurd.

The particle cap does not move. A late-game break that clears a cavern is *one* big, clean event
(PS99's failure mode, inverted).

**Wonder without FX.** Every reveal is a **window composition** (r1/f17):

- a dark, cool foreground frame covering 30–40% of the screen;
- a lit midground;
- a glowing far plane in the next biome's accent;
- the camera's only slow pitch-up.

Light does the work: a seam of light widens through the cracked gate, then the space fills with the
biome's rim light over 1.5 s.

### 4.6 UI calmness rules ("Lamplight on the Lintel", applied to first person)

1. **The 3D view gets ≥ 80% of the screen unobstructed during play.** HUD bands: top ≤ 9% (depth, gold,
   one objective line), bottom ≤ 11% (one row of ≤ 4 octagon plates). These are the most-distorted
   bands of the lens anyway (§4.1).
2. **Opaque plates, no glass.** Slate-900 at 0.94, a brass rim, Lintel numerals. "No rounded rectangles,
   no pills, no glass, no backdrop blur" (the v1 brand), which reverses the latest build's "glass HUD".
3. **≤ 5 numbers visible** in play (depth, gold, rate, objective progress, and at most one contextual
   number).
4. **One objective, always visible**, as one line on the lintel. **One hint at a time**, ≤ 8 words, shown
   in the world: a calm, static amber rim on the target object. No 450 px pulsing ring, and no pointing
   hand after the first tap.
5. **One notification badge at a time.** Never a ribbon, a dot, a pulse and a progress ring on the same
   card (peek-2).
6. **Still when idle.** UI animates only on state change: enter (8 px rise plus fade, 160–240 ms), exit
   (fade, 140 ms). One loop at most. Reduced motion: fades ≤ 150 ms (v1 `motion.ts`).
7. **Text:** body ≥ 15 sp, labels ≥ 13 sp, never under 12. Contrast ≥ 4.5:1 on an *opaque* plate, never
   over the 3D scene directly.
8. **Sheets cover the bottom ≤ 55%** and dim the world 30%. The world behind keeps playing *without*
   effects.
9. **Two registers, never mixed** (brand): expedition kit (amber and brass) for what you own and do,
   builders' script (cyan) only for discoveries and lore. Violet means unknown or locked; red means
   danger only.
10. **The HUD never moves with the camera**, never shakes and never flashes, except one 160 ms value pop
    on a counter.

### 4.7 Performance envelope (Balanced, mid-range: Adreno 610–642, Mali-G57–G68)

- **Composite:** device pixel ratio capped at 2.0 (Battery 1.5). The scene renders at a dynamic 0.70–0.85
  of that (reuse `QualityGovernor` and the sub-viewport upsample).
- **Anti-aliasing:** MSAA 2× (a WebGL2 multisampled renderbuffer resolved by blit) where the device profile
  shows it is cheap (Adreno resolves tiles in GMEM), otherwise FXAA at scene resolution before the upsample
  (existing).
- **Post:** one combined resolve pass (tone map + LUT + vignette + dither + optional portrait-Panini) and
  3-level bloom from 1/4 resolution, or no bloom on Battery.
- **Fog in the material shader**, not a volumetric pass. ≤ 2 additive light-shaft cones per space (cheap
  meshes).
- **Lighting:** the lantern plus 4 dynamic practicals per pixel. Everything else is baked in vertex colour.
  No shadow maps on Balanced.
- **Targets:** 60 fps in glides, 45 fps or better in dig beats with a busy crew. **Cut effects before
  frames.**

---

## 5. Specific guidance for first-person tap play

### 5.1 The tap target must always be readable

The tap target is the one place the frame is about:

- it sits inside the tap zone (35–68% of the height, 15–85% of the width);
- it is the brightest large area;
- it carries the only rim highlight.

Neighbouring tappables (a side seam, a chest in a niche) are **dimmer by at least 20%** and get their
rim only when they become the current suggestion.

### 5.2 Shot types (compose for these three)

| Shot | Use | Composition |
|---|---|---|
| **Face** | 90% of play: mining the face ahead | The face at 1.2–1.8 m fills the central band; the floor pool below; timber sets frame the top; the vanishing point at about 42% from the top with a glint of the next find beyond (the "next thing visible ahead" rule from Lumi Master) |
| **Window** | Breakthroughs, gates, biome reveals | A dark, cool frame (the arch, tunnel mouth or cracked gate) covering 30–40% of the screen; a lit midground; a glowing far plane in the next biome's accent; the only slow pitch-up (≤ 15°) |
| **Shaft** | Descending: hoist cage, ladder, winze | Looking down 25–40° into a lit shaft: the rope or rails converge to a warm light far below; the deep biome's glow at the bottom (the mystery thread) |

### 5.3 The viewmodel is a showcase, not a puppet

- The tool tiers change the silhouette, not just a colour swap.
- The lantern tiers change the flame size, the light radius and the warmth.
- At rest both are perfectly still.
- On a strike, the motion is crisp and short (≤ 380 ms in total) with a contact frame that matches the
  sound to within 1 frame.
- Hands, if shown, are gloved and simple (bevelled boxes, as in v1's explorer). They are never larger
  than the tool.

### 5.4 Glides between tap targets (comfort recap)

- Rotate, then translate.
- Speed ≤ 2.5 m/s.
- Constant FOV, pitch nearly constant.
- No roll, no bob.
- The viewmodel stays fixed during the glide (the static anchor).
- Glides last 0.35–1.4 s; reduced motion turns them into a 0.25 s cross-fade.

There is **no vignette during movement by default**: the evidence is mixed, and a moving dark ring is
itself "a thing that moves". Offer it as an accessibility option.

---

## 6. The ten rules that would have prevented "horrible, glitchy, illegible"

Each rule has an automatic check on the capture rig (`tools/look-capture.mjs` style, 390 × 844 at DPR 2,
Balanced), plus a human check on a real phone at arm's length.

| # | Rule | Would have caught | Automatic check |
|---|---|---|---|
| 1 | **No texels on the world.** Shape and vertex colour carry the material. No pixel-art, pattern or painted textures on terrain, so nothing can stretch, crawl or seam | F1, F8, L3, L4 | Lint: terrain materials take no `sampler2D`/`sampler2DArray` except the 1D ramps and the low-frequency noise. Per-capture *streak detector*: horizontal-run autocorrelation of luminance edges over 40 px ≤ a threshold |
| 2 | **Valuables are objects, not paint.** Ore, gems, chests and relics are 3D geometry with light response, embedded in rock | L1, L2 | Test: no tappable's footprint is a single planar quad; each valuable's screen silhouette has ≥ 6 edges |
| 3 | **One value peak per frame**, and it is the tap target | F2, L8, L9 | Capture metric: the target's mean luminance ≥ 1.6× the frame mean and ≥ 1.3× any other window of the same size; a grayscale thumbnail at 25% scale passes a human "where do I tap?" check in under 1 s |
| 4 | **Saturation budget:** ≤ 10% of pixels have saturation ≥ 0.6, host stone ≤ 0.25, nothing neon larger than 0.5% | L1, L2 | Histogram on every biome capture |
| 5 | **Light, don't expose.** Exposure 1.0 ± 0.15, saturation never boosted, bloom threshold ≥ 1.0, strength ≤ 0.25, emissive pixels ≤ 4% in a dig beat | L2, F7 | Config lint on `biomeLooks`; capture metric: clipped pixels (any channel ≥ 0.98) ≤ 1.5% |
| 6 | **A motion budget, enforced.** ≤ 3 foreground moving groups, ≤ 2 ambient, ≤ 80 particles covering ≤ 6% of the screen; **no camera motion on taps; no sway, no bob, no roll** | L9, L11 | The FX director counts live groups and asserts; a camera test asserts identical view matrices before and after 100 taps |
| 7 | **One ceremony at a time, ≤ 1.2 s, and no post-process theatrics** (no full-frame flashes except the gate's 0.12 for 150 ms; no iris, shock, chroma or rays) | L9, L12 | Unit test on the ceremony director; a lint forbidding those post parameters |
| 8 | **The world gets ≥ 80% of the screen.** HUD ≤ 9% top and ≤ 11% bottom, opaque plates, ≤ 5 numbers, one objective line, one hint, one badge | L10, peek-2 | DOM measurement of HUD rectangles in e2e; a count of visible numeric nodes |
| 9 | **Geometry hygiene:** no coplanar overlaps (z-fighting), no T-junction cracks, no flat billboards visible as cards, no sprite inside solid rock, no near-plane slicing, stable vertices when a neighbour breaks | F4, L5, L6, L7 | Debug captures: (a) render the faces' IDs and look for two IDs flickering on the same pixel across 2 frames with ±1e-4 depth jitter; (b) occlusion-test all sprites against the depth buffer; (c) after a break, the pixel difference outside the broken cell's footprint ≤ 2% (from CRITIQUE B5) |
| 10 | **Temporal stability:** a still camera means still pixels; no sub-2-pixel high-frequency detail; AA always on | the latest build's sway crawl, F1 shimmer | Two idle frames 1/60 s apart: mean ΔL in static regions ≤ 0.01 (from CRITIQUE B13); a frequency check that no world detail lands under 2 scene pixels at 1.5 m |

A meta-rule above the ten: **the director's phone is the reference display.** Every look round ends with
a side-loaded APK and three screenshots taken *on the phone*, held at arm's length, read in daylight. A
look round does not pass on desktop captures alone.

---

## 7. What to reuse, what to retire (look only)

| Keep (from v1 at `9eb4166`) | Keep (from the latest) | Retire |
|---|---|---|
| The lantern light model (falloff, warm-to-amber shift, floor ring, propagated soft shadows) in `src/render/lighting.ts` | `QualityGovernor` and the fine scale controller | Pixel-art terrain painters and sharp bilinear sampling (`materials/*` painters, `terrainMaterial.ts` `sharpUv`) |
| Albedo ramps and the atmosphere presets (`materials/palette.ts`, `ATMOSPHERES`) as *vertex colour* ramps | The two-resolution render, FXAA before the upsample, the LUT pair blend, dither | The `look.ts` section painting (patterns on a cut plane) |
| Props and structure builders (`render/props/*`, `render/structures/*`: stairs, bridge, timber, columns) | The biome accent pairs and the `BiomeLook` interpolation | The `VistaBackdrop` billboard layers (replace them with real geometry seen through window compositions) |
| The brand UI tokens, the octagon plate, the Lintel font, the emblem; the v1 `motion.ts` durations | The objective-line concept; the return panel's layout | Glass HUD plates; post-processing `iris`, `shock` and `bloomPulse`; chroma; rays; trauma shake per break; the camera "life" sway |
| The cyan budget idea, generalised (§4.2 emission ≤ 4%) | The capture-rig habit, re-aimed at the §6 metrics | The juice table's particle counts and per-event rings (`designs/motion.md` §9.4) |

The full reuse map belongs to the reuse research. This table covers only what affects the look.

---

## 8. Open questions (for the spikes and the design panel)

1. **Dig-field resolution for the faceted face.** 0.5 m cells give a visible break every tap or two; 1 m
   cells look coarse at 1.5 m in first person. Decide in the spike, measuring triangles and remesh time
   on the reference phone.
2. **Panini-style correction.** Does a horizontal-axis cylindrical correction at 0.3–0.5 make the 93°
   vertical lens feel better, or is it imperceptible at phone size? A/B test it in the spike.
3. **The lantern side.** Lantern on the left and tool on the right suits right-handed play. Should there
   be a left-handed mirror setting? It is cheap: mirror the viewmodel and the light offset.
4. **Lumi Master frames.** Nobody on this research has seen them (DNS blocks). Before locking the grade, a
   human should spend 20 minutes on the trailers listed in `lumi-master.md` §5.9 and check three things:
   tone steps per form, fog or no fog, and the HUD area.
5. **Crew on screen.** Crew members are human figures from the bevelled-box prop language. How many can be
   visible while staying within the "≤ 2 ambient groups" budget? Proposal: one crew line visible at the
   side of the drift, the rest represented by their machines' sound and a cart passing.

---

## 9. Sources

Our builds (inspected directly):

- `artifacts/final-pass/first-five-w2/`, `artifacts/final-pass/w3/`, `artifacts/world-w2/r1/`,
  `artifacts/world-w2/r6/`, `artifacts/tour/`.
- `artifacts/idle/w1/`, `artifacts/idle/w2/look/`, and
  `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/peek-2.png`.
- `ART_DIRECTION.md` at `9eb4166`.
- `docs/idle/LOOK.md`, `docs/idle/CRITIQUE.md`, `docs/idle/designs/motion.md`.
- `src/idle/config/biomeLooks.ts`, `src/render/descent/DescentCamera.ts`, `src/render/terrainMaterial.ts`
  at `9eb4166`.
- Companion notes: `docs/hybrid/research/lumi-master.md`, `docs/hybrid/research/hybrids.md`.

External (search-engine extracts; WebFetch was blocked by DNS):

- **Monument Valley:**
  - GDC Vault "The Art of Monument Valley": https://gdcvault.com/play/1022476/The-Art-of-Monument
  - Ken Wong (Architizer): https://architizer.com/blog/?p=2914
  - MV-style shader: https://visionvortex.artstation.com/blog/zDar/monument-valley-shader-for-unity-3d
  - lighting thread: https://blenderartists.org/t/monument-valley-lighting/647963
- **Alto:**
  - https://en.wikipedia.org/wiki/Alto%27s_Adventure
  - https://blogs.ulster.ac.uk/cormacmccann/?p=794
  - https://www.gamedeveloper.com/business/road-to-the-igf-team-alto-s-i-alto-s-odyssey-i-
  - https://mobilesyrup.com/2015/02/19/altos-adventure-is-an-endless-runner-for-ios-and-one-of-the-years-best-games/
- **Sky:**
  - https://gdcvault.com/play/1026812/Art-of-Sky-Children-of
  - https://apps.apple.com/us/story/id1465180456
  - https://gamedev.net/news/994-dynamic-environment-lighting-in-sky-children-of-the-light-gdcrewind-gdc2026/
- **Townscaper:**
  - https://80.lv/articles/a-custom-lighting-solution-set-up-in-unity/
  - https://xraispotlight.substack.com/p/how-to-make-procedural-generation
- **Dorfromantik:**
  - https://www.gamebusiness.jp/article/2022/05/18/20112.html
  - https://www.gamedeveloper.com/disciplines/sparking-joy-through-tile-placement-in-idyllic-village-builder-i-dorfromantik-i-
- **Minecraft Legends:** https://www.minecraft.net/en-us/article/minecraft-legends-dev-diary-art-and-visuals
- **Teardown:**
  - https://www.techradar.com/gaming/consoles-pc/ray-tracing-is-so-crucial-to-teardown-that-the-world-goes-black-if-you-turn-it-off
  - https://www.shacknews.com/article/135274/tuxedo-labs-teardown-interview
  - https://softwareengineeringdaily.com/2025/01/02/teardown-and-voxel-based-rendering-with-dennis-gustafsson/
- **Deep Rock Galactic:**
  - https://www.unrealengine.com/developer-interviews/guns-gold-and-glory-in-the-caverns-of-deep-rock-galactic
  - https://unwinnable.com/2018/08/28/deep-rock-galactic/
  - https://www.gameinformer.com/review/deep-rock-galactic/deep-rock-galactic-review-off-to-work-we-go
- **Pet Simulator 99** (weak source): https://earnaldo.com/blog/pet-simulator-99-vs-adopt-me
- **Toon shading:**
  - https://bjayers.artstation.com/blog/category/5
  - https://github.com/Delt06/urp-toon-shader/wiki/Forest-Demo-Breakdown
  - https://github.com/NoiRC256/URPSimpleGenshinShaders
  - https://godotshaders.com/shader/toon-shader-inspired-of-genshin-impact/
- **Voxel AO:**
  - https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/
  - https://yunasawa.itch.io/ynl-vozel/devlog/1032006/devlog-4-apply-ambient-occlusion
- **Viewmodel:**
  - https://developer.valvesoftware.com/wiki/Viewmodel
  - https://bevyengine.org/examples/camera/first-person-view-model
  - https://discussions.unity.com/t/first-person-camera-fov-for-weapons/672347
- **Comfort:**
  - Xbox Accessibility Guideline 117: https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/117
  - https://madelinemiller.dev/blog/motion-sickness-accessibility/
  - https://developers.meta.com/horizon/design/locomotion-comfort-usability/
  - vignetting study: https://paper.nweon.com/?p=2601
- **Wide-FOV projection:**
  - https://dev.epicgames.com/documentation/unreal-engine/panini-projection-in-unreal-engine
  - https://docs.unity3d.com/Manual/urp/Post-Processing-Panini-Projection.html
- **Mobile GPU:**
  - https://developer.qualcomm.com/software/snapdragon-profiler/app-notes/anti-aliasing-with-adreno
  - https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/post-processing-effects-on-mobile-optimization-and-alternatives
  - https://www.slideshare.net/slideshow/unity-mobile-game-performance-profiling-using-arm-mobile-studio/249692787
  - https://discussions.unity.com/t/unity-6-mobile-graphics-optimization-tips-and-tricks/1593293
- **three.js performance:**
  - https://www.hontran.dev/blog/three-js-performance-optimization
  - https://digitalstrategyforce.com/journal/how-do-you-optimize-threejs-performance-for-mobile-devices/
- **Readability and HUD:**
  - https://bugnet.io/blog/readable-game-art-why-clarity-beats-detail
  - https://bugnet.io/blog/how-to-design-a-readable-hud
  - https://bootcamp.uxdesign.cc/7-obvious-beginner-mistakes-with-your-games-hud-from-a-ui-ux-art-director-d852e255184a
  - https://respawn.outlookindia.com/gaming/gaming-guides/ui-and-ux-in-games-building-menus-huds-and-feedback-systems
- **Juice:**
  - https://www.wayline.io/learn/game-feel/1
  - https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/
- **Colour scripts:**
  - https://hyperallergic.com/610771/the-art-of-pixar-chronicle-books/
  - https://www.moma.org/audio/playlist/192/2581
- **Portrait first-person precedent:**
  - https://automaton-media.com/en/news/wizardry-variants-daphne-is-finally-out-on-steam-with-cross-platform-and-controller-support/
  - https://sports.khan.co.kr/en/article/202512261848007
- **Lumi Master:** see `lumi-master.md` §10.
