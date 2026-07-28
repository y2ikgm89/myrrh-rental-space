/**
 * notifyReceiptIssuedFor* の domain SSoT テスト。
 *
 * - Receipt + reservation / eventRegistration を読んで sendReceiptIssuedEmail へ渡す
 * - detailUrl は呼出側パラメータを透過（guest/member 分岐は URL 組み立て側の責務）
 * - binding 不一致・宛先なしは送信しない
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { installEmailLibDispatchMock } from "../../../support/email-lib-dispatch-mock";

const mockReceiptFindUnique = mock<(...args: unknown[]) => Promise<unknown>>(
  () => Promise.resolve(null),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    receipt: {
      findUnique: (...args: unknown[]) => mockReceiptFindUnique(...args),
    },
  },
}));

type SendIssuedInput = {
  recipientEmail: string;
  serialNo: string;
  detailUrl: string;
  recipientName: string;
  subject: string;
  amount: number;
  taxAmount: number;
  issuedAt: Date;
};

const mockSendReceiptIssuedEmail = mock((_input: SendIssuedInput) =>
  Promise.resolve({ ok: true as const, messageId: "msg_test" }),
);

installEmailLibDispatchMock({
  sendReceiptIssuedEmail: mockSendReceiptIssuedEmail,
});

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  notifyReceiptIssuedForEventRegistration,
  notifyReceiptIssuedForReservation,
} from "@/shared/domain/receipts/notify-issued";

const ISSUED_AT = new Date("2026-07-26T01:00:00Z");
const MEMBER_DETAIL_URL =
  "https://example.com/mypage/reservations/res_member_001";
const GUEST_DETAIL_URL =
  "https://example.com/reservation/status?token=STATUS_TOKEN_PLACEHOLDER";
const EVENT_DETAIL_URL = "https://example.com/mypage/events";

beforeEach(() => {
  mockReceiptFindUnique.mockReset();
  mockReceiptFindUnique.mockResolvedValue(null);
  mockSendReceiptIssuedEmail.mockReset();
  mockSendReceiptIssuedEmail.mockResolvedValue({
    ok: true,
    messageId: "msg_test",
  });
});

describe("notifyReceiptIssuedForReservation", () => {
  test("会員 mypage detailUrl を透過して送信する", async () => {
    mockReceiptFindUnique.mockResolvedValue({
      serialNo: "2026-000042",
      recipientName: "山田 太郎",
      subject: "スペース利用料として",
      amount: 8800,
      taxAmount: 800,
      issuedAt: ISSUED_AT,
      reservationId: "res_member_001",
      eventRegistrationId: null,
      reservation: {
        guestEmail: null,
        customer: { email: "member@example.com" },
      },
    });

    const result = await notifyReceiptIssuedForReservation({
      receiptId: "receipt_1",
      detailUrl: MEMBER_DETAIL_URL,
    });

    expect(result).toEqual({ ok: true, messageId: "msg_test" });
    expect(mockSendReceiptIssuedEmail).toHaveBeenCalledTimes(1);
    expect(mockSendReceiptIssuedEmail.mock.calls[0]?.[0]).toMatchObject({
      recipientEmail: "member@example.com",
      serialNo: "2026-000042",
      detailUrl: MEMBER_DETAIL_URL,
    });
  });

  test("ゲストは guestEmail と status detailUrl で送信する", async () => {
    mockReceiptFindUnique.mockResolvedValue({
      serialNo: "2026-000043",
      recipientName: "ゲスト 花子",
      subject: "スペース利用料として",
      amount: 5500,
      taxAmount: 500,
      issuedAt: ISSUED_AT,
      reservationId: "res_guest_001",
      eventRegistrationId: null,
      reservation: {
        guestEmail: "guest@example.com",
        customer: { email: "shell@example.com" },
      },
    });

    const result = await notifyReceiptIssuedForReservation({
      receiptId: "receipt_2",
      detailUrl: GUEST_DETAIL_URL,
    });

    expect(result).toEqual({ ok: true, messageId: "msg_test" });
    expect(mockSendReceiptIssuedEmail.mock.calls[0]?.[0]).toMatchObject({
      recipientEmail: "guest@example.com",
      detailUrl: GUEST_DETAIL_URL,
    });
  });

  test("Receipt 未発見 → not_found（送信しない）", async () => {
    const result = await notifyReceiptIssuedForReservation({
      receiptId: "missing",
      detailUrl: MEMBER_DETAIL_URL,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(mockSendReceiptIssuedEmail).not.toHaveBeenCalled();
  });

  test("reservation 紐付けなし → wrong_binding（送信しない）", async () => {
    mockReceiptFindUnique.mockResolvedValue({
      serialNo: "2026-000044",
      recipientName: "x",
      subject: "スペース利用料として",
      amount: 1000,
      taxAmount: 0,
      issuedAt: ISSUED_AT,
      reservationId: null,
      eventRegistrationId: "evt_reg_1",
      reservation: null,
    });

    const result = await notifyReceiptIssuedForReservation({
      receiptId: "receipt_orphan",
      detailUrl: MEMBER_DETAIL_URL,
    });

    expect(result).toEqual({ ok: false, reason: "wrong_binding" });
    expect(mockSendReceiptIssuedEmail).not.toHaveBeenCalled();
  });
});

describe("notifyReceiptIssuedForEventRegistration", () => {
  test("イベント申込の detailUrl を透過して送信する", async () => {
    mockReceiptFindUnique.mockResolvedValue({
      serialNo: "2026-000050",
      recipientName: "イベント 太郎",
      subject: "イベント参加費として",
      amount: 3300,
      taxAmount: 300,
      issuedAt: ISSUED_AT,
      reservationId: null,
      eventRegistrationId: "ereg_1",
      eventRegistration: {
        email: "event-guest@example.com",
        customer: null,
      },
    });

    const result = await notifyReceiptIssuedForEventRegistration({
      receiptId: "receipt_evt_1",
      detailUrl: EVENT_DETAIL_URL,
    });

    expect(result).toEqual({ ok: true, messageId: "msg_test" });
    expect(mockSendReceiptIssuedEmail.mock.calls[0]?.[0]).toMatchObject({
      recipientEmail: "event-guest@example.com",
      serialNo: "2026-000050",
      detailUrl: EVENT_DETAIL_URL,
    });
  });

  test("email が null で customer も無い → no_recipient", async () => {
    mockReceiptFindUnique.mockResolvedValue({
      serialNo: "2026-000051",
      recipientName: "walk-in",
      subject: "イベント参加費として",
      amount: 0,
      taxAmount: 0,
      issuedAt: ISSUED_AT,
      reservationId: null,
      eventRegistrationId: "ereg_walkin",
      eventRegistration: {
        email: null,
        customer: null,
      },
    });

    const result = await notifyReceiptIssuedForEventRegistration({
      receiptId: "receipt_walkin",
      detailUrl: EVENT_DETAIL_URL,
    });

    expect(result).toEqual({ ok: false, reason: "no_recipient" });
    expect(mockSendReceiptIssuedEmail).not.toHaveBeenCalled();
  });
});
