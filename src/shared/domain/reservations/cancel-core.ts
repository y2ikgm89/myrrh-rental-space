import "server-only";

import { ReservationStatus } from "@generated/prisma/enums";
import {
  CANCELLED_BY,
  type CancelledByType,
} from "@/shared/lib/validations/enums/helpers";
import { isWithinDeadline } from "./deadline";

/**
 * 予約キャンセルの共通コア
 *
 * 会員（マイページ）とゲスト（メールリンク）の両キャンセル経路が共有する。
 * 本人性の確認（会員=customerId / ゲスト=トークン）は呼び出し側が行い、本関数は
 * 「キャンセル可否の判定 → CANCELLED 化（atomic claim）→ クーポン使用回数の戻し」
 * を担う。
 *
 * **Atomic claim**: `updateMany` の WHERE 条件に現在の `status: { in: CANCELLABLE_STATUSES }`
 * を含めて DB 側で claim する（`claimReservationAsPaid` と同パターン）。
 * 二重 submit や admin/guest 同時操作で両 tx が PENDING を読んでも、UPDATE は
 * 必ずどちらか一方しか count=1 にならない（PostgreSQL の単一 UPDATE は atomic）。
 * これにより通知二重発火・クーポン usageCount 二重 decrement を構造的に防ぐ。
 */

export interface ApplyCancellationTx {
  readonly reservation: {
    updateMany(args: object): Promise<{ count: number }>;
  };
  readonly coupon: {
    updateMany(args: object): Promise<{ count: number }>;
  };
}

/** キャンセル・変更を受け付ける予約ステータス */
export const CANCELLABLE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

export interface CancellableReservation {
  id: string;
  status: ReservationStatus;
  startTime: Date;
  couponId: string | null;
}

export type CancellationResult =
  | { success: true }
  | { success: false; error: string };

export interface ApplyCancellationOptions {
  deadlineHours: number;
  now: Date;
  cancellationReason: string | null;
  /**
   * キャンセル経路（DB の cancelledByType に書き込まれる）。
   * - `CUSTOMER_MYPAGE`: 会員のマイページ自己キャンセル
   * - `CUSTOMER_TOKEN`: ゲストのメールリンク経由キャンセル
   * - `ADMIN`: 管理画面からの管理者キャンセル
   *
   * 後方互換のため未指定時は `CUSTOMER_MYPAGE` を default にする。
   */
  cancelledByType?: CancelledByType;
}

export async function applyCancellation(
  tx: ApplyCancellationTx,
  reservation: CancellableReservation,
  options: ApplyCancellationOptions,
): Promise<CancellationResult> {
  if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
    return { success: false, error: "この予約はキャンセルできません" };
  }

  if (
    !isWithinDeadline(reservation.startTime, options.deadlineHours, options.now)
  ) {
    return {
      success: false,
      error: `キャンセル期限（${String(options.deadlineHours)}時間前）を過ぎています`,
    };
  }

  const cancelledBy = options.cancelledByType ?? CANCELLED_BY.CUSTOMER_MYPAGE;

  // Atomic claim: WHERE に status: { in: CANCELLABLE_STATUSES } を含めて
  // 二重 submit / 同時操作のレースを DB レベルで防ぐ。
  const updateResult = await tx.reservation.updateMany({
    where: {
      id: reservation.id,
      deletedAt: null,
      status: { in: [...CANCELLABLE_STATUSES] },
    },
    data: {
      status: ReservationStatus.CANCELLED,
      cancelledAt: options.now,
      cancelledByType: cancelledBy,
      icsSequence: { increment: 1 },
      ...(options.cancellationReason
        ? { cancellationReason: options.cancellationReason }
        : {}),
    },
  });

  if (updateResult.count === 0) {
    // 別の操作（admin / 別タブ）が先にキャンセル/ステータス変更を完了している。
    return {
      success: false,
      error:
        "別の操作で予約のステータスが変更されました。最新の状態をご確認ください",
    };
  }

  if (reservation.couponId) {
    await tx.coupon.updateMany({
      where: { id: reservation.couponId, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  }

  return { success: true };
}
