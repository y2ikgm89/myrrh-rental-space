import { describe, expect, test } from "bun:test";
import { PaymentStatus } from "@generated/prisma/enums";
import {
  buildGuestEventRegistrationEditHref,
  isEventRegistrationEditableForCustomerSelfServe,
} from "@/shared/domain/events/edit-eligibility";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

const now = new Date("2026-04-01T00:00:00Z");
const slotStartAt = new Date("2026-04-10T10:00:00Z");

const baseInput = {
  status: RegistrationStatus.CONFIRMED,
  paymentStatus: PaymentStatus.UNPAID,
  slotStartAt,
  now,
};

describe("isEventRegistrationEditableForCustomerSelfServe", () => {
  test("CONFIRMED + UNPAID + 開始前なら quantityEditable=true", () => {
    expect(isEventRegistrationEditableForCustomerSelfServe(baseInput)).toEqual({
      ok: true,
      quantityEditable: true,
    });
  });

  test("WAITLISTED も編集可", () => {
    expect(
      isEventRegistrationEditableForCustomerSelfServe({
        ...baseInput,
        status: RegistrationStatus.WAITLISTED,
      }),
    ).toEqual({ ok: true, quantityEditable: true });
  });

  test("WAITLISTED_OFFERED は quantityEditable=false", () => {
    expect(
      isEventRegistrationEditableForCustomerSelfServe({
        ...baseInput,
        status: RegistrationStatus.WAITLISTED_OFFERED,
      }),
    ).toEqual({ ok: true, quantityEditable: false });
  });

  test("CANCELLED は status", () => {
    expect(
      isEventRegistrationEditableForCustomerSelfServe({
        ...baseInput,
        status: RegistrationStatus.CANCELLED,
      }),
    ).toEqual({ ok: false, reason: "status" });
  });

  test("PAID は payment", () => {
    expect(
      isEventRegistrationEditableForCustomerSelfServe({
        ...baseInput,
        paymentStatus: PaymentStatus.PAID,
      }),
    ).toEqual({ ok: false, reason: "payment" });
  });

  test("FAILED は UNPAID と同様に編集可", () => {
    expect(
      isEventRegistrationEditableForCustomerSelfServe({
        ...baseInput,
        paymentStatus: PaymentStatus.FAILED,
      }),
    ).toEqual({ ok: true, quantityEditable: true });
  });

  test("PENDING は payment", () => {
    expect(
      isEventRegistrationEditableForCustomerSelfServe({
        ...baseInput,
        paymentStatus: PaymentStatus.PENDING,
      }),
    ).toEqual({ ok: false, reason: "payment" });
  });

  test("開始後は deadline", () => {
    expect(
      isEventRegistrationEditableForCustomerSelfServe({
        ...baseInput,
        slotStartAt: new Date("2026-03-31T12:00:00Z"),
      }),
    ).toEqual({ ok: false, reason: "deadline" });
  });
});

describe("buildGuestEventRegistrationEditHref", () => {
  test("編集可なら /events/registrations/status/edit", () => {
    expect(buildGuestEventRegistrationEditHref(baseInput)).toBe(
      "/events/registrations/status/edit",
    );
  });

  test("編集不可なら null", () => {
    expect(
      buildGuestEventRegistrationEditHref({
        ...baseInput,
        paymentStatus: PaymentStatus.PAID,
      }),
    ).toBeNull();
  });
});
