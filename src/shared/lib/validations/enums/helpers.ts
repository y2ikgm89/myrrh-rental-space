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
  EmailDeliveryStatus,
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
import {
  BlockedDateScope,
  BlockedDateType,
  TransferAccountType,
} from "@/shared/lib/validations/enums/prisma-types";

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
 *
 * CONFIRMED → PENDING（確認済みの格下げ）は
 * ReservationDetail.tsx の専用ステータス変更 UI が以前から選択肢として提示していた
 * （静的な Select オプションで、遷移可否を UI 側で絞り込んでいなかった）が、
 * 本 map に未登録だったため実際に選択すると DomainError で弾かれる、UI と
 * ドメイン層が食い違った pre-existing バグだった（Round-5 audit Finding #8
 * で発覚。admin.ts の編集フォーム経由の通知分岐も同じ理由で到達不能だった）。
 * 「確認は取ったが要件変更で保留に戻す」は業務上妥当な操作のため、遷移を
 * 正式に許可する。スマートロック passcode の失効は他の状態変更後の副作用
 * （GCal 同期・確認メール等）と同様 actions/reservation/mutations.ts の
 * afterSuccess 内で CONFIRMED→PENDING 遷移時に revoke する
 * （発行済み passcode が「確認済み」の前提を失うため。domain command
 * 自体は DB 書込と副作用判定に必要な previousStatus/payload の返却に
 * 専念し、外部 API 呼出しの orchestration は呼び出し側に委譲する既存方針
 * に合わせる）。
 */
export const RESERVATION_STATUS_TRANSITIONS: Readonly<
  Record<string, readonly ReservationStatus[]>
> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.PENDING,
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
  fallback: DiscountType = DiscountType.NONE,
): DiscountType {
  return value && isValidDiscountType(value) ? value : fallback;
}

export function getValidDurationDiscountOverride(
  value: string | null | undefined,
  fallback: DurationDiscountOverride = DurationDiscountOverride.INHERIT,
): DurationDiscountOverride {
  return value && isValidDurationDiscountOverride(value) ? value : fallback;
}

export function getValidTaxRateType(
  value: string | null | undefined,
  fallback: TaxRateType = TaxRateType.STANDARD,
): TaxRateType {
  return value && isValidTaxRateType(value) ? value : fallback;
}

export function getValidTaxDisplayMode(
  value: string | null | undefined,
  fallback: TaxDisplayMode = TaxDisplayMode.BOTH,
): TaxDisplayMode {
  return value && isValidTaxDisplayMode(value) ? value : fallback;
}

export function getValidDiscountCombinationMode(
  value: string | null | undefined,
  fallback: DiscountCombinationMode = DiscountCombinationMode.BEST,
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
  fallback: AnnouncementBarAnimation = AnnouncementBarAnimation.FADE,
): AnnouncementBarAnimation {
  return value && isValidAnnouncementBarAnimation(value) ? value : fallback;
}

export function getValidAnnouncementBarDesignStyle(
  value: string | null | undefined,
  fallback: AnnouncementBarDesignStyle = AnnouncementBarDesignStyle.SOLID,
): AnnouncementBarDesignStyle {
  return value && isValidAnnouncementBarDesignStyle(value) ? value : fallback;
}

export function getValidHeaderScrollBehavior(
  value: string | null | undefined,
  fallback: HeaderScrollBehavior = HeaderScrollBehavior.ALWAYS_VISIBLE,
): HeaderScrollBehavior {
  return value && isValidHeaderScrollBehavior(value) ? value : fallback;
}

export function getValidHeaderBackgroundMode(
  value: string | null | undefined,
  fallback: HeaderBackgroundMode = HeaderBackgroundMode.SOLID,
): HeaderBackgroundMode {
  return value && isValidHeaderBackgroundMode(value) ? value : fallback;
}

export function getValidCalendarSyncMethod(
  value: string | null | undefined,
  fallback: CalendarSyncMethod = CalendarSyncMethod.POLLING,
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
 * Inquiry ステータス遷移ルール。
 *
 * - 通常フロー (NEW → IN_PROGRESS → RESOLVED → CLOSED) は forward only
 * - `FLAGGED` は要注意フラグ。任意状態から遷移可能、対応再開・完了・SPAM 降格・NEW 巻き戻し
 *   まで全方向へ再遷移できる (誤判定訂正のため)
 * - `SPAM` は最終判定に近いが、誤判定訂正のため CLOSED への遷移のみ許可
 */
export const INQUIRY_STATUS_TRANSITIONS: Readonly<
  Record<InquiryStatus, readonly InquiryStatus[]>
> = {
  [InquiryStatus.NEW]: [
    InquiryStatus.IN_PROGRESS,
    InquiryStatus.RESOLVED,
    InquiryStatus.CLOSED,
    InquiryStatus.FLAGGED,
    InquiryStatus.SPAM,
  ],
  [InquiryStatus.IN_PROGRESS]: [
    InquiryStatus.RESOLVED,
    InquiryStatus.CLOSED,
    InquiryStatus.FLAGGED,
    InquiryStatus.SPAM,
  ],
  [InquiryStatus.RESOLVED]: [InquiryStatus.CLOSED, InquiryStatus.FLAGGED],
  [InquiryStatus.CLOSED]: [],
  [InquiryStatus.FLAGGED]: [
    InquiryStatus.NEW,
    InquiryStatus.IN_PROGRESS,
    InquiryStatus.RESOLVED,
    InquiryStatus.CLOSED,
    InquiryStatus.SPAM,
  ],
  [InquiryStatus.SPAM]: [InquiryStatus.CLOSED],
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
// EmailDeliveryStatus Labels
// =============================================================================

/** Resend Webhook が観測した配信状態の顧客向け表示ラベル。 */
export const EMAIL_DELIVERY_STATUS_LABELS: Record<EmailDeliveryStatus, string> =
  {
    [EmailDeliveryStatus.OK]: "配信可",
    [EmailDeliveryStatus.SOFT_BOUNCED]: "一時エラー",
    [EmailDeliveryStatus.HARD_BOUNCED]: "配信停止 (恒久エラー)",
    [EmailDeliveryStatus.COMPLAINED]: "配信停止 (苦情申告)",
  };

// =============================================================================
// InquiryStatus Labels
// =============================================================================

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  [InquiryStatus.NEW]: "新規",
  [InquiryStatus.IN_PROGRESS]: "対応中",
  [InquiryStatus.RESOLVED]: "解決済み",
  [InquiryStatus.CLOSED]: "クローズ",
  // Inquiry Overhaul Phase 1: FLAGGED / SPAM を InquiryStatus enum に追加。
  // Record<InquiryStatus, ...> の網羅性のため、ここも同時に更新する。
  [InquiryStatus.FLAGGED]: "要注意",
  [InquiryStatus.SPAM]: "スパム",
};

// =============================================================================
// PostStatus Labels
// =============================================================================

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  [PostStatus.DRAFT]: "下書き",
  [PostStatus.PUBLISHED]: "公開中",
  [PostStatus.ARCHIVED]: "アーカイブ",
};

/**
 * News 管理フィルター / バッジ用ラベル（PostStatus とは独立。予約公開を含む）。
 * `NEWS_PUBLISH_VISIBILITY_LABELS`（domain）と同文言を維持すること。
 */
export const NEWS_STATUS_FILTER_LABELS = {
  PUBLISHED: POST_STATUS_LABELS.PUBLISHED,
  SCHEDULED: "予約公開",
  DRAFT: POST_STATUS_LABELS.DRAFT,
} as const;

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
  [AuditAction.READ]: "参照",
  [AuditAction.MANAGE]: "管理",
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
  [TaxRateType.STANDARD]: "標準税率",
  [TaxRateType.REDUCED]: "軽減税率",
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
 * - `CUSTOMER_MYPAGE`: マイページから会員自身が実行
 * - `CUSTOMER_TOKEN`: 確認メールのキャンセルリンクから実行（ゲスト or 会員）
 * - `ADMIN`: 管理画面から管理者が実行
 * - `SYSTEM`: システム（cron 経路等）が自動実行。stale PENDING の fail-safe 期限切れ
 *   キャンセル (`/api/cron/pending-reservation-expire`) で使用。
 *
 * 新規書き込みは経路別 (`CUSTOMER_MYPAGE` / `CUSTOMER_TOKEN` / `SYSTEM`) を必ず指定する。
 * legacy 値 `CUSTOMER` は一度きりの backfill で `CUSTOMER_MYPAGE` へ寄せ済み
 * （現行 DB に `CUSTOMER` の行は無い）。
 */
export const CANCELLED_BY = {
  CUSTOMER_MYPAGE: "CUSTOMER_MYPAGE",
  CUSTOMER_TOKEN: "CUSTOMER_TOKEN",
  ADMIN: "ADMIN",
  SYSTEM: "SYSTEM",
} as const;

export type CancelledByType = (typeof CANCELLED_BY)[keyof typeof CANCELLED_BY];

export const CANCELLED_BY_LABELS: Record<CancelledByType, string> = {
  [CANCELLED_BY.CUSTOMER_MYPAGE]: "顧客（マイページ）",
  [CANCELLED_BY.CUSTOMER_TOKEN]: "顧客（メールリンク）",
  [CANCELLED_BY.ADMIN]: "管理者",
  [CANCELLED_BY.SYSTEM]: "システム（自動）",
};

// Refund Actor Type (`refunds.refundedByType`) は `./refund-attribution` に分離した。
// helpers.ts が `./guards` を transitive load して SocialPlatform (Prisma enum) を要求するため、
// 消費側 (webhook / refund path) の test mock で `@generated/prisma/enums` を差し替えると
// SyntaxError で落ちる。attribution 4 items だけを持つ最小モジュールに切り出して依存を断つ。

// =============================================================================
// AdminNotification Type（DB VARCHAR 管理 — Prisma enum ではない）
// =============================================================================

export const NOTIFICATION_TYPE = {
  RESERVATION_NEW: "reservation_new",
  RESERVATION_CANCEL: "reservation_cancel",
  RESERVATION_UPDATE: "reservation_update",
  RESERVATION_REFUND: "reservation_refund",
  RESERVATION_PAYMENT_FAILED: "reservation_payment_failed",
  INQUIRY_NEW: "inquiry_new",
  INQUIRY_CUSTOMER_REPLY: "inquiry_customer_reply",
  REVIEW_NEW: "review_new",
  EVENT_REGISTRATION: "event_registration",
  EVENT_REGISTRATION_CANCEL: "event_registration_cancel",
  EVENT_REGISTRATION_UPDATE: "event_registration_update",
  EVENT_REGISTRATION_REFUND: "event_registration_refund",
  EVENT_WAITLIST_REGISTRATION: "event_waitlist_registration",
  EVENT_WAITLIST_OFFERED: "event_waitlist_offered",
  EVENT_WAITLIST_CONFIRMED: "event_waitlist_confirmed",
  FAQ_STALE: "faq_stale",
  /** 予約パターン系の要注意検知（customer-risk-scan） */
  CUSTOMER_RISK_FLAGGED: "customer_risk_flagged",
  /** 重複顧客候補検知（customer-duplicate-scan）— risk と dedup を分離 */
  CUSTOMER_DUPLICATE_FLAGGED: "customer_duplicate_flagged",
  SMART_LOCK_PASSCODE_FAILED: "smart_lock_passcode_failed",
  SECURITY_LOGIN_FAILED_SPIKE: "security_login_failed_spike",
  SECURITY_PERMISSION_DENIED: "security_permission_denied",
  SECURITY_ROLE_CHANGE: "security_role_change",
  SECURITY_AUDIT_INTEGRITY_FAILED: "security_audit_integrity_failed",
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
  [NOTIFICATION_TYPE.RESERVATION_REFUND]: "予約返金",
  [NOTIFICATION_TYPE.RESERVATION_PAYMENT_FAILED]: "予約決済失敗",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "新規お問い合わせ",
  [NOTIFICATION_TYPE.INQUIRY_CUSTOMER_REPLY]: "お問い合わせ続報",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "新規レビュー",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "イベント申込",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_CANCEL]: "イベント申込キャンセル",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_UPDATE]: "イベント申込更新",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND]: "イベント申込返金",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_REGISTRATION]: "キャンセル待ち登録",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_OFFERED]: "キャンセル待ち繰り上げ",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_CONFIRMED]: "キャンセル待ち確定",
  [NOTIFICATION_TYPE.FAQ_STALE]: "FAQ 鮮度チェック",
  [NOTIFICATION_TYPE.CUSTOMER_RISK_FLAGGED]: "要注意顧客の検知",
  [NOTIFICATION_TYPE.CUSTOMER_DUPLICATE_FLAGGED]: "重複顧客候補の検知",
  [NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED]: "スマートロック発行失敗",
  [NOTIFICATION_TYPE.SECURITY_LOGIN_FAILED_SPIKE]: "管理者ログイン失敗の急増",
  [NOTIFICATION_TYPE.SECURITY_PERMISSION_DENIED]: "権限エラーの多発",
  [NOTIFICATION_TYPE.SECURITY_ROLE_CHANGE]: "管理者ロール変更",
  [NOTIFICATION_TYPE.SECURITY_AUDIT_INTEGRITY_FAILED]: "監査ログ改ざん検出",
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
  [NOTIFICATION_TYPE.RESERVATION_REFUND]: "IconReceiptRefund",
  [NOTIFICATION_TYPE.RESERVATION_PAYMENT_FAILED]: "IconAlertTriangle",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "IconMail",
  [NOTIFICATION_TYPE.INQUIRY_CUSTOMER_REPLY]: "IconMessageCircle",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "IconStar",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "IconUsersGroup",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_CANCEL]: "IconX",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_UPDATE]: "IconCalendarTime",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND]: "IconReceiptRefund",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_REGISTRATION]: "IconClock",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_OFFERED]: "IconUsers",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_CONFIRMED]: "IconCircleCheck",
  [NOTIFICATION_TYPE.FAQ_STALE]: "IconQuestionMark",
  [NOTIFICATION_TYPE.CUSTOMER_RISK_FLAGGED]: "IconAlertTriangle",
  [NOTIFICATION_TYPE.CUSTOMER_DUPLICATE_FLAGGED]: "IconUsers",
  [NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED]: "IconLockOff",
  [NOTIFICATION_TYPE.SECURITY_LOGIN_FAILED_SPIKE]: "IconShield",
  [NOTIFICATION_TYPE.SECURITY_PERMISSION_DENIED]: "IconAlertCircle",
  [NOTIFICATION_TYPE.SECURITY_ROLE_CHANGE]: "IconUserCheck",
  [NOTIFICATION_TYPE.SECURITY_AUDIT_INTEGRITY_FAILED]: "IconAlertTriangle",
};

// =============================================================================
// Customer Risk Flag Reason（customer-risk-scan cronの検知理由コード）
// =============================================================================

export const RISK_FLAG_REASON = {
  RAPID_BOOKING: "rapid_booking",
  FREQUENT_CANCELLATION: "frequent_cancellation",
  REPEATED_NO_SHOW: "repeated_no_show",
  DUPLICATE_CANDIDATE: "duplicate_candidate",
} as const;

export type RiskFlagReason =
  (typeof RISK_FLAG_REASON)[keyof typeof RISK_FLAG_REASON];

export const RISK_FLAG_REASON_LABELS: Record<RiskFlagReason, string> = {
  [RISK_FLAG_REASON.RAPID_BOOKING]: "短時間に多数の予約/申込",
  [RISK_FLAG_REASON.FREQUENT_CANCELLATION]: "繰り返しキャンセル",
  [RISK_FLAG_REASON.REPEATED_NO_SHOW]: "無断キャンセル(NO_SHOW)多発",
  [RISK_FLAG_REASON.DUPLICATE_CANDIDATE]: "重複顧客の疑い",
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
  [NOTIFICATION_TYPE.RESERVATION_REFUND]: "warning",
  [NOTIFICATION_TYPE.RESERVATION_PAYMENT_FAILED]: "destructive",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "default",
  [NOTIFICATION_TYPE.INQUIRY_CUSTOMER_REPLY]: "default",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "default",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "default",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_CANCEL]: "destructive",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_UPDATE]: "secondary",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION_REFUND]: "warning",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_REGISTRATION]: "warning",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_OFFERED]: "warning",
  [NOTIFICATION_TYPE.EVENT_WAITLIST_CONFIRMED]: "success",
  [NOTIFICATION_TYPE.FAQ_STALE]: "warning",
  [NOTIFICATION_TYPE.CUSTOMER_RISK_FLAGGED]: "destructive",
  [NOTIFICATION_TYPE.CUSTOMER_DUPLICATE_FLAGGED]: "warning",
  [NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED]: "destructive",
  [NOTIFICATION_TYPE.SECURITY_LOGIN_FAILED_SPIKE]: "destructive",
  [NOTIFICATION_TYPE.SECURITY_PERMISSION_DENIED]: "destructive",
  [NOTIFICATION_TYPE.SECURITY_ROLE_CHANGE]: "secondary",
  [NOTIFICATION_TYPE.SECURITY_AUDIT_INTEGRITY_FAILED]: "destructive",
};

// =============================================================================
// BlockedDate Scope / Type（PG enum `blocked_date_scope` / `blocked_date_type` の別名）
// =============================================================================

/**
 * **値域の SSoT は DB の `blocked_date_scope` 型**。ここはその別名。
 * 手で並べ直すと DB と食い違うので、生成 enum をそのまま使う。
 */
export const BLOCKED_DATE_SCOPE = BlockedDateScope;
export type { BlockedDateScope };

const VALID_BLOCKED_DATE_SCOPES = new Set<string>(
  Object.values(BLOCKED_DATE_SCOPE),
);

export function isValidBlockedDateScope(
  value: unknown,
): value is BlockedDateScope {
  return typeof value === "string" && VALID_BLOCKED_DATE_SCOPES.has(value);
}

export const BLOCKED_DATE_SCOPE_LABELS: Record<BlockedDateScope, string> = {
  [BLOCKED_DATE_SCOPE.SPACE]: "スペース",
  [BLOCKED_DATE_SCOPE.LOCATION]: "拠点",
  [BLOCKED_DATE_SCOPE.GLOBAL]: "全体",
};

/** 値域の SSoT は DB の `blocked_date_type` 型。 */
export const BLOCKED_DATE_TYPE = BlockedDateType;
export type { BlockedDateType };

const VALID_BLOCKED_DATE_TYPES = new Set<string>(
  Object.values(BLOCKED_DATE_TYPE),
);

export function isValidBlockedDateType(
  value: unknown,
): value is BlockedDateType {
  return typeof value === "string" && VALID_BLOCKED_DATE_TYPES.has(value);
}

export const BLOCKED_DATE_TYPE_LABELS: Record<BlockedDateType, string> = {
  [BLOCKED_DATE_TYPE.HOLIDAY]: "休業",
  [BLOCKED_DATE_TYPE.MAINTENANCE]: "設備点検",
  [BLOCKED_DATE_TYPE.EMERGENCY]: "緊急休業",
  [BLOCKED_DATE_TYPE.OTHER]: "その他",
};

// =============================================================================
// TransferAccount Type（PG enum `transfer_account_type` の別名）
// =============================================================================

/** 値域の SSoT は DB の `transfer_account_type` 型。 */
export const TRANSFER_ACCOUNT_TYPE = TransferAccountType;
export type { TransferAccountType };

const VALID_TRANSFER_ACCOUNT_TYPES = new Set<string>(
  Object.values(TRANSFER_ACCOUNT_TYPE),
);

export function isValidTransferAccountType(
  value: unknown,
): value is TransferAccountType {
  return typeof value === "string" && VALID_TRANSFER_ACCOUNT_TYPES.has(value);
}

export const TRANSFER_ACCOUNT_TYPE_LABELS: Record<TransferAccountType, string> =
  {
    [TRANSFER_ACCOUNT_TYPE.ORDINARY]: "普通",
    [TRANSFER_ACCOUNT_TYPE.CURRENT]: "当座",
    [TRANSFER_ACCOUNT_TYPE.SAVINGS]: "貯蓄",
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
  LOCK: "Lock",
  LOCK_LITE: "Lock Lite",
  LOCK_PRO: "Lock Pro",
};

/** 一時パスコード発行・Space/Location デフォルト割当の対象（Keypad 系）。 */
export const SMART_LOCK_PAD_DEVICE_TYPES: readonly SmartLockDeviceType[] = [
  SmartLockDeviceType.KEYPAD,
  SmartLockDeviceType.KEYPAD_TOUCH,
  SmartLockDeviceType.KEYPAD_VISION,
  SmartLockDeviceType.KEYPAD_VISION_PRO,
];

/** 施錠状態監視のみ（createKey なし）。 */
export const SMART_LOCK_BODY_DEVICE_TYPES: readonly SmartLockDeviceType[] = [
  SmartLockDeviceType.LOCK,
  SmartLockDeviceType.LOCK_LITE,
  SmartLockDeviceType.LOCK_PRO,
];

export function isSmartLockPadDeviceType(
  deviceType: SmartLockDeviceType,
): boolean {
  return SMART_LOCK_PAD_DEVICE_TYPES.includes(deviceType);
}

export function isSmartLockBodyDeviceType(
  deviceType: SmartLockDeviceType,
): boolean {
  return SMART_LOCK_BODY_DEVICE_TYPES.includes(deviceType);
}

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
  [HolidayMode.ANY]: "平日・祝日を問わず適用",
  [HolidayMode.ONLY]: "祝日のみ適用",
  [HolidayMode.EXCLUDE]: "祝日を除く（平日のみ適用）",
};
