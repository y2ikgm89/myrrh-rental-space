import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * 標準税率を**キャッシュを通さず**読む。証跡に刻む値の取得口。
 *
 * ## なぜ `getPublicTaxSettings()` を使わないか
 *
 * あれは `"use cache"` の読み取りなので、証跡に焼く値をそこから取ると
 * 「古い設定値が永久に残った紙」ができる。決済確定時のスナップショットと
 * 領収書の発行はこちらを使う。
 *
 * ## なぜ別ファイルなのか
 *
 * 同居させると `next/cache` / `safeFetch` / enum gateway が決済経路の
 * module graph に入り、それらを部分 mock している unit テストが
 * `Export named '...' not found` で落ちる（実際に 2 本落とした）。
 * **証跡の書込経路が引き込む依存を最小にする**ために分けてある。
 *
 * ## 設定行が無いとき
 *
 * `null` を返す。**既定値へ落とさない** — 呼び出し側が「刻まない（null のまま）」か
 * 「発行を断る」かを選ぶ。推測値を証跡に書かないため。
 */
export async function readStandardTaxRateUncached(): Promise<number | null> {
  const commerce = await prisma.settingsCommerce.findFirst({
    select: { taxStandardRate: true },
  });
  return commerce?.taxStandardRate ?? null;
}
