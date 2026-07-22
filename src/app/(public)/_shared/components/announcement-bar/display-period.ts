/**
 * お知らせバーの表示期間判定（pure function、SSoT）
 *
 * `startAt` / `endAt` と現在時刻 `now` から表示可否を判定する。
 *
 * この判定は意図的に Client Component（announcement-bar.tsx）側で、render の
 * たびに実際の client 現在時刻を使って呼び出す。next.config.ts の public
 * blanket Cache-Control（`s-maxage=3600, stale-while-revalidate=3600`）により
 * Cloudflare CDN が最大 2 時間程度レスポンスをキャッシュしうるため、Server
 * Component 側（`await connection()` 後）で `new Date()` を評価して
 * pre-filter すると、そのサーバ評価時刻がキャッシュに焼き込まれてしまい、
 * 表示期間の境界を跨いだバーがキャッシュ有効期間中ずっと
 * 「新しく開始したのに出ない」「終了したのに出続ける」ままになる
 * （コードレビュー指摘、PR#1398 review comment 3630072526）。
 *
 * Client Component で毎 render 評価する現行方式なら、CDN キャッシュがどれだけ
 * 古くても、ページ表示時点のブラウザの実時刻で常に正しく再評価される
 * （SSR と hydration 直後の render で `now` が食い違い、境界を跨ぐ瞬間だけ
 * ごく稀に hydration mismatch が起こりうるが、これは他 7 ファイル
 * （CopyrightYear.tsx 等）と同種の許容済みリスクであり、CDN キャッシュ起因の
 * 長時間の表示誤りより実害が小さい）。
 */

import type { AnnouncementBarItem } from "./types";

export function isWithinDisplayPeriod(
  bar: Pick<AnnouncementBarItem, "startAt" | "endAt">,
  now: Date,
): boolean {
  const startAt = bar.startAt ? new Date(bar.startAt) : null;
  const endAt = bar.endAt ? new Date(bar.endAt) : null;
  if (!startAt && !endAt) return true;
  if (startAt && !endAt) return now >= startAt;
  if (!startAt && endAt) return now <= endAt;
  return startAt !== null && endAt !== null && now >= startAt && now <= endAt;
}
