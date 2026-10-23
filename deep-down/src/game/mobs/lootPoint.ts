/**
 * Where a felled creature's loot bursts out (round 3, MOBS). The lead's release gate (03:11) found a
 * Grit Boar struck down at the Silver Sword's reach whose hide never reached the bag: a weapon's reach
 * runs from the eye to the creature's body (game/fp/Combat distanceTo: centre distance less its
 * radius), so a sword kills a boar whose centre stands ~3.1 m off, while a drop is pulled in only
 * within PLAYER.pickupRadius (2.6 m) of the explorer's chest, ~2.45 m along level ground, and it
 * scatters 0.3-1 m from where it starts (game/Drops). A kill within melee range now spills its loot on
 * the explorer's side of the body, within that pull, so it flies to the bag as a close kill's does; a
 * kill farther off (a sling, a crossbow, a bomb's throw) leaves it where the creature fell, to walk to.
 * Pure (unit-tested in tests/unit/mobs-world.test.ts).
 */

/** Horizontal metres from the explorer a melee kill's loot starts at most (inside the bag's pull with its scatter). */
export const LOOT_NEAR = 1.5;
/** Beyond this (horizontal metres), a ranged kill: its loot stays where the creature fell. */
export const LOOT_MELEE = 6;

/**
 * @param m the creature's position (its body centre) where it fell
 * @param p the explorer's feet
 * @param solid the world's rock test (cells)
 * @returns where its drops start: above its body, pulled toward the explorer along open space when it fell in melee range
 */
export function lootPoint(
  m: { x: number; y: number; z: number },
  p: { x: number; y: number; z: number },
  solid: (x: number, y: number, z: number) => boolean,
): { x: number; y: number; z: number } {
  const y = m.y + 0.3;
  const dx = p.x - m.x;
  const dz = p.z - m.z;
  const h = Math.hypot(dx, dz);
  if (h <= LOOT_NEAR || h > LOOT_MELEE) return { x: m.x, y, z: m.z };
  // The point LOOT_NEAR from the explorer on the line between them, else (rock there: a ledge, a
  // pillar's foot) the nearest open point back toward the creature.
  const f0 = (h - LOOT_NEAR) / h;
  for (let k = 0; k <= 8; k++) {
    const f = f0 * (1 - k / 8);
    const x = m.x + dx * f;
    const z = m.z + dz * f;
    if (!solid(Math.floor(x), Math.floor(y), Math.floor(z))) return { x, y, z };
  }
  return { x: m.x, y, z: m.z };
}

/** Metres from the explorer's chest within which a mined find's drop still starts where the find was. */
export const FIND_NEAR = 2.2;

/**
 * Where a mined find's drop starts: a vein's ore, its bonus drop, a crystal's shards (round 3, MOBS,
 * at the lead's request after the gate). The pick reaches 3.5 m from the hand to a block's centre
 * (game/fp/constants REACH), so a vein broken at the edge of that reach drops its ore ~3.5 m from the
 * chest, outside the bag's 2.6 m pull, and it scatters from there: it could stay on the floor and fade.
 * Within FIND_NEAR of the chest the drop starts where the find was, as it always has; farther, on the
 * explorer's side through open space, LOOT_NEAR along the floor and at the explorer's own height
 * (from the knees to the head: a floor vein's or a pit's ore starts above it), so it flies to the bag
 * as a close vein's does. Pure (tests/unit/mobs-world.test.ts); the drop's item and count are the
 * caller's, unchanged.
 * @param f where the find's drop started until now (a block's centre, a prop's)
 * @param p the explorer's feet
 * @param solid the world's rock test (cells); without one the drop starts where the find was
 */
export function findPoint(
  f: { x: number; y: number; z: number },
  p: { x: number; y: number; z: number },
  solid?: ((x: number, y: number, z: number) => boolean) | null,
): { x: number; y: number; z: number } {
  // (The chest, where game/Drops pulls a drop to: the feet + 1 m.)
  if (!solid || Math.hypot(f.x - p.x, f.y - (p.y + 1), f.z - p.z) <= FIND_NEAR) return { x: f.x, y: f.y, z: f.z };
  const dx = p.x - f.x;
  const dz = p.z - f.z;
  const h = Math.hypot(dx, dz);
  const f0 = h > LOOT_NEAR ? (h - LOOT_NEAR) / h : 0;
  const y0 = Math.min(p.y + 1.5, Math.max(p.y + 0.5, f.y));
  // From the point on the explorer's side back toward the find (its own cell is open now), the first
  // open one; the height eases back to the find's on the way.
  for (let k = 0; k <= 8; k++) {
    const t = f0 * (1 - k / 8);
    const x = f.x + dx * t;
    const z = f.z + dz * t;
    const y = y0 + (f.y - y0) * (k / 8);
    if (!solid(Math.floor(x), Math.floor(y), Math.floor(z))) return { x, y, z };
  }
  return { x: f.x, y: f.y, z: f.z };
}
