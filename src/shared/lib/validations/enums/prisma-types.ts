/**
 * Prisma 生成型・値の公式 re-export ゲートウェイ
 *
 * このファイルは `@generated/prisma/enums` および `@generated/prisma/client` から
 * 必要な enum 値・型・Prisma 名前空間を集約して re-export する唯一の公認ゲートウェイです。
 *
 * `src/shared/db/` および `src/shared/domain/` 以外のコード（`src/app/**`, `src/shared/lib/**` 等）は
 * `@generated/prisma/*` を直接 import せず、必ずこのファイルを経由してください。
 *
 * architecture-boundaries.test.ts の allowlist に登録済み。
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
  PaymentStatus,
  NavigationType,
  SocialPlatform,
  LayoutWidth,
  PostStatus,
  TermsType,
  TermsStatus,
  CouponType,
  AnnouncementBarType,
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
// Prisma Client 値・型 re-export（Prisma 名前空間・PrismaClient）
// ---------------------------------------------------------------------------
export { Prisma, PrismaClient } from "@generated/prisma/client";
