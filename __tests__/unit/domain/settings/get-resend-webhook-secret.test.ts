import { beforeEach, describe, expect, mock, test } from "bun:test";

// -----------------------------------------------------------------------------
// Boundary mocks
// -----------------------------------------------------------------------------
//
// `getResendWebhookSecret` は Settings.resendWebhookSecret (DB canonical) →
// `serverEnv.RESEND_WEBHOOK_SECRET` (local dev fallback) の順で解決する契約。
// 本テストは stripeWebhookSecret と同 posture の Tier 2 pattern が破綻していない
// ことを固定する ([[project_integration-secrets-two-tier-split-2026-07-06]])。

const mockFindUnique = mock<
  () => Promise<{ resendWebhookSecret: string | null } | null>
>(async () => ({ resendWebhookSecret: "encrypted-blob" }));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsResend: {
      findUnique: mockFindUnique,
    },
  },
}));

const mockServerEnv: { RESEND_WEBHOOK_SECRET?: string | undefined } = {};

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

type DecryptCall = {
  ciphertext: string | null | undefined;
  options: { expectedPurpose: string };
};
const decryptCalls: DecryptCall[] = [];
let decryptImpl: (
  ciphertext: string | null | undefined,
  options: { expectedPurpose: string },
) => string | null = () => "decrypted-whsec";

mock.module("@/shared/lib/crypto", () => ({
  safeDecryptToString: (
    ciphertext: string | null | undefined,
    options: { expectedPurpose: string },
  ) => {
    decryptCalls.push({ ciphertext, options });
    return decryptImpl(ciphertext, options);
  },
}));

const { getResendWebhookSecret } =
  await import("@/shared/domain/settings/api-key-queries");

function resetMocks() {
  mockFindUnique.mockClear();
  decryptCalls.length = 0;
  decryptImpl = () => "decrypted-whsec";
  mockServerEnv.RESEND_WEBHOOK_SECRET = undefined;
  mockFindUnique.mockImplementation(async () => ({
    resendWebhookSecret: "encrypted-blob",
  }));
}

describe("getResendWebhookSecret", () => {
  beforeEach(() => {
    resetMocks();
  });

  test("DB に暗号化済み値がある場合は復号値を返し env は参照しない", async () => {
    mockServerEnv.RESEND_WEBHOOK_SECRET = "whsec_env_fallback";
    decryptImpl = () => "whsec_from_db";

    const result = await getResendWebhookSecret();

    expect(result).toBe("whsec_from_db");
    expect(decryptCalls).toHaveLength(1);
    expect(decryptCalls[0]?.options.expectedPurpose).toBe(
      "resend-webhook-secret",
    );
  });

  test("DB が null で env が設定されていれば env fallback を返す (local dev)", async () => {
    mockFindUnique.mockImplementation(async () => ({
      resendWebhookSecret: null,
    }));
    mockServerEnv.RESEND_WEBHOOK_SECRET = "whsec_env_fallback";

    const result = await getResendWebhookSecret();

    expect(result).toBe("whsec_env_fallback");
    // DB が null なので復号は走らない (fail-fast)。
    expect(decryptCalls).toHaveLength(0);
  });

  test("DB が null かつ env 未設定なら null を返す (route handler が 503 化する契約)", async () => {
    mockFindUnique.mockImplementation(async () => ({
      resendWebhookSecret: null,
    }));

    const result = await getResendWebhookSecret();

    expect(result).toBeNull();
  });

  test("Settings 行自体が存在しなくても env fallback で解決できる", async () => {
    mockFindUnique.mockImplementation(async () => null);
    mockServerEnv.RESEND_WEBHOOK_SECRET = "whsec_env_only";

    const result = await getResendWebhookSecret();

    expect(result).toBe("whsec_env_only");
  });

  test("DB 値の復号が失敗 (purpose mismatch 等で null) しても env fallback に落ちる", async () => {
    // safeDecryptToString は purpose mismatch / key rotation ズレ等で null を
    // 返す (throw ではなく silent null が仕様。crypto-token-purpose-cross-use 参照)。
    // その場合も env fallback が効くことを固定する (Tier 2 の availability 保証)。
    decryptImpl = () => null;
    mockServerEnv.RESEND_WEBHOOK_SECRET = "whsec_env_fallback";

    const result = await getResendWebhookSecret();

    expect(result).toBe("whsec_env_fallback");
    expect(decryptCalls).toHaveLength(1);
  });

  test("expectedPurpose は SETTINGS_CRYPTO_PURPOSES.resendWebhookSecret に固定", async () => {
    await getResendWebhookSecret();
    expect(decryptCalls[0]?.options.expectedPurpose).toBe(
      "resend-webhook-secret",
    );
  });
});
