import { describe, expect, test } from "bun:test";

import {
  evaluateSeedSafety,
  isLocalhostDatabaseUrl,
  looksLikeProductionDatabaseUrl,
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

const baseLocalEnv = {
  databaseUrl: LOCAL_URL,
  nodeEnv: "development" as string | undefined,
  appSurface: undefined as string | undefined,
  e2eRuntime: undefined as string | undefined,
  ci: undefined as string | undefined,
};

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
        env: { ...baseLocalEnv, nodeEnv: undefined },
      }),
    ).toEqual({ ok: true, mode: "dev" });
  });

  test("refuses --dev when APP_SURFACE is set without E2E_RUNTIME/CI", () => {
    const surfaceRefuse = evaluateSeedSafety({
      argv: ["--dev"],
      env: {
        ...baseLocalEnv,
        appSurface: "public",
      },
    });
    expect(surfaceRefuse.ok).toBe(false);
    if (!surfaceRefuse.ok) {
      expect(surfaceRefuse.error).toContain("APP_SURFACE");
    }
  });

  test("allows localhost --dev when APP_SURFACE is set with E2E_RUNTIME=1 (Playwright)", () => {
    expect(
      evaluateSeedSafety({
        argv: ["--dev"],
        env: {
          ...baseLocalEnv,
          appSurface: "public",
          e2eRuntime: "1",
        },
      }),
    ).toEqual({ ok: true, mode: "dev" });
  });

  test("allows localhost --dev when APP_SURFACE is set with CI=true", () => {
    expect(
      evaluateSeedSafety({
        argv: ["--dev"],
        env: {
          ...baseLocalEnv,
          nodeEnv: "production",
          appSurface: "admin",
          ci: "true",
        },
      }),
    ).toEqual({ ok: true, mode: "dev" });
  });

  test("refuses --dev against Neon / Cloud SQL DATABASE_URL", () => {
    const neonRefuse = evaluateSeedSafety({
      argv: [],
      env: {
        ...baseLocalEnv,
        databaseUrl:
          "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
        e2eRuntime: "1",
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
          ...baseLocalEnv,
          databaseUrl:
            "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
          nodeEnv: "production",
          appSurface: "admin",
        },
      }),
    ).toEqual({ ok: true, mode: "production" });
  });

  test("still refuses the retired flag when mixed with --production", () => {
    // 廃止後も「筋肉記憶で打たれた --reset が本番 bootstrap に紛れる」経路を塞ぐ。
    const mixed = evaluateSeedSafety({
      argv: ["--production", "--reset", "owner@example.com"],
      env: {
        ...baseLocalEnv,
        databaseUrl:
          "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
        nodeEnv: "production",
        appSurface: "admin",
      },
    });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) {
      expect(mixed.error).toContain("--reset");
    }
  });
});
