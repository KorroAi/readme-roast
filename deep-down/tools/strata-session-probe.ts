// WORLD probe (round 3): a strata WorldSession in Node: edits right after load, props whose anchor is not solid.
// Usage: node tools/run-ts.mjs tools/strata-session-probe.ts [seed] [stratum]
import { BLOCKS } from '../src/config/blocks';
import { WorldSession } from '../src/game/WorldSession';

export default async function probe(args: string[]): Promise<void> {
  const seed = Number(args[0] ?? 1337);
  const stratum = Number(args[1] ?? 1);
  const s = await WorldSession.create(() => undefined, seed, stratum);
  const w = s.world;
  const edits = s.worldEdits();
  console.log('edits after load', edits.length / 2);
  for (let i = 0; i < Math.min(edits.length, 40); i += 2) {
    const idx = edits[i];
    const x = idx % w.sx, y = Math.floor(idx / w.sx) % w.sy, z = Math.floor(idx / (w.sx * w.sy));
    console.log('  edit at', x, y, z, 'gen', BLOCKS[s.generated[idx]]?.name, '-> live', BLOCKS[edits[i + 1]]?.name);
  }
  let bad = 0;
  const kinds = new Map<string, number>();
  for (const p of s.liveProps.values()) {
    if (!p.anchor) continue;
    const [ax, ay, az] = p.anchor;
    if (!w.isSolid(ax, ay, az)) {
      bad++;
      kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
      if (bad <= 8) console.log('  unanchored', p.id, p.kind, 'at', p.x, p.y, p.z, 'anchor', p.anchor, 'hangs', p.anchor[1] > p.y);
    }
  }
  console.log('props', s.liveProps.size, 'unanchored', bad, JSON.stringify([...kinds]));
  const removed = [...s.removedProps];
  console.log("removed at load", removed.length, removed.slice(0, 10));
  await afterApply(s);
}

export async function afterApply(s: WorldSession): Promise<void> {
  await s.applySave([], []);
  const e = s.worldEdits();
  console.log('edits after applySave([],[])', e.length / 2);
  const w = s.world;
  for (let i = 0; i < Math.min(e.length, 20); i += 2) {
    const idx = e[i];
    const x = idx % w.sx, y = Math.floor(idx / w.sx) % w.sy, z = Math.floor(idx / (w.sx * w.sy));
    console.log('  edit at', x, y, z, 'gen', BLOCKS[s.generated[idx]]?.name, s.generated[idx], '-> live', BLOCKS[e[i + 1]]?.name, e[i + 1]);
  }
}
