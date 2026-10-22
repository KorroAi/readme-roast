/**
 * Round 3 (UI): the seed a player types on New Game. Digits are the seed itself (as a 32-bit
 * number); any other text is hashed (FNV-1a), so "lantern" is a world anyone can share. Empty or
 * blank text means: roll a random one.
 */
export function seedFromText(text: string | null | undefined): number | undefined {
  const s = (text ?? '').trim();
  if (!s) return undefined;
  if (/^\d{1,10}$/.test(s)) {
    const n = Number(s);
    if (n <= 0xffffffff) return n >>> 0 || 1;
  }
  let h = 0x811c9dc5;
  for (const ch of s.toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}
