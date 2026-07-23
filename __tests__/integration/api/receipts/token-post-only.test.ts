/**
 * HTTP-02: GET /api/receipts/[serialNo]/pdf is session-only.
 * POST /api/receipts/[serialNo]/pdf carries the token claim.
 *
 * Regression test for the link-scanner defense: link scanners
 * (Outlook SafeLinks / Gmail preview / Slack unfurl / iMessage / Discord embed)
 * fire GET requests. If the GET path claimed usedAt, they would burn the
 * single-use token before the guest clicks. This spec pins the following:
 *
 * 1. GET without a session → 404 (no token path exists on GET anymore).
 * 2. GET with a token query param → 404 (token is ignored on GET).
 * 3. POST with a valid token (form body) → 200 + application/pdf.
 * 4. POST with a mismatched serialNo → 404 (defense-in-depth on route param).
 * 5. POST with an invalid token → 404 (existence hidden).
 * 6. POST without a token → 404.
 *
 * Uses mock.module (no real Postgres) — the single-use gate itself is covered by
 * `__tests__/integration/domain/receipts/single-use-download.test.ts` (real DB)
 * and the E2E `e2e/public/guest-receipt-single-use.spec.ts`.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const SERIAL_NO = "2026-000123";
const CUSTOMER_ID = "cust-post-only-1";

const RECEIPT = {
  id: "receipt-post-only-1",
  serialNo: SERIAL_NO,
  recipientName: "山田 太郎",
  subject: "スペース利用料として",
  amount: 1100,
  taxAmount: 100,
  taxRate: 10,
  issuedAt: new Date("2026-06-01T10:00:00+09:00"),
  issuerSnapshot: {},
  reservation: { customerId: CUSTOMER_ID },
  eventRegistration: null,
};

function makeParams(serialNo: string = SERIAL_NO): {
  params: Promise<{ serialNo: string }>;
} {
  return { params: Promise.resolve({ serialNo }) };
}

function makeGetRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

function makePostRequest(body: FormData): Request {
  return new Request(`http://localhost/api/receipts/${SERIAL_NO}/pdf`, {
    method: "POST",
    body,
  });
}

describe("Route Handler contract: GET is session-only, POST carries token claim", () => {
  beforeEach(() => {
    mock.restore();

    // HTTP-03: per-serialNo rate limiter は GET/POST 両方の冒頭で叩かれる。
    // 全 test が同一 SERIAL_NO を共有するため、実 limiter のままだと本ファイル内の
    // 累積呼び出しで 429 化しうる (receipt-download-blocked.test.ts と同じ stub 方針)。
    mock.module("@/shared/lib/rate-limit", () => ({
      receiptDownloadBySerialNoRateLimiter: {
        check: mock(() => Promise.resolve({ success: true })),
      },
    }));

    mock.module("@/shared/domain/receipts/queries", () => ({
      findReceiptForDownload: mock(() => Promise.resolve(RECEIPT)),
    }));

    mock.module("@/shared/lib/errors/server", () => ({
      ErrorCategory: {
        AUTHORIZATION: "AUTHORIZATION",
        DATABASE: "DATABASE",
        EXTERNAL_API: "EXTERNAL_API",
      },
      ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
      logError: mock(() => undefined),
      normalizeError: (error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
    }));

    // audit-log は fireAndForget で呼ばれるため no-op mock
    mock.module("@/shared/domain/audit-log/commands", () => ({
      createAuditLogRecord: mock(() => Promise.resolve()),
    }));
    mock.module("@/shared/lib/audit-request-context", () => ({
      buildAuditRequestContext: mock(() =>
        Promise.resolve({ ip: null, userAgent: null }),
      ),
    }));
    mock.module("@/shared/lib/async-utils", () => ({
      fireAndForget: mock(() => undefined),
    }));

    // customer-auth / customers modules: default no session (GET は 404 になる)
    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() => Promise.resolve(null)),
    }));
    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() => Promise.resolve(null)),
    }));
    mock.module("@/shared/domain/customers/guard", () => ({
      assertCustomerActive: mock(() => Promise.resolve()),
      ensureCustomerNotBlacklisted: mock(() => Promise.resolve()),
    }));
  });

  test("GET without session returns 404 (no session, no token path)", async () => {
    const claimSpy = mock(() =>
      Promise.resolve({
        status: "success" as const,
        pdfBuffer: Buffer.from("PDF"),
      }),
    );
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));
    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF"))),
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({
        valid: true,
        serialNo: SERIAL_NO,
      })),
    }));

    const { GET } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await GET(
      makeGetRequest(`http://localhost/api/receipts/${SERIAL_NO}/pdf`),
      makeParams(),
    );

    expect(res.status).toBe(404);
    // Critical: GET must NEVER trigger single-use claim (link scanner defense)
    expect(claimSpy).not.toHaveBeenCalled();
  });

  test("GET with token query param still returns 404 (token is ignored on GET)", async () => {
    // Even if a link scanner tries `?token=<valid>` on GET, the Route Handler
    // ignores it entirely — GET only accepts Better Auth session. This is the
    // HTTP-02 core contract: the token path can never burn usedAt via GET.
    const claimSpy = mock(() =>
      Promise.resolve({
        status: "success" as const,
        pdfBuffer: Buffer.from("PDF"),
      }),
    );
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));
    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF"))),
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({
        valid: true,
        serialNo: SERIAL_NO,
      })),
    }));

    const { GET } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await GET(
      makeGetRequest(
        `http://localhost/api/receipts/${SERIAL_NO}/pdf?token=looks-valid`,
      ),
      makeParams(),
    );

    expect(res.status).toBe(404);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  test("POST with valid token in form body returns 200 + PDF and claims once", async () => {
    const claimSpy = mock(() =>
      Promise.resolve({
        status: "success" as const,
        pdfBuffer: Buffer.from("%PDF-1.4\n"),
      }),
    );
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));
    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF"))),
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({
        valid: true,
        serialNo: SERIAL_NO,
      })),
    }));

    const { POST } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const body = new FormData();
    body.set("token", "signed-token-value");
    const res = await POST(makePostRequest(body), makeParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(
      `filename=receipt-${SERIAL_NO}.pdf`,
    );
    expect(claimSpy).toHaveBeenCalledTimes(1);
  });

  test("POST with mismatched serialNo (token has different SN) returns 404", async () => {
    // defense-in-depth: token payload の SN と URL の SN が食い違うケースを 404 に閉じる。
    const claimSpy = mock(() =>
      Promise.resolve({
        status: "success" as const,
        pdfBuffer: Buffer.from("PDF"),
      }),
    );
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));
    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF"))),
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({
        valid: true,
        serialNo: "2026-999999",
      })),
    }));

    const { POST } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const body = new FormData();
    body.set("token", "signed-token-value");
    const res = await POST(makePostRequest(body), makeParams());

    expect(res.status).toBe(404);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  test("POST with invalid token returns 404 (existence hidden)", async () => {
    const claimSpy = mock(() =>
      Promise.resolve({
        status: "success" as const,
        pdfBuffer: Buffer.from("PDF"),
      }),
    );
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));
    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF"))),
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({ valid: false })),
    }));

    const { POST } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const body = new FormData();
    body.set("token", "tampered-token");
    const res = await POST(makePostRequest(body), makeParams());

    expect(res.status).toBe(404);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  test("POST without a token in the body returns 404", async () => {
    const claimSpy = mock(() =>
      Promise.resolve({
        status: "success" as const,
        pdfBuffer: Buffer.from("PDF"),
      }),
    );
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));
    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF"))),
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({
        valid: true,
        serialNo: SERIAL_NO,
      })),
    }));

    const { POST } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    // Empty FormData → no token key
    const res = await POST(makePostRequest(new FormData()), makeParams());

    expect(res.status).toBe(404);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  test("POST returns 404 when single-use gate reports already_used", async () => {
    const claimSpy = mock(() =>
      Promise.resolve({ status: "already_used" as const }),
    );
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));
    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF"))),
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({
        valid: true,
        serialNo: SERIAL_NO,
      })),
    }));

    const { POST } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const body = new FormData();
    body.set("token", "signed-token-value");
    const res = await POST(makePostRequest(body), makeParams());

    expect(res.status).toBe(404);
    expect(claimSpy).toHaveBeenCalledTimes(1);
  });

  test("HTTP-03: POST returns 429 when the per-serialNo rate limit is exceeded, after token verification but before DB/claim", async () => {
    // GET 経路と同じ receiptDownloadBySerialNoRateLimiter を POST でも叩く契約の
    // 回帰テスト。rate limit は token 検証より後・DB read/claim より前に置く
    // (Codex #1426 指摘: token 未検証のまま rate limit を先にすると、token を
    // 持たない第三者が serialNo を推測して連投するだけで shared bucket を枯渇させ
    // 正規ユーザーを締め出せてしまう)。
    mock.module("@/shared/lib/rate-limit", () => ({
      receiptDownloadBySerialNoRateLimiter: {
        check: mock(() => Promise.resolve({ success: false })),
      },
    }));

    const verifySpy = mock(() => ({ valid: true, serialNo: SERIAL_NO }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: verifySpy,
    }));
    const claimSpy = mock(() =>
      Promise.resolve({
        status: "success" as const,
        pdfBuffer: Buffer.from("PDF"),
      }),
    );
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));

    const { POST } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const body = new FormData();
    body.set("token", "signed-token-value");
    const res = await POST(makePostRequest(body), makeParams());

    expect(res.status).toBe(429);
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  test("HTTP-03: an invalid token never consumes the shared per-serialNo bucket", async () => {
    // 未検証の garbage token 連投で shared bucket が枯渇しないことの直接検証。
    // rate limiter 自体は success:true のままだが、token 検証失敗時に limiter が
    // 一度も呼ばれないことを確認する (呼ばれていれば brute-force 経路が残っている)。
    const rateLimitCheckSpy = mock(() => Promise.resolve({ success: true }));
    mock.module("@/shared/lib/rate-limit", () => ({
      receiptDownloadBySerialNoRateLimiter: { check: rateLimitCheckSpy },
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({ valid: false })),
    }));

    const { POST } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const body = new FormData();
    body.set("token", "garbage");
    const res = await POST(makePostRequest(body), makeParams());

    expect(res.status).toBe(404);
    expect(rateLimitCheckSpy).not.toHaveBeenCalled();
  });
});
