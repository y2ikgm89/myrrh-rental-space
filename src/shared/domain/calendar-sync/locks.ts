/**
 * Calendar Sync 排他ロック (PostgreSQL advisory lock)
 *
 * Cloud Run 複数インスタンス間で cron / webhook の同時実行を防ぐための
 * セッションレベル advisory lock helper。route handler スコープで取得し
 * `finally` で確実に解放する責務を呼び出し側が持つ。
 *
 * AGENTS.md §Architecture Boundaries の app 層からの Prisma 直 import 禁止
 * 規約を遵守するため、`pg_try_advisory_lock` / `pg_advisory_unlock` の
 * raw query は本 module に集約される (元 `calendar-sync` 例外を完全解消)。
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
