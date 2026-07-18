import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

/**
 * ゲスト署名 URL 経由の領収書 PDF ダウンロード - single-use 強制 E2E (E2E-03)
 *
 * ## 対象
 * `GET /api/receipts/[serialNo]/pdf?token=<signed>` (public / 未認証)
 * = RECEIPT-USEDAT-P1 (PR #1211) が追加した `Receipt.usedAt` 刻印 +
 * advisory-lock tx の regression gate。
 *
 * ## シナリオ
 * 1. fixture スクリプト経由でゲスト予約 (Customer.userId=null) + PAID + Receipt
 *    (usedAt=NULL) + 有効な download token を作成する
 * 2. 1 回目 GET → 200 + Content-Type: application/pdf + 非空 body
 *    (`claimReceiptForSingleUseTokenDownload` が render + usedAt 刻印を atomically 実行)
 * 3. 2 回目 GET (同一トークン) → 404
 *    (usedAt !== null のため single-use gate が hit)
 *
 * ## Better Auth session 経路について
 * `route.ts` の docstring 通り、session 経路は本 gate を通らず無制限 DL 可能
 * (mypage で会員が自分の領収書を反復 DL する要件)。同経路のテストは
 * `chromium-customer` project に置く必要があり、fixture の customer.userId
 * 紐付けが必要になるため、本 spec は E2E-03 の core 目的 = single-use gate の
 * regression 検出 に集中する (session bypass は unit test で担保、
 * `__tests__/unit/shared/lib/receipt-download-token.test.ts` + route handler
 * unit テスト参照)。
 *
 * ## fixture 独立性
 * fixture スクリプトは serialNo を `2099-XXXXXX` のランダム 6 桁で発行する
 * (運用採番の `<現行年>-XXXXXX` と絶対衝突しない範囲)。ReceiptSequence には
 * 触れないため、他 spec / 並列 worker と競合しない。
 */

const execFileAsync = promisify(execFile);

interface ReceiptDownloadFixture {
  readonly reservationId: string;
  readonly receiptId: string;
  readonly serialNo: string;
  readonly token: string;
}

async function createReceiptDownloadFixture(): Promise<ReceiptDownloadFixture> {
  const workspaceRoot = path.join(__dirname, "..", "..");
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-receipt-download-fixture.ts",
  );

  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });

  return JSON.parse(stdout.trim()) as ReceiptDownloadFixture;
}

test.describe("領収書 PDF ダウンロード - ゲスト token 経路 single-use 強制", () => {
  test("1 回目 GET は 200 + PDF、2 回目は 404 (usedAt gate)", async ({
    request,
  }) => {
    const fixture = await createReceiptDownloadFixture();

    const url = `/api/receipts/${fixture.serialNo}/pdf?token=${encodeURIComponent(
      fixture.token,
    )}`;

    // ==============================
    // 1 回目: 200 + application/pdf
    // ==============================
    const first = await request.get(url);
    expect(first.status()).toBe(200);
    expect(first.headers()["content-type"]).toBe("application/pdf");
    expect(first.headers()["content-disposition"]).toContain(
      `filename=receipt-${fixture.serialNo}.pdf`,
    );
    // Cache-Control は Route Handler 側で "private, no-store" を emit するが、
    // next.config.ts の headers() が /api を "private, no-store" で上書きするため
    // (caching ルール "precedence: proxy.ts > next.config > Route Handler")、
    // 結果として同値が返る。ここでは private であることだけ緩く確認する。
    expect(first.headers()["cache-control"]).toContain("private");

    const buffer = await first.body();
    expect(buffer.byteLength).toBeGreaterThan(0);
    // PDF magic bytes: `%PDF-`
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");

    // ==============================
    // 2 回目: 404 (single-use gate)
    // ==============================
    // 同一トークンでの再取得は `claimReceiptForSingleUseTokenDownload` の
    // 「usedAt IS NULL」check で hit し、302/500 ではなく 404 が返る
    // (存在自体を隠蔽する brute-force 対策)。
    const second = await request.get(url);
    expect(second.status()).toBe(404);
  });

  test("不正な token では 404 (existence 隠蔽)", async ({ request }) => {
    const fixture = await createReceiptDownloadFixture();

    // 実在する serialNo + 壊れた token → route handler は 404 を返す。
    // (verifyReceiptDownloadToken が invalid、かつ session なしで
    // sessionAuthorized=false のため fall-through)。
    const response = await request.get(
      `/api/receipts/${fixture.serialNo}/pdf?token=not-a-valid-token`,
    );
    expect(response.status()).toBe(404);
  });
});
