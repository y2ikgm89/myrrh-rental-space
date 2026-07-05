import "server-only";

import { Prisma } from "@generated/prisma/client";

const TEMP_ORDER_BASE = -1_000_000;
const ORDER_SCOPE_LOCK_NAMESPACE = 728351;

/**
 * Unique order indexes cannot tolerate direct swaps such as 0 <-> 1.
 * Reorder commands first move target rows to collision-free temporary values,
 * then apply the final CASE expression in the same transaction/statement flow.
 */
export function buildUuidOrderSqlFragments<T>(
  items: readonly T[],
  getId: (item: T) => string,
  getOrder: (item: T, index: number) => number,
): {
  ids: Prisma.Sql[];
  tempCases: Prisma.Sql[];
  finalCases: Prisma.Sql[];
} {
  const ids: Prisma.Sql[] = [];
  const tempCases: Prisma.Sql[] = [];
  const finalCases: Prisma.Sql[] = [];

  for (const [index, item] of items.entries()) {
    const id = getId(item);
    ids.push(Prisma.sql`${id}::uuid`);
    tempCases.push(
      Prisma.sql`WHEN ${id}::uuid THEN ${TEMP_ORDER_BASE - index}`,
    );
    finalCases.push(Prisma.sql`WHEN ${id}::uuid THEN ${getOrder(item, index)}`);
  }

  return { ids, tempCases, finalCases };
}

export function buildTextOrderSqlFragments<T>(
  items: readonly T[],
  getId: (item: T) => string,
  getOrder: (item: T, index: number) => number,
): {
  ids: Prisma.Sql[];
  tempCases: Prisma.Sql[];
  finalCases: Prisma.Sql[];
} {
  const ids: Prisma.Sql[] = [];
  const tempCases: Prisma.Sql[] = [];
  const finalCases: Prisma.Sql[] = [];

  for (const [index, item] of items.entries()) {
    const id = getId(item);
    ids.push(Prisma.sql`${id}`);
    tempCases.push(Prisma.sql`WHEN ${id} THEN ${TEMP_ORDER_BASE - index}`);
    finalCases.push(Prisma.sql`WHEN ${id} THEN ${getOrder(item, index)}`);
  }

  return { ids, tempCases, finalCases };
}

/**
 * Serializes "read max(order) then append" operations per ordered surface/scope.
 *
 * PostgreSQL's xact advisory lock is connection-safe inside Prisma interactive
 * transactions and is automatically released on commit/rollback.
 */
export function buildOrderScopeLockSql(scope: string): Prisma.Sql {
  return Prisma.sql`SELECT pg_advisory_xact_lock(${ORDER_SCOPE_LOCK_NAMESPACE}::int4, hashtext(${scope}))`;
}
