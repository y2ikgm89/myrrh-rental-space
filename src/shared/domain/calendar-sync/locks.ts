/**
 * Calendar Sync の多重起動防止（**DB row lease**）
 *
 * cron ポーリングと Google Calendar webhook が同じ `syncFromCalendar` /
 * `renewWebhookIfNeeded` を叩くので、両者を 1 本に直列化する。
 *
 * ## なぜ session advisory lock をやめたか（監査 A-66）
 *
 * 旧実装は `pg_try_advisory_lock` + 明示 `pg_advisory_unlock` の
 * **セッション（接続）レベル**ロックだった。Prisma は 1 クエリごとに pg.Pool から
 * 接続を借りるので、acquire と release が別接続に載ると release が黙って no-op になり、
 * 取得側の接続が idle 回収されるまでロックが残る（cross-connection leak）。
 * **正常終了でも起こる**のが厄介なところで、以後の cron / webhook は
 * `skipped` を 200 で返すだけ（両経路とも `logError` を通らない）ため、
 * 同期が数分〜十数分止まってもログに 1 行も出ない。
 *
 * 旧コメントはこの leak を「無害」としていたが、根拠が 2 つとも成立していなかった:
 *
 * - 「デプロイは `_MAX_INSTANCES: "1"`（cloudbuild.yaml）」 — その substitution は
 *   存在しない。実際の制御は `terraform/cloud_run_public.tf` の `max_instance_count`
 *   で、cloudbuild.yaml 自身が「Cloud Run の shape は Terraform SSoT」と書いている。
 * - 「cron は逐次実行なので同時リクエストは実質起きない」 — 同じリポジトリの
 *   `/api/webhooks/google-calendar` が「webhook 通知はバーストしやすく（同一変更で
 *   複数通知が短時間に届く公式仕様）」と書いており、その経路が同じロックを取る。
 *   `max_instance_request_concurrency = 80` なので単一インスタンスでも同時実行は前提。
 *
 * ## なぜ xact lock でもないか
 *
 * `pg_try_advisory_xact_lock` は tx 終了で同一接続から自動解放されるので leak しないが、
 * このロックが守る処理は Google Calendar API 呼び出しを含む。その間ずっと
 * トランザクション（とプール接続）を保持することになり、
 * `idle_in_transaction_session_timeout` / `statement_timeout` で同期が切れる。
 * 長時間トランザクション中の外部 I/O は anti-pattern。
 *
 * ## row lease の性質
 *
 * `UPDATE ... WHERE` 1 文で原子的に取得する。**接続に依存しない**ので、
 * release がどの接続に載っても確実に効く。プロセスが死んだ場合は TTL 切れで
 * 次の呼び出しが奪える。同型の先例は
 * `src/shared/domain/events/waitlist-locks.ts`（`events.waitlist_promote_leased_until`）。
 *
 * release は**自分が取ったリースだけ**を消す。TTL 自己回復のあとに古い `finally` が
 * 走って、新しい保持者のリースを消してしまうのを防ぐ。
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * リースの有効期間。
 *
 * Cloud Run の request timeout（`terraform/cloud_run_public.tf` の `timeout`）を
 * **超える**長さにする。短いと、まだ走っているリクエストからリースを奪ってしまい
 * 二重実行になる。長すぎるとクラッシュ後の回復が遅れる。
 *
 * 現在の request timeout は 300 秒なので 330 秒。timeout を変えるときはここも見る。
 */
const CALENDAR_SYNC_LEASE_TTL_MS = 330_000;

/** `SettingsGoogleCalendar` は単一行。 */
const SETTINGS_SINGLETON_ID = "singleton";

/**
 * Calendar Sync のリースを非ブロッキングで取得する。
 *
 * @returns 書き込んだ `leasedUntil`。他プロセスが有効なリースを持っていれば `null`。
 *   戻り値は `releaseCalendarSyncLease` にそのまま渡すこと。
 */
export async function tryAcquireCalendarSyncLease(
  /**
   * リースの基準時刻。**本番コードからは渡さない。**
   * 古い時刻を渡すと TTL がその分だけ短くなり、処理を覆えなくなる。
   * 引数はテストが期限切れを作るためだけに残してある。
   */
  now: Date = new Date(),
): Promise<Date | null> {
  const leasedUntil = new Date(now.getTime() + CALENDAR_SYNC_LEASE_TTL_MS);
  const rows = await prisma.$queryRaw<readonly { readonly id: string }[]>`
    UPDATE settings_google_calendar
    SET google_calendar_sync_leased_until = ${leasedUntil}
    WHERE id = ${SETTINGS_SINGLETON_ID}
      AND (
        google_calendar_sync_leased_until IS NULL
        OR google_calendar_sync_leased_until < ${now}
      )
    RETURNING id
  `;
  return rows.length === 1 ? leasedUntil : null;
}

/**
 * 自分が取ったリースだけを解放する。
 *
 * `leasedUntil` の一致を条件にしているので、TTL 切れで別プロセスが取り直したあとに
 * 古い `finally` が走っても、新しい保持者のリースは消えない。
 */
export async function releaseCalendarSyncLease(
  leasedUntil: Date,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE settings_google_calendar
    SET google_calendar_sync_leased_until = NULL
    WHERE id = ${SETTINGS_SINGLETON_ID}
      AND google_calendar_sync_leased_until = ${leasedUntil}
  `;
}
