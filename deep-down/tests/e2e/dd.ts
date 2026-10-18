// The slice of window.__DD__ (src/debug/DebugApi.ts) the e2e specs use, declared once so every
// spec type-checks together. Game internals are reached through `game` and typed loosely.

export type Vec3i = [number, number, number];

export type DD = {
  ready: boolean;
  state(): any;
  report(): any;
  events(type?: string): Array<{ type: string; payload: any; t: number }>;
  clearEvents(): void;
  prepareMining(id: number, x: number, y: number, z: number, r?: number): { block: Vec3i; stand: Vec3i } | null;
  aimAt(x: number, y: number, z: number, ndcX?: number, ndcY?: number): boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  landmarks(): Record<string, Vec3i>;
  standableNear(x: number, y: number, z: number): Vec3i | null;
  block(x: number, y: number, z: number): number;
  give(item: string, n: number): number;
  save(): boolean;
  game: any;
};

declare global {
  interface Window {
    __DD__: DD;
    /** Set by the Android shell's Back handling; installed by the game and the Visual Lab. */
    deepDownBack?: () => boolean;
  }
}
