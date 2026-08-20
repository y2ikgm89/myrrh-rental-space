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

  test("POST: 確認 form（body の token）で opt-out し完了ページを返す", async () => {
    const body = new URLSearchParams({ token: "valid-token" });
    const response = await POST(
      new Request("https://example.com/api/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(await response.text()).toContain(
      "お知らせメールの配信を停止しました",
    );
    expect(mockOptOut).toHaveBeenCalledWith("cust-1");
  });

  // ここが F-40 の核心。GET に副作用があると、Outlook SafeLinks / Gmail の
  // プリフェッチ / Slack unfurl がリンクを取得しただけで顧客が opt-out される。
  // 以前このテストは `toHaveBeenCalledWith` で**その欠陥のほうを固定していた**。
  test("GET: 有効トークンでも opt-out しない（副作用ゼロ）", async () => {
    const response = await GET(
      new Request(
        "https://example.com/api/email/unsubscribe?token=valid-token",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(mockOptOut).not.toHaveBeenCalled();
  });

  test("GET: 確認ページは token を載せた POST form を返す", async () => {
    const response = await GET(
      new Request(
        "https://example.com/api/email/unsubscribe?token=valid-token",
      ),
    );
    const html = await response.text();

    expect(html).toContain('method="POST"');
    expect(html).toContain('name="token"');
    expect(html).toContain("valid-token");
    expect(html).toContain("配信を停止する");
  });

  test("GET: x-nonce があるとき <style> に nonce を付ける", async () => {
    const response = await GET(
      new Request(
        "https://example.com/api/email/unsubscribe?token=valid-token",
        { headers: { "x-nonce": "test-nonce-value" } },
      ),
    );
    const html = await response.text();

    expect(html).toContain('<style nonce="test-nonce-value">');
  });

  test("GET: 無効トークンは無効リンク文言の HTML（form を出さない）", () => {
    verifyImpl = () => null;
    const response = GET(
      new Request("https://example.com/api/email/unsubscribe?token=bad"),
    );
    return response.text().then((html) => {
      expect(html).toContain("リンクが無効か有効期限が切れています");
      expect(html).not.toContain('method="POST"');
      expect(mockOptOut).not.toHaveBeenCalled();
    });
  });
});
