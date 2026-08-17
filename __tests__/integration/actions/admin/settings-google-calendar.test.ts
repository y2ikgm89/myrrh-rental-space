/**
 * Google Calendar 設定 Server Action 統合テスト
 *
 * 接続テストは保存済みカレンダー ID + 復号済み SA JSON だけを対象にする。
 * 設定保存フォーム（conform 経路）の検証は `googleCalendarFormSchema` 側。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { isDomainError } from "@/shared/domain/domain-error";
import { googleCalendarFormSchema } from "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-security-integrations";

const validServiceAccountJson = JSON.stringify({
  type: "service_account",
  project_id: "test-project",
  client_email: "service-account@test-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
});

const mockGetGoogleCalendarSettings = mock(async () => ({
  enabled: false,
  calendarId: null as string | null,
  connectionStatus: null,
  lastTestedAt: null,
  reminderMinutes: null,
}));
const mockGetGoogleCalendarServiceAccountConfig = mock(async () => ({
  enabled: false,
  encryptedServiceAccountJson: null as string | null,
}));
const mockSafeDecryptToString = mock(
  (_ciphertext: string | null | undefined) => null as string | null,
);
const mockTestServiceAccountConnection = mock(
  async (_params: { serviceAccountJson: string; calendarId: string }) => ({
    success: true as const,
    calendarName: "Shared",
    accountEmail: "sa@test.iam.gserviceaccount.com",
  }),
);
const mockRecordConnectionTestResult = mock(async () => undefined);

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
}));
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: mock(() => undefined),
}));
mock.module("@/shared/lib/cache/batcher", () => ({
  withPurgeBatch: (fn: () => Promise<unknown>) => fn(),
}));
mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async (options: {
    execute: (user: { id: string }) => Promise<unknown>;
    afterSuccess?: (data: unknown) => Promise<void> | void;
  }) => {
    try {
      const data = await options.execute({ id: "admin-1" });
      await options.afterSuccess?.(data);
      return data;
    } catch (error) {
      if (isDomainError(error)) {
        return { error: error.message, code: error.code };
      }
      throw error;
    }
  },
}));
mock.module("@/shared/lib/crypto", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => Buffer.from(value),
  safeDecrypt: (value: string) => Buffer.from(value),
  safeDecryptToString: (ciphertext: string | null | undefined) =>
    mockSafeDecryptToString(ciphertext),
}));
mock.module("@/shared/domain/settings/admin-queries", () => ({
  getGoogleCalendarSettings: () => mockGetGoogleCalendarSettings(),
  getGoogleCalendarServiceAccountConfig: () =>
    mockGetGoogleCalendarServiceAccountConfig(),
  getGoogleCalendarWebhookState: async () => ({
    calendarId: null,
    channelId: null,
    resourceId: null,
    token: null,
    expiration: null,
  }),
}));
mock.module("@/shared/lib/google-calendar", () => ({
  testServiceAccountConnection: (params: {
    serviceAccountJson: string;
    calendarId: string;
  }) => mockTestServiceAccountConnection(params),
  setupWebhookWatch: async () => ({ success: false }),
  stopWebhookWatch: async () => ({ success: false }),
  isValidCalendarId: (calendarId: string) =>
    calendarId === "primary" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(calendarId),
}));
mock.module("@/shared/domain/settings/google-calendar-commands", () => ({
  clearGoogleCalendarServiceAccount: async () => undefined,
  clearGoogleCalendarWebhook: async () => undefined,
  saveGoogleCalendarWebhook: async () => undefined,
  updateEventImportEnabled: async () => undefined,
  updateGoogleCalendarSettings: async () => undefined,
  updateTwoWaySyncSettings: async () => undefined,
}));
mock.module("@/shared/domain/settings/connection-health", () => ({
  recordConnectionTestResult: mockRecordConnectionTestResult,
}));
mock.module("@/shared/domain/settings/google-calendar", () => ({
  getServiceAccountClient: async () => null,
}));
mock.module(
  "@/shared/domain/reservations/reservation-calendar-inbound",
  () => ({
    syncFromCalendar: async () => ({
      success: true,
      processed: 0,
      deleted: 0,
      updated: 0,
      errors: [],
    }),
  }),
);
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
}));

const { testGoogleCalendarConnectionAction } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar");

beforeEach(() => {
  mockGetGoogleCalendarSettings.mockReset();
  mockGetGoogleCalendarServiceAccountConfig.mockReset();
  mockSafeDecryptToString.mockReset();
  mockTestServiceAccountConnection.mockReset();
  mockRecordConnectionTestResult.mockReset();

  mockGetGoogleCalendarSettings.mockResolvedValue({
    enabled: false,
    calendarId: null,
    connectionStatus: null,
    lastTestedAt: null,
    reminderMinutes: null,
  });
  mockGetGoogleCalendarServiceAccountConfig.mockResolvedValue({
    enabled: false,
    encryptedServiceAccountJson: null,
  });
  mockSafeDecryptToString.mockReturnValue(null);
  mockTestServiceAccountConnection.mockResolvedValue({
    success: true,
    calendarName: "Shared",
    accountEmail: "sa@test.iam.gserviceaccount.com",
  });
});

describe("Google Calendar Settings Admin Action Integration", () => {
  describe("testGoogleCalendarConnectionAction", () => {
    test("保存済み資格情報が無いと VALIDATION「先に保存してください」を返し CONNECTED を記録しない", async () => {
      const result = await testGoogleCalendarConnectionAction();

      expect(result).toMatchObject({
        error: "先に保存してください",
        code: "VALIDATION",
      });
      expect(mockTestServiceAccountConnection).not.toHaveBeenCalled();
      expect(mockRecordConnectionTestResult).not.toHaveBeenCalled();
    });

    test("無効または欠落した保存済みカレンダーIDでは成功しない", async () => {
      mockGetGoogleCalendarSettings.mockResolvedValue({
        enabled: false,
        calendarId: "not-a-valid-id",
        connectionStatus: null,
        lastTestedAt: null,
        reminderMinutes: null,
      });
      mockGetGoogleCalendarServiceAccountConfig.mockResolvedValue({
        enabled: false,
        encryptedServiceAccountJson: "enc-sa",
      });
      mockSafeDecryptToString.mockReturnValue(validServiceAccountJson);

      const result = await testGoogleCalendarConnectionAction();

      expect(result).toMatchObject({
        error: expect.any(String),
      });
      expect("calendarName" in result).toBe(false);
      expect(mockRecordConnectionTestResult).not.toHaveBeenCalled();
    });

    test("保存済み資格情報で testServiceAccountConnection を実行し結果を記録する", async () => {
      mockGetGoogleCalendarSettings.mockResolvedValue({
        enabled: false,
        calendarId: "primary",
        connectionStatus: null,
        lastTestedAt: null,
        reminderMinutes: null,
      });
      mockGetGoogleCalendarServiceAccountConfig.mockResolvedValue({
        enabled: false,
        encryptedServiceAccountJson: "enc-sa",
      });
      mockSafeDecryptToString.mockReturnValue(validServiceAccountJson);

      const result = await testGoogleCalendarConnectionAction();

      expect(result).toEqual({
        calendarName: "Shared",
        accountEmail: "sa@test.iam.gserviceaccount.com",
      });
      expect(mockTestServiceAccountConnection).toHaveBeenCalledWith({
        serviceAccountJson: validServiceAccountJson,
        calendarId: "primary",
      });
      expect(mockRecordConnectionTestResult).toHaveBeenCalled();
    });
  });

  describe("googleCalendarFormSchema バリデーション", () => {
    test("空欄 googleCalendarId は許容する", () => {
      const fd = new FormData();
      fd.set("googleCalendarEnabled", "on");
      fd.set("googleCalendarId", "");
      fd.set("icalAttachmentEnabled", "");
      fd.set("addToCalendarLinksEnabled", "");

      const result = parseWithZod(fd, { schema: googleCalendarFormSchema });
      expect(result.status).toBe("success");
    });

    test("primary は有効な googleCalendarId", () => {
      const fd = new FormData();
      fd.set("googleCalendarEnabled", "on");
      fd.set("googleCalendarId", "primary");
      fd.set("icalAttachmentEnabled", "");
      fd.set("addToCalendarLinksEnabled", "");

      const result = parseWithZod(fd, { schema: googleCalendarFormSchema });
      expect(result.status).toBe("success");
    });

    test("メール形式の googleCalendarId は許容する", () => {
      const fd = new FormData();
      fd.set("googleCalendarEnabled", "on");
      fd.set("googleCalendarId", "cal@group.calendar.google.com");
      fd.set("icalAttachmentEnabled", "");
      fd.set("addToCalendarLinksEnabled", "");

      const result = parseWithZod(fd, { schema: googleCalendarFormSchema });
      expect(result.status).toBe("success");
    });

    test("無効な googleCalendarId は拒否する", () => {
      const fd = new FormData();
      fd.set("googleCalendarEnabled", "on");
      fd.set("googleCalendarId", "not-a-valid-id");
      fd.set("icalAttachmentEnabled", "");
      fd.set("addToCalendarLinksEnabled", "");

      const result = parseWithZod(fd, { schema: googleCalendarFormSchema });
      expect(result.status).toBe("error");
    });
  });
});
