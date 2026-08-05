import type { Prisma } from "@generated/prisma/client";

type PrismaClient = typeof import("@/shared/db/prisma").prisma;

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

/**
 * Integration test cleanup only. Refunds are append-only at the DB layer;
 * deleteMany requires the transaction-local bypass GUC read by the
 * `prevent_refunds_mutation` trigger (SSoT: `prisma/baseline/invariants.sql`).
 */
export async function deleteRefundsForTest(
  prisma: PrismaClient,
  where: Prisma.RefundWhereInput,
): Promise<void> {
  await prisma.$transaction(async (tx: TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('myrrh.refund_mutation_bypass', 'seed', true)`;
    await tx.refund.deleteMany({ where });
  });
}
