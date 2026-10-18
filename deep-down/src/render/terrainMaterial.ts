import * as THREE from 'three';
import { BLOCKS } from '../config/blocks';
import { TILE_NAMES, TILE_SIZE } from '../config/tiles';
import { LIGHTING_GLSL, type LightingUniforms } from './lighting';
import type { TileAtlas } from './textures';

/** Builds the sRGB texture array from the procedural tiles, with mipmaps for distant faces. */
export function createTileTexture(atlas: TileAtlas): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(atlas.data, TILE_SIZE, TILE_SIZE, atlas.layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Emissive strength per texture layer, derived from the block definitions that use it. */
export function tileGlowTable(): number[] {
  const glow = new Array(TILE_NAMES.length).fill(0);
  for (const b of BLOCKS) {
    if (!b || !b.visible) continue;
    for (const t of [b.tiles.top, b.tiles.side, b.tiles.bottom]) glow[t] = Math.max(glow[t], b.glow);
  }
  return glow;
}

const vertex = /* glsl */ `
in vec4 aData;
out vec3 vWorldPos;
out vec2 vUv;
out float vAo;
out float vDepth;
flat out int vFace;
flat out float vLayer;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vFace = int(aData.x + 0.5);
  vAo = aData.y;
  vLayer = aData.z;
  float uvBits = aData.w;
  float u = mod(uvBits, 2.0);
  float v = floor(uvBits * 0.5 + 0.01);
  vUv = vec2(u, 1.0 - v);
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
${LIGHTING_GLSL}
uniform sampler2DArray uTiles;
uniform float uTileGlow[${TILE_NAMES.length}];

in vec3 vWorldPos;
in vec2 vUv;
in float vAo;
in float vDepth;
flat in int vFace;
flat in float vLayer;
layout(location = 0) out highp vec4 fragColor;

const vec3 FACE_N[6] = vec3[](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));
// Directional shading keeps voxel forms readable even under flat ambient light.
const float FACE_SHADE[6] = float[](0.80, 0.74, 1.0, 0.52, 0.88, 0.70);

void main() {
  if (vWorldPos.y > uDebug.y) discard;
  vec3 n = FACE_N[vFace];
  vec4 tex = texture(uTiles, vec3(vUv, vLayer));
  vec3 cell = floor(vWorldPos - n * 0.5);
  float h = hash13(cell);
  vec3 albedo = tex.rgb * (0.9 + 0.2 * h);

  vec3 samplePos = vWorldPos + n * 0.5;
  float ao = vAo / 3.0;
  float aoCurve = 0.28 + 0.72 * ao;

  vec3 ambient = worldLight(samplePos) * FACE_SHADE[vFace] * aoCurve;
  vec3 lantern = lanternLight(samplePos, vWorldPos, n) * (0.55 + 0.45 * ao);
  vec3 color = albedo * (ambient + lantern + vec3(uDebug.x) * FACE_SHADE[vFace] * aoCurve);

  int layer = int(vLayer + 0.5);
  float glow = tex.a * uTileGlow[layer];
  float pulse = 0.85 + 0.15 * sin(uTime * 1.7 + h * 6.2831);
  vec3 emissive = tex.rgb * glow * pulse;

  float fog = fogFactor(vDepth);
  color = mix(color, uFogColor, fog);
  color += emissive * (1.0 - fog * 0.75);
  fragColor = vec4(color, 1.0);
}
`;

export function createTerrainMaterial(lighting: LightingUniforms, tiles: THREE.DataArrayTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...lighting,
      uTiles: { value: tiles },
      uTileGlow: { value: tileGlowTable() },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}
