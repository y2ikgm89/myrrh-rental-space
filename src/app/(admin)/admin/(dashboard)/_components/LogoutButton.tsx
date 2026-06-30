"use client";

/**
 * ログアウトボタン
 *
 * ログアウト後 /admin/login にリダイレクトする。
 * 本番の管理ログイン入口は Cloud Run IAP が保護する。
 */

import { useRouter } from "next/navigation";
import { signOut } from "@/shared/lib/admin-auth-client";
import type { ReactElement } from "react";

export function LogoutButton(): ReactElement {
  const router = useRouter();

  const handleLogout = async (): Promise<void> => {
    await signOut();
    router.push("/admin/login");
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      ログアウト
    </button>
  );
}
