import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";

export type EventRegistrationEditEligibilityReason =
  "status" | "payment" | "deadline";

export type EventRegistrationEditEligibilityResult =
  | { ok: true; quantityEditable: boolean }
  | { ok: false; reason: EventRegistrationEditEligibilityReason };

const SELF_SERVE_EDITABLE_STATUSES = new Set<RegistrationStatus>([
  RegistrationStatus.CONFIRMED,
  RegistrationStatus.WAITLISTED,
  RegistrationStatus.WAITLISTED_OFFERED,
]);

const SELF_SERVE_EDITABLE_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.UNPAID,
  PaymentStatus.FAILED,
]);

export function isEventRegistrationEditableForCustomerSelfServe(input: {
  status: RegistrationStatus;
  // PaymentStatus はすでに string リテラルの union のため `PaymentStatus | string` は
  // 型としては string と等価（no-redundant-type-constituents）。DB 由来の未検証値も
  // 受け付ける意図はコメントで残す。
  paymentStatus: string;
  slotStartAt: Date;
  now: Date;
}): EventRegistrationEditEligibilityResult {
  if (!SELF_SERVE_EDITABLE_STATUSES.has(input.status)) {
    return { ok: false, reason: "status" };
  }

  if (
    !SELF_SERVE_EDITABLE_PAYMENT_STATUSES.has(
      input.paymentStatus as PaymentStatus,
    )
  ) {
    return { ok: false, reason: "payment" };
  }

  if (input.now.getTime() >= input.slotStartAt.getTime()) {
    return { ok: false, reason: "deadline" };
  }

  const quantityEditable =
    input.status !== RegistrationStatus.WAITLISTED_OFFERED;

  return { ok: true, quantityEditable };
}

/** ゲスト status ハブから edit ページへの導線。cookie 前提のため token 付与不要。 */
export function buildGuestEventRegistrationEditHref(input: {
  status: RegistrationStatus;
  paymentStatus: string;
  slotStartAt: Date;
  now: Date;
}): string | null {
  const eligibility = isEventRegistrationEditableForCustomerSelfServe(input);
  if (!eligibility.ok) {
    return null;
  }
  return "/events/registrations/status/edit";
}

export function eventRegistrationEditEligibilityErrorMessage(
  reason: EventRegistrationEditEligibilityReason,
): string {
  switch (reason) {
    case "status":
      return "この申込は変更できません";
    case "payment":
      return "お支払い済みまたは決済処理中のため、申込内容を変更できません";
    case "deadline":
      return "イベント開始後は申込内容を変更できません";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}
