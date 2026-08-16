/**
 * `experimental.instantInsights.validationLevel` が **解決後の** Next.js 設定で
 * `'manual-warning'` であることを固定する。
 *
 * ## なぜ
 *
 * Next.js 16.3 Instant Navigations の既定 (`validationLevel: 'warning'`) は
 * Page / Default セグメント全てを暗黙に検証する。このアプリは nonce CSP
 * (`strict-dynamic`) のため root layout の `generateViewport()` で
 * `await connection()` して全 route を意図的に完全動的化しており、instant
 * navigation は構造的に成立しない。暗黙検証は root の動的 viewport を E1438
 * (`blocking-prerender-viewport-dynamic`) として診断し続けるだけになる。
 *
 * root layout の `export const instant = false` はセグメント自身と static-shell
 * 検証しか免除しない（公式: route-segment-config/instant）。ページ単位の暗黙
 * 検証は止められない。公式の根本解決は `validationLevel: 'manual-warning'`
 * （明示的に `instant` を export したセグメントだけ検証する）。
 *
 * ## 何を見るか
 *
 * `next.config.ts` のソースではなく、Next.js 自身の `loadConfig` を通した
 * **解決後の値**を見る。未設定時の既定 `'warning'` は `finalizeConfig` が
 * 埋めるので、ソース grep では検出できない。
 *
 * 併せて `cacheComponents: true` も assert する。Instant Navigations 検証は
 * Cache Components 前提であり、false になったらこの gate の前提自体が変わる。
 *
 * 見本は一時ディレクトリの実 config を同じ loader に通して作る。
 * 「未設定 → `'warning'`（落ちるべき形）」「明示 `'manual-warning'` が
 * 素通りする（落ちてはいけない形）」の 2 本で、上流既定が実在することと
 * この gate に判別力があることを示す。
 *
 * ## 直し方
 *
 * 落ちたら `next.config.ts` の `experimental.instantInsights.validationLevel:
 * 'manual-warning'` が消えている。消したくなった理由が「全 route を静的シェル
 * 化して instant navigation を採用する」なら、値を `'warning'` に戻してこの
 * gate の期待値を反転させる。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

type ResolvedNextConfig = {
  cacheComponents?: boolean;
  experimental: {
    instantInsights?: { validationLevel?: string };
  };
};

type LoadConfig = (phase: string, dir: string) => Promise<ResolvedNextConfig>;

async function getLoadConfig(): Promise<LoadConfig> {
  const mod: unknown = await import("next/dist/server/config.js");
  if (typeof mod !== "object" || mod === null || !("default" in mod)) {
    throw new Error("next/dist/server/config.js has no default export");
  }
  const { default: exported } = mod;
  // CJS interop: bun may hand back either the function or a { default } wrapper.
  const candidate =
    typeof exported === "function"
      ? exported
      : typeof exported === "object" &&
          exported !== null &&
          "default" in exported
        ? exported.default
        : undefined;
  if (typeof candidate !== "function") {
    throw new Error("Could not resolve next loadConfig");
  }
  return candidate as LoadConfig;
}

const createdDirs: string[] = [];

function writeFixtureConfig(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "next-instant-insights-"));
  createdDirs.push(dir);
  writeFileSync(join(dir, "next.config.js"), `module.exports = { ${body} }`);
  return dir;
}

afterAll(() => {
  for (const dir of createdDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("next.config: instantInsights stays manual-warning", () => {
  test("this repository resolves validationLevel to manual-warning", async () => {
    const loadConfig = await getLoadConfig();
    const config = await loadConfig("phase-production-build", process.cwd());

    expect(config.cacheComponents).toBe(true);
    expect(config.experimental.instantInsights?.validationLevel).toBe(
      "manual-warning",
    );
  });

  test("fixture: omitting the flag under cacheComponents resolves to warning", async () => {
    const loadConfig = await getLoadConfig();
    const dir = writeFixtureConfig("cacheComponents: true");

    const config = await loadConfig("phase-production-build", dir);

    // 落ちるべき形。これが 'manual-warning' になったら上流既定が変わった合図。
    expect(config.experimental.instantInsights?.validationLevel).toBe(
      "warning",
    );
  });

  test("fixture: an explicit manual-warning survives the loader", async () => {
    const loadConfig = await getLoadConfig();
    const dir = writeFixtureConfig(
      "cacheComponents: true, experimental: { instantInsights: { validationLevel: 'manual-warning' } }",
    );

    const config = await loadConfig("phase-production-build", dir);

    expect(config.experimental.instantInsights?.validationLevel).toBe(
      "manual-warning",
    );
  });
});
