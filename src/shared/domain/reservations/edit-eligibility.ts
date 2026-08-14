import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isWithinDeadline } from "./deadline";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import type { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

export type EditEligibilityReason =
  "status" | "payment" | "discount" | "deadline";

export type EditEligibilityResult =
  { ok: true } | { ok: false; reason: EditEligibilityReason };

/**
 * 顧客セルフサービス編集を許す paymentStatus の SSoT。
 *
 * **書込側の updateMany の WHERE もここを参照する**（監査 F-62）。旧実装は
 * eligibility が `UNPAID | FAILED` を許すのに、最終 updateMany の WHERE が
 * `UNPAID` 固定だった。Checkout を開始して離脱し `checkout.session.expired` で
 * FAILED になった予約は、**フォームは開けるのに保存だけ必ず失敗する**。
 * しかも返るのは「別のデバイスまたはタブで変更されました。ページを再読み込み
 * して…」という誤ったメッセージで、再読み込みしても FAILED のままなので
 * 何度やっても同じ。実際には同時更新は起きていない。
 *
 * PENDING / PAID を弾く TOCTOU 防御（`createCheckoutSessionCommand` が
 * `UNPAID → PENDING` に遷移させる race を封じる）という本来の目的は保たれる。
 */
export const CUSTOMER_EDITABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.UNPAID,
  PaymentStatus.FAILED,
];

const EDITABLE_STATUSES = new Set<ReservationStatus>(
  ACTIVE_RESERVATION_STATUSES,
);

export function isReservationEditableForCustomerSelfServe(input: {
  status: ReservationStatus;
  // PaymentStatus はすでに string リテラルの union のため `PaymentStatus | string` は
  // 型としては string と等価（no-redundant-type-constituents）。DB 由来の未検証値も
  // 受け付ける意図はコメントで残す。
  paymentStatus: PaymentStatus;
  discountAmounts: {
    couponDiscountAmount?: number | null;
    durationDiscountAmount?: number | null;
    spaceDiscountAmount?: number | null;
  };
  startTime: Date;
  modificationDeadlineHours: number;
  now: Date;
}): EditEligibilityResult {
  if (!EDITABLE_STATUSES.has(input.status)) {
    return { ok: false, reason: "status" };
  }

  if (!CUSTOMER_EDITABLE_PAYMENT_STATUSES.includes(input.paymentStatus)) {
    return { ok: false, reason: "payment" };
  }

  const hasDiscount =
    Number(input.discountAmounts.couponDiscountAmount ?? 0) > 0 ||
    Number(input.discountAmounts.durationDiscountAmount ?? 0) > 0 ||
    Number(input.discountAmounts.spaceDiscountAmount ?? 0) > 0;
  if (hasDiscount) {
    return { ok: false, reason: "discount" };
  }

  if (
    !isWithinDeadline(
      input.startTime,
      input.modificationDeadlineHours,
      input.now,
    )
  ) {
    return { ok: false, reason: "deadline" };
  }

  return { ok: true };
}

/** ゲスト status ハブから edit ページへの導線。cookie 前提のため token 付与不要。 */
export function buildGuestEditHref(input: {
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  discountAmounts: {
    couponDiscountAmount?: number | null;
    durationDiscountAmount?: number | null;
    spaceDiscountAmount?: number | null;
  };
  startTime: Date;
  modificationDeadlineHours: number;
  now: Date;
}): string | null {
  const eligibility = isReservationEditableForCustomerSelfServe(input);
  if (!eligibility.ok) {
    return null;
  }
  return "/reservation/status/edit";
}
