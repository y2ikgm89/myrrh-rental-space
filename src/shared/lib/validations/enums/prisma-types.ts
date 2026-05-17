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
  PostPermalinkStructure,
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  InstagramFeedLayout,
  InstagramMediaType,
  EventStatus,
  RegistrationStatus,
  AuditAction,
  EditorCommentStatus,
  MediaType,
  MediaUsage,
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
