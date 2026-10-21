/** FNV-1a over a slab's bytes, for the determinism tests (U-W3) and the slab version. */
export function fingerprintBytes(bytes: Uint8Array, h = 2166136261): number {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return h >>> 0;
}
