# DEEP DOWN — Project Status

_Milestone M1 (vertical slice "The Lantern Hollow"): in progress — integration and validation._

## Summary

| System | State | Evidence |
|---|---|---|
| Voxel world, chunks, mesher (AO) | ✅ Done | unit tests (geometry, winding, AO, chunk borders) |
| Colored flood-fill light + lantern visibility | ✅ Done | property tests: incremental and removal updates equal a full recompute |
| Procedural textures (34 tiles), terrain shader, post FX | ✅ Done | VisualLab + in-game screenshots |
| World generation (camp → tunnel → Hollow → shrine → gate → rift) | ✅ Done | determinism, reachability, walk-the-route simulation, material supply tests |
| Player controller, camera, desktop input | ✅ Done | physics tests (auto-step, walls, falls, rescue) |
| Mining (swing timing, tiers, cracks, debris, drops) | ✅ Done | play-tests in Chromium; e2e pending UI |
| Props (14 kinds) + explorer character | ✅ Built, in review | 36 module tests, VisualLab renders |
| Audio (46 synthesized sounds, ambience, music) | ✅ Built, in review | 27 tests + offline render analysis in Chromium |
| Gameplay rules + save system | ✅ Built, in review | 178 tests (inventory, crafting, objectives, saves, corruption recovery) |
| UI (menus, HUD, touch controls, screens) | 🔨 Being built | — |
| Android shell | ✅ APK builds and verifies | not run on a device (no emulator available) |
| VisualLab | ✅ Done | 8 views, screenshots in TEST_REPORT.md |

See DEVELOPMENT_ROADMAP.md for the milestone plan and KNOWN_ISSUES.md for limitations.
