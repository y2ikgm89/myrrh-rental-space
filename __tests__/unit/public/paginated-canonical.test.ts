/**
 * **ページ送りつきアーカイブの canonical は自己参照でなければならない。**
 *
 * ## なぜ
 *
 * 監査 A-90: `/blog` `/news` `/spaces` `/events` `/category/[slug]` `/tag/[slug]` は
 * `?page=N` を実際に生成するのに、canonical は現在ページを見ておらず
 * **2 ページ目以降も 1 ページ目を指していた**。Google はページ送りの 2 ページ目以降を
 * 1 ページ目へ canonical するのを誤用としており、アーカイブ経由のクロール導線が
 * 1 ページ目の件数で頭打ちになる。
 *
 * ## 何を見るか
 *
 * 1. `page` の読み取りが URL 段の parser（`parseAsPage`）と同じ解釈になること
 * 2. `page > 1` のときだけ `?page=N` が付くこと
 * 3. アーカイブの `generateMetadata` が `searchParams` を受け取り、
 *    canonical に page を渡していること
 *
 * 3 は静的検査。`generateMetadata` を実行するには DB と feature flag が要り、
 * canonical 1 本のためにそこまで積むと壊れやすいテストになる。
 * **配線されているか**までを見て、値の正しさは 1 / 2 の単体で担保する。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  canonicalUrlForPage,
  readCanonicalPage,
} from "@/public/lib/seo/paginated-canonical";

const ROOT = process.cwd();

/** `?page=N` を出すページ送りつきアーカイブ。 */
const PAGINATED_ARCHIVES = [
  "src/app/(public)/blog/page.tsx",
  "src/app/(public)/news/page.tsx",
  "src/app/(public)/events/page.tsx",
  "src/app/(public)/spaces/page.tsx",
  "src/app/(public)/category/[slug]/page.tsx",
  "src/app/(public)/tag/[slug]/page.tsx",
] as const;

function readSource(relative: string): string {
  return readFileSync(join(ROOT, ...relative.split("/")), "utf8");
}

describe("ページ送りの canonical（A-90）", () => {
  test("page > 1 のときだけ自己参照になる", () => {
    expect(canonicalUrlForPage("https://x.test/blog", 1)).toBe(
      "https://x.test/blog",
    );
    expect(canonicalUrlForPage("https://x.test/blog", 2)).toBe(
      "https://x.test/blog?page=2",
    );
    expect(canonicalUrlForPage("https://x.test/category/foo", 4)).toBe(
      "https://x.test/category/foo?page=4",
    );
  });

  test("page の読み取りが URL 段と同じ解釈になる", () => {
    expect(readCanonicalPage(undefined)).toBe(1);
    expect(readCanonicalPage("1")).toBe(1);
    expect(readCanonicalPage("3")).toBe(3);
    // 不正値は 1 ページ目として扱う（canonical が壊れた URL を指さない）。
    expect(readCanonicalPage("0")).toBe(1);
    expect(readCanonicalPage("-2")).toBe(1);
    expect(readCanonicalPage("abc")).toBe(1);
    // 同名パラメータが複数あるときは先頭を採る。
    expect(readCanonicalPage(["2", "5"])).toBe(2);
  });

  test("各アーカイブが searchParams から page を canonical へ渡している", () => {
    // 走査規模の下限。配列が空だと以下は素通りする。
    expect(PAGINATED_ARCHIVES.length).toBeGreaterThan(5);

    const problems = PAGINATED_ARCHIVES.flatMap((relative) => {
      const source = readSource(relative);
      // 行頭 `}` で切ると**多行シグネチャの `}: PageProps)` で止まる**。
      // 実測でこれを踏んだ（6 件全部が「渡していない」になった）。
      // 次の top-level 宣言までを関数本体として取る。
      const start = source.indexOf("export async function generateMetadata(");
      const nextDeclaration = source.indexOf("\nexport ", start + 1);
      const metadata =
        start < 0
          ? ""
          : source.slice(
              start,
              nextDeclaration < 0 ? source.length : nextDeclaration,
            );

      const found: string[] = [];
      if (!metadata.includes("searchParams")) {
        found.push(
          `${relative}: generateMetadata が searchParams を受け取っていない`,
        );
      }
      if (!metadata.includes("readCanonicalPage(")) {
        found.push(`${relative}: page を canonical に渡していない`);
      }
      return found;
    });

    expect(problems).toEqual([]);
  });

  test("判定が差分を検出する（見本）", () => {
    const wired = `export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  return generatePageMetadata("blog", readCanonicalPage((await searchParams)["page"]));
}`;
    expect(wired.includes("searchParams")).toBe(true);
    expect(wired.includes("readCanonicalPage(")).toBe(true);

    // 落ちるべき形: searchParams を見ない旧実装
    const unwired = `export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata("blog");
}`;
    expect(unwired.includes("searchParams")).toBe(false);
    expect(unwired.includes("readCanonicalPage(")).toBe(false);
  });
});
