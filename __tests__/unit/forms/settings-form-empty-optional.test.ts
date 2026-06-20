/**
 * 回帰テスト: settings フォームスキーマの「空欄保存 / OFF 保存」
 *
 * conform の `parseWithZod`（@conform-to/zod/v4）は空入力を `undefined` に変換する。
 * フォームスキーマが必須の `z.string()` / `z.boolean()` のままだと、
 * - 任意テキストの空欄保存が「expected string, received undefined」
 * - Switch を OFF（hidden input が ""）にした保存が「expected boolean, received undefined」
 * で全項目弾かれる。
 *
 * 任意テキストは `.optional()`（`optionalText`）、Switch 由来 boolean は
 * `z.boolean().default(false)`（`switchBoolean`）、`<input type=number>` の任意は
 * `.nullish()` で undefined を許容する必要がある。ここで実体のフォームスキーマを
 * import し、FormData 経由で固定する（修正を外すと本テストが落ちる）。
 *
 * 既存の `__tests__/integration/actions/admin/settings-*.test.ts` はスキーマを
 * インライン再宣言し object 入力で検証していたため、この conform 経由の
 * 空→undefined 変換を捕捉できなかった。本テストが SSoT。
 */
import { describe, test, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  LayoutWidth,
  DiscountCombinationMode,
  CalendarSyncMethod,
} from "@/shared/lib/validations/enums/prisma-types";
import { SUPPORTED_CURRENCY_VALUES } from "@/shared/lib/stripe-shared";
import {
  businessInfoFormSchema,
  contactInfoFormSchema,
  basicInfoFormSchema,
  maintenanceFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import {
  metaFormSchema,
  analyticsFormSchema,
  searchVerificationFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-seo-analytics";
import {
  cookieConsentFormSchema,
  footerFormSchema,
  layoutFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
import {
  turnstileFormSchema,
  googleMapsFormSchema,
  icalFeedFormSchema,
  discountFormSchema,
  stripeFormSchema,
  resendFormSchema,
  cloudflareFormSchema,
  googleCalendarFormSchema,
  twoWaySyncFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import {
  emailFormSchema,
  notificationFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-email-notification";
import { featureModulesSettingsSchema } from "@/admin/actions/settings/schemas/basic";
import type { z } from "zod";

/** Record → FormData（値は全て文字列。空欄 / OFF は "" を渡す）。 */
function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

function expectSuccess(
  schema: z.ZodTypeAny,
  fd: FormData,
  label: string,
): void {
  const result = parseWithZod(fd, { schema });
  if (result.status !== "success") {
    throw new Error(
      `${label}: expected success but got error: ${JSON.stringify(
        (result as { error?: unknown }).error,
      )}`,
    );
  }
  expect(result.status).toBe("success");
}

function emptyKeys(keys: readonly string[]): FormData {
  const fd = new FormData();
  for (const k of keys) fd.set(k, "");
  return fd;
}

const CURRENCY = SUPPORTED_CURRENCY_VALUES[0] ?? "jpy";
const SYNC_METHOD = Object.values(CalendarSyncMethod)[0] as string;
const DISCOUNT_MODE = Object.values(DiscountCombinationMode)[0] as string;

describe("settings フォームスキーマ: 空欄保存 / OFF 保存（conform の空→undefined 変換）", () => {
  // ---------------------------------------------------------------------------
  // 既存（#618 で修正済み）— 退行ガード
  // ---------------------------------------------------------------------------
  test("事業者情報: 全項目空欄でも success", () => {
    expectSuccess(
      businessInfoFormSchema,
      emptyKeys([
        "businessName",
        "businessNameKana",
        "representativeName",
        "businessType",
        "industryType",
        "establishedDate",
        "registrationNumber",
        "invoiceNumber",
        "businessDescription",
      ]),
      "businessInfo",
    );
  });

  test("連絡先情報: 全項目空欄でも success", () => {
    expectSuccess(
      contactInfoFormSchema,
      emptyKeys([
        "phoneNumber",
        "faxNumber",
        "email",
        "postalCode",
        "prefecture",
        "city",
        "streetAddress",
        "buildingName",
      ]),
      "contactInfo",
    );
  });

  // ---------------------------------------------------------------------------
  // 基本情報 / メンテナンス（任意テキスト + Switch）
  // ---------------------------------------------------------------------------
  test("基本情報: 全テキスト空欄 + ロゴ Switch OFF でも success", () => {
    expectSuccess(
      basicInfoFormSchema,
      emptyKeys([
        "siteName",
        "siteDescription",
        "faviconUrl",
        "defaultOgpImageUrl",
        "headerLogoUrl",
        "footerLogoUrl",
        "footerCopyright",
        "useHeaderLogo",
        "useFooterLogo",
      ]),
      "basicInfo",
    );
  });

  test("基本情報: siteName 101文字はエラー（max は維持）", () => {
    const fd = emptyKeys(["siteName"]);
    fd.set("siteName", "あ".repeat(101));
    expect(parseWithZod(fd, { schema: basicInfoFormSchema }).status).toBe(
      "error",
    );
  });

  test("メンテナンス: モード OFF + メッセージ空欄でも success（通常状態の保存）", () => {
    expectSuccess(
      maintenanceFormSchema,
      emptyKeys(["maintenanceMode", "maintenanceMessage"]),
      "maintenance",
    );
  });

  // ---------------------------------------------------------------------------
  // SEO / Analytics / 検索エンジン検証
  // ---------------------------------------------------------------------------
  test("メタ情報: 全項目空欄でも success", () => {
    expectSuccess(
      metaFormSchema,
      emptyKeys([
        "defaultMetaDescription",
        "defaultMetaKeywords",
        "defaultOgpTitle",
        "defaultOgpDescription",
      ]),
      "meta",
    );
  });

  test("Analytics: type=none + ID 空欄でも success", () => {
    expectSuccess(
      analyticsFormSchema,
      form({
        analyticsType: "none",
        googleAnalyticsId: "",
        googleTagManagerId: "",
        gaPropertyId: "",
        microsoftClarityId: "",
      }),
      "analytics",
    );
  });

  test("検索エンジン検証: 全項目空欄でも success", () => {
    expectSuccess(
      searchVerificationFormSchema,
      emptyKeys(["googleSearchConsoleId", "bingWebmasterToolsId"]),
      "searchVerification",
    );
  });

  // ---------------------------------------------------------------------------
  // Cookie / フッター / レイアウト
  // ---------------------------------------------------------------------------
  test("Cookie同意: 有効 OFF + 全テキスト空欄でも success", () => {
    expectSuccess(
      cookieConsentFormSchema,
      emptyKeys([
        "cookieConsentEnabled",
        "cookieConsentMessage",
        "cookieConsentAcceptText",
        "cookieConsentRejectText",
        "cookieConsentPolicyUrl",
      ]),
      "cookieConsent",
    );
  });

  test("フッター: tagline 空欄 + SNS Switch OFF でも success（必須ラベルは保持）", () => {
    expectSuccess(
      footerFormSchema,
      form({
        footerTagline: "",
        footerNavigationLabel: "ナビゲーション",
        footerContactLabel: "お問い合わせ",
        footerHoursLabel: "営業時間",
        footerShowSocialLinks: "",
        themeColor: "#fafafa",
      }),
      "footer",
    );
  });

  test("フッター: 必須ラベル空欄はエラー", () => {
    expect(
      parseWithZod(
        form({
          footerTagline: "",
          footerNavigationLabel: "",
          footerContactLabel: "お問い合わせ",
          footerHoursLabel: "営業時間",
          footerShowSocialLinks: "",
          themeColor: "#fafafa",
        }),
        { schema: footerFormSchema },
      ).status,
    ).toBe("error");
  });

  test("レイアウト: 非 CUSTOM はカスタム幅空欄でも success", () => {
    expectSuccess(
      layoutFormSchema,
      form({
        containerWidth: LayoutWidth.LG,
        containerWidthCustom: "",
        contentWidth: LayoutWidth.MD,
        contentWidthCustom: "",
      }),
      "layout",
    );
  });

  // ---------------------------------------------------------------------------
  // 連携系（API キー / Stripe / Calendar / Instagram）
  // ---------------------------------------------------------------------------
  test("Turnstile / Google Maps / Resend / Cloudflare: 空欄でも success", () => {
    expectSuccess(
      turnstileFormSchema,
      emptyKeys(["turnstileSiteKey", "turnstileSecretKey"]),
      "turnstile",
    );
    expectSuccess(
      googleMapsFormSchema,
      emptyKeys(["googleMapsApiKey"]),
      "googleMaps",
    );
    expectSuccess(resendFormSchema, emptyKeys(["resendApiKey"]), "resend");
    expectSuccess(
      cloudflareFormSchema,
      emptyKeys(["cloudflareZoneId", "cloudflareApiToken"]),
      "cloudflare",
    );
  });

  test("iCal フィード: 両 Switch OFF でも success", () => {
    expectSuccess(
      icalFeedFormSchema,
      emptyKeys(["icalFeedEnabled", "icalFeedIncludeCustomerInfo"]),
      "icalFeed",
    );
  });

  test("割引: 全 Switch OFF + 空ルールでも success", () => {
    expectSuccess(
      discountFormSchema,
      form({
        durationDiscountEnabled: "",
        discountCombinationMode: DISCOUNT_MODE,
        showOriginalPrice: "",
        discountWarningEnabled: "",
      }),
      "discount",
    );
  });

  test("Stripe: 有効 Switch OFF + キー空欄でも success", () => {
    expectSuccess(
      stripeFormSchema,
      form({
        stripeEnabled: "",
        stripePublishableKey: "",
        stripeSecretKey: "",
        stripeWebhookSecret: "",
        stripeCurrency: CURRENCY,
      }),
      "stripe",
    );
  });

  test("Google Calendar: 全 Switch OFF + ID 空欄 + リマインダー空欄でも success", () => {
    expectSuccess(
      googleCalendarFormSchema,
      form({
        googleCalendarEnabled: "",
        googleCalendarId: "",
        serviceAccountJson: "",
        icalAttachmentEnabled: "",
        addToCalendarLinksEnabled: "",
        googleCalendarMeetEnabled: "",
        googleCalendarReminderMinutes: "",
      }),
      "googleCalendar",
    );
  });

  test("双方向同期: 有効 Switch OFF でも success", () => {
    expectSuccess(
      twoWaySyncFormSchema,
      form({
        enabled: "",
        syncMethod: SYNC_METHOD,
      }),
      "twoWaySync",
    );
  });

  // ---------------------------------------------------------------------------
  // メール / 通知
  // ---------------------------------------------------------------------------
  test("メール設定: 送信 Switch OFF + 全テキスト空欄でも success", () => {
    expectSuccess(
      emailFormSchema,
      emptyKeys([
        "senderEmail",
        "senderName",
        "replyToEmail",
        "sendReservationConfirmationEmail",
        "notificationEmailAddresses",
      ]),
      "email",
    );
  });

  test("メール設定: 不正メールはエラー（任意だが形式は検証）", () => {
    const fd = emptyKeys([
      "senderEmail",
      "senderName",
      "replyToEmail",
      "sendReservationConfirmationEmail",
      "notificationEmailAddresses",
    ]);
    fd.set("senderEmail", "invalid-email");
    expect(parseWithZod(fd, { schema: emailFormSchema }).status).toBe("error");
  });

  test("通知設定: 全 Switch OFF でも success", () => {
    expectSuccess(
      notificationFormSchema,
      emptyKeys([
        "notifyNewReservation",
        "notifyReservationChange",
        "notifyReservationCancel",
        "notifyNewInquiry",
        "notifyEventRegistration",
        "notifyEventCancellation",
      ]),
      "notification",
    );
  });

  // ---------------------------------------------------------------------------
  // Feature Modules（client/server 共用 declarative schema）
  // ---------------------------------------------------------------------------
  test("Feature Modules: 全 Switch OFF でも success（全 false）", () => {
    const result = parseWithZod(
      emptyKeys([
        "spaces",
        "reservation",
        "events",
        "posts",
        "news",
        "faq",
        "access",
        "contact",
        "reviews",
      ]),
      { schema: featureModulesSettingsSchema },
    );
    expect(result.status).toBe("success");
  });
});
