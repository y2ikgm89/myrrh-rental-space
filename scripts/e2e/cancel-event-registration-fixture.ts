import { resolveTestDatabaseUrl } from "../test-db-url";

/**
 * E2E fixture: 指定された `EventRegistration.id` を「管理者キャンセル」経路で
 * 実キャンセルし、その結果として FIFO 昇格 (WAITLISTED → WAITLISTED_OFFERED) が
 * 実行されたかどうかを stdout に JSON で返す。
 *
 * `e2e/authenticated/customer/waitlist-auto-promotion-on-cancel.spec.ts` から
 * `execFile("bun", [thisScript, registrationId], { env: process.env })` で呼ばれる。
 *
 * ## なぜ Playwright 内で domain 関数を直接 import しないか
 *
 * `adminCancelEventRegistrationCommand` は `@/shared/db/prisma` (`import "server-only"`)・
 * `@/shared/lib/env/server` (`serverEnv` を module load 時に Zod パース) を推移的に
 * import する。`create-claim-event-registration-fixture.ts` と同じく、Playwright
 * テストプロセス自身の env を汚さずに Bun.plugin で `server-only` を no-op 化し、
 * `DATABASE_URL` / `BETTER_AUTH_SECRET` を `playwright.config.ts` の `webServer.env` と
 * 同じ解決式で子プロセスの中に閉じ込める。
 *
 * ## なぜ「実 UI からのキャンセル操作」を経由しないか
 *
 * マイページからのキャンセル (`cancelEventRegistration` Server Action) は Turnstile
 * 検証必須で、`e2e/authenticated/customer/waitlist.spec.ts` /
 * `e2e/authenticated/customer/reservation-cancel-flow.spec.ts` は「dev Turnstile +
 * DB write は flake risk のため UI smoke に留める」ことを既に確立している。本 spec の
 * 主眼は「あるキャンセルが起きた瞬間に FIFO 先頭の WAITLISTED が WAITLISTED_OFFERED に
 * 昇格し、それがマイページ UI に反映される」ことの検証であり、キャンセルの入口が UI か
 * script かは E2E の対象範囲外。dev customer の WAITLISTED が UI 上で正しく OFFERED に
 * 遷移することを見るために、キャンセル本体は既存の domain 関数を実行し実 SQL・実
 * advisory lock (728350)・実 `offerNextWaitlistEntryCommand` の chain を通過させる。
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

// `@/shared/db/prisma` と domain 関数群は `import "server-only"` を持つ。
// bun runtime では `server-only` は常に throw する実装のため、`Bun.plugin` で
// no-op モジュールに差し替える (`create-claim-event-registration-fixture.ts` と同型)。
Bun.plugin({
  name: "stub-server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});

interface CancelPromoteResult {
  readonly cancelledRegistrationId: string;
  readonly promoted: {
    readonly id: string;
    readonly email: string | null;
    readonly offeredAt: string;
    readonly expiresAt: string;
  } | null;
}

async function main(): Promise<void> {
  const registrationId = process.argv[2];
  if (!registrationId) {
    throw new Error(
      "usage: cancel-event-registration-fixture.ts <eventRegistrationId>",
    );
  }

  // Dynamic import: 上の env / server-only stub が確実に効いた後に module load させる。
  const { adminCancelEventRegistrationCommand } =
    await import("@/shared/domain/events/registration-commands");

  const result = await adminCancelEventRegistrationCommand(registrationId);

  const output: CancelPromoteResult = {
    cancelledRegistrationId: registrationId,
    promoted: result.promoted
      ? {
          id: result.promoted.id,
          email: result.promoted.email,
          offeredAt: result.promoted.offeredAt.toISOString(),
          expiresAt: result.promoted.expiresAt.toISOString(),
        }
      : null,
  };

  console.log(JSON.stringify(output));
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(
    "cancel-event-registration-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
