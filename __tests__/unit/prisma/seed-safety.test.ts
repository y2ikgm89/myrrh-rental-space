import { describe, expect, test } from "bun:test";

import {
  evaluateSeedSafety,
  isLocalhostDatabaseUrl,
  looksLikeProductionDatabaseUrl,
  type SeedSafetyEnv,
} from "../../../prisma/seed-safety";

const LOCAL_URL =
  "postgresql://postgres:postgres@localhost:5432/myrrh_rental?schema=public";

describe("seed-safety DATABASE_URL helpers", () => {
  test("isLocalhostDatabaseUrl accepts only loopback hosts", () => {
    expect(isLocalhostDatabaseUrl(LOCAL_URL)).toBe(true);
    expect(
      isLocalhostDatabaseUrl(
        "postgresql://postgres:postgres@127.0.0.1:5432/myrrh_rental",
      ),
    ).toBe(true);
    expect(
      isLocalhostDatabaseUrl(
        "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
      ),
    ).toBe(false);
    expect(isLocalhostDatabaseUrl(undefined)).toBe(false);
  });

  test("looksLikeProductionDatabaseUrl catches Neon, Cloud SQL, and non-localhost", () => {
    expect(looksLikeProductionDatabaseUrl(LOCAL_URL)).toBe(false);
    expect(
      looksLikeProductionDatabaseUrl(
        "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
      ),
    ).toBe(true);
    expect(
      looksLikeProductionDatabaseUrl(
        "postgresql://user:pass@localhost/db?host=/cloudsql/proj:asia-northeast1:inst",
      ),
    ).toBe(true);
    expect(
      looksLikeProductionDatabaseUrl(
        "postgresql://user:pass@db.example.sql.goog/prod",
      ),
    ).toBe(true);
    expect(
      looksLikeProductionDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/myrrh_prod",
      ),
    ).toBe(true);
  });
});

const baseLocalEnv = { databaseUrl: LOCAL_URL };

describe("evaluateSeedSafety", () => {
  test("allows --dev only against safe local DATABASE_URL", () => {
    expect(
      evaluateSeedSafety({
        argv: [],
        env: baseLocalEnv,
      }),
    ).toEqual({ ok: true, mode: "dev" });

    expect(
      evaluateSeedSafety({
        argv: ["--dev"],
        env: baseLocalEnv,
      }),
    ).toEqual({ ok: true, mode: "dev" });
  });

  /**
   * 2026-08-09 に廃止した二段目のガードの回帰。
   *
   * かつては `APP_SURFACE` / `NODE_ENV=production` が立っていると、`E2E_RUNTIME=1` か
   * `CI=true` でない限り **localhost でも**拒否していた。だが
   * `looksLikeProductionDatabaseUrl` の最終行が `!isLocalhostDatabaseUrl(...)` である以上、
   * 一段目を通った時点で localhost は確定しており、二段目に守るものは無かった。
   *
   * 実害だけがあった: `APP_SURFACE` は public / admin のどちらを見るかを決める env で、
   * ローカルの `.env.local` に置くのは正当な構成（`.claude/rules/app-structure.md`）。
   * `scripts/setup-local.ts` はその `.env.local` をプロセス env に載せてから `db:seed` を
   * 呼ぶので、**`bun run setup` が最終 step で必ず落ちていた**。
   *
   * 判定材料が接続先だけになったことは `SeedSafetyEnv` の形で型が保証する
   * （プロセスの env はもう渡せない）。
   */
  test("判定材料は接続先だけ — プロセスの env は受け取らない", () => {
    const env: SeedSafetyEnv = { databaseUrl: LOCAL_URL };
    expect(Object.keys(env)).toEqual(["databaseUrl"]);
    expect(evaluateSeedSafety({ argv: ["--dev"], env })).toEqual({
      ok: true,
      mode: "dev",
    });
  });

  test("refuses --dev against Neon / Cloud SQL DATABASE_URL", () => {
    const neonRefuse = evaluateSeedSafety({
      argv: [],
      env: {
        databaseUrl:
          "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
      },
    });
    expect(neonRefuse.ok).toBe(false);
    if (!neonRefuse.ok) {
      expect(neonRefuse.error).toContain("production database");
    }
  });

  test("allows --production even against production-looking DATABASE_URL", () => {
    expect(
      evaluateSeedSafety({
        argv: ["--production", "owner@example.com", "Owner"],
        env: {
          databaseUrl:
            "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
        },
      }),
    ).toEqual({ ok: true, mode: "production" });
  });

  test("still refuses the retired flag when mixed with --production", () => {
    // 廃止後も「筋肉記憶で打たれた --reset が本番 bootstrap に紛れる」経路を塞ぐ。
    const mixed = evaluateSeedSafety({
      argv: ["--production", "--reset", "owner@example.com"],
      env: {
        databaseUrl:
          "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
      },
    });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) {
      expect(mixed.error).toContain("--reset");
    }
  });
});
