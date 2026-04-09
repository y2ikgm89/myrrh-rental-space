"use client";

import { useState } from "react";
import { signIn } from "@/shared/lib/customer-auth-client";
import { cn } from "@/shared/lib/cn";
import { Stack } from "@/public/components/design-system/stack";
import {
  GoogleLogo,
  LineLogo,
} from "@/public/components/ui/social-provider-logos";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Provider = "google" | "line";

/* ------------------------------------------------------------------ */
/*  Error message translation                                          */
/* ------------------------------------------------------------------ */

const ERROR_MESSAGES: Record<string, string> = {
  "Provider not found": "このログイン方法は現在利用できません。",
};

function toUserMessage(raw: string): string {
  return ERROR_MESSAGES[raw] ?? "認証に失敗しました。もう一度お試しください。";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SocialLoginButtons() {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = (provider: Provider) => {
    setPending(provider);
    setError(null);

    void signIn.social({
      provider,
      callbackURL: "/mypage",
      fetchOptions: {
        onSuccess() {
          // Better Auth がリダイレクトを処理する
        },
        onError(ctx) {
          if (ctx.response.status === 429) {
            const retryAfter = ctx.response.headers.get("retry-after");
            setError(
              `リクエストが多すぎます。${retryAfter ? `${retryAfter}秒後に` : "しばらく待ってから"}お試しください。`,
            );
          } else {
            setError(toUserMessage(ctx.error.message ?? ""));
          }
          setPending(null);
        },
      },
    });
  };

  const disabled = pending !== null;

  return (
    <Stack gap="lg">
      {error && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive text-center"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Google — 公式ブランドガイドライン: 白背景 + カラーロゴ + Roboto テキスト */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => handleSignIn("google")}
        className={cn(
          "flex w-full items-center justify-center gap-3 border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors duration-200",
          "hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <GoogleLogo />
        {pending === "google" ? "リダイレクト中..." : "Googleでログイン"}
      </button>

      {/* LINE — 公式ブランドガイドライン: #06C755 背景 + 白テキスト/アイコン */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => handleSignIn("line")}
        className={cn(
          "flex w-full items-center justify-center gap-3 bg-[#06C755] px-6 py-3 text-sm font-medium text-white transition-opacity duration-200",
          "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755] focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <LineLogo />
        {pending === "line" ? "リダイレクト中..." : "LINEでログイン"}
      </button>
    </Stack>
  );
}
