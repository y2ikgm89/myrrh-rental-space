import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CACHE_LIFE } from "@/shared/lib/constants";

/**
 * 機能モジュールの kill switch が、実際に短時間で効くことを固定する。
 *
 * ## なぜ要るのか
 *
 * admin と public は**別の Cloud Run サービス**で、`invalidateSiteWideCache` の
 * `updateTag` は既定キャッシュハンドラ ＝ プロセス内メモリにしか効かない
 * （共有 cacheHandler は未配線）。admin コンテナの無効化は public コンテナに
 * 一切届かないので、**反映の上限を決めているのは `cacheLife` のプロファイルだけ**。
 *
 * 実際に `STATIC_SETTINGS`（days）だったため、二重課金で payment を OFF にしても
 * checkout が最大 24 時間作られ続ける状態だった（監査 F-65）。
 *
 * ## 何を見るか
 *
 * プロファイル名の写経ではなく、**Next が実際に使う秒数**を
 * `next/dist/server/config-shared` から読んで上限を assert する。
 * 名前だけを見ると、Next 側でプロファイルの定義が変わったときに素通りする。
 *
 * ## 直し方
 *
 * 落ちたら `CACHE_LIFE.FEATURE_FLAGS` を短いプロファイルへ戻す。
 * 長くしたいなら、先に「admin の保存が public に届く経路」（共有 cacheHandler か
 * admin→public の revalidate endpoint）を用意すること。
 */

/** kill switch として許容できる origin 側の反映上限。 */
const MAX_REVALIDATE_SECONDS = 60;

type CacheLifeProfile = {
  revalidate?: number | undefined;
  expire?: number | undefined;
  stale?: number | undefined;
};

function readNextCacheProfiles(): Record<string, CacheLifeProfile> {
  const source = readFileSync(
    join(
      process.cwd(),
      "node_modules",
      "next",
      "dist",
      "server",
      "config-shared.js",
    ),
    "utf8",
  );

  // `default: { stale: …, revalidate: …, expire: … }` 形式のプロファイル定義を拾う。
  const profiles: Record<string, CacheLifeProfile> = {};
  for (const match of source.matchAll(
    /(\w+):\s*\{\s*stale:\s*([^,]+),\s*revalidate:\s*([^,]+),\s*expire:\s*([^\s}]+)/gu,
  )) {
    const name = match[1];
    if (name === undefined) continue;
    const evaluate = (expression: string | undefined): number | undefined => {
      if (expression === undefined) return undefined;
      const parts = expression
        .trim()
        .split("*")
        .map((part) => Number(part.trim()));
      if (parts.some((part) => !Number.isFinite(part))) return undefined;
      return parts.reduce((product, part) => product * part, 1);
    };
    profiles[name] = {
      stale: evaluate(match[2]),
      revalidate: evaluate(match[3]),
      expire: evaluate(match[4]),
    };
  }
  return profiles;
}

describe("feature flag cache life", () => {
  const profiles = readNextCacheProfiles();

  test("Next のプロファイル定義を読めている（gate が空振りしていない）", () => {
    // 走査が空なら以降の assert は無条件に通ってしまう。
    expect(Object.keys(profiles).length).toBeGreaterThan(3);
    expect(profiles["days"]?.revalidate).toBe(60 * 60 * 24);
  });

  test("FEATURE_FLAGS の revalidate が kill switch として十分短い", () => {
    const profile = profiles[CACHE_LIFE.FEATURE_FLAGS];

    expect(profile).toBeDefined();
    expect(profile?.revalidate).toBeLessThanOrEqual(MAX_REVALIDATE_SECONDS);
  });

  test("機能モジュールの query が FEATURE_FLAGS を使っている", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src",
        "shared",
        "domain",
        "settings",
        "queries",
        "features.ts",
      ),
      "utf8",
    );

    expect(source).toContain("cacheLife(CACHE_LIFE.FEATURE_FLAGS)");
    // 元の値。戻すと 24 時間になる。
    expect(source).not.toContain("cacheLife(CACHE_LIFE.STATIC_SETTINGS)");
  });
});
