/**
 * N-06: 同一 IntegrationKey への並行 `recordConnectionFailure`（一時失敗）が
 * consecutiveFailures を原子加算することの検証。
 *
 * findUnique → JS で +1 → upsert の絶対値書込だと、並列が同じ 0 を読んで
 * どちらも 1 を書き、実失敗 N 回でもカウンタが足りず ERROR に届かない。
 * Prisma の `{ increment: 1 }` なら最終値が N になり、閾値 3 で ERROR になる。
 *
 * == 実行条件 ==
 * 実 Postgres を要求する（upsert / increment の競合は mock では再現不能）。
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * 直接 `bun test` でこのファイルを実行し `TEST_DATABASE_URL` が未設定の場合のみ
 * describe ごと skip する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ConnectionStatus, IntegrationKey } from "@generated/prisma/enums";
import { installErrorsServerLogErrorMock } from "../../../mocks/errors-server";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  const url = new URL(TEST_DB_URL);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "20");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "60");
  }
  process.env["DATABASE_URL"] = url.toString();
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

await installErrorsServerLogErrorMock();

type PrismaModule = typeof import("@/shared/db/prisma");
type HealthModule = typeof import("@/shared/domain/settings/connection-health");

let prisma: PrismaModule["prisma"];
let recordConnectionFailure: HealthModule["recordConnectionFailure"];
let CONNECTION_FAILURE_THRESHOLD: HealthModule["CONNECTION_FAILURE_THRESHOLD"];

const TARGET_KEY = IntegrationKey.GOOGLE_CALENDAR;
const CONCURRENCY = 5;

type HealthSnapshot = {
  status: ConnectionStatus | null;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorMessage: string | null;
};

describeMaybe(
  "recordConnectionFailure — 並行一時失敗は consecutiveFailures が N",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ recordConnectionFailure, CONNECTION_FAILURE_THRESHOLD } =
        await import("@/shared/domain/settings/connection-health"));
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    test("同一キーへ 5 並行の一時失敗を記録すると consecutiveFailures=5 かつ ERROR", async () => {
      expect(CONCURRENCY).toBeGreaterThanOrEqual(CONNECTION_FAILURE_THRESHOLD);

      const previous = await prisma.integrationHealth.findUnique({
        where: { integration: TARGET_KEY },
        select: {
          status: true,
          consecutiveFailures: true,
          lastSuccessAt: true,
          lastFailureAt: true,
          lastErrorMessage: true,
        },
      });

      await prisma.integrationHealth.deleteMany({
        where: { integration: TARGET_KEY },
      });

      try {
        const results = await Promise.allSettled(
          Array.from({ length: CONCURRENCY }, () =>
            recordConnectionFailure(
              TARGET_KEY,
              Object.assign(new Error("unavailable"), { code: 503 }),
            ),
          ),
        );

        const rejected = results.filter((r) => r.status === "rejected");
        expect(rejected).toHaveLength(0);

        const row = await prisma.integrationHealth.findUniqueOrThrow({
          where: { integration: TARGET_KEY },
          select: { consecutiveFailures: true, status: true },
        });
        expect(row.consecutiveFailures).toBe(CONCURRENCY);
        expect(row.status).toBe(ConnectionStatus.ERROR);
      } finally {
        if (previous) {
          const snapshot: HealthSnapshot = previous;
          await prisma.integrationHealth.upsert({
            where: { integration: TARGET_KEY },
            create: { integration: TARGET_KEY, ...snapshot },
            update: snapshot,
          });
        } else {
          await prisma.integrationHealth.deleteMany({
            where: { integration: TARGET_KEY },
          });
        }
      }
    }, 30_000);
  },
);
