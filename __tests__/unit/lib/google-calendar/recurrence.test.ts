/**
 * Google Calendar recurring event API 経路の unit test（Phase B.2 task 16）。
 *
 * 検証観点:
 *   1. `buildEventBody` は `recurrence` field を渡されれば requestBody に含め、
 *      未指定 (undefined) または空配列なら omit する。
 *   2. `fetchEventInstances` は googleapis の `events.instances(masterId)` を
 *      wrap し、id + start.dateTime 両方が揃った item のみ返す。設定 undefined /
 *      client 未設定時は success:false。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { calendar_v3 } from "googleapis";

import { buildEventBody } from "@/shared/lib/google-calendar/events";
import type { CalendarEventParams } from "@/shared/lib/google-calendar/types";
import type { GoogleCalendarSettingsData } from "@/shared/domain/settings/types";

// -----------------------------------------------------------------------------
// buildEventBody: recurrence pass-through
// -----------------------------------------------------------------------------

const DEFAULT_SETTINGS: GoogleCalendarSettingsData = {
  enabled: true,
  calendarId: "test-calendar",
  connectionStatus: "connected",
  lastTestedAt: null,
  reminderMinutes: null,
};

const BASE_PARAMS: CalendarEventParams = {
  summary: "test event",
  description: "desc",
  startTime: new Date("2027-05-04T10:00:00.000Z"),
  endTime: new Date("2027-05-04T12:00:00.000Z"),
};

describe("buildEventBody — recurrence pass-through (task 16)", () => {
  test("recurrence 未指定なら requestBody に recurrence が含まれない", () => {
    const body = buildEventBody(BASE_PARAMS, DEFAULT_SETTINGS, {});
    expect(body.recurrence).toBeUndefined();
  });

  test("recurrence 空配列なら omit される (Google Calendar API 契約: 空 array 送信は避ける)", () => {
    const body = buildEventBody(
      { ...BASE_PARAMS, recurrence: [] },
      DEFAULT_SETTINGS,
      {},
    );
    expect(body.recurrence).toBeUndefined();
  });

  test("recurrence 指定なら requestBody にそのまま含まれる (`RRULE:` prefix 必要)", () => {
    const body = buildEventBody(
      { ...BASE_PARAMS, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10"] },
      DEFAULT_SETTINGS,
      {},
    );
    expect(body.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10"]);
  });

  test("recurrence が 2 要素 (RRULE + EXDATE) でも保持", () => {
    const body = buildEventBody(
      {
        ...BASE_PARAMS,
        recurrence: [
          "RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10",
          "EXDATE:20270511T100000Z",
        ],
      },
      DEFAULT_SETTINGS,
      {},
    );
    expect(body.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      "EXDATE:20270511T100000Z",
    ]);
  });
});

// -----------------------------------------------------------------------------
// fetchEventInstances: googleapis wrapper
// -----------------------------------------------------------------------------

type MockInstancesResponse = {
  data: {
    items?: Array<{
      id?: string | null;
      start?: { dateTime?: string | null } | null;
    }>;
    nextPageToken?: string | null;
  };
};

const mockInstances = mock<
  (
    args: unknown,
  ) => Promise<MockInstancesResponse | { data: MockInstancesResponse["data"] }>
>(() => Promise.resolve({ data: { items: [] } }));

const mockGetServiceAccountClient = mock<
  () => Promise<{ events: { instances: typeof mockInstances } } | null>
>(() =>
  Promise.resolve({
    events: { instances: mockInstances },
  }),
);

const mockGetSettings = mock<
  () => Promise<{ calendarId: string | null; enabled: boolean }>
>(() => Promise.resolve({ calendarId: "test-calendar", enabled: true }));

mock.module("@/shared/domain/settings/google-calendar", () => ({
  getServiceAccountClient: mockGetServiceAccountClient,
}));

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getGoogleCalendarSettings: mockGetSettings,
}));

// 動的 import: mock.module 宣言後に評価
type EventsModule = typeof import("@/shared/lib/google-calendar/events");
let fetchEventInstances: EventsModule["fetchEventInstances"];

beforeEach(async () => {
  mockInstances.mockClear();
  mockGetServiceAccountClient.mockReset();
  mockGetServiceAccountClient.mockImplementation(() =>
    Promise.resolve({ events: { instances: mockInstances } }),
  );
  mockGetSettings.mockReset();
  mockGetSettings.mockImplementation(() =>
    Promise.resolve({ calendarId: "test-calendar", enabled: true }),
  );
  ({ fetchEventInstances } =
    await import("@/shared/lib/google-calendar/events"));
});

describe("fetchEventInstances — googleapis wrapper (task 16)", () => {
  test("id + start.dateTime が揃った item を CalendarEventInstance[] に変換", async () => {
    mockInstances.mockImplementation(() =>
      Promise.resolve({
        data: {
          items: [
            {
              id: "master-abc_20270504T100000Z",
              start: { dateTime: "2027-05-04T10:00:00.000Z" },
            },
            {
              id: "master-abc_20270511T100000Z",
              start: { dateTime: "2027-05-11T10:00:00.000Z" },
            },
          ],
        },
      }),
    );

    const result = await fetchEventInstances("master-abc");
    expect(result.success).toBe(true);
    expect(result.instances).toHaveLength(2);
    expect(result.instances?.[0]).toEqual({
      id: "master-abc_20270504T100000Z",
      startTime: new Date("2027-05-04T10:00:00.000Z"),
    });
  });

  test("id 欠落 / start.dateTime 欠落の item は除外される (Google API は date-only recurring 等でこれが起き得る)", async () => {
    mockInstances.mockImplementation(() =>
      Promise.resolve({
        data: {
          items: [
            { id: "valid-id", start: { dateTime: "2027-05-04T10:00:00.000Z" } },
            { id: null, start: { dateTime: "2027-05-11T10:00:00.000Z" } },
            { id: "no-start", start: null },
            {
              id: "no-datetime",
              start: { dateTime: null },
            },
          ],
        },
      }),
    );

    const result = await fetchEventInstances("master-abc");
    expect(result.success).toBe(true);
    expect(result.instances).toHaveLength(1);
    expect(result.instances?.[0]?.id).toBe("valid-id");
  });

  test("service account client 未設定なら success:false", async () => {
    mockGetServiceAccountClient.mockImplementation(() => Promise.resolve(null));

    const result = await fetchEventInstances("master-abc");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });

  test("calendarId 未設定なら success:false", async () => {
    mockGetSettings.mockImplementation(() =>
      Promise.resolve({ calendarId: null, enabled: true }),
    );

    const result = await fetchEventInstances("master-abc");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Calendar ID");
  });

  test("googleapis 呼出が throw すれば success:false + error 詳細", async () => {
    mockInstances.mockImplementation(() =>
      Promise.reject(new Error("API quota exceeded")),
    );

    const result = await fetchEventInstances("master-abc");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ===========================================================================
  // GCAL-AUDIT-06: nextPageToken を追って全ページを取得する
  // ===========================================================================

  test("nextPageToken がある間ページを追い、全ページの instance を合算する (250 件超の long series 対策)", async () => {
    mockInstances.mockImplementation((args: unknown) => {
      const params = args as { pageToken?: string };
      if (!params.pageToken) {
        return Promise.resolve({
          data: {
            items: [
              {
                id: "master-abc_20270504T100000Z",
                start: { dateTime: "2027-05-04T10:00:00.000Z" },
              },
            ],
            nextPageToken: "page-2-token",
          },
        });
      }
      if (params.pageToken === "page-2-token") {
        return Promise.resolve({
          data: {
            items: [
              {
                id: "master-abc_20270511T100000Z",
                start: { dateTime: "2027-05-11T10:00:00.000Z" },
              },
            ],
            // nextPageToken 無し = 最終ページ
          },
        });
      }
      throw new Error(`unexpected pageToken: ${params.pageToken}`);
    });

    const result = await fetchEventInstances("master-abc");

    expect(result.success).toBe(true);
    expect(result.instances).toHaveLength(2);
    expect(result.instances?.map((i) => i.id)).toEqual([
      "master-abc_20270504T100000Z",
      "master-abc_20270511T100000Z",
    ]);
    expect(mockInstances).toHaveBeenCalledTimes(2);
    // 2 回目呼び出しに pageToken が引き継がれていること
    expect(mockInstances.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ pageToken: "page-2-token" }),
    );
  });

  test("nextPageToken が無い単一ページのときは 1 回だけ呼ぶ", async () => {
    mockInstances.mockImplementation(() =>
      Promise.resolve({
        data: {
          items: [
            {
              id: "master-abc_20270504T100000Z",
              start: { dateTime: "2027-05-04T10:00:00.000Z" },
            },
          ],
        },
      }),
    );

    await fetchEventInstances("master-abc");

    expect(mockInstances).toHaveBeenCalledTimes(1);
  });
});
