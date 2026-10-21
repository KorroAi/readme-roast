// English text for the lore: Halden notes, murals, seal cards and Echo fragments (W1: Topsoil and Glowroot; the rest from W3).
// Owner: the economy and rules workstream (BUILD §0.9).
//
// Keys are the model's lore ids (`lore:<biome>:<id>`, ids note0..2, mural, seal), so the shell reads a note with `t(loreId)`.
// The Codex's `idle.lore.<biome>.<id>.body` lines for these biomes point here (idleCore.ts), one text per entry.

export const idleLore = {
  // ----- Topsoil (biome 0): the Halden notes of the six authored chambers --------------------------------------
  // C3 the Lamp Room: under the lamp that still burns.
  'lore:0:note0': 'Day 40. Lamp seen below the lift. Nobody of ours is down there.',
  // C5 the Cache: a crate manifest.
  'lore:0:note1': 'Manifest. Lamp oil, forty measures, sent below. Forty more next week. Nobody signs for it.',
  // C6 the Lift Bottom: the hoist log, its last page.
  'lore:0:note2': 'Hoist log. Day 41: we knocked on the hatch. Day 42: something knocked back.',
  'lore:0:mural': 'A lamp and a hand, cut into the lintel. The hand is reaching down.',
  // The Halden Hatch's seal card (shown when it splits).
  'lore:0:seal': 'Sealed by the Halden. Opened by you. The hatch was locked from below.',
  // ----- Glowroot (biome 1) -------------------------------------------------------------------------------------
  'lore:1:note0': 'The roots lean toward the lamp. Like they remember one.',
  'lore:1:note1': 'Carved lintels in the root cellars. Older than any Halden mark.',
  'lore:1:note2': 'The roots brighten when a lamp passes. They stay dark for the foreman.',
  'lore:1:mural': 'Roots wrapped around a figure with a lantern. The roots are holding it up.',
  'lore:1:seal': 'The Root Knot held. It was not keeping us out. It was keeping the light in.',
  // ----- the Crystal Grotto (biome 2: past the Root Knot, which opens in the next build) ------------------------------
  'lore:2:note0': 'The crystals grew after the builders. Along their paths.',
  'lore:2:note1': 'A hand in the crystal. Fingers open, like it let go of something.',
  'lore:2:note2': 'Every crystal faces the same way. Down.',
  'lore:2:mural': 'Paths of light, drawn on the wall, all ending at one point below.',
  'lore:2:seal': 'The Prism Lock broke the light into colours. You put it back together.',
} as const;
