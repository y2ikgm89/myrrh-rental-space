import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

/**
 * E2E fixture: Stripe webhook を扱えるように Settings singleton を仕込む。
 *
 * `e2e/public/stripe-webhook-dedup-replay.spec.ts` から
 * `execFile("bun", [thisScript], { env: process.env })` で呼ばれる
 * （`create-claim-reservation-fixture.ts` と同じ「Playwright test から bun script を
 * 子プロセス実行する」パターン）。
 *
 * ## なぜ Playwright test 内で直接 import しないか
 *
 * `encrypt()` は `@/shared/lib/env/encryption` 経由で `serverEnv` に依存し、
 * `import "server-only"` を持つ。Playwright test プロセスの env は
 * `playwright.config.ts` の `webServer.env` とは別世界 (test proc は
 * `NEXT_PUBLIC_*` 等の限られた env しか持たない) のため、暗号鍵を webServer と
 * 一致させるには本スクリプト内で明示的に env を上書きし、`server-only` を
 * `Bun.plugin` で no-op 化する必要がある。
 *
 * ## 暗号鍵の一致について
 *
 * ここで解決する `DATABASE_URL` / `ENCRYPTION_KEY` のフォールバック値は
 * `playwright.config.ts`（`localE2eDatabaseUrl` の計算式、`ENCRYPTION_KEY` の
 * `"0".repeat(64)` フォールバック）と完全に同じ式・同じ固定値を使う。
 * これにより本スクリプトが暗号化した Stripe webhook secret / secret key は
 * webServer 側の `assertOnlinePaymentAvailable` が同一 kid で復号できる。
 * 値がどちらかだけ変わった場合はこのファイルも合わせて更新すること。
 *
 * ## 出力
 *
 * stdout に JSON: `{ webhookSecret: "whsec_..." }`（plaintext）。
 * spec 側はこの secret を Stripe SDK の `webhooks.generateTestHeaderString`
 * に渡して署名を生成する。
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

// `crypto.ts` は `import "server-only"` を持つ (env/encryption.ts 経由)。
// `server-only` パッケージは webpack エイリアス無しで読み込まれると常に throw する実装のため
// (Next.js のバンドラー内でのみ no-op 化される)、bun test の preload (`__tests__/setup.ts`) と
// 同じ意図で `Bun.plugin` によりこのスクリプトの実行時だけ `server-only` を no-op
// モジュールに差し替える。
Bun.plugin({
  name: "stub-server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});

const { encrypt } = await import("@/shared/lib/crypto");
const { SETTINGS_CRYPTO_PURPOSES } =
  await import("@/shared/lib/crypto-purposes");

// E2E 用の固定 secret。プレフィックス `whsec_` は Stripe SDK が期待する形式に合わせるが、
// ローカル・test DB でしか復号できないため機密性は無い。値を変更した場合、既存の
// Settings singleton を再度 upsert すれば新 kid で書き換わる。
const WEBHOOK_SECRET_PLAINTEXT = "whsec_e2e_test_webhook_secret_00000000";
const SECRET_KEY_PLAINTEXT = "sk_test_e2e_stripe_secret_key_00000000";

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const encryptedSecretKey = encrypt(SECRET_KEY_PLAINTEXT, {
      purpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
    });
    const encryptedWebhookSecret = encrypt(WEBHOOK_SECRET_PLAINTEXT, {
      purpose: SETTINGS_CRYPTO_PURPOSES.stripeWebhookSecret,
    });

    await prisma.settings.upsert({
      where: { id: "singleton" },
      update: {
        stripeSecretKey: encryptedSecretKey,
        stripeWebhookSecret: encryptedWebhookSecret,
      },
      create: {
        id: "singleton",
        stripeSecretKey: encryptedSecretKey,
        stripeWebhookSecret: encryptedWebhookSecret,
      },
    });

    // dedup regression gate は Stripe event.id を primary key に持つため、
    // 過去 run の残置行が同一 event.id で再利用されると initial delivery が
    // silent duplicate 化する。テスト側で使う evt_id を先に掃除する。
    await prisma.stripeEvent.deleteMany({
      where: {
        id: {
          in: ["evt_test_dedup_1", "evt_test_dedup_2"],
        },
      },
    });

    console.log(
      JSON.stringify({
        webhookSecret: WEBHOOK_SECRET_PLAINTEXT,
      }),
    );
  } finally {
    await disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    "setup-stripe-webhook-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
