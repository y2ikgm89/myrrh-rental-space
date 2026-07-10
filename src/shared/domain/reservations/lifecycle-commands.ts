import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import {
  CANCELLED_BY,
  TERMINAL_RESERVATION_STATUSES,
} from "@/shared/lib/validations/enums/helpers";
import { checkReservationOverlap } from "@/shared/lib/reservation";
import { validateStatusTransition } from "./status";
import { CUSTOMER_SELECT, buildPayload } from "./payloads";
import { lockReservationSpaceForTransaction } from "./locks";

const TERMINAL_STATUS_SET = new Set<ReservationStatus>(
  TERMINAL_RESERVATION_STATUSES,
);

// ---------------------------------------------------------------------------
// Admin: Status update
// ---------------------------------------------------------------------------

export async function updateReservationStatusCommand(
  id: string,
  status: ReservationStatus,
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    include: {
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
      customer: { select: CUSTOMER_SELECT },
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  validateStatusTransition(reservation.status, status);

  const previousStatus = reservation.status;

  const isCancellation =
    status === ReservationStatus.CANCELLED &&
    previousStatus !== ReservationStatus.CANCELLED;

  const updated = await prisma.reservation.update({
    where: { id, deletedAt: null },
    data: {
      status,
      icsSequence: { increment: 1 },
      ...(isCancellation
        ? { cancelledAt: new Date(), cancelledByType: CANCELLED_BY.ADMIN }
        : {}),
    },
    select: { icsSequence: true },
  });

  return {
    previousStatus,
    spaceId: reservation.spaceId,
    googleCalendarEventId: reservation.googleCalendarEventId,
    customerId: reservation.customerId,
    couponId: reservation.couponId,
    payload: buildPayload({
      reservationId: id,
      customer: reservation.customer,
      space: reservation.space,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      totalPrice: reservation.totalPrice,
      notes: reservation.notes,
      icsSequence: updated.icsSequence,
    }),
  };
}

// ---------------------------------------------------------------------------
// Admin: Restore terminal status (SUPER_ADMIN only — auth enforced at action layer)
// ---------------------------------------------------------------------------

/**
 * 終端ステータス（COMPLETED / CANCELLED / NO_SHOW）から非終端ステータス
 * （PENDING / CONFIRMED）への復元。誤操作からの巻き戻し用途。
 *
 * - 復元元は終端ステータスのみ（非終端からの呼び出しは VALIDATION エラー）
 * - 復元先は非終端ステータスのみ
 * - CONFIRMED への復元は時間帯コンフリクトを検証（重複ありなら VALIDATION エラー）
 * - CANCELLED から復元する場合、cancellation 関連フィールドを null に戻す
 * - icsSequence をインクリメントして既存カレンダー予定を上書き
 */
export async function restoreReservationStatusCommand(
  id: string,
  targetStatus: ReservationStatus,
) {
  if (TERMINAL_STATUS_SET.has(targetStatus)) {
    throw new DomainError(
      "復元先には非終端ステータス（確認待ち / 確認済み）を指定してください",
      "VALIDATION",
    );
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    include: {
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
      customer: { select: CUSTOMER_SELECT },
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  if (!TERMINAL_STATUS_SET.has(reservation.status)) {
    throw new DomainError(
      "終端ステータス（完了 / キャンセル / 無断キャンセル）の予約のみ復元できます",
      "VALIDATION",
    );
  }

  const previousStatus = reservation.status;
  const wasCancelled = previousStatus === ReservationStatus.CANCELLED;

  const updated = await prisma.$transaction(async (tx) => {
    if (targetStatus === ReservationStatus.CONFIRMED) {
      await lockReservationSpaceForTransaction(tx, reservation.spaceId);

      const overlap = await checkReservationOverlap(
        {
          spaceId: reservation.spaceId,
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          excludeReservationId: id,
        },
        tx,
      );
      if (overlap.hasOverlap) {
        throw new DomainError(
          "同一スペース・同一時間帯に有効な予約が存在するため復元できません",
          "VALIDATION",
        );
      }
    }

    return tx.reservation.update({
      where: { id, deletedAt: null },
      data: {
        status: targetStatus,
        icsSequence: { increment: 1 },
        ...(wasCancelled
          ? {
              cancelledAt: null,
              cancelledByType: null,
              cancellationReason: null,
            }
          : {}),
      },
      select: { icsSequence: true },
    });
  });

  return {
    previousStatus,
    targetStatus,
    spaceId: reservation.spaceId,
    googleCalendarEventId: reservation.googleCalendarEventId,
    customerId: reservation.customerId,
    couponId: reservation.couponId,
    payload: buildPayload({
      reservationId: id,
      customer: reservation.customer,
      space: reservation.space,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      totalPrice: reservation.totalPrice,
      notes: reservation.notes,
      icsSequence: updated.icsSequence,
    }),
  };
}

// ---------------------------------------------------------------------------
// Admin: Notes update
// ---------------------------------------------------------------------------

export async function updateReservationNotesCommand(
  id: string,
  notes: string | null,
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  await prisma.reservation.update({
    where: { id, deletedAt: null },
    data: { notes },
  });
}

// ---------------------------------------------------------------------------
// Admin: Delete
// ---------------------------------------------------------------------------

export async function deleteReservationCommand(
  id: string,
  userId: string | undefined,
  cancellationReason?: string | null,
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      googleCalendarEventId: true,
      couponId: true,
      customerId: true,
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  const now = new Date();
  const needsCancellationTracking =
    reservation.status !== ReservationStatus.CANCELLED &&
    reservation.status !== ReservationStatus.COMPLETED &&
    reservation.status !== ReservationStatus.NO_SHOW;
  const resolvedCancellationReason = needsCancellationTracking
    ? (cancellationReason ?? "管理者による削除")
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id, deletedAt: null },
      data: {
        deletedAt: now,
        deletedById: userId ?? null,
        icsSequence: { increment: 1 },
        ...(needsCancellationTracking
          ? {
              status: ReservationStatus.CANCELLED,
              cancelledAt: now,
              cancelledByType: CANCELLED_BY.ADMIN,
              cancellationReason: resolvedCancellationReason,
            }
          : {}),
      },
    });

    if (reservation.couponId) {
      await tx.coupon.updateMany({
        where: { id: reservation.couponId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }
  });

  return {
    googleCalendarEventId: reservation.googleCalendarEventId,
    customerId: reservation.customerId,
    couponId: reservation.couponId,
    // PENDING/CONFIRMED の予約を削除した場合、実質的には管理者キャンセルと同じ結果
    // （空き解放・顧客への影響）になる。呼び出し側はこのフラグを見て
    // applyCancellationSideEffects（返金・キャンセルメール等）を発火する。
    wasCancelled: needsCancellationTracking,
    cancellationReason: resolvedCancellationReason,
  };
}

export async function restoreReservationCommand(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      couponId: true,
      customerId: true,
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }
  if (!reservation.deletedAt) {
    throw new DomainError("この予約は削除されていません");
  }

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedById: null,
        icsSequence: { increment: 1 },
      },
    });

    if (reservation.couponId) {
      await tx.coupon.update({
        where: { id: reservation.couponId },
        data: { usageCount: { increment: 1 } },
      });
    }
  });

  return {
    customerId: reservation.customerId,
    couponId: reservation.couponId,
  };
}
