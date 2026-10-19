// The one versioning rule, shared by vite.config.ts (the __DD_VERSION__/__DD_BUILD__/
// __DD_VERSION_CODE__ defines), android/build-apk.sh (aapt2 --version-code/--version-name) and
// android/app/build.gradle.kts (defaultConfig). The version itself lives in package.json; the
// build number comes from the DD_BUILD environment variable (0 when unset).
//
//   versionCode = (MAJOR × 10000 + MINOR × 100 + PATCH) × 100 + BUILD      1.0.0 → 1000000
//
// Prerelease versions ("1.1.0-rc.1") are refused: Play only accepts a larger versionCode for every
// upload, and a prerelease mapped by this rule would sit above its own release. Iterate a release
// candidate with the build number instead (1.1.0 build 1, 2, 3 …).
//
// CLI:  node tools/version.mjs            → {"version":"1.0.0","build":0,"versionCode":1000000}
//       node tools/version.mjs name|code|build
//       node tools/version.mjs check-tag deep-down-v1.0.0   (exit 1 unless the tag matches package.json)

/** versionCode for `version` (MAJOR.MINOR.PATCH) and `build` (0–99). Throws on anything else. */
export function versionCode(version, build = 0) {
  const m = /^(\d{1,4})\.(\d{1,2})\.(\d{1,2})$/.exec(String(version));
  if (!m) {
    const pre = /^\d+\.\d+\.\d+[-+]/.test(String(version));
    throw new Error(
      pre
        ? `version "${version}" is a prerelease: its versionCode would sit above its own release. Use MAJOR.MINOR.PATCH and the DD_BUILD number instead.`
        : `version "${version}" must be MAJOR.MINOR.PATCH (MINOR and PATCH 0-99)`,
    );
  }
  if (!Number.isInteger(build) || build < 0 || build > 99) throw new Error(`build ${build} must be an integer 0-99`);
  const code = (Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])) * 100 + build;
  if (code < 1 || code > 2100000000) throw new Error(`versionCode ${code} is outside Play's range 1-2100000000`);
  return code;
}

/** Parse DD_BUILD ("" or unset → 0). Throws on anything but an integer 0–99. */
export function parseBuild(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 0;
  const s = String(raw).trim();
  if (!/^\d{1,2}$/.test(s)) throw new Error(`DD_BUILD "${raw}" must be an integer 0-99`);
  return Number(s);
}

/** The tag that releases `version`: deep-down-v1.0.0. */
export function releaseTag(version) {
  return `deep-down-v${version}`;
}

/** { version, build, versionCode } from package.json and DD_BUILD. */
export async function readVersion(root = new URL('..', import.meta.url), env = process.env) {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const build = parseBuild(env.DD_BUILD);
  return { version: pkg.version, build, versionCode: versionCode(pkg.version, build) };
}

const isCli = typeof process !== 'undefined' && /version\.mjs$/.test(process.argv[1] ?? '');
if (isCli) {
  try {
    const v = await readVersion();
    const [cmd, arg] = process.argv.slice(2);
    if (!cmd) console.log(JSON.stringify(v));
    else if (cmd === 'name') console.log(v.version);
    else if (cmd === 'code') console.log(v.versionCode);
    else if (cmd === 'build') console.log(v.build);
    else if (cmd === 'check-tag') {
      if (arg !== releaseTag(v.version)) throw new Error(`tag "${arg}" does not match package.json version ${v.version} (expected ${releaseTag(v.version)})`);
      console.log(`tag ${arg} matches versionName ${v.version}, versionCode ${v.versionCode}`);
    } else throw new Error(`unknown command "${cmd}" (name | code | build | check-tag <tag>)`);
  } catch (e) {
    console.error(`tools/version.mjs: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
