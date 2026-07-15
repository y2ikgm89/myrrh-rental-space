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
  SmartLockDeviceType,
  DayOfWeek,
  HolidayMode,
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
  [AuditAction.EXPORT]: "エクスポート",
  [AuditAction.LOGIN_SUCCESS]: "ログイン成功",
  [AuditAction.LOGIN_FAILED]: "ログイン失敗",
  [AuditAction.LOGOUT]: "ログアウト",
  [AuditAction.PERMISSION_DENIED]: "権限拒否",
  [AuditAction.PASSWORD_CHANGE]: "パスワード変更",
  [AuditAction.PASSWORD_RESET_REQUEST]: "パスワードリセット要求",
  [AuditAction.PASSWORD_RESET_FAILED]: "パスワードリセット失敗",
  [AuditAction.ROLE_CHANGE]: "ロール変更",
  [AuditAction.INTEGRITY_CHECK]: "完全性検証",
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
  [PaymentStatus.PARTIALLY_REFUNDED]: "一部返金済み",
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
// RegistrationStatus Sets（waitlist）
// =============================================================================

/**
 * 顧客自身がキャンセル可能な status。
 * EXPIRED / CANCELLED は既に終端のため対象外。
 */
export const CANCELLABLE_REGISTRATION_STATUSES = [
  RegistrationStatus.CONFIRMED,
  RegistrationStatus.WAITLISTED,
  RegistrationStatus.WAITLISTED_OFFERED,
] as const satisfies readonly RegistrationStatus[];

/** マイページの「これから」タブで active 扱いする waitlist 系 status */
export const WAITLIST_ACTIVE_STATUSES = [
  RegistrationStatus.WAITLISTED,
  RegistrationStatus.WAITLISTED_OFFERED,
] as const satisfies readonly RegistrationStatus[];

/** waitlist queue から除外する終端 status */
export const WAITLIST_TERMINAL_STATUSES = [
  RegistrationStatus.EXPIRED,
  RegistrationStatus.CANCELLED,
] as const satisfies readonly RegistrationStatus[];

/** マイページの「これから」判定用（CONFIRMED + waitlist 系） */
export const ACTIVE_REGISTRATION_STATUSES = [
  RegistrationStatus.CONFIRMED,
  ...WAITLIST_ACTIVE_STATUSES,
] as const satisfies readonly RegistrationStatus[];

/** unknown 値の RegistrationStatus narrowing（実装は guards.ts の SSoT を再 export） */
export { isValidRegistrationStatus } from "./guards";

// =============================================================================
// RegistrationStatus Labels
// =============================================================================

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.CONFIRMED]: "申込済み",
  [RegistrationStatus.CANCELLED]: "キャンセル済み",
  [RegistrationStatus.WAITLISTED]: "キャンセル待ち",
  [RegistrationStatus.WAITLISTED_OFFERED]: "繰り上げ当選中",
  [RegistrationStatus.EXPIRED]: "期限切れ",
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
  [PaymentStatus.PARTIALLY_REFUNDED]: "warning",
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
 * - `SYSTEM`: システム（cron 経路等）が自動実行。stale PENDING の fail-safe 期限切れ
 *   キャンセル (`/api/cron/pending-reservation-expire`) で使用。
 *
 * 既存データ（`CUSTOMER`）は `CUSTOMER_MYPAGE` 相当として扱う。新規書き込みは
 * 経路別 (`CUSTOMER_MYPAGE` / `CUSTOMER_TOKEN` / `SYSTEM`) を必ず指定する。
 */
export const CANCELLED_BY = {
  CUSTOMER: "CUSTOMER",
  CUSTOMER_MYPAGE: "CUSTOMER_MYPAGE",
  CUSTOMER_TOKEN: "CUSTOMER_TOKEN",
  ADMIN: "ADMIN",
  SYSTEM: "SYSTEM",
} as const;

export type CancelledByType = (typeof CANCELLED_BY)[keyof typeof CANCELLED_BY];

export const CANCELLED_BY_LABELS: Record<CancelledByType, string> = {
  [CANCELLED_BY.CUSTOMER]: "顧客（マイページ）",
  [CANCELLED_BY.CUSTOMER_MYPAGE]: "顧客（マイページ）",
  [CANCELLED_BY.CUSTOMER_TOKEN]: "顧客（メールリンク）",
  [CANCELLED_BY.ADMIN]: "管理者",
  [CANCELLED_BY.SYSTEM]: "システム（自動）",
};

// =============================================================================
// Refund Actor Type（`refunds.refundedByType` の VARCHAR 値 — Prisma enum ではない）
//
// DB 側の CHECK 制約 `refunds_refundedByType_check` と application 側の enum を
// 二重防御する。返金の起点 (誰が発火したか) を AuditLog metadata と併用する。
// =============================================================================

export const REFUNDED_BY_TYPE = {
  /** 管理者が admin UI から明示的に返金 */
  ADMIN: "ADMIN",
  /** キャンセル副作用 (`cancellation-side-effects.ts`) で自動発火した返金 */
  AUTO_ON_CANCEL: "AUTO_ON_CANCEL",
  /** Stripe Dashboard 経由の手動返金 (webhook 経由で back-fill) */
  STRIPE_DASHBOARD: "STRIPE_DASHBOARD",
} as const;

export type RefundedByType =
  (typeof REFUNDED_BY_TYPE)[keyof typeof REFUNDED_BY_TYPE];

export const REFUNDED_BY_TYPE_LABELS: Record<RefundedByType, string> = {
  [REFUNDED_BY_TYPE.ADMIN]: "管理者",
  [REFUNDED_BY_TYPE.AUTO_ON_CANCEL]: "自動（キャンセル）",
  [REFUNDED_BY_TYPE.STRIPE_DASHBOARD]: "Stripe Dashboard",
};

// =============================================================================
// AdminNotification Type（DB VARCHAR 管理 — Prisma enum ではない）
// =============================================================================

export const NOTIFICATION_TYPE = {
  RESERVATION_NEW: "reservation_new",
  RESERVATION_CANCEL: "reservation_cancel",
  RESERVATION_UPDATE: "reservation_update",
  INQUIRY_NEW: "inquiry_new",
  REVIEW_NEW: "review_new",
  EVENT_REGISTRATION: "event_registration",
  EVENT_REGISTRATION_CANCEL: "event_registration_cancel",
  FAQ_STALE: "faq_stale",
  CUSTOMER_FLAGGED: "customer_flagged",
  SMART_LOCK_PASSCODE_FAILED: "smart_lock_passcode_failed",
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
  [NOTIFICATION_TYPE.RESERVATION_UPDATE]: "予約更新",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "新規お問い合わせ",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "新規レビュー",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "イベント申込",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_CANCEL]: "イベント申込キャンセル",
  [NOTIFICATION_TYPE.FAQ_STALE]: "FAQ 鮮度チェック",
  [NOTIFICATION_TYPE.CUSTOMER_FLAGGED]: "要注意顧客の検知",
  [NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED]: "スマートロック発行失敗",
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
  [NOTIFICATION_TYPE.RESERVATION_UPDATE]: "IconCalendarTime",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "IconMail",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "IconStar",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "IconUsersGroup",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_CANCEL]: "IconX",
  [NOTIFICATION_TYPE.FAQ_STALE]: "IconQuestionMark",
  [NOTIFICATION_TYPE.CUSTOMER_FLAGGED]: "IconAlertTriangle",
  [NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED]: "IconLockOff",
};

// =============================================================================
// Customer Risk Flag Reason（customer-risk-scan cronの検知理由コード）
// =============================================================================

export const RISK_FLAG_REASON = {
  RAPID_BOOKING: "rapid_booking",
  FREQUENT_CANCELLATION: "frequent_cancellation",
  REPEATED_NO_SHOW: "repeated_no_show",
} as const;

export type RiskFlagReason =
  (typeof RISK_FLAG_REASON)[keyof typeof RISK_FLAG_REASON];

export const RISK_FLAG_REASON_LABELS: Record<RiskFlagReason, string> = {
  [RISK_FLAG_REASON.RAPID_BOOKING]: "短時間に多数の予約/申込",
  [RISK_FLAG_REASON.FREQUENT_CANCELLATION]: "繰り返しキャンセル",
  [RISK_FLAG_REASON.REPEATED_NO_SHOW]: "無断キャンセル(NO_SHOW)多発",
};

const VALID_RISK_FLAG_REASONS = new Set<string>(
  Object.values(RISK_FLAG_REASON),
);

export function isValidRiskFlagReason(value: string): value is RiskFlagReason {
  return VALID_RISK_FLAG_REASONS.has(value);
}

/** DBに保存された理由コードをラベルに変換する。未知コードはそのまま表示する。 */
export function getRiskFlagReasonLabel(reason: string): string {
  return isValidRiskFlagReason(reason)
    ? RISK_FLAG_REASON_LABELS[reason]
    : reason;
}

export type ReservationAction = "new" | "update" | "cancel";

export const RESERVATION_ACTION_LABELS: Record<ReservationAction, string> = {
  new: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_NEW],
  update: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_UPDATE],
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
  [NOTIFICATION_TYPE.RESERVATION_UPDATE]: "secondary",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "default",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "default",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "default",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_CANCEL]: "destructive",
  [NOTIFICATION_TYPE.FAQ_STALE]: "warning",
  [NOTIFICATION_TYPE.CUSTOMER_FLAGGED]: "destructive",
  [NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED]: "destructive",
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

// =============================================================================
// SmartLockDeviceType Labels（SwitchBot 製品名 SSoT）
// =============================================================================

export const SMART_LOCK_DEVICE_TYPE_LABELS: Record<
  SmartLockDeviceType,
  string
> = {
  KEYPAD: "Keypad",
  KEYPAD_TOUCH: "Keypad Touch",
  KEYPAD_VISION: "Keypad Vision",
  KEYPAD_VISION_PRO: "Keypad Vision Pro",
  LOCK_VISION_PRO: "Lock Vision Pro",
};

// =============================================================================
// DayOfWeek / HolidayMode Labels（SpaceRatePlan 曜日・祝日設定 SSoT）
//
// `SpaceRatePlanList` / `SpaceRatePlanEditModal` の 2 コンポーネントで共有するため、
// 両者の import 元をこのゲートウェイに一元化する（コンポーネント間の直接 import で
// 発生していた循環参照を解消）。
// =============================================================================

/** 曜日チェックボックス・曜日表示の並び順 SSoT（月曜始まり）。 */
export const ALL_DAYS_OF_WEEK: readonly DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];

/** 曜日の日本語 1 文字ラベル SSoT。 */
export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  [DayOfWeek.MONDAY]: "月",
  [DayOfWeek.TUESDAY]: "火",
  [DayOfWeek.WEDNESDAY]: "水",
  [DayOfWeek.THURSDAY]: "木",
  [DayOfWeek.FRIDAY]: "金",
  [DayOfWeek.SATURDAY]: "土",
  [DayOfWeek.SUNDAY]: "日",
};

/** 祝日の扱いラベル SSoT。 */
export const HOLIDAY_MODE_LABELS: Record<HolidayMode, string> = {
  [HolidayMode.any]: "平日・祝日を問わず適用",
  [HolidayMode.only]: "祝日のみ適用",
  [HolidayMode.exclude]: "祝日を除く（平日のみ適用）",
};
