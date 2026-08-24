import { describe, expect, test } from "bun:test";
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";

import {
  CUSTOM_PAGE_HEADER_SOURCE,
  EVENT_PUBLIC_DETAIL_HEADER_SOURCE,
  NEXT_STATIC_HEADER_SOURCE,
  TAGGED_PUBLIC_FIRST_SEGMENTS,
} from "@/shared/lib/constants/cdn-cache-tags";

/**
 * `headers()` の source が、実際に**どの URL に当たるか**を path-to-regexp で確かめる。
 *
 * ## なぜ要るのか
 *
 * source は正規表現を含む文字列で、目で読んでも当たり外れが分からない。
 * 実際に 2 つ落ちた（監査 F-73 / F-18）:
 *
 * - **F-73**: `(?!registrations|waitlist|cancel)` はセグメント先頭位置でしか
 *   評価されないため、`cancellation-policy-seminar` のような**正当な slug が
 *   「cancel で始まる」だけで除外**され、Cache-Tag が 1 つも付かなくなっていた。
 *   イベント本文の編集は URL purge で救われるので、「本文は即反映されるのに
 *   共通部分だけ古い」という切り分けの難しい形で出る。
 * - **F-18**: `/access` と DB 由来のカスタムページに source が無く、
 *   メンテナンスモード等の site-wide 変更が最大 2 時間 edge に届かなかった。
 *
 * ## 何を見るか
 *
 * Next 同梱の path-to-regexp（`next/dist/compiled/path-to-regexp`）で source を
 * コンパイルし、**実 URL でマッチを取る**。文字列を目 grep する形にしない。
 *
 * ## 直し方
 *
 * 落ちたら source を直す。特に:
 *
 * - 除外は必ずセグメント境界に固定する（`(?:/|$)`）。前方一致にしない。
 * - custom pattern 内で **バックスラッシュは使えない**。path-to-regexp が剥がすので
 *   `(?![^/]*\.)` は `(?![^/]*.)` になり何にもマッチしなくなる。文字クラスで書く。
 */

type Case = { readonly path: string; readonly matches: boolean };

function assertCases(source: string, cases: readonly Case[]): void {
  const regexp = pathToRegexp(source);
  const actual = cases.map((c) => ({
    path: c.path,
    matches: regexp.test(c.path),
  }));
  expect(actual).toEqual(
    cases.map((c) => ({ path: c.path, matches: c.matches })),
  );
}

describe("CDN header source matching", () => {
  test("イベント詳細 source は private 第 1 セグメントだけを外す", () => {
    assertCases(EVENT_PUBLIC_DETAIL_HEADER_SOURCE, [
      // 通常の slug
      { path: "/events/summer-workshop", matches: true },
      // **F-73 の本体**: 除外語で始まるだけの正当な slug
      { path: "/events/cancellation-policy-seminar", matches: true },
      { path: "/events/waitlist-guide", matches: true },
      { path: "/events/registrations-open-day", matches: true },
      // filesystem 側の private ルート
      { path: "/events/cancel", matches: false },
      { path: "/events/waitlist", matches: false },
      { path: "/events/registrations", matches: false },
      { path: "/events/registrations/status", matches: false },
      { path: "/events/waitlist/confirm", matches: false },
      // 一覧ページは別 source が持つ
      { path: "/events", matches: false },
    ]);
  });

  test("カスタムページ source は列挙済みルートと静的資産を外す", () => {
    assertCases(CUSTOM_PAGE_HEADER_SOURCE, [
      // DB 由来のカスタムページ
      { path: "/company-profile", matches: true },
      // 除外語で始まるだけの slug（F-73 と同じ罠を持ち込まない）
      { path: "/accessibility-policy", matches: true },
      { path: "/apiary", matches: true },
      // 個別に Cache-Tag を emit しているルート
      { path: "/access", matches: false },
      { path: "/blog", matches: false },
      { path: "/blog/post", matches: false },
      { path: "/events", matches: false },
      // private prefix
      { path: "/mypage", matches: false },
      { path: "/admin", matches: false },
      { path: "/api/health", matches: false },
      // 静的資産 / Next 内部
      { path: "/sitemap.xml", matches: false },
      { path: "/robots.txt", matches: false },
      { path: "/_next/static/chunk.js", matches: false },
      // catch-all は単一セグメントのときだけページを返す
      { path: "/company/sub", matches: false },
      // home は専用 source
      { path: "/", matches: false },
    ]);
  });

  test("TAGGED_PUBLIC_FIRST_SEGMENTS pins remaining collection segments as literals", () => {
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("faq");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("terms");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("news");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("spaces");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("category");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("tag");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("about");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("access");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("blog");
    expect(TAGGED_PUBLIC_FIRST_SEGMENTS).toContain("events");
  });

  test("カスタムページ source は残りの tagged 公開ルートも外す", () => {
    assertCases(CUSTOM_PAGE_HEADER_SOURCE, [
      { path: "/faq", matches: false },
      { path: "/terms", matches: false },
      { path: "/news", matches: false },
      { path: "/spaces", matches: false },
      { path: "/category", matches: false },
      { path: "/tag", matches: false },
      { path: "/about", matches: false },
    ]);
  });

  /**
   * ビルド成果物の source は `/_next/static` の中だけに当たる。
   *
   * blanket `/:path*` は静的ファイルにも当たり、Next が付けるはずの
   * `immutable` を潰す（分岐が「まだ cache-control が無いとき」のため）。
   * blanket の後ろでこの source が上書きして戻す。
   *
   * 広げすぎると `/_next/image` の最適化画像まで 1 年 immutable になり、
   * URL が内容と 1 対 1 でないので古い画像が固定される。狭すぎると
   * chunk が毎回再検証に戻る。両側を固定する。
   */
  test("ビルド成果物 source は /_next/static だけに当たる", () => {
    assertCases(NEXT_STATIC_HEADER_SOURCE, [
      // content hash 付きのビルド成果物
      { path: "/_next/static/chunks/main-abc123.js", matches: true },
      { path: "/_next/static/css/app-abc123.css", matches: true },
      { path: "/_next/static/media/noto-sans-jp.woff2", matches: true },
      // 内容と URL が 1 対 1 でないもの。immutable にしてはいけない
      { path: "/_next/image", matches: false },
      { path: "/_next/data/build/index.json", matches: false },
      // 公開ページ
      { path: "/", matches: false },
      { path: "/spaces", matches: false },
      { path: "/_next", matches: false },
    ]);
  });
});
