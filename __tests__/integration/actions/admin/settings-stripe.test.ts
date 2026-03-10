/**
 * Stripe決済設定 Server Action統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/stripe.ts のテスト
 *
 * 対象スキーマ:
 * - stripeSettingsSchema（Stripe設定）
 * - stripeConnectionTestSchema（接続テスト用）
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// =============================================================================
// Stripeキーバリデーション関数（stripe.ts から再現）
// =============================================================================

const KEY_PREFIXES = {
  publishableTest: "pk_test_",
  publishableLive: "pk_live_",
  secretTest: "sk_test_",
  secretLive: "sk_live_",
  webhook: "whsec_",
};

function isValidPublishableKey(key: string): boolean {
  return (
    key.startsWith(KEY_PREFIXES.publishableTest) ||
    key.startsWith(KEY_PREFIXES.publishableLive)
  );
}

function isValidSecretKey(key: string): boolean {
  return (
    key.startsWith(KEY_PREFIXES.secretTest) ||
    key.startsWith(KEY_PREFIXES.secretLive)
  );
}

function isValidWebhookSecret(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.webhook);
}

function isTestKey(key: string): boolean {
  return (
    key.startsWith(KEY_PREFIXES.secretTest) ||
    key.startsWith(KEY_PREFIXES.publishableTest)
  );
}

function keysHaveMatchingMode(
  publishableKey: string,
  secretKey: string,
): boolean {
  const publishableIsTest = isTestKey(publishableKey);
  const secretIsTest = isTestKey(secretKey);
  return publishableIsTest === secretIsTest;
}

// =============================================================================
// スキーマ再現（stripe.ts バリデーションから）
// =============================================================================

const MESSAGES = {
  publishableKey:
    "公開可能キーは pk_test_ または pk_live_ で始まる必要があります",
  secretKey:
    "シークレットキーは sk_test_ または sk_live_ で始まる必要があります",
  webhookSecret: "Webhookシークレットは whsec_ で始まる必要があります",
  keyModeMismatch:
    "公開可能キーとシークレットキーのモード（test/live）が一致していません",
  maxLength: (field: string) => `${field}は200文字以内で入力してください`,
};

const stripeSettingsSchema = z
  .object({
    stripeEnabled: z.boolean(),
    stripeTestMode: z.boolean(),
    stripePublishableKey: z
      .string()
      .max(200, { error: MESSAGES.maxLength("公開可能キー") })
      .nullable()
      .optional()
      .refine((val) => !val || isValidPublishableKey(val), {
        error: MESSAGES.publishableKey,
      }),
    stripeSecretKey: z
      .string()
      .max(200, { error: MESSAGES.maxLength("シークレットキー") })
      .nullable()
      .optional()
      .refine((val) => !val || isValidSecretKey(val), {
        error: MESSAGES.secretKey,
      }),
    stripeWebhookSecret: z
      .string()
      .max(200, { error: MESSAGES.maxLength("Webhookシークレット") })
      .nullable()
      .optional()
      .refine((val) => !val || isValidWebhookSecret(val), {
        error: MESSAGES.webhookSecret,
      }),
    stripeCurrency: z.enum(["jpy", "usd", "eur"]).default("jpy"),
  })
  .refine(
    (data) => {
      if (data.stripePublishableKey && data.stripeSecretKey) {
        return keysHaveMatchingMode(
          data.stripePublishableKey,
          data.stripeSecretKey,
        );
      }
      return true;
    },
    {
      error: MESSAGES.keyModeMismatch,
      path: ["stripeSecretKey"],
    },
  );

const stripeConnectionTestSchema = z.object({
  secretKey: z
    .string()
    .min(1, { error: "シークレットキーを入力してください" })
    .refine(isValidSecretKey, {
      error: MESSAGES.secretKey,
    }),
});

// =============================================================================
// テストデータ
// =============================================================================

const VALID_STRIPE_SETTINGS_INPUT = {
  stripeEnabled: true,
  stripeTestMode: true,
  stripePublishableKey: "pk_test_51ABCDEFGHIJKLMNOP",
  stripeSecretKey: "sk_test_51ABCDEFGHIJKLMNOP",
  stripeWebhookSecret: "whsec_ABCDEFGHIJKLMNOP",
  stripeCurrency: "jpy" as const,
};

// =============================================================================
// テスト
// =============================================================================

describe("Settings Stripe Admin Action Integration", () => {
  // ===========================================================================
  // stripeSettingsSchema
  // ===========================================================================

  describe("stripeSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なテストモードデータはバリデーション通過", () => {
        const result = stripeSettingsSchema.safeParse(
          VALID_STRIPE_SETTINGS_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("有効なライブモードデータはバリデーション通過", () => {
        const result = stripeSettingsSchema.safeParse({
          stripeEnabled: true,
          stripeTestMode: false,
          stripePublishableKey: "pk_live_51ABCDEFGHIJKLMNOP",
          stripeSecretKey: "sk_live_51ABCDEFGHIJKLMNOP",
          stripeWebhookSecret: "whsec_ABCDEFGHIJKLMNOP",
          stripeCurrency: "jpy",
        });
        expect(result.success).toBe(true);
      });

      test("キーなし（無効状態）でもOK", () => {
        const result = stripeSettingsSchema.safeParse({
          stripeEnabled: false,
          stripeTestMode: true,
          stripePublishableKey: null,
          stripeSecretKey: null,
          stripeWebhookSecret: null,
          stripeCurrency: "jpy",
        });
        expect(result.success).toBe(true);
      });

      test("キー省略でもOK（optional）", () => {
        const result = stripeSettingsSchema.safeParse({
          stripeEnabled: false,
          stripeTestMode: true,
          stripeCurrency: "jpy",
        });
        expect(result.success).toBe(true);
      });

      test("stripeCurrencyデフォルトはjpy", () => {
        const result = stripeSettingsSchema.safeParse({
          stripeEnabled: false,
          stripeTestMode: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.stripeCurrency).toBe("jpy");
        }
      });
    });

    describe("stripePublishableKey", () => {
      test("pk_test_ プレフィックスはOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "pk_test_abcdefghijklmnop",
        });
        expect(result.success).toBe(true);
      });

      test("pk_live_ プレフィックスはOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "pk_live_abcdefghijklmnop",
          stripeSecretKey: "sk_live_abcdefghijklmnop",
        });
        expect(result.success).toBe(true);
      });

      test("無効なプレフィックスはエラー", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "invalid_key_123",
        });
        expect(result.success).toBe(false);
      });

      test("200文字はOK", () => {
        const key = "pk_test_" + "a".repeat(192);
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: key,
        });
        expect(result.success).toBe(true);
      });

      test("201文字はエラー", () => {
        const key = "pk_test_" + "a".repeat(193);
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: key,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("stripeSecretKey", () => {
      test("sk_test_ プレフィックスはOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeSecretKey: "sk_test_abcdefghijklmnop",
        });
        expect(result.success).toBe(true);
      });

      test("sk_live_ プレフィックスはOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "pk_live_abcdefghijklmnop",
          stripeSecretKey: "sk_live_abcdefghijklmnop",
        });
        expect(result.success).toBe(true);
      });

      test("無効なプレフィックスはエラー", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeSecretKey: "invalid_secret_123",
        });
        expect(result.success).toBe(false);
      });

      test("200文字はOK", () => {
        const key = "sk_test_" + "a".repeat(192);
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeSecretKey: key,
        });
        expect(result.success).toBe(true);
      });

      test("201文字はエラー", () => {
        const key = "sk_test_" + "a".repeat(193);
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeSecretKey: key,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("stripeWebhookSecret", () => {
      test("whsec_ プレフィックスはOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeWebhookSecret: "whsec_abcdefghijklmnop",
        });
        expect(result.success).toBe(true);
      });

      test("無効なプレフィックスはエラー", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeWebhookSecret: "invalid_webhook_123",
        });
        expect(result.success).toBe(false);
      });

      test("200文字はOK", () => {
        const key = "whsec_" + "a".repeat(194);
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeWebhookSecret: key,
        });
        expect(result.success).toBe(true);
      });

      test("201文字はエラー", () => {
        const key = "whsec_" + "a".repeat(195);
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeWebhookSecret: key,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("stripeCurrency", () => {
      test("有効な通貨コード", () => {
        const validCurrencies = ["jpy", "usd", "eur"] as const;
        for (const currency of validCurrencies) {
          const result = stripeSettingsSchema.safeParse({
            ...VALID_STRIPE_SETTINGS_INPUT,
            stripeCurrency: currency,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効な通貨コードはエラー", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeCurrency: "gbp",
        });
        expect(result.success).toBe(false);
      });

      test("大文字はエラー", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripeCurrency: "JPY",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("キーモードマッチング", () => {
      test("テストモード同士はOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "pk_test_abc123",
          stripeSecretKey: "sk_test_def456",
        });
        expect(result.success).toBe(true);
      });

      test("ライブモード同士はOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "pk_live_abc123",
          stripeSecretKey: "sk_live_def456",
        });
        expect(result.success).toBe(true);
      });

      test("テスト公開キーとライブシークレットキーの混在はエラー", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "pk_test_abc123",
          stripeSecretKey: "sk_live_def456",
        });
        expect(result.success).toBe(false);
      });

      test("ライブ公開キーとテストシークレットキーの混在はエラー", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "pk_live_abc123",
          stripeSecretKey: "sk_test_def456",
        });
        expect(result.success).toBe(false);
      });

      test("公開キーのみ（シークレットキーなし）はOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: "pk_test_abc123",
          stripeSecretKey: null,
        });
        expect(result.success).toBe(true);
      });

      test("シークレットキーのみ（公開キーなし）はOK", () => {
        const result = stripeSettingsSchema.safeParse({
          ...VALID_STRIPE_SETTINGS_INPUT,
          stripePublishableKey: null,
          stripeSecretKey: "sk_test_def456",
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // stripeConnectionTestSchema
  // ===========================================================================

  describe("stripeConnectionTestSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なテストキーはOK", () => {
        const result = stripeConnectionTestSchema.safeParse({
          secretKey: "sk_test_51ABCDEFGHIJKLMNOP",
        });
        expect(result.success).toBe(true);
      });

      test("有効なライブキーはOK", () => {
        const result = stripeConnectionTestSchema.safeParse({
          secretKey: "sk_live_51ABCDEFGHIJKLMNOP",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("異常系", () => {
      test("空文字列はエラー", () => {
        const result = stripeConnectionTestSchema.safeParse({
          secretKey: "",
        });
        expect(result.success).toBe(false);
      });

      test("無効なプレフィックスはエラー", () => {
        const result = stripeConnectionTestSchema.safeParse({
          secretKey: "pk_test_abc123",
        });
        expect(result.success).toBe(false);
      });

      test("キー欠落はエラー", () => {
        const result = stripeConnectionTestSchema.safeParse({});
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // ヘルパー関数テスト
  // ===========================================================================

  describe("Stripeキーバリデーション関数", () => {
    describe("isValidPublishableKey", () => {
      test("pk_test_ はvalid", () => {
        expect(isValidPublishableKey("pk_test_abc")).toBe(true);
      });

      test("pk_live_ はvalid", () => {
        expect(isValidPublishableKey("pk_live_abc")).toBe(true);
      });

      test("sk_test_ はinvalid", () => {
        expect(isValidPublishableKey("sk_test_abc")).toBe(false);
      });

      test("空文字列はinvalid", () => {
        expect(isValidPublishableKey("")).toBe(false);
      });
    });

    describe("isValidSecretKey", () => {
      test("sk_test_ はvalid", () => {
        expect(isValidSecretKey("sk_test_abc")).toBe(true);
      });

      test("sk_live_ はvalid", () => {
        expect(isValidSecretKey("sk_live_abc")).toBe(true);
      });

      test("pk_test_ はinvalid", () => {
        expect(isValidSecretKey("pk_test_abc")).toBe(false);
      });
    });

    describe("isValidWebhookSecret", () => {
      test("whsec_ はvalid", () => {
        expect(isValidWebhookSecret("whsec_abc")).toBe(true);
      });

      test("whsec なし（アンダースコアなし）はinvalid", () => {
        expect(isValidWebhookSecret("whsecabc")).toBe(false);
      });

      test("空文字列はinvalid", () => {
        expect(isValidWebhookSecret("")).toBe(false);
      });
    });

    describe("keysHaveMatchingMode", () => {
      test("テスト同士はmatch", () => {
        expect(keysHaveMatchingMode("pk_test_abc", "sk_test_def")).toBe(true);
      });

      test("ライブ同士はmatch", () => {
        expect(keysHaveMatchingMode("pk_live_abc", "sk_live_def")).toBe(true);
      });

      test("テストとライブの混在はmismatch", () => {
        expect(keysHaveMatchingMode("pk_test_abc", "sk_live_def")).toBe(false);
      });

      test("ライブとテストの混在はmismatch", () => {
        expect(keysHaveMatchingMode("pk_live_abc", "sk_test_def")).toBe(false);
      });
    });
  });

  // ===========================================================================
  // 型エラーテスト
  // ===========================================================================

  describe("型エラー", () => {
    test("stripeEnabled に文字列はエラー", () => {
      const result = stripeSettingsSchema.safeParse({
        ...VALID_STRIPE_SETTINGS_INPUT,
        stripeEnabled: "true",
      });
      expect(result.success).toBe(false);
    });

    test("stripeTestMode に数値はエラー", () => {
      const result = stripeSettingsSchema.safeParse({
        ...VALID_STRIPE_SETTINGS_INPUT,
        stripeTestMode: 1,
      });
      expect(result.success).toBe(false);
    });

    test("stripeCurrency に数値はエラー", () => {
      const result = stripeSettingsSchema.safeParse({
        ...VALID_STRIPE_SETTINGS_INPUT,
        stripeCurrency: 123,
      });
      expect(result.success).toBe(false);
    });
  });
});
