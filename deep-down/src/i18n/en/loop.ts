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

  // Expedition and records
  'toast.depthRecord': 'New depth record: -{depth} m',

  // Saves
  'save.worldShifted': 'The Hollow has shifted since your last visit. You wake at camp; your finds and gear are safe.',
  'save.itemsDropped': 'Your save held {count} items this version does not know. They were removed.',
} as const;
