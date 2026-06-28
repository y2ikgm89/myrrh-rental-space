/**
 * api-key-commands の「公開キー / ID = 空は既存維持」回帰テスト。
 *
 * Site Key（Turnstile）は管理 UI の「変更」ボタンでロックされ、ロック中の保存は
 * 空送信になる。空（falsy）を「既存値を維持」として扱い（秘密キーと同じ意味論）、
 * ロック中の保存で値が消えないことを保証する。クリアは clear* command 経由。
 *
 * Cloudflare は env-only 設計に移行したため対象外。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

type SettingsUpsertArgs = { update?: Record<string, unknown> };
const mockSettingsUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: { settings: { upsert: mockSettingsUpsert } },
}));
mock.module("@/shared/lib/crypto", () => ({
  encrypt: (v: string) => `enc:${v}`,
  safeDecrypt: (v: string) => v,
}));

import { updateTurnstileSettings } from "@/shared/domain/settings/api-key-commands";

function lastUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsUpsert.mock.calls.at(-1);
  return lastCall?.[0]?.update ?? {};
}

beforeEach(() => {
  mockSettingsUpsert.mockClear();
});

describe("updateTurnstileSettings", () => {
  test("Site Key が null（ロック中の空送信）の場合は既存値を維持する", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: null,
      turnstileSecretKey: null,
    });
    expect(Object.keys(lastUpdate())).not.toContain("turnstileSiteKey");
    expect(Object.keys(lastUpdate())).not.toContain("turnstileSecretKey");
  });

  test("Site Key を指定すると保存される", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: "0xNEWSITEKEY",
      turnstileSecretKey: null,
    });
    expect(lastUpdate()["turnstileSiteKey"]).toBe("0xNEWSITEKEY");
  });

  test("Secret Key を指定すると暗号化して保存され、Site Key は維持される", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: null,
      turnstileSecretKey: "0xSECRET",
    });
    expect(lastUpdate()["turnstileSecretKey"]).toBe("enc:0xSECRET");
    expect(Object.keys(lastUpdate())).not.toContain("turnstileSiteKey");
  });
});
