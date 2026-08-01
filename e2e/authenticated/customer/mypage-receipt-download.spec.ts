import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import {
  customerReservationTargets,
  openCustomerReservationDetail,
} from "./reservation-test-helpers";

// `<a download href="/api/receipts/...">` のクリックでブラウザが /api を叩くため、
// proxy の `apiRateLimiter`（100/分/IP）の共有バケットに乗る。飽和すると 429 が返り、
// ダウンロードが canceled になる（成功時 12s に対し失敗時 2s で終わるのが徴候。
// 同 run 30607885778 で同 project の calendar-download が明示的に 429 で落ちていた）。
// 割当表は `.claude/rules/testing-e2e.md`。
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.4" } });

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

    // ダウンロード応答は **trace に残らない**（Playwright の仕様）。「canceled」の
    // 一行だけでは 429 なのか 500 なのか分からず、実際そこで 2 度推測が入った。
    // ステータスを spec 側で拾って失敗メッセージに載せる。
    const receiptResponses: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/receipts/")) {
        receiptResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    const downloadLink = page.getByRole("link", {
      name: "領収書をダウンロード",
    });
    await expect(downloadLink).toBeVisible({ timeout: 10000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLink.click(),
    ]);

    expect(download.suggestedFilename()).toBe(
      `receipt-${fixture.serialNo}.pdf`,
    );

    // **失敗理由を先に確定させる。** `failure()` はダウンロード完了まで待ってから
    // 理由を返す公式 API（`path()` も待つが、`createReadStream()` は待たず、
    // 失敗/中断済みなら「canceled」とだけ throw する）。
    //
    // 旧実装は `createReadStream()` を直に呼んでいたため、落ちても
    // `download.createReadStream: canceled` の一行しか残らなかった。Playwright の
    // trace はダウンロード応答を記録しないので、CI アーティファクトからも
    // ステータスを追えず、原因を**推測**するしかない状態が続いていた
    // （429 と見て専用 client IP を割り当てたのが上の test.use。それでも
    // run 30685242600 まで再発している = 429 だけが原因ではない）。
    // 理由を assertion のメッセージに載せて、次に落ちたときは推測を挟まず読める形にする。
    expect(
      await download.failure(),
      `領収書 PDF のダウンロードが失敗した。受領書 API の応答: ${
        receiptResponses.length > 0
          ? receiptResponses.join(" / ")
          : "(記録なし)"
      }`,
    ).toBeNull();

    // 完了を保証してから読む（公式テストと同じ `path()` → 読み取りの順序）。
    const filePath = await download.path();
    const data = await readFile(filePath);

    expect(data.length).toBeGreaterThan(0);
    // 長さだけだと「空でない何か」で通ってしまう。PDF の magic byte まで見る。
    expect(data.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
