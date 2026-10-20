# Hybrids: one-thumb control × real 3D exploration × idle loops

Research for the DEEP DOWN hybrid pivot. Written for the design panel. It covers first person, tap only, portrait, the underground descent and idle upgrades.

**What the director asked for (newest wins).** Lumi Master is a reference **only** for how it looks in 3D and how it presents exploration. DEEP DOWN keeps its identity: a lantern-lit descent through 14 biomes, mining, chests and relics, sealed gates, a hired crew and machines that dig while you are away, upgrades that grow out of all proportion (démesure), the mystery at the bottom, and the Lamplight on the Lintel brand. **No creatures as a mechanic.** That means no collecting, taming, pets, companions, monster battles or trading. Cave life may decorate a scene; it is never tappable and never a system. The camera is **first person**, and the player's body is never shown; a hand, the tool or the lantern may be in view. Every input is a **tap or a hold**: no joystick, no aiming buttons, no swipes.

**How this was researched.** Page fetches were blocked in this session (DNS/egress), so every fact below comes from web-search result extracts. These are store pages, reviews, wikis and design write-ups, listed in §8 with links and cited inline as [S#]. Figures marked **est.** are my own estimates or design reasoning, not sourced facts. Several requested titles could not be found as named; see §2.6.

Contents:
1. Summary
2. Game-by-game teardown, in six groups
3. Comparison matrix
4. First person with taps only: how movement, comfort and orientation are solved
5. The 10 strongest patterns for DEEP DOWN
6. The 5 worst traps
7. Synthesis: a control contract and session shape to prototype
8. Sources

---

## 1. Summary

- **The best "simple control + real 3D" games share one move: they take locomotion away from the thumb.** Infinity Blade lets you tap glowing circles to travel between waypoints [S49]. Myst's legacy mode is a tap from one node to the next [S50]. In Lumi Master, a tap on the compass walks you forward and rolls an encounter [S2][S3]. Smash Hit moves you forward at a constant speed [S56]. Grimrock moves you in discrete grid steps [S53]. What remains for the thumb is *what to touch*, never *how to walk*. That is exactly the gap between DEEP DOWN v1 (joystick plus Mine button: "controls unpleasant") and what the director now wants.
- **The best idle-exploration games make the world itself the button, and make the automation visible in the same frame.** In Pet Simulator 99, breakables are broken for you, and the auto-tap and auto-farm passes keep it going [S13]. In Idle Miner Tycoon, managers replace your taps [S63]. In Deep Rock Galactic: Survivor, every weapon fires automatically while you only move and mine [S30][S31]. In Bee Swarm Simulator, bees gather while you stand in a field [S22]. For DEEP DOWN, the crew and machines should be **seen working inside the first-person frame**, not in a menu.
- **Progress is a visible door with a price on it.** PS99 zones cost 900, then 2.5k, then 8k coins, and so on [S16][S17]. Bee Swarm gates open at 5, 15 and 25 bees [S22][S23][S24]. The Forge gates rocks by Mine Power: Volcanic Rock needs 100 [S26]. DEEP DOWN's sealed gates between biomes are the same pattern. The next gate, with its requirement, should always be visible in the world, and it doubles as the objective that is always shown.
- **Each step forward should roll something.** Lumi Master's compass tap rolls an encounter: treasure, a boss or a rare resource [S1][S2]. In Capybara Go, one tap advances a day and draws a random event [S42]. Vampire Survivors keeps "another chest that might transform the run" in reach [S44]. DEEP DOWN translation: **every advance rolls the next chamber**, for example a rich vein, a treasure cache, a relic niche or a cart depot.
- **"Hold" is the universal autopilot.** Holding Lumi Master's compass opens Auto Advance [S3]. In Minecraft on touch, holding a block breaks it with a circular progress meter [S58]. PS99 sells auto-tap as a pass [S13]. In DEEP DOWN, hold on rock to keep digging; hold Advance to auto-delve. Both are free, because there is no store.
- **The traps are all documented.** Free locomotion on touch: thumbs go numb in Diablo Immortal [S47], and Myst DS sends you "flying around" [S50]. An autopilot that removes the player: "auto-battle kinda kills the magic of exploring" [S60], and Lumi Master's own reviews say "plain boring after long play" and "linear progression" [S1]. Effect and UI overload: Legend of Mushroom's "overwhelming complexity" [S41]. Logistics chores: SteamWorld Dig's return to the surface [S68], Dome Keeper's dragging [S35], Idle Miner Tycoon's bottleneck balancing [S63]. And importing creatures or energy timers from the references.

---

## 2. Game-by-game teardown

Each card lists: **control** (inputs per minute; what is automatic), **camera**, **core / upgrade / meta loop**, **world fullness**, **hook**, **sessions** and **take for DEEP DOWN**. For first-person titles it adds how movement, comfort and orientation work.

### 2.1 The visual and exploration reference: Lumi Master (Bilibili, launched 17 Sep 2026)

*Studied only for its visuals and how it presents exploration. Its creature systems are listed only to mark what we leave out.*

- **Control.** Portrait, one-handed play in short sessions [S4][S5]. Exploration is driven by a **compass in the middle of the exploration screen**. Tapping it spends Energy, **walks you forward along the path** and rolls an encounter [S2][S3]. Guides disagree on whether a tap advances you or cycles the multiplier [S1][S3]. **Holding the compass opens Auto Advance** [S3]. Inputs per minute: **est. 10–30 compass taps** when played by hand, **0 in Auto Advance**.
- **Exploration presentation.** You walk illustrated zones "one screen at a time" along a forward path; one guide says there is no free overworld to walk around [S3][S1]. The store copy says "just tap the screen to freely wander through rainforests, deserts, and volcanoes" [S4]. In practice that "freedom" is a feeling produced by forward motion through changing scenery, not real free locomotion. Regions go from jungle and forest to desert and volcano [S11].
- **Intensity knob.** The compass multiplier goes from ×1 to ×50. Higher spend changes what can appear and scales the rewards [S2][S3]. Guides warn that "exploring one step at a time" wastes the energy bar [S2].
- **Visual identity, the part we keep.** Picture-book or storybook look, "soft pastel visuals, charming animations, cozy landscapes" [S4]. "Soft colours, sketch-like outlines, environments that feel more illustrated than rendered" [S6]. "Hand-drawn shaders" [S7]. "Warm colors" and a soft palette that reads as comfortable [S6]. The art is soft on purpose and does not need high-end hardware [S7].
- **Loop (creature parts excluded).** The meta runs on Energy: Energy pays for travel and encounters, and a run stops when it is empty [S9]. Energy regenerates up to a cap that rises with level [S3]. Daily refills [S9]. Weekly seasonal maps [S9]. Offline production at the home base [S1].
- **Criticism.** "Plain boring after long play"; "a more open adventure instead of such a linear progression" [S1].
- **Take for DEEP DOWN.**
  - (a) **One central "advance" control that also rolls the next scene.**
  - (b) **Hold it for an autopilot.**
  - (c) **An illustrated, soft, warm 3D look**, which we bend to DEEP DOWN's warm amber lantern pool against cool dark stone.
  - (d) Scenery that changes with every step, which sells "exploration" without locomotion.
  - **Do not take:** creatures, Energy as a hard stop, or seasonal map churn.
  - **Answer the criticism** with branches (optional side niches), a mystery that unfolds as you go deeper, and upgrades that change the view.

### 2.2 First-person, tap-driven games (the most important group)

#### Infinity Blade (Chair/Epic, 2010): the canonical tap-to-travel 3D
- **Movement.** You navigate the castle with a point-and-click interface: "tap pulsating circles, watch a brief cinematic animation, and wind up where you tapped". At each stop "you can look around, but you can never move anywhere but to the next waypoint" [S49]. Epic's own pitch calls it "easy to use, tap-to-move controls … to effortlessly navigate and explore the castle realm while questing for collectable items such as treasure" [S49]. Combat is a separate set of swipe gestures [S49].
- **Comfort.** The camera moves only in short authored moves between fixed points. You never steer, so you can never lose your bearings.
- **Orientation.** Glowing circles mark the valid next spots. Treasure bags sit along the path.
- **Take for DEEP DOWN.** **Stations and authored glides between them.** The glowing marker is the affordance; in DEEP DOWN it becomes a lantern-glow tunnel mouth.

#### Myst (mobile ports, 2009 → Myst Mobile): node taps versus free roam
- **Movement.** The legacy mode uses "pre-rendered scenes you can navigate through with simple taps", aimed at smaller screens [S50]. The free-roam modes are "touch and hold to move, swipe to turn", plus advanced options; one reviewer said it "takes a solid minute to get used to" [S50]. An early port had an option to **turn off turning while moving** [S50]. On Myst DS, tapping with no cursor "makes movement very confusing, as you'll go flying around the environment without knowing exactly where you moved" [S50].
- **Lesson.** **Node taps are friendlier on a phone than free roam.** Every tap-to-move needs a **visible target**, or the player loses their bearings.

#### The Room (Fireproof, 2012): one object, focus by tap
- **Control.** A double tap snaps the first-person view to a region of interest; a pinch moves out [S51]. Swipes rotate the view, and taps pick things up [S51]. The marketing stresses "single finger" control of a 3D world [S51]. It won a GDC Award and a BAFTA [S51].
- **Take for DEEP DOWN.** A **focus view** for payoffs: tap a chest or relic and the camera eases onto it. DEEP DOWN cannot use the pinch gesture, so an exit tap (or tapping anywhere outside the object) returns the view.

#### Monument Valley (ustwo, 2014): tap the path
- **Control.** The game opens with "Tap the path to move Ida": a tap advances her along a linear route, with a sound [S52]. She walks there only "if the route is clear" [S52]. The player changes the world, not the character [S52].
- **Take for DEEP DOWN.** **Tap the destination and let pathing do the rest.** Feedback (a sound and a highlight) confirms the tap. A blocked route is shown, never silently ignored.

#### Legend of Grimrock (iOS, 2015): real-time grid crawler
- **Control.** Six arrow buttons: forward, back, two turns and two strafes. One reviewer kept "tapping the turn buttons when [they] wanted to actually move left or right" [S53]. Weapons are used by tapping a hero's hand, with a cooldown [S53]. Controls called "slick" [S53] and "incredibly responsive" on iPad [S53]. An iPhone user found it hard to use [S53].
- **Comfort.** Discrete grid steps and 90° turns.
- **Lesson.** **Grid steps are comfortable, but a block of six buttons fails the one-thumb test on a phone.** Take the grid's discreteness, not its button pad.

#### Hag's Castle, Coldfire Keep and other grid crawlers on phones
- **Hag's Castle.** You move "by tapping on arrows with one hand", with 3D character models and contextual buttons [S54].
- **Coldfire Keep.** Grid steps, with swipe controls by default [S54].
- **Take for DEEP DOWN.** One-handed first-person crawling works when every input is a **context target**, not a direction pad.

#### Wizardry Variants Daphne (Drecom, 2024): a 3D dungeon on an upright phone
- **Control.** "A full 3D dungeon with one hand on an upright smartphone." An auto-movement mode exists; a 2024 update made traps bypassable during auto-movement [S55]. A reviewer says auto mode feels "almost token" because using it in danger gets you killed [S55]. It performed above expectations on mobile [S55].
- **Take for DEEP DOWN.** Portrait first-person 3D with one hand is proven commercially. The autopilot must **stop on its own at meaningful moments**, rather than being something the player has to fight.

#### Smash Hit (Mediocre, 2014): first person on rails, tap into the scene
- **Control.** "The player moves forward at a constant speed." You throw metal balls by touching the screen at glass [S56]. Balls are ammunition: a collision costs 10 [S56]. Smashing crystal pyramids refills them [S56]. Physics shatter is the star: "glass shatters convincingly … you can destroy parts of structures" [S56]. Music changes as you progress [S56]. Checkpoints were sold as a premium unlock [S56]. Inputs per minute: **est. 40–90 taps**.
- **Comfort (est.).** Constant forward speed and no turning give the inner ear nothing to disagree with. The tap target is always in front of you.
- **Take for DEEP DOWN.** **Tap at the point you want to hit** is the most natural first-person tap verb. **Breakage that responds to where you tapped** is the dopamine. Glides between stations can be constant-speed rails dressed with things to tap along the way.
- **Avoid:** selling checkpoints. DEEP DOWN has no store, and progress is never lost.

#### Pokémon GO's encounter screen: a focused one-gesture minigame
- **Control.** Holding the ball brings up a ring that **shrinks over time and resets**. You flick to throw, and the best odds come at the smallest ring [S57]. The ring's colour signals difficulty, from green to red [S57]. With AR off, the target stays **centred** even when the phone moves, which players find easier [S57].
- **Take for DEEP DOWN.** A **timing ring** for one beat per object, used only on special objects such as a stubborn relic seal or a geode's crack point. Keep the target centred and the gesture single.
- **Adaptation:** DEEP DOWN uses a **hold and release** in place of the flick, because swipes are out.

#### Minecraft on touch (Pocket and Bedrock): hold to break, tap to place
- **Control.** Breaking is **press and hold**, with a **circular progress icon**; the time depends on the tool [S58]. A tap places [S58]. An optional "split controls" crosshair mode exists [S58]. Players asked for adjustable break timing [S58].
- **Take for DEEP DOWN.** **Hold to dig, with a progress ring on the cell, and the tool tier sets the speed.** Players already understand this.

#### A Game About Digging A Hole (2025, PC, then consoles in Dec 2025): a first-person dig-down hit
- **Loop.** Dig down, collect ores, sell them, upgrade, dig deeper [S59]. There are four upgrade lines: **shovel (eventually a drill), inventory space, battery life, jetpack**. Dynamite and lamps can be bought [S59]. You sell at your garage PC [S59]. You start with a "pneumatic trowel" that can run out of battery [S59]. Controls are standard first person: hold the trigger to dig, and use the jetpack to climb out [S59].
- **Reception.** 9/10 from GameGrin and 4/5 from The Xbox Hub, which said it "could use more things to find" [S59]. Another review called it "a good premise, half delivered; the ending comes sooner than the mechanics seem built for" [S59].
- **Take for DEEP DOWN.** First-person digging down plus upgrades is a 2025 audience proof. **The tool in your hand evolving from trowel to drill is the visible upgrade fantasy.** Its weak spots are DEEP DOWN's chances: a short game with too little to find, against an endless descent full of treasure.
- **Avoid** its trip back to the surface to sell (the jetpack climb). DEEP DOWN sells automatically.

#### Auto-walk ARPG and MMO pathing ("Dungeon Hunter-style"; Raven2, MapleStory M, Forsaken World)
- **Control.** Tap a quest and the character auto-paths to it; auto-battle fights for you.
- **Reviews.** "Turning on auto-battle kinda kills the magic of exploring" [S60]. "The autobattle mode is the game" [S60]. Auto-questing covers for "shallow and samey" combat [S60]. Auto-routing to objectives was tolerated, auto-fighting resented [S60].
- **Take for DEEP DOWN.** **Automate travel, not discovery.** The autopilot moves you between places and does the routine digging. Opening chests, choosing upgrades and the first look at a new biome stay with the player.

#### Diablo Immortal and Minecraft Dungeons: the counter-examples
- **Diablo Immortal.** Floating joystick plus skill buttons; basic attacks auto-target [S47]. Reviewers praise the feel, but the touch scheme "struggles to keep up", and pressing forward on the stick numbs the thumb in long sessions [S47].
- **Minecraft Dungeons.** Movement and attack share one button, so players mash it, and click-to-walk is hard to use without a controller [S48].
- **Lesson.** **Keep "go" and "act" on different targets.** Never put continuous steering on the thumb.

### 2.3 Auto-mining, zones behind gates, rebirths (Roblox simulators)

*DEEP DOWN has no pets or creatures. These are studied only for how they automate, gate and reset.*

#### Pet Simulator 99 (BIG Games)
- **Control.** You walk into a zone, and coins, chests and other breakables are broken **for you**. The *auto-tap* pass taps breakables automatically while you stand in the area, and *auto-farm* keeps working when you move elsewhere [S13]. Starting a minigame pauses it [S13]. Inputs per minute: **est. under 5 taps** while farming; it is a game of walking and choosing.
- **Gates.** Each area costs currency: 900, 2.5k, 8k … then 150k and 400k coins, then gold bars from Area 9 [S16][S17]. Some areas also require breakables broken or eggs hatched [S18]. Later worlds use new currencies [S19]. Each unlock can open stronger eggs, a farming spot, a rebirth gate, a machine, a minigame, a merchant, a **boss chest** or a route to another world [S15].
- **Rebirths.** Gates you buy through with accumulated progress; each grants **permanent boosts and new features** rather than a plain reset (Rebirth 1 adds auto-hatch, and so on) [S14].
- **World fullness.** Breakables respawn all the time; chests sit in every zone. One guide says Zone 9–10 chests drop "significantly more" than Zone 8 [S16].
- **Take for DEEP DOWN.** **A steep, visible price on the next door. Each door opens new systems, not just a bigger number. A rebirth that adds features. Chests in every zone, worth more the deeper you go.**

#### Mining Simulator 1 and 2 (Roblox)
- **Loop.** Mine ore in the depths, sell it, upgrade the backpack, rebirth for better sell rates [S20][S21]. Third-party auto-mine, auto-sell and auto-rebirth scripts are widespread, and they break the rules [S20]. They show which chores players want gone.
- **Take for DEEP DOWN.** Players script away **selling and backpack-full trips**. DEEP DOWN should never have them.

#### Bee Swarm Simulator (Onett)
- **Loop.** Gather in a field, convert at the hive, buy bees and gear, open bigger fields.
- **Gates.** Gates open by **count of units owned**: the 5-bee gate [S22], Rose Field at 15 [S24], Mountain Top at 25 behind the Lion Bee Gate [S23]. Some gates need a specific unit type [S22].
- **Take for DEEP DOWN.** A gate can ask for **"crew size ≥ N"**, or "own a steam drill", not only gold. It is a second axis that pulls players into the crew sheet. The bees, being creatures, are not taken.

#### Dig (Roblox, 2025, from the makers of Fisch)
- **Loop.** Dig up treasure, sell it, buy better shovels; shovels are sorted into "stages" to simplify progression [S25]. Each dig is a **timing minigame**: drain a progress bar, and centre hits count as Strong strikes that refill a heart bar; miss and the item sinks back [S25].
- **Item traits.** **Type, age, rarity, possible mutation**; shiny, large or transparent finds sell for much more [S25]. Bosses drop unique shovels [S25].
- **Take for DEEP DOWN.** **Relics with rolled traits** (age, condition, a gilded or star-touched variant). They make the Codex of *objects* deep without any creatures.

#### The Forge (Roblox, beta 26 Nov 2025)
- **Loop.** Mine, forge, combat, trade [S26]. **Mine Power gates rocks**: Volcanic Rock needs ≥ 100, and the top pickaxe has 175 [S26]. Ore rarity feeds the crafting multipliers [S26].
- **Take for DEEP DOWN.** **Visible hardness thresholds.** A face your pick cannot break yet shows "needs Pick III", which turns into the next goal.

#### Grow a Garden (Roblox, 2025): an idle record-breaker
- **Loop.** Crops keep growing **while you are offline**, which appeals to casual players [S27]. Random **server-wide weather** of about 5–10 minutes changes growth and causes **value-multiplying mutations**; a stacked record reached ×5550 [S27]. It peaked at over 5 million concurrent players, with critics calling it "boring" and "simplistic" [S27].
- **Take for DEEP DOWN.** **The world keeps working while you are away,** plus **timed world events that multiply value**: a Golden Vein surge, or an "Ember Tide" in the Magma Veins.

### 2.4 Move-only and auto-fire games (control economy)

#### Deep Rock Galactic: Survivor (Funday; mobile launched Nov 2025)
- **Control.** "No need to aim: run, dig, and let your weapons fire automatically" [S31]. You carry 4–5 weapons that "all shoot automatically as I mine and explore" [S30]. **Walking into rock digs it, and mining slows you down** [S29]. The mobile version supports portrait and landscape [S32] and is "much easier to control" [S33]. Pricing is free to try for the first two biomes, then a one-time purchase [S32].
- **Upgrades.** Mining speed is a permanent upgrade ("Mining 101", +2% per level, paid in a mineral) and a temporary in-run perk [S28][S34].
- **Take for DEEP DOWN.** **Digging is the only verb, and everything else fires on its own.** Mining speed should be its own upgrade line that you feel in every strike.

#### Dome Keeper (Bippinbits, 2022)
- **Loop.** Mine, return to the dome, upgrade, survive a wave, repeat. You race to grow strong enough to reach a relic in the deepest layers [S36]. **Mining means bumping into blocks**; deeper blocks are harder [S35]. Resources are **dragged back, and the more you drag, the slower you go** [S35].
- **Reviews.** 76–80 from critics and 92% on Steam. Praised for pacing: calm mining, then frantic fights [S36]. Criticised for runs that are "very similar to each other" [S36].
- **Take for DEEP DOWN.** **A relic at the bottom as the pull of the run**, and a calm-then-intense rhythm.
- **Avoid** the trek back with resources in tow.

#### Archero (Habby, 2019)
- **Control.** One virtual stick; **when you stand still you shoot the nearest enemy automatically**, and you "can either shoot or run, not both" [S37]. That split "is the core tension the whole game is built around" [S37]. Inputs per minute: **est. a continuous hold with 20–40 direction changes**.
- **Take for DEEP DOWN.** **A single binary choice (go or act) can carry the whole game.** For DEEP DOWN it is **advance or dig here**.

#### Survivor.io (Habby, 2022)
- **Control.** Played with one finger, auto-aim, abilities that ramp quickly [S38].
- **Meta.** A gacha meta on top of a polished casual layer [S38]. It comes from Vampire Survivors' "simple but addictive gameplay, short sessions, intuitive controls" [S39].
- **Session.** Clearing Chapter 1 means surviving **15 minutes** [S40].
- **Take for DEEP DOWN.** A **15-minute "chapter" clock** is the standard length for a mobile session. Map it to one biome per 10–15 minutes early on (est.).

#### Vampire Survivors (poncle, 2022)
- **Control.** Movement only; "the game automates the combat" [S43][S44].
- **Hook.** The designer applied lessons from the gambling industry to the "just one more go" pull [S43]. "There is always another gem just out of reach, another upgrade that might complete a build, another chest that might transform the run" [S44]. Meta upgrades are "tiny individually and separated into many little bonuses, so it doesn't feel grindy" [S44]. Its standard runs last about 30 minutes, which is well known though not re-sourced here.
- **Take for DEEP DOWN.** **Many tiny permanent bonuses**, and **a next reward always in sight**. Use variable rewards honestly: no money, no store.

#### Brotato (Blobfish; mobile)
- **Control.** Weapons fire automatically by default, with manual aim as an option [S45].
- **Structure.** **20–90 second waves with a shop between them**; runs under 30 minutes [S45].
- **Take for DEEP DOWN.** **Short pressure followed by a shopping beat.** In DEEP DOWN that is a chamber cleared, then a quick buy at the station.

#### Megabonk (2025, PC)
- **Loop.** A 3D survivors-like with a third-person camera and auto-attacks; pick one of three upgrades each round "to watch your build get absolutely out of control" [S46]. It sold over 1M copies in two weeks and peaked above 117k concurrent players [S46]. Its press draws players who want to "grow absurdly powerful" [S46]. Low-poly and deliberately rough [S46].
- **Take for DEEP DOWN.** **Growth to absurdity in 3D sells, even with low-poly art.** A strong silhouette and readable effects beat fine detail.

#### Legend of Mushroom (Joy Nice, 2023–24) and Capybara Go (Habby, 2024–25)
- **Legend of Mushroom.** An idle RPG built on a "magic lamp" slot: defeating bosses earns lamp pulls, and each pull draws equipment. One analyst calls it an "RPG-themed slot machine" [S41]. It is criticised for "overwhelming complexity" and fast pacing [S41]. Revenue around $270M [S41].
- **Capybara Go.** "All you really have to do is tap a button to progress through each new day", with random encounters and AFK rewards [S42].
- **Take for DEEP DOWN.** **One tap = one step, with a random event each step** (the same idea as Lumi Master's compass).
- **Avoid** the slot-machine core and the complexity overload.

### 2.5 Idle mining, tappers and descent games (theme and economy)

| Game | What it does | Take / avoid |
|---|---|---|
| **Idle Miner Tycoon** (Kolibri, 2016) | Shafts → elevator → warehouse; **managers automate**, and you earn idle cash while the app is closed. Parts level independently and bottleneck each other ("keep the elevator ~10 levels ahead") [S63]. Prestige multiplies a mine's output for a reset fee, up to 5 times per mine [S63]. Opening a new mine beats upgrading the old ones [S63]. Many mines on 8 continents [S63]. | Take: visible automation, and "a new mine beats an old upgrade" (go deeper). Avoid: balancing chores across three bottlenecks. |
| **Tap Tap Dig** (2016) | Tapping swings the pick; tapping worms gives diamonds; **12 helpers** dig for you; you earn idle coins; fossils trigger a **"Big Bang"** prestige; the goal is the planet's core [S64]. | Take: a named prestige that is an event in the world; "to the core" as the north star. |
| **Deep Town** (Rockbite) | Robots mine deeper toward the core; offline mining; 15+ resources, crafting, bots and drones automate; 10+ zones [S65]. | Take: robot and machine crews (DEEP DOWN's steam drills and borers). Avoid: crafting-chain sprawl. |
| **Mr. Mine** (Playsaurus, 2012 → Steam and mobile) | Upgrade a drill; **"hidden treasures and relics"**; **100+ drill upgrades**; framed as adventure and discovery; Very Positive on Steam (18.6k reviews) [S66]. | Take: relics and discovery in a mining idle game; a long ladder of drill upgrades. |
| **Tiny Miners: Clicker** (Mindstorm) | A tap-based dwarf town with idle cash; rated about 4.45 from about 737k reviews; the top complaint is forced ads every few minutes [S67]. | Avoid: interruptions (DEEP DOWN has no ads anyway). |
| **SteamWorld Dig** (Image & Form, 2013) | "Dig deeper, gather resources, return to the surface to sell your loot, buy upgrades, repeat" [S68]. The sequel switched from procedural to handcrafted worlds with "puzzle caves, little tricks and traps everywhere" [S68]. | Take: authored set pieces inside a generated descent. Avoid: the trip back to the surface. |
| **Dig Away!, Super Miner, Overkill Drill** (mining tappers) | Tap to dig while you watch the drill break ground [S69]; Super Miner is a "tap-to-upgrade tower mine" where improvements clear more layers [S69]. | Confirms the genre's base: tap → layer breaks → upgrade → more layers. |

**Idle economy math** (Pecorella, Kongregate/AdVenture Capitalist) [S70]. Generators produce currency per second. Costs grow exponentially, and chains of generator tiers only approach exponential growth, so costs eventually outrun production. Prestige resets for a persistent multiplier. This is the textbook basis for "upgrades to absurdity", and the DEEP DOWN economy spec already follows it.

### 2.6 Requested titles that could not be verified

- **Ruinverse.** No search result names this game; its controls could not be confirmed. The closest finds are the one-handed grid crawlers Hag's Castle and Coldfire Keep [S54].
- **"Mining Fever."** No mobile game by that exact name was found. Near matches: *Mining Fever* on itch.io, a top-down PC mining sim; *Coin Fever – Mining Clicker*; *Blockchain: Miners' Fever* [S71].
- **"Mining Inc."** Not found as named. The closest idle mining apps are Mr. Mine, Dig Away! and Super Miner [S66][S69].
- **Lumi Master's exact camera.** The sources describe illustrated zones, a forward path and "hand-drawn shaders" [S3][S7], but **no source states the camera angle**. Treat "Lumi Master's 3D look" as *soft, illustrated, warm, picture-book 3D*, and check it against the screenshots the parallel look research gathers.

---

## 3. Comparison matrix

Inputs per minute (IPM) are **est.** for active play. "Auto" is what plays itself.

| Game | Camera | Movement input | IPM (active / idle) | Auto | Core loop (seconds) | Upgrade loop (minutes) | Meta (days) | How the world stays full | Hook |
|---|---|---|---|---|---|---|---|---|---|
| Lumi Master | Portrait, illustrated zones, forward path | Tap the central compass; hold for Auto Advance [S3] | 10–30 / 0 | Advance, encounters, battles | Tap → step → encounter roll | Spend multiplier ×1–×50 [S2] | Energy cap, dailies, seasons [S9] | Random encounter on every step | Variable reward per step |
| Infinity Blade | 1st/3rd person, fixed waypoints | Tap a glowing circle [S49] | 4–10 / — | Travel animation | Tap node → fight → loot | Gear | Bloodlines | Enemy and treasure at every stop | Spectacle plus loot |
| Myst (legacy) | 1st person, nodes | Tap a node [S50] | 10–20 / — | — | Tap → look → solve | — | — | Puzzles in every node | Mystery |
| The Room | 1st person, object-centred | Double tap to focus, pinch out [S51] | 10–30 / — | — | Inspect → manipulate | — | — | Dense props | Tactile secrets |
| Grimrock iOS | 1st person, grid | 6 arrow buttons [S53] | 30–60 / — | — | Step → fight → loot | Levels | — | Authored traps | Tension |
| Smash Hit | 1st person, on rails | None (constant speed) [S56] | 40–90 / — | Forward motion | Tap → shatter | Ball count | Checkpoints | Glass and crystals | Physics break |
| Pokémon GO (encounter) | Fixed, target centred | — | 6–12 / — | — | Hold → ring → flick [S57] | — | — | Spawns | Timing skill + catch |
| Minecraft (touch) | 1st person, free | Stick or buttons | 20–60 / — | — | Hold to break with a ring [S58] | Tools | Building | Generated world | Agency |
| A Game About Digging A Hole | 1st person, free | Pad / KB+M [S59] | — | — | Dig → collect | Shovel → drill, pack, battery, jetpack [S59] | Short | Ore in the soil | Upgrade the tool you see |
| PS99 | 3rd person | Walk | under 5 / 0 | Breaking, tapping (pass) [S13] | Breakables pop | Gate prices [S16] | Rebirths add features [S14] | Respawning breakables, chests | Next door |
| Bee Swarm | 3rd person | Walk | under 10 / 0 | Gathering | Field → hive | Bees, gear | Quests | Fields regrow | Gates by count [S22] |
| Dig (Roblox) | 3rd person | Walk + timing taps | 30–60 / — | — | Timing minigame [S25] | Shovel stages | Collection | Treasure rolls with traits | Rarity + mutation |
| Grow a Garden | 3rd person | Walk | under 10 / 0 | Growth (offline) [S27] | Plant → harvest | Seeds | Weather mutations | Weather events | Come back for multipliers |
| DRG: Survivor | Top-down | Move only [S31] | continuous / — | All weapons fire [S30] | Walk into rock = mine [S29] | Perks | Permanent upgrades [S28] | Minerals in walls, hordes | Build snowball |
| Dome Keeper | Side view | Move (bump to mine) [S35] | continuous / — | — | Dig → haul | Dome upgrades | Relic at the bottom [S36] | Ore under rock | Calm then panic |
| Archero | Top-down | Stick; stop to shoot [S37] | continuous / — | Shooting | Room clear | Skill picks | Gear gacha | Rooms | Go-or-act tension |
| Survivor.io | Top-down | 1-finger stick [S38] | continuous / — | Aim and fire | Survive 15 min [S40] | Skill picks | Gacha [S38] | Hordes | Escalation |
| Vampire Survivors | Top-down | Move only [S43] | continuous / — | Combat | Gems → level | Picks + evolutions | Tiny meta bonuses [S44] | Hordes + chests | Variable reward |
| Brotato | Top-down | Move (auto-aim) [S45] | continuous / — | Firing | 20–90 s wave [S45] | Shop between waves | Unlocks | Waves | Short pressure + shop |
| Idle Miner Tycoon | 2D side view | Tap buttons | 5–15 / 0 | Managers [S63] | Shaft → elevator → warehouse | Levels | Prestige, continents [S63] | — | Numbers up |
| Tap Tap Dig / Mr. Mine | 2D side view | Tap | 60–300 / 0 | Helpers, drill [S64][S66] | Tap → layer | 100+ drill upgrades [S66] | Big Bang prestige [S64] | Relics, fossils | "To the core" |

---

## 4. First person with taps only: what the evidence says

### 4.1 Five ways a tap can move a first-person camera

| Model | Examples | Comfort | Sense of exploration | Fit for DEEP DOWN |
|---|---|---|---|---|
| **A. Node hop with an authored glide** | Infinity Blade [S49], Myst legacy [S50] | High: short authored moves, no steering | Medium-high when stops are rich and you can "look around" | **Best core**: stations down the descent |
| **B. Forward-advance button** | Lumi Master compass [S3], Capybara Go [S42] | High | Medium; the scenery changes with every step, and branches answer the "linear" complaint | **Best trigger**: the Advance lantern |
| **C. Constant-speed rails** | Smash Hit [S56] | High: no turning, constant speed (est.) | High momentum, low agency | For **glides between stations** and auto-delve |
| **D. Grid step and 90° turn** | Grimrock [S53], Hag's Castle [S54], Daphne [S55] | Medium-high when tweened | High for mazes | Too many buttons; do not use |
| **E. Tap the destination, pathfinding walks** | Monument Valley [S52], Minecraft Dungeons [S48], Myst DS [S50] | Medium; disorienting without a visible target [S50] | Medium | Only inside a station (e.g. step to a side niche), with a marker |

**Recommendation:** **A + B + C.** Advance is one tap on a glowing tunnel mouth or the Advance lantern, which glides the camera along an authored rail to the next station. While you are at a station, nothing moves the camera except a short look-at toward an object you tapped.

### 4.2 Comfort rules (motion sickness)

**What the sources say:**
- Turn off head bob, motion blur and camera sway [S61].
- The core problem is the conflict between what the eyes see and what the inner ear feels [S61].
- Low frame rate, input lag and camera motion that does not match input are common triggers [S61].
- FOV advice ranges from about 60° to 90–100° and depends on viewing distance [S61].
- Dig VR offers snap turns, a comfort vignette, adjustable turn speed and **a static object in view** as comfort aids [S61].
- In grid crawlers the logic is instant and only the view is tweened; turns happen in exact 90° steps; toggles exist for smooth movement [S62].
- Myst ported an option to stop turning while moving [S50].

**Design rules for DEEP DOWN (est., derived from the above):**
1. **No head bob, no roll, no shake during glides.** Camera shake is reserved for impacts, at least 1.5° and under 120 ms, and is off in the reduced-motion setting.
2. **Glides are short and eased:** 1.2–1.8 s per station, ease-in-out, pitch nearly constant, at most ±10° yaw change during a glide. Turns happen **before** the dolly starts, never during it.
3. **Look-at on tap:** ≤ 0.35 s, ease-out, ≤ 35° yaw, then it holds. Never swing more than 90°.
4. **A static anchor in frame:** the lantern and the hand with the tool sit in the lower right corner and stay fixed relative to the view. This is the Dig VR "static object" fix [S61]. It is also our brand mark: the warm amber lantern pool.
5. **Hold 60 fps in glides.** Drop the effects before dropping frames.
6. **Portrait FOV.** A 9:19.5 frame is about 0.46 wide for every unit of height. Lock the **horizontal** FOV at about 50–55°, which gives a vertical FOV of about 90–97°, and pitch the camera down 10–20° during descent. The tall frame then shows **the face you strike in the lower third and the cavern or vista overhead**. The repo already locks hfov (Lens R4).
7. A **reduced-motion** setting that turns glides into 0.25 s cross-fades, the Myst legacy approach [S50].

### 4.3 How the player orients without steering

- **There is one direction: down.** The depth ruler is the compass, and every glide descends.
- **Glowing affordances.** The next tunnel mouth carries the Lintel octagon plate and a lantern glow (Infinity Blade's pulsing circles [S49]). Side niches carry a smaller, dimmer mark.
- **The next gate is always in view or announced.** "Seal in 120 m: needs Pick III" sits as a plate on the HUD and as an engraved sign at the station before it (PS99, The Forge [S16][S26]).
- **Vista windows.** Some stations are rims or balconies looking down into the next biome. In a portrait frame that reads as a deep shaft, and it carries the mystery: the Star Heart glimmers faintly far below.

---

## 5. The 10 strongest patterns for DEEP DOWN

*Portrait, one thumb, first person, tap only, a 3D underground descent with idle upgrades.* Each pattern gives the evidence and then the DEEP DOWN translation.

### P1. The world is the button: tap where you want to hit
**Evidence.** Smash Hit throws at the point you touch [S56]. Monument Valley: "tap the path" [S52]. Minecraft: hold the block itself [S58]. Infinity Blade: tap the circle [S49].

**DEEP DOWN.**
- A tap on rock **strikes that spot**: a crack decal grows at the tapped point, and chips fly away from the camera.
- Hit-test priority: special objects first (glint ore, gem geode, chest, relic, a seal's weak point). After that, the rock cell under the finger, with a generous radius.
- The core loop has **no UI button**. The bottom plates are for sheets only.

### P2. Stations and glides: node-hop movement with one Advance tap
**Evidence.** Infinity Blade waypoints [S49], Myst nodes [S50], Lumi Master's compass walking you forward [S3], Smash Hit's constant-speed rail [S56].

**DEEP DOWN.**
- The descent is a chain of **stations** (chambers). At each one the camera is still and you dig.
- Clearing the **way-face** opens the tunnel mouth. One tap on it, or on the Advance lantern plate, glides you 1.2–1.8 s to the next station, using the §4.2 rules.
- The glide is dressed so that dead time is never empty:
  - veins along the walls flash as the crew's cart rattles past;
  - a Halden Works sign slides by;
  - water drips in the Drowned Ruins.

### P3. Hold = autopilot, free and stopping at the right moments
**Evidence.** Lumi Master's hold-for-Auto-Advance [S3], Minecraft's hold-to-break ring [S58], PS99's auto-tap [S13], Daphne's auto-move that should stop on danger [S55].

**DEEP DOWN.**
- **Hold on rock:** the tool strikes on its own rhythm, with a progress ring on the cell.
- **Hold Advance:** auto-delve. Strike, clear, glide, and repeat.
- Auto-delve **stops by itself** at:
  - a sealed gate;
  - a chest or relic (the player opens it);
  - an event;
  - a new biome's first vista (the player gets the wonder moment);
  - an affordable must-buy, if the player turned that on.
- Unlocked early (after the 3rd station) and free.

### P4. Automation you see working in the same frame
**Evidence.** PS99 breakables broken for you [S13], Idle Miner managers [S63], DRG:S auto-firing weapons [S30], Deep Town bots [S65], Tap Tap Dig's 12 helpers [S64].

**DEEP DOWN.**
- **The crew and machines appear in first person**:
  - Shovel Hands and Pick Crew work the side walls at the edges of the frame;
  - mine carts roll along a rail across the lower frame;
  - a steam drill bores the way-face beside your strikes;
  - borers grind on the far wall.
- Their output is **gathered into one "haul" counter per station**, never a number per hit, which keeps the screen readable.
- Each hire visibly adds a worker or machine to the scene.

### P5. Every advance rolls the next chamber
**Evidence.** Lumi Master's compass roll (treasure, bosses, rare resources) [S1][S2], Capybara Go's daily event [S42], Vampire Survivors' "another chest that might transform the run" [S44], Smash Hit's crystal pyramids along the rail [S56].

**DEEP DOWN.**
- The station type is rolled on arrival.
- Starting table (est.):

  | Station type | Share |
  |---|---|
  | Plain | 68% |
  | Rich vein | 12% |
  | Treasure cache | 6% |
  | Relic niche | 4% |
  | Cart depot (crew bonus) | 4% |
  | Crystal pocket (gems) | 3% |
  | Collapse shortcut (skip 2 stations) | 2% |
  | Golden Vein event | 1% |

- A **bad-luck guarantee** ensures a cache at least every 8 stations.
- Lumi Master's ×1–×50 spend knob becomes an optional **Wick** (spend lamp oil for a richer roll). Oil is earned only and **never stops play**.

### P6. Gates are physical doors with a price, and they are the objective
**Evidence.** PS99's area prices and "what each door opens" [S15][S16], Bee Swarm's count gates [S22][S23], The Forge's Mine Power [S26], Dome Keeper's relic at the bottom [S36].

**DEEP DOWN.**
- **Each biome boundary is a sealed gate.** It is a mechanism (a hatch, a lock wheel, a runed lintel), never a monster.
- The gate is visible from the station before it. Its requirement is engraved on an octagon plate:
  - a gold cost, or
  - "Pick III", or
  - "6 crew".
- A plate reading "Next: open the Crystal Grotto seal, 72%" is always shown.
- **Opening a gate unlocks a new system, not only a bigger number**: a new crew line, a new machine, a new relic set, a new event. PS99 does the same with its doors [S15].
- Faces that are too hard to break show their threshold in place (The Forge [S26]).

### P7. The tool in your hand is the upgrade showcase
**Evidence.** A Game About Digging A Hole's shovel → drill, battery and lamps [S59]. Mr. Mine's 100+ drill upgrades [S66]. DRG:S's Mining 101 at +2% per level [S34]. Megabonk's "absurdly powerful" [S46]. Pecorella's exponential cost and prestige math [S70].

**DEEP DOWN.**
- First person means the **hand and the tool are always on screen**. Every tier changes them visibly:
  - trowel → pick → steel pick → steam pick → hand drill → piston borer → arc lance → star-forged lance;
  - the lantern grows from a tin lamp to a "sunstone".
- Many **tiny permanent bonuses** sit under that (Vampire Survivors [S44]), stacked into multipliers that climb to absurd numbers.
- Big tiers change the **verb's feel**: each strike carves more, and from steam tier on a "hold" carves a channel.

### P8. A focus view for the payoff: chests and relics open close up
**Evidence.** The Room's double tap to focus [S51], Pokémon GO's centred target with a shrinking ring [S57], Dig's timing minigame and rolled traits [S25].

**DEEP DOWN.**
- Tap a chest or relic: the camera eases in (0.35 s), the background dims by about 30%, and the object sits centred.
- One tap opens a chest. A relic gets **one** hold-and-release timing ring: release inside the gold band for a better condition grade.
- Relics roll **traits**:
  - era (Halden, Drowned, Loom, Star);
  - condition;
  - a rare **gilded** or **star-touched** variant, in place of Dig's mutations.
- They fill a **Codex of objects**, the collection drive without creatures.
- A tap outside the object exits the view.

### P9. Three nested clocks, with short sessions that end on a hook
**Evidence.** Brotato's 20–90 s waves and shop [S45], Survivor.io's 15-minute chapter [S40], Grow a Garden's 5–10 minute weather [S27], Lumi Master's bite-sized sessions [S5].

**DEEP DOWN (est.).**

| Clock | What happens |
|---|---|
| **About 30–60 s** | One station: strike, clear, glide |
| **About 3 min** | 3–5 stations, one buying spree at a cart depot or station, one cache or relic |
| **About 10–15 min (early)** | One sealed gate and a new biome vista |
| **Days** | Prestige (Rekindle), records |

Each session should end with something just out of reach: "Seal at 72%", or "the crew will reach the Fungal Deep in 2 h".

### P10. The world keeps digging while you are away, and you see it on return
**Evidence.** Grow a Garden's offline growth [S27], Idle Miner's idle cash [S63], Deep Town's offline mining [S65], Lumi Master's home production [S1], Tap Tap Dig's idle coins [S64].

**DEEP DOWN.**
- Offline, the crew **digs ahead by N stations**.
- On return, the camera **glides through the newly dug tunnel** (2–3 s, any tap skips) past full carts. You arrive at the new face, and one tap collects the haul.
- Timed **world events** (Golden Vein, Ember Tide, Frost Bloom) give a reason to come back, with no punishment for missing them.

---

## 6. The 5 worst traps

### T1. Free locomotion and steering in first person
**Evidence.**
- Diablo Immortal: the thumb goes numb from pressing forward on the stick [S47].
- Myst DS: tapping without a target sends you "flying around" [S50].
- Minecraft Dungeons: move and attack share one input, so players mash it [S48].
- Grimrock's six-button pad causes mis-taps [S53].
- DEEP DOWN v1's own joystick was called "unpleasant".

**Failure mode.** Motion sickness, loss of bearings, empty walking time, and a second thumb needed.

**Rule.** Never steer. Stations and glides only (§4), and every tap-to-move goes to a **visible** target.

### T2. An autopilot that removes the player, and a corridor that feels linear
**Evidence.**
- "Auto-battle kinda kills the magic of exploring" [S60].
- "The autobattle mode is the game" [S60].
- Lumi Master: "plain boring after long play … too linear" [S1].
- Dome Keeper: runs feel "very similar" [S36].
- A Game About Digging A Hole: "could use more things to find" [S59].

**Rule.**
- Automation moves you and does routine digging. **Opening, choosing and first sights stay manual.**
- A player's tap on a special object must be worth **10–100×** a crew strike (est.).
- Each biome needs **authored set pieces**, as SteamWorld Dig 2 did [S68]:
  - an optional side niche per 3–4 stations;
  - one vista per biome.
- That keeps the descent from feeling like a corridor.

### T3. Screen noise: too many effects, numbers and panels
**Evidence.**
- The director on the 2D build: "far too many animations … illegible".
- Legend of Mushroom: "overwhelming complexity", poor inventory [S41].
- Tiny Miners: interruptions every few minutes [S67].

**Rule.**
- One ceremony at a time, with a hard effect budget.
- Crew output gathered into one counter per station (P4).
- The 3D view takes at least 65% of the screen. The HUD is one top line plus one plate row.
- Animation serves readability. On low-end phones, cut the post effects before the frame rate drops.

### T4. Logistics chores and dead time
**Evidence.**
- SteamWorld Dig's trip back to the surface [S68].
- Dome Keeper's dragging, which slows you down [S35].
- Mining Simulator's backpack-full sell trips, which players script away [S20].
- A Game About Digging A Hole's jetpack climb out [S59].
- Idle Miner's three-way bottleneck balancing [S63].
- DEEP DOWN v1: "caverns horribly empty".

**Rule.**
- **Auto-haul and auto-sell:** carts carry everything up. There is no backpack cap and no forced trip back.
- No balancing upgrades whose only effect is fixing a bottleneck.
- A **fill contract** per station: at least one tappable special in view on arrival, and never a frame without something to touch within 1 s.

### T5. Borrowing the wrong systems: creatures, pets, energy timers, slot-machine draws
**Evidence.**
- Lumi Master's identity is creature collection, with Energy that stops runs [S9].
- PS99 and Bee Swarm progression runs on pets and bees [S13][S22].
- Legend of Mushroom's core is "an RPG-themed slot machine" [S41].
- Smash Hit sold checkpoints [S56].
- All of these break the director's hard constraint or DEEP DOWN's no-store rule.

**Rule.**
- Take **only** their control, automation, gating and presentation patterns.
- Points in the current design to check against this rule (from `docs/idle/SPEC.md`):
  - **Wardens holding seals** should become **mechanisms** (hatches, lock wheels, runed lintels). Breaking one should feel like cracking a vault, not beating a monster.
  - The **Lucky Moth** tappable should become an inanimate glint, such as a drifting ember or a loose geode.
  - "**creatures**" listed as tappables or per-biome counts should become non-interactive ambient decoration only.
- Energy and oil never block play. Random rolls give in-game rewards only, with pity floors.

---

## 7. Synthesis: a control contract and session shape to prototype

*This is a proposal for the design panel, built from patterns P1–P10. It is not a spec.*

### 7.1 Screen (portrait, one thumb)

| Band | Content |
|---|---|
| Top, about 10% | Depth ruler, gold, and **one objective plate** ("Seal of the Grotto: 72%") |
| Middle, about 72% | The 3D first-person view: way-face, side walls with crew, a ceiling or vista above. The hand, tool and **lantern are fixed in the lower right** (the comfort anchor and the brand's warm pool). |
| Bottom, about 18% | One row of octagon plates (Dig · Crew · Lantern · Codex). They open sheets. The **Advance lantern** appears in the centre only when the way is open, with a slow 1.6 s pulse. |

### 7.2 Inputs (tap and hold only)

| Input | Where | Result |
|---|---|---|
| Tap | Rock | A strike at that point: crack, chips, small pitch-varied *tock*. |
| Hold | Rock | Auto-strikes at the tool's rate, with a progress ring on the cell. |
| Tap | Special object (ore, geode, chest, relic, seal weak point) | Priority hit. Chests and relics open the focus view. |
| Tap | Open tunnel mouth or Advance lantern | Glide to the next station (1.2–1.8 s). |
| Hold | Advance lantern | Auto-delve until a stop condition (P3). |
| Tap | Side niche mark | Look-at (≤ 0.35 s), then a short glide into the niche, then back. |
| Tap | Plate | Opens a sheet; a tap outside closes it. |

**Never:** swipes, drags, pinches, a joystick, aim buttons, or free look.

### 7.3 Input budget (est.)

| Play style | Rate |
|---|---|
| Active | 20–60 taps a minute, comfortable; a hold covers the high end |
| Advance | 1 tap every 30–60 s |
| Auto-delve | 0 required inputs between stops |
| Idle | 0 |

### 7.4 Session shape (est., early game)

| Time | What the player gets |
|---|---|
| 0:00–0:30 | Tutorial station with one face: tap, crack, burst. The first gold pops into the counter, and the first plate pulses. |
| 0:30–3:00 | Stations 2–5: first Advance glide; first hire (a Shovel Hand appears on the left wall); first treasure cache in the focus view; hold to dig introduced. |
| 3:00–10:00 | First cart depot spree; auto-delve unlocked; the Topsoil Roots seal comes into view with its plate; first relic and its traits. |
| 10:00–15:00 | Seal opened. **Glide through the gate into the Glowroot Caverns vista**, the wonder beat. A new crew line and a new event unlock. |
| Return after hours | The return glide through the tunnel the crew dug, full carts, one tap to collect, then the next objective plate. |

---

## 8. Sources

Facts were taken from search-result extracts, because page fetches were blocked in this session. Treat fan-wiki and guide numbers as indicative.

**Lumi Master**
- [S1] allthings.how, "Lumi Master: How the Cozy Creature-Collecting Game Works": https://allthings.how/lumi-master-how-the-cozy-creature-collecting-game-works/ (with App Store and Google Play review excerpts: https://apps.apple.com/sg/app/lumi-master/id6754979232, https://play.google.com/store/apps/details?id=com.bilibili.lumi&hl=en)
- [S2] allthings.how, "Beginner Tips: Compass Multipliers and Energy Management": https://allthings.how/lumi-master-beginner-tips-compass-multipliers-and-energy-management/
- [S3] loadoutgg, "Lumi Master Beginner Guide: Systems, Mechanics & Terms": https://loadoutgg.com/lumi-master/basics/; lumimaster.wiki getting started: https://lumimaster.wiki/guides/getting-started/
- [S4] Google Play listing: https://play.google.com/store/apps/details?id=com.bilibili.lumi&hl=en; BlueStacks listing (ES/IT): https://www.bluestacks.com/campaign/com.bilibili.lumi/es/
- [S5] Pocket Gamer, release date: https://www.pocketgamer.com/lumi-master/release-date/; pre-registration: https://www.pocketgamer.com/lumi-master/pre-registration-android-ios/
- [S6] Inven Global, "A Healing Monster-Raising RPG Refined with Warm Colors": https://www.invenglobal.com/articles/23677/lumi-master-a-healing-monster-raising-rpg-refined-with-warm-colors; pre-registration: https://labs.invenglobal.com/articles/21265/bilibili-opens-pre-registration-for-monster-taming-healing-rpg-lumi-master
- [S7] MuMuPlayer, PC settings guide ("hand-drawn shaders"): https://www.mumuplayer.com/blog/lumi-master-pc-settings-guide.html (FR: https://www.mumuplayer.com/fr/blog/lumi-master-pc-settings-guide.html)
- [S8] MuMuPlayer, beginner guide: https://www.mumuplayer.com/blog/lumi-master-beginner-guide.html
- [S9] allthings.how, energy sources: https://allthings.how/lumi-master-where-to-get-more-energy-all-daily-sources/
- [S11] Final Weapon, launch: https://finalweapon.net/2026/09/16/lumi-master-is-available-now-on-ios-and-android/; Games Press: https://www.gamespress.com/Monster-Catching-Adventure-RPG-Lumi-Master-Hits-iOS-and-Android-Today
- [S12] AUTOMATON developer interview ("time-friendly", "capture quickly, train deeply"): https://automaton-media.com/en/interviews/new-monster-catching-rpg-lumi-master-lets-you-keep-using-your-favorite-monsters-forever-a-time-friendly-monster-rpg-capture-quickly-train-deeply-an-interview-with-the-de/

**Roblox simulators**
- [S13] Pet Simulator Wiki, Gamepasses (PS99: Auto Farm, Auto Tap): https://pet-simulator.fandom.com/wiki/Gamepasses_(Pet_Simulator_99)
- [S14] Bloxodes, PS99 rebirths: https://bloxodes.com/wiki/pet-simulator-99/rebirths
- [S15] Bloxodes, PS99 areas: https://bloxodes.com/wiki/pet-simulator-99/areas
- [S16] Pro Game Guides, all PS99 areas: https://progameguides.com/roblox/all-areas-in-pet-simulator-99-roblox/; DungeonPath beginner progression: https://dungeonpath.com/posts/pet-simulator-99/complete-beginner-progression-guide/
- [S17] GamerTweak, all PS99 areas: https://gamertweak.com/all-areas-pet-simulator-99/; The Nerd Stash: https://thenerdstash.com/all-biomes-in-pet-simulator-99-how-to-unlock-them/
- [S18] Sportskeeda, PS99 Prison World: https://www.sportskeeda.com/roblox-news/pet-simulator-99-prison-world-guide
- [S19] GINX, PS99 Elemental World: https://www.ginx.tv/en/pet-sim-99-elemental-world
- [S20] Pro Game Guides, rebirth fast in Mining Simulator 2: https://progameguides.com/roblox/how-to-rebirth-fast-in-roblox-mining-simulator-2/; Scribd script listing (auto-mine/sell/rebirth): https://www.scribd.com/document/793859845/ms-lua
- [S21] Roblox game page (Mining Simulator listing): https://www.roblox.com/games/10641401854
- [S22] Bee Swarm Simulator Wiki, Basic Bee Gate: https://bee-swarm-simulator.fandom.com/wiki/Basic_Bee_Gate
- [S23] Bee Swarm Simulator Wiki, Mountain Top Field: https://bee-swarm-simulator.fandom.com/wiki/Mountain_Top_Field
- [S24] Bee Swarm Simulator Wiki, Rose Field: https://bee-swarm-simulator.fandom.com/wiki/Rose_Field
- [S25] Deltia's Gaming, Dig beginner's guide: https://deltiasgaming.com/?p=272479; PCGamesN, Dig shovels tier list: https://www.pcgamesn.com/dig/shovels-tier-list; Destructoid: https://destructoid.com/roblox-dig-all-shovels-guide
- [S26] Beebom, The Forge wiki: https://beebom.com/the-forge-wiki/amp/; FRVR, pickaxe tier list: https://frvr.com/blog/roblox-the-forge-best-pickaxes-tier-list; esports.gg: https://esports.gg/guides/roblox/all-pickaxes-the-forge/
- [S27] esports.gg, Grow a Garden breaks the concurrency record: https://esports.gg/news/roblox/grow-a-garden-breaks-blox-fruits-record-for-most-concurrent-users-on-roblox/; Deltia's weather guide: https://deltiasgaming.com/?p=203882; mutation multipliers: https://deltiasgaming.com/?p=258963

**Move-only and auto-fire**
- [S28] GINX, DRG: Survivor mining speed: https://www.ginx.tv/en/survivor-increase-mining-speed
- [S29] SI Videogames, DRG: Survivor early access impressions: https://videogames.si.com/features/deep-rock-galactic-survivor-early-access-impression
- [S30] Gameluster, DRG: Survivor review: https://gameluster.com/deep-rock-galactic-survivor-review-rock-stone-and-bullets/
- [S31] iPhoneSoft, DRG: Survivor mobile: https://iphonesoft.fr/2025/09/30/deep-rock-galactic-survivor-mobile
- [S32] LootLevelChill, out now on mobile (portrait and landscape, free to try): https://lootlevelchill.com/?p=11031; Gematsu: https://www.gematsu.com/2025/09/deep-rock-galactic-survivor-coming-to-ios-android-in-november
- [S33] AndroidWorld, DRG: Survivor for Android: https://androidworld.nl/apps/deep-rock-galactic-survivor-voor-android-zo-verslavend-is-deze-mobiele-roguelite/
- [S34] Prima Games, best permanent upgrades: https://primagames.com/gaming/best-permanent-upgrades-to-unlock-first-in-deep-rock-galactic-survivor
- [S35] Dome Keeper Wiki, Mine: https://domekeeper.wiki.gg/wiki/Mine; PCGamesN, "Terraria meets Aliens": https://www.pcgamesn.com/dome-keeper/terraria-meets-aliens
- [S36] Shacknews, Dome Keeper review: https://shacknews.com/article/132448/dome-keeper-review; OpenCritic: https://opencritic.com/game/13733/dome-keeper/reviews
- [S37] games.gg, Archero: https://games.gg/archero/; GamePressure: https://www.gamepressure.com/games/archero/zc5f01
- [S38] Naavik, "Survivor.io: In Archero's Footsteps": https://naavik.co/deep-dives/survivorio-archeros-footsteps/
- [S39] PocketGamer.biz, how iteration transformed Survivor.io: https://www.pocketgamer.biz/feature/79592/how-innovation-and-iteration-has-transformed-survivorio/
- [S40] AppGamer, Survivor.io strategy (Chapter 9): https://www.appgamer.com/survivorio/strategy-guide/chapter-9-ranch
- [S41] Deconstructor of Fun, "The Magic of Legend of Mushroom": https://www.deconstructoroffun.com/blog/2024/4/15/the-magic-of-legend-of-mushroom; FoxData: https://foxdata.com/en/blogs/how-to-skyrocket-your-apps-revenue-unveiling-the-success-secrets-of-legend-of-mushroom/; WN Hub revenue: https://wnhub.io/news/finance/item-43484
- [S42] Pocket Gamer, Capybara Go: https://www.pocketgamer.com/ahead-of-the-game/capybara-go
- [S43] The Conversation, Vampire Survivors and gambling psychology: https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613
- [S44] J. Boger, "The Secret Sauce of Vampire Survivors": https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors
- [S45] Brotato, App Store listing: https://apps.apple.com/app/id1668755109
- [S46] Dexerto, Megabonk: https://www.dexerto.com/gaming/what-is-megabonk-viral-vampire-survivors-clone-3256658; TweakTown: https://www.tweaktown.com/news/108086/steams-new-big-game-attracts-100-000-players-who-want-to-grow-absurdly-powerful/index.html; WN Hub, 1M sales: https://wnhub.io/news/stores-and-publishing/item-49000
- [S47] TechRadar, Diablo Immortal hands-on: https://www.techradar.com/news/ive-played-diablo-immortal-how-blizzards-dark-action-rpg-plays-on-smartphones; Den of Geek controls: https://www.denofgeek.com/games/diablo-immortal-control-options-supported-controllers-mouse-keyboard; Game Informer review: https://gameinformer.com/review/diablo-immortal/the-price-of-playing-with-the-devil
- [S48] Can I Play That, Minecraft Dungeons mobility review: https://caniplaythat.com/2020/05/31/minecraft-dungeons-mobility-review/; Minecraft Feedback thread: https://feedback.minecraft.net/hc/en-us/community/posts/360067306312

**First person and tap-driven**
- [S49] Isthmus, Infinity Blade: https://isthmus.com/screens/games/infinity-blade-from-epic-games-is-a-touch-screen-triumph/; The SixthAxis hands-on: https://www.thesixthaxis.com/2010/12/09/hands-on-infinity-blade/; Unreal Engine showcase: https://www.unrealengine.com/showcase/infinity-blade
- [S50] TapSmart, Myst Mobile: https://www.tapsmart.com/news/myst-mobile-released/; realMyst App Store: https://apps.apple.com/app/id524988885; iMore, Myst for iPhone: https://www.imore.com/app-review-myst-iphone; Droid Life, Myst on Android: https://www.droid-life.com/2017/01/26/myst-android/; Nintendo World Report, Myst DS: https://nintendoworldreport.com/preview/15833
- [S51] MobyGames, The Room: https://www.mobygames.com/game/60395; App Store: https://apps.apple.com/app/552039496; Mechanics of Magic: https://mechanicsofmagic.com/?p=9723
- [S52] MacStories, Monument Valley review: https://www.macstories.net/reviews/monument-valley-review/; God is a Geek: https://godisageek.com/?p=143879
- [S53] Pocket Gamer, Legend of Grimrock review: https://www.pocketgamer.com/legend-of-grimrock/legend-of-grimrock/; AppUnwrapper iPad review: https://www.appunwrapper.com/2015/05/19/legend-of-grimrock-ipad-review/; TouchArcade review: https://toucharcade.com/2015/05/14/legend-of-grimrock-review/; App Store: https://apps.apple.com/us/app/legend-of-grimrock/id965096605
- [S54] Android Headlines, Hag's Castle and one-handed crawlers: https://www.androidheadlines.com/?p=760609; TouchArcade, Hag's Castle: https://toucharcade.com/2018/07/13/hags-castle-release-date/
- [S55] Shacknews, Wizardry Variants Daphne review: https://shacknews.com/article/141912/wizardry-variants-daphne-review-score; AUTOMATON, mobile performance: https://automaton-media.com/en/news/wizardry-variants-daphne-performs-strongly-on-mobile-ahead-of-steam-release-exceeding-developers-expectations/
- [S56] Wikipedia, Smash Hit: https://en.wikipedia.org/wiki/Smash_Hit; Cult of Mac review: https://www.cultofmac.com/268901/breaking-isnt-answer-smash-hit-doesnt-even-want-hear-question-review/; Common Sense Media: https://www.commonsensemedia.org/app-reviews/smash-hit
- [S57] Bulbapedia, Pokémon GO finding and catching: https://bulbapedia.bulbagarden.net/wiki/Appendix:Pok%C3%A9mon_GO_Player%27s_Guide/Finding_and_catching_Pok%C3%A9mon; Pokémon GO Wiki, Catching: https://pokemongo.fandom.com/wiki/Catching_Pok%C3%A9mon; Mein-MMO, AR off: https://mein-mmo.de/en/pokemon-go-tipps-ohne-kamera-pokemon,99962
- [S58] Minecraft Wiki, Pocket Edition: https://minecraft.gamepedia.com/Minecraft:_Pocket_Edition; Pocket Gamer review: https://www.pocketgamer.com/minecraft-pocket-edition/minecraft-pocket-edition-review/; Minecraft Feedback: https://feedback.minecraft.net/hc/en-us/community/posts/8961156524173
- [S59] Thumb Culture, A Game About Digging A Hole (PS5): https://www.thumbculture.co.uk/a-game-about-digging-a-hole-ps5-review; GameCell: https://www.gamecell.co.uk/reviews/a-game-about-digging-a-hole; The Twin Geeks: https://thetwingeeks.com/2025/04/17/a-game-about-digging-a-hole-down-in-a-hole/; The Xbox Hub: https://www.thexboxhub.com/a-game-about-digging-a-hole-review/; GameGrin: https://www.gamegrin.com/reviews/a-game-about-digging-a-hole-review/
- [S60] MassivelyOP, Raven2 autobattle: https://massivelyop.com/2025/11/29/fight-or-kite-raven2-is-beautiful-and-gruesome-but-it-goes-too-far-with-autobattler-gameplay/; Pocket Gamer, MapleStory M review: https://www.pocketgamer.com/maplestory-m/review/; MMOGames, Forsaken World Mobile: https://mmogames.com/articles/archives/forsaken-world-mobile-review
- [S61] PlaynForge, gaming motion sickness: https://www.playnforge.com/how-to-reduce-motion-sickness-while-gaming/; gamedev.net, 3D maze making people sick: https://gamedev.net/forums/topic/374574-3d-maze-simulation-making-peaple-sick/; Just Add Water, how Dig VR combats motion sickness: https://justaddwaterdevelopment.com/how-dig-vr-combats-motion-sickness/
- [S62] Godot Forum, tween-based grid movement: https://forum.godotengine.org/t/help-with-tween-based-movement-collision-through-move-and-slide/138061; Unity Discussions, grid-based first-person movement: https://discussions.unity.com/t/grid-based-first-person-movement-wizardry-eob-coh-style-c-script/667740

**Idle mining and economy**
- [S63] BlueStacks, Idle Miner Tycoon tips: https://www.bluestacks.com/blog/game-guides/idle-miner-tycoon/idt-tips-tricks-en.html; AppGamer hints: https://www.appgamer.com/idle-miner-tycoon/strategy-guide/idle-miner-hints-and-tips; SuperCheats walkthrough: https://www.supercheats.com/idle-miner-tycoon-cheats-tips-strategy/walkthrough/
- [S64] Tap Tap Dig, App Store: https://apps.apple.com/app/id1085983127
- [S65] Deep Town, App Store: https://apps.apple.com/us/app/idle-mining-factory-deep-town/id1202240058; APKMirror: https://apkmirror.com/apk/game-veterans/deep-town-mining-factory
- [S66] Mr. Mine, Steam: https://store.steampowered.com/app/1397920/MrMine/; App Store: https://apps.apple.com/app/id1659735369
- [S67] Tiny Miners: Clicker Game, App Store: https://apps.apple.com/us/app/id1264563028; Marlvel aggregate: https://marlvel.ai/apps/tiny-miners-clicker-game
- [S68] Game Developer, "Game Design Deep Dive: the digging mechanic in SteamWorld Dig": https://www.gamedeveloper.com/design/game-design-deep-dive-the-digging-mechanic-in-i-steamworld-dig-i-; God is a Geek, Nintendo UK interview: https://godisageek.com/2017/04/nintendo-uk-interviews-image-form-steamworld-dig-2-switch/
- [S69] Dig Away!, App Store: https://apps.apple.com/us/app/id1281490396; Pocket Gamer, best mining games (Super Miner, Overkill Drill): https://www.pocketgamer.com/best-games/mining-games/
- [S70] A. Pecorella, "The Math of Idle Games", Part I: https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i; Part II: https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii; GDC talk "Idle Games: The Mechanics and Monetization of Self-Playing Games": https://gdcvault.com/play/1022065/Idle-Games-The-Mechanics-and
- [S71] Unverified names: *Mining Fever* (itch.io): https://quveryfish.itch.io/mining-fever; *Coin Fever – Mining Clicker*: https://playgama.com/game/coin-fever--mining-clicker
