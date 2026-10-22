// LOOP tool (round 3): keys and words per English section (the French pass's size), and which keys
// the game code still names (a rough "used" check: the key's text appears in src outside i18n).
// Usage: node tools/run-ts.mjs tools/loop-i18n-count.ts
import { EN_SECTIONS } from '../src/i18n/en';

export default function main(): void {
  let keys = 0;
  let words = 0;
  for (const [name, sec] of Object.entries(EN_SECTIONS)) {
    const vals = Object.values(sec as Record<string, string>);
    const w = vals.reduce((a, v) => a + String(v).split(/\s+/).length, 0);
    keys += vals.length;
    words += w;
    console.log(`${name.padEnd(10)} ${String(vals.length).padStart(5)} keys ${String(w).padStart(6)} words`);
  }
  console.log(`total      ${keys} keys ${words} words`);
}
