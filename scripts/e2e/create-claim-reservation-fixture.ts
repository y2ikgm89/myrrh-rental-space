import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { spaceFixtures } from "../../e2e/fixtures/test-data";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

/**
 * E2E fixture: 未紐付け（`Customer.userId: null`）のゲスト予約を1件作成し、
 * その予約の claim トークン付き URL を stdout に JSON で出力する。
 *
 * `e2e/authenticated/customer/claim-reservation.spec.ts` から
 * `execFile("bun", [thisScript], { env: process.env })` で呼ばれる
 * （`e2e/helpers/ensure-admin-user.ts` と同じ「Playwright test から bun script を
 * 子プロセス実行する」パターン）。
 *
 * ## なぜ Playwright test ファイル内で直接 import しないか
 *
 * `createReservationClaimToken` は `@/shared/lib/crypto` を経由して
 * `@/shared/lib/env/server.ts` の `serverEnv`（module load 時に Zod でパース）に
 * 依存する。`serverEnv` は `DATABASE_URL` / `BETTER_AUTH_SECRET` を必須とするため、
 * このモジュールを import する前に、`playwright.config.ts` の `webServer.env` と
 * **同じ解決ロジック**（`resolveTestDatabaseUrl` + 固定フォールバック値）で
 * 環境変数を用意しておく必要がある。子プロセスへ切り出すことで、Playwright
 * テストプロセス自身の `process.env`（サーバー起動用の env とは無関係）を汚さず、
 * この一時的な env 上書きをこのスクリプトの中に閉じ込める。
 *
 * ## 暗号鍵の一致について
 *
 * ここで解決する `DATABASE_URL` / `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY` の
 * フォールバック値は `playwright.config.ts`（`localE2eDatabaseUrl` /
 * `localE2eBetterAuthSecret` の計算式、および CI の `.github/workflows/ci.yml`
 * "Run E2E tests" step の env）と完全に同じ式・同じ固定値を使う。これにより、
 * このスクリプトが生成する claim トークンは webServer（実際に `next start` する
 * Next.js プロセス）と同じ ENCRYPTION_KEY で復号できる。
 * 値がどちらかだけ変わった場合はこのファイルも合わせて更新すること。
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

// `reservation-claim-token.ts`（および経由する crypto.ts / env/encryption.ts）は
// `import "server-only"` を持つ。`server-only` パッケージは webpack エイリアス無しで
// 読み込まれると常に throw する実装のため（Next.js のバンドラー内でのみ no-op 化される）、
// bun test の preload（`__tests__/setup.ts`）と同じ意図で `Bun.plugin` により
// このスクリプトの実行時だけ `server-only` を no-op モジュールに差し替える。
Bun.plugin({
  name: "stub-server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});

// `reservation-claim-token.ts` は `@/shared/lib/env/server.ts`(serverEnv) を
// module load 時に Zod パースするため、上記の env 上書き後に動的 import する。
const { createReservationClaimToken } =
  await import("@/shared/lib/reservation-claim-token");

/** この fixture が専有するスペース。共有スペースだと EXCLUDE 制約で 2 回目が落ちる。 */
const SPACE_SLUG = spaceFixtures.guestReservationSpaceSlug;

/** 冪等化のための marker。前回分を purge してから作り直す。 */
const FIXTURE_MARKER = "[E2E] claim reservation fixture";

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const space = await prisma.space.findFirstOrThrow({
      where: { slug: SPACE_SLUG },
      select: { id: true, name: true },
    });

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const guestEmail = `e2e-claim-guest-${unique}@example.com`;

    const guestCustomer = await prisma.customer.create({
      data: {
        email: guestEmail,
        emailCanonical: guestEmail,
        lastName: "クレームE2Eゲスト",
        firstName: "太郎",
        userId: null,
      },
      select: { id: true },
    });

    // 固定枠を使う。専有スペースなので他 fixture とは衝突しないが、**この fixture の
    // 前回分**とは衝突する（EXCLUDE 制約 `reservations_no_active_time_overlap_excl`）。
    // spec 本体から呼ばれ CI は `retries: 2` なので、1 度残ると 3 attempt すべてが
    // fixture 生成エラーになる。marker 付きの旧行を先に片付けて冪等にする。
    const startTime = new Date("2027-03-15T01:00:00.000Z");
    const endTime = new Date("2027-03-15T03:00:00.000Z");

    const stale = await prisma.reservation.findMany({
      where: { spaceId: space.id, notes: { startsWith: FIXTURE_MARKER } },
      select: { id: true },
    });
    if (stale.length > 0) {
      const staleIds = stale.map((r) => r.id);
      await prisma.receipt.deleteMany({
        where: { reservationId: { in: staleIds } },
      });
      await prisma.reservation.deleteMany({ where: { id: { in: staleIds } } });
    }

    // taxRateType/taxRate/taxAmount/totalPriceWithTax/rateBreakdownJson は
    // fixture は rate plan resolver を経由しない直接 insert のため、空 segments
    // の rateBreakdownJson スナップショットを埋める。
    const totalPrice = 6000;
    const taxRate = 10;
    const taxAmount = Math.round((totalPrice * taxRate) / 100);

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
        totalPriceWithTax: totalPrice + taxAmount,
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
        guestLastName: "クレームE2Eゲスト",
        guestFirstName: "太郎",
        guestEmail,
        notes: `${FIXTURE_MARKER} ${unique}`,
      },
      select: { id: true },
    });

    const token = createReservationClaimToken(reservation.id);

    console.log(
      JSON.stringify({
        reservationId: reservation.id,
        spaceName: space.name,
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
    "❌ create-claim-reservation-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
