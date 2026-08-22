/**
 * ステータス変更メールの payload は **payload から導出する**（監査 A-21）。
 *
 * ## なぜ
 *
 * 以前は admin action の 3 箇所が `StatusChangeEmailData` を手組みしており、
 * **3 箇所とも `userId` を書き写し忘れていた**。sender はこの値だけで動線を
 * 出し分ける（`reservation-emails.ts` の `buildBookingHubUrl` / `buildMemberReservationUrl`）
 * ため、落ちると会員にも 90 日有効な bearer トークン URL が送られ、
 * 「マイページで予約詳細を確認する」リンクは描画されない。
 *
 * 型は `userId` を必須にして書き忘れを type-check で落とすようにしたが、
 * **「渡してはいるが別の値になっている」は型では見えない**。ここでは
 * 導出が payload の値をそのまま運ぶことを固定する。
 */

import { describe, expect, test, mock } from "bun:test";

// payloads.ts は prisma を import するだけで、この導出関数自体は触らない。
mock.module("@/shared/db/prisma", () => ({ prisma: {} }));

const { buildStatusChangeEmailData } =
  await import("@/shared/domain/reservations/payloads");
const { ReservationStatus } =
  await import("@/shared/lib/validations/enums/prisma-types");

const PAYLOAD = {
  reservationId: "reservation-abcdef12",
  customerEmail: "customer@example.com",
  customerName: "山田 太郎",
  spaceName: "会議室A",
  startTime: new Date("2099-01-01T01:00:00Z"),
  endTime: new Date("2099-01-01T03:00:00Z"),
  totalPrice: 5000,
  totalPriceWithTax: 5500,
  icsSequence: 1,
  location: "東京都渋谷区1-1-1 2F",
  userId: null as string | null,
};

describe("buildStatusChangeEmailData", () => {
  test("userId を payload からそのまま運ぶ（会員 / ゲストの両方向）", () => {
    const member = buildStatusChangeEmailData(
      { ...PAYLOAD, userId: "user-1" },
      {
        oldStatus: ReservationStatus.PENDING,
        newStatus: ReservationStatus.CONFIRMED,
      },
    );
    const guest = buildStatusChangeEmailData(
      { ...PAYLOAD, userId: null },
      {
        oldStatus: ReservationStatus.PENDING,
        newStatus: ReservationStatus.CONFIRMED,
      },
    );

    expect({ member: member.userId, guest: guest.userId }).toEqual({
      member: "user-1",
      guest: null,
    });
  });

  test("金額は税込を運び、ステータスは引数側が決める", () => {
    const data = buildStatusChangeEmailData(PAYLOAD, {
      oldStatus: ReservationStatus.CONFIRMED,
      newStatus: ReservationStatus.NO_SHOW,
    });

    expect({
      totalPriceWithTax: data.totalPriceWithTax,
      oldStatus: data.oldStatus,
      newStatus: data.newStatus,
      location: data.location,
    }).toEqual({
      totalPriceWithTax: 5500,
      oldStatus: ReservationStatus.CONFIRMED,
      newStatus: ReservationStatus.NO_SHOW,
      location: "東京都渋谷区1-1-1 2F",
    });
  });

  test("location が無い payload では location キー自体を作らない", () => {
    const { location: _omitted, ...withoutLocation } = PAYLOAD;
    const data = buildStatusChangeEmailData(withoutLocation, {
      oldStatus: ReservationStatus.PENDING,
      newStatus: ReservationStatus.CANCELLED,
    });

    expect(data).not.toHaveProperty("location");
  });
});
