// The hybrid world's public surface (1B). See each module's header for its contract.
export * from './grid';
export { VoxelRing } from './VoxelRing';
export { DeepWorld, type DeepWorldOptions, type WorldUpdate } from './DeepWorld';
export { NavGrid, findPath, pathLengthM, HEADROOM, type VoxelReader, type VoxelBounds } from './nav';
export { placeNode, placeCamp, nodeFrame, chamberGeom, nodesInBand, yawOf, HEADINGS, EYE, STANDOFF, DIG_PITCH, LAP_GAP } from './layout';
export { deepPath, type PathPoint, type PathKind } from './deepPath';
export { templateFor, templateInfo, templateIdFor, TEMPLATE_SPECS, SKIN_CELLS } from './kits/templates';
export type * from './kits/types';
export type * from './placement';
