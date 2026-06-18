/**
 * Calendar Sync 排他ロック (PostgreSQL advisory lock)
 *
 * Cloud Run 複数インスタンス間で cron / webhook の同時実行を防ぐための
 * セッションレベル advisory lock helper。route handler スコープで取得し
 * `finally` で確実に解放する責務を呼び出し側が持つ。
 *
 * CLAUDE.md のアーキテクチャ境界（app 層からの Prisma 直 import 禁止）
 * 規約を遵守するため、`pg_try_advisory_lock` / `pg_advisory_unlock` の
 * raw query は本 module に集約される (元 `calendar-sync` 例外を完全解消)。
 *
 * ── 既知の限界と設計判断（pooled connection / session lock）──────────────
 * `pg_try_advisory_lock` は **セッション（接続）レベル**で、acquire と release が
 * pg.Pool 上の別接続にルーティングされると release が no-op になり、取得側接続が
 * idle 回収（idleTimeout 300s）されるまでロックを保持し続ける（cross-connection leak）。
 *
 * これを「sync 本体を interactive `$transaction` で囲み `pg_try_advisory_xact_lock`
 * （tx 終了時に同一接続で自動解放）に変える」案は **採用しない**: 本ロックが保護する
 * `renewWebhookIfNeeded()` / `syncFromCalendar()` は長時間の外部 Google Calendar API
 * 呼び出しを含むため、その間ずっと DB トランザクション（とプール接続）を保持することになり
 * `idle_in_transaction_session_timeout` / `statement_timeout` で同期が中断する
 * （長時間トランザクション中の外部 I/O は anti-pattern）。
 *
 * 現状この leak は無害: デプロイは `_MAX_INSTANCES: "1"`（cloudbuild.yaml）で複数
 * インスタンス排他という本来の目的が発生せず、Cloud Scheduler の cron は逐次実行のため
 * 同一インスタンスへの同時リクエストも実質起きない（同期は warm 接続の再入で成立する）。
 *
 * マルチインスタンス化・高頻度化する場合は、advisory lock ではなく
 * **DB ロウベースの lease ロック**（`running` + `leasedUntil` 列を `UPDATE ... WHERE`
 * で原子的に取得・TTL でクラッシュ復旧）へ移行する（接続非依存・長時間処理に適合）。
 * これは migration を要するため別途 `bun run db:migrate` での対応が必要。
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * Calendar Sync 排他ロックの advisory lock ID
 *
 * PostgreSQL の advisory lock 名前空間は int4 / int8 で、本プロジェクト内の
 * 他の用途と衝突しないよう固定値を割り当てる。将来別の cron / webhook で
 * 排他ロックが必要になった場合は別 ID を採番する。
 */
export const CALENDAR_SYNC_LOCK_ID = 728349;

/**
 * Calendar Sync 用 advisory lock を非ブロッキングで取得する。
 *
 * @returns `true` ならロック取得成功、`false` なら他インスタンスが保持中
 */
export async function tryAcquireCalendarSyncLock(): Promise<boolean> {
  const result = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`
    SELECT pg_try_advisory_lock(${CALENDAR_SYNC_LOCK_ID})
  `;
  return result[0]?.pg_try_advisory_lock === true;
}

/**
 * Calendar Sync 用 advisory lock を解放する。
 *
 * `tryAcquireCalendarSyncLock` 成功後の `finally` ブロックで必ず呼ぶこと。
 */
export async function releaseCalendarSyncLock(): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${CALENDAR_SYNC_LOCK_ID})`;
}
