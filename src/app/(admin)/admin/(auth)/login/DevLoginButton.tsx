"use client";

/**
 * 開発環境限定 — SUPER_ADMIN として 1 クリックでログインするボタン。
 *
 * - 本番では `page.tsx` 側で `process.env["NODE_ENV"] !== "production"` 判定で非表示。
 * - Better Auth Client API `signIn.email({ callbackURL })` で公式パターンに準拠。
 *   Router Cache + Set-Cookie の自動 invalidation を Next.js 統合に委ねる。
 * - seed (`prisma/seed.ts`) で superadmin が作成済みである前提。
 */

import { useState, useTransition, type ReactElement } from "react";
import { signIn } from "@/shared/lib/admin-auth-client";
import { DEV_ADMIN_CREDENTIALS } from "./dev-login-credentials";

export function DevLoginButton(): ReactElement {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      await signIn.email({
        email: DEV_ADMIN_CREDENTIALS.email,
        password: DEV_ADMIN_CREDENTIALS.password,
        callbackURL: "/admin",
        fetchOptions: {
          onError: (ctx) => {
            if (ctx.response.status === 429) {
              setError(
                "リクエストが多すぎます。しばらく待ってからお試しください。",
              );
            } else {
              setError(
                "テストログインに失敗しました（seed の SUPER_ADMIN が存在しない可能性があります）",
              );
            }
          },
        },
      });
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
