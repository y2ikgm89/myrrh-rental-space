import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { spaceFixtures } from "../../e2e/fixtures/test-data";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

/**
 * E2E fixture: ゲスト予約 (Customer.userId: null) + PAID + Receipt (発行済み) を
 * 1 セット作成し、その Receipt 用の署名付きダウンロードトークンを stdout に
 * JSON で出力する。
 *
 * `e2e/public/guest-receipt-single-use.spec.ts` から
 * `execFile("bun", [thisScript], { env: process.env })` で呼ばれる
 * （`create-claim-reservation-fixture.ts` と同型の「Playwright test から bun
 * script を子プロセス実行する」パターン）。
 *
 * ## なぜ Playwright test ファイル内で直接 import しないか
 *
 * `createReceiptDownloadToken` は `@/shared/lib/crypto` を経由して
 * `@/shared/lib/env/server.ts` の `serverEnv` (module load 時に Zod パース) に
 * 依存する。`serverEnv` は `DATABASE_URL` / `BETTER_AUTH_SECRET` を必須とするため、
 * このモジュールを import する前に、`playwright.config.ts` の `webServer.env` と
 * 同じ解決ロジックで環境変数を用意しておく必要がある。子プロセスへ切り出すことで、
 * Playwright テストプロセス自身の `process.env` を汚さず、この一時的な env
 * 上書きをこのスクリプトの中に閉じ込める。
 *
 * ## 暗号鍵の一致について
 *
 * ここで解決する `DATABASE_URL` / `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY` の
 * フォールバック値は `playwright.config.ts`（`localE2eDatabaseUrl` /
 * `localE2eBetterAuthSecret` の計算式）と CI (`.github/workflows/ci.yml`
 * "Run E2E tests" step の env) の値と完全に一致する。これにより、
 * ここで生成する download トークンは webServer (実際に `next start` する
 * Next.js プロセス) と同じ ENCRYPTION_KEY で復号できる。
 */

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] &&
  process.env["BETTER_AUTH_SECRET"].length >= 32
    ? process.env["BETTER_AUTH_SECRET"]
    : "local-e2e-better-auth-secret-000000";

process.env["ENCRYPTION_KEY"] = process.env["ENCRYPTION_KEY"] || "0".repeat(64);

// `receipt-download-token.ts` (および経由する crypto.ts) は
// `import "server-only"` を持つ。`server-only` パッケージは webpack エイリアス無しで
// 読み込まれると常に throw する実装のため (Next.js のバンドラー内でのみ no-op 化される)、
// bun test の preload と同じ意図で `Bun.plugin` により
// このスクリプトの実行時だけ `server-only` を no-op モジュールに差し替える。
Bun.plugin({
  name: "stub-server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});

// `receipt-download-token.ts` は `@/shared/lib/env/server.ts`(serverEnv) を
// module load 時に Zod パースするため、上記の env 上書き後に動的 import する。
const { createReceiptDownloadToken } =
  await import("@/shared/lib/receipt-download-token");

/** この fixture が専有するスペース。共有スペースだと他 fixture の枠と衝突する。 */
const SPACE_SLUG = spaceFixtures.guestReservationSpaceSlug;

// serialNo は VarChar(20) unique。E2E は並列 worker + 反復実行で衝突しうるため
// 「YYYY-XXXXXX」形式を保ちつつ、実運用の採番 (現行年 + 1〜) と衝突しない
// **2099 年 + ランダム 6 桁** で発行する。ReceiptSequence には触れない
// (issueReceiptForReservation の advisory lock を通さない = 並列 fixture の
// serialNo 競合を回避する狙い)。
function generateFixtureSerialNo(): string {
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `2099-${rand}`;
}

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const space = await prisma.space.findFirstOrThrow({
      where: { slug: SPACE_SLUG },
      select: { id: true, name: true },
    });

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const guestEmail = `e2e-receipt-guest-${unique}@example.com`;

    // ゲスト予約: Customer.userId は null (= まだサインアップしていないゲスト)。
    // Receipt.reservation.customerId で ownership 検証は走らないが、
    // 予約は Customer FK 必須のため、userId=null の Customer を作成して紐付ける。
    const guestCustomer = await prisma.customer.create({
      data: {
        email: guestEmail,
        emailCanonical: guestEmail,
        lastName: "レシートE2Eゲスト",
        firstName: "太郎",
        userId: null,
      },
      select: { id: true },
    });

    // 過去/既存 seed データと重ならない、十分未来の固定枠を使う
    // (直接 Prisma insert のため overlap チェックは走らない)。
    // date component をランダム化して parallel worker 間衝突を減らす。
    // 日付は乱択のまま。**purge-on-entry は使えない** —
    // `guest-receipt-single-use.spec.ts` はこの fixture を 3 つの並列テストから
    // 呼ぶので、入口で消すと兄弟テストの行を消してしまう。
    // 代わりに `status: "COMPLETED"` にする。EXCLUDE 制約
    // `reservations_no_active_time_overlap_excl` は status ∈ {PENDING, CONFIRMED}
    // だけを対象にするので、COMPLETED は重なっても合法。領収書は「利用済みの
    // 予約に対して発行するもの」なので意味論的にもこちらが正しく、
    // `src/shared/domain/receipts/**` は予約 status に依存していない。
    const dayOffset = Math.floor(Math.random() * 300);
    const baseDate = new Date("2028-01-05T02:00:00.000Z");
    const startTime = new Date(
      baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    // taxRateType/taxRate/taxAmount/totalPriceWithTax/rateBreakdownJson は
    // SpaceRatePlan 導入 (migration 20260714111408) で NOT NULL 化された。この
    // fixture は rate plan resolver を経由しない直接 insert のため、同 migration
    // の backfill と同じ legacy パターンでスナップショットを埋める。
    const totalPrice = 6000;
    const taxRate = 10;
    const taxAmount = Math.round((totalPrice * taxRate) / 100);
    const totalPriceWithTax = totalPrice + taxAmount;

    const reservation = await prisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: guestCustomer.id,
        startTime,
        endTime,
        basePrice: totalPrice,
        totalPrice,
        taxRateType: "standard",
        taxRate,
        taxAmount,
        totalPriceWithTax,
        rateBreakdownJson: asPrismaInputJsonValue(
          {
            schemaVersion: 1,
            segments: [],
            totalHours: 0,
            totalBasePrice: 0,
            holidayFlags: {},
          },
          "fixture rateBreakdownJson が不正です",
        ),
        guestLastName: "レシートE2Eゲスト",
        guestFirstName: "太郎",
        guestEmail,
        status: "COMPLETED",
        paymentStatus: "PAID",
      },
      select: { id: true },
    });

    // Receipt を直接 create (advisory lock 経由の issueReceiptForReservation は
    // 通さない — 並列 worker 間の ReceiptSequence 競合を fixture 側で避けるため)。
    // serialNo は「2099-XXXXXX」で運用採番範囲と衝突させない。
    const serialNo = generateFixtureSerialNo();

    const receipt = await prisma.receipt.create({
      data: {
        serialNo,
        reservationId: reservation.id,
        recipientName: "レシートE2Eゲスト 太郎",
        subject: "スペース利用料として",
        amount: totalPriceWithTax,
        taxAmount,
        taxRate,
        issuerSnapshot: asPrismaInputJsonValue(
          {
            businessName: "株式会社サンプル",
            representativeName: "山田 太郎",
            registrationNumber: "1234567890123",
            invoiceNumber: "T1234567890123",
            email: "info@example.com",
            phoneNumber: "03-1234-5678",
            address: {
              postalCode: "150-0001",
              prefecture: "東京都",
              city: "渋谷区",
              streetAddress: "神宮前1-1-1",
            },
            snapshotAt: new Date().toISOString(),
          },
          "fixture issuerSnapshot が不正です",
        ),
      },
      select: { id: true, serialNo: true },
    });

    const token = createReceiptDownloadToken(receipt.serialNo);

    console.log(
      JSON.stringify({
        reservationId: reservation.id,
        receiptId: receipt.id,
        serialNo: receipt.serialNo,
        token,
      }),
    );
  } finally {
    await disconnect();
  }
}

try {
  await main();
  // Playwright 側は `execFile` の解決を待つ。メール送信の detached promise や
  // pg pool のハンドルが残るとイベントループが空にならず、プロセスが終了せず
  // spec が丸ごとタイムアウトする（run 30595374008 の waitlist-offer-confirm は
  // 90 s 上限でもこれ）。stdout は書き終わっているので明示的に終了する。
  process.exit(0);
} catch (error) {
  console.error(
    "❌ create-receipt-download-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
