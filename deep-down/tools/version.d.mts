// Types for tools/version.mjs (a plain ES module shared with build-apk.sh and Gradle).
export declare function versionCode(version: string, build?: number): number;
export declare function parseBuild(raw: string | number | undefined | null): number;
export declare function releaseTag(version: string): string;
export declare function readVersion(
  root?: URL,
  env?: Record<string, string | undefined>,
): Promise<{ version: string; build: number; versionCode: number }>;
