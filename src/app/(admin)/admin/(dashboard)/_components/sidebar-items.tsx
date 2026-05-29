/**
 * サイドバーナビゲーション項目定義
 *
 * 5 グループ構成 (業界調査: Booking.com Extranet / Spacemarket / Shopify Admin /
 * WordPress / Stripe Dashboard 準拠)。
 * - 概要: 日次ログイン直後に見る (Stripe "Home")
 * - 運営: 日次オペ動線 (Booking.com / Spacemarket)
 * - カタログ: 売る対象 (Shopify "Products")
 * - コンテンツ: サイト掲載物 (WordPress "Posts / Pages / Media")
 * - システム: 設定系最下部 (全業界共通)
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
  SidebarGroup,
  SidebarItemPermission,
} from "@/admin/types/admin-layout";

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: "概要",
    items: [
      {
        label: "ダッシュボード",
        href: "/admin",
        icon: <IconHome className="h-5 w-5" />,
      },
      {
        label: "通知",
        href: "/admin/notifications",
        icon: <IconBell className="h-5 w-5" />,
        requiredPermission: { resource: "notification", action: "read" },
      },
    ],
  },
  {
    label: "運営",
    items: [
      {
        label: "予約管理",
        href: "/admin/reservations",
        icon: <IconCalendar className="h-5 w-5" />,
        requiredPermission: { resource: "reservation", action: "read" },
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
    ],
  },
  {
    label: "カタログ",
    items: [
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
        label: "クーポン",
        href: "/admin/coupons",
        icon: <IconTicket className="h-5 w-5" />,
        requiredPermission: { resource: "coupon", action: "read" },
      },
    ],
  },
  {
    label: "コンテンツ",
    items: [
      {
        label: "ページ管理",
        href: "/admin/pages",
        icon: <IconFileText className="h-5 w-5" />,
        requiredPermission: { resource: "page", action: "read" },
      },
      {
        label: "投稿",
        href: "/admin/posts",
        icon: <IconFileDescription className="h-5 w-5" />,
        requiredPermission: { resource: "post", action: "read" },
      },
      {
        label: "お知らせ",
        href: "/admin/news",
        icon: <IconNews className="h-5 w-5" />,
        requiredPermission: { resource: "news", action: "read" },
      },
      {
        label: "FAQ",
        href: "/admin/faq",
        icon: <IconHelpCircle className="h-5 w-5" />,
        requiredPermission: { resource: "faq", action: "read" },
      },
      {
        label: "メディア",
        href: "/admin/media",
        icon: <IconPhoto className="h-5 w-5" />,
        requiredPermission: { resource: "media", action: "read" },
      },
      {
        label: "利用規約",
        href: "/admin/terms",
        icon: <IconFileText className="h-5 w-5" />,
        requiredPermission: { resource: "terms", action: "read" },
      },
    ],
  },
  {
    label: "システム",
    items: [
      {
        label: "スタッフ管理",
        href: "/admin/staff",
        icon: <IconShield className="h-5 w-5" />,
        requiredPermission: { resource: "user", action: "read" },
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
    ],
  },
];

export function filterSidebarGroupsByPermission(
  groups: readonly SidebarGroup[],
  canAccess: (permission: SidebarItemPermission) => boolean,
): SidebarGroup[] {
  return groups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => {
        if (!item.requiredPermission) return true;
        return canAccess(item.requiredPermission);
      }),
    }))
    .filter((group) => group.items.length > 0);
}
