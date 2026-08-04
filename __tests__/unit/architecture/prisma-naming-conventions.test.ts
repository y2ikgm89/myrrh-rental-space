/**
 * schema.prisma の**物理名**の規約。
 *
 * 目標の形（clean break の到達点）:
 *
 * - 列の物理名は snake_case。Prisma の field 名は camelCase のまま `@map` で寄せる
 * - enum の型名は snake_case（`@@map`）
 * - enum の値は UPPER_SNAKE
 *
 * ## なぜゲートが要るのか
 *
 * 962 列を機械的に変換する作業に入る前に、**変換できたことを確認する手段**が
 * 1 つも無かった。`@map` / `@@map` / enum 値の casing を見るテストは repo 全体で
 * ゼロで、変換漏れも取り違えも静かに通る。
 *
 * ## ratchet
 *
 * 現状は 77 モデル / 40 enum すべてが未対応なので、免除リストから始めて**縮める一方**に
 * 運用する。守るのは 3 点:
 *
 * 1. 免除に無いものは規約を満たす（新規宣言は最初から正しい形でしか書けない）
 * 2. **免除リストに載っているのに既に規約を満たしているものは失敗**にする。
 *    片付いた entry を消し忘れると、後で退行したときに黙って免除される
 * 3. 免除の件数は現状以下（増やせない）
 *
 * ## snake_case の規則
 *
 * 大文字の前に `_` を入れて全体を小文字化するだけ。`ogpImageUrl` → `ogp_image_url`、
 * `r2Key` → `r2_key`、`googleBusinessPlaceId` → `google_business_place_id`。
 * 連続大文字（`URLPath` のような形）は現行スキーマに存在しないので考慮しない。
 */

import { describe, expect, test } from "bun:test";

import { readPrismaSchema } from "../../support/prisma-sources";

const SCALAR_TYPES = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

/** WP10-15 で列に `@map` を入れるまでの免除。**縮める一方**。 */
const MODELS_PENDING_COLUMN_MAP = new Set([
  "Account",
  "AdminNotification",
  "AnnouncementBar",
  "AuditLog",
  "BlockTemplate",
  "BlockedDate",
  "Coupon",
  "Customer",
  "EditorComment",
  "EditorCommentThread",
  "Event",
  "EventCategory",
  "EventRegistration",
  "EventTicket",
  "EventTimeSlot",
  "FaqCategory",
  "FaqItem",
  "Inquiry",
  "InquiryAttachment",
  "InquiryInternalNote",
  "InquiryReply",
  "InquiryStatusHistory",
  "InquiryTag",
  "InquiryTagOnInquiry",
  "InstagramPost",
  "Location",
  "Media",
  "NavigationItem",
  "News",
  "Page",
  "PendingCustomerEmailChange",
  "PendingCustomerMerge",
  "Post",
  "PostCategory",
  "PostTag",
  "PostTagOnPost",
  "Receipt",
  "ReceiptSequence",
  "Refund",
  "Reservation",
  "ReservationSeries",
  "Section",
  "Session",
  "SettingsAnalytics",
  "SettingsAnnouncementCarousel",
  "SettingsCommerce",
  "SettingsDataRetention",
  "SettingsFeatures",
  "SettingsGoogleBusinessProfile",
  "SettingsGoogleCalendar",
  "SettingsGoogleMaps",
  "SettingsInstagram",
  "SettingsLayout",
  "SettingsNotification",
  "SettingsOrganization",
  "SettingsResend",
  "SettingsReservation",
  "SettingsSeo",
  "SettingsSidebar",
  "SettingsStripe",
  "SettingsSwitchbot",
  "SettingsSystem",
  "SettingsTurnstile",
  "SmartLockDevice",
  "SmartLockPasscode",
  "SocialLink",
  "Space",
  "SpaceCategory",
  "SpaceRatePlan",
  "SpaceReview",
  "StripeEvent",
  "TermsAgreement",
  "TermsDocument",
  "TransferAccount",
  "User",
  "UserPageAssignment",
  "Verification",
]);

/** WP8 で enum 型名に `@@map` を入れるまでの免除。**縮める一方**。 */
const ENUMS_PENDING_TYPE_MAP = new Set([
  "AnalyticsType",
  "AnnouncementBarAnimation",
  "AnnouncementBarDesignStyle",
  "AuditAction",
  "CalendarSyncMethod",
  "CouponType",
  "CustomerStatus",
  "CustomerType",
  "DayOfWeek",
  "DiscountCombinationMode",
  "DiscountType",
  "DurationDiscountOverride",
  "EditorCommentStatus",
  "EmailDeliveryStatus",
  "EventFormat",
  "EventScheduleMode",
  "EventStatus",
  "HeaderBackgroundMode",
  "HeaderScrollBehavior",
  "HolidayMode",
  "InquiryReplyAuthorType",
  "InquiryStatus",
  "InstagramMediaType",
  "LayoutWidth",
  "MediaType",
  "MediaUsage",
  "MeetingProvider",
  "NavigationType",
  "PaymentStatus",
  "PostStatus",
  "RegistrationStatus",
  "ReservationSeriesFreq",
  "ReservationStatus",
  "Role",
  "SmartLockDeviceType",
  "SmartLockPasscodeStatus",
  "SocialPlatform",
  "TaxDisplayMode",
  "TaxRateType",
  "TermsScope",
]);

/** WP8 で値を UPPER_SNAKE に揃えるまでの免除。**縮める一方**。 */
const ENUMS_PENDING_UPPER_SNAKE_VALUES = new Set([
  "AnalyticsType",
  "AnnouncementBarAnimation",
  "AnnouncementBarDesignStyle",
  "CalendarSyncMethod",
  "DiscountCombinationMode",
  "DiscountType",
  "DurationDiscountOverride",
  "HeaderBackgroundMode",
  "HeaderScrollBehavior",
  "HolidayMode",
  "TaxDisplayMode",
  "TaxRateType",
]);

export function toSnakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

type Column = {
  readonly field: string;
  readonly mappedTo: string | undefined;
};

type Model = { readonly name: string; readonly columns: readonly Column[] };
type EnumDecl = {
  readonly name: string;
  readonly values: readonly string[];
  readonly mappedTo: string | undefined;
};

const schema = readPrismaSchema();

function parseBlocks(kind: "model" | "enum"): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const pattern = new RegExp(`^${kind} (\\w+) \\{([\\s\\S]*?)^\\}`, "gmu");
  for (const match of schema.matchAll(pattern)) {
    const name = match[1];
    const body = match[2];
    if (name === undefined || body === undefined) continue;
    out.push({ name, body });
  }
  return out;
}

const modelBlocks = parseBlocks("model");
const enumBlocks = parseBlocks("enum");
const modelNames = new Set(modelBlocks.map((b) => b.name));
const enumNames = new Set(enumBlocks.map((b) => b.name));

/**
 * 列だけを拾う。**リレーションフィールドは列ではない**ので除く
 * （型がモデル名なら関係、スカラーか enum なら列）。
 */
const models: Model[] = modelBlocks.map(({ name, body }) => {
  const columns: Column[] = [];
  for (const line of body.split(/\r?\n/u)) {
    const match = /^ {2}(\w+)\s+(\w+)/u.exec(line);
    if (!match) continue;
    const [, field, type] = match;
    if (field === undefined || type === undefined) continue;
    if (modelNames.has(type)) continue;
    if (!SCALAR_TYPES.has(type) && !enumNames.has(type)) continue;
    const mapped = /@map\("([^"]+)"\)/u.exec(line);
    columns.push({ field, mappedTo: mapped?.[1] });
  }
  return { name, columns };
});

const enums: EnumDecl[] = enumBlocks.map(({ name, body }) => {
  const values: string[] = [];
  for (const line of body.split(/\r?\n/u)) {
    const match = /^ {2}(\w+)/u.exec(line);
    if (match?.[1] !== undefined) values.push(match[1]);
  }
  const mapped = /@@map\("([^"]+)"\)/u.exec(body);
  return { name, values, mappedTo: mapped?.[1] };
});

/** そのモデルの列がすべて規約を満たしているか。 */
function columnViolations(model: Model): string[] {
  return model.columns
    .filter((c) => c.field !== toSnakeCase(c.field))
    .filter((c) => c.mappedTo !== toSnakeCase(c.field))
    .map(
      (c) =>
        `${model.name}.${c.field} -> @map("${toSnakeCase(c.field)}") が要る` +
        (c.mappedTo === undefined ? "" : `（今は "${c.mappedTo}"）`),
    );
}

describe("schema.prisma の物理名", () => {
  test("解析が空振りしていない", () => {
    expect(models.length).toBeGreaterThan(50);
    expect(enums.length).toBeGreaterThan(30);
    expect(models.reduce((n, m) => n + m.columns.length, 0)).toBeGreaterThan(
      900,
    );
  });

  test("免除に無いモデルは全列が snake_case へ map されている", () => {
    const violations = models
      .filter((m) => !MODELS_PENDING_COLUMN_MAP.has(m.name))
      .flatMap(columnViolations);

    expect(violations).toEqual([]);
  });

  test("免除に無い enum は型名が snake_case へ map されている", () => {
    const violations = enums
      .filter((e) => !ENUMS_PENDING_TYPE_MAP.has(e.name))
      .filter((e) => e.mappedTo !== toSnakeCase(e.name))
      .map((e) => `enum ${e.name} -> @@map("${toSnakeCase(e.name)}") が要る`);

    expect(violations).toEqual([]);
  });

  test("免除に無い enum の値は UPPER_SNAKE", () => {
    const violations = enums
      .filter((e) => !ENUMS_PENDING_UPPER_SNAKE_VALUES.has(e.name))
      .flatMap((e) =>
        e.values
          .filter((v) => v !== v.toUpperCase())
          .map((v) => `enum ${e.name}.${v} が UPPER_SNAKE でない`),
      );

    expect(violations).toEqual([]);
  });

  // ---- ratchet 本体 ----

  test("片付いた entry が免除に残っていない（列）", () => {
    // 消し忘れると、後でその モデルが退行しても黙って免除される。
    const stale = models
      .filter((m) => MODELS_PENDING_COLUMN_MAP.has(m.name))
      .filter((m) => columnViolations(m).length === 0)
      .map((m) => m.name);

    expect(stale).toEqual([]);
  });

  test("片付いた entry が免除に残っていない（enum 型名）", () => {
    const stale = enums
      .filter((e) => ENUMS_PENDING_TYPE_MAP.has(e.name))
      .filter((e) => e.mappedTo === toSnakeCase(e.name))
      .map((e) => e.name);

    expect(stale).toEqual([]);
  });

  test("片付いた entry が免除に残っていない（enum 値）", () => {
    const stale = enums
      .filter((e) => ENUMS_PENDING_UPPER_SNAKE_VALUES.has(e.name))
      .filter((e) => e.values.every((v) => v === v.toUpperCase()))
      .map((e) => e.name);

    expect(stale).toEqual([]);
  });

  test("免除は増やせない", () => {
    // 変換を進めるたびに下げること。上げる変更は必ずレビューで止める。
    expect(MODELS_PENDING_COLUMN_MAP.size).toBeLessThanOrEqual(77);
    expect(ENUMS_PENDING_TYPE_MAP.size).toBeLessThanOrEqual(40);
    expect(ENUMS_PENDING_UPPER_SNAKE_VALUES.size).toBeLessThanOrEqual(12);
  });

  test("免除に実在しない名前が混ざっていない", () => {
    const unknown = [
      ...[...MODELS_PENDING_COLUMN_MAP].filter((n) => !modelNames.has(n)),
      ...[...ENUMS_PENDING_TYPE_MAP].filter((n) => !enumNames.has(n)),
      ...[...ENUMS_PENDING_UPPER_SNAKE_VALUES].filter((n) => !enumNames.has(n)),
    ];

    expect(unknown).toEqual([]);
  });
});

describe("toSnakeCase", () => {
  test("camelCase を snake_case にする", () => {
    expect(toSnakeCase("ogpImageUrl")).toBe("ogp_image_url");
    expect(toSnakeCase("googleBusinessPlaceId")).toBe(
      "google_business_place_id",
    );
    expect(toSnakeCase("r2Key")).toBe("r2_key");
  });

  test("既に小文字のものは変えない", () => {
    expect(toSnakeCase("id")).toBe("id");
    expect(toSnakeCase("slug")).toBe("slug");
  });

  test("PascalCase の先頭に _ を付けない", () => {
    expect(toSnakeCase("ReservationStatus")).toBe("reservation_status");
    expect(toSnakeCase("Role")).toBe("role");
  });
});
