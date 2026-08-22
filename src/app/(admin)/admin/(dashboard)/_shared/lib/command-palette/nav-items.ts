import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { NavItem } from "@/shared/lib/command-palette-types";
import { hasPermission } from "@/shared/lib/admin-permissions";

const ALL_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dashboard",
    label: "ダッシュボード",
    href: "/admin",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "read" },
  },
  {
    id: "spaces",
    label: "スペース管理",
    href: "/admin/spaces",
    resource: "space",
    requiredPermission: { resource: "space", action: "read" },
    featureModule: "spaces",
  },
  {
    id: "locations",
    label: "場所管理",
    href: "/admin/spaces?tab=locations",
    resource: "location",
    requiredPermission: { resource: "location", action: "read" },
    featureModule: "access",
  },
  {
    id: "categories",
    label: "カテゴリ管理",
    href: "/admin/spaces?tab=categories",
    resource: "spaceCategory",
    requiredPermission: { resource: "spaceCategory", action: "read" },
    featureModule: "spaces",
  },
  {
    id: "reservations",
    label: "予約管理",
    href: "/admin/reservations",
    resource: "reservation",
    requiredPermission: { resource: "reservation", action: "read" },
    featureModule: "reservation",
  },
  {
    id: "customers",
    label: "顧客管理",
    href: "/admin/customers",
    resource: "customer",
    requiredPermission: { resource: "customer", action: "read" },
  },
  {
    id: "inquiries",
    label: "お問い合わせ",
    href: "/admin/inquiries",
    resource: "inquiry",
    requiredPermission: { resource: "inquiry", action: "read" },
    featureModule: "contact",
  },
  {
    id: "events",
    label: "イベント管理",
    href: "/admin/events",
    resource: "event",
    requiredPermission: { resource: "event", action: "read" },
    featureModule: "events",
  },
  {
    id: "posts",
    label: "ブログ",
    href: "/admin/posts",
    resource: "post",
    requiredPermission: { resource: "post", action: "read" },
    featureModule: "posts",
  },
  {
    id: "news",
    label: "お知らせ",
    href: "/admin/news",
    resource: "news",
    requiredPermission: { resource: "news", action: "read" },
    featureModule: "news",
  },
  {
    id: "pages",
    label: "固定ページ",
    href: "/admin/pages",
    resource: "page",
    requiredPermission: { resource: "page", action: "read" },
  },
  {
    id: "faq",
    label: "FAQ",
    href: "/admin/faq",
    resource: "faq",
    requiredPermission: { resource: "faq", action: "read" },
    featureModule: "faq",
  },
  {
    id: "terms",
    label: "規約",
    href: "/admin/terms",
    resource: "terms",
    requiredPermission: { resource: "terms", action: "read" },
  },
  {
    id: "navigation",
    label: "ナビゲーション",
    href: "/admin/settings/appearance?tab=navigation",
    resource: "navigation",
    requiredPermission: { resource: "settings", action: "read" },
  },
  {
    id: "announcement-bar",
    label: "アナウンスバー",
    href: "/admin/settings/appearance?tab=announcement-bar",
    resource: "announcementBar",
    requiredPermission: { resource: "settings", action: "read" },
  },
  {
    id: "media",
    label: "メディア",
    href: "/admin/media",
    resource: "media",
    requiredPermission: { resource: "media", action: "read" },
  },
  {
    id: "coupons",
    label: "クーポン",
    href: "/admin/coupons",
    resource: "coupon",
    requiredPermission: { resource: "coupon", action: "read" },
  },
  {
    id: "staff",
    label: "スタッフ管理",
    href: "/admin/staff",
    resource: "user",
    requiredPermission: { resource: "user", action: "read" },
  },
  {
    id: "audit-logs",
    label: "監査ログ",
    href: "/admin/audit-logs",
    resource: "auditLog",
    requiredPermission: { resource: "auditLog", action: "read" },
  },
  {
    id: "settings-features",
    label: "設定: 機能モジュール",
    href: "/admin/settings/features",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "manage" },
  },
  {
    id: "settings-site",
    label: "設定: サイト基本",
    href: "/admin/settings/site",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "read" },
  },
  {
    id: "settings-appearance",
    label: "設定: サイトの見た目",
    href: "/admin/settings/appearance",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "read" },
  },
  {
    id: "settings-business",
    label: "設定: ビジネス",
    href: "/admin/settings/business",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "read" },
  },
  {
    id: "settings-holidays",
    label: "設定: 全社休業日",
    href: "/admin/settings/business?tab=holidays",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "read" },
  },
  {
    id: "settings-billing",
    label: "設定: 課金・決済",
    href: "/admin/settings/billing",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "manage" },
    featureModule: "payment",
  },
  {
    id: "settings-notifications",
    label: "設定: メール・通知",
    href: "/admin/settings/notifications",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "read" },
  },
  {
    id: "settings-integrations",
    label: "設定: 外部連携",
    href: "/admin/settings/integrations",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "manage" },
  },
  {
    id: "settings-system",
    label: "設定: システム管理",
    href: "/admin/settings/system",
    resource: "settings",
    requiredPermission: { resource: "settings", action: "manage" },
  },
];

/**
 * role が実際に開ける遷移先だけを返す。
 *
 * 判定は各 entry の `requiredPermission`（監査 A-01）。一律 `resource` +`"read"` で
 * 絞っていた頃は、
 * `settings:manage` を要求する 4 ページが `settings:read` しか持たない ADMIN /
 * VIEWER にも候補として出て、選ぶと `notFound()` に落ちていた。
 */
export function getNavItemsForRole(role: Role): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) =>
    hasPermission(
      role,
      item.requiredPermission.resource,
      item.requiredPermission.action,
    ),
  );
}

export const ALL_NAV_ITEMS_FOR_TEST = ALL_NAV_ITEMS;
