import { isWithinDeadline } from "./deadline";
import { isReservationEditableForCustomerSelfServe } from "./edit-eligibility";
import {
  ReservationStatus,
  type PaymentStatus,
} from "@/shared/lib/validations/enums/prisma-types";

/** 一覧カードのキャンセル表示と同じステータス集合（詳細の CANCELLABLE と一致） */
const MODIFIABLE_STATUSES = new Set<ReservationStatus>([
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
]);

export interface ReservationCardDeadlineInput {
  readonly status: ReservationStatus;
  readonly startTime: Date;
  readonly paymentStatus: PaymentStatus;
  readonly couponDiscountAmount?: number | null;
  readonly durationDiscountAmount?: number | null;
  readonly spaceDiscountAmount?: number | null;
}

export interface ReservationDeadlineSettingsInput {
  readonly modificationDeadlineHours: number;
  readonly cancellationDeadlineHours: number;
}

/**
 * マイページ予約一覧カード用: 変更リンク・キャンセルリンク・期限外メッセージの表示可否。
 * 「現在時刻」は呼び出し側（Server Component 等）で渡し、ドメイン関数は純粋に保つ。
 */
export function getReservationCardDeadlineState(
  reservation: ReservationCardDeadlineInput,
  deadlineSettings: ReservationDeadlineSettingsInput,
  now: Date,
): {
  readonly canModify: boolean;
  readonly canCancel: boolean;
  readonly showPastDeadlineMessage: boolean;
} {
  const isModifiable = MODIFIABLE_STATUSES.has(reservation.status);
  const canModify = isReservationEditableForCustomerSelfServe({
    status: reservation.status,
    paymentStatus: reservation.paymentStatus,
    discountAmounts: {
      ...(reservation.couponDiscountAmount !== undefined
        ? { couponDiscountAmount: reservation.couponDiscountAmount }
        : {}),
      ...(reservation.durationDiscountAmount !== undefined
        ? { durationDiscountAmount: reservation.durationDiscountAmount }
        : {}),
      ...(reservation.spaceDiscountAmount !== undefined
        ? { spaceDiscountAmount: reservation.spaceDiscountAmount }
        : {}),
    },
    startTime: reservation.startTime,
    modificationDeadlineHours: deadlineSettings.modificationDeadlineHours,
    now,
  }).ok;
  const canCancel =
    isModifiable &&
    isWithinDeadline(
      reservation.startTime,
      deadlineSettings.cancellationDeadlineHours,
      now,
    );
  const showPastDeadlineMessage = isModifiable && !canModify && !canCancel;

  return { canModify, canCancel, showPastDeadlineMessage };
}
