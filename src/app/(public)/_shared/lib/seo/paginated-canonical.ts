/**
 * ページ送りつきアーカイブの canonical を自己参照にする。
 *
 * ## なぜ（監査 A-90）
 *
 * `/blog` `/news` `/spaces` `/events` `/category/[slug]` `/tag/[slug]` は
 * `?page=N` を実際に生成する（`_shared/components/pagination.tsx`）。ところが
 * canonical は現在ページを見ておらず、**2 ページ目以降も 1 ページ目を指していた**。
 *
 * Google のページネーション公式ガイダンスは「ページ送りの 2 ページ目以降を
 * 1 ページ目に canonical するのは誤用」としている。実際 40 本の記事があるカテゴリでは
 * `?page=2..4` が 1 ページ目の重複として扱われ、アーカイブ経由のクロール導線が
 * 最新 12 件で頭打ちになる。
 *
 * ## `page` だけを足す
 *
 * フィルタ用クエリ（`category` / `q` 等）を canonical から落とす現在の挙動は正しい。
 * 同じ集合を違う切り口で見せる URL は 1 つに寄せるべきだから。**`page` だけが例外**で、
 * これは別の集合を指すので自己参照でなければならない。
 */

import { parseAsPage } from "@/shared/lib/nuqs/parsers";

/**
 * `searchParams` の `page` を canonical に使える形へ読む。
 *
 * 解釈は URL 段の parser（`parseAsPage`）に合わせる。別に書くと
 * 「表示は 3 ページ目なのに canonical は 1 ページ目」のようなずれが生まれる。
 */
export function readCanonicalPage(
  value: string | readonly string[] | undefined,
): number {
  const raw = typeof value === "string" ? value : value?.[0];
  if (raw === undefined) return 1;
  const parsed = parseAsPage.parse(raw);
  return parsed === null || parsed < 1 ? 1 : parsed;
}

/** `page > 1` のときだけ `?page=N` を足した自己参照 canonical を返す。 */
export function canonicalUrlForPage(
  baseCanonicalUrl: string,
  page: number,
): string {
  return page > 1
    ? `${baseCanonicalUrl}?page=${String(page)}`
    : baseCanonicalUrl;
}
