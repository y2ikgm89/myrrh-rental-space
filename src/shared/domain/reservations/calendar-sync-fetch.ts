/**
 * Google Calendar 増分同期（inbound）用の fetch orchestration。
 *
 * lib `fetchCalendarChanges` は client/calendarId 注入の純粋 API。
 * syncToken 期限切れ時の永続化クリアは本モジュールが hook として注入する。
 *
 * @module shared/domain/reservations/calendar-sync-fetch
 */

import "server-only";

import { clearCalendarSyncToken } from "@/shared/domain/reservations/calendar-sync";
import { resolveGoogleCalendarWriteContext } from "@/shared/domain/settings/google-calendar-api";
import { fetchCalendarChanges as fetchCalendarChangesApi } from "@/shared/lib/google-calendar/sync";
import type { SyncChangesResult } from "@/shared/lib/google-calendar/types";

/**
 * カレンダーの変更を取得（増分同期）。
 *
 * syncToken 期限切れ時は `clearCalendarSyncToken` 後にフルシンクをやり直す。
 */
export async function fetchCalendarChanges(
  syncToken?: string | null,
): Promise<SyncChangesResult> {
  const resolved = await resolveGoogleCalendarWriteContext();
  if (!resolved.ok) {
    return {
      success: false,
      changes: [],
      error: resolved.error,
    };
  }

  return fetchCalendarChangesApi(resolved.ctx, syncToken, {
    onFullSyncRequired: clearCalendarSyncToken,
  });
}
