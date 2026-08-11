/**
 * `experimental.cachedNavigations` が **解決後の** Next.js 設定で false であることを固定する。
 *
 * ## なぜ
 *
 * `cachedNavigations` が有効だと、`cacheComponents` 下で searchParams だけが変わる
 * ソフトナビ（管理タブの `?tab=` 切替等）のコンテンツが「一手前のタブのまま残る」
 * stale を起こす。上流の未修正バグ（vercel/next.js#86577、2026-08-11 時点で OPEN）で、
 * アプリ側では回避できない。nuqs 側（47ng/nuqs#1273）は 2.9.0 で修正済みなので、
 * 残っているのは Next 側だけ。経緯は `next.config.ts` の同項コメント。
 *
 * この gate は実際に main へ漏れた欠陥に対して置いている。16.3.0-preview.10 までは
 * 既定 false だったので `next.config.ts` には「あえて有効化しない」というコメントしか
 * 無かった。16.3.0 は `cacheComponents` が有効で `cachedNavigations` が未設定なら
 * 自動で true にするため、PR #2107 の bump 後は**コメントの主張と実際の挙動が
 * 食い違ったまま main に載っていた**。散文は既定の反転を止められない。
 *
 * ## 何を見るか
 *
 * 認可された `next.config.ts` の中身ではなく、Next.js 自身の `loadConfig` を通した
 * **解決後の値**を見る。自動有効化は upstream の正規化の中で起きるので、
 * ソースを grep する形では検出できない。
 *
 * 併せて `cacheComponents: true` も assert する。これは自動有効化の発火条件であり、
 * false になったらこの gate の前提自体が変わるため（前提が消えた状態で緑になるのを防ぐ）。
 *
 * 見本は一時ディレクトリの実 config を同じ loader に通して作る。
 * 「未設定 → true（落ちるべき形）」「明示 false → false（落ちてはいけない形）」の
 * 2 本で、上流の自動有効化が実在することと、この gate に判別力があることを示す。
 *
 * ## 直し方
 *
 * 落ちたら `next.config.ts` の `experimental.cachedNavigations: false` が消えている。
 * 消したくなった理由が「上流が直った」なら、消すのではなく `true` にして
 * 管理タブの `?tab=` 切替を実機で確認し、この gate の期待値を反転させる。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

type ResolvedNextConfig = {
  cacheComponents?: boolean;
  experimental: { cachedNavigations?: boolean };
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
  const dir = mkdtempSync(join(tmpdir(), "next-cached-navigations-"));
  createdDirs.push(dir);
  writeFileSync(join(dir, "next.config.js"), `module.exports = { ${body} }`);
  return dir;
}

afterAll(() => {
  for (const dir of createdDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("next.config: cachedNavigations stays off", () => {
  test("this repository resolves cachedNavigations to false", async () => {
    const loadConfig = await getLoadConfig();
    const config = await loadConfig("phase-production-build", process.cwd());

    // 自動有効化の発火条件。false になったらこの gate の前提が変わる。
    expect(config.cacheComponents).toBe(true);
    expect(config.experimental.cachedNavigations).toBe(false);
  });

  test("fixture: omitting the flag under cacheComponents resolves to true", async () => {
    const loadConfig = await getLoadConfig();
    const dir = writeFixtureConfig("cacheComponents: true");

    const config = await loadConfig("phase-production-build", dir);

    // 落ちるべき形。これが false になったら上流が自動有効化をやめた合図で、
    // そのときは next.config.ts の明示 false ごと再評価してよい。
    expect(config.experimental.cachedNavigations).toBe(true);
  });

  test("fixture: an explicit false survives the loader", async () => {
    const loadConfig = await getLoadConfig();
    const dir = writeFixtureConfig(
      "cacheComponents: true, experimental: { cachedNavigations: false }",
    );

    const config = await loadConfig("phase-production-build", dir);

    // 落ちてはいけない形。明示値が upstream の既定に上書きされないことの確認。
    expect(config.experimental.cachedNavigations).toBe(false);
  });
});
