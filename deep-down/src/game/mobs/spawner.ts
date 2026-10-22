import { MOBS_RULES } from './config';
import { clingable, headroom, standableFor, type V3 } from './nav';
import { ROSTERS } from './rosters';
import { SPECIES } from './species';
import { ELITE_CHANCE, canTake, rollAffixes } from './elites';
import type { MobSim, SimMob } from './MobSim';
import type { GuardianKind, MobBiome, MobContext, MobKind, RosterEntry } from './types';

/**
 * The strata's spawner (round 3, MOBS; BRIEF §0.5): biome-weighted rosters, density rising with
 * the stratum and the depth in it, packs and nests, more at night and in the dark, an encounter
 * every 20-40 s in the deep, the guardians asleep in their lairs. Never in the camp, at an outpost,
 * in a torch's light or in the lantern's pool (the first world's rules hold: MobSim.canSpawnMonster).
 */
export interface Lair {
  id: string;
  biome: MobBiome;
  guardian: GuardianKind;
  x: number;
  y: number;
  z: number;
  radius: number;
  sx: number;
  sy: number;
  sz: number;
  /** A lair whose guardian does not come yet (the Heart's, until the 12 shards relight it). */
  sealed?: () => boolean;
}

export interface Nest {
  id: number;
  biome: MobBiome;
  x: number;
  y: number;
  z: number;
  radius: number;
  kind: MobKind | null;
  next: number;
  kills: number;
}

/** A spawn point from WORLD's layout (preferred over a random search when one is in the shell). */
export interface SpawnSpot {
  x: number;
  y: number;
  z: number;
  biome: MobBiome;
  dark: boolean;
  open: boolean;
  ceiling: boolean;
}

const spots: { list: SpawnSpot[] } = { list: [] };

/** WORLD's spawn points for this stratum (MobDirector sets them on a stratum's arrival). */
export function setSpawnSpots(list: SpawnSpot[]): void {
  spots.list = list;
}

/** How many monsters may be about now in a stratum (night and a dying flame bring more). Pure. */
export function strataBudget(stratum: number, night = 0, dark = 0): number {
  const s = Math.max(1, Math.min(6, Math.round(stratum)));
  return MOBS_RULES.strataMonsters[s] + Math.round(MOBS_RULES.nightExtra * Math.max(0, Math.min(1, night))) + Math.round(MOBS_RULES.darkExtra * Math.max(0, Math.min(1, dark)));
}

/** Pick a roster entry by weight (night and dark raise some), skipping those at their cap. Pure given `roll`. */
export function pickEntry(entries: readonly RosterEntry[], roll: number, count: (k: MobKind) => number, night = 0, dark = 0): RosterEntry | null {
  let total = 0;
  const w = entries.map((e) => {
    if (count(e.kind) >= e.max) return 0;
    const x = e.weight * (1 + ((e.night ?? 1) - 1) * night) * (1 + ((e.dark ?? 1) - 1) * dark);
    total += x;
    return x;
  });
  if (total <= 0) return null;
  let r = roll * total;
  for (let i = 0; i < entries.length; i++) {
    r -= w[i];
    if (r <= 0 && w[i] > 0) return entries[i];
  }
  for (let i = entries.length - 1; i >= 0; i--) if (w[i] > 0) return entries[i];
  return null;
}

function stratumOf(sim: MobSim, ctx: MobContext): number {
  if (ctx.stratum) return ctx.stratum;
  return ROSTERS[sim.biomeAt(ctx.player.x, ctx.player.y, ctx.player.z)].stratum;
}

/** Monsters that count against the budget (not the guardians, the worm, a relic's sentinel). */
function monstersAbout(sim: MobSim): number {
  let n = 0;
  for (const m of sim.mobs) if (!m.dying && m.hostile && !m.guardian && m.brain !== 'vista' && !(m.brain === 'sentinel' && m.relic) && !m.owner) n++;
  return n;
}

function beingsAbout(sim: MobSim): number {
  let n = 0;
  let moths = false;
  for (const m of sim.mobs) {
    if (m.dying || m.family !== 'being' || m.tame) continue;
    if (m.brain === 'moth') moths = true;
    else n++;
  }
  return n + (moths ? 1 : 0);
}

/** One spawning tick (every MOBS_RULES.attemptEvery s). */
export function strataSpawner(sim: MobSim, dt: number, ctx: MobContext): void {
  sim.attemptIn -= dt;
  if (sim.attemptIn > 0 || ctx.atCamp) return;
  sim.attemptIn = MOBS_RULES.attemptEvery;
  if (!sim.spawning) return;
  const now = sim.clock;
  const r = sim.rng;
  const stratum = stratumOf(sim, ctx);
  const night = ctx.night ?? 0;
  const dark = !ctx.lantern.lit ? 1 : ctx.lantern.flame < MOBS_RULES.dimFlame ? 0.6 : 0;
  // In a guardian's arena the fight is the guardian's (its brood comes by its summons).
  const inLair = sim.lairs.some((l) => !sim.guardiansDone.has(l.biome) && Math.hypot(ctx.player.x - l.x, ctx.player.z - l.z) < l.radius + 4 && Math.abs(ctx.player.y - l.y) < 12);
  nests(sim, ctx, inLair);
  const budget = inLair ? 0 : strataBudget(stratum, night, dark);
  const about = monstersAbout(sim);
  const due = sim.quiet > sim.encounterDue;
  if (about < budget && (now - sim.lastMonster >= MOBS_RULES.strataGap || due)) {
    const here = sim.biomeAt(ctx.player.x, ctx.player.y, ctx.player.z);
    const entry = pickEntry(ROSTERS[here].monsters, r.next(), (k) => sim.count(undefined, k), night, dark);
    if (entry) {
      const n = Math.min(r.int(entry.pack[0], entry.pack[1]), Math.max(1, budget - about + 1), entry.max - sim.count(undefined, entry.kind));
      const pack: SimMob[] = [];
      const made = spawnPack(sim, ctx, entry.kind, n, here, due ? 10 : MOBS_RULES.spawnMin, due ? 19 : MOBS_RULES.spawnMax + 4, false, undefined, pack);
      if (made > 0) {
        maybeElite(sim, pack, stratum);
        sim.lastMonster = now;
        if (due) {
          sim.quiet = 0;
          sim.encounterDue = r.range(MOBS_RULES.encounterMin, MOBS_RULES.encounterMax);
        }
      }
    }
  }
  // Beings: a few about (never at camp), from their biome's roster.
  const beings = MOBS_RULES.strataBeings[Math.max(1, Math.min(6, stratum))];
  if (now - sim.lastBeing >= MOBS_RULES.beingGap && beingsAbout(sim) < beings) {
    const here = sim.biomeAt(ctx.player.x, ctx.player.y, ctx.player.z);
    const entry = pickEntry(ROSTERS[here].beings, r.next(), (k) => sim.count(undefined, k));
    if (entry) {
      let made = 0;
      if (SPECIES[entry.kind].brain === 'moth') made = sim.spawnMoths(ctx, r.int(entry.pack[0], entry.pack[1]));
      else made = spawnPack(sim, ctx, entry.kind, r.int(entry.pack[0], entry.pack[1]), here, 7, 20, true);
      if (made > 0) sim.lastBeing = now;
    }
  }
}

/** Now and then a pack has a leader: an elite with one affix (two from stratum IV). @returns it, if one. */
export function maybeElite(sim: MobSim, pack: readonly SimMob[], stratum: number): SimMob | null {
  if (!pack.length) return null;
  const s = Math.max(1, Math.min(6, Math.round(stratum)));
  if (sim.rng.next() >= ELITE_CHANCE[s]) return null;
  const lead = pack.find((m) => !m.guardian && !m.owner && (['radiant', 'armoured', 'swift', 'splitting'] as const).some((a) => canTake(m.kind, a)));
  if (!lead) return null;
  const affixes = rollAffixes(sim.rng, s, lead.kind);
  if (!affixes.length) return null;
  sim.makeElite(lead, affixes);
  return lead;
}

/** Spawn `n` of a kind somewhere fitting in the shell round the explorer. @returns how many (and the creatures into `out`). */
export function spawnPack(sim: MobSim, ctx: MobContext, kind: MobKind, n: number, biome: MobBiome, minR: number, maxR: number, being = false, nest?: Nest, out?: SimMob[]): number {
  const sp = SPECIES[kind];
  const ok = being ? (x: number, y: number, z: number) => canSpawnBeingAt(sim, x, y, z, ctx) : (x: number, y: number, z: number) => sim.canSpawnMonster(x, y, z, ctx);
  const shape = shapeOf(kind);
  const at = nest ? nestCell(sim, nest, shape, sp.height) : spotCell(sim, ctx, kind, shape, minR, maxR, ok) ?? sim.findCell(ctx, shape === 'ceiling' ? 'cling' : shape, ok, sp.height, minR, maxR);
  if (!at) return 0;
  const g = sim.group();
  let made = 0;
  // About half of the crawler packs bring one on the rock overhead, to drop on the explorer.
  const ambush = !being && sp.brain === 'cling' && sim.rng.next() < 0.45;
  for (let i = 0; i < n; i++) {
    const jx = i === 0 ? 0 : sim.rng.int(-1, 1);
    const jz = i === 0 ? 0 : sim.rng.int(-1, 1);
    const y = shape === 'air' ? at.y + 0.5 + sim.rng.range(-0.3, 0.6) : at.y;
    const m = sim.spawn(kind, at.x + 0.5 + jx, y, at.z + 0.5 + jz, { group: g, biome, nest: nest?.id, ceiling: shape === 'ceiling' || (ambush && i === 0) });
    if (m) {
      made++;
      out?.push(m);
    }
  }
  return made;
}

type Shape = 'floor' | 'cling' | 'air' | 'ceiling';

function shapeOf(kind: MobKind): Shape {
  const sp = SPECIES[kind];
  if (sp.brain === 'drop') return 'ceiling';
  if (sp.locomotion === 'crawl') return 'cling';
  if (sp.locomotion === 'fly') return 'air';
  return 'floor';
}

function canSpawnBeingAt(sim: MobSim, x: number, y: number, z: number, ctx: MobContext): boolean {
  if (sim.unsafe(x + 0.5, y, z + 0.5)) return false;
  return Math.hypot(x + 0.5 - ctx.player.x, y + 0.5 - ctx.player.y, z + 0.5 - ctx.player.z) >= 7;
}

/** A WORLD spawn point in the shell that suits the kind (dark for monsters, open for fliers and brutes, a roof for droppers). */
function spotCell(sim: MobSim, ctx: MobContext, kind: MobKind, shape: Shape, minR: number, maxR: number, ok: (x: number, y: number, z: number) => boolean): V3 | null {
  if (spots.list.length === 0) return null;
  const sp = SPECIES[kind];
  const s = sim.env.solid;
  const p = ctx.player;
  const cand: SpawnSpot[] = [];
  for (const q of spots.list) {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < minR || d > maxR || Math.abs(q.y - p.y) > 9) continue;
    if (shape === 'ceiling' && !q.ceiling) continue;
    if ((shape === 'air' || sp.size === 'large' || sp.size === 'huge') && !q.open) continue;
    cand.push(q);
  }
  for (let tries = 0; tries < 6 && cand.length; tries++) {
    const q = cand[sim.rng.int(0, cand.length - 1)];
    const x = Math.floor(q.x);
    const z = Math.floor(q.z);
    const y = Math.floor(q.y);
    if (shape === 'floor' && standableFor(s, x, y, z, sp.height) && ok(x, y, z)) return { x, y, z };
    if (shape === 'air') {
      const ay = y + 2;
      if (!s(x, ay, z) && !s(x, ay + 1, z) && headroom(s, x, y, z, 6) >= 4 && ok(x, ay, z)) return { x, y: ay, z };
    }
    if (shape === 'cling' && clingable(s, x, y, z) && ok(x, y, z)) return { x, y, z };
    if (shape === 'ceiling') {
      const c = sim.nearestCeiling(x, y, z);
      if (c && ok(c.x, c.y, c.z)) return c;
    }
  }
  return null;
}

function nestCell(sim: MobSim, nest: Nest, shape: Shape, height: number): V3 | null {
  const s = sim.env.solid;
  const x = Math.floor(nest.x);
  const y = Math.floor(nest.y);
  const z = Math.floor(nest.z);
  for (let r = 0; r <= 3; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -2; dy <= 2; dy++) {
          const cx = x + dx;
          const cy = y + dy;
          const cz = z + dz;
          if (shape === 'floor' && standableFor(s, cx, cy, cz, height)) return { x: cx, y: cy, z: cz };
          if (shape === 'cling' && clingable(s, cx, cy, cz)) return { x: cx, y: cy, z: cz };
          if (shape === 'air' && !s(cx, cy, cz) && !s(cx, cy + 1, cz)) return { x: cx, y: cy, z: cz };
          if (shape === 'ceiling') {
            const c = sim.nearestCeiling(cx, cy, cz);
            if (c) return c;
          }
        }
  return null;
}

/** Nests breed packs while the explorer is near (until enough of their brood fell). */
function nests(sim: MobSim, ctx: MobContext, inLair: boolean): void {
  if (inLair) return;
  for (const nest of sim.nests) {
    if (nest.kills >= MOBS_RULES.nestKills || sim.clock < nest.next) continue;
    if (Math.hypot(nest.x - ctx.player.x, nest.y - ctx.player.y, nest.z - ctx.player.z) > MOBS_RULES.nestRange) continue;
    if (sim.unsafe(nest.x, nest.y, nest.z)) continue;
    let alive = 0;
    for (const m of sim.mobs) if (!m.dying && m.nest === nest.id) alive++;
    if (alive >= 5) continue;
    const entries = ROSTERS[nest.biome].monsters.filter((e) => e.nest);
    const entry = (nest.kind && entries.find((e) => e.kind === nest.kind)) || entries[sim.rng.int(0, Math.max(0, entries.length - 1))];
    if (!entry) continue;
    nest.next = sim.clock + MOBS_RULES.nestGap;
    const brood: SimMob[] = [];
    spawnPack(sim, ctx, entry.kind, sim.rng.int(entry.pack[0], entry.pack[1]), nest.biome, 0, 99, false, nest, brood);
    maybeElite(sim, brood, ROSTERS[nest.biome].stratum);
  }
}

/** One guardian asleep in each lair not yet won, once the explorer is within 30 m of its arena (MobSim.update, every frame). */
export function lairTick(sim: MobSim, ctx: MobContext): void {
  for (const l of sim.lairs) {
    if (sim.guardiansDone.has(l.biome) || l.sealed?.()) continue;
    if (sim.mobs.some((m) => m.guardian && m.lair === l && !m.dying)) continue;
    if (Math.hypot(l.x - ctx.player.x, l.y - ctx.player.y, l.z - ctx.player.z) > l.radius + 30) continue;
    // Where it waits; else the arena's centre; else a ring round it (a big body needs its headroom).
    const up = SPECIES[l.guardian].locomotion === 'fly' ? hoverOf(l.guardian) : 0;
    const spots: Array<[number, number, number]> = [[l.sx, l.sy, l.sz], [l.x, l.y, l.z]];
    for (const k of [0.3, 0.55]) for (let a = 0; a < 8; a++) spots.push([l.x + Math.sin((a / 8) * Math.PI * 2) * l.radius * k, l.y, l.z + Math.cos((a / 8) * Math.PI * 2) * l.radius * k]);
    let m: SimMob | null = null;
    for (const [x, y, z] of spots) {
      m = sim.spawn(l.guardian, x, y + up, z, { lair: l, biome: l.biome });
      if (m) break;
    }
    if (m) {
      m.home.x = l.x;
      m.home.y = l.y;
      m.home.z = l.z;
    }
  }
}

function hoverOf(kind: GuardianKind): number {
  return (SPECIES[kind] as { hover?: number }).hover ?? 3;
}

/** The guardian of a lair, if it is about. */
export function guardianOf(sim: MobSim, lair: Lair): SimMob | null {
  return sim.mobs.find((m) => m.guardian && m.lair === lair && !m.dying) ?? null;
}

/**
 * One weak monster 8-10 m from the explorer (wider if the ground there does not allow), out of the
 * camp and any outpost, in the dark if it can (else in the dimmest spot), in sight and ahead of the
 * view when possible: a lone Amber Tick, a little bigger than its kin, 3 hit points, soft bites.
 */
export function spawnFirstFight(sim: MobSim, ctx: MobContext): SimMob | null {
  const s = sim.env.solid;
  const p = ctx.player;
  const look = (ctx as MobContext & { look?: { x: number; z: number } }).look;
  const ahead = look ? Math.atan2(look.x, look.z) : 0;
  let best = null as { x: number; y: number; z: number; score: number } | null;
  for (const [r0, r1] of [[8, 10], [10, 14], [14, 18]] as const) {
    for (let i = 0; i < 32; i++) {
      const a = ahead + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 16;
      for (const r of [r0, (r0 + r1) / 2, r1]) {
        const x = Math.floor(p.x + Math.sin(a) * r);
        const z = Math.floor(p.z + Math.cos(a) * r);
        for (let dy = 0; dy <= 8; dy++) {
          const y = Math.floor(p.y) + (dy % 2 ? -(dy + 1) / 2 : dy / 2);
          if (!standableFor(s, x, y, z, 1)) continue;
          if (sim.unsafe(x + 0.5, y, z + 0.5)) break;
          const light = sim.env.light(x, y, z);
          if (light > 0.6) break;
          const eye = { x: x + 0.5, y: y + 0.4, z: z + 0.5 };
          const seen = sim.clearSight(eye, ctx.eye);
          // Dark beats lit, in sight beats hidden, ahead beats behind.
          const score = (light <= MOBS_RULES.darkLight ? 4 : 0) + (seen ? 3 : 0) + (Math.cos(a - ahead) + 1) - Math.abs(dy) * 0.1;
          if (!best || score > best.score) best = { x: x + 0.5, y, z: z + 0.5, score };
          break;
        }
      }
    }
    if (best && best.score >= 7) break;
  }
  if (!best) return null;
  const m = sim.spawn('amberTick', best.x, best.y, best.z, { biome: sim.biomeAt(best.x, best.y, best.z) });
  if (!m) return null;
  m.scale = 1.35;
  m.bounds.radius = m.def.radius * m.scale;
  m.bounds.halfHeight = m.def.halfHeight * m.scale;
  sim.placeWalker(m);
  m.hp = 3;
  m.maxHp = 3;
  m.power = 0.6;
  m.cooldown = 2.5;
  m.yaw = Math.atan2(p.x - m.position.x, p.z - m.position.z);
  return m;
}
