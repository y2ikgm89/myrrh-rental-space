import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockSettingsUpsert = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "singleton" }),
);
const mockSpaceFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockICalTokenCreate = mock<() => Promise<{ id: string; token: string }>>(
  () => Promise.resolve({ id: "token-1", token: "abc123" }),
);
const mockICalTokenFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockICalTokenDelete = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockTransactionFn =
  mock<
    (
      fn: (tx: {
        account: { deleteMany: ReturnType<typeof mock> };
        settings: { upsert: ReturnType<typeof mock> };
      }) => Promise<void>,
    ) => Promise<void>
  >();

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: {
      upsert: mockSettingsUpsert,
    },
    space: {
      findUnique: mockSpaceFindUnique,
    },
    iCalToken: {
      create: mockICalTokenCreate,
      findUnique: mockICalTokenFindUnique,
      delete: mockICalTokenDelete,
    },
    $transaction: mockTransactionFn,
  },
}));

// google-calendar/service-account は googleapis に依存するためモック
mock.module("@/shared/lib/google-calendar/service-account", () => ({
  encryptServiceAccountJson: mock<(json: string) => string>(
    (json) => `encrypted:${json}`,
  ),
}));

// `getEncryptionKey()` は setup.ts でグローバル mock 済 (固定 64 文字 hex)。
// 異常系 test (未設定シナリオ) では `mockImplementationOnce` で個別 override する。
const mockGetEncryptionKeyOverride = mock<() => string>(() => "a".repeat(64));
mock.module("@/shared/lib/env/encryption", () => ({
  getEncryptionKey: mockGetEncryptionKeyOverride,
}));

// CalendarSyncMethod enum モック
mock.module("@generated/prisma/enums", () => ({
  CalendarSyncMethod: {
    polling: "polling",
    webhook: "webhook",
    both: "both",
  },
}));

import {
  updateStripeSettings,
  recordStripeConnectionSuccess,
  clearStripeKeys,
  updateGoogleCalendarSettings,
  recordGoogleCalendarConnectionSuccess,
  recordGoogleCalendarConnectionError,
  enableGoogleCalendarOAuth,
  clearGoogleCalendarServiceAccount,
  updateTwoWaySyncSettings,
  saveGoogleCalendarWebhookToken,
  saveGoogleCalendarWebhook,
  clearGoogleCalendarWebhook,
  createICalToken,
  deleteICalToken,
  updateICalFeedSettings,
} from "@/shared/domain/settings/integration-commands";
import { DomainError } from "@/shared/domain/domain-error";

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
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("キーなしで基本設定を保存できる", async () => {
      await updateStripeSettings({
        stripeEnabled: true,
        stripeTestMode: false,
        stripeCurrency: "jpy",
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
        }),
      );
    });

    test("stripeSecretKey を指定すると暗号化して保存される", async () => {
      await updateStripeSettings({
        stripeEnabled: true,
        stripeTestMode: true,
        stripeSecretKey: "sk_test_abc123",
        stripeCurrency: "jpy",
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      // 暗号化されているため元のキーと一致しない
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeSecretKey: expect.not.stringContaining("sk_test_abc123"),
          }),
        }),
      );
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeSecretKey: expect.any(String),
          }),
        }),
      );
    });

    test("stripeWebhookSecret を指定すると暗号化して保存される", async () => {
      await updateStripeSettings({
        stripeEnabled: true,
        stripeTestMode: false,
        stripeWebhookSecret: "whsec_test123",
        stripeCurrency: "jpy",
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeWebhookSecret: expect.not.stringContaining("whsec_test123"),
          }),
        }),
      );
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeWebhookSecret: expect.any(String),
          }),
        }),
      );
    });

    test("stripeEnabled が false でも正常に保存できる", async () => {
      await updateStripeSettings({
        stripeEnabled: false,
        stripeTestMode: false,
        stripeCurrency: "usd",
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeEnabled: false,
          }),
        }),
      );
    });

    test("stripePublishableKey が null の場合 null として保存される", async () => {
      await updateStripeSettings({
        stripeEnabled: true,
        stripeTestMode: false,
        stripePublishableKey: null,
        stripeCurrency: "jpy",
      });

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripePublishableKey: null,
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateStripeSettings({
        stripeEnabled: true,
        stripeTestMode: false,
        stripeCurrency: "jpy",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("ENCRYPTION_KEY が設定されていない場合 VALIDATION エラーをスローする（stripeSecretKey）", async () => {
      mockGetEncryptionKeyOverride.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      await expect(
        updateStripeSettings({
          stripeEnabled: true,
          stripeTestMode: false,
          stripeSecretKey: "sk_test_abc",
          stripeCurrency: "jpy",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining("暗号化に失敗しました"),
      });
    });

    test("ENCRYPTION_KEY が設定されていない場合 VALIDATION エラーをスローする（stripeWebhookSecret）", async () => {
      mockGetEncryptionKeyOverride.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      await expect(
        updateStripeSettings({
          stripeEnabled: true,
          stripeTestMode: false,
          stripeWebhookSecret: "whsec_test",
          stripeCurrency: "jpy",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining("暗号化に失敗しました"),
      });
    });
  });
});

// =============================================================================
// recordStripeConnectionSuccess
// =============================================================================

describe("recordStripeConnectionSuccess", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("accountId を指定して接続成功を記録できる", async () => {
      await recordStripeConnectionSuccess("acct_test123");

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeConnectionStatus: "connected",
          }),
        }),
      );
    });

    test("stripeLastTestedAt が Date として設定される", async () => {
      await recordStripeConnectionSuccess("acct_test");

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeLastTestedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("singleton ID で upsert が呼ばれる", async () => {
      await recordStripeConnectionSuccess("acct_test");

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Stripe 関連キーをすべて null にして保存できる", async () => {
      await clearStripeKeys();

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("サービスアカウントJSONなしで基本設定を保存できる", async () => {
      await updateGoogleCalendarSettings({
        googleCalendarEnabled: true,
        googleCalendarId: "test@group.calendar.google.com",
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: true,
        googleCalendarMeetEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
        googleCalendarMeetEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      // 暗号化されて保存される
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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

    test("空文字の googleCalendarId が null に正規化される", async () => {
      await updateGoogleCalendarSettings({
        googleCalendarEnabled: false,
        googleCalendarId: "",
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
        googleCalendarMeetEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarId: null,
          }),
        }),
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
        googleCalendarMeetEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarId: calendarId,
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
        googleCalendarMeetEnabled: false,
        googleCalendarReminderMinutes: null,
      });
      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("無効なサービスアカウントJSONで VALIDATION エラーをスローする", async () => {
      await expect(
        updateGoogleCalendarSettings({
          googleCalendarEnabled: true,
          googleCalendarId: null,
          serviceAccountJson: INVALID_SERVICE_ACCOUNT_JSON,
          icalAttachmentEnabled: false,
          addToCalendarLinksEnabled: false,
          googleCalendarMeetEnabled: false,
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
          googleCalendarMeetEnabled: false,
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
          googleCalendarMeetEnabled: false,
          googleCalendarReminderMinutes: null,
        }),
      ).rejects.toThrow(DomainError);

      expect(mockSettingsUpsert).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// recordGoogleCalendarConnectionSuccess
// =============================================================================

describe("recordGoogleCalendarConnectionSuccess", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Google Calendar 接続成功を記録できる", async () => {
      await recordGoogleCalendarConnectionSuccess();

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarConnectionStatus: "connected",
          }),
        }),
      );
    });

    test("googleCalendarLastTestedAt が Date として設定される", async () => {
      await recordGoogleCalendarConnectionSuccess();

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Google Calendar 接続エラーを記録できる", async () => {
      await recordGoogleCalendarConnectionError();

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            googleCalendarConnectionStatus: "error",
          }),
        }),
      );
    });

    test("googleCalendarLastTestedAt が Date として設定される", async () => {
      await recordGoogleCalendarConnectionError();

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
// enableGoogleCalendarOAuth
// =============================================================================

describe("enableGoogleCalendarOAuth", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Google Calendar OAuth を有効化できる", async () => {
      await enableGoogleCalendarOAuth();

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: { googleCalendarOAuthEnabled: true },
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await enableGoogleCalendarOAuth();
      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// clearGoogleCalendarServiceAccount
// =============================================================================

describe("clearGoogleCalendarServiceAccount", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("サービスアカウント関連情報をすべて null にして保存できる", async () => {
      await clearGoogleCalendarServiceAccount();

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("双方向同期設定を保存できる（polling）", async () => {
      await updateTwoWaySyncSettings({
        enabled: true,
        syncMethod: "polling",
        pollingIntervalMin: 15,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: expect.objectContaining({
            googleCalendarTwoWaySyncEnabled: true,
            googleCalendarSyncMethod: "polling",
            googleCalendarPollingIntervalMin: 15,
          }),
        }),
      );
    });

    test("無効化の設定を保存できる", async () => {
      await updateTwoWaySyncSettings({
        enabled: false,
        syncMethod: "webhook",
        pollingIntervalMin: 30,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
        pollingIntervalMin: 5,
      });
      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// saveGoogleCalendarWebhookToken
// =============================================================================

describe("saveGoogleCalendarWebhookToken", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Webhook トークンを保存できる", async () => {
      await saveGoogleCalendarWebhookToken("token-xyz-123");

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: { googleCalendarWebhookToken: "token-xyz-123" },
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await saveGoogleCalendarWebhookToken("some-token");
      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// saveGoogleCalendarWebhook
// =============================================================================

describe("saveGoogleCalendarWebhook", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Webhook 情報（channelId, resourceId, expiration）を保存できる", async () => {
      const expiration = new Date("2025-12-31T23:59:59Z");
      await saveGoogleCalendarWebhook({
        channelId: "channel-001",
        resourceId: "resource-001",
        expiration,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: expect.objectContaining({
            googleCalendarWebhookChannelId: "channel-001",
            googleCalendarWebhookResourceId: "resource-001",
            googleCalendarWebhookExpiration: expiration,
          }),
        }),
      );
    });

    test("expiration が undefined の場合 null として保存される", async () => {
      await saveGoogleCalendarWebhook({
        channelId: "channel-002",
        resourceId: "resource-002",
        expiration: undefined,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
      });
      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// clearGoogleCalendarWebhook
// =============================================================================

describe("clearGoogleCalendarWebhook", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Webhook 関連情報をすべて null にして保存できる", async () => {
      await clearGoogleCalendarWebhook();

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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

// =============================================================================
// createICalToken
// =============================================================================

describe("createICalToken", () => {
  beforeEach(() => {
    mockSpaceFindUnique.mockReset();
    mockICalTokenCreate.mockReset();
    mockSpaceFindUnique.mockResolvedValue(null);
    mockICalTokenCreate.mockResolvedValue({ id: "token-1", token: "abc123" });
  });

  describe("正常系", () => {
    test("spaceId なしでトークンを作成できる", async () => {
      const result = await createICalToken({
        name: "全スペース用",
        spaceId: null,
        expiresInDays: null,
        createdBy: "user-1",
      });

      expect(mockSpaceFindUnique).not.toHaveBeenCalled();
      expect(mockICalTokenCreate).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: "token-1", token: "abc123" });
    });

    test("存在するスペースIDを指定してトークンを作成できる", async () => {
      mockSpaceFindUnique.mockResolvedValue({ id: "space-1" });

      const result = await createICalToken({
        name: "スペース1用",
        spaceId: "space-1",
        expiresInDays: 30,
        createdBy: "user-1",
      });

      expect(mockSpaceFindUnique).toHaveBeenCalledTimes(1);
      expect(mockSpaceFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "space-1" },
        }),
      );
      expect(mockICalTokenCreate).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: "token-1", token: "abc123" });
    });

    test("expiresInDays が正の整数の場合、expiresAt が計算されて create に渡される", async () => {
      await createICalToken({
        name: "期限あり",
        spaceId: null,
        expiresInDays: 7,
        createdBy: "user-1",
      });

      expect(mockICalTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expiresAt: expect.any(Date) }),
        }),
      );
    });

    test("expiresInDays が null の場合、expiresAt が null になる", async () => {
      await createICalToken({
        name: "無期限",
        spaceId: null,
        expiresInDays: null,
        createdBy: "user-1",
      });

      expect(mockICalTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expiresAt: null }),
        }),
      );
    });

    test("expiresInDays が 0 の場合、expiresAt が null になる", async () => {
      await createICalToken({
        name: "ゼロ日",
        spaceId: null,
        expiresInDays: 0,
        createdBy: "user-1",
      });

      expect(mockICalTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expiresAt: null }),
        }),
      );
    });

    test("token は base64url 形式の文字列として create に渡される", async () => {
      await createICalToken({
        name: "テスト",
        spaceId: null,
        expiresInDays: null,
        createdBy: "user-1",
      });

      expect(mockICalTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ token: expect.any(String) }),
        }),
      );
    });

    test("createdBy が create データに含まれる", async () => {
      await createICalToken({
        name: "テスト",
        spaceId: null,
        expiresInDays: null,
        createdBy: "user-xyz",
      });

      expect(mockICalTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdBy: "user-xyz" }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない spaceId を指定すると VALIDATION エラーをスローする", async () => {
      mockSpaceFindUnique.mockResolvedValue(null);

      await expect(
        createICalToken({
          name: "存在しないスペース用",
          spaceId: "non-existent-space",
          expiresInDays: null,
          createdBy: "user-1",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "スペースが見つかりません",
      });
    });

    test("スペースが見つからない場合は iCalToken.create が呼ばれない", async () => {
      mockSpaceFindUnique.mockResolvedValue(null);

      await expect(
        createICalToken({
          name: "存在しないスペース用",
          spaceId: "non-existent-space",
          expiresInDays: null,
          createdBy: "user-1",
        }),
      ).rejects.toThrow(DomainError);

      expect(mockICalTokenCreate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// deleteICalToken
// =============================================================================

describe("deleteICalToken", () => {
  beforeEach(() => {
    mockICalTokenFindUnique.mockReset();
    mockICalTokenDelete.mockReset();
    mockICalTokenFindUnique.mockResolvedValue(null);
    mockICalTokenDelete.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("存在するトークンを削除できる", async () => {
      mockICalTokenFindUnique.mockResolvedValue({ id: "token-1" });

      await deleteICalToken("token-1");

      expect(mockICalTokenFindUnique).toHaveBeenCalledTimes(1);
      expect(mockICalTokenFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "token-1" },
        }),
      );
      expect(mockICalTokenDelete).toHaveBeenCalledTimes(1);
      expect(mockICalTokenDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "token-1" },
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      mockICalTokenFindUnique.mockResolvedValue({ id: "token-1" });

      const result = await deleteICalToken("token-1");
      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("存在しないトークンIDで NOT_FOUND エラーをスローする", async () => {
      mockICalTokenFindUnique.mockResolvedValue(null);

      await expect(deleteICalToken("non-existent-id")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "トークンが見つかりません",
      });
    });

    test("トークンが見つからない場合は delete が呼ばれない", async () => {
      mockICalTokenFindUnique.mockResolvedValue(null);

      await expect(deleteICalToken("non-existent-id")).rejects.toThrow(
        DomainError,
      );

      expect(mockICalTokenDelete).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateICalFeedSettings
// =============================================================================

describe("updateICalFeedSettings", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("iCal フィード設定を有効にして保存できる", async () => {
      await updateICalFeedSettings({
        icalFeedEnabled: true,
        icalFeedIncludeCustomerInfo: true,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: {
            icalFeedEnabled: true,
            icalFeedIncludeCustomerInfo: true,
          },
        }),
      );
    });

    test("iCal フィード設定を無効にして保存できる", async () => {
      await updateICalFeedSettings({
        icalFeedEnabled: false,
        icalFeedIncludeCustomerInfo: false,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            icalFeedEnabled: false,
            icalFeedIncludeCustomerInfo: false,
          }),
        }),
      );
    });

    test("singleton ID で upsert が呼ばれる", async () => {
      await updateICalFeedSettings({
        icalFeedEnabled: true,
        icalFeedIncludeCustomerInfo: false,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateICalFeedSettings({
        icalFeedEnabled: false,
        icalFeedIncludeCustomerInfo: false,
      });
      expect(result).toBeUndefined();
    });
  });
});
