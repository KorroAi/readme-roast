import { describe, expect, it } from 'vitest';
import { parseBuild, releaseTag, versionCode, readVersion } from '../../tools/version.mjs';
import { BUILD, VERSION, VERSION_CODE } from '../../src/version';

describe('versionCode = (MAJOR × 10000 + MINOR × 100 + PATCH) × 100 + BUILD', () => {
  it('maps the documented examples', () => {
    expect(versionCode('1.0.0')).toBe(1000000);
    expect(versionCode('1.0.0', 0)).toBe(1000000);
    expect(versionCode('1.2.3', 7)).toBe(1020307);
    expect(versionCode('0.1.0')).toBe(10000); // above the old shell's versionCode 1
  });

  it('grows with every release and build, so Play always accepts the next upload', () => {
    const order: Array<[string, number]> = [['1.0.0', 0], ['1.0.0', 1], ['1.0.0', 99], ['1.0.1', 0], ['1.1.0', 0], ['1.99.99', 99], ['2.0.0', 0]];
    const codes = order.map(([v, b]) => versionCode(v, b));
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('refuses a prerelease, whose code would sit above its own release', () => {
    expect(() => versionCode('1.1.0-rc.1')).toThrow(/prerelease/);
    expect(() => versionCode('1.0.0-beta', 3)).toThrow(/prerelease/);
    expect(() => versionCode('1.0.0+7')).toThrow(/prerelease/);
  });

  it('refuses malformed versions and out-of-range builds', () => {
    expect(() => versionCode('1.0')).toThrow();
    expect(() => versionCode('1.100.0')).toThrow();
    expect(() => versionCode('1.0.100')).toThrow();
    expect(() => versionCode('0.0.0')).toThrow(/range/);
    expect(() => versionCode('1.0.0', 100)).toThrow();
    expect(() => versionCode('1.0.0', -1)).toThrow();
    expect(() => versionCode('1.0.0', 1.5)).toThrow();
    expect(() => versionCode('21000.0.0')).toThrow();
  });

  it('reads DD_BUILD strictly', () => {
    expect(parseBuild(undefined)).toBe(0);
    expect(parseBuild('')).toBe(0);
    expect(parseBuild('7')).toBe(7);
    expect(() => parseBuild('x')).toThrow();
    expect(() => parseBuild('100')).toThrow();
  });

  it('package.json is version 1.0.0 → 1000000, released by tag deep-down-v1.0.0', async () => {
    const v = await readVersion(undefined, {});
    expect(v).toEqual({ version: '1.0.0', build: 0, versionCode: 1000000 });
    expect((await readVersion(undefined, { DD_BUILD: '7' })).versionCode).toBe(1000007);
    expect(releaseTag(v.version)).toBe('deep-down-v1.0.0');
  });

  it('src/version.ts falls back to 0.0.0 / 0 outside a vite build', () => {
    expect(VERSION).toBe('0.0.0');
    expect(BUILD).toBe(0);
    expect(VERSION_CODE).toBe(0);
  });
});
