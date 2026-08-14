import "server-only";

/**
 * Waitlist promote 用ロック。
 *
 * ## Advisory lock 取得順序（deadlock 回避）
 *
 * 複数 namespace を同一 tx で取る場合は **常に番号降順**:
 * `728351` (space schedule) → `728350` (event registration capacity) → …
 *
 * - 予約 / series: `728357` (series) → `728351` (space) — reservations/series-advisory-lock.ts
 * - イベント管理更新 (`updateEventCommand`): `728351` (space overlap がある場合) →
 *   `728350` (slot/ticket 定員 sync の直前) — 申込 create/cancel/waitlist と直列化
 * - イベント申込のみ: `728350` のみ
 *
 * - namespace 728350 (event registration xact lock) は create/cancel / 管理更新の定員 sync で使う。
 * - waitlist promote の event 単位直列化は **DB row lease**
 *   (`events.waitlist_promote_leased_until`)。`UPDATE ... WHERE` で原子的に取得し、
 *   TTL 切れで自己回復する。session lock (728354) は使わない — ITX timeout 後の
 *   `pg_advisory_unlock` が P2028 になり、プール接続に lock が残るため。
 *
 * (advisory lock namespace の SSoT はこの module の定数。728350 を使う。
 * 728354 は採番済みのまま残し、再利用しない)
 */

import { EVENT_REGISTRATION_LOCK_NAMESPACE } from "@/shared/domain/advisory-lock-namespaces";

/** 採番の SSoT は `advisory-lock-namespaces.ts`。ここは歴史的な別名を保つだけ。 */
const WAITLIST_XACT_LOCK_NAMESPACE = EVENT_REGISTRATION_LOCK_NAMESPACE;
export { WAITLIST_XACT_LOCK_NAMESPACE };

/**
 * promote バッチの ITX timeout (20s) を超える長さ。crash 後は TTL で奪える。
 * ITX timeout 自体は変えない。
 */
const WAITLIST_PROMOTE_LEASE_TTL_MS = 30_000;

/**
 * イベント単位の申込定員直列化ロック（xact scope）。
 * commit / rollback で自動解放。void 戻り値のため $executeRaw を使用。
 */
export async function lockEventRegistrationForTransaction(
  client: LockClient,
  eventId: string,
): Promise<void> {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${eventId}))`;
}

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
 * Non-blocking row lease for waitlist promote batch.
 * Returns the `leasedUntil` we wrote, or null if another process holds a live one.
 */
export async function tryAcquireWaitlistPromoteLease(
  client: LockClient,
  eventId: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const leasedUntil = new Date(now.getTime() + WAITLIST_PROMOTE_LEASE_TTL_MS);
  const rows = await client.$queryRaw<readonly { readonly id: string }[]>`
    UPDATE events
    SET waitlist_promote_leased_until = ${leasedUntil}
    WHERE id = ${eventId}::uuid
      AND (
        waitlist_promote_leased_until IS NULL
        OR waitlist_promote_leased_until < ${now}
      )
      AND id IN (
        SELECT id FROM events
        WHERE id = ${eventId}::uuid
        FOR UPDATE SKIP LOCKED
      )
    RETURNING id
  `;
  return rows.length === 1 ? leasedUntil : null;
}

/**
 * Release only the lease we acquired. A stale finally must not clear a
 * newer holder's `leasedUntil` after TTL self-heal.
 */
export async function releaseWaitlistPromoteLease(
  client: LockClient,
  eventId: string,
  leasedUntil: Date,
): Promise<void> {
  await client.$executeRaw`
    UPDATE events
    SET waitlist_promote_leased_until = NULL
    WHERE id = ${eventId}::uuid
      AND waitlist_promote_leased_until = ${leasedUntil}
  `;
}
