import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import {
  customerReservationTargets,
  openCustomerReservationDetail,
} from "./reservation-test-helpers";

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

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLink.click(),
    ]);

    expect(download.suggestedFilename()).toBe(
      `receipt-${fixture.serialNo}.pdf`,
    );
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    if (stream === null) {
      throw new Error("download stream missing");
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
  });
});
