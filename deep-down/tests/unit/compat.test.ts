import { describe, expect, it } from 'vitest';

// U5 (SPEC §13.3): the WebView 88 floor (Android 7+ with an updated WebView, Chromium 88). Nothing in the shipped
// code may use what Chromium 88 lacks: CSS individual transform properties (translate/rotate/scale, Chromium 104),
// the linear() easing (113), :has() (105), @container (105), AudioContext.outputLatency (102) or WAAPI
// composite: 'add' (112). Comments are stripped first, so the rules can name what they avoid.

const NODE_FS: string = 'node:fs';
const NODE_PATH: string = 'node:path';
const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
  readFileSync(p: string, e: 'utf8'): string;
  readdirSync(p: string, o: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean }>;
};
const path = (await import(/* @vite-ignore */ NODE_PATH)) as { join(...p: string[]): string };
const ROOT = decodeURIComponent(new URL('../../src', import.meta.url).pathname);

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|css|html|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Drop block and line comments (strings are left alone; `//` inside a URL string is not at a line start). */
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/** [name, pattern, applies to] */
const RULES: Array<[string, RegExp, RegExp]> = [
  ['individual transform property (CSS)', /(^|[;{\s])(translate|rotate|scale)\s*:\s*[-0-9]/m, /\.css$/],
  ['individual transform property (style or WAAPI keyframe)', /\.style\.(translate|rotate|scale)\b|[{,]\s*(translate|rotate|scale)\s*:\s*['"`]/, /\.(ts|mjs)$/],
  ['CSS linear() easing', /(^|[^a-zA-Z_.])linear\(/, /./],
  [':has()', /:has\(/, /./],
  ['@container', /@container\b/, /./],
  ['outputLatency', /\boutputLatency\b/, /./],
  ["WAAPI composite: 'add'", /composite\s*:\s*['"]add['"]/, /./],
];

describe('WebView 88 compatibility (U5)', () => {
  const all = files(ROOT);
  it('scans the UI, game, audio and render code', () => {
    expect(all.some((f) => f.endsWith('ui.css'))).toBe(true);
    expect(all.some((f) => f.endsWith('hybrid.css'))).toBe(true);
    expect(all.length).toBeGreaterThan(100);
  });

  for (const [name, re, where] of RULES) {
    it(`uses no ${name}`, () => {
      const hits: string[] = [];
      for (const f of all.filter((x) => where.test(x))) {
        const src = strip(fs.readFileSync(f, 'utf8'));
        const lines = src.split('\n');
        for (let i = 0; i < lines.length; i++) {
          // Inside CSS, `transform: rotate(…)` is fine; the individual property is `rotate: …` at a declaration start.
          if (re.test(lines[i])) hits.push(`${f.slice(ROOT.length + 1)}:${i + 1}: ${lines[i].trim().slice(0, 80)}`);
        }
      }
      expect(hits, hits.join('\n')).toEqual([]);
    });
  }
});
