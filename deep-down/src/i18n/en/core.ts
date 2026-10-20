// Core text: the title, the shell's menus and settings, the block names (config/blocks.ts) and the player-facing
// errors. Pruned to the strings still used after the idle pivot; each workstream adds its own keys in its section
// file (see ../en.ts).

export const core = {
  // Title & menus
  'game.title': 'DEEP DOWN',
  'game.tagline': 'FOLLOW THE LIGHT DOWN',
  'menu.settings': 'Settings',
  'menu.back': 'Back',
  'menu.version': 'v{version} · made entirely in code',
  'menu.timeJustNow': 'just now',
  'menu.timeMinute': '1 minute ago',
  'menu.timeMinutes': '{n} minutes ago',
  'menu.timeHour': '1 hour ago',
  'menu.timeHours': '{n} hours ago',
  'menu.timeYesterday': 'yesterday',
  'menu.timeDays': '{n} days ago',

  // Settings
  'settings.title': 'Settings',
  'settings.graphics': 'Graphics',
  'settings.quality': 'Quality',
  'settings.quality.battery': 'Battery (30 FPS)',
  'settings.quality.balanced': 'Balanced',
  'settings.quality.high': 'High',
  'settings.brightness': 'Brightness',
  'settings.showFps': 'Show performance',
  'settings.leftHanded': 'Swap sides (left-handed)',
  'settings.audio': 'Audio',
  'settings.master': 'Master volume',
  'settings.music': 'Music',
  'settings.sfx': 'Effects',
  'settings.accessibility': 'Accessibility',
  'settings.cameraShake': 'Camera shake',
  'settings.textSize': 'Text size',
  'settings.textSize.normal': 'Normal',
  'settings.textSize.large': 'Large',
  'settings.highContrast': 'High contrast outlines',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.reset': 'Reset to defaults',
  'settings.deleteSaveNo': 'Cancel',
  'settings.resetDone': 'Settings restored to defaults',
  'settings.percent': '{value}%',
  'settings.multiplier': '{value}×',

  // HUD
  'hud.depthValue': '{depth} m',

  // Blocks
  'block.air': 'Air',
  'block.slate': 'Slate',
  'block.deepSlate': 'Deep Slate',
  'block.umber': 'Umber Stone',
  'block.soil': 'Cave Soil',
  'block.gravel': 'Gravel',
  'block.moss': 'Lichen Stone',
  'block.copperOre': 'Copper Vein',
  'block.ironOre': 'Iron Vein',
  'block.crystal': 'Glimmer Crystal',
  'block.hardenedSlate': 'Hardened Slate',
  'block.ancientBrick': 'Ancient Ashlar',
  'block.ancientTile': 'Ancient Tile',
  'block.crumblingBrick': 'Loose Masonry',
  'block.glyphStone': 'Glyph Stone',
  'block.plank': 'Wooden Planks',
  'block.beam': 'Support Beam',
  'block.hearth': 'Hearth Stone',
  'block.bedrock': 'Abyssal Bedrock',
  'block.light': 'Light',

  // Equipment (read by src/config/balance.ts, A's old-game table, until it is dropped there)
  'equip.rustyPickaxe': 'Rusty Pickaxe',
  'equip.copperPickaxe': 'Copper Pickaxe',
  'equip.oilLantern': 'Weak Oil Lantern',
  'equip.copperLantern': 'Copper Lantern',
  'equip.rustyPickaxe.desc': 'Chipped and stained. It still bites stone.',
  'equip.copperPickaxe.desc': 'Mining speed +60%. Breaks Hardened Slate and Iron.',
  'equip.oilLantern.desc': 'A small, flickering flame.',
  'equip.copperLantern.desc': 'Light radius +35%. Burns twice as long.',

  // Errors (player-facing)
  'error.webgl': 'Your device does not support the graphics features DEEP DOWN needs (WebGL 2).',
  'error.webviewOutdated': 'DEEP DOWN needs a newer browser engine. Please update Android System WebView (or Chrome) and try again.',
  'error.generic': 'Something went wrong. Please restart the game.',

} as const;
