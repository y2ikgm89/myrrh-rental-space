/**
 * `ReservationSeries` の DB 状態を Playwright 側から直接確認する helper。
 *
 * UI からは「キャンセル済み」の反映が cache invalidate 待ちで遅れるため、
 * spec は先に DB の `deletedAt` を polling してから reload する。
 *
 * 方針:
 *   - Playwright test process 側の PrismaClient（`./e2e-prisma`）を使う。webServer の
 *     Prisma facade は `server-only` 付きで import できない。DATABASE_URL は
 *     Bun が `.env` から自動注入するため追加設定は不要。
 *   - **read-only に徹する**。fixture の作成は
 *     `scripts/e2e/create-recurring-series-fixture.ts`（子プロセス）が担い、
 *     変異は SUT 側の UI action に任せる。
 *
 * @module e2e/helpers/reservation-series-db
 */

import { getE2EPrismaClient } from "./e2e-prisma";

/**
 * series が cancelled（`deletedAt != null`）になったかを返す。
 * spec は `expect.poll` でこれを待ってから reload する。
 */
export async function isReservationSeriesCancelled(
  seriesId: string,
): Promise<boolean> {
  const client = getE2EPrismaClient();
  const series = await client.reservationSeries.findUnique({
    where: { id: seriesId },
    select: { deletedAt: true },
  });
  return series?.deletedAt != null;
}
