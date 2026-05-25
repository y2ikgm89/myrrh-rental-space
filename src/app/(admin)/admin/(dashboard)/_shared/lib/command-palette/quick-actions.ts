import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { QuickAction } from "@/shared/lib/command-palette-types";
import { hasPermission } from "@/admin/lib/permissions";

const ALL_QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: "new-space",
    label: "新規スペースを作成",
    href: "/admin/spaces/new",
    resource: "space",
  },
  {
    id: "new-reservation",
    label: "新規予約を作成",
    href: "/admin/reservations/new",
    resource: "reservation",
  },
  {
    id: "new-customer",
    label: "新規顧客を登録",
    href: "/admin/customers/new",
    resource: "customer",
  },
  {
    id: "new-event",
    label: "新規イベントを作成",
    href: "/admin/events/new",
    resource: "event",
  },
  {
    id: "new-post",
    label: "新規ブログ記事を作成",
    href: "/admin/posts/new",
    resource: "post",
  },
  {
    id: "new-news",
    label: "新規お知らせを作成",
    href: "/admin/news/new",
    resource: "news",
  },
  {
    id: "new-coupon",
    label: "新規クーポンを作成",
    href: "/admin/coupons/new",
    resource: "coupon",
  },
];

export function getQuickActionsForRole(role: Role): QuickAction[] {
  return ALL_QUICK_ACTIONS.filter((action) =>
    hasPermission(role, action.resource, "create"),
  );
}

export const ALL_QUICK_ACTIONS_FOR_TEST = ALL_QUICK_ACTIONS;
