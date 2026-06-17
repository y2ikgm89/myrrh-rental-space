/**
 * api-key-commands の「公開キー / ID = 空は既存維持」回帰テスト。
 *
 * Site Key（Turnstile）/ Zone ID（Cloudflare）は管理 UI の「変更」ボタンでロックされ、
 * ロック中の保存は空送信になる。空（falsy）を「既存値を維持」として扱い（秘密キーと同じ
 * 意味論）、ロック中の保存で値が消えないことを保証する。クリアは clear* command 経由。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSettingsUpsert = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "singleton" }),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: { settings: { upsert: mockSettingsUpsert } },
}));
mock.module("@/shared/lib/crypto", () => ({
  encrypt: (v: string) => `enc:${v}`,
  safeDecrypt: (v: string) => v,
}));

import {
  updateTurnstileSettings,
  updateCloudflareSettings,
} from "@/shared/domain/settings/api-key-commands";

function lastUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsUpsert.mock.calls.at(-1) as unknown as
    | [{ update?: Record<string, unknown> }]
    | undefined;
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

describe("updateCloudflareSettings", () => {
  test("Zone ID が null（ロック中の空送信）の場合は既存値を維持する", async () => {
    await updateCloudflareSettings({
      cloudflareZoneId: null,
      cloudflareApiToken: null,
    });
    expect(Object.keys(lastUpdate())).not.toContain("cloudflareZoneId");
    expect(Object.keys(lastUpdate())).not.toContain("cloudflareApiToken");
  });

  test("Zone ID を指定すると保存される", async () => {
    await updateCloudflareSettings({
      cloudflareZoneId: "zone123",
      cloudflareApiToken: null,
    });
    expect(lastUpdate()["cloudflareZoneId"]).toBe("zone123");
  });

  test("API Token を指定すると暗号化して保存され、Zone ID は維持される", async () => {
    await updateCloudflareSettings({
      cloudflareZoneId: null,
      cloudflareApiToken: "cf-token",
    });
    expect(lastUpdate()["cloudflareApiToken"]).toBe("enc:cf-token");
    expect(Object.keys(lastUpdate())).not.toContain("cloudflareZoneId");
  });
});
