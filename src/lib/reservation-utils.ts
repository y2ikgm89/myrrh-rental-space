/**
 * 予約バリデーションユーティリティ
 *
 * 予約の重複チェックなど、複数箇所で使用されるロジックを共通化
 */

import { prisma } from './prisma'
import { ReservationStatus } from '@/generated/prisma/client/enums'

// =============================================================================
// Types
// =============================================================================

export interface OverlapCheckParams {
  spaceId: string
  startTime: Date
  endTime: Date
  excludeReservationId?: string // 更新時は自分自身を除外
}

export interface OverlapCheckResult {
  hasOverlap: boolean
  conflictingReservation?: {
    id: string
    startTime: Date
    endTime: Date
    status: ReservationStatus
  }
}

// =============================================================================
// Overlap Detection
// =============================================================================

/**
 * 予約の重複をチェック
 *
 * 半開区間 [start, end) で重複を検出。
 * 2つの区間 [A, B) と [C, D) が重複する条件: A < D && C < B
 * 隣接スロット（例: 10:00-11:00 と 11:00-12:00）は重複として検出しない。
 *
 * @param params - チェック対象の予約情報
 * @returns 重複の有無と、重複がある場合はその予約情報
 */
export async function checkReservationOverlap(
  params: OverlapCheckParams
): Promise<OverlapCheckResult> {
  const { spaceId, startTime, endTime, excludeReservationId } = params

  const overlappingReservation = await prisma.reservation.findFirst({
    where: {
      spaceId,
      status: { in: ['PENDING', 'CONFIRMED'] as ReservationStatus[] },
      ...(excludeReservationId && { id: { not: excludeReservationId } }),
      // 重複判定: 2つの時間範囲 [A, B) と [C, D) が重複する条件は A < D && C < B
      // これは隣接スロット（例: 10:00-11:00 と 11:00-12:00）を重複として検出しない
      AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  })

  if (overlappingReservation) {
    return {
      hasOverlap: true,
      conflictingReservation: overlappingReservation,
    }
  }

  return { hasOverlap: false }
}
