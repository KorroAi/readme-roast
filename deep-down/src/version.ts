// The one versioning source at runtime. vite.config.ts fills these defines from tools/version.mjs
// (package.json "version", the DD_BUILD build number and the versionCode rule); the Android shell
// and Gradle read the same tool, so the game always reports what the store sees.

declare const __DD_VERSION__: string | undefined;
declare const __DD_BUILD__: number | undefined;
declare const __DD_VERSION_CODE__: number | undefined;

/** versionName, e.g. "1.0.0" ("0.0.0" outside a vite build, e.g. in unit tests). */
export const VERSION: string = typeof __DD_VERSION__ === 'string' ? __DD_VERSION__ : '0.0.0';
/** The CI build number (DD_BUILD), 0 for local builds. */
export const BUILD: number = typeof __DD_BUILD__ === 'number' ? __DD_BUILD__ : 0;
/** The Android versionCode: (MAJOR × 10000 + MINOR × 100 + PATCH) × 100 + BUILD. */
export const VERSION_CODE: number = typeof __DD_VERSION_CODE__ === 'number' ? __DD_VERSION_CODE__ : 0;
