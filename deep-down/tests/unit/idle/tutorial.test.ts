// The six-step tutorial and the lesson sequencer (hybrid SPEC §6.3–§6.4; §13.1 U-TUT1, U-TUT2; BUILD §3.1 MUST 6).
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus, type IdleEvents } from '../../../src/idle/bus';
import { crewLine } from '../../../src/idle/config/crew';
import { PICK } from '../../../src/idle/config/upgrades';
import { nodeAt } from '../../../src/idle/model/chart';
import { contentsOf, type NodeAction } from '../../../src/idle/model/nodes';
import { buy } from '../../../src/idle/model/run';
import type { IdleState } from '../../../src/idle/model/state';
import { createHybrid, STEP_DT, stepIdle } from '../../../src/idle/model/step';
import { activePrompt, currentStep, guideTarget, LESSONS, spacingAt, TUTORIAL_STEPS } from '../../../src/idle/model/tutorial';
import { simNodes } from '../../../src/idle/sim/nodeBot';

type Bus = ReturnType<typeof createIdleBus>;

function run(s: IdleState, secs: number, bus: Bus, actions: (s: IdleState) => NodeAction[] = () => []): void {
  const end = s.time + secs;
  while (s.time < end - 1e-9) stepIdle(s, STEP_DT, [], actions(s), bus);
}

function record() {
  const steps: string[] = [];
  const fallbacks: Array<{ id: string; t: number }> = [];
  const cards: string[] = [];
  return { steps, fallbacks, cards };
}

/** Tap the weakest live block of the face once. */
function faceTap(s: IdleState, via: 'tap' | 'hold' = 'tap'): NodeAction {
  const row = s.shaft.rows[0];
  let col = 3;
  for (let c = 0; c < 7; c++) if (row.left[c] > 0) {
    col = c;
    break;
  }
  return { type: 'strike', target: { kind: 'face', col }, via };
}

describe('U-TUT1 the six steps advance on the action; fallbacks fire after their delays; a step done early is skipped', () => {
  it('the six steps are Tap, Buy, Light (light → chest), Go, Hire, Hold, in that order', () => {
    expect(TUTORIAL_STEPS.map((x) => x.id)).toEqual(['tapRock', 'buyPick', 'light', 'chest', 'go', 'hire', 'hold']);
    for (const st of TUTORIAL_STEPS) expect(st.text).toBe(`idle.tut.${st.id}`);
  });

  it('plays through: each step starts, rims its target, falls back after its delay, and ends on its action', () => {
    const s = createHybrid(7, 0);
    const bus = createIdleBus();
    const log = record();
    bus.on('tutorial:step', (e) => log.steps.push(e.id));
    bus.on('tutorial:fallback', (e) => log.fallbacks.push({ id: e.id, t: s.time }));
    bus.on('firsttime', (e) => log.cards.push(e.id));
    let done = false;
    bus.on('tutorial:done', () => (done = true));

    // 1. Tap: the face is rimmed; the ghost hand once after 4 s without input.
    run(s, 0.1, bus);
    expect(activePrompt(s)).toBe('tut:tapRock');
    expect(guideTarget(s)).toBe('face');
    run(s, 5, bus);
    expect(log.fallbacks.filter((f) => f.id === 'tapRock')).toHaveLength(1);
    expect(log.fallbacks[0].t).toBeGreaterThanOrEqual(4 - 1e-6);
    run(s, 6, bus);
    expect(log.fallbacks.filter((f) => f.id === 'tapRock')).toHaveLength(1); // once only
    stepIdle(s, STEP_DT, [], [faceTap(s)], bus);
    run(s, 0.1, bus);
    expect(currentStep(s)?.id).toBe('buyPick');

    // 2. Buy: at 30 gold the Pick card is rimmed; two fallbacks 8 s apart, the second buys the pick itself.
    s.run.gold = Big.from(PICK.c0);
    run(s, 0.1, bus);
    expect(activePrompt(s)).toBe('tut:buyPick');
    expect(guideTarget(s)).toBe('card:pick');
    run(s, 8.2, bus);
    expect(log.fallbacks.filter((f) => f.id === 'buyPick')).toHaveLength(1);
    expect(s.run.pick).toBe(1);
    run(s, 8.2, bus);
    expect(log.fallbacks.filter((f) => f.id === 'buyPick')).toHaveLength(2);
    expect(s.run.pick).toBe(2);
    run(s, 0.1, bus);
    expect(currentStep(s)?.id).toBe('light');

    // 3a. Light: dig to the last slice; "Tap the light" rims the breach; its second fallback shows the breakthrough card.
    const t0 = nodeAt(s.seed, 0);
    for (let k = 0; k < 4000 && s.run.depth < t0.breach - 1; k++) stepIdle(s, STEP_DT, [], [faceTap(s)], bus);
    s.run.pick = 2;
    run(s, 0.1, bus);
    expect(activePrompt(s)).toBe('tut:light');
    expect(guideTarget(s)).toBe('breach');
    run(s, 12.5, bus);
    expect(log.fallbacks.filter((f) => f.id === 'light')).toHaveLength(2);
    expect(log.cards).toContain('breach');
    for (let k = 0; k < 4000 && s.node.phase === 'dig'; k++) stepIdle(s, STEP_DT, [], [faceTap(s)], bus);
    expect(s.node.phase).toBe('explore');
    run(s, 0.1, bus);

    // 3b. …then the chest in the Root Cellar's lantern pool.
    expect(activePrompt(s)).toBe('tut:chest');
    const con = contentsOf(s, 0);
    const chest = con.focus.find((id) => con.sockets[id].kind === 'chest') as string;
    expect(guideTarget(s)).toBe(`focus:${chest}`);
    stepIdle(s, STEP_DT, [], [{ type: 'resolve', id: chest, input: 'tap' }], bus);
    run(s, 0.1, bus);

    // 4. Go: a new mechanic, so it waits for the spacing (≥ 40 s after "Tap the light" began), then rims the exit.
    expect(currentStep(s)?.id).toBe('go');
    run(s, 45, bus);
    expect(activePrompt(s)).toBe('tut:go');
    expect(guideTarget(s)).toBe('exit');
    stepIdle(s, STEP_DT, [], [{ type: 'exit', exitId: 'e0' }], bus);
    run(s, 0.1, bus);
    stepIdle(s, STEP_DT, [], [{ type: 'rideEnd' }], bus);

    // 5. Hire: at 50 gold, after the spacing; the BEST rim is never pressed for the player (no auto-hire).
    expect(currentStep(s)?.id).toBe('hire');
    s.run.gold = Big.from(Math.pow(10, crewLine(0).c0Log10) * 1.01);
    run(s, 45, bus);
    expect(activePrompt(s)).toBe('tut:hire');
    expect(guideTarget(s)).toBe('card:crew:0');
    run(s, 20, bus);
    expect(s.run.lines[0] ?? 0).toBe(0);
    expect(buy(s, 'crew:0', 'x1', bus).ok).toBe(true);
    run(s, 0.1, bus);

    // 6. Hold: at a face, ≥ 40 s after the hire, after 6 taps on that face; done with 1.5 s of hold.
    expect(currentStep(s)?.id).toBe('hold');
    expect(s.node.phase).toBe('dig');
    run(s, 41, bus);
    expect(activePrompt(s)).not.toBe('tut:hold');
    for (let k = 0; k < 6; k++) {
      stepIdle(s, STEP_DT, [], [faceTap(s)], bus);
      run(s, 0.3, bus);
    }
    expect(activePrompt(s)).toBe('tut:hold');
    expect(guideTarget(s)).toBe('face');
    // The hold stream: a strike every 1/3 s for 1.8 s.
    for (let k = 0; k < 6; k++) {
      stepIdle(s, STEP_DT, [], [faceTap(s, 'hold')], bus);
      run(s, 1 / 3 - STEP_DT, bus);
    }
    run(s, 0.1, bus);
    expect(done).toBe(true);
    expect(currentStep(s)).toBeNull();
    expect(s.meta.tutorial.done).toBe(true);
    expect(log.steps.filter((x) => !x.startsWith('lesson:'))).toEqual(['tapRock', 'buyPick', 'light', 'chest', 'go', 'hire', 'hold']);
  }, 30000);

  it('a step done before its prompt is skipped unseen (the player hired on their own)', () => {
    const s = createHybrid(7, 0);
    const bus = createIdleBus();
    const steps: string[] = [];
    bus.on('tutorial:step', (e) => steps.push(e.id));
    stepIdle(s, STEP_DT, [], [faceTap(s)], bus);
    // Rich at once: buy the pick and hire the Shovel Hand before either prompt.
    s.run.gold = Big.from(1e4);
    expect(buy(s, 'pick', 'x1', bus).ok).toBe(true);
    expect(buy(s, 'crew:0', 'x1', bus).ok).toBe(true);
    for (let k = 0; k < 4000 && s.node.phase === 'dig'; k++) stepIdle(s, STEP_DT, [], [faceTap(s)], bus);
    run(s, 0.2, bus);
    expect(steps).not.toContain('buyPick');
    expect(steps).not.toContain('hire');
    expect(s.tutorial.index).toBeGreaterThan(TUTORIAL_STEPS.findIndex((x) => x.id === 'buyPick'));
  });

  it('the Pick step gives way once its moment passed (the cellar opened before 30 gold)', () => {
    const s = createHybrid(7, 0);
    const bus = createIdleBus();
    s.run.pick = 40; // break through at once, gold under 30
    for (let k = 0; k < 400 && s.node.phase === 'dig'; k++) stepIdle(s, STEP_DT, [], [faceTap(s)], bus);
    s.run.gold = Big.from(5);
    run(s, 0.5, bus);
    expect(['chest', 'go']).toContain(currentStep(s)?.id);
  });
});

describe('U-TUT2 the sequencer: one prompt at a time, lessons held to the L13 spacing (30 min simulated)', () => {
  it('spacingAt: 40 s before 3:00 of play, 60 s after', () => {
    expect(spacingAt(0)).toBe(40);
    expect(spacingAt(179)).toBe(40);
    expect(spacingAt(180)).toBe(60);
  });

  for (const seed of [7, 11]) {
    it(`seed ${seed}: never a step and a lesson together; every new mechanic ≥ the spacing after the previous one`, () => {
      const both: number[] = [];
      const starts: Array<{ id: string; t: number; mech: boolean; urgent: boolean }> = [];
      let lastPrompt = '';
      const r = simNodes({
        seed,
        maxSecs: 1800,
        idleAtEnd: true,
        probe: (s) => {
          const step = currentStep(s);
          if (step && s.tutorial.since >= 0 && s.tutorial.lesson) both.push(s.time);
          const p = activePrompt(s);
          if (p && p !== lastPrompt) {
            if (p.startsWith('tut:')) {
              const st = TUTORIAL_STEPS.find((x) => `tut:${x.id}` === p);
              starts.push({ id: p, t: s.playTime, mech: !!st?.mechanic, urgent: false });
            } else {
              const l = LESSONS.find((x) => `lesson:${x.id}` === p);
              starts.push({ id: p, t: s.playTime, mech: true, urgent: !!l?.urgent });
            }
          }
          lastPrompt = p;
        },
      });
      expect(r.t).toBeGreaterThanOrEqual(1800 - 1);
      expect(both).toEqual([]);
      // L13: outside the opening pair (tap, the Pick card), a new mechanic waits the spacing after the previous one.
      let prev = -Infinity;
      for (const st of starts) {
        if (!st.mech) continue;
        if (!st.urgent && Number.isFinite(prev)) expect(st.t - prev, `${st.id} at ${st.t.toFixed(1)}`).toBeGreaterThanOrEqual(spacingAt(prev) - 1e-6);
        prev = st.t;
      }
      // The tutorial finished inside the session.
      expect(r.state.meta.tutorial.done).toBe(true);
    }, 60000);
  }

  it('the lesson first-time cards are once in a lifetime and their text exists', async () => {
    const { en } = await import('../../../src/i18n/en');
    for (const l of LESSONS) {
      expect(`idle.first.lesson.${l.id}.title` in en, l.id).toBe(true);
      expect(`idle.first.lesson.${l.id}.body` in en, l.id).toBe(true);
    }
    for (const st of TUTORIAL_STEPS) {
      expect(st.text in en, st.id).toBe(true);
      if (st.card) expect(`idle.first.${st.card}.title` in en, st.card).toBe(true);
    }
    const s = createHybrid(3, 0);
    const bus = createIdleBus();
    const cards: Array<IdleEvents['firsttime']> = [];
    bus.on('firsttime', (e) => cards.push(e));
    s.node.phase = 'seal';
    run(s, 0.1, bus);
    run(s, 0.1, bus);
    expect(cards.filter((c) => c.id === 'lesson.seal').length).toBeLessThanOrEqual(1);
  });
});

describe('U-TUT1 the Pick card can wait: the breach before 30 gold', () => {
  it('"Tap the light" and the chest go first; the Pick card comes as soon as 30 gold is there; then "Go deeper"', () => {
    const s = createHybrid(7, 0);
    const bus = createIdleBus();
    const steps: string[] = [];
    bus.on('tutorial:step', (e) => steps.push(e.id));
    run(s, 0.1, bus);
    // Dig with the gold held under 30 (a fast tapper reaches the breach before the Pick is affordable).
    for (let k = 0; k < 4000 && s.node.phase === 'dig'; k++) {
      s.run.gold = Big.from(Math.min(s.run.gold.toNumber(), 20));
      stepIdle(s, STEP_DT, [], [faceTap(s)], bus);
      if (k % 4 === 0) run(s, 0.1, bus);
    }
    s.run.gold = Big.from(10);
    run(s, 0.2, bus);
    expect(steps.slice(0, 2)).toEqual(['tapRock', 'light']);
    expect(activePrompt(s)).toBe('tut:chest');
    const con = contentsOf(s, 0);
    const chest = con.focus.find((id) => con.sockets[id].kind === 'chest') as string;
    stepIdle(s, STEP_DT, [], [{ type: 'resolve', id: chest, input: 'tap' }], bus);
    s.run.gold = Big.from(PICK.c0);
    run(s, 0.2, bus);
    expect(activePrompt(s)).toBe('tut:buyPick');
    expect(guideTarget(s)).toBe('card:pick');
    expect(buy(s, 'pick', 'x1', bus).ok).toBe(true);
    run(s, 45, bus);
    expect(activePrompt(s)).toBe('tut:go');
    expect(steps.filter((x) => !x.startsWith('lesson:'))).toEqual(['tapRock', 'light', 'chest', 'buyPick', 'go']);
  });
});
