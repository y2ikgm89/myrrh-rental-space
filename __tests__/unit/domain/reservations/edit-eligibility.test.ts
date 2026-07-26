import { describe, expect, test } from "bun:test";
import { PaymentStatus } from "@generated/prisma/enums";
import {
  buildGuestEditHref,
  isReservationEditableForCustomerSelfServe,
} from "@/shared/domain/reservations/edit-eligibility";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

const now = new Date("2026-04-01T00:00:00Z");
const startTime = new Date("2026-04-10T10:00:00Z");
const baseInput = {
  status: ReservationStatus.CONFIRMED,
  paymentStatus: PaymentStatus.UNPAID,
  discountAmounts: {
    couponDiscountAmount: 0,
    durationDiscountAmount: 0,
    spaceDiscountAmount: 0,
  },
  startTime,
  modificationDeadlineHours: 24,
  now,
};

describe("isReservationEditableForCustomerSelfServe", () => {
  test("ACTIVE + UNPAID + 割引なし + 期限内なら ok", () => {
    expect(isReservationEditableForCustomerSelfServe(baseInput)).toEqual({
      ok: true,
    });
  });

  test("CANCELLED は status", () => {
    expect(
      isReservationEditableForCustomerSelfServe({
        ...baseInput,
        status: ReservationStatus.CANCELLED,
      }),
    ).toEqual({ ok: false, reason: "status" });
  });

  test("PAID は payment", () => {
    expect(
      isReservationEditableForCustomerSelfServe({
        ...baseInput,
        paymentStatus: PaymentStatus.PAID,
      }),
    ).toEqual({ ok: false, reason: "payment" });
  });

  test("FAILED は UNPAID と同様に編集可", () => {
    expect(
      isReservationEditableForCustomerSelfServe({
        ...baseInput,
        paymentStatus: PaymentStatus.FAILED,
      }),
    ).toEqual({ ok: true });
  });

  test("PENDING は payment", () => {
    expect(
      isReservationEditableForCustomerSelfServe({
        ...baseInput,
        paymentStatus: PaymentStatus.PENDING,
      }),
    ).toEqual({ ok: false, reason: "payment" });
  });

  test("クーポン割引ありは discount", () => {
    expect(
      isReservationEditableForCustomerSelfServe({
        ...baseInput,
        discountAmounts: { couponDiscountAmount: 100 },
      }),
    ).toEqual({ ok: false, reason: "discount" });
  });

  test("期限超過は deadline", () => {
    expect(
      isReservationEditableForCustomerSelfServe({
        ...baseInput,
        startTime: new Date("2026-04-01T12:00:00Z"),
      }),
    ).toEqual({ ok: false, reason: "deadline" });
  });
});

describe("buildGuestEditHref", () => {
  test("編集可なら /reservation/status/edit", () => {
    expect(buildGuestEditHref(baseInput)).toBe("/reservation/status/edit");
  });

  test("編集不可なら null", () => {
    expect(
      buildGuestEditHref({
        ...baseInput,
        paymentStatus: PaymentStatus.PAID,
      }),
    ).toBeNull();
  });
});
