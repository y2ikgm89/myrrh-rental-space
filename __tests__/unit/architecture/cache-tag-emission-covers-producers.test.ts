/**
 * 公開応答が読む producer のタグは、その応答の Cache-Tag に含まれる。
 *
 * 対象は 2 つ。**既定セクションを持つページ**と、
 * **公開の Route Handler**。どちらも「producer は tag を貼っているのに
 * emit 側に無い」という同じ形で壊れる。
 *
 * ## なぜ
 *
 * 同じ穴が 3 回開いた。
 *
 * - F-88: `/events` の producer は `cacheTag(EVENTS, LOCATIONS, SPACES)` なのに
 *   emit は EVENT だけ → 住所変更・スペース改名が最大 2 時間 edge に届かない
 * - A-61: `/` の space-showcase が `getShowcaseSpaces`
 *   （`cacheTag(SPACES, LOCATIONS, SPACE_CATEGORIES)`）を読むのに emit は
 *   site-wide ∪ HOME_MARKETING だけ → カテゴリ名の変更が届かない
 * - 同じ走査で `/blog` の post-list も見つかった（POST_CATEGORIES /
 *   POST_TAGS が emit に無い）
 * - A-63: `/manifest.webmanifest` `/llms.txt` は設定由来なのに Cache-Tag が
 *   1 つも無かった。catch-all の `CUSTOM_PAGE_HEADER_SOURCE` は `[^/.]+` で
 *   **拡張子つきを除外する**ため。同じ走査で `/opengraph-image`
 *   `/twitter-image` `/apple-icon` `/icon` `/feed.xml` も同型と分かった
 *
 * `public-cache-tag-header-pairing.test.ts` は「**どれか 1 つの** source が
 * その producer の全タグを含む」しか見ないので、`getShowcaseSpaces` は
 * `/spaces/:path*` と対応が取れて緑になっていた。あの gate 自身が docstring で
 * 「page → producer の到達は証明しない」と申告している。ここがその 1 段。
 *
 * ## 何を見るか
 *
 * 1. `section-renderer.tsx` を AST で読み、`case SectionType.X:` の中で
 *    呼ばれている識別子を集める
 * 2. `src/shared/domain/**` を AST で読み、`cacheTag(CACHE_TAGS.*)` を持つ
 *    関数名 → タグ集合を作る
 * 3. `DEFAULT_PAGE_SECTIONS` の各ページについて 1 と 2 を合成し、
 *    そのページの header source が emit する Cache-Tag に含まれるかを見る
 * 4. 公開の `route.ts(x)` についても同じことを見る（セクションを介さないので
 *    2 だけと合成する）
 *
 * `private, no-store` のページは CDN に載らないので対象外にする
 * （判定は同じ `next.config.ts` の Cache-Control から取る。除外リストではない）。
 *
 * ## 粗さの申告
 *
 * **既定構成しか見ない。** 管理者は任意のセクションを任意のページへ追加できる。
 * その分は `home-marketing-v1` と `purgeMarketingHomeTag()` が担当していて、
 * ここでは検査できない。呼出の解決も 1 段だけ（`case` 直下 / route 直下で
 * 呼ばれる名前）で、helper 経由の間接呼出は追わない。
 * 追えないものを追えるように書かない。
 *
 * header source のマッチ判定は完全一致と `/:path*` の prefix の 2 形だけ。
 * 正規表現を含む source（event detail / custom page）は評価しない —
 * その下に Route Handler が無いことを前提にしている。
 *
 * ## 直し方
 *
 * `next.config.ts` の該当 source の `joinWithSiteWide([...])` に不足タグを足す。
 * URL purge（`purgeCloudflareDetailUrls`）で代替しない — あれは呼び忘れが
 * 見えない側の入口になる。
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isCallExpression,
  isCaseClause,
  isIdentifier,
  isPropertyAccessExpression,
  type Node,
} from "typescript";

import nextConfig from "../../../next.config";
import { collectSourceFiles } from "../../helpers/architecture-fs";
import { CACHE_TAGS } from "@/shared/lib/constants/cache";
import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";
import {
  CDN_CACHE_TAGS,
  resolveCdnTag,
} from "@/shared/lib/constants/cdn-cache-tags";

const ROOT = process.cwd();
const RENDERER = join(
  ROOT,
  "src",
  "app",
  "(public)",
  "_shared",
  "components",
  "sections",
  "section-renderer.tsx",
);
const DOMAIN_ROOT = join(ROOT, "src", "shared", "domain");

/** 公開応答を返す Route Handler の置き場（`(public)` と root の icon 系）。 */
const ROUTE_HANDLER_ROOTS = [
  join(ROOT, "src", "app", "(public)"),
  join(ROOT, "src", "app", "icon"),
  join(ROOT, "src", "app", "icon-192"),
  join(ROOT, "src", "app", "icon-512"),
];

/** 既定ページ slug → 公開 URL。header source のマッチは `sourceMatches` が行う。 */
const SLUG_TO_URL: Record<string, string> = {
  home: "/",
  about: "/about",
  faq: "/faq",
  contact: "/contact",
  access: "/access",
  news: "/news",
  blog: "/blog",
  reservation: "/reservation",
  events: "/events",
  spaces: "/spaces",
  terms: "/terms",
};

/** `case SectionType.X:` の中で呼ばれる識別子。 */
export function sectionTypeCallees(source: string): Record<string, string[]> {
  const file = createSourceFile(
    "renderer.tsx",
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.TSX,
  );
  const out: Record<string, string[]> = {};

  const walk = (node: Node): void => {
    if (isCaseClause(node)) {
      const expr = node.expression;
      if (
        isPropertyAccessExpression(expr) &&
        isIdentifier(expr.expression) &&
        expr.expression.text === "SectionType"
      ) {
        const called: string[] = [];
        const inner = (child: Node): void => {
          if (isCallExpression(child) && isIdentifier(child.expression)) {
            called.push(child.expression.text);
          }
          forEachChild(child, inner);
        };
        node.statements.forEach(inner);
        out[expr.name.text] = [...new Set(called)];
      }
    }
    forEachChild(node, walk);
  };
  forEachChild(file, walk);
  return out;
}

/** ファイル全体で呼ばれている識別子（Route Handler 用。case で切らない）。 */
export function calledIdentifiers(source: string): string[] {
  const file = createSourceFile(
    "route.tsx",
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.TSX,
  );
  const called: string[] = [];
  const walk = (node: Node): void => {
    if (isCallExpression(node) && isIdentifier(node.expression)) {
      called.push(node.expression.text);
    }
    forEachChild(node, walk);
  };
  forEachChild(file, walk);
  return [...new Set(called)];
}

/** `cacheTag(CACHE_TAGS.*)` を含む関数の名前 → タグキー。 */
export function producerCacheTags(source: string): Record<string, string[]> {
  const file = createSourceFile(
    "producer.ts",
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  );
  const out: Record<string, string[]> = {};

  const walk = (node: Node): void => {
    const named: unknown = Reflect.get(node, "name");
    if (named !== undefined && isIdentifier(named as Node)) {
      const name = (named as { text: string }).text;
      const keys: string[] = [];
      const inner = (child: Node): void => {
        if (
          isCallExpression(child) &&
          isIdentifier(child.expression) &&
          child.expression.text === "cacheTag"
        ) {
          for (const arg of child.arguments) {
            if (
              isPropertyAccessExpression(arg) &&
              isIdentifier(arg.expression) &&
              arg.expression.text === "CACHE_TAGS"
            ) {
              keys.push(arg.name.text);
            }
          }
        }
        forEachChild(child, inner);
      };
      forEachChild(node, inner);
      if (keys.length > 0) {
        out[name] = [...new Set([...(out[name] ?? []), ...keys])];
      }
    }
    forEachChild(node, walk);
  };
  forEachChild(file, walk);
  return out;
}

function toCdnTags(keys: readonly string[]): string[] {
  const out = new Set<string>();
  for (const key of keys) {
    const value: unknown = Reflect.get(CACHE_TAGS, key);
    if (typeof value !== "string") continue;
    const cdn = resolveCdnTag(value);
    if (cdn === null || cdn === CDN_CACHE_TAGS.INTEGRATION_SETTINGS) continue;
    out.add(cdn);
  }
  return [...out];
}

type HeaderEntry = {
  readonly source: string;
  readonly cacheTags: readonly string[];
  readonly hasCacheControl: boolean;
  readonly noStore: boolean;
};

async function readHeaders(): Promise<HeaderEntry[]> {
  const entries = (await nextConfig.headers?.()) ?? [];
  return entries.map((entry) => {
    const find = (key: string): string =>
      entry.headers.find((header) => header.key === key)?.value ?? "";
    const cacheControl = find("Cache-Control");
    return {
      source: entry.source,
      cacheTags: find("Cache-Tag").split(",").filter(Boolean),
      hasCacheControl: cacheControl.length > 0,
      noStore: cacheControl.includes("no-store"),
    };
  });
}

/** Next の source と URL の対応。完全一致と `/:path*` の prefix だけを見る。 */
export function sourceMatches(source: string, url: string): boolean {
  if (source === url) return true;
  if (!source.endsWith("/:path*")) return false;
  const prefix = source.slice(0, -"/:path*".length);
  return url === prefix || url.startsWith(`${prefix}/`);
}

/**
 * その URL に最終的に載る Cache-Tag と no-store 判定。
 *
 * Next の `headers()` は同じキーを **last-match-wins で REPLACE** する。
 * union を取ると「後段の source が上書きして消したタグ」を見落とす。
 */
export function resolveHeadersFor(
  entries: readonly HeaderEntry[],
  url: string,
): { cacheTags: readonly string[]; noStore: boolean } {
  let cacheTags: readonly string[] = [];
  let noStore = false;
  for (const entry of entries) {
    if (!sourceMatches(entry.source, url)) continue;
    if (entry.cacheTags.length > 0) cacheTags = entry.cacheTags;
    if (entry.hasCacheControl) noStore = entry.noStore;
  }
  return { cacheTags, noStore };
}

/** `src/app/…/route.ts` → 公開 URL。 */
export function routeFileToUrl(relativePath: string): string {
  return `/${relativePath
    .replace(/^src\/app\//u, "")
    .replace(/^\(public\)\//u, "")
    .replace(/\/route\.tsx?$/u, "")}`;
}

describe("公開応答の Cache-Tag が producer のタグを含む（A-61 / A-63）", () => {
  const renderer = sectionTypeCallees(readFileSync(RENDERER, "utf8"));

  const producers: Record<string, string[]> = {};
  for (const path of collectSourceFiles(DOMAIN_ROOT)) {
    const text = readFileSync(path, "utf8");
    if (!text.includes("cacheTag")) continue;
    for (const [name, keys] of Object.entries(producerCacheTags(text))) {
      producers[name] = [...new Set([...(producers[name] ?? []), ...keys])];
    }
  }

  test("走査規模の下限", () => {
    expect(Object.keys(renderer).length).toBeGreaterThan(15);
    expect(Object.keys(producers).length).toBeGreaterThan(30);
    expect(Object.keys(DEFAULT_PAGE_SECTIONS).length).toBeGreaterThan(9);
  });

  test("SLUG_TO_URL が既定ページを取りこぼしていない", () => {
    expect(Object.keys(SLUG_TO_URL).toSorted()).toEqual(
      Object.keys(DEFAULT_PAGE_SECTIONS).toSorted(),
    );
  });

  test("各ページの emit が既定セクションの producer タグを含む", async () => {
    const headers = await readHeaders();

    const violations = Object.entries(DEFAULT_PAGE_SECTIONS).flatMap(
      ([slug, sections]) => {
        const url = SLUG_TO_URL[slug] ?? "";
        const resolved = resolveHeadersFor(headers, url);
        // CDN に載らないページは Cache-Tag を持たないのが正しい。
        if (resolved.noStore) return [];

        const emitted = new Set(resolved.cacheTags);
        const needed = new Map<string, string>();
        for (const section of sections) {
          const caseKey = section.type.replaceAll("-", "_").toUpperCase();
          for (const callee of renderer[caseKey] ?? []) {
            for (const tag of toCdnTags(producers[callee] ?? [])) {
              needed.set(tag, `${section.type} → ${callee}`);
            }
          }
        }

        return [...needed]
          .filter(([tag]) => !emitted.has(tag))
          .map(
            ([tag, via]) =>
              `${slug} (${url}): ${via} が ${tag} を要求するのに emit されていない`,
          );
      },
    );

    expect(violations).toEqual([]);
  });

  test("公開 Route Handler の emit が producer タグを含む", async () => {
    const headers = await readHeaders();
    const routeFiles = ROUTE_HANDLER_ROOTS.flatMap((root) =>
      collectSourceFiles(root).filter((path) => /route\.tsx?$/u.test(path)),
    );

    // 走査規模の下限。空なら以下は素通りする。
    expect(routeFiles.length).toBeGreaterThan(8);

    const violations = routeFiles.flatMap((path) => {
      const url = routeFileToUrl(relative(ROOT, path).replaceAll("\\", "/"));
      const resolved = resolveHeadersFor(headers, url);
      if (resolved.noStore) return [];

      const emitted = new Set(resolved.cacheTags);
      const needed = new Map<string, string>();
      for (const callee of calledIdentifiers(readFileSync(path, "utf8"))) {
        for (const tag of toCdnTags(producers[callee] ?? [])) {
          needed.set(tag, callee);
        }
      }

      return [...needed]
        .filter(([tag]) => !emitted.has(tag))
        .map(
          ([tag, via]) =>
            `${url}: ${via} が ${tag} を要求するのに emit されていない`,
        );
    });

    expect(violations).toEqual([]);
  });

  test("判定が差分を検出する（見本）", () => {
    const renderCase = `switch (section.type) {
      case SectionType.SPACE_SHOWCASE: {
        const rawSpaces = await getShowcaseSpaces(config.maxItems);
        return <SpaceShowcase spaces={rawSpaces} />;
      }
    }`;
    expect(sectionTypeCallees(renderCase)["SPACE_SHOWCASE"]).toContain(
      "getShowcaseSpaces",
    );

    const producer = `export async function getShowcaseSpaces(limit: number) {
      "use cache";
      cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
      cacheTag(CACHE_TAGS.SPACES, CACHE_TAGS.LOCATIONS, CACHE_TAGS.SPACE_CATEGORIES);
      return [];
    }`;
    expect(producerCacheTags(producer)["getShowcaseSpaces"]).toEqual([
      "SPACES",
      "LOCATIONS",
      "SPACE_CATEGORIES",
    ]);
    expect(toCdnTags(["SPACES", "LOCATIONS", "SPACE_CATEGORIES"])).toEqual([
      "space-v1",
      "location-v1",
      "space-category-v1",
    ]);

    // 落ちてはいけない形: cacheTag を持たない関数は producer ではない
    expect(
      producerCacheTags(`export function formatPrice(v: number) { return v; }`),
    ).toEqual({});

    expect(routeFileToUrl("src/app/(public)/llms.txt/route.ts")).toBe(
      "/llms.txt",
    );
    expect(routeFileToUrl("src/app/icon/route.tsx")).toBe("/icon");

    expect(sourceMatches("/blog/:path*", "/blog")).toBe(true);
    expect(sourceMatches("/blog/:path*", "/blog/x")).toBe(true);
    // 拡張子つきは catch-all に拾われない（A-63 の原因）。
    expect(sourceMatches("/blog/:path*", "/blogger")).toBe(false);

    // last-match-wins: 後段の source が Cache-Tag を REPLACE する。
    const resolved = resolveHeadersFor(
      [
        {
          source: "/:path*",
          cacheTags: ["a"],
          hasCacheControl: false,
          noStore: false,
        },
        {
          source: "/x",
          cacheTags: ["b"],
          hasCacheControl: false,
          noStore: false,
        },
      ],
      "/x",
    );
    expect(resolved.cacheTags).toEqual(["b"]);
  });
});
