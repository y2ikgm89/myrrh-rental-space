import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const prismaSource = readFileSync(
  join(ROOT, "src/shared/db/prisma.ts"),
  "utf8",
);
const serverEnvSource = readFileSync(
  join(ROOT, "src/shared/lib/env/server.ts"),
  "utf8",
);

describe("Prisma adapter-pg configuration", () => {
  test("uses Prisma 7 adapter-pg object configuration without app-owned pg pools", () => {
    expect(prismaSource).toContain(
      'import { PrismaPg } from "@prisma/adapter-pg"',
    );
    // 設定オブジェクト渡しであること（= アプリが `pg.Pool` を作って渡していない）。
    // 以前は `"new PrismaPg({"` の完全一致で見ていたが、これは書式に依存する:
    // 第 2 引数（`PrismaPgOptions`）を足して prettier が呼び出しを複数行に割った
    // だけで落ちた。意図は同じまま空白を許容する。`new PrismaPg(pool)` /
    // `new PrismaPg(config)` は従来どおり弾く。
    expect(prismaSource).toMatch(/new\s+PrismaPg\(\s*\{/u);
    expect(prismaSource).toContain("connectionString: serverEnv.DATABASE_URL");
    expect(prismaSource).toContain("new PrismaClient({");
    expect(prismaSource).toContain("adapter,");
    expect(prismaSource).not.toContain('from "pg"');
    expect(prismaSource).not.toContain("new Pool(");
  });

  test("wires the adapter's pool / connection error callbacks", () => {
    // callback 未指定でも adapter-pg は listener を張るので落ちはしないが、中身が
    // `Debug(...)` だけになり本番では何も出ない（`DEBUG` 未設定のため）。
    // 配線が実際に効くことは `__tests__/unit/db/prisma-pool-error-wiring.test.ts`、
    // ここでは「配線が外れていないこと」だけを見る。
    expect(prismaSource).toMatch(/onPoolError:/u);
    expect(prismaSource).toMatch(/onConnectionError:/u);
  });

  test("keeps PostgreSQL pool and server timeout tuning in validated server env", () => {
    for (const envName of [
      "DATABASE_POOL_MAX",
      "DATABASE_CONNECTION_TIMEOUT_MS",
      "DATABASE_IDLE_TIMEOUT_MS",
      "DATABASE_STATEMENT_TIMEOUT_MS",
      "DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS",
    ]) {
      expect(serverEnvSource).toContain(envName);
      expect(prismaSource).toContain(`serverEnv.${envName}`);
    }

    expect(prismaSource).toContain(
      "connectionTimeoutMillis: serverEnv.DATABASE_CONNECTION_TIMEOUT_MS ?? 5_000",
    );
    expect(prismaSource).toContain(
      "idleTimeoutMillis: serverEnv.DATABASE_IDLE_TIMEOUT_MS ?? 300_000",
    );
    expect(prismaSource).toContain("max: serverEnv.DATABASE_POOL_MAX ?? 10");
    expect(prismaSource).toContain(
      "statement_timeout: serverEnv.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000",
    );
    expect(prismaSource).toContain("idle_in_transaction_session_timeout:");
    expect(prismaSource).toContain(
      "serverEnv.DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS ?? 15_000",
    );
  });
});
