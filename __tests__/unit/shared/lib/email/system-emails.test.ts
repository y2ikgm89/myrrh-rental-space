import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockSendEmail = mock(async () => ({ ok: true, messageId: "message-1" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (value: string) => value,
}));

mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: () =>
    Promise.resolve({
      businessName: "Myrrh",
      address: "",
      phoneNumber: null,
      contactEmail: null,
      siteName: "Myrrh",
      siteUrl: "https://example.com",
      legalLinks: [],
    }),
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getNotificationEmailAddresses: () => Promise.resolve(["admin@example.com"]),
}));

const { sendStaffAccessGuideEmail } =
  await import("@/shared/lib/email/system-emails");

describe("sendStaffAccessGuideEmail", () => {
  beforeEach(() => {
    mockSendEmail.mockClear();
  });

  test("再送用 deliveryKey が指定された場合は別 idempotency key を使う", async () => {
    await sendStaffAccessGuideEmail({
      to: "staff@example.com",
      staffName: "Staff User",
      staffEmail: "staff@example.com",
      roleLabel: "編集者",
      adminUrl: "https://admin.example.com/admin",
      deliveryKey: "resend/user-1/attempt-1",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "staff-access-guide/resend/user-1/attempt-1",
      }),
    );
  });
});
