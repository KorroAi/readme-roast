/**
 * Round 3 (UI): pixel art for every item LOOP added (BRIEF §0.4: ores, gems, ingots, creature parts,
 * picks I–VI, weapons, armour sets, lanterns, packs, food, potions, bombs, building items, stations,
 * the outpost kit, key items). Each icon kind LOOP names on the item (`ItemDef.icon.kind`) has a
 * 16 x 16 template; the item's own colour paints it (light, mid, dark, deep from one hex), with fixed
 * wood, steel, rock, flame and paper tones around it, so a tier or a set reads at a glance (a copper
 * pick, a frost-iron pick; a fur hood, an ember helm). A few ids get their own shape (an axe, a
 * stew, a slingshot, the Furnace). Pure data and functions: sprites.ts rasterises them.
 */
import { ITEMS, type ItemDef } from '../config/items';
import { LANTERN_ROWS, PICKAXE_ROWS, STURDY_PACK_ROWS, type Palette } from './sprites';

export interface ItemArt {
  rows: readonly string[];
  palette: Palette;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const pack = (r: number, g: number, b: number) => (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);

/** Scale a colour's brightness. */
export function shadeOf(c: number, k: number): number {
  const [r, g, b] = rgb(c);
  return pack(r * k, g * k, b * k);
}

/** Mix a colour toward another (t = 0: a, 1: b). */
export function mixOf(a: number, b: number, t: number): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return pack(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** The four tones of an item colour: G glint, L light, M mid, D dark, K deep. */
function tones(c: number): Palette {
  return { G: mixOf(c, 0xffffff, 0.62), L: mixOf(shadeOf(c, 1.25), 0xffffff, 0.18), M: c, D: shadeOf(c, 0.58), K: shadeOf(c, 0.32) };
}

const WOOD: Palette = { W: 0xa07448, w: 0x5e4029 };
const STEEL: Palette = { S: 0xd6dce4, s: 0x7a8490 };
const ROCK: Palette = { R: 0x7d746c, r: 0x5d554f, q: 0x3b3531 };
const FLAME: Palette = { F: 0xffb347, f: 0xe0602a, Y: 0xfff1b0 };
const PAPER: Palette = { P: 0xf0e6cc, p: 0xbcab88 };

// ---------------------------------------------------------------------------------------
// Templates (16 x 16; '.' is transparent).

const ORE = [
  '................',
  '................',
  '.....qqqqqq.....',
  '...qqRRRRRRqq...',
  '..qRRRrrLMRRRq..',
  '..qRrrrLMMDrRq..',
  '.qRrLMrrMDrrrRq.',
  '.qRrMMDrrrrLMRq.',
  '.qRrrDrrLMrMDRq.',
  '.qRrrrrLMMDrrRq.',
  '..qRLMrrMDrrRq..',
  '..qRMDrrrrrRRq..',
  '...qqRRrrRRqq...',
  '.....qqqqqq.....',
  '................',
  '................',
];

const GEM = [
  '................',
  '................',
  '................',
  '.....LLLLLL.....',
  '....LGGLLMMM....',
  '...LGLLLMMMMD...',
  '..LLLLLMMMMMDD..',
  '..MMMMMMMMMDDD..',
  '...MMMMMMMDDD...',
  '....MMMMMDDD....',
  '.....MMMMDD.....',
  '......MMDD......',
  '.......MD.......',
  '................',
  '................',
  '................',
];

const SHARD = [
  '................',
  '.........L......',
  '........LMD.....',
  '...L....LMD.....',
  '..LMD..LGMD.....',
  '..LMD..LGMD..L..',
  '..LGMD.LMMD.LMD.',
  '..LMMD.LMMDLGMD.',
  '...LMMDLMMDLMD..',
  '...LMMDLMMDMMD..',
  '....LMDLMMMMD...',
  '....qRRRRRRRq...',
  '...qRrrrrrrrRq..',
  '....qqqqqqqqq...',
  '................',
  '................',
];

const INGOT = [
  '................',
  '................',
  '................',
  '................',
  '.....GGLLLLLL...',
  '....GLLLLLLLLM..',
  '...LLLLLLLLLLMD.',
  '..MMMMMMMMMMMDD.',
  '..MMKKKKKKKMMDD.',
  '..MMMMMMMMMMMD..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const CUBE = [
  '................',
  '.......LL.......',
  '.....LLGLLL.....',
  '...LLLLLLLLLL...',
  '..MLLLLLLLLLLD..',
  '..MMMLLLLLLDDD..',
  '..MMMMMLLDDDDD..',
  '..MMMMMMDDDDDD..',
  '..MMMMMMDDDDDD..',
  '..MMMMMMDDDDDD..',
  '...MMMMMDDDDD...',
  '.....MMMDDD.....',
  '.......MD.......',
  '................',
  '................',
  '................',
];

const LOG = [
  '................',
  '................',
  '................',
  '................',
  '...DDDDDDDDLL...',
  '..DMMMMMMMMLGL..',
  '..MMMDMMMMLMDML.',
  '..MMMMMMDMLMKML.',
  '..MDMMMMMMLMDML.',
  '..DMMMMDMMMLGL..',
  '...DDDDDDDDLL...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const SCRAP = [
  '................',
  '................',
  '....s...........',
  '...sSs..........',
  '..sSSSs....ss...',
  '...sSSSs..sSSs..',
  '....sSMMs.sSSSs.',
  '.....sMMDsSSSs..',
  '....sMMMDDsSs...',
  '...sMMDDDs.s....',
  '..sMMDDs........',
  '...sDDs..sSs....',
  '....ss..sSSSs...',
  '.........sss....',
  '................',
  '................',
];

const DROP = [
  '................',
  '.......L........',
  '......LM........',
  '......LMD.......',
  '.....LGMMD......',
  '.....LMMMD......',
  '....LGMMMMD.....',
  '....LMMMMMD.....',
  '...LMMMMMMMD....',
  '...LMMMMMMMD....',
  '...MMMMMMMMD....',
  '....MMMMMMD.....',
  '.....DDDDD......',
  '................',
  '................',
  '................',
];

const VINE = [
  '................',
  '..........LL....',
  '.........LGML...',
  '..........LMD...',
  '.....LL..MD.....',
  '....LGML.MD.....',
  '.....LMDMD......',
  '.......MDD......',
  '.......MD..LL...',
  '......MD..LGML..',
  '......MDMMLMD...',
  '.....MD..DD.....',
  '.....MD.........',
  '....MD..........',
  '....D...........',
  '................',
];

const PLATE = [
  '................',
  '................',
  '......LLLL......',
  '....LLGLLMMM....',
  '...LGLLMMMMMD...',
  '...LLMMMDMMMD...',
  '..LMMMDMMMDMMD..',
  '..LMMDMMMDMMMD..',
  '..MMDMMMDMMMDD..',
  '...MMMMMMMMDD...',
  '....DDMMMMDD....',
  '......DDDD......',
  '................',
  '................',
  '................',
  '................',
];

const HIDE = [
  '................',
  '................',
  '...LL......LL...',
  '..LMML....LMMD..',
  '..LMMMLLLLMMMD..',
  '...LMMMMMMMMD...',
  '...LMMDMMMMMD...',
  '..LMMMMMMDMMMD..',
  '..LMMMMMMMMMMD..',
  '...LMMDMMMMMD...',
  '...LMMMMMMDMD...',
  '..LMMMMDDMMMMD..',
  '..DMMD....DMMD..',
  '...DD......DD...',
  '................',
  '................',
];

const BLOB = [
  '................',
  '................',
  '................',
  '......LLLL......',
  '....LLGGLMMM....',
  '...LLGGLMMMMM...',
  '..LLLLLMMMMMMD..',
  '..LLMMMMMMMMMD..',
  '..LMMMMMMMMMMD..',
  '..MMMMMMMMMMDD..',
  '...MMMMMMMMDD...',
  '..DDMMMMMMDDDD..',
  '...DDDDDDDDDD...',
  '................',
  '................',
  '................',
];

const FANG = [
  '................',
  '................',
  '....LLLLLLLL....',
  '....LGLLLLLMD...',
  '.....LLLLLMMD...',
  '.....LLLLMMD....',
  '......LLLMMD....',
  '......LLMMD.....',
  '.......LMMD.....',
  '.......LMD......',
  '........MD......',
  '........D.......',
  '................',
  '................',
  '................',
  '................',
];

const FUR = [
  '................',
  '................',
  '.....L..L.......',
  '....LML.LML..L..',
  '...LMLMLMMLLML..',
  '..LMMMLMMMMMMLD.',
  '..LGMMMMMLMMMMD.',
  '..LMMMMLMMMMMMD.',
  '...LMMMMMMMMMMD.',
  '...LMMMMMMLMMD..',
  '....DMMMMMMMDD..',
  '.....DDDDDDDD...',
  '................',
  '................',
  '................',
  '................',
];

const SAC = [
  '................',
  '.......ww.......',
  '......wWWw......',
  '.......LL.......',
  '.....LLLLMM.....',
  '....LGLMMMMD....',
  '...LGLMMDMMMD...',
  '...LLMMMMMDMD...',
  '...LMMDMMMMMD...',
  '...MMMMMDMMMD...',
  '....MMMMMMMD....',
  '.....DDDDDD.....',
  '................',
  '................',
  '................',
  '................',
];

const CORE = [
  '................',
  '................',
  '.......Y........',
  '......YFY.......',
  '....LLLLLLL.....',
  '...LGGLLMMMD....',
  '..LGYGLMMMMMD...',
  '..LGGLMMMMMMD..Y',
  '..LLLMMMMMMMD...',
  '..LMMMMMMMMDD...',
  '...MMMMMMMDD....',
  '....DDMMMDD.....',
  '......DDD...Y...',
  '...Y............',
  '................',
  '................',
];

const WISP = [
  '................',
  '..........LL....',
  '........LLGL....',
  '.......LMML.....',
  '......LMMD......',
  '.....LMMD..LL...',
  '....LMMD..LGML..',
  '....LMD..LMMMD..',
  '....LMD.LMMMD...',
  '....LMMDMMMD....',
  '.....LMMMMD.....',
  '......DMMD......',
  '.......DD.......',
  '................',
  '................',
  '................',
];

const SWORD = [
  '................',
  '.............GL.',
  '............GLM.',
  '...........GLMD.',
  '..........GLMD..',
  '.........GLMD...',
  '........GLMD....',
  '.......GLMD.....',
  '..S...GLMD......',
  '...S.GLMD.......',
  '....SSMD........',
  '....wSSS........',
  '...wW..S........',
  '..wW............',
  '.Kw.............',
  '................',
];

const MACHETE = [
  '................',
  '................',
  '..........LLL...',
  '.........LLGMD..',
  '........LLMMD...',
  '.......LLMMD....',
  '......LLMMD.....',
  '.....LLMMD......',
  '....LLMMD.......',
  '...SSMMD........',
  '...SsDD.........',
  '..wWS...........',
  '.wWw............',
  '.ww.............',
  '................',
  '................',
];

const AXE = [
  '................',
  '..........LLL...',
  '.........LGMML..',
  '........LGMMMML.',
  '.......wWLMMMMM.',
  '......wW.DMMMMD.',
  '.....wW...DMMD..',
  '....wW.....DD...',
  '...wW...........',
  '..wW............',
  '.wW.............',
  '.w..............',
  '................',
  '................',
  '................',
  '................',
];

const SPEAR = [
  '................',
  '.............LG.',
  '............LGMG',
  '...........LMMD.',
  '..........LMMD..',
  '.........SDD....',
  '........wS......',
  '.......wW.......',
  '......wW........',
  '.....wW.........',
  '....wW..........',
  '...wW...........',
  '..wW............',
  '.wW.............',
  '.w..............',
  '................',
];

const CROSSBOW = [
  '................',
  '................',
  '..L..........L..',
  '..LM........ML..',
  '...LM......MD...',
  '....LMKKKKMD....',
  '.....LwwwwD.....',
  '......wWWw......',
  '.......WS.......',
  '.......WS.......',
  '.......Ww.......',
  '.......Ww.......',
  '......wWWw......',
  '.......ww.......',
  '................',
  '................',
];

const SLING = [
  '................',
  '...WW......WW...',
  '...Ww......Ww...',
  '....W.MMMM.W....',
  '....Ww.MD.wW....',
  '.....WwMDwW.....',
  '......WWWW......',
  '.......Ww.......',
  '.......Ww.......',
  '.......Ww.......',
  '.......Ww.......',
  '.......Ww.......',
  '.......ww.......',
  '................',
  '................',
  '................',
];

const BOMB = [
  '................',
  '...........F....',
  '..........FY....',
  '.........ww.....',
  '........w.......',
  '......SSSS......',
  '.....DMMMMD.....',
  '....DMLLMMMD....',
  '...DMLGLMMMMD...',
  '...DMLLMMMMMD...',
  '...DMMMMMMMMD...',
  '...DMMMMMMMDD...',
  '....DMMMMMDD....',
  '.....DDDDDD.....',
  '................',
  '................',
];

const FLARE = [
  '................',
  '..........FF....',
  '.........FYYF...',
  '.........FYYF...',
  '..........ff....',
  '.........MMM....',
  '........MMMD....',
  '.......MMMD.....',
  '......MMMD......',
  '.....MMMD.......',
  '....MMMD........',
  '...DMMD.........',
  '...DDD..........',
  '................',
  '................',
  '................',
];

const HELMET = [
  '................',
  '................',
  '................',
  '.......FF.......',
  '.....LLYFLL.....',
  '....LLMMMMMM....',
  '...LMMMMMMMMD...',
  '...MMMMMMMMMD...',
  '..LMMMMMMMMMMD..',
  '..DDDDDDDDDDDD..',
  '.DDKKKKKKKKKKDD.',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const COAT = [
  '................',
  '................',
  '....MM....MM....',
  '...LMMD..LMMD...',
  '..LMMMMDDMMMMD..',
  '..LMMMMMMMMMMD..',
  '..LMLMMMMMMMMD..',
  '...LMMMMMMMMD...',
  '...LMMMSSMMMD...',
  '...LMMMMMMMMD...',
  '...LMMMMMMMMD...',
  '...LMMMMMMMMD...',
  '...DDDDDDDDDD...',
  '................',
  '................',
  '................',
];

const BOOTS = [
  '................',
  '................',
  '................',
  '...LMMD.........',
  '...LMMD..LMMD...',
  '...LMMD..LMMD...',
  '...LMMD..LMMD...',
  '...LMMMD.LMMD...',
  '...LMMMMDLMMMD..',
  '...LMMMMMLMMMMD.',
  '...DDDDDDLMMMMMD',
  '...KKKKKKDDDDDDD',
  '.........KKKKKKK',
  '................',
  '................',
  '................',
];

const MUSHROOM = [
  '................',
  '................',
  '.....LLLLLL.....',
  '...LLGLMMMMM....',
  '..LMGMMMMMMMD...',
  '..MMMMMMMMMMMD..',
  '..DMMMMMMMMMDD..',
  '...DDDDDDDDDD...',
  '......PPPp......',
  '......PPPp......',
  '......PPPp......',
  '.....PPPPpp.....',
  '.....pppppp.....',
  '................',
  '................',
  '................',
];

const STEW = [
  '................',
  '.......Y........',
  '......Y..Y......',
  '.......Y........',
  '................',
  '..LLLLLLLLLLLL..',
  '..MMMMMMMMMMMM..',
  '..WWWWWWWWWWWw..',
  '..WWWWWWWWWWww..',
  '...wWWWWWWWww...',
  '....wwwwwwww....',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const ROLL = [
  '................',
  '................',
  '................',
  '....PPPPPPPP....',
  '...PPPPPPPPPp...',
  '..PPpppPPPPPPp..',
  '..PpPPPpPPPPPp..',
  '..PpPMPpPPPPPp..',
  '..PpPPPpPPPPPp..',
  '..PPpppPPPPPPp..',
  '...PPPPPPPPPp...',
  '....pppppppp....',
  '................',
  '................',
  '................',
  '................',
];

const POTION = [
  '................',
  '......wwww......',
  '......WWWW......',
  '.......SS.......',
  '.......SS.......',
  '......SSSS......',
  '.....SLLMMS.....',
  '....SLGMMMMS....',
  '....SLMMMMMS....',
  '....SMMMMMMS....',
  '....SMMMMMDS....',
  '....SDMMMDDS....',
  '.....SSSSSS.....',
  '................',
  '................',
  '................',
];

const TORCH = [
  '................',
  '.......F........',
  '......FYF.......',
  '.....FYYYF......',
  '.....fYYYf......',
  '......fFf.......',
  '......MMM.......',
  '......WWw.......',
  '......WWw.......',
  '......WWw.......',
  '......WWw.......',
  '......WWw.......',
  '......Www.......',
  '......www.......',
  '................',
  '................',
];

const LADDER = [
  '................',
  '....Ww....Ww....',
  '....WwWWWWWw....',
  '....Ww....Ww....',
  '....Ww....Ww....',
  '....WwWWWWWw....',
  '....Ww....Ww....',
  '....Ww....Ww....',
  '....WwWWWWWw....',
  '....Ww....Ww....',
  '....Ww....Ww....',
  '....WwWWWWWw....',
  '....Ww....Ww....',
  '....ww....ww....',
  '................',
  '................',
];

const ROPE = [
  '................',
  '................',
  '.....LLLLLL.....',
  '...LLMMMMMMLL...',
  '..LMMDDDDDDMML..',
  '..LMD......DML..',
  '..MD..LLLL..DM..',
  '..MD.LMMMML.DM..',
  '..MD.MD..DM.DM..',
  '..MD.LMMMML.DM..',
  '..LMD.DDDD.DML..',
  '...LMMDDDDMML...',
  '.....MMMMMMDM...',
  '.............M..',
  '.............D..',
  '................',
];

const DOOR = [
  '................',
  '....wwwwwwww....',
  '...wWWWWWWWWw...',
  '...wWwWWWWwWw...',
  '...wWwWWWWwWw...',
  '...wWwWWWWwWw...',
  '...wWWWWWWWWw...',
  '...wWWWWWWSWw...',
  '...wWwWWWWwWw...',
  '...wWwWWWWwWw...',
  '...wWwWWWWwWw...',
  '...wWWWWWWWWw...',
  '...wwwwwwwwww...',
  '................',
  '................',
  '................',
];

const FURNACE = [
  '................',
  '.....qqqqqq.....',
  '....qRRRRRRq....',
  '...qRRrrrrRRq...',
  '...qRrrrrrrRq...',
  '..qRRRRRRRRRRq..',
  '..qRrKKKKKKrRq..',
  '..qRrKFFfFKrRq..',
  '..qRrKFYYFKrRq..',
  '..qRrKfFFfKrRq..',
  '..qRRRRRRRRRRq..',
  '..qqqqqqqqqqqq..',
  '................',
  '................',
  '................',
  '................',
];

const ANVIL = [
  '................',
  '................',
  '................',
  '.......F..Y.....',
  '..SSSSSSSSSS....',
  '.SSSSSSSSSSSsS..',
  '..sSSSSSSSSss...',
  '....sSSSSss.....',
  '.....SSSs.......',
  '.....sSSs.......',
  '....SSSSSs......',
  '...sSSSSSSs.....',
  '...ssssssss.....',
  '................',
  '................',
  '................',
];

const TABLE = [
  '................',
  '.......S........',
  '......SMS.......',
  '.....SMGMS......',
  '.....SMMMS......',
  '......SSS.......',
  '.WWWWWWWWWWWWWW.',
  '.wwwwwwwwwwwwww.',
  '..w..........w..',
  '..w..........w..',
  '..w..........w..',
  '..w..........w..',
  '................',
  '................',
  '................',
  '................',
];

const TENT = [
  '................',
  '................',
  '.......M........',
  '......MML.......',
  '.....MMDLL......',
  '....MMDDDLL.....',
  '...MMDD.DDLL....',
  '..MMDD.F.DDLL...',
  '.MMDD.FYF.DDLL..',
  '.DDDD.....DDDD..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const PAGE = [
  '................',
  '...PPPPPPPP.....',
  '...PPPPPPPPp....',
  '...PpppppPPPp...',
  '...PPPPPPPPPp...',
  '...PpppppppPp...',
  '...PPPPPPPPPp...',
  '...PppppppPPp...',
  '...PPPPPPPPPp...',
  '...PpppppppPp...',
  '...PPPPPPPPPp...',
  '...pppppppppp...',
  '................',
  '................',
  '................',
  '................',
];

const HEART = [
  '................',
  '................',
  '...LLL...LLL....',
  '..LGGML.LMMMD...',
  '..LGMMMLMMMMD...',
  '..LMMMMMMMMMD...',
  '...MMMMMMMMD....',
  '....MMMMMMD.....',
  '.....MMMMD......',
  '......MMD.......',
  '.......D........',
  '................',
  '................',
  '................',
  '................',
  '................',
];

let templates: Record<string, readonly string[]> | null = null;

/**
 * Templates by icon kind (ItemIcon['kind']), plus the id-specific shapes. Built on first use: the
 * pick, lantern and pack rows come from sprites.ts, which imports this module (no cycle at load).
 */
export function itemTemplates(): Record<string, readonly string[]> {
  templates ??= {
    ore: ORE, gem: GEM, shard: SHARD, ingot: INGOT, cube: CUBE, log: LOG, scrap: SCRAP, drop: DROP, vine: VINE,
    plate: PLATE, hide: HIDE, blob: BLOB, fang: FANG, fur: FUR, sac: SAC, core: CORE, wisp: WISP,
    pick: PICKAXE_ROWS, blade: SWORD, machete: MACHETE, axe: AXE, spear: SPEAR, bow: CROSSBOW, sling: SLING,
    bomb: BOMB, flare: FLARE, helmet: HELMET, chest: COAT, boots: BOOTS, lantern: LANTERN_ROWS, pack: STURDY_PACK_ROWS,
    food: MUSHROOM, stew: STEW, roll: ROLL, potion: POTION, torch: TORCH, ladder: LADDER, rope: ROPE, door: DOOR,
    station: FURNACE, furnace: FURNACE, forge: ANVIL, alchemy: TABLE, kit: TENT, page: PAGE, heart: HEART,
  };
  return templates;
}

/** Ids whose shape differs from their kind's (a log of wood, a stew bowl, an axe...). */
const SHAPE_OF: Record<string, string> = {
  fungalWood: 'log', heartwood: 'log', haldenScrap: 'scrap', blackOil: 'drop', glowvine: 'vine', rootFibre: 'vine',
  chitin: 'plate', hide: 'hide', gel: 'blob', fang: 'fang', frostFur: 'fur', venomSac: 'sac', emberCore: 'core', voidEssence: 'wisp',
  machete: 'machete', greatAxe: 'axe', sling: 'sling', flare: 'flare',
  caveStew: 'stew', bandage: 'roll', furnace: 'furnace', forge: 'forge', alchemyTable: 'alchemy',
  glass: 'cube', brick: 'cube', plank: 'cube', stone: 'cube',
};

/** The template name an item is drawn with. */
export function shapeOf(def: Pick<ItemDef, 'id' | 'icon' | 'kind'>): string {
  const own = SHAPE_OF[def.id];
  if (own) return own;
  const k = def.icon.kind;
  if (k === 'tablet') return 'page';
  return itemTemplates()[k] ? k : 'ore';
}

/** The palette an item's template is painted with: its colour's tones plus the fixed materials. */
export function paletteOf(def: Pick<ItemDef, 'id' | 'color'>, shape: string): Palette {
  const c = def.color;
  const t = tones(c);
  switch (shape) {
    case 'pick':
      // PICKAXE_ROWS: L/H/D head, W/w handle.
      return { L: t.L, H: t.M, D: t.D, ...WOOD };
    case 'lantern':
      // LANTERN_ROWS: M frame, H highlight, D dark, g glass rim, Y flame, W core.
      return { M: c, H: t.L, D: t.D, g: mixOf(c, 0x8a5a2a, 0.5), Y: 0xffb35c, W: 0xfff0d0 };
    case 'pack':
      // STURDY_PACK_ROWS: D/b dark, R/r straps, B body, L/P panels, K buckle.
      return { D: t.K, R: mixOf(c, 0xd8c7a4, 0.6), r: mixOf(c, 0xa4916f, 0.6), B: c, L: t.D, P: t.L, K: 0xdba84a, b: t.K };
    case 'stew':
      return { ...t, ...WOOD, ...FLAME, Y: 0xe8eef2 };
    case 'roll':
      return { ...PAPER, M: 0xd8483c };
    case 'furnace':
      return { ...ROCK, ...FLAME, K: 0x1a1410 };
    case 'forge':
      return { S: mixOf(0x9aa3ad, c, 0.15), s: 0x4a5058, ...FLAME };
    case 'alchemy':
      return { ...WOOD, S: 0xcfe6f0, M: c, G: mixOf(c, 0xffffff, 0.6) };
    case 'kit':
      return { ...t, ...FLAME };
    case 'page':
      return { ...PAPER };
    case 'potion':
      return { ...t, ...WOOD, S: 0xb8d8e8 };
    case 'food':
      return { ...t, ...PAPER };
    case 'torch':
      return { ...WOOD, ...FLAME, M: 0x6a5a4a };
    case 'ladder':
    case 'door':
      return { W: c, w: t.D, S: 0xd6b45a };
    case 'shard':
    case 'ore':
      // Coal is black: its flecks glint grey instead of taking its own (near-black) colour.
      return def.id === 'coal' ? { ...tones(0x8a8a9c), ...ROCK, D: 0x24242c } : { ...t, ...ROCK };
    default:
      return { ...t, ...WOOD, ...STEEL, ...ROCK, ...FLAME };
  }
}

/** The art for an item id, or null for an unknown id (the caller falls back). */
export function itemArt(id: string): ItemArt | null {
  const def = (ITEMS as Record<string, ItemDef | undefined>)[id];
  if (!def) return null;
  const shape = shapeOf(def);
  const rows = itemTemplates()[shape];
  return rows ? { rows, palette: paletteOf(def, shape) } : null;
}
