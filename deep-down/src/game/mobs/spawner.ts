import { MOBS_RULES } from './config';
import { clingable, headroom, standableFor, type V3 } from './nav';
import { ROSTERS } from './rosters';
import { SPECIES } from './species';
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
    if (m.dying || m.family !== 'being') continue;
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
  lairs(sim, ctx);
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
      const made = spawnPack(sim, ctx, entry.kind, n, here, due ? 10 : MOBS_RULES.spawnMin, due ? 19 : MOBS_RULES.spawnMax + 4);
      if (made > 0) {
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

/** Spawn `n` of a kind somewhere fitting in the shell round the explorer. @returns how many. */
export function spawnPack(sim: MobSim, ctx: MobContext, kind: MobKind, n: number, biome: MobBiome, minR: number, maxR: number, being = false, nest?: Nest): number {
  const sp = SPECIES[kind];
  const ok = being ? (x: number, y: number, z: number) => canSpawnBeingAt(sim, x, y, z, ctx) : (x: number, y: number, z: number) => sim.canSpawnMonster(x, y, z, ctx);
  const shape = shapeOf(kind);
  const at = nest ? nestCell(sim, nest, shape, sp.height) : spotCell(sim, ctx, kind, shape, minR, maxR, ok) ?? sim.findCell(ctx, shape === 'ceiling' ? 'cling' : shape, ok, sp.height, minR, maxR);
  if (!at) return 0;
  const g = sim.group();
  let made = 0;
  for (let i = 0; i < n; i++) {
    const jx = i === 0 ? 0 : sim.rng.int(-1, 1);
    const jz = i === 0 ? 0 : sim.rng.int(-1, 1);
    const y = shape === 'air' ? at.y + 0.5 + sim.rng.range(-0.3, 0.6) : at.y;
    const m = sim.spawn(kind, at.x + 0.5 + jx, y, at.z + 0.5 + jz, { group: g, biome, nest: nest?.id, ceiling: shape === 'ceiling' });
    if (m) made++;
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
    spawnPack(sim, ctx, entry.kind, sim.rng.int(entry.pack[0], entry.pack[1]), nest.biome, 0, 99, false, nest);
  }
}

/** One guardian asleep in each lair not yet won, once the explorer is within 30 m of its arena. */
function lairs(sim: MobSim, ctx: MobContext): void {
  for (const l of sim.lairs) {
    if (sim.guardiansDone.has(l.biome)) continue;
    if (sim.mobs.some((m) => m.guardian && m.lair === l && !m.dying)) continue;
    if (Math.hypot(l.x - ctx.player.x, l.y - ctx.player.y, l.z - ctx.player.z) > l.radius + 30) continue;
    const m = sim.spawn(l.guardian, l.sx, l.sy + (SPECIES[l.guardian].locomotion === 'fly' ? hoverOf(l.guardian) : 0), l.sz, { lair: l, biome: l.biome }) ?? sim.spawn(l.guardian, l.x, l.y, l.z, { lair: l, biome: l.biome });
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
