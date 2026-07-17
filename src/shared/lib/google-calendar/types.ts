import "server-only";

import type { calendar_v3 } from "googleapis";
import type { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Calendar Event Types
// =============================================================================

export interface CalendarEventParams {
  summary: string;
  description: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  /**
   * RFC 5545 recurrence rules (e.g. `["RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10"]`)。
   * 指定時、Google Calendar 側に recurring event として master を作成し、
   * 各 occurrence は API `events.instances(masterId)` で取得できる (Phase B.2 task 16)。
   * `RRULE:` prefix 込みの完全形で渡す必要がある (Google Calendar API 契約)。
   */
  recurrence?: string[];
}

/**
 * Recurring event の展開済み occurrence (Phase B.2 task 16)。
 * `client.events.instances(masterEventId)` の応答から必要 field を抽出。
 */
export interface CalendarEventInstance {
  /** occurrence の event ID (child ID)。`{masterId}_{yyyymmddTHHMMSSZ}` 形式。 */
  readonly id: string;
  /** occurrence の開始時刻 (UTC)。RRULE から展開された確定時刻。 */
  readonly startTime: Date;
}

export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  eventUrl?: string;
  /**
   * Google Calendar API の生レスポンス（`events.insert` の `response.data`）。
   * `createCalendarEvent` の成功時のみ設定される。呼出元は `withMeet: true` 時に
   * `event.hangoutLink`（deprecated）または `event.conferenceData.entryPoints`
   * から video entry point の `uri` を抽出して Meet URL を取得する（Phase B.1 task 8）。
   */
  event?: calendar_v3.Schema$Event;
  error?: string;
}

export interface CalendarConnectionTestResult {
  success: boolean;
  calendarName?: string;
  accountEmail?: string;
  error?: string;
}

export interface GoogleCalendarSettings {
  enabled: boolean;
  calendarId: string | null;
  connectionStatus: "connected" | "error" | null;
  lastTestedAt: Date | null;
  oauthEnabled: boolean;
}

// =============================================================================
// Two-Way Sync Types
// =============================================================================

export interface CalendarChange {
  eventId: string;
  status: "confirmed" | "cancelled" | "tentative";
  summary?: string;
  startTime?: Date;
  endTime?: Date;
  updatedAt: Date;
  deleted: boolean;
}

export interface SyncChangesResult {
  success: boolean;
  changes: CalendarChange[];
  newSyncToken?: string;
  error?: string;
}

// =============================================================================
// Webhook Types
// =============================================================================

export interface WebhookSetupResult {
  success: boolean;
  channelId?: string;
  resourceId?: string;
  expiration?: Date;
  error?: string;
}

export interface WebhookRenewalResult {
  success: boolean;
  renewed: boolean;
  newExpiration?: Date;
  error?: string;
}

export interface TwoWaySyncSettings {
  enabled: boolean;
  syncMethod: CalendarSyncMethod;
  lastSyncedAt: Date | null;
  webhookExpiration: Date | null;
}
