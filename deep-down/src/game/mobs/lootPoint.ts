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
