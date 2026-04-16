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
  CustomerType,
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
  PaymentStatus,
  RegistrationStatus,
  EventStatus,
  TermsStatus,
} from "@generated/prisma/enums";
import {
  isValidRole,
  isValidReservationStatus,
  isValidInquiryStatus,
  isValidCustomerStatus,
  isValidCustomerType,
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
  isValidPaymentStatus,
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

/**
 * 終端ステータス（COMPLETED, CANCELLED, NO_SHOW）
 * これらのステータスからは他のステータスへ遷移できない
 */
export const TERMINAL_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.COMPLETED,
  ReservationStatus.CANCELLED,
  ReservationStatus.NO_SHOW,
];

/**
 * 作成時に指定可能なステータス（PENDING, CONFIRMED）
 */
export const CREATABLE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

/**
 * ステータス遷移ルール（UI層・ドメイン層で共有）
 */
export const RESERVATION_STATUS_TRANSITIONS: Readonly<
  Record<string, readonly ReservationStatus[]>
> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.COMPLETED,
    ReservationStatus.NO_SHOW,
    ReservationStatus.CANCELLED,
  ],
};

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

export function getValidCustomerType(
  value: string | null | undefined,
  fallback: CustomerType = CustomerType.PERSONAL,
): CustomerType {
  return value && isValidCustomerType(value) ? value : fallback;
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

export function getValidPaymentStatus(
  value: string | null | undefined,
  fallback: PaymentStatus = PaymentStatus.UNPAID,
): PaymentStatus {
  return value && isValidPaymentStatus(value) ? value : fallback;
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

export function parseCustomerTypeFilter(
  value: string | null | undefined,
): CustomerType | undefined {
  return parseStatusFilter(value, isValidCustomerType);
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

// =============================================================================
// CustomerType Labels
// =============================================================================

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  [CustomerType.PERSONAL]: "個人",
  [CustomerType.CORPORATE]: "法人・団体",
};

// =============================================================================
// CustomerStatus Labels
// =============================================================================

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  [CustomerStatus.NEW]: "新規",
  [CustomerStatus.REGULAR]: "リピーター",
  [CustomerStatus.VIP]: "VIP",
  [CustomerStatus.INACTIVE]: "休眠",
  [CustomerStatus.BLACKLIST]: "ブラックリスト",
};

// =============================================================================
// InquiryStatus Labels
// =============================================================================

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  [InquiryStatus.NEW]: "新規",
  [InquiryStatus.IN_PROGRESS]: "対応中",
  [InquiryStatus.RESOLVED]: "解決済み",
  [InquiryStatus.CLOSED]: "クローズ",
};

// =============================================================================
// PostStatus Labels
// =============================================================================

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  [PostStatus.DRAFT]: "下書き",
  [PostStatus.PUBLISHED]: "公開中",
  [PostStatus.ARCHIVED]: "アーカイブ",
};

// =============================================================================
// TermsStatus Labels
// =============================================================================

export const TERMS_STATUS_LABELS: Record<TermsStatus, string> = {
  [TermsStatus.DRAFT]: "下書き",
  [TermsStatus.PUBLISHED]: "公開中",
  [TermsStatus.ARCHIVED]: "アーカイブ",
};

// =============================================================================
// ReservationStatus Labels
// =============================================================================

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  [ReservationStatus.PENDING]: "保留中",
  [ReservationStatus.CONFIRMED]: "確認済み",
  [ReservationStatus.COMPLETED]: "完了",
  [ReservationStatus.CANCELLED]: "キャンセル",
  [ReservationStatus.NO_SHOW]: "無断キャンセル",
};

// =============================================================================
// AuditAction Labels
// =============================================================================

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.CREATE]: "作成",
  [AuditAction.UPDATE]: "更新",
  [AuditAction.DELETE]: "削除",
  [AuditAction.PUBLISH]: "公開",
  [AuditAction.UNPUBLISH]: "非公開",
  [AuditAction.LOGIN_SUCCESS]: "ログイン成功",
  [AuditAction.LOGIN_FAILED]: "ログイン失敗",
  [AuditAction.LOGOUT]: "ログアウト",
  [AuditAction.PERMISSION_DENIED]: "権限拒否",
  [AuditAction.PASSWORD_CHANGE]: "パスワード変更",
  [AuditAction.PASSWORD_RESET_REQUEST]: "パスワードリセット要求",
  [AuditAction.ROLE_CHANGE]: "ロール変更",
};

// =============================================================================
// EditorCommentStatus Labels
// =============================================================================

export const EDITOR_COMMENT_STATUS_LABELS: Record<EditorCommentStatus, string> =
  {
    [EditorCommentStatus.ACTIVE]: "未解決",
    [EditorCommentStatus.RESOLVED]: "解決済み",
    [EditorCommentStatus.DELETED]: "削除済み",
  };

// =============================================================================
// Publish Status Labels（boolean isPublished / isActive 用）
// =============================================================================

export const PUBLISH_LABELS = {
  published: "公開中",
  unpublished: "非公開",
  draft: "下書き",
} as const;

export function getPublishLabel(
  isPublished: boolean,
  falseLabel: "unpublished" | "draft" = "unpublished",
): string {
  return isPublished ? PUBLISH_LABELS.published : PUBLISH_LABELS[falseLabel];
}

// =============================================================================
// PaymentStatus Labels & Badge Variants
// =============================================================================

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.UNPAID]: "未払い",
  [PaymentStatus.PENDING]: "決済待ち",
  [PaymentStatus.PAID]: "支払い済み",
  [PaymentStatus.REFUNDED]: "返金済み",
  [PaymentStatus.FAILED]: "決済失敗",
};

// =============================================================================
// EventStatus Labels
// =============================================================================

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  [EventStatus.DRAFT]: "下書き",
  [EventStatus.PUBLISHED]: "公開中",
  [EventStatus.CANCELLED]: "キャンセル",
  [EventStatus.ARCHIVED]: "アーカイブ",
};

// =============================================================================
// RegistrationStatus Labels
// =============================================================================

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.CONFIRMED]: "確認済み",
  [RegistrationStatus.CANCELLED]: "キャンセル",
};

export const PAYMENT_STATUS_BADGE_VARIANTS: Record<PaymentStatus, string> = {
  [PaymentStatus.UNPAID]: "secondary",
  [PaymentStatus.PENDING]: "warning",
  [PaymentStatus.PAID]: "success",
  [PaymentStatus.REFUNDED]: "outline",
  [PaymentStatus.FAILED]: "destructive",
};

// ---------------------------------------------------------------------------
// Cancellation tracking (non-Prisma enum — DB stores as VARCHAR)
// ---------------------------------------------------------------------------

export const CANCELLED_BY = {
  CUSTOMER: "CUSTOMER",
  ADMIN: "ADMIN",
} as const;

export type CancelledByType = (typeof CANCELLED_BY)[keyof typeof CANCELLED_BY];

export const CANCELLED_BY_LABELS: Record<CancelledByType, string> = {
  [CANCELLED_BY.CUSTOMER]: "顧客",
  [CANCELLED_BY.ADMIN]: "管理者",
};

// =============================================================================
// AdminNotification Type（DB VARCHAR 管理 — Prisma enum ではない）
// =============================================================================

export const NOTIFICATION_TYPE = {
  RESERVATION_NEW: "reservation_new",
  RESERVATION_CANCEL: "reservation_cancel",
  RESERVATION_CHANGE: "reservation_change",
  RESERVATION_UPDATE: "reservation_update",
  INQUIRY_NEW: "inquiry_new",
  REVIEW_NEW: "review_new",
  EVENT_REGISTRATION: "event_registration",
  FAQ_STALE: "faq_stale",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

const VALID_NOTIFICATION_TYPES = new Set<string>(
  Object.values(NOTIFICATION_TYPE),
);

export function isValidNotificationType(
  value: unknown,
): value is NotificationType {
  return typeof value === "string" && VALID_NOTIFICATION_TYPES.has(value);
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NOTIFICATION_TYPE.RESERVATION_NEW]: "新規予約",
  [NOTIFICATION_TYPE.RESERVATION_CANCEL]: "予約キャンセル",
  [NOTIFICATION_TYPE.RESERVATION_CHANGE]: "予約変更",
  [NOTIFICATION_TYPE.RESERVATION_UPDATE]: "予約更新",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "新規お問い合わせ",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "新規レビュー",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "イベント申込",
  [NOTIFICATION_TYPE.FAQ_STALE]: "FAQ 鮮度チェック",
};

export type ReservationAction = "new" | "update" | "cancel";

export const RESERVATION_ACTION_LABELS: Record<ReservationAction, string> = {
  new: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_NEW],
  update: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_CHANGE],
  cancel: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_CANCEL],
};

export type AdminBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "pending";

export const NOTIFICATION_TYPE_BADGE_VARIANTS: Record<
  NotificationType,
  AdminBadgeVariant
> = {
  [NOTIFICATION_TYPE.RESERVATION_NEW]: "default",
  [NOTIFICATION_TYPE.RESERVATION_CANCEL]: "destructive",
  [NOTIFICATION_TYPE.RESERVATION_CHANGE]: "secondary",
  [NOTIFICATION_TYPE.RESERVATION_UPDATE]: "secondary",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "default",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "default",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "default",
  [NOTIFICATION_TYPE.FAQ_STALE]: "warning",
};
