/**
 * TopBarUserBadge — admin TopBar 右端の user 識別 (email + role badge)
 *
 * Server Component で session から取得。SUPER_ADMIN / ADMIN / EDITOR / VIEWER
 * の判別が UI 上で常時可視化される（GitHub / Vercel / Linear 等の admin SaaS
 * 標準パターン）。mobile では非表示で notification bell 等の干渉を回避。
 */

import type { ReactElement } from "react";
import { getAdminSession, getAdminSessionUser } from "@/shared/lib/admin-auth";
import { ROLE_LABELS } from "@/shared/lib/admin-roles";

export async function TopBarUserBadge(): Promise<ReactElement | null> {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) return null;

  return (
    <div className="hidden items-center gap-2 text-sm lg:flex">
      <span className="max-w-[16rem] truncate text-muted-foreground">
        {user.email}
      </span>
      <span className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
        {ROLE_LABELS[user.role]}
      </span>
    </div>
  );
}

export function TopBarUserBadgeFallback(): ReactElement {
  return (
    <div className="hidden animate-pulse items-center gap-2 text-sm lg:flex">
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="h-5 w-16 rounded bg-muted" />
    </div>
  );
}
