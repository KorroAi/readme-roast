# Lumi Master — research note for the DEEP DOWN hybrid

Scope: what *Lumi Master* (bilibili, global launch 17 Sep 2026) actually does with controls, camera,
exploration framing and visual style, and what a first-person, tap-only, lantern-lit mining descent
can borrow. Per the director's newest constraint, **nothing about creatures carries over**: no
capture, taming, companions, battles, trading. Lumi Master is a reference for its look and for how it
presents exploration, and nothing else.

Date: 2026-10-20. Researcher: workflow subagent.

## 0. How to read this note

**Confidence tags.** **[C]** means confirmed, by official material or by at least two independent
sources. **[S]** means a single secondary source (a guide, a review or a forum). **[U]** means
unconfirmed or my own inference; treat it as a hypothesis.

**Method and its limits (important).**
- Every direct page fetch was refused in this session. WebFetch got DNS failures, and curl got the
  egress proxy's `connect_rejected` for automaton-media.com, invenglobal.com, allthings.how, game8.jp,
  pocketgamer.com, play.google.com and youtube.com. All facts below therefore come from
  search-engine extracts of the pages cited, run as about 60 queries in EN, FR, JA, KO, zh-CN and zh-TW.
- I **could not look at a single screenshot or trailer frame**. The visual descriptions in §5 are
  what journalists, store copy and players *wrote*. The links are collected in §5.9 so that someone
  with video access can check the frames. Before any art direction is locked, a human or a session
  with a browser should spend 20 minutes on §5.9.
- Guide sites often disagree on numbers (multiplier tiers, Lumi counts, battle model). Where they
  disagree I give the range.

## 1. Reality check (read first)

Three findings change the brief the director is working from.

1. **Lumi Master is not an open 3D world.** Every description of the art calls it hand-drawn, a
   storybook or a "moving picture book" (動く絵本) [C]. One Chinese review calls it a simple,
   line-drawing-like clean look "without complex light and shadow" (简约画风…没有复杂光影) [S]. An
   industry analysis praises bilibili for *not* joining the race on "big worlds, 3D and multi-platform"
   (没必要跟其他厂商一起卷大世界、3D和多端) [S]. One summary called it "卡通三渲二" (toon-shaded 3D
   made to read as 2D), but a follow-up search could not re-verify that phrase, and the Skich listing
   tags it "3D" without explanation [U]. **Working assumption:** a 2D or painterly presentation,
   possibly built on some 3D or layered scene, that reads as flat illustration.
2. **What feels "3D" in Lumi Master is the first-person route.** The producer describes the player as
   an adventurer who "crosses different map environments **in first-person view**" (以第一視角穿越不同地圖環境)
   [C: Bahamut interview, plus Chinese analyses that call it "第一人称视角跑图" and
   "第一人称捉宠"]. You tap, the view advances along a **fixed route** in portrait, and events appear
   ahead [C]. The sense of depth comes from moving *into* the picture. There is no free 3D roaming at
   all [C: "no overworld to walk around manually"].
3. **The core loop is a "Coin Master-like" with the edge taken off.** Chinese trade press says it
   keeps Coin Master's tap-to-advance ("Tap-3") structure, with an outcome decided by a rolling bar
   above the view, an energy economy, raids on other players' homes and a slots-style bonus mode
   [C: Sohu/Zhihu, QQ/17173 and 36kr analyses]. Its "simplicity" is largely that slot-machine
   cadence wrapped in a healing storybook skin.

So DEEP DOWN can surpass the reference on the axis the director cares about. **Real-time 3D with a
first-person glide down a lantern-lit drift** gives the "moving into the picture" feeling that Lumi
Master only suggests. From Lumi Master, DEEP DOWN should take **restraint**: few tones, clean shapes,
a calm frame, short reward beats, one button.

## 2. Identity card

| Item | Value | Conf. |
|---|---|---|
| Titles | *Lumi Master* (EN), るぅみマスター (JA), 闪耀吧！噜咪 / 閃耀吧！嚕咪 (zh), 루미마스터 (KO) | C |
| Developer / publisher | bilibili self-developed (上海幻电信息科技 / BILIBILI HK LIMITED); TW/HK publisher 荷馬 | C |
| Launch | Global iOS + Android on 17 Sep 2026. First reveal 19 Dec 2025; CBTs Dec 2025 and "Shining Test" 8 May 2026; overseas tests in JP/US from Jan 2026 | C |
| Size, orientation | about 200 MB; **portrait, one-handed**; "5-minute bite-sized sessions" | C |
| Team | Producer 拓拓 / Toto (Automaton West writes "Han"); 11 years of global casual games; project started Nov 2024; reportedly **8 people at kickoff** (Tencent News headline) | C / S (team size) |
| Reception | 3M+ global pre-registrations. #1 free on the App Store in several regions; CN iOS free #2 and grossing about #19–22; TapTap hot #1. Ratings range from 4.1–4.3 (Google Play, about 13–15k reviews) to 4.6–4.8 (App Store snapshots by region) | C |
| Official tagline | EN site: "**Tap to Run & Collect More Lumis!**". TW site: "抓寵全自動 輕鬆滿圖鑑" (fully automatic catching, easy full dex) | C |
| Content | 100+ to 300+ Lumi depending on the source and date. Seasons add 60–80 Lumi; "new maps weekly" (store copy). Season 1 theme: medieval knights and dragons | C (store) / S |

## 3. Controls, inputs and automation (Q1)

### 3.1 Control scheme [C]
- **No joystick, no free movement.** The exploration screen centres on a **compass**. Tapping it
  spends Energy (stamina); the view **advances one step along a fixed route** and one random event
  resolves. The event can be materials (wood, fruit, coins), a wild Lumi, a chest, a resource node,
  a visiting NPC or adventurer, a rival or battle, or occasionally a "dig for treasure" visit to
  another player's home or a slots bonus.
  Sources: Bahamut hands-on, Automaton JP, QQ/17173, allthings.how, game8.jp, Google Play copy
  ("tap the screen to freely wander through rainforests, deserts, and volcanoes").
- **The outcome display:** a rolling judgment bar above the view decides the step's result
  (通过上方滚动条判定前进结果; 决定你命运的是头顶那个滚动的判定条) [C: two Chinese sources].
- **The multiplier:** tap the number at the compass's top-right to cycle it (×1, ×5, ×10, ×20, ×50,
  up to ×100 or ×1000 under conditions). Each step then costs ×N Energy and pays ×N of everything.
  Higher tiers unlock rarer outcomes (×1 blue, ×5 gold, ×10 rainbow, ×20 two at once, ×50 five at
  once), and at ×20 and above battles can be skipped. One guide says a tap on the compass cycles the
  multiplier and a hold opens a deeper menu, so sources disagree on the exact gesture [C on tiers; S
  on gestures].
- **Hold to automate:** after an early manual phase, **long-pressing the adventure compass starts
  auto-run** (长按开启挂机，自动跑图抓噜咪). Preset rules then decide which capture cards and items to
  spend, whether to auto-capture and whether to auto-battle [C: 17173, youxibao, Baidu Baike, gamme;
  store copy: "Auto-play… your Lumi will continuously explore, gather resources, and engage in battles
  on their own"].
- **Capture** (not for DEEP DOWN, but the input pattern is worth noting): a single flick or tap
  throws a card, with a **QTE timing ring**; landing in the perfect zone raises the odds. There is
  also an auto-throw. The fastest capture takes about 30 s [C].
- **Battle:** the front unit auto-attacks and you tap a skill when its gauge fills. Squads are three,
  with swaps. Guides disagree on real-time vs turn-based; one says "real-time, but the camera makes it
  look turn-based" [S, conflicting].
- **Speed:** after the CBT, players asked for 2× speed; it was added to adventure mode. Denfaminico
  reports the speed-up was "tuned up to 1000×" (倍速機能が最大1000倍速). That may be the same thing as
  the ×1000 energy multiplier, so it is ambiguous [C on 2×; U on what "1000×" means].

### 3.2 Design rules stated by the developers [C]
- "**Nearly all core actions complete within two steps**" (ほぼすべてのコアとなる操作が2ステップ以内で完結).
  The producer calls this the game's biggest feature (Automaton, Denfaminico).
- "**One hand, from 5 minutes**" (片手で、5分から) for busy people (Denfaminico).
- After CBT feedback ("play-time burden", "monetisation balance", "**feels monotonous over long
  play**"), the team **cut reward-presentation and content-presentation time sharply**
  (報酬獲得演出や各種コンテンツの演出時間を大幅に短縮) and added the speed-up (Automaton JP,
  Denfaminico).
- "Addition and subtraction" (加減法): no big open world ("小而美" instead of following the trend of
  big-map RPGs), no grind and pay design (Bahamut interview; TapTap developer note).

### 3.3 Inputs per minute [U: my estimate from the mechanics; no source counts this]

| Phase | Inputs/min | Notes |
|---|---|---|
| Manual exploring (tutorial, early game) | about 15–40 taps | 1 tap per step. Each step resolves in about 1.5–4 s (walk, roll, event card); faster at 2× |
| Event handling (capture or battle) | +1–5 | one card throw; 0–3 skill taps; at ×20 and above battles are skipped |
| Auto-run (after unlock) | about 0–2 | hold once to start; occasional taps to collect or stop; also runs while you look at other screens |
| Home / economy | bursty | collect, assign, craft, often 2–10 taps per visit |

**Automated:** walking the route, rolling events, capture throws, battles (rule-based),
resource production at home (offline too), and the speed-up. **Manual:** setting the multiplier and
spending Energy, team building, home layout, and choosing when to stop.

## 4. Camera and the "3D" world (Q2)

| Aspect | What we know | Conf. |
|---|---|---|
| Exploration camera | **First person** along a **fixed route**, portrait. The player's body is not the subject; the scene ahead is. The producer and Chinese press both say "first-person view" | C |
| Movement | Discrete steps triggered by a tap or by auto-run. Each step "advances" the view, and an event appears ahead | C |
| Angle, FOV, distance, follow | **Not documented anywhere I could reach.** From "walk the route" in first person plus a portrait frame, I infer an eye-level view looking down the path to a vanishing point, with the scenery sliding past per step | U |
| Zone structure | A linear chain of regions: Rainforest → Beach → Volcano → Desert → (Canyon) → Snow Mountain, plus time-limited **Season zones** (e.g. 霜脊狼原 Frost-ridge Wolf Plains, 绿林龙森 Greenwood Dragon Forest). Each zone has about 5 exclusive species. Filling the zone tracker unlocks the zone boss; clearing the boss opens the next chapter. A boss is also guaranteed after about 120 encounters | C (route) / S (counts) |
| Compass and energy | The compass is the *only* exploration control. Energy regenerates up to a cap that rises with player level; rewards and codes can push it above the cap, and passive regeneration pauses above the cap | C |
| Battle camera | Staged and framed so that real-time combat "looks turn-based" (one guide) | S |
| Home camera | A diorama-style home base (箱庭): farm, mine, kitchen, card workbench, fountains and buildings placed freely. I infer a top-down or isometric overview | C (diorama) / U (angle) |
| Day/night, weather | No day/night cycle reported. Weather exists as a **battle field effect** (e.g. a legendary unit sets "scorching sun" or "heavy snow") | S |

**How discovery and wonder are delivered** (from the mechanics and reviews):
- **A new region is the big reveal.** Each chapter changes biome, palette and species: "a quiet,
  dreamy forest path, a shell-strewn beach, a red-rock wilderness bristling with strange stones"
  (幽静梦幻的林间小径 / 遍布贝壳的海边沙滩 / 怪石林立的红岩旷野) [C: Baidu Baike, Sina].
- **A dense stream of small surprises.** Every tap is a roll: a chest, a node, a rare variant, an
  NPC. Higher multipliers raise the odds of the colour tiers [C].
- **Rarity as colour.** Five tiers: Green, Blue, Purple, Gold and Rainbow. A guaranteed Rainbow
  arrives after N encounters (a pity timer), and "Starcolor" is a partial recolour layered on Rainbow
  [C/S].
- **Collection trackers** per zone (5 entries) act as visible short-term goals that open the boss and
  then the next region [C].
- Reviewers repeatedly ask for **more freedom**: "free roaming, discovery and choosing where to go
  next" (Google Play reviews), and "let me spend energy on paths that farm specific resources;
  exploring now is a slot machine that wastes energy" (App Store) [C]. *The linear route is the most
  criticised part of the exploration.*

## 5. Visual style in depth (Q5, the main question)

### 5.1 Words the sources use

| Descriptor | Source(s) | Conf. |
|---|---|---|
| Hand-drawn, storybook, fairy-tale picture book; "a picture book that moves" (动起来的童话绘本 / 動く絵本) | store copy (EN/JA/zh), 4Gamer JP, 17173, Sina, Inven, Simulation Daily, Game8 | C |
| "Bright, warm, cartoon-style visuals to give comfort and healing" (developers) | Inven Global/KR interview | C |
| "Soft colours yet layered; lines lively and with breathing room" (色彩柔和却不失层次，线条灵动而富有呼吸感) | Sina first reveal | S |
| "Macaron colour family, rounded lines" (马卡龙色系与圆润线条) | Huxiu / Zhihu analyses | S |
| "Simple, clean, almost line-drawing (简笔画) cleanliness, **no complex light and shadow**" | Chinese review roundup | S |
| "Soft, light colours close to a Ghibli feel; light, airy motion" (色彩柔和轻快…吉卜力风格，动作轻盈) | Zhihu via Tencent News | S |
| "Watercolor/sketch aesthetic" | App Store user review | S |
| "Warm and soft, miles away from the hyper-flashy gachas" | App Store user review | S |
| "Not relying on the polished 3D presentation common in modern monster-tamers"; "distinctive in a market of anime looks and hyper-real 3D" | Softonic; Game Kaire | S |
| "Clean, simple colour palette" (简约干净的色彩搭配) | Shining Test press release (official) | C |
| Live2D-style animation of illustrations | one Chinese analysis | U |
| "三渲二" toon-shaded 3D | one summary, not re-verified | U |
| The developers deliberately avoided an art direction "so individual it only hits a narrow audience" and aimed for **accessible art that runs on a wide range of devices** | Denfaminico headline and extract | C |

### 5.2 Rendering, as best it can be reconstructed [mostly U]
- **Shading:** described as essentially *flat or soft* ("no complex light and shadow"). Expect 1–3
  tone steps per form, painted gradients rather than lit ones, and no specular or physically based
  look. Low-spec targeting supports this, since the Denfaminico headline cites running on a broad
  range of devices [C for the low-spec intent; U for the shading model].
- **Outlines:** "lively lines" and "rounded lines" suggest coloured or soft linework on characters
  and props, not heavy black ink [S/U].
- **Materials and textures:** illustration texture (watercolour or sketch grain) instead of material
  realism [S/U].
- **Geometry density:** with a small team, about 200 MB and a "simple and clean" look, density is
  low, with large simple shapes and few small details [U].

### 5.3 Palette and colour scripts per region [S/U]
- The global key is **warm, bright and soft** ("warm colours" is in the title of the Inven interview).
  Mid-value pastels ("macaron") are lifted by daylight.
- Each region carries one dominant hue (inferred from the region names and descriptions):
  rainforest in soft greens with dreamy shade; beach in sand and shell creams with sea blues; volcano
  and "red-rock wilderness" in terracottas; desert in ochres; snow mountain in pale blue-whites. The
  colours are soft, but the layers stay separated (色彩柔和却不失层次).
- **Unconfirmed:** the exact hex values, and whether the palette shifts within a region. A frame
  review is needed (§5.9).

### 5.4 Lighting and atmosphere [U]
- No source mentions dynamic lights, rim lights, AO or time of day. "No complex light and shadow"
  points to **painted or ambient lighting**: a soft overall key, with light baked into the colour.
- Depth is most likely carried by **value and saturation layering**: paler and softer far away,
  crisper near. That is classic storybook aerial perspective, but it is an inference.

### 5.5 Framing of exploration [C for first person and the route; U for composition]
- A portrait frame with the route running *into* the image, and a single central control (the
  compass) under the thumb. Energy sits in the top bar; the rolling result bar sits above the view;
  event or offer icons sit around the edges.
- Each tap gives a short forward motion, then one event "card" or encounter appears in front.

### 5.6 UI density and style
- [C] Portrait, one thumb, with the compass as the hero button. Energy is shown at the top (tapping
  it opens a shortcut panel).
- [C] **The main criticism is clutter.** "Give us an option to hide the events and offers icons;
  they make the screen too cluttered and take away from the visuals" (App Store). One review also
  says "hard-to-read new text" (Google Play).
- [U] Rounded, soft-coloured panels that match the storybook look. Not described in the sources.

### 5.7 How much moves at once; calm vs busy
- [C] The developers *cut presentation time* after testers found it slow or monotonous. The game
  moved toward **short reward beats plus speed-up**, not toward more spectacle.
- [S] Users praise how unhurried it feels: "not insanely time consuming"; Bahamut's verdict "好玩，但不逼你玩"
  ("fun, but it doesn't push you").
- [U] One event per step, a static or slowly scrolling background and gently moving characters is
  the most likely budget. Nothing describes particles, flashes or camera shake. The visual calm comes
  from flat colour, few values and one focal event.

### 5.8 Why the screen stays readable on a phone (synthesis) [U unless tagged]
1. One focal object per beat: the event ahead.
2. Flat or soft shading with few values, so silhouettes read at thumbnail size.
3. Warm, bright mids, with no crushed blacks and no neon.
4. One hero control that never moves [C].
5. Short reward presentations [C].
6. *Where it fails:* edge icons and offers, plus small text [C]. Those are the parts DEEP DOWN must
   not reproduce.

### 5.9 Screenshots and trailers to review (links; I could not open them)
- Announcement trailer (Apr 2026), according to Game8: hand-drawn storybook look; regions include
  forest, desert, snow and volcano; home management, building and farming; mini-games (whack-a-mole,
  cake-sharing). Links: https://youtu.be/VPPzwWfY07s (press kit),
  https://www.youtube.com/watch?v=N3v0ZywlPpU (Official Announcement Trailer),
  https://www.youtube.com/watch?v=Qdjm-w6hvyE
- Launch PV (Sep 2026): https://www.youtube.com/watch?v=lk3IP--OX8I (linked by the Games Press
  release). Official channels: https://www.youtube.com/@LumiMaster and
  https://www.youtube.com/@lumimaster_kr
- Gameplay captures (third-party):
  - https://www.youtube.com/watch?v=E_aER4XIpzg
  - https://www.youtube.com/watch?v=exTTpnu0ro8
  - https://www.youtube.com/watch?v=tBEO0NEed7Q
  - https://www.youtube.com/watch?v=tsI3TJc9eZ8
  - https://www.youtube.com/watch?v=aavaXc2tU4M
  - https://www.youtube.com/watch?v=lkKMP_MF_OE
  - https://www.youtube.com/watch?v=Rvaa3B5Q-0w
  - https://www.youtube.com/watch?v=TJTL15EGcGQ
  - JP CBT: https://www.youtube.com/watch?v=KqSJJk4U8uI and
    https://www.youtube.com/watch?v=0RZsIZlQamg
- Screenshot gallery (BW2026): https://www.4gamer.net/games/002/G100250/20260722038/screenshot.html
- Store screenshots: https://apps.apple.com/us/app/lumi-master/id6754979232 and
  https://play.google.com/store/apps/details?id=com.bilibili.lumi
- **Checklist for whoever reviews the frames:**
  - Is the exploration view perspective 3D or painted parallax?
  - Vertical FOV, and the eye height relative to the path.
  - How many tone steps a rock or tree has.
  - Line colour (black, or a darker local hue).
  - Fog or aerial perspective: on or off.
  - Number of moving elements during a step.
  - Duration of an event card, measured in frames.
  - HUD area as a percentage of the screen.
  - Typeface and size.

## 6. Loops, briefly, and what NOT to copy (Q3)

| Lumi Master loop | What it is | DEEP DOWN verdict |
|---|---|---|
| Compass and Energy | Spend regenerating stamina per step, with a ×N multiplier. A Coin Master-like roll per tap | **Do not gate tapping with energy.** It is the #1 complaint, and it exists to sell refills. Keep the *multiplier dial* idea only as a positive "surge" built from offline time or crew output, never as a limiter |
| Capture, battles, PvP, trading, market | Card throws with QTE, three-unit squads, ladder, auction | **Excluded** (creature side). PvP was also called "shallow rock-paper-scissors" (17173) |
| Raids on other players' homes ("dig for treasure") | Coin Master-style stealing; "no shield" complaint | **Excluded** (we are offline and single-player) |
| Home base | Assign units to farm, mine, cook and craft; offline production | DEEP DOWN already has this, done the DEEP DOWN way: the **hired crew and machines** (Shovel Hands, Pick Crew, carts, steam drills, borers) that keep digging while you are away |
| Zone tracker → boss → next chapter | 5 entries per zone fill a tracker that opens the boss; a pity timer guarantees the boss | **Borrow the structure**: 5 finds per biome codex open its **sealed gate** (a mechanism or vault seal, never a monster) |
| Colour rarity tiers and pity | Green → Rainbow, with a guaranteed Rainbow after N | **Borrow the presentation**: a seam's glint colour tells the tier *before* the break, and a guaranteed relic arrives after N faces |
| Auto-run | Hold to auto, with preset rules, unlocked after the tutorial | **Borrow**: hold = the lantern-bearer keeps digging, unlocked after the manual tutorial beat |
| Short reward beats and speed-up | Cut after CBT complaints | **Borrow**, as hard budgets (§8) |

Presentation tricks that carry over to a mining descent:
1. **Each tap gets an immediate physical answer**: the view steps forward, and the result appears
   in front of you, not in a menu.
2. **The next thing is visible before it arrives.** A route ahead with a pending event creates
   anticipation without any UI.
3. **Rarity is shown as colour, and early.** The tier is legible at a glance.
4. **Pacing of reveals:** many small surprises per minute (each step), medium goals per zone
   (tracker), one big reveal per chapter (new biome). Bosses arrive on a counter, not a timer, so
   playing harder brings them sooner.
5. **A two-step ceiling on every action**, and one hero button.

## 7. Why it is called simple and addictive; what is criticised (Q4)

**Simple** [C]:
- One control (the compass), with tap to advance and hold to automate.
- The two-step rule; portrait, one hand; 5-minute sessions.
- No open world to navigate.
- Captures in seconds, with auto options.
- Clear chapter goals (5 per zone, then the boss).

**Addictive** [C/S]:
- A variable-ratio reward per tap (the slot-machine core).
- Multiplier risk and greed ("bank energy, then spend at ×10+").
- Colour-tier chase with pity timers.
- Zone trackers; offline progress to return to ("the home moved on while I slept", gamme).
- Charts and 3M pre-registrations.
- GameWith: "ゆるく遊べてじわじわハマる" (relaxed play that hooks you gradually).

**Criticised** [C]:
- Energy is scarce and regenerates slowly, and paid refills are the main monetisation (App Store
  zh/FR/JP, 17173).
- **Linear route, no free exploration, no choice of destination** (Google Play).
- "Exploring is a slot machine that wastes energy" (App Store).
- **Monotony over long play** (the developers' own CBT feedback; Apps-island says "the early game can
  feel dull"); "you are just tapping the screen" (JP user review).
- Capture presentation "betrays expectations" (JP review).
- PvP is shallow; event-limited rare units are hard to get; paid eggs for the strongest units.
- **UI clutter** (event and offer icons); hard-to-read text.
- Accusations of AI-assisted art and of being derivative of Palworld and Pokémon (user reviews,
  unverified).

## 8. What DEEP DOWN should borrow (Q6): the look and the exploration presentation, translated to caves

Everything below is a **proposal** [U], consistent with DEEP DOWN's identity:
- a lantern-lit descent through the 14 biomes;
- mining rock, ores and gems;
- chests and relics;
- sealed gates;
- the crew and machines digging offline;
- the mystery at the bottom;
- the "Lamplight on the Lintel" brand (amber vs cool stone, octagon plates, Lintel type, emblem).

### 8.1 Framing: the "drift ahead" composition (first person, portrait)
- **The route is the drift.** One fixed line descends through each biome, like Lumi Master's route,
  but in real 3D. The camera sits at eye height (about 1.6 m) and looks slightly down the drift
  (pitch −5° to −12°). The vanishing point sits at about 38–45% of the screen height from the top.
- **Foreground frame:** timber sets, the tunnel lip and the lower 15–20% of the screen. **Tool in
  view:** pick and gloved hand at the lower right, with the lantern hanging at the lower left or
  centre. The lantern is the key light, so it should be visible to justify the light. The body is
  never shown.
- **Midground:** the **face** (rock, ore seam, chest, gate) at 45–60% of the height, the single
  focal object, inside the lantern pool.
- **Background:** darkness with a **tease**, one glint of the next event a step or two ahead (warm
  for treasure, cyan for builders' script, violet for the unknown). This copies "the next thing is
  visible before it arrives."
- **Portrait FOV:** a vertical FOV of about 62–70° keeps the floor pool and the ceiling timber both
  in frame. Lock the horizontal FOV per aspect ratio so tall phones do not show a keyhole. (Older
  DEEP DOWN builds already have an "hfov lock".)
- **Branch choice instead of pure linearity** (this answers Lumi Master's top exploration
  complaint): at a fork the drift splits left and right, each lit by the colour of what it leads to
  (ore-rich vs relic-rich). One tap on a side chooses it, which keeps the two-step rule.

### 8.2 The tap and hold grammar
- **Tap:** a pick strike on the face. Feedback order: an impact frame at 0 ms; chips and dust within
  80 ms; a counter tick within 150 ms. When the face breaks, a **glide of about 0.4–0.6 s** carries
  the view to the next face, and the result shows *in the world* (ore chunks roll into the lantern
  pool and fly to the ledger).
- **Hold:** auto-dig. The view keeps advancing at crew pace. Unlock it after the first gate, the way
  Lumi Master unlocks auto-run after its manual tutorial.
- **Surge dial** (the multiplier, with the slot machine removed): a ×N chip on the main tap area,
  filled by offline crew output or a lantern charge. ×N multiplies yield **and** raises the odds of
  the glint tiers. **It never blocks a tap when empty.**
- **Two-step ceiling:** every purchase, upgrade, crew hire or gate open is reachable in ≤2 taps from
  the dig view.

### 8.3 Rendering grammar (borrowing the restraint, not the daylight)
- **Few values per form:** 3–4 tone ramps per material (dark, mid, light, lit edge). Use broad,
  painted vertex-colour or ramp gradients instead of high-frequency procedural noise. Big chamfered
  shapes; small details only where the eye must go (the face and the glint).
- **Soft wrap shading plus baked AO:** a half-Lambert or wrap term on a 3-step ramp, with no PBR
  specular on stone. Only crystals and metal get a single crisp highlight.
- **Lines:** no global outline. Optionally, a thin *dark local-hue* edge (never black) on
  interactables only (seam, chest, gate), which gives the "lively line" feel and a readability cue at
  once.
- **Atmosphere:** depth fog toward a *biome colour*, never pure black. Near is warm and saturated;
  far is cool, paler and lower in contrast. This is storybook aerial perspective, done underground.
  It keeps the "layered" separation (柔和却不失层次) while honouring "warm safety vs cold mystery."
- **Lighting:**
  - **Key:** the lantern, warm amber, low and slightly off-axis.
  - **Fill:** cool, from the cave, about 25–35% of the key.
  - **Rim or practicals:** a biome emissive (crystal cyan, magma orange, Star Heart white-gold).
  - Every space keeps one warm practical (existing rule).
  - Instead of a time of day, use **"depth of day"**: dusk at the surface, then cooler, deeper and
    stranger with each biome.
- **Calm budget** (Lumi Master's post-CBT lesson):
  - at most 3 independently moving elements on screen during a dig beat;
  - no full-screen flashes;
  - camera shake only on a gate or vault break, ≤150 ms;
  - reward pops ≤0.8 s; one biome reveal per chapter ≤3 s and skippable.
- **HUD:**
  - ≤20% of the screen;
  - one hero tap area, a goal line at the top, the ledger counters;
  - octagon plates; Lintel type at legible sizes (minimum about 14 sp body);
  - no edge clutter: there is nothing to sell, so no offer icons, and that turns Lumi Master's
    biggest UI complaint into our advantage.

### 8.4 Colour scripts per biome (storybook softness in the mids, brand contrast in the darks)

| Biome | Dominant stone / air | Accent (what glints) | Note |
|---|---|---|---|
| Topsoil Roots | warm umber soil, root browns, dusk-blue air | amber lanterns, pale root-light | surface dusk key frame; the "forest path" equivalent |
| Glowroot Caverns | moss-green shadows, teal air | soft green-gold root glow | gentle and friendly, the healing tone |
| Crystal Grotto | cool slate, lilac fog | cyan crystal | first big wonder reveal |
| Halden Works | soot iron, timber, warm brick | brass, furnace amber | human, built, warm practicals |
| Fungal Deep | plum-grey | muted coral and cream spores (decor only) | ambient life as decoration only |
| Drowned Ruins | blue-green stone, wet sheen | aqua, pale gold mosaics | the "beach" equivalent: creamy masonry with sea blues |
| Magma Veins | basalt black-brown | orange-red cracks | the "red-rock wilderness" equivalent |
| Fossil Halls | bone ivory, ochre | warm bone highlights | the "desert" equivalent |
| Frost Hollow | pale blue-white | ice cyan | the "snow mountain" equivalent |
| the Loom | indigo with thread-gold | woven gold lines | builders' script |
| Iron Core | gunmetal, rust | white-hot | heavy and industrial |
| Star Heart | deep violet | white-gold stars | the mystery |
| Void Sea | near-black violet | faint cyan horizon | maximum calm, minimum detail |
| the Gate | stone and violet | amber flame vs cold rune | brand climax: lantern meets lintel |

Rule: keep mid-tones soft and slightly lifted (the storybook warmth), and keep darks blue-black or
violet (the brand). Never neon; nothing glows except what the brand allows.

### 8.5 Wonder pacing (Lumi Master's structure, our content)
- **Per tap:** a small surprise roll (ore tier, gem, coin cache).
- **Every few faces:** a chest or relic, shown as a glint before you reach it.
- **Per biome:** a 5-entry codex tracker (relics, minerals, builders' marks) that opens the **sealed
  gate**; a counter guarantee in the style of "boss after N".
- **Per chapter:** a first-person **reveal**, where the drift opens onto a vista (a crystal
  cathedral, a drowned city, magma falls). It is the one moment the camera may linger.
- **Away:** the crew and machines advance; on return, a short "feast" summary, ≤3 s and skippable.

### 8.6 Do not copy
- Energy gating or refills.
- A slot-bar outcome without player agency.
- Raids.
- Gacha.
- Monetisation icons.
- Small text.
- A strictly linear route with no choices.
- Long capture or reward animations.
- Anything with creatures as a mechanic.

## 9. Open questions (need frame review or a device)
1. Is Lumi Master's exploration view real-time 3D, layered 2D parallax or painted stills? (§1, §5.9)
2. Vertical FOV, eye height and per-step motion length and duration.
3. The exact HUD layout. Sources disagree on whether the compass sits mid-screen or at the bottom
   (allthings.how vs game8.jp).
4. Whether "1000×" is a playback speed or the energy multiplier.
5. The real per-region palette (hex values) and whether any fog or depth haze is used.

## 10. Sources
Interviews and developer statements:
- Automaton West (EN):
  https://automaton-media.com/en/interviews/new-monster-catching-rpg-lumi-master-lets-you-keep-using-your-favorite-monsters-forever-a-time-friendly-monster-rpg-capture-quickly-train-deeply-an-interview-with-the-de/
- Automaton JP interview: https://automaton-media.com/articles/interviewsjp/lumimaster-20260716-455124/
- Automaton JP news: https://automaton-media.com/articles/newsjp/20260827-463570/ and
  https://automaton-media.com/articles/newsjp/lumi-master-20260917-468226/
- Denfaminico Gamer: https://news.denfaminicogamer.jp/interview/260723r and
  https://x.com/denfaminicogame/status/2080127075089076313
- Bahamut GNN producer interview: https://gnn.gamer.com.tw/detail.php?sn=308193
- Bahamut hands-on: https://gnn.gamer.com.tw/detail.php?sn=311840
- 4Gamers TW: https://www.4gamers.com.tw/news/detail/80801/lumi-master-demo-review
- Inven Global and KR interview:
  https://www.invenglobal.com/articles/23677/lumi-master-a-healing-monster-raising-rpg-refined-with-warm-colors
  and https://www.inven.co.kr/webzine/news/?news=318224
- 4Gamer JP (BW2026): https://www.4gamer.net/games/002/G100250/20260722038/

Chinese trade analysis:
- "First-person capture" / Coin Master-like: https://www.sohu.com/a/982772641_421354 and
  https://zhuanlan.zhihu.com/p/2001656946474911622
- First person + Coin Master + Pokémon: https://news.qq.com/rain/a/20260129A07Z3600 and
  https://news.17173.com/content/01302026/171930399.shtml
- 36kr / Huxiu (Coin Master-like pet games): https://36kr.com/p/3826729673462658 and
  https://www.huxiu.com/article/4861765.html
- 17173 first look: https://news.17173.com/content/12232025/021416935.shtml
- 17173 deep analysis: https://news.17173.com/content/09212026/070053876.shtml
- First reveal (Sina / China.com): https://dj.sina.com.cn/article/nhcicep7776905.shtml and
  https://tech.china.com/articles/20251219/202512191784162.html
- Zhihu, "unexpectedly simple": https://zhuanlan.zhihu.com/p/1985369870464992220
- cgames, "以小搏大": https://cgames.com/contents/2/11325.html
- 游戏陀螺: https://www.youxituoluo.com/534089.html
- Tencent News: https://news.qq.com/rain/a/20260919A0A9RP00 and
  https://news.qq.com/rain/a/20260917A0EWT000
- Gamersky: https://www.gamersky.com/news/202512/2062224.shtml
- Huxiu first reveal: https://www.huxiu.com/article/4818928.html
- Baidu Baike: https://baike.baidu.com/item/%E9%97%AA%E8%80%80%E5%90%A7%EF%BC%81%E5%99%9C%E5%92%AA/67034071
- gamme: https://news.gamme.com.tw/1774892

Guides and wikis:
- allthings.how: https://allthings.how/lumi-master-how-the-cozy-creature-collecting-game-works/ and
  https://allthings.how/lumi-master-beginner-tips-compass-multipliers-and-energy-management/
- Loadout: https://loadoutgg.com/lumi-master/basics/
- lumimaster.wiki: https://lumimaster.wiki/guides/getting-started/
- Treyex: https://www.treyexgaming.com/lumi-master-beginner-guide/
- Game8 JP: https://game8.jp/lumimaster and https://game8.jp/lumimaster/816267
- youxibao: https://www.youxibao.com/gonglue/41796.html
- Sohu map guide: https://www.sohu.com/a/1077841461_121906874
- Rarity guide: https://lumimastercodes.wiki/guides/rainbow-starcolor-guide/
- MuMu settings: https://www.mumuplayer.com/blog/lumi-master-pc-settings-guide.html

Reviews and stores:
- Apps-island: https://apps-island.com/lumimaster
- 星屑ゲーマーズ: https://tenoririder.net/lumi-master
- GameWith: https://gamewith.jp/gamedb/16616/articles/56618
- Mobi.gg: https://mobi.gg/en/lumi-master/
- Softonic: https://lumi-master.en.softonic.com/android
- Game Kaire: https://gamekaire.com/lumi-master-android/
- App Store: https://apps.apple.com/us/app/lumi-master/id6754979232 and
  https://apps.apple.com/fr/app/lumi-master/id6754979232
- Google Play: https://play.google.com/store/apps/details?id=com.bilibili.lumi&hl=en_US
- Official site: https://lumi.biligames.com/ and https://lumi.biligames.com/zh-tw
- Games Press launch release: https://www.gamespress.com/Monster-Catching-Adventure-RPG-Lumi-Master-Hits-iOS-and-Android-Today
- Game8 announcement: https://game8.co/articles/latest/lumi-master-global-release-set-for-2026-pre-registration-now-live
- Simulation Daily: https://simulationdaily.com/news/lumi-master-announced/
- Inven Global charts: https://www.invenglobal.com/articles/26385/lumi-master-tops-app-store-charts-in-key-regions
