import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSendEmail = mock<
  (params: {
    payload: {
      to: string;
      subject: string;
      react: unknown;
      tags?: { name: string; value: string }[];
      headers?: Record<string, string>;
    };
    idempotencyKey?: string;
    operation: string;
    context?: Record<string, unknown>;
  }) => Promise<
    | { ok: true; messageId: string }
    | { ok: false; reason: "disabled" }
    | { ok: false; reason: "error"; error: string }
  >
>(() => Promise.resolve({ ok: true, messageId: "re_test" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: mock((v: string) => v.slice(0, 16)),
}));

const { sendTestEmail } = await import("@/shared/lib/email/test-email");

describe("sendTestEmail", () => {
  beforeEach(() => mockSendEmail.mockClear());

  test("builds payload with to / subject / react / tags / headers", async () => {
    await sendTestEmail({
      to: "admin@example.com",
      staffId: "user-123",
      triggeredByEmail: "admin@example.com",
      triggeredByName: "Admin",
      siteName: "Myrrh",
      simulatorAddress: false,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.payload.to).toBe("admin@example.com");
    expect(call?.payload.subject).toContain("テスト送信");
    expect(call?.payload.react).toBeTruthy();
    expect(call?.payload.tags).toEqual([
      { name: "category", value: "test" },
      { name: "source", value: "admin_settings" },
    ]);
    expect(call?.payload.headers).toEqual({ "X-Test-Email": "true" });
  });

  test("idempotencyKey format: test-email/<staffId>/<ts>-<rnd6>", async () => {
    await sendTestEmail({
      to: "x@y.com",
      staffId: "user-abc",
      triggeredByEmail: "x@y.com",
      triggeredByName: "X",
      siteName: "Myrrh",
      simulatorAddress: true,
    });
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.idempotencyKey).toMatch(
      /^test-email\/user-abc\/\d+-[a-f0-9]{6}$/,
    );
  });

  test("operation is settings.test_email_send and context carries simulatorAddress flag", async () => {
    await sendTestEmail({
      to: "bounced@resend.dev",
      staffId: "u",
      triggeredByEmail: "a@b.c",
      triggeredByName: "A",
      siteName: "S",
      simulatorAddress: true,
    });
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.operation).toBe("settings.test_email_send");
    expect(call?.context).toEqual({
      recipient: "bounced@resend.dev",
      simulatorAddress: true,
    });
  });

  test("returns EmailResult from sendEmail untouched", async () => {
    mockSendEmail.mockResolvedValueOnce({ ok: false, reason: "disabled" });
    const r = await sendTestEmail({
      to: "x@y.com",
      staffId: "u",
      triggeredByEmail: "a@b.c",
      triggeredByName: "A",
      siteName: "S",
      simulatorAddress: false,
    });
    expect(r).toEqual({ ok: false, reason: "disabled" });
  });
});
