import {
  CANCELLABLE_STATUSES,
  canCustomerInitiateCancellation,
} from "./cancellation-eligibility";
import { isReservationEditableForCustomerSelfServe } from "./edit-eligibility";
import type {
  ReservationStatus,
  PaymentStatus,
} from "@/shared/lib/validations/enums/prisma-types";

/**
 * 一覧カードの変更・キャンセル導線を出しうるステータス集合。
 *
 * **literal で書き直さない（監査 A-15）。** 以前は「詳細の CANCELLABLE と一致」と
 * JSDoc で宣言しながら別の literal を持っており、実際にずれていた。
 */
const MODIFIABLE_STATUSES = new Set<ReservationStatus>(CANCELLABLE_STATUSES);

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
  // 詳細画面・書込側と同じ述語に委ねる（監査 A-15）。
  // 以前はステータスと期限だけを見ており、`paymentStatus === PENDING`（Stripe
  // Checkout を開いたまま離脱）を見落としていた。一覧には「キャンセル」が出るのに
  // 詳細へ行くとボタンが無い行き止まりになる。
  const canCancel = canCustomerInitiateCancellation({
    status: reservation.status,
    paymentStatus: reservation.paymentStatus,
    startTime: reservation.startTime,
    cancellationDeadlineHours: deadlineSettings.cancellationDeadlineHours,
    now,
  });
  const showPastDeadlineMessage = isModifiable && !canModify && !canCancel;

  return { canModify, canCancel, showPastDeadlineMessage };
}
