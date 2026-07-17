import "server-only";

import { ReservationStatus } from "@generated/prisma/enums";
import type { CancelledByType } from "@/shared/lib/validations/enums/helpers";
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
  { success: true } | { success: false; error: string };

export interface ApplyCancellationOptions {
  deadlineHours: number;
  now: Date;
  cancellationReason: string | null;
  /**
   * キャンセル経路（DB の cancelledByType に書き込まれる）。
   * - `CUSTOMER_MYPAGE`: 会員のマイページ自己キャンセル
   * - `CUSTOMER_TOKEN`: ゲストのメールリンク経由キャンセル
   * - `ADMIN`: 管理画面からの管理者キャンセル
   */
  cancelledByType: CancelledByType;
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
      cancelledByType: options.cancelledByType,
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

/**
 * `applyBulkCancellation` 用の最小構造型 tx。
 *
 * 生成 Prisma の `Prisma.TransactionClient`（拡張前の基底型）は `$extends` 済み
 * app 標準 client（`src/shared/db/prisma.ts` の `prisma`）の tx コールバック型と
 * `exactOptionalPropertyTypes: true` 下で構造的に非互換（TS2345）なため使わない
 * （`series-advisory-lock.ts` の `SeriesLockClient` と同じ理由・同じ回避）。
 */
export interface ApplyBulkCancellationTx {
  readonly reservation: {
    updateMany(args: object): Promise<{ count: number }>;
    findMany(args: object): Promise<Array<{ id: string }>>;
  };
}

export type BulkCancelOptions = {
  cancellationReason?: string;
  cancelledByType: string;
  now: Date;
};

export type BulkCancelResult = {
  cancelledIds: string[];
};

/**
 * 複数 Reservation を一括キャンセル（series 全体 / this-and-following 用）。
 *
 * `applyCancellation`（単一 id）と同じ「updateMany の WHERE で claim」パターンを
 * 複数 id に拡張したもの。status ∈ CANCELLABLE_STATUSES を WHERE に含めて DB 側で
 * claim するため、二重 submit や他経路との競合時も対象 id ごとに一度しか副作用が
 * 発火しない。
 *
 * `updateMany` は何件更新したかの count のみを返し、どの id が実際に claim された
 * かは返さないため、直後の `findMany`（status=CANCELLED かつ cancelledAt=now で
 * 絞込）で claim できた id 集合を確定する。
 *
 * coupon usageCount の decrement はここでは行わない。series の couponId は
 * instance（Reservation）側ではなく ReservationSeries 側に持つため、series 全体
 * キャンセル時のクーポン戻しは呼び出し側（`cancelReservationSeriesCommand`）が
 * `series.couponId` を basis に別途処理する。
 *
 * 副作用（メール / GCal delete / Stripe refund / SwitchBot revoke / AuditLog）は
 * 本関数では発火しない。`applyBulkCancellationSideEffects`
 * （`cancellation-side-effects.ts`）が claim 成功分の cancelledIds を受けて発火する。
 *
 * @returns cancelledIds = 実際に status が変わった予約 id（claim 成功分のみ）
 */
export async function applyBulkCancellation(
  tx: ApplyBulkCancellationTx,
  ids: string[],
  options: BulkCancelOptions,
): Promise<BulkCancelResult> {
  if (ids.length === 0) return { cancelledIds: [] };

  const claimResult = await tx.reservation.updateMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      status: { in: [...CANCELLABLE_STATUSES] },
    },
    data: {
      status: ReservationStatus.CANCELLED,
      cancelledAt: options.now,
      cancelledByType: options.cancelledByType,
      icsSequence: { increment: 1 },
      ...(options.cancellationReason
        ? { cancellationReason: options.cancellationReason }
        : {}),
    },
  });

  if (claimResult.count === 0) return { cancelledIds: [] };

  const cancelled = await tx.reservation.findMany({
    where: {
      id: { in: ids },
      status: ReservationStatus.CANCELLED,
      cancelledAt: options.now,
    },
    select: { id: true },
  });

  return { cancelledIds: cancelled.map((r) => r.id) };
}
