/**
 * F-105: custom / home / about / preview に置いた post-list / news-list
 * archive が `?q` / `?page` を無視し、ページ送りが `/blog`・`/news` へ
 * 飛ばないようにする。
 *
 * ## なぜ
 *
 * `[...segments]` / home / about / preview が `searchParams` を
 * `SectionStack` まで渡さないと、archive の parse が `{ page: 1, q: "" }`
 * に落ちて検索もページ送りも効かない。Pagination の `basePath` が
 * `"/blog"` / `"/news"` 決め打ちだと、埋め込み先の URL ではなく別ページへ
 * 遷移する。
 *
 * 実在した欠陥（監査 F-105）。`/blog`・`/news` 本体は当初から forward
 * 済みで壊れていない。archive を custom / content テンプレートで選んだ
 * ときだけ発現する。
 *
 * ## 何を見るか
 *
 * 固定パスを読む。走査しない（パスが消えれば `readFileSync` が throw する）。
 *
 * 1. 到達可能な 4 入口が `searchParams` を受けて子へ渡す
 * 2. `ManagedPageSections` がそれを `SectionStack` へ条件付きスプレッドする
 * 3. PostList / NewsList の archive Pagination が `"/blog"` / `"/news"`
 *    リテラルではない
 *
 * 判定関数を export し、落ちるべき形と落ちてはいけない形の fixture を置く。
 *
 * ## 直し方
 *
 * `searchParams` を入口 → `ManagedPageSections` → `SectionStack` へ通す。
 * Pagination の `basePath` は `catalogBasePathFromPageSlug(pageSlug)` 由来
 * にする。archive を custom テンプレートから禁じて「直した」ことにしない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const SEARCH_PARAMS_JSX_PROP = /searchParams=\{searchParams\}/u;
const SEARCH_PARAMS_CONDITIONAL_SPREAD =
  /\{\.\.\.\(searchParams !== undefined \? \{ searchParams \} : \{\}\)\}/u;
const LITERAL_ARCHIVE_BASE_PATH =
  /basePath\s*=\s*(?:\{\s*)?["']\/(?:blog|news)["']/u;

const ARCHIVE_PAGE_ENTRYPOINTS = [
  ["src", "app", "(public)", "[...segments]", "page.tsx"],
  ["src", "app", "(public)", "page.tsx"],
  ["src", "app", "(public)", "about", "page.tsx"],
  ["src", "app", "(public)", "preview", "pages", "[slug]", "page.tsx"],
] as const;

/** ページ本体が searchParams を受け、JSX で子へ渡しているか。 */
export function pageAcceptsAndForwardsSearchParams(source: string): boolean {
  const acceptsInSignature =
    /export default async function \w+\([\s\S]*?\bsearchParams\b[\s\S]*?\)/u.test(
      source,
    );
  return acceptsInSignature && SEARCH_PARAMS_JSX_PROP.test(source);
}

/** ManagedPageSections / SectionStack の exactOptional スプレッドか。 */
export function forwardsSearchParamsViaConditionalSpread(
  source: string,
): boolean {
  return SEARCH_PARAMS_CONDITIONAL_SPREAD.test(source);
}

/** archive Pagination が `/blog` / `/news` リテラルを basePath にしているか。 */
export function archivePaginationUsesLiteralBasePath(source: string): boolean {
  return LITERAL_ARCHIVE_BASE_PATH.test(source);
}

/**
 * 「今いる一覧に戻る」意味の href が `/blog` / `/news` 決め打ちか（監査 A-39）。
 *
 * F-105 の修正は Pagination だけで止まっており、同じ archive 分岐にある
 * 「フィルタを解除」「検索を解除」「All」の 3 リンクは決め打ちのままだった。
 * 上の判定は `basePath=` という**属性名の付いたリテラルしか見ていない**ので、
 * 同じページ内の他のリンクは検査対象外だった。
 *
 * カテゴリチップ自体（`/category/{slug}`）はグローバルなパスアーカイブなので対象外。
 * 見るのは `href="/blog"` / `href="/news"` の直書きだけ。
 */
const LITERAL_CATALOG_HREF = /href=\s*(?:\{\s*)?["']\/(?:blog|news)["']/u;

export function usesLiteralCatalogHref(source: string): boolean {
  return LITERAL_CATALOG_HREF.test(source);
}

describe("archive searchParams forward (F-105)", () => {
  test("fixture: searchParams を渡さないページは落ちるべき形", () => {
    expect(
      pageAcceptsAndForwardsSearchParams(`
        interface PageProps { params: Promise<{ slug: string }> }
        export default async function DynamicPage({ params }: PageProps) {
          return <ManagedPageSections sections={sections} pageSlug={slug} />;
        }
      `),
    ).toBe(false);
  });

  test("fixture: searchParams を受けて渡すページは落ちてはいけない形", () => {
    expect(
      pageAcceptsAndForwardsSearchParams(`
        interface PageProps { searchParams: Promise<SearchParams> }
        export default async function HomePage({ searchParams }: PageProps) {
          return <SectionStack sections={sections} searchParams={searchParams} />;
        }
      `),
    ).toBe(true);
  });

  test("fixture: basePath リテラルは落ちるべき形", () => {
    expect(
      archivePaginationUsesLiteralBasePath(
        `<Pagination currentPage={1} totalPages={2} basePath="/blog" />`,
      ),
    ).toBe(true);
    expect(
      archivePaginationUsesLiteralBasePath(
        `<Pagination currentPage={1} totalPages={2} basePath="/news" />`,
      ),
    ).toBe(true);
  });

  test("fixture: page-relative basePath は落ちてはいけない形", () => {
    expect(
      archivePaginationUsesLiteralBasePath(
        `<Pagination currentPage={1} totalPages={2} basePath={catalogBasePath} />`,
      ),
    ).toBe(false);
  });

  test("custom / home / about / preview は searchParams を子へ渡す", () => {
    expect(ARCHIVE_PAGE_ENTRYPOINTS.length).toBeGreaterThan(3);

    for (const segments of ARCHIVE_PAGE_ENTRYPOINTS) {
      const source = readRepoFile(...segments);
      expect(pageAcceptsAndForwardsSearchParams(source)).toBe(true);
    }
  });

  test("ManagedPageSections は searchParams を SectionStack へスプレッドする", () => {
    const source = readRepoFile(
      "src",
      "app",
      "(public)",
      "_shared",
      "components",
      "pages",
      "ManagedPageSections.tsx",
    );
    expect(forwardsSearchParamsViaConditionalSpread(source)).toBe(true);
  });

  test("PostList / NewsList の archive Pagination は /blog / /news 決め打ちではない", () => {
    const postList = readRepoFile(
      "src",
      "app",
      "(public)",
      "_components",
      "PostListSection.tsx",
    );
    const newsList = readRepoFile(
      "src",
      "app",
      "(public)",
      "_components",
      "NewsListSection.tsx",
    );

    expect(archivePaginationUsesLiteralBasePath(postList)).toBe(false);
    expect(archivePaginationUsesLiteralBasePath(newsList)).toBe(false);
    expect(postList).toMatch(/basePath=\{catalogBasePath\}/u);
    expect(newsList).toMatch(/basePath=\{catalogBasePath\}/u);
  });

  test("fixture: 戻り先 href のリテラルは落ちる形", () => {
    expect(
      usesLiteralCatalogHref(`<Button href="/blog">フィルタを解除</Button>`),
    ).toBe(true);
    expect(usesLiteralCatalogHref(`<Link href="/news">All</Link>`)).toBe(true);
  });

  test("fixture: page-relative な href とカテゴリパスは落ちてはいけない形", () => {
    expect(
      usesLiteralCatalogHref(`<Button href={toAppRoute(catalogBasePath)} />`),
    ).toBe(false);
    // カテゴリチップはグローバルなパスアーカイブなので対象外。
    expect(
      usesLiteralCatalogHref(
        `<Link href={toAppRoute(buildCategoryPath(slug))} />`,
      ),
    ).toBe(false);
  });

  test("archive の戻り先リンクも /blog / /news 決め打ちではない（A-39）", () => {
    const components = [
      ["src", "app", "(public)", "_components", "post-list", "post-grid.tsx"],
      [
        "src",
        "app",
        "(public)",
        "_components",
        "post-list",
        "post-category-filter.tsx",
      ],
      [
        "src",
        "app",
        "(public)",
        "_components",
        "news-list",
        "news-archive-list.tsx",
      ],
    ] as const;

    expect(components.length).toBeGreaterThan(2);
    const offenders = components
      .filter((segments) => usesLiteralCatalogHref(readRepoFile(...segments)))
      .map((segments) => segments.join("/"));

    expect(offenders).toEqual([]);
  });
});
