/**
 * Prisma Enum ヘルパー関数
 *
 * getValid* デフォルト値取得、parse*Filter フィルターパース
 */

import {
  Role,
  ReservationStatus,
  InquiryStatus,
  CustomerStatus,
  LayoutWidth,
  PostStatus,
  AuditAction,
  MediaType,
  MediaUsage,
  CouponType,
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
  TaxDisplayMode,
  TaxInputMode,
  DiscountCombinationMode,
  AnalyticsType,
  InstagramFeedLayout,
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  CalendarSyncMethod,
  EditorCommentStatus,
  PostPermalinkStructure,
} from "@/shared/db/enums";
import {
  isValidRole,
  isValidReservationStatus,
  isValidInquiryStatus,
  isValidCustomerStatus,
  isValidLayoutWidth,
  isValidPostStatus,
  isValidAuditAction,
  isValidMediaType,
  isValidMediaUsage,
  isValidCouponType,
  isValidDiscountType,
  isValidDurationDiscountOverride,
  isValidTaxRateType,
  isValidTaxDisplayMode,
  isValidTaxInputMode,
  isValidDiscountCombinationMode,
  isValidAnalyticsType,
  isValidInstagramFeedLayout,
  isValidAnnouncementBarAnimation,
  isValidAnnouncementBarDesignStyle,
  isValidHeaderScrollBehavior,
  isValidHeaderBackgroundMode,
  isValidCalendarSyncMethod,
  isValidEditorCommentStatus,
  isValidPostPermalinkStructure,
  isValidNewsStatusFilter,
  type NewsStatusFilter,
} from "./guards";

// =============================================================================
// Status Constants (for Prisma where clauses)
// =============================================================================

/**
 * アクティブな予約ステータス（PENDING, CONFIRMED）
 * 重複チェック、カレンダー同期などで使用
 */
export const ACTIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

// =============================================================================
// Helper: Get valid value or default
// =============================================================================

export function getValidRole(
  value: string | null | undefined,
  fallback: Role,
): Role {
  return value && isValidRole(value) ? value : fallback;
}

export function getValidReservationStatus(
  value: string | null | undefined,
  fallback: ReservationStatus,
): ReservationStatus {
  return value && isValidReservationStatus(value) ? value : fallback;
}

export function getValidInquiryStatus(
  value: string | null | undefined,
  fallback: InquiryStatus,
): InquiryStatus {
  return value && isValidInquiryStatus(value) ? value : fallback;
}

export function getValidCustomerStatus(
  value: string | null | undefined,
  fallback: CustomerStatus,
): CustomerStatus {
  return value && isValidCustomerStatus(value) ? value : fallback;
}

export function getValidLayoutWidth(
  value: string | null | undefined,
  fallback: LayoutWidth,
): LayoutWidth {
  return value && isValidLayoutWidth(value) ? value : fallback;
}

export function getValidPostStatus(
  value: string | null | undefined,
  fallback: PostStatus,
): PostStatus {
  return value && isValidPostStatus(value) ? value : fallback;
}

export function getValidMediaType(
  value: string | null | undefined,
  fallback: MediaType,
): MediaType {
  return value && isValidMediaType(value) ? value : fallback;
}

export function getValidMediaUsage(
  value: string | null | undefined,
  fallback: MediaUsage,
): MediaUsage {
  return value && isValidMediaUsage(value) ? value : fallback;
}

export function getValidCouponType(
  value: string | null | undefined,
  fallback: CouponType = CouponType.PERCENTAGE,
): CouponType {
  return value && isValidCouponType(value) ? value : fallback;
}

export function getValidDiscountType(
  value: string | null | undefined,
  fallback: DiscountType = DiscountType.none,
): DiscountType {
  return value && isValidDiscountType(value) ? value : fallback;
}

export function getValidDurationDiscountOverride(
  value: string | null | undefined,
  fallback: DurationDiscountOverride = DurationDiscountOverride.inherit,
): DurationDiscountOverride {
  return value && isValidDurationDiscountOverride(value) ? value : fallback;
}

export function getValidTaxRateType(
  value: string | null | undefined,
  fallback: TaxRateType = TaxRateType.standard,
): TaxRateType {
  return value && isValidTaxRateType(value) ? value : fallback;
}

export function getValidTaxDisplayMode(
  value: string | null | undefined,
  fallback: TaxDisplayMode = TaxDisplayMode.both,
): TaxDisplayMode {
  return value && isValidTaxDisplayMode(value) ? value : fallback;
}

export function getValidTaxInputMode(
  value: string | null | undefined,
  fallback: TaxInputMode = TaxInputMode.tax_excluded,
): TaxInputMode {
  return value && isValidTaxInputMode(value) ? value : fallback;
}

export function getValidDiscountCombinationMode(
  value: string | null | undefined,
  fallback: DiscountCombinationMode = DiscountCombinationMode.best,
): DiscountCombinationMode {
  return value && isValidDiscountCombinationMode(value) ? value : fallback;
}

export function getValidAnalyticsType(
  value: string | null | undefined,
): AnalyticsType | null {
  return value && isValidAnalyticsType(value) ? value : null;
}

export function getValidInstagramFeedLayout(
  value: string | null | undefined,
  fallback: InstagramFeedLayout = InstagramFeedLayout.grid,
): InstagramFeedLayout {
  return value && isValidInstagramFeedLayout(value) ? value : fallback;
}

export function getValidAnnouncementBarAnimation(
  value: string | null | undefined,
  fallback: AnnouncementBarAnimation = AnnouncementBarAnimation.fade,
): AnnouncementBarAnimation {
  return value && isValidAnnouncementBarAnimation(value) ? value : fallback;
}

export function getValidAnnouncementBarDesignStyle(
  value: string | null | undefined,
  fallback: AnnouncementBarDesignStyle = AnnouncementBarDesignStyle.solid,
): AnnouncementBarDesignStyle {
  return value && isValidAnnouncementBarDesignStyle(value) ? value : fallback;
}

export function getValidHeaderScrollBehavior(
  value: string | null | undefined,
  fallback: HeaderScrollBehavior = HeaderScrollBehavior.always_visible,
): HeaderScrollBehavior {
  return value && isValidHeaderScrollBehavior(value) ? value : fallback;
}

export function getValidHeaderBackgroundMode(
  value: string | null | undefined,
  fallback: HeaderBackgroundMode = HeaderBackgroundMode.solid,
): HeaderBackgroundMode {
  return value && isValidHeaderBackgroundMode(value) ? value : fallback;
}

export function getValidCalendarSyncMethod(
  value: string | null | undefined,
  fallback: CalendarSyncMethod = CalendarSyncMethod.polling,
): CalendarSyncMethod {
  return value && isValidCalendarSyncMethod(value) ? value : fallback;
}

export function getValidEditorCommentStatus(
  value: string | null | undefined,
  fallback: EditorCommentStatus = EditorCommentStatus.ACTIVE,
): EditorCommentStatus {
  return value && isValidEditorCommentStatus(value) ? value : fallback;
}

export function getValidPostPermalinkStructure(
  value: string | null | undefined,
  fallback: PostPermalinkStructure = PostPermalinkStructure.post_name,
): PostPermalinkStructure {
  return value && isValidPostPermalinkStructure(value) ? value : fallback;
}

// =============================================================================
// Filter helpers (for 'ALL' patterns)
// =============================================================================

export function parseStatusFilter<T extends string>(
  value: string | null | undefined,
  validator: (v: string) => v is T,
): T | undefined {
  if (!value || value === "ALL") return undefined;
  return validator(value) ? value : undefined;
}

export function parseReservationStatusFilter(
  value: string | null | undefined,
): ReservationStatus | undefined {
  return parseStatusFilter(value, isValidReservationStatus);
}

export function parseInquiryStatusFilter(
  value: string | null | undefined,
): InquiryStatus | undefined {
  return parseStatusFilter(value, isValidInquiryStatus);
}

export function parseCustomerStatusFilter(
  value: string | null | undefined,
): CustomerStatus | undefined {
  return parseStatusFilter(value, isValidCustomerStatus);
}

export function parsePostStatusFilter(
  value: string | null | undefined,
): PostStatus | undefined {
  return parseStatusFilter(value, isValidPostStatus);
}

export function parseNewsStatusFilter(
  value: string | null | undefined,
): NewsStatusFilter | undefined {
  if (!value || value === "ALL") return "ALL";
  if (isValidNewsStatusFilter(value)) return value;
  return "ALL";
}

export function parseRoleFilter(
  value: string | null | undefined,
): Role | undefined {
  return parseStatusFilter(value, isValidRole);
}

export function parseAuditActionFilter(
  value: string | null | undefined,
): AuditAction | undefined {
  return parseStatusFilter(value, isValidAuditAction);
}

// =============================================================================
// Filter helpers that return 'ALL' or specific value
// =============================================================================

export function getRoleFilterOrAll(
  value: string | null | undefined,
): Role | "ALL" {
  if (!value || value === "ALL") return "ALL";
  return isValidRole(value) ? value : "ALL";
}

export function getAuditActionFilterOrAll(
  value: string | null | undefined,
): AuditAction | "ALL" {
  if (!value || value === "ALL") return "ALL";
  return isValidAuditAction(value) ? value : "ALL";
}

export function getReservationStatusFilterOrAll(
  value: string | null | undefined,
): ReservationStatus | "ALL" {
  if (!value || value === "ALL") return "ALL";
  return isValidReservationStatus(value) ? value : "ALL";
}
