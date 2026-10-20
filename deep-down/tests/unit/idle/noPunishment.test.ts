// E16 (SPEC §13.1, L11): no store, no punishment. A static scan of src/ finds no payment, ad or network API, and no
// failure, timeout or absence subtracts anything.
import { describe, expect, it } from 'vitest';
import { createIdleBus } from '../../../src/idle/bus';
import { biomeStart } from '../../../src/idle/config/biomes';
import { forceEvent } from '../../../src/idle/model/director';
import { awaySeconds } from '../../../src/idle/model/offline';
import { tickDaily } from '../../../src/idle/model/daily';
import { STEP_DT, stepIdle } from '../../../src/idle/model/step';
import { play, stateAt } from './w2fixture';

// node:fs through a string specifier (the project has no Node types; tests/unit/compat.test.ts does the same).
const NODE_FS: string = 'node:fs';
const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
  readFileSync(p: string, e: 'utf8'): string;
  readdirSync(p: string, o: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean }>;
};
const SRC = decodeURIComponent(new URL('../../../src', import.meta.url).pathname);

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('no store, no punishment (E16, L11)', () => {
  it('src/ uses no payment, ad or network API (the About screen reads its bundled licence file only)', () => {
    const bad = /\bXMLHttpRequest\b|\bWebSocket\b|sendBeacon|\bEventSource\b|PaymentRequest|admob|adsbygoogle|googletag|billing|inAppPurchase/i;
    const hits: string[] = [];
    for (const f of files(SRC)) {
      const text = fs.readFileSync(f, 'utf8');
      text.split('\n').forEach((line: string, i: number) => {
        if (bad.test(line)) hits.push(`${f}:${i + 1}`);
        // fetch() only of bundled, relative files.
        const m = /\bfetch\s*\(\s*(['"`])([^'"`]*)/.exec(line);
        if (m && !m[2].startsWith('./')) hits.push(`${f}:${i + 1} fetch ${m[2]}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('a failed seal, missed events and an absence take nothing away; a clock that moved back gives 0', () => {
    const s = stateAt(biomeStart(3), 4, { pick: 60, lines: [50, 30], open: false });
    s.meta.sealsOpened = [1, 2];
    const bus = createIdleBus();
    stepIdle(s, STEP_DT, [], bus);
    const gold0 = s.run.gold.clone();
    const gems0 = s.meta.gems;
    const levels0 = [s.run.pick, ...s.run.lines];
    play(s, 40, 0, bus); // the seal times out untouched
    for (const type of ['glimmerfall', 'mothSwarm', 'caveIn', 'mimic', 'treasureMole', 'supplyRope', 'ancientEcho', 'signature']) {
      forceEvent(s, type, bus);
      play(s, 25, 0, bus, 3, 1 / 30); // every target ignored
    }
    expect(s.run.gold.gte(gold0)).toBe(true);
    expect(s.meta.gems).toBeGreaterThanOrEqual(gems0);
    expect([s.run.pick, ...s.run.lines]).toEqual(levels0);
    expect(awaySeconds(s, 2_000_000, 1_000_000).counted).toBe(0);
    // The daily items hold while the clock is behind.
    s.meta.dailyReady = false;
    s.meta.daily.lastDay = 1000;
    s.monotonicMs = 5e12;
    tickDaily(s, 4e12);
    expect(s.meta.dailyReady).toBe(false);
    expect(s.meta.daily.calendarDay).toBe(0);
  }, 30000);
});
