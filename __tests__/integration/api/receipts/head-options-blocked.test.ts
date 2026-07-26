/**
 * HEAD / OPTIONS /api/receipts/[serialNo]/pdf — method allowlist ガード (HTTP-01).
 *
 * Next.js 16 App Router は `HEAD` handler 未定義 + `GET` 定義済みの route に対し、
 * HEAD リクエストを内部的に GET へ auto-fallback する。これを放置すると
 * `HEAD /api/receipts/YYYY-NNNNNN/pdf?token=<sig>` で `claimReceiptForSingleUseTokenDownload`
 * が実行され `usedAt = now` が UPDATE され、正規顧客の後続 DL が `already_used` で 404 になる
 * (レスポンス body は捨てられるが DB 副作用が残る)。
 *
 * route.ts で HEAD / OPTIONS を明示的に export し 405 (Allow: GET) を返すことで
 * auto-fallback を封殺する。本テストは以下を verify する:
 *   1. HEAD が 405 + Allow: GET ヘッダを返す
 *   2. OPTIONS が 405 + Allow: GET ヘッダを返す
 *   3. どちらも `claimReceiptForSingleUseTokenDownload` (= usedAt UPDATE) を呼ばない
 *   4. どちらも `renderReceiptPdf` を呼ばない
 *   5. どちらも `findReceiptForDownload` (DB read) すら呼ばない
 *
 * 実 Postgres は使わず mock.module ベースで route の応答と副作用の非発生を検証する
 * (`receipt-download-blocked.test.ts` と同じスタイル、SERIAL_DB_TESTS への登録は不要)。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const SERIAL_NO = "2026-000042";

describe("HEAD/OPTIONS /api/receipts/[serialNo]/pdf — 405 method allowlist", () => {
  const claimSpy = mock(() =>
    Promise.resolve({ status: "success" as const, pdfBuffer: Buffer.from("") }),
  );
  const findSpy = mock(() => Promise.resolve(null));
  const renderSpy = mock(() => Promise.resolve(Buffer.from("PDF")));

  beforeEach(() => {
    mock.restore();
    claimSpy.mockClear();
    findSpy.mockClear();
    renderSpy.mockClear();

    // 全 downstream を spy 化して「HEAD/OPTIONS が触っていない」ことを確認できる
    // 状態にする。route.ts の import 順に対応 (欠落すると undefined 参照で fail)。
    mock.module("@/shared/domain/receipts/download", () => ({
      claimReceiptForSingleUseTokenDownload: claimSpy,
    }));
    mock.module("@/shared/domain/receipts/queries", () => ({
      findReceiptForDownload: findSpy,
    }));
    mock.module("@/shared/pdf/render-receipt-pdf", () => ({
      renderReceiptPdf: renderSpy,
    }));
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
    // route が guest-token-gates を import するため、欠落 mock だと
    // terms-consent-gate → errors/server の safeFetch re-export 解決で落ちる。
    mock.module("@/shared/domain/customers/guest-token-gates", () => ({
      assertGuestTokenCustomerGates: mock(() => Promise.resolve()),
    }));
    mock.module("@/shared/lib/receipt-download-token", () => ({
      verifyReceiptDownloadToken: mock(() => ({ valid: false })),
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
      safeFetch: mock(() => Promise.resolve(null)),
      criticalFetch: mock(() => Promise.resolve(null)),
    }));
  });

  test("HEAD returns 405 with Allow: GET and does not touch DB / render / claim", async () => {
    const { HEAD } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await HEAD();

    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
    // 副作用ゼロ = usedAt が消費されない (HTTP-01 の本命 assert)
    expect(claimSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(findSpy).not.toHaveBeenCalled();
  });

  test("OPTIONS returns 405 with Allow: GET and does not touch DB / render / claim", async () => {
    const { OPTIONS } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await OPTIONS();

    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
    expect(claimSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(findSpy).not.toHaveBeenCalled();
  });

  test("HEAD response body is empty (spec-conformant)", async () => {
    const { HEAD } = await import("@/app/api/receipts/[serialNo]/pdf/route");
    const res = await HEAD();

    // HTTP RFC 9110 §9.3.2: HEAD レスポンスに body があってはいけない。
    // `new Response(null, ...)` を使っている前提の validation。
    const text = await res.text();
    expect(text).toBe("");
  });

  test("HEAD/OPTIONS ignore query string (?token=...) — no auto-fallback", async () => {
    // 「?token=<sig>」を付けても HEAD/OPTIONS で 405 を返し続けることを担保。
    // これが 200 になったら auto-fallback が復活している = HTTP-01 の regression。
    const { HEAD, OPTIONS } =
      await import("@/app/api/receipts/[serialNo]/pdf/route");

    // HEAD / OPTIONS は Request 引数を受け取らない設計なので、URL 差異は
    // 挙動に影響してはならない (invariant として複数回呼び出しても常に 405)。
    const head1 = await HEAD();
    const head2 = await HEAD();
    const opt1 = await OPTIONS();

    expect(head1.status).toBe(405);
    expect(head2.status).toBe(405);
    expect(opt1.status).toBe(405);
    expect(claimSpy).not.toHaveBeenCalled();

    // 未使用: serialNo は本 test では handler へ渡さない (HEAD/OPTIONS は
    // params を受け取らないため)。参照だけ残して lint 対策とする。
    void SERIAL_NO;
  });
});
