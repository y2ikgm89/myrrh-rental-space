/**
 * サイドバーナビゲーション項目定義
 */

import {
  IconHome,
  IconCalendar,
  IconCalendarEvent,
  IconBuilding,
  IconMail,
  IconNews,
  IconFileDescription,
  IconFileText,
  IconHelpCircle,
  IconUsers,
  IconShield,
  IconClipboardList,
  IconSettings,
  IconPhoto,
  IconTicket,
  IconBell,
} from "@tabler/icons-react";
import type {
  SidebarItem,
  SidebarItemPermission,
} from "@/admin/types/admin-layout";

export const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "ダッシュボード",
    href: "/admin",
    icon: <IconHome className="h-5 w-5" />,
  },
  {
    label: "予約管理",
    href: "/admin/reservations",
    icon: <IconCalendar className="h-5 w-5" />,
    requiredPermission: { resource: "reservation", action: "read" },
  },
  {
    label: "クーポン",
    href: "/admin/coupons",
    icon: <IconTicket className="h-5 w-5" />,
    requiredPermission: { resource: "coupon", action: "read" },
  },
  {
    label: "スペース管理",
    href: "/admin/spaces",
    icon: <IconBuilding className="h-5 w-5" />,
    requiredPermission: { resource: "space", action: "read" },
  },
  {
    label: "イベント",
    href: "/admin/events",
    icon: <IconCalendarEvent className="h-5 w-5" />,
    requiredPermission: { resource: "event", action: "read" },
  },
  {
    label: "お知らせ",
    href: "/admin/news",
    icon: <IconNews className="h-5 w-5" />,
    requiredPermission: { resource: "news", action: "read" },
  },
  {
    label: "投稿",
    href: "/admin/posts",
    icon: <IconFileDescription className="h-5 w-5" />,
    requiredPermission: { resource: "post", action: "read" },
  },
  {
    label: "メディア",
    href: "/admin/media",
    icon: <IconPhoto className="h-5 w-5" />,
    requiredPermission: { resource: "media", action: "read" },
  },
  {
    label: "ページ管理",
    href: "/admin/pages",
    icon: <IconFileText className="h-5 w-5" />,
    requiredPermission: { resource: "page", action: "read" },
  },
  {
    label: "FAQ",
    href: "/admin/faq",
    icon: <IconHelpCircle className="h-5 w-5" />,
    requiredPermission: { resource: "faq", action: "read" },
  },
  {
    label: "利用規約",
    href: "/admin/terms",
    icon: <IconFileText className="h-5 w-5" />,
    requiredPermission: { resource: "terms", action: "read" },
  },
  {
    label: "顧客管理",
    href: "/admin/customers",
    icon: <IconUsers className="h-5 w-5" />,
    requiredPermission: { resource: "customer", action: "read" },
  },
  {
    label: "お問い合わせ",
    href: "/admin/inquiries",
    icon: <IconMail className="h-5 w-5" />,
    requiredPermission: { resource: "inquiry", action: "read" },
  },
  {
    label: "スタッフ管理",
    href: "/admin/staff",
    icon: <IconShield className="h-5 w-5" />,
    requiredPermission: { resource: "user", action: "read" },
  },
  {
    label: "通知",
    href: "/admin/notifications",
    icon: <IconBell className="h-5 w-5" />,
    requiredPermission: { resource: "notification", action: "read" },
  },
  {
    label: "監査ログ",
    href: "/admin/audit-logs",
    icon: <IconClipboardList className="h-5 w-5" />,
    requiredPermission: { resource: "auditLog", action: "read" },
  },
  {
    label: "設定",
    href: "/admin/settings",
    icon: <IconSettings className="h-5 w-5" />,
    requiredPermission: { resource: "settings", action: "read" },
  },
];

export function filterSidebarItemsByPermission(
  items: readonly SidebarItem[],
  canAccess: (permission: SidebarItemPermission) => boolean,
): SidebarItem[] {
  return items.filter((item) => {
    if (!item.requiredPermission) {
      return true;
    }
    return canAccess(item.requiredPermission);
  });
}
