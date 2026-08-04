/**
 * schema.prisma の**物理名**の規約。
 *
 * 目標の形（clean break の到達点）:
 *
 * - 列の物理名は snake_case。Prisma の field 名は camelCase のまま `@map` で寄せる
 * - enum の型名は snake_case（`@@map`）
 * - enum の値は UPPER_SNAKE
 * - テーブルの物理名は snake_case。1 行しか持たない設定表は単数形、集合表は複数形
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

/** 変換開始時点で列 `@map` を持たなかったモデル。**この一覧は編集しない**。 */
const BASELINE_MODELS_NEEDING_COLUMN_MAP = new Set([
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

/** 変換開始時点で `@@map` を持たなかった enum。**この一覧は編集しない**。 */
const BASELINE_ENUMS_NEEDING_TYPE_MAP = new Set([
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

/** 変換開始時点で値が UPPER_SNAKE でなかった enum。**この一覧は編集しない**。 */
const BASELINE_ENUMS_NEEDING_UPPER_SNAKE_VALUES = new Set([
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

/**
 * 変換が済んだもの。**ここだけが増える。**
 *
 * 免除は `BASELINE \ CONVERTED` で算出する。件数の上限だけでは「1 つ片付けて 1 つ足す」
 * 交換を止められない — 実在する名前で、まだ規約違反なら stale 判定も通ってしまうので
 * 新しい違反を持ち込む余地が残る。出発点を凍結して差し引く形にすれば、
 * **BASELINE に無いものは決して免除されない**。
 */
const CONVERTED_MODELS: ReadonlySet<string> = new Set([
  "Account",
  "AnnouncementBar",
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
  "Reservation",
  "ReservationSeries",
  "Section",
  "Session",
  "SmartLockDevice",
  "SmartLockPasscode",
  "SocialLink",
  "Space",
  "SpaceCategory",
  "SpaceRatePlan",
  "SpaceReview",
  "User",
  "UserPageAssignment",
  "Verification",
]);
const CONVERTED_ENUM_TYPE_MAPS: ReadonlySet<string> = new Set([
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
const CONVERTED_ENUM_VALUES: ReadonlySet<string> = new Set([
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

function pending(
  baseline: ReadonlySet<string>,
  converted: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set([...baseline].filter((name) => !converted.has(name)));
}

const MODELS_PENDING_COLUMN_MAP = pending(
  BASELINE_MODELS_NEEDING_COLUMN_MAP,
  CONVERTED_MODELS,
);
const ENUMS_PENDING_TYPE_MAP = pending(
  BASELINE_ENUMS_NEEDING_TYPE_MAP,
  CONVERTED_ENUM_TYPE_MAPS,
);
const ENUMS_PENDING_UPPER_SNAKE_VALUES = pending(
  BASELINE_ENUMS_NEEDING_UPPER_SNAKE_VALUES,
  CONVERTED_ENUM_VALUES,
);

export function toSnakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

type Column = {
  readonly field: string;
  readonly mappedTo: string | undefined;
};

/** enum の値。`@map` があると **DB に入る値はそちら**なので必ず持ち回る。 */
type EnumValue = {
  readonly identifier: string;
  readonly mappedTo: string | undefined;
};

type Model = {
  readonly name: string;
  readonly columns: readonly Column[];
  readonly mappedTo: string | undefined;
  /** `id String @id @default("singleton")` を持つ = 1 行しか存在しない設定表。 */
  readonly isSingleton: boolean;
};
type EnumDecl = {
  readonly name: string;
  readonly values: readonly EnumValue[];
  readonly mappedTo: string | undefined;
};

/** その宣言が実際に DB へ書く名前。`@map` があればそちらが物理名。 */
function physicalName(
  identifier: string,
  mappedTo: string | undefined,
): string {
  return mappedTo ?? identifier;
}

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
  const mappedTable = /@@map\("([^"]+)"\)/u.exec(body);
  return {
    name,
    columns,
    mappedTo: mappedTable?.[1],
    isSingleton: /@id\s+@default\("singleton"\)/u.test(body),
  };
});

const enums: EnumDecl[] = enumBlocks.map(({ name, body }) => {
  const values: EnumValue[] = [];
  for (const line of body.split(/\r?\n/u)) {
    const match = /^ {2}(\w+)/u.exec(line);
    if (match?.[1] === undefined) continue;
    const mapped = /@map\("([^"]+)"\)/u.exec(line);
    values.push({ identifier: match[1], mappedTo: mapped?.[1] });
  }
  const mappedType = /@@map\("([^"]+)"\)/u.exec(body);
  return { name, values, mappedTo: mappedType?.[1] };
});

/**
 * そのモデルの列がすべて規約を満たしているか。
 *
 * **判定は物理名に対して行う**（`@map` があればそちら）。Prisma の field 名だけを
 * 見ると 2 通りの抜けが出る:
 *
 * - 既に snake_case な field に妙な `@map` が付いている（`slug @map("legacySlug")`）
 * - camelCase の field に `@map` はあるが行き先が規約と違う
 */
function columnViolations(model: Model): string[] {
  return model.columns
    .filter((c) => physicalName(c.field, c.mappedTo) !== toSnakeCase(c.field))
    .map(
      (c) =>
        `${model.name}.${c.field} の物理名が "${physicalName(c.field, c.mappedTo)}"` +
        `（"${toSnakeCase(c.field)}" であるべき）`,
    );
}

/**
 * enum の値が規約を満たしているか。
 *
 * **識別子ではなく物理値を見る。** `AUTO_HIDE @map("auto-hide")` は識別子だけ見れば
 * UPPER_SNAKE だが、**DB に入る値は `auto-hide` のまま**。識別子だけを検査すると
 * 「揃えた」と報告しながら物理値が旧いまま残る。
 */
function enumValueViolations(decl: EnumDecl): string[] {
  return decl.values
    .filter(
      (v) =>
        physicalName(v.identifier, v.mappedTo) !== v.identifier.toUpperCase(),
    )
    .map(
      (v) =>
        `enum ${decl.name}.${v.identifier} の物理値が ` +
        `"${physicalName(v.identifier, v.mappedTo)}"（UPPER_SNAKE であるべき）`,
    );
}

/**
 * 英語の規則変化だけを実装した複数形。
 *
 * 不規則変化は扱わない — **扱う必要が無い**。現行 77 モデルの物理名はすべて規則変化か
 * 単数形そのもので、不規則な語が来たら下の `TABLE_NAME_EXEMPTIONS` に理由付きで
 * 載せることになる。ここに不規則語の辞書を持たせると、辞書に無い語が黙って通る。
 */
function pluralize(word: string): string {
  if (/(?:s|x|z|ch|sh)$/u.test(word)) return `${word}es`;
  if (/[^aeiou]y$/u.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/**
 * 物理テーブル名が規約から外れてよいモデルと、その理由。
 *
 * **「英語として不自然だから」では載せない。** 規約どおりの名前が
 * *間違い* になる場合だけ載せる。
 */
const TABLE_NAME_EXEMPTIONS: ReadonlyMap<string, string> = new Map([
  ["Media", "media は不可算。medias は英語として存在しない"],
  [
    "InquiryStatusHistory",
    "history は履歴の集合そのものを指す集合名詞。inquiry_status_histories は「履歴の複数」という別の意味になる",
  ],
  [
    "ReceiptSequence",
    "現状は id='singleton' の 1 行だが、year 列で年ごとの採番系列を持つ設計。単数形へ寄せると年キー化したときに戻すことになる",
  ],
  ["ReservationSeries", "series は単複同形。serieses は英語として存在しない"],
  ["News", "news は不可算。newses は英語として存在しない"],
]);

/**
 * テーブルの物理名が規約を満たしているか。
 *
 * 規約は 2 本立て:
 *
 * 1. **単数形か複数形かは singleton かどうかで決まる。** 1 行しか持たない設定表
 *    （`@id @default("singleton")`）は単数形、それ以外の集合表は複数形。
 *    `settings_seos` のような「singleton なのに複数形」を落とすのはこの規則。
 *    判定材料を schema.prisma 内に閉じているので、DB や migration を読みに行かない。
 * 2. **語幹はモデル名から機械的に導く。** `SettingsSeo` を `seo_settings` に
 *    map するような、モデル名と対応の取れない名前を落とす。
 *
 * `SettingsAnalytics` / `SettingsGoogleMaps` / `SettingsFeatures` が免除不要なのは、
 * モデル名自体が不可算・固有名詞・複数形で、単数形の規約と元から一致するため。
 */
function tableViolations(model: Model): string[] {
  if (model.mappedTo === undefined) {
    return [`${model.name} に @@map が無い（物理名がモデル名のままになる）`];
  }
  const physical = model.mappedTo;
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(physical)) {
    return [`${model.name} の @@map("${physical}") が snake_case でない`];
  }
  if (TABLE_NAME_EXEMPTIONS.has(model.name)) return [];

  const stem = toSnakeCase(model.name);
  const expected = model.isSingleton ? stem : pluralize(stem);
  if (physical === expected) return [];
  return [
    `${model.name} の物理名が "${physical}"（"${expected}" であるべき — ` +
      `${model.isSingleton ? "1 行しか持たない設定表なので単数形" : "集合表なので複数形"}）`,
  ];
}

describe("schema.prisma の物理名", () => {
  test("解析が空振りしていない", () => {
    expect(models.length).toBeGreaterThan(50);
    expect(enums.length).toBeGreaterThan(30);
    expect(models.reduce((n, m) => n + m.columns.length, 0)).toBeGreaterThan(
      900,
    );
    // singleton 判定が全滅／全通しになっていないこと。ここが 0 になると
    // 「全部 集合表」と見なして複数形を強制し、逆に全件なら単数形を強制する。
    const singletons = models.filter((m) => m.isSingleton).length;
    expect(singletons).toBeGreaterThan(10);
    expect(singletons).toBeLessThan(models.length);
  });

  test("全モデルが規約どおりの物理テーブル名を持つ", () => {
    const violations = models.flatMap(tableViolations);
    expect(violations).toEqual([]);
  });

  test("免除に載っているのに規約どおりのモデルがいない", () => {
    const unnecessary = [...TABLE_NAME_EXEMPTIONS.keys()].filter((name) => {
      const model = models.find((m) => m.name === name);
      if (model?.mappedTo === undefined) return false;
      const stem = toSnakeCase(model.name);
      return model.mappedTo === (model.isSingleton ? stem : pluralize(stem));
    });
    expect(unnecessary).toEqual([]);
  });

  test("免除に実在しないモデル名が混ざっていない", () => {
    const unknown = [...TABLE_NAME_EXEMPTIONS.keys()].filter(
      (name) => !modelNames.has(name),
    );
    expect(unknown).toEqual([]);
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

  test("免除に無い enum の値は物理値が UPPER_SNAKE", () => {
    const violations = enums
      .filter((e) => !ENUMS_PENDING_UPPER_SNAKE_VALUES.has(e.name))
      .flatMap(enumValueViolations);

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
      .filter((e) => enumValueViolations(e).length === 0)
      .map((e) => e.name);

    expect(stale).toEqual([]);
  });

  test("変換済みリストは出発点の中しか指せない", () => {
    // BASELINE に無い名前を CONVERTED に足しても免除は生まれない（差集合なので）。
    // ここでは「存在しない名前を書いて満足している」状態を検出する。
    const bogus = [
      ...[...CONVERTED_MODELS].filter(
        (n) => !BASELINE_MODELS_NEEDING_COLUMN_MAP.has(n),
      ),
      ...[...CONVERTED_ENUM_TYPE_MAPS].filter(
        (n) => !BASELINE_ENUMS_NEEDING_TYPE_MAP.has(n),
      ),
      ...[...CONVERTED_ENUM_VALUES].filter(
        (n) => !BASELINE_ENUMS_NEEDING_UPPER_SNAKE_VALUES.has(n),
      ),
    ];

    expect(bogus).toEqual([]);
  });

  test("免除に実在しない名前が混ざっていない", () => {
    const unknown = [
      ...[...BASELINE_MODELS_NEEDING_COLUMN_MAP].filter(
        (n) => !modelNames.has(n),
      ),
      ...[...BASELINE_ENUMS_NEEDING_TYPE_MAP].filter((n) => !enumNames.has(n)),
      ...[...BASELINE_ENUMS_NEEDING_UPPER_SNAKE_VALUES].filter(
        (n) => !enumNames.has(n),
      ),
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
