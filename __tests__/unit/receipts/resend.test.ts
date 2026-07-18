/**
 * requestReceiptResendByEmail — ゲスト向け領収書再送信 domain command の unit test.
 *
 * Case B (usedAt=null): 元 Receipt をそのまま返し、呼出側で新 token 発行のみ。
 * Case C (usedAt!=null): reissueReceiptCommand で新 Receipt を発行。
 * enumeration 対策: 未発見・email mismatch・orphan は全て null (呼出側で success 表示)。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const RECEIPT_ID = "receipt-abc";
const NEW_RECEIPT_ID = "receipt-new";
const SERIAL_NO = "2026-000042";
const NEW_SERIAL_NO = "2026-000099";
const CUSTOMER_EMAIL = "guest@example.com";
const OTHER_EMAIL = "attacker@example.com";
const ISSUED_AT = new Date("2026-07-10T09:00:00Z");

function baseReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: RECEIPT_ID,
    serialNo: SERIAL_NO,
    recipientName: "山田 太郎",
    subject: "スペース利用料として",
    amount: 8800,
    taxAmount: 800,
    taxRate: 10,
    issuedAt: ISSUED_AT,
    usedAt: null as Date | null,
    reservationId: "res-1",
    eventRegistrationId: null,
    reservation: {
      guestEmail: CUSTOMER_EMAIL,
      customer: null as { email: string } | null,
    },
    eventRegistration: null,
    ...overrides,
  };
}

const findUniqueSpy = mock<
  (args: { where: { serialNo: string } }) => Promise<unknown>
>(() => Promise.resolve(null));

const reissueSpy = mock<(input: unknown) => Promise<unknown>>(() =>
  Promise.resolve({
    id: NEW_RECEIPT_ID,
    serialNo: NEW_SERIAL_NO,
    recipientName: "山田 太郎",
    subject: "スペース利用料として",
    amount: 8800,
    taxAmount: 800,
    taxRate: 10,
    issuedAt: new Date("2026-07-19T09:00:00Z"),
  }),
);

beforeEach(() => {
  mock.restore();

  findUniqueSpy.mockReset();
  findUniqueSpy.mockImplementation(() => Promise.resolve(null));
  reissueSpy.mockReset();
  reissueSpy.mockImplementation(() =>
    Promise.resolve({
      id: NEW_RECEIPT_ID,
      serialNo: NEW_SERIAL_NO,
      recipientName: "山田 太郎",
      subject: "スペース利用料として",
      amount: 8800,
      taxAmount: 800,
      taxRate: 10,
      issuedAt: new Date("2026-07-19T09:00:00Z"),
    }),
  );

  mock.module("@/shared/db/prisma", () => ({
    prisma: {
      receipt: {
        findUnique: findUniqueSpy,
      },
    },
  }));

  mock.module("@/shared/domain/receipts/issue", () => ({
    reissueReceiptCommand: reissueSpy,
  }));
});

describe("requestReceiptResendByEmail", () => {
  test("Receipt 未発見なら null (enumeration 対策)", async () => {
    findUniqueSpy.mockImplementation(() => Promise.resolve(null));

    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: CUSTOMER_EMAIL,
    });

    expect(result).toBeNull();
    expect(reissueSpy).not.toHaveBeenCalled();
  });

  test("空 serialNo なら null (DB lookup せず即 return)", async () => {
    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: "   ",
      email: CUSTOMER_EMAIL,
    });

    expect(result).toBeNull();
    expect(findUniqueSpy).not.toHaveBeenCalled();
  });

  test("空 email なら null (DB lookup せず即 return)", async () => {
    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: "   ",
    });

    expect(result).toBeNull();
    expect(findUniqueSpy).not.toHaveBeenCalled();
  });

  test("Orphan Receipt (reservationId/eventRegistrationId 両方 NULL) は null (再発行済み)", async () => {
    findUniqueSpy.mockImplementation(() =>
      Promise.resolve(
        baseReceipt({
          reservationId: null,
          eventRegistrationId: null,
          reservation: null,
        }),
      ),
    );

    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: CUSTOMER_EMAIL,
    });

    expect(result).toBeNull();
    expect(reissueSpy).not.toHaveBeenCalled();
  });

  test("Email mismatch は null (timing-safe 比較で失敗)", async () => {
    findUniqueSpy.mockImplementation(() => Promise.resolve(baseReceipt()));

    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: OTHER_EMAIL,
    });

    expect(result).toBeNull();
    expect(reissueSpy).not.toHaveBeenCalled();
  });

  test("Case B: usedAt=null なら元 Receipt を返し reissue しない (wasReissued=false)", async () => {
    findUniqueSpy.mockImplementation(() =>
      Promise.resolve(baseReceipt({ usedAt: null })),
    );

    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: CUSTOMER_EMAIL,
    });

    expect(result).not.toBeNull();
    expect(result?.wasReissued).toBe(false);
    expect(result?.receipt.serialNo).toBe(SERIAL_NO);
    expect(result?.receipt.id).toBe(RECEIPT_ID);
    expect(result?.recipientEmail).toBe(CUSTOMER_EMAIL);
    expect(result?.previousSerialNo).toBeUndefined();
    expect(reissueSpy).not.toHaveBeenCalled();
  });

  test("Case C: usedAt!=null なら reissueReceiptCommand で新 Receipt を発行 (wasReissued=true, previousSerialNo=旧番号)", async () => {
    findUniqueSpy.mockImplementation(() =>
      Promise.resolve(
        baseReceipt({ usedAt: new Date("2026-07-15T10:00:00Z") }),
      ),
    );

    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: CUSTOMER_EMAIL,
    });

    expect(result).not.toBeNull();
    expect(result?.wasReissued).toBe(true);
    expect(result?.receipt.serialNo).toBe(NEW_SERIAL_NO);
    expect(result?.receipt.id).toBe(NEW_RECEIPT_ID);
    expect(result?.previousSerialNo).toBe(SERIAL_NO);
    expect(reissueSpy).toHaveBeenCalledTimes(1);
    expect(reissueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        originalReceiptId: RECEIPT_ID,
      }),
    );
  });

  test("Email 正規化: 大文字小文字違いでも一致すれば成功する", async () => {
    findUniqueSpy.mockImplementation(() =>
      Promise.resolve(
        baseReceipt({
          reservation: {
            guestEmail: "Guest@Example.COM",
            customer: null,
          },
        }),
      ),
    );

    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: "  GUEST@example.com  ",
    });

    expect(result).not.toBeNull();
    expect(result?.recipientEmail).toBe("guest@example.com");
  });

  test("customer.email 経路: guestEmail が NULL でも customer.email が一致すれば成功", async () => {
    findUniqueSpy.mockImplementation(() =>
      Promise.resolve(
        baseReceipt({
          reservation: {
            guestEmail: null,
            customer: { email: CUSTOMER_EMAIL },
          },
        }),
      ),
    );

    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: CUSTOMER_EMAIL,
    });

    expect(result).not.toBeNull();
    expect(result?.wasReissued).toBe(false);
  });

  test("EventRegistration 経路: eventRegistration.email が一致すれば成功", async () => {
    findUniqueSpy.mockImplementation(() =>
      Promise.resolve(
        baseReceipt({
          reservationId: null,
          reservation: null,
          eventRegistrationId: "reg-1",
          eventRegistration: {
            email: CUSTOMER_EMAIL,
            customer: null,
          },
        }),
      ),
    );

    const { requestReceiptResendByEmail } =
      await import("@/shared/domain/receipts/resend");

    const result = await requestReceiptResendByEmail({
      serialNo: SERIAL_NO,
      email: CUSTOMER_EMAIL,
    });

    expect(result).not.toBeNull();
    expect(result?.wasReissued).toBe(false);
  });
});
