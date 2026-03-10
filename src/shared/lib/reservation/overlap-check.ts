/**
 * 予約重複チェック
 *
 * 半開区間 [start, end) で重複を検出
 * 管理画面・公開ページ両方で使用
 */

import { checkReservationOverlapQuery } from "@/shared/domain/reservations/availability";
import type {
  OverlapCheckParams,
  OverlapCheckResult,
  PrismaTransactionClient,
} from "./types";

/**
 * 予約の重複をチェック
 *
 * 半開区間 [start, end) で重複を検出。
 * 2つの区間 [A, B) と [C, D) が重複する条件: A < D && C < B
 * 隣接スロット（例: 10:00-11:00 と 11:00-12:00）は重複として検出しない。
 *
 * @param params - チェック対象の予約情報
 * @param tx - トランザクションクライアント（Race Condition防止のため推奨）
 * @returns 重複の有無と、重複がある場合はその予約情報
 *
 * @example
 * ```typescript
 * // トランザクション外で使用（一次チェック用）
 * const result = await checkReservationOverlap({
 *   spaceId: 'space-123',
 *   startTime: new Date('2024-01-15T10:00:00'),
 *   endTime: new Date('2024-01-15T12:00:00'),
 * })
 *
 * // トランザクション内で使用（Race Condition防止）
 * await prisma.$transaction(async (tx) => {
 *   const result = await checkReservationOverlap(params, tx)
 *   if (result.hasOverlap) throw new Error('OVERLAP')
 *   // 予約作成...
 * })
 * ```
 */
export async function checkReservationOverlap(
  params: OverlapCheckParams,
  tx?: PrismaTransactionClient,
): Promise<OverlapCheckResult> {
  return checkReservationOverlapQuery(params, tx);
}
