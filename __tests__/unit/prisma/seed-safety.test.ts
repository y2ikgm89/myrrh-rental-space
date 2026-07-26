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

describe("evaluateSeedSafety", () => {
  test("allows --dev/--reset only against safe local DATABASE_URL", () => {
    expect(
      evaluateSeedSafety({
        argv: [],
        env: {
          databaseUrl: LOCAL_URL,
          nodeEnv: "development",
          appSurface: undefined,
        },
      }),
    ).toEqual({ ok: true, mode: "dev" });

    expect(
      evaluateSeedSafety({
        argv: ["--reset"],
        env: {
          databaseUrl: LOCAL_URL,
          nodeEnv: undefined,
          appSurface: undefined,
        },
      }),
    ).toEqual({ ok: true, mode: "reset" });
  });

  test("refuses --dev/--reset when NODE_ENV=production or APP_SURFACE is set", () => {
    const nodeEnvRefuse = evaluateSeedSafety({
      argv: ["--dev"],
      env: {
        databaseUrl: LOCAL_URL,
        nodeEnv: "production",
        appSurface: undefined,
      },
    });
    expect(nodeEnvRefuse.ok).toBe(false);
    if (!nodeEnvRefuse.ok) {
      expect(nodeEnvRefuse.error).toContain("NODE_ENV=production");
    }

    const surfaceRefuse = evaluateSeedSafety({
      argv: ["--reset"],
      env: {
        databaseUrl: LOCAL_URL,
        nodeEnv: "development",
        appSurface: "public",
      },
    });
    expect(surfaceRefuse.ok).toBe(false);
    if (!surfaceRefuse.ok) {
      expect(surfaceRefuse.error).toContain("APP_SURFACE");
    }
  });

  test("refuses --dev/--reset against Neon / Cloud SQL DATABASE_URL", () => {
    const neonRefuse = evaluateSeedSafety({
      argv: [],
      env: {
        databaseUrl:
          "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
        nodeEnv: "development",
        appSurface: undefined,
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
          nodeEnv: "production",
          appSurface: "admin",
        },
      }),
    ).toEqual({ ok: true, mode: "production" });
  });

  test("forever refuses combining --production with --reset", () => {
    const mixed = evaluateSeedSafety({
      argv: ["--production", "--reset", "owner@example.com"],
      env: {
        databaseUrl:
          "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/neondb",
        nodeEnv: "production",
        appSurface: "admin",
      },
    });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) {
      expect(mixed.error).toContain("cannot be combined");
    }
  });
});
