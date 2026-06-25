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
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  CalendarSyncMethod,
  EditorCommentStatus,
  PaymentStatus,
  RegistrationStatus,
  EventStatus,
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
  isValidAnnouncementBarAnimation,
  isValidAnnouncementBarDesignStyle,
  isValidHeaderScrollBehavior,
  isValidHeaderBackgroundMode,
  isValidCalendarSyncMethod,
  isValidEditorCommentStatus,
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
// Status Transition Maps
// =============================================================================

/**
 * Customer ステータス遷移ルール（任意遷移、internal CRM）
 * 5 状態すべて自由遷移を許可。同一状態への変更は呼び出し側で no-op 化。
 */
export const CUSTOMER_STATUS_TRANSITIONS: Readonly<
  Record<CustomerStatus, readonly CustomerStatus[]>
> = {
  [CustomerStatus.NEW]: [
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.REGULAR]: [
    CustomerStatus.NEW,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.VIP]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.INACTIVE]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.BLACKLIST]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
  ],
};

/**
 * Inquiry ステータス遷移ルール（forward only）
 */
export const INQUIRY_STATUS_TRANSITIONS: Readonly<
  Record<InquiryStatus, readonly InquiryStatus[]>
> = {
  [InquiryStatus.NEW]: [
    InquiryStatus.IN_PROGRESS,
    InquiryStatus.RESOLVED,
    InquiryStatus.CLOSED,
  ],
  [InquiryStatus.IN_PROGRESS]: [InquiryStatus.RESOLVED, InquiryStatus.CLOSED],
  [InquiryStatus.RESOLVED]: [InquiryStatus.CLOSED],
  [InquiryStatus.CLOSED]: [],
};

/**
 * Event ステータス遷移ルール
 */
export const EVENT_STATUS_TRANSITIONS: Readonly<
  Record<EventStatus, readonly EventStatus[]>
> = {
  [EventStatus.DRAFT]: [
    EventStatus.PUBLISHED,
    EventStatus.CANCELLED,
    EventStatus.ARCHIVED,
  ],
  [EventStatus.PUBLISHED]: [EventStatus.CANCELLED, EventStatus.ARCHIVED],
  [EventStatus.CANCELLED]: [EventStatus.ARCHIVED],
  [EventStatus.ARCHIVED]: [],
};

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
// ReservationStatus Labels
// =============================================================================

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  [ReservationStatus.PENDING]: "保留中",
  [ReservationStatus.CONFIRMED]: "確認済み",
  [ReservationStatus.COMPLETED]: "完了",
  [ReservationStatus.CANCELLED]: "キャンセル",
  [ReservationStatus.NO_SHOW]: "無断キャンセル",
};

/**
 * ReservationStatus → curation icon 識別子の固定マッピング SSoT。
 *
 * Stripe Dashboard / Linear / Shopify Admin 等の status badge は
 * **icon prefix で意味補強**（color 単独は WCAG 1.4.1 違反）。
 *
 * 消費者: 管理画面 ReservationTable / EventDetailDialog / 各種 status Badge。
 * 描画は `<CuratedIcon name={RESERVATION_STATUS_ICONS[status]} />` で。
 */
export const RESERVATION_STATUS_ICONS: Record<ReservationStatus, string> = {
  [ReservationStatus.PENDING]: "IconClock",
  [ReservationStatus.CONFIRMED]: "IconCheck",
  [ReservationStatus.COMPLETED]: "IconCircleCheck",
  [ReservationStatus.CANCELLED]: "IconX",
  [ReservationStatus.NO_SHOW]: "IconAlertCircle",
};

// =============================================================================
// AuditAction Labels
// =============================================================================

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.CREATE]: "作成",
  [AuditAction.UPDATE]: "更新",
  [AuditAction.DELETE]: "削除",
  [AuditAction.PUBLISH]: "公開",
  [AuditAction.LOGIN_SUCCESS]: "ログイン成功",
  [AuditAction.LOGIN_FAILED]: "ログイン失敗",
  [AuditAction.LOGOUT]: "ログアウト",
  [AuditAction.PERMISSION_DENIED]: "権限拒否",
  [AuditAction.PASSWORD_CHANGE]: "パスワード変更",
  [AuditAction.PASSWORD_RESET_REQUEST]: "パスワードリセット要求",
  [AuditAction.PASSWORD_RESET_FAILED]: "パスワードリセット失敗",
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
  [RegistrationStatus.CONFIRMED]: "申込済み",
  [RegistrationStatus.CANCELLED]: "キャンセル済み",
};

// =============================================================================
// TaxRateType Labels
// =============================================================================

export const TAX_RATE_LABELS: Record<TaxRateType, string> = {
  [TaxRateType.standard]: "標準税率",
  [TaxRateType.reduced]: "軽減税率",
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

/**
 * Reservation.cancelledByType（DB は VARCHAR）。
 *
 * - `CUSTOMER`: マイページから会員自身が実行（旧 default。`CUSTOMER_MYPAGE` の alias）
 * - `CUSTOMER_MYPAGE`: マイページから会員自身が実行（明示版）
 * - `CUSTOMER_TOKEN`: 確認メールのキャンセルリンクから実行（ゲスト or 会員）
 * - `ADMIN`: 管理画面から管理者が実行
 *
 * 既存データ（`CUSTOMER`）は `CUSTOMER_MYPAGE` 相当として扱う。新規書き込みは
 * 経路別 (`CUSTOMER_MYPAGE` / `CUSTOMER_TOKEN`) を必ず指定する。
 */
export const CANCELLED_BY = {
  CUSTOMER: "CUSTOMER",
  CUSTOMER_MYPAGE: "CUSTOMER_MYPAGE",
  CUSTOMER_TOKEN: "CUSTOMER_TOKEN",
  ADMIN: "ADMIN",
} as const;

export type CancelledByType = (typeof CANCELLED_BY)[keyof typeof CANCELLED_BY];

export const CANCELLED_BY_LABELS: Record<CancelledByType, string> = {
  [CANCELLED_BY.CUSTOMER]: "顧客（マイページ）",
  [CANCELLED_BY.CUSTOMER_MYPAGE]: "顧客（マイページ）",
  [CANCELLED_BY.CUSTOMER_TOKEN]: "顧客（メールリンク）",
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

/**
 * NotificationType → curation icon 識別子の固定マッピング SSoT。
 *
 * GitHub / Linear / GitLab 等の notification list は **icon prefix で type 識別**
 * （PR=git-pull-request、issue=alert-circle、comment=message 等）。
 * 視覚的高速 scan + WCAG 1.4.1 準拠のため必須。
 *
 * 消費者: 管理画面 NotificationTable / DashboardNotificationsSection / TopBar bell。
 * 描画は `<CuratedIcon name={NOTIFICATION_TYPE_ICONS[type]} />` で。
 */
export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  [NOTIFICATION_TYPE.RESERVATION_NEW]: "IconCalendarPlus",
  [NOTIFICATION_TYPE.RESERVATION_CANCEL]: "IconX",
  [NOTIFICATION_TYPE.RESERVATION_CHANGE]: "IconCalendarTime",
  [NOTIFICATION_TYPE.RESERVATION_UPDATE]: "IconCalendarTime",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "IconMail",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "IconStar",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "IconUsersGroup",
  [NOTIFICATION_TYPE.FAQ_STALE]: "IconQuestionMark",
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

// =============================================================================
// BlockedDate Scope / Type（DB VARCHAR 管理 — Prisma enum ではない）
// =============================================================================

export const BLOCKED_DATE_SCOPE = {
  SPACE: "SPACE",
  LOCATION: "LOCATION",
  GLOBAL: "GLOBAL",
} as const;

export type BlockedDateScope =
  (typeof BLOCKED_DATE_SCOPE)[keyof typeof BLOCKED_DATE_SCOPE];

const VALID_BLOCKED_DATE_SCOPES = new Set<string>(
  Object.values(BLOCKED_DATE_SCOPE),
);

export function isValidBlockedDateScope(
  value: unknown,
): value is BlockedDateScope {
  return typeof value === "string" && VALID_BLOCKED_DATE_SCOPES.has(value);
}

export function getValidBlockedDateScope(
  value: unknown,
  defaultScope: BlockedDateScope = BLOCKED_DATE_SCOPE.GLOBAL,
): BlockedDateScope {
  return isValidBlockedDateScope(value) ? value : defaultScope;
}

export const BLOCKED_DATE_SCOPE_LABELS: Record<BlockedDateScope, string> = {
  [BLOCKED_DATE_SCOPE.SPACE]: "スペース",
  [BLOCKED_DATE_SCOPE.LOCATION]: "拠点",
  [BLOCKED_DATE_SCOPE.GLOBAL]: "全体",
};

export const BLOCKED_DATE_TYPE = {
  HOLIDAY: "HOLIDAY",
  MAINTENANCE: "MAINTENANCE",
  EMERGENCY: "EMERGENCY",
  OTHER: "OTHER",
} as const;

export type BlockedDateType =
  (typeof BLOCKED_DATE_TYPE)[keyof typeof BLOCKED_DATE_TYPE];

const VALID_BLOCKED_DATE_TYPES = new Set<string>(
  Object.values(BLOCKED_DATE_TYPE),
);

export function isValidBlockedDateType(
  value: unknown,
): value is BlockedDateType {
  return typeof value === "string" && VALID_BLOCKED_DATE_TYPES.has(value);
}

export function getValidBlockedDateType(
  value: unknown,
  defaultType: BlockedDateType = BLOCKED_DATE_TYPE.OTHER,
): BlockedDateType {
  return isValidBlockedDateType(value) ? value : defaultType;
}

export const BLOCKED_DATE_TYPE_LABELS: Record<BlockedDateType, string> = {
  [BLOCKED_DATE_TYPE.HOLIDAY]: "休業",
  [BLOCKED_DATE_TYPE.MAINTENANCE]: "設備点検",
  [BLOCKED_DATE_TYPE.EMERGENCY]: "緊急休業",
  [BLOCKED_DATE_TYPE.OTHER]: "その他",
};
