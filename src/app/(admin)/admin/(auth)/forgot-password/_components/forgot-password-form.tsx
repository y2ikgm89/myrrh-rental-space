"use client";

import { useRef, useState, useTransition } from "react";
import { adminAuthClient } from "@/shared/lib/admin-auth-client";
import { SubmitButton } from "@/admin/components/ui";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

type Props = {
  readonly turnstileSiteKey: string | null;
};

export function ForgotPasswordForm({ turnstileSiteKey }: Props) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);

    if (turnstileSiteKey && !turnstileToken) {
      setError("セキュリティ検証を完了してください。");
      return;
    }

    startTransition(async () => {
      const { error: fetchError } = await adminAuthClient.$fetch(
        "/request-password-reset",
        {
          method: "POST",
          body: { email, redirectTo: "/admin/reset-password" },
          ...(turnstileToken && {
            headers: { "x-captcha-response": turnstileToken },
          }),
        },
      );

      if (fetchError) {
        setError(fetchError.message ?? "エラーが発生しました");
        turnstileRef.current?.reset();
        setTurnstileToken("");
      } else {
        setSubmitted(true);
      }
    });
  };

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-base font-medium text-foreground">
          メールを送信しました
        </p>
        <p className="text-sm text-muted-foreground">
          入力されたメールアドレスにパスワードリセットのリンクをお送りしました。
        </p>
        <p className="text-xs text-muted-foreground">
          メールが届かない場合は、迷惑メールフォルダをご確認いただくか、
          再度お試しください。
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setEmail("");
            setTurnstileToken("");
            turnstileRef.current?.reset();
          }}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          別のメールアドレスで試す
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={isPending}
          placeholder="admin@example.com"
          className="h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1"
        />
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.admin_password_reset_request}
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken("")}
        onError={() => setTurnstileToken("")}
      />

      <SubmitButton
        isPending={isPending}
        label="リセットリンクを送信"
        pendingLabel="送信中..."
        className="w-full"
        size="lg"
      />
    </form>
  );
}
