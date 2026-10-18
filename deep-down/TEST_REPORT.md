# DEEP DOWN — Test Report

Environment: Linux container, 4 CPUs, Node 22.22, headless Chromium 141 (Playwright 1.56.1) with WebGL 2
through SwiftShader (software rendering). No physical Android device or emulator was available.

_Draft — final numbers are filled in at the end of the milestone._

## Automated tests

| Suite | What it proves |
|---|---|
| `tests/unit/world.test.ts` | voxel storage, dirty-chunk marking, mesher face culling / winding / AO, DDA raycast, light propagation incl. **property tests**: incremental mining updates, emitter removal and lamp moves equal a full recompute; changed-box covers every modified texel; openness; lantern visibility |
| `tests/unit/worldgen.test.ts` | determinism, intact bedrock shell, spawn in camp, every critical landmark reachable on foot, shrine & gate sealed until mined then reachable, ≥30 reachable copper veins, every prop light is a real emitter |
| `tests/unit/routeWalk.test.ts` | the real player controller walks camp → tunnel → ledge → both stair flights → hall floor **and back** with forward input only; reaches the seal, crosses the bridge, finds the shrine door |
| `tests/unit/player.test.ts` | walking, auto-step on 1-block ledges, blocked by 2-block walls, landing speed, no tunnelling at max fall speed, world bounds, rescue when embedded / NaN; compass bearing and route guidance |
| `tests/unit/session.test.ts` | save-delta round trip, corrupt delta entries ignored, lamps settle and move their light when the floor is mined, prop removal removes its light, reset restores props |
| `tests/unit/voxModel.test.ts` | procedural model winding (boxes, crystals, rotated parts, mini blocks) |
| `tests/unit/props*.test.ts`, `character*.test.ts` | every prop kind and variant builds valid geometry within size ranges; picking; animation without NaN; explorer height, joints, swing, lantern placement, no animation pops |
| `tests/unit/audio*.test.ts` | music theory, voice limiter, scheduler (fake clock), event→sound mapping, generators, safe no-op without Web Audio |
| `tests/unit/gameplay-*.test.ts`, `save-*.test.ts` | inventory stacking/capacity/key items, crafting (missing/owned/not-at-camp/consumption order), lantern edges, fall damage, mining tiers & decay, objectives chain incl. skip-forward, two-slot saves, checksum corruption & interrupted-save recovery, migrations, quota errors, settings sanitizing, world delta |
| `tests/e2e/slice.spec.ts` | the brief's 9-step success path on a 915×412 touch viewport (pending UI integration) |

## Visual inspection log (real WebGL screenshots, inspected and iterated)

| Iteration | Found | Fixed |
|---|---|---|
| 1 | Lantern too saturated; reveal view blocked by a pillar; chamber unreadably dark | warmer-neutral lantern; pillars moved off the sightline; openness ambient + lighter fog |
| 2 | Colored light turned red with distance (per-channel subtractive decay) | multiplicative, hue-preserving decay |
| 3 | Bridge/balcony tiles "glow everywhere"; glyph frame repeated one rune | sparse inlays; per-position texture variants (3 runes, carved brick) |
| 4 | Tunnel ended over a void (Hollow carve removed its floor) | tunnels lay rock shelves across open space; reachability test added |
| 5 | Crystal formations read as glowing cube piles | slender voxel cores + large faceted shard props |
| 6 | Distant lamps invisible through fog | additive halo sprites (1 draw call) |
| 7 | Camp: giant uniform orange deck, red hearth "rug" | smaller decks, soil floor, sooty ember-cracked fire pit, weathered wood, more props |
| 8 | Waterfall rendered nothing (additive blend × alpha 0); blinded the camera up close | alpha fix; near-camera fade |
| 9 | Motes/halos as big blurry discs near the lens | near-camera fades, smaller sizes |
| 10 | Menu framing dominated by the ledge floor | cinematic drift past the rim over the hall |

## Performance (headless Chromium, SwiftShader, 915×412, Balanced)

SwiftShader rasterizes on the CPU, so FPS is not a phone number. CPU-side costs are meaningful.

| Location | JS frame ms (avg / p95) | Draw calls | Triangles |
|---|---|---|---|
| Camp | 1.51 / 2.5 | 62 | 21k |
| Tunnel | 1.69 / 2.2 | 176 | 83k |
| Ledge vista | 1.73 / 2.5 | 187 | 95k |
| Hollow floor | 1.59 / 2.2 | 135 | 54k |
| Bridge | 1.30 / 1.9 | 59 | 26k |

| Operation | Cost |
|---|---|
| Zone generation (worker) | ~330 ms |
| Full light + openness (worker) | ~350 ms |
| Initial meshing (main thread, time-sliced) | ~140 ms |
| Mining a block: light update / remesh | 0.06–0.1 ms / 0.2–0.5 ms avg (max 0.6 / 2.4 ms) |
| Mining a crystal (light removal) | 0.3 ms (was 17.4 ms before the removal flood fill) |
| Save: build / write / read | 7 ms / 0.2 ms / 0.3 ms |
| Memory | JS heap 52 MB; GPU geometry 3.7 MB; light volume 12.5 MB; render targets 3.3 MB |
| Bundle | ~220 KB gzipped total (three.js included) |
| Dynamic lights | 1 (lantern); 61 static emitter voxels |

## Audio (offline renders in Chromium, 48 kHz)

Spectral centroids separate the materials clearly: stone hit 2.0 kHz, metal 3.0 kHz, crystal 5.3 kHz.
All 46 sounds peak between 0.1 and 0.9 (no clipping). Not listened to by a human.

## Android

`android/build-apk.sh` produces `deep-down-debug.apk`: aapt2 link, javac (release 8), dx, zipalign,
apksigner — signature verified, badging: package `com.korroai.deepdown`, minSdk 23, targetSdk 34,
label "DEEP DOWN", launcher icons. Not installed on a device.
