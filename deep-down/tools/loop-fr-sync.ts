// LOOP tool (round 3): record the English source of each French line (src/i18n/fr/sources.ts), so
// the test can tell a French line whose English changed since it was translated.
//
// Usage: node tools/run-ts.mjs tools/loop-fr-sync.ts [--report] [--accept key1,key2,…] [--all]
//   --report    write nothing: list the English keys with no French line yet (by section) and the
//               stale ones, with today's English (the final sweep's to-do list).
//   (no flag)   record the source of each French line that has none yet (a line just translated),
//               and forget keys that no longer exist; a recorded source is never overwritten, so an
//               English line changed by its owner stays flagged as stale until its French is updated.
//   --accept    after updating the French of those stale keys, record their current English.
//   --all       record today's English for every French line (only after checking each stale one).
import { writeFileSync } from 'node:fs';
import { EN_SECTIONS, en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { FR_SOURCES } from '../src/i18n/fr/sources';

export default function main(): void {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const at = args.indexOf('--accept');
  const accept = new Set(at >= 0 ? (args[at + 1] ?? '').split(',').filter(Boolean) : []);
  const E = en as Record<string, string>;
  if (args.includes('--report')) {
    let n = 0;
    for (const [name, sec] of Object.entries(EN_SECTIONS)) {
      const missing = Object.keys(sec).filter((k) => typeof (fr as Record<string, string | undefined>)[k] !== 'string');
      for (const k of missing) console.log(`missing ${name} ${k}\t${JSON.stringify(E[k])}`);
      n += missing.length;
    }
    const stale = Object.keys(fr).filter((k) => FR_SOURCES[k] !== undefined && FR_SOURCES[k] !== E[k]);
    for (const k of stale) console.log(`stale ${k}\twas ${JSON.stringify(FR_SOURCES[k])}\tnow ${JSON.stringify(E[k])}`);
    console.log(`${n} English keys without French, ${stale.length} stale French lines`);
    return;
  }
  const keys = Object.keys(fr).sort();
  const out: Record<string, string> = {};
  let added = 0;
  let accepted = 0;
  const stale: string[] = [];
  for (const k of keys) {
    const now = E[k] ?? '';
    const was = FR_SOURCES[k];
    if (was === undefined) {
      out[k] = now;
      added++;
    } else if (was !== now && (all || accept.has(k))) {
      out[k] = now;
      accepted++;
    } else {
      out[k] = was;
      if (was !== now) stale.push(k);
    }
  }
  const unknown = [...accept].filter((k) => !(k in fr));
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`);
  const body = `// Written by tools/loop-fr-sync.ts: the English line each French line was translated from.\n// A test compares them with today's English (a changed line needs its French updated).\nexport const FR_SOURCES: Record<string, string> = {\n${lines.join('\n')}\n};\n`;
  writeFileSync('src/i18n/fr/sources.ts', body);
  console.log(`${keys.length} French lines: ${added} new sources recorded, ${accepted} accepted, ${stale.length} still stale${stale.length ? ` (${stale.join(', ')})` : ''}${unknown.length ? `; not French keys: ${unknown.join(', ')}` : ''}`);
}
