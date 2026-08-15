/**
 * 公開 surface の単一セグメント静的ルート名は、すべて `RESERVED_PATHS` に入る。
 *
 * ## なぜ
 *
 * 静的な `page.tsx` / `route.tsx` は catch-all `[...segments]` より優先される。
 * 管理者がそのディレクトリ名をページ slug にすると作成は成功するが、公開 URL は
 * 固定ハンドラ（OGP 画像など）を返し、本文は永久に表示されない。sitemap は
 * `isReservedPath` でしか除外しないので、同じ URL が HTML 以外の応答のまま載る。
 *
 * 監査 F-125: `apple-icon` / `opengraph-image` / `twitter-image` が予約漏れで、
 * 作成できたのに `/opengraph-image` は PNG を返していた。
 *
 * `__tests__/unit/domain/slugs/validation.test.ts` の転記テストは SSoT の
 * 中身を書き写しているだけなので、登録漏れを検出できない。
 *
 * ## 何を見るか
 *
 * `src/app/(public)/` と `src/app/` 直下の、URL 第 1 セグメントになる静的
 * ディレクトリ名。route group / private / parallel / dynamic は除外する。
 * それぞれが `isReservedPath` で予約済みであること。
 *
 * 見ないもの: ネストした第 2 セグメント以降、`robots.ts` のようなファイル
 * convention、RESERVED_PATHS 側の余剰（`home` / `privacy` / `_next` など）。
 *
 * ## 直し方
 *
 * 単一セグメントの静的ルートを足したら、`src/shared/domain/slugs/validation.ts`
 * の `RESERVED_PATHS` にも同じ名前を足す。
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/shared/domain/slugs/queries", () => ({
  findSlugConflict: () => Promise.resolve(null),
}));

import { isReservedPath } from "@/shared/domain/slugs/validation";

const PUBLIC_APP = join(process.cwd(), "src", "app", "(public)");
const APP_ROOT = join(process.cwd(), "src", "app");

const METADATA_IMAGE_ROUTES = [
  "apple-icon",
  "opengraph-image",
  "twitter-image",
] as const;

/** route group / private / parallel / dynamic は URL 第 1 セグメントにならない。 */
export function isStaticSingleSegmentDirName(name: string): boolean {
  return (
    !name.startsWith("_") &&
    !name.startsWith("(") &&
    !name.startsWith("@") &&
    !name.includes("[")
  );
}

export function listStaticSingleSegmentDirNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && isStaticSingleSegmentDirName(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
}

export function collectPublicStaticSingleSegmentRouteNames(
  publicAppDir: string,
  appRootDir: string,
): string[] {
  return [
    ...new Set([
      ...listStaticSingleSegmentDirNames(publicAppDir),
      ...listStaticSingleSegmentDirNames(appRootDir),
    ]),
  ].sort();
}

export function unreservedRouteNames(
  routeNames: readonly string[],
  isReserved: (slug: string) => boolean,
): string[] {
  return routeNames.filter((name) => !isReserved(name));
}

describe("reserved paths cover static single-segment routes", () => {
  test("判定の見本（落ちるべき形 / 落ちてはいけない形）", () => {
    expect(isStaticSingleSegmentDirName("opengraph-image")).toBe(true);
    expect(isStaticSingleSegmentDirName("about")).toBe(true);
    expect(isStaticSingleSegmentDirName("feed.xml")).toBe(true);
    expect(isStaticSingleSegmentDirName("[...segments]")).toBe(false);
    expect(isStaticSingleSegmentDirName("_shared")).toBe(false);
    expect(isStaticSingleSegmentDirName("(public)")).toBe(false);
    expect(isStaticSingleSegmentDirName("@modal")).toBe(false);

    const reserved = (slug: string) => slug === "about";
    expect(
      unreservedRouteNames(["about", "opengraph-image"], reserved),
    ).toEqual(["opengraph-image"]);
    expect(unreservedRouteNames(["about"], reserved)).toEqual([]);
  });

  test("apple-icon / opengraph-image / twitter-image は予約済み", () => {
    for (const slug of METADATA_IMAGE_ROUTES) {
      expect(isReservedPath(slug)).toBe(true);
    }
  });

  test("単一セグメント静的ルートはすべて RESERVED_PATHS に含まれる", () => {
    const names = collectPublicStaticSingleSegmentRouteNames(
      PUBLIC_APP,
      APP_ROOT,
    );

    // 走査が空だと「違反なし」と区別できない。下限はリテラル。
    expect(names.length).toBeGreaterThan(20);
    expect(names).toEqual(expect.arrayContaining([...METADATA_IMAGE_ROUTES]));

    expect(unreservedRouteNames(names, isReservedPath)).toEqual([]);
  });
});
