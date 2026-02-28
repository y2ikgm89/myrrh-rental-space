"use client";

/**
 * ログアウトボタン
 *
 * ログアウト後 /admin/login にリダイレクトする
 * admin-gate cookie が有効な間はトークンなしでアクセス可能
 */

import { useRouter } from "next/navigation";
import { signOut } from "@/shared/lib/auth-client";
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
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      ログアウト
    </button>
  );
}
