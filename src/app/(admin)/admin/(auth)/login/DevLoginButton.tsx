"use client";

/**
 * 開発環境限定 — SUPER_ADMIN として 1 クリックでログインするボタン。
 *
 * - 本番では `page.tsx` 側で `process.env["NODE_ENV"] !== "production"` 判定で非表示。
 *   `devAdminLoginAction` 側でも early return する二重防御。
 * - 認証情報は server-only モジュールに置き、クライアントバンドルに出さない。
 * - サインインはサーバーアクションで完結し、成功時に `redirect("/admin")` する。
 * - seed (`prisma/seed.ts`) で superadmin が作成済みである前提。
 */

import { useState, useTransition, type ReactElement } from "react";
import { devAdminLoginAction } from "./dev-login-action";

export function DevLoginButton(): ReactElement {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await devAdminLoginAction();
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="mt-6 border-t border-border pt-6">
      <p className="mb-3 text-center text-xs text-muted-foreground">
        開発環境限定
      </p>
      {error != null && (
        <div
          className="mb-3 border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive text-center"
          role="alert"
        >
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="flex w-full min-h-11 items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/40 px-6 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
      >
        {isPending ? "ログイン中..." : "SUPER_ADMIN でログイン"}
      </button>
    </div>
  );
}
