import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PaymentStatus } from "@generated/prisma/enums";
import {
  buildGuestEditHref,
  CUSTOMER_EDITABLE_PAYMENT_STATUSES,
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

/**
 * 書込側の WHERE が同じ集合を使っていることを固定する（監査 F-62）。
 *
 * 旧実装は eligibility が `UNPAID | FAILED` を許すのに、最終 updateMany の WHERE が
 * `UNPAID` 固定だった。Checkout を開始して離脱し `checkout.session.expired` で
 * FAILED になった予約は、**フォームは開けるのに保存だけ必ず失敗する**。しかも
 * 返るのは「別のデバイスまたはタブで変更されました…」という誤ったメッセージで、
 * 再読み込みしても FAILED のままなので何度やっても同じ。
 *
 * 値の写経を許さないよう、**書込側のソースが SSoT 定数を参照していること**を見る。
 * 集合そのものを両側に書くと、また片方だけ動く。
 */
describe("編集可能な paymentStatus は書込側と共有される", () => {
  test("SSoT は UNPAID と FAILED", () => {
    expect([...CUSTOMER_EDITABLE_PAYMENT_STATUSES].sort()).toEqual([
      PaymentStatus.FAILED,
      PaymentStatus.UNPAID,
    ]);
  });

  test("customer-commands の updateMany が SSoT を参照している", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src",
        "shared",
        "domain",
        "reservations",
        "customer-commands.ts",
      ),
      "utf8",
    );

    expect(source).toContain(
      "paymentStatus: { in: [...CUSTOMER_EDITABLE_PAYMENT_STATUSES] }",
    );
    // 元の欠陥そのものの形。
    expect(source).not.toContain("paymentStatus: PaymentStatus.UNPAID,");
  });
});
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
