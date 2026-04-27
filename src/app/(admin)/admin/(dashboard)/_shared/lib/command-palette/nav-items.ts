import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { NavItem } from "@/admin/components/command-palette/types";
import { hasPermission } from "@/admin/lib/permissions";

const ALL_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dashboard",
    label: "ダッシュボード",
    href: "/admin",
    resource: "settings",
  },
  {
    id: "spaces",
    label: "スペース管理",
    href: "/admin/spaces",
    resource: "space",
  },
  {
    id: "locations",
    label: "場所管理",
    href: "/admin/spaces?tab=locations",
    resource: "location",
  },
  {
    id: "categories",
    label: "カテゴリ管理",
    href: "/admin/spaces?tab=categories",
    resource: "spaceCategory",
  },
  {
    id: "reservations",
    label: "予約管理",
    href: "/admin/reservations",
    resource: "reservation",
  },
  {
    id: "customers",
    label: "顧客管理",
    href: "/admin/customers",
    resource: "customer",
  },
  {
    id: "inquiries",
    label: "お問い合わせ",
    href: "/admin/inquiries",
    resource: "inquiry",
  },
  {
    id: "events",
    label: "イベント管理",
    href: "/admin/events",
    resource: "event",
  },
  { id: "posts", label: "ブログ", href: "/admin/posts", resource: "post" },
  { id: "news", label: "お知らせ", href: "/admin/news", resource: "news" },
  { id: "pages", label: "固定ページ", href: "/admin/pages", resource: "page" },
  { id: "faq", label: "FAQ", href: "/admin/faq", resource: "faq" },
  { id: "terms", label: "規約", href: "/admin/terms", resource: "terms" },
  {
    id: "navigation",
    label: "ナビゲーション",
    href: "/admin/settings/navigation",
    resource: "navigation",
  },
  {
    id: "announcement-bar",
    label: "アナウンスバー",
    href: "/admin/settings/announcement-bar",
    resource: "announcementBar",
  },
  { id: "media", label: "メディア", href: "/admin/media", resource: "media" },
  {
    id: "coupons",
    label: "クーポン",
    href: "/admin/coupons",
    resource: "coupon",
  },
  {
    id: "staff",
    label: "スタッフ管理",
    href: "/admin/staff",
    resource: "user",
  },
  {
    id: "audit-logs",
    label: "監査ログ",
    href: "/admin/audit-logs",
    resource: "auditLog",
  },
  {
    id: "settings-site",
    label: "設定: サイト",
    href: "/admin/settings/site",
    resource: "settings",
  },
  {
    id: "settings-business",
    label: "設定: 事業情報",
    href: "/admin/settings/business",
    resource: "settings",
  },
  {
    id: "settings-api",
    label: "設定: API連携",
    href: "/admin/settings/api",
    resource: "settings",
  },
  {
    id: "settings-system",
    label: "設定: システム",
    href: "/admin/settings/system",
    resource: "settings",
  },
];

export function getNavItemsForRole(role: Role): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) =>
    hasPermission(role, item.resource, "read"),
  );
}

export const ALL_NAV_ITEMS_FOR_TEST = ALL_NAV_ITEMS;
