import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import {
  CANCELLED_BY,
  TERMINAL_RESERVATION_STATUSES,
} from "@/shared/lib/validations/enums/helpers";
import { checkSpaceOverlap } from "@/shared/domain/spaces/overlap";
import { validateStatusTransition } from "./status";
import { CUSTOMER_SELECT, buildPayload } from "./payloads";
import { lockSpaceForTransaction } from "./space-locks";

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

  // 全書込を interactive tx に包む。旧実装は updateMany と coupon 復元が
  // 別 tx で走っており、更新側 commit 後 coupon 復元前に process crash が
  // 起きると Coupon.usageCount が予約分だけ残る silent inconsistency に
  // なっていた (deleteReservationCommand の tx 化と対称化)。
  //
  // 併せて、admin キャンセル経路で couponId 保有予約の usageCount 戻しが
  // 完全に欠落していたバグ (Round-3 audit Finding #4 / high) を修正する:
  // status = CANCELLED 遷移時に deleteReservationCommand と同型の
  // updateMany claim (gt: 0 ガード付き) で decrement する。既存の
  // applyCancellationSideEffects は decrement を行わないため、これがない
  // と 30 件の CONFIRMED を admin が bulk cancel した瞬間に usageCount が
  // 30 予約分だけ実 使用量から乖離し、以後のクーポン発行判定が false-limit に
  // 到達して正当な顧客の申込みまで拒否される。
  const current = await prisma.$transaction(async (tx) => {
    const updated = await tx.reservation.updateMany({
      where: { id, deletedAt: null, status: previousStatus },
      data: {
        status,
        icsSequence: { increment: 1 },
        ...(isCancellation
          ? { cancelledAt: new Date(), cancelledByType: CANCELLED_BY.ADMIN }
          : {}),
      },
    });

    if (updated.count === 0) {
      throw new DomainError(
        "予約のステータスが他の操作により変更されています。最新の状態を確認してください",
        "CONFLICT",
      );
    }

    if (isCancellation && reservation.couponId !== null) {
      await tx.coupon.updateMany({
        where: { id: reservation.couponId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }

    // claim の WHERE は status のみを条件にしているため、読取からこの claim までの間に
    // 別経路（詳細編集等）が icsSequence や予約内容を進めていた場合がある。
    // icsSequence だけを読み直して古い reservation の内容 (startTime/space/notes 等) と
    // 組み合わせると、「新しい SEQUENCE なのに古い内容」というカレンダークライアントに
    // とって最悪の不整合（古い内容が正として上書きされる）を生む。buildPayload に渡す
    // 全フィールドを同じ読取から揃えて取得する。同 tx 内・claim 成功後の read の
    // ため予約が同時に消えることはなく findUniqueOrThrow で narrow できる。
    return tx.reservation.findUniqueOrThrow({
      where: { id },
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
  });

  const source = current;

  return {
    previousStatus,
    // spaceId 等も source（claim 後の読み直し）から取る。stale な reservation の
    // spaceId のままだと、並行編集でスペースが差し替わっていた場合に
    // issueSmartLockAndSendConfirmationEmail が古いスペース（＝古い物理ドア）へ
    // パスコードを発行してしまう（確認メール自体は source ベースで新スペースの
    // 内容を表示するため、内容とパスコード発行先が食い違う）。
    spaceId: source.spaceId,
    googleCalendarEventId: source.googleCalendarEventId,
    customerId: source.customerId,
    couponId: source.couponId,
    payload: buildPayload({
      reservationId: id,
      customer: source.customer,
      space: source.space,
      startTime: source.startTime,
      endTime: source.endTime,
      totalPrice: source.totalPrice,
      notes: source.notes,
      icsSequence: source.icsSequence,
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
      await lockSpaceForTransaction(tx, reservation.spaceId);

      // Reservation と EventTimeSlot の両方で重複を検査する SSoT。旧実装は
      // `checkReservationOverlap` (Reservation-only) しか呼ばず、EventTimeSlot と
      // の cross-table 重複は DB 側 CONSTRAINT TRIGGER の raw error だけが最終
      // 防衛線になっていた。domain 層で先に検出することで、admin に人間可読な
      // VALIDATION 理由 (event/reservation どちらの重複か) を返す。
      const overlap = await checkSpaceOverlap(
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
          overlap.type === "event"
            ? "同一スペース・同一時間帯に有効なイベントが存在するため復元できません"
            : "同一スペース・同一時間帯に有効な予約が存在するため復元できません",
          "VALIDATION",
        );
      }
    }

    // updateMany + status guard による atomic claim。読取後 tx 内 write 前に
    // 別 admin (or SUPER_ADMIN) が同じ予約を復元 / 再キャンセル / 削除して
    // status を変えているケースでは count=0 となり CONFLICT で abort する。
    // 素の update({where: {id, deletedAt: null}}) だと stale な previousStatus
    // に基づく副作用 (icsSequence 巻き戻し / notification 二重) を silent に
    // 通してしまう (Round-3 audit Finding #14 / medium)。
    const claim = await tx.reservation.updateMany({
      where: { id, deletedAt: null, status: previousStatus },
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
    });

    if (claim.count === 0) {
      throw new DomainError(
        "予約のステータスが他の操作により変更されています。最新の状態を確認してください",
        "CONFLICT",
      );
    }

    return tx.reservation.findUniqueOrThrow({
      where: { id },
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

  // soft-delete 復元前に占有衝突を検査する（status 復元経路と同契約）。
  // 復元後に ACTIVE なまま slot が埋まっていると EXCLUDE 制約で raw DB error になる。
  const full = await prisma.reservation.findUnique({
    where: { id },
    select: {
      spaceId: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });
  if (!full) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    if (
      full.status === ReservationStatus.PENDING ||
      full.status === ReservationStatus.CONFIRMED
    ) {
      await lockSpaceForTransaction(tx, full.spaceId);
      const overlap = await checkSpaceOverlap(
        {
          spaceId: full.spaceId,
          startTime: full.startTime,
          endTime: full.endTime,
          excludeReservationId: id,
        },
        tx,
      );
      if (overlap.hasOverlap) {
        throw new DomainError(
          overlap.type === "event"
            ? "同一スペース・同一時間帯に有効なイベントが存在するため復元できません"
            : "同一スペース・同一時間帯に有効な予約が存在するため復元できません",
          "VALIDATION",
        );
      }
    }

    await tx.reservation.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedById: null,
        icsSequence: { increment: 1 },
      },
    });

    if (reservation.couponId) {
      // atomic claim: createAdminReservationCommand / updateAdminReservationCommand と
      // 同型の $executeRaw で usageLimit cap を強制する。素の increment だと、
      // 削除中に別経路で usageLimit まで消費された coupon を復元時に silently
      // over-limit に押し上げる (Round-3 audit Finding #10 / medium)。
      const claimed = await tx.$executeRaw`
        UPDATE "coupons"
        SET "usageCount" = "usageCount" + 1
        WHERE "id" = ${reservation.couponId}::uuid
          AND "isActive" = true
          AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
      `;
      if (claimed === 0) {
        throw new DomainError(
          "クーポンが利用できません（無効化されたか、利用上限に達した可能性があります）",
          "CONFLICT",
        );
      }
    }
  });

  return {
    customerId: reservation.customerId,
    couponId: reservation.couponId,
  };
}
