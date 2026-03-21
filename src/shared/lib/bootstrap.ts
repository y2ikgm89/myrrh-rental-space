/**
 * システムページブートストラップ
 *
 * サーバー起動時（instrumentation.ts）に全システムページ + デフォルトセクションを自動保証。
 * seed 未実行でも公開ページが正しく表示されるようにする。
 *
 * - 冪等: 既存データがあれば何もしない
 * - per-page try/catch: 1ページの失敗で他を止めない
 * - 絶対に throw しない（サーバー起動をブロックしない）
 */

import { prisma } from "@/shared/db/prisma";
import { bootstrapSystemPagesCommand } from "@/shared/domain/pages/system-pages-commands";

/**
 * 全システムページ + デフォルトセクションを保証
 *
 * instrumentation.ts から呼び出される（seed は system-pages-commands に Prisma を直接渡す）。
 * 認証不要（インフラ操作）。
 */
export async function bootstrapSystemPages(): Promise<void> {
  await bootstrapSystemPagesCommand(prisma);
}
