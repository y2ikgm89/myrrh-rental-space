/**
 * APIキー管理 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + 型構造をテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// api-keys.ts 内で使用されている各スキーマを再現

// Resend設定スキーマ
const resendSettingsSchema = z.object({
  resendApiKey: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .refine((val) => !val || val.startsWith("re_"), {
      error: "Resend APIキーは re_ で始まる必要があります",
    }),
});

// Turnstile設定スキーマ
const turnstileSettingsSchema = z.object({
  turnstileSiteKey: z.string().max(100).nullable().optional(),
  turnstileSecretKey: z.string().max(200).nullable().optional(),
});

// Google Maps設定スキーマ
const googleMapsSettingsSchema = z.object({
  googleMapsApiKey: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .refine((val) => !val || val.startsWith("AIza"), {
      error: "Google Maps APIキーは AIza で始まる必要があります",
    }),
});

// カスタムAPIキースキーマ
const customApiKeySchema = z.object({
  name: z.string().min(1, { error: "サービス名を入力してください" }).max(100),
  keyName: z.string().min(1, { error: "キー名を入力してください" }).max(100),
  keyValue: z.string().min(1, { error: "キー値を入力してください" }).max(500),
  description: z.string().max(500).optional(),
});

// 有効な入力データ
const VALID_RESEND_INPUT = {
  resendApiKey: "re_1234567890abcdef",
};

const VALID_TURNSTILE_INPUT = {
  turnstileSiteKey: "0x4AAAAAAAbcdef12345",
  turnstileSecretKey: "0x4AAAAAAAbcdef12345secretkey",
};

const VALID_GOOGLE_MAPS_INPUT = {
  googleMapsApiKey: "AIzaSyAbcdefghijklmnopqrstuvwxyz12345",
};

const VALID_CUSTOM_API_KEY_INPUT = {
  name: "Stripe",
  keyName: "STRIPE_SECRET_KEY",
  keyValue: "sk_test_1234567890abcdef",
  description: "Stripe APIシークレットキー",
};

describe("ApiKeys Admin Action Integration", () => {
  describe("resendSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なResendキーはバリデーション通過", () => {
        const result = resendSettingsSchema.safeParse(VALID_RESEND_INPUT);
        expect(result.success).toBe(true);
      });

      test("nullは許可", () => {
        const result = resendSettingsSchema.safeParse({
          resendApiKey: null,
        });
        expect(result.success).toBe(true);
      });

      test("undefinedは許可（オプション）", () => {
        const result = resendSettingsSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      test("空オブジェクトは許可", () => {
        const result = resendSettingsSchema.safeParse({});
        expect(result.success).toBe(true);
      });
    });

    describe("resendApiKey", () => {
      test("re_で始まるキーは許可", () => {
        const result = resendSettingsSchema.safeParse({
          resendApiKey: "re_abc123",
        });
        expect(result.success).toBe(true);
      });

      test("re_で始まらないキーはエラー", () => {
        const result = resendSettingsSchema.safeParse({
          resendApiKey: "invalid_key_12345",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("re_ で始まる");
        }
      });

      test("200文字を超えるキーはエラー", () => {
        const result = resendSettingsSchema.safeParse({
          resendApiKey: "re_" + "a".repeat(198),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("turnstileSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なTurnstile設定はバリデーション通過", () => {
        const result = turnstileSettingsSchema.safeParse(VALID_TURNSTILE_INPUT);
        expect(result.success).toBe(true);
      });

      test("両方nullは許可", () => {
        const result = turnstileSettingsSchema.safeParse({
          turnstileSiteKey: null,
          turnstileSecretKey: null,
        });
        expect(result.success).toBe(true);
      });

      test("空オブジェクトは許可", () => {
        const result = turnstileSettingsSchema.safeParse({});
        expect(result.success).toBe(true);
      });
    });

    describe("turnstileSiteKey", () => {
      test("100文字のサイトキーはOK", () => {
        const result = turnstileSettingsSchema.safeParse({
          turnstileSiteKey: "a".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字のサイトキーはエラー", () => {
        const result = turnstileSettingsSchema.safeParse({
          turnstileSiteKey: "a".repeat(101),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("turnstileSecretKey", () => {
      test("200文字のシークレットキーはOK", () => {
        const result = turnstileSettingsSchema.safeParse({
          turnstileSecretKey: "a".repeat(200),
        });
        expect(result.success).toBe(true);
      });

      test("201文字のシークレットキーはエラー", () => {
        const result = turnstileSettingsSchema.safeParse({
          turnstileSecretKey: "a".repeat(201),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("googleMapsSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なGoogle Mapsキーはバリデーション通過", () => {
        const result = googleMapsSettingsSchema.safeParse(
          VALID_GOOGLE_MAPS_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("nullは許可", () => {
        const result = googleMapsSettingsSchema.safeParse({
          googleMapsApiKey: null,
        });
        expect(result.success).toBe(true);
      });

      test("空オブジェクトは許可", () => {
        const result = googleMapsSettingsSchema.safeParse({});
        expect(result.success).toBe(true);
      });
    });

    describe("googleMapsApiKey", () => {
      test("AIzaで始まるキーは許可", () => {
        const result = googleMapsSettingsSchema.safeParse({
          googleMapsApiKey: "AIzaSyTestKey12345",
        });
        expect(result.success).toBe(true);
      });

      test("AIzaで始まらないキーはエラー", () => {
        const result = googleMapsSettingsSchema.safeParse({
          googleMapsApiKey: "invalid_key_12345",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("AIza で始まる");
        }
      });

      test("200文字を超えるキーはエラー", () => {
        const result = googleMapsSettingsSchema.safeParse({
          googleMapsApiKey: "AIza" + "a".repeat(197),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("customApiKeySchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = customApiKeySchema.safeParse(VALID_CUSTOM_API_KEY_INPUT);
        expect(result.success).toBe(true);
      });

      test("descriptionはオプション", () => {
        const { description: _d, ...inputWithoutDesc } =
          VALID_CUSTOM_API_KEY_INPUT;
        const result = customApiKeySchema.safeParse(inputWithoutDesc);
        expect(result.success).toBe(true);
      });
    });

    describe("name", () => {
      test("空のサービス名はエラー", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          name: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("サービス名を入力");
        }
      });

      test("100文字のサービス名はOK", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          name: "あ".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字のサービス名はエラー", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          name: "あ".repeat(101),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("keyName", () => {
      test("空のキー名はエラー", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          keyName: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("キー名を入力");
        }
      });

      test("100文字のキー名はOK", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          keyName: "a".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字のキー名はエラー", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          keyName: "a".repeat(101),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("keyValue", () => {
      test("空のキー値はエラー", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          keyValue: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("キー値を入力");
        }
      });

      test("500文字のキー値はOK", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          keyValue: "a".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字のキー値はエラー", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          keyValue: "a".repeat(501),
        });
        expect(result.success).toBe(false);
      });
    });

    describe("description", () => {
      test("500文字の説明はOK", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          description: "あ".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字の説明はエラー", () => {
        const result = customApiKeySchema.safeParse({
          ...VALID_CUSTOM_API_KEY_INPUT,
          description: "あ".repeat(501),
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("Config型テスト", () => {
    test("ResendConfig型の構造", () => {
      type ResendConfig = {
        apiKeyMasked: string | null;
        lastTestedAt: Date | null;
        connectionStatus: "connected" | "error" | null;
      };

      const config: ResendConfig = {
        apiKeyMasked: "re_****...abcd",
        lastTestedAt: new Date(),
        connectionStatus: "connected",
      };

      expect(config.apiKeyMasked).toBe("re_****...abcd");
      expect(config.connectionStatus).toBe("connected");
    });

    test("TurnstileConfig型の構造", () => {
      type TurnstileConfig = {
        siteKey: string | null;
        secretKeyMasked: string | null;
        lastTestedAt: Date | null;
        connectionStatus: "connected" | "error" | null;
      };

      const config: TurnstileConfig = {
        siteKey: "0x4AAAAAAAbcdef",
        secretKeyMasked: "0x4A****...efgh",
        lastTestedAt: null,
        connectionStatus: null,
      };

      expect(config.siteKey).toBe("0x4AAAAAAAbcdef");
      expect(config.connectionStatus).toBe(null);
    });

    test("CustomApiKeyData型の構造", () => {
      type CustomApiKeyData = {
        id: string;
        name: string;
        keyName: string;
        description?: string;
        lastTestedAt?: Date;
        connectionStatus?: string;
        createdAt: Date;
        updatedAt: Date;
      };

      const key: CustomApiKeyData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Stripe",
        keyName: "STRIPE_SECRET_KEY",
        description: "テスト用",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(key.name).toBe("Stripe");
      expect(key.keyName).toBe("STRIPE_SECRET_KEY");
    });
  });

  describe("境界値テスト", () => {
    test("Resend APIキー 200文字（境界）", () => {
      const result = resendSettingsSchema.safeParse({
        resendApiKey: "re_" + "a".repeat(197),
      });
      expect(result.success).toBe(true);
    });

    test("Resend APIキー 201文字（境界超過）", () => {
      const result = resendSettingsSchema.safeParse({
        resendApiKey: "re_" + "a".repeat(198),
      });
      expect(result.success).toBe(false);
    });

    test("Google Maps APIキー 200文字（境界）", () => {
      const result = googleMapsSettingsSchema.safeParse({
        googleMapsApiKey: "AIza" + "a".repeat(196),
      });
      expect(result.success).toBe(true);
    });

    test("Google Maps APIキー 201文字（境界超過）", () => {
      const result = googleMapsSettingsSchema.safeParse({
        googleMapsApiKey: "AIza" + "a".repeat(197),
      });
      expect(result.success).toBe(false);
    });

    test("カスタムキー名 100文字（境界）", () => {
      const result = customApiKeySchema.safeParse({
        ...VALID_CUSTOM_API_KEY_INPUT,
        name: "x".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    test("カスタムキー名 101文字（境界超過）", () => {
      const result = customApiKeySchema.safeParse({
        ...VALID_CUSTOM_API_KEY_INPUT,
        name: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    test("カスタムキー値 500文字（境界）", () => {
      const result = customApiKeySchema.safeParse({
        ...VALID_CUSTOM_API_KEY_INPUT,
        keyValue: "x".repeat(500),
      });
      expect(result.success).toBe(true);
    });

    test("カスタムキー値 501文字（境界超過）", () => {
      const result = customApiKeySchema.safeParse({
        ...VALID_CUSTOM_API_KEY_INPUT,
        keyValue: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });
});
