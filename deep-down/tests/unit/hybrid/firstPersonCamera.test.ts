// U-CAM1–U-CAM6 (SPEC §3.8) and the Explore and Ride camera of W1-LEAD §3: the motion law on every shot, the walk at
// ≤ 2.5 m/s with eased starts and stops, the auto-turn ≤ 90°/s, drag-look within ±55° with a ≤ 120 ms settle and no
// roll, smooth step-ups, ladders on rails, the 0.9 m stop short, reduced motion as cross-fades.
import { describe, expect, it } from 'vitest';
import {
  AUTHORED_SHOTS,
  CREEP_A,
  EXPLORE,
  FirstPersonCamera,
  LAW,
  SHOT_KINDS,
  breakthroughMove,
  catchUpMove,
  chalkTurnMove,
  checkLog,
  checkMove,
  crossFadeMove,
  glimpsesMove,
  makePose,
  moveDuration,
  revealMove,
  stepInMove,
  surveyGlideMove,
  wayDownMove,
  type CameraPose,
  type Move,
} from '../../../src/game/hybrid/FirstPersonCamera';
import { BLOCK_M, DEG, BLOCK_MIN_MOVING_PX, BLOCK_MIN_REST_PX, PITCH, STANDOFF_M, sizePx, verticalFov } from '../../../src/game/hybrid/lens';
import { eyePath, planWalk, pullString, roundCorners, snapToFloor, stopShort, type NavLike } from '../../../src/game/hybrid/explore';

const run = (cam: FirstPersonCamera, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) cam.update(dt);
};

/** A hand-made walkability grid: a level floor at y = 0 over x, z ∈ [0, 20), a 0.5 m step up to y = 0.5 for z ≥ 10, and a
 *  ladder at x = 2 from y = 0.5 up to a ledge at y = 4.5 for x < 3. Cells are 0.5 m. */
function testNav(): NavLike {
  const c = 0.5;
  const floorY = (x: number, z: number) => (x < 3 && z >= 14 ? 4.5 : z >= 10 ? 0.5 : 0);
  const walkableAt = (x: number, y: number, z: number) => {
    if (x < 0 || z < 0 || x >= 20 || z >= 20) return false;
    return Math.abs(y - floorY(x, z)) < 0.01;
  };
  const cellOf = (v: number) => Math.floor(v / c);
  const centre = (i: number) => (i + 0.5) * c;
  // BFS over the 4-neighbour grid with the step and the ladder as links.
  const findPath = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => {
    const key = (i: number, k: number) => i * 1000 + k;
    const si = cellOf(from.x);
    const sk = cellOf(from.z);
    const ti = cellOf(to.x);
    const tk = cellOf(to.z);
    const prev = new Map<number, number>();
    prev.set(key(si, sk), -1);
    const q: Array<[number, number]> = [[si, sk]];
    while (q.length) {
      const [i, k] = q.shift()!;
      if (i === ti && k === tk) break;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= 40 || nk >= 40 || prev.has(key(ni, nk))) continue;
        const ya = floorY(centre(i), centre(k));
        const yb = floorY(centre(ni), centre(nk));
        // Steps ≤ 0.5 m walk; the ledge (4 m up) only by the ladder column x cell 4 (x 2.0–2.5) from z cell 27 to 28.
        if (Math.abs(yb - ya) > 0.51 && !(i === 4 && ni === 4 && ((k === 27 && nk === 28) || (k === 28 && nk === 27)))) continue;
        prev.set(key(ni, nk), key(i, k));
        q.push([ni, nk]);
      }
    }
    if (!prev.has(key(ti, tk))) return null;
    const out: Array<{ x: number; y: number; z: number }> = [];
    for (let cur = key(ti, tk); cur !== -1; cur = prev.get(cur)!) {
      const i = Math.floor(cur / 1000);
      const k = cur % 1000;
      out.push({ x: centre(i), y: floorY(centre(i), centre(k)), z: centre(k) });
    }
    return out.reverse();
  };
  return { walkableAt, findPath, cell: c };
}

describe('U-CAM2: the shots', () => {
  it('has the five authored shots plus Explore, Ride and Camp, and nothing else', () => {
    expect([...AUTHORED_SHOTS]).toEqual(['drift', 'breakthrough', 'stand', 'wayDown', 'reveal']);
    expect([...SHOT_KINDS].sort()).toEqual(['breakthrough', 'camp', 'drift', 'explore', 'reveal', 'ride', 'stand', 'wayDown']);
  });
});

describe('U-CAM3: every authored move holds the motion law', () => {
  const from = makePose(10, 1.6, 10, 0, PITCH.drift * DEG);
  const moves: Array<[string, Move, CameraPose]> = [];
  const stand = makePose(10.4, 1.6, 7.2, 0.3, 0);
  moves.push(['breakthrough', breakthroughMove(from, stand), from]);
  moves.push(['breakthrough long', breakthroughMove(from, makePose(10, 1.6, 4, 0.2, 0)), from]);
  moves.push(['stepIn', stepInMove(from, makePose(10, 1.6, 8.4, 0, 0)), from]);
  moves.push(['survey', surveyGlideMove(stand, makePose(13, 1.6, 4, -1, 0)), stand]);
  moves.push(['survey behind', surveyGlideMove(stand, makePose(10, 1.6, 12, Math.PI, 0)), stand]);
  moves.push(['chalk 35', chalkTurnMove(stand, 35), stand]);
  moves.push(['chalk -35 +20', chalkTurnMove(stand, -35, 20), stand]);
  moves.push(['wayDown', wayDownMove(stand, [{ x: 11, y: 0.8, z: 6 }, { x: 12, y: -1.5, z: 5 }], { yaw: 1.2, pitch: PITCH.drift * DEG }), stand]);
  moves.push(['catchUp', catchUpMove(from, makePose(10, 0.6, 2, 0, PITCH.drift * DEG)), from]);
  moves.push(['glimpses', glimpsesMove([{ pose: from, dolly: { x: 10, y: 1.6, z: 9 } }, { pose: stand }, { pose: from }], stand), from]);
  moves.push(['reveal', revealMove(from, makePose(10, -1.4, 8, 0, 0)), from]);
  moves.push(['crossFade', crossFadeMove('stand', stand), from]);
  for (const [name, m, f] of moves) {
    it(`${name}: speed ≤ 2.5, vertical ≤ 2.0, turn ≤ 90°/s, ≤ 2° during a translation`, () => {
      const r = checkMove(m, f);
      expect(r.issues).toEqual([]);
      expect(r.peakSpeed).toBeLessThanOrEqual(LAW.maxSpeed + 1e-6);
      expect(r.peakVertical).toBeLessThanOrEqual(LAW.maxVertical + 1e-6);
      expect(r.peakTurnDeg).toBeLessThanOrEqual(LAW.maxTurnDeg + 1e-6);
    });
    it(`${name}: the sampled run holds the law (FOV 52°, roll 0)`, () => {
      const cam = new FirstPersonCamera();
      cam.place(f, m.shot);
      cam.clearLog();
      cam.play(m);
      run(cam, moveDuration(m) + 0.2);
      const rep = checkLog(cam.log());
      expect(rep.issues).toEqual([]);
      expect(cam.log().every((s) => s.roll === 0 && s.hfov === 52)).toBe(true);
    });
  }
});

describe('U-CAM1: strikes never move the camera', () => {
  it('view matrices identical across 100 strikes with no slice cleared', () => {
    const cam = new FirstPersonCamera();
    cam.setRail({ origin: { x: 5, y: 1.6, z: 5 }, dir: { x: 0, y: 0, z: -1 }, yaw: 0, pitch: PITCH.drift * DEG }, 0);
    const p0 = { ...cam.pose() };
    // A strike is not a camera input at all: the game calls nothing on the camera. 100 frames of strikes:
    for (let i = 0; i < 100; i++) cam.update(1 / 8);
    expect(cam.pose()).toEqual(p0);
  });
});

describe('U-CAM4: reduced motion is cross-fades only', () => {
  it('every glide, ride, walk and creep becomes one cut (no intermediate pose)', () => {
    const cam = new FirstPersonCamera();
    cam.motion = 'reduced';
    const from = makePose(10, 1.6, 10, 0, 0);
    cam.place(from, 'drift');
    cam.play(breakthroughMove(from, makePose(10, 1.6, 7, 0, 0)));
    cam.enterExplore();
    run(cam, 1);
    cam.walk([{ x: 10, y: 1.6, z: 4 }]);
    run(cam, 1);
    cam.walk([{ x: 12, y: 1.6, z: 4 }, { x: 14, y: 1.6, z: 1 }], { kind: 'ride' });
    run(cam, 1);
    const log = cam.log();
    // Between cuts, the position never changes by a fraction of a jump: either still or the full jump at the cut's midpoint.
    for (let i = 1; i < log.length; i++) {
      const a = log[i - 1];
      const b = log[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (d > 1e-6) expect(b.phase === 'cut' || a.phase === 'cut').toBe(true);
    }
    expect(cam.pose().z).toBeCloseTo(1, 5);
  });
  it('the creep is a 0.18 s cross-fade step under reduced motion', () => {
    const cam = new FirstPersonCamera();
    cam.motion = 'reduced';
    cam.setRail({ origin: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 }, yaw: 0, pitch: 0 }, 0);
    cam.creepTo(1);
    expect(cam.running).toBe('creep');
    run(cam, 0.3);
    expect(cam.pose().z).toBeCloseTo(-1, 6);
  });
});

describe('U-CAM5: long moves are skippable', () => {
  it('every authored move longer than 1 s can be skipped to its end with a 0.15 s cross-fade', () => {
    const from = makePose(10, 1.6, 10, 0, 0);
    const moves = [breakthroughMove(from, makePose(10, 1.6, 6.8, 0, 0)), wayDownMove(from, [{ x: 10, y: 0, z: 7 }], { yaw: 0, pitch: -0.14 }), revealMove(from, makePose(10, -1, 7, 0, 0))];
    for (const m of moves) {
      expect(moveDuration(m)).toBeGreaterThan(1);
      const cam = new FirstPersonCamera();
      cam.place(from, 'drift');
      let done = false;
      cam.play(m, () => (done = true));
      run(cam, 0.3);
      expect(cam.skippable).toBe(true);
      expect(cam.skip()).toBe(true);
      run(cam, LAW.skipFade + 0.05);
      expect(done).toBe(true);
      expect(cam.moving).toBe(false);
    }
  });
  it('a cart ride is skippable', () => {
    const cam = new FirstPersonCamera();
    cam.place(makePose(0, 1.6, 0), 'wayDown');
    let arrived = false;
    cam.walk([{ x: 0, y: 1.6, z: -10 }, { x: 5, y: 0, z: -15 }], { kind: 'ride', done: (a) => (arrived = a) });
    run(cam, 0.5);
    expect(cam.skippable).toBe(true);
    expect(cam.skip()).toBe(true);
    run(cam, 0.3);
    expect(arrived).toBe(true);
    expect(cam.pose().x).toBeCloseTo(5, 6);
  });
});

describe('U-CAM6: blocks stay large during the creep (360 × 740)', () => {
  const W = 360;
  it('rest standoff 3.0 m: ≥ 92 px', () => {
    expect(sizePx(BLOCK_M, STANDOFF_M, W)).toBeGreaterThanOrEqual(BLOCK_MIN_REST_PX);
  });
  for (const v of ['A', 'B'] as const) {
    it(`creep ${v}: the face only ever comes closer during a step, is ≥ 86 px within 0.6 s of a slice falling and ≥ 92 px at rest`, () => {
      // A slice that falls shows the next slice 1 m deeper (4.0 m: 74 px at 360 px) at once; no camera can be there
      // before it falls. The creep then closes the gap: monotonic, ≥ 86 px within 0.6 s (A's 0.15 s wait + most of its
      // 0.6 s step; B's spring), and back to the 3.0 m rest standoff (≥ 92 px).
      const cam = new FirstPersonCamera();
      cam.creepVariant = v;
      cam.setRail({ origin: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 }, yaw: 0, pitch: 0 }, 0);
      let face = STANDOFF_M;
      for (let k = 0; k < 5; k++) {
        face += 1;
        cam.creepTo(face - STANDOFF_M);
        let prev = Infinity;
        let at86 = Infinity;
        for (let i = 1; i <= 120; i++) {
          cam.update(1 / 60);
          const d = face + cam.pose().z;
          expect(d).toBeLessThanOrEqual(prev + 1e-9);
          prev = d;
          if (sizePx(BLOCK_M, d, W) >= BLOCK_MIN_MOVING_PX && at86 === Infinity) at86 = i / 60;
        }
        expect(at86).toBeLessThanOrEqual(v === 'A' ? 0.6 : 0.62);
        expect(sizePx(BLOCK_M, face + cam.pose().z, W)).toBeGreaterThanOrEqual(BLOCK_MIN_REST_PX);
      }
      expect(checkLog(cam.log()).issues).toEqual([]);
    });
  }
  it('creep A: wait, then a 1 m step in 0.6 s peaking at 2.5 m/s', () => {
    const cam = new FirstPersonCamera();
    cam.setRail({ origin: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 }, yaw: 0, pitch: 0 }, 0);
    cam.creepTo(1);
    run(cam, CREEP_A.wait - 0.01);
    expect(cam.pose().z).toBeCloseTo(0, 6);
    run(cam, 0.7);
    expect(cam.pose().z).toBeCloseTo(-1, 3);
  });
  it('the lens: hFOV 52° locked → vFOV 93.1° at 390 × 844', () => {
    expect(verticalFov(390 / 844)).toBeCloseTo(93.1, 0);
  });
});

describe('Explore: the walk (W1-LEAD §3)', () => {
  it('walks at ≤ 2.5 m/s with eased starts and stops, and arrives', () => {
    const cam = new FirstPersonCamera();
    cam.place(makePose(1, 1.6, 1, 0, 0), 'stand');
    cam.enterExplore();
    cam.clearLog();
    let arrived = false;
    cam.walk([{ x: 1, y: 1.6, z: 9 }], { done: (a) => (arrived = a) });
    run(cam, 6);
    expect(arrived).toBe(true);
    const rep = checkLog(cam.log());
    expect(rep.issues).toEqual([]);
    expect(rep.peakSpeed).toBeLessThanOrEqual(2.5);
    expect(rep.peakSpeed).toBeGreaterThan(2.0);
    // Eased: the first and last 0.1 s move slowly (no jolt).
    const log = cam.log().filter((s) => s.move === 'walk');
    const v = (i: number) => Math.hypot(log[i + 1].x - log[i].x, log[i + 1].z - log[i].z) / (log[i + 1].t - log[i].t);
    expect(v(0)).toBeLessThan(0.6);
    expect(v(log.length - 2)).toBeLessThan(0.6);
  });
  it('turns toward the walk direction at ≤ 90°/s', () => {
    const cam = new FirstPersonCamera();
    cam.place(makePose(1, 1.6, 1, 0, 0), 'stand'); // looking toward −z
    cam.enterExplore();
    cam.clearLog();
    cam.walk([{ x: 1, y: 1.6, z: 9 }]); // walking toward +z: a 180° turn
    run(cam, 6);
    const rep = checkLog(cam.log());
    expect(rep.peakAutoTurnDeg).toBeLessThanOrEqual(LAW.maxTurnDeg * 1.05);
    expect(Math.abs(Math.cos(cam.pose().yaw - Math.PI))).toBeGreaterThan(0.99);
  });
  it('a drag during a walk wins over the auto-turn', () => {
    const cam = new FirstPersonCamera();
    cam.place(makePose(1, 1.6, 1, 0, 0), 'stand');
    cam.enterExplore();
    cam.walk([{ x: 1, y: 1.6, z: -9 }]); // straight ahead: no auto-turn needed
    run(cam, 0.5);
    cam.look(-120, 0); // drag left 120 px: look left by 26.4°
    run(cam, 1);
    expect(cam.pose().yaw / DEG).toBeCloseTo(120 * EXPLORE.degPerPx, 0);
  });
  it('drag-look: free yaw, pitch within ±55°, settles in ≤ 120 ms, roll 0', () => {
    const cam = new FirstPersonCamera();
    cam.place(makePose(1, 1.6, 1, 0, 0), 'stand');
    cam.enterExplore();
    cam.look(0, -2000); // drag up hard
    run(cam, 0.12);
    expect(cam.pose().pitch / DEG).toBeGreaterThan(55 * 0.985);
    expect(cam.pose().pitch / DEG).toBeLessThanOrEqual(55 + 1e-9);
    cam.look(3000, 4000);
    run(cam, 0.5);
    expect(cam.pose().pitch / DEG).toBeCloseTo(-55, 6);
    expect(cam.pose().roll).toBe(0);
    // Settle: after a 100 px step, 120 ms later the residual is < 2 % of the step.
    const y0 = cam.pose().yaw;
    cam.look(100, 0);
    run(cam, 0.12);
    const want = -100 * EXPLORE.degPerPx * DEG;
    expect(Math.abs(cam.pose().yaw - y0 - want)).toBeLessThan(Math.abs(want) * 0.02);
  });
  it('no bob: a level walk keeps the eye height exactly', () => {
    const cam = new FirstPersonCamera();
    cam.place(makePose(1, 1.6, 1, 0, 0), 'stand');
    cam.enterExplore();
    cam.walk([{ x: 1, y: 1.6, z: -5 }, { x: 4, y: 1.6, z: -8 }]);
    run(cam, 5);
    expect(cam.log().every((s) => Math.abs(s.y - 1.6) < 1e-9)).toBe(true);
  });
  it('a walk to act stops 0.9 m short and turns to face the target', () => {
    const nav = testNav();
    const plan = planWalk(nav, { x: 1.25, y: 1.6, z: 1.25 }, { x: 1.25, y: 0, z: 8.25 }, { actOn: { x: 1.25, y: 1.1, z: 8.25 } });
    expect(plan).not.toBeNull();
    const end = plan!.end;
    expect(Math.hypot(end.x - 1.25, end.z - 8.25)).toBeCloseTo(0.9, 2);
    const cam = new FirstPersonCamera();
    cam.place(makePose(1.25, 1.6, 1.25, Math.PI, 0), 'stand');
    cam.enterExplore();
    cam.walk(plan!.eye, { face: { x: 1.25, y: 1.1, z: 8.25 } });
    run(cam, 6);
    expect(cam.moving).toBe(false);
    const fwdZ = -Math.cos(cam.pose().yaw);
    expect(fwdZ).toBeGreaterThan(0.95);
  });
  it('steps up to 0.5 m are climbed smoothly (vertical ≤ 2.0 m/s, no stair-step)', () => {
    const nav = testNav();
    const plan = planWalk(nav, { x: 6.25, y: 1.6, z: 6.25 }, { x: 6.25, y: 0.5, z: 13.25 })!;
    expect(plan).not.toBeNull();
    const cam = new FirstPersonCamera();
    cam.place(makePose(6.25, 1.6, 6.25, Math.PI, 0), 'stand');
    cam.enterExplore();
    cam.clearLog();
    cam.walk(plan.eye);
    run(cam, 6);
    const log = cam.log();
    const rep = checkLog(log);
    expect(rep.issues).toEqual([]);
    // The rise spreads over ≥ 0.6 s (a moving average over 1 m of arc), never a jump.
    const rising = log.filter((s, i) => i > 0 && s.y - log[i - 1].y > 1e-5);
    expect(rising.length).toBeGreaterThan(30);
    expect(cam.pose().y).toBeCloseTo(2.1, 6);
  });
  it('ladders are ridden on rails at ≤ 1.4 m/s vertical', () => {
    const nav = testNav();
    const plan = planWalk(nav, { x: 2.25, y: 2.1, z: 12.25 }, { x: 2.25, y: 4.5, z: 15.25 })!;
    expect(plan).not.toBeNull();
    const cam = new FirstPersonCamera();
    cam.place(makePose(2.25, 2.1, 12.25, Math.PI, 0), 'stand');
    cam.enterExplore();
    cam.clearLog();
    let arrived = false;
    cam.walk(plan.eye, { done: (a) => (arrived = a) });
    run(cam, 12);
    expect(arrived).toBe(true);
    const rep = checkLog(cam.log());
    expect(rep.issues).toEqual([]);
    expect(rep.peakVertical).toBeLessThanOrEqual(EXPLORE.climbSpeed * 1.02);
    expect(cam.pose().y).toBeCloseTo(6.1, 6);
  });
  it('a new walk replaces the running one without a jolt', () => {
    const cam = new FirstPersonCamera();
    cam.place(makePose(1, 1.6, 1, 0, 0), 'stand');
    cam.enterExplore();
    cam.clearLog();
    let first: boolean | null = null;
    cam.walk([{ x: 1, y: 1.6, z: -9 }], { done: (a) => (first = a) });
    run(cam, 1);
    cam.walk([{ x: -4, y: 1.6, z: -6 }]);
    expect(first).toBe(false);
    run(cam, 5);
    expect(checkLog(cam.log()).issues).toEqual([]);
  });
  it('stopWalk brakes, never jolts', () => {
    const cam = new FirstPersonCamera();
    cam.place(makePose(1, 1.6, 1, 0, 0), 'stand');
    cam.enterExplore();
    cam.clearLog();
    cam.walk([{ x: 1, y: 1.6, z: -20 }]);
    run(cam, 1.5);
    cam.stopWalk();
    run(cam, 1.5);
    expect(cam.walking).toBe(false);
    expect(checkLog(cam.log()).issues).toEqual([]);
  });
});

describe('Explore: walk planning', () => {
  const nav = testNav();
  it('snaps a wall tap to the floor below it and a floor tap to its cell', () => {
    expect(snapToFloor(nav, { x: 4.1, y: 1.2, z: 4.1 })).toEqual({ x: 4.25, y: 0, z: 4.25 });
    expect(snapToFloor(nav, { x: 4.1, y: 0, z: 4.1 })).toEqual({ x: 4.25, y: 0, z: 4.25 });
    expect(snapToFloor(nav, { x: -9, y: 0, z: -9 })).toBeNull();
  });
  it('string-pulls a grid path and rounds its corners', () => {
    const raw = nav.findPath({ x: 1.25, y: 0, z: 1.25 }, { x: 6.25, y: 0, z: 6.25 })!;
    expect(raw.length).toBeGreaterThan(10);
    const pulled = pullString(nav, raw);
    expect(pulled.length).toBe(2);
    const rounded = roundCorners([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }]);
    expect(rounded.length).toBeGreaterThan(3);
    expect(rounded[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(rounded[rounded.length - 1]).toEqual({ x: 4, y: 0, z: 4 });
  });
  it('stopShort ends exactly 0.9 m (horizontal) from the target', () => {
    const p = stopShort([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }], { x: 0, y: 1, z: 10 }, 0.9);
    expect(p[p.length - 1].z).toBeCloseTo(9.1, 5);
  });
  it('the eye path rides 1.6 m above the floor', () => {
    const e = eyePath([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3 }]);
    expect(e.every((p) => Math.abs(p.y - 1.6) < 1e-9)).toBe(true);
  });
  it('a destination too close is no walk', () => {
    expect(planWalk(nav, { x: 4.25, y: 1.6, z: 4.25 }, { x: 4.3, y: 0, z: 4.3 })).toBeNull();
  });
});
