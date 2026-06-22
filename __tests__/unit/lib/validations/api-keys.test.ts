import { describe, test, expect } from "bun:test";
import {
  resendSettingsSchema,
  turnstileSettingsSchema,
  googleMapsSettingsSchema,
  customApiKeySchema,
  isValidResendApiKey,
  isValidTurnstileKey,
  isValidGoogleMapsApiKey,
} from "@/admin/lib/validations/api-keys";

describe("resendSettingsSchema", () => {
  test("正常なResend APIキーが検証を通過する", () => {
    const validData = {
      resendApiKey: "re_abc123def456",
    };

    const result = resendSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("resendApiKey が re_ で始まらない場合エラーになる", () => {
    const data = {
      resendApiKey: "invalid_key",
    };

    const result = resendSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Resend APIキーは re_ で始まる必要があります",
      );
    }
  });

  test("resendApiKey が null の場合検証を通過する", () => {
    const data = {
      resendApiKey: null,
    };

    const result = resendSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("resendApiKey が200文字を超える場合エラーになる", () => {
    const data = {
      resendApiKey: "re_" + "a".repeat(200),
    };

    const result = resendSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("isValidResendApiKey", () => {
  test("re_ で始まり10文字以上の場合 true を返す", () => {
    expect(isValidResendApiKey("re_abc123def456")).toBe(true);
  });

  test("re_ で始まるが10文字未満の場合 false を返す", () => {
    expect(isValidResendApiKey("re_abc")).toBe(false);
  });

  test("re_ で始まらない場合 false を返す", () => {
    expect(isValidResendApiKey("invalid_key")).toBe(false);
  });
});

describe("turnstileSettingsSchema", () => {
  test("正常なTurnstileキーが検証を通過する", () => {
    const validData = {
      turnstileSiteKey: "0x1234567890abcdef",
      turnstileSecretKey: "0xfedcba0987654321",
    };

    const result = turnstileSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("turnstileSiteKey が null の場合検証を通過する", () => {
    const data = {
      turnstileSiteKey: null,
      turnstileSecretKey: null,
    };

    const result = turnstileSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("turnstileSiteKey が100文字を超える場合エラーになる", () => {
    const data = {
      turnstileSiteKey: "0x" + "a".repeat(100),
    };

    const result = turnstileSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("isValidTurnstileKey", () => {
  test("0x で始まり10文字以上の場合 true を返す", () => {
    expect(isValidTurnstileKey("0x1234567890")).toBe(true);
  });

  test("0x で始まるが10文字未満の場合 false を返す", () => {
    expect(isValidTurnstileKey("0x123")).toBe(false);
  });

  test("0x で始まらない場合 false を返す", () => {
    expect(isValidTurnstileKey("invalid_key")).toBe(false);
  });
});

describe("googleMapsSettingsSchema", () => {
  test("正常なGoogle Maps APIキーが検証を通過する", () => {
    const validData = {
      googleMapsApiKey: "AIzaSyAbc123Def456Ghi789Jkl012Mno345",
    };

    const result = googleMapsSettingsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("googleMapsApiKey が AIza で始まらない場合エラーになる", () => {
    const data = {
      googleMapsApiKey: "invalid_key",
    };

    const result = googleMapsSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Google Maps APIキーは AIza で始まる必要があります",
      );
    }
  });

  test("googleMapsApiKey が null の場合検証を通過する", () => {
    const data = {
      googleMapsApiKey: null,
    };

    const result = googleMapsSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("googleMapsApiKey が200文字を超える場合エラーになる", () => {
    const data = {
      googleMapsApiKey: "AIza" + "a".repeat(200),
    };

    const result = googleMapsSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("isValidGoogleMapsApiKey", () => {
  test("AIza で始まり30文字以上の場合 true を返す", () => {
    expect(
      isValidGoogleMapsApiKey("AIzaSyAbc123Def456Ghi789Jkl012Mno345"),
    ).toBe(true);
  });

  test("AIza で始まるが30文字未満の場合 false を返す", () => {
    expect(isValidGoogleMapsApiKey("AIzaShort")).toBe(false);
  });

  test("AIza で始まらない場合 false を返す", () => {
    expect(isValidGoogleMapsApiKey("invalid_key")).toBe(false);
  });
});

describe("customApiKeySchema", () => {
  test("正常なカスタムAPIキーが検証を通過する", () => {
    const validData = {
      name: "Twitter",
      keyName: "TWITTER_API_KEY",
      keyValue: "abc123def456",
      description: "Twitter API Key for social sharing",
    };

    const result = customApiKeySchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("name が必須である", () => {
    const data = {
      keyName: "TWITTER_API_KEY",
      keyValue: "abc123def456",
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("name が空文字列の場合エラーになる", () => {
    const data = {
      name: "",
      keyName: "TWITTER_API_KEY",
      keyValue: "abc123def456",
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "サービス名を入力してください",
      );
    }
  });

  test("name が100文字を超える場合エラーになる", () => {
    const data = {
      name: "a".repeat(101),
      keyName: "TWITTER_API_KEY",
      keyValue: "abc123def456",
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("keyName が必須である", () => {
    const data = {
      name: "Twitter",
      keyValue: "abc123def456",
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("keyName が空文字列の場合エラーになる", () => {
    const data = {
      name: "Twitter",
      keyName: "",
      keyValue: "abc123def456",
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("キー名を入力してください");
    }
  });

  test("keyValue が必須である", () => {
    const data = {
      name: "Twitter",
      keyName: "TWITTER_API_KEY",
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("keyValue が空文字列の場合エラーになる", () => {
    const data = {
      name: "Twitter",
      keyName: "TWITTER_API_KEY",
      keyValue: "",
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("キー値を入力してください");
    }
  });

  test("keyValue が500文字を超える場合エラーになる", () => {
    const data = {
      name: "Twitter",
      keyName: "TWITTER_API_KEY",
      keyValue: "a".repeat(501),
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("description がオプショナルである", () => {
    const data = {
      name: "Twitter",
      keyName: "TWITTER_API_KEY",
      keyValue: "abc123def456",
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("description が500文字を超える場合エラーになる", () => {
    const data = {
      name: "Twitter",
      keyName: "TWITTER_API_KEY",
      keyValue: "abc123def456",
      description: "a".repeat(501),
    };

    const result = customApiKeySchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
