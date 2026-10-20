// Types for emblem.mjs (a plain ES module shared with android/make-icon.mjs and vite.config.ts).
export type Pt = [number, number];
export type Stop = [offset: number, color: string];
export type Paint = { solid: string; linear?: undefined } | { solid?: undefined; linear: [x0: number, y0: number, x1: number, y1: number, stops: Stop[]] };
export interface Layer {
  role: 'carve' | 'lintel' | 'ink' | 'flame' | 'core';
  rule: 'nonzero' | 'evenodd';
  contours: Pt[][];
  paint: Paint;
}
export declare const PALETTE: {
  carve: string;
  stoneHi: string;
  stoneLo: string;
  lintelTop: string;
  lintelLit: string;
  inkHi: string;
  inkLo: string;
  flameCore: string;
  flameMid: string;
  flameTip: string;
  bgCenter: string;
  bgEdge: string;
  glow: string;
  brass500: string;
};
export declare const LANTERN: { stemWidth: number; stemLength: number; diag: number; stroke: number; flat: number; footGap: number; footHeight: number };
export declare const LINTEL: { halfLength: number; thickness: number; chamfer: number; tickWidth: number; tickLength: number; groove: number };
export declare function ringOuter(): number;
export declare function ringInner(): number;
export declare function ringCenterY(): number;
export declare function lanternBottom(foot?: boolean): number;
export declare function lanternHalfWidth(): number;
export declare function area(poly: Pt[]): number;
export declare function offset(poly: Pt[], d: number): Pt[];
export declare function flame(by: number, h: number, w: number, sway?: number, steps?: number): Pt[];
export declare function lanternLayers(ox?: number, oy?: number, outline?: number, opts?: { foot?: boolean; steps?: number }): Layer[];
export declare function lintelPolygon(half?: number): Pt[];
export declare function emblemLayers(outline?: number, opts?: { foot?: boolean; steps?: number; groove?: boolean }): Layer[];
export declare function emblemBounds(outline?: number): { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number };
export declare function flameCenter(): Pt;
export declare function pathData(contours: Pt[][], k?: number, ox?: number, oy?: number, dp?: number): string;
export declare function emblemSvg(opts?: { size?: number; glow?: boolean; attrs?: string; idPrefix?: string }): string;
export declare function bootMarkSvg(opts?: { size?: number }): string;
