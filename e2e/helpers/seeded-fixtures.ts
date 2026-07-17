/**
 * Seed 済 fixture の instance ID を取得する E2E helper (Phase B.2.1 Task B 続報)。
 *
 * webServer (playwright.config.ts) が起動時に `bun prisma/seed.ts --dev` を
 * 実行して確定させる fixture 群にアクセスするための最小 helper。基本方針:
 *
 *   - Playwright test process 側で独立した PrismaClient を持つ (webServer の
 *     Prisma facade を触らない)。DATABASE_URL は Bun が `.env` から自動注入する
 *     ため追加設定不要。
 *   - findFirst の select は id のみに絞り、read-only に徹する (fixture の
 *     mutate はここでは行わない — 変異は SUT 側 UI action に任せる)。
 *   - fixture が存在しないケースは実行環境ミスなので throw で fail-fast する。
 *
 * @module e2e/helpers/seeded-fixtures
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

let cachedClient: PrismaClient | null = null;

function getE2EPrismaClient(): PrismaClient {
  if (cachedClient) return cachedClient;
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Playwright webServer が env を注入していない可能性があります。",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  cachedClient = new PrismaClient({ adapter });
  return cachedClient;
}

/**
 * Task B seed の `seedRecurringReservationSeriesFixture` で作成された series の
 * 最も早い instance ID を返す (cancelled 済は除外)。E2E spec は返却 UUID で
 * `/admin/reservations/{id}` に navigate して SeriesInfoSection の 3 択 cancel を
 * 検証する。
 *
 * @param markerNotesPrefix `seriesFixtures.markerNotesPrefix` (fixture SSoT)
 */
export async function getSeededSeriesFirstInstanceId(
  markerNotesPrefix: string,
): Promise<string> {
  const client = getE2EPrismaClient();
  const instance = await client.reservation.findFirst({
    where: {
      notes: { startsWith: markerNotesPrefix },
      status: "CONFIRMED",
      deletedAt: null,
    },
    orderBy: { startTime: "asc" },
    select: { id: true, seriesId: true },
  });
  if (!instance) {
    throw new Error(
      `Seeded ReservationSeries fixture not found (marker="${markerNotesPrefix}"). ` +
        `Ensure webServer executed \`bun prisma/seed.ts --dev\` and the series ` +
        `has active (non-cancelled) instances.`,
    );
  }
  return instance.id;
}

/**
 * Task B seed fixture の series ID を返す (fixture 定数 SSoT を経由した lookup)。
 * E2E spec が cancel flow 実行後に `reservationSeries.deletedAt` を assert する
 * ために使う。
 */
export async function getSeededSeriesId(
  markerNotesPrefix: string,
): Promise<string> {
  const client = getE2EPrismaClient();
  const instance = await client.reservation.findFirst({
    where: {
      notes: { startsWith: markerNotesPrefix },
      deletedAt: null,
    },
    orderBy: { startTime: "asc" },
    select: { seriesId: true },
  });
  if (!instance?.seriesId) {
    throw new Error(
      `Seeded ReservationSeries fixture not found (marker="${markerNotesPrefix}"). ` +
        `Ensure webServer executed \`bun prisma/seed.ts --dev\`.`,
    );
  }
  return instance.seriesId;
}

/**
 * Task B seed fixture の series が cancelled (deletedAt != null) 状態かを polling
 * で確認する。E2E spec の cancel 発火後の状態確認に使う。
 */
export async function isSeededSeriesCancelled(
  seriesId: string,
): Promise<boolean> {
  const client = getE2EPrismaClient();
  const series = await client.reservationSeries.findUnique({
    where: { id: seriesId },
    select: { deletedAt: true },
  });
  return series?.deletedAt !== null && series?.deletedAt !== undefined;
}
