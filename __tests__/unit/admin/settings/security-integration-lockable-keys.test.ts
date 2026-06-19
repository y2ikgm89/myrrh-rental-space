/**
 * 外部サービス API キーカードの「ロック中保存」検証回帰テスト。
 *
 * 公開キー / 秘密キーは管理 UI の「変更」ボタンでロックされ、ロック中はフォーム送信時に
 * 当該フィールドが空送信になる。conform v4 は空文字を undefined へ正規化するため、必須
 * z.string() / z.boolean() のままだと「expected string/boolean, received undefined」で
 * ロック中のフォーム保存が弾かれる（＝秘密を再入力せずに公開キーだけ変更して保存できない）。
 *
 * 本テストは各カードのフォームスキーマが「ロック状態の FormData」を success として受理する
 * ことを保証する（.optional() / .default(false) / .nullish() 修正の回帰防止）。
 */

import { describe, test, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  turnstileFormSchema,
  googleMapsFormSchema,
  resendFormSchema,
  cloudflareFormSchema,
  stripeFormSchema,
  googleCalendarFormSchema,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-security-integrations";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("security-integration forms: ロック中保存の受理", () => {
  describe("turnstile", () => {
    test("Site Key 変更・Secret Key ロック（空）で保存できる", () => {
      const r = parseWithZod(
        fd({ turnstileSiteKey: "0xNEWSITEKEY", turnstileSecretKey: "" }),
        { schema: turnstileFormSchema },
      );
      expect(r.status).toBe("success");
    });

    test("両方ロック（空）でも保存できる", () => {
      const r = parseWithZod(
        fd({ turnstileSiteKey: "", turnstileSecretKey: "" }),
        { schema: turnstileFormSchema },
      );
      expect(r.status).toBe("success");
    });
  });

  describe("cloudflare", () => {
    test("Zone ID あり・API Token ロック（空）で保存できる", () => {
      const r = parseWithZod(
        fd({ cloudflareZoneId: "zone123", cloudflareApiToken: "" }),
        { schema: cloudflareFormSchema },
      );
      expect(r.status).toBe("success");
    });
  });

  describe("google maps / resend（単一キー）", () => {
    test("キーをロック（空）したまま保存できる", () => {
      expect(
        parseWithZod(fd({ googleMapsApiKey: "" }), {
          schema: googleMapsFormSchema,
        }).status,
      ).toBe("success");
      expect(
        parseWithZod(fd({ resendApiKey: "" }), { schema: resendFormSchema })
          .status,
      ).toBe("success");
    });
  });

  describe("stripe", () => {
    test("公開可能キー変更・シークレット/Webhook ロック（空）で保存できる（テストモード）", () => {
      const r = parseWithZod(
        fd({
          stripeEnabled: "on",
          stripePublishableKey: "pk_test_abcdef",
          stripeSecretKey: "",
          stripeWebhookSecret: "",
          stripeCurrency: "jpy",
        }),
        { schema: stripeFormSchema },
      );
      expect(r.status).toBe("success");
    });

    test("キーをすべて空（ロック）にしても保存できる", () => {
      const r = parseWithZod(
        fd({
          stripeEnabled: "on",
          stripePublishableKey: "",
          stripeSecretKey: "",
          stripeWebhookSecret: "",
          stripeCurrency: "jpy",
        }),
        { schema: stripeFormSchema },
      );
      expect(r.status).toBe("success");
      if (r.status === "success") {
        expect(r.value.stripeEnabled).toBe(true);
      }
    });

    test("無効な公開可能キーは引き続き拒否される", () => {
      const r = parseWithZod(
        fd({
          stripeEnabled: "",
          stripePublishableKey: "invalid_key",
          stripeSecretKey: "",
          stripeWebhookSecret: "",
          stripeCurrency: "jpy",
        }),
        { schema: stripeFormSchema },
      );
      expect(r.status).toBe("error");
    });
  });

  describe("google calendar", () => {
    test("カレンダーID あり・サービスアカウントロック（空）・トグル OFF で保存できる", () => {
      const r = parseWithZod(
        fd({
          googleCalendarEnabled: "on",
          googleCalendarId: "cal@group.calendar.google.com",
          serviceAccountJson: "",
          icalAttachmentEnabled: "",
          addToCalendarLinksEnabled: "",
          googleCalendarMeetEnabled: "",
          googleCalendarReminderMinutes: "",
        }),
        { schema: googleCalendarFormSchema },
      );
      expect(r.status).toBe("success");
      if (r.status === "success") {
        expect(r.value.icalAttachmentEnabled).toBe(false);
        // リマインダー空欄（既定）も受理される
        expect(r.value.googleCalendarReminderMinutes ?? null).toBe(null);
      }
    });
  });
});
