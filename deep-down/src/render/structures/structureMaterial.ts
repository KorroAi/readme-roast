import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../lighting';
import { MAT, MATERIAL_NAMES } from '../materials';
import { courseGlsl } from '../materials/courses';
import { MAT_DENSITY, MAT_SIZE } from '../materials/paint';
import type { TerrainUniforms } from '../terrainRig';

/**
 * Material of the built forms drawn as structure meshes (stairs, columns, the bridge, coping,
 * timber; see StructureRenderer). It is the terrain material's surface and light model on free
 * geometry: the same material layers (dressed-stone course libraries, timber), the same light
 * volume, lantern, placed-light direction (LAMP_DIR, toggled with the quality preset like the
 * terrain's: the material carries `uMatGlow`), hemisphere shade and zone atmosphere, so a column
 * and the wall behind it read as one masonry.
 *
 * Vertex (28 bytes): position (float x3), aNrm (int8 x4, normalised), aSt (int16 x2, 1/8 texel),
 * aLight (int8 x4, light-volume sample point relative to the position, 1/50 m: the builder
 * moves it out of the collision voxels the mesh covers, which carry no light), aInfo (uint8 x4:
 * layer, face | mode << 3, AO 0..255, strip row).
 *
 * Texture modes (per polygon):
 *   0 world  dressed stone laid in world-space courses exactly like a terrain wall on the same
 *            plane (st = the terrain's face projection in metres x 16, `face` its axis), so a
 *            band or coping continues the courses of the voxel wall it stands on;
 *   1 stone  one course strip of a library layer (`row`), st in the stone's own frame (texels):
 *            a drum, a stair step or a coping stone shows its own face and head joints, with the
 *            bed joints where the geometry has them;
 *   2 plain  a seamless layer (timber), st in texels.
 * Cost per fragment: as a terrain masonry fragment (1 material fetch, 2 noise fetches, 1-2 light
 * fetches, 1 lantern fetch), course mapping only in mode 0.
 */

const vertex = /* glsl */ `
in vec4 aNrm;
in vec2 aSt;
in vec4 aLight;
in vec4 aInfo;
out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vSt;
out vec3 vLight;
out float vAo;
out float vDepth;
flat out int vFace;
flat out int vMode;
flat out float vLayer;
flat out float vRow;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = aNrm.xyz;
  vSt = aSt * 0.125;
  vLight = wp.xyz + aLight.xyz * (127.0 / 50.0);
  vLayer = aInfo.x;
  int fm = int(aInfo.y + 0.5);
  vFace = fm & 7;
  vMode = fm >> 3;
  vAo = aInfo.z * (1.0 / 255.0);
  vRow = aInfo.w;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

function fragment(): string {
  const course = courseGlsl({ masonry: MAT.masonry, masonryB: MAT.masonryB, crumbling: MAT.crumbling, crumblingB: MAT.crumblingB });
  // courseSample uses the terrain shader's sharp-bilinear helpers: define them unless the course
  // chunk brings its own.
  const sharp = /vec2\s+sharpUv\s*\(/.test(course)
    ? ''
    : /* glsl */ `
vec2 sharpUv(vec2 uv, vec2 gx, vec2 gy, float soft) {
  vec2 t = uv * ${MAT_SIZE}.0;
  vec2 c = floor(t + 0.5);
  vec2 w = max((abs(gx) + abs(gy)) * ${MAT_SIZE}.0, vec2(soft));
  return (c + clamp((t - c) / w, -0.5, 0.5)) * (1.0 / ${MAT_SIZE}.0);
}`;
  const soft = /\bSOFT_CUT\b\s*=/.test(course) ? '' : 'const float SOFT_CUT = 0.12;';
  return /* glsl */ `
precision highp float;
precision highp sampler2DArray;
precision highp sampler3D;
${LIGHTING_GLSL}
uniform sampler2DArray uMat;
uniform sampler3D uNoise;
uniform float uMatGlow[${MATERIAL_NAMES.length}];
// Monolith mode: per 8-row band of the masonry layer, the longest joint-free stone of the strip
// starting there (first texel, width), measured from the painted layer (StructureRenderer).
uniform vec2 uSpan[16];

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vSt;
in vec3 vLight;
in float vAo;
in float vDepth;
flat in int vFace;
flat in int vMode;
flat in float vLayer;
flat in float vRow;
layout(location = 0) out highp vec4 fragColor;

const vec3 FACE_N[6] = vec3[](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));
${sharp}
${soft}
${course}

// The terrain's sky-less hemisphere shade (terrainMaterial.ts shadeOf).
float shadeOf(vec3 n) {
  vec3 w = n * n;
  vec3 pos = vec3(0.84, 1.0, 0.82);
  vec3 neg = vec3(0.80, 0.6, 0.86);
  return dot(w, mix(neg, pos, step(0.0, n)));
}

void main() {
  int layer = int(vLayer + 0.5);
  vec2 uv = vSt * (1.0 / ${MAT_SIZE}.0);
  vec2 gx = dFdx(uv);
  vec2 gy = dFdy(uv);
  vec4 tex;
  if (vMode == 0) {
    vec3 n = FACE_N[vFace];
    // The plane of the solid cell behind the face, as the terrain computes it for its walls.
    float plane = dot(floor(vWorldPos - n * 0.5), abs(n)) + 0.5;
    vec4 crs = masonryCourse(vSt * (1.0 / ${MAT_DENSITY}.0), vFace, plane);
    tex = courseSample(layer, crs, gx, gy);
  } else if (vMode == 1) {
    tex = courseSample(layer, vec4(vSt.x, vSt.y, vRow, -1.0), gx, gy);
  } else if (vMode == 3) {
    vec2 sp = uSpan[int(vRow + 0.5) >> 3];
    float t = mod(vSt.x - sp.x, 2.0 * sp.y);
    tex = courseSample(layer, vec4(sp.x + sp.y - abs(t - sp.y), vSt.y, vRow, -1.0), gx, gy);
  } else {
    tex = textureGrad(uMat, vec3(sharpUv(uv, gx, gy, SOFT_CUT), vLayer), gx, gy);
  }
  vec4 macroN = textureLod(uNoise, vWorldPos * (1.0 / 190.0), 0.0);
  float macro = textureLod(uNoise, vWorldPos * (1.0 / 38.0), 0.0).a * 0.65 + macroN.b * 0.35;
  vec3 albedo = tex.rgb * (0.84 + 0.32 * macro);

  vec3 ng = normalize(vNormal);
  vec4 ls = lightSample(vLight);
  float ao = vAo;
  float aoCurve = 0.18 + 0.82 * ao;
  float shade = shadeOf(ng);
#ifdef LAMP_DIR
  vec2 facing = placedFacing(ls, vLight, ng);
#else
  vec2 facing = vec2(1.0);
#endif
  vec3 ambient = ambientFrom(ls, ng, facing, ao) * shade * aoCurve;
  vec3 lantern = lanternLight(vLight, vWorldPos, ng, ls.a) * (0.4 + 0.6 * ao);
  vec3 color = albedo * (ambient + lantern + vec3(uDebug.x) * shade * aoCurve);
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb, atm.a);
  fragColor = vec4(sceneOut(color), 1.0);
}
`;
}

/**
 * Longest joint-free run of texel columns (wrapping) of each 8-row band's strip in a course
 * library layer: [first texel + 1, width - 2] per band (joints are the columns whose height is
 * low through the strip). Strips of library A start at rows 0, 8, 24, 40, 64 and 96.
 */
export function stoneSpans(data: ArrayLike<number> | null, size: number, layer: number, strips: ReadonlyArray<readonly [number, number]>): THREE.Vector2[] {
  const spans = Array.from({ length: 16 }, () => new THREE.Vector2(1, 30));
  if (!data) return spans;
  const base = layer * size * size * 4;
  for (const [y0, h] of strips) {
    const joint: boolean[] = [];
    for (let x = 0; x < size; x++) {
      let mn = 255;
      for (let y = y0 + 1; y < y0 + h - 2; y++) mn = Math.min(mn, data[base + (x + y * size) * 4 + 3]);
      joint.push(mn < 40);
    }
    let best = 0;
    let bestStart = 0;
    for (let x = 0; x < size; x++) {
      if (joint[x] || !joint[(x + size - 1) % size]) continue;
      let n = 0;
      while (n < size && !joint[(x + n) % size]) n++;
      if (n > best) {
        best = n;
        bestStart = x;
      }
    }
    if (best >= 8) for (let r = y0; r < y0 + h; r += 8) spans[r >> 3].set(bestStart + 1, best - 2);
  }
  return spans;
}

export function createStructureMaterial(lighting: LightingUniforms, terrain: TerrainUniforms, spans: THREE.Vector2[] = stoneSpans(null, MAT_SIZE, 0, [])): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { LAMP_DIR: '' },
    uniforms: {
      ...lighting,
      uMat: terrain.uMat,
      uNoise: terrain.uNoise,
      uMatGlow: terrain.uMatGlow,
      uSpan: { value: spans },
    },
    vertexShader: vertex,
    fragmentShader: fragment(),
  });
}
