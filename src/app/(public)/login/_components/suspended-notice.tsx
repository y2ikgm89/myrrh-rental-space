"use client";

/**
 * サスペンド (Customer.isActive=false) 顧客向けのログアウト通知 (MYPAGE-AUTH-01)
 *
 * ## 目的
 * `MypageAuthGate` が `/login?error=account_suspended` にリダイレクトした際、
 * LoginPage が `if (user) redirect('/mypage')` で無条件に mypage へ返送すると
 * ERR_TOO_MANY_REDIRECTS になる。エラークエリがある場合は redirect を止めて
 * このコンポーネントを描画し、ユーザーが明示的にログアウトできるボタンを提供する。
 *
 * ## 設計
 * - Server Action `signOutCustomerAction` を form action に配線 (Better Auth session
 *   cookie の破棄 → `/login` へ 302)。startTransition ではなく form の action 経由で
 *   pending state を安全に扱う (React 19 useFormStatus は form 内でしか使えないので
 *   form 直下 SubmitButton をここに置く)。
 * - `role="alert"` + `aria-live="polite"` で screen reader に通知
 * - デザインシステム: Stack + destructive tint (login page の他のエラー表示と統一)
 */

import { useTransition } from "react";
import { Stack } from "@/public/components/design-system/stack";
import { cn } from "@/shared/lib/cn";
import { signOutCustomerAction } from "../_actions/sign-out";

interface SuspendedNoticeProps {
  readonly message: string;
}

export function SuspendedNotice({ message }: SuspendedNoticeProps) {
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(() => {
      void signOutCustomerAction();
    });
  };

  return (
    <Stack gap="md">
      <div
        className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive text-center"
        role="alert"
        aria-live="polite"
      >
        {message}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        別のアカウントでログインするには、いったんログアウトしてください。
      </p>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isPending}
        aria-busy={isPending}
        className={cn(
          "flex w-full items-center justify-center gap-3 border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors duration-200",
          "hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        {isPending ? "ログアウト中..." : "ログアウトする"}
      </button>
    </Stack>
  );
}
