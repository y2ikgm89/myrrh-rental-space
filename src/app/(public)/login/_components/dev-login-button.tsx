"use client";

import { useState, useTransition } from "react";
import { getErrorMessage } from "@/shared/lib/errors";
import { signIn } from "@/shared/lib/customer-auth-client";
import { ensureDevUserAction } from "./dev-login-action";
import { DEV_CUSTOMER_CREDENTIALS } from "./dev-login-credentials";

export function DevLoginButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        // 1. Server Action でテストユーザーの存在確認 + 作成（idempotent）
        const ensureResult = await ensureDevUserAction();
        if (!ensureResult.success) {
          setError(ensureResult.error);
          return;
        }
        // 2. Better Auth Client API でサインイン
        //    callbackURL で自動 redirect → Set-Cookie + Router Cache 自動更新（公式パターン）
        await signIn.email({
          email: DEV_CUSTOMER_CREDENTIALS.email,
          password: DEV_CUSTOMER_CREDENTIALS.password,
          callbackURL: "/mypage",
          fetchOptions: {
            onError: (ctx) => {
              setError(ctx.error.message ?? "テストログインに失敗しました");
            },
          },
        });
      } catch (err) {
        setError(getErrorMessage(err));
      }
    });
  };

  return (
    <div className="border-t border-border pt-6">
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
        className="flex w-full items-center justify-center gap-2 border border-dashed border-muted-foreground/40 px-6 py-3 text-sm text-muted-foreground transition-colors hover:bg-surface disabled:opacity-50"
      >
        {isPending ? "ログイン中..." : "テスト顧客でログイン"}
      </button>
    </div>
  );
}
