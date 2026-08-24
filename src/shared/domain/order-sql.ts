import "server-only";

import { Prisma } from "@generated/prisma/client";

const TEMP_ORDER_BASE = -1_000_000;
import { SPACE_SCHEDULE_LOCK_NAMESPACE as ORDER_SCOPE_LOCK_NAMESPACE } from "@/shared/domain/advisory-lock-namespaces";

/**
 * Unique order indexes cannot tolerate direct swaps such as 0 <-> 1.
 * Reorder commands first move target rows to collision-free temporary values,
 * then apply the final CASE expression in the same transaction/statement flow.
 *
 * Every id column in the schema is `uuid` (PR #1908 unified them), so the cast is
 * always `::uuid`. There used to be a cast-less `buildTextOrderSqlFragments` for
 * the cuid era; it survived pointed at a uuid column and only worked because
 * PostgreSQL coerces the `unknown`-typed bind parameter from context. Do not
 * reintroduce an uncast variant — an explicit cast is what makes the CASE
 * expression's type inference deterministic (see the `::int4` note below).
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
      Prisma.sql`WHEN ${id}::uuid THEN ${TEMP_ORDER_BASE - index}::int4`,
    );
    finalCases.push(
      Prisma.sql`WHEN ${id}::uuid THEN ${getOrder(item, index)}::int4`,
    );
  }

  return { ids, tempCases, finalCases };
}

/**
 * Serializes "read max(order) then append" operations per ordered surface/scope.
 *
 * PostgreSQL's xact advisory lock is connection-safe inside Prisma interactive
 * transactions and is automatically released on commit/rollback.
 *
 * The namespace is shared with the Space schedule locks on purpose — see the
 * `SPACE_SCHEDULE_LOCK_NAMESPACE` docstring for why splitting it would break the
 * descending acquisition order that prevents deadlocks. The key spaces are
 * unrelated (`hashtext(scope)` vs `spaceId`).
 */
export function buildOrderScopeLockSql(scope: string): Prisma.Sql {
  return Prisma.sql`SELECT pg_advisory_xact_lock(${ORDER_SCOPE_LOCK_NAMESPACE}::int4, hashtext(${scope}))`;
}
