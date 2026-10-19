import type { MatCanvas, Rng } from './paint';
import { bedrock, dampSide, dampTop, deepSide, deepTop, sealStone, stoneSide, stoneTop, weatheredSide, weatheredTop } from './rock';
import { gravel, soil, soilSide } from './earth';
import { copperTop, copperVein, crystal, ironTop, ironVein } from './minerals';
import { crumbling, crumblingB, floorSlab, hearth, masonry, masonryB, masonryTop } from './masonry';
import { beamEnd, beamSide, plank } from './timber';

export type MaterialPainter = (c: MatCanvas, rng: Rng) => unknown;

/** One painter per material layer (keys must match MATERIAL_NAMES). */
export const PAINTERS = {
  stoneSide,
  stoneTop,
  deepSide,
  deepTop,
  weatheredSide,
  weatheredTop,
  dampSide,
  dampTop,
  soil,
  soilSide,
  gravel,
  copperVein,
  copperTop,
  ironVein,
  ironTop,
  crystal,
  sealStone,
  masonry,
  masonryTop,
  floorSlab,
  crumbling,
  plank,
  beamSide,
  beamEnd,
  hearth,
  bedrock,
  masonryB,
  crumblingB,
} satisfies Record<string, MaterialPainter>;
