// The built forms drawn as structure meshes (render/structures): moved here from the deleted zone
// generator. The descent's slab generator emits them for ruins, Halden timber and
// the seal halls. All units are world metres.

/**
 * A built form drawn as a structure mesh (render/structures) over its collision cells
 * (B.STRUCTURE, the stair B.RAMP_* cells): the generator writes both. All units are world metres.
 */
export type StructureSpec =
  | {
      /** A straight stair flight descending from (x0, top, z0) along `dir` for `run` metres, one
       *  metre down per metre, between parapets; walk width `width` (centred on the line). */
      kind: 'stairFlight';
      id: string;
      x0: number;
      z0: number;
      top: number;
      dir: 'x' | 'z';
      run: number;
      width: number;
      /** Parapet (cheek wall) thickness on each side. */
      parapet: number;
      /** Arched bays between the piers that carry the flight: [s0, s1] along it. */
      bays: Array<[number, number]>;
      seed: number;
    }
  | {
      /** A round column on the floor at (x, y, z): base, shaft with entasis in drums, capital;
       *  `top` = underside of what it carries (full), or the height of the break (broken). */
      kind: 'column';
      id: string;
      x: number;
      y: number;
      z: number;
      radius: number;
      top: number;
      state: 'full' | 'broken' | 'stump';
      seed: number;
    }
  | {
      /** A fallen column drum lying along `axis`, centre (x, y, z). */
      kind: 'drum';
      id: string;
      x: number;
      y: number;
      z: number;
      axis: 'x' | 'z';
      length: number;
      radius: number;
      roll: number;
      seed: number;
    }
  | {
      /** A dressed stone block (kerbs, slabs, newels): box with chamfered arrises. */
      kind: 'block';
      id: string;
      min: [number, number, number];
      max: [number, number, number];
      /** Long axis of the stone (texture), and its strip height class (m). */
      axis: 'x' | 'z';
      chamfer: number;
      seed: number;
    }
  | {
      /** A run of coping / kerb stones on top of a wall from a to b (horizontal), stones about
       *  `stone` m long, section width x height, top at y. */
      kind: 'coping';
      id: string;
      a: [number, number];
      b: [number, number];
      y: number;
      width: number;
      height: number;
      stone: number;
      seed: number;
    }
  | {
      /** A timber from a to b (world points on its axis), section w x h m (h along the
       *  beam's up side), optionally splintered at an end where it snapped. */
      kind: 'beam';
      id: string;
      a: [number, number, number];
      b: [number, number, number];
      w: number;
      h: number;
      /** 0 none, 1 at a, 2 at b. */
      splinter: 0 | 1 | 2;
      /** Twist about the axis (radians): a fallen timber does not lie square. */
      roll: number;
      seed: number;
    }
  | {
      /** A sloped weathering stone on a set-back (the top of a buttress step): x0..x1 across the
       *  step (it rises toward +x), z0..z1 along it, sitting on y, rising `rise` m. */
      kind: 'weathering';
      id: string;
      x0: number;
      x1: number;
      z0: number;
      z1: number;
      y: number;
      rise: number;
      seed: number;
    }
  | {
      /** A sloping (battered) kerb along a paved way from x0 to x1 (cells x0..x1-1): its top edge
       *  at y on the line z, falling one metre toward `out` (the z direction, +1 or -1). */
      kind: 'kerbSlope';
      id: string;
      x0: number;
      x1: number;
      z: number;
      out: number;
      y: number;
      seed: number;
    }
  | {
      /** A plank deck on joists over the floor: x0..x1, z0..z1, its walking surface at y; the
       *  boards run along `along`. */
      kind: 'deck';
      id: string;
      x0: number;
      x1: number;
      z0: number;
      z1: number;
      y: number;
      along: 'x' | 'z';
      seed: number;
    }
  | {
      /** The arched bridge over the chasm: deck at `deck` (walking surface) from z0 to z1,
       *  centred on x, walk width `width`, parapets `parapet` thick. */
      kind: 'bridge';
      id: string;
      x: number;
      z0: number;
      z1: number;
      deck: number;
      width: number;
      parapet: number;
      /** The arch: springing height, the span of its springing points, its intrados crown. */
      spring: number;
      zA: number;
      zB: number;
      crown: number;
      /** z of the cell of the lamp pedestal on the west parapet. */
      mid: number;
      seed: number;
    }
  | {
      /** The landing pylon's dress over its voxel walls: a cornice under the landing (`top`, the
       *  landing floor), a socle at its foot (`foot`, the hall floor), corner rolls, along the
       *  wall faces `path` (horizontal polyline, outward to its left), and frames round its
       *  recesses. */
      kind: 'pylon';
      id: string;
      path: Array<[number, number]>;
      foot: number;
      top: number;
      /** Recess openings: in a wall plane z = at ('z') or x = at ('x'), spanning a0..a1 along it
       *  and y0..y1; `out` = the outward sign of the wall's normal. */
      recesses: Array<{ face: 'x' | 'z'; at: number; out: number; a0: number; a1: number; y0: number; y1: number }>;
      seed: number;
    };
