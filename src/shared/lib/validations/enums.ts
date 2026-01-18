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
// Type Guards
// =============================================================================

export function isValidRole(value: string): value is Role {
  return Object.values(Role).includes(value as Role)
}

export function isValidReservationStatus(value: string): value is ReservationStatus {
  return Object.values(ReservationStatus).includes(value as ReservationStatus)
}

export function isValidInquiryStatus(value: string): value is InquiryStatus {
  return Object.values(InquiryStatus).includes(value as InquiryStatus)
}

export function isValidCustomerStatus(value: string): value is CustomerStatus {
  return Object.values(CustomerStatus).includes(value as CustomerStatus)
}

export function isValidNavigationType(value: string): value is NavigationType {
  return Object.values(NavigationType).includes(value as NavigationType)
}

export function isValidSocialPlatform(value: string): value is SocialPlatform {
  return Object.values(SocialPlatform).includes(value as SocialPlatform)
}

export function isValidLayoutWidth(value: string): value is LayoutWidth {
  return Object.values(LayoutWidth).includes(value as LayoutWidth)
}

export function isValidHomepageSectionType(value: string): value is HomepageSectionType {
  return Object.values(HomepageSectionType).includes(value as HomepageSectionType)
}

export function isValidBlogPostStatus(value: string): value is BlogPostStatus {
  return Object.values(BlogPostStatus).includes(value as BlogPostStatus)
}

export function isValidNewsStatus(value: string): value is NewsStatus {
  return Object.values(NewsStatus).includes(value as NewsStatus)
}

export function isValidAuditAction(value: string): value is AuditAction {
  return Object.values(AuditAction).includes(value as AuditAction)
}

export function isValidMediaType(value: string): value is MediaType {
  return Object.values(MediaType).includes(value as MediaType)
}

export function isValidMediaUsage(value: string): value is MediaUsage {
  return Object.values(MediaUsage).includes(value as MediaUsage)
}

export function isValidTermsType(value: string): value is TermsType {
  return Object.values(TermsType).includes(value as TermsType)
}

export function isValidTermsStatus(value: string): value is TermsStatus {
  return Object.values(TermsStatus).includes(value as TermsStatus)
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
