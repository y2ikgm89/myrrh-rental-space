/**
 * GET /api/receipts/[serialNo]/pdf — session 経路の active/BLACKLIST ガード (CRITIC-2) と
 * AuditLog READ 発火 (OBS-01/AUTHZ-03).
 *
 * MypageAuthGate は UI 層で BLACKLIST / isActive:false 顧客を弾くが、この Route Handler
 * は並行して露出しているため単独で防御する必要がある。session cookie + ownership が
 * 成立しても Customer.isActive === false or status === BLACKLIST なら 403 を返し、
 * 領収書 (適格請求書 = 課税事業者情報を含む文書) の DL を封鎖することを確認する。
 *
 * 加えて (OBS-01/AUTHZ-03、fix/receipt-audit-log-coverage): session 経路でも DL 成功時に
 * AuditLog READ が append されることを検証する (session hijack 検知 / 退会後の履歴保全 /
 * 訂正時 DL 監査を hash chain 保護された証跡として残すため)。
 *
 * ## HTTP-02 (2026-07) 以降の経路分割
 * GET は Better Auth session 専用に変更 (token 経路の GET は削除、POST に移動)。
 * 本テストは session 経路 (mypage) の active/BLACKLIST ガードを検証する。
 * token 経路のテストは `token-post-only.test.ts` を参照。
 *
 * 実 Postgres は使わず mock.module ベースで route の応答を verify する
 * (`calendar-reservation.test.ts` と同じスタイル)。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const SERIAL_NO = "2026-000001";
const CUSTOMER_ID = "cust-blocked-1";
const USER_ID = "user-blocked-1";

const OWNED_RECEIPT = {
  id: "receipt-1",
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

function makeRequest(): Request {
  return new Request(`http://localhost/api/receipts/${SERIAL_NO}/pdf`);
}

function makeParams(): { params: Promise<{ serialNo: string }> } {
  return { params: Promise.resolve({ serialNo: SERIAL_NO }) };
}

// OBS-01/AUTHZ-03: session 経路 DL 成功時に発火する AuditLog READ を追跡する mock。
// createAuditLogRecord は fireAndForget 経由 (promise は即実行、await はされない) で
// 呼ばれるため mock 呼出は同期的に count 増加する。テスト内で `.mock.calls` を assert。
const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

// buildAuditRequestContext は headers() 依存 (server-only) のため unit test では stub。
const mockBuildAuditRequestContext = mock(() =>
  Promise.resolve({ ip: "127.0.0.1", userAgent: "test-user-agent" }),
);

describe("GET /api/receipts/[serialNo]/pdf — session active/BLACKLIST guard", () => {
  beforeEach(() => {
    mock.restore();

    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
    mockBuildAuditRequestContext.mockReset();
    mockBuildAuditRequestContext.mockImplementation(() =>
      Promise.resolve({ ip: "127.0.0.1", userAgent: "test-user-agent" }),
    );

    // HTTP-03: per-serialNo rate limiter が session 経路 GET 冒頭で叩かれる。
    // check() は默认で success=true を返す stub にしておく (429 発火は別 test)。
    mock.module("@/shared/lib/rate-limit", () => ({
      receiptDownloadBySerialNoRateLimiter: {
        check: mock(() => Promise.resolve({ success: true })),
      },
    }));

    mock.module("@/shared/domain/receipts/queries", () => ({
      findReceiptForDownload: mock(() => Promise.resolve(OWNED_RECEIPT)),
    }));

    mock.module("@/shared/lib/customer-auth", () => ({
      getCustomerSession: mock(() =>
        Promise.resolve({ user: { id: USER_ID } }),
      ),
    }));

    mock.module("@/shared/domain/customers/queries", () => ({
      getCustomerByUserId: mock(() =>
        Promise.resolve({ id: CUSTOMER_ID, userId: USER_ID }),
      ),
    }));

    // OBS-01/AUTHZ-03: session 経路 DL の AuditLog READ 発火追跡。
    mock.module("@/shared/domain/audit-log/commands", () => ({
      createAuditLogRecord: (input: Record<string, unknown>) =>
        mockCreateAuditLogRecord(input),
    }));

    mock.module("@/shared/lib/audit-request-context", () => ({
      buildAuditRequestContext: () => mockBuildAuditRequestContext(),
    }));

    mock.module("@/shared/lib/errors/server", () => ({
      ErrorCategory: {
        AUTHORIZATION: "AUTHORIZATION",
        DATABASE: "DATABASE",
        EXTERNAL_API: "EXTERNAL_API",
        UNKNOWN: "UNKNOWN",
      },
      ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
      logError: mock(() => undefined),
      normalizeError: (error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
    }));
  });

  test("returns 403 when session customer is inactive (assertCustomerActive throws FORBIDDEN)", async () => {
    const { DomainError } = await import("@/shared/domain/domain-error");
    const renderSpy = mock(() => Promise.resolve(Buffer.from("PDF")));

    mock.module("@/shared/domain/customers/guard", () => ({
      assertCustomerActive: mock(() =>
        Promise.reject(
          new DomainError(
            "このアカウントは現在ご利用いただけません。",
            "FORBIDDEN",
          ),
        ),
      ),
      ensureCustomerNotBlacklisted: mock(() => Promise.resolve()),
    }));

    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: renderSpy,
    }));

    const { GET } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(403);
    // 403 で早期 return しているため PDF 生成は呼ばれない
    expect(renderSpy).not.toHaveBeenCalled();
  });

  test("returns 403 when session customer is BLACKLISTED (assertCustomerActive throws FORBIDDEN)", async () => {
    const { DomainError } = await import("@/shared/domain/domain-error");
    const renderSpy = mock(() => Promise.resolve(Buffer.from("PDF")));

    mock.module("@/shared/domain/customers/guard", () => ({
      assertCustomerActive: mock(() =>
        Promise.reject(
          new DomainError(
            "このアカウントは現在ご利用いただけません。",
            "FORBIDDEN",
          ),
        ),
      ),
      ensureCustomerNotBlacklisted: mock(() => Promise.resolve()),
    }));

    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: renderSpy,
    }));

    const { GET } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(403);
    expect(renderSpy).not.toHaveBeenCalled();
  });

  test("returns 200 PDF when session customer is active (assertCustomerActive resolves)", async () => {
    mock.module("@/shared/domain/customers/guard", () => ({
      assertCustomerActive: mock(() => Promise.resolve()),
      ensureCustomerNotBlacklisted: mock(() => Promise.resolve()),
    }));

    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF-BYTES"))),
    }));

    const { GET } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("returns 404 when session customer is NOT_FOUND (TOCTOU) — existence hidden", async () => {
    const { DomainError } = await import("@/shared/domain/domain-error");
    const renderSpy = mock(() => Promise.resolve(Buffer.from("PDF")));

    mock.module("@/shared/domain/customers/guard", () => ({
      assertCustomerActive: mock(() =>
        Promise.reject(
          new DomainError("顧客情報が見つかりません", "NOT_FOUND"),
        ),
      ),
      ensureCustomerNotBlacklisted: mock(() => Promise.resolve()),
    }));

    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: renderSpy,
    }));

    const { GET } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await GET(makeRequest(), makeParams());

    // NOT_FOUND (customer が消えた) は下段の 404 (存在隠蔽) に落ちる
    expect(res.status).toBe(404);
    expect(renderSpy).not.toHaveBeenCalled();
  });

  test("session 経路 DL 成功時に AuditLog READ が append される (OBS-01/AUTHZ-03)", async () => {
    mock.module("@/shared/domain/customers/guard", () => ({
      assertCustomerActive: mock(() => Promise.resolve()),
      ensureCustomerNotBlacklisted: mock(() => Promise.resolve()),
    }));

    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF-BYTES"))),
    }));

    const { GET } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await GET(makeRequest(), makeParams());

    // 200 応答 (session 経路成功) の直後に AuditLog READ が fire-and-forget で発火する。
    // fireAndForget は同期的に mock.calls を増やすため await 不要。
    expect(res.status).toBe(200);

    // READ action で receipt を resource, userId は session の user.id、
    // ownerCustomerId は session customer.id、path は "session" を metadata に持つ。
    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const callArg = mockCreateAuditLogRecord.mock.calls[0]?.[0] as {
      action: string;
      resource: string;
      resourceId: string;
      userId: string;
      metadata: {
        path: string;
        serialNo: string;
        ownerCustomerId: string;
        ip?: string;
        userAgent?: string;
      };
    };
    expect(callArg.action).toBe("READ");
    expect(callArg.resource).toBe("receipt");
    expect(callArg.resourceId).toBe(OWNED_RECEIPT.id);
    expect(callArg.userId).toBe(USER_ID);
    expect(callArg.metadata.path).toBe("session");
    expect(callArg.metadata.serialNo).toBe(SERIAL_NO);
    expect(callArg.metadata.ownerCustomerId).toBe(CUSTOMER_ID);
    // buildAuditRequestContext stub の固定値が metadata へ載っている
    expect(callArg.metadata.ip).toBe("127.0.0.1");
    expect(callArg.metadata.userAgent).toBe("test-user-agent");
  });

  test("session 経路 403 (BLACKLIST) では AuditLog は発火しない", async () => {
    const { DomainError } = await import("@/shared/domain/domain-error");
    mock.module("@/shared/domain/customers/guard", () => ({
      assertCustomerActive: mock(() =>
        Promise.reject(
          new DomainError(
            "このアカウントは現在ご利用いただけません。",
            "FORBIDDEN",
          ),
        ),
      ),
      ensureCustomerNotBlacklisted: mock(() => Promise.resolve()),
    }));

    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: mock(() => Promise.resolve(Buffer.from("PDF"))),
    }));

    const { GET } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(403);
    // 403 で早期 return しているため AuditLog は書かれない (認可失敗時に監査ログを
    // 汚染しない設計 — 別途 PERMISSION_DENIED action を書くかは product judgement)。
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });
});
