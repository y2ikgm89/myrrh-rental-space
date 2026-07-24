import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

type SettingsUpsertArgs = { update?: Record<string, unknown> };
const mockSettingsStripeUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsGoogleCalendarUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
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
    settingsStripe: {
      upsert: mockSettingsStripeUpsert,
    },
    settingsGoogleCalendar: {
      upsert: mockSettingsGoogleCalendarUpsert,
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

function lastStripeUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsStripeUpsert.mock.calls.at(-1);
  return lastCall?.[0]?.update ?? {};
}

function lastGoogleCalendarUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsGoogleCalendarUpsert.mock.calls.at(-1);
  return lastCall?.[0]?.update ?? {};
}

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
  clearGoogleCalendarServiceAccount,
  updateTwoWaySyncSettings,
  saveGoogleCalendarWebhookToken,
  saveGoogleCalendarWebhook,
  clearGoogleCalendarWebhook,
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
    mockSettingsStripeUpsert.mockReset();
    mockSettingsStripeUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("キーなしで基本設定を保存できる", async () => {
      await updateStripeSettings({
        stripeCurrency: "jpy",
        stripePaymentMethodTypes: ["card"],
      });

      expect(mockSettingsStripeUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
        }),
      );
    });

    test("stripeSecretKey を指定すると暗号化して保存される", async () => {
      await updateStripeSettings({
        stripeSecretKey: "sk_test_abc123",
        stripeCurrency: "jpy",
        stripePaymentMethodTypes: ["card"],
      });

      expect(mockSettingsStripeUpsert).toHaveBeenCalledTimes(1);
      // 暗号化されているため元のキーと一致しない
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeSecretKey: expect.not.stringContaining("sk_test_abc123"),
          }),
        }),
      );
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeSecretKey: expect.any(String),
          }),
        }),
      );
    });

    test("stripeWebhookSecret を指定すると暗号化して保存される", async () => {
      await updateStripeSettings({
        stripeWebhookSecret: "whsec_test123",
        stripeCurrency: "jpy",
        stripePaymentMethodTypes: ["card"],
      });

      expect(mockSettingsStripeUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeWebhookSecret: expect.not.stringContaining("whsec_test123"),
          }),
        }),
      );
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeWebhookSecret: expect.any(String),
          }),
        }),
      );
    });

    test("通貨変更のみを保存できる", async () => {
      // stripeEnabled トグルは廃止 (Feature Module `payment` が SSoT)。
      // credentials 命令の副次的な設定変更 (通貨等) がキー投入なしで通ることを固定する。
      await updateStripeSettings({
        stripeCurrency: "usd",
        stripePaymentMethodTypes: ["card"],
      });

      expect(mockSettingsStripeUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsStripeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            stripeCurrency: "usd",
          }),
        }),
      );
      // stripeEnabled 列は schema から削除済み — update に混入していないことを固定。
      expect(Object.keys(lastStripeUpdate())).not.toContain("stripeEnabled");
    });

    test("stripePublishableKey が null の場合は既存値を維持する（update に含めない）", async () => {
      // 公開可能キーはロック中の保存で空送信になるため、null（空）は「既存維持」。
      // クリアは clearStripeKeys 経由で行う（[[lockable-integration-key-fields]]）。
      await updateStripeSettings({
        stripePublishableKey: null,
        stripeCurrency: "jpy",
        stripePaymentMethodTypes: ["card"],
      });

      expect(Object.keys(lastStripeUpdate())).not.toContain(
        "stripePublishableKey",
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateStripeSettings({
        stripeCurrency: "jpy",
        stripePaymentMethodTypes: ["card"],
      });
      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("ENCRYPTION_KEY が設定されていない場合 VALIDATION エラーをスローする（stripeSecretKey）", async () => {
      mockGetPrimaryOverride.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      await expect(
        updateStripeSettings({
          stripeSecretKey: "sk_test_abc",
          stripeCurrency: "jpy",
          stripePaymentMethodTypes: ["card"],
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
          stripeWebhookSecret: "whsec_test",
          stripeCurrency: "jpy",
          stripePaymentMethodTypes: ["card"],
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
// saveGoogleCalendarWebhookToken
// =============================================================================

describe("saveGoogleCalendarWebhookToken", () => {
  beforeEach(() => {
    mockSettingsGoogleCalendarUpsert.mockReset();
    mockSettingsGoogleCalendarUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("Webhook トークンを暗号化して保存する（平文はDBに送らない）", async () => {
      // WEBHOOK-01: googleCalendarWebhookToken は SwitchBot webhook path token と同じ
      // encrypt-at-rest posture (HKDF purpose "google-calendar-webhook-token")。
      // DB dump / snapshot 経由での漏洩から webhook 認証トークンを守る。
      await saveGoogleCalendarWebhookToken("token-xyz-123");

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      // 暗号化されているため元のトークン文字列と一致してはいけない
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
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

    test("戻り値が void（undefined）", async () => {
      const result = await saveGoogleCalendarWebhookToken("some-token");
      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("ENCRYPTION_KEY が設定されていない場合 VALIDATION エラーをスローする", async () => {
      mockGetPrimaryOverride.mockImplementationOnce(() => {
        throw new Error("ENCRYPTION_KEY is not set");
      });

      await expect(
        saveGoogleCalendarWebhookToken("token-xyz-123"),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining("暗号化に失敗しました"),
      });
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
    test("Webhook 情報（channelId, resourceId, expiration）を保存できる", async () => {
      const expiration = new Date("2025-12-31T23:59:59Z");
      await saveGoogleCalendarWebhook({
        channelId: "channel-001",
        resourceId: "resource-001",
        expiration,
      });

      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledTimes(1);
      expect(mockSettingsGoogleCalendarUpsert).toHaveBeenCalledWith(
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
