/**
 * Playwright test process 側の PrismaClient。
 *
 * webServer 側の Prisma facade（`@/shared/db/prisma`）は `server-only` 付きで
 * spec / helper から import できないため、fixture 準備や復元 hook で DB を直接
 * 触るときはこの client を使う。DATABASE_URL は webServer と同じ env から解決する。
 *
 * process 内で 1 インスタンスを共有する（helper ごとに `new PrismaClient()` すると
 * 接続プールが helper の数だけ増える）。
 *
 * @module e2e/helpers/e2e-prisma
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

let cachedClient: PrismaClient | null = null;

export function getE2EPrismaClient(): PrismaClient {
  if (cachedClient) return cachedClient;
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Playwright webServer が env を注入していない可能性があります。",
    );
  }
  cachedClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return cachedClient;
}
