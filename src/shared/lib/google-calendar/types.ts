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
