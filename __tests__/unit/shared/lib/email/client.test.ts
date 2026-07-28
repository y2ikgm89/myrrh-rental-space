/**
 * `resolveSenderEmailAddress` の解決順・throw 動作テスト。
 *
 * 旧仕様: env `EMAIL_FROM` → DB `senderEmail` → ハードコード既定値 `"noreply@example.com"`
 * 新仕様 (M11 fix): env `EMAIL_FROM` → DB `senderEmail` → throw (silent fallback を廃止)
 *
 * env は module load 時 snapshot されるため、`@/shared/lib/env/server` を mock.module で
 * 差し替える (setup.ts で SKIP_ENV_VALIDATION=true が設定済み)。テスト毎に serverEnv を
 * 再構築するため、client.ts の import 前に mock を宣言し、各 describe ブロック内で
 * 動的 import する。
 */

import { describe, expect, mock, test } from "bun:test";

type FakeServerEnv = {
  EMAIL_FROM?: string | undefined;
};

function withEnv<T>(env: FakeServerEnv, cb: () => Promise<T>): Promise<T> {
  mock.module("@/shared/lib/env/server", () => ({
    serverEnv: env,
    // 呼ばれないが型互換のため
    isProduction: () => false,
    isLocalhostUrl: () => false,
    validateProductionEnv: () => undefined,
  }));
  return cb();
}

// api-key-queries は resolveSenderEmailAddress の依存経路には出てこないが、client.ts の
// top-level import なので mock で無害化する。
mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedResendApiKey: async () => null,
}));

import {
  ADMIN_DELIVERY,
  EMAIL_SEND_CONTEXT,
  INQUIRY_ADMIN_DELIVERY,
  RENDER_CONTEXT,
} from "./_email-test-fixtures";

describe("resolveSenderEmailAddress", () => {
  test("env EMAIL_FROM のみ設定時、env 値を返す", async () => {
    await withEnv({ EMAIL_FROM: "env@myrrh.example.com" }, async () => {
      const { resolveSenderEmailAddress } =
        await import("@/shared/lib/email/client");
      expect(resolveSenderEmailAddress(null)).toBe("env@myrrh.example.com");
    });
  });

  test("DB senderEmail のみ設定時、DB 値を返す（env 未設定）", async () => {
    await withEnv({ EMAIL_FROM: undefined }, async () => {
      const { resolveSenderEmailAddress } =
        await import("@/shared/lib/email/client");
      expect(resolveSenderEmailAddress("db@myrrh.example.com")).toBe(
        "db@myrrh.example.com",
      );
    });
  });

  test("env が優先される（両方設定時は env 値を返す）", async () => {
    await withEnv({ EMAIL_FROM: "env@myrrh.example.com" }, async () => {
      const { resolveSenderEmailAddress } =
        await import("@/shared/lib/email/client");
      expect(resolveSenderEmailAddress("db@myrrh.example.com")).toBe(
        "env@myrrh.example.com",
      );
    });
  });

  test("env / DB 両方未設定なら remediation 付き Error を throw する（silent fallback 廃止）", async () => {
    await withEnv({ EMAIL_FROM: undefined }, async () => {
      const { resolveSenderEmailAddress } =
        await import("@/shared/lib/email/client");
      expect(() => resolveSenderEmailAddress(null)).toThrow(
        /Email sender address is not configured/,
      );
      expect(() => resolveSenderEmailAddress(null)).toThrow(/EMAIL_FROM/);
      expect(() => resolveSenderEmailAddress(null)).toThrow(
        /Settings\.senderEmail/,
      );
      expect(() => resolveSenderEmailAddress(null)).toThrow(
        /Resend-verified domain/,
      );
    });
  });

  test("旧ハードコード既定値 'noreply@example.com' へは fallback しない（回帰防止）", async () => {
    await withEnv({ EMAIL_FROM: undefined }, async () => {
      const { resolveSenderEmailAddress } =
        await import("@/shared/lib/email/client");
      expect(() => resolveSenderEmailAddress(null)).toThrow();
      // 例外にはハードコード既定値の文字列は含めない (誤解を招くため)
      try {
        resolveSenderEmailAddress(null);
      } catch (e) {
        expect(e instanceof Error).toBe(true);
        if (e instanceof Error) {
          expect(e.message).not.toContain("noreply@example.com");
        }
      }
    });
  });
});
