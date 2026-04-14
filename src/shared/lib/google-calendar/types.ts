import "server-only";

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
  pollingIntervalMin: number;
  lastSyncedAt: Date | null;
  webhookExpiration: Date | null;
}
