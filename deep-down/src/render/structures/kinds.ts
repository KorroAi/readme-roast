import type { StructureSpec } from '../../world/gen/types';
import type { StructureBuilder } from './builder';
import { buildBridge } from './bridge';
import { buildBlock, buildColumn, buildDrum } from './columns';
import { buildCoping, buildKerbSlope, buildPylon, buildWeathering } from './pylon';
import { buildStairFlight } from './stairs';
import { buildBeam, buildDeck } from './timber';

/** Build one structure spec into the builder (world coordinates). */
export function buildStructure(b: StructureBuilder, spec: StructureSpec): void {
  // Every piece starts from contact occlusion against the terrain (a builder may override it).
  b.aoAt = b.contactAo();
  b.aoFixed = null;
  b.tone = 1;
  switch (spec.kind) {
    case 'stairFlight':
      buildStairFlight(b, spec);
      break;
    case 'column':
      buildColumn(b, spec);
      break;
    case 'drum':
      buildDrum(b, spec);
      break;
    case 'block':
      buildBlock(b, spec);
      break;
    case 'bridge':
      buildBridge(b, spec);
      break;
    case 'beam':
      buildBeam(b, spec);
      break;
    case 'deck':
      buildDeck(b, spec);
      break;
    case 'pylon':
      buildPylon(b, spec);
      break;
    case 'coping':
      buildCoping(b, spec);
      break;
    case 'weathering':
      buildWeathering(b, spec);
      break;
    case 'kerbSlope':
      buildKerbSlope(b, spec);
      break;
    default:
      break;
  }
}
