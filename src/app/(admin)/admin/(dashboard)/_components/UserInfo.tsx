/**
 * UserInfo
 *
 * サイドバー下部のユーザー情報表示
 * Server Component
 */

import { getSession } from "@/shared/lib/auth";
import type { ReactElement } from "react";

export async function UserInfo(): Promise<ReactElement | null> {
  const session = await getSession();

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-full bg-sidebar-border flex items-center justify-center">
        <span className="text-sm font-medium">
          {session.user.name?.[0] ?? session.user.email?.[0] ?? "U"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {session.user.name ?? "ユーザー"}
        </p>
        <p className="text-xs text-sidebar-text-muted truncate">
          {session.user.email}
        </p>
      </div>
    </div>
  );
}

export function UserInfoSkeleton(): ReactElement {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="h-8 w-8 rounded-full bg-sidebar-border" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-sidebar-border rounded w-20" />
        <div className="h-3 bg-sidebar-border rounded w-32" />
      </div>
    </div>
  );
}
