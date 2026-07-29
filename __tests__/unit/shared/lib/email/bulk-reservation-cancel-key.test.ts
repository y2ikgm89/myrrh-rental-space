/**
 * series 一括キャンセルメール (`sendBulkReservationCancelledEmail` /
 * `sendBulkAdminNotification`) の idempotencyKey に batchNonce が入る drift gate。
 *
 * ## 背景 (RESEND-AUDIT L6)
 *
 * Resend の idempotency key は 24h 有効・同一キー再送で payload 差異があると
 * 409 (`invalid_idempotent_request`) を返す。この 409 は `RETRYABLE_ERROR_NAMES`
 * に含まれないため silent drop に近い挙動になる (error ログのみ)。
 *
 * 修正前の key は `bulk-reservation-cancel[-admin]/<seriesId>` のみだったため、
 * 「admin が 3 instance を partial-cancel → 4h 後に別の 2 instance を追加で
 * partial-cancel」のような 24h 内の再実行で seriesId が同じまま payload
 * (`instances[]` / `reason`) が異なる状況が発生し、後発 batch の顧客・管理者
 * 両方への通知が silent-drop される。
 *
 * 修正後は `applyBulkCancellationSideEffects` が `crypto.randomUUID()` で
 * batchNonce を 1 度だけ生成し、`BulkReservationCancelledEmailData.batchNonce`
 * に載せて渡す。sender 側は key を `<prefix>/<seriesId>/<batchNonce>` に組み立てる。
 *
 * 検証項目:
 * - 同一 seriesId + 異なる batchNonce → キーが異なる (別 batch 判定)
 * - 同一 seriesId + 同一 batchNonce → キーが同一 (同 batch の retry 冪等性)
 * - `sendBulkReservationCancelledEmail` / `sendBulkAdminNotification`
 *   両方の key に batchNonce が反映される (顧客・管理者双方の silent drop 防止)
 *
 * `sendEventBroadcast` の broadcastNonce と同型のパターン。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  EMAIL_SEND_CONTEXT,
  RESERVATION_ADMIN_DELIVERY,
} from "./_email-test-fixtures";

type CapturedSendEmailParams = { idempotencyKey?: string; operation: string };

const mockSendEmail = mock<
  (params: CapturedSendEmailParams) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (s: string) => s,
}));
mock.module("@/shared/db/prisma", () => ({ prisma: {} }));
mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: () =>
    Promise.resolve({
      businessName: "Org",
      address: "",
      phoneNumber: null,
      contactEmail: null,
      siteName: "Org",
      siteUrl: "https://example.com",
      legalLinks: [],
    }),
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendBulkAdminNotification,
  sendBulkReservationCancelledEmail,
} from "@/shared/lib/email/reservation-emails";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import type { BulkReservationCancelledEmailData } from "@/shared/lib/email/types";

const SERIES_ID = "33333333-3333-4333-8333-333333333333";
const NONCE_A = "11111111-1111-4111-8111-111111111111";
const NONCE_B = "22222222-2222-4222-8222-222222222222";

const baseData = (
  overrides: Partial<BulkReservationCancelledEmailData> = {},
): BulkReservationCancelledEmailData => ({
  seriesId: SERIES_ID,
  customerEmail: "customer@example.com",
  customerName: "山田 太郎",
  spaceName: "Studio A",
  instances: [
    {
      startTime: new Date("2099-01-01T01:00:00Z"),
      endTime: new Date("2099-01-01T03:00:00Z"),
    },
  ],
  batchNonce: NONCE_A,
  ...overrides,
});

function lastKey(): string | undefined {
  return mockSendEmail.mock.calls.at(-1)?.[0]?.idempotencyKey;
}

function keyForOperation(operation: string): string | undefined {
  return mockSendEmail.mock.calls.find(
    (call) => call[0]?.operation === operation,
  )?.[0]?.idempotencyKey;
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendBulkReservationCancelledEmail() の idempotencyKey に batchNonce が入る (L6)", () => {
  test("同一 seriesId + 異なる batchNonce → 異なるキー (24h 内 partial re-cancel の silent drop 防止)", async () => {
    await sendBulkReservationCancelledEmail(
      baseData({ batchNonce: NONCE_A }),
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastKey();

    await sendBulkReservationCancelledEmail(
      baseData({ batchNonce: NONCE_B }),
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("同一 seriesId + 同一 batchNonce → 同一キー (Resend retry 冪等性)", async () => {
    await sendBulkReservationCancelledEmail(
      baseData({ batchNonce: NONCE_A }),
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastKey();

    await sendBulkReservationCancelledEmail(
      baseData({ batchNonce: NONCE_A }),
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(firstKey).toBe(secondKey);
  });

  test("キーは `bulk-reservation-cancel/<seriesId>/<batchNonce>` 形式", async () => {
    await sendBulkReservationCancelledEmail(
      baseData({ batchNonce: NONCE_A }),
      EMAIL_SEND_CONTEXT,
    );
    expect(lastKey()).toBe(`bulk-reservation-cancel/${SERIES_ID}/${NONCE_A}`);
  });
});

describe("sendBulkAdminNotification() の idempotencyKey にも batchNonce が入る (L6)", () => {
  test("同一 seriesId + 異なる batchNonce → 異なるキー", async () => {
    await sendBulkAdminNotification(
      baseData({ batchNonce: NONCE_A }),
      RESERVATION_ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastKey();

    await sendBulkAdminNotification(
      baseData({ batchNonce: NONCE_B }),
      RESERVATION_ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("同一 seriesId + 同一 batchNonce → 同一キー", async () => {
    await sendBulkAdminNotification(
      baseData({ batchNonce: NONCE_A }),
      RESERVATION_ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastKey();

    await sendBulkAdminNotification(
      baseData({ batchNonce: NONCE_A }),
      RESERVATION_ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(firstKey).toBe(secondKey);
  });

  test("キーは `bulk-reservation-cancel-admin/<seriesId>/<batchNonce>` 形式", async () => {
    await sendBulkAdminNotification(
      baseData({ batchNonce: NONCE_A }),
      RESERVATION_ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );
    expect(lastKey()).toBe(
      `bulk-reservation-cancel-admin/${SERIES_ID}/${NONCE_A}`,
    );
  });
});

describe("顧客向け + 管理者向け 2 送信は同一 batch では同じ nonce を共有する", () => {
  test("同一 batchNonce で customer / admin 両送信 → prefix 違いのみで nonce は共通", async () => {
    const data = baseData({ batchNonce: NONCE_A });

    await sendBulkReservationCancelledEmail(data, EMAIL_SEND_CONTEXT);
    await sendBulkAdminNotification(
      data,
      RESERVATION_ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );

    const customerKey = keyForOperation("sendBulkReservationCancelledEmail");
    const adminKey = keyForOperation("sendBulkAdminNotification");

    expect(customerKey).toBe(`bulk-reservation-cancel/${SERIES_ID}/${NONCE_A}`);
    expect(adminKey).toBe(
      `bulk-reservation-cancel-admin/${SERIES_ID}/${NONCE_A}`,
    );

    // prefix が異なるため衝突しない (顧客と管理者は別テンプレ・別送信先)
    expect(customerKey).not.toBe(adminKey);

    // かつ nonce 部分は共通 (同 batch の retry で両方冪等)
    expect(customerKey?.endsWith(`/${NONCE_A}`)).toBe(true);
    expect(adminKey?.endsWith(`/${NONCE_A}`)).toBe(true);
  });
});
