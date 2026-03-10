import { describe, test, expect } from "bun:test";
import {
  stripeSettingsSchema,
  stripeConnectionTestSchema,
} from "@/admin/lib/validations/stripe";

describe("stripeSettingsSchema", () => {
  test("正常なテストモード設定が検証を通過する", () => {
    const validData = {
      stripeEnabled: true,
      stripeTestMode: true,
      stripePublishableKey: "pk_test_abc123",
      stripeSecretKey: "sk_test_xyz789",
      stripeWebhookSecret: "whsec_test123",
      stripeCurrency: "jpy" as const,
    };

    const result = stripeSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("正常な本番モード設定が検証を通過する", () => {
    const validData = {
      stripeEnabled: true,
      stripeTestMode: false,
      stripePublishableKey: "pk_live_abc123",
      stripeSecretKey: "sk_live_xyz789",
      stripeWebhookSecret: "whsec_live123",
      stripeCurrency: "usd" as const,
    };

    const result = stripeSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("stripeCurrency がデフォルトで jpy になる", () => {
    const data = {
      stripeEnabled: false,
      stripeTestMode: true,
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stripeCurrency).toBe("jpy");
    }
  });

  test("stripePublishableKey が pk_test_ で始まらない場合エラーになる", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: true,
      stripePublishableKey: "invalid_key",
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "公開可能キーは pk_test_ または pk_live_ で始まる必要があります",
      );
    }
  });

  test("stripePublishableKey が pk_live_ で始まる場合検証を通過する", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: false,
      stripePublishableKey: "pk_live_abc123",
      stripeCurrency: "jpy" as const,
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("stripeSecretKey が sk_test_ で始まらない場合エラーになる", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: true,
      stripeSecretKey: "invalid_secret",
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "シークレットキーは sk_test_ または sk_live_ で始まる必要があります",
      );
    }
  });

  test("stripeSecretKey が sk_live_ で始まる場合検証を通過する", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: false,
      stripeSecretKey: "sk_live_xyz789",
      stripeCurrency: "jpy" as const,
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("stripeWebhookSecret が whsec_ で始まらない場合エラーになる", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: true,
      stripeWebhookSecret: "invalid_webhook",
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Webhookシークレットは whsec_ で始まる必要があります",
      );
    }
  });

  test("公開可能キーとシークレットキーのモード（test/live）が一致しない場合エラーになる", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: true,
      stripePublishableKey: "pk_test_abc123",
      stripeSecretKey: "sk_live_xyz789", // ミスマッチ
      stripeCurrency: "jpy" as const,
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find(
        (issue) => issue.path[0] === "stripeSecretKey",
      );
      expect(error?.message).toBe(
        "公開可能キーとシークレットキーのモード（test/live）が一致していません",
      );
    }
  });

  test("公開可能キーとシークレットキーのモードが一致する場合検証を通過する（テストモード）", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: true,
      stripePublishableKey: "pk_test_abc123",
      stripeSecretKey: "sk_test_xyz789",
      stripeCurrency: "jpy" as const,
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("公開可能キーとシークレットキーのモードが一致する場合検証を通過する（本番モード）", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: false,
      stripePublishableKey: "pk_live_abc123",
      stripeSecretKey: "sk_live_xyz789",
      stripeCurrency: "jpy" as const,
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("stripePublishableKey が null の場合検証を通過する", () => {
    const data = {
      stripeEnabled: false,
      stripeTestMode: true,
      stripePublishableKey: null,
      stripeCurrency: "jpy" as const,
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("stripePublishableKey が200文字を超える場合エラーになる", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: true,
      stripePublishableKey: "pk_test_" + "a".repeat(200),
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("stripeCurrency が許可された値以外の場合エラーになる", () => {
    const data = {
      stripeEnabled: true,
      stripeTestMode: true,
      stripeCurrency: "gbp", // 未サポート
    };

    const result = stripeSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("stripeConnectionTestSchema", () => {
  test("正常なシークレットキーが検証を通過する", () => {
    const validData = {
      secretKey: "sk_test_abc123",
    };

    const result = stripeConnectionTestSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("secretKey が必須である", () => {
    const data = {};

    const result = stripeConnectionTestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("secretKey が空文字列の場合エラーになる", () => {
    const data = {
      secretKey: "",
    };

    const result = stripeConnectionTestSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "シークレットキーを入力してください",
      );
    }
  });

  test("secretKey が sk_ で始まらない場合エラーになる", () => {
    const data = {
      secretKey: "invalid_key",
    };

    const result = stripeConnectionTestSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "シークレットキーは sk_test_ または sk_live_ で始まる必要があります",
      );
    }
  });
});
