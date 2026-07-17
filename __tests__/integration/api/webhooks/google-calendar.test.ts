/**
 * Google Calendar Webhook API Route Tests
 *
 * /api/webhooks/google-calendar エンドポイントのテスト
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  GoogleCalendarWebhookState,
  TwoWaySyncSettingsData,
} from "@/shared/domain/settings/types";
import type { TwoWaySyncResult } from "@/shared/lib/calendar-sync/types";
import { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";

const webhookStateBase: GoogleCalendarWebhookState = {
  calendarId: "calendar@example.com",
  channelId: "channel-1",
  resourceId: "resource-1",
  token: "expected-token",
  expiration: null,
};

let webhookState: GoogleCalendarWebhookState = { ...webhookStateBase };
let twoWaySyncEnabled = true;
let twoWaySyncSettings: TwoWaySyncSettingsData = {
  enabled: true,
  syncMethod: CalendarSyncMethod.webhook,
  lastSyncedAt: null,
  webhookExpiration: null,
};
let calendarSyncResult: TwoWaySyncResult = {
  success: true,
  processed: 2,
  deleted: 1,
  updated: 1,
  errors: [],
};

const mockGetWebhookState = mock<() => Promise<GoogleCalendarWebhookState>>(
  () => Promise.resolve(webhookState),
);
const mockGetTwoWaySyncSettings = mock<() => Promise<TwoWaySyncSettingsData>>(
  () => Promise.resolve(twoWaySyncSettings),
);
const mockIsTwoWaySyncEnabled = mock<() => Promise<boolean>>(() =>
  Promise.resolve(twoWaySyncEnabled),
);
const mockSyncFromCalendar = mock<() => Promise<TwoWaySyncResult>>(() =>
  Promise.resolve(calendarSyncResult),
);
// 境界 mock: route.ts が使う唯一の cache-invalidation entry point を差し替える。
// これで next/cache (updateTag / revalidateTag)・firePurgeAsync・fireAndForget・
// CDN tag purge の全下位実装が touch されない。テスト境界は「Route Handler が
// キャッシュ無効化ヘルパーを正しい tag セットで呼んだか」で、Next.js の
// updateTag / revalidateTag といった実装詳細に依存すべきではない (PR #945)。
const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (tags: readonly string[], options?: unknown) => void
>(() => undefined);
const mockLogError = mock(() => undefined);

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getGoogleCalendarWebhookState: mockGetWebhookState,
  getTwoWaySyncSettings: mockGetTwoWaySyncSettings,
}));

mock.module("@/shared/lib/google-calendar", () => ({
  isTwoWaySyncEnabled: mockIsTwoWaySyncEnabled,
  // Phase B.2 task 16 で追加された fetchEventInstances。本 test では未使用だが、
  // mock.module の process-global live binding が他 test file の実 import に
  // 干渉して SyntaxError を起こすため必須
  // ([[feedback_stale-branch-name-reuse-and-mock-module-coverage]])。
  fetchEventInstances: mock(() =>
    Promise.resolve({ success: true, instances: [] }),
  ),
}));

mock.module("@/shared/lib/calendar-sync/inbound", () => ({
  syncFromCalendar: mockSyncFromCalendar,
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler:
    mockInvalidateSiteWideCacheFromRouteHandler,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: mock(() => undefined),
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    UNKNOWN: "UNKNOWN",
    VALIDATION: "VALIDATION",
  },
  ErrorSeverity: {
    HIGH: "HIGH",
    LOW: "LOW",
    MEDIUM: "MEDIUM",
  },
  logError: mockLogError,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
}));

function googleCalendarWebhookRequest(
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/webhooks/google-calendar", {
    method: "POST",
    headers: {
      "x-goog-channel-id": "channel-1",
      "x-goog-resource-id": "resource-1",
      "x-goog-resource-state": "exists",
      "x-goog-resource-uri":
        "https://www.googleapis.com/calendar/v3/calendars/calendar%40example.com/events",
      "x-goog-channel-token": "expected-token",
      "x-goog-message-number": "2",
      ...headers,
    },
  });
}

async function post(request: Request): Promise<Response> {
  const routeModule = await import("@/app/api/webhooks/google-calendar/route");
  return routeModule.POST(request);
}

describe("POST /api/webhooks/google-calendar", () => {
  beforeEach(() => {
    webhookState = { ...webhookStateBase };
    twoWaySyncEnabled = true;
    twoWaySyncSettings = {
      enabled: true,
      syncMethod: CalendarSyncMethod.webhook,
      lastSyncedAt: null,
      webhookExpiration: null,
    };
    calendarSyncResult = {
      success: true,
      processed: 2,
      deleted: 1,
      updated: 1,
      errors: [],
    };
    mock.clearAllMocks();
  });

  test("必須ヘッダーがない場合は400を返す", async () => {
    const response = await post(
      new Request("http://localhost/api/webhooks/google-calendar", {
        method: "POST",
        headers: {},
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("x-goog-channel-id が必要です");
  });

  test("Webhook token が未設定の場合は503で拒否する", async () => {
    webhookState = { ...webhookState, token: null };

    const response = await post(googleCalendarWebhookRequest());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("Webhook not configured");
    expect(mockSyncFromCalendar).not.toHaveBeenCalled();
  });

  test("Webhook token が一致しない場合は403で拒否する", async () => {
    const response = await post(
      googleCalendarWebhookRequest({
        "x-goog-channel-token": "wrong-token",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Invalid token");
    expect(mockSyncFromCalendar).not.toHaveBeenCalled();
  });

  test("sync 通知は初回確認として200でackする", async () => {
    const response = await post(
      googleCalendarWebhookRequest({
        "x-goog-resource-state": "sync",
        "x-goog-message-number": "1",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ acknowledged: true, sync: true });
    expect(mockIsTwoWaySyncEnabled).not.toHaveBeenCalled();
    expect(mockSyncFromCalendar).not.toHaveBeenCalled();
  });

  test("未知の channel/resource は200でackして同期しない", async () => {
    const response = await post(
      googleCalendarWebhookRequest({
        "x-goog-channel-id": "unknown-channel",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ acknowledged: true, ignored: true });
    expect(mockSyncFromCalendar).not.toHaveBeenCalled();
  });

  test("同期処理が失敗しても検証済み通知は200でackする", async () => {
    calendarSyncResult = {
      success: false,
      processed: 0,
      deleted: 0,
      updated: 0,
      errors: ["fetch failed"],
    };

    const response = await post(googleCalendarWebhookRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      acknowledged: true,
      processing: "sync_failed",
    });
    expect(mockSyncFromCalendar).toHaveBeenCalledTimes(1);
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  test("同期成功時は200でackし予約キャッシュを無効化する", async () => {
    const response = await post(googleCalendarWebhookRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      acknowledged: true,
      processed: 2,
      deleted: 1,
      updated: 1,
    });
    expect(mockSyncFromCalendar).toHaveBeenCalledTimes(1);
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledTimes(
      1,
    );
  });
});
