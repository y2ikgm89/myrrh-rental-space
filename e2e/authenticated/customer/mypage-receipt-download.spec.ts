import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../fixtures/e2e-test";
import {
  customerReservationTargets,
  openCustomerReservationDetail,
} from "./reservation-test-helpers";

// 領収書 PDF の取得は proxy の `apiRateLimiter`（100/分/IP）に乗る。IP を共有して
// いた頃は飽和すると 429 が返っていた（同 run 30607885778 で同 project の
// calendar-download が明示的に 429 で落ちた）。client IP は
// `e2e/fixtures/e2e-test.ts` の fixture がテストごとに配る。

/**
 * マイページ — 会員 session 経由の領収書 PDF ダウンロード E2E (Phase 7 PR8)
 *
 * dev customer の COMPLETED+PAID 予約に Receipt を紐付け（fixture）、
 * 予約詳細の「領収書をダウンロード」リンクから PDF が取得できることを検証する。
 * ゲスト token 経路は `guest-receipt-single-use.spec.ts` が担当。
 */

const execFileAsync = promisify(execFile);
const workspaceRoot = path.join(__dirname, "..", "..", "..");

interface MypageReceiptFixture {
  readonly reservationId: string;
  readonly serialNo: string;
}

async function ensureMypageReceiptFixture(): Promise<MypageReceiptFixture> {
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-mypage-receipt-fixture.ts",
  );
  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as MypageReceiptFixture;
}

test.describe("マイページ — 領収書ダウンロード (session 経路)", () => {
  test("支払い済み予約詳細から領収書 PDF をダウンロードできる", async ({
    page,
  }) => {
    const fixture = await ensureMypageReceiptFixture();

    await openCustomerReservationDetail(
      page,
      customerReservationTargets.completedPaid,
    );

    await expect(page).toHaveURL(
      new RegExp(`/mypage/reservations/${fixture.reservationId}$`, "u"),
    );

    const downloadLink = page.getByRole("link", {
      name: "領収書をダウンロード",
    });
    await expect(downloadLink).toBeVisible({ timeout: 10000 });

    // ---- リンクの配線（リクエストを伴わない） ----
    // ブラウザにダウンロードさせるのはこの 2 属性なので、属性を直接見れば
    // 「クリックすれば PDF が落ちてくる」配線は request 無しで検証できる。
    const href = await downloadLink.getAttribute("href");
    expect(href).toBe(`/api/receipts/${fixture.serialNo}/pdf`);
    expect(await downloadLink.getAttribute("download")).toBe(
      `receipt-${fixture.serialNo}.pdf`,
    );
    if (href === null) throw new Error("download link href missing");

    // ---- エンドポイントの応答（リクエスト 1 回だけ） ----
    // **クリックしてダウンロードさせない。** ブラウザのダウンロードは失敗理由を
    // 「canceled」としか返さず、HTTP ステータスを取り出す手段が無い:
    // `download.failure()` はステータスを含まず、`page.on("response")` は
    // ダウンロードでは発火せず（実測 run 30688324782 で「(記録なし)」）、
    // Playwright の trace にも応答が残らない。
    //
    // 失敗後に同じ URL を叩き直す案は成立しない。この endpoint は
    // `receiptDownloadBySerialNoRateLimiter`（**10 回/時/serialNo**、GET と POST で
    // バケット共有）という可変状態を持つので、2 回目は別リクエストとして 1 消費し、
    // 元の失敗とは違うステータスを返しうる（元が枠を使い切った直後なら 429 が返り、
    // 本当の原因を rate limit と誤認する）。
    //
    // よって **リクエストは 1 回だけ**にし、その 1 回からステータスを取る。
    // `page.request` は storage state と context の extraHTTPHeaders（fixture が
    // 配った client IP）を共有するので、ブラウザが送るのと同じ条件になる。
    const response = await page.request.get(href);
    expect(
      response.status(),
      `領収書 PDF の取得に失敗した: ${response.status().toString()} ${response.statusText()} body="${(
        await response.text()
      ).slice(0, 120)}"`,
    ).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");

    const data = await response.body();
    expect(data.length).toBeGreaterThan(0);
    // 長さだけだと「空でない何か」で通ってしまう。PDF の magic byte まで見る。
    expect(data.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
