import * as THREE from 'three';
import { CRACK_STAGES } from '../../config/tiles';
import { CRACK_LAYER } from '../../render/textures';
import { damp } from '../../core/math';
import type { TerrainRig } from '../../render/terrainRig';

const crackVert = /* glsl */ `
out vec3 vLocal;
out vec3 vNormalL;
void main() {
  vLocal = position;
  vNormalL = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const crackFrag = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTiles;
uniform float uLayer;
uniform float uFlash;
uniform float uOpacity;
in vec3 vLocal;
in vec3 vNormalL;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec3 p = vLocal + 0.5;
  vec3 n = abs(vNormalL);
  vec2 uv = n.x > 0.5 ? p.zy : n.y > 0.5 ? p.xz : p.xy;
  float crack = uLayer >= 0.0 ? texture(uTiles, vec3(uv.x, 1.0 - uv.y, uLayer)).a : 0.0;
  // Darken along cracks, plus a short bright flash on each impact.
  vec3 col = mix(vec3(0.0), vec3(1.0, 0.92, 0.8), uFlash);
  float a = max(crack * 0.82, uFlash * 0.35) * uOpacity;
  if (a < 0.01) discard;
  fragColor = vec4(col * a, a);
}
`;

/**
 * Feedback on the block being mined: fractures that spread with damage, a soft warm light
 * around the point the pick strikes and a short flash on every impact; red when the block is
 * too hard.
 *
 * With a TerrainRig (the game) the terrain shader draws all of it on the sculpted surface
 * itself (no cube frame), centred on the ray hit when the caller passes `point`, else on where
 * the line of sight enters the block. Without one (tools), a crack box and outline are drawn.
 */
export class TargetMarker {
  readonly group = new THREE.Group();
  private readonly crack: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  private readonly outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  private punch = 0;
  private flash = 0;
  private visibleTarget = false;
  private readonly okColor = new THREE.Color(0xffe2b8);
  private readonly blockedColor = new THREE.Color(0xff6b5e);

  private stage = -1;
  private blocked = false;
  private active = false;
  private cell: { x: number; y: number; z: number } | null = null;
  private hit: { x: number; y: number; z: number } | null = null;

  constructor(tiles: THREE.DataArrayTexture, private readonly terrain: TerrainRig | null = null) {
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uTiles: { value: tiles }, uLayer: { value: -1 }, uFlash: { value: 0 }, uOpacity: { value: 1 } },
      vertexShader: crackVert,
      fragmentShader: crackFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), mat);
    this.crack.renderOrder = 5;
    this.crack.frustumCulled = false;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: this.okColor, transparent: true, opacity: 0.55, depthWrite: false }));
    this.outline.renderOrder = 6;
    this.group.add(this.crack, this.outline);
    this.group.visible = false;
  }

  /**
   * Show the marker on voxel (x,y,z) with damage progress in [0,1]. Pass null to hide.
   * `target.point`: where the mining ray strikes the block (optional; centres the highlight).
   */
  set(target: { x: number; y: number; z: number; point?: { x: number; y: number; z: number } | null } | null, progress: number, blocked: boolean, active: boolean): void {
    if (!target) {
      this.visibleTarget = false;
      this.group.visible = false;
      this.cell = null;
      this.hit = null;
      this.terrain?.setTarget(null, -1, 0, false, false);
      return;
    }
    this.visibleTarget = true;
    const stage = progress <= 0 ? -1 : Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES));
    this.cell = target;
    this.hit = target.point ?? null;
    this.stage = stage;
    this.blocked = blocked;
    this.active = active;
    if (this.terrain) {
      this.group.visible = false;
      this.terrain.setTarget(target, stage < 0 ? -1 : CRACK_LAYER(stage), this.flash, active, blocked, this.hit);
      return;
    }
    this.group.visible = true;
    this.group.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    this.crack.material.uniforms.uLayer.value = stage < 0 ? -1 : CRACK_LAYER(stage);
    this.outline.material.color.copy(blocked ? this.blockedColor : this.okColor);
    this.outline.material.opacity = active ? 0.7 : 0.35;
  }

  /** Call on every pickaxe impact. */
  impact(strength = 1): void {
    this.punch = Math.min(1, this.punch + 0.6 * strength);
    this.flash = 1;
  }

  update(dt: number): void {
    if (!this.visibleTarget) return;
    this.punch = damp(this.punch, 0, 18, dt);
    this.flash = damp(this.flash, 0, 22, dt);
    const s = 1 + this.punch * 0.045;
    this.crack.scale.setScalar(s);
    this.crack.material.uniforms.uFlash.value = this.flash;
    if (this.terrain && this.cell) this.terrain.setTarget(this.cell, this.stage < 0 ? -1 : CRACK_LAYER(this.stage), this.flash, this.active, this.blocked, this.hit);
  }

  dispose(): void {
    this.crack.geometry.dispose();
    this.crack.material.dispose();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
  }
}
