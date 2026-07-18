/**
 * WEBHOOK-01 回帰テスト
 *
 * `googleCalendarWebhookToken` を SwitchBot webhook path token と同じ encrypt-at-rest
 * 姿勢で扱うことを固定する:
 *
 * 1. `saveGoogleCalendarWebhookToken` は平文をDBに送らず、
 *    `SETTINGS_CRYPTO_PURPOSES.googleCalendarWebhookToken` で暗号化した ciphertext を書く
 * 2. `getGoogleCalendarWebhookState` は同じ purpose の期待値で復号し平文を返す
 *    （書込→読出 round-trip が成立する）
 * 3. cross-purpose reject: SwitchBot purpose で暗号化された ciphertext を GCal getter に
 *    食わせても復号は成立せず、null に落ちる（webhook route が 503 で fail-closed）
 * 4. レガシー平文（暗号化前に保存された既存値）も復号成立しないため null になる
 *    — renewal cron が clear + 再登録して encrypt-at-rest ciphertext を書き直す migration story
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// -----------------------------------------------------------------------------
// Prisma mock: 単一の Settings singleton レコードを in-memory で保持
// -----------------------------------------------------------------------------

type SettingsRow = {
  id: string;
  googleCalendarId: string | null;
  googleCalendarWebhookChannelId: string | null;
  googleCalendarWebhookResourceId: string | null;
  googleCalendarWebhookToken: string | null;
  googleCalendarWebhookExpiration: Date | null;
};

let settingsRow: SettingsRow = {
  id: "singleton",
  googleCalendarId: null,
  googleCalendarWebhookChannelId: null,
  googleCalendarWebhookResourceId: null,
  googleCalendarWebhookToken: null,
  googleCalendarWebhookExpiration: null,
};

type UpsertArgs = {
  where: { id: string };
  create: Partial<SettingsRow>;
  update: Partial<SettingsRow>;
};

const mockSettingsUpsert = mock<(args: UpsertArgs) => Promise<SettingsRow>>(
  async (args) => {
    settingsRow = { ...settingsRow, ...args.update };
    return settingsRow;
  },
);

const mockSettingsFindUnique = mock<
  (_args: unknown) => Promise<SettingsRow | null>
>(async () => settingsRow);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: {
      upsert: mockSettingsUpsert,
      findUnique: mockSettingsFindUnique,
    },
  },
}));

// admin-queries.ts が触る他 enum も mock（本テストでは値そのものは使わない）
mock.module("@generated/prisma/enums", () => ({
  CalendarSyncMethod: { polling: "polling", webhook: "webhook", both: "both" },
  DiscountCombinationMode: { best: "best", both: "both" },
  TaxDisplayMode: {
    tax_included: "tax_included",
    tax_excluded: "tax_excluded",
    both: "both",
  },
}));

// google-calendar/service-account は googleapis に依存するためモック（値は未使用）
mock.module("@/shared/lib/google-calendar/service-account", () => ({
  encryptServiceAccountJson: mock<(json: string) => string>(
    (json) => `encrypted:${json}`,
  ),
  extractServiceAccountEmail: mock<() => string | null>(() => null),
}));

// -----------------------------------------------------------------------------
// SUT import（mock 宣言後）
// -----------------------------------------------------------------------------

import { encrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { saveGoogleCalendarWebhookToken } from "@/shared/domain/settings/integration-commands";
import { getGoogleCalendarWebhookState } from "@/shared/domain/settings/admin-queries";

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

function resetSettings() {
  settingsRow = {
    id: "singleton",
    googleCalendarId: null,
    googleCalendarWebhookChannelId: "channel-1",
    googleCalendarWebhookResourceId: "resource-1",
    googleCalendarWebhookToken: null,
    googleCalendarWebhookExpiration: null,
  };
}

describe("WEBHOOK-01: googleCalendarWebhookToken encrypt-at-rest", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockClear();
    mockSettingsFindUnique.mockClear();
    resetSettings();
  });

  test("save → read round-trip で平文が戻る（encrypt-at-rest 契約）", async () => {
    const plaintext = "gcal-webhook-token-plaintext-xyz";

    await saveGoogleCalendarWebhookToken(plaintext);

    // DB に書かれた値は暗号化 ciphertext（v2:kid:purpose:iv:tag:ct 形式）
    const stored = settingsRow.googleCalendarWebhookToken;
    expect(stored).not.toBe(null);
    expect(stored).not.toBe(plaintext);
    expect(stored).toMatch(
      /^v2:v1:google-calendar-webhook-token:[^:]+:[^:]+:[^:]+$/,
    );

    // getGoogleCalendarWebhookState は復号して平文を返す
    const state = await getGoogleCalendarWebhookState();
    expect(state.token).toBe(plaintext);
  });

  test("cross-purpose reject: SwitchBot purpose の ciphertext は GCal getter で復号されず null", async () => {
    // 攻撃者が別テーブルから SwitchBot 用 ciphertext をコピーしたシナリオ。
    // decrypt() が embedded purpose と expectedPurpose の不一致で throw し、
    // safeDecryptToString が silent null に集約する。
    const foreignCiphertext = encrypt("some-token-value", {
      purpose: SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken,
    });
    settingsRow.googleCalendarWebhookToken = foreignCiphertext;

    const state = await getGoogleCalendarWebhookState();
    expect(state.token).toBe(null);
  });

  test("レガシー平文は復号成立せず null（route は 503 で fail-closed → 再登録 migration story）", async () => {
    // encrypt-at-rest 導入前の既存 DB 値（平文）は "v2:" prefix を満たさないため
    // parseCiphertext で throw → safeDecryptToString が null に集約する。
    settingsRow.googleCalendarWebhookToken = "legacy-plaintext-token";

    const state = await getGoogleCalendarWebhookState();
    expect(state.token).toBe(null);
  });

  test("トークン未設定は null（DB null → getter null）", async () => {
    settingsRow.googleCalendarWebhookToken = null;

    const state = await getGoogleCalendarWebhookState();
    expect(state.token).toBe(null);
  });

  test("破損 ciphertext（authTag 改ざん）は復号成立せず null", async () => {
    const good = encrypt("gcal-webhook-token", {
      purpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarWebhookToken,
    });
    // 末尾 ct を1文字ずらして GCM authTag 検証を落とす
    const tampered = `${good.slice(0, -1)}X`;
    settingsRow.googleCalendarWebhookToken = tampered;

    const state = await getGoogleCalendarWebhookState();
    expect(state.token).toBe(null);
  });
});
