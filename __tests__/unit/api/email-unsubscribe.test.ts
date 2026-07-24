import { beforeEach, describe, expect, mock, test } from "bun:test";

type OptOutFn = (customerId: string) => Promise<{ previous: boolean } | null>;

let optOutImpl: OptOutFn = async () => ({ previous: true });
const mockOptOut = mock<OptOutFn>((customerId) => optOutImpl(customerId));

let verifyImpl: (token: string) => { customerId: string } | null = () => ({
  customerId: "cust-1",
});
const mockVerify = mock<(token: string) => { customerId: string } | null>(
  (token) => verifyImpl(token),
);

mock.module("@/shared/domain/customers/commands", () => ({
  optOutCustomerMarketingById: mockOptOut,
}));

mock.module("@/shared/lib/tokens/marketing-unsubscribe-token", () => ({
  verifyMarketingUnsubscribeToken: mockVerify,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: () => undefined,
}));

const { GET, POST } = await import("@/app/api/email/unsubscribe/route");

describe("POST|GET /api/email/unsubscribe", () => {
  beforeEach(() => {
    mockOptOut.mockClear();
    mockVerify.mockClear();
    optOutImpl = async () => ({ previous: true });
    verifyImpl = () => ({ customerId: "cust-1" });
  });

  test("POST: 有効トークンで opt-out し 200 空応答", async () => {
    const response = await POST(
      new Request(
        "https://example.com/api/email/unsubscribe?token=valid-token",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(mockVerify).toHaveBeenCalledWith("valid-token");
    expect(mockOptOut).toHaveBeenCalledWith("cust-1");
  });

  test("POST: 無効トークンでも 200（再送ループ / enumeration 防止）", async () => {
    verifyImpl = () => null;
    const response = await POST(
      new Request("https://example.com/api/email/unsubscribe?token=bad", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    expect(mockOptOut).not.toHaveBeenCalled();
  });

  test("GET: 有効トークンで確認 HTML を返す", async () => {
    const response = await GET(
      new Request(
        "https://example.com/api/email/unsubscribe?token=valid-token",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("お知らせメールの配信を停止しました");
    expect(mockOptOut).toHaveBeenCalledWith("cust-1");
  });

  test("GET: 無効トークンは無効リンク文言の HTML", async () => {
    verifyImpl = () => null;
    const response = await GET(
      new Request("https://example.com/api/email/unsubscribe?token=bad"),
    );
    const html = await response.text();
    expect(html).toContain("リンクが無効か有効期限が切れています");
    expect(mockOptOut).not.toHaveBeenCalled();
  });
});
