/** FNV-1a over a slab's bytes (and its props), for the determinism tests (W3) and the slab version. */
export function fingerprintBytes(bytes: Uint8Array, h = 2166136261): number {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return h >>> 0;
}

export function fingerprintSlab(slab: { blocks: Uint8Array; props: ReadonlyArray<{ id: string; kind: string; x: number; y: number; z: number }> }): number {
  let h = fingerprintBytes(slab.blocks);
  for (const p of slab.props) {
    const s = `${p.id}|${p.kind}|${p.x.toFixed(3)}|${p.y}|${p.z.toFixed(3)}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}
