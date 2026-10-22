import { describe, expect, it } from 'vitest';
import { MOB_FX_SHADERS } from '../../src/render/mobs/MobRenderer';
import { MOB_MATERIAL_SHADERS } from '../../src/render/mobs/mobMaterial';

// Static checks of the creatures' GLSL (round 3, the second MOBS), for every variant a material
// compiles with. Node has no GLSL compiler, so these catch the link errors a browser would print:
// a name declared twice in a stage (round 3's telegraph shader redeclared `uTime` after
// LIGHTING_GLSL: "'uTime' : redefinition", and the ground telegraphs never drew), a fragment input
// that no vertex output feeds, a uniform declared with two types across the stages. three.js's own
// prefix (ShaderMaterial, GLSL3) is counted in, so a shader can never redeclare one of its names.
// The browser check (tools/mob-sheets.mjs, page errors) stays the ground truth.

/** What three.js r186 declares itself before a ShaderMaterial's vertex / fragment source. */
const THREE_VERTEX: Decl[] = [
  ['uniform', 'mat4', 'modelMatrix'],
  ['uniform', 'mat4', 'modelViewMatrix'],
  ['uniform', 'mat4', 'projectionMatrix'],
  ['uniform', 'mat4', 'viewMatrix'],
  ['uniform', 'mat3', 'normalMatrix'],
  ['uniform', 'vec3', 'cameraPosition'],
  ['uniform', 'bool', 'isOrthographic'],
  ['in', 'vec3', 'position'],
  ['in', 'vec3', 'normal'],
  ['in', 'vec2', 'uv'],
].map(([q, t, n]) => ({ q, type: t, name: n, builtin: true }));
const THREE_FRAGMENT: Decl[] = [
  ['uniform', 'mat4', 'viewMatrix'],
  ['uniform', 'vec3', 'cameraPosition'],
  ['uniform', 'bool', 'isOrthographic'],
].map(([q, t, n]) => ({ q, type: t, name: n, builtin: true }));

interface Decl {
  q: string;
  type: string;
  name: string;
  builtin?: boolean;
}

/** The active lines for a set of defines (#ifdef / #ifndef / #else / #endif, nested). */
function preprocess(src: string, defines: ReadonlySet<string>): string {
  const out: string[] = [];
  const stack: Array<{ on: boolean; taken: boolean }> = [];
  const active = () => stack.every((s) => s.on);
  for (const line of src.split('\n')) {
    const m = /^\s*#\s*(ifdef|ifndef|else|endif)\b\s*(\w*)/.exec(line);
    if (!m) {
      if (active()) out.push(line);
      continue;
    }
    if (m[1] === 'ifdef' || m[1] === 'ifndef') {
      const on = m[1] === 'ifdef' ? defines.has(m[2]) : !defines.has(m[2]);
      stack.push({ on, taken: on });
    } else if (m[1] === 'else') {
      const top = stack[stack.length - 1];
      top.on = !top.taken;
      top.taken = true;
    } else stack.pop();
  }
  expect(stack.length, 'balanced #ifdef / #endif').toBe(0);
  return out.join('\n');
}

/** The global declarations of a stage (comments stripped). */
function decls(src: string): Decl[] {
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Decl[] = [];
  const re = /^\s*(?:layout\s*\([^)]*\)\s*)?(uniform|in|out)\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*(?:\[[^\]]*\])?\s*;/gm;
  for (let m = re.exec(code); m; m = re.exec(code)) out.push({ q: m[1], type: m[2], name: m[3] });
  return out;
}

function duplicates(list: Decl[]): string[] {
  const seen = new Map<string, Decl>();
  const bad: string[] = [];
  for (const d of list) {
    // An input and an output may share no name either; uniforms share the global namespace too.
    const prev = seen.get(d.name);
    if (prev) bad.push(`${d.name} (${prev.q}${prev.builtin ? ', three.js' : ''} and ${d.q})`);
    else seen.set(d.name, d);
  }
  return bad;
}

function checkProgram(label: string, vertex: string, fragment: string): void {
  const v = [...THREE_VERTEX, ...decls(vertex)];
  const f = [...THREE_FRAGMENT, ...decls(fragment)];
  expect(duplicates(v), `${label}: vertex redeclarations`).toEqual([]);
  expect(duplicates(f), `${label}: fragment redeclarations`).toEqual([]);
  const outs = new Map(v.filter((d) => d.q === 'out').map((d) => [d.name, d.type]));
  for (const d of f.filter((x) => x.q === 'in')) {
    expect(outs.has(d.name), `${label}: fragment input ${d.name} has no vertex output`).toBe(true);
    expect(outs.get(d.name), `${label}: ${d.name} types agree`).toBe(d.type);
  }
  const vu = new Map(v.filter((d) => d.q === 'uniform').map((d) => [d.name, d.type]));
  for (const d of f.filter((x) => x.q === 'uniform')) if (vu.has(d.name)) expect(vu.get(d.name), `${label}: uniform ${d.name} has one type`).toBe(d.type);
  // Exactly one colour output.
  expect(f.filter((d) => d.q === 'out').length, `${label}: one fragment output`).toBe(1);
}

describe("the creatures' shaders compile-check statically", () => {
  it.each(MOB_MATERIAL_SHADERS.variants.map((v) => [v || '(plain)', v]))('the creature material, %s', (_label, variant) => {
    const defines = new Set(variant.split(' ').filter(Boolean));
    checkProgram(`material ${variant}`, preprocess(MOB_MATERIAL_SHADERS.vertex, defines), preprocess(MOB_MATERIAL_SHADERS.fragment, defines));
  });

  it.each(Object.keys(MOB_FX_SHADERS))('the %s', (name) => {
    const [vs, fs] = MOB_FX_SHADERS[name];
    checkProgram(name, preprocess(vs, new Set()), preprocess(fs, new Set()));
  });

  it('the check would have caught round 3\'s uTime redefinition', () => {
    const [vs, fs] = MOB_FX_SHADERS.telegraphs;
    const broken = fs.replace('in vec2 vUv;', 'uniform float uTime;\nin vec2 vUv;');
    const f = [...THREE_FRAGMENT, ...decls(preprocess(broken, new Set()))];
    expect(duplicates(f).some((d) => d.startsWith('uTime'))).toBe(true);
    void vs;
  });
});
