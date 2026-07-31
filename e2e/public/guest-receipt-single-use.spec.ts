import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

/**
 * ゲスト経由の領収書 PDF ダウンロード - single-use 強制 E2E (E2E-03)
 *
 * ## 対象
 * `POST /api/receipts/[serialNo]/pdf` (public / 未認証、body に token)
 * = RECEIPT-USEDAT-P1 (PR #1211) が追加した `Receipt.usedAt` 刻印 +
 * advisory-lock tx の regression gate。
 *
 * ## HTTP-02 経路変更 (2026-07)
 * 旧: `GET /api/receipts/[serialNo]/pdf?token=<sig>` 直リンクをメールから叩く。
 * 新: `/receipts/[serialNo]/download?token=<sig>` confirm page 経由で、
 *     ユーザーが POST フォームを submit した時点で claim が発生する。
 * 変更理由: link scanner (Outlook SafeLinks / Gmail preview 等) が GET プリフェッチで
 * `usedAt` を消費してしまう fail mode を根治するため、GET は session 経路 (mypage) 専用に
 * 縮小し、token 経路の claim を POST に切り分けた。
 *
 * ## シナリオ
 * 1. fixture スクリプト経由でゲスト予約 (Customer.userId=null) + PAID + Receipt
 *    (usedAt=NULL) + 有効な download token を作成する
 * 2. 1 回目 POST → 200 + Content-Type: application/pdf + 非空 body
 *    (`claimReceiptForSingleUseTokenDownload` が render + usedAt 刻印を atomically 実行)
 * 3. 2 回目 POST (同一トークン) → 404
 *    (usedAt !== null のため single-use gate が hit)
 * 4. 追加: GET (token query 付き) → 404 (session なしの GET は必ず 404、
 *    link scanner の GET プリフェッチが usedAt を消費しないことを保証)
 *
 * ## Better Auth session 経路について
 * `route.ts` の docstring 通り、session 経路 (mypage GET) は本 gate を通らず無制限
 * DL 可能 (mypage で会員が自分の領収書を反復 DL する要件)。同経路のテストは
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
 *
 * ## rate limit バケットの隔離
 * route handler の per-serialNo limiter (10/hour) は上記のとおり毎回新しい
 * serialNo になるので当たらない。当たるのは **proxy.ts の apiRateLimiter
 * (100/分/IP)** のほう — `chromium` project は public spec + a11y spec が
 * 2 worker から同一 IP で /api を叩き続けるため、飽和した窓に入った request が
 * 429 を受ける (CI run 30593381788 で 1 回目 POST が 566ms で 429)。
 * `e2e/helpers/admin-auth.ts` の `primeAdminRequestContext` と同型に、この spec
 * 専用の client IP を割り当ててバケットを隔離する。XFF が client IP として
 * 採用されるのは loopback host のときだけ (`rate-limit.ts` の
 * `canUseDevelopmentProxyFallback`)。
 *
 * 動的割当 (`203.0.113.10`〜`.250`) と衝突しない固定値を使う。
 */

const execFileAsync = promisify(execFile);

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.5" } });

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

test.describe("領収書 PDF ダウンロード - ゲスト token 経路 single-use 強制 (POST)", () => {
  test("1 回目 POST は 200 + PDF、2 回目は 404 (usedAt gate)", async ({
    request,
  }) => {
    const fixture = await createReceiptDownloadFixture();
    const apiUrl = `/api/receipts/${fixture.serialNo}/pdf`;

    // ==============================
    // 1 回目 POST: 200 + application/pdf
    // ==============================
    const first = await request.post(apiUrl, {
      form: { token: fixture.token },
    });
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
    // 2 回目 POST: 404 (single-use gate)
    // ==============================
    // 同一トークンでの再取得は `claimReceiptForSingleUseTokenDownload` の
    // 「usedAt IS NULL」check で hit し、302/500 ではなく 404 が返る
    // (存在自体を隠蔽する brute-force 対策)。
    const second = await request.post(apiUrl, {
      form: { token: fixture.token },
    });
    expect(second.status()).toBe(404);
  });

  test("不正な token では 404 (existence 隠蔽)", async ({ request }) => {
    const fixture = await createReceiptDownloadFixture();

    // 実在する serialNo + 壊れた token → route handler は 404 を返す。
    // (verifyReceiptDownloadToken が invalid)。
    const response = await request.post(
      `/api/receipts/${fixture.serialNo}/pdf`,
      { form: { token: "not-a-valid-token" } },
    );
    expect(response.status()).toBe(404);
  });

  test("HTTP-02: GET with token は 404 で usedAt を消費しない (link scanner defense)", async ({
    request,
  }) => {
    const fixture = await createReceiptDownloadFixture();

    // link scanner (Outlook SafeLinks / Gmail preview 等) を模擬:
    // GET method で token を投げても Route Handler は session なしと判断し 404 を返し、
    // 一切 usedAt に触れない。POST に移行した実 claim エンドポイントの正当性の gate。
    const scannerGet = await request.get(
      `/api/receipts/${fixture.serialNo}/pdf?token=${encodeURIComponent(fixture.token)}`,
    );
    expect(scannerGet.status()).toBe(404);

    // 続く正規の POST は成功 (link scanner の GET が usedAt を汚染していないため)
    const legitPost = await request.post(
      `/api/receipts/${fixture.serialNo}/pdf`,
      { form: { token: fixture.token } },
    );
    expect(legitPost.status()).toBe(200);
    expect(legitPost.headers()["content-type"]).toBe("application/pdf");
  });
});
