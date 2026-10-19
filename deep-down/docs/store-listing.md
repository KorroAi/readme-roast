# DEEP DOWN: store listing (Google Play)

Draft for the director. Rules for this copy: it describes only what the uploaded build contains,
it promises nothing that is not in it ("coming soon", "updates", "more levels" are out), and it
never names a feature a later wave may still cut. Re-read it against the release-gate build
(plan §13) before submitting.

## Title

**Pending the trademark check** (`docs/release-checklist.md` §2). Candidate:
**DEEP DOWN: Lantern Hollow** (25 / 30 characters). Fallback if "Deep Down" is not clear to use:
the subtitle lockup alone, **Lantern Hollow** (14 / 30).

## Short description (80 characters max)

> Take a lantern into a buried cave. Mine, craft and find the way back to camp.

(77 characters.)

## Full description (4000 characters max)

Only lines true of the current build. Lines marked ⟨gate⟩ describe work planned for later waves:
keep each one only if the release-gate build has it, word for word as it plays.

> Something below the mountain is still lit.
>
> DEEP DOWN is a quiet mining and exploration game in a hand-shaped voxel cave. Your lantern is
> the only light you carry. Every expedition starts at a small camp underground and goes as deep
> as your fuel, your pack and your nerve allow.
>
> MINE WHAT YOU NEED
> Hold to swing your pick. Stone cracks, copper glints in the walls, glimmer crystals light up
> the dark around them. Harder rock asks for a better pick.
>
> CRAFT AT CAMP
> Bring your finds back, bank them, and build better gear at the workbench: a copper pickaxe, a
> bigger pack, a brighter lantern that burns longer.
>
> KNOW WHEN TO TURN BACK
> The lantern burns while you explore. The compass always shows the way home. Go too far and the
> cold sets in; black out and your pack stays where you fell, waiting to be recovered.
>
> FIND WHAT WAS LEFT BEHIND
> A great hall with a waterfall of light, a stair cut into the rock, a sealed gate, a shrine
> behind a crumbling wall, an inscription no one has read in a very long time.
>
> ⟨gate⟩ [the upgrade tree, camp stations, the rope ride down to the Rift, the runes and the ending:
> one short paragraph each, only for what ships]
>
> MADE FOR PHONES
> Landscape touch controls with a floating joystick, a big Mine button with aim assist, short
> haptics, adjustable sensitivity, left-handed layout, large text and high contrast options.
> Plays offline: no account, no ads, no in-app purchases, no data collected.

Check before submitting: the turn-back/cold/cache paragraph is W1 (loop-core) work; keep it only if
the shipped build behaves exactly so (`tests/e2e/world.spec.ts` "death leaves a cache").

## Graphics (from the release gate, `tools/store-assets.mjs`)

| asset | spec | source |
|---|---|---|
| App icon | 512 × 512 PNG, opaque, full-bleed, < 1 MB | `android/build/play-icon-512.png` (written by `./android/build-apk.sh`, from `android/make-icon.mjs`) |
| Feature graphic | 1024 × 500, JPEG or 24-bit PNG, no alpha | release gate |
| Phone screenshots | 6–8, 1920 × 1080 landscape (aspect ≤ 2:1), real gameplay | release gate, idle machine |

No screenshot shows a developer label, the Visual Lab or a debug overlay.

## Categorisation

- App or game: **Game**. Category: **Adventure**. Tags: Exploration, Crafting, Mining, Offline.
- Free, no in-app purchases, no ads.
- Contact email: the director's support address (pending, §5 of the checklist). Website: none,
  or the GitHub Pages site hosting the privacy statement.
- Privacy policy URL: the hosted `privacy.html` (checklist §6).

## Content rating: IARC questionnaire

Expected result: **PEGI 3 / ESRB Everyone / USK 0**.

| question | answer | why |
|---|---|---|
| Category | Game | |
| Violence (realistic, fantasy, blood, gore) | No | no creatures, no combat; the explorer can be hurt by falls and the cold and black out, with no blood or injury detail |
| Fear / horror | No | dark caves, no shocks, no horror imagery |
| Sexuality, nudity | No | |
| Language | No | |
| Controlled substances (drugs, alcohol, tobacco) | No | |
| Gambling, simulated gambling, loot boxes | No | drops are fixed by block type |
| User-generated content, chat, user interaction | No | single player, offline |
| Shares the user's location | No | |
| Digital purchases | No | |
| Unrestricted internet access | No | the app has no INTERNET permission |

## Data safety form

| question | answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | Not applicable (none collected) |
| Do you provide a way for users to request that their data is deleted? | Not applicable (none collected; uninstalling deletes the local save) |

Background for the reviewer (matches `privacy.html`): saves and settings stay in the app's own
storage on the device; Android's device backup may include them under Google's terms; the crash
panel's details are copied by the player and never sent; the only permission is VIBRATE.

## Other App content declarations

- Ads: **No**.
- Target audience and content: **13 and over** (not designed for children).
- News app: No. COVID-19 app: No. Government app: No. Financial features: None.
- Health: None. Photo/video permissions: none requested.
- App access: all functionality available without special access (no login).
