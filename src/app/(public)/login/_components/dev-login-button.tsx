"use client";

import { useState, useTransition } from "react";
import { devCustomerLoginAction } from "./dev-login-action";

export function DevLoginButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      // ユーザー作成 + サインインはすべてサーバーアクション内で完結する。
      // 認証情報はクライアントに出さず、成功時はサーバー側 redirect("/mypage") で遷移。
      const result = await devCustomerLoginAction();
      if (result?.error) setError(result.error);
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
