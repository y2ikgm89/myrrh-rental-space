import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isWithinDeadline } from "./deadline";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import type { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

export type EditEligibilityReason =
  "status" | "payment" | "discount" | "deadline";

export type EditEligibilityResult =
  { ok: true } | { ok: false; reason: EditEligibilityReason };

const EDITABLE_STATUSES = new Set<ReservationStatus>(
  ACTIVE_RESERVATION_STATUSES,
);

export function isReservationEditableForCustomerSelfServe(input: {
  status: ReservationStatus;
  // PaymentStatus はすでに string リテラルの union のため `PaymentStatus | string` は
  // 型としては string と等価（no-redundant-type-constituents）。DB 由来の未検証値も
  // 受け付ける意図はコメントで残す。
  paymentStatus: string;
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

  if (
    input.paymentStatus !== PaymentStatus.UNPAID &&
    input.paymentStatus !== PaymentStatus.FAILED
  ) {
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
  paymentStatus: string;
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
