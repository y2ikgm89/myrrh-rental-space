"use client";

import { Badge, type BadgeProps } from "@/admin/components/ui";
import type {
  CustomerStatus,
  InquiryStatus,
  ReservationStatus,
  PostStatus,
  Role,
  AuditAction,
} from "@/shared/db/enums";

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
  NEW: { label: "新規", variant: "warning" },
  REGULAR: { label: "リピーター", variant: "success" },
  VIP: { label: "VIP", variant: "default" },
  INACTIVE: { label: "休眠", variant: "outline" },
  BLACKLIST: { label: "ブラックリスト", variant: "destructive" },
};

const inquiryStatusConfig: StatusConfig<InquiryStatus> = {
  NEW: { label: "新規", variant: "warning" },
  IN_PROGRESS: { label: "対応中", variant: "pending" },
  RESOLVED: { label: "解決済み", variant: "success" },
  CLOSED: { label: "クローズ", variant: "outline" },
};

const reservationStatusConfig: StatusConfig<ReservationStatus> = {
  PENDING: { label: "保留中", variant: "pending" },
  CONFIRMED: { label: "確認済み", variant: "success" },
  COMPLETED: { label: "完了", variant: "outline" },
  NO_SHOW: { label: "無断キャンセル", variant: "destructive" },
  CANCELLED: { label: "キャンセル", variant: "destructive" },
};

const postStatusConfig: StatusConfig<PostStatus> = {
  DRAFT: { label: "下書き", variant: "secondary" },
  PUBLISHED: { label: "公開中", variant: "success" },
  ARCHIVED: { label: "アーカイブ", variant: "outline" },
};

// News はisPublished (boolean) 方式に移行
const newsPublishConfig = {
  published: { label: "公開中", variant: "success" },
  draft: { label: "下書き", variant: "secondary" },
} satisfies Record<string, { label: string; variant: BadgeVariant }>;

// =============================================================================
// Components
// =============================================================================

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const config = customerStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
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
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const config = postStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function NewsStatusBadge({ isPublished }: { isPublished: boolean }) {
  const config = isPublished
    ? newsPublishConfig.published
    : newsPublishConfig.draft;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// =============================================================================
// Role Configuration
// =============================================================================

const roleConfig = {
  SUPER_ADMIN: { label: "スーパー管理者", variant: "destructive" },
  ADMIN: { label: "管理者", variant: "default" },
  EDITOR: { label: "編集者", variant: "secondary" },
  VIEWER: { label: "閲覧者", variant: "outline" },
  USER: { label: "ユーザー", variant: "outline" },
} satisfies Record<Role, { label: string; variant: BadgeVariant }>;

export function RoleBadge({ role }: { role: Role }) {
  const config = roleConfig[role];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// =============================================================================
// AuditAction Configuration
// =============================================================================

const auditActionConfig = {
  CREATE: { label: "作成", variant: "default" },
  UPDATE: { label: "更新", variant: "secondary" },
  DELETE: { label: "削除", variant: "destructive" },
  PUBLISH: { label: "公開", variant: "default" },
  UNPUBLISH: { label: "非公開", variant: "outline" },
  LOGIN_SUCCESS: { label: "ログイン成功", variant: "default" },
  LOGIN_FAILED: { label: "ログイン失敗", variant: "destructive" },
  PERMISSION_DENIED: { label: "権限拒否", variant: "destructive" },
  PASSWORD_CHANGE: { label: "パスワード変更", variant: "secondary" },
  ROLE_CHANGE: { label: "ロール変更", variant: "secondary" },
} satisfies Record<AuditAction, { label: string; variant: BadgeVariant }>;

export function AuditActionBadge({ action }: { action: AuditAction }) {
  const config = auditActionConfig[action];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
