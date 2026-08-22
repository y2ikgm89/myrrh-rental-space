import { describe, test, expect } from "bun:test";
import { getReservationCardDeadlineState } from "@/shared/domain/reservations/reservation-card-deadline";

const SETTINGS = {
  modificationDeadlineHours: 24,
  cancellationDeadlineHours: 24,
} as const;

const BASE_RESERVATION = {
  status: "PENDING",
  startTime: new Date("2026-04-01T10:00:00Z"),
  paymentStatus: "UNPAID",
  couponDiscountAmount: 0,
  durationDiscountAmount: 0,
  spaceDiscountAmount: 0,
} as const;

describe("getReservationCardDeadlineState", () => {
  test("PENDING かつ変更・キャンセル期限内なら両方 true", () => {
    const now = new Date("2026-03-30T10:00:00Z");
    const result = getReservationCardDeadlineState(
      BASE_RESERVATION,
      SETTINGS,
      now,
    );
    expect(result.canModify).toBe(true);
    expect(result.canCancel).toBe(true);
    expect(result.showPastDeadlineMessage).toBe(false);
  });

  test("期限外なら変更・キャンセル不可・メッセージ表示", () => {
    const now = new Date("2026-04-01T09:00:00Z");
    const result = getReservationCardDeadlineState(
      { ...BASE_RESERVATION, status: "CONFIRMED" },
      SETTINGS,
      now,
    );
    expect(result.canModify).toBe(false);
    expect(result.canCancel).toBe(false);
    expect(result.showPastDeadlineMessage).toBe(true);
  });

  test("COMPLETED ならすべて false", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    const result = getReservationCardDeadlineState(
      { ...BASE_RESERVATION, status: "COMPLETED" },
      SETTINGS,
      now,
    );
    expect(result.canModify).toBe(false);
    expect(result.canCancel).toBe(false);
    expect(result.showPastDeadlineMessage).toBe(false);
  });

  test("UNPAID 以外は canModify false（canCancel は期限内なら true）", () => {
    const now = new Date("2026-03-30T10:00:00Z");
    const result = getReservationCardDeadlineState(
      { ...BASE_RESERVATION, paymentStatus: "PAID" },
      SETTINGS,
      now,
    );
    expect(result.canModify).toBe(false);
    expect(result.canCancel).toBe(true);
    expect(result.showPastDeadlineMessage).toBe(false);
  });

  /**
   * 決済中 (PENDING) は期限内でもキャンセル導線を出さない（監査 A-15）。
   *
   * 以前は一覧カードだけがこのガードを欠いており、「キャンセル」を押すと
   * 詳細画面にはボタンが無い（`canCustomerInitiateCancellation` が false）という
   * 行き止まりになっていた。しかも `canCancel` が true だったため
   * `showPastDeadlineMessage` も false になり、一覧側に理由も出なかった。
   */
  test("決済中 (PENDING) は期限内でも canCancel false で問い合わせ案内を出す", () => {
    const now = new Date("2026-03-30T10:00:00Z");
    const result = getReservationCardDeadlineState(
      { ...BASE_RESERVATION, paymentStatus: "PENDING" },
      SETTINGS,
      now,
    );
    expect(result).toEqual({
      canModify: false,
      canCancel: false,
      showPastDeadlineMessage: true,
    });
  });

  test("割引ありは canModify false", () => {
    const now = new Date("2026-03-30T10:00:00Z");
    const result = getReservationCardDeadlineState(
      {
        ...BASE_RESERVATION,
        couponDiscountAmount: 500,
      },
      SETTINGS,
      now,
    );
    expect(result.canModify).toBe(false);
    expect(result.canCancel).toBe(true);
  });
});
