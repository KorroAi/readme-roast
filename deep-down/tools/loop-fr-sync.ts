// LOOP tool (round 3): record the English source of every French line (src/i18n/fr/sources.ts), so
// the test can tell a French line whose English changed since it was translated. Run it right after
// translating or updating French lines.
// Usage: node tools/run-ts.mjs tools/loop-fr-sync.ts
import { writeFileSync } from 'node:fs';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';

export default function main(): void {
  const keys = Object.keys(fr).sort();
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify((en as Record<string, string>)[k] ?? '')},`);
  const out = `// Written by tools/loop-fr-sync.ts: the English line each French line was translated from.\n// A test compares them with today's English (a changed line needs its French updated).\nexport const FR_SOURCES: Record<string, string> = {\n${lines.join('\n')}\n};\n`;
  writeFileSync('src/i18n/fr/sources.ts', out);
  console.log(`recorded ${keys.length} French lines' English sources`);
}
