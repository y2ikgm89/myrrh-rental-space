/**
 * Prisma 生成型・enum 値の **client-safe** re-export ゲートウェイ
 *
 * このファイルは Prisma 7 の `prisma-client` generator が生成する以下の
 * client-safe entry から re-export する唯一の公認ゲートウェイです:
 *
 * - `@generated/prisma/enums`  — Prisma enum 値（const オブジェクト + 型）
 * - `@generated/prisma/browser` — `Prisma` 名前空間の **型のみ**
 * `src/shared/db/` および `src/shared/domain/` 以外のコード（`src/app/**`,
 * `src/shared/lib/**` 等）は `@generated/prisma/*` を直接 import せず、
 * 必ずこのファイルを経由してください（architecture-boundaries.test.ts で強制）。
 *
 * **重要な制約**: 本ゲートウェイは `Prisma.JsonNull` / `DbNull` / `join` /
 * `sql` / `raw` 等の **runtime sentinel 値・raw SQL helper を一切提供しません**。
 * これらの runtime 値が必要なコードは `@generated/prisma/client` から直接
 * import する必要があり、利用可能な箇所は `shared/db/` / `shared/domain/` に
 * 限定されます。理由は本ファイル末尾の「設計の根拠」コメントを参照。
 */

// ---------------------------------------------------------------------------
// Prisma Enum 値 re-export
//
// Prisma の enum は `as const` オブジェクトとして生成されるため、
// 同一名でランタイム値（const オブジェクト）と型（union）が共存する。
// `export { X }` で値として re-export すると `import type { X }` でも
// 型として参照できるため、二重 export は不要。
// ---------------------------------------------------------------------------
export {
  Role,
  ReservationStatus,
  ReservationSeriesFreq,
  InquiryStatus,
  CustomerStatus,
  CustomerType,
  PaymentStatus,
  NavigationType,
  SocialPlatform,
  LayoutWidth,
  PostStatus,
  CouponType,
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  TaxDisplayMode,
  TaxInputMode,
  CalendarSyncMethod,
  AnalyticsType,
  DiscountCombinationMode,
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  InstagramMediaType,
  EventStatus,
  EventScheduleMode,
  RegistrationStatus,
  AuditAction,
  EditorCommentStatus,
  MediaType,
  MediaUsage,
  EmailDeliveryStatus,
  DayOfWeek,
  HolidayMode,
  TermsScope,
  SmartLockDeviceType,
  SmartLockPasscodeStatus,
  EventFormat,
  MeetingProvider,
} from "@generated/prisma/enums";

// ---------------------------------------------------------------------------
// Prisma 名前空間 — 型のみ re-export（browser entry 由来）
//
// Prisma 7 の `prisma-client` generator は browser-safe な entry point
// (`generated/prisma/browser.ts`) を公式に提供する。本ゲートウェイは
// **型のみ** をこの entry から re-export し、runtime 値は一切公開しない。
//
// 【設計の根拠：参照同一性フットガンの排除】
//
// `Prisma.JsonNull` / `DbNull` / `AnyNull` は Prisma 4 以降 unique object
// として実装されており、Prisma client は受け取った値を identity 比較で
// 判定する（公式: "These constants ... have been updated from string
// constants to unique objects"）。
//
// `generated/prisma/browser.ts` は内部で
//   `import * as runtime from "@prisma/client/runtime/index-browser"`
// を使うのに対し、`generated/prisma/client.ts` は
//   `import * as runtime from "@prisma/client/runtime/client"`
// を使う。両者は **異なる runtime モジュール** であり、`runtime.JsonNull`
// は別オブジェクト参照になる。
//
// もし本ゲートウェイが値として `Prisma` を re-export していると、app 層が
// gateway から取得した `Prisma.JsonNull` を domain command に渡した場合に
// Prisma client がそれを `JsonNull` と認識せず、サイレントに通常の null と
// して扱う重大バグを引き起こす。型のみ re-export することでこの誤用を
// **物理的に不可能** にする。
//
// 【runtime 値が必要なコードの import 規約】
//
// `Prisma.JsonNull` / `DbNull` / `join` / `sql` / `raw` 等の runtime 値・
// raw SQL helper は **必ず `@generated/prisma/client` から直接 import** する。
// 利用可能な箇所は `shared/db/` / `shared/domain/` のみ
// （architecture-boundaries.test.ts の allowlist で強制）。
//
// 【利用可能な型】
//
// browser entry の `export type * from './prismaNamespace'` 経由で、全ての
// `Prisma.*WhereInput` / `Prisma.*Select` / `Prisma.InputJsonValue` 等の
// 型がここから取得可能。`PrismaClient` クラスは `shared/db/prisma.ts` のみ
// で生成・利用する。
// ---------------------------------------------------------------------------
export type { Prisma } from "@generated/prisma/browser";

// EventFormat: 開催形態 (schema.org eventAttendanceMode 3 値と 1:1)
export const EVENT_FORMAT = {
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
  HYBRID: "HYBRID",
} as const;
export type EventFormatValue = (typeof EVENT_FORMAT)[keyof typeof EVENT_FORMAT];
export const EVENT_FORMAT_VALUES = Object.values(
  EVENT_FORMAT,
) as EventFormatValue[];

export const EVENT_FORMAT_TO_SCHEMA_ORG = {
  OFFLINE: "OfflineEventAttendanceMode",
  ONLINE: "OnlineEventAttendanceMode",
  HYBRID: "MixedEventAttendanceMode",
} as const satisfies Record<EventFormatValue, string>;

// MeetingProvider: オンライン会議発行元
export const MEETING_PROVIDER = {
  MANUAL: "MANUAL",
  GOOGLE_MEET: "GOOGLE_MEET",
} as const;
export type MeetingProviderValue =
  (typeof MEETING_PROVIDER)[keyof typeof MEETING_PROVIDER];
export const MEETING_PROVIDER_VALUES = Object.values(
  MEETING_PROVIDER,
) as MeetingProviderValue[];

// ReservationSeriesFreq: 繰返し予約 (ReservationSeries) の周期 (Phase B.2)
export const RESERVATION_SERIES_FREQ = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
} as const;
export type ReservationSeriesFreqValue =
  (typeof RESERVATION_SERIES_FREQ)[keyof typeof RESERVATION_SERIES_FREQ];
export const RESERVATION_SERIES_FREQ_VALUES = Object.values(
  RESERVATION_SERIES_FREQ,
) as ReservationSeriesFreqValue[];

// TermsScope: 規約同意が必要な UI 導線の scope（SCREAMING_CASE ミラー、Object.values
// ergonomics 用。raw `TermsScope`（上記 re-export）との二重定義だが EVENT_FORMAT /
// MEETING_PROVIDER と同型の既存パターンを踏襲。値は @generated/prisma/enums の
// TermsScope と同期させること）
export const TERMS_SCOPE = {
  RESERVATION: "RESERVATION",
  INQUIRY: "INQUIRY",
  EVENT_REGISTRATION: "EVENT_REGISTRATION",
  LOGIN_SIGNUP: "LOGIN_SIGNUP",
  RESERVATION_SERIES: "RESERVATION_SERIES", // Phase B.2
} as const;
export type TermsScopeValue = (typeof TERMS_SCOPE)[keyof typeof TERMS_SCOPE];
// 全 5 値（`terms.ts` の `TERMS_SCOPE_VALUES` と同名衝突を避けるため `_ALL_` を明示。
// あちらは admin 規約編集 UI の scope チェックボックスが直接 iterate する配列で、
// 値は本配列と一致するが所有 SSoT が異なるため個別に定義している — 詳細は同ファイル参照）
export const TERMS_SCOPE_ALL_VALUES: TermsScopeValue[] =
  Object.values(TERMS_SCOPE);
