import "server-only";

/**
 * Waitlist promote 用 advisory lock。
 *
 * - namespace 728350 (event registration xact lock) は create/cancel の tx 内で使う。
 * - namespace 728354 (waitlist promote session lock) は cron が「全 slot 走査 → EXPIRED 化 → 次 promote」
 *   のバッチを event 単位で直列化するために使う。同一 event を 2 プロセスが同時に走査すると
 *   updateMany claim の順序が非決定的になる (FIFO の tie-breaker が壊れる) ため session lock で防ぐ。
 * - session lock は tx 境界を超えて存続する。commit/rollback で自動解放しない → 必ず release する。
 *
 * (namespace registry は `.claude/rules/db-domain.md` を SSoT とし、728354 を採番済み)
 */

export const WAITLIST_XACT_LOCK_NAMESPACE = 728350 as const;
export const WAITLIST_PROMOTE_LOCK_NAMESPACE = 728354 as const;

type LockClient = {
  readonly $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<T>;
  readonly $executeRaw: (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<unknown>;
};

/**
 * Non-blocking session lock for waitlist promote batch.
 * Returns true if lock was acquired, false if another process holds it.
 */
export async function tryAcquireWaitlistPromoteSessionLock(
  client: LockClient,
  eventId: string,
): Promise<boolean> {
  const rows = await client.$queryRaw<readonly { readonly locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${WAITLIST_PROMOTE_LOCK_NAMESPACE}::int4, hashtext(${eventId})) AS locked
  `;
  return rows[0]?.locked === true;
}

/**
 * Release the session lock acquired with tryAcquireWaitlistPromoteSessionLock.
 * Idempotent: safe to call in finally even if the lock was never acquired
 * (Postgres returns false for a non-owned unlock but does not throw).
 */
export async function releaseWaitlistPromoteSessionLock(
  client: LockClient,
  eventId: string,
): Promise<void> {
  await client.$queryRaw<readonly { readonly unlocked: boolean }[]>`
    SELECT pg_advisory_unlock(${WAITLIST_PROMOTE_LOCK_NAMESPACE}::int4, hashtext(${eventId})) AS unlocked
  `;
}
