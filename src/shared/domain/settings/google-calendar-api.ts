/**
 * Google Calendar events orchestration。
 *
 * `shared/lib/google-calendar` は client + calendarId + reminderMinutes を
 * 注入する純粋 API。本モジュールが Settings を解決して注入する。
 *
 * @module shared/domain/settings/google-calendar-api
 */

import "server-only";

import type { calendar_v3 } from "googleapis";
import { getGoogleCalendarSettings } from "@/shared/domain/settings/admin-queries";
import { getServiceAccountClient } from "@/shared/domain/settings/google-calendar";
import {
  addMeetConferenceToCalendarEvent as addMeetConferenceToCalendarEventApi,
  createCalendarEvent as createCalendarEventApi,
  deleteCalendarEvent as deleteCalendarEventApi,
  fetchEventInstances as fetchEventInstancesApi,
  getCalendarEvent as getCalendarEventApi,
  patchCalendarEvent as patchCalendarEventApi,
  updateCalendarEvent as updateCalendarEventApi,
} from "@/shared/lib/google-calendar/events";
import type {
  CalendarEventInstance,
  CalendarEventParams,
  CalendarEventResult,
  GoogleCalendarEventWriteContext,
} from "@/shared/lib/google-calendar/types";

export type { GoogleCalendarEventWriteContext };

export type ResolveGoogleCalendarWriteContextResult =
  | { ok: true; ctx: GoogleCalendarEventWriteContext }
  | { ok: false; error: string };

export async function resolveGoogleCalendarWriteContext(options?: {
  ignoreEnabledToggle?: boolean;
}): Promise<ResolveGoogleCalendarWriteContextResult> {
  const client = await getServiceAccountClient(options);
  if (!client) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();
  if (!settings.calendarId) {
    return { ok: false, error: "Calendar ID is not configured" };
  }

  return {
    ok: true,
    ctx: {
      client,
      calendarId: settings.calendarId,
      reminderMinutes: settings.reminderMinutes,
    },
  };
}

/**
 * カレンダーにイベントを作成
 *
 * `options.withMeet` は呼出元がイベント単位で指定する（例: `Event.meetingProvider ===
 * "GOOGLE_MEET"`）。未指定時は `false` 扱い（Meet を発行しない）。
 */
export async function createCalendarEvent(
  params: CalendarEventParams,
  options?: { withMeet?: boolean },
): Promise<CalendarEventResult> {
  const resolved = await resolveGoogleCalendarWriteContext();
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  return createCalendarEventApi(resolved.ctx, params, options);
}

/**
 * カレンダーイベントを部分更新 (予約・イベントの通常 update 経路)。
 */
export async function updateCalendarEvent(
  eventId: string,
  params: CalendarEventParams,
): Promise<CalendarEventResult> {
  const resolved = await resolveGoogleCalendarWriteContext();
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  return updateCalendarEventApi(resolved.ctx, eventId, params);
}

/**
 * カレンダーイベントを明示的な部分 patch。
 *
 * `options.ignoreEnabledToggle` (GCAL-OUTBOUND-05): series の this-and-following
 * キャンセルは打ち切り (実質 delete 相当) のため、`googleCalendarEnabled` トグル
 * OFF でも実行できるようにする呼出し元 (`patchGcalMasterUntil`) 向け。
 */
export async function patchCalendarEvent(
  eventId: string,
  patch: Partial<
    Pick<
      calendar_v3.Schema$Event,
      "summary" | "description" | "location" | "recurrence"
    >
  >,
  options?: { ignoreEnabledToggle?: boolean },
): Promise<CalendarEventResult> {
  const resolved = await resolveGoogleCalendarWriteContext(options);
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  return patchCalendarEventApi(resolved.ctx, eventId, patch);
}

/**
 * カレンダーイベントを削除
 *
 * `options.ignoreEnabledToggle` (GCAL-OUTBOUND-05): true のとき
 * `googleCalendarEnabled` トグル OFF でも削除を実行する。
 */
export async function deleteCalendarEvent(
  eventId: string,
  options?: { ignoreEnabledToggle?: boolean },
): Promise<{ success: true } | { success: false; error: string }> {
  const resolved = await resolveGoogleCalendarWriteContext(options);
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  return deleteCalendarEventApi(resolved.ctx, eventId);
}

/**
 * 既存 GCal event に Google Meet conference を付与する (Meet URL retry 用)。
 */
export async function addMeetConferenceToCalendarEvent(
  eventId: string,
): Promise<CalendarEventResult> {
  const resolved = await resolveGoogleCalendarWriteContext();
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  return addMeetConferenceToCalendarEventApi(resolved.ctx, eventId);
}

/**
 * 特定のイベントを取得
 */
export async function getCalendarEvent(eventId: string): Promise<{
  success: boolean;
  event?: calendar_v3.Schema$Event;
  error?: string;
}> {
  const resolved = await resolveGoogleCalendarWriteContext();
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  return getCalendarEventApi(resolved.ctx, eventId);
}

/**
 * Recurring event の master ID から展開済み occurrence 一覧を取得する。
 */
export async function fetchEventInstances(masterEventId: string): Promise<{
  success: boolean;
  instances?: CalendarEventInstance[];
  error?: string;
}> {
  const resolved = await resolveGoogleCalendarWriteContext();
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  return fetchEventInstancesApi(resolved.ctx, masterEventId);
}
