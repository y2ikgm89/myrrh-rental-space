/**
 * Google Calendar API モック
 *
 * ## 型整合の方針
 * 公式 `googleapis` パッケージの `calendar_v3` namespace から
 * `Schema$Event` / `Params$Resource$Events$*` 型を **直接 import** し、
 * モック関数のパラメータ・戻り値型として再利用する。
 *
 * `googleapis` の major bump（Schema$Event の field 増減、reminders / conferenceData
 * のシェイプ変更など）が起きたとき、`google-calendar/events.ts` の実装より
 * **テストの mock factory が先に型エラーで落ちる**ことで silent contract drift を
 * 検知する。
 *
 * @see https://googleapis.dev/nodejs/googleapis/latest/calendar/index.html
 */

import { mock } from "bun:test";
import type { calendar_v3 } from "googleapis";

// =============================================================================
// Types — googleapis calendar_v3 公式型のサブセット
// =============================================================================

/**
 * テストで保持する Calendar Event の最小サブセット。
 * 上位型は `calendar_v3.Schema$Event`。null が入る列（API レスポンス由来）も
 * 公式型どおり許容する。
 */
export type MockCalendarEvent = Pick<
  calendar_v3.Schema$Event,
  "id" | "summary" | "description" | "start" | "end" | "location"
>;

/**
 * `events.insert` / `events.update` の戻り値: `{ data: Schema$Event }` 相当。
 */
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
  event: calendar_v3.Schema$Event;
}[] = [];

/**
 * 削除されたイベントIDを記録する配列
 */
export const deletedEventIds: string[] = [];

/**
 * events.insert のモック
 *
 * 公式 SDK `calendar.events.insert(Params$Resource$Events$Insert)` 互換シグネチャ。
 * `params.requestBody` は `Schema$Event` 型。
 */
export const mockEventsInsert = mock<
  (
    params: calendar_v3.Params$Resource$Events$Insert,
  ) => Promise<MockCalendarInsertResult>
>((params) => {
  const body: calendar_v3.Schema$Event = params.requestBody ?? {};
  const event: MockCalendarEvent = {
    id: `mock-event-${Date.now()}`,
    summary: body.summary ?? "Mock Event",
    description: body.description ?? null,
    start: body.start ?? { dateTime: new Date().toISOString() },
    end: body.end ?? { dateTime: new Date().toISOString() },
    location: body.location ?? null,
  };
  createdEvents.push(event);
  return Promise.resolve({ data: event });
});

/**
 * events.update のモック
 */
export const mockEventsUpdate = mock<
  (
    params: calendar_v3.Params$Resource$Events$Update,
  ) => Promise<MockCalendarInsertResult>
>((params) => {
  const body: calendar_v3.Schema$Event = params.requestBody ?? {};
  updatedEvents.push({ eventId: params.eventId ?? "", event: body });
  const event: MockCalendarEvent = {
    id: params.eventId ?? null,
    summary: body.summary ?? "Updated Event",
    description: body.description ?? null,
    start: body.start ?? { dateTime: new Date().toISOString() },
    end: body.end ?? { dateTime: new Date().toISOString() },
    location: body.location ?? null,
  };
  return Promise.resolve({ data: event });
});

/**
 * events.delete のモック
 */
export const mockEventsDelete = mock<
  (params: calendar_v3.Params$Resource$Events$Delete) => Promise<void>
>((params) => {
  deletedEventIds.push(params.eventId ?? "");
  return Promise.resolve();
});

/**
 * events.list のモック
 */
export const mockEventsList = mock<
  (
    params: calendar_v3.Params$Resource$Events$List,
  ) => Promise<{ data: calendar_v3.Schema$Events }>
>(() => {
  return Promise.resolve({
    data: { items: [...createdEvents] } as calendar_v3.Schema$Events,
  });
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
  event: calendar_v3.Schema$Event;
}[] {
  return [...updatedEvents];
}

/**
 * 削除されたイベントIDを取得
 */
export function getDeletedEventIds(): string[] {
  return [...deletedEventIds];
}
