import { describe, test, expect } from "bun:test";
import { isValidElement } from "react";
import { ReservationRefundEmail } from "@/shared/emails/reservation-refund";
import { reservationRefundFixture } from "@/shared/emails/reservation-refund.fixture";

type EmailLayoutElementProps = {
  preview?: string;
  footer?: unknown;
  children?: unknown;
};

describe("ReservationRefundEmail component", () => {
  test("returns a React element wrapped in EmailLayout", () => {
    const el = ReservationRefundEmail(reservationRefundFixture);
    expect(isValidElement<EmailLayoutElementProps>(el)).toBe(true);
    if (!isValidElement<EmailLayoutElementProps>(el)) {
      throw new Error("ReservationRefundEmail must return a React element");
    }
    expect(el.props.preview).toContain("ご返金のお知らせ");
    expect(el.props.footer).toBeTruthy();
  });

  test("renders all key props into the tree (customer, spaceName, refund amounts, reason)", () => {
    const el = ReservationRefundEmail(reservationRefundFixture);
    const json = JSON.stringify(el);
    expect(json).toContain(reservationRefundFixture.customerName);
    expect(json).toContain(reservationRefundFixture.spaceName);
    expect(json).toContain(reservationRefundFixture.reservationId);
    expect(json).toContain(reservationRefundFixture.refundAmount);
    expect(json).toContain(reservationRefundFixture.cumulativeRefundAmount);
    if (reservationRefundFixture.reason) {
      expect(json).toContain(reservationRefundFixture.reason);
    }
  });

  test("full refund suppresses the cumulative/total breakdown line", () => {
    const el = ReservationRefundEmail({
      ...reservationRefundFixture,
      isFullyRefunded: true,
      refundAmount: "¥8,000",
      cumulativeRefundAmount: "¥8,000",
    });
    const json = JSON.stringify(el);
    // 「全額を返金」文言が本文に出る
    expect(json).toContain("全額を返金");
    // 部分返金時のみ表示される "返金累計額" ラベルは無い
    expect(json).not.toContain("返金累計額");
  });

  test("partial refund includes the 一部を返金 wording", () => {
    const el = ReservationRefundEmail({
      ...reservationRefundFixture,
      isFullyRefunded: false,
    });
    const json = JSON.stringify(el);
    expect(json).toContain("一部を返金");
    expect(json).toContain("返金累計額");
  });

  test("member reservation URL renders a mypage link", () => {
    const el = ReservationRefundEmail(reservationRefundFixture);
    const json = JSON.stringify(el);
    expect(json).toContain("マイページで予約履歴を確認する");
    if (reservationRefundFixture.memberReservationUrl) {
      expect(json).toContain(reservationRefundFixture.memberReservationUrl);
    }
  });
});
