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
  HomepageSectionType,
  BlogPostStatus,
  NewsStatus,
  AuditAction,
  MediaType,
  MediaUsage,
  TermsType,
  TermsStatus,
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
  HomepageSectionType,
  BlogPostStatus,
  NewsStatus,
  AuditAction,
  MediaType,
  MediaUsage,
  TermsType,
  TermsStatus,
}

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
const VALID_HOMEPAGE_SECTION_TYPES = new Set<string>(Object.values(HomepageSectionType))
const VALID_BLOG_POST_STATUSES = new Set<string>(Object.values(BlogPostStatus))
const VALID_NEWS_STATUSES = new Set<string>(Object.values(NewsStatus))
const VALID_AUDIT_ACTIONS = new Set<string>(Object.values(AuditAction))
const VALID_MEDIA_TYPES = new Set<string>(Object.values(MediaType))
const VALID_MEDIA_USAGES = new Set<string>(Object.values(MediaUsage))
const VALID_TERMS_TYPES = new Set<string>(Object.values(TermsType))
const VALID_TERMS_STATUSES = new Set<string>(Object.values(TermsStatus))

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

export function isValidHomepageSectionType(value: unknown): value is HomepageSectionType {
  return typeof value === 'string' && VALID_HOMEPAGE_SECTION_TYPES.has(value)
}

export function isValidBlogPostStatus(value: unknown): value is BlogPostStatus {
  return typeof value === 'string' && VALID_BLOG_POST_STATUSES.has(value)
}

export function isValidNewsStatus(value: unknown): value is NewsStatus {
  return typeof value === 'string' && VALID_NEWS_STATUSES.has(value)
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

export function getValidBlogPostStatus(
  value: string | null | undefined,
  fallback: BlogPostStatus
): BlogPostStatus {
  return value && isValidBlogPostStatus(value) ? value : fallback
}

export function getValidNewsStatus(
  value: string | null | undefined,
  fallback: NewsStatus
): NewsStatus {
  return value && isValidNewsStatus(value) ? value : fallback
}

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

export function parseBlogPostStatusFilter(
  value: string | null | undefined
): BlogPostStatus | undefined {
  return parseStatusFilter(value, isValidBlogPostStatus)
}

export function parseNewsStatusFilter(
  value: string | null | undefined
): NewsStatus | undefined {
  return parseStatusFilter(value, isValidNewsStatus)
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
