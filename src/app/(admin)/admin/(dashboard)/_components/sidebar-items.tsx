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
  IconMessage,
  IconStar,
  IconBell,
} from "@tabler/icons-react";
import type { SidebarItem } from "@/admin/types/admin-layout";

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
  },
  {
    label: "クーポン",
    href: "/admin/coupons",
    icon: <IconTicket className="h-5 w-5" />,
  },
  {
    label: "スペース管理",
    href: "/admin/spaces",
    icon: <IconBuilding className="h-5 w-5" />,
  },
  {
    label: "イベント",
    href: "/admin/events",
    icon: <IconCalendarEvent className="h-5 w-5" />,
  },
  {
    label: "お知らせ",
    href: "/admin/news",
    icon: <IconNews className="h-5 w-5" />,
  },
  {
    label: "投稿",
    href: "/admin/posts",
    icon: <IconFileDescription className="h-5 w-5" />,
  },
  {
    label: "コメント管理",
    href: "/admin/posts/comments",
    icon: <IconMessage className="h-5 w-5" />,
  },
  {
    label: "メディア",
    href: "/admin/media",
    icon: <IconPhoto className="h-5 w-5" />,
  },
  {
    label: "ページ管理",
    href: "/admin/pages",
    icon: <IconFileText className="h-5 w-5" />,
  },
  {
    label: "FAQ",
    href: "/admin/faq",
    icon: <IconHelpCircle className="h-5 w-5" />,
  },
  {
    label: "利用規約",
    href: "/admin/terms",
    icon: <IconFileText className="h-5 w-5" />,
  },
  {
    label: "顧客管理",
    href: "/admin/customers",
    icon: <IconUsers className="h-5 w-5" />,
  },
  {
    label: "お問い合わせ",
    href: "/admin/inquiries",
    icon: <IconMail className="h-5 w-5" />,
  },
  {
    label: "レビュー",
    href: "/admin/reviews",
    icon: <IconStar className="h-5 w-5" />,
  },
  {
    label: "スタッフ管理",
    href: "/admin/staff",
    icon: <IconShield className="h-5 w-5" />,
  },
  {
    label: "通知",
    href: "/admin/notifications",
    icon: <IconBell className="h-5 w-5" />,
  },
  {
    label: "監査ログ",
    href: "/admin/audit-logs",
    icon: <IconClipboardList className="h-5 w-5" />,
  },
  {
    label: "設定",
    href: "/admin/settings",
    icon: <IconSettings className="h-5 w-5" />,
  },
];
