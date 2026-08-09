import "server-only";

/**
 * Waitlist promote 用 advisory lock。
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
 * - namespace 728354 (waitlist promote session lock) は cron が「全 slot 走査 → EXPIRED 化 → 次 promote」
 *   のバッチを event 単位で直列化するために使う。同一 event を 2 プロセスが同時に走査すると
 *   updateMany claim の順序が非決定的になる (FIFO の tie-breaker が壊れる) ため session lock で防ぐ。
 * - session lock は tx 境界を超えて存続する。commit はもちろん **rollback でも自動解放
 *   されない** → release は tx の成否に依存させず、例外発生時にも必ず通る経路
 *   （`finally`）に置いて呼ぶ必要がある。
 * - **重要 (caller の責務)**: session lock は connection scope。呼び出し側は
 *   acquire → 作業 → release の全 span を単一物理 connection に pin し、release は
 *   `finally` で呼ぶ必要がある
 *   (例: `prisma.$transaction(async (tx) => { if (!(await tryAcquire(tx, ...))) return; try { ...; } finally { await release(tx, ...); } })`)。
 *   acquire に失敗した分岐は作業を skip し release も呼ばない（release 自体は未取得時に
 *   呼んでも idempotent に安全だが、この経路では単に呼ばれない設計）。実例は
 *   `waitlist-offer-commands.ts` の `expireAndPromoteWaitlistForEventCommand` を参照
 *   （候補ごとの作業は savepoint 相当の nested `tx.$transaction` に隔離しつつ、session
 *   lock 自体は outer tx の同一 connection で acquire/release する）。
 *   pooled top-level client で acquire と release を分けて呼ぶと別 connection にルーティング
 *   され得るため、`pg_advisory_unlock` が silent-false を返してロックが元 connection に
 *   leak し、そのイベントの waitlist promotion が pool 再利用まで止まる。
 *
 * (advisory lock namespace の SSoT はこの module の定数。728350 / 728354 を採番済み)
 */

export const WAITLIST_XACT_LOCK_NAMESPACE = 728350 as const;
export const WAITLIST_PROMOTE_LOCK_NAMESPACE = 728354 as const;

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
