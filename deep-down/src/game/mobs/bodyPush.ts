/**
 * Keeping the explorer out of a big creature's body (round 3, MOBS; QA 22:10: at striking range the
 * lens was inside the Amber Matriarch, whose model is three times its capsule). Pure, so the rule is
 * unit-tested: the body is a capsule along the creature's yaw, from `back` behind its centre to
 * `front` ahead of it, `side` wide each way (its drawn bulk, BodyExtent × scale); a point closer than
 * `side + pad` to that segment is pushed out to it, along the way out nearest to where it stands.
 */

export interface BodyShape {
  front: number;
  back: number;
  side: number;
}

/**
 * @param px, pz the explorer (world xz)
 * @param mx, mz the creature's centre; `yaw` its facing (0 = +z, forward = (sin yaw, cos yaw))
 * @param b its body (metres, already scaled); `pad` the explorer's half width and a margin
 * @returns the push (world xz, metres) that puts the explorer on the body's edge, or null when it is outside
 */
export function bodyPush(px: number, pz: number, mx: number, mz: number, yaw: number, b: BodyShape, pad: number): { x: number; z: number } | null {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const dx = px - mx;
  const dz = pz - mz;
  // Into the creature's frame: lz along its facing, lx to its right.
  const lz = dx * s + dz * c;
  const lx = dx * c - dz * s;
  const r = Math.max(0.05, b.side);
  // The capsule's spine runs from (back - side) behind to (front - side) ahead (a round body: a point).
  const ahead = Math.max(0, b.front - r);
  const behind = Math.max(0, b.back - r);
  const qz = Math.max(-behind, Math.min(ahead, lz));
  const R = r + pad;
  const d = Math.hypot(lx, lz - qz);
  if (d >= R) return null;
  // The way out, in its frame (right on the spine: out to the nearer side), and how far.
  const ex = d < 1e-4 ? (lx >= 0 ? 1 : -1) : lx / d;
  const ez = d < 1e-4 ? 0 : (lz - qz) / d;
  const k = R - d;
  // Back to the world: right = (c, -s), forward = (s, c).
  return { x: (ex * c + ez * s) * k, z: (-ex * s + ez * c) * k };
}
