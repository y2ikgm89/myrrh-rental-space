"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminAuthClient } from "@/shared/lib/admin-auth-client";
import { SubmitButton } from "@/admin/components/ui";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

type Props = {
  readonly token: string;
  readonly turnstileSiteKey: string | null;
};

export function ResetPasswordForm({ token, turnstileSiteKey }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);
    setFieldError(undefined);

    if (password !== confirmPassword) {
      setFieldError("パスワードが一致しません");
      return;
    }

    if (password.length < 8) {
      setFieldError("パスワードは8文字以上で入力してください");
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      setError("セキュリティ検証を完了してください。");
      return;
    }

    startTransition(async () => {
      const result = await adminAuthClient.resetPassword({
        newPassword: password,
        token,
        ...(turnstileToken && {
          fetchOptions: {
            headers: { "x-captcha-response": turnstileToken },
          },
        }),
      });

      if (result.error) {
        setError(result.error.message ?? "パスワードのリセットに失敗しました");
        turnstileRef.current?.reset();
        setTurnstileToken("");
      } else {
        setSuccess(true);
      }
    });
  };

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-base font-medium text-foreground">
          パスワードを変更しました
        </p>
        <p className="text-sm text-muted-foreground">
          新しいパスワードでログインしてください。
        </p>
        <button
          type="button"
          onClick={() => router.push("/admin/login")}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          ログインページへ
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
          htmlFor="new-password"
          className="block text-sm font-medium text-foreground"
        >
          新しいパスワード
        </label>
        <input
          id="new-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          disabled={isPending}
          placeholder="8文字以上"
          className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm transition-all duration-200 placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="confirm-password"
          className="block text-sm font-medium text-foreground"
        >
          パスワード（確認）
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          disabled={isPending}
          placeholder="もう一度入力してください"
          aria-invalid={fieldError ? "true" : undefined}
          aria-describedby={fieldError ? "confirm-password-error" : undefined}
          className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm transition-all duration-200 placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        />
        {fieldError ? (
          <p
            id="confirm-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {fieldError}
          </p>
        ) : null}
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.admin_password_reset}
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken("")}
        onError={() => setTurnstileToken("")}
      />

      <SubmitButton
        isPending={isPending}
        label="パスワードを変更"
        pendingLabel="変更中..."
        className="w-full"
        size="lg"
      />
    </form>
  );
}
