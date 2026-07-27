import { describe, test, expect, mock, beforeEach } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

type SettingsUpsertArgs = { update?: Record<string, unknown> };
type UpdateManyArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
};
const mockSettingsStripeFindUnique = mock<
  () => Promise<{
    stripePublishableKey: string | null;
    stripeSecretKey: string | null;
  } | null>
>(() => Promise.resolve(null));
const mockSettingsStripeUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsStripeUpdateMany = mock<
  (args: UpdateManyArgs) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
const mockSettingsGoogleCalendarUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));

const stripeTxClient = {
  settingsStripe: {
    upsert: mockSettingsStripeUpsert,
    updateMany: mockSettingsStripeUpdateMany,
  },
};

const mockStripeTransaction = mock(
  async (fn: (tx: typeof stripeTxClient) => Promise<unknown>) =>
    fn(stripeTxClient),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsStripe: {
      findUnique: mockSettingsStripeFindUnique,
      upsert: mockSettingsStripeUpsert,
      updateMany: mockSettingsStripeUpdateMany,
    },
    settingsGoogleCalendar: {
      upsert: mockSettingsGoogleCalendarUpsert,
    },
    $transaction: mockStripeTransaction,
  },
}));

// google-calendar/service-account は googleapis に依存するためモック
mock.module("@/shared/lib/google-calendar/service-account", () => ({
  encryptServiceAccountJson: mock<(json: string) => string>(
    (json) => `encrypted:${json}`,
  ),
}));

// encryption helper は setup.ts でグローバル mock 済 (固定 kid + hex)。
// 異常系 test (未設定シナリオ) では `mockImplementationOnce` で個別 override する。
const TEST_PRIMARY = { kid: "v1", hex: "a".repeat(64) };
const mockGetPrimaryOverride = mock<() => typeof TEST_PRIMARY>(
  () => TEST_PRIMARY,
);
mock.module("@/shared/lib/env/encryption", () => ({
  getPrimaryEncryptionKey: mockGetPrimaryOverride,
  getSecondaryEncryptionKeys: () => [],
  resolveEncryptionKeyByKid: (kid: string) => {
    const primary = mockGetPrimaryOverride();
    return primary.kid === kid ? primary : null;
  },
}));

function lastStripeUpdateData(): Record<string, unknown> {
  const lastCall = mockSettingsStripeUpdateMany.mock.calls.at(-1);
  return lastCall?.[0]?.data ?? {};
}

function lastGoogleCalendarUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsGoogleCalendarUpsert.mock.calls.at(-1);
  return lastCall?.[0]?.update ?? {};
}

// CalendarSyncMethod enum モック
await installPrismaEnumsMock({
  CalendarSyncMethod: {
    polling: "polling",
    webhook: "webhook",
    both: "both",
  },
});

import {
  updateStripeSettings,
  recordStripeConnectionSuccess,
  clearStripeKeys,
  updateGoogleCalendarSettings,
  recordGoogleCalendarConnectionSuccess,
  recordGoogleCalendarConnectionError,
  clearGoogleCalendarServiceAccount,
  updateTwoWaySyncSettings,
  saveGoogleCalendarWebhook,
  clearGoogleCalendarWebhook,
} from "@/shared/domain/settings/integration-commands";
import { DomainError } from "@/shared/domain/domain-error";
import { encrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE } from "@/shared/domain/settings/commands/optimistic";

const STRIPE_EXPECTED_UPDATED_AT = new Date("2026-01-15T00:00:00.000Z");

const STRIPE_BASE_INPUT = {
  stripeCurrency: "jpy" as const,
  stripePaymentMethodTypes: ["card"] as const,
  expectedUpdatedAt: STRIPE_EXPECTED_UPDATED_AT,
};

// =============================================================================
// テスト用定数
// =============================================================================

const VALID_GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: "service_account",
  client_email: "test@example-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
  project_id: "example-project",
});

const INVALID_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: "oauth2_client",
  client_id: "invalid",
});

// =============================================================================
// updateStripeSettings
// =============================================================================

describe("updateStripeSettings", () => {
  beforeEach(() => {
    mockSettingsStripeFindUnique.mockReset();
    mockSettingsStripeFindUnique.mockResolvedValue(null);
    mockSettingsStripeUpsert.mockReset();
    mockSettingsStripeUpsert.mockResolvedValue({ id: "singleton" });
    mockSettingsStripeUpdateMany.mockReset();
    mockSettingsStripeUpdateMany.mockResolvedValue({ count: 1 });
    mockStripeTransaction.mockReset();
    mockStripeTransaction.mockImplementation(async (fn) => fn(stripeTxClient));
  });

  describe("正常系", () => {
    test("キーなしで基本設定を保存できる", async () => {
      await updateStripeSettings(STRIPE_BASE_INPUT);

      expect(mockStripeTransaction).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "singleton",
            updatedAt: STRIPE_EXPECTED_UPDATED_AT,
          },
        }),
      );
    });

    test("stripeSecretKey を指定すると暗号化して保存される", async () => {
      await updateStripeSettings({
        ...STRIPE_BASE_INPUT,
        stripeSecretKey: "sk_test_abc123",
      });

      expect(mockSettingsStripeUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripeSecretKey: expect.not.stringContaining("sk_test_abc123"),
          }),
        }),
      );
      expect(mockSettingsStripeUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripeSecretKey: expect.any(String),
          }),
        }),
      );
    });

    test("stripeWebhookSecret を指定すると暗号化して保存される", async () => {
      await updateStripeSettings({
        ...STRIPE_BASE_INPUT,
        stripeWebhookSecret: "whsec_test123",
      });

      expect(mockSettingsStripeUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripeWebhookSecret: expect.not.stringContaining("whsec_test123"),
          }),
        }),
      );
    });

    test("通貨変更のみを保存できる", async () => {
      await updateStripeSettings({
        ...STRIPE_BASE_INPUT,
        stripeCurrency: "usd",
      });

      expect(mockSettingsStripeUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripeCurrency: "usd",
          }),
        }),
      );
      expect(Object.keys(lastStripeUpdateData())).not.toContain(
        "stripeEnabled",
      );
    });

    test("stripePublishableKey が null の場合は既存値を維持する（update に含めない）", async () => {
      await updateStripeSettings({
        ...STRIPE_BASE_INPUT,
        stripePublishableKey: null,
      });

      expect(Object.keys(lastStripeUpdateData())).not.toContain(
        "stripePublishableKey",
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateStripeSettings(STRIPE_BASE_INPUT);
      expect(result).toBeUndefined();
    });
  });

  describe("部分更新時のモード整合", () => {
    test("既存 test sk + 新規 live pk の部分更新は VALIDATION エラー", async () => {
      mockSettingsStripeFindUnique.mockResolvedValueOnce({
        stripePublishableKey: "pk_test_existing123456",
        stripeSecretKey: encrypt("sk_test_existing123456", {
          purpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
        }),
      });

      await expect(
        updateStripeSettings({
          ...STRIPE_BASE_INPUT,
          stripePublishableKey: "pk_live_newkey1234567890",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining(
          "モード（test/live）が一致していません",
        ),
      });

      expect(mockStripeTransaction).not.toHaveBeenCalled();
    });

    test("既存 live pk + 新規 test sk の部分更新は VALIDATION エラー", async () => {
      mockSettingsStripeFindUnique.mockResolvedValueOnce({
        stripePublishableKey: "pk_live_existing1234567890",
        stripeSecretKey: null,
      });

      await expect(
        updateStripeSettings({
          ...STRIPE_BASE_INPUT,
          stripeSecretKey: "sk_test_newsecret123456",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining(
          "モード（test/live）が一致していません",
        ),
      });

      expect(mockStripeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("異常系", () => {
    test("ENCRYPTION_KEY が設定されていない場合 VALIDATION エラーをスローする（stripeSecretKey）", async () => {
      mockGetPrimaryOverride.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      await expect(
        updateStripeSettings({
          ...STRIPE_BASE_INPUT,
          stripeSecretKey: "sk_test_abc",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining("暗号化に失敗しました"),
      });
    });

    test("ENCRYPTION_KEY が設定されていない場合 VALIDATION エラーをスローする（stripeWebhookSecret）", async () => {
      mockGetPrimaryOverride.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      await expect(
        updateStripeSettings({
          ...STRIPE_BASE_INPUT,
          stripeWebhookSecret: "whsec_test",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining("暗号化に失敗しました"),
      });
    });

    test("expectedUpdatedAt 不一致時は CONFLICT エラー", async () => {
      mockSettingsStripeUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        updateStripeSettings(STRIPE_BASE_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
      });
    });
  });
});

// =============================================================================
// recordStripeConnectionSuccess
// =============================================================================

describe("recordStripeConnectionSuccess", () => {
  beforeEach(() => {
    mockSettingsStripeUpsert.mockReset();
    mockSettingsStripeUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("accountId を指定して接続成功を記録できる", async () => {
      await recordStripeConnectionSuccess("acct_test123");

      expect(mockSettingsStripeUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeConnectionStatus: "connected",
            stripeAccountId: "acct_test123",
          }),
        }),
      );
    });

    test("accountId を undefined にしても記録できる", async () => {
      await recordStripeConnectionSuccess(undefined);

      expect(mockSettingsStripeUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeConnectionStatus: "connected",
          }),
        }),
      );
    });

    test("stripeLastTestedAt が Date として設定される", async () => {
      await recordStripeConnectionSuccess("acct_test");

      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeLastTestedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("singleton ID で upsert が呼ばれる", async () => {
      await recordStripeConnectionSuccess("acct_test");

      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
        }),
      );
    });
  });
});

// =============================================================================
// clearStripeKeys
// =============================================================================

describe("clearStripeKeys", () => {
  beforeEach(() => {
    mockSettingsStripeUpsert.mockReset();
    mockSettingsStripeUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Stripe 関連キーをすべて null にして保存できる", async () => {
      await clearStripeKeys();

      expect(mockSettingsStripeUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeSecretKey: null,
            stripeWebhookSecret: null,
            stripePublishableKey: null,
            stripeAccountId: null,
            stripeConnectionStatus: null,
            stripeLastTestedAt: null,
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await clearStripeKeys();
      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// updateGoogleCalendarSettings
// =============================================================================

describe("updateGoogleCalendarSettings", () => {
  beforeEach(() => {
    mockSettingsGoogleCalendarUpsert.mockReset();
    mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("サービスアカウントJSONなしで基本設定を保存できる", async () => {
      await updateGoogleCalendarSettings({
        googleCalendarEnabled: true,
        googleCalendarId: "test@group.calendar.google.com",
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: true,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
        }),
      );
    });

    test("有効なサービスアカウントJSONで設定を保存できる", async () => {
      await updateGoogleCalendarSettings({
        googleCalendarEnabled: true,
        googleCalendarId: "test@group.calendar.google.com",
        serviceAccountJson: VALID_GOOGLE_SERVICE_ACCOUNT_JSON,
        icalAttachmentEnabled: true,
        addToCalendarLinksEnabled: true,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      // 暗号化されて保存される
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarServiceAccountJson: expect.any(String),
            // 新しいサービスアカウントJSONを設定した場合、接続状態がリセットされる
            googleCalendarConnectionStatus: null,
            googleCalendarLastTestedAt: null,
          }),
        }),
      );
    });

    test("空文字の googleCalendarId は既存値を維持する（update に含めない）", async () => {
      // カレンダーIDはロック中の保存で空送信になるため、空は「既存維持」。
      await updateGoogleCalendarSettings({
        googleCalendarEnabled: false,
        googleCalendarId: "",
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(Object.keys(lastGoogleCalendarUpdate())).not.toContain(
        "googleCalendarId",
      );
    });

    test("有効な googleCalendarId はそのまま保持される", async () => {
      const calendarId = "calendar@group.calendar.google.com";
      await updateGoogleCalendarSettings({
        googleCalendarEnabled: true,
        googleCalendarId: calendarId,
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarId: calendarId,
          }),
        }),
      );
    });

    test("primary は有効な googleCalendarId として保存できる", async () => {
      await updateGoogleCalendarSettings({
        googleCalendarEnabled: true,
        googleCalendarId: "primary",
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarId: "primary",
          }),
        }),
      );
    });

    test("前後空白は trim して保存される", async () => {
      await updateGoogleCalendarSettings({
        googleCalendarEnabled: true,
        googleCalendarId: "  calendar@group.calendar.google.com  ",
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarId: "calendar@group.calendar.google.com",
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateGoogleCalendarSettings({
        googleCalendarEnabled: false,
        googleCalendarId: null,
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
        googleCalendarReminderMinutes: null,
      });
      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("無効な googleCalendarId で VALIDATION エラーをスローする", async () => {
      await expect(
        updateGoogleCalendarSettings({
          googleCalendarEnabled: true,
          googleCalendarId: "not-a-valid-id",
          serviceAccountJson: null,
          icalAttachmentEnabled: false,
          addToCalendarLinksEnabled: false,
          googleCalendarReminderMinutes: null,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "カレンダーIDの形式が無効です",
      });

      expect(mockSettingsGoogleCalendarUpsert).not.toHaveBeenCalled();
    });

    test("無効なサービスアカウントJSONで VALIDATION エラーをスローする", async () => {
      await expect(
        updateGoogleCalendarSettings({
          googleCalendarEnabled: true,
          googleCalendarId: null,
          serviceAccountJson: INVALID_SERVICE_ACCOUNT_JSON,
          icalAttachmentEnabled: false,
          addToCalendarLinksEnabled: false,
          googleCalendarReminderMinutes: null,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "サービスアカウントJSONの形式が無効です",
      });
    });

    test("不正なJSONを渡すと VALIDATION エラーをスローする", async () => {
      await expect(
        updateGoogleCalendarSettings({
          googleCalendarEnabled: true,
          googleCalendarId: null,
          serviceAccountJson: "not-a-json",
          icalAttachmentEnabled: false,
          addToCalendarLinksEnabled: false,
          googleCalendarReminderMinutes: null,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
      });
    });

    test("バリデーションエラー時は upsert が呼ばれない", async () => {
      await expect(
        updateGoogleCalendarSettings({
          googleCalendarEnabled: true,
          googleCalendarId: null,
          serviceAccountJson: INVALID_SERVICE_ACCOUNT_JSON,
          icalAttachmentEnabled: false,
          addToCalendarLinksEnabled: false,
          googleCalendarReminderMinutes: null,
        }),
      ).rejects.toThrow(DomainError);

      expect(mockSettingsGoogleCalendarUpsert).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// recordGoogleCalendarConnectionSuccess
// =============================================================================

describe("recordGoogleCalendarConnectionSuccess", () => {
  beforeEach(() => {
    mockSettingsGoogleCalendarUpsert.mockReset();
    mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Google Calendar 接続成功を記録できる", async () => {
      await recordGoogleCalendarConnectionSuccess();

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarConnectionStatus: "connected",
          }),
        }),
      );
    });

    test("googleCalendarLastTestedAt が Date として設定される", async () => {
      await recordGoogleCalendarConnectionSuccess();

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarLastTestedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});

// =============================================================================
// recordGoogleCalendarConnectionError
// =============================================================================

describe("recordGoogleCalendarConnectionError", () => {
  beforeEach(() => {
    mockSettingsGoogleCalendarUpsert.mockReset();
    mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Google Calendar 接続エラーを記録できる", async () => {
      await recordGoogleCalendarConnectionError();

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarConnectionStatus: "error",
          }),
        }),
      );
    });

    test("googleCalendarLastTestedAt が Date として設定される", async () => {
      await recordGoogleCalendarConnectionError();

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarLastTestedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});

// =============================================================================
// clearGoogleCalendarServiceAccount
// =============================================================================

describe("clearGoogleCalendarServiceAccount", () => {
  beforeEach(() => {
    mockSettingsGoogleCalendarUpsert.mockReset();
    mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("サービスアカウント関連情報をすべて null にして保存できる", async () => {
      await clearGoogleCalendarServiceAccount();

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarServiceAccountJson: null,
            googleCalendarConnectionStatus: null,
            googleCalendarLastTestedAt: null,
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await clearGoogleCalendarServiceAccount();
      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// updateTwoWaySyncSettings
// =============================================================================

describe("updateTwoWaySyncSettings", () => {
  beforeEach(() => {
    mockSettingsGoogleCalendarUpsert.mockReset();
    mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("双方向同期設定を保存できる（polling）", async () => {
      await updateTwoWaySyncSettings({
        enabled: true,
        syncMethod: "polling",
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: expect.objectContaining({
            googleCalendarTwoWaySyncEnabled: true,
            googleCalendarSyncMethod: "polling",
          }),
        }),
      );
    });

    test("無効化の設定を保存できる", async () => {
      await updateTwoWaySyncSettings({
        enabled: false,
        syncMethod: "webhook",
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarTwoWaySyncEnabled: false,
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateTwoWaySyncSettings({
        enabled: false,
        syncMethod: "polling",
      });
      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// saveGoogleCalendarWebhook
// =============================================================================

describe("saveGoogleCalendarWebhook", () => {
  beforeEach(() => {
    mockSettingsGoogleCalendarUpsert.mockReset();
    mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Webhook 情報（channelId, resourceId, expiration, token）を原子保存する", async () => {
      const expiration = new Date("2025-12-31T23:59:59Z");
      await saveGoogleCalendarWebhook({
        channelId: "channel-001",
        resourceId: "resource-001",
        expiration,
        token: "token-xyz-123",
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: expect.objectContaining({
            googleCalendarWebhookChannelId: "channel-001",
            googleCalendarWebhookResourceId: "resource-001",
            googleCalendarWebhookExpiration: expiration,
            googleCalendarWebhookToken:
              expect.not.stringContaining("token-xyz-123"),
          }),
        }),
      );
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarWebhookToken: expect.any(String),
          }),
        }),
      );
    });

    test("expiration が undefined の場合 null として保存される", async () => {
      await saveGoogleCalendarWebhook({
        channelId: "channel-002",
        resourceId: "resource-002",
        expiration: undefined,
        token: "some-token",
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarWebhookExpiration: null,
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await saveGoogleCalendarWebhook({
        channelId: "ch",
        resourceId: "res",
        expiration: undefined,
        token: "token",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("ENCRYPTION_KEY が設定されていない場合 VALIDATION エラーをスローする", async () => {
      mockGetPrimaryOverride.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      await expect(
        saveGoogleCalendarWebhook({
          channelId: "channel-001",
          resourceId: "resource-001",
          expiration: undefined,
          token: "token-xyz-123",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining("暗号化に失敗しました"),
      });
    });
  });
});

// =============================================================================
// clearGoogleCalendarWebhook
// =============================================================================

describe("clearGoogleCalendarWebhook", () => {
  beforeEach(() => {
    mockSettingsGoogleCalendarUpsert.mockReset();
    mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Webhook 関連情報をすべて null にして保存できる", async () => {
      await clearGoogleCalendarWebhook();

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarWebhookChannelId: null,
            googleCalendarWebhookResourceId: null,
            googleCalendarWebhookToken: null,
            googleCalendarWebhookExpiration: null,
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await clearGoogleCalendarWebhook();
      expect(result).toBeUndefined();
    });
  });
});
