import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
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

/**
 * ダウンロードが失敗したときだけ呼ぶ診断。同じ URL を context の session で直接叩き、
 * HTTP ステータスと本文の頭を失敗メッセージに載せる。
 *
 * route handler の早期 return は 404 / 403 / 429 を短い本文で返し分けるので、
 * ステータスと本文が取れれば「セッション無し / 所有者不一致 / 顧客停止 /
 * serialNo 単位の rate limit」のどれかまで一意に絞れる。
 *
 * 再取得が 200 を返した場合はそれ自体が情報になる（恒常的な拒否ではなく
 * 一過性の競合だったことが分かる）。
 */
async function probeReceiptEndpoint(
  page: Page,
  downloadUrl: string,
): Promise<string> {
  try {
    const probe = await page.request.get(downloadUrl);
    const head = (await probe.text()).slice(0, 120);
    return `再取得 GET ${downloadUrl} → ${probe.status().toString()} ${probe.statusText()} body="${head}"`;
  } catch (error) {
    return `再取得 GET ${downloadUrl} 自体が失敗: ${String(error)}`;
  }
}

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

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLink.click(),
    ]);

    // `suggestedFilename()` は **anchor の `download` 属性**から来るので、サーバーが
    // 4xx を返していても一致する。成否の判定に使ってはいけない（残しているのは
    // リンクの配線を見るため）。
    expect(download.suggestedFilename()).toBe(
      `receipt-${fixture.serialNo}.pdf`,
    );

    // **失敗理由を先に確定させる。** `failure()` はダウンロード完了まで待ってから
    // 理由を返す公式 API（`createReadStream()` は待たず、失敗/中断済みなら
    // 「canceled」とだけ throw する）。
    const failure = await download.failure();

    // `failure()` が返すのは「canceled」だけで HTTP ステータスを含まない。
    // **`page.on("response")` でも取れない** — Playwright はダウンロードを通常の
    // ネットワークイベントに載せないため（trace に応答が残らないのと同じ理由）。
    // 実測 run 30688324782 でこの listener は「(記録なし)」しか出せなかった。
    // 唯一確実なのは同じ URL を context の session で叩き直すこと。`page.request` は
    // storage state と `test.use` の extraHTTPHeaders（上の client IP）を共有するので、
    // ブラウザのダウンロードと同じ条件で再現できる。
    // 失敗時にしか実行しないので、成功パス（PDF 生成に実測 10 秒前後かかる）は遅くならない。
    const diagnosis =
      failure === null ? "" : await probeReceiptEndpoint(page, download.url());

    expect(
      failure,
      `領収書 PDF のダウンロードが失敗した。${diagnosis}`,
    ).toBeNull();

    // 完了を保証してから読む（公式テストと同じ `path()` → 読み取りの順序）。
    const filePath = await download.path();
    const data = await readFile(filePath);

    expect(data.length).toBeGreaterThan(0);
    // 長さだけだと「空でない何か」で通ってしまう。PDF の magic byte まで見る。
    expect(data.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
