"use client";

import { useEffect, useState } from "react";

/**
 * 値の更新を `delayMs` 遅らせて返す。
 *
 * ## なぜ要るのか
 *
 * conform の `fields.<name>.value` は `input` イベントごとに更新される。その値を
 * effect の依存に置くと、**1 打鍵ごとに Server Action が飛ぶ**。
 *
 * 実測（監査 F-39）: 予約フォームでクーポンコード「WELCOME2026」と入力するだけで
 * `fetchReservationPricingPreview` が 11 回発火していた。この action は
 * `publicQueryRateLimiter`（60 秒 / 30 リクエスト、IP 単位）を消費し、同じバケットを
 * `fetchAvailableSlots` / `fetchSpaceBlockedDates` と、`/claim/reservation` 等の
 * ページ描画まで共有している。上限を超えると:
 *
 * - 料金プレビューが null になり、`BookingSummary` は**価格ブロックごと消える**。
 *   利用者は金額が一切表示されないまま「予約を確定する」を押すことになる
 * - 日付を選び直すと時間枠取得も rate limit で失敗し、再試行ボタンも同じ分の間
 *   ずっと失敗する
 *
 * 共有 IP（社内 NAT・キャリア CGNAT）では複数利用者で上限を分け合うため、
 * さらに早く到達する。
 *
 * ## 使い方
 *
 * 落としたい値だけを通す。スペース・日時のような「選択して確定する」入力は
 * 即時のままでよい（打鍵ごとには変わらない）。
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
