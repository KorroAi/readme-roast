// LOOP tool (round 3): which keys of each English section the code names literally (outside
// src/i18n): a rough "still shown" set for the translation passes (dynamic keys are not counted).
// Usage: node tools/run-ts.mjs tools/loop-i18n-used.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EN_SECTIONS } from '../src/i18n/en';

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!p.includes('i18n')) files(p, out);
    } else if (p.endsWith('.ts') || p.endsWith('.mjs')) out.push(p);
  }
  return out;
}

export default function main(): void {
  const src = files('src').map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const [name, sec] of Object.entries(EN_SECTIONS)) {
    const keys = Object.keys(sec);
    const used = keys.filter((k) => src.includes(`'${k}'`) || src.includes(`"${k}"`) || src.includes(`\`${k}\``));
    console.log(`${name.padEnd(10)} ${String(used.length).padStart(4)} / ${keys.length} named in code`);
  }
}
