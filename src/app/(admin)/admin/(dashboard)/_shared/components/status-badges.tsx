"use client";

import { Badge, type BadgeProps } from "@/admin/components/ui";
import type {
  CustomerStatus,
  EventStatus,
  InquiryStatus,
  PaymentStatus,
  RegistrationStatus,
  ReservationStatus,
  Role,
  AuditAction,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  CUSTOMER_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  INQUIRY_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  POST_STATUS_LABELS,
  PUBLISH_LABELS,
  REGISTRATION_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_ICONS,
  AUDIT_ACTION_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { ROLE_LABELS } from "@/shared/lib/admin-roles";

// =============================================================================
// Types
// =============================================================================

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

type StatusConfig<T extends string> = Record<
  T,
  { label: string; variant: BadgeVariant }
>;

// =============================================================================
// Configurations
// =============================================================================

const customerStatusConfig: StatusConfig<CustomerStatus> = {
  NEW: { label: CUSTOMER_STATUS_LABELS.NEW, variant: "warning" },
  REGULAR: { label: CUSTOMER_STATUS_LABELS.REGULAR, variant: "success" },
  VIP: { label: CUSTOMER_STATUS_LABELS.VIP, variant: "default" },
  INACTIVE: { label: CUSTOMER_STATUS_LABELS.INACTIVE, variant: "outline" },
  BLACKLIST: {
    label: CUSTOMER_STATUS_LABELS.BLACKLIST,
    variant: "destructive",
  },
};

const inquiryStatusConfig: StatusConfig<InquiryStatus> = {
  NEW: { label: INQUIRY_STATUS_LABELS.NEW, variant: "warning" },
  IN_PROGRESS: { label: INQUIRY_STATUS_LABELS.IN_PROGRESS, variant: "pending" },
  RESOLVED: { label: INQUIRY_STATUS_LABELS.RESOLVED, variant: "success" },
  CLOSED: { label: INQUIRY_STATUS_LABELS.CLOSED, variant: "outline" },
};

// 予約ステータスの色割当 SSoT。calendar の getStatusColorClass と意味色を完全一致させる。
// PR #692: Carbon Design System / Linear / Jira / Notion 標準パターンに整合。
// - PENDING   = warning  (黄, 要対応の保留)
// - CONFIRMED = success  (緑, 確定)
// - COMPLETED = info     (青, 完了 — 業界標準: Linear/Jira/Notion で done=blue info)
// - NO_SHOW   = destructive (赤, ネガティブな確定 outcome・要フォロー)
// - CANCELLED = outline  (灰, 取消は事実状態でアクションではないため destructive 非適合)
const reservationStatusConfig: StatusConfig<ReservationStatus> = {
  PENDING: { label: RESERVATION_STATUS_LABELS.PENDING, variant: "warning" },
  CONFIRMED: {
    label: RESERVATION_STATUS_LABELS.CONFIRMED,
    variant: "success",
  },
  COMPLETED: {
    label: RESERVATION_STATUS_LABELS.COMPLETED,
    variant: "info",
  },
  CANCELLED: {
    label: RESERVATION_STATUS_LABELS.CANCELLED,
    variant: "outline",
  },
  NO_SHOW: { label: RESERVATION_STATUS_LABELS.NO_SHOW, variant: "destructive" },
};

const paymentStatusConfig: StatusConfig<PaymentStatus> = {
  UNPAID: { label: PAYMENT_STATUS_LABELS.UNPAID, variant: "secondary" },
  PENDING: { label: PAYMENT_STATUS_LABELS.PENDING, variant: "warning" },
  PAID: { label: PAYMENT_STATUS_LABELS.PAID, variant: "success" },
  REFUNDED: { label: PAYMENT_STATUS_LABELS.REFUNDED, variant: "outline" },
  FAILED: { label: PAYMENT_STATUS_LABELS.FAILED, variant: "destructive" },
};

const eventStatusConfig: StatusConfig<EventStatus> = {
  DRAFT: { label: EVENT_STATUS_LABELS.DRAFT, variant: "secondary" },
  PUBLISHED: { label: EVENT_STATUS_LABELS.PUBLISHED, variant: "default" },
  CANCELLED: { label: EVENT_STATUS_LABELS.CANCELLED, variant: "destructive" },
  ARCHIVED: { label: EVENT_STATUS_LABELS.ARCHIVED, variant: "outline" },
};

// WAITLISTED = warning（対応待ち）/ WAITLISTED_OFFERED = info（24h 以内に要対応）/
// EXPIRED = outline（終端・中立、CANCELLED の destructive とは区別 — 顧客の意思
// によるキャンセルではなく期限切れという事実状態のため）。
// reservationStatusConfig の色意味付けコメントと同じ設計方針。
const REGISTRATION_BADGE_VARIANTS: Record<RegistrationStatus, BadgeVariant> = {
  CONFIRMED: "default",
  CANCELLED: "destructive",
  WAITLISTED: "warning",
  WAITLISTED_OFFERED: "info",
  EXPIRED: "outline",
};

// News はisPublished (boolean) 方式に移行
const newsPublishConfig = {
  published: { label: POST_STATUS_LABELS.PUBLISHED, variant: "success" },
  draft: { label: POST_STATUS_LABELS.DRAFT, variant: "secondary" },
} satisfies Record<string, { label: string; variant: BadgeVariant }>;

// =============================================================================
// Components
// =============================================================================

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const config = customerStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function CustomerIdentityBadge({ userId }: { userId: string | null }) {
  return userId === null ? (
    <Badge
      variant="secondary"
      aria-label="ゲスト未リンク顧客"
      title="会員アカウントには紐づいていない顧客履歴です"
    >
      ゲスト
    </Badge>
  ) : (
    <Badge
      variant="success"
      aria-label="会員連携済み顧客"
      title="会員アカウントに紐づく顧客です"
    >
      会員
    </Badge>
  );
}

export function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const config = inquiryStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function ReservationStatusBadge({
  status,
}: {
  status: ReservationStatus;
}) {
  const config = reservationStatusConfig[status];
  const iconName = RESERVATION_STATUS_ICONS[status];
  return (
    <Badge variant={config.variant} className="inline-flex items-center gap-1">
      <CuratedIcon name={iconName} className="h-3 w-3" />
      <span>{config.label}</span>
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const config = paymentStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const config = eventStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function RegistrationStatusBadge({
  status,
}: {
  status: RegistrationStatus;
}) {
  return (
    <Badge variant={REGISTRATION_BADGE_VARIANTS[status]}>
      {REGISTRATION_STATUS_LABELS[status]}
    </Badge>
  );
}

export function NewsStatusBadge({ isPublished }: { isPublished: boolean }) {
  const config = isPublished
    ? newsPublishConfig.published
    : newsPublishConfig.draft;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// Page は isPublished (boolean) 方式。News と異なり「下書き」ではなく「非公開」を使う
const pagePublishConfig = {
  published: { label: PUBLISH_LABELS.published, variant: "success" },
  unpublished: { label: PUBLISH_LABELS.unpublished, variant: "secondary" },
} satisfies Record<string, { label: string; variant: BadgeVariant }>;

export function PageStatusBadge({ isPublished }: { isPublished: boolean }) {
  const config = isPublished
    ? pagePublishConfig.published
    : pagePublishConfig.unpublished;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// =============================================================================
// Role Configuration
// =============================================================================

const roleVariants = {
  SUPER_ADMIN: "destructive",
  ADMIN: "default",
  EDITOR: "secondary",
  VIEWER: "outline",
  USER: "outline",
  CUSTOMER: "outline",
} satisfies Record<Role, BadgeVariant>;

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={roleVariants[role]}>{ROLE_LABELS[role]}</Badge>;
}

// =============================================================================
// AuditAction Configuration
// =============================================================================

const auditActionConfig = {
  CREATE: { label: AUDIT_ACTION_LABELS.CREATE, variant: "default" },
  UPDATE: { label: AUDIT_ACTION_LABELS.UPDATE, variant: "secondary" },
  DELETE: { label: AUDIT_ACTION_LABELS.DELETE, variant: "destructive" },
  PUBLISH: { label: AUDIT_ACTION_LABELS.PUBLISH, variant: "default" },
  EXPORT: { label: AUDIT_ACTION_LABELS.EXPORT, variant: "outline" },
  LOGIN_SUCCESS: {
    label: AUDIT_ACTION_LABELS.LOGIN_SUCCESS,
    variant: "default",
  },
  LOGIN_FAILED: {
    label: AUDIT_ACTION_LABELS.LOGIN_FAILED,
    variant: "destructive",
  },
  LOGOUT: { label: AUDIT_ACTION_LABELS.LOGOUT, variant: "outline" },
  PERMISSION_DENIED: {
    label: AUDIT_ACTION_LABELS.PERMISSION_DENIED,
    variant: "destructive",
  },
  PASSWORD_CHANGE: {
    label: AUDIT_ACTION_LABELS.PASSWORD_CHANGE,
    variant: "secondary",
  },
  PASSWORD_RESET_REQUEST: {
    label: AUDIT_ACTION_LABELS.PASSWORD_RESET_REQUEST,
    variant: "secondary",
  },
  PASSWORD_RESET_FAILED: {
    label: AUDIT_ACTION_LABELS.PASSWORD_RESET_FAILED,
    variant: "destructive",
  },
  ROLE_CHANGE: {
    label: AUDIT_ACTION_LABELS.ROLE_CHANGE,
    variant: "secondary",
  },
  INTEGRITY_CHECK: {
    label: AUDIT_ACTION_LABELS.INTEGRITY_CHECK,
    variant: "warning",
  },
} satisfies Record<AuditAction, { label: string; variant: BadgeVariant }>;

export function AuditActionBadge({ action }: { action: AuditAction }) {
  const config = auditActionConfig[action];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
