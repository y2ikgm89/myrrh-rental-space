import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const playwrightConfig = readFileSync(
  join(process.cwd(), "playwright.config.ts"),
  "utf8",
);
const serverEnv = readFileSync(
  join(process.cwd(), "src/shared/lib/env/server.ts"),
  "utf8",
);
const adminAuth = readFileSync(
  join(process.cwd(), "src/shared/domain/admin-auth/session.ts"),
  "utf8",
);
const adminAuthQueries = readFileSync(
  join(process.cwd(), "src/shared/domain/admin-auth/queries.ts"),
  "utf8",
);
const e2eRuntime = readFileSync(
  join(process.cwd(), "src/shared/lib/e2e-runtime.ts"),
  "utf8",
);
const cacheHealth = readFileSync(
  join(process.cwd(), "src/shared/lib/cache/health.ts"),
  "utf8",
);
const prismaSeed = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
const e2eTestData = readFileSync(
  join(process.cwd(), "e2e/fixtures/test-data.ts"),
  "utf8",
);
const ciWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);
/**
 * コメント行を落とした「コードの行」だけを返す。
 *
 * この gate が見たいのは config の**値**であって説明文ではない。JSDoc の中には
 * 公式ドキュメントの引用や、過去に採っていた形（`process.env["CI"] ? 2 : 1`）が
 * 意図的に書いてあるので、素の `toContain` / `toMatch` はそれに反応する。
 *
 * 粗さは承知のうえ: 行頭が `*` / `//` / `/*` のものだけを落とすので、コード行の
 * 末尾に付いた行コメントは残る。この gate が見る対象（`workers:` の宣言行）は
 * 1 行に収まるため実害が無い。
 */
function codeLines(source: string): string[] {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("*") &&
        !line.startsWith("//") &&
        !line.startsWith("/*"),
    );
}

describe("Playwright E2E webServer env", () => {
  test("supplies local-only env required by Next instrumentation", () => {
    for (const key of [
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "NEXT_PUBLIC_BASE_URL",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "NEXT_PUBLIC_ENABLE_E2E_LOGIN",
    ]) {
      expect(playwrightConfig).toContain(`${key}:`);
    }
  });

  test("supplies production runtime env required by Next instrumentation", () => {
    for (const key of [
      "E2E_RUNTIME",
      "E2E_FIXED_NOW_ISO",
      "ADMIN_APP_URL",
      "ENCRYPTION_KEY",
      "SUPPRESSION_HASH_SECRET",
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
      "AUDIT_LOG_HMAC_KEY",
      "CRON_OIDC_AUDIENCE",
      "CRON_SERVICE_ACCOUNT_EMAIL",
      "TURNSTILE_SECRET_KEY",
      "CLOUDFLARE_ORIGIN_HEADER_SECRET",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_INQUIRIES_BUCKET_NAME",
      "R2_PUBLIC_URL",
      "ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL",
      "ADMIN_ROLE_GROUP_ADMIN_EMAIL",
      "ADMIN_ROLE_GROUP_EDITOR_EMAIL",
      "ADMIN_ROLE_GROUP_VIEWER_EMAIL",
    ]) {
      expect(playwrightConfig).toContain(`${key}:`);
    }

    expect(playwrightConfig).not.toContain("SKIP_ENV_VALIDATION:");
  });

  test("keeps server-side E2E bypasses on server-only env", () => {
    expect(serverEnv).toContain("E2E_RUNTIME:");
    expect(serverEnv).toContain('E2E_RUNTIME: process.env["E2E_RUNTIME"]');
    expect(serverEnv).toContain("E2E_FIXED_NOW_ISO:");
    expect(serverEnv).toContain(
      'E2E_FIXED_NOW_ISO: process.env["E2E_FIXED_NOW_ISO"]',
    );
    expect(playwrightConfig).toContain('E2E_RUNTIME: "1"');
    expect(playwrightConfig).toContain("E2E_FIXED_NOW_ISO:");

    expect(adminAuth).toContain("isLocalProductionE2EEnv");
    expect(adminAuth).toContain("isLoopbackRequestHost");
    expect(e2eRuntime).toContain('serverEnv.E2E_RUNTIME === "1"');
    expect(e2eRuntime).toContain("isLocalhostUrl");
    expect(e2eRuntime).toContain("isLoopbackRequestHost");
    expect(e2eRuntime).toContain("isE2ESecurityBypassAllowed");
    expect(e2eRuntime).toContain('process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"]');

    for (const serverOnlyFile of [adminAuthQueries, cacheHealth]) {
      expect(serverOnlyFile).toContain('serverEnv.E2E_RUNTIME === "1"');
      expect(serverOnlyFile).not.toContain(
        'process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"]',
      );
    }
  });

  test("does not pass removed initial admin bootstrap env", () => {
    for (const source of [playwrightConfig, serverEnv, prismaSeed]) {
      expect(source).not.toContain("INITIAL_ADMIN_EMAIL");
      expect(source).not.toContain("INITIAL_ADMIN_NAME");
    }
  });

  test("uses the Super Admin E2E fixture as the local IAP identity", () => {
    expect(e2eTestData).toContain('email: "superadmin@example.com"');
    expect(e2eTestData).toContain('role: "SUPER_ADMIN"');
    expect(playwrightConfig).toContain(
      'import { testUsers } from "./e2e/fixtures/test-data";',
    );
    expect(playwrightConfig).toContain(
      'process.env["ADMIN_TEST_IAP_EMAIL"] ?? testUsers.admin.email',
    );
    expect(playwrightConfig).not.toContain(
      'process.env["ADMIN_TEST_IAP_EMAIL"] ?? "admin@example.com"',
    );
  });

  // playwright.config.ts の既定値は `process.env` の値に負けるため、CI が
  // ADMIN_TEST_IAP_EMAIL を上書きすると上のゲートを素通りして identity が入れ替わる。
  // seed 上 admin@example.com は ADMIN ロールで settings:manage / auditLog:read を
  // 持たないため、広域 E2E の管理系 spec が一斉に redirect("/admin") で落ちる。
  test("keeps the CI IAP identity on the Super Admin fixture", () => {
    const overrides = [
      ...ciWorkflow.matchAll(/^\s*ADMIN_TEST_IAP_EMAIL:\s*"([^"]+)"/gmu),
    ].map((match) => match[1]);

    expect(overrides.length).toBeGreaterThan(0);
    for (const email of overrides) {
      expect(email).toBe("superadmin@example.com");
    }
  });

  test("uses one local base URL for browser contexts, server readiness, and Next env", () => {
    expect(playwrightConfig).toContain("baseURL: localE2eBaseUrl");
    expect(playwrightConfig).toContain("url: localE2eBaseUrl");
    expect(playwrightConfig).toContain(
      'process.env["NEXT_PUBLIC_BASE_URL"] ?? localE2eBaseUrl',
    );
    expect(playwrightConfig).toContain(
      'process.env["NEXT_PUBLIC_APP_URL"] ?? localE2eBaseUrl',
    );
  });

  test("defaults to admin surface without overriding explicit surface-specific jobs", () => {
    expect(playwrightConfig).toContain(
      'process.env["APP_SURFACE"] ??= "admin";',
    );
    expect(playwrightConfig).toContain(
      'APP_SURFACE: process.env["APP_SURFACE"] ?? "admin"',
    );
    expect(playwrightConfig).not.toContain(
      'process.env["APP_SURFACE"] = "admin";',
    );
    expect(playwrightConfig).not.toContain('APP_SURFACE: "admin"');
  });

  test("starts from a seeded production-mode server instead of Next dev", () => {
    expect(playwrightConfig).toContain(
      'import { resolveTestDatabaseUrl } from "./scripts/test-db-url";',
    );
    expect(playwrightConfig).toContain("localE2eDatabaseUrl");
    expect(playwrightConfig).toContain("bun run test:db:migrate");
    expect(playwrightConfig).toContain("bun prisma/seed.ts --dev");
    expect(playwrightConfig).toContain("bun run build:skip-env");
    expect(playwrightConfig).toContain("reuseExistingServer: false");
    expect(playwrightConfig).not.toContain("bunx next dev");

    // Stripe 認証情報は seed の後・server 起動の前に入れる。
    // `SettingsStripe.stripeWebhookSecret` の唯一の書き手がこの script で、
    // 無いと `availability.ts` が決済を利用不可にする。spec 内から呼んでいた頃は
    // `--project=chromium-customer` 単独実行で決済 CTA が出ず、
    // product regression に見えていた。
    expect(playwrightConfig).toContain(
      "bun scripts/e2e/setup-stripe-webhook-fixture.ts",
    );

    const migrateIndex = playwrightConfig.indexOf("bun run test:db:migrate");
    const seedIndex = playwrightConfig.indexOf("bun prisma/seed.ts --dev");
    const stripeIndex = playwrightConfig.indexOf(
      "bun scripts/e2e/setup-stripe-webhook-fixture.ts",
    );
    const buildIndex = playwrightConfig.indexOf("bun run build:skip-env");
    const startIndex = playwrightConfig.indexOf("bun run start");

    expect(migrateIndex).toBeGreaterThanOrEqual(0);
    expect(seedIndex).toBeGreaterThanOrEqual(0);
    expect(seedIndex).toBeGreaterThan(migrateIndex);
    expect(stripeIndex).toBeGreaterThan(seedIndex);
    expect(buildIndex).toBeGreaterThan(stripeIndex);
    expect(startIndex).toBeGreaterThan(buildIndex);
  });

  test("widens local database pool startup tolerance for first-render bursts", () => {
    expect(playwrightConfig).toContain("DATABASE_URL: localE2eDatabaseUrl");
    expect(playwrightConfig).toContain("DATABASE_POOL_MAX:");
    expect(playwrightConfig).toContain("DATABASE_CONNECTION_TIMEOUT_MS:");
    expect(playwrightConfig).toContain(
      'process.env["DATABASE_POOL_MAX"] ?? "30"',
    );
    expect(playwrightConfig).toContain(
      'process.env["DATABASE_CONNECTION_TIMEOUT_MS"] ?? "15000"',
    );
  });

  /**
   * `workers: 1` は Playwright 公式の CI 既定であり、**test 同士の同時実行という
   * failure class を構造的に消す**ためのもの。2 worker のとき、2 つの test が
   * 同じ singleton 行へ同時に保存して楽観ロックが競合し、共有 DB が壊れたまま
   * 残った（run 32751526626）。
   *
   * 「速くしよう」で静かに戻されやすい 1 行なので固定する。速さが要るなら
   * worker ではなく runner を増やす（公式の `--shard`）。
   *
   * **WebKit の起動コスト対策ではない。** それは `setup-webkit` project の担当で、
   * 実測でも worker 数はほとんど効かなかった（12.6s → 10.8s）。混同すると、
   * 次に誰かが worker を戻したとき「WebKit が壊れた」と誤読する。
   */
  test("E2E は worker を増やさない（test 同士の同時実行を作らない）", () => {
    // **コードだけを見る。** docstring は Playwright 公式既定
    // `workers: process.env.CI ? 1 : undefined` を引用しており、素の grep だと
    // 自分の説明文に反応して落ちる（実際に落ちた）。
    const workersLines = codeLines(playwrightConfig).filter((line) =>
      line.includes("workers:"),
    );

    expect(workersLines).toEqual(["workers: 1,"]);
    // CI 側から `--workers` で上書きしていないこと（config の値が効かなくなる）。
    expect(ciWorkflow).not.toContain("--workers");
  });

  /**
   * WebKit の起動コストを test の予算の外へ出す setup project。理由と実測は
   * `e2e/auth/webkit-warmup.setup.ts` の docstring が SSoT。
   *
   * **`workers: 1` とセットでしか成立しない。** browser は worker ごとに使い回す
   * ので、setup と本体が同じ worker に載る保証が要る。上の test と一緒にここで
   * 固定するのは、片方だけ外すと**残った側が黙って無意味になる**ため。
   */
  test("WebKit を使う project は起動を setup へ追い出す", () => {
    expect(playwrightConfig).toContain('name: "setup-webkit"');

    // browserName: "webkit" を使う project は、すべて setup-webkit に依存する。
    const webkitProjects = [
      ...playwrightConfig.matchAll(/name: "(webkit-[\w-]+)"/gu),
    ].map((match) => String(match[1]));
    expect(webkitProjects.length).toBeGreaterThan(2);

    for (const name of webkitProjects) {
      const start = playwrightConfig.indexOf(`name: "${name}"`);
      const end = playwrightConfig.indexOf("testMatch:", start);
      expect(playwrightConfig.slice(start, end)).toContain('"setup-webkit"');
    }
  });
});
