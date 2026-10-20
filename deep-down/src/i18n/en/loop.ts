// English text for the loop core: materials, cold, turn-back, cache, expedition, records.

export const loop = {
  // Materials
  'item.rootFibre': 'Root Fibre',
  'item.rootFibre.desc': 'Pale roots pulled from the cave soil. They twist into strong cord.',
  'item.echoShard': 'Echo Shard',
  'item.echoShard.desc': 'It keeps ringing long after you set it down.',

  // Runes (key items: never lost). The Ancient Tablet is the Lantern rune.
  'item.runeDescent': 'Descent Rune',
  'item.runeDescent.desc': 'A stone mark that points down.',
  'item.runeEye': 'Eye Rune',
  'item.runeEye.desc': 'A stone mark that watches.',
  'item.runeStar': 'Star Rune',
  'item.runeStar.desc': 'A stone mark with eight points.',
  'item.runeSpire': 'Spire Rune',
  'item.runeSpire.desc': 'A stone mark that climbs.',
  'item.runeGate': 'Gate Rune',
  'item.runeGate.desc': 'A stone mark that stands open.',
  'item.runeWaves': 'Waves Rune',
  'item.runeWaves.desc': 'A stone mark that never sits still.',
  'item.runeChasm': 'Chasm Rune',
  'item.runeChasm.desc': 'A stone mark split down the middle.',

  // Equipment tiers added by the loop
  'equip.attunedLantern': 'Attuned Lantern',
  'equip.attunedLantern.desc': 'Burns for fifteen minutes. Its ember keeps the cold away.',
  'equip.expeditionPack': 'Expedition Pack',
  'equip.expeditionPack.desc': '10 slots. The last 2 are a Sealed Pouch that survives a black-out.',
  'equip.stat.pouch': 'Sealed Pouch',

  // The deep tier's blocks (final pass W3)
  'block.echoCrystal': 'Echo Crystal',
  'block.ironbound': 'Ironbound Stone',

  // The upgrade tree (final pass W3): node names and behaviour sentences
  'recipe.surveyTable': 'Survey Table',
  'recipe.forge': 'Forge',
  'recipe.relicShelf': 'Relic Shelf',
  'recipe.ironPickaxe': 'Iron Pickaxe',
  'recipe.expeditionPack': 'Expedition Pack',
  'recipe.attunedLantern': 'Attuned Lantern',
  'recipe.gripBoots': 'Grip Boots',
  'recipe.minersCoat': "Miner's Coat",
  'recipe.glimmerPickaxe': 'Glimmer-edged Pickaxe',
  'node.copperPickaxe.does': 'Mines 60% faster, and breaks Hardened Slate and iron.',
  'node.sturdyPack.does': 'Carries 8 stacks instead of 6.',
  'node.copperLantern.does': 'Burns for 10 minutes and lights 14.5 m around you.',
  'node.surveyTable.does': 'Keeps your records and hears where the deep has stirred. Pick a rumour and the compass leads you there.',
  'node.forge.does': 'Opens the Forge: iron picks, the Expedition Pack and the Miner\'s Coat. A warm glow at camp.',
  'node.relicShelf.does': 'Holds the runes you bring back. Eight sockets wait.',
  'node.ironPickaxe.does': 'Mines 50% faster than copper, and breaks Echo crystal and Ironbound stone.',
  'node.expeditionPack.does': '10 slots. The last 2 are a Sealed Pouch: what is in them survives a black-out.',
  'node.attunedLantern.does': 'Burns for 15 minutes, lights 16 m, and its ember keeps the cold away.',
  'node.gripBoots.does': 'Jump almost twice as high, and drop 7 m without harm.',
  'node.minersCoat.does': 'Seven hearts instead of five, and the cold bites half as hard.',
  'node.glimmerPickaxe.does': 'The fastest pick: mines 40% faster than iron.',
  'equip.ironPickaxe': 'Iron Pickaxe',
  'equip.ironPickaxe.desc': 'Mining speed +140%. Breaks Echo crystal and Ironbound stone.',
  'equip.glimmerPickaxe': 'Glimmer-edged Pickaxe',
  'equip.glimmerPickaxe.desc': 'Mining speed +240%. The edge never dulls.',
  'gear.gripBoots': 'Grip Boots',
  'gear.minersCoat': "Miner's Coat",
  'place.workbench': 'Workbench',
  'place.forge': 'Forge',
  'place.camp': 'Camp',
  'place.field': 'Field',
  'prereq.rift': 'the rift floor',
  'prereq.rune': 'a rune',
  'craft.lockedNode': 'Make the {item} first',
  'craft.lockedStation': 'Build the {item} first',
  'craft.lockedRift': 'Reach the rift floor first',
  'craft.lockedRune': 'Appears with your first rune',
  'craft.notHere': 'Only at camp',
  'craft.carryToSite': 'Carry it to the site',
  'craft.missingNode': 'Missing materials',
  'craft.stat.jump': 'Jump height',
  'craft.stat.safeFall': 'Safe drop',
  'craft.stat.health': 'Hearts',
  'craft.stat.cold': 'Cold damage',
  'craft.stat.metres': '{value} m',
  'craft.stat.percent': '{value}%',
  'craft.stat.count': '{value}',
  'toast.built': '{item} built',
  'toast.made': '{item} made',

  // Lantern, turn-back and cold
  'toast.turnBack': 'Turn back — about {s} s to camp',
  'hint.cold': 'The cold bites. Get back to the light.',

  // The pack left behind
  'hud.cacheDistance': 'Pack {distance} m',
  'toast.cacheRecovered': 'Recovered your pack: {count} items',
  'toast.cacheRecoveredPartial': 'Recovered {count} items. {left} still wait in your pack.',
  'toast.cacheReplaced': 'Your earlier pack is gone: {count} items lost',
  'death.cached': 'Left in your pack',
  'death.cacheAt': 'Your pack lies at -{depth} m — {count} items',
  'death.cacheReplaced': 'The pack you left before is gone: {count} items lost.',
  'death.pouchKept': 'Kept safe in the Sealed Pouch',

  // The Next line (objective pill)
  'next.recoverPack': 'Recover your pack — {distance} m',
  'next.craft': 'Next: {item} — {material} {have}/{need}',
  'next.craftReady': 'Next: craft the {item} at the Workbench',
  'next.deeper': 'Go deeper — your best is -{depth} m',
  'next.readyForge': 'Next: forge the {item} at the Forge',
  'next.readyCamp': 'Next: build the {item} at camp',
  'next.runes': 'Find the runes — {have}/{total}',
  'next.stone': 'Take the eight runes to the black stone',

  // Camp stations (final pass W3)
  'hint.plotBuild': 'Build the {item}',
  'hint.plotShelf': 'Relic Shelf — it waits for a rune',
  'hint.useForge': 'Use the Forge',
  'hint.useTable': 'Survey Table',
  'hint.useShelf': 'Relic Shelf',

  // Expedition and records
  'toast.depthRecord': 'New depth record: -{depth} m',

  // Saves
  'save.worldShifted': 'The Hollow has shifted since your last visit. You wake at camp; your finds and gear are safe.',
  'save.itemsDropped': 'Your save held {count} items this version does not know. They were removed.',
} as const;
