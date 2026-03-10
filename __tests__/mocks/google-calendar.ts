/**
 * Google Calendar API モック
 *
 * Google Calendar 連携をテストするためのモック実装
 */

import { mock } from "bun:test";

// =============================================================================
// Types
// =============================================================================

export interface MockCalendarEvent {
  id: string;
  summary: string;
  description?: string | undefined;
  start: { dateTime: string; timeZone?: string | undefined };
  end: { dateTime: string; timeZone?: string | undefined };
  location?: string | undefined;
}

export interface MockCalendarInsertResult {
  data: MockCalendarEvent;
}

// =============================================================================
// Mock Implementation
// =============================================================================

/**
 * 作成されたイベントを記録する配列
 */
export const createdEvents: MockCalendarEvent[] = [];

/**
 * 更新されたイベントを記録する配列
 */
export const updatedEvents: {
  eventId: string;
  event: Partial<MockCalendarEvent>;
}[] = [];

/**
 * 削除されたイベントIDを記録する配列
 */
export const deletedEventIds: string[] = [];

/**
 * events.insert のモック
 */
export const mockEventsInsert = mock<
  (params: {
    calendarId: string;
    requestBody: Partial<MockCalendarEvent>;
  }) => Promise<MockCalendarInsertResult>
>((params) => {
  const event: MockCalendarEvent = {
    id: `mock-event-${Date.now()}`,
    summary: params.requestBody.summary ?? "Mock Event",
    description: params.requestBody.description,
    start: params.requestBody.start ?? { dateTime: new Date().toISOString() },
    end: params.requestBody.end ?? { dateTime: new Date().toISOString() },
    location: params.requestBody.location,
  };
  createdEvents.push(event);
  return Promise.resolve({ data: event });
});

/**
 * events.update のモック
 */
export const mockEventsUpdate = mock<
  (params: {
    calendarId: string;
    eventId: string;
    requestBody: Partial<MockCalendarEvent>;
  }) => Promise<MockCalendarInsertResult>
>((params) => {
  updatedEvents.push({ eventId: params.eventId, event: params.requestBody });
  const event: MockCalendarEvent = {
    id: params.eventId,
    summary: params.requestBody.summary ?? "Updated Event",
    description: params.requestBody.description,
    start: params.requestBody.start ?? { dateTime: new Date().toISOString() },
    end: params.requestBody.end ?? { dateTime: new Date().toISOString() },
    location: params.requestBody.location,
  };
  return Promise.resolve({ data: event });
});

/**
 * events.delete のモック
 */
export const mockEventsDelete = mock<
  (params: { calendarId: string; eventId: string }) => Promise<void>
>((params) => {
  deletedEventIds.push(params.eventId);
  return Promise.resolve();
});

/**
 * events.list のモック
 */
export const mockEventsList = mock<
  (params: {
    calendarId: string;
    timeMin?: string;
    timeMax?: string;
  }) => Promise<{ data: { items: MockCalendarEvent[] } }>
>(() => {
  return Promise.resolve({ data: { items: [...createdEvents] } });
});

/**
 * Google Calendar クライアントのモック
 */
export const mockCalendarClient = {
  events: {
    insert: mockEventsInsert,
    update: mockEventsUpdate,
    delete: mockEventsDelete,
    list: mockEventsList,
  },
};

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * モックをリセット
 */
export function resetGoogleCalendarMock(): void {
  createdEvents.length = 0;
  updatedEvents.length = 0;
  deletedEventIds.length = 0;
  mockEventsInsert.mockClear();
  mockEventsUpdate.mockClear();
  mockEventsDelete.mockClear();
  mockEventsList.mockClear();
}

/**
 * 作成されたイベントを取得
 */
export function getCreatedEvents(): MockCalendarEvent[] {
  return [...createdEvents];
}

/**
 * 更新されたイベントを取得
 */
export function getUpdatedEvents(): {
  eventId: string;
  event: Partial<MockCalendarEvent>;
}[] {
  return [...updatedEvents];
}

/**
 * 削除されたイベントIDを取得
 */
export function getDeletedEventIds(): string[] {
  return [...deletedEventIds];
}
