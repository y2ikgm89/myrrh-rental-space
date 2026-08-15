/**
 * domain `sendCustomerBroadcast` が transport 無効時に
 * `{ ok: false, reason: "disabled" }` を返す契約を固定する。
 * action 層は dispatch の戻りを前提にするだけで、この分岐自体は未テストだった。
 */
import { describe, expect, mock, test } from "bun:test";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";

const mockFindCustomersForBroadcast = mock(() =>
  Promise.resolve([{ id: CUSTOMER_ID, email: "customer@example.com" }]),
);
const mockSendCustomerBroadcastLib = mock(() =>
  Promise.resolve({ sent: 1, excluded: 0 }),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/domain/settings/queries/email-render-context", () => ({
  resolveEmailSendContext: () => Promise.resolve(null),
  getReminderEmailRenderContext: mock(),
  resolveContactAdminNotificationDelivery: mock(),
  resolveContactConfirmationRenderContext: mock(),
  resolveSystemNotificationDelivery: mock(),
}));
mock.module("@/shared/domain/customers/queries", () => ({
  findCustomersForBroadcast: (
    ...args: Parameters<typeof mockFindCustomersForBroadcast>
  ) => mockFindCustomersForBroadcast(...args),
}));
mock.module("@/shared/lib/email/customer-emails", () => ({
  sendCustomerBroadcast: (
    ...args: Parameters<typeof mockSendCustomerBroadcastLib>
  ) => mockSendCustomerBroadcastLib(...args),
}));

const { sendCustomerBroadcast } =
  await import("@/shared/domain/email/dispatch");

describe("sendCustomerBroadcast", () => {
  test("resolveEmailSendContext が null なら disabled を返し lib を呼ばない", async () => {
    const result = await sendCustomerBroadcast([CUSTOMER_ID], {
      subject: "お知らせ",
      body: "本文です",
      broadcastNonce: "nonce-1",
    });

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendCustomerBroadcastLib).not.toHaveBeenCalled();
  });
});
