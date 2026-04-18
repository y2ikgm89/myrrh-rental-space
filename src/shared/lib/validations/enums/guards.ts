/**
 * Prisma Enum 型ガード関数
 *
 * Prisma生成のenumに対する型ガード関数を集約。
 * `as Enum`型アサーションを排除し、実行時検証を提供。
 */

import {
  Role,
  ReservationStatus,
  InquiryStatus,
  CustomerStatus,
  CustomerType,
  NavigationType,
  SocialPlatform,
  LayoutWidth,
  PostStatus,
  AuditAction,
  MediaType,
  MediaUsage,
  TermsType,
  TermsStatus,
  CouponType,
  AnnouncementBarType,
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
  PaymentStatus,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";
import { SectionType, isSectionType } from "@/shared/lib/validations/section";

// =============================================================================
// Valid Value Sets (for O(1) lookup performance)
// =============================================================================

const VALID_ROLES = new Set<string>(Object.values(Role));
const VALID_RESERVATION_STATUSES = new Set<string>(
  Object.values(ReservationStatus),
);
const VALID_INQUIRY_STATUSES = new Set<string>(Object.values(InquiryStatus));
const VALID_CUSTOMER_STATUSES = new Set<string>(Object.values(CustomerStatus));
const VALID_CUSTOMER_TYPES = new Set<string>(Object.values(CustomerType));
const VALID_NAVIGATION_TYPES = new Set<string>(Object.values(NavigationType));
const VALID_SOCIAL_PLATFORMS = new Set<string>(Object.values(SocialPlatform));
const VALID_LAYOUT_WIDTHS = new Set<string>(Object.values(LayoutWidth));
const VALID_POST_STATUSES = new Set<string>(Object.values(PostStatus));
const VALID_NEWS_STATUS_FILTERS = new Set(["ALL", "PUBLISHED", "DRAFT"]);
const VALID_AUDIT_ACTIONS = new Set<string>(Object.values(AuditAction));
const VALID_MEDIA_TYPES = new Set<string>(Object.values(MediaType));
const VALID_MEDIA_USAGES = new Set<string>(Object.values(MediaUsage));
const VALID_TERMS_TYPES = new Set<string>(Object.values(TermsType));
const VALID_TERMS_STATUSES = new Set<string>(Object.values(TermsStatus));
const VALID_COUPON_TYPES = new Set<string>(Object.values(CouponType));
const VALID_ANNOUNCEMENT_BAR_TYPES = new Set<string>(
  Object.values(AnnouncementBarType),
);
const VALID_DISCOUNT_TYPES = new Set<string>(Object.values(DiscountType));
const VALID_DURATION_DISCOUNT_OVERRIDES = new Set<string>(
  Object.values(DurationDiscountOverride),
);
const VALID_TAX_RATE_TYPES = new Set<string>(Object.values(TaxRateType));
const VALID_TAX_DISPLAY_MODES = new Set<string>(Object.values(TaxDisplayMode));
const VALID_TAX_INPUT_MODES = new Set<string>(Object.values(TaxInputMode));
const VALID_DISCOUNT_COMBINATION_MODES = new Set<string>(
  Object.values(DiscountCombinationMode),
);
const VALID_ANALYTICS_TYPES = new Set<string>(Object.values(AnalyticsType));
const VALID_INSTAGRAM_FEED_LAYOUTS = new Set<string>(
  Object.values(InstagramFeedLayout),
);
const VALID_ANNOUNCEMENT_BAR_ANIMATIONS = new Set<string>(
  Object.values(AnnouncementBarAnimation),
);
const VALID_ANNOUNCEMENT_BAR_DESIGN_STYLES = new Set<string>(
  Object.values(AnnouncementBarDesignStyle),
);
const VALID_HEADER_SCROLL_BEHAVIORS = new Set<string>(
  Object.values(HeaderScrollBehavior),
);
const VALID_HEADER_BACKGROUND_MODES = new Set<string>(
  Object.values(HeaderBackgroundMode),
);
const VALID_CALENDAR_SYNC_METHODS = new Set<string>(
  Object.values(CalendarSyncMethod),
);
const VALID_EDITOR_COMMENT_STATUSES = new Set<string>(
  Object.values(EditorCommentStatus),
);
const VALID_POST_PERMALINK_STRUCTURES = new Set<string>(
  Object.values(PostPermalinkStructure),
);
const VALID_PAYMENT_STATUSES = new Set<string>(Object.values(PaymentStatus));
const VALID_EVENT_STATUSES = new Set<string>(Object.values(EventStatus));
const VALID_REGISTRATION_STATUSES = new Set<string>(
  Object.values(RegistrationStatus),
);

// =============================================================================
// Type Guards
// =============================================================================

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && VALID_ROLES.has(value);
}

export function isValidReservationStatus(
  value: unknown,
): value is ReservationStatus {
  return typeof value === "string" && VALID_RESERVATION_STATUSES.has(value);
}

export function isValidInquiryStatus(value: unknown): value is InquiryStatus {
  return typeof value === "string" && VALID_INQUIRY_STATUSES.has(value);
}

export function isValidCustomerStatus(value: unknown): value is CustomerStatus {
  return typeof value === "string" && VALID_CUSTOMER_STATUSES.has(value);
}

export function isValidCustomerType(value: unknown): value is CustomerType {
  return typeof value === "string" && VALID_CUSTOMER_TYPES.has(value);
}

export function isValidNavigationType(value: unknown): value is NavigationType {
  return typeof value === "string" && VALID_NAVIGATION_TYPES.has(value);
}

export function isValidSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && VALID_SOCIAL_PLATFORMS.has(value);
}

export function isValidLayoutWidth(value: unknown): value is LayoutWidth {
  return typeof value === "string" && VALID_LAYOUT_WIDTHS.has(value);
}

export { isSectionType as isValidSectionType };
export type { SectionType };

export function isValidPostStatus(value: unknown): value is PostStatus {
  return typeof value === "string" && VALID_POST_STATUSES.has(value);
}

// フィルター用のバリデーション
export type NewsStatusFilter = "ALL" | "PUBLISHED" | "DRAFT";

export function isValidNewsStatusFilter(
  value: unknown,
): value is NewsStatusFilter {
  return typeof value === "string" && VALID_NEWS_STATUS_FILTERS.has(value);
}

export function isValidAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && VALID_AUDIT_ACTIONS.has(value);
}

export function isValidMediaType(value: unknown): value is MediaType {
  return typeof value === "string" && VALID_MEDIA_TYPES.has(value);
}

export function isValidMediaUsage(value: unknown): value is MediaUsage {
  return typeof value === "string" && VALID_MEDIA_USAGES.has(value);
}

export function isValidTermsType(value: unknown): value is TermsType {
  return typeof value === "string" && VALID_TERMS_TYPES.has(value);
}

export function isValidTermsStatus(value: unknown): value is TermsStatus {
  return typeof value === "string" && VALID_TERMS_STATUSES.has(value);
}

export function isValidCouponType(value: unknown): value is CouponType {
  return typeof value === "string" && VALID_COUPON_TYPES.has(value);
}

export function isValidAnnouncementBarType(
  value: unknown,
): value is AnnouncementBarType {
  return typeof value === "string" && VALID_ANNOUNCEMENT_BAR_TYPES.has(value);
}

export function isValidDiscountType(value: unknown): value is DiscountType {
  return typeof value === "string" && VALID_DISCOUNT_TYPES.has(value);
}

export function isValidDurationDiscountOverride(
  value: unknown,
): value is DurationDiscountOverride {
  return (
    typeof value === "string" && VALID_DURATION_DISCOUNT_OVERRIDES.has(value)
  );
}

export function isValidTaxRateType(value: unknown): value is TaxRateType {
  return typeof value === "string" && VALID_TAX_RATE_TYPES.has(value);
}

export function isValidTaxDisplayMode(value: unknown): value is TaxDisplayMode {
  return typeof value === "string" && VALID_TAX_DISPLAY_MODES.has(value);
}

export function isValidTaxInputMode(value: unknown): value is TaxInputMode {
  return typeof value === "string" && VALID_TAX_INPUT_MODES.has(value);
}

export function isValidDiscountCombinationMode(
  value: unknown,
): value is DiscountCombinationMode {
  return (
    typeof value === "string" && VALID_DISCOUNT_COMBINATION_MODES.has(value)
  );
}

export function isValidAnalyticsType(value: unknown): value is AnalyticsType {
  return typeof value === "string" && VALID_ANALYTICS_TYPES.has(value);
}

export function isValidInstagramFeedLayout(
  value: unknown,
): value is InstagramFeedLayout {
  return typeof value === "string" && VALID_INSTAGRAM_FEED_LAYOUTS.has(value);
}

export function isValidAnnouncementBarAnimation(
  value: unknown,
): value is AnnouncementBarAnimation {
  return (
    typeof value === "string" && VALID_ANNOUNCEMENT_BAR_ANIMATIONS.has(value)
  );
}

export function isValidAnnouncementBarDesignStyle(
  value: unknown,
): value is AnnouncementBarDesignStyle {
  return (
    typeof value === "string" && VALID_ANNOUNCEMENT_BAR_DESIGN_STYLES.has(value)
  );
}

export function isValidHeaderScrollBehavior(
  value: unknown,
): value is HeaderScrollBehavior {
  return typeof value === "string" && VALID_HEADER_SCROLL_BEHAVIORS.has(value);
}

export function isValidHeaderBackgroundMode(
  value: unknown,
): value is HeaderBackgroundMode {
  return typeof value === "string" && VALID_HEADER_BACKGROUND_MODES.has(value);
}

export function isValidCalendarSyncMethod(
  value: unknown,
): value is CalendarSyncMethod {
  return typeof value === "string" && VALID_CALENDAR_SYNC_METHODS.has(value);
}

export function isValidEditorCommentStatus(
  value: unknown,
): value is EditorCommentStatus {
  return typeof value === "string" && VALID_EDITOR_COMMENT_STATUSES.has(value);
}

export function isValidPostPermalinkStructure(
  value: unknown,
): value is PostPermalinkStructure {
  return (
    typeof value === "string" && VALID_POST_PERMALINK_STRUCTURES.has(value)
  );
}

export function isValidPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && VALID_PAYMENT_STATUSES.has(value);
}

export function isValidEventStatus(value: unknown): value is EventStatus {
  return typeof value === "string" && VALID_EVENT_STATUSES.has(value);
}

export function isValidRegistrationStatus(
  value: unknown,
): value is RegistrationStatus {
  return typeof value === "string" && VALID_REGISTRATION_STATUSES.has(value);
}
