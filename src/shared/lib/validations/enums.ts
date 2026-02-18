/**
 * Prisma Enum 型ガード・バリデーション
 *
 * Prisma生成のenumに対する型ガード関数を集約。
 * `as Enum`型アサーションを排除し、実行時検証を提供。
 */

import {
  Role,
  ReservationStatus,
  InquiryStatus,
  CustomerStatus,
  NavigationType,
  SocialPlatform,
  LayoutWidth,
  SectionType,
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
} from '@/shared/generated/prisma/client'

// =============================================================================
// Re-export all enums
// =============================================================================

export {
  Role,
  ReservationStatus,
  InquiryStatus,
  CustomerStatus,
  NavigationType,
  SocialPlatform,
  LayoutWidth,
  SectionType,
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
}

// Note: NewsStatus enum は isPublished (boolean) に移行したため削除

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
]

// =============================================================================
// Valid Value Sets (for O(1) lookup performance)
// =============================================================================

const VALID_ROLES = new Set<string>(Object.values(Role))
const VALID_RESERVATION_STATUSES = new Set<string>(Object.values(ReservationStatus))
const VALID_INQUIRY_STATUSES = new Set<string>(Object.values(InquiryStatus))
const VALID_CUSTOMER_STATUSES = new Set<string>(Object.values(CustomerStatus))
const VALID_NAVIGATION_TYPES = new Set<string>(Object.values(NavigationType))
const VALID_SOCIAL_PLATFORMS = new Set<string>(Object.values(SocialPlatform))
const VALID_LAYOUT_WIDTHS = new Set<string>(Object.values(LayoutWidth))
const VALID_SECTION_TYPES = new Set<string>(Object.values(SectionType))
const VALID_POST_STATUSES = new Set<string>(Object.values(PostStatus))
// Note: NewsStatus enum は isPublished (boolean) に移行したため削除
const VALID_NEWS_STATUS_FILTERS = new Set(['ALL', 'PUBLISHED', 'DRAFT'])
const VALID_AUDIT_ACTIONS = new Set<string>(Object.values(AuditAction))
const VALID_MEDIA_TYPES = new Set<string>(Object.values(MediaType))
const VALID_MEDIA_USAGES = new Set<string>(Object.values(MediaUsage))
const VALID_TERMS_TYPES = new Set<string>(Object.values(TermsType))
const VALID_TERMS_STATUSES = new Set<string>(Object.values(TermsStatus))
const VALID_COUPON_TYPES = new Set<string>(Object.values(CouponType))
const VALID_ANNOUNCEMENT_BAR_TYPES = new Set<string>(Object.values(AnnouncementBarType))
const VALID_DISCOUNT_TYPES = new Set<string>(Object.values(DiscountType))
const VALID_DURATION_DISCOUNT_OVERRIDES = new Set<string>(Object.values(DurationDiscountOverride))
const VALID_TAX_RATE_TYPES = new Set<string>(Object.values(TaxRateType))
const VALID_TAX_DISPLAY_MODES = new Set<string>(Object.values(TaxDisplayMode))
const VALID_TAX_INPUT_MODES = new Set<string>(Object.values(TaxInputMode))
const VALID_DISCOUNT_COMBINATION_MODES = new Set<string>(Object.values(DiscountCombinationMode))
const VALID_ANALYTICS_TYPES = new Set<string>(Object.values(AnalyticsType))
const VALID_INSTAGRAM_FEED_LAYOUTS = new Set<string>(Object.values(InstagramFeedLayout))
const VALID_ANNOUNCEMENT_BAR_ANIMATIONS = new Set<string>(Object.values(AnnouncementBarAnimation))
const VALID_ANNOUNCEMENT_BAR_DESIGN_STYLES = new Set<string>(Object.values(AnnouncementBarDesignStyle))
const VALID_HEADER_SCROLL_BEHAVIORS = new Set<string>(Object.values(HeaderScrollBehavior))
const VALID_HEADER_BACKGROUND_MODES = new Set<string>(Object.values(HeaderBackgroundMode))
const VALID_CALENDAR_SYNC_METHODS = new Set<string>(Object.values(CalendarSyncMethod))
const VALID_EDITOR_COMMENT_STATUSES = new Set<string>(Object.values(EditorCommentStatus))
const VALID_POST_PERMALINK_STRUCTURES = new Set<string>(Object.values(PostPermalinkStructure))

// =============================================================================
// Type Guards
// =============================================================================

export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && VALID_ROLES.has(value)
}

export function isValidReservationStatus(value: unknown): value is ReservationStatus {
  return typeof value === 'string' && VALID_RESERVATION_STATUSES.has(value)
}

export function isValidInquiryStatus(value: unknown): value is InquiryStatus {
  return typeof value === 'string' && VALID_INQUIRY_STATUSES.has(value)
}

export function isValidCustomerStatus(value: unknown): value is CustomerStatus {
  return typeof value === 'string' && VALID_CUSTOMER_STATUSES.has(value)
}

export function isValidNavigationType(value: unknown): value is NavigationType {
  return typeof value === 'string' && VALID_NAVIGATION_TYPES.has(value)
}

export function isValidSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && VALID_SOCIAL_PLATFORMS.has(value)
}

export function isValidLayoutWidth(value: unknown): value is LayoutWidth {
  return typeof value === 'string' && VALID_LAYOUT_WIDTHS.has(value)
}

export function isValidSectionType(value: unknown): value is SectionType {
  return typeof value === 'string' && VALID_SECTION_TYPES.has(value)
}

export function isValidPostStatus(value: unknown): value is PostStatus {
  return typeof value === 'string' && VALID_POST_STATUSES.has(value)
}

// Note: NewsStatus enum は isPublished (boolean) に移行
// フィルター用のバリデーション
export type NewsStatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT'

export function isValidNewsStatusFilter(value: unknown): value is NewsStatusFilter {
  return typeof value === 'string' && VALID_NEWS_STATUS_FILTERS.has(value)
}

export function isValidAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && VALID_AUDIT_ACTIONS.has(value)
}

export function isValidMediaType(value: unknown): value is MediaType {
  return typeof value === 'string' && VALID_MEDIA_TYPES.has(value)
}

export function isValidMediaUsage(value: unknown): value is MediaUsage {
  return typeof value === 'string' && VALID_MEDIA_USAGES.has(value)
}

export function isValidTermsType(value: unknown): value is TermsType {
  return typeof value === 'string' && VALID_TERMS_TYPES.has(value)
}

export function isValidTermsStatus(value: unknown): value is TermsStatus {
  return typeof value === 'string' && VALID_TERMS_STATUSES.has(value)
}

export function isValidCouponType(value: unknown): value is CouponType {
  return typeof value === 'string' && VALID_COUPON_TYPES.has(value)
}

export function isValidAnnouncementBarType(value: unknown): value is AnnouncementBarType {
  return typeof value === 'string' && VALID_ANNOUNCEMENT_BAR_TYPES.has(value)
}

export function isValidDiscountType(value: unknown): value is DiscountType {
  return typeof value === 'string' && VALID_DISCOUNT_TYPES.has(value)
}

export function isValidDurationDiscountOverride(value: unknown): value is DurationDiscountOverride {
  return typeof value === 'string' && VALID_DURATION_DISCOUNT_OVERRIDES.has(value)
}

export function isValidTaxRateType(value: unknown): value is TaxRateType {
  return typeof value === 'string' && VALID_TAX_RATE_TYPES.has(value)
}

export function isValidTaxDisplayMode(value: unknown): value is TaxDisplayMode {
  return typeof value === 'string' && VALID_TAX_DISPLAY_MODES.has(value)
}

export function isValidTaxInputMode(value: unknown): value is TaxInputMode {
  return typeof value === 'string' && VALID_TAX_INPUT_MODES.has(value)
}

export function isValidDiscountCombinationMode(value: unknown): value is DiscountCombinationMode {
  return typeof value === 'string' && VALID_DISCOUNT_COMBINATION_MODES.has(value)
}

export function isValidAnalyticsType(value: unknown): value is AnalyticsType {
  return typeof value === 'string' && VALID_ANALYTICS_TYPES.has(value)
}

export function isValidInstagramFeedLayout(value: unknown): value is InstagramFeedLayout {
  return typeof value === 'string' && VALID_INSTAGRAM_FEED_LAYOUTS.has(value)
}

export function isValidAnnouncementBarAnimation(value: unknown): value is AnnouncementBarAnimation {
  return typeof value === 'string' && VALID_ANNOUNCEMENT_BAR_ANIMATIONS.has(value)
}

export function isValidAnnouncementBarDesignStyle(value: unknown): value is AnnouncementBarDesignStyle {
  return typeof value === 'string' && VALID_ANNOUNCEMENT_BAR_DESIGN_STYLES.has(value)
}

export function isValidHeaderScrollBehavior(value: unknown): value is HeaderScrollBehavior {
  return typeof value === 'string' && VALID_HEADER_SCROLL_BEHAVIORS.has(value)
}

export function isValidHeaderBackgroundMode(value: unknown): value is HeaderBackgroundMode {
  return typeof value === 'string' && VALID_HEADER_BACKGROUND_MODES.has(value)
}

export function isValidCalendarSyncMethod(value: unknown): value is CalendarSyncMethod {
  return typeof value === 'string' && VALID_CALENDAR_SYNC_METHODS.has(value)
}

export function isValidEditorCommentStatus(value: unknown): value is EditorCommentStatus {
  return typeof value === 'string' && VALID_EDITOR_COMMENT_STATUSES.has(value)
}

export function isValidPostPermalinkStructure(value: unknown): value is PostPermalinkStructure {
  return typeof value === 'string' && VALID_POST_PERMALINK_STRUCTURES.has(value)
}

// =============================================================================
// Helper: Get valid value or default
// =============================================================================

export function getValidRole(value: string | null | undefined, fallback: Role): Role {
  return value && isValidRole(value) ? value : fallback
}

export function getValidReservationStatus(
  value: string | null | undefined,
  fallback: ReservationStatus
): ReservationStatus {
  return value && isValidReservationStatus(value) ? value : fallback
}

export function getValidInquiryStatus(
  value: string | null | undefined,
  fallback: InquiryStatus
): InquiryStatus {
  return value && isValidInquiryStatus(value) ? value : fallback
}

export function getValidCustomerStatus(
  value: string | null | undefined,
  fallback: CustomerStatus
): CustomerStatus {
  return value && isValidCustomerStatus(value) ? value : fallback
}

export function getValidLayoutWidth(
  value: string | null | undefined,
  fallback: LayoutWidth
): LayoutWidth {
  return value && isValidLayoutWidth(value) ? value : fallback
}

export function getValidPostStatus(
  value: string | null | undefined,
  fallback: PostStatus
): PostStatus {
  return value && isValidPostStatus(value) ? value : fallback
}

// Note: getValidNewsStatus は削除（isPublished: boolean に移行）

export function getValidMediaType(
  value: string | null | undefined,
  fallback: MediaType
): MediaType {
  return value && isValidMediaType(value) ? value : fallback
}

export function getValidMediaUsage(
  value: string | null | undefined,
  fallback: MediaUsage
): MediaUsage {
  return value && isValidMediaUsage(value) ? value : fallback
}

export function getValidCouponType(
  value: string | null | undefined,
  fallback: CouponType = CouponType.PERCENTAGE
): CouponType {
  return value && isValidCouponType(value) ? value : fallback
}

export function getValidDiscountType(
  value: string | null | undefined,
  fallback: DiscountType = DiscountType.none
): DiscountType {
  return value && isValidDiscountType(value) ? value : fallback
}

export function getValidDurationDiscountOverride(
  value: string | null | undefined,
  fallback: DurationDiscountOverride = DurationDiscountOverride.inherit
): DurationDiscountOverride {
  return value && isValidDurationDiscountOverride(value) ? value : fallback
}

export function getValidTaxRateType(
  value: string | null | undefined,
  fallback: TaxRateType = TaxRateType.standard
): TaxRateType {
  return value && isValidTaxRateType(value) ? value : fallback
}

export function getValidTaxDisplayMode(
  value: string | null | undefined,
  fallback: TaxDisplayMode = TaxDisplayMode.both
): TaxDisplayMode {
  return value && isValidTaxDisplayMode(value) ? value : fallback
}

export function getValidTaxInputMode(
  value: string | null | undefined,
  fallback: TaxInputMode = TaxInputMode.tax_excluded
): TaxInputMode {
  return value && isValidTaxInputMode(value) ? value : fallback
}

export function getValidDiscountCombinationMode(
  value: string | null | undefined,
  fallback: DiscountCombinationMode = DiscountCombinationMode.best
): DiscountCombinationMode {
  return value && isValidDiscountCombinationMode(value) ? value : fallback
}

export function getValidAnalyticsType(
  value: string | null | undefined
): AnalyticsType | null {
  return value && isValidAnalyticsType(value) ? value : null
}

export function getValidInstagramFeedLayout(
  value: string | null | undefined,
  fallback: InstagramFeedLayout = InstagramFeedLayout.grid
): InstagramFeedLayout {
  return value && isValidInstagramFeedLayout(value) ? value : fallback
}

export function getValidAnnouncementBarAnimation(
  value: string | null | undefined,
  fallback: AnnouncementBarAnimation = AnnouncementBarAnimation.fade
): AnnouncementBarAnimation {
  return value && isValidAnnouncementBarAnimation(value) ? value : fallback
}

export function getValidAnnouncementBarDesignStyle(
  value: string | null | undefined,
  fallback: AnnouncementBarDesignStyle = AnnouncementBarDesignStyle.solid
): AnnouncementBarDesignStyle {
  return value && isValidAnnouncementBarDesignStyle(value) ? value : fallback
}

export function getValidHeaderScrollBehavior(
  value: string | null | undefined,
  fallback: HeaderScrollBehavior = HeaderScrollBehavior.always_visible
): HeaderScrollBehavior {
  return value && isValidHeaderScrollBehavior(value) ? value : fallback
}

export function getValidHeaderBackgroundMode(
  value: string | null | undefined,
  fallback: HeaderBackgroundMode = HeaderBackgroundMode.solid
): HeaderBackgroundMode {
  return value && isValidHeaderBackgroundMode(value) ? value : fallback
}

export function getValidCalendarSyncMethod(
  value: string | null | undefined,
  fallback: CalendarSyncMethod = CalendarSyncMethod.polling
): CalendarSyncMethod {
  return value && isValidCalendarSyncMethod(value) ? value : fallback
}

export function getValidEditorCommentStatus(
  value: string | null | undefined,
  fallback: EditorCommentStatus = EditorCommentStatus.ACTIVE
): EditorCommentStatus {
  return value && isValidEditorCommentStatus(value) ? value : fallback
}

export function getValidPostPermalinkStructure(
  value: string | null | undefined,
  fallback: PostPermalinkStructure = PostPermalinkStructure.post_name
): PostPermalinkStructure {
  return value && isValidPostPermalinkStructure(value) ? value : fallback
}

// =============================================================================
// Filter helpers (for 'ALL' patterns)
// =============================================================================

export function parseStatusFilter<T extends string>(
  value: string | null | undefined,
  validator: (v: string) => v is T
): T | undefined {
  if (!value || value === 'ALL') return undefined
  return validator(value) ? value : undefined
}

export function parseReservationStatusFilter(
  value: string | null | undefined
): ReservationStatus | undefined {
  return parseStatusFilter(value, isValidReservationStatus)
}

export function parseInquiryStatusFilter(
  value: string | null | undefined
): InquiryStatus | undefined {
  return parseStatusFilter(value, isValidInquiryStatus)
}

export function parseCustomerStatusFilter(
  value: string | null | undefined
): CustomerStatus | undefined {
  return parseStatusFilter(value, isValidCustomerStatus)
}

export function parsePostStatusFilter(
  value: string | null | undefined
): PostStatus | undefined {
  return parseStatusFilter(value, isValidPostStatus)
}

export function parseNewsStatusFilter(
  value: string | null | undefined
): NewsStatusFilter | undefined {
  if (!value || value === 'ALL') return 'ALL'
  if (isValidNewsStatusFilter(value)) return value
  return 'ALL'
}

export function parseRoleFilter(
  value: string | null | undefined
): Role | undefined {
  return parseStatusFilter(value, isValidRole)
}

export function parseAuditActionFilter(
  value: string | null | undefined
): AuditAction | undefined {
  return parseStatusFilter(value, isValidAuditAction)
}

// =============================================================================
// Filter helpers that return 'ALL' or specific value
// =============================================================================

export function getRoleFilterOrAll(
  value: string | null | undefined
): Role | 'ALL' {
  if (!value || value === 'ALL') return 'ALL'
  return isValidRole(value) ? value : 'ALL'
}

export function getAuditActionFilterOrAll(
  value: string | null | undefined
): AuditAction | 'ALL' {
  if (!value || value === 'ALL') return 'ALL'
  return isValidAuditAction(value) ? value : 'ALL'
}

export function getReservationStatusFilterOrAll(
  value: string | null | undefined
): ReservationStatus | 'ALL' {
  if (!value || value === 'ALL') return 'ALL'
  return isValidReservationStatus(value) ? value : 'ALL'
}
