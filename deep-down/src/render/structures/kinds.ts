import type { StructureSpec } from '../../world/gen/types';
import type { StructureBuilder } from './builder';
import { buildBridge } from './bridge';
import { buildBlock, buildColumn, buildDrum } from './columns';
import { buildStairFlight } from './stairs';

/** Build one structure spec into the builder (world coordinates). */
export function buildStructure(b: StructureBuilder, spec: StructureSpec): void {
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
    default:
      break;
  }
}
